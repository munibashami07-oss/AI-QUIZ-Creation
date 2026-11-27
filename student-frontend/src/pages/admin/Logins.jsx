import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { currentLogins, loginHistory } from '../../api/admin'
import { errMsg } from '../../api/client'
import { ago, fmt, toDate } from '../../utils/time'
import { Avatar, Empty, ErrorState, PageHeader, Pills, RoleBadge, Skeleton, Spinner, cx } from '../../components/ui'

const TABS = [['current', 'Current logins'], ['history', 'All logins']]
const ROLE_OPTS = [['all', 'All'], ['candidate', 'Students'], ['examiner', 'Teachers']]

const statusOf = (s) =>
  s.logout_at ? ['Signed out', 'text-mut']
  : Date.now() - toDate(s.last_seen_at) < 5 * 60000 ? ['Online', 'text-ok']
  : ['Idle', 'text-acc']

const Status = ({ s }) => {
  const [label, color] = statusOf(s)
  return <span className={cx('inline-flex items-center gap-1.5 text-xs font-medium', color)}><span className="h-2 w-2 rounded-full bg-current" />{label}</span>
}

export default function Logins() {
  const [tab, setTab] = useState('current')
  const [roleF, setRoleF] = useState('all')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(15)

  const cur = useQuery({ queryKey: ['logins', 'current'], queryFn: currentLogins, refetchInterval: 15000, enabled: tab === 'current' })
  const his = useQuery({ queryKey: ['logins', 'history'], queryFn: loginHistory, enabled: tab === 'history' })
  const active = tab === 'current' ? cur : his

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (active.data ?? []).filter((r) =>
      (roleF === 'all' || r.role === roleF) &&
      (!s || [r.name, r.email, r.roll_number, r.ip_address].some((v) => v?.toLowerCase().includes(s))))
  }, [active.data, roleF, q])

  const shown = rows.slice(0, limit)
  const showRoll = roleF !== 'examiner'   // teacher view has no roll number column
  const showRole = roleF === 'all'
  const idx = TABS.findIndex(([k]) => k === tab)
  const onKey = (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') setTab((t) => (t === 'current' ? 'history' : 'current')) }
  const heads = ['User', showRole && 'Role', showRoll && 'Roll no', 'IP address', 'Device', 'Login time', 'Last seen', 'Status'].filter(Boolean)

  return (
    <>
      <PageHeader title="Login activity" sub="See who is signed in right now and review past sessions."
        action={tab === 'current' && (
          <div className="flex items-center gap-3 text-sm text-mut">
            <span className="flex items-center gap-2"><span className="live-dot" />Live · every 15 s</span>
            <button className="btn btn-ghost h-9 px-3 text-sm" onClick={() => cur.refetch()} disabled={cur.isFetching}>
              {cur.isFetching && <Spinner />}Refresh
            </button>
          </div>
        )} />

      {/* tabs with sliding indicator */}
      <div role="tablist" aria-label="Login views" onKeyDown={onKey} className="relative grid grid-cols-2 max-w-md border-b border-line mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls="panel" tabIndex={tab === k ? 0 : -1}
            onClick={() => { setTab(k); setLimit(15) }}
            className={cx('h-11 text-sm font-medium transition-colors duration-200', tab === k ? 'text-tx' : 'text-mut hover:text-tx')}>
            {l}{(k === 'current' ? cur : his).data && <span className="ml-2 text-xs text-mut">{(k === 'current' ? cur : his).data.length}</span>}
          </button>
        ))}
        <span aria-hidden="true" className="absolute bottom-[-1px] left-0 h-0.5 w-1/2 bg-acc transition-transform duration-300 ease-out" style={{ transform: `translateX(${idx * 100}%)` }} />
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <input type="search" aria-label="Search logins" placeholder="Search name, email, roll no or IP" value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(15) }} className="field lg:max-w-xs" />
        <Pills label="Filter by role" value={roleF} onChange={(r) => { setRoleF(r); setLimit(15) }} options={ROLE_OPTS} />
      </div>

      <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab} className="fade">
        {active.isLoading ? (
          <div className="grid gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : active.isError ? (
          <ErrorState message={errMsg(active.error)} onRetry={active.refetch} />
        ) : rows.length === 0 ? (
          <Empty title={tab === 'current' ? 'Nobody is online right now' : 'No sessions found'}
            hint={tab === 'current' ? 'Users appear here while they are active.' : 'Try a different search or filter.'} />
        ) : (
          <>
            {/* mobile cards */}
            <ul className="md:hidden grid gap-3">
              {shown.map((r, i) => (
                <li key={r.id} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }} className="rise bg-card border border-line rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <Avatar user={r} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{r.name}</p>
                      <p className="text-mut text-xs truncate">{r.email}</p>
                    </div>
                    <Status s={r} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 text-sm">
                    {[
                      ['Role', <RoleBadge key="r" role={r.role} />],
                      r.role === 'candidate' && ['Roll no', r.roll_number ?? '—'],
                      ['IP address', r.ip_address],
                      ['Device', `${r.device} · ${r.os}`],
                      ['Browser', r.browser],
                      ['Login', fmt(r.login_at)],
                      ['Last seen', ago(r.last_seen_at)],
                    ].filter(Boolean).map(([t, d]) => (
                      <div key={t}><dt className="text-xs text-mut">{t}</dt><dd className="mt-0.5">{d}</dd></div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>

            {/* desktop table */}
            <div className="hidden md:block bg-card border border-line rounded-2xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-mut">
                  <tr>{heads.map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <tr key={r.id} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} className="fade border-t border-line hover:bg-soft transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-52">
                          <Avatar user={r} size={36} />
                          <div className="min-w-0"><p className="font-medium truncate">{r.name}</p><p className="text-mut text-xs truncate">{r.email}</p></div>
                        </div>
                      </td>
                      {showRole && <td className="px-4 py-3"><RoleBadge role={r.role} /></td>}
                      {showRoll && <td className="px-4 py-3 text-mut">{r.role === 'candidate' ? r.roll_number ?? '—' : '—'}</td>}
                      <td className="px-4 py-3 text-mut whitespace-nowrap">{r.ip_address}</td>
                      <td className="px-4 py-3"><p className="whitespace-nowrap">{r.device} · {r.os}</p><p className="text-mut text-xs">{r.browser}</p></td>
                      <td className="px-4 py-3 text-mut whitespace-nowrap">{fmt(r.login_at)}</td>
                      <td className="px-4 py-3 text-mut whitespace-nowrap">{ago(r.last_seen_at)}</td>
                      <td className="px-4 py-3"><Status s={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length > limit && (
              <div className="text-center mt-5">
                <button className="btn btn-ghost" onClick={() => setLimit((l) => l + 15)}>Show more ({rows.length - limit} left)</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
