"""
Authentication, JWT creation/verification, RBAC dependencies, and student ownership helpers.
"""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
import uuid

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from jwt import InvalidTokenError
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload
from user_agents import parse as parse_ua

from app.core.config import settings
from app.core.database import get_db
from app.models import Answer, Attempt, LoginSession, Result, User, UserRole
from app.schemas.auth import LoginResponse

# Enables the "Authorize" (Bearer token) button in FastAPI Swagger /docs.
bearer_scheme = HTTPBearer(auto_error=False)


def verify_password(plain_password: str, password_hash: str) -> bool:
    """Verify a plaintext password against its stored bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode("utf-8"), password_hash.encode("utf-8"))


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def parse_user_agent(raw_ua: str | None) -> dict[str, str | None]:
    """Parse a User-Agent string into device, OS, and browser using user-agents library."""
    if not raw_ua:
        return {"device": None, "os": None, "browser": None}
    ua = parse_ua(raw_ua)
    device = str(ua.device.family) if ua.device.family else None
    os_name = f"{ua.os.family} {ua.os.version_string}".strip() if ua.os.family else None
    browser = f"{ua.browser.family} {ua.browser.version_string}".strip() if ua.browser.family else None
    return {"device": device, "os": os_name, "browser": browser}


def create_access_token(user: User, session_id: int, token_jti: str) -> tuple[str, datetime]:
    """Create a signed JWT access token. Embeds session_id for heartbeat/logout."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": str(user.id),
        "role": user.role.value,
        "jti": token_jti,
        "sid": session_id,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def authenticate_user(
    db: Session,
    identifier: str,
    password: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> LoginResponse:
    """Authenticate by email or roll_number, enforce is_active, parse UA, and record a login session."""
    normalized = identifier.strip().lower()
    user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.email) == normalized,
                func.lower(User.roll_number) == normalized,
            )
        )
    )

    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled.",
        )

    token_jti = uuid.uuid4().hex
    ua_info = parse_user_agent(user_agent)

    session = LoginSession(
        user_id=user.id,
        token_jti=token_jti,
        ip_address=ip_address,
        user_agent=user_agent,
        device=ua_info["device"],
        os=ua_info["os"],
        browser=ua_info["browser"],
        is_revoked=False,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    )
    db.add(session)
    db.flush()  # get session.id

    access_token, expires_at = create_access_token(user, session.id, token_jti)
    # Update expires_at to match the token exactly
    session.expires_at = expires_at
    db.commit()

    return LoginResponse(
        access_token=access_token,
        expires_at=expires_at,
        role=user.role,
        name=user.full_name,
    )


def _decode_token(credentials: HTTPAuthorizationCredentials | None) -> dict:
    """Decode a JWT token and return the payload dict. Raises 401 on failure."""
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise auth_error
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except (InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise auth_error from exc


def _get_valid_session(db: Session, payload: dict, user_id: int) -> LoginSession:
    """Load and validate the login session from the JWT payload. Raises 401 if invalid."""
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_jti = payload.get("jti")
    if not token_jti:
        raise auth_error

    session = db.scalar(
        select(LoginSession).where(
            LoginSession.token_jti == token_jti,
            LoginSession.user_id == user_id,
        )
    )
    now = datetime.now(timezone.utc)
    if session is None or session.is_revoked or session.logged_out_at is not None or session.expires_at <= now:
        raise auth_error

    return session


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Validate Bearer JWT, check active session and user status, and return the User."""
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = _decode_token(credentials)

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise auth_error from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise auth_error

    _get_valid_session(db, payload, user_id)
    return user


def get_current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> LoginSession:
    """Return the current LoginSession (for heartbeat/logout). Also validates user is active."""
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = _decode_token(credentials)

    try:
        user_id = int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise auth_error from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise auth_error

    return _get_valid_session(db, payload, user_id)


def require_role(*allowed_roles: UserRole | str) -> Callable[[User], User]:
    """Dependency factory enforcing that current_user holds one of allowed_roles."""
    normalized_roles = {
        role if isinstance(role, UserRole) else UserRole(role)
        for role in allowed_roles
    }

    def _role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in normalized_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )
        return current_user

    return _role_checker


def ensure_student_ownership(current_user: User, owner_student_id: int) -> None:
    """Allow admins/examiners, but restrict students to records matching their own user id."""
    if current_user.role == UserRole.STUDENT and current_user.id != owner_student_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own records.",
        )


def get_owned_attempt(db: Session, attempt_id: int, current_user: User) -> Attempt:
    """Load an Attempt and ensure a student can only access their own attempt."""
    attempt = db.get(Attempt, attempt_id)
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")
    ensure_student_ownership(current_user, attempt.student_id)
    return attempt


def get_owned_answer(db: Session, answer_id: int, current_user: User) -> Answer:
    """Load an Answer and ensure a student can only access answers from their own attempt."""
    answer = db.scalar(
        select(Answer).options(joinedload(Answer.attempt)).where(Answer.id == answer_id)
    )
    if answer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer not found.")
    ensure_student_ownership(current_user, answer.attempt.student_id)
    return answer


def get_owned_result(db: Session, result_id: int, current_user: User) -> Result:
    """Load a Result and ensure a student can only access their own published result."""
    result = db.get(Result, result_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found.")
    ensure_student_ownership(current_user, result.student_id)
    if current_user.role == UserRole.STUDENT and not result.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Result has not been published yet.",
        )
    return result
