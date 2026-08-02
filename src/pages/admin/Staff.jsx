import { useEffect, useState } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS, canManageStaff } from '../../lib/roles'
import PageHeader from '../../components/admin/PageHeader'
import Modal from '../../components/admin/Modal'
import EmptyState from '../../components/admin/EmptyState'

const emptyForm = { name: '', email: '', role: 'waiter', branch_id: '', password: '' }

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

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('staff').select('*').order('name')
    if (!error) setStaff(data || [])
    setLoading(false)
  }

  if (!canManageStaff(me?.role)) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
        <p className="text-stone-500">Only owners and admins can manage staff accounts.</p>
      </div>
    )
  }

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm, branch_id: branches[0]?.id || '' }); setModalOpen(true) }
  const openEdit = (s) => { setEditing(s); setForm({ name: s.name, email: s.email, role: s.role, branch_id: s.branch_id || '', password: '' }); setModalOpen(true) }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (editing) {
      const payload = { name: form.name, role: form.role, branch_id: form.branch_id || null }
      const { error } = await supabase.from('staff').update(payload).eq('id', editing.id)
      if (error) { setError(error.message); setSaving(false); return }
      setSaving(false)
      setModalOpen(false)
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
      branch_id: form.branch_id || null,
      active: true
    }])
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  const toggleActive = async (s) => {
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id)
    load()
  }

  const roleColors = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-indigo-100 text-indigo-700',
    manager: 'bg-sky-100 text-sky-700',
    waiter: 'bg-brand-100 text-brand-700',
    kitchen: 'bg-amber-100 text-amber-700'
  }

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle="Create accounts, assign roles and home branches."
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
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200 bg-stone-50">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Branch</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                  <td className="px-5 py-3 font-medium text-stone-800">{s.name}</td>
                  <td className="px-5 py-3 text-stone-600">{s.email}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${roleColors[s.role] || 'bg-stone-100 text-stone-600'}`}>{ROLE_LABELS[s.role] || s.role}</span>
                  </td>
                  <td className="px-5 py-3 text-stone-600">{branches.find((b) => b.id === s.branch_id)?.name || '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${s.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{s.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(s)} className="text-brand-600 hover:text-brand-700 mr-3">Edit</button>
                    <button onClick={() => toggleActive(s)} className="text-stone-500 hover:text-stone-700">{s.active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white">
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email *</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required disabled={!!editing} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm disabled:bg-stone-100 disabled:text-stone-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Home branch</label>
            <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white">
              <option value="">Unassigned</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <p className="text-xs text-stone-400 mt-1">Waiters/kitchen/manager scope is locked to this branch.</p>
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
    </div>
  )
}
