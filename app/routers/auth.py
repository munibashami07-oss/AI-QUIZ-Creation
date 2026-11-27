"""
Authentication router: login, heartbeat, logout, and current user profile.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import LoginSession, User
from app.schemas.auth import (
    HeartbeatResponse,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RegisterResponse,
    UserProfileResponse,
)
from app.services.auth import authenticate_user, get_current_session, get_current_user
from app.services.user_service import register_student

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    full_name: str = Form(...),
    email: str = Form(...),
    roll_number: str = Form(...),
    password: str = Form(...),
    phone: str | None = Form(None),
    role: str | None = Form(None),  # ignored to prevent privilege escalation
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> RegisterResponse:
    """Public self-registration for students with required photo (always student role, pending approval)."""
    photo_bytes = await photo.read()
    new_user = register_student(
        db=db,
        full_name=full_name,
        email=email,
        roll_number=roll_number,
        phone=phone,
        password=password,
        photo_bytes=photo_bytes,
    )
    return RegisterResponse(
        user_id=new_user.id,
        full_name=new_user.full_name,
        email=new_user.email,
        roll_number=new_user.roll_number or "",
        picture=new_user.picture or "",
        registration_status=new_user.registration_status,
    )


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> LoginResponse:
    """Authenticate a user with email or roll number and return a JWT token."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return authenticate_user(
        db=db,
        identifier=payload.identifier or "",
        password=payload.password,
        ip_address=client_ip,
        user_agent=user_agent,
    )


@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    """Return the authenticated user's profile."""
    return current_user


@router.post("/heartbeat", response_model=HeartbeatResponse)
def heartbeat(
    session: LoginSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> HeartbeatResponse:
    """Update last_seen for the current session."""
    session.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return HeartbeatResponse(last_seen_at=session.last_seen_at)


@router.post("/logout", response_model=LogoutResponse)
def logout(
    session: LoginSession = Depends(get_current_session),
    db: Session = Depends(get_db),
) -> LogoutResponse:
    """Mark the current session as logged out."""
    now = datetime.now(timezone.utc)
    session.is_revoked = True
    session.logged_out_at = now
    db.commit()
    return LogoutResponse()
