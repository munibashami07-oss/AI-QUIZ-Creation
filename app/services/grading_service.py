"""
Grading and AI evaluation service for auto-grading MCQs and AI suggestions for short answers.
"""

from datetime import datetime, timezone
from decimal import Decimal
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
# MCQ Auto-Grading Rules
# ---------------------------------------------------------------------------


def grade_single_mcq(student_choice: Any, correct_choice: Any, marks: Decimal) -> Decimal:
    """Single-choice MCQ rule: Full marks if exact match, otherwise 0."""
    if not student_choice or not correct_choice:
        return Decimal("0.00")
    if str(student_choice).strip().upper() == str(correct_choice).strip().upper():
        return marks
    return Decimal("0.00")


def grade_multi_select_mcq(student_choices: Any, correct_choices: Any, marks: Decimal) -> Decimal:
    """Multi-select MCQ Grading Rule:
    
    Rule:
    - Let C = set of correct options.
    - Let S = set of student's selected options.
    - If student selected any incorrect option (S has options not in C):
      Award 0 marks (penalizes guessing/selecting all options).
    - If S is a subset of C with no incorrect options:
      Partial marks are awarded proportionally: marks * (len(S) / len(C)).
      If S == C, this yields 100% of the question marks.
    """
    if not student_choices or not correct_choices:
        return Decimal("0.00")

    if not isinstance(student_choices, (list, set, tuple)):
        student_choices = [student_choices]
    if not isinstance(correct_choices, (list, set, tuple)):
        correct_choices = [correct_choices]

    s_set = {str(x).strip().upper() for x in student_choices}
    c_set = {str(x).strip().upper() for x in correct_choices}

    if not c_set:
        return Decimal("0.00")

    # If student chose an option that is not correct -> 0 marks
    incorrect_picks = s_set - c_set
    if len(incorrect_picks) > 0:
        return Decimal("0.00")

    # Correct selections
    correct_picks = s_set & c_set
    ratio = Decimal(len(correct_picks)) / Decimal(len(c_set))
    return (marks * ratio).quantize(Decimal("0.01"))


# ---------------------------------------------------------------------------
# Short-Answer AI Evaluation (Gemini API with Keyword Fallback)
# ---------------------------------------------------------------------------


def evaluate_short_answer_fallback(student_answer: str | None, model_answer: str, max_marks: Decimal) -> tuple[Decimal, str]:
    """Fallback keyword matching algorithm when Gemini API is unavailable or unconfigured."""
    if not student_answer or not student_answer.strip():
        return Decimal("0.00"), "No answer submitted."

    s_words = set(re.findall(r"\w+", student_answer.lower()))
    m_words = set(re.findall(r"\w+", model_answer.lower()))

    # Ignore trivial stopwords
    stopwords = {"a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of", "with", "is", "are", "was", "were", "it", "that", "this", "by"}
    key_words = m_words - stopwords

    if not key_words:
        return Decimal("0.00"), "Model answer has no keywords to match."

    matched = s_words & key_words
    match_ratio = Decimal(len(matched)) / Decimal(len(key_words))
    suggested = min(max_marks, (max_marks * match_ratio).quantize(Decimal("0.01")))
    return suggested, f"Automated keyword match ({len(matched)} of {len(key_words)} key terms matched)."


def evaluate_short_answer_with_ai(
    prompt_text: str,
    model_answer: str,
    student_answer: str | None,
    max_marks: Decimal,
) -> tuple[Decimal, str]:
    """Evaluate short answer using Gemini API, gracefully falling back to keyword matching.
    Never exposes or logs the API key.
    """
    if not student_answer or not student_answer.strip():
        return Decimal("0.00"), "No response provided by candidate."

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return evaluate_short_answer_fallback(student_answer, model_answer, max_marks)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        sys_instruction = (
            "You are an academic examination grader. Compare the student's answer with the model answer "
            "for the given question and maximum marks. Respond strictly in valid JSON format: "
            '{"suggested_marks": <number>, "reason": "<one sentence explanation>"}. '
            f"suggested_marks must be between 0 and {float(max_marks)}."
        )

        user_content = (
            f"Question: {prompt_text}\n"
            f"Model Answer: {model_answer}\n"
            f"Maximum Marks: {max_marks}\n"
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
        s_marks = Decimal(str(parsed.get("suggested_marks", 0))).quantize(Decimal("0.01"))
        s_marks = max(Decimal("0.00"), min(s_marks, max_marks))
        reason = str(parsed.get("reason", "Graded by Gemini AI."))
        return s_marks, reason
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
            awarded = grade_single_mcq(ans.selected_options, db_q.correct_answer, max_marks)
            ans.marks_awarded = awarded
            ans.status = "graded"
        elif q_type == QuestionType.MULTI_SELECT.value:
            awarded = grade_multi_select_mcq(ans.selected_options, db_q.correct_answer, max_marks)
            ans.marks_awarded = awarded
            ans.status = "graded"
        elif q_type == QuestionType.WRITTEN.value:
            # Model answer format can be string or dict {"model_answer": "..."}
            model_ans = db_q.correct_answer
            if isinstance(model_ans, dict):
                model_str = model_ans.get("model_answer", "")
            else:
                model_str = str(model_ans or "")

            suggested, reason = evaluate_short_answer_with_ai(
                prompt_text=db_q.prompt,
                model_answer=model_str,
                student_answer=ans.written_response,
                max_marks=max_marks,
            )
            # Store in selected_options JSONB as metadata: {"suggested_marks": ..., "ai_reason": ...}
            meta = ans.selected_options if isinstance(ans.selected_options, dict) else {}
            meta["suggested_marks"] = str(suggested)
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
    """Examiner manually awards marks or approves AI recommendation for a written answer."""
    ans = db.get(Answer, answer_id)
    if not ans:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Answer not found.")

    q = db.get(Question, ans.question_id)
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    if marks_awarded > q.marks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Awarded marks ({marks_awarded}) cannot exceed maximum question marks ({q.marks}).",
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

    return GradeAnswerResponse(
        answer_id=ans.id,
        marks_awarded=ans.marks_awarded,
        status=ans.status,
        graded_by=examiner_id,
        graded_at=now,
        all_answers_graded=all_graded,
        total_score=total_score,
        message="Answer graded successfully.",
    )


def publish_exam_results(db: Session, exam_id: int, examiner_id: int) -> PublishResultsResponse:
    """Examiner/Admin publishes graded results for all completed attempts in an exam."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    now = datetime.now(timezone.utc)
    results = db.scalars(select(Result).where(Result.exam_id == exam_id)).all()

    count = 0
    for res in results:
        res.is_published = True
        res.published_by = examiner_id
        res.published_at = now
        count += 1

    db.commit()
    return PublishResultsResponse(
        exam_id=exam_id,
        published_count=count,
        message=f"Successfully published {count} result(s) for exam '{exam.title}'.",
    )


def get_student_exam_result(db: Session, student_id: int, exam_id: int) -> StudentResultResponse:
    """Student retrieves their published scorecard. Hidden until published."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exam not found.")

    res = db.scalar(
        select(Result).where(
            Result.exam_id == exam_id,
            Result.student_id == student_id,
        )
    )
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No exam result found for this examination.",
        )

    if not res.is_published:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Results for this examination have not been published yet.",
        )

    percentage = Decimal("0.00")
    if res.max_score and res.max_score > 0:
        percentage = ((res.total_score / res.max_score) * 100).quantize(Decimal("0.01"))

    return StudentResultResponse(
        exam_id=exam.id,
        exam_title=exam.title,
        student_id=student_id,
        attempt_id=res.attempt_id,
        total_score=res.total_score,
        max_score=res.max_score,
        percentage=percentage,
        is_published=res.is_published,
        published_at=res.published_at,
    )

