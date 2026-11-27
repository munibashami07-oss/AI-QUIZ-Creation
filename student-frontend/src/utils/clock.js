import { useEffect, useState } from 'react'

// Lightweight server-time sync to compensate for client clock drift.
let _offset = 0 // ms: server - client

export function syncClock(serverIso) {
  if (!serverIso) return
  _offset = Date.parse(serverIso) - Date.now()
}

export function now() {
  return Date.now() + _offset
}

export function hms(ms) {
  if (ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sc = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sc}s`
  return `${sc}s`
}

export function useNow(interval = 1000) {
  const [t, setT] = useState(() => now())
  useEffect(() => {
    const id = setInterval(() => setT(now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return t
}
