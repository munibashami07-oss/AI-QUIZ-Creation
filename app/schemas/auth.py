"""
Pydantic schemas for authentication, login sessions, user profiles, and role example endpoints.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, model_validator

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    """Accepts email or roll_number (via identifier, email, or roll_number) and password."""

    identifier: str | None = None
    email: str | None = None
    roll_number: str | None = None
    password: str

    @model_validator(mode="after")
    def ensure_login_identifier(self) -> "LoginRequest":
        """Ensure at least one login identifier was provided."""
        login_id = (self.identifier or self.email or self.roll_number or "").strip()
        if not login_id:
            raise ValueError("Provide email, roll_number, or identifier.")
        self.identifier = login_id
        return self


class LoginResponse(BaseModel):
    """JWT token and basic user identity returned after successful login."""

    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    role: UserRole
    name: str


class UserProfileResponse(BaseModel):
    """Current authenticated user's profile returned by GET /auth/me."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    role: UserRole
    roll_number: str | None = None
    phone: str | None = None
    picture: str | None = None
    is_active: bool
    registration_status: str = "approved"
    created_at: datetime


class RoleExampleResponse(BaseModel):
    """Response returned by role-protected example endpoints."""

    message: str
    user_id: int
    name: str
    role: UserRole


class LoginSessionResponse(BaseModel):
    """Details of a single login session."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    ip_address: str | None = None
    device: str | None = None
    os: str | None = None
    browser: str | None = None
    is_revoked: bool
    logged_out_at: datetime | None = None
    expires_at: datetime
    last_seen_at: datetime
    created_at: datetime


class LoginSessionWithUserResponse(LoginSessionResponse):
    """Login session with user name and role for the admin view."""

    user_name: str
    user_role: UserRole


class HeartbeatResponse(BaseModel):
    """Response after a heartbeat updates last_seen."""

    last_seen_at: datetime


class LogoutResponse(BaseModel):
    """Response after a successful logout."""

    message: str = "Logged out successfully."


class RegisterResponse(BaseModel):
    """Response after student self-registration."""

    message: str = "Registration submitted successfully. Your account is pending administrator approval."
    user_id: int
    full_name: str
    email: str
    roll_number: str
    picture: str
    registration_status: str

