import { useEffect, useState, useCallback } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, ROLES, canManageStaff } from '../../lib/roles'
import PageHeader from '../../components/admin/PageHeader'
import Modal from '../../components/admin/Modal'
import EmptyState from '../../components/admin/EmptyState'
import { logActivity } from '../../lib/activity'

const emptyForm = { name: '', email: '', role: 'waiter', branch_id: '', password: '', phone: '', address: '' }

export default function Staff() {
  const { staff: me } = useAuth()
  const { branches } = useBranch()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [resetPw, setResetPw] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetMsg, setResetMsg] = useState(null)

  const isManager = me?.role === ROLES.MANAGER
  const isFullManager = me?.role === ROLES.OWNER || me?.role === ROLES.ADMIN
  const canEditRole = me?.role === ROLES.OWNER || me?.role === ROLES.ADMIN
  // Managers can only assign roles below manager; owners/admins can assign any.
  const roleOptions = Object.entries(ROLE_LABELS).filter(([value]) =>
    canEditRole ? true : value !== ROLES.OWNER && value !== ROLES.ADMIN
  )

  const load = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('staff').select('*').order('name')
    if (isManager) query = query.eq('branch_id', me?.branch_id)
    const { data, error } = await query
    if (!error) setStaff(data || [])
    setLoading(false)
  }, [isManager, me?.branch_id])

  useEffect(() => { load() }, [load])

  if (!canManageStaff(me?.role)) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
        <p className="text-stone-500">Only owners, admins and managers can manage staff accounts.</p>
      </div>
    )
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, branch_id: isManager ? (me?.branch_id || '') : (branches[0]?.id || '') })
    setModalOpen(true)
  }
  const openEdit = (s) => {
    setEditing(s)
    setForm({ name: s.name, email: s.email, role: s.role, branch_id: s.branch_id || '', password: '', phone: s.phone || '', address: s.address || '' })
    setModalOpen(true)
  }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (editing) {
      const payload = {
        name: form.name,
        role: form.role,
        branch_id: isManager ? editing.branch_id : (form.branch_id || null),
        phone: form.phone?.trim() || null,
        address: form.address?.trim() || null
      }
      const { error } = await supabase.from('staff').update(payload).eq('id', editing.id)
      if (error) { setError(error.message); setSaving(false); return }
      setSaving(false)
      setModalOpen(false)
      logActivity({ module: 'staff', action: 'update', description: `Updated staff ${form.name}`, branchId: editing.branch_id })
      load()
      return
    }

    // New staff: create auth user + staff row.
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password
    })
    if (authError || !authData?.user) {
      setError(authError?.message || 'Failed to create account')
      setSaving(false)
      return
    }
    const { error } = await supabase.from('staff').insert([{
      user_id: authData.user.id,
      name: form.name,
      email: form.email,
      role: form.role,
      branch_id: isManager ? (me?.branch_id || null) : (form.branch_id || null),
      phone: form.phone?.trim() || null,
      address: form.address?.trim() || null,
      active: true
    }])
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    setModalOpen(false)
    logActivity({
      module: 'staff',
      action: 'create',
      description: `Created staff ${form.name} (${form.role})`,
      branchId: isManager ? (me?.branch_id || null) : (form.branch_id || null)
    })
    load()
  }

  const toggleActive = async (s) => {
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id)
    logActivity({
      module: 'staff',
      action: s.active ? 'deactivate' : 'activate',
      description: `${s.active ? 'Deactivated' : 'Activated'} staff ${s.name}`,
      branchId: s.branch_id
    })
    load()
  }

  const openReset = (s) => { setResetTarget(s); setResetPw(''); setResetMsg(null); setError(null) }

  const doReset = async (e) => {
    e.preventDefault()
    if (!resetTarget) return
    if (resetPw.length < 6) { setError('Password must be at least 6 characters.'); return }
    setResetting(true)
    setError(null)
    const { data, error } = await supabase.rpc('admin_reset_password', {
      target_user_id: resetTarget.user_id,
      new_password: resetPw
    })
    setResetting(false)
    if (error) { setError(error.message); return }
    if (data === false) { setError('Password reset failed.'); return }
    setResetMsg('Password updated.')
    logActivity({
      module: 'staff',
      action: 'reset_password',
      description: `Reset password for ${resetTarget.name}`,
      branchId: resetTarget.branch_id
    })
    setTimeout(() => { setResetTarget(null); setResetMsg(null) }, 1200)
  }

  const roleColors = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-indigo-100 text-indigo-700',
    manager: 'bg-sky-100 text-sky-700',
    waiter: 'bg-brand-100 text-brand-700',
    kitchen: 'bg-amber-100 text-amber-700'
  }

  const canActOn = (s) => {
    if (isFullManager) return true
    // Managers: same branch only, never owner/admin accounts, and never
    // themselves (a manager must not deactivate their own account).
    return s.branch_id === me?.branch_id && s.role !== ROLES.OWNER && s.role !== ROLES.ADMIN && s.id !== me?.id
  }

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle={isManager ? `Manage staff in your branch (${branches.find((b) => b.id === me?.branch_id)?.name || '—'}).` : 'Create accounts, assign roles and home branches.'}
        actions={
          <button onClick={openCreate} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">+ Add staff</button>
        }
      />

      {loading ? (
        <p className="text-stone-500">Loading staff…</p>
      ) : staff.length === 0 ? (
        <EmptyState message="No staff members yet." hint="Add your first staff account to get started." />
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-stone-500 border-b border-stone-200 bg-stone-50">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Branch</th>
                  <th className="px-5 py-3 font-medium">Phone</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {s.profile_image_url
                          ? <img src={s.profile_image_url} alt={s.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                          : <div className="w-9 h-9 rounded-full bg-stone-100 shrink-0" />}
                        <span className="font-medium text-stone-800">{s.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-stone-600">{s.email}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${roleColors[s.role] || 'bg-stone-100 text-stone-600'}`}>{ROLE_LABELS[s.role] || s.role}</span>
                    </td>
                    <td className="px-5 py-3 text-stone-600">{branches.find((b) => b.id === s.branch_id)?.name || '—'}</td>
                    <td className="px-5 py-3 text-stone-600">{s.phone || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${s.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{s.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {canActOn(s) && (
                        <>
                          <button onClick={() => openEdit(s)} className="text-brand-600 hover:text-brand-700 mr-3">Edit</button>
                          <button onClick={() => toggleActive(s)} className="text-stone-500 hover:text-stone-700 mr-3">{s.active ? 'Deactivate' : 'Activate'}</button>
                          {s.user_id && (
                            <button onClick={() => openReset(s)} className="text-amber-600 hover:text-amber-700">Reset password</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit staff' : 'Add staff'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Name *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={!canEditRole && !!editing} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white disabled:bg-stone-100 disabled:text-stone-500">
                {roleOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              {!canEditRole && <p className="text-xs text-stone-400 mt-1">Managers cannot change roles.</p>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editing} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm disabled:bg-stone-100 disabled:text-stone-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Home branch</label>
            {isManager ? (
              <input value={branches.find((b) => b.id === me?.branch_id)?.name || '—'} disabled className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-stone-100 text-stone-500" />
            ) : (
              <>
                <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white">
                  <option value="">Unassigned</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <p className="text-xs text-stone-400 mt-1">Waiters/kitchen/manager scope is locked to this branch.</p>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
              <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Address</label>
              <input value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" />
            </div>
          </div>
          {!editing && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Temporary password *</label>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="At least 6 characters" />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Reset password modal */}
      {resetTarget && (
        <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset password — ${resetTarget.name}`}>
          <form onSubmit={doReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">New password *</label>
              <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} minLength={6} autoFocus className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" placeholder="At least 6 characters" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {resetMsg && <p className="text-sm text-emerald-600 font-medium">{resetMsg}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setResetTarget(null)} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
              <button type="submit" disabled={resetting} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60">{resetting ? 'Resetting…' : 'Reset password'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
