import { useEffect, useState } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import PageHeader from '../../components/admin/PageHeader'
import Modal from '../../components/admin/Modal'
import EmptyState from '../../components/admin/EmptyState'

const emptyItem = { name: '', description: '', price: '', category_id: '', photo_url: '', is_available: true, sort_order: 0 }
const emptyCat = { name: '', sort_order: 0 }

export default function Menu() {
  const { activeBranch, activeBranchId } = useBranch()
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const [itemModal, setItemModal] = useState(false)
  const [itemEditing, setItemEditing] = useState(null)
  const [itemForm, setItemForm] = useState(emptyItem)

  const [catModal, setCatModal] = useState(false)
  const [catEditing, setCatEditing] = useState(null)
  const [catForm, setCatForm] = useState(emptyCat)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!activeBranchId) return
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('categories').select('*').eq('branch_id', activeBranchId).order('sort_order'),
      supabase.from('menu_items').select('*').eq('branch_id', activeBranchId).order('sort_order')
    ]).then(([catRes, itemRes]) => {
      if (!active) return
      if (!catRes.error) setCategories(catRes.data || [])
      if (!itemRes.error) setItems(itemRes.data || [])
      setLoading(false)
    })
    return () => { active = false }
  }, [activeBranchId])

  if (!activeBranch) {
    return <p className="text-stone-500">Select a branch to manage its menu.</p>
  }

  const openCreateItem = (catId) => {
    setItemEditing(null)
    setItemForm({ ...emptyItem, category_id: catId || (categories[0]?.id ?? '') })
    setItemModal(true)
  }
  const openEditItem = (item) => { setItemEditing(item); setItemForm({ ...item, price: String(item.price) }); setItemModal(true) }

  const openCreateCat = () => { setCatEditing(null); setCatForm({ ...emptyCat, sort_order: categories.length }); setCatModal(true) }
  const openEditCat = (c) => { setCatEditing(c); setCatForm({ ...c }); setCatModal(true) }

  const submitItem = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = { ...itemForm, branch_id: activeBranchId, price: Number(itemForm.price) }
    const { error } = itemEditing
      ? await supabase.from('menu_items').update(payload).eq('id', itemEditing.id)
      : await supabase.from('menu_items').insert([payload])
    setSaving(false)
    if (error) { setError(error.message); return }
    setItemModal(false)
    const res = await supabase.from('menu_items').select('*').eq('branch_id', activeBranchId).order('sort_order')
    if (!res.error) setItems(res.data || [])
  }

  const submitCat = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = { ...catForm, branch_id: activeBranchId, sort_order: Number(catForm.sort_order || 0) }
    const { error } = catEditing
      ? await supabase.from('categories').update(payload).eq('id', catEditing.id)
      : await supabase.from('categories').insert([payload])
    setSaving(false)
    if (error) { setError(error.message); return }
    setCatModal(false)
    const res = await supabase.from('categories').select('*').eq('branch_id', activeBranchId).order('sort_order')
    if (!res.error) setCategories(res.data || [])
  }

  const toggleAvailability = async (item) => {
    await supabase.from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
    setItems(items.map((i) => i.id === item.id ? { ...i, is_available: !item.is_available } : i))
  }

  const deleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return
    await supabase.from('menu_items').delete().eq('id', item.id)
    setItems(items.filter((i) => i.id !== item.id))
  }

  const deleteCat = async (c) => {
    const count = items.filter((i) => i.category_id === c.id).length
    if (count > 0 && !window.confirm(`Category "${c.name}" still has ${count} item(s). Deleting it will unlink them. Continue?`)) return
    await supabase.from('categories').delete().eq('id', c.id)
    setCategories(categories.filter((x) => x.id !== c.id))
  }

  return (
    <div>
      <PageHeader
        title="Menu Management"
        subtitle={activeBranch ? `Menu for ${activeBranch.name}` : 'Select a branch'}
        actions={
          <>
            <button onClick={openCreateCat} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">+ Category</button>
            <button onClick={() => openCreateItem(null)} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">+ Menu item</button>
          </>
        }
      />

      {loading ? (
        <p className="text-stone-500">Loading menu…</p>
      ) : categories.length === 0 ? (
        <EmptyState message="No categories yet." hint="Create a category, then add menu items to it.">
          <div className="mt-4"><button onClick={openCreateCat} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm">+ New category</button></div>
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-stone-50 border-b border-stone-200">
                <h2 className="font-semibold text-stone-900">{cat.name}</h2>
                <div className="flex items-center gap-3">
                  <button onClick={() => openCreateItem(cat.id)} className="text-sm font-medium text-brand-600 hover:text-brand-700">+ Add item</button>
                  <button onClick={() => openEditCat(cat)} className="text-sm font-medium text-stone-500 hover:text-stone-700">Edit</button>
                  <button onClick={() => deleteCat(cat)} className="text-sm font-medium text-red-500 hover:text-red-700">Delete</button>
                </div>
              </div>
              {items.filter((i) => i.category_id === cat.id).length === 0 ? (
                <p className="px-5 py-4 text-sm text-stone-400 italic">No items yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-stone-500 border-b border-stone-100">
                      <th className="px-5 py-2 font-medium">Item</th>
                      <th className="px-5 py-2 font-medium">Price</th>
                      <th className="px-5 py-2 font-medium">Availability</th>
                      <th className="px-5 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.filter((i) => i.category_id === cat.id).map((item) => (
                      <tr key={item.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                        <td className="px-5 py-3">
                          <div className="font-medium text-stone-800">{item.name}</div>
                          {item.description && <div className="text-xs text-stone-500 max-w-md truncate">{item.description}</div>}
                        </td>
                        <td className="px-5 py-3 text-stone-700">${Number(item.price).toFixed(2)}</td>
                        <td className="px-5 py-3">
                          <button
                            onClick={() => toggleAvailability(item)}
                            className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${item.is_available ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-500'}`}
                          >
                            {item.is_available ? 'Available' : 'Sold out'}
                          </button>
                        </td>
                        <td className="px-5 py-3 text-right space-x-3">
                          <button onClick={() => openEditItem(item)} className="text-brand-600 hover:text-brand-700">Edit</button>
                          <button onClick={() => deleteItem(item)} className="text-red-500 hover:text-red-700">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Item modal */}
      <Modal open={itemModal} onClose={() => setItemModal(false)} title={itemEditing ? 'Edit menu item' : 'New menu item'}>
        <form onSubmit={submitItem} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Name *</label>
              <input value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} required className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Price ($) *</label>
              <input type="number" step="0.01" min="0" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} required className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Category</label>
            <select value={itemForm.category_id} onChange={(e) => setItemForm({ ...itemForm, category_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
            <textarea value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Photo URL</label>
            <input value={itemForm.photo_url} onChange={(e) => setItemForm({ ...itemForm, photo_url: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="https://…" />
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={itemForm.is_available} onChange={(e) => setItemForm({ ...itemForm, is_available: e.target.checked })} className="rounded" />
            Available
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setItemModal(false)} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Category modal */}
      <Modal open={catModal} onClose={() => setCatModal(false)} title={catEditing ? 'Edit category' : 'New category'}>
        <form onSubmit={submitCat} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Name *</label>
            <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Sort order</label>
            <input type="number" value={catForm.sort_order} onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setCatModal(false)} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
