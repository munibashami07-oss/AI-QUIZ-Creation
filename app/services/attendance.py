"""
Attendance and eligibility validation service for exams.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ExamStatus
from app.models.exam import Exam
from app.models.user import Attendance, Enrollment, User


def compute_exam_status(exam: Exam, now: datetime | None = None) -> ExamStatus:
    """Compute the actual exam lifecycle status dynamically based on current UTC time.
    
    Lifecycle states:
    - draft: No publish_time or end_time set yet.
    - published: Before publish_time has arrived.
    - ongoing: Current UTC time is between publish_time and end_time.
    - completed: After end_time has passed.
    """
    if now is None:
        now = datetime.now(timezone.utc)

    if not exam.publish_time or not exam.end_time:
        return ExamStatus.DRAFT

    if now < exam.publish_time:
        return ExamStatus.PUBLISHED
    elif exam.publish_time <= now <= exam.end_time:
        return ExamStatus.ONGOING
    else:
        return ExamStatus.COMPLETED


def check_exam_eligibility(db: Session, student_id: int, exam: Exam) -> dict[str, Any]:
    """Single reusable attendance & eligibility validation function.
    
    Rule:
    1. Student must be enrolled in the exam.
    2. Student must be marked 'present' in attendance for this exam.
    3. Current UTC time must be inside the exam window (between publish_time and end_time).
    
    Returns:
        dict: {
            "eligible": bool,
            "status": "eligible" | "not_enrolled" | "absent" | "too_early" | "too_late" | "draft",
            "message": str,
            "exam_status": ExamStatus,
            "server_time": datetime
        }
    """
    now = datetime.now(timezone.utc)
    current_status = compute_exam_status(exam, now)

    # 1. Check enrollment
    is_enrolled = db.scalar(
        select(Enrollment.id).where(
            Enrollment.exam_id == exam.id,
            Enrollment.student_id == student_id,
        )
    )
    if not is_enrolled:
        return {
            "eligible": False,
            "status": "not_enrolled",
            "message": "Student is not enrolled in this examination.",
            "exam_status": current_status,
            "server_time": now,
        }

    # 2. Check attendance status
    att = db.scalar(
        select(Attendance).where(
            Attendance.exam_id == exam.id,
            Attendance.student_id == student_id,
        )
    )
    if not att or att.status.lower() != "present":
        return {
            "eligible": False,
            "status": "absent",
            "message": "Student has not been marked present for this examination.",
            "exam_status": current_status,
            "server_time": now,
        }

    # 3. Check time window
    if not exam.publish_time or not exam.end_time:
        return {
            "eligible": False,
            "status": "draft",
            "message": "Examination schedule has not been published yet.",
            "exam_status": current_status,
            "server_time": now,
        }

    if now < exam.publish_time:
        return {
            "eligible": False,
            "status": "too_early",
            "message": f"Examination has not started yet. Available at {exam.publish_time.isoformat()}.",
            "exam_status": current_status,
            "server_time": now,
        }

    if now > exam.end_time:
        return {
            "eligible": False,
            "status": "too_late",
            "message": "Examination window has already closed.",
            "exam_status": current_status,
            "server_time": now,
        }

    return {
        "eligible": True,
        "status": "eligible",
        "message": "Student is eligible to take the examination.",
        "exam_status": current_status,
        "server_time": now,
    }
