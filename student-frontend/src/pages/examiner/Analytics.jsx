import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listExams, getAnalytics, publishResults, exportResultsCSV, exportResultsPDF } from '../../api/examiner'
import { fmt } from '../../utils/time'
import { Empty, Modal, Skeleton, Spinner, Switch, cx } from '../../components/ui'

// ── helpers ───────────────────────────────────────────────────────────────────
const pct = (score, total) => total ? Math.round((score / total) * 100) : 0

// ── bar chart ─────────────────────────────────────────────────────────────────
function DistributionChart({ data }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="flex items-end gap-3 h-32" role="img" aria-label="Score distribution">
      {data.map(({ label, count }) => (
        <div key={label} className="flex flex-col items-center gap-1 flex-1">
          {count > 0 && <span className="text-xs font-semibold text-slate-500">{count}</span>}
          <div className="w-full rounded-t-md bg-gradient-to-b from-[#1e3a5f] to-sky-400 transition-all duration-700"
            style={{ height: `${(count / max) * 90}px`, minHeight: count ? '4px' : '0' }} />
          <span className="text-[10px] text-slate-400 text-center leading-tight">{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── violation breakdown ───────────────────────────────────────────────────────
function ViolationBreakdown({ data }) {
  const total = (data?.none ?? 0) + (data?.one ?? 0) + (data?.two_plus ?? 0)
  if (!total) return <p className="text-slate-400 text-sm">No data</p>
  return (
    <div className="flex flex-col gap-2.5">
      {[
        { label: 'No violations', value: data.none ?? 0, color: '#4ade80' },
        { label: '1 violation',   value: data.one ?? 0,  color: '#fbbf24' },
        { label: '2+ violations', value: data.two_plus ?? 0, color: '#f87171' },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
          <span className="text-sm text-slate-600 flex-1">{s.label}</span>
          <span className="font-semibold text-[#0f172a] text-sm">{s.value}</span>
          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ background: s.color, width: `${(s.value / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── submission reasons ────────────────────────────────────────────────────────
function SubmissionReasons({ data }) {
  const total = Object.values(data ?? {}).reduce((a, v) => a + v, 0) || 1
  const cfg = {
    manual:    { color: '#4ade80', label: 'Manual' },
    timeout:   { color: '#fbbf24', label: 'Timeout' },
    violation: { color: '#f87171', label: 'Violation' },
  }
  return (
    <div className="flex flex-col gap-2.5">
      {Object.entries(data ?? {}).map(([k, v]) => (
        <div key={k} className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: cfg[k]?.color ?? '#94a3b8' }} />
          <span className="text-sm text-slate-600 flex-1">{cfg[k]?.label ?? k}</span>
          <span className="font-semibold text-[#0f172a] text-sm">{v}</span>
          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ background: cfg[k]?.color ?? '#94a3b8', width: `${(v / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── per-question stats ────────────────────────────────────────────────────────
function QuestionStats({ data }) {
  return (
    <div className="space-y-4">
      {data.map((q, i) => {
        const p = Math.round((q.avgScore / q.maxMarks) * 100)
        return (
          <div key={q.qId} className="p-4 border border-slate-100 rounded-2xl hover:border-slate-200 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="text-sm text-[#0f172a] font-medium leading-snug flex-1">Q{i + 1}. {q.text}</p>
              <div className="flex gap-1.5 shrink-0">
                <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full',
                  q.difficulty === 'easy' ? 'bg-green-50 text-green-700' : q.difficulty === 'hard' ? 'bg-rose-50 text-rose-700' : 'bg-yellow-50 text-yellow-700')}>
                  {q.difficulty}
                </span>
                {q.skipped > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    {q.skipped} skipped
                  </span>
                )}
              </div>
            </div>

            {/* score bar */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${p}%`, background: p >= 70 ? '#4ade80' : p >= 40 ? '#fbbf24' : '#f87171' }} />
              </div>
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                avg {q.avgScore.toFixed(1)} / {q.maxMarks} ({p}%)
              </span>
            </div>

            {/* common wrong answers */}
            {q.wrongAnswers?.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Common mistakes</p>
                <ul className="space-y-1">
                  {q.wrongAnswers.map((w, j) => (
                    <li key={j} className="flex items-center gap-3 text-xs text-slate-600 bg-rose-50/50 rounded-lg px-3 py-1.5">
                      <span className="text-rose-400 font-bold shrink-0">✗</span>
                      <span className="flex-1">{w.optionLabel}</span>
                      <span className="font-semibold text-rose-600 shrink-0">{w.count} students ({w.pct}%)</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── individual student results table ─────────────────────────────────────────
function StudentResults({ results, totalMarks, passMarks }) {
  const [sort, setSort] = useState('rank')
  const [search, setSearch] = useState('')

  const sorted = [...results]
    .filter((r) => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.roll.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sort === 'rank') return (a.rank ?? 999) - (b.rank ?? 999)
      if (sort === 'score_desc') return (b.score ?? -1) - (a.score ?? -1)
      if (sort === 'score_asc') return (a.score ?? -1) - (b.score ?? -1)
      return 0
    })

  const passed = results.filter((r) => r.score != null && r.score >= passMarks).length

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student…" className="field bg-white sm:max-w-xs text-sm" aria-label="Search student results" />
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="field bg-white w-auto text-sm" aria-label="Sort by">
          <option value="rank">Sort: Rank</option>
          <option value="score_desc">Sort: Score (high → low)</option>
          <option value="score_asc">Sort: Score (low → high)</option>
        </select>
        <span className="text-xs text-slate-400 ml-auto">{passed} of {results.length} passed (≥{passMarks} marks)</span>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        {/* desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/60">
                {['Rank', 'Student', 'Roll', 'Score', 'Percentage', 'Violations', 'Status', 'Submitted'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => {
                const p = s.score != null ? pct(s.score, totalMarks) : null
                const passed = s.score != null && s.score >= passMarks
                return (
                  <tr key={s.studentId} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    className="fade border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3">
                      {s.rank ? (
                        <span className={cx('font-bold text-sm', s.rank === 1 ? 'text-amber-500' : s.rank === 2 ? 'text-slate-400' : s.rank === 3 ? 'text-amber-700' : 'text-slate-400')}>
                          {s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : `#${s.rank}`}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#0f172a]">{s.name}</td>
                    <td className="px-4 py-3 text-slate-400">{s.roll}</td>
                    <td className="px-4 py-3 font-bold text-[#0f172a]">
                      {s.score != null ? `${s.score} / ${totalMarks}` : <span className="text-slate-300 font-normal">Pending</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${p}%`, background: p >= 70 ? '#4ade80' : p >= 40 ? '#fbbf24' : '#f87171' }} />
                          </div>
                          <span className={cx('text-xs font-semibold', p >= 70 ? 'text-green-600' : p >= 40 ? 'text-amber-600' : 'text-rose-500')}>{p}%</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cx('font-semibold', s.violations > 0 ? 'text-rose-500' : 'text-slate-400')}>{s.violations}</span>
                    </td>
                    <td className="px-4 py-3">
                      {s.score != null ? (
                        <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', passed ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-600')}>
                          {passed ? 'Pass' : 'Fail'}
                        </span>
                      ) : <span className="text-xs text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">Pending</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{fmt(s.submittedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* mobile cards */}
        <ul className="sm:hidden divide-y divide-slate-100">
          {sorted.map((s) => {
            const p = s.score != null ? pct(s.score, totalMarks) : null
            const passed = s.score != null && s.score >= passMarks
            return (
              <li key={s.studentId} className="p-4 flex items-center gap-3">
                <span className="text-sm font-bold text-slate-400 w-6 shrink-0">{s.rank ? `#${s.rank}` : '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[#0f172a] text-sm">{s.name}</p>
                  <p className="text-xs text-slate-400">{s.roll}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[#0f172a] text-sm">{s.score != null ? `${s.score}/${totalMarks}` : '—'}</p>
                  {p != null && (
                    <span className={cx('text-xs font-semibold', passed ? 'text-green-600' : 'text-rose-500')}>{p}%</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const qc = useQueryClient()
  const { data: exams = [] } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const completedExams = exams.filter((e) => e.status === 'completed')
  const [selectedExam, setSelectedExam] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [publishConfirm, setPublishConfirm] = useState(false)
  const [exporting, setExporting] = useState(false)

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['examiner', 'analytics', selectedExam],
    queryFn: () => getAnalytics(selectedExam),
    enabled: !!selectedExam,
  })

  const publishM = useMutation({
    mutationFn: (pub) => publishResults(selectedExam, pub),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'analytics', selectedExam] }); setPublishConfirm(false) },
  })

  const handleCSV = async () => { setExporting(true); try { await exportResultsCSV(selectedExam) } finally { setExporting(false) } }
  const handlePDF = async () => { setExporting(true); try { await exportResultsPDF(selectedExam) } finally { setExporting(false) } }

  const TABS = ['overview', 'students', 'questions']

  return (
    <div>
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Results & Analytics</h1>
          <p className="text-slate-500 mt-1">Detailed performance analysis and result management.</p>
        </div>
        {analytics && (
          <div className="flex flex-wrap gap-2">
            <button onClick={handleCSV} disabled={exporting} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">
              {exporting ? <Spinner /> : '⬇'} Export CSV
            </button>
            <button onClick={handlePDF} disabled={exporting} className="btn btn-ghost h-9 px-3 text-sm border-slate-200">
              {exporting ? <Spinner /> : '📄'} Export PDF
            </button>
            <button onClick={() => setPublishConfirm(true)}
              className={cx('btn h-9 px-4 text-sm font-semibold',
                analytics.published ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'bg-green-600 text-white hover:bg-green-700')}>
              {analytics.published ? '🔒 Unpublish Results' : '🌐 Publish Results'}
            </button>
          </div>
        )}
      </div>

      {/* exam picker */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Select Exam</label>
        <select value={selectedExam ?? ''} onChange={(e) => { setSelectedExam(e.target.value || null); setActiveTab('overview') }} className="field bg-slate-50">
          <option value="">— Choose a completed exam —</option>
          {completedExams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      {!selectedExam ? (
        <Empty title="No exam selected" hint="Select a completed exam to view its analytics and results." />
      ) : isLoading ? (
        <div className="grid gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 !bg-slate-100" />)}</div>
      ) : !analytics ? (
        <Empty title="No analytics available" hint="Analytics are generated once an exam is completed and graded." />
      ) : (
        <div className="space-y-6">
          {/* publish status banner */}
          <div className={cx('flex items-center gap-3 px-5 py-3 rounded-2xl border text-sm font-medium',
            analytics.published ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800')}>
            <span className="text-lg">{analytics.published ? '🌐' : '🔒'}</span>
            <span>
              Results are currently <strong>{analytics.published ? 'published' : 'unpublished'}</strong>.
              {analytics.published ? ' Students can see their scores.' : ' Students cannot see their scores yet.'}
            </span>
          </div>

          {/* tabs */}
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
            {[['overview', 'Overview'], ['students', 'Student Results'], ['questions', 'Question Analysis']].map(([k, l]) => (
              <button key={k} onClick={() => setActiveTab(k)}
                className={cx('px-5 py-2 rounded-lg text-sm font-semibold transition-all',
                  activeTab === k ? 'bg-white text-[#0f172a] shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                {l}
              </button>
            ))}
          </div>

          {/* overview tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Enrolled', value: analytics.totalEnrolled, border: 'border-l-4 border-[#1e3a5f]' },
                  { label: 'Submissions', value: analytics.submitted, border: 'border-l-4 border-sky-400' },
                  { label: 'Pass Rate', value: `${analytics.passRate}%`, border: 'border-l-4 border-green-400' },
                  { label: 'Avg Score', value: analytics.avgScore?.toFixed(1), border: 'border-l-4 border-amber-400' },
                ].map(({ label, value, border }, i) => (
                  <div key={label} style={{ animationDelay: `${i * 60}ms` }}
                    className={cx('rise bg-white border border-slate-100 rounded-2xl p-5 shadow-sm', border)}>
                    <p className="text-xs text-slate-500 font-medium">{label}</p>
                    <p className="text-3xl font-bold text-[#0f172a] mt-1 tracking-tight">{value}</p>
                  </div>
                ))}
              </div>

              {/* score range */}
              <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <h2 className="text-base font-semibold text-[#0f172a] mb-4">Score Range</h2>
                <div className="flex items-center gap-6">
                  <div className="flex gap-6 text-sm shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Lowest</p>
                      <p className="font-bold text-rose-500 text-xl">{analytics.lowScore}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Average</p>
                      <p className="font-bold text-sky-600 text-xl">{analytics.avgScore?.toFixed(1)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">Highest</p>
                      <p className="font-bold text-green-600 text-xl">{analytics.highScore}</p>
                    </div>
                  </div>
                  <div className="flex-1 relative h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#1e3a5f] to-sky-400"
                      style={{
                        left: `${(analytics.lowScore / (analytics.highScore || 1)) * 100 * 0.5}%`,
                        right: '5%',
                      }} />
                  </div>
                </div>
              </div>

              {/* charts row */}
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-[#0f172a] mb-4">Score Distribution</h2>
                  <DistributionChart data={analytics.scoreDistribution} />
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-[#0f172a] mb-4">Violation Breakdown</h2>
                  <ViolationBreakdown data={analytics.violationBreakdown} />
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-[#0f172a] mb-4">Submission Reasons</h2>
                  <SubmissionReasons data={analytics.submissionReasons} />
                </div>
              </div>
            </div>
          )}

          {/* student results tab */}
          {activeTab === 'students' && (
            <StudentResults
              results={analytics.studentResults ?? []}
              totalMarks={analytics.studentResults?.[0]?.totalMarks ?? 100}
              passMarks={analytics.passMarks ?? 0}
            />
          )}

          {/* question analysis tab */}
          {activeTab === 'questions' && (
            <div>
              <p className="text-sm text-slate-500 mb-4">
                Average performance per question, common wrong answers, and skipped questions.
              </p>
              <QuestionStats data={analytics.questionStats ?? []} />
            </div>
          )}
        </div>
      )}

      {/* publish confirm */}
      <Modal open={publishConfirm} onClose={() => setPublishConfirm(false)} title={analytics?.published ? 'Unpublish results?' : 'Publish results?'}>
        <p className="text-slate-500 text-sm">
          {analytics?.published
            ? 'Students will no longer be able to see their scores until you publish again.'
            : 'Students will be able to see their scores, rank and feedback for this exam.'}
        </p>
        <div className="flex justify-end gap-3 mt-5">
          <button className="btn btn-ghost border-slate-200" onClick={() => setPublishConfirm(false)}>Cancel</button>
          <button disabled={publishM.isPending} onClick={() => publishM.mutate(!analytics?.published)}
            className={cx('btn h-10 px-5 text-white font-semibold text-sm', analytics?.published ? 'bg-slate-700 hover:bg-slate-800' : 'bg-green-600 hover:bg-green-700')}>
            {publishM.isPending && <Spinner />}
            {analytics?.published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
