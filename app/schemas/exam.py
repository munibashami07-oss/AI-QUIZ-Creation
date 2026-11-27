"""
Pydantic schemas for Question Bank, Exam lifecycle, Enrollment, and Attendance.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import ExamStatus, QuestionType


# ---------------------------------------------------------------------------
# Questions
# ---------------------------------------------------------------------------


class QuestionOption(BaseModel):
    key: str
    text: str


class QuestionCreateRequest(BaseModel):
    """Payload to create or update a question in the reusable question bank."""

    prompt: str = Field(min_length=3, description="Question text")
    type: QuestionType
    category: str = Field(min_length=1, max_length=100)
    difficulty: str = Field(default="medium", min_length=1, max_length=30)
    marks: Decimal = Field(gt=0, decimal_places=2)
    options: list[QuestionOption] | None = None
    correct_answer: Any | None = None

    @model_validator(mode="after")
    def validate_mcq_requirements(self) -> "QuestionCreateRequest":
        if self.type in (QuestionType.SINGLE_MCQ, QuestionType.MULTI_SELECT):
            if not self.options or len(self.options) < 2:
                raise ValueError("MCQ questions must have at least 2 options.")

            opt_keys = {opt.key for opt in self.options}

            if self.type == QuestionType.SINGLE_MCQ:
                if not self.correct_answer or not isinstance(self.correct_answer, str):
                    raise ValueError("Single MCQ must have a valid string correct_answer matching an option key.")
                if self.correct_answer not in opt_keys:
                    raise ValueError(f"Correct answer '{self.correct_answer}' does not match any option key {opt_keys}.")
            elif self.type == QuestionType.MULTI_SELECT:
                if not self.correct_answer or not isinstance(self.correct_answer, list) or len(self.correct_answer) < 1:
                    raise ValueError("Multi-select MCQ must have at least 1 correct answer (list of option keys).")
                for ans in self.correct_answer:
                    if ans not in opt_keys:
                        raise ValueError(f"Correct answer '{ans}' does not match any option key {opt_keys}.")
        elif self.type == QuestionType.WRITTEN:
            # Model answer can be a string or dict
            if not self.correct_answer:
                raise ValueError("Short-answer / written questions must provide a model answer.")
        return self


class QuestionUpdateRequest(BaseModel):
    prompt: str | None = None
    type: QuestionType | None = None
    category: str | None = None
    difficulty: str | None = None
    marks: Decimal | None = None
    options: list[QuestionOption] | None = None
    correct_answer: Any | None = None


class QuestionResponse(BaseModel):
    """Full question details including correct answer (Admin & Examiner only)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by: int | None = None
    category: str
    difficulty: str
    type: QuestionType
    prompt: str
    options: Any | None = None
    correct_answer: Any | None = None
    marks: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime


class QuestionPublicResponse(BaseModel):
    """Sanitized question response for candidates. NEVER leaks correct_answer."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    category: str
    difficulty: str
    type: QuestionType
    prompt: str
    options: Any | None = None
    marks: Decimal


# ---------------------------------------------------------------------------
# Exams
# ---------------------------------------------------------------------------


class ExamQuestionItem(BaseModel):
    question_id: int
    order_index: int = 0
    marks_override: Decimal | None = None


class ExamCreateRequest(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    instructions: str | None = None
    mode: str = "standard"  # standard or sandbox
    publish_time: datetime | None = None
    end_time: datetime | None = None
    duration_minutes: int = Field(gt=0)
    violation_limit: int = Field(ge=0, default=3)
    shuffle_questions: bool = False
    shuffle_options: bool = False
    question_ids: list[int] = Field(default_factory=list, description="IDs of questions to attach")

    @model_validator(mode="after")
    def validate_times_and_duration(self) -> "ExamCreateRequest":
        if self.publish_time and self.end_time:
            if self.end_time <= self.publish_time:
                raise ValueError("Exam end_time must be after publish_time.")
            window_minutes = (self.end_time - self.publish_time).total_seconds() / 60
            if self.duration_minutes > window_minutes:
                raise ValueError(
                    f"Exam duration ({self.duration_minutes} min) cannot exceed total window time ({int(window_minutes)} min)."
                )
        return self


class ExamUpdateRequest(BaseModel):
    title: str | None = None
    instructions: str | None = None
    mode: str | None = None
    publish_time: datetime | None = None
    end_time: datetime | None = None
    duration_minutes: int | None = None
    violation_limit: int | None = None
    shuffle_questions: bool | None = None
    shuffle_options: bool | None = None
    question_ids: list[int] | None = None


class ExamResponse(BaseModel):
    """Exam representation with dynamically computed status field."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_by: int | None = None
    title: str
    instructions: str | None = None
    mode: str
    publish_time: datetime | None = None
    end_time: datetime | None = None
    duration_minutes: int
    total_marks: Decimal
    violation_limit: int
    status: ExamStatus
    shuffle_questions: bool
    shuffle_options: bool
    questions_count: int = 0
    created_at: datetime
    updated_at: datetime


class StudentExamResponse(BaseModel):
    """Sanitized exam details for students (shows status and rules, NO answers)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    instructions: str | None = None
    mode: str
    publish_time: datetime | None = None
    end_time: datetime | None = None
    duration_minutes: int
    total_marks: Decimal
    status: ExamStatus
    questions_count: int = 0


# ---------------------------------------------------------------------------
# Enrollment and Attendance
# ---------------------------------------------------------------------------


class BulkEnrollRequest(BaseModel):
    roll_numbers: list[str]


class SingleEnrollRequest(BaseModel):
    student_id: int


class AttendanceMarkRequest(BaseModel):
    student_id: int
    status: str = Field(default="present", pattern="^(present|absent)$")
    notes: str | None = None


class EligibilityResponse(BaseModel):
    eligible: bool
    status: str
    message: str
    exam_status: ExamStatus
    server_time: datetime
