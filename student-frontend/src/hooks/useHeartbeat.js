import { useEffect } from 'react'
import api from '../api/client'

// Updates "last seen" for the admin login monitor.
export default function useHeartbeat(ms = 45000) {
  useEffect(() => {
    if (import.meta.env.VITE_MOCK === '1') return
    const ping = () => api.post('/auth/heartbeat').catch(() => {})
    ping()
    const i = setInterval(ping, ms)
    return () => clearInterval(i)
  }, [ms])
}
