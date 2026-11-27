"""
Application configuration loaded from the .env file.
Never hardcode database credentials or secrets here.
"""

import os
from dotenv import load_dotenv
from sqlalchemy.engine import URL

# Load environment variables from the .env file in the project root
load_dotenv()


def _get_required_env(name: str) -> str:
    """Read a required environment variable or fail clearly if it is missing."""
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise RuntimeError(
            f"Missing required environment variable '{name}'. "
            "Make sure you copied .env.example to .env and filled in all values."
        )
    return value


class Settings:
    """Holds application and database settings from .env."""

    APP_NAME: str = os.getenv("APP_NAME", "Secure Examination Management System")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    DB_HOST: str = _get_required_env("DB_HOST")
    DB_PORT: int = int(_get_required_env("DB_PORT"))
    DB_NAME: str = _get_required_env("DB_NAME")
    DB_USER: str = _get_required_env("DB_USER")
    DB_PASSWORD: str = _get_required_env("DB_PASSWORD")

    @property
    def database_url(self) -> URL:
        """Build a safe SQLAlchemy PostgreSQL connection URL."""
        return URL.create(
            drivername="postgresql+psycopg2",
            username=self.DB_USER,
            password=self.DB_PASSWORD,
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
        )


settings = Settings()
