import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listExams, getLiveStatus, getLiveMessages, sendLiveMessage } from '../../api/examiner'
import { ago } from '../../utils/time'
import { Empty, Modal, Skeleton, Spinner, cx } from '../../components/ui'

// ── violation type labels ─────────────────────────────────────────────────────
const VIOLATION_LABEL = {
  fullscreen_exit: 'Left fullscreen',
  tab_hidden: 'Tab switch',
  window_blur: 'Window blur',
  grace_expired: 'Grace expired',
  copy_attempt: 'Copy blocked',
  paste_attempt: 'Paste blocked',
  devtools_open: 'DevTools detected',
}

// ── student status config ─────────────────────────────────────────────────────
const STATUS_CFG = {
  in_progress: { label: 'In Progress', dot: 'bg-green-500', badge: 'bg-green-50 text-green-700', border: 'border-slate-100' },
  submitted:   { label: 'Submitted',   dot: 'bg-sky-400',   badge: 'bg-sky-50 text-sky-700',     border: 'border-sky-100' },
  not_started: { label: 'Not Started', dot: 'bg-slate-300', badge: 'bg-slate-50 text-slate-500', border: 'border-slate-100' },
  reinstated:  { label: 'Reinstated',  dot: 'bg-purple-400', badge: 'bg-purple-50 text-purple-700', border: 'border-purple-100' },
}

// ── time format ───────────────────────────────────────────────────────────────
function fmtRemaining(sec) {
  if (sec == null || sec < 0) return '—'
  const m = Math.floor(sec / 60), s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── progress pill ─────────────────────────────────────────────────────────────
function ProgressBar({ value, answered, total }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{answered ?? '—'} / {total ?? '—'} answered</span>
        <span className="font-medium text-slate-600">{value}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-[#1e3a5f] to-sky-400 rounded-full transition-all duration-700"
          style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  )
}

// ── incident list ─────────────────────────────────────────────────────────────
function IncidentList({ incidents }) {
  if (!incidents?.length) return <p className="text-xs text-slate-400 italic">No incidents recorded.</p>
  return (
    <ul className="space-y-2">
      {incidents.map((inc) => (
        <li key={inc.id} className="text-xs flex items-start gap-2">
          <span className="mt-0.5 w-4 h-4 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0 font-bold">!</span>
          <div>
            <p className="font-semibold text-slate-700">{VIOLATION_LABEL[inc.type] ?? inc.type}</p>
            <p className="text-slate-400">{ago(inc.at)} · {inc.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ── student detail drawer ──────────────────────────────────────────────────────
function StudentDetail({ student, onClose }) {
  const cfg = student.violations >= 2 && student.status !== 'submitted'
    ? STATUS_CFG.in_progress
    : STATUS_CFG[student.status] ?? STATUS_CFG.not_started

  return (
    <div className="max-h-[75dvh] overflow-y-auto -mx-1 px-1">
      {/* header */}
      <div className="flex items-center gap-4 mb-5 p-4 bg-[#0f172a] rounded-2xl text-white">
        <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center font-bold text-xl shrink-0">
          {student.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-base">{student.name}</p>
          <p className="text-white/50 text-xs">{student.roll}</p>
        </div>
        <div className="text-right">
          <span className={cx('text-xs font-semibold px-2.5 py-1 rounded-full', cfg.badge)}>{cfg.label}</span>
        </div>
      </div>

      {/* progress */}
      <div className="mb-5">
        <ProgressBar value={student.progress} answered={student.answered} total={student.totalQuestions} />
      </div>

      {/* stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          ['Violations', student.violations, student.violations > 0 ? 'text-rose-500' : 'text-slate-700'],
          ['Remaining', student.status === 'submitted' ? '—' : fmtRemaining(student.remainingSec), 'text-slate-700'],
          ['Submission', student.reason ? { manual: 'Manual', timeout: 'Timeout', violation: 'Violation' }[student.reason] ?? student.reason : '—', 'text-slate-700'],
        ].map(([lbl, val, valCls]) => (
          <div key={lbl} className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-xs text-slate-400">{lbl}</p>
            <p className={cx('font-bold mt-0.5', valCls)}>{val}</p>
          </div>
        ))}
      </div>

      {/* incidents */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Incident History ({student.incidents?.length ?? 0})
        </p>
        <IncidentList incidents={student.incidents} />
      </div>
    </div>
  )
}

// ── student card ──────────────────────────────────────────────────────────────
function StudentCard({ s, i, onExpand }) {
  const isViolating = s.violations > 0 && s.status !== 'submitted'
  const cfg = STATUS_CFG[s.status] ?? STATUS_CFG.not_started

  return (
    <li style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
      className={cx('rise bg-white border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md cursor-pointer',
        isViolating ? 'border-rose-200 bg-rose-50/20' : cfg.border)}
      onClick={onExpand}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onExpand()}
      aria-label={`View details for ${s.name}`}
    >
      {/* header row */}
      <div className="flex items-start gap-3 mb-4">
        <div className={cx('h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 select-none',
          isViolating ? 'bg-rose-100 text-rose-600' : 'bg-[#1e3a5f]/10 text-[#1e3a5f]')}>
          {s.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0f172a] leading-tight">{s.name}</p>
          <p className="text-xs text-slate-400">{s.roll}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className={cx('w-2 h-2 rounded-full', cfg.dot, s.status === 'in_progress' && 'animate-pulse')} />
            <span className={cx('text-xs font-semibold px-2 py-0.5 rounded-full', cfg.badge)}>{cfg.label}</span>
          </div>
          {s.status === 'submitted' && s.reason && (
            <span className={cx('text-[10px] font-semibold px-2 py-0.5 rounded-full',
              s.reason === 'violation' ? 'bg-rose-50 text-rose-500' :
              s.reason === 'timeout' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600')}>
              {s.reason === 'violation' ? '⚠ Violation' : s.reason === 'timeout' ? '⏱ Timeout' : '✓ Manual'}
            </span>
          )}
        </div>
      </div>

      {/* progress */}
      <div className="mb-4">
        <ProgressBar value={s.progress} answered={s.answered} total={s.totalQuestions} />
      </div>

      {/* stats grid */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <div className="bg-slate-50 rounded-lg p-2 text-center">
          <p className="text-slate-400">Violations</p>
          <p className={cx('font-bold text-sm mt-0.5', s.violations > 0 ? 'text-rose-500' : 'text-slate-600')}>{s.violations}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 text-center">
          <p className="text-slate-400">Remaining</p>
          <p className={cx('font-bold text-sm mt-0.5', s.remainingSec != null && s.remainingSec < 300 ? 'text-amber-500' : 'text-slate-600')}>
            {s.status === 'submitted' ? '—' : fmtRemaining(s.remainingSec)}
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 text-center">
          <p className="text-slate-400">Started</p>
          <p className="font-semibold text-slate-600 mt-0.5 text-[10px]">{s.startedAt ? ago(s.startedAt) : '—'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-2 text-center">
          <p className="text-slate-400">Active</p>
          <p className="font-semibold text-slate-600 mt-0.5 text-[10px]">{s.lastActive ? ago(s.lastActive) : '—'}</p>
        </div>
      </div>

      {/* incident badge */}
      {s.incidents?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
          <span className="h-4 w-4 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center text-[10px] font-bold shrink-0">!</span>
          <p className="text-xs text-rose-600 font-medium">{s.incidents.length} incident{s.incidents.length !== 1 ? 's' : ''} — tap to view</p>
        </div>
      )}
    </li>
  )
}

// ── announcement panel ────────────────────────────────────────────────────────
function AnnouncementPanel({ examId }) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const { data: messages = [] } = useQuery({
    queryKey: ['examiner', 'live-messages', examId],
    queryFn: () => getLiveMessages(examId),
    enabled: !!examId,
    refetchInterval: 15_000,
  })

  const sendM = useMutation({
    mutationFn: (t) => sendLiveMessage(examId, t),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['examiner', 'live-messages', examId] }); setText('') },
  })

  const send = () => { const t = text.trim(); if (t) sendM.mutate(t) }

  const QUICK = [
    '5 minutes remaining — please review your answers.',
    'You have 1 minute left. Submit now.',
    'Please stay in fullscreen mode.',
    'All students: exam ends in 10 minutes.',
  ]

  return (
    <div className="bg-white border border-slate-100 rounded-2xl shadow-sm flex flex-col h-full">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <span className="text-base">📢</span>
        <h3 className="font-semibold text-[#0f172a] text-sm">Announcement Panel</h3>
        <span className="text-xs text-slate-400 ml-auto">Visible to all students</span>
      </div>

      {/* message feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">No announcements sent yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="bg-slate-50 rounded-xl px-4 py-2.5">
              <p className="text-sm text-[#0f172a] leading-snug">{m.text}</p>
              <p className="text-[10px] text-slate-400 mt-1">{ago(m.sentAt)}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* quick replies */}
      <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
        {QUICK.map((q) => (
          <button key={q} onClick={() => setText(q)}
            className="text-[10px] text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 rounded-full px-2.5 py-1 transition-colors font-medium leading-tight text-left">
            {q.length > 38 ? q.slice(0, 38) + '…' : q}
          </button>
        ))}
      </div>

      {/* compose */}
      <div className="p-4 pt-2 border-t border-slate-100 flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder="Type a message to all students…"
          rows={2}
          className="field flex-1 h-auto p-3 text-sm resize-none bg-slate-50"
          aria-label="Announcement message"
        />
        <button
          disabled={!text.trim() || sendM.isPending}
          onClick={send}
          className="btn h-auto px-3 bg-[#1e3a5f] text-white hover:bg-[#162d4a] text-sm font-semibold disabled:opacity-50 self-end"
          aria-label="Send announcement"
        >
          {sendM.isPending ? <Spinner /> : '→'}
        </button>
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function LiveMonitoring() {
  const { data: exams = [] } = useQuery({ queryKey: ['examiner', 'exams'], queryFn: listExams })
  const ongoingExams = exams.filter((e) => e.status === 'ongoing' || e.status === 'published')
  const [selectedExam, setSelectedExam] = useState(null)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [showPanel, setShowPanel] = useState(true)

  useEffect(() => {
    if (!selectedExam && ongoingExams.length > 0) setSelectedExam(ongoingExams[0].id)
  }, [ongoingExams.length])

  const { data: students = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['examiner', 'live', selectedExam],
    queryFn: () => getLiveStatus(selectedExam),
    enabled: !!selectedExam,
    refetchInterval: 10_000,
  })

  const exam = exams.find((e) => e.id === selectedExam)

  const filtered = students.filter((s) => {
    if (filter === 'active') return s.status === 'in_progress'
    if (filter === 'submitted') return s.status === 'submitted'
    if (filter === 'violations') return s.violations > 0
    if (filter === 'not_started') return s.status === 'not_started'
    return true
  })

  const stats = {
    inProgress: students.filter((s) => s.status === 'in_progress').length,
    submitted: students.filter((s) => s.status === 'submitted').length,
    notStarted: students.filter((s) => s.status === 'not_started').length,
    violations: students.filter((s) => s.violations > 0).length,
  }

  return (
    <div>
      {/* page header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="live-dot" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Live</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Live Monitoring</h1>
          <p className="text-slate-500 mt-1">Real-time view — auto-refreshes every 10 s.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPanel((v) => !v)} className={cx('btn h-9 px-3 text-xs font-semibold border transition-colors', showPanel ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'btn-ghost border-slate-200')}>
            📢 Panel
          </button>
          <button onClick={refetch} disabled={isFetching} className="btn btn-ghost h-9 px-3 text-sm border-slate-200 disabled:opacity-50">
            {isFetching ? <Spinner /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* exam selector */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm mb-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Monitor Exam</label>
        {ongoingExams.length === 0 ? (
          <p className="text-slate-400 text-sm py-1">No live exams right now.</p>
        ) : (
          <select value={selectedExam ?? ''} onChange={(e) => setSelectedExam(e.target.value)} className="field bg-slate-50">
            {ongoingExams.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.status}</option>)}
          </select>
        )}
      </div>

      {!selectedExam ? (
        <Empty title="No exam selected" hint="Select an ongoing exam above to begin monitoring." />
      ) : (
        <div className={cx('grid gap-6', showPanel ? 'lg:grid-cols-[1fr_320px]' : 'grid-cols-1')}>
          {/* left: student grid */}
          <div>
            {/* stat strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
              {[
                { label: 'In Progress', value: stats.inProgress, border: 'border-l-4 border-green-400', icon: '⚡' },
                { label: 'Submitted', value: stats.submitted, border: 'border-l-4 border-sky-400', icon: '✅' },
                { label: 'Not Started', value: stats.notStarted, border: 'border-l-4 border-slate-200', icon: '⏳' },
                { label: 'Violations', value: stats.violations, border: 'border-l-4 border-rose-400', icon: '⚠️' },
              ].map(({ label, value, border, icon }, i) => (
                <div key={label} style={{ animationDelay: `${i * 60}ms` }}
                  className={cx('rise bg-white rounded-2xl p-4 shadow-sm border border-slate-100', border)}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <span className="text-lg">{icon}</span>
                  </div>
                  <p className="text-3xl font-bold text-[#0f172a] mt-1">{value}</p>
                </div>
              ))}
            </div>

            {/* filter tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit mb-5">
              {[
                ['all', `All (${students.length})`],
                ['active', 'In Progress'],
                ['submitted', 'Submitted'],
                ['violations', 'Violations'],
                ['not_started', 'Not Started'],
              ].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)}
                  className={cx('px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200',
                    filter === k ? 'bg-white text-[#0f172a] shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                  {l}
                </button>
              ))}
            </div>

            {isLoading ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-52 !bg-slate-100" />)}
              </div>
            ) : filtered.length === 0 ? (
              <Empty title="No students in this filter" hint="Try a different filter." />
            ) : (
              <ul className="grid sm:grid-cols-2 gap-4">
                {filtered.map((s, i) => (
                  <StudentCard key={s.studentId} s={s} i={i} onExpand={() => setExpanded(s)} />
                ))}
              </ul>
            )}
          </div>

          {/* right: announcement panel */}
          {showPanel && (
            <div className="lg:sticky lg:top-6 h-fit">
              <AnnouncementPanel examId={selectedExam} />
            </div>
          )}
        </div>
      )}

      {/* student detail modal */}
      <Modal open={!!expanded} onClose={() => setExpanded(null)} title={expanded ? `${expanded.name} — Details` : ''} wide>
        {expanded && <StudentDetail student={expanded} onClose={() => setExpanded(null)} />}
      </Modal>
    </div>
  )
}
