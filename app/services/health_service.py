"""
Service layer for checking application and PostgreSQL database health.
"""

from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.schemas.health import HealthResponse


def check_database_health(db: Session) -> HealthResponse:
    """Run a simple query against PostgreSQL and return the UTC server time."""
    db_utc_time = db.execute(text("SELECT NOW() AT TIME ZONE 'UTC'")).scalar_one()

    # Attach explicit UTC tzinfo if PostgreSQL returns a naive timestamp from AT TIME ZONE.
    if db_utc_time.tzinfo is None:
        db_utc_time = db_utc_time.replace(tzinfo=timezone.utc)

    return HealthResponse(
        status="ok",
        database="connected",
        utc_time=db_utc_time if isinstance(db_utc_time, datetime) else datetime.now(timezone.utc),
    )
