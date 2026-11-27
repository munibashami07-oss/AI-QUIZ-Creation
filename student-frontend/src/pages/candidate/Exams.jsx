import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listExams, groupOf, REASONS } from '../../api/candidate'
import { errMsg } from '../../api/client'
import { fmt } from '../../utils/time'
import { hms, useNow } from '../../utils/clock'
import { Empty, ErrorState, PageHeader, Pills, Skeleton, cx } from '../../components/ui'

const TABS = [['available', 'Available'], ['upcoming', 'Upcoming'], ['completed', 'Completed']]

export function accessInfo(e, kind, now) {
  if (kind === 'completed') return e.attempt_status === 'submitted' ? ['Submitted', 'text-ok'] : ['Closed', 'text-mut']
  if (kind === 'upcoming') return [`Opens in ${hms(Date.parse(e.publish_at) - now)}`, 'text-acc']
  if (e.access?.allowed === false) return [REASONS[e.access.reason] || 'Access not granted', 'text-err']
  return e.attempt_status === 'in_progress' ? ['In progress. You can resume.', 'text-acc'] : ['Ready. You can start now.', 'text-ok']
}

function Card({ e, kind, now, i }) {
  const [open, setOpen] = useState(false)
  const [text, color] = accessInfo(e, kind, now)
  const blocked = kind === 'available' && e.access?.allowed === false
  return (
    <li style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }} className="rise bg-card border border-line rounded-2xl p-5 flex flex-col">
      <h3 className="text-lg font-semibold tracking-tight">{e.title}</h3>
      <p className={cx('text-sm font-medium mt-1', color)} role="status">{text}</p>
      <dl className="grid grid-cols-3 gap-3 mt-4 text-sm">
        {[['Duration', `${e.duration_min} min`], ['Marks', e.total_marks], [kind === 'upcoming' ? 'Opens' : 'Closes', fmt(kind === 'upcoming' ? e.publish_at : e.end_at)]].map(([t, d]) => (
          <div key={t}><dt className="text-xs text-mut">{t}</dt><dd className="mt-0.5 font-medium">{d}</dd></div>
        ))}
      </dl>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-sm text-acc font-medium text-left mt-4 w-fit hover:underline">
        {open ? 'Hide instructions' : 'Show instructions'}
      </button>
      <div className={cx('grid transition-all duration-300', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <p className="overflow-hidden text-sm text-mut bg-blush rounded-xl px-3 mt-0 data-[o=true]:py-3 data-[o=true]:mt-2" data-o={open}>{e.instructions || 'No instructions.'}</p>
      </div>
      {kind !== 'completed' && (
        <div className="mt-auto pt-5">
          {blocked ? <span className="btn btn-ghost w-full opacity-50 cursor-not-allowed">Not available</span>
            : <Link to={`/candidate/exams/${e.id}`} className={cx('btn w-full', kind === 'available' ? 'btn-acc' : 'btn-ghost')}>
                {e.attempt_status === 'in_progress' ? 'Resume exam' : kind === 'available' ? 'Open exam' : 'View details'}
              </Link>}
        </div>
      )}
    </li>
  )
}

export default function Exams() {
  const [tab, setTab] = useState('available')
  const now = useNow(1000)
  const { data = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['exams'], queryFn: listExams, refetchInterval: 20000 })
  const groups = useMemo(() => {
    const g = { available: [], upcoming: [], completed: [] }
    data.forEach((e) => g[groupOf(e, now)].push(e))
    return g
  }, [data, now])

  return (
    <>
      <PageHeader title="My exams" sub="Your assigned examinations and their access status." />
      <div className="mb-5"><Pills label="Exam groups" value={tab} onChange={setTab} options={TABS.map(([k, l]) => [k, `${l} (${groups[k].length})`])} /></div>
      {isLoading ? <div className="grid md:grid-cols-2 gap-4">{[0, 1].map((i) => <Skeleton key={i} className="h-56" />)}</div>
        : isError ? <ErrorState message={errMsg(error)} onRetry={refetch} />
        : groups[tab].length === 0 ? <Empty title={`No ${tab} exams`} hint="New exams appear here when your examiner assigns them." />
        : <ul key={tab} className="grid md:grid-cols-2 gap-4">{groups[tab].map((e, i) => <Card key={e.id} e={e} kind={tab} now={now} i={i} />)}</ul>}
    </>
  )
}
