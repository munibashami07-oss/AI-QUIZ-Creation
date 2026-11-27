"""
Automated test suite for Results, Reports, Analytics, PDF, CSV, and Public Verification.
"""

from datetime import datetime, timezone
from decimal import Decimal
import io
import re
from unittest.mock import MagicMock

from reportlab.pdfgen import canvas

from app.core.config import settings
from app.models.attempt import Answer, Attempt, Result
from app.models.enums import QuestionType, UserRole
from app.models.exam import Exam, Question
from app.models.extras import Report
from app.models.user import User
from app.services.report_service import (
    check_verification_rate_limit,
    escape_csv_formula,
    export_exam_results_csv,
    generate_result_pdf,
    get_exam_class_stats,
    get_student_attempt_result,
    publish_or_unpublish_exam_results,
    verify_public_certificate,
    _ip_rate_limits,
)


def test_escape_csv_formula():
    print("Testing escape_csv_formula...")
    assert escape_csv_formula("John Doe") == "John Doe"
    assert escape_csv_formula("=1+2") == "'=1+2"
    assert escape_csv_formula("+cmd") == "'+cmd"
    assert escape_csv_formula("-10") == "'-10"
    assert escape_csv_formula("@SUM(A1)") == "'@SUM(A1)"
    assert escape_csv_formula(None) == ""
    print("escape_csv_formula PASSED")


def test_rate_limiter():
    print("Testing verification rate limiter...")
    ip = "192.168.1.100"
    _ip_rate_limits.clear()
    for _ in range(5):
        check_verification_rate_limit(ip, limit=5, window_secs=60)
    
    # 6th request should fail with 429
    threw_429 = False
    try:
        check_verification_rate_limit(ip, limit=5, window_secs=60)
    except Exception as exc:
        if getattr(exc, "status_code", None) == 429:
            threw_429 = True
    assert threw_429 is True
    _ip_rate_limits.clear()
    print("rate_limiter PASSED")


def test_publish_unpublish_logic():
    print("Testing publish/unpublish refusal logic...")
    db = MagicMock()
    exam = Exam(id=1, title="Mathematics 101", total_marks=Decimal("100.00"))
    db.get.return_value = exam

    # 1. Test refusal when ungraded answers exist
    db.scalar.return_value = 3  # 3 ungraded answers exist
    threw_400 = False
    try:
        publish_or_unpublish_exam_results(db, exam_id=1, examiner_id=99, publish=True)
    except Exception as exc:
        if getattr(exc, "status_code", None) == 400 and "still have ungraded short answers" in getattr(exc, "detail", ""):
            threw_400 = True
    assert threw_400 is True

    # 2. Test publishing succeeds when 0 ungraded answers exist
    db.scalar.return_value = 0
    res1 = Result(id=10, exam_id=1, is_published=False)
    res2 = Result(id=11, exam_id=1, is_published=False)
    db.scalars.return_value.all.return_value = [res1, res2]

    resp = publish_or_unpublish_exam_results(db, exam_id=1, examiner_id=99, publish=True)
    assert resp.is_published is True
    assert resp.published_count == 2
    assert res1.is_published is True
    assert res2.is_published is True

    # 3. Test unpublishing
    resp_unpub = publish_or_unpublish_exam_results(db, exam_id=1, examiner_id=99, publish=False)
    assert resp_unpub.is_published is False
    assert res1.is_published is False
    assert res2.is_published is False
    print("publish_unpublish_logic PASSED")


def test_student_authorization_and_breakdown():
    print("Testing student authorization and per-question breakdown...")
    db = MagicMock()
    attempt = Attempt(
        id=50,
        exam_id=1,
        student_id=5,  # Student ID 5
        is_sandbox=False,
        frozen_snapshot={
            "questions": [
                {"question_id": 101, "prompt": "What is Python?", "type": "written", "marks": "5.00"},
                {"question_id": 102, "prompt": "Select primary colors", "type": "multi_select", "marks": "4.00"},
            ]
        },
    )
    db.get.side_effect = lambda model, obj_id: {
        (Attempt, 50): attempt,
        (Exam, 1): Exam(id=1, title="Computer Science", total_marks=Decimal("9.00")),
        (User, 5): User(id=5, full_name="Alice Candidate", roll_number="CS-001"),
    }.get((model, obj_id))

    res = Result(
        id=70,
        attempt_id=50,
        exam_id=1,
        student_id=5,
        total_score=Decimal("7.00"),
        max_score=Decimal("9.00"),
        is_published=True,
    )
    db.scalar.return_value = res

    ans1 = Answer(
        attempt_id=50,
        question_id=101,
        marks_awarded=Decimal("5.00"),
        selected_options={"verdict": "correct", "suggested_marks": "5.00"},
    )
    ans2 = Answer(
        attempt_id=50,
        question_id=102,
        marks_awarded=Decimal("2.00"),
        selected_options=["A"],
    )
    db.scalars.return_value.all.return_value = [ans1, ans2]

    # Mock class stats SQL aggregate row
    stats_mock = MagicMock()
    stats_mock.total_attempts = 10
    stats_mock.class_avg = Decimal("6.50")
    stats_mock.highest = Decimal("9.00")
    stats_mock.lowest = Decimal("3.00")
    stats_mock.pass_count = 8
    stats_mock.b_0_20 = 0
    stats_mock.b_21_40 = 1
    stats_mock.b_41_60 = 2
    stats_mock.b_61_80 = 5
    stats_mock.b_81_100 = 2
    db.execute.return_value.one.return_value = stats_mock

    # 1. Another student attempts to view -> 403 Forbidden
    other_student = User(id=99, role=UserRole.STUDENT, full_name="Bob Intruder")
    threw_403_other = False
    try:
        get_student_attempt_result(db, attempt_id=50, current_user=other_student)
    except Exception as exc:
        if getattr(exc, "status_code", None) == 403 and "Forbidden" in getattr(exc, "detail", ""):
            threw_403_other = True
    assert threw_403_other is True

    # 2. Unpublished attempt viewed by student -> 403 Forbidden
    res.is_published = False
    student = User(id=5, role=UserRole.STUDENT, full_name="Alice Candidate")
    threw_403_unpub = False
    try:
        get_student_attempt_result(db, attempt_id=50, current_user=student)
    except Exception as exc:
        if getattr(exc, "status_code", None) == 403 and "have not been published yet" in getattr(exc, "detail", ""):
            threw_403_unpub = True
    assert threw_403_unpub is True

    # 3. Published attempt viewed by student -> Returns score, per-question breakdown, class stats
    res.is_published = True
    response = get_student_attempt_result(db, attempt_id=50, current_user=student)
    assert response.score == Decimal("7.00")
    assert response.total_marks == Decimal("9.00")
    assert len(response.questions) == 2
    assert response.questions[0].verdict == "correct"
    assert response.questions[0].marks_awarded == Decimal("5.00")
    assert response.questions[1].verdict == "partial"
    assert response.questions[1].marks_awarded == Decimal("2.00")
    # Class stats present without leaking other students' info
    assert response.class_average == Decimal("6.50")
    assert response.class_highest == Decimal("9.00")
    assert response.class_lowest == Decimal("3.00")
    print("student_authorization_and_breakdown PASSED")


def test_pdf_report_and_verification():
    print("Testing PDF report generation and QR code verification...")
    db = MagicMock()
    attempt = Attempt(
        id=12,
        exam_id=1,
        student_id=5,
        is_sandbox=False,
    )
    exam = Exam(id=1, title="Algorithms & Data Structures", total_marks=Decimal("50.00"))
    student = User(id=5, full_name="Alice Smith", roll_number="CS-101", picture=None)
    res = Result(
        id=22,
        attempt_id=12,
        exam_id=1,
        student_id=5,
        total_score=Decimal("45.00"),
        max_score=Decimal("50.00"),
        is_published=True,
    )

    db.get.side_effect = lambda model, obj_id: {
        (Attempt, 12): attempt,
        (Exam, 1): exam,
        (User, 5): student,
        (Result, 22): res,
    }.get((model, obj_id))

    # Existing report check
    existing_report = Report(
        id=1,
        result_id=22,
        attempt_id=12,
        student_id=5,
        verification_id="test_verif_id_abc123",
        issued_at=datetime(2026, 11, 27, 12, 0, 0, tzinfo=timezone.utc),
    )
    db.scalar.side_effect = lambda query: existing_report if "reports" in str(query).lower() else res

    # Generate PDF
    pdf_bytes = generate_result_pdf(db, attempt_id=12, current_user=student)
    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert pdf_bytes.startswith(b"%PDF-")

    # Verify public certificate
    _ip_rate_limits.clear()
    verif_resp = verify_public_certificate(db, verification_id="test_verif_id_abc123", client_ip="127.0.0.1")
    assert verif_resp.valid is True
    assert verif_resp.student_name == "Alice Smith"
    assert verif_resp.exam_title == "Algorithms & Data Structures"
    assert verif_resp.score_display == "45.00 / 50.00"

    # Verify unknown ID returns generic response
    db.scalar.side_effect = None
    db.scalar.return_value = None
    unknown_resp = verify_public_certificate(db, verification_id="nonexistent_id", client_ip="127.0.0.1")
    assert unknown_resp.valid is False
    assert unknown_resp.student_name is None
    assert unknown_resp.score_display is None
    print("pdf_report_and_verification PASSED")


def test_csv_export():
    print("Testing CSV export with sanitization...")
    db = MagicMock()
    exam = Exam(id=1, title="Cyber Security", total_marks=Decimal("100.00"))
    db.get.return_value = exam

    # Student with formula injection name
    u1 = User(id=1, full_name="=cmd|' /C calc'!A0", roll_number="=1+2")
    att1 = Attempt(id=10, student_id=1, exam_id=1, submit_reason="manual", violation_count=0)
    res1 = Result(id=10, attempt_id=10, total_score=Decimal("85.00"), max_score=Decimal("100.00"))

    u2 = User(id=2, full_name="Safe Candidate", roll_number="CS-002")
    att2 = Attempt(id=11, student_id=2, exam_id=1, submit_reason="time_expired", violation_count=1)
    res2 = Result(id=11, attempt_id=11, total_score=Decimal("92.50"), max_score=Decimal("100.00"))

    db.execute.return_value.all.return_value = [(att1, u1, res1), (att2, u2, res2)]

    csv_data = export_exam_results_csv(db, exam_id=1)
    lines = csv_data.strip().split("\r\n" if "\r\n" in csv_data else "\n")
    assert "Roll Number,Name,Score,Total Marks,Percentage,Submit Reason,Violation Count" in lines[0]
    
    # Check formula escape
    assert "'=1+2" in lines[1]
    assert "'=cmd|' /C calc'!A0" in lines[1]
    assert "85.00" in lines[1]
    assert "CS-002" in lines[2]
    assert "Safe Candidate" in lines[2]
    assert "92.50" in lines[2]
    print("csv_export PASSED")


if __name__ == "__main__":
    test_escape_csv_formula()
    test_rate_limiter()
    test_publish_unpublish_logic()
    test_student_authorization_and_breakdown()
    test_pdf_report_and_verification()
    test_csv_export()
    print("\n>>> ALL RESULTS & ANALYTICS TESTS PASSED! <<<")
