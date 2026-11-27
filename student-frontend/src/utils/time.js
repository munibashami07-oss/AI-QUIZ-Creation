// Backend stores UTC. Treat strings without a zone as UTC.
export const toDate = (s) =>
  new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : String(s).replace(' ', 'T') + 'Z')

export const fmt = (s) =>
  s ? toDate(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export const fmtDate = (s) =>
  s ? toDate(s).toLocaleDateString([], { dateStyle: 'medium' }) : '—'

export function ago(s) {
  if (!s) return '—'
  const m = Math.round((Date.now() - toDate(s)) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : fmt(s)
}
