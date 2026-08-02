import { useState, useEffect } from 'react'
import supabase from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { ROLE_LABELS } from '../../lib/roles'
import PageHeader from '../../components/admin/PageHeader'
import ImageUploader from '../../components/admin/ImageUploader'
import { logActivity } from '../../lib/activity'
import { fmtDateTime } from '../../lib/printing'

export default function Profile() {
  const { staff, refreshStaff } = useAuth()
  const { branches } = useBranch()
  const [form, setForm] = useState({ name: '', phone: '', address: '', email: '' })
  const [photo, setPhoto] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)
  const [pwError, setPwError] = useState(null)

  useEffect(() => {
    if (!staff) return
    setForm({ name: staff.name || '', phone: staff.phone || '', address: staff.address || '', email: staff.email || '' })
    setPhoto(staff.profile_image_url || '')
  }, [staff?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!staff) return <p className="text-stone-500">Loading profile…</p>

  const saveProfile = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    setError(null)
    setSaved(false)
    const payload = {
      name: form.name.trim(),
      phone: form.phone?.trim() || null,
      address: form.address?.trim() || null,
      profile_image_url: photo || null
    }
    const { error: updateError } = await supabase.from('staff').update(payload).eq('id', staff.id)
    if (updateError) { setError(updateError.message); setSaving(false); return }
    await refreshStaff()
    logActivity({ module: 'profile', action: 'update', description: 'Updated own profile', branchId: staff.branch_id })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const changePassword = async (e) => {
    e.preventDefault()
    setPwError(null)
    setPwMsg(null)
    if (pwForm.next.length < 6) { setPwError('New password must be at least 6 characters.'); return }
    if (pwForm.next !== pwForm.confirm) { setPwError('New passwords do not match.'); return }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    setPwSaving(false)
    if (error) { setPwError(error.message); return }
    setPwForm({ current: '', next: '', confirm: '' })
    setPwMsg('Password updated.')
    logActivity({ module: 'profile', action: 'password_change', description: 'Changed own password', branchId: staff.branch_id })
    setTimeout(() => setPwMsg(null), 2500)
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Update your personal information and password." />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Personal info */}
        <form onSubmit={saveProfile} className="lg:col-span-2 bg-white rounded-xl border border-stone-200 p-6 space-y-4">
          <h2 className="font-semibold text-stone-900">Personal information</h2>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Profile photo</label>
            <ImageUploader
              label="Profile photo"
              value={photo}
              onChange={setPhoto}
              bucket="profile-images"
              folder={`staff/${staff.id}`}
              maxDimension={512}
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Full name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Phone</label>
              <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
            <input type="email" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-stone-100 text-stone-500" />
            <p className="text-xs text-stone-400 mt-1">Email is managed by your sign-in account.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Address</label>
            <textarea value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-4">
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {saved && <span className="text-sm text-emerald-600 font-medium">Saved.</span>}
          </div>
        </form>

        {/* Sidebar: role info + password */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-semibold text-stone-900 mb-4">Account</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-stone-500">Role</dt>
                <dd className="font-medium text-stone-800 capitalize">{ROLE_LABELS[staff.role] || staff.role}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Branch</dt>
                <dd className="font-medium text-stone-800">{branches.find((b) => b.id === staff.branch_id)?.name || 'Unassigned'}</dd>
              </div>
              <div>
                <dt className="text-stone-500">Status</dt>
                <dd><span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${staff.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>{staff.active ? 'Active' : 'Inactive'}</span></dd>
              </div>
              <div>
                <dt className="text-stone-500">Last login</dt>
                <dd className="text-stone-800">{staff.last_login_at ? fmtDateTime(staff.last_login_at) : 'Never'}</dd>
              </div>
            </dl>
          </div>

          <form onSubmit={changePassword} className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
            <h2 className="font-semibold text-stone-900">Change password</h2>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">New password</label>
              <input type="password" value={pwForm.next} onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })} minLength={6} autoComplete="new-password" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Confirm password</label>
              <input type="password" value={pwForm.confirm} onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })} minLength={6} autoComplete="new-password" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            {pwError && <p className="text-sm text-red-600">{pwError}</p>}
            {pwMsg && <p className="text-sm text-emerald-600 font-medium">{pwMsg}</p>}
            <button type="submit" disabled={pwSaving} className="w-full px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
              {pwSaving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
