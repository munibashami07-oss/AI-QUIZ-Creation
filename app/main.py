"""
FastAPI application entry point.
"""

import asyncio
from contextlib import asynccontextmanager
import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import SessionLocal
from app.routers import admin, auth, examiner, extras, health, reports, role_examples, student
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


app = FastAPI(
    title=settings.APP_NAME,
    description="Secure Examination Management System — API docs",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all origins so the frontend and Swagger UI work from any host.
# Tighten this list (replace "*") once you have a fixed frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", include_in_schema=False)
def root():
    """Redirect bare root URL to the interactive API docs."""
    return RedirectResponse(url="/docs")

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
app.include_router(reports.router)
app.include_router(extras.router)
