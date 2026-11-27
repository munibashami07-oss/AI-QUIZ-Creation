import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Spinner } from '../components/ui'

const DEMO = [
  { label: 'Login as Examiner', email: 'imran@exam.test', role: 'examiner' },
  { label: 'Login as Student', email: 'hamza@exam.test', role: 'candidate' },
  { label: 'Login as Admin', email: 'admin@exam.test', role: 'admin' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const user = await login(form.email, form.password || 'demo')
      navigate(user.role === 'admin' ? '/admin/users' : user.role === 'examiner' ? '/examiner/overview' : '/candidate/exams', { replace: true })
    } catch {
      setErr('Invalid email or password.')
    } finally { setBusy(false) }
  }

  const demoLogin = async (email) => {
    setBusy(true)
    try {
      const user = await login(email, 'demo')
      navigate(user.role === 'admin' ? '/admin/users' : user.role === 'examiner' ? '/examiner/overview' : '/candidate/exams', { replace: true })
    } catch { setErr('Demo login failed.') } finally { setBusy(false) }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">ExamSecure</h1>
          <p className="text-white/50 mt-2 text-sm">Secure Examination Management</p>
        </div>
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-[#0f172a] mb-6">Sign in</h2>
          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                autoComplete="email" className="field bg-slate-50" placeholder="you@exam.test" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="current-password" className="field bg-slate-50" placeholder="••••••••" />
            </div>
            {err && <p className="text-rose-500 text-sm">{err}</p>}
            <button type="submit" disabled={busy} className="btn w-full h-11 bg-[#1e3a5f] text-white font-semibold hover:bg-[#162d4a] transition-colors disabled:opacity-50">
              {busy ? <Spinner /> : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center mb-3">Or use a demo account</p>
            <div className="grid gap-2">
              {DEMO.map(({ label, email }) => (
                <button key={email} onClick={() => demoLogin(email)} disabled={busy}
                  className="btn btn-ghost h-9 text-sm border-slate-200 font-medium disabled:opacity-50 hover:bg-slate-50">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
