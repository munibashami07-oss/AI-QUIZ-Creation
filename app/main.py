"""
FastAPI application entry point.
"""

import asyncio
from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import SessionLocal
from app.routers import admin, auth, examiner, health, role_examples, student
from app.services.attempt_service import expire_overdue_attempts

logger = logging.getLogger("uvicorn.error")


async def auto_expire_background_runner():
    """Background task running every 30 seconds to clean up overdue unsubmitted attempts."""
    while True:
        try:
            await asyncio.sleep(30)
            db = SessionLocal()
            try:
                count = expire_overdue_attempts(db)
                if count > 0:
                    logger.info("Auto-expired %d overdue attempt(s)", count)
            finally:
                db.close()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error("Error in auto_expire background task: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: launch 30s background expiry task
    task = asyncio.create_task(auto_expire_background_runner())
    yield
    # Shutdown: cancel task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

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
