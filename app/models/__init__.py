"""
Import all SQLAlchemy models and enums here so Alembic discovers every table automatically.
"""

from app.models.attempt import Answer, Attempt, Result
from app.models.enums import ExamStatus, QuestionType, UserRole
from app.models.exam import Exam, ExamQuestion, Question
from app.models.extras import (
    Announcement,
    AuditLog,
    Incident,
    Report,
    ScratchpadNote,
    UserPreference,
)
from app.models.user import Attendance, Enrollment, LoginSession, User

__all__ = [
    "UserRole",
    "QuestionType",
    "ExamStatus",
    "User",
    "LoginSession",
    "Enrollment",
    "Attendance",
    "Question",
    "Exam",
    "ExamQuestion",
    "Attempt",
    "Answer",
    "Result",
    "Incident",
    "Announcement",
    "Report",
    "UserPreference",
    "ScratchpadNote",
    "AuditLog",
]
