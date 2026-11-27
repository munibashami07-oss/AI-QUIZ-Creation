import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listQuestions, getCategories, saveQuestion, deleteQuestion, listExams, assignQuestionsToExam } from '../../api/examiner'
import { fmtDate } from '../../utils/time'
import { Empty, Modal, Pills, Skeleton, Spinner, cx } from '../../components/ui'

const TYPE_OPTS = [['all', 'All Types'], ['mcq', 'MCQ'], ['multi', 'Multi-select'], ['short', 'Short Answer']]
const DIFF_OPTS = [['all', 'All'], ['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']]

const TYPE_BADGE = {
  mcq: 'bg-blue-50 text-blue-700',
  multi: 'bg-purple-50 text-purple-700',
  short: 'bg-amber-50 text-amber-700',
}
const DIFF_BADGE = {
  easy: 'bg-green-50 text-green-700',
  medium: 'bg-yellow-50 text-yellow-700',
  hard: 'bg-rose-50 text-rose-700',
}
const TYPE_LABEL = { mcq: 'MCQ', multi: 'Multi-select', short: 'Short Answer' }

// ── question form ─────────────────────────────────────────────────────────────
function QuestionForm({ q: initial, categories, onClose }) {
  const qc = useQueryClient()
  const isEdit = !!initial
  const [form, setForm] = useState({
    type: initial?.type ?? 'mcq',
    category: initial?.category ?? '',
    difficulty: initial?.difficulty ?? 'medium',
    text: initial?.text ?? '',
    marks: initial?.marks ?? 2,
    options: initial?.options ?? ['', '', '', ''],
    answer: initial?.answer ?? 0,
  })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const opts = form.options ?? []

  const validate = () => {
    const e = {}
    if (!form.text.trim()) e.text = 'Question text is required.'
    if (!form.category.trim()) e.category = 'Category is required.'
    if (form.type !== 'short') {
      const filled = opts.filter((o) => o.trim())
      if (filled.length < 2) e.options = 'Add at least 2 options.'
    }
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await saveQuestion(initial?.id, form)
      qc.invalidateQueries({ queryKey: ['examiner', 'questions'] })
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="grid sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Type</label>
          <select value={form.type} onChange={(e) => set('type', e.target.value)} className="field bg-white text-sm">
            <option value="mcq">MCQ (single)</option>
            <option value="multi">Multi-select</option>
            <option value="short">Short Answer</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Difficulty</label>
          <select value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)} className="field bg-white text-sm">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">Marks</label>
          <input type="number" min={1} max={20} value={form.marks} onChange={(e) => set('marks', Number(e.target.value))} className="field bg-white text-sm" />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-600 mb-1">Category <span className="text-rose-500">*</span></label>
        <input value={form.category} onChange={(e) => set('category', e.target.value)} list="qb-cats" placeholder="e.g. Data Structures" className={cx('field bg-white text-sm', errors.category && 'border-rose-400')} />
        <datalist id="qb-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        {errors.category && <p className="mt-1 text-xs text-rose-500">{errors.category}</p>}
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-600 mb-1">Question Text <span className="text-rose-500">*</span></label>
        <textarea value={form.text} onChange={(e) => set('text', e.target.value)} rows={3} className={cx('field bg-white text-sm w-full h-auto p-3 resize-none', errors.text && 'border-rose-400')} placeholder="Enter your question…" />
        {errors.text && <p className="mt-1 text-xs text-rose-500">{errors.text}</p>}
      </div>

      {form.type !== 'short' && (
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-600 mb-2">Options</label>
          <div className="space-y-2">
            {opts.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0">{String.fromCharCode(65 + idx)}</span>
                <input value={opt} onChange={(e) => set('options', opts.map((o, i) => i === idx ? e.target.value : o))} className="field flex-1 h-9 bg-white text-sm" placeholder={`Option ${String.fromCharCode(65 + idx)}`} />
                {opts.length > 2 && (
                  <button type="button" onClick={() => set('options', opts.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-rose-400">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                )}
              </div>
            ))}
            {opts.length < 6 && (
              <button type="button" onClick={() => set('options', [...opts, ''])} className="text-sm text-sky-600 hover:text-sky-800 font-medium">+ Add option</button>
            )}
          </div>
          {errors.options && <p className="mt-1 text-xs text-rose-500">{errors.options}</p>}
        </div>
      )}

      {form.type === 'mcq' && opts.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-slate-600 mb-2">Correct answer</p>
          <div className="flex flex-wrap gap-2">
            {opts.map((_, idx) => (
              <button key={idx} type="button" onClick={() => set('answer', idx)}
                className={cx('h-8 px-3 rounded-lg text-sm font-semibold border transition-colors',
                  form.answer === idx ? 'bg-green-50 border-green-400 text-green-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                {String.fromCharCode(65 + idx)}
              </button>
            ))}
          </div>
        </div>
      )}
      {form.type === 'multi' && opts.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium text-slate-600 mb-2">Correct answers</p>
          <div className="flex flex-wrap gap-2">
            {opts.map((_, idx) => {
              const ans = form.answer ?? []
              const sel = ans.includes(idx)
              return (
                <button key={idx} type="button" onClick={() => set('answer', sel ? ans.filter((a) => a !== idx) : [...ans, idx])}
                  className={cx('h-8 px-3 rounded-lg text-sm font-semibold border transition-colors',
                    sel ? 'bg-green-50 border-green-400 text-green-700' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                  {String.fromCharCode(65 + idx)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-5">
        <button type="button" className="btn btn-ghost border-slate-200" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy} className="btn btn-acc">
          {busy && <Spinner />} {isEdit ? 'Save Changes' : 'Add Question'}
        </button>
      </div>
    </form>
  )
}

// ── assign to exam modal ──────────────────────────────────────────────────────
function AssignModal({ questions, open, onClose }) {
  const { data: exams = [] } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams, enabled: open })
  const [examId, setExamId] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()

  const assign = async () => {
    if (!examId) return
    setBusy(true)
    try {
      await assignQuestionsToExam(examId, questions.map((q) => q.id))
      qc.invalidateQueries({ queryKey: ['examiner', 'exams'] })
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign to Exam">
      <p className="text-slate-500 text-sm mb-4">Assign <strong className="text-[#0f172a]">{questions.length} question{questions.length !== 1 ? 's' : ''}</strong> to an exam.</p>
      <select value={examId} onChange={(e) => setExamId(e.target.value)} className="field bg-white mb-4">
        <option value="">Select exam…</option>
        {exams.filter((e) => e.status === 'draft').map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
      </select>
      <p className="text-xs text-slate-400 mb-5">Only draft exams are listed.</p>
      <div className="flex justify-end gap-3">
        <button className="btn btn-ghost border-slate-200" onClick={onClose}>Cancel</button>
        <button disabled={!examId || busy} onClick={assign} className="btn btn-acc">
          {busy && <Spinner />} Assign
        </button>
      </div>
    </Modal>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function QuestionBank() {
  const qc = useQueryClient()
  const { data: questions = [], isLoading } = useQuery({ queryKey: ['examiner', 'questions'], queryFn: listQuestions })
  const { data: categories = [] } = useQuery({ queryKey: ['examiner', 'categories'], queryFn: getCategories })

  const [search, setSearch] = useState('')
  const [typeF, setTypeF] = useState('all')
  const [diffF, setDiffF] = useState('all')
  const [catF, setCatF] = useState('all')
  const [modal, setModal] = useState({ open: false, q: null })
  const [confirmDel, setConfirmDel] = useState(null)
  const [selected, setSelected] = useState([])
  const [assignOpen, setAssignOpen] = useState(false)

  const delM = useMutation({
    mutationFn: (id) => deleteQuestion(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'questions'] }); setConfirmDel(null) },
  })

  const catOpts = [['all', 'All Categories'], ...categories.map((c) => [c, c])]

  const filtered = questions.filter((q) =>
    (typeF === 'all' || q.type === typeF) &&
    (diffF === 'all' || q.difficulty === diffF) &&
    (catF === 'all' || q.category === catF) &&
    (!search || q.text.toLowerCase().includes(search.toLowerCase()) || q.category?.toLowerCase().includes(search.toLowerCase()))
  )

  const toggleSel = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map((q) => q.id))
  const selQuestions = questions.filter((q) => selected.includes(q.id))

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Question Bank</h1>
          <p className="text-slate-500 mt-1">Manage reusable questions across all your exams.</p>
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button onClick={() => setAssignOpen(true)} className="btn h-10 px-4 bg-sky-600 text-white hover:bg-sky-700 font-semibold text-sm">
              Assign {selected.length} to Exam
            </button>
          )}
          <button onClick={() => setModal({ open: true, q: null })} className="btn btn-acc">+ Add Question</button>
        </div>
      </div>

      {/* filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-5 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questions…"
            className="field bg-slate-50 sm:max-w-xs text-sm" aria-label="Search questions" />
          <select value={catF} onChange={(e) => setCatF(e.target.value)} className="field bg-slate-50 text-sm w-auto" aria-label="Filter by category">
            {catOpts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Pills label="Filter by type" value={typeF} onChange={setTypeF} options={TYPE_OPTS} />
          <Pills label="Filter by difficulty" value={diffF} onChange={setDiffF} options={DIFF_OPTS} />
        </div>
        <p className="text-xs text-slate-400">{filtered.length} of {questions.length} questions</p>
      </div>

      {/* list */}
      {isLoading ? (
        <div className="grid gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 !bg-slate-100" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty title="No questions found" hint="Try different filters or add a new question." action={<button className="btn btn-acc" onClick={() => setModal({ open: true, q: null })}>+ Add Question</button>} />
      ) : (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
          {/* select all bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0} onChange={toggleAll}
              className="w-4 h-4 accent-[#1e3a5f] rounded" aria-label="Select all" />
            <span className="text-xs text-slate-500 font-medium">{selected.length > 0 ? `${selected.length} selected` : `${filtered.length} questions`}</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {filtered.map((q, i) => (
              <li key={q.id} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                className={cx('fade flex items-start gap-4 px-4 py-4 hover:bg-slate-50/50 transition-colors', selected.includes(q.id) && 'bg-sky-50/40')}>
                <input type="checkbox" checked={selected.includes(q.id)} onChange={() => toggleSel(q.id)}
                  className="mt-1 w-4 h-4 accent-[#1e3a5f] rounded shrink-0" aria-label={`Select question`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#0f172a] font-medium leading-snug mb-2 line-clamp-3">{q.text}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', TYPE_BADGE[q.type])}>{TYPE_LABEL[q.type]}</span>
                    <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', DIFF_BADGE[q.difficulty])}>{q.difficulty}</span>
                    <span className="text-xs text-slate-400">{q.category}</span>
                    <span className="text-xs text-slate-400">· {q.marks} mk</span>
                    <span className="text-xs text-slate-300">· {fmtDate(q.createdAt)}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setModal({ open: true, q })} className="btn btn-ghost h-8 px-3 text-xs border-slate-200">Edit</button>
                  <button onClick={() => setConfirmDel(q)} className="btn btn-ghost h-8 px-3 text-xs text-rose-500 border-slate-200">Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* add/edit modal */}
      <Modal open={modal.open} onClose={() => setModal((m) => ({ ...m, open: false }))} title={modal.q ? 'Edit Question' : 'Add Question'} wide>
        <QuestionForm q={modal.q} categories={categories} onClose={() => setModal((m) => ({ ...m, open: false }))} />
      </Modal>

      {/* delete confirm */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete question?">
        <p className="text-slate-500 text-sm">This question will be permanently deleted and removed from any exams it was assigned to.</p>
        <div className="flex justify-end gap-3 mt-5">
          <button className="btn btn-ghost border-slate-200" onClick={() => setConfirmDel(null)}>Cancel</button>
          <button className="btn btn-danger" disabled={delM.isPending} onClick={() => delM.mutate(confirmDel.id)}>
            {delM.isPending && <Spinner />} Delete
          </button>
        </div>
      </Modal>

      {/* assign to exam */}
      <AssignModal questions={selQuestions} open={assignOpen} onClose={() => { setAssignOpen(false); setSelected([]) }} />
    </>
  )
}
