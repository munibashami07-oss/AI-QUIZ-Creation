"""
FastAPI application entry point.
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import admin, auth, examiner, health, role_examples, student

app = FastAPI(title=settings.APP_NAME)

# Serve uploaded profile pictures at /uploads/
uploads_dir = Path(__file__).resolve().parent.parent / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")

# Register routers
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(role_examples.router)
app.include_router(admin.router)
app.include_router(examiner.router)
app.include_router(student.router)
