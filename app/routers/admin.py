"""
Admin-only router for login session views and user management CRUD.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import LoginSession, User, UserRole
from app.schemas.auth import LoginSessionWithUserResponse
from app.schemas.extras import AuditLogListResponse, BulkImportResponse
from app.schemas.user import (
    PictureUploadResponse,
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.audit_service import list_audit_logs
from app.services.auth import get_current_user, require_role
from app.services.extras_service import bulk_import_students
from app.services.user_service import (
    ALLOWED_CONTENT_TYPES,
    MAX_PICTURE_BYTES,
    approve_registration,
    create_user,
    delete_user,
    get_pending_registrations,
    get_user_by_id,
    list_users,
    reject_registration,
    update_user,
    validate_and_save_photo,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ---------------------------------------------------------------------------
# Login session views (admin only)
# ---------------------------------------------------------------------------


@router.get("/logins/current", response_model=list[LoginSessionWithUserResponse])
def get_current_logins(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> list[LoginSessionWithUserResponse]:
    """List currently active sessions (last_seen within 2 minutes, not logged out)."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=2)
    sessions = db.execute(
        select(LoginSession, User.full_name, User.role)
        .join(User, LoginSession.user_id == User.id)
        .where(
            LoginSession.last_seen_at >= cutoff,
            LoginSession.logged_out_at.is_(None),
            LoginSession.is_revoked == False,
            LoginSession.expires_at > datetime.now(timezone.utc),
        )
        .order_by(LoginSession.last_seen_at.desc())
    ).all()

    return [
        LoginSessionWithUserResponse(
            id=s.id,
            user_id=s.user_id,
            ip_address=s.ip_address,
            device=s.device,
            os=s.os,
            browser=s.browser,
            is_revoked=s.is_revoked,
            logged_out_at=s.logged_out_at,
            expires_at=s.expires_at,
            last_seen_at=s.last_seen_at,
            created_at=s.created_at,
            user_name=name,
            user_role=role,
        )
        for s, name, role in sessions
    ]


@router.get("/logins", response_model=list[LoginSessionWithUserResponse])
def get_all_logins(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
    skip: int = 0,
    limit: int = 50,
) -> list[LoginSessionWithUserResponse]:
    """List all login sessions (newest first) with user name and role."""
    sessions = db.execute(
        select(LoginSession, User.full_name, User.role)
        .join(User, LoginSession.user_id == User.id)
        .order_by(LoginSession.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return [
        LoginSessionWithUserResponse(
            id=s.id,
            user_id=s.user_id,
            ip_address=s.ip_address,
            device=s.device,
            os=s.os,
            browser=s.browser,
            is_revoked=s.is_revoked,
            logged_out_at=s.logged_out_at,
            expires_at=s.expires_at,
            last_seen_at=s.last_seen_at,
            created_at=s.created_at,
            user_name=name,
            user_role=role,
        )
        for s, name, role in sessions
    ]


# ---------------------------------------------------------------------------
# User management CRUD (admin only)
# ---------------------------------------------------------------------------


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> User:
    """Create a new user (admin only)."""
    # Check for duplicate email
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")
    if payload.roll_number:
        dup_roll = db.scalar(select(User).where(User.roll_number == payload.roll_number))
        if dup_roll:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Roll number already taken.")

    return create_user(
        db=db,
        actor_id=admin.id,
        full_name=payload.full_name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
        roll_number=payload.roll_number,
        phone=payload.phone,
        is_active=payload.is_active,
    )


@router.get("/users", response_model=UserListResponse)
def admin_list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
    search: str | None = None,
    role: UserRole | None = None,
    skip: int = 0,
    limit: int = 50,
) -> UserListResponse:
    """List users with optional search and role filter (admin only)."""
    total, users = list_users(db, search=search, role_filter=role, skip=skip, limit=limit)
    return UserListResponse(total=total, users=[UserResponse.model_validate(u) for u in users])


@router.get("/users/{user_id}", response_model=UserResponse)
def admin_get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> User:
    """Get a user by ID (admin only)."""
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
def admin_update_user(
    user_id: int,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> User:
    """Update user fields including role and is_active (admin only)."""
    target = get_user_by_id(db, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    # Check duplicate email if changing it
    if payload.email and payload.email != target.email:
        existing = db.scalar(select(User).where(User.email == payload.email))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    # Check duplicate roll_number if changing it
    if payload.roll_number is not None and payload.roll_number != target.roll_number:
        dup = db.scalar(select(User).where(User.roll_number == payload.roll_number))
        if dup:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Roll number already taken.")

    # Build kwargs, using ... sentinel to distinguish "not provided" from None
    kwargs: dict = {}
    if payload.full_name is not None:
        kwargs["full_name"] = payload.full_name
    if payload.email is not None:
        kwargs["email"] = payload.email
    if payload.password is not None:
        kwargs["password"] = payload.password
    if payload.role is not None:
        kwargs["role"] = payload.role
    if payload.is_active is not None:
        kwargs["is_active"] = payload.is_active

    # roll_number and phone: include only if the field was set in the JSON body
    data = payload.model_dump(exclude_unset=True)
    if "roll_number" in data:
        kwargs["roll_number"] = payload.roll_number
    if "phone" in data:
        kwargs["phone"] = payload.phone

    return update_user(db=db, actor_id=admin.id, target_user=target, **kwargs)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> None:
    """Delete a user (admin only)."""
    target = get_user_by_id(db, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if target.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete yourself.")
    delete_user(db=db, actor_id=admin.id, target_user=target)


# ---------------------------------------------------------------------------
# Profile picture upload (any logged-in user for their own picture)
# ---------------------------------------------------------------------------


@router.post("/users/{user_id}/picture", response_model=PictureUploadResponse)
async def upload_picture(
    user_id: int,
    file: UploadFile,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PictureUploadResponse:
    """Upload a profile picture (images only, max 2 MB). Any user can update their own."""
    # Admins can update anyone's; non-admins can only update their own
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only update your own picture.")

    target = get_user_by_id(db, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only images are allowed ({', '.join(ALLOWED_CONTENT_TYPES)}).",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_PICTURE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_PICTURE_BYTES // (1024 * 1024)} MB.",
        )

    path = validate_and_save_photo(file_bytes, file.filename)
    # Remove old picture file if it exists
    from pathlib import Path as FilePath
    from app.services.user_service import UPLOADS_DIR
    if target.picture:
        old_path = UPLOADS_DIR / FilePath(target.picture).name
        if old_path.exists():
            old_path.unlink(missing_ok=True)
    target.picture = path
    db.commit()
    db.refresh(target)
    return PictureUploadResponse(picture=path)


# ---------------------------------------------------------------------------
# Student registration management (admin only)
# ---------------------------------------------------------------------------


@router.get("/registrations/pending", response_model=list[UserResponse])
def list_pending_registrations(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> list[User]:
    """Retrieve all student self-registrations waiting for approval."""
    return get_pending_registrations(db)


@router.post("/registrations/{user_id}/approve", response_model=UserResponse)
def approve_student_registration(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> User:
    """Approve a student registration (sets is_active=True, registration_status='approved', writes audit log)."""
    return approve_registration(db, admin_id=admin.id, user_id=user_id)


@router.post("/registrations/{user_id}/reject", response_model=UserResponse)
def reject_student_registration(
    user_id: int,
    reason: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> User:
    """Reject a student registration (sets is_active=False, registration_status='rejected', writes audit log)."""
    return reject_registration(db, admin_id=admin.id, user_id=user_id, reason=reason)


# ---------------------------------------------------------------------------
# Bulk Student Import & Audit Trail
# ---------------------------------------------------------------------------


@router.post("/users/import", response_model=BulkImportResponse)
async def import_students_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> BulkImportResponse:
    """Bulk import students via CSV (name, email, roll number, phone).
    Validates every row and reports per-row errors. Valid rows are imported.
    """
    content = await file.read()
    csv_text = content.decode("utf-8-sig", errors="replace")
    return bulk_import_students(db=db, admin_id=admin.id, csv_content=csv_text)


@router.get("/audit", response_model=AuditLogListResponse)
def get_audit_trail(
    action: str | None = None,
    entity_type: str | None = None,
    actor_id: int | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> AuditLogListResponse:
    """Retrieve platform audit logs with optional filters (admin only)."""
    total, logs = list_audit_logs(
        db=db,
        action=action,
        entity_type=entity_type,
        actor_id=actor_id,
        skip=skip,
        limit=limit,
    )
    return AuditLogListResponse(total=total, entries=logs)


