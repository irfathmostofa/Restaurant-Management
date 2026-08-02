import { useEffect, useState } from 'react'
import supabase from '../../lib/supabase'
import PageHeader from '../../components/admin/PageHeader'
import Modal from '../../components/admin/Modal'
import EmptyState from '../../components/admin/EmptyState'
import ImageUploader from '../../components/admin/ImageUploader'
import { logActivity } from '../../lib/activity'

const emptyForm = { name: '', address: '', contact_info: '', is_active: true, description: '', opening_hours: '', map_link: '', image_url: '' }

export default function Branches() {
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('branches').select('*').order('name')
    if (!error) setBranches(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditing(null); setForm(emptyForm); setModalOpen(true) }
  const openEdit = (b) => { setEditing(b); setForm({ ...b }); setModalOpen(true) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    if (editing) {
      const { error } = await supabase.from('branches').update(form).eq('id', editing.id)
      if (error) { setError(error.message); setSaving(false); return }
      logActivity({ module: 'branches', action: 'update', description: `Updated branch ${form.name}`, branchId: editing.id })
    } else {
      const { error } = await supabase.from('branches').insert([form])
      if (error) { setError(error.message); setSaving(false); return }
      logActivity({ module: 'branches', action: 'create', description: `Created branch ${form.name}` })
    }
    setSaving(false)
    setModalOpen(false)
    load()
  }

  const toggleActive = async (b) => {
    await supabase.from('branches').update({ is_active: !b.is_active }).eq('id', b.id)
    logActivity({ module: 'branches', action: b.is_active ? 'deactivate' : 'activate', description: `${b.is_active ? 'Deactivated' : 'Activated'} branch ${b.name}`, branchId: b.id })
    load()
  }

  return (
    <div>
      <PageHeader
        title="Branch Management"
        subtitle="Each branch owns its own menu, tables, reservations, orders and staff."
        actions={
          <button onClick={openCreate} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors">
            + New branch
          </button>
        }
      />

      {loading ? (
        <p className="text-stone-500">Loading branches…</p>
      ) : branches.length === 0 ? (
        <EmptyState message="No branches yet." hint="Create your first branch to get started." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {branches.map((b) => (
            <div key={b.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              {b.image_url
                ? <img src={b.image_url} alt={b.name} className="w-full h-40 object-cover" />
                : <div className="w-full h-40 bg-stone-100" />}
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-semibold text-stone-900 text-lg">{b.name}</h2>
                  <span className={`shrink-0 text-xs font-medium rounded-full px-2.5 py-0.5 ${b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}>
                    {b.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {b.description && <p className="text-sm text-stone-500 mb-2">{b.description}</p>}
                <p className="text-sm text-stone-500">{b.address || 'No address'}</p>
                <p className="text-sm text-stone-500">{b.contact_info || 'No contact'}</p>
                {b.opening_hours && <p className="text-sm text-stone-500">Hours: {b.opening_hours}</p>}
                {b.map_link && (
                  <a href={b.map_link} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:text-brand-700 inline-block mt-1">View on map</a>
                )}
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-stone-100">
                  <button onClick={() => openEdit(b)} className="text-sm font-medium text-brand-600 hover:text-brand-700">Edit</button>
                  <button onClick={() => toggleActive(b)} className="text-sm font-medium text-stone-500 hover:text-stone-700">
                    {b.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit branch' : 'New branch'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <ImageUploader
              label="Branch image"
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
              bucket="branch-images"
              folder="branches"
              maxDimension={1024}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
            <textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Shown on the public website." className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Address</label>
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Contact info</label>
            <input value={form.contact_info} onChange={(e) => setForm({ ...form, contact_info: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Opening hours</label>
            <input value={form.opening_hours || ''} onChange={(e) => setForm({ ...form, opening_hours: e.target.value })} placeholder="Mon-Sun: 11:00 AM - 11:00 PM" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Map link</label>
            <input value={form.map_link || ''} onChange={(e) => setForm({ ...form, map_link: e.target.value })} placeholder="https://maps.google.com/?q=…" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded" />
            Active
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
