import api from './client'

// Set VITE_MOCK=1 in .env.local to demo the admin screens without the backend.
const MOCK = import.meta.env.VITE_MOCK === '1'
const delay = (v, ms = 300) => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms))
const unwrap = (r) => (Array.isArray(r.data) ? r.data : r.data.users ?? r.data.sessions ?? r.data.data ?? [])

/* ---------------- mock data ---------------- */
const MIN = 60000
const ago = (ms) => new Date(Date.now() - ms).toISOString()
const SEED = [
  ['Ayesha Khan', 'admin@exam.test', 'admin'],
  ['Dr. Imran Malik', 'imran@exam.test', 'examiner'],
  ['Sana Rafiq', 'sana@exam.test', 'examiner'],
  ['Hamza Ali', 'hamza@exam.test', 'candidate'],
  ['Maryam Iqbal', 'maryam@exam.test', 'candidate'],
  ['Bilal Ahmed', 'bilal@exam.test', 'candidate'],
  ['Noor Fatima', 'noor@exam.test', 'candidate'],
  ['Usman Tariq', 'usman@exam.test', 'candidate'],
  ['Hira Shah', 'hira@exam.test', 'candidate'],
  ['Ali Raza', 'ali@exam.test', 'candidate'],
  ['Zainab Qureshi', 'zainab@exam.test', 'candidate'],
  ['Fahad Sheikh', 'fahad@exam.test', 'candidate'],
]
let users = SEED.map(([name, email, role], i) => ({
  id: i + 1, name, email, role,
  roll_number: role === 'candidate' ? `FA22-BSE-${String(i).padStart(3, '0')}` : null,
  phone: null, picture_url: null, is_active: i !== 11, created_at: ago((40 - i * 2) * 86400000),
}))
const IPS = ['39.45.12.101', '182.185.44.7', '103.255.6.33', '119.160.97.21']
const DEV = [['Desktop', 'Windows 11', 'Chrome 131'], ['Mobile', 'Android 14', 'Chrome 131'], ['Desktop', 'macOS 14', 'Safari 17'], ['Mobile', 'iOS 17', 'Safari 17'], ['Desktop', 'Ubuntu 22.04', 'Firefox 132']]
const sessions = []
users.filter((u) => u.role !== 'admin').forEach((u, i) => {
  ;[0, 1, 2].forEach((k) => {
    const d = DEV[(i + k) % 5]
    const seen = k === 0 ? [40 * 1000, 2 * MIN, 3 * 60 * MIN][i % 3] : (k * 20 + i * 37) * 60 * MIN
    const out = k > 0 || i % 3 === 2
    sessions.push({
      id: sessions.length + 1, user_id: u.id, ip_address: IPS[(i + k) % 4], device: d[0], os: d[1], browser: d[2],
      login_at: ago(seen + 30 * MIN), last_seen_at: ago(seen), logout_at: out ? ago(seen) : null,
    })
  })
})
const withUser = (s) => {
  const u = users.find((x) => x.id === s.user_id) || {}
  return { ...s, name: u.name, email: u.email, role: u.role, roll_number: u.roll_number, picture_url: u.picture_url }
}
const byRecent = (a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at)

/* ---------------- users ---------------- */
export const listUsers = () => (MOCK ? delay(users) : api.get('/admin/users').then(unwrap))

export function saveUser(id, v) {
  if (MOCK) {
    if (users.some((u) => u.email.toLowerCase() === v.email.toLowerCase() && u.id !== id))
      return Promise.reject({ response: { status: 409 } })
    const pic = v.picture ? URL.createObjectURL(v.picture) : undefined
    const base = { name: v.name, email: v.email, role: v.role, roll_number: v.roll_number || null, phone: v.phone || null }
    users = id
      ? users.map((u) => (u.id === id ? { ...u, ...base, picture_url: v.remove_picture ? null : pic ?? u.picture_url } : u))
      : [{ id: Date.now(), ...base, picture_url: pic ?? null, is_active: true, created_at: new Date().toISOString() }, ...users]
    return delay({})
  }
  const fd = new FormData()
  ;['name', 'email', 'role', 'roll_number', 'phone', 'password'].forEach((k) => v[k] && fd.append(k, v[k]))
  if (v.picture) fd.append('picture', v.picture)
  if (v.remove_picture) fd.append('remove_picture', '1')
  return id ? api.put(`/admin/users/${id}`, fd) : api.post('/admin/users', fd)
}

export function removeUser(id) {
  if (MOCK) { users = users.filter((u) => u.id !== id); return delay({}) }
  return api.delete(`/admin/users/${id}`)
}
export function setRole(id, role) {
  if (MOCK) { users = users.map((u) => (u.id === id ? { ...u, role, roll_number: role === 'candidate' ? u.roll_number : null } : u)); return delay({}, 200) }
  return api.patch(`/admin/users/${id}/role`, { role })
}
export function setStatus(id, is_active) {
  if (MOCK) { users = users.map((u) => (u.id === id ? { ...u, is_active } : u)); return delay({}, 200) }
  return api.patch(`/admin/users/${id}/status`, { is_active })
}

/* ---------------- login tracking ---------------- */
export const currentLogins = () =>
  MOCK
    ? delay(sessions.filter((s) => !s.logout_at && Date.now() - new Date(s.last_seen_at) < 5 * MIN).map(withUser).sort(byRecent))
    : api.get('/admin/logins/current').then(unwrap)

export const loginHistory = () =>
  MOCK ? delay(sessions.map(withUser).sort(byRecent)) : api.get('/admin/logins/history').then(unwrap)
