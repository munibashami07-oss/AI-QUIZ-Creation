"""
Exam content models: questions, exams, and exam_questions.
"""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
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
from app.models.enums import ExamStatus, QuestionType, created_at_col, pg_enum, updated_at_col


class Question(Base):
    """Reusable question bank supporting single MCQ, multi-select, and written questions."""

    __tablename__ = "questions"
    __table_args__ = (
        CheckConstraint("marks > 0", name="ck_questions_marks_positive"),
        {"comment": "Reusable question bank categorized by topic, difficulty, type, and marks."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    difficulty: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    type: Mapped[QuestionType] = mapped_column(
        pg_enum(QuestionType, "question_type"),
        nullable=False,
        index=True,
    )
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[dict | list | None] = mapped_column(JSONB, nullable=True)
    correct_answer: Mapped[dict | list | str | None] = mapped_column(JSONB, nullable=True)
    marks: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()


class Exam(Base):
    """Stores examination configuration, schedule window, rules, and lifecycle status."""

    __tablename__ = "exams"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0", name="ck_exams_duration_positive"),
        CheckConstraint("violation_limit >= 0", name="ck_exams_violation_limit_non_negative"),
        {"comment": "Examination definitions including timing window, rules, mode, and status."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(50), nullable=False, server_default=text("'standard'"))
    publish_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    total_marks: Mapped[Decimal] = mapped_column(Numeric(8, 2), nullable=False, server_default=text("0"))
    violation_limit: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("3"))
    status: Mapped[ExamStatus] = mapped_column(
        pg_enum(ExamStatus, "exam_status"),
        nullable=False,
        default=ExamStatus.DRAFT,
        index=True,
    )
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    shuffle_options: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    created_at: Mapped[datetime] = created_at_col()
    updated_at: Mapped[datetime] = updated_at_col()

    exam_questions = relationship("ExamQuestion", back_populates="exam", cascade="all, delete-orphan")


class ExamQuestion(Base):
    """Join table assigning questions from the question bank to a specific exam."""

    __tablename__ = "exam_questions"
    __table_args__ = (
        UniqueConstraint("exam_id", "question_id", name="uq_exam_questions_exam_question"),
        CheckConstraint("marks_override IS NULL OR marks_override > 0", name="ck_exam_questions_marks_override_positive"),
        {"comment": "Links questions to exams with ordering and optional per-exam mark overrides."},
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id", ondelete="RESTRICT"), nullable=False, index=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    marks_override: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    created_at: Mapped[datetime] = created_at_col()

    exam = relationship("Exam", back_populates="exam_questions")
    question = relationship("Question")
