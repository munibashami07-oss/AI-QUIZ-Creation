"""
Pydantic schemas for user management (admin CRUD).
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import UserRole


class UserCreateRequest(BaseModel):
    """Create a new user (admin only)."""

    full_name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    role: UserRole = UserRole.STUDENT
    roll_number: str | None = None
    phone: str | None = None
    is_active: bool = True


class UserUpdateRequest(BaseModel):
    """Update an existing user. Only provided fields are changed."""

    full_name: str | None = Field(None, min_length=1, max_length=120)
    email: str | None = Field(None, min_length=3, max_length=255)
    password: str | None = Field(None, min_length=6, max_length=128)
    role: UserRole | None = None
    roll_number: str | None = None
    phone: str | None = None
    is_active: bool | None = None


class UserResponse(BaseModel):
    """Public user data returned by admin CRUD endpoints. Never exposes password_hash."""

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
    updated_at: datetime


class UserListResponse(BaseModel):
    """Paginated list of users."""

    total: int
    users: list[UserResponse]


class PictureUploadResponse(BaseModel):
    """Response after a profile picture is uploaded."""

    picture: str
    message: str = "Profile picture updated."
