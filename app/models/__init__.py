"""
Import all SQLAlchemy models here so Alembic can discover them automatically.
"""

from app.models.user import User, UserRole

__all__ = ["User", "UserRole"]
