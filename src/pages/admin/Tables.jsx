import { useEffect, useState } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import PageHeader from '../../components/admin/PageHeader'
import Modal from '../../components/admin/Modal'
import EmptyState from '../../components/admin/EmptyState'

const STATUS_COLORS = {
  available: 'bg-emerald-100 text-emerald-700',
  occupied: 'bg-red-100 text-red-700',
  reserved: 'bg-amber-100 text-amber-700',
  cleaning: 'bg-sky-100 text-sky-700'
}

const emptyTable = { number: '', capacity: 4, status: 'available' }

export default function Tables() {
  const { activeBranch, activeBranchId } = useBranch()
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyTable)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!activeBranchId) return
    let active = true
    setLoading(true)
    supabase.from('tables').select('*').eq('branch_id', activeBranchId).order('number')
      .then(({ data, error }) => {
        if (!active) return
        if (!error) setTables(data || [])
        setLoading(false)
      })
    return () => { active = false }
  }, [activeBranchId])

  // Live status via Realtime
  useEffect(() => {
    if (!activeBranchId) return
    const channel = supabase
      .channel('tables-realtime-' + activeBranchId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `branch_id=eq.${activeBranchId}` }, (payload) => {
        setTables((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((t) => t.id !== payload.old.id)
          if (payload.eventType === 'INSERT') return [...prev.filter((t) => t.id !== payload.new.id), payload.new].sort((a, b) => a.number.localeCompare(b.number))
          return prev.map((t) => t.id === payload.new.id ? payload.new : t)
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeBranchId])

  if (!activeBranch) return <p className="text-stone-500">Select a branch to manage its tables.</p>

  const openCreate = () => { setEditing(null); setForm(emptyTable); setModalOpen(true) }
  const openEdit = (t) => { setEditing(t); setForm({ ...t }); setModalOpen(true) }

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = { ...form, branch_id: activeBranchId, capacity: Number(form.capacity) }
    const { error } = editing
      ? await supabase.from('tables').update(payload).eq('id', editing.id)
      : await supabase.from('tables').insert([payload])
    setSaving(false)
    if (error) { setError(error.message); return }
    setModalOpen(false)
    const res = await supabase.from('tables').select('*').eq('branch_id', activeBranchId).order('number')
    if (!res.error) setTables(res.data || [])
  }

  const setStatus = async (t, status) => {
    await supabase.from('tables').update({ status }).eq('id', t.id)
  }

  const deleteTable = async (t) => {
    if (!window.confirm(`Delete table ${t.number}?`)) return
    await supabase.from('tables').delete().eq('id', t.id)
    setTables(tables.filter((x) => x.id !== t.id))
  }

  const counts = tables.reduce((acc, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1
    return acc
  }, {})

  return (
    <div>
      <PageHeader
        title="Table Management"
        subtitle={activeBranch ? `Tables at ${activeBranch.name}` : 'Select a branch'}
        actions={
          <button onClick={openCreate} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">+ New table</button>
        }
      />

      {loading ? <p className="text-stone-500">Loading tables…</p> : tables.length === 0 ? (
        <EmptyState message="No tables yet." hint="Add tables so customers can reserve and be seated." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-6 text-sm">
            {Object.entries(STATUS_COLORS).map(([status, cls]) => (
              <span key={status} className={`px-3 py-1 rounded-full font-medium capitalize ${cls}`}>{status}: {counts[status] || 0}</span>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
            {tables.map((t) => (
              <div key={t.id} className={`bg-white rounded-xl border p-4 ${t.status === 'occupied' ? 'border-red-300' : t.status === 'reserved' ? 'border-amber-300' : 'border-stone-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-stone-900">{t.number}</span>
                  <button
                    onClick={() => setStatus(t, t.status === 'available' ? 'occupied' : 'available')}
                    className={`text-xs font-medium rounded-full px-2.5 py-0.5 capitalize ${STATUS_COLORS[t.status]}`}
                  >
                    {t.status}
                  </button>
                </div>
                <p className="text-xs text-stone-500 mb-1">Capacity: {t.capacity}</p>
                <div className="flex items-center justify-between text-xs">
                  <button onClick={() => openEdit(t)} className="text-brand-600 hover:text-brand-700">Edit</button>
                  <button onClick={() => deleteTable(t)} className="text-red-500 hover:text-red-700">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit table' : 'New table'}>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Number *</label>
              <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required placeholder="T4" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Capacity *</label>
              <input type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white">
              {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
          </div>
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
