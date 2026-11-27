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


class StudentResultResponse(BaseModel):
    """Student's published result scorecard."""

    model_config = ConfigDict(from_attributes=True)

    exam_id: int
    exam_title: str
    student_id: int
    attempt_id: int
    total_score: Decimal
    max_score: Decimal
    score_display: str
    percentage: Decimal
    is_published: bool
    published_at: datetime | None = None


class PublishResultsResponse(BaseModel):
    """Result returned after publishing exam results."""

    exam_id: int
    published_count: int
    message: str

