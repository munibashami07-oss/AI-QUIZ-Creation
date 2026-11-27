"""
Endpoints for Announcements, Live Exam Monitoring, User Preferences,
and Attempt Scratchpad Rough Work Notes.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.extras import Announcement
from app.models.user import User
from app.schemas.extras import (
    AnnouncementCreateRequest,
    AnnouncementResponse,
    ExamMonitorResponse,
    ScratchpadResponse,
    ScratchpadUpdateRequest,
    UserPreferencesResponse,
    UserPreferencesUpdateRequest,
)
from app.services.auth import get_current_user, require_role
from app.services.extras_service import (
    create_announcement,
    delete_announcement,
    get_announcements_for_user,
    get_live_exam_monitor,
    get_scratchpad_service,
    get_user_preferences_service,
    save_scratchpad_service,
    update_user_preferences_service,
)

router = APIRouter(tags=["Announcements, Monitoring & Extras"])


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------


@router.post("/announcements", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED)
def post_announcement(
    payload: AnnouncementCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> Announcement:
    """Create an announcement for an exam or globally. Visible to candidates taking the exam."""
    return create_announcement(db=db, creator=current_user, payload=payload)


@router.get("/announcements", response_model=list[AnnouncementResponse])
def list_announcements(
    exam_id: int | None = Query(None, description="Optional exam filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Announcement]:
    """Retrieve announcements. Students see their enrolled exams plus global announcements, newest first."""
    return get_announcements_for_user(db=db, current_user=current_user, exam_id=exam_id)


@router.delete("/announcements/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role("admin", "examiner")),
) -> None:
    """Delete an announcement (admin or creator only)."""
    delete_announcement(db=db, announcement_id=announcement_id, current_user=current_user)


# ---------------------------------------------------------------------------
# Live Exam Monitoring (Examiner / Admin)
# ---------------------------------------------------------------------------


@router.get("/exams/{exam_id}/monitor", response_model=ExamMonitorResponse)
def monitor_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> ExamMonitorResponse:
    """Live proctoring monitor: lists enrolled candidates, current status (not started,
    in progress, submitted), time remaining, violation count, and last seen from heartbeat.
    """
    return get_live_exam_monitor(db=db, exam_id=exam_id)


# ---------------------------------------------------------------------------
# User Preferences (Any authenticated user)
# ---------------------------------------------------------------------------


@router.get("/preferences", response_model=UserPreferencesResponse)
def get_my_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPreferencesResponse:
    """Get current user workspace settings (e.g. theme, language)."""
    return get_user_preferences_service(db=db, user_id=current_user.id)


@router.put("/preferences", response_model=UserPreferencesResponse)
def update_my_preferences(
    payload: UserPreferencesUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserPreferencesResponse:
    """Update current user workspace settings (e.g. theme, language)."""
    return update_user_preferences_service(db=db, user_id=current_user.id, new_prefs=payload.preferences)


# ---------------------------------------------------------------------------
# Scratchpad Notes (Owner Only, not graded)
# ---------------------------------------------------------------------------


@router.get("/attempts/{attempt_id}/scratchpad", response_model=ScratchpadResponse)
@router.get("/student/attempts/{attempt_id}/scratchpad", response_model=ScratchpadResponse)
def get_scratchpad(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScratchpadResponse:
    """Get scratchpad rough work notes for an attempt. Owner only."""
    return get_scratchpad_service(db=db, attempt_id=attempt_id, current_user=current_user)


@router.put("/attempts/{attempt_id}/scratchpad", response_model=ScratchpadResponse)
@router.put("/student/attempts/{attempt_id}/scratchpad", response_model=ScratchpadResponse)
def save_scratchpad(
    attempt_id: int,
    payload: ScratchpadUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ScratchpadResponse:
    """Save scratchpad rough work notes for an attempt. Owner only, not part of grading."""
    return save_scratchpad_service(
        db=db,
        attempt_id=attempt_id,
        current_user=current_user,
        content=payload.content,
    )
