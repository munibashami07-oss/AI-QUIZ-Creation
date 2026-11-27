import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cx } from '../components/ui'
import { useAuth } from '../auth/AuthContext'
import useHeartbeat from '../hooks/useHeartbeat'

/* ── icons (inline SVG, no external dep) ─────────────────────────────────── */
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
  </svg>
)

const ICONS = {
  overview: ['M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6'],
  exams: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  create: 'M12 4v16m8-8H4',
  bank: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zm7 5v8m-4-4h8',
  enrollment: ['M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0'],
  live: 'M15 10l4.553-2.069A1 1 0 0121 8.879V15.12a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
  submissions: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  grading: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  analytics: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  import: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12',
  sandbox: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
  announce: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  collapse: 'M11 19l-7-7 7-7m8 14l-7-7 7-7',
  expand: 'M13 5l7 7-7 7M5 5l7 7-7 7',
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
}

const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', path: '/examiner/overview', icon: 'overview' },
  { key: 'exams', label: 'My Exams', path: '/examiner/exams', icon: 'exams' },
  { key: 'create', label: 'Create Exam', path: '/examiner/exams/new', icon: 'create' },
  { key: 'bank', label: 'Question Bank', path: '/examiner/question-bank', icon: 'bank' },
  { key: 'enrollment', label: 'Enrollment & Attendance', path: '/examiner/enrollment', icon: 'enrollment' },
  { key: 'live', label: 'Live Monitoring', path: '/examiner/live', icon: 'live' },
  { key: 'submissions', label: 'Submissions', path: '/examiner/submissions', icon: 'submissions' },
  { key: 'grading', label: 'Grading', path: '/examiner/grading', icon: 'grading' },
  { key: 'analytics', label: 'Results & Analytics', path: '/examiner/analytics', icon: 'analytics' },
  { key: 'import', label: 'Bulk Import', path: '/examiner/bulk-import', icon: 'import' },
  { key: 'sandbox', label: 'Sandbox Preview', path: '/examiner/sandbox', icon: 'sandbox' },
  { key: 'announce', label: 'Announcements', path: '/examiner/announcements', icon: 'announce' },
  { key: 'profile', label: 'Profile & Settings', path: '/examiner/profile', icon: 'profile' },
]

/* ── sidebar nav link ─────────────────────────────────────────────────────── */
function SideNavLink({ item, collapsed }) {
  return (
    <NavLink
      to={item.path}
      end={item.path === '/examiner/overview'}
      className={({ isActive }) =>
        cx('group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
          'focus-visible:outline-2 focus-visible:outline-offset-2',
          isActive
            ? 'bg-nav-acc text-white font-semibold shadow-sm'
            : 'text-nav-mut hover:text-white hover:bg-white/10')
      }
      title={collapsed ? item.label : undefined}
    >
      <span className="shrink-0"><Icon d={ICONS[item.icon]} /></span>
      <span className={cx('whitespace-nowrap overflow-hidden transition-all duration-300', collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100')}>{item.label}</span>
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-3 z-50 hidden group-hover:block whitespace-nowrap bg-[#0f172a] text-white text-xs font-medium px-2.5 py-1.5 rounded-lg shadow-xl border border-white/10">
          {item.label}
        </span>
      )}
    </NavLink>
  )
}

/* ── main layout ──────────────────────────────────────────────────────────── */
export default function ExaminerLayout() {
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  useHeartbeat()

  // close mobile drawer on navigation
  useEffect(() => setMobileOpen(false), [pathname])

  // close mobile drawer on Escape
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && setMobileOpen(false)
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [])

  // restore collapse preference
  useEffect(() => {
    const stored = localStorage.getItem('examiner-sidebar-collapsed')
    if (stored !== null) setCollapsed(stored === 'true')
  }, [])

  const toggleCollapse = () => {
    setCollapsed((v) => { localStorage.setItem('examiner-sidebar-collapsed', !v); return !v })
  }

  /* user block — from auth context */
  const { user: authUser, logout } = useAuth()
  const navigate = useNavigate()
  const initials = authUser?.name?.trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase() || 'EX'
  const displayName = authUser?.name || 'Examiner'
  const user = { name: displayName, role: 'Examiner', initials }

  const sidebar = (
    <aside
      className={cx(
        'flex flex-col h-dvh overflow-y-auto',
        'bg-[#0f172a] border-r border-white/10',
        'transition-[width] duration-300 ease-in-out',
        collapsed ? 'w-[72px]' : 'w-64',
      )}
    >
      {/* logo */}
      <div className={cx('flex items-center px-4 pt-5 pb-4 shrink-0', collapsed ? 'justify-center' : 'justify-between')}>
        {!collapsed && (
          <span className="text-white font-bold text-lg tracking-tight select-none">ExamSecure</span>
        )}
        {collapsed && (
          <span className="text-white font-bold text-lg tracking-tight select-none">ES</span>
        )}
        <button onClick={toggleCollapse} className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Icon d={collapsed ? ICONS.expand : ICONS.collapse} size={16} />
        </button>
      </div>

      {/* role pill */}
      {!collapsed && (
        <div className="px-4 pb-4 shrink-0">
          <span className="inline-flex items-center gap-1.5 bg-sky-500/15 text-sky-300 text-xs font-semibold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            Examiner Portal
          </span>
        </div>
      )}

      {/* nav */}
      <nav aria-label="Examiner navigation" className="flex-1 px-2 pb-2 flex flex-col gap-0.5 overflow-y-auto scrollbar-none">
        {NAV_ITEMS.map((item) => (
          <SideNavLink key={item.key} item={item} collapsed={collapsed} />
        ))}
      </nav>

      {/* user footer */}
      <div className={cx('shrink-0 p-3 border-t border-white/10', collapsed ? 'flex flex-col items-center gap-2' : 'flex items-center gap-3')}>
        <div className="h-9 w-9 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-sm font-bold shrink-0 select-none">
          {user.initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-medium truncate">{user.name}</p>
            <p className="text-white/40 text-xs">{user.role}</p>
          </div>
        )}
        {!collapsed && (
          <button className="text-white/40 hover:text-white transition-colors" aria-label="Sign out" title="Sign out">
            <Icon d={ICONS.logout} size={16} />
          </button>
        )}
      </div>
    </aside>
  )

  return (
    <div className="examiner-theme min-h-dvh flex">
      {/* desktop sidebar */}
      <div className="hidden md:flex shrink-0">{sidebar}</div>

      {/* mobile overlay */}
      <div
        aria-hidden="true"
        onClick={() => setMobileOpen(false)}
        className={cx(
          'md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
      />

      {/* mobile drawer */}
      <div
        className={cx(
          'md:hidden fixed top-0 left-0 z-50 h-dvh transition-transform duration-300 ease-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* use full width sidebar on mobile */}
        <aside className="flex flex-col h-dvh w-64 bg-[#0f172a] border-r border-white/10">
          <div className="flex items-center justify-between px-4 pt-5 pb-4 shrink-0">
            <span className="text-white font-bold text-lg tracking-tight">ExamSecure</span>
            <button onClick={() => setMobileOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors" aria-label="Close menu">
              <Icon d={ICONS.close} size={16} />
            </button>
          </div>
          <div className="px-4 pb-4 shrink-0">
            <span className="inline-flex items-center gap-1.5 bg-sky-500/15 text-sky-300 text-xs font-semibold px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              Examiner Portal
            </span>
          </div>
          <nav aria-label="Examiner navigation" className="flex-1 px-2 pb-2 flex flex-col gap-0.5 overflow-y-auto">
            {NAV_ITEMS.map((item) => (
              <SideNavLink key={item.key} item={item} collapsed={false} />
            ))}
          </nav>
          <div className="shrink-0 p-3 border-t border-white/10 flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-sky-500/20 text-sky-300 flex items-center justify-center text-sm font-bold shrink-0">{user.initials}</div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{user.name}</p>
              <p className="text-white/40 text-xs">{user.role}</p>
            </div>
            <button className="text-white/40 hover:text-white transition-colors" aria-label="Sign out">
              <Icon d={ICONS.logout} size={16} />
            </button>
          </div>
        </aside>
      </div>

      {/* main content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 h-14 flex items-center justify-between px-4 bg-white border-b border-slate-200 shadow-sm">
          <span className="font-bold tracking-tight text-[#0f172a]">ExamSecure</span>
          <button
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            className="h-10 w-10 grid place-items-center rounded-lg hover:bg-slate-100 transition-colors text-[#0f172a]"
          >
            <Icon d={ICONS.menu} size={22} />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
          <div key={pathname} className="rise mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
