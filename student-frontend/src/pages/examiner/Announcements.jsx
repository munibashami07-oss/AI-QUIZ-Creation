import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listAnnouncements, sendAnnouncement, deleteAnnouncement, listExams } from '../../api/examiner'
import { ago } from '../../utils/time'
import { Empty, Modal, Skeleton, Spinner, cx } from '../../components/ui'

const AUDIENCE_BADGE = {
  all: 'bg-purple-50 text-purple-700',
  enrolled: 'bg-sky-50 text-sky-700',
}
const AUDIENCE_LABEL = { all: 'All Students', enrolled: 'Enrolled Only' }

function AnnouncementForm({ exams, onClose }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ title: '', body: '', examId: '', audience: 'all' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  const validate = () => {
    const e = {}
    if (!form.title.trim()) e.title = 'Title is required.'
    if (!form.body.trim()) e.body = 'Message body is required.'
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await sendAnnouncement({ title: form.title.trim(), body: form.body.trim(), examId: form.examId || null, audience: form.audience })
      qc.invalidateQueries({ queryKey: ['examiner', 'announcements'] })
      onClose()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1.5">Title <span className="text-rose-500">*</span></label>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="e.g. Exam Reminder" className={cx('field bg-white', errors.title && 'border-rose-400')} />
        {errors.title && <p className="mt-1 text-xs text-rose-500">{errors.title}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-600 mb-1.5">Message <span className="text-rose-500">*</span></label>
        <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={4}
          placeholder="Write your announcement…" className={cx('field bg-white w-full h-auto p-3 resize-none', errors.body && 'border-rose-400')} />
        {errors.body && <p className="mt-1 text-xs text-rose-500">{errors.body}</p>}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Audience</label>
          <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))} className="field bg-white text-sm">
            <option value="all">All Students</option>
            <option value="enrolled">Enrolled in Selected Exam</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Related Exam (optional)</label>
          <select value={form.examId} onChange={(e) => setForm((f) => ({ ...f, examId: e.target.value }))} className="field bg-white text-sm">
            <option value="">— None —</option>
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
        ⚠️ Announcements are sent immediately and cannot be edited after sending.
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="btn btn-ghost border-slate-200" onClick={onClose}>Cancel</button>
        <button type="submit" disabled={busy} className="btn btn-acc">
          {busy && <Spinner />} Send Announcement
        </button>
      </div>
    </form>
  )
}

export default function Announcements() {
  const qc = useQueryClient()
  const { data: announcements = [], isLoading } = useQuery({ queryKey: ['examiner', 'announcements'], queryFn: listAnnouncements })
  const { data: exams = [] } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const [composeOpen, setComposeOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [search, setSearch] = useState('')

  const delM = useMutation({
    mutationFn: (id) => deleteAnnouncement(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'announcements'] }); setConfirmDel(null) },
  })

  const filtered = announcements.filter((a) =>
    !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.body.toLowerCase().includes(search.toLowerCase())
  )

  const relatedExam = (a) => a.examId ? exams.find((e) => e.id === a.examId) : null

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Announcements</h1>
          <p className="text-slate-500 mt-1">Send notifications and reminders to your students.</p>
        </div>
        <button onClick={() => setComposeOpen(true)} className="btn btn-acc">+ New Announcement</button>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Sent', value: announcements.length },
          { label: 'To All Students', value: announcements.filter((a) => a.audience === 'all').length },
          { label: 'Exam-specific', value: announcements.filter((a) => a.examId).length },
        ].map(({ label, value }, i) => (
          <div key={label} style={{ animationDelay: `${i * 60}ms` }}
            className="rise bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 font-medium">{label}</p>
            <p className="text-2xl font-bold text-[#0f172a] mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* search */}
      <div className="mb-4">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search announcements…"
          className="field bg-white sm:max-w-sm" aria-label="Search" />
      </div>

      {/* list */}
      {isLoading ? (
        <div className="grid gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 !bg-slate-100" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty title="No announcements" hint="Create your first announcement using the button above."
          action={<button className="btn btn-acc" onClick={() => setComposeOpen(true)}>+ New Announcement</button>} />
      ) : (
        <ul className="space-y-4">
          {filtered.map((a, i) => {
            const exam = relatedExam(a)
            return (
              <li key={a.id} style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
                className="rise bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={cx('text-xs font-semibold px-2.5 py-0.5 rounded-full', AUDIENCE_BADGE[a.audience])}>
                        {AUDIENCE_LABEL[a.audience]}
                      </span>
                      {exam && <span className="text-xs text-slate-400 font-medium">· {exam.title}</span>}
                    </div>
                    <h3 className="text-base font-semibold text-[#0f172a]">{a.title}</h3>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">{a.body}</p>
                    <p className="text-xs text-slate-400 mt-2">{ago(a.sentAt)}</p>
                  </div>
                  <button onClick={() => setConfirmDel(a)}
                    className="btn btn-ghost h-8 px-3 text-xs text-rose-500 border-slate-200 hover:bg-rose-50 hover:border-rose-200 shrink-0">
                    Delete
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* compose modal */}
      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="New Announcement" wide>
        <AnnouncementForm exams={exams} onClose={() => setComposeOpen(false)} />
      </Modal>

      {/* delete confirm */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete announcement?">
        <p className="text-slate-500 text-sm">
          <strong className="text-[#0f172a]">"{confirmDel?.title}"</strong> will be permanently removed from the history.
        </p>
        <div className="flex justify-end gap-3 mt-5">
          <button className="btn btn-ghost border-slate-200" onClick={() => setConfirmDel(null)}>Cancel</button>
          <button className="btn btn-danger" disabled={delM.isPending} onClick={() => delM.mutate(confirmDel.id)}>
            {delM.isPending && <Spinner />} Delete
          </button>
        </div>
      </Modal>
    </>
  )
}
