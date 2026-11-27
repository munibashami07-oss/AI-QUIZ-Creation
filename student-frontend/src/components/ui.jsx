import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export const cx = (...a) => a.filter(Boolean).join(' ')

/* ---------- Avatar (initials fallback) ---------- */
export function Avatar({ user, size = 40 }) {
  const [bad, setBad] = useState(false)
  const url = user?.picture_url
  useEffect(() => setBad(false), [url])
  const initials = (user?.name || '?').trim().split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase()
  const style = { width: size, height: size, fontSize: size * 0.38 }
  return url && !bad ? (
    <img src={url} alt="" onError={() => setBad(true)} style={style} className="rounded-full object-cover shrink-0 bg-soft" />
  ) : (
    <span aria-hidden="true" style={style} className="rounded-full grid place-items-center shrink-0 bg-acc/15 text-acc font-bold">{initials}</span>
  )
}

/* ---------- Role badge ---------- */
const ROLE = {
  admin: ['Admin', 'bg-acc/15 text-acc'],
  examiner: ['Examiner', 'bg-sky-400/15 text-sky-300'],
  candidate: ['Student', 'bg-emerald-400/15 text-emerald-300'],
}
export const roleLabel = (r) => ROLE[r]?.[0] ?? r
export const RoleBadge = ({ role }) => (
  <span className={cx('px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap', ROLE[role]?.[1])}>{roleLabel(role)}</span>
)

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed', checked ? 'bg-acc' : 'bg-mut/40')}>
      <span className={cx('absolute top-0.5 left-0.5 h-5 w-5 rounded-full transition-transform duration-300', checked ? 'translate-x-5 bg-bg' : 'bg-white')} />
    </button>
  )
}

/* ---------- Small pieces ---------- */
export const Spinner = () => <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
export const Skeleton = ({ className }) => <div className={cx('animate-pulse rounded-xl bg-soft', className)} />

export const PageHeader = ({ title, sub, action }) => (
  <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="text-mut mt-1">{sub}</p>}
    </div>
    {action}
  </div>
)

export const Empty = ({ title, hint, action }) => (
  <div className="fade text-center py-16 px-6 border border-dashed border-line rounded-2xl">
    <p className="font-semibold">{title}</p>
    {hint && <p className="text-mut text-sm mt-1">{hint}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)

export const ErrorState = ({ message, onRetry }) => (
  <div role="alert" className="fade text-center py-16 px-6 border border-err/40 rounded-2xl">
    <p className="font-semibold text-err">Couldn’t load data</p>
    <p className="text-mut text-sm mt-1">{message}</p>
    <button className="btn btn-ghost mt-4" onClick={onRetry}>Try again</button>
  </div>
)

export function Pills({ value, onChange, options, label }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1">
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cx('h-9 px-4 rounded-full text-sm whitespace-nowrap border transition-colors duration-200',
            value === k ? 'bg-acc text-bg border-acc font-semibold' : 'border-line text-mut hover:text-tx hover:bg-soft')}>
          {l}
        </button>
      ))}
    </div>
  )
}

/* ---------- Modal (animated in/out, bottom sheet on mobile) ---------- */
export function Modal({ open, onClose, title, children, wide }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const closeRef = useRef(onClose)
  const dlg = useRef(null)
  closeRef.current = onClose

  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const k = (e) => e.key === 'Escape' && closeRef.current()
    addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', k); document.body.style.overflow = '' }
  }, [mounted])

  useEffect(() => {
    if (shown) dlg.current?.querySelector('input:not([type=file]),select,button[data-autofocus]')?.focus()
  }, [shown])

  if (!mounted) return null
  return (
    <div className={cx('fixed inset-0 z-[60] grid items-end sm:place-items-center sm:p-4 transition-opacity duration-200', shown ? 'opacity-100' : 'opacity-0')}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div ref={dlg} role="dialog" aria-modal="true" aria-label={title}
        className={cx('relative w-full max-h-[92dvh] overflow-y-auto bg-card border border-line rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 transition-all duration-200 ease-out',
          wide ? 'sm:max-w-xl' : 'sm:max-w-md',
          shown ? 'translate-y-0 sm:scale-100' : 'translate-y-8 sm:translate-y-0 sm:scale-95')}>
        <h2 className="text-2xl font-bold tracking-tight mb-5">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random()
    setItems((i) => [...i, { id, msg, type }])
    setTimeout(() => setItems((i) => i.filter((x) => x.id !== id)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed z-[70] bottom-4 left-4 right-4 sm:left-auto flex flex-col items-end gap-2 pointer-events-none">
        {items.map((t) => (
          <div key={t.id} className={cx('pop pointer-events-auto max-w-sm rounded-xl border bg-card px-4 py-3 text-sm shadow-xl',
            t.type === 'err' ? 'border-err/60 text-err' : 'border-ok/50 text-ok')}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
