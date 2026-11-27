"""
Database seed script for the Secure Examination Management System.

Safe to re-run: truncates existing data (resetting IDs) and inserts fresh demo data.
Run from project root: python seed.py
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import bcrypt
from sqlalchemy import text

from app.core.database import SessionLocal
from app.models import (
    Answer,
    Attempt,
    Attendance,
    Enrollment,
    Exam,
    ExamQuestion,
    ExamStatus,
    Question,
    QuestionType,
    Result,
    User,
    UserRole,
)


def hash_password(plain_password: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def build_question_bank(creator_id: int) -> list[Question]:
    """Create 30 realistic questions across categories, difficulties, and all 3 types."""
    # (category, difficulty, type, prompt, options, correct_answer, marks)
    raw_questions = [
        # --- Python (6) ---
        (
            "Python",
            "easy",
            QuestionType.SINGLE_MCQ,
            "Which keyword defines a function in Python?",
            [{"key": "A", "text": "func"}, {"key": "B", "text": "def"}, {"key": "C", "text": "function"}, {"key": "D", "text": "lambda"}],
            "B",
            Decimal("2.00"),
        ),
        (
            "Python",
            "easy",
            QuestionType.SINGLE_MCQ,
            "What is the output type of range(5) in Python 3?",
            [{"key": "A", "text": "list"}, {"key": "B", "text": "tuple"}, {"key": "C", "text": "range"}, {"key": "D", "text": "set"}],
            "C",
            Decimal("2.00"),
        ),
        (
            "Python",
            "medium",
            QuestionType.MULTI_SELECT,
            "Which of the following Python built-in types are immutable?",
            [{"key": "A", "text": "tuple"}, {"key": "B", "text": "list"}, {"key": "C", "text": "str"}, {"key": "D", "text": "dict"}],
            ["A", "C"],
            Decimal("4.00"),
        ),
        (
            "Python",
            "medium",
            QuestionType.SINGLE_MCQ,
            "Which FastAPI decorator registers an HTTP GET endpoint?",
            [{"key": "A", "text": "@app.route_get"}, {"key": "B", "text": "@app.get"}, {"key": "C", "text": "@app.fetch"}, {"key": "D", "text": "@router.read"}],
            "B",
            Decimal("2.00"),
        ),
        (
            "Python",
            "hard",
            QuestionType.MULTI_SELECT,
            "Which statements about Python asyncio are true?",
            [
                {"key": "A", "text": "async def defines a coroutine function"},
                {"key": "B", "text": "await can be used outside async functions"},
                {"key": "C", "text": "asyncio runs cooperative multitasking on an event loop"},
                {"key": "D", "text": "asyncio removes the GIL completely"},
            ],
            ["A", "C"],
            Decimal("4.00"),
        ),
        (
            "Python",
            "medium",
            QuestionType.WRITTEN,
            "Explain the difference between a list and a tuple in Python.",
            None,
            {"model_answer": "Lists are mutable and use square brackets; tuples are immutable, use parentheses, and can be dictionary keys if elements are hashable."},
            Decimal("5.00"),
        ),
        # --- Databases (6) ---
        (
            "Databases",
            "easy",
            QuestionType.SINGLE_MCQ,
            "Which SQL clause filters rows before grouping?",
            [{"key": "A", "text": "HAVING"}, {"key": "B", "text": "WHERE"}, {"key": "C", "text": "ORDER BY"}, {"key": "D", "text": "GROUP BY"}],
            "B",
            Decimal("2.00"),
        ),
        (
            "Databases",
            "easy",
            QuestionType.SINGLE_MCQ,
            "Which PostgreSQL type stores timezone-aware timestamps?",
            [{"key": "A", "text": "TIMESTAMP"}, {"key": "B", "text": "DATE"}, {"key": "C", "text": "TIMESTAMPTZ"}, {"key": "D", "text": "INTERVAL"}],
            "C",
            Decimal("2.00"),
        ),
        (
            "Databases",
            "medium",
            QuestionType.MULTI_SELECT,
            "Which properties belong to ACID transactions?",
            [{"key": "A", "text": "Atomicity"}, {"key": "B", "text": "Availability"}, {"key": "C", "text": "Isolation"}, {"key": "D", "text": "Durability"}],
            ["A", "C", "D"],
            Decimal("4.00"),
        ),
        (
            "Databases",
            "medium",
            QuestionType.SINGLE_MCQ,
            "What does ON DELETE CASCADE do on a foreign key?",
            [
                {"key": "A", "text": "Blocks deleting the parent row"},
                {"key": "B", "text": "Deletes child rows automatically when the parent row is deleted"},
                {"key": "C", "text": "Sets the child primary key to NULL"},
                {"key": "D", "text": "Creates an index automatically"},
            ],
            "B",
            Decimal("2.00"),
        ),
        (
            "Databases",
            "hard",
            QuestionType.MULTI_SELECT,
            "Which techniques improve read query performance in PostgreSQL?",
            [
                {"key": "A", "text": "Adding B-tree indexes on filtered foreign keys"},
                {"key": "B", "text": "Using partial indexes for common subsets"},
                {"key": "C", "text": "Disabling primary keys"},
                {"key": "D", "text": "Using EXPLAIN ANALYZE to inspect slow plans"},
            ],
            ["A", "B", "D"],
            Decimal("4.00"),
        ),
        (
            "Databases",
            "hard",
            QuestionType.WRITTEN,
            "Why does PostgreSQL require a trigger instead of a CHECK constraint to validate a value against another table?",
            None,
            {"model_answer": "PostgreSQL CHECK constraints can only inspect columns of the current row and cannot run subqueries against other tables; a BEFORE INSERT/UPDATE trigger can query related tables and raise an exception."},
            Decimal("5.00"),
        ),
        # --- Computer Networks (6) ---
        (
            "Computer Networks",
            "easy",
            QuestionType.SINGLE_MCQ,
            "Which port is the default for HTTPS traffic?",
            [{"key": "A", "text": "80"}, {"key": "B", "text": "22"}, {"key": "C", "text": "443"}, {"key": "D", "text": "5432"}],
            "C",
            Decimal("2.00"),
        ),
        (
            "Computer Networks",
            "easy",
            QuestionType.SINGLE_MCQ,
            "Which protocol resolves domain names into IP addresses?",
            [{"key": "A", "text": "DHCP"}, {"key": "B", "text": "DNS"}, {"key": "C", "text": "ARP"}, {"key": "D", "text": "ICMP"}],
            "B",
            Decimal("2.00"),
        ),
        (
            "Computer Networks",
            "medium",
            QuestionType.MULTI_SELECT,
            "Which protocols operate at the Transport Layer?",
            [{"key": "A", "text": "TCP"}, {"key": "B", "text": "IP"}, {"key": "C", "text": "UDP"}, {"key": "D", "text": "HTTP"}],
            ["A", "C"],
            Decimal("4.00"),
        ),
        (
            "Computer Networks",
            "medium",
            QuestionType.SINGLE_MCQ,
            "Which HTTP status code indicates an unauthorized request lacking valid authentication?",
            [{"key": "A", "text": "400"}, {"key": "B", "text": "401"}, {"key": "C", "text": "404"}, {"key": "D", "text": "500"}],
            "B",
            Decimal("2.00"),
        ),
        (
            "Computer Networks",
            "hard",
            QuestionType.SINGLE_MCQ,
            "What is the first message sent in a TCP three-way handshake?",
            [{"key": "A", "text": "ACK"}, {"key": "B", "text": "SYN-ACK"}, {"key": "C", "text": "SYN"}, {"key": "D", "text": "FIN"}],
            "C",
            Decimal("2.00"),
        ),
        (
            "Computer Networks",
            "medium",
            QuestionType.WRITTEN,
            "Briefly contrast TCP and UDP in terms of reliability and use cases.",
            None,
            {"model_answer": "TCP is connection-oriented and guarantees ordered, reliable delivery (used for web/HTTP and DBs); UDP is connectionless with lower overhead and no delivery guarantee (used for streaming, DNS, gaming)."},
            Decimal("5.00"),
        ),
        # --- Operating Systems (6) ---
        (
            "Operating Systems",
            "easy",
            QuestionType.SINGLE_MCQ,
            "Which scheduling algorithm runs the process with the shortest next CPU burst first?",
            [{"key": "A", "text": "FCFS"}, {"key": "B", "text": "Round Robin"}, {"key": "C", "text": "SJF"}, {"key": "D", "text": "LIFO"}],
            "C",
            Decimal("2.00"),
        ),
        (
            "Operating Systems",
            "easy",
            QuestionType.SINGLE_MCQ,
            "What is a thread inside a process?",
            [
                {"key": "A", "text": "An independent physical CPU"},
                {"key": "B", "text": "The smallest unit of execution sharing process memory"},
                {"key": "C", "text": "A disk partition"},
                {"key": "D", "text": "A kernel-only driver"},
            ],
            "B",
            Decimal("2.00"),
        ),
        (
            "Operating Systems",
            "medium",
            QuestionType.MULTI_SELECT,
            "Which conditions are necessary for a deadlock to occur?",
            [
                {"key": "A", "text": "Mutual exclusion"},
                {"key": "B", "text": "Hold and wait"},
                {"key": "C", "text": "Preemption allowed"},
                {"key": "D", "text": "Circular wait"},
            ],
            ["A", "B", "D"],
            Decimal("4.00"),
        ),
        (
            "Operating Systems",
            "medium",
            QuestionType.SINGLE_MCQ,
            "Which data structure maps virtual pages to physical frames?",
            [{"key": "A", "text": "Page table"}, {"key": "B", "text": "Stack frame"}, {"key": "C", "text": "Inode"}, {"key": "D", "text": "Semaphore"}],
            "A",
            Decimal("2.00"),
        ),
        (
            "Operating Systems",
            "hard",
            QuestionType.SINGLE_MCQ,
            "What happens during a context switch?",
            [
                {"key": "A", "text": "The disk is formatted"},
                {"key": "B", "text": "CPU state of the current process is saved and another process's state is loaded"},
                {"key": "C", "text": "Virtual memory is disabled"},
                {"key": "D", "text": "All open sockets are closed"},
            ],
            "B",
            Decimal("2.00"),
        ),
        (
            "Operating Systems",
            "medium",
            QuestionType.WRITTEN,
            "Explain the difference between a mutex and a counting semaphore.",
            None,
            {"model_answer": "A mutex provides exclusive locking owned by one thread at a time for mutual exclusion; a counting semaphore tracks N available resource units and can be signaled by any thread."},
            Decimal("5.00"),
        ),
        # --- Web Security (6) ---
        (
            "Web Security",
            "easy",
            QuestionType.SINGLE_MCQ,
            "Why should passwords be hashed with bcrypt or Argon2 instead of SHA-256?",
            [
                {"key": "A", "text": "SHA-256 is reversible"},
                {"key": "B", "text": "bcrypt/Argon2 are slow and salted, resisting brute-force attacks"},
                {"key": "C", "text": "bcrypt encrypts passwords so admins can read them"},
                {"key": "D", "text": "SHA-256 only works on numbers"},
            ],
            "B",
            Decimal("2.00"),
        ),
        (
            "Web Security",
            "easy",
            QuestionType.SINGLE_MCQ,
            "What prevents SQL injection when using SQLAlchemy?",
            [
                {"key": "A", "text": "String concatenation"},
                {"key": "B", "text": "Parameterized / bound queries"},
                {"key": "C", "text": "Hiding form inputs in CSS"},
                {"key": "D", "text": "Base64 encoding"},
            ],
            "B",
            Decimal("2.00"),
        ),
        (
            "Web Security",
            "medium",
            QuestionType.MULTI_SELECT,
            "Which practices protect an online examination backend?",
            [
                {"key": "A", "text": "Enforcing role permissions on the server"},
                {"key": "B", "text": "Using server time for exam deadlines"},
                {"key": "C", "text": "Sending correct answers to the browser during the test"},
                {"key": "D", "text": "Storing credentials in .env outside Git"},
            ],
            ["A", "B", "D"],
            Decimal("4.00"),
        ),
        (
            "Web Security",
            "medium",
            QuestionType.MULTI_SELECT,
            "Which HTTP response headers or flags harden session cookies?",
            [{"key": "A", "text": "HttpOnly"}, {"key": "B", "text": "Secure"}, {"key": "C", "text": "SameSite"}, {"key": "D", "text": "PlainText"}],
            ["A", "B", "C"],
            Decimal("4.00"),
        ),
        (
            "Web Security",
            "hard",
            QuestionType.WRITTEN,
            "Why must exam deadlines be enforced using the server clock instead of the client's browser clock?",
            None,
            {"model_answer": "A candidate can alter their local device clock or modify client-side JavaScript timers to gain extra time; the server clock is authoritative and cannot be tampered with by the browser."},
            Decimal("5.00"),
        ),
        (
            "Web Security",
            "hard",
            QuestionType.WRITTEN,
            "Why should role-based authorization be enforced on backend routes rather than only hiding UI buttons?",
            None,
            {"model_answer": "Hiding buttons in the frontend only affects the visual interface; anyone can call API endpoints directly with curl or DevTools, so every route must verify authentication and role permissions on the server."},
            Decimal("5.00"),
        ),
    ]

    return [
        Question(
            created_by=creator_id,
            category=cat,
            difficulty=diff,
            type=q_type,
            prompt=prompt,
            options=options,
            correct_answer=correct,
            marks=marks,
            is_active=True,
        )
        for cat, diff, q_type, prompt, options, correct, marks in raw_questions
    ]


def seed() -> None:
    """Clear existing rows and populate realistic demo data."""
    now = datetime.now(timezone.utc)
    db = SessionLocal()

    try:
        # Clear all tables safely and reset SERIAL IDs so re-runs are deterministic.
        db.execute(
            text(
                """
                TRUNCATE TABLE
                    audit_log,
                    scratchpad_notes,
                    user_preferences,
                    reports,
                    announcements,
                    incidents,
                    results,
                    answers,
                    attempts,
                    attendance,
                    enrollments,
                    exam_questions,
                    exams,
                    questions,
                    login_sessions,
                    users
                RESTART IDENTITY CASCADE;
                """
            )
        )

        # 1. Users: 1 admin, 2 examiners, 15 students
        admin = User(
            full_name="System Admin",
            email="admin@exam.local",
            password_hash=hash_password("Admin@123"),
            role=UserRole.ADMIN,
            phone="+923001000001",
            is_active=True,
        )
        examiner1 = User(
            full_name="Dr. Ayesha Khan",
            email="examiner1@exam.local",
            password_hash=hash_password("Examiner@123"),
            role=UserRole.EXAMINER,
            phone="+923001000002",
            is_active=True,
        )
        examiner2 = User(
            full_name="Prof. Bilal Ahmed",
            email="examiner2@exam.local",
            password_hash=hash_password("Examiner@123"),
            role=UserRole.EXAMINER,
            phone="+923001000003",
            is_active=True,
        )

        student_names = [
            "Ali Raza",
            "Fatima Noor",
            "Hassan Tariq",
            "Zainab Malik",
            "Usman Farooq",
            "Hira Siddiqui",
            "Hamza Javed",
            "Mariam Zahid",
            "Saad Mahmood",
            "Amina Khalid",
            "Omar Qureshi",
            "Sana Iqbal",
            "Daniyal Sheikh",
            "Nadia Hussain",
            "Taha Butt",
        ]
        student_pw_hash = hash_password("Student@123")
        students = [
            User(
                full_name=name,
                email=f"student{i}@exam.local",
                password_hash=student_pw_hash,
                role=UserRole.STUDENT,
                roll_number=f"FA23-BCS-{i:03d}",
                phone=f"+9230012345{i:02d}",
                is_active=True,
            )
            for i, name in enumerate(student_names, start=1)
        ]

        db.add_all([admin, examiner1, examiner2, *students])
        db.flush()

        # 2. Question bank: 30 questions
        questions = build_question_bank(examiner1.id)
        db.add_all(questions)
        db.flush()

        # 3. Exams: one in each status (completed, ongoing, published, draft)
        completed_questions = questions[0:10]   # Python (6) + Databases (4) -> mix of all 3 types
        ongoing_questions = questions[12:22]    # Networks + OS
        published_questions = questions[18:26]  # OS + Web Security
        draft_questions = questions[20:30]      # OS + Web Security

        def sum_marks(q_list: list[Question]) -> Decimal:
            return sum((q.marks for q in q_list), Decimal("0.00"))

        exam_completed = Exam(
            created_by=examiner1.id,
            title="Midterm: Python & Databases",
            instructions="Answer all questions carefully. Written answers will be graded manually.",
            mode="standard",
            publish_time=now - timedelta(days=3),
            end_time=now - timedelta(days=2),
            duration_minutes=60,
            total_marks=sum_marks(completed_questions),
            violation_limit=3,
            status=ExamStatus.COMPLETED,
            shuffle_questions=False,
            shuffle_options=False,
        )
        exam_ongoing = Exam(
            created_by=examiner1.id,
            title="Live Quiz: Computer Networks & OS",
            instructions="Do not switch tabs. Your answers auto-save continuously.",
            mode="proctored",
            publish_time=now - timedelta(minutes=25),
            end_time=now + timedelta(minutes=95),
            duration_minutes=60,
            total_marks=sum_marks(ongoing_questions),
            violation_limit=3,
            status=ExamStatus.ONGOING,
            shuffle_questions=True,
            shuffle_options=True,
        )
        exam_published = Exam(
            created_by=examiner2.id,
            title="Upcoming Assessment: OS & Web Security",
            instructions="Exam opens tomorrow at the scheduled publish time.",
            mode="standard",
            publish_time=now + timedelta(days=1),
            end_time=now + timedelta(days=1, hours=2),
            duration_minutes=45,
            total_marks=sum_marks(published_questions),
            violation_limit=3,
            status=ExamStatus.PUBLISHED,
            shuffle_questions=True,
            shuffle_options=False,
        )
        exam_draft = Exam(
            created_by=examiner2.id,
            title="Final Comprehensive Exam (Draft)",
            instructions="Draft under review by examiners.",
            mode="randomized",
            publish_time=None,
            end_time=None,
            duration_minutes=90,
            total_marks=sum_marks(draft_questions),
            violation_limit=5,
            status=ExamStatus.DRAFT,
            shuffle_questions=True,
            shuffle_options=True,
        )

        exams = [exam_completed, exam_ongoing, exam_published, exam_draft]
        db.add_all(exams)
        db.flush()

        # Attach questions to each exam
        exam_question_map = [
            (exam_completed, completed_questions),
            (exam_ongoing, ongoing_questions),
            (exam_published, published_questions),
            (exam_draft, draft_questions),
        ]
        for exam_obj, q_list in exam_question_map:
            for idx, q in enumerate(q_list, start=1):
                db.add(
                    ExamQuestion(
                        exam_id=exam_obj.id,
                        question_id=q.id,
                        order_index=idx,
                    )
                )

        # 4. Enrollments & Attendance
        for exam_obj in [exam_completed, exam_ongoing, exam_published]:
            for s in students:
                db.add(
                    Enrollment(
                        exam_id=exam_obj.id,
                        student_id=s.id,
                        enrolled_by=examiner1.id,
                    )
                )
        for s in students[:10]:
            db.add(
                Enrollment(
                    exam_id=exam_draft.id,
                    student_id=s.id,
                    enrolled_by=examiner2.id,
                )
            )

        # Mark most students present on completed and ongoing exams
        for idx, s in enumerate(students):
            db.add(
                Attendance(
                    exam_id=exam_completed.id,
                    student_id=s.id,
                    status="present" if idx < 13 else "absent",
                    checked_in_at=(now - timedelta(days=3) + timedelta(minutes=idx)) if idx < 13 else None,
                    marked_by=examiner1.id,
                )
            )
            db.add(
                Attendance(
                    exam_id=exam_ongoing.id,
                    student_id=s.id,
                    status="present" if idx < 12 else ("late" if idx == 12 else "absent"),
                    checked_in_at=(now - timedelta(minutes=20 - idx)) if idx < 13 else None,
                    marked_by=examiner1.id,
                )
            )

        db.flush()

        # 5. Finished attempts, answers, and published results for 10 students on completed exam
        # Score ratios vary across students so analytics & PDFs show realistic spread.
        performance_profiles = [
            Decimal("1.00"),  # Student 1: full score
            Decimal("0.92"),  # Student 2: high
            Decimal("0.85"),  # Student 3: high
            Decimal("0.75"),  # Student 4: solid
            Decimal("0.68"),  # Student 5: average-good
            Decimal("0.60"),  # Student 6: average
            Decimal("0.52"),  # Student 7: borderline
            Decimal("0.40"),  # Student 8: low
            Decimal("0.30"),  # Student 9: low
            Decimal("0.20"),  # Student 10: very low
        ]

        snapshot_questions = [
            {
                "question_id": q.id,
                "type": q.type.value,
                "prompt": q.prompt,
                "options": q.options,
                "marks": str(q.marks),
            }
            for q in completed_questions
        ]

        for idx, ratio in enumerate(performance_profiles):
            student = students[idx]
            started = now - timedelta(days=3, hours=-1) + timedelta(minutes=idx * 2)
            deadline = started + timedelta(minutes=exam_completed.duration_minutes)
            submitted = deadline - timedelta(minutes=5) if idx < 8 else deadline

            attempt = Attempt(
                exam_id=exam_completed.id,
                student_id=student.id,
                started_at=started,
                server_deadline=deadline,
                submitted_at=submitted,
                submit_reason="manual" if idx < 8 else "timeout",
                violation_count=0 if idx < 6 else (1 if idx < 9 else 2),
                frozen_snapshot={"questions": snapshot_questions},
                is_sandbox=False,
            )
            db.add(attempt)
            db.flush()

            total_awarded = Decimal("0.00")

            for q_idx, q in enumerate(completed_questions):
                # Decide whether this student answered correctly/partially/wrong/skipped
                # based on their target performance ratio.
                threshold = Decimal(q_idx + 1) / Decimal(len(completed_questions))
                is_skipped = ratio <= Decimal("0.35") and q_idx >= 7

                if is_skipped:
                    ans_status = "unanswered"
                    selected = None
                    written = None
                    awarded = Decimal("0.00")
                elif q.type == QuestionType.SINGLE_MCQ:
                    ans_status = "answered"
                    is_correct = threshold <= ratio
                    selected = q.correct_answer if is_correct else ("A" if q.correct_answer != "A" else "D")
                    written = None
                    awarded = q.marks if is_correct else Decimal("0.00")
                elif q.type == QuestionType.MULTI_SELECT:
                    ans_status = "answered"
                    if threshold <= ratio:
                        selected = q.correct_answer
                        awarded = q.marks
                    elif threshold <= ratio + Decimal("0.20"):
                        # Partial credit (half marks, safely <= q.marks)
                        selected = [q.correct_answer[0]]
                        awarded = (q.marks / Decimal("2")).quantize(Decimal("0.01"))
                    else:
                        selected = ["D"]
                        awarded = Decimal("0.00")
                    written = None
                else:  # QuestionType.WRITTEN
                    ans_status = "answered"
                    selected = None
                    written = f"Student {student.roll_number} answer for question {q.id}."
                    awarded = (q.marks * ratio).quantize(Decimal("0.01"))
                    if awarded > q.marks:
                        awarded = q.marks

                total_awarded += awarded
                db.add(
                    Answer(
                        attempt_id=attempt.id,
                        question_id=q.id,
                        selected_options=selected,
                        written_response=written,
                        status=ans_status,
                        marks_awarded=awarded,
                        graded_by=examiner1.id,
                        graded_at=now - timedelta(days=1),
                    )
                )

            db.add(
                Result(
                    attempt_id=attempt.id,
                    exam_id=exam_completed.id,
                    student_id=student.id,
                    total_score=total_awarded,
                    max_score=exam_completed.total_marks,
                    is_published=True,
                    published_by=examiner1.id,
                    published_at=now - timedelta(hours=12),
                )
            )

        db.commit()

        print("=== Demo Seed Complete ===")
        print(f"Users: 1 admin, 2 examiners, {len(students)} students")
        print(f"Questions: {len(questions)} | Exams: {len(exams)} | Completed Exam Attempts/Results: {len(performance_profiles)}")
        print("\nDemo Logins:")
        print("  Admin     : admin@exam.local     / Admin@123")
        print("  Examiner 1: examiner1@exam.local / Examiner@123")
        print("  Examiner 2: examiner2@exam.local / Examiner@123")
        print("  Student 1 : student1@exam.local  / Student@123  (FA23-BCS-001)")
        print("  Student 2 : student2@exam.local  / Student@123  (FA23-BCS-002)")
        print("  Student 3 : student3@exam.local  / Student@123  (FA23-BCS-003)")
        print("  (Students 1..15 all use Student@123)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
