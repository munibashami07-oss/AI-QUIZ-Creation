"""
FastAPI application entry point.
"""

from fastapi import FastAPI

from app.core.config import settings
from app.routers import health

app = FastAPI(title=settings.APP_NAME)

# Register routers
app.include_router(health.router)
