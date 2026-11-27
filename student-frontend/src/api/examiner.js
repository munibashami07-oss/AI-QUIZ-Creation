/**
 * Examiner API — real calls or rich mock (VITE_MOCK=1)
 * Every exported function returns a Promise that resolves to plain JS objects.
 */

const MOCK = import.meta.env.VITE_MOCK === '1'
const delay = (v, ms = 280) => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms))
const nano = () => Math.random().toString(36).slice(2, 9)
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString()
const ago = (ms) => new Date(Date.now() - ms).toISOString()
const M = 60_000

// ─────────────────────────────────────────────────────────────────────────────
// Mock data stores (mutated in place for the session)
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = ['Data Structures', 'Algorithms', 'OOP', 'Database Systems', 'Networking', 'Operating Systems', 'Web Development', 'AI & ML']

let _questions = [
  { id: 'q1', category: 'Data Structures', difficulty: 'easy', type: 'mcq', text: 'Which data structure follows LIFO order?', options: ['Queue', 'Stack', 'Heap', 'Graph'], answer: 1, marks: 2, createdAt: ago(10 * 86400 * 1000) },
  { id: 'q2', category: 'Data Structures', difficulty: 'medium', type: 'mcq', text: 'What is the worst-case time complexity of binary search?', options: ['O(n)', 'O(1)', 'O(log n)', 'O(n log n)'], answer: 2, marks: 2, createdAt: ago(9 * 86400 * 1000) },
  { id: 'q3', category: 'Data Structures', difficulty: 'easy', type: 'multi', text: 'Select all linear data structures.', options: ['Array', 'Linked List', 'Binary Tree', 'Stack'], answer: [0, 1, 3], marks: 3, createdAt: ago(8 * 86400 * 1000) },
  { id: 'q4', category: 'Data Structures', difficulty: 'medium', type: 'short', text: 'In one or two sentences, what is a hash collision?', marks: 4, createdAt: ago(7 * 86400 * 1000) },
  { id: 'q5', category: 'Algorithms', difficulty: 'easy', type: 'mcq', text: 'Breadth-first search uses which data structure?', options: ['Stack', 'Queue', 'Set', 'Tree'], answer: 1, marks: 2, createdAt: ago(6 * 86400 * 1000) },
  { id: 'q6', category: 'Algorithms', difficulty: 'hard', type: 'short', text: 'Explain the difference between dynamic programming and greedy algorithms, with an example of each.', marks: 6, createdAt: ago(5 * 86400 * 1000) },
  { id: 'q7', category: 'OOP', difficulty: 'easy', type: 'mcq', text: 'Which OOP concept hides the internal details of an object?', options: ['Inheritance', 'Polymorphism', 'Encapsulation', 'Abstraction'], answer: 2, marks: 2, createdAt: ago(4 * 86400 * 1000) },
  { id: 'q8', category: 'OOP', difficulty: 'medium', type: 'multi', text: 'Which of the following are pillars of OOP?', options: ['Encapsulation', 'Compilation', 'Inheritance', 'Polymorphism'], answer: [0, 2, 3], marks: 3, createdAt: ago(3 * 86400 * 1000) },
  { id: 'q9', category: 'Database Systems', difficulty: 'medium', type: 'mcq', text: 'Which SQL clause filters groups?', options: ['WHERE', 'HAVING', 'GROUP BY', 'ORDER BY'], answer: 1, marks: 2, createdAt: ago(2 * 86400 * 1000) },
  { id: 'q10', category: 'Networking', difficulty: 'easy', type: 'mcq', text: 'Which layer of the OSI model handles IP addressing?', options: ['Transport', 'Network', 'Data Link', 'Application'], answer: 1, marks: 2, createdAt: ago(1 * 86400 * 1000) },
]

let _exams = [
  {
    id: 'e1', title: 'Data Structures Midterm', subject: 'CS301', description: 'Covers arrays, linked lists, stacks, queues and trees.',
    status: 'published', duration_min: 90, publish_at: ago(2 * M), end_at: iso(180 * M),
    total_marks: 30, violation_limit: 3, attendance_required: true, created_at: ago(5 * 86400 * 1000),
    instructions: 'Answer all questions. Stay in fullscreen. Leaving counts as a violation.',
    questions: ['q1', 'q2', 'q3', 'q4', 'q5'],
    enrolled: ['s1', 's2', 's3', 's4', 's5', 's6'],
  },
  {
    id: 'e2', title: 'Algorithms Quiz', subject: 'CS302', description: 'Sorting, searching and graph algorithms.',
    status: 'ongoing', duration_min: 45, publish_at: ago(5 * M), end_at: iso(40 * M),
    total_marks: 20, violation_limit: 2, attendance_required: false, created_at: ago(3 * 86400 * 1000),
    instructions: 'Written answers are graded by your examiner.',
    questions: ['q5', 'q6'],
    enrolled: ['s1', 's2', 's3', 's7', 's8'],
  },
  {
    id: 'e3', title: 'OOP Final Exam', subject: 'CS201', description: 'Full course coverage: inheritance, polymorphism, design patterns.',
    status: 'completed', duration_min: 120, publish_at: ago(3 * 86400 * 1000), end_at: ago(2 * 86400 * 1000 + 2 * 3600 * 1000),
    total_marks: 50, violation_limit: 2, attendance_required: true, created_at: ago(10 * 86400 * 1000),
    instructions: 'Closed book. All questions are compulsory.',
    questions: ['q7', 'q8'],
    enrolled: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
  },
  {
    id: 'e4', title: 'Database Systems Quiz', subject: 'CS401', description: 'SQL, normalization, transactions.',
    status: 'draft', duration_min: 60, publish_at: iso(2 * 86400 * 1000), end_at: iso(2 * 86400 * 1000 + 3600 * 1000),
    total_marks: 20, violation_limit: 2, attendance_required: false, created_at: ago(1 * 86400 * 1000),
    instructions: 'Open notes allowed.',
    questions: ['q9'],
    enrolled: [],
  },
  {
    id: 'e5', title: 'Networking Fundamentals', subject: 'CS501', description: 'OSI model, TCP/IP, routing and switching.',
    status: 'draft', duration_min: 30, publish_at: iso(5 * 86400 * 1000), end_at: iso(5 * 86400 * 1000 + 1800 * 1000),
    total_marks: 10, violation_limit: 1, attendance_required: false, created_at: ago(12 * 3600 * 1000),
    instructions: '',
    questions: ['q10'],
    enrolled: [],
  },
]

let _students = [
  { id: 's1', name: 'Hamza Ali', roll: 'FA22-BSE-001', email: 'hamza@exam.test' },
  { id: 's2', name: 'Maryam Iqbal', roll: 'FA22-BSE-002', email: 'maryam@exam.test' },
  { id: 's3', name: 'Bilal Ahmed', roll: 'FA22-BSE-003', email: 'bilal@exam.test' },
  { id: 's4', name: 'Noor Fatima', roll: 'FA22-BSE-004', email: 'noor@exam.test' },
  { id: 's5', name: 'Usman Tariq', roll: 'FA22-BSE-005', email: 'usman@exam.test' },
  { id: 's6', name: 'Hira Shah', roll: 'FA22-BSE-006', email: 'hira@exam.test' },
  { id: 's7', name: 'Ali Raza', roll: 'FA22-BSE-007', email: 'ali@exam.test' },
  { id: 's8', name: 'Zainab Qureshi', roll: 'FA22-BSE-008', email: 'zainab@exam.test' },
  { id: 's9', name: 'Fahad Sheikh', roll: 'FA22-BSE-009', email: 'fahad@exam.test' },
  { id: 's10', name: 'Sara Nadeem', roll: 'FA22-BSE-010', email: 'sara@exam.test' },
]

// attendance[examId][studentId] = true/false
let _attendance = {
  e1: { s1: true, s2: true, s3: true, s4: false, s5: true, s6: false },
  e2: { s1: true, s2: false, s3: true, s7: true, s8: false },
  e3: { s1: true, s2: true, s3: true, s4: true, s5: true, s6: false, s7: true, s8: true },
}

// submissions[examId] = [{ studentId, studentName, roll, submittedAt, answers, violations, status, score }]
let _submissions = {
  e3: [
    { id: 'sub1', studentId: 's1', studentName: 'Hamza Ali', roll: 'FA22-BSE-001', submittedAt: ago(2 * 86400 * 1000 - 20 * M), violations: 0, status: 'graded', score: 44, totalMarks: 50, answers: [{ qId: 'q7', type: 'mcq', text: 'Which OOP concept hides internal details?', answer: 2, correct: 2, marks: 2, awarded: 2 }, { qId: 'q8', type: 'multi', text: 'Pillars of OOP?', answer: [0, 2, 3], correct: [0, 2, 3], marks: 3, awarded: 3 }] },
    { id: 'sub2', studentId: 's2', studentName: 'Maryam Iqbal', roll: 'FA22-BSE-002', submittedAt: ago(2 * 86400 * 1000 - 15 * M), violations: 1, status: 'graded', score: 38, totalMarks: 50, answers: [{ qId: 'q7', type: 'mcq', text: 'Which OOP concept hides internal details?', answer: 3, correct: 2, marks: 2, awarded: 0 }, { qId: 'q8', type: 'multi', text: 'Pillars of OOP?', answer: [0, 2, 3], correct: [0, 2, 3], marks: 3, awarded: 3 }] },
    { id: 'sub3', studentId: 's3', studentName: 'Bilal Ahmed', roll: 'FA22-BSE-003', submittedAt: ago(2 * 86400 * 1000 - 10 * M), violations: 0, status: 'pending', score: null, totalMarks: 50, answers: [{ qId: 'q7', type: 'short', text: 'Explain encapsulation.', answer: 'Encapsulation bundles data and methods.', marks: 4, awarded: null }] },
    { id: 'sub4', studentId: 's4', studentName: 'Noor Fatima', roll: 'FA22-BSE-004', submittedAt: ago(2 * 86400 * 1000 - 5 * M), violations: 2, status: 'pending', score: null, totalMarks: 50, answers: [] },
    { id: 'sub5', studentId: 's5', studentName: 'Usman Tariq', roll: 'FA22-BSE-005', submittedAt: ago(2 * 86400 * 1000 - 2 * M), violations: 0, status: 'graded', score: 42, totalMarks: 50, answers: [] },
  ],
}

let _announcements = [
  { id: 'a1', title: 'System Maintenance Tonight', body: 'The exam platform will be down for maintenance from 2:00 AM to 4:00 AM. Please plan accordingly.', examId: null, sentAt: ago(2 * 86400 * 1000), audience: 'all' },
  { id: 'a2', title: 'DS Midterm Reminder', body: 'Your Data Structures Midterm is scheduled tomorrow. Make sure you are present on time and have a stable internet connection.', examId: 'e1', sentAt: ago(1 * 86400 * 1000), audience: 'enrolled' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Live monitoring mock — enriched with progress, timers, incidents
// ─────────────────────────────────────────────────────────────────────────────
const VIOLATION_LABELS = {
  fullscreen_exit: 'Left fullscreen mode',
  tab_hidden: 'Switched away from exam tab',
  window_blur: 'Window lost focus',
  grace_expired: 'Did not return in time',
  copy_attempt: 'Copy action blocked',
  paste_attempt: 'Paste action blocked',
  devtools_open: 'Developer tools detected',
}
const mkIncidents = (n, offsetMin = 0) =>
  Array.from({ length: n }, (_, i) => ({
    id: `inc-${nano()}`,
    type: ['fullscreen_exit', 'tab_hidden', 'window_blur', 'copy_attempt', 'devtools_open'][(i + offsetMin) % 5],
    at: ago((offsetMin + i * 2 + 1) * 60_000),
    detail: i % 2 === 0 ? 'Returned within 5 seconds.' : 'Took longer to return; warning shown to the student.',
  }))

const _liveState = {
  e2: [
    { studentId: 's1', name: 'Hamza Ali', roll: 'FA22-BSE-001', status: 'in_progress', violations: 0, progress: 70, answered: 7, totalQuestions: 10, remainingSec: 32 * 60, startedAt: ago(10 * M), lastActive: ago(30 * 1000), incidents: [] },
    { studentId: 's3', name: 'Bilal Ahmed', roll: 'FA22-BSE-003', status: 'in_progress', violations: 1, progress: 4, answered: 4, totalQuestions: 10, remainingSec: 21 * 60, startedAt: ago(8 * M), lastActive: ago(2 * M), incidents: mkIncidents(1, 3) },
    { studentId: 's7', name: 'Ali Raza', roll: 'FA22-BSE-007', status: 'submitted', violations: 0, progress: 100, answered: 10, totalQuestions: 10, remainingSec: 0, reason: 'manual', startedAt: ago(9 * M), lastActive: ago(5 * M), incidents: [] },
    { studentId: 's2', name: 'Maryam Iqbal', roll: 'FA22-BSE-002', status: 'submitted', violations: 2, progress: 60, answered: 6, totalQuestions: 10, remainingSec: 0, reason: 'violation', startedAt: ago(7 * M), lastActive: ago(4 * M), incidents: mkIncidents(2, 1) },
    { studentId: 's8', name: 'Zainab Qureshi', roll: 'FA22-BSE-008', status: 'not_started', violations: 0, progress: 0, answered: 0, totalQuestions: 10, remainingSec: 45 * 60, startedAt: null, lastActive: null, incidents: [] },
  ],
}

/* Live messages posted to students of an exam (in-memory) */
let _liveMessages = {
  e2: [
    { id: 'm1', text: '5 minutes remaining. Check you have answered every question.', sentAt: ago(3 * M) },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// Analytics mock — enriched with question-level & common-wrong-answer data
// ─────────────────────────────────────────────────────────────────────────────
const _analytics = {
  e3: {
    examTitle: 'OOP Final Exam',
    published: false,
    totalEnrolled: 8,
    submitted: 5,
    avgScore: 41.3,
    passRate: 80,
    highScore: 44,
    lowScore: 32,
    passMarks: 25,
    scoreDistribution: [
      { label: '0–10', count: 0 }, { label: '11–20', count: 0 },
      { label: '21–30', count: 1 }, { label: '31–40', count: 1 }, { label: '41–50', count: 3 },
    ],
    studentResults: [
      { studentId: 's1', name: 'Hamza Ali', roll: 'FA22-BSE-001', score: 44, totalMarks: 50, rank: 1, violations: 0, submittedAt: ago(2 * 86400 * 1000 - 20 * M), status: 'graded' },
      { studentId: 's5', name: 'Usman Tariq', roll: 'FA22-BSE-005', score: 42, totalMarks: 50, rank: 2, violations: 0, submittedAt: ago(2 * 86400 * 1000 - 2 * M), status: 'graded' },
      { studentId: 's2', name: 'Maryam Iqbal', roll: 'FA22-BSE-002', score: 38, totalMarks: 50, rank: 3, violations: 1, submittedAt: ago(2 * 86400 * 1000 - 15 * M), status: 'graded' },
      { studentId: 's3', name: 'Bilal Ahmed', roll: 'FA22-BSE-003', score: null, totalMarks: 50, rank: null, violations: 0, submittedAt: ago(2 * 86400 * 1000 - 10 * M), status: 'pending' },
      { studentId: 's4', name: 'Noor Fatima', roll: 'FA22-BSE-004', score: null, totalMarks: 50, rank: null, violations: 2, submittedAt: ago(2 * 86400 * 1000 - 5 * M), status: 'pending' },
    ],
    questionStats: [
      { qId: 'q7', text: 'OOP concept hiding internal details', avgScore: 1.6, maxMarks: 2, difficulty: 'easy', skipped: 0,
        wrongAnswers: [{ optionLabel: 'D — Abstraction', count: 2, pct: 40 }] },
      { qId: 'q8', text: 'Pillars of OOP (multi-select)', avgScore: 2.8, maxMarks: 3, difficulty: 'medium', skipped: 1,
        wrongAnswers: [{ optionLabel: 'B — Compilation (incorrect selection)', count: 1, pct: 20 }] },
    ],
    violationBreakdown: { none: 3, one: 1, two_plus: 1 },
    submissionReasons: { manual: 3, timeout: 1, violation: 1 },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function req(path, opts = {}) {
  if (MOCK) throw new Error('Use mock functions directly')
  return fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
    .then(async (r) => { if (!r.ok) throw new Error(await r.text()); return r.json() })
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
export function getOverview() {
  if (MOCK) {
    const stats = {
      totalExams: _exams.length,
      drafts: _exams.filter((e) => e.status === 'draft').length,
      published: _exams.filter((e) => e.status === 'published').length,
      ongoing: _exams.filter((e) => e.status === 'ongoing').length,
      completed: _exams.filter((e) => e.status === 'completed').length,
      enrolledStudents: [...new Set(_exams.flatMap((e) => e.enrolled))].length,
      pendingGrading: Object.values(_submissions).flatMap((s) => s).filter((s) => s.status === 'pending').length,
    }
    const activity = [
      { id: 1, type: 'submission', text: 'Bilal Ahmed submitted OOP Final Exam', at: ago(2 * 86400 * 1000 - 10 * M) },
      { id: 2, type: 'exam', text: 'Algorithms Quiz is now live', at: ago(5 * M) },
      { id: 3, type: 'enrollment', text: '5 students enrolled in Algorithms Quiz', at: ago(1 * 86400 * 1000) },
      { id: 4, type: 'grading', text: 'Hamza Ali graded — 44/50', at: ago(2 * 86400 * 1000 + 3 * M) },
      { id: 5, type: 'announcement', text: 'DS Midterm Reminder sent to 6 students', at: ago(1 * 86400 * 1000) },
    ]
    const weeklyExams = [
      { day: 'Mon', exams: 1 }, { day: 'Tue', exams: 2 }, { day: 'Wed', exams: 0 },
      { day: 'Thu', exams: 3 }, { day: 'Fri', exams: 1 }, { day: 'Sat', exams: 0 }, { day: 'Sun', exams: 2 },
    ]
    return delay({ stats, activity, weeklyExams })
  }
  return req('/api/examiner/overview')
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMS
// ─────────────────────────────────────────────────────────────────────────────
export const listExams = () => MOCK ? delay(_exams) : req('/api/examiner/exams')

export const getExam = (id) => MOCK
  ? delay(_exams.find((e) => e.id === id) ?? null)
  : req(`/api/examiner/exams/${id}`)

export function saveExam(id, data) {
  if (MOCK) {
    if (id) {
      _exams = _exams.map((e) => e.id === id ? { ...e, ...data } : e)
      return delay({ id })
    }
    const ne = { id: nano(), ...data, status: 'draft', created_at: iso(), enrolled: [], questions: data.questions ?? [] }
    _exams = [ne, ..._exams]
    return delay({ id: ne.id })
  }
  return id ? req(`/api/examiner/exams/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    : req('/api/examiner/exams', { method: 'POST', body: JSON.stringify(data) })
}

export function publishExam(id) {
  if (MOCK) {
    _exams = _exams.map((e) => e.id === id ? { ...e, status: 'published' } : e)
    return delay({})
  }
  return req(`/api/examiner/exams/${id}/publish`, { method: 'POST' })
}

export function deleteExam(id) {
  if (MOCK) { _exams = _exams.filter((e) => e.id !== id); return delay({}) }
  return req(`/api/examiner/exams/${id}`, { method: 'DELETE' })
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTION BANK
// ─────────────────────────────────────────────────────────────────────────────
export const listQuestions = () => MOCK ? delay(_questions) : req('/api/examiner/questions')
export const getCategories = () => MOCK ? delay(CATEGORIES) : req('/api/examiner/questions/categories')

export function saveQuestion(id, data) {
  if (MOCK) {
    if (id) { _questions = _questions.map((q) => q.id === id ? { ...q, ...data } : q); return delay({ id }) }
    const nq = { id: nano(), ...data, createdAt: iso() }
    _questions = [nq, ..._questions]
    return delay({ id: nq.id })
  }
  return id ? req(`/api/examiner/questions/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    : req('/api/examiner/questions', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteQuestion(id) {
  if (MOCK) { _questions = _questions.filter((q) => q.id !== id); return delay({}) }
  return req(`/api/examiner/questions/${id}`, { method: 'DELETE' })
}

export function assignQuestionsToExam(examId, questionIds) {
  if (MOCK) {
    _exams = _exams.map((e) => e.id === examId ? { ...e, questions: [...new Set([...e.questions, ...questionIds])] } : e)
    return delay({})
  }
  return req(`/api/examiner/exams/${examId}/questions`, { method: 'POST', body: JSON.stringify({ question_ids: questionIds }) })
}

// ─────────────────────────────────────────────────────────────────────────────
// ENROLLMENT & ATTENDANCE
// ─────────────────────────────────────────────────────────────────────────────
export const listAllStudents = () => MOCK ? delay(_students) : req('/api/examiner/students')

export const getEnrollment = (examId) => MOCK
  ? delay({ enrolled: (_exams.find((e) => e.id === examId)?.enrolled ?? []).map((sid) => _students.find((s) => s.id === sid)).filter(Boolean), all: _students })
  : req(`/api/examiner/exams/${examId}/enrollment`)

export function enrollStudent(examId, studentId) {
  if (MOCK) {
    _exams = _exams.map((e) => e.id === examId && !e.enrolled.includes(studentId) ? { ...e, enrolled: [...e.enrolled, studentId] } : e)
    return delay({})
  }
  return req(`/api/examiner/exams/${examId}/enrollment`, { method: 'POST', body: JSON.stringify({ student_id: studentId }) })
}

export function unenrollStudent(examId, studentId) {
  if (MOCK) {
    _exams = _exams.map((e) => e.id === examId ? { ...e, enrolled: e.enrolled.filter((id) => id !== studentId) } : e)
    if (_attendance[examId]) delete _attendance[examId][studentId]
    return delay({})
  }
  return req(`/api/examiner/exams/${examId}/enrollment/${studentId}`, { method: 'DELETE' })
}

export const getAttendance = (examId) => MOCK
  ? delay(_attendance[examId] ?? {})
  : req(`/api/examiner/exams/${examId}/attendance`)

export function markAttendance(examId, studentId, present) {
  if (MOCK) {
    if (!_attendance[examId]) _attendance[examId] = {}
    _attendance[examId][studentId] = present
    return delay({})
  }
  return req(`/api/examiner/exams/${examId}/attendance`, { method: 'POST', body: JSON.stringify({ student_id: studentId, present }) })
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE MONITORING
// ─────────────────────────────────────────────────────────────────────────────
export const getLiveStatus = (examId) => MOCK ? delay(_liveState[examId] ?? []) : req(`/api/examiner/exams/${examId}/live`)

export function sendLiveMessage(examId, text) {
  if (MOCK) {
    if (!_liveMessages[examId]) _liveMessages[examId] = []
    const msg = { id: nano(), text, sentAt: iso() }
    _liveMessages[examId] = [msg, ..._liveMessages[examId]]
    return delay(msg)
  }
  return req(`/api/examiner/exams/${examId}/live/message`, { method: 'POST', body: JSON.stringify({ text }) })
}

export const getLiveMessages = (examId) =>
  MOCK ? delay(_liveMessages[examId] ?? []) : req(`/api/examiner/exams/${examId}/live/messages`)

// ─────────────────────────────────────────────────────────────────────────────
// SUBMISSIONS
// ─────────────────────────────────────────────────────────────────────────────
export const listSubmissions = (examId) => MOCK ? delay(_submissions[examId] ?? []) : req(`/api/examiner/exams/${examId}/submissions`)
export const getSubmission = (subId) => MOCK
  ? delay(Object.values(_submissions).flat().find((s) => s.id === subId) ?? null)
  : req(`/api/examiner/submissions/${subId}`)

export function reinstateSubmission(submissionId, examId) {
  if (MOCK) {
    _submissions[examId] = (_submissions[examId] ?? []).map((s) =>
      s.id === submissionId ? { ...s, status: 'reinstated', reinstatedAt: iso(), score: null, answers: s.answers.map((a) => ({ ...a, awarded: null })) } : s
    )
    return delay({})
  }
  return req(`/api/examiner/submissions/${submissionId}/reinstate`, { method: 'POST' })
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADING
// ─────────────────────────────────────────────────────────────────────────────
const _aiFeedbackPool = [
  { suggested: 4, feedback: 'The answer correctly identifies the key concept and explains it concisely. Full marks.', confidence: 0.95 },
  { suggested: 3, feedback: 'Correct core idea but the explanation is incomplete — one required detail is missing.', confidence: 0.78 },
  { suggested: 2, feedback: 'Partially correct. The definition is vaguely stated; terminology is imprecise.', confidence: 0.62 },
  { suggested: 1, feedback: 'The answer touches on the topic but contains a significant misconception.', confidence: 0.55 },
  { suggested: 0, feedback: 'The answer does not address the question that was asked.', confidence: 0.9 },
]

export function getAiSuggestions(submissionId, examId) {
  if (MOCK) {
    const sub = (_submissions[examId] ?? []).find((s) => s.id === submissionId)
    if (!sub) return delay(null)
    const suggestions = {}
    sub.answers.filter((a) => a.type === 'short').forEach((a, i) => {
      const answered = !!(a.answer && a.answer.trim())
      const pick = answered
        ? _aiFeedbackPool[Math.min(Math.floor(a.answer.length / 60), 4)]
        : { suggested: 0, feedback: 'No answer was provided by the student.', confidence: 1 }
      suggestions[a.qId] = { ...pick, answered }
    })
    return delay(suggestions, 900)
  }
  return req(`/api/examiner/submissions/${submissionId}/ai-suggestions`)
}

export function saveGrade(submissionId, examId, { scores = {}, feedbacks = {}, aiApproved = {} } = {}) {
  if (MOCK) {
    let overflow = null
    _submissions[examId] = (_submissions[examId] ?? []).map((s) => {
      if (s.id !== submissionId) return s
      const answers = s.answers.map((a) => {
        const v = scores[a.qId]
        if (v != null && v !== '' && (Number(v) < 0 || Number(v) > a.marks)) { overflow = a.qId; return a }
        return { ...a, awarded: v != null && v !== '' ? Number(v) : a.awarded, feedback: feedbacks[a.qId] ?? a.feedback, aiApproved: aiApproved[a.qId] ?? a.aiApproved }
      })
      const total = answers.reduce((acc, a) => acc + (a.awarded ?? 0), 0)
      const allGraded = answers.every((a) => a.awarded != null)
      return { ...s, answers, score: allGraded ? total : null, status: allGraded ? 'graded' : 'pending' }
    })
    if (overflow != null) return Promise.reject({ response: { status: 422, data: { message: `Marks for question exceed the maximum allowed.` } } })
    return delay({})
  }
  return req(`/api/examiner/submissions/${submissionId}/grade`, { method: 'POST', body: JSON.stringify({ scores, feedbacks, aiApproved }) })
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
export const getAnalytics = (examId) => MOCK ? delay(_analytics[examId] ?? null) : req(`/api/examiner/exams/${examId}/analytics`)

export function publishResults(examId, publish) {
  if (MOCK) {
    if (_analytics[examId]) _analytics[examId] = { ..._analytics[examId], published: publish }
    return delay({})
  }
  return req(`/api/examiner/exams/${examId}/results/publish`, { method: 'POST', body: JSON.stringify({ publish }) })
}

export function exportResultsCSV(examId) {
  if (MOCK) {
    const data = _analytics[examId]
    if (!data) return delay(null)
    const rows = [['Rank', 'Name', 'Roll', 'Score', 'Total Marks', 'Percentage', 'Violations', 'Status', 'Submitted At']]
    ;(data.studentResults ?? []).forEach((s, i) => {
      rows.push([s.rank ?? i + 1, s.name, s.roll, s.score ?? '', s.totalMarks, s.score != null ? Math.round((s.score / s.totalMarks) * 100) + '%' : '', s.violations, s.status, s.submittedAt?.slice(0, 16) ?? ''])
    })
    const csv = rows.map((r) => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${data.examTitle.replace(/\s+/g, '-').toLowerCase()}-results.csv`
    a.click(); URL.revokeObjectURL(url)
    return delay({ exported: data.studentResults?.length ?? 0 })
  }
  return req(`/api/examiner/exams/${examId}/results/export/csv`)
}

export function exportResultsPDF(examId) {
  if (MOCK) {
    // In production, the backend streams a PDF. In mock we just alert.
    alert('PDF export requires the backend. In mock mode a CSV is downloaded instead.')
    return exportResultsCSV(examId)
  }
  window.open(`/api/examiner/exams/${examId}/results/export/pdf`, '_blank')
  return Promise.resolve()
}

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS
// ─────────────────────────────────────────────────────────────────────────────
export const listAnnouncements = () => MOCK ? delay(_announcements) : req('/api/examiner/announcements')

export function sendAnnouncement(data) {
  if (MOCK) {
    const na = { id: nano(), ...data, sentAt: iso() }
    _announcements = [na, ..._announcements]
    return delay({ id: na.id })
  }
  return req('/api/examiner/announcements', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteAnnouncement(id) {
  if (MOCK) { _announcements = _announcements.filter((a) => a.id !== id); return delay({}) }
  return req(`/api/examiner/announcements/${id}`, { method: 'DELETE' })
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK IMPORT
// ─────────────────────────────────────────────────────────────────────────────
export function importStudents(examId, csvText) {
  if (MOCK) {
    const lines = csvText.trim().split('\n').slice(1) // skip header
    const imported = []
    const errors = []
    lines.forEach((line, i) => {
      const [name, roll, email] = line.split(',').map((s) => s?.trim())
      if (!name || !roll) { errors.push({ row: i + 2, msg: 'Missing name or roll number' }); return }
      const existing = _students.find((s) => s.roll === roll)
      if (existing) {
        if (!(_exams.find((e) => e.id === examId)?.enrolled ?? []).includes(existing.id)) {
          _exams = _exams.map((e) => e.id === examId ? { ...e, enrolled: [...e.enrolled, existing.id] } : e)
          imported.push(existing)
        }
      } else {
        const ns = { id: nano(), name, roll, email: email ?? `${roll.toLowerCase().replace(/[^a-z0-9]/g, '')}@exam.test` }
        _students = [..._students, ns]
        _exams = _exams.map((e) => e.id === examId ? { ...e, enrolled: [...e.enrolled, ns.id] } : e)
        imported.push(ns)
      }
    })
    return delay({ imported: imported.length, errors })
  }
  const fd = new FormData()
  fd.append('file', new Blob([csvText], { type: 'text/csv' }), 'students.csv')
  fd.append('exam_id', examId)
  return fetch('/api/examiner/import/students', { method: 'POST', credentials: 'include', body: fd }).then((r) => r.json())
}

export function importQuestions(csvText) {
  if (MOCK) {
    const lines = csvText.trim().split('\n').slice(1)
    const imported = []
    const errors = []
    lines.forEach((line, i) => {
      const [type, category, difficulty, text, marks] = line.split(',').map((s) => s?.trim())
      if (!type || !text) { errors.push({ row: i + 2, msg: 'Missing type or text' }); return }
      const nq = { id: nano(), type: type || 'short', category: category || 'General', difficulty: difficulty || 'medium', text, marks: parseInt(marks) || 2, createdAt: iso() }
      _questions = [nq, ..._questions]
      imported.push(nq)
    })
    return delay({ imported: imported.length, errors })
  }
  const fd = new FormData()
  fd.append('file', new Blob([csvText], { type: 'text/csv' }), 'questions.csv')
  return fetch('/api/examiner/import/questions', { method: 'POST', credentials: 'include', body: fd }).then((r) => r.json())
}
