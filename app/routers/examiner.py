"""
Examiner & Admin router for Questions and Exams management.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.enums import QuestionType, UserRole
from app.models.exam import Exam, ExamQuestion, Question
from app.models.extras import Incident
from app.models.user import Attendance, Enrollment, User
from app.schemas.exam import (
    AttendanceMarkRequest,
    BulkEnrollRequest,
    ExamCreateRequest,
    ExamResponse,
    ExamUpdateRequest,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
    SingleEnrollRequest,
)
from app.schemas.grading import (
    AnswerReviewResponse,
    ExamStatsResponse,
    GradeAnswerRequest,
    GradeAnswerResponse,
    IncidentResponse,
    PublishResultsRequest,
    PublishResultsResponse,
)
from app.services.attendance import compute_exam_status
from app.services.auth import require_role
from app.services.exam_service import (
    create_exam,
    create_question,
    delete_exam,
    delete_question,
    exam_to_response,
    list_questions,
    update_exam,
    update_question,
)
from app.services.grading_service import (
    get_pending_reviews_for_exam,
    grade_single_answer,
)
from app.services.report_service import (
    export_exam_results_csv,
    get_exam_class_stats,
    publish_or_unpublish_exam_results,
)

router = APIRouter(prefix="/examiner", tags=["Examiner & Question Management"])


# ---------------------------------------------------------------------------
# Questions CRUD (admin and examiner)
# ---------------------------------------------------------------------------


@router.post("/questions", response_model=QuestionResponse, status_code=status.HTTP_201_CREATED)
def add_question(
    payload: QuestionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> Question:
    """Create a new question in the question bank."""
    return create_question(db, creator_id=current_user.id, payload=payload)


@router.get("/questions", response_model=dict)
def get_questions(
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
    category: str | None = None,
    difficulty: str | None = None,
    type: QuestionType | None = None,
    search: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> dict:
    """List questions with filters by category, difficulty, and type."""
    total, questions = list_questions(
        db, category=category, difficulty=difficulty, question_type=type, search=search, skip=skip, limit=limit
    )
    return {
        "total": total,
        "questions": [QuestionResponse.model_validate(q) for q in questions],
    }


@router.get("/questions/{q_id}", response_model=QuestionResponse)
def get_question(
    q_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> Question:
    """Get single question details."""
    q = db.get(Question, q_id)
    if not q or not q.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")
    return q


@router.patch("/questions/{q_id}", response_model=QuestionResponse)
def modify_question(
    q_id: int,
    payload: QuestionUpdateRequest,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> Question:
    """Update question attributes."""
    return update_question(db, q_id=q_id, payload=payload)


@router.delete("/questions/{q_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_question(
    q_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> None:
    """Delete (deactivate) a question."""
    delete_question(db, q_id=q_id)


# ---------------------------------------------------------------------------
# Exams CRUD (admin and examiner)
# ---------------------------------------------------------------------------


@router.post("/exams", response_model=ExamResponse, status_code=status.HTTP_201_CREATED)
def add_exam(
    payload: ExamCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> ExamResponse:
    """Create a new exam with timing validation and questions."""
    return create_exam(db, creator_id=current_user.id, payload=payload)


@router.get("/exams", response_model=list[ExamResponse])
def get_exams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> list[ExamResponse]:
    """List exams with computed status. Examiners only see their own exams; Admins see all."""
    query = select(Exam).options(selectinload(Exam.exam_questions))
    if current_user.role != UserRole.ADMIN:
        query = query.where(Exam.created_by == current_user.id)

    exams = list(db.scalars(query.order_by(Exam.id.desc()).offset(skip).limit(limit)).all())
    return [exam_to_response(e) for e in exams]


@router.get("/exams/{exam_id}", response_model=ExamResponse)
def get_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> ExamResponse:
    """Get single exam details with computed status."""
    exam = db.scalar(select(Exam).options(selectinload(Exam.exam_questions)).where(Exam.id == exam_id))
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")
    if current_user.role != UserRole.ADMIN and exam.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
    return exam_to_response(exam)


@router.patch("/exams/{exam_id}", response_model=ExamResponse)
def modify_exam(
    exam_id: int,
    payload: ExamUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> ExamResponse:
    """Update exam. Preserves published integrity rules."""
    return update_exam(db, exam_id=exam_id, user=current_user, payload=payload)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> None:
    """Delete an exam."""
    delete_exam(db, exam_id=exam_id, user=current_user)


# ---------------------------------------------------------------------------
# Enrollment and Attendance (admin and examiner)
# ---------------------------------------------------------------------------


@router.post("/exams/{exam_id}/enroll", response_model=dict)
def enroll_student(
    exam_id: int,
    payload: SingleEnrollRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> dict:
    """Enroll a single student in an exam."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")
    student = db.get(User, payload.student_id)
    if not student or student.role != UserRole.STUDENT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    existing = db.scalar(select(Enrollment).where(Enrollment.exam_id == exam_id, Enrollment.student_id == student.id))
    if existing:
        return {"message": "Student is already enrolled in this exam.", "enrolled": True}

    db.add(Enrollment(exam_id=exam_id, student_id=student.id, enrolled_by=current_user.id))
    # Automatically add initial attendance record
    db.add(Attendance(exam_id=exam_id, student_id=student.id, status="present", marked_by=current_user.id))
    db.commit()
    return {"message": f"Student {student.full_name} enrolled successfully.", "enrolled": True}


@router.post("/exams/{exam_id}/enroll-bulk", response_model=dict)
def bulk_enroll_students(
    exam_id: int,
    payload: BulkEnrollRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> dict:
    """Bulk enroll students into an exam by their roll numbers."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    roll_numbers = [r.strip().upper() for r in payload.roll_numbers if r.strip()]
    if not roll_numbers:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No roll numbers provided.")

    students = list(db.scalars(select(User).where(func.upper(User.roll_number).in_(roll_numbers), User.role == UserRole.STUDENT)).all())
    found_rolls = {s.roll_number.upper() for s in students if s.roll_number}
    missing_rolls = list(set(roll_numbers) - found_rolls)

    enrolled_count = 0
    for s in students:
        existing = db.scalar(select(Enrollment.id).where(Enrollment.exam_id == exam_id, Enrollment.student_id == s.id))
        if not existing:
            db.add(Enrollment(exam_id=exam_id, student_id=s.id, enrolled_by=current_user.id))
            db.add(Attendance(exam_id=exam_id, student_id=s.id, status="present", marked_by=current_user.id))
            enrolled_count += 1

    db.commit()
    return {
        "message": f"Successfully enrolled {enrolled_count} students.",
        "enrolled_count": enrolled_count,
        "missing_roll_numbers": missing_rolls,
    }


@router.post("/exams/{exam_id}/attendance", response_model=dict)
def mark_attendance(
    exam_id: int,
    payload: AttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> dict:
    """Mark attendance for a student (present or absent)."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    att = db.scalar(select(Attendance).where(Attendance.exam_id == exam_id, Attendance.student_id == payload.student_id))
    if not att:
        att = Attendance(
            exam_id=exam_id,
            student_id=payload.student_id,
            status=payload.status,
            notes=payload.notes,
            marked_by=current_user.id,
        )
        db.add(att)
    else:
        att.status = payload.status
        att.notes = payload.notes
        att.marked_by = current_user.id

    db.commit()
    return {"message": f"Attendance marked as '{payload.status}' for student id {payload.student_id}."}


# ---------------------------------------------------------------------------
# Grading & AI Evaluation Review (Examiner/Admin)
# ---------------------------------------------------------------------------


@router.get("/exams/{exam_id}/grading/pending", response_model=list[AnswerReviewResponse])
def get_exam_pending_grading(
    exam_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> list[AnswerReviewResponse]:
    """List all written student answers requiring manual review or AI suggestion approval."""
    return get_pending_reviews_for_exam(db, exam_id=exam_id)


@router.post("/answers/{answer_id}/grade", response_model=GradeAnswerResponse)
def grade_answer(
    answer_id: int,
    payload: GradeAnswerRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> GradeAnswerResponse:
    """Manually assign/override marks for a written student answer."""
    return grade_single_answer(
        db=db,
        answer_id=answer_id,
        examiner_id=current_user.id,
        marks_awarded=payload.marks_awarded,
        notes=payload.notes,
    )


@router.post("/exams/{exam_id}/publish-results", response_model=PublishResultsResponse)
def publish_results(
    exam_id: int,
    payload: PublishResultsRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> PublishResultsResponse:
    """Publish or unpublish exam results.
    Publishing is refused if any submitted attempt still has ungraded short answers.
    """
    publish_flag = payload.publish if payload else True
    return publish_or_unpublish_exam_results(
        db, exam_id=exam_id, examiner_id=current_user.id, publish=publish_flag
    )


@router.post("/exams/{exam_id}/unpublish-results", response_model=PublishResultsResponse)
def unpublish_results(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> PublishResultsResponse:
    """Unpublish exam results."""
    return publish_or_unpublish_exam_results(
        db, exam_id=exam_id, examiner_id=current_user.id, publish=False
    )


@router.get("/exams/{exam_id}/stats", response_model=ExamStatsResponse)
def get_examiner_exam_stats(
    exam_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> ExamStatsResponse:
    """Class analytics using SQL aggregates (excluding sandbox and unsubmitted attempts)."""
    return get_exam_class_stats(db, exam_id=exam_id)


@router.get("/exams/{exam_id}/results.csv")
def get_examiner_exam_results_csv(
    exam_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> Response:
    """Export exam results as RFC 4180 CSV with sanitized formula cells."""
    csv_text = export_exam_results_csv(db, exam_id=exam_id)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="exam_{exam_id}_results.csv"'},
    )


# ---------------------------------------------------------------------------
# Incidents & Monitoring
# ---------------------------------------------------------------------------


@router.get("/attempts/{attempt_id}/incidents", response_model=list[IncidentResponse])
def get_attempt_incidents(
    attempt_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> list[Incident]:
    """Retrieve security violation incidents recorded during a candidate's attempt."""
    incidents = list(
        db.scalars(
            select(Incident)
            .where(Incident.attempt_id == attempt_id)
            .order_by(Incident.occurred_at.asc())
        ).all()
    )
    return incidents

