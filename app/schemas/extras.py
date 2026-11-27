"""
Pydantic schemas for Announcements, Live Monitoring, Bulk Import,
User Preferences, Scratchpad Notes, and Audit Logging.
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------


class AnnouncementCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    message: str = Field(min_length=1)
    exam_id: int | None = None


class AnnouncementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    message: str
    exam_id: int | None = None
    created_by: int | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Live Monitoring
# ---------------------------------------------------------------------------


class StudentMonitorItem(BaseModel):
    student_id: int
    full_name: str
    roll_number: str | None = None
    status: str  # "not_started" | "in_progress" | "submitted"
    time_remaining_seconds: int
    violation_count: int
    last_seen: datetime | None = None
    attempt_id: int | None = None


class ExamMonitorResponse(BaseModel):
    exam_id: int
    exam_title: str
    total_enrolled: int
    students: list[StudentMonitorItem]


# ---------------------------------------------------------------------------
# Bulk Student Import
# ---------------------------------------------------------------------------


class ImportUserSuccessItem(BaseModel):
    id: int
    name: str
    email: str
    roll_number: str | None = None
    phone: str | None = None


class ImportUserRowError(BaseModel):
    row: int
    data: dict[str, Any]
    errors: list[str]


class BulkImportResponse(BaseModel):
    total_rows: int
    imported_count: int
    failed_count: int
    imported: list[ImportUserSuccessItem]
    errors: list[ImportUserRowError]


# ---------------------------------------------------------------------------
# User Preferences
# ---------------------------------------------------------------------------


class UserPreferencesResponse(BaseModel):
    user_id: int
    preferences: dict[str, Any]


class UserPreferencesUpdateRequest(BaseModel):
    preferences: dict[str, Any]


# ---------------------------------------------------------------------------
# Scratchpad Notes
# ---------------------------------------------------------------------------


class ScratchpadResponse(BaseModel):
    attempt_id: int
    content: str
    updated_at: datetime


class ScratchpadUpdateRequest(BaseModel):
    content: str


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    actor_id: int | None = None
    action: str
    entity_type: str
    entity_id: str | None = None
    metadata_json: Any | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    total: int
    entries: list[AuditLogResponse]
