"""
People and access models: users, login_sessions, enrollments, and attendance.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import UserRole, created_at_col, pg_enum, updated_at_col, utc_now


class User(Base):
    """Stores platform accounts for admins, examiners, and students."""

    __tablename__ = "users"
    __table_args__ = {"comment": "Platform users (admin, examiner, student) and profile fields."}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        pg_enum(UserRole, "user_role"),
        nullable=False,
        default=UserRole.STUDENT,
        index=True,
    )
    roll_number: Mapped[str | None] = mapped_column(String(50), unique=True, index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    picture: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    registration_status: Mapped[str] = mapped_column(String(30), nullable=False, server_default=text("'approved'"))

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    # Relationships
    login_sessions = relationship("LoginSession", back_populates="user", cascade="all, delete-orphan")
    preferences = relationship("UserPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")


class LoginSession(Base):
    """Tracks active and revoked authentication sessions for users."""

    __tablename__ = "login_sessions"
    __table_args__ = {"comment": "User authentication sessions for token validation and revocation."}

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)
    device: Mapped[str | None] = mapped_column(String(120), nullable=True)
    os: Mapped[str | None] = mapped_column("os_name", String(120), nullable=True)
    browser: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    logged_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("TIMEZONE('utc', NOW())"),
    )
    created_at: Mapped[datetime] = created_at_col()

    user = relationship("User", back_populates="login_sessions")


class Enrollment(Base):
    """Maps eligible students to the examinations they are enrolled in."""

    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_enrollments_exam_student"),
        {"comment": "Maps which students are enrolled and eligible to take each exam."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    enrolled_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    enrolled_at: Mapped[datetime] = created_at_col()


class Attendance(Base):
    """Records student attendance status and check-in time per examination."""

    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("exam_id", "student_id", name="uq_attendance_exam_student"),
        {"comment": "Tracks student presence, check-in timestamps, and attendance notes per exam."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default=text("'present'"))
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    marked_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()
