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
from app.schemas.exam import EligibilityResponse, StudentExamResponse
from app.services.attendance import check_exam_eligibility, compute_exam_status
from app.services.auth import require_role

router = APIRouter(prefix="/student", tags=["Student Exam Portal"])


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
