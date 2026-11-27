import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listExams, listSubmissions, reinstateSubmission } from '../../api/examiner'
import { fmt } from '../../utils/time'
import { Empty, Modal, Skeleton, Spinner, cx } from '../../components/ui'

// ── config ────────────────────────────────────────────────────────────────────
const STATUS_BADGE = {
  graded:     'bg-green-100 text-green-700',
  pending:    'bg-amber-100 text-amber-700',
  reinstated: 'bg-purple-100 text-purple-700',
}
const REASON_CFG = {
  manual:    { label: 'Manual',    cls: 'bg-green-50 text-green-700',  icon: '✓' },
  timeout:   { label: 'Timeout',   cls: 'bg-amber-50 text-amber-700',  icon: '⏱' },
  violation: { label: 'Violation', cls: 'bg-rose-50 text-rose-700',    icon: '⚠' },
}
const TYPE_LABEL = { mcq: 'MCQ', multi: 'Multi-select', short: 'Short Answer' }
const VIO_LABEL = {
  fullscreen_exit: 'Left fullscreen',
  tab_hidden: 'Tab switch',
  window_blur: 'Window blur',
  grace_expired: 'Grace expired',
  copy_attempt: 'Copy blocked',
  paste_attempt: 'Paste blocked',
  devtools_open: 'DevTools detected',
}

// ── summary stat cards ────────────────────────────────────────────────────────
function SummaryCards({ submissions }) {
  const total = submissions.length
  const graded = submissions.filter((s) => s.status === 'graded').length
  const pending = submissions.filter((s) => s.status === 'pending').length
  const withViolations = submissions.filter((s) => s.violations > 0).length
  const avgScore = submissions.filter((s) => s.score != null).length
    ? Math.round(submissions.filter((s) => s.score != null).reduce((a, s) => a + (s.score / s.totalMarks) * 100, 0) / submissions.filter((s) => s.score != null).length)
    : null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
      {[
        { label: 'Total', value: total, border: 'border-l-4 border-[#1e3a5f]' },
        { label: 'Graded', value: graded, border: 'border-l-4 border-green-400' },
        { label: 'Pending', value: pending, border: 'border-l-4 border-amber-400' },
        { label: 'Violations', value: withViolations, border: 'border-l-4 border-rose-400' },
        { label: 'Avg Score', value: avgScore != null ? `${avgScore}%` : '—', border: 'border-l-4 border-sky-400' },
      ].map(({ label, value, border }, i) => (
        <div key={label} style={{ animationDelay: `${i * 55}ms` }}
          className={cx('rise bg-white rounded-2xl p-4 shadow-sm border border-slate-100', border)}>
          <p className="text-xs text-slate-400 font-medium">{label}</p>
          <p className="text-2xl font-bold text-[#0f172a] mt-1">{value}</p>
        </div>
      ))}
    </div>
  )
}

// ── incident list ─────────────────────────────────────────────────────────────
function IncidentHistory({ incidents }) {
  if (!incidents?.length) return <p className="text-sm text-slate-400 italic py-2">No incidents recorded for this submission.</p>
  return (
    <ul className="space-y-2.5">
      {incidents.map((inc, i) => (
        <li key={inc.id ?? i} className="flex items-start gap-3 p-3 bg-rose-50/60 border border-rose-100 rounded-xl text-sm">
          <span className="mt-0.5 w-5 h-5 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0 font-bold text-xs">!</span>
          <div>
            <p className="font-semibold text-slate-700">{VIO_LABEL[inc.type] ?? inc.type}</p>
            <p className="text-xs text-slate-500 mt-0.5">{fmt(inc.at)} · {inc.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── answer review panel ───────────────────────────────────────────────────────
function AnswerReview({ submission }) {
  return (
    <div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5 p-4 bg-slate-50 rounded-xl text-sm">
        {[
          ['Student', submission.studentName],
          ['Roll', submission.roll],
          ['Submitted', fmt(submission.submittedAt)],
          ['Violations', submission.violations],
          ['Status', submission.status],
          ['Score', submission.score != null
            ? `${submission.score} / ${submission.totalMarks} (${Math.round((submission.score / submission.totalMarks) * 100)}%)`
            : 'Not graded'],
        ].map(([dt, dd]) => (
          <div key={dt}>
            <dt className="text-xs text-slate-400 font-medium">{dt}</dt>
            <dd className="font-semibold text-[#0f172a] mt-0.5">{String(dd)}</dd>
          </div>
        ))}
      </dl>

      {/* submission reason */}
      {submission.reason && (() => {
        const cfg = REASON_CFG[submission.reason] ?? { label: submission.reason, cls: 'bg-slate-50 text-slate-600', icon: '•' }
        return (
          <div className={cx('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium mb-5', cfg.cls)}>
            <span>{cfg.icon}</span>
            <span>Submitted via <strong>{cfg.label}</strong></span>
          </div>
        )
      })()}

      {/* answers */}
      {submission.answers?.length > 0 ? (
        <>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Answer Review</p>
          <ol className="space-y-4">
            {submission.answers.map((a, i) => (
              <li key={a.qId ?? i} className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 flex items-center justify-between gap-3 border-b border-slate-100">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Q{i + 1} · {TYPE_LABEL[a.type] ?? a.type}</span>
                  <span className="text-xs text-slate-400">{a.marks} marks</span>
                </div>
                <div className="p-4">
                  <p className="text-sm font-medium text-[#0f172a] mb-3">{a.text}</p>
                  {a.type === 'mcq' && (
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className={cx('px-2.5 py-1 rounded-lg font-semibold',
                        a.answer === a.correct ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-600')}>
                        {a.answer === a.correct ? '✓ Correct' : '✗ Incorrect'}
                      </span>
                      <span className="text-slate-500 text-xs">
                        Selected: {typeof a.answer === 'number' ? String.fromCharCode(65 + a.answer) : '—'}
                        {a.answer !== a.correct && <> · Correct: <strong className="text-green-600">{String.fromCharCode(65 + (a.correct ?? 0))}</strong></>}
                      </span>
                    </div>
                  )}
                  {a.type === 'multi' && (
                    <div className="flex flex-wrap gap-1.5 text-sm">
                      {(a.answer ?? []).map((idx) => (
                        <span key={idx} className={cx('px-2 py-0.5 rounded font-semibold',
                          (a.correct ?? []).includes(idx) ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-600')}>
                          {String.fromCharCode(65 + idx)}
                        </span>
                      ))}
                    </div>
                  )}
                  {a.type === 'short' && (
                    <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 leading-relaxed">
                      {a.answer || <span className="italic text-slate-400">No answer provided</span>}
                    </p>
                  )}
                  {a.awarded != null && (
                    <p className="mt-2 text-xs text-slate-400">
                      Awarded: <strong className={a.awarded > 0 ? 'text-green-600' : 'text-rose-500'}>{a.awarded}</strong> / {a.marks}
                      {a.feedback && <> · <span className="italic">{a.feedback}</span></>}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="text-sm text-slate-400 italic text-center py-6">No detailed answers available.</p>
      )}

      {/* incident history */}
      {(submission.incidents?.length > 0 || submission.violations > 0) && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Incident History</p>
          <IncidentHistory incidents={submission.incidents} />
        </div>
      )}
    </div>
  )
}

// ── reinstate confirmation ────────────────────────────────────────────────────
function ReinstateModal({ submission, examId, open, onClose }) {
  const qc = useQueryClient()
  const reinstateM = useMutation({
    mutationFn: () => reinstateSubmission(submission.id, examId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'submissions', examId] }); onClose() },
  })

  return (
    <Modal open={open} onClose={onClose} title="Reinstate submission?">
      <div className="text-slate-500 text-sm space-y-3">
        <p>
          This will reinstate <strong className="text-[#0f172a]">{submission?.studentName}</strong>'s submission,
          allowing the examiner to re-grade it. The score and grading status will be reset.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700 text-xs">
          ⚠️ Reinstatement does not allow the student to re-attempt the exam — it only resets the grading for examiner review.
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-5">
        <button className="btn btn-ghost border-slate-200" onClick={onClose}>Cancel</button>
        <button disabled={reinstateM.isPending} onClick={() => reinstateM.mutate()}
          className="btn h-10 px-5 bg-purple-600 text-white hover:bg-purple-700 font-semibold text-sm">
          {reinstateM.isPending && <Spinner />} Reinstate
        </button>
      </div>
    </Modal>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function Submissions() {
  const { data: exams = [], isLoading: loadingExams } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const gradableExams = exams.filter((e) => e.status === 'completed' || e.status === 'ongoing')

  const [selectedExam, setSelectedExam] = useState(null)
  const [search, setSearch] = useState('')
  const [statusF, setStatusF] = useState('all')
  const [reasonF, setReasonF] = useState('all')
  const [detail, setDetail] = useState(null)
  const [reinstate, setReinstate] = useState(null)

  const { data: submissions = [], isLoading: loadingSubs } = useQuery({
    queryKey: ['examiner', 'submissions', selectedExam],
    queryFn: () => listSubmissions(selectedExam),
    enabled: !!selectedExam,
  })

  const filtered = submissions.filter((s) =>
    (statusF === 'all' || s.status === statusF) &&
    (reasonF === 'all' || s.reason === reasonF) &&
    (!search || s.studentName.toLowerCase().includes(search.toLowerCase()) || s.roll?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      {/* header */}
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Submissions</h1>
        <p className="text-slate-500 mt-1">Review every student submission with detailed answer and incident breakdowns.</p>
      </div>

      {/* exam picker */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Select Exam</label>
        {loadingExams ? <Skeleton className="h-11 !bg-slate-100" /> : (
          <select value={selectedExam ?? ''} onChange={(e) => setSelectedExam(e.target.value || null)} className="field bg-slate-50">
            <option value="">— Choose an exam —</option>
            {gradableExams.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.status})</option>)}
          </select>
        )}
      </div>

      {!selectedExam ? (
        <Empty title="No exam selected" hint="Select a completed or ongoing exam to view its submissions." />
      ) : (
        <>
          {!loadingSubs && <SummaryCards submissions={submissions} />}

          {/* filters */}
          <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm mb-5 flex flex-wrap gap-3">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or roll…" className="field bg-slate-50 w-full sm:max-w-xs text-sm"
              aria-label="Search submissions" />

            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {[['all', 'All'], ['graded', 'Graded'], ['pending', 'Pending']].map(([k, l]) => (
                <button key={k} onClick={() => setStatusF(k)}
                  className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    statusF === k ? 'bg-white text-[#0f172a] shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {l}
                </button>
              ))}
            </div>

            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {[['all', 'All Reasons'], ['manual', '✓ Manual'], ['timeout', '⏱ Timeout'], ['violation', '⚠ Violation']].map(([k, l]) => (
                <button key={k} onClick={() => setReasonF(k)}
                  className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    reasonF === k ? 'bg-white text-[#0f172a] shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {loadingSubs ? (
            <div className="grid gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 !bg-slate-100" />)}</div>
          ) : filtered.length === 0 ? (
            <Empty title="No submissions found" hint="No submissions match the current filters." />
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
              {/* desktop table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/60">
                      {['Student', 'Roll', 'Submitted', 'Reason', 'Violations', 'Score', 'Status', 'Actions'].map((h) => (
                        <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s, i) => {
                      const reasonCfg = REASON_CFG[s.reason] ?? null
                      return (
                        <tr key={s.id} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                          className="fade border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium text-[#0f172a]">{s.studentName}</p>
                            {s.violations > 0 && (
                              <p className="text-xs text-rose-500 font-medium">{s.violations} violation{s.violations !== 1 ? 's' : ''}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{s.roll}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(s.submittedAt)}</td>
                          <td className="px-4 py-3">
                            {reasonCfg ? (
                              <span className={cx('text-xs font-semibold px-2.5 py-1 rounded-full', reasonCfg.cls)}>
                                {reasonCfg.icon} {reasonCfg.label}
                              </span>
                            ) : <span className="text-slate-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-3 font-semibold text-center">
                            <span className={cx(s.violations > 0 ? 'text-rose-500' : 'text-slate-400')}>{s.violations}</span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-[#0f172a] whitespace-nowrap">
                            {s.score != null ? `${s.score} / ${s.totalMarks}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cx('text-xs font-semibold px-2.5 py-1 rounded-full', STATUS_BADGE[s.status] ?? 'bg-slate-100 text-slate-500')}>
                              {s.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <button onClick={() => setDetail(s)} className="btn btn-ghost h-8 px-3 text-xs border-slate-200">Review</button>
                              {s.status === 'graded' && (
                                <button onClick={() => setReinstate(s)}
                                  className="btn btn-ghost h-8 px-3 text-xs border-purple-200 text-purple-600 hover:bg-purple-50">
                                  Reinstate
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* mobile cards */}
              <ul className="lg:hidden divide-y divide-slate-100">
                {filtered.map((s) => {
                  const reasonCfg = REASON_CFG[s.reason] ?? null
                  return (
                    <li key={s.id} className="p-4 space-y-3">
                      <div className="flex items-start gap-2 justify-between">
                        <div>
                          <p className="font-semibold text-sm text-[#0f172a]">{s.studentName}</p>
                          <p className="text-xs text-slate-400">{s.roll} · {fmt(s.submittedAt)}</p>
                        </div>
                        <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full shrink-0', STATUS_BADGE[s.status] ?? 'bg-slate-100 text-slate-500')}>
                          {s.status}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {reasonCfg && (
                          <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', reasonCfg.cls)}>
                            {reasonCfg.icon} {reasonCfg.label}
                          </span>
                        )}
                        {s.violations > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-600">
                            ⚠ {s.violations} violations
                          </span>
                        )}
                        <span className="text-sm font-bold text-[#0f172a] ml-auto">
                          {s.score != null ? `${s.score}/${s.totalMarks}` : '—'}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setDetail(s)} className="btn btn-ghost h-8 px-3 text-xs border-slate-200 flex-1">Review</button>
                        {s.status === 'graded' && (
                          <button onClick={() => setReinstate(s)} className="btn btn-ghost h-8 px-3 text-xs border-purple-200 text-purple-600">Reinstate</button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {/* review detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Review — ${detail.studentName}` : ''} wide>
        {detail && (
          <div className="max-h-[72dvh] overflow-y-auto -mx-1 px-1">
            <AnswerReview submission={detail} />
          </div>
        )}
      </Modal>

      {/* reinstate modal */}
      <ReinstateModal
        submission={reinstate}
        examId={selectedExam}
        open={!!reinstate}
        onClose={() => setReinstate(null)}
      />
    </div>
  )
}
