import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getAttempt, getTime, postViolation, saveAnswer, submitAttempt } from '../../api/candidate'
import { errMsg } from '../../api/client'
import { hms, useNow } from '../../utils/clock'
import { enterFs, exitFs, fsActive, fsSupported } from '../../utils/fullscreen'
import useHeartbeat from '../../hooks/useHeartbeat'
import { Modal, Skeleton, Spinner, cx, useToast } from '../../components/ui'

/* offline-safe answer queue, kept on the device until the server confirms */
const rd = (id) => { try { return JSON.parse(localStorage.getItem(`queue:${id}`)) || {} } catch { return {} } }
const wr = (id, q) => { try { localStorage.setItem(`queue:${id}`, JSON.stringify(q)) } catch { /* storage full */ } }

const answered = (q, a) => (q.type === 'short' ? !!a?.response?.trim() : q.type === 'multi' ? !!a?.response?.length : a?.response != null)
const TYPE = { mcq: 'Single answer', multi: 'Select all that apply', short: 'Written answer' }
const WARN = {
  fullscreen_exit: 'You left fullscreen.', tab_hidden: 'You switched away from the exam tab.',
  window_blur: 'The exam window lost focus.', grace_expired: 'You did not return to fullscreen in time.',
}
const DONE = {
  manual: ['Exam submitted', 'Your answers were submitted. Your examiner will publish results.'],
  timeout: ['Time is up', 'Your exam was submitted automatically with the answers saved before time ran out.'],
  violation: ['Exam submitted automatically', 'The violation limit was reached. Your examiner can review the flagged events.'],
}

export default function Workspace() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const now = useNow(1000)
  useHeartbeat()
  useEffect(() => {
    document.documentElement.classList.add('theme-student')
    return () => document.documentElement.classList.remove('theme-student')
  }, [])

  const [att, setAtt] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [answers, setAnswers] = useState({})
  const [cur, setCur] = useState(0)
  const [done, setDone] = useState(null)
  const [sync, setSync] = useState('saved')
  const [online, setOnline] = useState(navigator.onLine)
  const [warn, setWarn] = useState(null)
  const [isFs, setIsFs] = useState(fsActive())
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const ar = useRef({}), timer = useRef(), flushing = useRef(false), finishing = useRef(false), armed = useRef(!fsSupported)

  /* load / resume: server answers + anything still queued on this device */
  useEffect(() => {
    getAttempt(id).then((a) => {
      if (a.status !== 'in_progress') return setDone(a.submit_reason || 'manual')
      const base = {}
      Object.entries(a.answers || {}).forEach(([k, v]) => { base[k] = { response: v.response ?? null, marked_for_review: !!v.marked_for_review } })
      Object.values(rd(id)).forEach((i) => { base[i.question_id] = { response: i.response, marked_for_review: i.marked_for_review } })
      ar.current = base; setAnswers(base); setAtt(a)
    }).catch((e) => setLoadErr(errMsg(e)))
  }, [id])

  /* autosave: debounce, retry, never lose an answer */
  const flush = useCallback(async () => {
    if (flushing.current) return false
    flushing.current = true
    try {
      for (;;) {
        const first = Object.values(rd(id))[0]
        if (!first) { setSync('saved'); return true }
        setSync('saving')
        try { await saveAnswer(id, { question_id: first.question_id, response: first.response, marked_for_review: first.marked_for_review }) }
        catch (e) {
          if (!e.response) { setSync('offline'); return false }
          if (e.response.status >= 500) { setSync('error'); return false }
        }
        const q = rd(id)
        if (q[first.question_id]?.seq === first.seq) { delete q[first.question_id]; wr(id, q) }
      }
    } finally { flushing.current = false }
  }, [id])

  const update = (qid, patch) => {
    const next = { response: null, marked_for_review: false, ...ar.current[qid], ...patch }
    ar.current = { ...ar.current, [qid]: next }
    setAnswers(ar.current)
    const q = rd(id); q[qid] = { question_id: qid, ...next, seq: Date.now() + Math.random() }; wr(id, q)
    setSync(navigator.onLine ? 'saving' : 'offline')
    clearTimeout(timer.current); timer.current = setTimeout(flush, 600)
  }

  useEffect(() => {
    const t = setInterval(() => { if (!finishing.current && Object.keys(rd(id)).length) flush() }, 5000)
    const on = () => { setOnline(true); flush() }, offl = () => setOnline(false)
    addEventListener('online', on); addEventListener('offline', offl)
    return () => { clearInterval(t); removeEventListener('online', on); removeEventListener('offline', offl) }
  }, [id, flush])

  /* finishing */
  const finishLocal = useCallback((r) => { finishing.current = true; exitFs(); setWarn(null); setConfirm(false); setBusy(false); setDone(r) }, [])
  const finish = useCallback(async (reason) => {
    if (finishing.current) return
    finishing.current = true; setBusy(true); clearTimeout(timer.current)
    const synced = await flush().catch(() => false)
    try { await submitAttempt(id, reason) }
    catch (e) {
      if (reason === 'manual' && (!e.response || e.response.status !== 409)) {
        finishing.current = false; setBusy(false)
        return toast(e.response ? errMsg(e) : 'You are offline. Reconnect to submit. Your answers are safe on this device.', 'err')
      }
    }
    if (synced) localStorage.removeItem(`queue:${id}`)
    finishLocal(reason)
  }, [id, flush, finishLocal, toast])

  /* server-driven timer: deadline never moves, device clock is ignored */
  const remaining = att ? Date.parse(att.deadline_at) - now : 1
  useEffect(() => { if (att && !done && remaining <= 0) finish('timeout') }, [att, done, remaining, finish])
  useEffect(() => {
    if (!att || done) return
    const t = setInterval(() => getTime(id).then((r) => { if (r.status && r.status !== 'in_progress') finishLocal(r.submit_reason || 'timeout') }).catch(() => {}), 30000)
    return () => clearInterval(t)
  }, [att, done, id, finishLocal])
  useEffect(() => {
    if (!att || done) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h)
  }, [att, done])

  /* violations: fullscreen exit, tab hidden, window blur. Network drops are never reported. */
  const report = async (type) => {
    const limit = att.exam.violation_limit, grace = fsSupported ? 10 : null
    try {
      const r = await postViolation(id, type)
      if (r.auto_submitted || (r.status && r.status !== 'in_progress')) return finishLocal('violation')
      setWarn({ type, count: r.violation_count, limit: r.limit ?? limit, grace })
    } catch { setWarn({ type, count: null, limit, grace }) }
  }
  const reportRef = useRef(report); reportRef.current = report
  useEffect(() => {
    if (!att || done) return
    let last = 0
    const fire = (type) => {
      if (!armed.current || finishing.current) return
      const t = Date.now(); if (t - last < 2500) return // one action counts once
      last = t; reportRef.current(type)
    }
    const onFs = () => { const on = fsActive(); setIsFs(on); if (on) armed.current = true; else fire('fullscreen_exit') }
    const onVis = () => document.hidden && fire('tab_hidden'), onBlur = () => fire('window_blur')
    document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs)
    document.addEventListener('visibilitychange', onVis); addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs)
      document.removeEventListener('visibilitychange', onVis); removeEventListener('blur', onBlur)
    }
  }, [att, done])
  useEffect(() => {
    if (!warn || warn.grace == null) return
    if (warn.grace <= 0) { if (!fsActive()) reportRef.current('grace_expired'); else setWarn(null); return }
    const t = setTimeout(() => setWarn((w) => w && { ...w, grace: w.grace - 1 }), 1000)
    return () => clearTimeout(t)
  }, [warn])

  /* ---------- render ---------- */
  if (loadErr) return <div className="min-h-dvh grid place-items-center p-6 text-center"><div><p className="text-err font-semibold">{loadErr}</p><button className="btn btn-ghost mt-4" onClick={() => nav('/candidate/exams')}>Back to my exams</button></div></div>
  if (done) {
    const [t, d] = DONE[done] || DONE.manual
    return (
      <div className="min-h-dvh grid place-items-center p-6 bg-blush">
        <div className="rise bg-card border border-line rounded-3xl p-8 max-w-md text-center">
          <div className="mx-auto h-14 w-14 rounded-full bg-acc text-bg grid place-items-center text-2xl mb-4" aria-hidden="true">✓</div>
          <h1 className="text-2xl font-bold tracking-tight">{t}</h1>
          <p className="text-mut mt-2">{d}</p>
          <button className="btn btn-acc w-full mt-6" onClick={() => nav('/candidate/exams', { replace: true })}>Back to my exams</button>
        </div>
      </div>
    )
  }
  if (!att) return <div className="p-6 max-w-3xl mx-auto grid gap-3"><Skeleton className="h-14" /><Skeleton className="h-72" /></div>

  const qs = att.questions, q = qs[cur], a = answers[q.id] || {}
  const nAns = qs.filter((x) => answered(x, answers[x.id])).length
  const nRev = qs.filter((x) => answers[x.id]?.marked_for_review).length
  const SYNC = { saved: 'Saved', saving: 'Saving…', offline: 'Offline · will sync', error: 'Save failed · retrying' }[sync]

  const palette = (cls) => (
    <nav aria-label="Question palette" className={cls}>
      {qs.map((x, i) => (
        <button key={x.id} onClick={() => setCur(i)} aria-label={`Question ${i + 1}${answers[x.id]?.marked_for_review ? ', marked for review' : answered(x, answers[x.id]) ? ', answered' : ', unanswered'}`}
          aria-current={i === cur ? 'true' : undefined}
          className={cx('h-10 w-10 shrink-0 rounded-lg border text-sm font-semibold transition-all duration-200',
            answers[x.id]?.marked_for_review ? 'border-warn bg-warn/15 text-warn' : answered(x, answers[x.id]) ? 'border-acc bg-acc text-bg' : 'border-line hover:bg-soft',
            i === cur && 'ring-2 ring-acc ring-offset-2 ring-offset-bg scale-105')}>
          {i + 1}
        </button>
      ))}
    </nav>
  )

  return (
    <div className="min-h-dvh flex flex-col bg-bg text-tx">
      {!online && <div role="alert" className="bg-warn text-white text-sm px-4 py-2 text-center">You’re offline. Answers are saved on this device and will sync when you reconnect. The timer keeps running.</div>}
      <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur border-b border-line">
        <div className="flex items-center gap-2 sm:gap-3 px-4 h-14">
          <h1 className="font-semibold truncate flex-1">{att.exam.title}</h1>
          <span className={cx('hidden sm:inline text-xs', sync === 'saved' ? 'text-ok' : sync === 'saving' ? 'text-mut' : 'text-warn font-semibold')} role="status">{SYNC}</span>
          <div role="timer" aria-label="Time remaining" className={cx('tabular-nums font-bold px-3 py-1.5 rounded-lg transition-colors', remaining < 300000 ? 'bg-acc text-bg' : 'bg-soft')}>{hms(remaining)}</div>
          <button className="btn btn-acc h-9 px-4 text-sm" onClick={() => setConfirm(true)}>Submit</button>
        </div>
        {palette('md:hidden flex gap-2 overflow-x-auto px-4 pb-3')}
      </header>

      <div className="flex-1 md:grid md:grid-cols-[200px_1fr]">
        <aside className="hidden md:block border-r border-line p-4">
          <p className="text-xs uppercase tracking-wider text-mut mb-3">Questions</p>
          {palette('grid grid-cols-4 gap-2')}
          <ul className="mt-5 space-y-1.5 text-xs text-mut">
            <li><span className="inline-block h-3 w-3 rounded bg-acc mr-2 align-middle" />Answered ({nAns})</li>
            <li><span className="inline-block h-3 w-3 rounded border border-warn bg-warn/15 mr-2 align-middle" />Review ({nRev})</li>
            <li><span className="inline-block h-3 w-3 rounded border border-line mr-2 align-middle" />Unanswered ({qs.length - nAns})</li>
          </ul>
        </aside>

        <main className="p-4 sm:p-8 max-w-3xl w-full mx-auto">
          <section key={q.id} className="fade">
            <p className="text-sm text-mut">Question {cur + 1} of {qs.length} · {q.marks} {q.marks === 1 ? 'mark' : 'marks'} · {TYPE[q.type]}</p>
            <h2 className="text-xl sm:text-2xl font-semibold mt-2 whitespace-pre-wrap">{q.text}</h2>
            <div className="mt-6 grid gap-3" role={q.type === 'short' ? undefined : q.type === 'mcq' ? 'radiogroup' : 'group'} aria-label="Answer options">
              {q.type === 'short' ? (
                <>
                  <textarea className="field h-auto min-h-44 py-3" rows={7} aria-label="Your answer" value={a.response ?? ''} onChange={(e) => update(q.id, { response: e.target.value })} />
                  <p className="text-xs text-mut text-right">{(a.response || '').length} characters</p>
                </>
              ) : q.options.map((o) => {
                const checked = q.type === 'multi' ? !!a.response?.includes(o.id) : a.response === o.id
                const pick = () => update(q.id, { response: q.type === 'multi' ? (checked ? a.response.filter((x) => x !== o.id) : [...(a.response || []), o.id]) : o.id })
                return (
                  <label key={o.id} className="flex items-start gap-3 p-4 rounded-2xl border border-line cursor-pointer transition-colors hover:bg-soft has-[:checked]:border-acc has-[:checked]:bg-blush">
                    <input type={q.type === 'multi' ? 'checkbox' : 'radio'} name={`q${q.id}`} checked={checked} onChange={pick} className="mt-1 h-4 w-4 accent-acc" />
                    <span>{o.text}</span>
                  </label>
                )
              })}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2 mt-8">
            <button className="btn btn-ghost" disabled={cur === 0} onClick={() => setCur(cur - 1)}>← Previous</button>
            <button className={cx('btn btn-ghost', a.marked_for_review && 'border-warn text-warn')} aria-pressed={!!a.marked_for_review} onClick={() => update(q.id, { marked_for_review: !a.marked_for_review })}>
              {a.marked_for_review ? '⚑ Marked for review' : '⚐ Mark for review'}
            </button>
            {answered(q, a) && <button className="btn btn-ghost" onClick={() => update(q.id, { response: q.type === 'multi' ? [] : null })}>Clear</button>}
            <span className="flex-1" />
            {cur < qs.length - 1 ? <button className="btn btn-acc" onClick={() => setCur(cur + 1)}>Next →</button>
              : <button className="btn btn-acc" onClick={() => setConfirm(true)}>Review & submit</button>}
          </div>
          <p className="sm:hidden text-xs mt-6 text-center text-mut" role="status">{SYNC}</p>
        </main>
      </div>

      <Modal open={confirm} onClose={() => !busy && setConfirm(false)} title="Submit your exam?">
        <ul className="grid grid-cols-3 gap-3 text-center">
          {[['Answered', nAns], ['Unanswered', qs.length - nAns], ['For review', nRev]].map(([t, n]) => (
            <li key={t} className="border border-line rounded-2xl py-3"><p className="text-2xl font-bold">{n}</p><p className="text-xs text-mut">{t}</p></li>
          ))}
        </ul>
        {(nAns < qs.length || nRev > 0) && <p className="text-sm text-warn mt-4">You still have {qs.length - nAns} unanswered and {nRev} marked for review. You can’t change answers after submitting.</p>}
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirm(false)}>Keep working</button>
          <button className="btn btn-acc" disabled={busy} onClick={() => finish('manual')}>{busy && <Spinner />}Submit exam</button>
        </div>
      </Modal>

      {warn && (
        <div role="alertdialog" aria-modal="true" aria-label="Violation warning" className="fixed inset-0 z-[90] grid place-items-center p-4 bg-acc/95">
          <div className="pop bg-card rounded-3xl p-8 max-w-md text-center">
            <p className="text-sm font-semibold text-acc uppercase tracking-wider">Warning{warn.count != null && ` ${warn.count} of ${warn.limit}`}</p>
            <h2 className="text-2xl font-bold tracking-tight mt-2">{WARN[warn.type]}</h2>
            <p className="text-mut mt-3 text-sm">
              {warn.count != null ? `Reaching ${warn.limit} violations submits your exam automatically.` : 'This could not be recorded because you are offline.'} Events are flagged for your examiner to review. They are not proof of misconduct.
            </p>
            {warn.grace != null && <p className="mt-4 font-semibold tabular-nums">Return to fullscreen in {Math.max(warn.grace, 0)}s</p>}
            <button data-autofocus className="btn btn-acc w-full mt-5" onClick={async () => { await enterFs(); setWarn(null) }}>Return to exam</button>
          </div>
        </div>
      )}

      {fsSupported && !isFs && !warn && !confirm && (
        <div className="fixed inset-0 z-[80] grid place-items-center p-4 bg-blush">
          <div className="pop bg-card border border-line rounded-3xl p-8 max-w-md text-center">
            <h2 className="text-2xl font-bold tracking-tight">Enter fullscreen to continue</h2>
            <p className="text-mut mt-2 text-sm">Your timer is running. The exam must be taken in fullscreen.</p>
            <button className="btn btn-acc w-full mt-5" onClick={enterFs}>Enter fullscreen</button>
          </div>
        </div>
      )}
    </div>
  )
}
