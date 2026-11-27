"""
Business logic service for Questions and Exam lifecycle.
"""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.enums import ExamStatus, QuestionType, UserRole
from app.models.exam import Exam, ExamQuestion, Question
from app.models.user import Attendance, Enrollment, User
from app.schemas.exam import (
    ExamCreateRequest,
    ExamResponse,
    ExamUpdateRequest,
    QuestionCreateRequest,
    QuestionUpdateRequest,
    StudentExamResponse,
)
from app.services.attendance import compute_exam_status


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------


def create_question(db: Session, creator_id: int, payload: QuestionCreateRequest) -> Question:
    opts = [opt.model_dump() for opt in payload.options] if payload.options else None
    q = Question(
        created_by=creator_id,
        category=payload.category.strip(),
        difficulty=payload.difficulty.strip().lower(),
        type=payload.type,
        prompt=payload.prompt.strip(),
        options=opts,
        correct_answer=payload.correct_answer,
        marks=payload.marks,
        is_active=True,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return q


def list_questions(
    db: Session,
    category: str | None = None,
    difficulty: str | None = None,
    question_type: QuestionType | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[Question]]:
    query = select(Question).where(Question.is_active == True)
    count_query = select(func.count(Question.id)).where(Question.is_active == True)

    if category:
        query = query.where(Question.category.ilike(f"%{category}%"))
        count_query = count_query.where(Question.category.ilike(f"%{category}%"))
    if difficulty:
        query = query.where(Question.difficulty == difficulty.lower())
        count_query = count_query.where(Question.difficulty == difficulty.lower())
    if question_type:
        query = query.where(Question.type == question_type)
        count_query = count_query.where(Question.type == question_type)
    if search:
        query = query.where(Question.prompt.ilike(f"%{search}%"))
        count_query = count_query.where(Question.prompt.ilike(f"%{search}%"))

    total = db.scalar(count_query) or 0
    questions = list(db.scalars(query.order_by(Question.id.desc()).offset(skip).limit(limit)).all())
    return total, questions


def update_question(db: Session, q_id: int, payload: QuestionUpdateRequest) -> Question:
    q = db.get(Question, q_id)
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    if payload.prompt is not None:
        q.prompt = payload.prompt.strip()
    if payload.category is not None:
        q.category = payload.category.strip()
    if payload.difficulty is not None:
        q.difficulty = payload.difficulty.strip().lower()
    if payload.type is not None:
        q.type = payload.type
    if payload.marks is not None:
        q.marks = payload.marks
    if payload.options is not None:
        q.options = [opt.model_dump() for opt in payload.options]
    if payload.correct_answer is not None:
        q.correct_answer = payload.correct_answer

    db.commit()
    db.refresh(q)
    return q


def delete_question(db: Session, q_id: int) -> None:
    q = db.get(Question, q_id)
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    q.is_active = False  # Soft delete to preserve exam histories
    db.commit()


# ---------------------------------------------------------------------------
# Exams
# ---------------------------------------------------------------------------


def exam_to_response(exam: Exam) -> ExamResponse:
    computed_status = compute_exam_status(exam)
    count = len(exam.exam_questions) if hasattr(exam, "exam_questions") and exam.exam_questions else 0
    return ExamResponse(
        id=exam.id,
        created_by=exam.created_by,
        title=exam.title,
        instructions=exam.instructions,
        mode=exam.mode,
        publish_time=exam.publish_time,
        end_time=exam.end_time,
        duration_minutes=exam.duration_minutes,
        total_marks=exam.total_marks,
        violation_limit=exam.violation_limit,
        status=computed_status,
        shuffle_questions=exam.shuffle_questions,
        shuffle_options=exam.shuffle_options,
        questions_count=count,
        created_at=exam.created_at,
        updated_at=exam.updated_at,
    )


def create_exam(db: Session, creator_id: int, payload: ExamCreateRequest) -> ExamResponse:
    # Rule: cannot publish without at least one question
    if payload.publish_time and payload.end_time and not payload.question_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot schedule/publish an examination without attaching at least one question.",
        )

    # Fetch questions and compute total marks
    total_marks = Decimal("0.00")
    questions = []
    if payload.question_ids:
        questions = list(db.scalars(select(Question).where(Question.id.in_(payload.question_ids))).all())
        if len(questions) != len(payload.question_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more specified question IDs do not exist.")
        total_marks = sum(q.marks for q in questions)

    exam = Exam(
        created_by=creator_id,
        title=payload.title.strip(),
        instructions=payload.instructions,
        mode=payload.mode,
        publish_time=payload.publish_time,
        end_time=payload.end_time,
        duration_minutes=payload.duration_minutes,
        total_marks=total_marks,
        violation_limit=payload.violation_limit,
        status=ExamStatus.DRAFT,  # Stored fallback, runtime uses compute_exam_status
        shuffle_questions=payload.shuffle_questions,
        shuffle_options=payload.shuffle_options,
    )
    db.add(exam)
    db.flush()

    # Link questions
    for idx, q_id in enumerate(payload.question_ids, start=1):
        db.add(ExamQuestion(exam_id=exam.id, question_id=q_id, order_index=idx))

    db.commit()
    db.refresh(exam)
    return exam_to_response(exam)


def update_exam(db: Session, exam_id: int, user: User, payload: ExamUpdateRequest) -> ExamResponse:
    exam = db.scalar(select(Exam).options(selectinload(Exam.exam_questions)).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    # Permissions: Examiners can only edit their own exams; Admins can edit all
    if user.role != UserRole.ADMIN and exam.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit your own examinations.")

    current_status = compute_exam_status(exam)

    # Rule on editing published exams:
    # Once ongoing or completed, questions and duration cannot be changed to preserve assessment integrity.
    if current_status in (ExamStatus.ONGOING, ExamStatus.COMPLETED):
        if payload.question_ids is not None or payload.duration_minutes is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot modify questions or duration for an exam that is already {current_status.value}.",
            )

    # Validate publish/end window changes
    new_publish = payload.publish_time if payload.publish_time is not None else exam.publish_time
    new_end = payload.end_time if payload.end_time is not None else exam.end_time
    new_duration = payload.duration_minutes if payload.duration_minutes is not None else exam.duration_minutes

    if new_publish and new_end:
        if new_end <= new_publish:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exam end_time must be after publish_time.")
        window_minutes = (new_end - new_publish).total_seconds() / 60
        if new_duration > window_minutes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duration ({new_duration} min) exceeds examination window ({int(window_minutes)} min).",
            )

    # Apply updates
    if payload.title is not None:
        exam.title = payload.title.strip()
    if payload.instructions is not None:
        exam.instructions = payload.instructions
    if payload.mode is not None:
        exam.mode = payload.mode
    if payload.publish_time is not None:
        exam.publish_time = payload.publish_time
    if payload.end_time is not None:
        exam.end_time = payload.end_time
    if payload.duration_minutes is not None:
        exam.duration_minutes = payload.duration_minutes
    if payload.violation_limit is not None:
        exam.violation_limit = payload.violation_limit
    if payload.shuffle_questions is not None:
        exam.shuffle_questions = payload.shuffle_questions
    if payload.shuffle_options is not None:
        exam.shuffle_options = payload.shuffle_options

    if payload.question_ids is not None:
        # Check rule: cannot be published without questions
        if (new_publish and new_end) and not payload.question_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Published exams must have at least one question.")

        # Re-link questions and compute marks
        db.query(ExamQuestion).filter(ExamQuestion.exam_id == exam.id).delete()
        questions = list(db.scalars(select(Question).where(Question.id.in_(payload.question_ids))).all())
        if len(questions) != len(payload.question_ids):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="One or more specified question IDs do not exist.")

        exam.total_marks = sum(q.marks for q in questions)
        for idx, q_id in enumerate(payload.question_ids, start=1):
            db.add(ExamQuestion(exam_id=exam.id, question_id=q_id, order_index=idx))

    db.commit()
    db.refresh(exam)
    return exam_to_response(exam)


def delete_exam(db: Session, exam_id: int, user: User) -> None:
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")
    if user.role != UserRole.ADMIN and exam.created_by != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete your own examinations.")
    db.delete(exam)
    db.commit()
