import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listUsers, saveUser, removeUser, setRole, setStatus } from '../../api/admin'
import { errMsg } from '../../api/client'
import { useAuth } from '../../auth/AuthContext'
import { fmtDate } from '../../utils/time'
import { Avatar, Empty, ErrorState, Modal, PageHeader, Pills, RoleBadge, Skeleton, Spinner, Switch, cx, useToast } from '../../components/ui'

const ROLE_OPTS = [['all', 'All'], ['candidate', 'Students'], ['examiner', 'Examiners'], ['admin', 'Admins']]
const ROLE_SELECT = [['candidate', 'Student'], ['examiner', 'Examiner'], ['admin', 'Admin']]

/* Optimistic quick edit (role / status) so toggles feel instant */
function useQuickEdit(fn, field, okMsg) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: ({ id, value }) => fn(id, value),
    onMutate: async ({ id, value }) => {
      await qc.cancelQueries({ queryKey: ['users'] })
      const prev = qc.getQueryData(['users'])
      qc.setQueryData(['users'], (o = []) => o.map((u) => (u.id === id ? { ...u, [field]: value } : u)))
      return { prev }
    },
    onError: (e, _v, ctx) => { qc.setQueryData(['users'], ctx.prev); toast(errMsg(e), 'err') },
    onSuccess: () => toast(okMsg),
    onSettled: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export default function Users() {
  const { user: me } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const { data = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ['users'], queryFn: listUsers })

  const [q, setQ] = useState('')
  const [roleF, setRoleF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [modal, setModal] = useState({ open: false, user: null })
  const [del, setDel] = useState({ open: false, user: null })

  const roleM = useQuickEdit(setRole, 'role', 'Role updated')
  const statusM = useQuickEdit(setStatus, 'is_active', 'Status updated')
  const delM = useMutation({
    mutationFn: (id) => removeUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('User deleted'); setDel((d) => ({ ...d, open: false })) },
    onError: (e) => toast(errMsg(e), 'err'),
  })

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return data.filter((u) =>
      (roleF === 'all' || u.role === roleF) &&
      (statusF === 'all' || (statusF === 'active') === u.is_active) &&
      (!s || [u.name, u.email, u.roll_number].some((v) => v?.toLowerCase().includes(s))))
  }, [data, q, roleF, statusF])

  const count = (r) => data.filter((u) => u.role === r).length
  const stats = [['Total users', data.length], ['Students', count('candidate')], ['Examiners', count('examiner')], ['Disabled', data.filter((u) => !u.is_active).length]]
  const clear = () => { setQ(''); setRoleF('all'); setStatusF('all') }

  const controls = (u) => {
    const self = u.id === me?.id
    return {
      self,
      role: (
        <select aria-label={`Role for ${u.name}`} value={u.role} disabled={self}
          onChange={(e) => roleM.mutate({ id: u.id, value: e.target.value })}
          className="field h-9 w-auto px-2 text-sm disabled:opacity-60">
          {ROLE_SELECT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      ),
      active: (
        <div className="flex items-center gap-2">
          <Switch checked={u.is_active} disabled={self} label={`${u.is_active ? 'Disable' : 'Enable'} ${u.name}`}
            onChange={(v) => statusM.mutate({ id: u.id, value: v })} />
          <span className={cx('text-xs', u.is_active ? 'text-ok' : 'text-mut')}>{u.is_active ? 'Enabled' : 'Disabled'}</span>
        </div>
      ),
      actions: (
        <div className="flex gap-2">
          <button className="btn btn-ghost h-9 px-3 text-sm" onClick={() => setModal({ open: true, user: u })}>Edit</button>
          <button className="btn btn-ghost h-9 px-3 text-sm text-err disabled:opacity-40" disabled={self} onClick={() => setDel({ open: true, user: u })}>Delete</button>
        </div>
      ),
    }
  }

  return (
    <>
      <PageHeader title="Users" sub="Create accounts, assign roles and control access."
        action={<button className="btn btn-acc" onClick={() => setModal({ open: true, user: null })}>+ Add user</button>} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {stats.map(([l, n], i) => (
          <div key={l} style={{ animationDelay: `${i * 60}ms` }} className="rise bg-card border border-line rounded-2xl p-4">
            <p className="text-mut text-sm">{l}</p>
            <p className="text-3xl font-bold tracking-tight mt-1">{isLoading ? '–' : n}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5">
        <input type="search" aria-label="Search users" placeholder="Search name, email or roll no" value={q}
          onChange={(e) => setQ(e.target.value)} className="field lg:max-w-xs" />
        <Pills label="Filter by role" value={roleF} onChange={setRoleF} options={ROLE_OPTS} />
        <select aria-label="Filter by status" value={statusF} onChange={(e) => setStatusF(e.target.value)} className="field lg:w-40 lg:ml-auto">
          <option value="all">All statuses</option><option value="active">Enabled</option><option value="disabled">Disabled</option>
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : isError ? (
        <ErrorState message={errMsg(error)} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <Empty title="No users match" hint="Try a different search or filter."
          action={<button className="btn btn-ghost" onClick={clear}>Clear filters</button>} />
      ) : (
        <>
          {/* mobile cards */}
          <ul className="md:hidden grid gap-3">
            {rows.map((u, i) => {
              const c = controls(u)
              return (
                <li key={u.id} style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }} className="rise bg-card border border-line rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <Avatar user={u} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{u.name}{c.self && <span className="ml-2 text-xs text-mut font-normal">(you)</span>}</p>
                      <p className="text-mut text-xs truncate">{u.email}</p>
                    </div>
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="flex items-center justify-between mt-4 text-sm text-mut">
                    <span>{u.role === 'candidate' ? `Roll ${u.roll_number ?? '—'}` : `Joined ${fmtDate(u.created_at)}`}</span>
                    {c.active}
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-4 pt-4 border-t border-line">
                    {c.role}{c.actions}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* desktop table */}
          <div className="hidden md:block bg-card border border-line rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-mut">
                <tr>{['User', 'Role', 'Roll no', 'Joined', 'Access', ''].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((u, i) => {
                  const c = controls(u)
                  return (
                    <tr key={u.id} style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }} className="fade border-t border-line hover:bg-soft transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-56">
                          <Avatar user={u} size={40} />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.name}{c.self && <span className="ml-2 text-xs text-mut font-normal">(you)</span>}</p>
                            <p className="text-mut text-xs truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">{c.role}</td>
                      <td className="px-4 py-3 text-mut">{u.role === 'candidate' ? u.roll_number ?? '—' : '—'}</td>
                      <td className="px-4 py-3 text-mut whitespace-nowrap">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-3">{c.active}</td>
                      <td className="px-4 py-3">{c.actions}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={modal.open} onClose={() => setModal((m) => ({ ...m, open: false }))} title={modal.user ? 'Edit user' : 'Add user'} wide>
        <UserForm user={modal.user} isSelf={modal.user?.id === me?.id} onClose={() => setModal((m) => ({ ...m, open: false }))} />
      </Modal>

      <Modal open={del.open} onClose={() => setDel((d) => ({ ...d, open: false }))} title="Delete user?">
        <p className="text-mut">
          <span className="text-tx font-medium">{del.user?.name}</span> will lose access permanently. Accounts with exam attempts
          may be kept for records — you can <strong className="text-tx">disable</strong> them instead.
        </p>
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn btn-ghost" onClick={() => setDel((d) => ({ ...d, open: false }))}>Cancel</button>
          <button className="btn btn-danger" disabled={delM.isPending} onClick={() => delM.mutate(del.user.id)}>
            {delM.isPending && <Spinner />} Delete
          </button>
        </div>
      </Modal>
    </>
  )
}

/* ---------------- create / edit form ---------------- */
const Field = ({ id, label, error, hint, children }) => (
  <div className="mb-3">
    <label htmlFor={id} className="block text-sm mb-1.5 text-tx/80">{label}</label>
    {children}
    <p id={`${id}-e`} className={cx('mt-1 text-xs min-h-4', error ? 'text-err' : 'text-mut')}>{error || hint}</p>
  </div>
)

function UserForm({ user, isSelf, onClose }) {
  const edit = !!user
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef(null)
  const [v, setV] = useState({
    name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'candidate',
    roll_number: user?.roll_number ?? '', phone: user?.phone ?? '', password: '',
  })
  const [pic, setPic] = useState(null)
  const [removePic, setRemovePic] = useState(false)
  const [err, setErr] = useState({})
  const [busy, setBusy] = useState(false)
  const preview = useMemo(() => (pic ? URL.createObjectURL(pic) : null), [pic])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const p = (id) => ({
    id, value: v[id], 'aria-invalid': err[id] ? 'true' : undefined, 'aria-describedby': `${id}-e`,
    onChange: (e) => setV({ ...v, [id]: e.target.value }),
  })

  const onFile = (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return setErr((x) => ({ ...x, picture: 'Use a PNG, JPG or WebP image.' }))
    if (f.size > 2 * 1024 * 1024) return setErr((x) => ({ ...x, picture: 'Image must be under 2 MB.' }))
    setErr((x) => ({ ...x, picture: '' })); setPic(f); setRemovePic(false)
  }

  const validate = () => {
    const e = {}
    if (v.name.trim().length < 2) e.name = 'Enter the full name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) e.email = 'Enter a valid email address.'
    if (v.role === 'candidate' && !/^[A-Za-z0-9\-/]{3,20}$/.test(v.roll_number.trim())) e.roll_number = 'Use 3–20 letters, digits, - or /.'
    if (v.phone && !/^[0-9+\-\s]{7,15}$/.test(v.phone.trim())) e.phone = 'Enter a valid phone number.'
    if ((!edit || v.password) && v.password.length < 8) e.password = 'Use at least 8 characters.'
    return e
  }

  const submit = async (ev) => {
    ev.preventDefault()
    const e = validate()
    setErr(e)
    if (Object.keys(e).length) return setTimeout(() => document.querySelector('[role=dialog] [aria-invalid=true]')?.focus(), 0)
    setBusy(true)
    try {
      await saveUser(user?.id, {
        ...v, name: v.name.trim(), email: v.email.trim(), phone: v.phone.trim(),
        roll_number: v.role === 'candidate' ? v.roll_number.trim() : '', picture: pic, remove_picture: removePic,
      })
      await qc.invalidateQueries({ queryKey: ['users'] })
      toast(edit ? 'User updated' : 'User created')
      onClose()
    } catch (x) {
      if (x.response?.status === 409) setErr({ email: 'This email is already in use.' })
      else toast(errMsg(x), 'err')
    } finally { setBusy(false) }
  }

  const shownPic = preview ?? (removePic ? null : user?.picture_url)
  const showRoll = v.role === 'candidate'

  return (
    <form onSubmit={submit} noValidate>
      <div className="flex items-center gap-4 mb-5">
        <Avatar user={{ name: v.name || '?', picture_url: shownPic }} size={72} />
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={onFile} aria-label="Profile picture" />
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost h-9 px-3 text-sm" onClick={() => fileRef.current.click()}>{shownPic ? 'Change' : 'Upload picture'}</button>
            {shownPic && <button type="button" className="btn btn-ghost h-9 px-3 text-sm" onClick={() => { setPic(null); setRemovePic(true) }}>Remove</button>}
          </div>
          <p className={cx('mt-1.5 text-xs', err.picture ? 'text-err' : 'text-mut')} role={err.picture ? 'alert' : undefined}>{err.picture || 'PNG, JPG or WebP, up to 2 MB. Initials show if empty.'}</p>
        </div>
      </div>

      <Field id="name" label="Full name" error={err.name}><input {...p('name')} autoComplete="off" className="field" /></Field>
      <Field id="email" label="Email" error={err.email}><input {...p('email')} type="email" autoComplete="off" className="field" /></Field>

      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field id="role" label="Role" error={err.role} hint={isSelf ? 'You can’t change your own role.' : ''}>
          <select {...p('role')} disabled={isSelf} className="field">{ROLE_SELECT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field id="phone" label="Phone (optional)" error={err.phone}><input {...p('phone')} type="tel" autoComplete="off" className="field" /></Field>
      </div>

      {/* roll number slides open only for students */}
      <div className={cx('grid transition-all duration-300 ease-out', showRoll ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')} aria-hidden={!showRoll}>
        <div className="overflow-hidden">
          <Field id="roll_number" label="Roll number" error={err.roll_number}>
            <input {...p('roll_number')} tabIndex={showRoll ? 0 : -1} autoComplete="off" className="field" />
          </Field>
        </div>
      </div>

      <Field id="password" label={edit ? 'New password' : 'Password'} error={err.password} hint={edit ? 'Leave blank to keep the current password.' : 'At least 8 characters.'}>
        <input {...p('password')} type="password" autoComplete="new-password" className="field" />
      </Field>

      <div className="flex justify-end gap-3 mt-4">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-acc" disabled={busy}>{busy && <Spinner />}{edit ? 'Save changes' : 'Create user'}</button>
      </div>
    </form>
  )
}
