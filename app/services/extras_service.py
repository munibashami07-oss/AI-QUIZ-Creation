"""
Service handling Announcements, Live Exam Monitoring, Bulk Student Import,
User Preferences, and Scratchpad Rough Work Notes.
"""

import csv
from datetime import datetime, timezone
import io
import re
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.attempt import Answer, Attempt
from app.models.enums import UserRole
from app.models.exam import Exam
from app.models.extras import Announcement, ScratchpadNote, UserPreference
from app.models.user import Enrollment, LoginSession, User
from app.schemas.extras import (
    AnnouncementCreateRequest,
    BulkImportResponse,
    ExamMonitorResponse,
    ImportUserRowError,
    ImportUserSuccessItem,
    ScratchpadResponse,
    StudentMonitorItem,
    UserPreferencesResponse,
)
from app.services.audit_service import log_audit_event
from app.services.user_service import hash_password

EMAIL_REGEX = re.compile(r"^[\w\.-]+@[\w\.-]+\.\w+$")


# ---------------------------------------------------------------------------
# Announcements
# ---------------------------------------------------------------------------


def create_announcement(
    db: Session,
    creator: User,
    payload: AnnouncementCreateRequest,
) -> Announcement:
    """Create an announcement. If exam_id is provided, checks exam exists. Null means global."""
    if payload.exam_id is not None:
        exam = db.get(Exam, payload.exam_id)
        if not exam:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified exam not found.")

    ann = Announcement(
        title=payload.title.strip(),
        message=payload.message.strip(),
        exam_id=payload.exam_id,
        created_by=creator.id,
    )
    db.add(ann)
    db.flush()

    log_audit_event(
        db,
        action="announcement_create",
        entity_type="announcement",
        actor_id=creator.id,
        entity_id=ann.id,
        metadata={"exam_id": payload.exam_id, "title": ann.title},
    )
    db.commit()
    db.refresh(ann)
    return ann


def get_announcements_for_user(
    db: Session,
    current_user: User,
    exam_id: int | None = None,
) -> list[Announcement]:
    """Retrieve announcements:
    - Admins/examiners see all announcements (or filtered by exam_id).
    - Students see announcements for their enrolled exams plus global ones (exam_id IS NULL), newest first.
    """
    query = select(Announcement)

    if current_user.role in (UserRole.ADMIN, UserRole.EXAMINER):
        if exam_id is not None:
            query = query.where(Announcement.exam_id == exam_id)
    else:
        # Student: enrolled exams + global
        enrolled_ids = list(
            db.scalars(
                select(Enrollment.exam_id).where(Enrollment.student_id == current_user.id)
            ).all()
        )
        if enrolled_ids:
            query = query.where(
                or_(
                    Announcement.exam_id.is_(None),
                    Announcement.exam_id.in_(enrolled_ids),
                )
            )
        else:
            query = query.where(Announcement.exam_id.is_(None))

    return list(db.scalars(query.order_by(Announcement.created_at.desc(), Announcement.id.desc())).all())


def delete_announcement(db: Session, announcement_id: int, current_user: User) -> None:
    """Delete an announcement (admin or creator only)."""
    ann = db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found.")

    if current_user.role != UserRole.ADMIN and ann.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only delete announcements you created.",
        )

    log_audit_event(
        db,
        action="announcement_delete",
        entity_type="announcement",
        actor_id=current_user.id,
        entity_id=ann.id,
    )
    db.delete(ann)
    db.commit()


# ---------------------------------------------------------------------------
# Live Exam Monitoring
# ---------------------------------------------------------------------------


def get_live_exam_monitor(db: Session, exam_id: int) -> ExamMonitorResponse:
    """Live proctoring monitor: lists enrolled candidates with their status,
    time remaining, violation count, and last seen timestamp from heartbeat.
    """
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    now = datetime.now(timezone.utc)

    # Get all enrolled students
    students = list(
        db.scalars(
            select(User)
            .join(Enrollment, Enrollment.student_id == User.id)
            .where(Enrollment.exam_id == exam_id)
            .order_by(User.roll_number.asc().nullslast(), User.full_name.asc())
        ).all()
    )

    items: list[StudentMonitorItem] = []
    for s in students:
        # Get attempt for this exam
        attempt = db.scalar(
            select(Attempt)
            .where(
                Attempt.exam_id == exam_id,
                Attempt.student_id == s.id,
                Attempt.is_sandbox == False,
            )
            .order_by(Attempt.id.desc())
        )

        # Calculate status and time remaining
        if not attempt:
            att_status = "not_started"
            rem_sec = exam.duration_minutes * 60
            v_count = 0
            att_id = None
            last_answer_at = None
        elif attempt.submitted_at is not None:
            att_status = "submitted"
            rem_sec = 0
            v_count = attempt.violation_count
            att_id = attempt.id
            last_answer_at = attempt.submitted_at
        else:
            if now > attempt.server_deadline:
                att_status = "submitted"
                rem_sec = 0
            else:
                att_status = "in_progress"
                rem_sec = max(0, int((attempt.server_deadline - now).total_seconds()))
            v_count = attempt.violation_count
            att_id = attempt.id

            # Check latest answer update
            last_ans = db.scalar(
                select(Answer.updated_at)
                .where(Answer.attempt_id == attempt.id)
                .order_by(Answer.updated_at.desc())
            )
            last_answer_at = last_ans

        # Fetch last seen from login session heartbeat
        latest_session = db.scalar(
            select(LoginSession.last_seen_at)
            .where(
                LoginSession.user_id == s.id,
                LoginSession.is_revoked == False,
            )
            .order_by(LoginSession.last_seen_at.desc())
        )

        # Most recent timestamp between heartbeat and answer activity
        candidate_last_seen = latest_session
        if last_answer_at and (not candidate_last_seen or last_answer_at > candidate_last_seen):
            candidate_last_seen = last_answer_at

        items.append(
            StudentMonitorItem(
                student_id=s.id,
                full_name=s.full_name,
                roll_number=s.roll_number,
                status=att_status,
                time_remaining_seconds=rem_sec,
                violation_count=v_count,
                last_seen=candidate_last_seen,
                attempt_id=att_id,
            )
        )

    return ExamMonitorResponse(
        exam_id=exam.id,
        exam_title=exam.title,
        total_enrolled=len(students),
        students=items,
    )


# ---------------------------------------------------------------------------
# Bulk Student Import (CSV)
# ---------------------------------------------------------------------------


def bulk_import_students(db: Session, admin_id: int, csv_content: str) -> BulkImportResponse:
    """Validates and imports students from a CSV file (name, email, roll number, phone).
    Returns per-row validation errors. Valid rows are committed; invalid ones are reported.
    Never crashes on invalid input or bad files.
    """
    try:
        reader = csv.reader(io.StringIO(csv_content.strip()))
        rows = list(reader)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to parse CSV data: {exc}",
        )

    if not rows:
        return BulkImportResponse(
            total_rows=0,
            imported_count=0,
            failed_count=0,
            imported=[],
            errors=[],
        )

    header = [h.strip().lower().replace("_", "").replace(" ", "") for h in rows[0]]
    # Map header indices
    col_map = {"name": -1, "email": -1, "rollnumber": -1, "phone": -1}
    for idx, col in enumerate(header):
        if col in ("name", "fullname"):
            col_map["name"] = idx
        elif col in ("email", "emailaddress"):
            col_map["email"] = idx
        elif col in ("rollnumber", "rollno", "roll"):
            col_map["rollnumber"] = idx
        elif col in ("phone", "phonenumber", "mobile"):
            col_map["phone"] = idx

    # If missing required name or email column in header
    if col_map["name"] == -1 or col_map["email"] == -1:
        # Fallback to positional: col 0 = name, col 1 = email, col 2 = roll, col 3 = phone
        col_map = {"name": 0, "email": 1, "rollnumber": 2, "phone": 3}
        data_rows = rows  # header was actually data
    else:
        data_rows = rows[1:]

    existing_emails = set(db.scalars(select(func.lower(User.email))).all())
    existing_rolls = set(
        db.scalars(select(func.upper(User.roll_number)).where(User.roll_number.is_not(None))).all()
    )

    seen_emails_in_csv: set[str] = set()
    seen_rolls_in_csv: set[str] = set()

    imported_list: list[ImportUserSuccessItem] = []
    error_list: list[ImportUserRowError] = []

    default_pw_hash = hash_password("Student@123")

    for row_idx, row in enumerate(data_rows, start=1):
        if not row or not any(c.strip() for c in row):
            continue

        row_errors: list[str] = []

        # Extract values
        name = row[col_map["name"]].strip() if len(row) > col_map["name"] else ""
        email = row[col_map["email"]].strip().lower() if len(row) > col_map["email"] else ""
        roll = (
            row[col_map["rollnumber"]].strip().upper()
            if col_map["rollnumber"] != -1 and len(row) > col_map["rollnumber"]
            else None
        )
        phone = (
            row[col_map["phone"]].strip()
            if col_map["phone"] != -1 and len(row) > col_map["phone"]
            else None
        )

        row_data = {"name": name, "email": email, "roll_number": roll, "phone": phone}

        # 1. Required fields
        if not name:
            row_errors.append("Student name is required.")
        if not email:
            row_errors.append("Email address is required.")
        elif not EMAIL_REGEX.match(email):
            row_errors.append(f"Invalid email format: '{email}'.")

        # 2. Duplicate email check
        if email:
            if email in seen_emails_in_csv:
                row_errors.append(f"Duplicate email in CSV: '{email}'.")
            elif email in existing_emails:
                row_errors.append(f"Email already registered in system: '{email}'.")

        # 3. Duplicate roll number check
        if roll:
            if roll in seen_rolls_in_csv:
                row_errors.append(f"Duplicate roll number in CSV: '{roll}'.")
            elif roll in existing_rolls:
                row_errors.append(f"Roll number already registered: '{roll}'.")

        if row_errors:
            error_list.append(ImportUserRowError(row=row_idx, data=row_data, errors=row_errors))
            continue

        # Valid row -> prepare to add
        seen_emails_in_csv.add(email)
        existing_emails.add(email)
        if roll:
            seen_rolls_in_csv.add(roll)
            existing_rolls.add(roll)

        new_student = User(
            full_name=name,
            email=email,
            password_hash=default_pw_hash,
            role=UserRole.STUDENT,
            roll_number=roll,
            phone=phone,
            is_active=True,
            registration_status="approved",
        )
        db.add(new_student)
        db.flush()

        imported_list.append(
            ImportUserSuccessItem(
                id=new_student.id,
                name=new_student.full_name,
                email=new_student.email,
                roll_number=new_student.roll_number,
                phone=new_student.phone,
            )
        )

    db.commit()

    if imported_list:
        log_audit_event(
            db,
            action="bulk_import_students",
            entity_type="user",
            actor_id=admin_id,
            metadata={"imported_count": len(imported_list), "failed_count": len(error_list)},
        )

    return BulkImportResponse(
        total_rows=len(data_rows),
        imported_count=len(imported_list),
        failed_count=len(error_list),
        imported=imported_list,
        errors=error_list,
    )


# ---------------------------------------------------------------------------
# User Preferences
# ---------------------------------------------------------------------------


def get_user_preferences_service(db: Session, user_id: int) -> UserPreferencesResponse:
    """Retrieve saved preferences (e.g. theme, language) for a user."""
    pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    return UserPreferencesResponse(
        user_id=user_id,
        preferences=pref.preferences if pref else {},
    )


def update_user_preferences_service(
    db: Session,
    user_id: int,
    new_prefs: dict[str, Any],
) -> UserPreferencesResponse:
    """Merge and save preferences for a user."""
    pref = db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    if not pref:
        pref = UserPreference(user_id=user_id, preferences=new_prefs)
        db.add(pref)
    else:
        merged = dict(pref.preferences or {})
        merged.update(new_prefs)
        pref.preferences = merged

    db.commit()
    db.refresh(pref)
    return UserPreferencesResponse(user_id=user_id, preferences=pref.preferences)


# ---------------------------------------------------------------------------
# Scratchpad Notes (Owner Only)
# ---------------------------------------------------------------------------


def get_scratchpad_service(
    db: Session,
    attempt_id: int,
    current_user: User,
) -> ScratchpadResponse:
    """Retrieve scratchpad rough work for an attempt. Owner only."""
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only view rough-work notes for your own attempts.",
        )

    note = db.scalar(select(ScratchpadNote).where(ScratchpadNote.attempt_id == attempt_id))
    return ScratchpadResponse(
        attempt_id=attempt_id,
        content=note.content if note else "",
        updated_at=note.updated_at if note else attempt.created_at,
    )


def save_scratchpad_service(
    db: Session,
    attempt_id: int,
    current_user: User,
    content: str,
) -> ScratchpadResponse:
    """Update rough work scratchpad for an attempt. Owner only, not part of grading."""
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only edit rough-work notes for your own attempts.",
        )

    now = datetime.now(timezone.utc)
    note = db.scalar(select(ScratchpadNote).where(ScratchpadNote.attempt_id == attempt_id))
    if not note:
        note = ScratchpadNote(attempt_id=attempt_id, content=content, updated_at=now)
        db.add(note)
    else:
        note.content = content
        note.updated_at = now

    db.commit()
    db.refresh(note)
    return ScratchpadResponse(
        attempt_id=attempt_id,
        content=note.content,
        updated_at=note.updated_at,
    )
