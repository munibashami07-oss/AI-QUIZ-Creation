"""
Attempt models: attempts, answers, and results.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import created_at_col, updated_at_col, utc_now


class Attempt(Base):
    """Stores a student's (or examiner sandbox) exam attempt with frozen snapshot and server deadline."""

    __tablename__ = "attempts"
    __table_args__ = (
        # Allow unlimited sandbox attempts, but only ONE real attempt per (student_id, exam_id).
        Index(
            "uq_attempts_student_exam_real",
            "student_id",
            "exam_id",
            unique=True,
            postgresql_where=text("is_sandbox = false"),
        ),
        CheckConstraint("violation_count >= 0", name="ck_attempts_violation_count_non_negative"),
        {"comment": "Exam attempts with server-enforced deadline, frozen question snapshot, and sandbox flag."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=text("TIMEZONE('utc', NOW())"),
    )
    server_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    submit_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)
    violation_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    frozen_snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    is_sandbox: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), index=True)

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    answers = relationship("Answer", back_populates="attempt", cascade="all, delete-orphan")
    result = relationship("Result", back_populates="attempt", uselist=False, cascade="all, delete-orphan")


class Answer(Base):
    """Stores one saved/submitted answer per question in an attempt (autosave upserts via unique constraint)."""

    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_answers_attempt_question"),
        CheckConstraint("marks_awarded IS NULL OR marks_awarded >= 0", name="ck_answers_marks_non_negative"),
        # Note: Upper bound (marks_awarded <= question's marks) is enforced by DB trigger trg_answers_check_marks.
        {"comment": "Candidate responses per attempt/question with grading status and awarded marks."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False, index=True)
    selected_options: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    written_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, server_default=text("'unanswered'"))
    marks_awarded: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    graded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    attempt = relationship("Attempt", back_populates="answers")


class Result(Base):
    """Stores computed total scores and publication visibility for an exam attempt."""

    __tablename__ = "results"
    __table_args__ = (
        CheckConstraint("total_score >= 0", name="ck_results_total_score_non_negative"),
        CheckConstraint("max_score >= 0", name="ck_results_max_score_non_negative"),
        {"comment": "Final graded scores and controlled publication state per attempt."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    attempt_id: Mapped[int] = mapped_column(
        ForeignKey("attempts.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    total_score: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, server_default=text("0"))
    max_score: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, server_default=text("0"))
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"), index=True)
    published_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    attempt = relationship("Attempt", back_populates="result")
