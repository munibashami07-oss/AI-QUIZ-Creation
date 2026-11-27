import { useEffect, useReducer, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listExams, listSubmissions, getAiSuggestions, saveGrade } from '../../api/examiner'
import { fmt } from '../../utils/time'
import { Empty, Skeleton, Spinner, cx } from '../../components/ui'
import { errMsg } from '../../api/client'

// ── config ────────────────────────────────────────────────────────────────────
const TYPE_LABEL = { mcq: 'MCQ', multi: 'Multi-select', short: 'Short Answer' }

// ── reducer for per-question grading state ────────────────────────────────────
function gradingReducer(state, action) {
  switch (action.type) {
    case 'init': return action.payload              // { [qId]: { score, feedback, aiSuggestion, aiApproved } }
    case 'score': return { ...state, [action.qId]: { ...state[action.qId], score: action.value } }
    case 'feedback': return { ...state, [action.qId]: { ...state[action.qId], feedback: action.value } }
    case 'approve_ai': return {
      ...state,
      [action.qId]: {
        ...state[action.qId],
        score: action.suggested,
        feedback: action.feedback,
        aiApproved: true,
      },
    }
    case 'reject_ai': return { ...state, [action.qId]: { ...state[action.qId], aiApproved: false } }
    default: return state
  }
}

// ── confidence badge ──────────────────────────────────────────────────────────
function ConfidenceBadge({ value }) {
  const pct = Math.round(value * 100)
  const cls = pct >= 85 ? 'bg-green-50 text-green-700' : pct >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
  return (
    <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', cls)}>
      AI: {pct}% confident
    </span>
  )
}

// ── MCQ / multi-select auto-graded display ────────────────────────────────────
function AutoGraded({ a }) {
  const isCorrect = a.type === 'mcq'
    ? a.answer === a.correct
    : JSON.stringify([...(a.answer ?? [])].sort()) === JSON.stringify([...(a.correct ?? [])].sort())

  return (
    <div className={cx('flex items-center gap-3 text-sm p-3 rounded-xl',
      isCorrect ? 'bg-green-50 border border-green-200' : 'bg-rose-50 border border-rose-200')}>
      <span className={cx('text-base', isCorrect ? 'text-green-600' : 'text-rose-500')}>
        {isCorrect ? '✓' : '✗'}
      </span>
      <div className="flex-1 min-w-0">
        <span className={cx('font-semibold', isCorrect ? 'text-green-700' : 'text-rose-600')}>
          {isCorrect ? 'Correct' : 'Incorrect'}
        </span>
        {a.type === 'mcq' && (
          <span className="text-xs ml-2 text-slate-500">
            Selected: {typeof a.answer === 'number' ? String.fromCharCode(65 + a.answer) : '—'}
            {!isCorrect && <> · Correct: <strong className="text-green-600">{String.fromCharCode(65 + (a.correct ?? 0))}</strong></>}
          </span>
        )}
        {a.type === 'multi' && (
          <span className="text-xs ml-2 text-slate-500">
            Selected: {(a.answer ?? []).map((i) => String.fromCharCode(65 + i)).join(', ') || '—'}
            {!isCorrect && <> · Correct: {(a.correct ?? []).map((i) => String.fromCharCode(65 + i)).join(', ')}</>}
          </span>
        )}
      </div>
      <span className={cx('font-bold whitespace-nowrap', isCorrect ? 'text-green-700' : 'text-rose-500')}>
        {isCorrect ? a.marks : 0} / {a.marks}
      </span>
    </div>
  )
}

// ── short answer grading widget ───────────────────────────────────────────────
function ShortAnswerGrader({ a, state, dispatch, loadingAI }) {
  const qState = state[a.qId] ?? {}
  const aiSug = qState.aiSuggestion
  const hasAnswer = !!(a.answer?.trim())

  const scoreVal = qState.score ?? ''
  const scoreNum = scoreVal === '' ? null : Number(scoreVal)
  const overflow = scoreNum !== null && (scoreNum < 0 || scoreNum > a.marks)

  return (
    <div className="space-y-3">
      {/* student's answer */}
      <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed min-h-[60px]">
        {hasAnswer ? a.answer : <span className="italic text-slate-400">No answer provided — unattempted.</span>}
      </div>

      {/* AI suggestion panel */}
      {loadingAI ? (
        <div className="flex items-center gap-2 p-3 bg-sky-50 border border-sky-200 rounded-xl text-sm text-sky-700">
          <Spinner /> <span>AI is analysing this answer…</span>
        </div>
      ) : aiSug && !qState.aiApproved && qState.aiApproved !== false ? (
        <div className="p-4 bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sky-700 font-semibold text-sm">✨ AI Suggestion</span>
            <ConfidenceBadge value={aiSug.confidence} />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed mb-3">{aiSug.feedback}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-semibold text-sky-700">Suggested: {aiSug.suggested} / {a.marks}</span>
            <div className="flex gap-2 ml-auto">
              <button onClick={() => dispatch({ type: 'approve_ai', qId: a.qId, suggested: aiSug.suggested, feedback: aiSug.feedback })}
                className="btn h-8 px-3 text-xs bg-sky-600 text-white hover:bg-sky-700 font-semibold">
                ✓ Accept
              </button>
              <button onClick={() => dispatch({ type: 'reject_ai', qId: a.qId })}
                className="btn btn-ghost h-8 px-3 text-xs border-slate-300">
                ✗ Reject
              </button>
            </div>
          </div>
        </div>
      ) : qState.aiApproved === true ? (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 font-medium">
          ✓ AI suggestion accepted — you can still adjust marks or feedback below.
        </div>
      ) : qState.aiApproved === false ? (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
          AI suggestion rejected — grading manually.
        </div>
      ) : null}

      {/* manual marks + feedback */}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="shrink-0">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Marks</label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} max={a.marks} step={0.5}
              value={scoreVal}
              onChange={(e) => dispatch({ type: 'score', qId: a.qId, value: e.target.value })}
              aria-label={`Marks for question`}
              aria-invalid={overflow ? 'true' : undefined}
              className={cx('field bg-white w-20 h-9 text-center text-sm font-bold', overflow && 'border-rose-400')}
            />
            <span className="text-sm text-slate-400 font-medium">/ {a.marks}</span>
          </div>
          {overflow && <p className="text-xs text-rose-500 mt-1">Max {a.marks} marks allowed.</p>}
          {/* quick buttons */}
          <div className="flex gap-1 mt-1.5">
            {[0, Math.floor(a.marks / 2), a.marks].map((v) => (
              <button key={v} type="button"
                onClick={() => dispatch({ type: 'score', qId: a.qId, value: v })}
                className={cx('h-6 px-2 rounded text-xs font-semibold transition-colors',
                  scoreNum === v ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                {v === 0 ? '0' : v === a.marks ? 'Full' : '½'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-48">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Feedback (optional)</label>
          <textarea
            value={qState.feedback ?? ''}
            onChange={(e) => dispatch({ type: 'feedback', qId: a.qId, value: e.target.value })}
            rows={2}
            placeholder="Written feedback visible to the student…"
            className="field bg-white w-full h-auto p-3 text-sm resize-none"
          />
        </div>
      </div>

      {/* status indicator */}
      <p className={cx('text-xs font-medium', scoreNum == null ? 'text-amber-500' : scoreNum === 0 ? 'text-rose-500' : scoreNum === a.marks ? 'text-green-600' : 'text-sky-600')}>
        {!hasAnswer ? '— Unattempted' :
          scoreNum == null ? '• Not yet graded' :
          scoreNum === 0 ? '✗ Marked wrong' :
          scoreNum === a.marks ? '✓ Full marks' : `↗ Partial — ${scoreNum}/${a.marks}`}
      </p>
    </div>
  )
}

// ── grading card for one submission ──────────────────────────────────────────
function GradingCard({ submission, examId, onDone }) {
  const qc = useQueryClient()
  const [state, dispatch] = useReducer(gradingReducer, {})
  const [saveErr, setSaveErr] = useState('')

  // init state from existing submission data
  useEffect(() => {
    const init = {}
    submission.answers.forEach((a) => {
      init[a.qId] = {
        score: a.awarded ?? '',
        feedback: a.feedback ?? '',
        aiApproved: a.aiApproved ?? null,
        aiSuggestion: null,
      }
    })
    dispatch({ type: 'init', payload: init })
  }, [submission.id])

  // AI suggestions — fetch on demand, then merge into local state
  const { isLoading: loadingAI, refetch: fetchAI } = useQuery({
    queryKey: ['examiner', 'ai-suggestions', submission.id],
    queryFn: async () => {
      const suggestions = await getAiSuggestions(submission.id, examId)
      if (!suggestions) return null
      // Merge AI suggestions into current grading state
      const nextState = {}
      Object.entries(state).forEach(([qId, v]) => {
        nextState[qId] = { ...v, aiSuggestion: suggestions[qId] ?? v.aiSuggestion }
      })
      dispatch({ type: 'init', payload: nextState })
      return suggestions
    },
    enabled: false,
    staleTime: Infinity,
  })

  const hasShort = submission.answers.some((a) => a.type === 'short')

  const saveM = useMutation({
    mutationFn: () => {
      const scores = {}, feedbacks = {}, aiApproved = {}
      Object.entries(state).forEach(([qId, v]) => {
        if (v.score !== '' && v.score != null) scores[qId] = Number(v.score)
        if (v.feedback) feedbacks[qId] = v.feedback
        if (v.aiApproved !== null) aiApproved[qId] = v.aiApproved
      })
      return saveGrade(submission.id, examId, { scores, feedbacks, aiApproved })
    },
    onSuccess: () => {
      setSaveErr('')
      qc.invalidateQueries({ queryKey: ['examiner', 'submissions', examId] })
      onDone()
    },
    onError: (e) => setSaveErr(errMsg(e)),
  })

  // compute auto scores for MCQ/multi so we can show totals
  const computedScore = submission.answers.reduce((acc, a) => {
    if (a.type === 'short') {
      const v = state[a.qId]?.score
      return acc + (v !== '' && v != null ? Number(v) : 0)
    }
    if (a.type === 'mcq') return acc + (a.answer === a.correct ? a.marks : 0)
    if (a.type === 'multi') {
      const isOk = JSON.stringify([...(a.answer ?? [])].sort()) === JSON.stringify([...(a.correct ?? [])].sort())
      return acc + (isOk ? a.marks : 0)
    }
    return acc
  }, 0)

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
      {/* student header */}
      <div className="bg-[#0f172a] text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold text-base">{submission.studentName}</p>
          <p className="text-white/50 text-sm">{submission.roll} · Submitted {fmt(submission.submittedAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          {submission.violations > 0 && (
            <span className="text-xs bg-rose-500/20 text-rose-300 font-semibold px-3 py-1 rounded-full">
              ⚠ {submission.violations} violations
            </span>
          )}
          <span className="text-sm text-white/70">
            Score so far: <strong className="text-white">{computedScore} / {submission.totalMarks}</strong>
          </span>
        </div>
      </div>

      <div className="p-6">
        {/* AI suggestion banner (only shown if short answers present) */}
        {hasShort && (
          <div className="mb-5 flex items-center gap-3 p-4 bg-sky-50 border border-sky-200 rounded-xl">
            <span className="text-sky-600 text-lg shrink-0">✨</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-sky-800">AI Grading Assistant</p>
              <p className="text-xs text-sky-600 mt-0.5">Generate AI marks and feedback for short answers. You can accept, reject or modify each suggestion.</p>
            </div>
            <button onClick={() => fetchAI()} disabled={loadingAI}
              className="btn h-9 px-4 bg-sky-600 text-white hover:bg-sky-700 text-sm font-semibold shrink-0 disabled:opacity-50">
              {loadingAI ? <><Spinner /> Loading…</> : 'Get AI Suggestions'}
            </button>
          </div>
        )}

        {/* answers */}
        <ol className="space-y-6">
          {submission.answers.map((a, i) => (
            <li key={a.qId ?? i} className="border border-slate-100 rounded-2xl overflow-hidden">
              <div className="bg-slate-50 px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Q{i + 1}</span>
                  <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full',
                    a.type === 'mcq' ? 'bg-blue-50 text-blue-700' :
                    a.type === 'multi' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700')}>
                    {TYPE_LABEL[a.type] ?? a.type}
                  </span>
                  {a.type === 'short' && !a.answer?.trim() && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">Unattempted</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">{a.marks} marks</span>
              </div>

              <div className="p-4">
                <p className="text-sm font-medium text-[#0f172a] mb-3 leading-snug">{a.text}</p>
                {a.type !== 'short'
                  ? <AutoGraded a={a} />
                  : <ShortAnswerGrader a={a} state={state} dispatch={dispatch} loadingAI={loadingAI} />
                }
              </div>
            </li>
          ))}
        </ol>

        {/* save / skip */}
        {saveErr && <p className="mt-4 text-sm text-rose-500">{saveErr}</p>}
        <div className="flex justify-between items-center mt-6 pt-5 border-t border-slate-100">
          <span className="text-sm text-slate-500">
            Total: <strong className="text-[#0f172a]">{computedScore} / {submission.totalMarks}</strong>
            {' '}({Math.round((computedScore / submission.totalMarks) * 100)}%)
          </span>
          <div className="flex gap-3">
            <button type="button" onClick={onDone} className="btn btn-ghost border-slate-200 h-10 px-4">Skip</button>
            <button type="button" disabled={saveM.isPending} onClick={() => saveM.mutate()} className="btn btn-acc h-10 px-5">
              {saveM.isPending && <Spinner />} Save & Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function Grading() {
  const { data: exams = [] } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const gradableExams = exams.filter((e) => e.status === 'completed' || e.status === 'ongoing')

  const [selectedExam, setSelectedExam] = useState(null)
  const [current, setCurrent] = useState(0)

  const { data: submissions = [], isLoading } = useQuery({
    queryKey: ['examiner', 'submissions', selectedExam],
    queryFn: () => listSubmissions(selectedExam),
    enabled: !!selectedExam,
  })

  const pending = submissions.filter((s) => s.status === 'pending' || s.status === 'reinstated')
  const graded = submissions.filter((s) => s.status === 'graded').length
  const progressPct = submissions.length ? Math.round((graded / submissions.length) * 100) : 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Grading</h1>
        <p className="text-slate-500 mt-1">MCQ and multi-select are auto-graded. AI suggestions assist with short answers.</p>
      </div>

      {/* exam picker */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Select Exam</label>
        <select value={selectedExam ?? ''} onChange={(e) => { setSelectedExam(e.target.value || null); setCurrent(0) }} className="field bg-slate-50">
          <option value="">— Choose an exam —</option>
          {gradableExams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.status})</option>)}
        </select>
      </div>

      {!selectedExam ? (
        <Empty title="No exam selected" hint="Select an exam to start grading its submissions." />
      ) : isLoading ? (
        <Skeleton className="h-64 !bg-slate-100" />
      ) : submissions.length === 0 ? (
        <Empty title="No submissions yet" hint="Students haven't submitted this exam yet." />
      ) : pending.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3">🎉</p>
          <p className="font-semibold text-green-800 text-lg">All submissions graded</p>
          <p className="text-green-600 text-sm mt-1">Every submission has been graded. Use Submissions to reinstate and re-grade if needed.</p>
        </div>
      ) : (
        <>
          {/* progress header */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-5 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                <span>Overall progress</span>
                <span>{graded} / {submissions.length} graded</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#1e3a5f] to-sky-400 rounded-full transition-all duration-700"
                  style={{ width: `${progressPct}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-1.5 rounded-full">{pending.length} pending</span>
              <span className="text-xs text-green-600 font-semibold bg-green-50 px-3 py-1.5 rounded-full">{graded} graded</span>
            </div>
          </div>

          {/* navigation */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <button onClick={() => setCurrent((c) => Math.max(c - 1, 0))} disabled={current === 0}
              className="btn btn-ghost h-9 px-3 border-slate-200 disabled:opacity-40 text-sm">← Prev</button>
            <div className="flex gap-1 flex-wrap">
              {pending.map((s, i) => (
                <button key={s.id} onClick={() => setCurrent(i)}
                  className={cx('h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors',
                    i === current ? 'bg-[#1e3a5f] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}>
                  {i + 1}
                </button>
              ))}
            </div>
            <button onClick={() => setCurrent((c) => Math.min(c + 1, pending.length - 1))} disabled={current >= pending.length - 1}
              className="btn btn-ghost h-9 px-3 border-slate-200 disabled:opacity-40 text-sm">Next →</button>
            <span className="text-sm text-slate-400 ml-auto">{current + 1} of {pending.length}</span>
          </div>

          {pending[current] && (
            <GradingCard
              key={pending[current].id}
              submission={pending[current]}
              examId={selectedExam}
              onDone={() => setCurrent((c) => Math.min(c, Math.max(pending.length - 2, 0)))}
            />
          )}
        </>
      )}
    </div>
  )
}
