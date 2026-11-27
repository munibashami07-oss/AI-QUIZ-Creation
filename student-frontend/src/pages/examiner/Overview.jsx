import { useQuery } from '@tanstack/react-query'
import { getOverview } from '../../api/examiner'
import { ago } from '../../utils/time'
import { Skeleton, cx } from '../../components/ui'

/* ── tiny bar-chart (pure CSS/SVG) ───────────────────────────────────────── */
function BarChart({ data }) {
  const max = Math.max(...data.map((d) => d.exams), 1)
  return (
    <div className="flex items-end gap-2 h-28" role="img" aria-label="Weekly exam chart">
      {data.map(({ day, exams }) => (
        <div key={day} className="flex flex-col items-center gap-1 flex-1">
          <span className="text-[10px] text-slate-500 font-medium">{exams || ''}</span>
          <div
            className="w-full rounded-t-md bg-[#1e3a5f] transition-all duration-500"
            style={{ height: `${(exams / max) * 80}px`, minHeight: exams ? '4px' : '0' }}
          />
          <span className="text-[10px] text-slate-400">{day}</span>
        </div>
      ))}
    </div>
  )
}

/* ── donut segment ────────────────────────────────────────────────────────── */
function DonutChart({ segments }) {
  // segments: [{label, value, color}]
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  let offset = 0
  const r = 36, circ = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-6">
      <svg width="90" height="90" viewBox="0 0 90 90" className="-rotate-90" aria-hidden="true">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#f1f5f9" strokeWidth="12" />
        {segments.map((seg) => {
          const frac = seg.value / total
          const dash = frac * circ
          const el = (
            <circle key={seg.label} cx="45" cy="45" r={r} fill="none" stroke={seg.color}
              strokeWidth="12" strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset * circ} className="transition-all duration-700" />
          )
          offset += frac
          return el
        })}
      </svg>
      <ul className="flex flex-col gap-1.5">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: seg.color }} />
            <span>{seg.label}</span>
            <span className="ml-auto font-semibold text-slate-800">{seg.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── stat card ────────────────────────────────────────────────────────────── */
const STAT_STYLES = [
  'border-l-4 border-[#1e3a5f]',
  'border-l-4 border-slate-300',
  'border-l-4 border-sky-400',
  'border-l-4 border-amber-400',
  'border-l-4 border-green-500',
  'border-l-4 border-purple-400',
  'border-l-4 border-rose-400',
]

function StatCard({ label, value, icon, colorClass, delay }) {
  return (
    <div style={{ animationDelay: `${delay}ms` }} className={cx('rise bg-white rounded-2xl p-5 shadow-sm border border-slate-100', colorClass)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-[#0f172a] mt-1 tracking-tight">{value ?? '—'}</p>
        </div>
        <span className="text-2xl select-none">{icon}</span>
      </div>
    </div>
  )
}

/* ── activity icon ────────────────────────────────────────────────────────── */
const ACT_ICON = { submission: '📋', exam: '📝', enrollment: '👥', grading: '✅', announcement: '📢' }
const ACT_COLOR = {
  submission: 'bg-blue-50 text-blue-600',
  exam: 'bg-amber-50 text-amber-600',
  enrollment: 'bg-purple-50 text-purple-600',
  grading: 'bg-green-50 text-green-600',
  announcement: 'bg-rose-50 text-rose-600',
}

export default function Overview() {
  const { data, isLoading } = useQuery({ queryKey: ['examiner', 'overview'], queryFn: getOverview })

  const stats = data?.stats
  const CARDS = [
    { label: 'Total Exams', value: stats?.totalExams, icon: '📚', colorClass: STAT_STYLES[0] },
    { label: 'Drafts', value: stats?.drafts, icon: '📄', colorClass: STAT_STYLES[1] },
    { label: 'Published', value: stats?.published, icon: '🌐', colorClass: STAT_STYLES[2] },
    { label: 'Ongoing', value: stats?.ongoing, icon: '⚡', colorClass: STAT_STYLES[3] },
    { label: 'Completed', value: stats?.completed, icon: '✅', colorClass: STAT_STYLES[4] },
    { label: 'Enrolled Students', value: stats?.enrolledStudents, icon: '👥', colorClass: STAT_STYLES[5] },
    { label: 'Pending Grading', value: stats?.pendingGrading, icon: '🔖', colorClass: STAT_STYLES[6] },
  ]

  const donutData = stats
    ? [
        { label: 'Drafts', value: stats.drafts, color: '#94a3b8' },
        { label: 'Published', value: stats.published, color: '#38bdf8' },
        { label: 'Ongoing', value: stats.ongoing, color: '#fbbf24' },
        { label: 'Completed', value: stats.completed, color: '#4ade80' },
      ]
    : []

  return (
    <div>
      {/* header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Overview</h1>
        <p className="text-slate-500 mt-1">Welcome back, Dr. Imran. Here's what's happening today.</p>
      </div>

      {/* stat cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-24 !bg-slate-100" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
          {CARDS.map((c, i) => <StatCard key={c.label} {...c} delay={i * 60} />)}
        </div>
      )}

      {/* charts row */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        {/* weekly bar chart */}
        <div className="rise bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h2 className="text-base font-semibold text-[#0f172a] mb-4">Exams This Week</h2>
          {isLoading ? <Skeleton className="h-28 !bg-slate-100" /> : <BarChart data={data?.weeklyExams ?? []} />}
        </div>

        {/* exam status donut */}
        <div className="rise bg-white rounded-2xl p-6 shadow-sm border border-slate-100" style={{ animationDelay: '80ms' }}>
          <h2 className="text-base font-semibold text-[#0f172a] mb-4">Exam Status Breakdown</h2>
          {isLoading ? <Skeleton className="h-28 !bg-slate-100" /> : <DonutChart segments={donutData} />}
        </div>
      </div>

      {/* recent activity */}
      <div className="rise bg-white rounded-2xl p-6 shadow-sm border border-slate-100" style={{ animationDelay: '120ms' }}>
        <h2 className="text-base font-semibold text-[#0f172a] mb-5">Recent Activity</h2>
        {isLoading ? (
          <div className="flex flex-col gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 !bg-slate-100" />)}</div>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {(data?.activity ?? []).map((act) => (
              <li key={act.id} className="flex items-start gap-4 py-3">
                <span className={cx('mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center text-base shrink-0', ACT_COLOR[act.type] ?? 'bg-slate-50 text-slate-500')}>
                  {ACT_ICON[act.type] ?? '•'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 font-medium leading-snug">{act.text}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{ago(act.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
