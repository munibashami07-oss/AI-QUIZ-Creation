import { useRef, useState } from 'react'
import { Switch, cx } from '../../components/ui'

export default function Profile() {
  const fileRef = useRef(null)
  const [profile, setProfile] = useState({
    name: 'Dr. Imran Malik',
    email: 'imran@exam.test',
    phone: '+92 300 1234567',
    department: 'Computer Science',
    bio: 'Professor of Computer Science with 12 years of experience in algorithms and data structures.',
    picture: null,
  })
  const [preview, setPreview] = useState(null)
  const [passwords, setPasswords] = useState({ current: '', newP: '', confirm: '' })
  const [pwErr, setPwErr] = useState({})

  const [notifs, setNotifs] = useState({
    submissionEmail: true,
    violationAlert: true,
    examStartSMS: false,
    weeklyReport: true,
    systemUpdates: false,
  })

  const [prefs, setPrefs] = useState({
    defaultDuration: 60,
    defaultViolations: 2,
    defaultAttendance: false,
    autoPublish: false,
    showRollNumbers: true,
    fontSize: 'medium',
    sidebarCollapsed: false,
    colorTheme: 'navy',
  })

  const [saved, setSaved] = useState('')

  const handlePicture = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setPreview(URL.createObjectURL(f))
    setProfile((p) => ({ ...p, picture: f }))
    e.target.value = ''
  }

  const saveProfile = (e) => {
    e.preventDefault()
    setSaved('profile')
    setTimeout(() => setSaved(''), 2500)
  }

  const changePassword = (e) => {
    e.preventDefault()
    const errs = {}
    if (!passwords.current) errs.current = 'Enter your current password.'
    if (passwords.newP.length < 8) errs.newP = 'At least 8 characters.'
    if (passwords.newP !== passwords.confirm) errs.confirm = 'Passwords do not match.'
    setPwErr(errs)
    if (!Object.keys(errs).length) {
      setPasswords({ current: '', newP: '', confirm: '' })
      setSaved('password')
      setTimeout(() => setSaved(''), 2500)
    }
  }

  const saveNotifs = () => { setSaved('notifs'); setTimeout(() => setSaved(''), 2500) }
  const savePrefs = () => { setSaved('prefs'); setTimeout(() => setSaved(''), 2500) }

  const SavedBadge = ({ key_ }) => saved === key_ ? (
    <span className="text-xs text-green-600 font-semibold bg-green-50 px-2.5 py-1 rounded-full animate-fade">✓ Saved</span>
  ) : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#0f172a]">Profile & Settings</h1>
        <p className="text-slate-500 mt-1">Manage your personal information, password and preferences.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* profile info */}
          <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#0f172a]">Personal Information</h2>
              <SavedBadge key_="profile" />
            </div>
            <form onSubmit={saveProfile} className="space-y-4">
              {/* avatar */}
              <div className="flex items-center gap-5 mb-2">
                <div className="relative">
                  <div className="h-20 w-20 rounded-2xl bg-[#1e3a5f]/10 overflow-hidden flex items-center justify-center">
                    {preview ? (
                      <img src={preview} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-[#1e3a5f]">DI</span>
                    )}
                  </div>
                  <button type="button" onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center shadow-md hover:bg-[#162d4a] transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 4v16m8-8H4"/></svg>
                  </button>
                </div>
                <div>
                  <p className="font-semibold text-[#0f172a]">{profile.name}</p>
                  <p className="text-sm text-slate-400">Examiner</p>
                  <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={handlePicture} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="text-xs text-sky-600 hover:text-sky-800 mt-1">Change photo</button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Full Name</label>
                  <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className="field bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Email</label>
                  <input type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} className="field bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Phone</label>
                  <input type="tel" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} className="field bg-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Department</label>
                  <input value={profile.department} onChange={(e) => setProfile((p) => ({ ...p, department: e.target.value }))} className="field bg-white" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Bio</label>
                  <textarea value={profile.bio} onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))} rows={3}
                    className="field bg-white w-full h-auto p-3 resize-none" />
                </div>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn btn-acc h-10 px-5">Save Changes</button>
              </div>
            </form>
          </section>

          {/* change password */}
          <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#0f172a]">Change Password</h2>
              <SavedBadge key_="password" />
            </div>
            <form onSubmit={changePassword} className="space-y-4">
              {[
                ['current', 'Current Password', 'current-password'],
                ['newP', 'New Password', 'new-password'],
                ['confirm', 'Confirm New Password', 'new-password'],
              ].map(([key, label, autoC]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>
                  <input type="password" autoComplete={autoC} value={passwords[key]}
                    onChange={(e) => setPasswords((p) => ({ ...p, [key]: e.target.value }))}
                    className={cx('field bg-white', pwErr[key] && 'border-rose-400')} />
                  {pwErr[key] && <p className="mt-1 text-xs text-rose-500">{pwErr[key]}</p>}
                </div>
              ))}
              <div className="flex justify-end">
                <button type="submit" className="btn btn-acc h-10 px-5">Update Password</button>
              </div>
            </form>
          </section>

          {/* notifications */}
          <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#0f172a]">Notification Preferences</h2>
              <SavedBadge key_="notifs" />
            </div>
            <div className="space-y-4">
              {[
                ['submissionEmail', 'Email on new submission', 'Get an email when a student submits an exam.'],
                ['violationAlert', 'Violation alerts', 'Real-time alerts when a student triggers a violation.'],
                ['examStartSMS', 'SMS when exam starts', 'Receive an SMS notification when an exam goes live.'],
                ['weeklyReport', 'Weekly summary', 'Weekly digest of exams, submissions and grading status.'],
                ['systemUpdates', 'System updates', 'Platform announcements and maintenance notices.'],
              ].map(([key, label, hint]) => (
                <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-[#0f172a]">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{hint}</p>
                  </div>
                  <Switch checked={notifs[key]} onChange={(v) => setNotifs((n) => ({ ...n, [key]: v }))} label={label} />
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={saveNotifs} className="btn btn-acc h-10 px-5">Save Preferences</button>
            </div>
          </section>
        </div>

        {/* right column */}
        <div className="space-y-6">
          {/* exam defaults */}
          <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[#0f172a]">Exam Defaults</h2>
              <SavedBadge key_="prefs" />
            </div>
            <div className="space-y-4">
              {/* preferences: exam defaults */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Default Duration (min)</label>
                <input type="number" min={1} value={prefs.defaultDuration}
                  onChange={(e) => setPrefs((p) => ({ ...p, defaultDuration: Number(e.target.value) }))}
                  className="field bg-slate-50 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Default Violation Limit</label>
                <select value={prefs.defaultViolations} onChange={(e) => setPrefs((p) => ({ ...p, defaultViolations: Number(e.target.value) }))} className="field bg-slate-50 text-sm">
                  {[1, 2, 3, 5, 10].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              {/* font size */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Font Size</label>
                <div className="flex gap-2">
                  {[['small', 'Small', 'text-xs'], ['medium', 'Medium', 'text-sm'], ['large', 'Large', 'text-base']].map(([k, l, cls]) => (
                    <button key={k} type="button" onClick={() => setPrefs((p) => ({ ...p, fontSize: k }))}
                      className={cx('flex-1 h-9 rounded-xl border text-sm font-semibold transition-colors', cls,
                        prefs.fontSize === k ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {/* theme */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Accent Theme</label>
                <div className="flex gap-2">
                  {[['navy', '#1e3a5f', 'Navy'], ['slate', '#475569', 'Slate'], ['indigo', '#4f46e5', 'Indigo']].map(([k, color, l]) => (
                    <button key={k} type="button" onClick={() => setPrefs((p) => ({ ...p, colorTheme: k }))}
                      className={cx('flex items-center gap-2 flex-1 h-9 rounded-xl border text-xs font-semibold transition-colors px-3',
                        prefs.colorTheme === k ? 'border-[#1e3a5f] bg-slate-50' : 'border-slate-200 hover:border-slate-300')}>
                      <span className="w-4 h-4 rounded-full shrink-0" style={{ background: color }} />
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {[
                ['defaultAttendance', 'Require attendance by default'],
                ['autoPublish', 'Auto-publish at scheduled time'],
                ['showRollNumbers', 'Show roll numbers in reports'],
                ['sidebarCollapsed', 'Start with sidebar collapsed'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <label className="text-sm font-medium text-[#0f172a]">{label}</label>
                  <Switch checked={prefs[key]} onChange={(v) => setPrefs((p) => ({ ...p, [key]: v }))} label={label} />
                </div>
              ))}
            </div>
            <div className="mt-4">
              <button onClick={savePrefs} className="btn btn-acc w-full h-10">Save Defaults</button>
            </div>
          </section>

          {/* account info */}
          <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#0f172a] mb-4">Account</h2>
            <dl className="space-y-3 text-sm">
              {[
                ['Role', 'Examiner'],
                ['Account Status', 'Active'],
                ['Member Since', 'January 2023'],
                ['Last Login', 'Today, 9:41 AM'],
              ].map(([dt, dd]) => (
                <div key={dt} className="flex justify-between">
                  <dt className="text-slate-400">{dt}</dt>
                  <dd className="font-medium text-[#0f172a]">{dd}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* danger zone */}
          <section className="bg-rose-50 border border-rose-200 rounded-2xl p-6">
            <h2 className="text-base font-semibold text-rose-700 mb-2">Danger Zone</h2>
            <p className="text-sm text-rose-600 mb-4">These actions are irreversible. Please proceed with caution.</p>
            <button className="btn btn-ghost w-full h-10 text-sm text-rose-500 border-rose-200 hover:bg-rose-100">
              Delete All My Exam Data
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
