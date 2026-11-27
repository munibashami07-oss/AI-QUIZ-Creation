"""
Student router: view enrolled exams and check eligibility.
Never exposes questions, correct answers, or sensitive data.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.exam import Exam
from app.models.user import Enrollment, User
from app.schemas.attempt import (
    AnswerUpsertRequest,
    AttemptResponse,
    SubmitAttemptRequest,
    SubmitResponse,
)
from app.schemas.exam import EligibilityResponse, StudentExamResponse
from app.schemas.grading import StudentResultResponse, ViolationActionResponse, ViolationReportRequest
from app.services.attendance import check_exam_eligibility, compute_exam_status
from app.services.attempt_service import (
    autosave_answer,
    get_attempt_state,
    record_student_violation,
    start_or_resume_attempt,
    submit_attempt,
)
from app.services.auth import require_role
from app.services.report_service import get_student_attempt_result

router = APIRouter(prefix="/student", tags=["Student Exam Portal"])


# ---------------------------------------------------------------------------
# Enrolled Exams & Eligibility
# ---------------------------------------------------------------------------


@router.get("/exams", response_model=list[StudentExamResponse])
def get_my_exams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> list[StudentExamResponse]:
    """List only the examinations the logged-in student is enrolled in, with computed status."""
    enrolled_exam_ids = select(Enrollment.exam_id).where(Enrollment.student_id == current_user.id)
    exams = list(
        db.scalars(
            select(Exam)
            .options(selectinload(Exam.exam_questions))
            .where(Exam.id.in_(enrolled_exam_ids))
            .order_by(Exam.publish_time.desc().nullslast(), Exam.id.desc())
        ).all()
    )

    results = []
    for e in exams:
        results.append(
            StudentExamResponse(
                id=e.id,
                title=e.title,
                instructions=e.instructions,
                mode=e.mode,
                publish_time=e.publish_time,
                end_time=e.end_time,
                duration_minutes=e.duration_minutes,
                total_marks=e.total_marks,
                status=compute_exam_status(e),
                questions_count=len(e.exam_questions),
            )
        )
    return results


@router.get("/exams/{exam_id}/eligibility", response_model=EligibilityResponse)
def get_exam_eligibility(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> EligibilityResponse:
    """Check whether the student is eligible to take the exam using the single attendance/window rule."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    res = check_exam_eligibility(db, student_id=current_user.id, exam=exam)
    return EligibilityResponse(
        eligible=res["eligible"],
        status=res["status"],
        message=res["message"],
        exam_status=res["exam_status"],
        server_time=res["server_time"],
    )


# ---------------------------------------------------------------------------
# Attempt Lifecycle: Start, Autosave, Resume, Submit
# ---------------------------------------------------------------------------


@router.post("/exams/{exam_id}/start", response_model=AttemptResponse)
def start_exam_attempt(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> AttemptResponse:
    """Start a new attempt or resume an active one. Questions and marks are frozen."""
    return start_or_resume_attempt(db, student=current_user, exam_id=exam_id)


@router.put("/attempts/{attempt_id}/answers/{question_id}", response_model=dict)
def autosave_attempt_answer(
    attempt_id: int,
    question_id: int,
    payload: AnswerUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> dict:
    """Autosave single answer with atomic ON CONFLICT DO UPDATE."""
    return autosave_answer(
        db=db,
        student=current_user,
        attempt_id=attempt_id,
        question_id=question_id,
        payload=payload,
    )


@router.get("/attempts/{attempt_id}", response_model=AttemptResponse)
def resume_attempt(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> AttemptResponse:
    """Resume attempt state on browser refresh with remaining seconds and saved answers."""
    return get_attempt_state(db, student=current_user, attempt_id=attempt_id)


@router.post("/attempts/{attempt_id}/submit", response_model=SubmitResponse)
def finalize_attempt(
    attempt_id: int,
    payload: SubmitAttemptRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> SubmitResponse:
    """Submit attempt with row-level locking (SELECT FOR UPDATE) to prevent duplicates."""
    reason = payload.submit_reason if payload else "manual"
    return submit_attempt(db, student=current_user, attempt_id=attempt_id, submit_reason=reason)


@router.post("/attempts/{attempt_id}/violations", response_model=ViolationActionResponse)
def report_attempt_violation(
    attempt_id: int,
    payload: ViolationReportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> ViolationActionResponse:
    """Report an in-exam client violation event. Automatically finalizes the attempt if limit reached."""
    return record_student_violation(db, student=current_user, attempt_id=attempt_id, payload=payload)


# ---------------------------------------------------------------------------
# Results
# ---------------------------------------------------------------------------


@router.get("/exams/{exam_id}/result", response_model=StudentResultResponse)
def get_exam_result(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("student")),
) -> StudentResultResponse:
    """View final published scorecard, per-question marks with verdicts, and class statistics."""
    from app.models.attempt import Attempt
    attempt = db.scalar(
        select(Attempt)
        .where(
            Attempt.exam_id == exam_id,
            Attempt.student_id == current_user.id,
            Attempt.is_sandbox == False,
        )
        .order_by(Attempt.id.desc())
    )
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examination attempt record found for this exam.",
        )
    return get_student_attempt_result(db, attempt_id=attempt.id, current_user=current_user)


