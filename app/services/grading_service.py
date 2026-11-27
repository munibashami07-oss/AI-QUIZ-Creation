"""
Grading and AI evaluation service for auto-grading MCQs and AI suggestions for short answers.
"""

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
import json
import logging
import re
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.attempt import Answer, Attempt, Result
from app.models.enums import QuestionType
from app.models.exam import Exam, Question
from app.models.user import User
from app.schemas.grading import (
    AnswerReviewResponse,
    GradeAnswerResponse,
    PublishResultsResponse,
    StudentResultResponse,
)

logger = logging.getLogger("uvicorn.error")


# ---------------------------------------------------------------------------
# Marks and Verdict Conversion Rules
# ---------------------------------------------------------------------------


def compute_half_marks(marks: Decimal) -> Decimal:
    """Calculate half of the question's marks for partially correct answers.
    
    Rounding rule comment:
    Award exactly half of the question's marks (marks / 2).
    If marks are odd (or yield a fraction beyond one decimal place), round half up
    to one decimal place (e.g., 5 -> 2.5, 3 -> 1.5, 7 -> 3.5, 1 -> 0.5, 5.5 -> 2.8).
    Stored with two decimal places.
    """
    half = (marks / Decimal("2")).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return half.quantize(Decimal("0.01"))


def verdict_to_marks(verdict: str, max_marks: Decimal) -> Decimal:
    """Converts one of the three allowed verdicts into marks:
    - 'correct': full marks, exactly as the teacher assigned
    - 'partial': exactly half of the question's marks (odd rounded half up to 1 decimal place)
    - 'wrong' or blank: 0
    """
    v = str(verdict).strip().lower()
    if v == "correct":
        return max_marks.quantize(Decimal("0.01"))
    elif v == "partial":
        return compute_half_marks(max_marks)
    else:
        return Decimal("0.00")


# ---------------------------------------------------------------------------
# MCQ Auto-Grading Rules
# ---------------------------------------------------------------------------


def grade_single_mcq(student_choice: Any, correct_choice: Any, marks: Decimal) -> tuple[Decimal, str]:
    """Single-choice MCQ rule:
    - Correct: award full marks, exactly as teacher assigned.
    - Wrong or blank: award 0.
    Returns: (awarded_marks, verdict) where verdict is 'correct' or 'wrong'.
    """
    if not student_choice or not correct_choice:
        return Decimal("0.00"), "wrong"
    if str(student_choice).strip().upper() == str(correct_choice).strip().upper():
        return marks.quantize(Decimal("0.01")), "correct"
    return Decimal("0.00"), "wrong"


def grade_multi_select_mcq(student_choices: Any, correct_choices: Any, marks: Decimal) -> tuple[Decimal, str]:
    """Multi-select MCQ Grading Rule:
    
    Rule:
    - All correct options and no wrong ones = full marks ('correct').
    - Some correct options chosen and no wrong ones = half marks ('partial').
      (If marks are odd, rounded half up to one decimal place).
    - Otherwise (any wrong option selected, or blank/no correct option) = 0 ('wrong').
    
    Documented per requirement:
    'all correct options and no wrong ones = full marks; some correct options chosen
    and no wrong ones = half marks; otherwise 0. Document this rule in a code comment.'
    """
    if not student_choices or not correct_choices:
        return Decimal("0.00"), "wrong"

    if not isinstance(student_choices, (list, set, tuple)):
        student_choices = [student_choices]
    if not isinstance(correct_choices, (list, set, tuple)):
        correct_choices = [correct_choices]

    s_set = {str(x).strip().upper() for x in student_choices if str(x).strip()}
    c_set = {str(x).strip().upper() for x in correct_choices if str(x).strip()}

    if not s_set or not c_set:
        return Decimal("0.00"), "wrong"

    # Any incorrect option selected -> 0 marks ('wrong')
    if s_set - c_set:
        return Decimal("0.00"), "wrong"

    # No incorrect options selected:
    if s_set == c_set:
        return marks.quantize(Decimal("0.01")), "correct"
    elif s_set.issubset(c_set) and len(s_set) > 0:
        return compute_half_marks(marks), "partial"
    else:
        return Decimal("0.00"), "wrong"


# ---------------------------------------------------------------------------
# Short-Answer AI Evaluation (Gemini API with Keyword Fallback)
# ---------------------------------------------------------------------------


def evaluate_short_answer_fallback(
    student_answer: str | None,
    model_answer: str,
    max_marks: Decimal,
) -> tuple[Decimal, str, str]:
    """Fallback keyword matching algorithm against model answer using three verdicts:
    - All key terms matched = 'correct' (full marks)
    - Some key terms matched (at least one, but not all) = 'partial' (half marks)
    - None matched or blank = 'wrong' (0 marks)
    
    Returns: (marks, verdict, reason)
    """
    if not student_answer or not student_answer.strip():
        return Decimal("0.00"), "wrong", "No answer submitted."

    s_words = set(re.findall(r"\w+", student_answer.lower()))
    m_words = set(re.findall(r"\w+", model_answer.lower()))

    # Ignore trivial stopwords
    stopwords = {
        "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of",
        "with", "is", "are", "was", "were", "it", "that", "this", "by", "from", "be"
    }
    key_words = m_words - stopwords

    if not key_words:
        return Decimal("0.00"), "wrong", "Model answer has no key terms to match."

    matched = s_words & key_words
    if len(matched) == len(key_words):
        verdict = "correct"
        reason = f"Keyword fallback: all {len(key_words)} key terms matched."
    elif len(matched) > 0:
        verdict = "partial"
        reason = f"Keyword fallback: partial match ({len(matched)} of {len(key_words)} key terms matched)."
    else:
        verdict = "wrong"
        reason = "Keyword fallback: no key terms matched."

    marks = verdict_to_marks(verdict, max_marks)
    return marks, verdict, reason


def evaluate_short_answer_with_ai(
    prompt_text: str,
    model_answer: str,
    student_answer: str | None,
    max_marks: Decimal,
) -> tuple[Decimal, str, str]:
    """Evaluate short answer using Gemini API returning strictly {"verdict": "correct" | "partial" | "wrong", "reason": "<one line>"}.
    The server converts the verdict into marks:
    - correct = full marks
    - partial = marks / 2 (odd rounded half up to 1 decimal place)
    - wrong = 0
    This guarantees the AI can never award more than the teacher's marks.
    Gracefully falls back to keyword matching if key is missing, API fails, or JSON can't be parsed.
    
    Returns: (suggested_marks, verdict, reason)
    """
    if not student_answer or not student_answer.strip():
        return Decimal("0.00"), "wrong", "No answer submitted."

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return evaluate_short_answer_fallback(student_answer, model_answer, max_marks)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        sys_instruction = (
            "You are an academic examination grader. Compare the student's answer with the model answer. "
            "Do not output a numerical score. You must categorize the answer into exactly one of three verdicts: "
            "'correct' (accurate, complete answer matching model answer expectations), "
            "'partial' (partially correct or incomplete understanding), or "
            "'wrong' (incorrect, irrelevant, or blank). "
            'Respond strictly in valid JSON format: {"verdict": "correct" | "partial" | "wrong", "reason": "<one line>"}'
        )

        user_content = (
            f"Question: {prompt_text}\n"
            f"Model Answer: {model_answer}\n"
            f"Student Answer: {student_answer}"
        )

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=sys_instruction,
                temperature=0.2,
                response_mime_type="application/json",
            ),
        )

        parsed = json.loads(response.text)
        verdict = str(parsed.get("verdict", "")).strip().lower()
        if verdict not in {"correct", "partial", "wrong"}:
            raise ValueError(f"Invalid AI verdict: {verdict}")

        reason = str(parsed.get("reason", f"AI evaluated answer as {verdict}."))
        suggested_marks = verdict_to_marks(verdict, max_marks)
        return suggested_marks, verdict, reason
    except Exception as e:
        logger.warning("Gemini AI evaluation failed or unparseable (%s). Using keyword fallback.", type(e).__name__)
        return evaluate_short_answer_fallback(student_answer, model_answer, max_marks)


# ---------------------------------------------------------------------------
# Attempt Final Grading Orchestrator
# ---------------------------------------------------------------------------


def run_auto_grading_for_attempt(db: Session, attempt: Attempt) -> None:
    """Invoked when an attempt is submitted: grades all MCQs and generates AI suggestions for written answers."""
    # 1. Map questions from frozen snapshot
    q_map = {q["question_id"]: q for q in attempt.frozen_snapshot.get("questions", [])}
    answers = db.scalars(select(Answer).where(Answer.attempt_id == attempt.id)).all()
    answered_q_ids = {a.question_id for a in answers}

    # Create empty answer records for skipped questions so every question is tracked
    for q_id, q_data in q_map.items():
        if q_id not in answered_q_ids:
            empty_ans = Answer(
                attempt_id=attempt.id,
                question_id=q_id,
                selected_options=None,
                written_response=None,
                status="unanswered",
                marks_awarded=Decimal("0.00"),
            )
            db.add(empty_ans)

    db.flush()
    # Re-fetch all answers for grading
    answers = db.scalars(select(Answer).where(Answer.attempt_id == attempt.id)).all()

    for ans in answers:
        q_data = q_map.get(ans.question_id)
        if not q_data:
            continue

        q_type = q_data["type"]
        max_marks = Decimal(str(q_data["marks"]))

        # For MCQs, fetch the correct answer from the database (frozen_snapshot purposefully omitted it)
        db_q = db.get(Question, ans.question_id)
        if not db_q:
            continue

        if q_type == QuestionType.SINGLE_MCQ.value:
            awarded, _ = grade_single_mcq(ans.selected_options, db_q.correct_answer, max_marks)
            ans.marks_awarded = awarded
            ans.status = "graded"
        elif q_type == QuestionType.MULTI_SELECT.value:
            awarded, _ = grade_multi_select_mcq(ans.selected_options, db_q.correct_answer, max_marks)
            ans.marks_awarded = awarded
            ans.status = "graded"
        elif q_type == QuestionType.WRITTEN.value:
            # Model answer format can be string or dict {"model_answer": "..."}
            model_ans = db_q.correct_answer
            if isinstance(model_ans, dict):
                model_str = model_ans.get("model_answer", "")
            else:
                model_str = str(model_ans or "")

            suggested, verdict, reason = evaluate_short_answer_with_ai(
                prompt_text=db_q.prompt,
                model_answer=model_str,
                student_answer=ans.written_response,
                max_marks=max_marks,
            )
            # Store in selected_options JSONB as metadata: {"suggested_marks": ..., "verdict": ..., "ai_reason": ...}
            meta = ans.selected_options if isinstance(ans.selected_options, dict) else {}
            meta["suggested_marks"] = str(suggested)
            meta["verdict"] = verdict
            meta["ai_reason"] = reason
            ans.selected_options = meta
            ans.status = "needs_review"  # Requires examiner approval

    db.commit()
    check_and_update_total_score(db, attempt.id)


def check_and_update_total_score(db: Session, attempt_id: int) -> tuple[bool, Decimal | None]:
    """Check if all answers in the attempt are graded. If so, calculate total and update/create Result."""
    answers = db.scalars(select(Answer).where(Answer.attempt_id == attempt_id)).all()
    if not answers:
        return False, None

    all_graded = all(a.status == "graded" and a.marks_awarded is not None for a in answers)
    if not all_graded:
        return False, None

    total_score = sum((a.marks_awarded for a in answers if a.marks_awarded is not None), Decimal("0.00"))

    # Get attempt and exam max marks
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return False, None

    exam = db.get(Exam, attempt.exam_id)
    max_marks = exam.total_marks if exam else total_score

    res = db.scalar(select(Result).where(Result.attempt_id == attempt.id))
    if not res:
        res = Result(
            attempt_id=attempt.id,
            exam_id=attempt.exam_id,
            student_id=attempt.student_id,
            total_score=total_score,
            max_score=max_marks,
            is_published=False,
        )
        db.add(res)
    else:
        res.total_score = total_score
        res.max_score = max_marks

    db.commit()
    return True, total_score


# ---------------------------------------------------------------------------
# Manual Review & Result Publication
# ---------------------------------------------------------------------------


def get_pending_reviews_for_exam(db: Session, exam_id: int) -> list[AnswerReviewResponse]:
    """Retrieve all answers requiring examiner manual review/approval for an exam."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    stmt = (
        select(Answer, Attempt, User, Question)
        .join(Attempt, Answer.attempt_id == Attempt.id)
        .join(User, Attempt.student_id == User.id)
        .join(Question, Answer.question_id == Question.id)
        .where(
            Attempt.exam_id == exam_id,
            Answer.status == "needs_review",
        )
        .order_by(Attempt.id.asc(), Answer.id.asc())
    )
    rows = db.execute(stmt).all()

    results = []
    for ans, att, student, q in rows:
        meta = ans.selected_options if isinstance(ans.selected_options, dict) else {}
        suggested_raw = meta.get("suggested_marks")
        suggested_dec = Decimal(str(suggested_raw)) if suggested_raw is not None else None
        verdict = meta.get("verdict")
        ai_reason = meta.get("ai_reason")

        results.append(
            AnswerReviewResponse(
                id=ans.id,
                attempt_id=ans.attempt_id,
                student_id=student.id,
                student_name=student.full_name,
                student_roll=student.roll_number,
                question_id=q.id,
                prompt=q.prompt,
                model_answer=q.correct_answer,
                written_response=ans.written_response,
                max_marks=q.marks,
                marks_awarded=ans.marks_awarded,
                suggested_marks=suggested_dec,
                verdict=verdict,
                ai_reason=ai_reason,
                status=ans.status,
                graded_by=ans.graded_by,
                graded_at=ans.graded_at,
            )
        )
    return results


def grade_single_answer(
    db: Session,
    answer_id: int,
    examiner_id: int,
    marks_awarded: Decimal,
    notes: str | None = None,
) -> GradeAnswerResponse:
    """Examiner manually awards marks or approves AI recommendation for a written answer.
    Guarantees the final mark must stay between 0 and the question's marks.
    """
    ans = db.get(Answer, answer_id)
    if not ans:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer not found.")

    q = db.get(Question, ans.question_id)
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    if marks_awarded < Decimal("0.00") or marks_awarded > q.marks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Awarded marks ({marks_awarded}) must be between 0 and maximum question marks ({q.marks}).",
        )

    now = datetime.now(timezone.utc)
    ans.marks_awarded = marks_awarded
    ans.status = "graded"
    ans.graded_by = examiner_id
    ans.graded_at = now

    if notes:
        meta = ans.selected_options if isinstance(ans.selected_options, dict) else {}
        meta["examiner_notes"] = notes
        ans.selected_options = meta

    db.commit()

    all_graded, total_score = check_and_update_total_score(db, ans.attempt_id)

    # Show score as score / total_marks
    score_display = None
    if total_score is not None:
        attempt = db.get(Attempt, ans.attempt_id)
        exam = db.get(Exam, attempt.exam_id) if attempt else None
        max_marks = exam.total_marks if exam else total_score
        score_display = f"{total_score:.2f} / {max_marks:.2f}"

    return GradeAnswerResponse(
        answer_id=ans.id,
        marks_awarded=ans.marks_awarded,
        status=ans.status,
        graded_by=examiner_id,
        graded_at=now,
        all_answers_graded=all_graded,
        total_score=total_score,
        score_display=score_display,
        message="Answer graded successfully.",
    )


def publish_exam_results(db: Session, exam_id: int, examiner_id: int) -> PublishResultsResponse:
    """Examiner/Admin publishes graded results for all completed attempts in an exam."""
    from app.services.report_service import publish_or_unpublish_exam_results
    return publish_or_unpublish_exam_results(db, exam_id=exam_id, examiner_id=examiner_id, publish=True)


def get_student_exam_result(db: Session, student_id: int, exam_id: int) -> StudentResultResponse:
    """Student retrieves their published scorecard, shown as score / total_marks. Hidden until published."""
    from app.services.report_service import get_student_attempt_result

    attempt = db.scalar(
        select(Attempt)
        .where(
            Attempt.exam_id == exam_id,
            Attempt.student_id == student_id,
            Attempt.is_sandbox == False,
        )
        .order_by(Attempt.id.desc())
    )
    if not attempt:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No examination attempt record found for this exam.",
        )

    student = db.get(User, student_id)
    return get_student_attempt_result(db, attempt_id=attempt.id, current_user=student)
