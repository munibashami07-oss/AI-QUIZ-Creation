"""
Routers for Results, PDF Reports, Class Analytics, CSV Exports, and Public Verification.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User
from app.schemas.grading import (
    ExamStatsResponse,
    PublicVerificationResponse,
    PublishResultsRequest,
    PublishResultsResponse,
    StudentResultResponse,
)
from app.services.auth import get_current_user, require_role
from app.services.report_service import (
    export_exam_results_csv,
    generate_result_pdf,
    get_exam_class_stats,
    get_student_attempt_result,
    publish_or_unpublish_exam_results,
    verify_public_certificate,
)

router = APIRouter(tags=["Results, Reports & Analytics"])


# ---------------------------------------------------------------------------
# Class Statistics (Examiner / Admin)
# ---------------------------------------------------------------------------


@router.get("/exams/{exam_id}/stats", response_model=ExamStatsResponse)
def get_exam_statistics(
    exam_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> ExamStatsResponse:
    """Retrieve class average, highest, lowest, pass count, and score distribution
    using SQL aggregates (excluding sandbox and unsubmitted attempts).
    """
    return get_exam_class_stats(db, exam_id=exam_id)


# ---------------------------------------------------------------------------
# CSV Results Export (Examiner / Admin)
# ---------------------------------------------------------------------------


@router.get("/exams/{exam_id}/results.csv")
def get_exam_results_csv(
    exam_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_role("admin", "examiner")),
) -> Response:
    """Export exam results as RFC 4180 CSV with sanitized formula cells."""
    csv_text = export_exam_results_csv(db, exam_id=exam_id)
    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="exam_{exam_id}_results.csv"'},
    )


# ---------------------------------------------------------------------------
# Candidate Result Scorecard
# ---------------------------------------------------------------------------


@router.get("/results/{attempt_id}", response_model=StudentResultResponse)
def get_attempt_result_view(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StudentResultResponse:
    """View result scorecard with score, total_marks, percentage, per-question marks,
    verdicts, and class statistics.
    Students can only see their own results after publishing (403 otherwise).
    """
    return get_student_attempt_result(db, attempt_id=attempt_id, current_user=current_user)


# ---------------------------------------------------------------------------
# PDF Report Download
# ---------------------------------------------------------------------------


@router.get("/results/{attempt_id}/pdf")
def download_result_pdf(
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    """Download official examination transcript PDF report with QR code and verification ID.
    Students can only download their own PDF after publishing; examiners/admins can download any.
    """
    pdf_bytes = generate_result_pdf(db, attempt_id=attempt_id, current_user=current_user)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="result_report_attempt_{attempt_id}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Public Verification (No Login Required)
# ---------------------------------------------------------------------------


@router.get("/verify/{verification_id}", response_model=PublicVerificationResponse)
def verify_certificate(
    verification_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> PublicVerificationResponse:
    """Public verification endpoint. Needs no login.
    Returns minimal verification information only: valid/invalid, student name,
    exam title, score / total marks, and date.
    Never exposes roll number, phone, email, or photo.
    Returns generic response for unknown IDs. Rate-limited.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    return verify_public_certificate(db, verification_id=verification_id, client_ip=client_ip)
