"""
Pydantic schemas for Violations and Grading.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Violations
# ---------------------------------------------------------------------------

AllowedViolationType = Literal[
    "tab_switch",
    "fullscreen_exit",
    "copy_paste",
    "right_click",
    "window_blur",
]


class ViolationReportRequest(BaseModel):
    """Payload sent by candidate client when a security violation occurs."""

    type: AllowedViolationType
    details: dict[str, Any] | None = None


class ViolationActionResponse(BaseModel):
    """Response returned upon reporting a violation."""

    action: Literal["warning", "auto_submitted"]
    violation_count: int
    violation_limit: int
    message: str


class IncidentResponse(BaseModel):
    """Incident detail representation for examiner/admin monitoring."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    attempt_id: int
    event_type: str
    details: Any | None = None
    occurred_at: datetime
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None


# ---------------------------------------------------------------------------
# Grading
# ---------------------------------------------------------------------------


class AnswerReviewResponse(BaseModel):
    """Answer needing review or already reviewed."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    attempt_id: int
    student_id: int
    student_name: str
    student_roll: str | None = None
    question_id: int
    prompt: str
    model_answer: Any | None = None
    written_response: str | None = None
    max_marks: Decimal
    marks_awarded: Decimal | None = None
    suggested_marks: Decimal | None = None
    verdict: str | None = None
    ai_reason: str | None = None
    status: str
    graded_by: int | None = None
    graded_at: datetime | None = None


class GradeAnswerRequest(BaseModel):
    """Payload to approve or override the grade for a short answer."""

    marks_awarded: Decimal = Field(ge=0, decimal_places=2)
    notes: str | None = None


class GradeAnswerResponse(BaseModel):
    """Response after grading an answer."""

    answer_id: int
    marks_awarded: Decimal
    status: str
    graded_by: int
    graded_at: datetime
    all_answers_graded: bool
    total_score: Decimal | None = None
    score_display: str | None = None
    message: str


class QuestionResultDetail(BaseModel):
    """Per-question result breakdown for candidate."""

    question_id: int
    prompt: str
    type: str
    max_marks: Decimal
    marks_awarded: Decimal | None = None
    verdict: str = "wrong"  # "correct", "partial", "wrong"


class StudentResultResponse(BaseModel):
    """Student's published result scorecard with question-level verdict and class stats."""

    model_config = ConfigDict(from_attributes=True)

    exam_id: int
    exam_title: str
    student_id: int
    attempt_id: int
    score: Decimal
    total_marks: Decimal
    total_score: Decimal  # backwards compatibility
    max_score: Decimal    # backwards compatibility
    score_display: str
    percentage: Decimal
    is_published: bool
    published_at: datetime | None = None
    questions: list[QuestionResultDetail] = []
    class_average: Decimal | None = None
    class_highest: Decimal | None = None
    class_lowest: Decimal | None = None


class PublishResultsRequest(BaseModel):
    """Request payload to publish or unpublish exam results."""

    publish: bool = True


class PublishResultsResponse(BaseModel):
    """Result returned after publishing/unpublishing exam results."""

    exam_id: int
    published_count: int
    is_published: bool
    message: str


class ExamStatsResponse(BaseModel):
    """Class performance statistics and distribution for an exam."""

    exam_id: int
    exam_title: str
    total_attempts: int
    class_average: Decimal
    highest_score: Decimal
    lowest_score: Decimal
    pass_count: int
    fail_count: int
    score_distribution: dict[str, int]


class PublicVerificationResponse(BaseModel):
    """Minimal, privacy-preserving certificate verification response."""

    valid: bool
    student_name: str | None = None
    exam_title: str | None = None
    score_display: str | None = None
    date: str | None = None
    message: str


