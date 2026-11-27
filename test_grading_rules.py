from decimal import Decimal
from app.services.grading_service import (
    compute_half_marks,
    verdict_to_marks,
    grade_single_mcq,
    grade_multi_select_mcq,
    evaluate_short_answer_fallback,
)

def test_compute_half_marks():
    print("Testing compute_half_marks...")
    assert compute_half_marks(Decimal("5.00")) == Decimal("2.50")
    assert compute_half_marks(Decimal("3.00")) == Decimal("1.50")
    assert compute_half_marks(Decimal("7.00")) == Decimal("3.50")
    assert compute_half_marks(Decimal("1.00")) == Decimal("0.50")
    assert compute_half_marks(Decimal("4.00")) == Decimal("2.00")
    assert compute_half_marks(Decimal("5.50")) == Decimal("2.80")  # 2.75 -> 2.80
    print("compute_half_marks PASSED")

def test_verdict_to_marks():
    print("Testing verdict_to_marks...")
    assert verdict_to_marks("correct", Decimal("10.00")) == Decimal("10.00")
    assert verdict_to_marks("partial", Decimal("10.00")) == Decimal("5.00")
    assert verdict_to_marks("partial", Decimal("5.00")) == Decimal("2.50")
    assert verdict_to_marks("wrong", Decimal("10.00")) == Decimal("0.00")
    assert verdict_to_marks("", Decimal("10.00")) == Decimal("0.00")
    print("verdict_to_marks PASSED")

def test_single_mcq():
    print("Testing single-answer MCQ...")
    assert grade_single_mcq("B", "B", Decimal("4.00")) == (Decimal("4.00"), "correct")
    assert grade_single_mcq("b", "B", Decimal("4.00")) == (Decimal("4.00"), "correct")
    assert grade_single_mcq("A", "B", Decimal("4.00")) == (Decimal("0.00"), "wrong")
    assert grade_single_mcq("", "B", Decimal("4.00")) == (Decimal("0.00"), "wrong")
    assert grade_single_mcq(None, "B", Decimal("4.00")) == (Decimal("0.00"), "wrong")
    print("Single-answer MCQ PASSED")

def test_multi_select_mcq():
    print("Testing multi-select MCQ...")
    # all correct options and no wrong ones = full marks
    assert grade_multi_select_mcq(["A", "C"], ["A", "C"], Decimal("6.00")) == (Decimal("6.00"), "correct")
    # some correct options chosen and no wrong ones = half marks
    assert grade_multi_select_mcq(["A"], ["A", "C"], Decimal("6.00")) == (Decimal("3.00"), "partial")
    # odd marks: 5.00 -> 2.50
    assert grade_multi_select_mcq(["A"], ["A", "C"], Decimal("5.00")) == (Decimal("2.50"), "partial")
    # otherwise 0: wrong option chosen
    assert grade_multi_select_mcq(["A", "B"], ["A", "C"], Decimal("6.00")) == (Decimal("0.00"), "wrong")
    assert grade_multi_select_mcq(["B"], ["A", "C"], Decimal("6.00")) == (Decimal("0.00"), "wrong")
    # otherwise 0: blank/empty
    assert grade_multi_select_mcq([], ["A", "C"], Decimal("6.00")) == (Decimal("0.00"), "wrong")
    assert grade_multi_select_mcq(None, ["A", "C"], Decimal("6.00")) == (Decimal("0.00"), "wrong")
    print("Multi-select MCQ PASSED")

def test_short_answers_fallback():
    print("Testing short answers fallback...")
    model_ans = "PostgreSQL is an open-source relational database management system"
    # All key terms = correct (full marks)
    m1, v1, r1 = evaluate_short_answer_fallback("PostgreSQL is an open-source relational database management system", model_ans, Decimal("5.00"))
    assert v1 == "correct" and m1 == Decimal("5.00")

    # Some key terms = partial (half marks, odd 5 -> 2.50)
    m2, v2, r2 = evaluate_short_answer_fallback("PostgreSQL is a database system", model_ans, Decimal("5.00"))
    assert v2 == "partial" and m2 == Decimal("2.50")

    # None key terms / wrong = wrong (0 marks)
    m3, v3, r3 = evaluate_short_answer_fallback("Python is a programming language", model_ans, Decimal("5.00"))
    assert v3 == "wrong" and m3 == Decimal("0.00")

    # Blank = wrong (0 marks)
    m4, v4, r4 = evaluate_short_answer_fallback("", model_ans, Decimal("5.00"))
    assert v4 == "wrong" and m4 == Decimal("0.00")
    print("Short answers fallback PASSED")

if __name__ == "__main__":
    test_compute_half_marks()
    test_verdict_to_marks()
    test_single_mcq()
    test_multi_select_mcq()
    test_short_answers_fallback()
    print("\n>>> ALL TEST ASSERTIONS PASSED SUCCESSFULLY! <<<")
