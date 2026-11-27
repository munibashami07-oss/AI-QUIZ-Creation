import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const MOCK = import.meta.env.VITE_MOCK === '1'

const MOCK_USERS = {
  'admin@exam.test': { id: 1, name: 'Ayesha Khan', email: 'admin@exam.test', role: 'admin', picture_url: null },
  'imran@exam.test': { id: 2, name: 'Dr. Imran Malik', email: 'imran@exam.test', role: 'examiner', picture_url: null },
  'hamza@exam.test': { id: 3, name: 'Hamza Ali', email: 'hamza@exam.test', role: 'candidate', roll_number: 'FA22-BSE-001', picture_url: null },
}

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (MOCK) {
      // restore from sessionStorage for mock mode
      const stored = sessionStorage.getItem('mock-user')
      if (stored) {
        try { setUser(JSON.parse(stored)) } catch {}
      }
      setLoading(false)
      return
    }
    api.get('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = () => { setUser(null) }
    window.addEventListener('auth:expired', handler)
    return () => window.removeEventListener('auth:expired', handler)
  }, [])

  const login = useCallback(async (email, password) => {
    if (MOCK) {
      const u = Object.values(MOCK_USERS).find((u) => u.email.toLowerCase() === email.toLowerCase())
      if (!u) throw new Error('Invalid credentials')
      sessionStorage.setItem('mock-user', JSON.stringify(u))
      setUser(u)
      return u
    }
    const r = await api.post('/auth/login', { email, password })
    setUser(r.data.user)
    return r.data.user
  }, [])

  const logout = useCallback(async () => {
    if (MOCK) { sessionStorage.removeItem('mock-user'); setUser(null); return }
    try { await api.post('/auth/logout') } catch {}
    setUser(null)
  }, [])

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true })
    if (!loading && user && role && user.role !== role) navigate(`/${user.role}`, { replace: true })
  }, [user, loading, role, navigate])

  if (loading) return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-current border-t-transparent animate-spin opacity-40" />
    </div>
  )

  return user ? children : null
}
