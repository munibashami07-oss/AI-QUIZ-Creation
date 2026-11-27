import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Avatar, cx, roleLabel } from '../components/ui'
import useHeartbeat from '../hooks/useHeartbeat'

const NAV = {
  admin: [['Users', '/admin/users'], ['Logins', '/admin/logins']],
  examiner: [['Dashboard', '/examiner/dashboard'], ['Exams', '/examiner/exams'],
             ['Question Bank', '/examiner/question-bank'], ['Imports', '/examiner/imports']],
  candidate: [['My Exams', '/candidate/exams'], ['Results', '/candidate/results']],
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  useHeartbeat()
  useEffect(() => {
    if (user.role !== 'candidate') return
    document.documentElement.classList.add('theme-student')
    return () => document.documentElement.classList.remove('theme-student')
  }, [user.role])

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [])

  return (
    <div className="min-h-dvh md:flex">
      {/* mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-bg/90 backdrop-blur border-b border-line">
        <span className="font-bold tracking-tight">ExamSecure</span>
        <button aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}
          className="h-10 w-10 grid place-items-center rounded-lg hover:bg-soft transition-colors">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </header>

      {/* drawer overlay */}
      <div onClick={() => setOpen(false)} aria-hidden="true"
        className={cx('md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0 pointer-events-none')} />

      <aside className={cx(
        'fixed md:sticky top-0 left-0 z-50 md:z-auto h-dvh w-64 shrink-0 flex flex-col p-4 bg-card border-r border-line',
        'transition-[transform,visibility] duration-300 ease-out',
        open ? 'translate-x-0 visible' : '-translate-x-full invisible md:visible md:translate-x-0')}>
        <div className="font-bold text-lg tracking-tight px-3 pt-2 pb-6">ExamSecure</div>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV[user.role].map(([label, to]) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => cx('rounded-xl px-3 py-2.5 text-sm transition-colors duration-200',
                isActive ? 'bg-acc text-bg font-semibold' : 'text-mut hover:text-tx hover:bg-soft')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-4 border-t border-line flex items-center gap-3">
          <Avatar user={user} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user.name}</p>
            <p className="text-xs text-mut">{roleLabel(user.role)}</p>
          </div>
          <button onClick={logout} className="text-xs text-mut underline hover:text-tx">Sign out</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 sm:p-8">
        <div key={pathname} className="rise mx-auto max-w-6xl"><Outlet /></div>
      </main>
    </div>
  )
}
