import api from './client'
import { syncClock } from '../utils/clock'

const MOCK = import.meta.env.VITE_MOCK === '1'
const call = (p) => p.then((r) => { if (r.data?.server_time) syncClock(r.data.server_time); return r.data })
const wait = (v, ms = 250) => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms))
const off = () => (navigator.onLine ? null : Promise.reject({})) // mock: simulate network loss

export const REASONS = {
  not_enrolled: 'You are not enrolled in this exam',
  not_present: 'Not marked present yet. Ask your examiner.',
}
export function groupOf(e, now) {
  if (e.attempt_status === 'submitted' || now > Date.parse(e.end_at)) return 'completed'
  return now < Date.parse(e.publish_at) ? 'upcoming' : 'available'
}

/* ---------------- mock ---------------- */
const T = Date.now(), M = 60000, iso = (ms) => new Date(T + ms).toISOString()
const base = { violation_limit: 2, attendance_required: true, access: { allowed: true }, attempt_status: null }
const EXAMS = [
  { ...base, id: 1, title: 'Data Structures Midterm', duration_min: 20, total_marks: 10, publish_at: iso(-10 * M), end_at: iso(180 * M),
    instructions: 'Answer all questions. Stay in fullscreen. Leaving the exam window counts as a violation.' },
  { ...base, id: 2, title: 'Algorithms Quiz', duration_min: 15, total_marks: 10, publish_at: iso(90000), end_at: iso(120 * M),
    instructions: 'This quiz opens in about 90 seconds. Written answers are graded by your examiner.' },
  { ...base, id: 3, title: 'Database Systems Quiz', duration_min: 30, total_marks: 20, publish_at: iso(-5 * M), end_at: iso(60 * M),
    access: { allowed: false, reason: 'not_present' }, instructions: 'Attendance is required before you can enter.' },
  { ...base, id: 4, title: 'OOP Final', duration_min: 60, total_marks: 50, publish_at: iso(-3 * 86400000), end_at: iso(-3 * 86400000 + 3600000),
    attempt_status: 'submitted', instructions: 'Closed book.' },
]
const QS = [
  { id: 1, type: 'mcq', marks: 2, text: 'Which data structure follows LIFO order?', options: ['Queue', 'Stack', 'Heap', 'Graph'] },
  { id: 2, type: 'mcq', marks: 2, text: 'What is the worst-case time complexity of binary search?', options: ['O(n)', 'O(1)', 'O(log n)', 'O(n log n)'] },
  { id: 3, type: 'multi', marks: 2, text: 'Select all linear data structures.', options: ['Array', 'Linked list', 'Binary tree', 'Stack'] },
  { id: 4, type: 'short', marks: 2, text: 'In one or two sentences, what is a hash collision?' },
  { id: 5, type: 'mcq', marks: 2, text: 'Breadth-first search uses which data structure?', options: ['Stack', 'Queue', 'Set', 'Tree'] },
].map((q) => ({ ...q, options: q.options?.map((t, i) => ({ id: `${q.id}-${i}`, text: t })) }))
const attempts = {}
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5)
const stamp = () => ({ server_time: new Date().toISOString() })

function mockStart(examId) {
  const e = EXAMS.find((x) => x.id === +examId)
  if (!attempts[e.id]) {
    attempts[e.id] = { id: 100 + e.id, exam_id: e.id, status: 'in_progress', violation_count: 0, answers: {},
      deadline_at: new Date(Math.min(Date.now() + e.duration_min * M, Date.parse(e.end_at))).toISOString(),
      exam: { title: e.title, duration_min: e.duration_min, violation_limit: e.violation_limit, total_marks: e.total_marks },
      questions: shuffle(QS).map((q) => ({ ...q, options: q.options && shuffle(q.options) })) }
    e.attempt_status = 'in_progress'
  }
  return { ...attempts[e.id], ...stamp() }
}
const mockAttempt = (id) => Object.values(attempts).find((a) => a.id === +id)

/* ---------------- API ---------------- */
export const listExams = () => MOCK ? wait({ exams: EXAMS, ...stamp() }).then((d) => { syncClock(d.server_time); return d.exams })
  : call(api.get('/exams')).then((d) => (Array.isArray(d) ? d : d.exams))
export const getExam = (id) => MOCK ? wait({ ...EXAMS.find((e) => e.id === +id), ...stamp() }) : call(api.get(`/exams/${id}`))
export const startAttempt = (examId) => MOCK ? wait(mockStart(examId)) : call(api.post('/attempts/start', { exam_id: examId }))
export const getAttempt = (id) => MOCK ? wait({ ...mockAttempt(id), ...stamp() }) : call(api.get(`/attempts/${id}`))
export const getTime = (id) => MOCK ? wait({ status: mockAttempt(id).status, ...stamp() }, 50) : call(api.get(`/attempts/${id}/time`))

export function saveAnswer(id, item) {
  if (MOCK) { const x = off(); if (x) return x; mockAttempt(id).answers[item.question_id] = item; return wait({}, 150) }
  return api.put(`/attempts/${id}/answer`, item)
}
export function submitAttempt(id, reason) {
  if (MOCK) {
    const x = off(); if (x) return x
    const a = mockAttempt(id); a.status = 'submitted'; a.submit_reason = reason
    EXAMS.find((e) => e.id === a.exam_id).attempt_status = 'submitted'
    return wait({})
  }
  return api.post(`/attempts/${id}/submit`, { reason })
}
export function postViolation(id, type) {
  if (MOCK) {
    const x = off(); if (x) return x
    const a = mockAttempt(id); a.violation_count += 1
    const hit = a.violation_count >= a.exam.violation_limit
    if (hit) { a.status = 'submitted'; a.submit_reason = 'violation'; EXAMS.find((e) => e.id === a.exam_id).attempt_status = 'submitted' }
    return wait({ violation_count: a.violation_count, limit: a.exam.violation_limit, auto_submitted: hit }, 100)
  }
  return api.post(`/attempts/${id}/violation`, { type }).then((r) => r.data)
}
