"""
Example role-protected endpoints to verify admin, examiner, and student RBAC checks.
"""

from fastapi import APIRouter, Depends

from app.models import User
from app.schemas.auth import RoleExampleResponse
from app.services.auth import require_role

router = APIRouter(prefix="/examples", tags=["Role Examples"])


@router.get("/admin", response_model=RoleExampleResponse)
def admin_only_example(
    current_user: User = Depends(require_role("admin")),
) -> RoleExampleResponse:
    """Accessible only to users with the admin role."""
    return RoleExampleResponse(
        message="Admin access granted.",
        user_id=current_user.id,
        name=current_user.full_name,
        role=current_user.role,
    )


@router.get("/examiner", response_model=RoleExampleResponse)
def examiner_only_example(
    current_user: User = Depends(require_role("examiner")),
) -> RoleExampleResponse:
    """Accessible only to users with the examiner role."""
    return RoleExampleResponse(
        message="Examiner access granted.",
        user_id=current_user.id,
        name=current_user.full_name,
        role=current_user.role,
    )


@router.get("/student", response_model=RoleExampleResponse)
def student_only_example(
    current_user: User = Depends(require_role("student")),
) -> RoleExampleResponse:
    """Accessible only to users with the student role."""
    return RoleExampleResponse(
        message="Student access granted.",
        user_id=current_user.id,
        name=current_user.full_name,
        role=current_user.role,
    )
