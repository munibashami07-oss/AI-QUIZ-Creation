"""
Application configuration loaded from the .env file.
Never hardcode database credentials or secrets here.

DATABASE_URL  — pooled connection string (used by the app / SQLAlchemy engine).
DIRECT_URL    — direct (non-pooled) connection string (used by Alembic migrations).

Both are read straight from the environment so they work with any provider
(local PostgreSQL, Neon, etc.).  The old DB_HOST / DB_* variables are kept as
a fallback: when DATABASE_URL is absent they are used to construct a URL the
same way as before.
"""

import os
from dotenv import load_dotenv
from sqlalchemy.engine import URL, make_url

# Load environment variables from the .env file in the project root
load_dotenv()


def _get_required_env(name: str) -> str:
    """Read a required environment variable or raise clearly if it is missing."""
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise RuntimeError(
            f"Missing required environment variable '{name}'. "
            "Make sure you copied .env.example to .env and filled in all values."
        )
    return value


def _build_url_from_parts() -> URL:
    """Build a SQLAlchemy URL from the individual DB_* env vars (local dev fallback)."""
    return URL.create(
        drivername="postgresql+psycopg2",
        username=_get_required_env("DB_USER"),
        password=_get_required_env("DB_PASSWORD"),
        host=_get_required_env("DB_HOST"),
        port=int(_get_required_env("DB_PORT")),
        database=_get_required_env("DB_NAME"),
    )


def _ensure_psycopg2_driver(raw_url: str) -> str:
    """
    Force the psycopg2 driver in a plain postgres:// or postgresql:// URL.
    Neon supplies URLs without a driver component; SQLAlchemy needs one.
    """
    if raw_url.startswith("postgres://"):
        raw_url = raw_url.replace("postgres://", "postgresql+psycopg2://", 1)
    elif raw_url.startswith("postgresql://") and "+psycopg2" not in raw_url:
        raw_url = raw_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return raw_url


class Settings:
    """Holds application and database settings from .env."""

    APP_NAME: str = os.getenv("APP_NAME", "Secure Examination Management System")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    JWT_SECRET_KEY: str = _get_required_env("JWT_SECRET_KEY")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(_get_required_env("JWT_EXPIRE_MINUTES"))

    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")
    PUBLIC_BASE_URL: str = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8000")

    @property
    def database_url(self) -> URL:
        """
        Pooled URL used by the SQLAlchemy engine (application traffic).

        Priority:
          1. DATABASE_URL env var  — set by Neon / any other provider
          2. Constructed from DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
        """
        raw = os.getenv("DATABASE_URL", "").strip()
        if raw:
            return make_url(_ensure_psycopg2_driver(raw))
        return _build_url_from_parts()

    @property
    def direct_url(self) -> URL:
        """
        Direct (non-pooled) URL used by Alembic migrations.

        Priority:
          1. DIRECT_URL env var  — set by Neon / any other provider
          2. Falls back to database_url (plain PostgreSQL has no distinction)
        """
        raw = os.getenv("DIRECT_URL", "").strip()
        if raw:
            return make_url(_ensure_psycopg2_driver(raw))
        return self.database_url


settings = Settings()
