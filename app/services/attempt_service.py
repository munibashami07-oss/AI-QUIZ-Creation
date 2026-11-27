"""
Attempt Engine service: start, autosave, resume, submit, and background expiry cleaner.
All timing authoritative in UTC.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import random
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models.attempt import Answer, Attempt
from app.models.enums import ExamStatus, QuestionType
from app.models.exam import Exam, ExamQuestion, Question
from app.models.extras import Incident
from app.models.user import User
from app.schemas.attempt import (
    AnswerStateResponse,
    AnswerUpsertRequest,
    AttemptResponse,
    FrozenQuestionSchema,
    SubmitResponse,
)
from app.schemas.grading import ViolationActionResponse, ViolationReportRequest
from app.services.attendance import check_exam_eligibility


def check_and_auto_expire(db: Session, attempt: Attempt, now: datetime | None = None) -> bool:
    """Check if attempt deadline has passed; if so, finalize it immediately."""
    if now is None:
        now = datetime.now(timezone.utc)

    if attempt.submitted_at is None and now > attempt.server_deadline:
        attempt.submitted_at = attempt.server_deadline
        attempt.submit_reason = "time_expired"
        db.commit()
        db.refresh(attempt)
        return True
    return False


def start_or_resume_attempt(db: Session, student: User, exam_id: int) -> AttemptResponse:
    """Start a new exam attempt or resume an existing active unsubmitted one."""
    now = datetime.now(timezone.utc)

    exam = db.scalar(select(Exam).options(selectinload(Exam.exam_questions)).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    is_sandbox = exam.mode.lower() == "sandbox"

    # 1. Run attendance & eligibility rule (sandbox exams also check enrollment/window or bypass if draft)
    if not is_sandbox:
        eligibility = check_exam_eligibility(db, student.id, exam)
        if not eligibility["eligible"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Ineligible to start exam: {eligibility['message']}",
            )

    # 2. Check for an existing unsubmitted attempt for this student and exam
    existing = db.scalar(
        select(Attempt)
        .options(selectinload(Attempt.answers))
        .where(
            Attempt.exam_id == exam_id,
            Attempt.student_id == student.id,
            Attempt.submitted_at.is_(None),
        )
        .order_by(Attempt.id.desc())
    )

    if existing:
        # Check if deadline passed
        check_and_auto_expire(db, existing, now)
        if existing.submitted_at is None:
            return format_attempt_response(existing, now)

    # 3. For real exams, check if user already has a completed attempt
    if not is_sandbox:
        completed = db.scalar(
            select(Attempt.id).where(
                Attempt.exam_id == exam_id,
                Attempt.student_id == student.id,
                Attempt.is_sandbox == False,
                Attempt.submitted_at.is_not(None),
            )
        )
        if completed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You have already completed your attempt for this examination. Real exams allow only one attempt.",
            )

    # 4. Calculate server_deadline = min(now + duration, exam.end_time)
    duration_deadline = now + timedelta(minutes=exam.duration_minutes)
    if exam.end_time:
        server_deadline = min(duration_deadline, exam.end_time)
    else:
        server_deadline = duration_deadline

    # 5. Build frozen snapshot with questions and marks
    eq_rows = db.scalars(
        select(ExamQuestion)
        .options(selectinload(ExamQuestion.question))
        .where(ExamQuestion.exam_id == exam.id)
        .order_by(ExamQuestion.order_index)
    ).all()

    if not eq_rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam has no questions attached.")

    frozen_list = []
    for eq in eq_rows:
        q = eq.question
        marks = eq.marks_override if eq.marks_override is not None else q.marks
        frozen_list.append(
            {
                "question_id": q.id,
                "order_index": eq.order_index,
                "category": q.category,
                "difficulty": q.difficulty,
                "type": q.type.value if hasattr(q.type, "value") else str(q.type),
                "prompt": q.prompt,
                "options": q.options,
                "marks": str(marks),
            }
        )

    # Randomize questions if setting is enabled
    if exam.shuffle_questions:
        random.shuffle(frozen_list)
        for i, item in enumerate(frozen_list, start=1):
            item["order_index"] = i

    new_attempt = Attempt(
        exam_id=exam.id,
        student_id=student.id,
        started_at=now,
        server_deadline=server_deadline,
        submitted_at=None,
        submit_reason=None,
        violation_count=0,
        frozen_snapshot={"questions": frozen_list},
        is_sandbox=is_sandbox,
    )

    try:
        db.add(new_attempt)
        db.commit()
        db.refresh(new_attempt)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an existing attempt record for this examination.",
        )

    return format_attempt_response(new_attempt, now)


def format_attempt_response(attempt: Attempt, now: datetime | None = None) -> AttemptResponse:
    """Format Attempt into clean client response with server time and remaining seconds."""
    if now is None:
        now = datetime.now(timezone.utc)

    rem_seconds = max(0, int((attempt.server_deadline - now).total_seconds()))
    if attempt.submitted_at is not None:
        rem_seconds = 0

    # Parse frozen questions (never leaking correct answers)
    questions_raw = attempt.frozen_snapshot.get("questions", [])
    questions = [
        FrozenQuestionSchema(
            question_id=q["question_id"],
            order_index=q["order_index"],
            category=q["category"],
            difficulty=q["difficulty"],
            type=q["type"],
            prompt=q["prompt"],
            options=q.get("options"),
            marks=Decimal(q["marks"]),
        )
        for q in questions_raw
    ]

    saved_answers = [
        AnswerStateResponse(
            question_id=a.question_id,
            selected_options=a.selected_options,
            written_response=a.written_response,
            status=a.status,
            updated_at=a.updated_at,
        )
        for a in attempt.answers
    ]

    return AttemptResponse(
        attempt_id=attempt.id,
        exam_id=attempt.exam_id,
        student_id=attempt.student_id,
        is_sandbox=attempt.is_sandbox,
        started_at=attempt.started_at,
        server_deadline=attempt.server_deadline,
        server_time=now,
        remaining_seconds=rem_seconds,
        is_submitted=attempt.submitted_at is not None,
        submitted_at=attempt.submitted_at,
        submit_reason=attempt.submit_reason,
        questions=questions,
        saved_answers=saved_answers,
    )


def autosave_answer(
    db: Session,
    student: User,
    attempt_id: int,
    question_id: int,
    payload: AnswerUpsertRequest,
) -> dict[str, Any]:
    """Autosave answer with atomic PostgreSQL ON CONFLICT DO UPDATE."""
    now = datetime.now(timezone.utc)

    # 1. Fetch attempt and verify ownership
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    if attempt.student_id != student.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this attempt.")

    # 2. Check if submitted or expired
    if check_and_auto_expire(db, attempt, now) or attempt.submitted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot save answer: attempt is already submitted or expired.",
        )

    # 3. Check if question belongs to frozen snapshot
    valid_q_ids = {q["question_id"] for q in attempt.frozen_snapshot.get("questions", [])}
    if question_id not in valid_q_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Question is not part of this attempt.")

    # 4. Atomic PostgreSQL upsert (ON CONFLICT (attempt_id, question_id) DO UPDATE)
    stmt = insert(Answer).values(
        attempt_id=attempt.id,
        question_id=question_id,
        selected_options=payload.selected_options,
        written_response=payload.written_response,
        status=payload.status,
        updated_at=now,
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_answers_attempt_question",
        set_={
            "selected_options": stmt.excluded.selected_options,
            "written_response": stmt.excluded.written_response,
            "status": stmt.excluded.status,
            "updated_at": now,
        },
    )
    db.execute(stmt)
    db.commit()

    rem_seconds = max(0, int((attempt.server_deadline - now).total_seconds()))
    return {
        "success": True,
        "question_id": question_id,
        "status": payload.status,
        "server_time": now,
        "remaining_seconds": rem_seconds,
    }


def get_attempt_state(db: Session, student: User, attempt_id: int) -> AttemptResponse:
    """Retrieve full attempt state for page refresh/resume."""
    now = datetime.now(timezone.utc)

    attempt = db.scalar(
        select(Attempt)
        .options(selectinload(Attempt.answers))
        .where(Attempt.id == attempt_id)
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    if attempt.student_id != student.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this attempt.")

    check_and_auto_expire(db, attempt, now)
    return format_attempt_response(attempt, now)


def submit_attempt(
    db: Session,
    student: User,
    attempt_id: int,
    submit_reason: str = "manual",
) -> SubmitResponse:
    """Submit attempt with row-level locking (SELECT FOR UPDATE) to prevent duplicate submissions."""
    now = datetime.now(timezone.utc)

    # Lock attempt row
    attempt = db.scalar(
        select(Attempt)
        .where(Attempt.id == attempt_id)
        .with_for_update()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    if attempt.student_id != student.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this attempt.")

    # Idempotent: if already submitted, return existing submission info safely
    if attempt.submitted_at is not None:
        return SubmitResponse(
            attempt_id=attempt.id,
            is_submitted=True,
            submitted_at=attempt.submitted_at,
            submit_reason=attempt.submit_reason or "manual",
            server_time=now,
            message="Attempt already submitted.",
        )

    # If submitted past deadline, reason is time_expired
    if now > attempt.server_deadline:
        submit_reason = "time_expired"
        sub_time = attempt.server_deadline
    else:
        sub_time = now

    attempt.submitted_at = sub_time
    attempt.submit_reason = submit_reason
    db.commit()
    db.refresh(attempt)

    # Automatically trigger auto-grading of MCQs and AI suggestions for written answers
    try:
        from app.services.grading_service import run_auto_grading_for_attempt

        run_auto_grading_for_attempt(db, attempt)
    except Exception as e:
        import logging

        logging.getLogger("uvicorn.error").error("Auto-grading failed for attempt %d: %s", attempt.id, e)

    return SubmitResponse(
        attempt_id=attempt.id,
        is_submitted=True,
        submitted_at=attempt.submitted_at,
        submit_reason=attempt.submit_reason,
        server_time=now,
        message="Attempt submitted successfully.",
    )


def record_student_violation(
    db: Session,
    student: User,
    attempt_id: int,
    payload: ViolationReportRequest,
) -> ViolationActionResponse:
    """Record an in-exam candidate security violation (tab switch, window blur, fullscreen exit, etc.).
    If violation limit is reached, automatically submits the attempt.
    """
    now = datetime.now(timezone.utc)

    # 1. Fetch attempt and verify ownership
    attempt = db.scalar(select(Attempt).where(Attempt.id == attempt_id).with_for_update())
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    if attempt.student_id != student.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this attempt.")

    if attempt.submitted_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already submitted.")

    if check_and_auto_expire(db, attempt, now):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt has already expired.")

    # 2. Get exam violation limit
    exam = db.get(Exam, attempt.exam_id)
    violation_limit = exam.violation_limit if exam else 3

    # 3. Log incident event
    incident = Incident(
        attempt_id=attempt.id,
        event_type=payload.type,
        details=payload.details,
        occurred_at=now,
    )
    db.add(incident)

    # 4. Increment violation count
    attempt.violation_count += 1

    # 5. Check if limit exceeded
    if attempt.violation_count >= violation_limit:
        attempt.submitted_at = now
        attempt.submit_reason = "violation_limit"
        db.commit()
        db.refresh(attempt)

        try:
            from app.services.grading_service import run_auto_grading_for_attempt

            run_auto_grading_for_attempt(db, attempt)
        except Exception as e:
            import logging

            logging.getLogger("uvicorn.error").error("Auto-grading failed for attempt %d: %s", attempt.id, e)

        return ViolationActionResponse(
            action="auto_submitted",
            violation_count=attempt.violation_count,
            violation_limit=violation_limit,
            message="Violation limit reached. Your exam attempt has been automatically submitted.",
        )

    db.commit()
    return ViolationActionResponse(
        action="warning",
        violation_count=attempt.violation_count,
        violation_limit=violation_limit,
        message=f"Security violation recorded ({attempt.violation_count} of {violation_limit}). Please remain focused within the exam.",
    )


def expire_overdue_attempts(db: Session) -> int:
    """Background task function: finds and finalizes all unsubmitted overdue attempts."""
    now = datetime.now(timezone.utc)
    overdue_attempts = list(
        db.scalars(
            select(Attempt)
            .where(
                Attempt.submitted_at.is_(None),
                Attempt.server_deadline < now,
            )
            .with_for_update(skip_locked=True)
        ).all()
    )

    count = len(overdue_attempts)
    for att in overdue_attempts:
        att.submitted_at = att.server_deadline
        att.submit_reason = "time_expired"

    if count > 0:
        db.commit()
        from app.services.grading_service import run_auto_grading_for_attempt

        for att in overdue_attempts:
            try:
                run_auto_grading_for_attempt(db, att)
            except Exception as e:
                import logging

                logging.getLogger("uvicorn.error").error("Auto-grading failed for overdue attempt %d: %s", att.id, e)
    return count
