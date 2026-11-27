"""
Pydantic schemas for the Attempt Engine.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class FrozenQuestionSchema(BaseModel):
    """Sanitized question as presented inside the active attempt workspace."""

    question_id: int
    order_index: int
    category: str
    difficulty: str
    type: str
    prompt: str
    options: Any | None = None
    marks: Decimal


class AnswerUpsertRequest(BaseModel):
    """Payload sent by candidate during autosave."""

    selected_options: Any | None = None
    written_response: str | None = None
    status: str = Field(default="answered", pattern="^(answered|unanswered|marked_for_review)$")


class AnswerStateResponse(BaseModel):
    """Response representing candidate's saved answer to a question."""

    model_config = ConfigDict(from_attributes=True)

    question_id: int
    selected_options: Any | None = None
    written_response: str | None = None
    status: str
    updated_at: datetime


class AttemptResponse(BaseModel):
    """Full attempt workspace state returned upon start or resume."""

    attempt_id: int
    exam_id: int
    student_id: int
    is_sandbox: bool
    started_at: datetime
    server_deadline: datetime
    server_time: datetime
    remaining_seconds: int
    is_submitted: bool
    submitted_at: datetime | None = None
    submit_reason: str | None = None
    questions: list[FrozenQuestionSchema]
    saved_answers: list[AnswerStateResponse]


class SubmitAttemptRequest(BaseModel):
    """Optional payload when manually or automatically submitting an attempt."""

    submit_reason: str = Field(default="manual", pattern="^(manual|time_expired|violation_limit)$")


class SubmitResponse(BaseModel):
    """Response returned upon submission."""

    attempt_id: int
    is_submitted: bool
    submitted_at: datetime
    submit_reason: str
    server_time: datetime
    message: str = "Attempt submitted successfully."
