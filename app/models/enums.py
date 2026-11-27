"""
Shared PostgreSQL ENUM types and UTC timestamp helpers for SQLAlchemy 2.0 models.
"""

from datetime import datetime, timezone
import enum

from sqlalchemy import DateTime, Enum, text
from sqlalchemy.orm import Mapped, mapped_column


class UserRole(str, enum.Enum):
    """Allowed user roles across the platform."""

    ADMIN = "admin"
    EXAMINER = "examiner"
    STUDENT = "student"


class QuestionType(str, enum.Enum):
    """Supported question formats in the question bank."""

    SINGLE_MCQ = "single_mcq"
    MULTI_SELECT = "multi_select"
    WRITTEN = "written"


class ExamStatus(str, enum.Enum):
    """Lifecycle states of an examination."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ONGOING = "ongoing"
    COMPLETED = "completed"


def utc_now() -> datetime:
    """Return the current timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def pg_enum(enum_cls: type[enum.Enum], name: str) -> Enum:
    """Create a PostgreSQL ENUM column type storing lowercase enum .value strings."""
    return Enum(
        enum_cls,
        name=name,
        values_callable=lambda cls: [member.value for member in cls],
    )


def created_at_col() -> Mapped[datetime]:
    """Reusable UTC TIMESTAMPTZ created_at column."""
    return mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("TIMEZONE('utc', NOW())"),
    )


def updated_at_col() -> Mapped[datetime]:
    """Reusable UTC TIMESTAMPTZ updated_at column."""
    return mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=text("TIMEZONE('utc', NOW())"),
    )
