import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getExam, groupOf, startAttempt } from '../../api/candidate'
import { errMsg } from '../../api/client'
import { fmt } from '../../utils/time'
import { hms, useNow } from '../../utils/clock'
import { enterFs, fsSupported } from '../../utils/fullscreen'
import { ErrorState, Skeleton, Spinner, useToast } from '../../components/ui'
import { accessInfo } from './Exams'

export default function Entry() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const now = useNow(1000)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data: e, isLoading, isError, error, refetch } = useQuery({ queryKey: ['exam', id], queryFn: () => getExam(id), refetchInterval: 15000 })

  if (isLoading) return <Skeleton className="h-96" />
  if (isError) return <ErrorState message={errMsg(error)} onRetry={refetch} />

  const kind = groupOf(e, now)
  const [status, color] = accessInfo(e, kind, now)
  const allowed = kind === 'available' && e.access?.allowed !== false
  const resume = e.attempt_status === 'in_progress'

  const start = async () => {
    setBusy(true)
    await enterFs() // must run inside the click so the browser allows fullscreen
    try { nav(`/candidate/attempt/${(await startAttempt(id)).id}`) }
    catch (x) { toast(errMsg(x), 'err'); setBusy(false) }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/candidate/exams" className="text-sm text-mut hover:text-tx">← My exams</Link>
      <h1 className="text-3xl font-bold tracking-tight mt-3">{e.title}</h1>
      <p className={`text-sm font-medium mt-1 ${color}`} role="status">{status}</p>

      {kind === 'upcoming' && (
        <div className="mt-6 rounded-3xl bg-blush text-center py-10 rise">
          <p className="text-sm text-mut">Exam opens in</p>
          <p className="text-6xl font-bold tabular-nums text-acc mt-2" role="timer">{hms(Date.parse(e.publish_at) - now)}</p>
          <p className="text-sm text-mut mt-3">{fmt(e.publish_at)} · the Start button unlocks automatically</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mt-6 text-center">
        {[['Duration', `${e.duration_min} min`], ['Total marks', e.total_marks], ['Violation limit', e.violation_limit]].map(([t, d]) => (
          <div key={t} className="border border-line rounded-2xl py-4"><p className="text-xs text-mut">{t}</p><p className="text-xl font-bold mt-1">{d}</p></div>
        ))}
      </div>

      <section className="mt-6 border border-line rounded-2xl p-5">
        <h2 className="font-semibold">Instructions</h2>
        <p className="text-mut mt-2 whitespace-pre-wrap">{e.instructions || 'No instructions provided.'}</p>
        <h2 className="font-semibold mt-5">Exam rules</h2>
        <ul className="list-disc pl-5 mt-2 space-y-1.5 text-mut text-sm">
          {fsSupported && <li>The exam runs in <strong className="text-tx">fullscreen</strong>. Leaving it, switching tabs or windows is recorded.</li>}
          <li>The first violation is a warning. Reaching <strong className="text-tx">{e.violation_limit}</strong> submits your exam automatically.</li>
          <li>Violations are flagged for your examiner to review. They are not treated as proof of misconduct.</li>
          <li>The timer runs on the server. Losing your connection never counts as a violation and never adds time.</li>
          <li>Answers save automatically. If you go offline they are kept on this device and sync when you reconnect.</li>
        </ul>
      </section>

      <label className="flex items-start gap-3 mt-6 text-sm cursor-pointer">
        <input type="checkbox" checked={ack} onChange={(x) => setAck(x.target.checked)} className="mt-0.5 h-4 w-4 accent-acc" />
        I have read the instructions and rules.
      </label>
      <button className="btn btn-acc w-full mt-4 h-12" disabled={!allowed || !ack || busy} onClick={start}>
        {busy && <Spinner />}{resume ? 'Resume exam' : 'Start exam'}
      </button>
      {!allowed && kind === 'available' && <p className="text-sm text-err mt-2">{status}</p>}
    </div>
  )
}
