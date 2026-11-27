import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listExams, deleteExam, publishExam } from '../../api/examiner'
import { fmt } from '../../utils/time'
import { Empty, Modal, Pills, Skeleton, Spinner, cx } from '../../components/ui'

const STATUS_TABS = [
  ['all', 'All'],
  ['draft', 'Draft'],
  ['published', 'Published'],
  ['ongoing', 'Ongoing'],
  ['completed', 'Completed'],
]

const STATUS_BADGE = {
  draft: 'bg-slate-100 text-slate-600',
  published: 'bg-sky-100 text-sky-700',
  ongoing: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
}

const STATUS_DOT = {
  draft: 'bg-slate-400',
  published: 'bg-sky-500',
  ongoing: 'bg-amber-500',
  completed: 'bg-green-500',
}

export default function Exams() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)
  const [confirmPub, setConfirmPub] = useState(null)

  const { data: exams = [], isLoading } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })

  const delM = useMutation({
    mutationFn: (id) => deleteExam(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'exams'] }); setConfirmDel(null) },
  })

  const pubM = useMutation({
    mutationFn: (id) => publishExam(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'exams'] }); setConfirmPub(null) },
  })

  const filtered = exams
    .filter((e) => tab === 'all' || e.status === tab)
    .filter((e) => !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.subject?.toLowerCase().includes(search.toLowerCase()))

  const countOf = (s) => exams.filter((e) => e.status === s).length

  return (
    <>
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">My Exams</h1>
          <p className="text-slate-500 mt-1">Manage all your examination papers in one place.</p>
        </div>
        <Link to="/examiner/exams/new" className="btn btn-acc">+ Create Exam</Link>
      </div>

      {/* filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          type="search"
          placeholder="Search exams…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="field sm:max-w-xs bg-white"
          aria-label="Search exams"
        />
        <Pills
          label="Filter by status"
          value={tab}
          onChange={setTab}
          options={STATUS_TABS.map(([k, l]) => [k, k === 'all' ? `All (${exams.length})` : `${l} (${countOf(k)})`])}
        />
      </div>

      {/* list */}
      {isLoading ? (
        <div className="grid gap-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-36 !bg-slate-100" />)}</div>
      ) : filtered.length === 0 ? (
        <Empty
          title={tab === 'all' ? 'No exams yet' : `No ${tab} exams`}
          hint="Create your first exam using the button above."
          action={<Link to="/examiner/exams/new" className="btn btn-acc">Create Exam</Link>}
        />
      ) : (
        <ul className="grid gap-4">
          {filtered.map((exam, i) => (
            <li
              key={exam.id}
              style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}
              className="rise bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={cx('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full', STATUS_BADGE[exam.status])}>
                      <span className={cx('w-1.5 h-1.5 rounded-full', STATUS_DOT[exam.status])} />
                      {exam.status.charAt(0).toUpperCase() + exam.status.slice(1)}
                    </span>
                    {exam.subject && <span className="text-xs text-slate-400 font-medium">{exam.subject}</span>}
                  </div>
                  <h3 className="text-lg font-semibold text-[#0f172a] leading-tight">{exam.title}</h3>
                  {exam.description && <p className="text-sm text-slate-500 mt-1 line-clamp-2">{exam.description}</p>}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Link to={`/examiner/exams/${exam.id}/edit`} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">Edit</Link>
                  {exam.status === 'draft' && (
                    <button onClick={() => setConfirmPub(exam)} className="btn h-9 px-3 text-sm bg-sky-600 text-white hover:bg-sky-700 transition-colors">Publish</button>
                  )}
                  <Link to={`/examiner/sandbox?exam=${exam.id}`} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">Preview</Link>
                  <button
                    onClick={() => setConfirmDel(exam)}
                    disabled={exam.status === 'ongoing'}
                    className="btn btn-ghost h-9 px-3 text-sm text-rose-500 border-slate-200 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                {[
                  ['Duration', `${exam.duration_min} min`],
                  ['Questions', exam.questions?.length ?? 0],
                  ['Enrolled', exam.enrolled?.length ?? 0],
                  ['Marks', exam.total_marks],
                ].map(([dt, dd]) => (
                  <div key={dt}>
                    <dt className="text-xs text-slate-400 uppercase tracking-wider font-medium">{dt}</dt>
                    <dd className="text-sm font-semibold text-[#0f172a] mt-0.5">{dd}</dd>
                  </div>
                ))}
              </dl>

              {(exam.publish_at || exam.end_at) && (
                <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-400">
                  {exam.publish_at && <span>Opens: <span className="text-slate-600 font-medium">{fmt(exam.publish_at)}</span></span>}
                  {exam.end_at && <span>Closes: <span className="text-slate-600 font-medium">{fmt(exam.end_at)}</span></span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* delete confirm */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Delete exam?">
        <p className="text-slate-500">
          <span className="text-[#0f172a] font-medium">{confirmDel?.title}</span> and all its data will be permanently removed. This cannot be undone.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
          <button className="btn btn-danger" disabled={delM.isPending} onClick={() => delM.mutate(confirmDel.id)}>
            {delM.isPending && <Spinner />} Delete
          </button>
        </div>
      </Modal>

      {/* publish confirm */}
      <Modal open={!!confirmPub} onClose={() => setConfirmPub(null)} title="Publish exam?">
        <p className="text-slate-500">
          <span className="text-[#0f172a] font-medium">{confirmPub?.title}</span> will become visible to enrolled students at the scheduled time.
          Make sure all questions and settings are final.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn btn-ghost" onClick={() => setConfirmPub(null)}>Cancel</button>
          <button className="btn h-10 px-5 bg-sky-600 text-white hover:bg-sky-700 transition-colors font-semibold" disabled={pubM.isPending} onClick={() => pubM.mutate(confirmPub.id)}>
            {pubM.isPending && <Spinner />} Publish
          </button>
        </div>
      </Modal>
    </>
  )
}
