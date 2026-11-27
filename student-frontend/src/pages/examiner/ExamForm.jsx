/**
 * ExamForm — create or edit an exam.
 * Route params: :id (optional, 'new' → create mode)
 * Features: manual question builder + AI generation, MCQ / multi-select / short-answer,
 *           topic/difficulty selectors, duration, times, violation limits, attendance toggle,
 *           instructions, inline preview.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getExam, saveExam, listQuestions, getCategories } from '../../api/examiner'
import { Skeleton, Spinner, Switch, cx } from '../../components/ui'

// ── helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 8)
const blank = () => ({
  title: '', subject: '', description: '', instructions: '',
  duration_min: 60, publish_at: '', end_at: '',
  violation_limit: 2, attendance_required: false, total_marks: 0,
  questions: [],   // [{id, type, text, options[], answer, marks, difficulty, category}]
})

function calcMarks(qs) { return qs.reduce((s, q) => s + (Number(q.marks) || 0), 0) }

function reducer(state, action) {
  switch (action.type) {
    case 'set': return { ...state, [action.key]: action.value }
    case 'replace': return { ...action.payload }
    case 'addQ': return { ...state, questions: [...state.questions, action.q] }
    case 'updateQ': return { ...state, questions: state.questions.map((q) => q.id === action.id ? { ...q, ...action.patch } : q) }
    case 'deleteQ': return { ...state, questions: state.questions.filter((q) => q.id !== action.id) }
    case 'moveQ': {
      const qs = [...state.questions]
      const [item] = qs.splice(action.from, 1)
      qs.splice(action.to, 0, item)
      return { ...state, questions: qs }
    }
    default: return state
  }
}

// ── AI mock ───────────────────────────────────────────────────────────────────
function fakeAiGenerate(topic, count, type, difficulty) {
  const qs = []
  for (let i = 0; i < count; i++) {
    const id = uid()
    if (type === 'mcq' || (type === 'mixed' && i % 3 !== 2)) {
      qs.push({ id, type: 'mcq', category: topic, difficulty, marks: 2,
        text: `[AI] Which statement about ${topic} (${i + 1}) is correct?`,
        options: ['Option A — a correct answer', 'Option B', 'Option C', 'Option D'], answer: 0 })
    } else if (type === 'multi' || (type === 'mixed' && i % 3 === 1)) {
      qs.push({ id, type: 'multi', category: topic, difficulty, marks: 3,
        text: `[AI] Select all correct statements about ${topic} (${i + 1}).`,
        options: ['Correct statement 1', 'Correct statement 2', 'Incorrect statement', 'Another option'], answer: [0, 1] })
    } else {
      qs.push({ id, type: 'short', category: topic, difficulty, marks: 4,
        text: `[AI] In 2-3 sentences, explain a key concept of ${topic}.` })
    }
  }
  return new Promise((r) => setTimeout(() => r(qs), 1200))
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function OptionRow({ opt, idx, onChange, onDelete }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center text-xs text-slate-400 shrink-0 font-medium">
        {String.fromCharCode(65 + idx)}
      </span>
      <input
        value={opt}
        onChange={(e) => onChange(e.target.value)}
        className="field flex-1 h-9 text-sm bg-white"
        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
        aria-label={`Option ${String.fromCharCode(65 + idx)}`}
      />
      <button type="button" onClick={onDelete} className="text-slate-300 hover:text-rose-400 transition-colors" aria-label="Remove option">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  )
}

function QuestionEditor({ q, dispatch }) {
  const setQ = (patch) => dispatch({ type: 'updateQ', id: q.id, patch })
  const opts = q.options ?? []

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      {/* header row */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select value={q.type} onChange={(e) => setQ({ type: e.target.value, options: e.target.value !== 'short' ? (opts.length ? opts : ['', '', '', '']) : undefined, answer: e.target.value === 'multi' ? [] : 0 })}
          className="field h-9 w-auto px-2 text-sm bg-white">
          <option value="mcq">MCQ (single)</option>
          <option value="multi">Multi-select</option>
          <option value="short">Short answer</option>
        </select>
        <select value={q.difficulty ?? 'medium'} onChange={(e) => setQ({ difficulty: e.target.value })}
          className="field h-9 w-auto px-2 text-sm bg-white">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <input value={q.category ?? ''} onChange={(e) => setQ({ category: e.target.value })}
          placeholder="Category" className="field h-9 text-sm bg-white w-36" />
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-slate-500">Marks</label>
          <input type="number" min={1} max={20} value={q.marks ?? 2} onChange={(e) => setQ({ marks: Number(e.target.value) })}
            className="field h-9 w-16 text-sm bg-white text-center" aria-label="Marks" />
        </div>
        <button type="button" onClick={() => dispatch({ type: 'deleteQ', id: q.id })}
          className="text-slate-300 hover:text-rose-400 transition-colors" aria-label="Delete question">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M3 6h18m-2 0l-1.5 14H6.5L5 6m5 0V4a1 1 0 011-1h2a1 1 0 011 1v2"/></svg>
        </button>
      </div>

      {/* question text */}
      <textarea value={q.text} onChange={(e) => setQ({ text: e.target.value })}
        rows={2} placeholder="Enter question text…"
        className="field w-full h-auto p-3 text-sm bg-white resize-none mb-4" aria-label="Question text" />

      {/* options (MCQ / multi) */}
      {q.type !== 'short' && (
        <div className="space-y-2 mb-4">
          {opts.map((opt, idx) => (
            <OptionRow key={idx} opt={opt} idx={idx}
              onChange={(v) => setQ({ options: opts.map((o, i) => i === idx ? v : o) })}
              onDelete={() => setQ({ options: opts.filter((_, i) => i !== idx), answer: q.type === 'multi' ? (q.answer ?? []).filter((a) => a !== idx) : (q.answer === idx ? 0 : q.answer) })}
            />
          ))}
          {opts.length < 6 && (
            <button type="button" onClick={() => setQ({ options: [...opts, ''] })}
              className="text-sm text-sky-600 hover:text-sky-800 font-medium flex items-center gap-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4v16m8-8H4"/></svg>
              Add option
            </button>
          )}
        </div>
      )}

      {/* answer key */}
      {q.type === 'mcq' && opts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Correct answer</p>
          <div className="flex flex-wrap gap-2">
            {opts.map((opt, idx) => (
              <button key={idx} type="button" onClick={() => setQ({ answer: idx })}
                className={cx('h-8 px-3 rounded-lg text-sm font-medium border transition-colors',
                  q.answer === idx ? 'bg-green-50 border-green-400 text-green-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                {String.fromCharCode(65 + idx)}
              </button>
            ))}
          </div>
        </div>
      )}
      {q.type === 'multi' && opts.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Correct answers (select all that apply)</p>
          <div className="flex flex-wrap gap-2">
            {opts.map((opt, idx) => {
              const ans = q.answer ?? []
              const sel = ans.includes(idx)
              return (
                <button key={idx} type="button" onClick={() => setQ({ answer: sel ? ans.filter((a) => a !== idx) : [...ans, idx] })}
                  className={cx('h-8 px-3 rounded-lg text-sm font-medium border transition-colors',
                    sel ? 'bg-green-50 border-green-400 text-green-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                  {String.fromCharCode(65 + idx)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI generation panel ───────────────────────────────────────────────────────
function AIPanel({ onAdd, categories }) {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(5)
  const [type, setType] = useState('mixed')
  const [diff, setDiff] = useState('medium')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!topic) return
    setBusy(true)
    try { const qs = await fakeAiGenerate(topic, count, type, diff); onAdd(qs) } finally { setBusy(false) }
  }

  return (
    <div className="bg-gradient-to-br from-[#1e3a5f]/5 to-sky-50 border border-sky-200 rounded-2xl p-5">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 font-semibold text-[#1e3a5f] text-sm w-full">
        <span className="text-lg">✨</span> Generate questions with AI
        <svg className={cx('ml-auto transition-transform', open ? 'rotate-180' : '')} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className="mt-4 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Topic / Category</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} list="ai-topics" placeholder="e.g. Data Structures"
              className="field bg-white text-sm" />
            <datalist id="ai-topics">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Question Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="field bg-white text-sm">
              <option value="mixed">Mixed</option>
              <option value="mcq">MCQ only</option>
              <option value="multi">Multi-select only</option>
              <option value="short">Short answer only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Difficulty</label>
            <select value={diff} onChange={(e) => setDiff(e.target.value)} className="field bg-white text-sm">
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Number of questions</label>
            <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="field bg-white text-sm" />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="button" disabled={!topic || busy} onClick={run}
              className="btn h-10 px-5 bg-[#1e3a5f] text-white hover:bg-[#162d4a] transition-colors font-semibold text-sm disabled:opacity-50">
              {busy ? <><Spinner /> Generating…</> : '✨ Generate'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── preview panel ─────────────────────────────────────────────────────────────
function Preview({ form }) {
  const [open, setOpen] = useState(false)
  if (!open) return (
    <div className="sticky bottom-6 flex justify-center">
      <button type="button" onClick={() => setOpen(true)}
        className="btn h-10 px-6 bg-[#1e3a5f] text-white shadow-lg hover:bg-[#162d4a] transition-colors font-semibold text-sm">
        👁 Preview Exam
      </button>
    </div>
  )
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#0f172a]">{form.title || 'Untitled Exam'}</h2>
            {form.subject && <p className="text-slate-400 text-sm mt-0.5">{form.subject}</p>}
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 ml-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <dl className="grid grid-cols-3 gap-3 text-sm mb-6 p-4 bg-slate-50 rounded-xl">
          {[['Duration', `${form.duration_min} min`], ['Marks', calcMarks(form.questions)], ['Questions', form.questions.length]].map(([dt, dd]) => (
            <div key={dt}><dt className="text-xs text-slate-400 font-medium">{dt}</dt><dd className="font-semibold text-[#0f172a] mt-0.5">{dd}</dd></div>
          ))}
        </dl>
        {form.instructions && (
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-800 mb-6">
            <p className="font-semibold mb-1">Instructions</p>
            <p>{form.instructions}</p>
          </div>
        )}
        <ol className="space-y-6">
          {form.questions.map((q, i) => (
            <li key={q.id} className="border border-slate-100 rounded-xl p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <p className="font-medium text-sm text-[#0f172a]"><span className="text-slate-400 mr-2">Q{i + 1}.</span>{q.text}</p>
                <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full whitespace-nowrap">{q.marks} mk</span>
              </div>
              {q.type !== 'short' && q.options?.length > 0 && (
                <ul className="space-y-2">
                  {q.options.map((opt, idx) => (
                    <li key={idx} className={cx('flex items-center gap-2 text-sm px-3 py-2 rounded-lg', q.type === 'mcq' && q.answer === idx ? 'bg-green-50 text-green-700 font-medium' : q.type === 'multi' && (q.answer ?? []).includes(idx) ? 'bg-green-50 text-green-700 font-medium' : 'text-slate-600')}>
                      <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt || <span className="italic opacity-50">Empty option</span>}
                    </li>
                  ))}
                </ul>
              )}
              {q.type === 'short' && <p className="text-sm text-slate-400 italic">[ Written response ]</p>}
            </li>
          ))}
        </ol>
        {form.questions.length === 0 && <p className="text-center text-slate-400 py-8">No questions added yet.</p>}
      </div>
    </div>
  )
}

// ── import from bank modal ─────────────────────────────────────────────────────
function BankPicker({ open, onClose, onImport }) {
  const { data: bankQ = [] } = useQuery({ queryKey: ['examiner', 'questions'], queryFn: listQuestions, enabled: open })
  const [sel, setSel] = useState([])

  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])

  return open ? (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85dvh] overflow-y-auto p-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-[#0f172a]">Import from Question Bank</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <ul className="space-y-2 mb-6">
          {bankQ.map((q) => (
            <li key={q.id}
              onClick={() => toggle(q.id)}
              className={cx('flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                sel.includes(q.id) ? 'bg-sky-50 border-sky-300' : 'border-slate-100 hover:bg-slate-50')}>
              <div className={cx('mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                sel.includes(q.id) ? 'bg-[#1e3a5f] border-[#1e3a5f]' : 'border-slate-300')}>
                {sel.includes(q.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-[#0f172a] font-medium line-clamp-2">{q.text}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-slate-400">{q.type.toUpperCase()}</span>
                  <span className="text-xs text-slate-400">· {q.category}</span>
                  <span className="text-xs text-slate-400">· {q.difficulty}</span>
                  <span className="text-xs text-slate-400">· {q.marks} mk</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-3">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button disabled={!sel.length} onClick={() => { onImport(bankQ.filter((q) => sel.includes(q.id))); setSel([]); onClose() }}
            className="btn h-10 px-5 bg-[#1e3a5f] text-white hover:bg-[#162d4a] font-semibold text-sm disabled:opacity-50">
            Import {sel.length > 0 ? `(${sel.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  ) : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Main ExamForm component
// ─────────────────────────────────────────────────────────────────────────────
export default function ExamForm() {
  const { id } = useParams()
  const isNew = !id || id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [form, dispatch] = useReducer(reducer, blank())
  const [errors, setErrors] = useState({})
  const [bankOpen, setBankOpen] = useState(false)

  const { data: existing, isLoading: loadingExam } = useQuery({
    queryKey: ['examiner', 'exam', id],
    queryFn: () => getExam(id),
    enabled: !isNew,
  })

  const { data: categories = [] } = useQuery({ queryKey: ['examiner', 'categories'], queryFn: getCategories })

  useEffect(() => {
    if (existing) {
      // normalize questions: add local id if missing
      const qs = (existing.questions ?? []).map((q) => typeof q === 'string' ? { id: q, type: 'mcq', text: '', marks: 2, options: ['', '', '', ''], answer: 0 } : { ...q, id: q.id ?? uid() })
      dispatch({ type: 'replace', payload: { ...blank(), ...existing, questions: qs } })
    }
  }, [existing])

  const saveMut = useMutation({
    mutationFn: (data) => saveExam(isNew ? null : id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'exams'] }); navigate('/examiner/exams') },
  })

  const validate = () => {
    const e = {}
    if (!form.title.trim()) e.title = 'Title is required.'
    if (!form.duration_min || form.duration_min < 1) e.duration_min = 'Enter a valid duration.'
    if (!form.publish_at) e.publish_at = 'Set a publish time.'
    if (!form.end_at) e.end_at = 'Set an end time.'
    if (form.publish_at && form.end_at && form.publish_at >= form.end_at) e.end_at = 'End time must be after publish time.'
    if (form.questions.length === 0) e.questions = 'Add at least one question.'
    return e
  }

  const submit = (e) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return
    saveMut.mutate({ ...form, total_marks: calcMarks(form.questions) })
  }

  const addBlankQ = (type = 'mcq') => {
    const defaults = type !== 'short' ? { options: ['', '', '', ''], answer: type === 'multi' ? [] : 0 } : {}
    dispatch({ type: 'addQ', q: { id: uid(), type, text: '', marks: 2, difficulty: 'medium', category: '', ...defaults } })
  }

  const importFromBank = (qs) => {
    qs.forEach((q) => dispatch({ type: 'addQ', q: { ...q, id: uid() } }))
  }

  const set = (key) => (e) => dispatch({ type: 'set', key, value: typeof e === 'object' && e?.target ? e.target.value : e })

  if (!isNew && loadingExam) return <div className="grid gap-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 !bg-slate-100" />)}</div>

  const toLocal = (iso) => iso ? iso.slice(0, 16) : ''
  const fromLocal = (s) => s ? new Date(s).toISOString() : ''

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-slate-600 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">{isNew ? 'Create Exam' : 'Edit Exam'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">{isNew ? 'Build your examination from scratch or use AI.' : 'Update exam settings and questions.'}</p>
        </div>
      </div>

      <form onSubmit={submit} noValidate className="space-y-6 pb-24">
        {/* ── basic info ── */}
        <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#0f172a] mb-4">Basic Information</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Exam Title <span className="text-rose-500">*</span></label>
              <input value={form.title} onChange={set('title')} placeholder="e.g. Data Structures Midterm" className={cx('field bg-white', errors.title && 'border-rose-400')} />
              {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Subject / Course Code</label>
              <input value={form.subject} onChange={set('subject')} placeholder="e.g. CS301" className="field bg-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Duration (minutes) <span className="text-rose-500">*</span></label>
              <input type="number" min={1} value={form.duration_min} onChange={set('duration_min')} className={cx('field bg-white', errors.duration_min && 'border-rose-400')} />
              {errors.duration_min && <p className="mt-1 text-xs text-rose-500">{errors.duration_min}</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Description</label>
              <textarea value={form.description} onChange={set('description')} rows={2} placeholder="Brief overview of this exam…" className="field bg-white h-auto p-3 resize-none w-full" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Examination Instructions</label>
              <textarea value={form.instructions} onChange={set('instructions')} rows={3} placeholder="Rules and guidelines shown to students before they start…" className="field bg-white h-auto p-3 resize-none w-full" />
            </div>
          </div>
        </section>

        {/* ── schedule & rules ── */}
        <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#0f172a] mb-4">Schedule & Rules</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Publish Time <span className="text-rose-500">*</span></label>
              <input type="datetime-local" value={toLocal(form.publish_at)} onChange={(e) => dispatch({ type: 'set', key: 'publish_at', value: fromLocal(e.target.value) })}
                className={cx('field bg-white', errors.publish_at && 'border-rose-400')} />
              {errors.publish_at && <p className="mt-1 text-xs text-rose-500">{errors.publish_at}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">End Time <span className="text-rose-500">*</span></label>
              <input type="datetime-local" value={toLocal(form.end_at)} onChange={(e) => dispatch({ type: 'set', key: 'end_at', value: fromLocal(e.target.value) })}
                className={cx('field bg-white', errors.end_at && 'border-rose-400')} />
              {errors.end_at && <p className="mt-1 text-xs text-rose-500">{errors.end_at}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Violation Limit</label>
              <select value={form.violation_limit} onChange={set('violation_limit')} className="field bg-white">
                {[1, 2, 3, 5, 10].map((v) => <option key={v} value={v}>{v} violation{v > 1 ? 's' : ''} → auto-submit</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-400">Student is auto-submitted after this many violations (tab-switch, fullscreen exit, etc.)</p>
            </div>
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <p className="text-sm font-medium text-[#0f172a]">Require Attendance</p>
                <p className="text-xs text-slate-400 mt-0.5">Students must be marked present to access the exam.</p>
              </div>
              <Switch checked={form.attendance_required} onChange={(v) => dispatch({ type: 'set', key: 'attendance_required', value: v })} label="Require attendance" />
            </div>
          </div>
        </section>

        {/* ── questions ── */}
        <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[#0f172a]">Questions</h2>
              <p className="text-xs text-slate-400 mt-0.5">{form.questions.length} question{form.questions.length !== 1 ? 's' : ''} · {calcMarks(form.questions)} total marks</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setBankOpen(true)} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">From Bank</button>
              <button type="button" onClick={() => addBlankQ('mcq')} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">+ MCQ</button>
              <button type="button" onClick={() => addBlankQ('multi')} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">+ Multi</button>
              <button type="button" onClick={() => addBlankQ('short')} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">+ Short</button>
            </div>
          </div>

          <AIPanel onAdd={(qs) => qs.forEach((q) => dispatch({ type: 'addQ', q }))} categories={categories} />

          {errors.questions && <p className="mt-3 text-xs text-rose-500">{errors.questions}</p>}

          <div className="mt-5 space-y-4">
            {form.questions.map((q, i) => (
              <div key={q.id} className="relative">
                <div className="absolute -left-1 top-5 flex flex-col gap-1 z-10">
                  {i > 0 && (
                    <button type="button" onClick={() => dispatch({ type: 'moveQ', from: i, to: i - 1 })} aria-label="Move up" className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center shadow-sm">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 15l-6-6-6 6"/></svg>
                    </button>
                  )}
                  {i < form.questions.length - 1 && (
                    <button type="button" onClick={() => dispatch({ type: 'moveQ', from: i, to: i + 1 })} aria-label="Move down" className="h-6 w-6 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center shadow-sm">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                  )}
                </div>
                <div className="ml-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Q{i + 1}</span>
                  </div>
                  <QuestionEditor q={q} dispatch={dispatch} />
                </div>
              </div>
            ))}
            {form.questions.length === 0 && (
              <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                No questions yet. Use the buttons above to add questions or generate them with AI.
              </div>
            )}
          </div>
        </section>

        {/* actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="btn btn-ghost border-slate-200">Cancel</button>
          <button type="submit" disabled={saveMut.isPending} className="btn btn-acc">
            {saveMut.isPending && <Spinner />} {isNew ? 'Create Exam' : 'Save Changes'}
          </button>
        </div>
      </form>

      <Preview form={form} />
      <BankPicker open={bankOpen} onClose={() => setBankOpen(false)} onImport={importFromBank} />
    </>
  )
}
