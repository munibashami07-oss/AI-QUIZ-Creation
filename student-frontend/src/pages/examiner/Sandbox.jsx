import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listExams, getExam, listQuestions } from '../../api/examiner'
import { fmt } from '../../utils/time'
import { Empty, Skeleton, cx } from '../../components/ui'

// ── answer widget ─────────────────────────────────────────────────────────────
function AnswerWidget({ q, answer, onChange }) {
  if (q.type === 'mcq') {
    return (
      <ul className="space-y-2.5 mt-4">
        {(q.options ?? []).map((opt, idx) => (
          <li key={idx}>
            <label className={cx('flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none',
              answer === idx ? 'border-[#1e3a5f] bg-slate-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50')}>
              <span className={cx('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                answer === idx ? 'border-[#1e3a5f] bg-[#1e3a5f]' : 'border-slate-300')}>
                {answer === idx && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
              <input type="radio" checked={answer === idx} onChange={() => onChange(idx)} className="sr-only" />
              <span className="text-sm text-slate-700">{opt || <span className="italic text-slate-400">Empty option</span>}</span>
            </label>
          </li>
        ))}
      </ul>
    )
  }
  if (q.type === 'multi') {
    const sel = answer ?? []
    return (
      <ul className="space-y-2.5 mt-4">
        {(q.options ?? []).map((opt, idx) => {
          const checked = sel.includes(idx)
          return (
            <li key={idx}>
              <label className={cx('flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none',
                checked ? 'border-[#1e3a5f] bg-slate-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/50')}>
                <span className={cx('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                  checked ? 'border-[#1e3a5f] bg-[#1e3a5f]' : 'border-slate-300')}>
                  {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
                </span>
                <input type="checkbox" checked={checked} onChange={() => onChange(checked ? sel.filter((x) => x !== idx) : [...sel, idx])} className="sr-only" />
                <span className="text-sm text-slate-700">{opt || <span className="italic text-slate-400">Empty option</span>}</span>
              </label>
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <textarea value={answer ?? ''} onChange={(e) => onChange(e.target.value)}
      rows={5} placeholder="Type your answer here…"
      className="field w-full h-auto p-4 text-sm bg-white resize-none mt-4 leading-relaxed" />
  )
}

// ── countdown timer ───────────────────────────────────────────────────────────
function Timer({ remainingSec }) {
  const mins = Math.floor(remainingSec / 60)
  const secs = remainingSec % 60
  const critical = remainingSec <= 300
  return (
    <div className={cx('flex items-center gap-2 font-mono font-bold text-base', critical ? 'text-rose-500 animate-pulse' : 'text-white')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
      </svg>
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </div>
  )
}

// ── question palette ──────────────────────────────────────────────────────────
function QuestionPalette({ questions, answers, current, onJump }) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Question Palette</p>
      <div className="flex flex-wrap gap-2">
        {questions.map((q, i) => {
          const answered = answers[q.id] !== undefined && answers[q.id] !== '' &&
            !(Array.isArray(answers[q.id]) && answers[q.id].length === 0)
          return (
            <button key={q.id} onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}${answered ? ', answered' : ', unanswered'}`}
              className={cx(
                'w-9 h-9 rounded-xl text-xs font-bold transition-all duration-200',
                i === current ? 'bg-[#1e3a5f] text-white shadow-sm scale-110' :
                answered ? 'bg-green-100 text-green-700 hover:bg-green-200' :
                'bg-slate-100 text-slate-500 hover:bg-slate-200',
              )}>
              {i + 1}
            </button>
          )
        })}
      </div>
      <div className="flex gap-4 mt-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100" />Answered</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100" />Not answered</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#1e3a5f]" />Current</div>
      </div>
    </div>
  )
}

// ── exam workspace (sandbox) ──────────────────────────────────────────────────
function ExamWorkspace({ exam, questions, onExit }) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [remainingSec, setRemainingSec] = useState(exam.duration_min * 60)
  const [showPalette, setShowPalette] = useState(true)
  const intervalRef = useRef(null)

  // countdown
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setRemainingSec((s) => {
        if (s <= 1) { clearInterval(intervalRef.current); setSubmitted('timeout'); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [])

  if (submitted) {
    const answeredCount = Object.keys(answers).length
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="text-5xl mb-4">{submitted === 'timeout' ? '⏱' : '✅'}</div>
        <h2 className="text-2xl font-bold text-[#0f172a] mb-2">
          {submitted === 'timeout' ? 'Time expired' : 'Exam submitted'}
        </h2>
        <p className="text-slate-500 mb-6">
          {submitted === 'timeout'
            ? 'The exam was auto-submitted when the timer reached zero.'
            : 'You manually submitted the exam.'}
          {' '}You answered {answeredCount} of {questions.length} questions.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-700 mb-6">
          🔍 <strong>Sandbox Mode</strong> — No data was recorded. This was a preview only.
        </div>
        <button onClick={onExit} className="btn btn-acc h-11 px-8">← Back to Setup</button>
      </div>
    )
  }

  const q = questions[current]
  const totalMarks = questions.reduce((s, q) => s + (Number(q.marks) || 0), 0)

  return (
    <div className="min-h-[80dvh] flex flex-col">
      {/* exam top bar */}
      <div className="bg-[#0f172a] text-white rounded-2xl px-5 py-3.5 mb-5 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-white/40 text-xs font-medium uppercase tracking-wider">Sandbox Preview</p>
          <p className="font-bold text-base leading-tight">{exam.title}</p>
        </div>
        <Timer remainingSec={remainingSec} />
        <button onClick={() => setShowPalette((v) => !v)} className="btn btn-ghost h-8 px-3 text-xs border-white/20 text-white/70 hover:bg-white/10 ml-2">
          {showPalette ? 'Hide palette' : 'Show palette'}
        </button>
        <button onClick={onExit} className="btn btn-ghost h-8 px-3 text-xs border-white/20 text-white/70 hover:bg-white/10">Exit</button>
      </div>

      {/* body */}
      <div className={cx('flex gap-5 flex-1', showPalette ? 'grid lg:grid-cols-[1fr_220px]' : 'grid-cols-1')}>
        {/* question */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            {/* question meta */}
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Q{current + 1} / {questions.length}</span>
                <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full',
                  q.type === 'mcq' ? 'bg-blue-50 text-blue-700' : q.type === 'multi' ? 'bg-purple-50 text-purple-700' : 'bg-amber-50 text-amber-700')}>
                  {q.type === 'mcq' ? 'Single choice' : q.type === 'multi' ? 'Select all that apply' : 'Written answer'}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-medium">{q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
            </div>

            {/* progress bar */}
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-5">
              <div className="h-full bg-[#1e3a5f] rounded-full transition-all duration-300"
                style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
            </div>

            <p className="text-[#0f172a] font-medium text-base leading-relaxed">{q.text}</p>
            <AnswerWidget q={q} answer={answers[q.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          </div>

          {/* navigation */}
          <div className="flex items-center justify-between gap-3">
            <button onClick={() => setCurrent((c) => Math.max(c - 1, 0))} disabled={current === 0}
              className="btn btn-ghost h-10 px-5 border-slate-200 disabled:opacity-40">← Previous</button>
            <span className="text-sm text-slate-400">
              {Object.values(answers).filter((v) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).length} / {questions.length} answered
            </span>
            {current < questions.length - 1 ? (
              <button onClick={() => setCurrent((c) => c + 1)} className="btn btn-acc h-10 px-5">Next →</button>
            ) : (
              <button onClick={() => { clearInterval(intervalRef.current); setSubmitted('manual') }}
                className="btn h-10 px-5 bg-green-600 text-white hover:bg-green-700 font-semibold">Submit Exam ✓</button>
            )}
          </div>
        </div>

        {/* palette sidebar */}
        {showPalette && (
          <div className="space-y-4">
            <QuestionPalette questions={questions} answers={answers} current={current} onJump={setCurrent} />
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-xs text-slate-500 space-y-1">
              <p><span className="font-semibold text-[#0f172a]">Total marks:</span> {totalMarks}</p>
              <p><span className="font-semibold text-[#0f172a]">Duration:</span> {exam.duration_min} min</p>
              {exam.violation_limit && <p><span className="font-semibold text-[#0f172a]">Violation limit:</span> {exam.violation_limit}</p>}
            </div>
            <button onClick={() => { clearInterval(intervalRef.current); setSubmitted('manual') }}
              className="btn w-full h-10 bg-green-600 text-white hover:bg-green-700 font-semibold text-sm">
              ✓ Submit Exam
            </button>
          </div>
        )}
      </div>

      {/* sandbox notice */}
      <div className="mt-5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-700 text-center">
        🔍 <strong>Sandbox Mode</strong> — This is a read-only preview. No data is recorded and answer keys are not enforced.
      </div>
    </div>
  )
}

// ── setup screen ──────────────────────────────────────────────────────────────
export default function Sandbox() {
  const [params] = useSearchParams()
  const [selectedExamId, setSelectedExamId] = useState(params.get('exam') ?? '')
  const [started, setStarted] = useState(false)

  const { data: exams = [] } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const { data: exam, isLoading } = useQuery({
    queryKey: ['examiner', 'exam', selectedExamId],
    queryFn: () => getExam(selectedExamId),
    enabled: !!selectedExamId,
  })
  const { data: bankQuestions = [] } = useQuery({ queryKey: ['examiner', 'questions'], queryFn: listQuestions })

  // Resolve question ids to full objects
  const questions = (exam?.questions ?? []).map((q) =>
    typeof q === 'string'
      ? (bankQuestions.find((bq) => bq.id === q) ?? { id: q, type: 'short', text: '[Question not found in bank]', marks: 0, options: [] })
      : { ...q }
  )

  if (started && exam) {
    return (
      <div>
        <ExamWorkspace exam={exam} questions={questions} onExit={() => setStarted(false)} />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Sandbox Preview</h1>
        <p className="text-slate-500 mt-1">Experience any exam exactly as students will see it, including the timer, question palette and navigation.</p>
      </div>

      <div className="max-w-xl space-y-5">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Select Exam to Preview</label>
          <select value={selectedExamId} onChange={(e) => { setSelectedExamId(e.target.value); setStarted(false) }}
            className="field bg-slate-50 mb-5">
            <option value="">— Choose an exam —</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.status})</option>)}
          </select>

          {isLoading && <Skeleton className="h-32 !bg-slate-100" />}

          {exam && !isLoading && (
            <div className="bg-slate-50 rounded-xl p-4 mb-5 text-sm grid grid-cols-2 gap-3">
              {[
                ['Duration', `${exam.duration_min} min`],
                ['Questions', questions.length],
                ['Total Marks', questions.reduce((s, q) => s + (Number(q.marks) || 0), 0)],
                ['Violation Limit', exam.violation_limit ?? '—'],
                ['Opens', fmt(exam.publish_at)],
                ['Closes', fmt(exam.end_at)],
                ['Attendance', exam.attendance_required ? 'Required' : 'Not required'],
                ['Status', exam.status],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-slate-400 font-medium">{k}</dt>
                  <dd className="font-semibold text-[#0f172a] mt-0.5 text-sm">{String(v)}</dd>
                </div>
              ))}
            </div>
          )}

          {exam?.instructions && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 mb-5">
              <p className="font-semibold mb-1">📋 Instructions</p>
              <p className="leading-relaxed">{exam.instructions}</p>
            </div>
          )}

          <button disabled={!selectedExamId || isLoading || questions.length === 0} onClick={() => setStarted(true)}
            className="btn btn-acc w-full h-11 disabled:opacity-50">
            👁 Launch Sandbox Preview
          </button>
          {exam && questions.length === 0 && (
            <p className="text-xs text-amber-600 mt-2 text-center">This exam has no questions. Add questions before previewing.</p>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <p className="font-semibold text-blue-800 text-sm mb-2">Sandbox includes:</p>
          <ul className="space-y-1 text-sm text-blue-700">
            {[
              'Countdown timer — experience the same time pressure as students.',
              'Question palette — visual overview of answered and unanswered questions.',
              'Full answer interactions — MCQ, multi-select and short answer.',
              'Submit flow — manual submit and auto-submit on timeout.',
              'No data recorded — completely safe to test as many times as needed.',
            ].map((t, i) => <li key={i}>· {t}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}
