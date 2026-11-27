"""
Pydantic response schema for the health check endpoint.
"""

from datetime import datetime
from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response returned by GET /health."""

    status: str
    database: str
    utc_time: datetime
