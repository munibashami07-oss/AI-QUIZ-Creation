"""
User management service: CRUD, role changes, enable/disable, picture upload, audit logging.
"""

import io
from pathlib import Path
import uuid
from PIL import Image
from fastapi import HTTPException, status

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import User, UserRole
from app.models.extras import AuditLog
from app.services.auth import hash_password


UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_PICTURE_BYTES = 2 * 1024 * 1024  # 2 MB


def write_audit_log(
    db: Session,
    actor_id: int,
    action: str,
    entity_type: str,
    entity_id: int | str,
    metadata: dict | None = None,
) -> None:
    """Append a row to the audit_log table."""
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type="user",
            entity_id=str(entity_id),
            metadata_json=metadata,
        )
    )


def create_user(
    db: Session,
    actor_id: int,
    full_name: str,
    email: str,
    password: str,
    role: UserRole,
    roll_number: str | None = None,
    phone: str | None = None,
    is_active: bool = True,
) -> User:
    """Create a new user with a hashed password and log the action."""
    user = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(password),
        role=role,
        roll_number=roll_number,
        phone=phone,
        is_active=is_active,
    )
    db.add(user)
    db.flush()
    write_audit_log(db, actor_id, "user_created", "user", user.id, {"role": role.value})
    db.commit()
    db.refresh(user)
    return user


def list_users(
    db: Session,
    search: str | None = None,
    role_filter: UserRole | None = None,
    skip: int = 0,
    limit: int = 50,
) -> tuple[int, list[User]]:
    """List users with optional search (name, email, roll_number) and role filter."""
    query = select(User)
    count_query = select(func.count(User.id))

    if role_filter:
        query = query.where(User.role == role_filter)
        count_query = count_query.where(User.role == role_filter)

    if search:
        pattern = f"%{search}%"
        search_filter = or_(
            User.full_name.ilike(pattern),
            User.email.ilike(pattern),
            User.roll_number.ilike(pattern),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = db.scalar(count_query) or 0
    users = list(db.scalars(query.order_by(User.id).offset(skip).limit(limit)).all())
    return total, users


def get_user_by_id(db: Session, user_id: int) -> User | None:
    """Get a single user by primary key."""
    return db.get(User, user_id)


def update_user(
    db: Session,
    actor_id: int,
    target_user: User,
    full_name: str | None = None,
    email: str | None = None,
    password: str | None = None,
    role: UserRole | None = None,
    roll_number: str | None = ...,
    phone: str | None = ...,
    is_active: bool | None = None,
) -> User:
    """Update user fields, hash new password, and audit role/enable/disable changes."""
    if full_name is not None:
        target_user.full_name = full_name
    if email is not None:
        target_user.email = email
    if password is not None:
        target_user.password_hash = hash_password(password)

    if role is not None and role != target_user.role:
        old_role = target_user.role.value
        target_user.role = role
        write_audit_log(db, actor_id, "role_changed", "user", target_user.id, {"from": old_role, "to": role.value})

    if roll_number is not ...:
        target_user.roll_number = roll_number
    if phone is not ...:
        target_user.phone = phone

    if is_active is not None and is_active != target_user.is_active:
        target_user.is_active = is_active
        action = "user_enabled" if is_active else "user_disabled"
        write_audit_log(db, actor_id, action, "user", target_user.id)

    db.commit()
    db.refresh(target_user)
    return target_user


def delete_user(db: Session, actor_id: int, target_user: User) -> None:
    """Delete a user and audit the action."""
    write_audit_log(
        db, actor_id, "user_deleted", "user", target_user.id,
        {"email": target_user.email, "role": target_user.role.value},
    )
    db.delete(target_user)
    db.commit()


def validate_and_save_photo(file_bytes: bytes, filename_hint: str | None = None) -> str:
    """Validate that file_bytes is a real JPG or PNG image within 2 MB, then save to uploads/."""
    if len(file_bytes) > MAX_PICTURE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {MAX_PICTURE_BYTES // (1024 * 1024)} MB.",
        )

    try:
        image = Image.open(io.BytesIO(file_bytes))
        image.verify()
        img_format = (image.format or "").upper()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image file. The uploaded file is not a valid image.",
        )

    if img_format not in {"JPEG", "PNG"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only JPG and PNG images are allowed. Provided format: {img_format or 'unknown'}",
        )

    ext = ".jpg" if img_format == "JPEG" else ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = UPLOADS_DIR / filename
    filepath.write_bytes(file_bytes)
    return f"/uploads/{filename}"


def register_student(
    db: Session,
    full_name: str,
    email: str,
    roll_number: str,
    phone: str | None,
    password: str,
    photo_bytes: bytes,
) -> User:
    """Register a new student with pending approval and is_active = False."""
    full_name = full_name.strip()
    email = email.strip().lower()
    roll_number = roll_number.strip().upper()

    if not full_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Full name is required.")
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required.")
    if not roll_number:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Roll number is required.")
    if len(password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters long.")

    # Check duplicates
    if db.scalar(select(User).where(func.lower(User.email) == email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this email already exists.")
    if db.scalar(select(User).where(func.upper(User.roll_number) == roll_number)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A user with this roll number already exists.")

    photo_path = validate_and_save_photo(photo_bytes)

    user = User(
        full_name=full_name,
        email=email,
        password_hash=hash_password(password),
        role=UserRole.STUDENT,  # Always student, ignores client role
        roll_number=roll_number,
        phone=phone.strip() if phone else None,
        picture=photo_path,
        is_active=False,
        registration_status="pending",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Write audit log
    write_audit_log(
        db=db,
        actor_id=user.id,
        action="student_registered",
        entity_type="user",
        entity_id=user.id,
        metadata={"roll_number": roll_number, "status": "pending"},
    )
    db.commit()

    return user


def approve_registration(db: Session, admin_id: int, user_id: int) -> User:
    """Approve a pending student registration, activating the account."""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.registration_status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User is not in pending status (current: {user.registration_status}).")

    user.registration_status = "approved"
    user.is_active = True
    write_audit_log(db, admin_id, "registration_approved", "user", user.id, {"email": user.email, "roll_number": user.roll_number})
    db.commit()
    db.refresh(user)
    return user


def reject_registration(db: Session, admin_id: int, user_id: int, reason: str | None = None) -> User:
    """Reject a pending student registration."""
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    if user.registration_status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"User is not in pending status (current: {user.registration_status}).")

    user.registration_status = "rejected"
    user.is_active = False
    write_audit_log(db, admin_id, "registration_rejected", "user", user.id, {"email": user.email, "roll_number": user.roll_number, "reason": reason})
    db.commit()
    db.refresh(user)
    return user


def get_pending_registrations(db: Session) -> list[User]:
    """Retrieve all users waiting for approval."""
    return list(db.scalars(select(User).where(User.registration_status == "pending").order_by(User.created_at.desc())).all())

