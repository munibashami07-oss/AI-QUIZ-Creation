"""
Service for examination results, class analytics, PDF reports with QR codes,
CSV export, and public verification.
"""

from collections import defaultdict
import csv
from datetime import datetime, timezone
from decimal import Decimal
import io
from pathlib import Path
import secrets
import time
from typing import Any

from fastapi import HTTPException, status
from PIL import Image as PILImage
import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.attempt import Answer, Attempt, Result
from app.models.enums import UserRole
from app.models.exam import Exam, Question
from app.models.extras import Report
from app.models.user import User
from app.schemas.grading import (
    ExamStatsResponse,
    PublicVerificationResponse,
    PublishResultsResponse,
    QuestionResultDetail,
    StudentResultResponse,
)

# In-memory sliding window rate limiter for public verification: 60 req / min per IP
_ip_rate_limits: dict[str, list[float]] = defaultdict(list)


def check_verification_rate_limit(client_ip: str, limit: int = 60, window_secs: int = 60) -> None:
    """Lightweight in-memory rate limiter for public report verification."""
    now = time.time()
    valid_window = [t for t in _ip_rate_limits[client_ip] if now - t < window_secs]
    if len(valid_window) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests. Please try again later.",
        )
    valid_window.append(now)
    _ip_rate_limits[client_ip] = valid_window


# ---------------------------------------------------------------------------
# Result Publishing & Unpublishing
# ---------------------------------------------------------------------------


def publish_or_unpublish_exam_results(
    db: Session,
    exam_id: int,
    examiner_id: int,
    publish: bool = True,
) -> PublishResultsResponse:
    """Publish or unpublish exam results.
    Publishing is refused if any submitted attempt still has ungraded short answers.
    """
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    now = datetime.now(timezone.utc)

    if publish:
        # Check if any submitted attempt has ungraded answers
        ungraded_answers = db.scalar(
            select(func.count(Answer.id))
            .join(Attempt, Answer.attempt_id == Attempt.id)
            .where(
                Attempt.exam_id == exam_id,
                Attempt.submitted_at.is_not(None),
                Attempt.is_sandbox == False,
                (
                    (Answer.status == "needs_review")
                    | (Answer.marks_awarded.is_(None))
                    | (Answer.status != "graded")
                ),
            )
        )
        if ungraded_answers and ungraded_answers > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot publish results: {ungraded_answers} submitted answer(s) "
                    "still have ungraded short answers requiring examiner review."
                ),
            )

    results = db.scalars(select(Result).where(Result.exam_id == exam_id)).all()
    count = 0
    for res in results:
        res.is_published = publish
        if publish:
            res.published_by = examiner_id
            res.published_at = now
        count += 1

    db.commit()

    from app.services.audit_service import log_audit_event
    action_str = "published" if publish else "unpublished"
    log_audit_event(
        db,
        action=f"results_{action_str}",
        entity_type="exam",
        actor_id=examiner_id,
        entity_id=exam_id,
        metadata={"published": publish, "result_count": count},
    )
    db.commit()

    return PublishResultsResponse(
        exam_id=exam_id,
        published_count=count,
        is_published=publish,
        message=f"Successfully {action_str} {count} result(s) for exam '{exam.title}'.",
    )


# ---------------------------------------------------------------------------
# Class Statistics (SQL Aggregates)
# ---------------------------------------------------------------------------


def get_exam_class_stats(db: Session, exam_id: int) -> ExamStatsResponse:
    """Computes class statistics (average, highest, lowest, pass count, score distribution)
    using SQL aggregates. Excludes sandbox attempts and unsubmitted attempts.
    """
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    stats_stmt = (
        select(
            func.count(Result.id).label("total_attempts"),
            func.coalesce(func.avg(Result.total_score), Decimal("0.00")).label("class_avg"),
            func.coalesce(func.max(Result.total_score), Decimal("0.00")).label("highest"),
            func.coalesce(func.min(Result.total_score), Decimal("0.00")).label("lowest"),
            func.coalesce(
                func.sum(
                    case(
                        (Result.total_score >= Result.max_score * Decimal("0.5"), 1),
                        else_=0,
                    )
                ),
                0,
            ).label("pass_count"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            Result.max_score > 0,
                            case(
                                (((Result.total_score / Result.max_score) * 100) < 20, 1),
                                else_=0,
                            ),
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("b_0_20"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            Result.max_score > 0,
                            case(
                                (
                                    (((Result.total_score / Result.max_score) * 100) >= 20)
                                    & (((Result.total_score / Result.max_score) * 100) < 40),
                                    1,
                                ),
                                else_=0,
                            ),
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("b_21_40"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            Result.max_score > 0,
                            case(
                                (
                                    (((Result.total_score / Result.max_score) * 100) >= 40)
                                    & (((Result.total_score / Result.max_score) * 100) < 60),
                                    1,
                                ),
                                else_=0,
                            ),
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("b_41_60"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            Result.max_score > 0,
                            case(
                                (
                                    (((Result.total_score / Result.max_score) * 100) >= 60)
                                    & (((Result.total_score / Result.max_score) * 100) < 80),
                                    1,
                                ),
                                else_=0,
                            ),
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("b_61_80"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            Result.max_score > 0,
                            case(
                                (((Result.total_score / Result.max_score) * 100) >= 80, 1),
                                else_=0,
                            ),
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("b_81_100"),
        )
        .select_from(Result)
        .join(Attempt, Result.attempt_id == Attempt.id)
        .where(
            Attempt.exam_id == exam_id,
            Attempt.is_sandbox == False,
            Attempt.submitted_at.is_not(None),
        )
    )

    row = db.execute(stats_stmt).one()
    total = int(row.total_attempts)
    pass_cnt = int(row.pass_count)
    fail_cnt = max(0, total - pass_cnt)

    return ExamStatsResponse(
        exam_id=exam.id,
        exam_title=exam.title,
        total_attempts=total,
        class_average=Decimal(str(row.class_avg)).quantize(Decimal("0.01")),
        highest_score=Decimal(str(row.highest)).quantize(Decimal("0.01")),
        lowest_score=Decimal(str(row.lowest)).quantize(Decimal("0.01")),
        pass_count=pass_cnt,
        fail_count=fail_cnt,
        score_distribution={
            "0-20%": int(row.b_0_20),
            "21-40%": int(row.b_21_40),
            "41-60%": int(row.b_41_60),
            "61-80%": int(row.b_61_80),
            "81-100%": int(row.b_81_100),
        },
    )


# ---------------------------------------------------------------------------
# Student Result Detail & Verification
# ---------------------------------------------------------------------------


def get_student_attempt_result(
    db: Session,
    attempt_id: int,
    current_user: User,
) -> StudentResultResponse:
    """Get candidate result by attempt ID.
    Enforces authorization:
    - Students can only see their own results, and only after publishing.
    - Any attempt to view another student's result returns 403.
    """
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    # Authorization check
    if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only view your own examination results.",
        )

    res = db.scalar(select(Result).where(Result.attempt_id == attempt.id))
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result has not been compiled for this attempt yet.",
        )

    # Publishing check for students
    if current_user.role == UserRole.STUDENT and not res.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Results for this examination have not been published yet.",
        )

    exam = db.get(Exam, attempt.exam_id)
    exam_title = exam.title if exam else "Examination"

    # Per-question marks and verdicts
    q_map = {q["question_id"]: q for q in attempt.frozen_snapshot.get("questions", [])}
    answers = db.scalars(select(Answer).where(Answer.attempt_id == attempt.id)).all()
    ans_by_qid = {a.question_id: a for a in answers}

    questions_detail: list[QuestionResultDetail] = []
    for q_id, q_data in q_map.items():
        ans = ans_by_qid.get(q_id)
        max_m = Decimal(str(q_data.get("marks", 0)))
        awarded_m = ans.marks_awarded if ans else Decimal("0.00")

        # Determine verdict
        verdict = "wrong"
        if ans and isinstance(ans.selected_options, dict) and "verdict" in ans.selected_options:
            verdict = ans.selected_options["verdict"]
        elif awarded_m is not None:
            if awarded_m == max_m and max_m > 0:
                verdict = "correct"
            elif awarded_m > 0:
                verdict = "partial"
            else:
                verdict = "wrong"

        questions_detail.append(
            QuestionResultDetail(
                question_id=q_id,
                prompt=q_data.get("prompt", ""),
                type=q_data.get("type", ""),
                max_marks=max_m,
                marks_awarded=awarded_m,
                verdict=verdict,
            )
        )

    # Compute class aggregates (students see class stats, never others' identities)
    class_stats = get_exam_class_stats(db, attempt.exam_id)

    pct = Decimal("0.00")
    if res.max_score and res.max_score > 0:
        pct = ((res.total_score / res.max_score) * 100).quantize(Decimal("0.01"))

    score_disp = f"{res.total_score:.2f} / {res.max_score:.2f}"

    return StudentResultResponse(
        exam_id=attempt.exam_id,
        exam_title=exam_title,
        student_id=attempt.student_id,
        attempt_id=attempt.id,
        score=res.total_score,
        total_marks=res.max_score,
        total_score=res.total_score,
        max_score=res.max_score,
        score_display=score_disp,
        percentage=pct,
        is_published=res.is_published,
        published_at=res.published_at,
        questions=questions_detail,
        class_average=class_stats.class_average,
        class_highest=class_stats.highest_score,
        class_lowest=class_stats.lowest_score,
    )


# ---------------------------------------------------------------------------
# PDF Report Generation (with ReportLab & QR code)
# ---------------------------------------------------------------------------


def generate_result_pdf(db: Session, attempt_id: int, current_user: User) -> bytes:
    """Generates official examination result PDF with student info, score, photo,
    and a verifiable QR code pointing to {PUBLIC_BASE_URL}/verify/{verification_id}.
    Reuses existing verification ID or creates one once per result.
    """
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    # Authorization
    if current_user.role == UserRole.STUDENT and attempt.student_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You can only download your own PDF result report.",
        )

    res = db.scalar(select(Result).where(Result.attempt_id == attempt.id))
    if not res:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found.")

    if current_user.role == UserRole.STUDENT and not res.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Results for this examination have not been published yet.",
        )

    student = db.get(User, attempt.student_id)
    exam = db.get(Exam, attempt.exam_id)
    exam_title = exam.title if exam else "Official Examination"

    # Fetch or generate unique, hard-to-guess verification ID
    report = db.scalar(select(Report).where(Report.attempt_id == attempt.id))
    if not report:
        verif_id = secrets.token_urlsafe(24)
        report = Report(
            result_id=res.id,
            attempt_id=attempt.id,
            student_id=student.id,
            verification_id=verif_id,
            issued_at=datetime.now(timezone.utc),
        )
        db.add(report)
        db.commit()
        db.refresh(report)

    verification_id = report.verification_id
    base_url = settings.PUBLIC_BASE_URL.rstrip("/")
    verify_url = f"{base_url}/verify/{verification_id}"

    # Generate QR Code
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=4,
        border=1,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#1e293b", back_color="white")
    qr_bytes_io = io.BytesIO()
    qr_img.save(qr_bytes_io, format="PNG")
    qr_bytes_io.seek(0)
    rl_qr = RLImage(qr_bytes_io, width=1.3 * inch, height=1.3 * inch)

    # Student Photo
    photo_element = None
    uploads_dir = Path(__file__).resolve().parent.parent.parent / "uploads"
    if student.picture:
        pic_filename = Path(student.picture).name
        pic_path = uploads_dir / pic_filename
        if pic_path.exists():
            try:
                # Validate image loadable with PIL
                with PILImage.open(pic_path) as im:
                    im.verify()
                photo_element = RLImage(str(pic_path), width=1.3 * inch, height=1.3 * inch)
            except Exception:
                photo_element = None

    if not photo_element:
        # Fallback styled box placeholder
        photo_element = Paragraph(
            "<b>[ Candidate Photo ]</b>",
            ParagraphStyle(
                "PhotoPlaceholder",
                fontName="Helvetica-Bold",
                fontSize=9,
                textColor=colors.HexColor("#64748b"),
                alignment=1,
            ),
        )

    # Build PDF with ReportLab
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        alignment=1,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        fontName="Helvetica",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )
    section_style = ParagraphStyle(
        "SectionHeader",
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
    )
    label_style = ParagraphStyle(
        "FieldLabel",
        fontName="Helvetica-Bold",
        fontSize=10,
        textColor=colors.HexColor("#334155"),
    )
    val_style = ParagraphStyle(
        "FieldValue",
        fontName="Helvetica",
        fontSize=10,
        textColor=colors.HexColor("#0f172a"),
    )
    small_style = ParagraphStyle(
        "SmallCaption",
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#64748b"),
        alignment=1,
    )

    pct = Decimal("0.00")
    if res.max_score and res.max_score > 0:
        pct = ((res.total_score / res.max_score) * 100).quantize(Decimal("0.01"))
    status_label = "PASS" if pct >= Decimal("50.00") else "FAIL"
    status_color = "#16a34a" if status_label == "PASS" else "#dc2626"

    story = [
        Paragraph(settings.APP_NAME.upper(), title_style),
        Spacer(1, 4),
        Paragraph("OFFICIAL ACADEMIC EXAMINATION TRANSCRIPT & RESULT REPORT", subtitle_style),
        Spacer(1, 10),
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563eb"), spaceAfter=15),
    ]

    # Student Details and Photo Row
    student_info = [
        [Paragraph("Candidate Name:", label_style), Paragraph(student.full_name, val_style)],
        [Paragraph("Roll Number:", label_style), Paragraph(student.roll_number or "N/A", val_style)],
        [Paragraph("Examination:", label_style), Paragraph(exam_title, val_style)],
        [Paragraph("Issue Date:", label_style), Paragraph(report.issued_at.strftime("%B %d, %Y"), val_style)],
        [Paragraph("Verification ID:", label_style), Paragraph(verification_id, val_style)],
    ]
    info_table = Table(student_info, colWidths=[120, 240])
    info_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ])
    )

    top_row = Table([[info_table, photo_element]], colWidths=[380, 150])
    top_row.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ])
    )
    story.append(top_row)
    story.append(Spacer(1, 20))

    # Scorecard Box
    story.append(Paragraph("PERFORMANCE SUMMARY", section_style))
    story.append(Spacer(1, 6))

    score_data = [
        [
            Paragraph("Total Score Awarded", label_style),
            Paragraph("Maximum Marks", label_style),
            Paragraph("Percentage", label_style),
            Paragraph("Outcome", label_style),
        ],
        [
            Paragraph(f"<b>{res.total_score:.2f}</b>", val_style),
            Paragraph(f"{res.max_score:.2f}", val_style),
            Paragraph(f"<b>{pct:.2f}%</b>", val_style),
            Paragraph(f"<font color='{status_color}'><b>{status_label}</b></font>", val_style),
        ],
    ]
    score_table = Table(score_data, colWidths=[130, 130, 130, 140])
    score_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f1f5f9")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ])
    )
    story.append(score_table)
    story.append(Spacer(1, 25))

    # Verification Footer with QR Code
    qr_block = Table(
        [
            [rl_qr],
            [Paragraph("Scan QR to verify authentic transcript", small_style)],
            [Paragraph(f"<font color='#2563eb'>{verify_url}</font>", small_style)],
        ],
        colWidths=[200],
    )
    qr_block.setStyle(
        TableStyle([
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ])
    )

    cert_note = Paragraph(
        "<b>Electronic Authenticity Notice:</b><br/>"
        "This official score report was generated by the automated examination proctoring engine. "
        "Any physical or digital modification invalidates this document. Instant authenticity "
        "verification is accessible publicly via the secure QR code or verification URL.",
        ParagraphStyle(
            "NoticeStyle",
            fontName="Helvetica",
            fontSize=8,
            leading=12,
            textColor=colors.HexColor("#64748b"),
        ),
    )

    footer_table = Table([[cert_note, qr_block]], colWidths=[320, 210])
    footer_table.setStyle(
        TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ])
    )
    story.append(footer_table)

    doc.build(story)
    return pdf_buffer.getvalue()


# ---------------------------------------------------------------------------
# CSV Export
# ---------------------------------------------------------------------------


def escape_csv_formula(val: Any) -> str:
    """Escape values against formula injection (e.g. '=1+1', '+cmd', '-cmd', '@cmd')."""
    if val is None:
        return ""
    s = str(val).strip()
    if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{s}"
    return s


def export_exam_results_csv(db: Session, exam_id: int) -> str:
    """Exports examination results as a sanitized RFC 4180 CSV string.
    Columns: roll number, name, score, total marks, percentage, submit reason, violation count.
    Excludes sandbox attempts.
    """
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    stmt = (
        select(Attempt, User, Result)
        .join(User, Attempt.student_id == User.id)
        .outerjoin(Result, Attempt.id == Result.attempt_id)
        .where(
            Attempt.exam_id == exam_id,
            Attempt.is_sandbox == False,
        )
        .order_by(User.roll_number.asc().nullslast(), User.full_name.asc())
    )
    rows = db.execute(stmt).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Roll Number",
        "Name",
        "Score",
        "Total Marks",
        "Percentage",
        "Submit Reason",
        "Violation Count",
    ])

    for att, user, res in rows:
        pct = Decimal("0.00")
        if res and res.max_score and res.max_score > 0:
            pct = ((res.total_score / res.max_score) * 100).quantize(Decimal("0.01"))

        score_str = f"{res.total_score:.2f}" if res else "0.00"
        max_str = f"{res.max_score:.2f}" if res else f"{exam.total_marks:.2f}"

        writer.writerow([
            escape_csv_formula(user.roll_number or ""),
            escape_csv_formula(user.full_name),
            score_str,
            max_str,
            f"{pct:.2f}%",
            escape_csv_formula(att.submit_reason or "manual"),
            att.violation_count,
        ])

    return output.getvalue()


# ---------------------------------------------------------------------------
# Public Verification
# ---------------------------------------------------------------------------


def verify_public_certificate(
    db: Session,
    verification_id: str,
    client_ip: str,
) -> PublicVerificationResponse:
    """Public certificate verification endpoint.
    No login required. Minimal info only: valid/invalid, student name, exam title,
    score / total marks, and date.
    Never exposes roll number, phone, email, or photo.
    Returns identical generic response for unknown IDs. Lightly rate-limited.
    """
    check_verification_rate_limit(client_ip)

    report = db.scalar(select(Report).where(Report.verification_id == verification_id))
    if not report:
        return PublicVerificationResponse(
            valid=False,
            student_name=None,
            exam_title=None,
            score_display=None,
            date=None,
            message="Certificate or report verification ID not found.",
        )

    res = db.get(Result, report.result_id)
    if not res or not res.is_published:
        return PublicVerificationResponse(
            valid=False,
            student_name=None,
            exam_title=None,
            score_display=None,
            date=None,
            message="Certificate or report verification ID not found.",
        )

    student = db.get(User, report.student_id)
    exam = db.get(Exam, res.exam_id)

    student_name = student.full_name if student else "Unknown Candidate"
    exam_title = exam.title if exam else "Examination"
    score_display = f"{res.total_score:.2f} / {res.max_score:.2f}"
    date_str = report.issued_at.strftime("%Y-%m-%d")

    return PublicVerificationResponse(
        valid=True,
        student_name=student_name,
        exam_title=exam_title,
        score_display=score_display,
        date=date_str,
        message="Report verification successful.",
    )
