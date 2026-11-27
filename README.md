HEAD
# AI Quiz Creation: Secure Examination Management System
 
**Create, run and review online exams, with AI-assisted authoring and privacy-friendly proctoring**
**Built for Technoverse 5.0 / Web-E-Thon, COMSATS University Lahore**
 
![Roles](https://img.shields.io/badge/roles-Admin%20%7C%20Examiner%20%7C%20Candidate-blue?style=flat)
![Proctoring](https://img.shields.io/badge/proctoring-event--based%2C%20no%20recording-green?style=flat)
![AI](https://img.shields.io/badge/AI-optional%2C%20free%20or%20local-orange?style=flat)
 
---
 
> Most online exam tools fail at the moments that matter: a refresh, a dropped connection, a double click on Submit.
> This system is built so those moments are boring. The server owns the clock, the answers and the rules.
 
---
 
## Table of Contents
 
- [What You Get](#what-you-get)
- [How It Works](#how-it-works)
- [Features by Role](#features-by-role)
- [Design Decisions](#design-decisions)
- [Getting Started](#getting-started)
- [Architecture](#architecture)
- [Innovation Challenges](#innovation-challenges)
- [AI Features](#ai-features)
- [Known Limitations](#known-limitations)
---
 
## What You Get
 
- **AI-assisted exam creation:** generate MCQ and short-answer questions by topic, difficulty, count and marks, or write them manually. Manual creation always works.
- **Server-trusted timing:** deadline = `min(start time + duration, exam end time)`, computed on the server. The device clock is never trusted.
- **Failure-resilient attempts:** autosave, offline answer queue, and full resume after refresh or device change with remaining time preserved.
- **Privacy-friendly integrity:** violations are logged as events (type and timestamp) instead of recordings, and shown to examiners as "for review", never as proof of misconduct.
- **Clear submission reasons:** every submission is tagged manual, timeout or violation.
- **AI-suggested grading with human control:** the examiner approves or edits every suggested mark.
- **Verifiable reports:** PDFs carry a verification ID or QR that resolves on a public page showing only minimal, non-sensitive information.
- **Login visibility for admins:** who is online now, and a full history with IP and device details.
[↑ Back to top ↑](#table-of-contents)
 
---
 
## How It Works
 
The system follows a **server-authoritative exam model**: the frontend shows
and captures, the backend decides, the database remembers. Every request from
every role passes through the same permission checks, and nothing about time,
eligibility or marks is ever decided in the browser.
 
```
┌─────────────────────────────────────────────────────────┐
│  Same exam. One server clock. Three roles.              │
│                                                         │
│  Admin ──────┐                                          │
│  Examiner ───┼───  Backend  ───  Database    (trusted)  │
│  Candidate ──┘     rules · time · grading     (stored)  │
└─────────────────────────────────────────────────────────┘
```
 
The server resolves who may enter, when the exam ends and what each answer is
worth. The browser only displays a countdown that the server keeps correcting,
so a changed device clock, a hidden button or a replayed request changes nothing.
 
**What the system handles automatically:**
 
- Deadline calculation and expiry, using server time only
- Eligibility check: enrolled AND present AND inside the availability window
- Frozen attempts: shuffled question order, options and marking scheme saved at start
- Autosave, offline answer queue, and resume after refresh or device change
- Violation counting, warning, and auto-submit at the configured limit
- Idempotent submission, so double clicks and retries count once
- MCQ auto-grading and consistent total scores from stored per-question marks
- Report generation with a verification ID or QR
- Exclusion of sandbox attempts from every statistic
**What you do:**
 
- **Administrator:** manage users and watch current and past logins
- **Examiner:** create the exam (manually or with AI), review it, publish it, mark attendance, approve grades
- **Candidate:** open the exam when it unlocks and answer the questions
### Exam Lifecycle and Attempt Flow
 
The workflow from exam creation to a verifiable result:
 
```
Exam:  draft ──► review ──► published ──► ongoing ──► completed
                              │
                   enrollment + attendance
                              │
                              ▼
                  Attempt  (frozen snapshot)
                    ├─ answers     autosave, resume
                    ├─ incidents   warning, then auto-submit
                    └─ submit      manual | timeout | violation
                              │
                              ▼
          grading ──► results ──► PDF + verification ID  ·  CSV
          (auto MCQ,             (own results only, aggregates
           AI-suggested,          for class average and highest)
           examiner-approved)
```
 
**One rule gates the exam** – a single shared check, used everywhere:
 
```
eligible = enrolled AND present AND now ∈ [publish_at, deadline]
```
 
where `deadline = min(start time + duration, exam end time)`, always computed on the server.
 
For the full list of rules and modules, see [Architecture](#architecture).
 
[↑ Back to top ↑](#table-of-contents)
 
---
 
## Features by Role
 
### Administrator
 
- **Login monitoring:** Current Logins (recent activity) and All Logins history for teachers and students
- **Per-login details:** name, roll number (students), email, picture, IP address, device/OS/browser, login time, last seen
- **User management:** create, read, update, delete, role assignment, enable/disable
- **Profile pictures:** upload with initials fallback
### Examiner
 
- **Exam creation:** manual or AI-generated; short answers, MCQs or both
- **Settings:** duration, publish time, end time, violation limit, attendance on/off
- **Lifecycle view:** draft, published, ongoing, completed
- **Review before publishing:** full preview of details and questions
- **Attendance:** only students marked present can see and enter the exam
- **Submissions:** who submitted, why (manual, timeout, violation), violation count and incident list, with a reinstate action
- **Grading:** automatic for MCQs; AI suggestions for short answers (correct, partially correct, wrong, unattempted) that the examiner can approve or edit
- **Results:** per-student PDF, class CSV (roll number, name, marks), highest / average / lowest marks, per-question analytics
- **Live monitoring and announcements** during an exam
- **Sandbox preview:** experience the exam as a candidate without affecting real data
### Candidate
 
- **Exam list:** available, upcoming and completed, with instructions and access status
- **Workspace:** one question at a time, left-side palette, mark for review, autosave status, submit confirmation
- **Palette colors:** attempted and marked-for-review questions are visually distinct; clicking a number jumps to that question
- **Extras:** digital scratchpad, workspace preferences (font size, theme, layout), network status indicator
- **After results are published:** total marks, downloadable PDF, class average and highest marks (aggregates only)
### Secondary Features
 
| No. | Feature | What it does |
| --- | --- | --- |
| 4.1 | Network-aware interface | Online/offline banner, saving status, local answer queue that syncs on reconnect |
| 4.2 | PDF reports | Server-side PDFs for students and examiners, access-controlled |
| 4.3 | Exam sandbox | Examiner previews as a candidate; attempts flagged `is_sandbox` and excluded from all statistics |
| 4.4 | Bulk import | CSV for candidates, JSON/CSV for questions, with row-level validation and an error report |
| 4.5 | Question analytics | Skipped counts, common wrong answers, observed difficulty |
| 4.6 | Verifiable reports | Verification ID or QR on every PDF, with a public verification page |
| 4.7 | Customizable workspace | Font size, theme and layout saved per user |
| 4.8 | Digital scratchpad | Notes panel inside the exam, saved per attempt |
 
[↑ Back to top ↑](#table-of-contents)
 
---
 
## Design Decisions
 
| Decision | What we do | Why |
| --- | --- | --- |
| **Recording** | No screen, face or voice recording. Event-based monitoring only | Protects candidate privacy and avoids heavy video storage |
| **Timing** | Server computes every deadline | Device clocks can be changed |
| **Permissions** | Enforced in backend middleware on every endpoint | Hidden buttons are not security |
| **Answer keys** | Never sent to candidates before results are published | Prevents leaks through the network tab |
| **Incidents** | Labeled "for review", with a reinstate option | Indicators are not proof of cheating |
| **Real-time updates** | Polling every 5-10 seconds | Simpler and more robust than WebSockets for this scale |
| **Statistics** | Sandbox attempts filtered in one shared place | Preview runs can never skew real results |
| **AI** | Suggests only; fallback always available | A demo and a real exam must never depend on one model |
 
[↑ Back to top ↑](#table-of-contents)
 
---
 
## Getting Started
 
### Requirements
 
| Dependency | Minimum | Notes |
| --- | --- | --- |
| Runtime | `TODO` | e.g. Node.js / Python version |
| Database | `TODO` | PostgreSQL or SQLite |
| Browser | Chrome, Edge, Firefox (latest) | Fullscreen API required for proctoring |
| Ollama | Optional | Only for local AI generation and grading |
 
### Quick Start
 
```bash
git clone https://github.com/munibashami07-oss/AI-QUIZ-Creation.git
cd AI-QUIZ-Creation
 
# install dependencies
TODO
 
# configure environment
cp .env.example .env
 
# create tables and load demo data
TODO
 
# run
TODO
```
 
### Demo Accounts
 
All data is fictional.
 
| Role | Email | Password |
| --- | --- | --- |
| Administrator | `TODO` | `TODO` |
| Examiner | `TODO` | `TODO` |
| Student | `TODO` | `TODO` |
 
The seed data includes one administrator, two examiners, about 15 students with roll numbers, a categorized question bank, exams in every state (draft, published, ongoing, completed), completed attempts with results, and sample login sessions with different IPs and devices.
 
### Try the Core Flow
 
1. Log in as **Admin** and open Current Logins and user management.
2. Log in as **Examiner**, create an exam (try the AI generator), review, publish, mark attendance.
3. Log in as **Student**, wait for the countdown, start the attempt, trigger a violation, refresh to see resume, then submit.
4. Back as **Examiner**, open Submissions (note the reasons), grade, publish results, download the PDF and CSV.
5. Open a PDF's verification link to see the public verification page.
[↑ Back to top ↑](#table-of-contents)
 
---
 
## Architecture
 
### Layers
 
| Layer | Responsibility |
| --- | --- |
| **Frontend** | Role dashboards, exam workspace, palette, timer display, fullscreen and violation capture, offline indicator, scratchpad, preferences, charts, validated forms |
| **Backend** | Authentication, authorization, exam lifecycle, attempt engine, violation handling, grading, AI integration, PDF/CSV generation, import, login tracking, monitoring |
| **Database** | Users, sessions, exams, questions, attempts with snapshots, answers, results, incidents, attendance, reports, preferences, audit log |
 
### Tech Stack
 
| Layer | Technology |
| --- | --- |
| Frontend | `TODO` |
| Backend | `TODO` |
| Database | `TODO` |
| AI | `TODO` (free or local model, with keyword fallback) |
| Hosting | `TODO` |
 
### Backend Modules
 
| Module | What it does |
| --- | --- |
| Authentication | Hashed passwords, session or JWT, logout, disabled-account blocking |
| Authorization | Role and ownership checks on every endpoint |
| Login tracking | Session record at login (IP, parsed user agent), heartbeat, logout time |
| Exam lifecycle | Draft, published, ongoing, completed, enforced on the server |
| Attempt engine | Start, frozen snapshot, server deadline, autosave, resume, auto-finalize, idempotent submit |
| Violation handling | Records type and time, increments the count, auto-submits at the limit |
| Reports and verification | Server-side PDFs with verification ID or QR, public verification endpoint |
| Analytics | Exam-level and question-level statistics, sandbox excluded |
 
### API Groups
 
| Group | Examples |
| --- | --- |
| `/auth` | login, logout, me, heartbeat |
| `/admin/users` | list, create, update, delete, role, status |
| `/admin/logins` | current, history |
| `/exams` | create, list, get, update, publish, preview, status |
| `/questions` | CRUD, import, ai-generate |
| `/exams/:id/enrollments` | enroll, list, attendance |
| `/attempts` | start, current, answer, submit, violation, time |
| `/exams/:id/submissions` | list with submit reason and violation count |
| `/grading` | pending, mark, ai-suggest, finalize |
| `/results` | publish, mine, class-stats, csv |
| `/reports` | student PDF, examiner PDF, public verify |
| `/monitor` | active attempts, incidents, announcements |
| `/prefs`, `/scratchpad` | preferences and notes |
 
### Data Model
 
`users` · `login_sessions` · `questions` · `exams` · `exam_questions` · `enrollments` · `attendance` · `attempts` · `answers` · `results` · `incidents` · `announcements` · `reports` · `user_preferences` · `scratchpad_notes` · `audit_log` · `disputes` (optional)
 
Key guarantees:
 
- One real attempt per student per exam (unique `(exam_id, student_id)` for non-sandbox attempts)
- Autosave updates a row instead of duplicating it (unique `(attempt_id, question_id)`)
- Awarded marks are constrained between 0 and the question's marks
- All timestamps are stored in UTC and the server sends its own "now" to the client
[↑ Back to top ↑](#table-of-contents)
 
---
 
## Innovation Challenges
 
### Primary: 5.3 Failure-Resilient Examinations
 
- Server-side timer and deadline, independent of the device clock
- Autosave plus a local offline queue that syncs on reconnect
- Full resume after refresh or device change, with remaining time preserved
- Disconnects never count as violations
- The deadline never moves, so nobody gains extra time
### Secondary: 5.1 Integrity (privacy-friendly)
 
- Event-based violation log with exact types and timestamps
- Grace countdown after the first violation, configurable limit
- Examiner review page with a reinstate option
- No recording by design, to protect candidate privacy
### Optional: 5.4 Disputes
 
A candidate dispute form, an examiner response, and an audit log of every grade change.
 
[↑ Back to top ↑](#table-of-contents)
 
---
 
## AI Features
 
- **Question generation:** topic, difficulty, count, type and marks in; structured questions out
- **Grading suggestions:** for short answers, a proposed status and marks that the examiner approves or edits
- **No paid dependencies:** no required feature relies on a paid API, paid key or billing service. Use a local model (for example Ollama) or a free option
- **Always-working fallback:** keyword or similarity scoring proposes marks if AI is unavailable, and manual creation and grading are always available
[↑ Back to top ↑](#table-of-contents)
 
---
 
## Known Limitations
 
- Browsers cannot read the exact phone model, so the **Device** column shows parsed device, OS and browser from the user agent
- Fullscreen is unreliable on iOS Safari and can be bypassed by a determined user, so it works as a deterrent rather than a guarantee
- Students only see class average and highest marks as aggregates, and only after results are published
- The student answer-key PDF is generated only after results are published
- A local AI model will not run on free hosting; the keyword fallback keeps grading working there
[↑ Back to top ↑](#table-of-contents)
 

# Secure Examination Management System

A FastAPI + PostgreSQL backend for running secure online examinations with role-based access, live proctoring, AI-assisted grading, and PDF result reports.

---

## Features

- **Three roles**: Admin, Examiner, Student — every route enforces JWT auth and role checks.
- **Question bank**: Single-MCQ, multi-select, and written (AI-evaluated via Gemini).
- **Exam lifecycle**: Draft → Published → Ongoing → Completed with server-enforced deadlines.
- **Live proctoring**: Tab-switch / fullscreen violations auto-submit at the limit; live monitor endpoint shows candidate status and last-seen.
- **Auto-grading**: MCQs graded immediately on submit; written answers evaluated by Gemini 2.5 Flash (keyword fallback if key absent) and queued for examiner review.
- **Results & reports**: PDF transcripts with QR codes, public verification URL, CSV export, class statistics.
- **Extras**: Announcements (global or exam-scoped), user preferences (theme/language), scratchpad notes per attempt (owner-only), immutable audit log.
- **Bulk import**: CSV upload for students with per-row validation and error reporting.

---

## Requirements

- Python 3.11+
- PostgreSQL 14+

---

## Installation

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd secure-exam-backend

# 2. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate        # Windows PowerShell
# source .venv/bin/activate   # Linux / macOS

# 3. Install dependencies
pip install -r requirements.txt
```

---

## Environment Setup

```bash
# Copy the example file and fill in your values
copy .env.example .env
```

Open `.env` and set at minimum:

| Variable | Description |
|---|---|
| `DB_HOST` | PostgreSQL host (e.g. `localhost`) |
| `DB_PORT` | PostgreSQL port (default `5432`) |
| `DB_NAME` | Database name (e.g. `secure_exam_db`) |
| `DB_USER` | PostgreSQL username |
| `DB_PASSWORD` | PostgreSQL password |
| `JWT_SECRET_KEY` | Long random secret (e.g. 64 hex chars) |
| `JWT_EXPIRE_MINUTES` | Token lifetime in minutes (e.g. `60`) |
| `GEMINI_API_KEY` | *(Optional)* Google Gemini key for AI grading |
| `PUBLIC_BASE_URL` | Base URL for QR code links (e.g. `http://127.0.0.1:8000`) |

---

## Database Setup

```bash
# Create the database in PostgreSQL first, then run migrations:
alembic upgrade head
```

Migrations apply in order: users table → all exam/attempt/extras tables → login session device columns → registration_status → announcement title column.

---

## Seed Demo Data

```bash
python seed.py
```

This truncates all tables and inserts:
- 1 admin, 2 examiners, 15 students
- 30 questions across 5 categories
- 4 exams (completed, ongoing, published, draft)
- 10 finished attempts with graded results (published)

---

## Running the Server

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API docs: http://127.0.0.1:8000/docs

---

## Demo Logins

| Role | Email | Password | Roll Number |
|---|---|---|---|
| Admin | `admin@exam.local` | `Admin@123` | — |
| Examiner 1 | `examiner1@exam.local` | `Examiner@123` | — |
| Examiner 2 | `examiner2@exam.local` | `Examiner@123` | — |
| Student 1 | `student1@exam.local` | `Student@123` | FA23-BCS-001 |
| Student 2 | `student2@exam.local` | `Student@123` | FA23-BCS-002 |
| *(Students 1–15)* | `studentN@exam.local` | `Student@123` | FA23-BCS-00N |

Students can also log in with their roll number instead of email.

---

## Key API Endpoints

### Auth
| Method | Path | Description |
|---|---|---|
| `POST` | `/auth/login` | Login (email or roll_number + password) |
| `GET` | `/auth/me` | Current user profile |
| `POST` | `/auth/heartbeat` | Keep session alive |
| `POST` | `/auth/logout` | Revoke session |
| `POST` | `/auth/register` | Student self-registration (multipart + photo) |

### Admin
| Method | Path | Description |
|---|---|---|
| `GET/POST` | `/admin/users` | List / create users |
| `PATCH/DELETE` | `/admin/users/{id}` | Update / delete user |
| `POST` | `/admin/users/import` | Bulk CSV import |
| `GET` | `/admin/registrations/pending` | Pending student registrations |
| `POST` | `/admin/registrations/{id}/approve` | Approve student |
| `GET` | `/admin/audit` | Audit log (filterable) |
| `GET` | `/admin/logins/current` | Currently active sessions |

### Examiner
| Method | Path | Description |
|---|---|---|
| `POST/GET` | `/examiner/questions` | Create / list questions |
| `POST/GET` | `/examiner/exams` | Create / list exams |
| `POST` | `/examiner/exams/{id}/enroll-bulk` | Bulk enroll by roll numbers |
| `POST` | `/examiner/exams/{id}/attendance` | Mark attendance |
| `GET` | `/examiner/exams/{id}/grading/pending` | Written answers needing review |
| `POST` | `/examiner/answers/{id}/grade` | Grade / approve written answer |
| `POST` | `/examiner/exams/{id}/publish-results` | Publish results |
| `GET` | `/examiner/exams/{id}/stats` | Class statistics |
| `GET` | `/examiner/exams/{id}/results.csv` | CSV export |

### Student
| Method | Path | Description |
|---|---|---|
| `GET` | `/student/exams` | My enrolled exams |
| `POST` | `/student/exams/{id}/start` | Start or resume attempt |
| `PUT` | `/student/attempts/{id}/answers/{qid}` | Autosave answer |
| `POST` | `/student/attempts/{id}/submit` | Submit attempt |
| `GET` | `/student/exams/{id}/result` | View published result |

### Extras
| Method | Path | Description |
|---|---|---|
| `GET` | `/exams/{id}/monitor` | Live proctor monitor |
| `POST/GET` | `/announcements` | Create / list announcements |
| `GET/PUT` | `/preferences` | User preferences |
| `GET/PUT` | `/attempts/{id}/scratchpad` | Scratchpad notes (owner only) |
| `GET` | `/results/{id}/pdf` | PDF result download |
| `GET` | `/verify/{verification_id}` | Public certificate verification |

---

## Security Notes

- Correct answers are **never** included in `frozen_snapshot` or any student-facing response.
- Server clock enforces all exam deadlines; client time is ignored.
- `SELECT FOR UPDATE` prevents duplicate submissions under concurrent requests.
- A PostgreSQL trigger (`trg_answers_check_marks`) enforces `marks_awarded ≤ question marks` at the DB level.
- All secrets are loaded from `.env` via `python-dotenv`; they never appear in code or responses.
- Student results are hidden until explicitly published by an examiner/admin.

---

## Project Structure

```
secure-exam-backend/
├── app/
│   ├── core/           # Settings, database engine, session factory
│   ├── models/         # SQLAlchemy 2.0 ORM models
│   ├── routers/        # FastAPI route handlers
│   ├── schemas/        # Pydantic request/response models
│   ├── services/       # Business logic (auth, attempt engine, grading, reports, …)
│   └── main.py         # FastAPI app entry point
├── alembic/            # Database migration scripts
├── seed.py             # Demo data seeder
├── requirements.txt
├── .env.example
└── README.md
```
 46c9ce7 (Add backend, Neon database setup and migrations)
