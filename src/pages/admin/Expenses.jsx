import { useEffect, useState, useCallback } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import { useCurrency } from '../../context/CurrencyContext'
import { canManageExpenses } from '../../lib/roles'
import PageHeader from '../../components/admin/PageHeader'
import EmptyState from '../../components/admin/EmptyState'
import { logActivity } from '../../lib/activity'

const PAGE_SIZE = 20

export default function Expenses() {
  const { branches, activeBranchId } = useBranch()
  const { staff } = useAuth()
  const { formatMoney } = useCurrency()
  const isManager = canManageExpenses(staff?.role)

  const [categories, setCategories] = useState([])
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [filters, setFilters] = useState({
    branchId: '',
    categoryId: '',
    userId: '',
    from: '',
    to: '',
    search: ''
  })
  const [totalPages, setTotalPages] = useState(1)
  const [count, setCount] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({
    branch_id: '',
    category_id: '',
    title: '',
    description: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10)
  })
  const [attachment, setAttachment] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState({ total: 0, thisMonth: 0, today: 0, byCategory: [] })
  const [staffList, setStaffList] = useState([])

  const effectiveBranchId = canManageExpenses(staff?.role) ? (filters.branchId || null) : activeBranchId

  const loadLookups = useCallback(async () => {
    const [catRes, staffRes] = await Promise.all([
      supabase.from('expense_categories').select('*').order('name'),
      supabase.from('staff').select('id, name').order('name')
    ])
    if (!catRes.error) setCategories(catRes.data || [])
    if (!staffRes.error) setStaffList(staffRes.data || [])
  }, [])

  useEffect(() => { loadLookups() }, [loadLookups])

  const loadExpenses = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase
      .from('expenses')
      .select('*, category:expense_categories(name), creator:staff(name)', { count: 'exact' })
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (effectiveBranchId) query = query.eq('branch_id', effectiveBranchId)
    if (filters.categoryId) query = query.eq('category_id', filters.categoryId)
    if (filters.userId) query = query.eq('created_by', filters.userId)
    if (filters.from) query = query.gte('expense_date', filters.from)
    if (filters.to) query = query.lte('expense_date', filters.to)
    if (filters.search) query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)

    const { data, count: total, error } = await query
    if (error) {
      setError(error.message)
      setExpenses([])
      setCount(0)
    } else {
      setExpenses(data || [])
      setCount(total || 0)
      setTotalPages(Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)))
    }
    setLoading(false)
  }, [effectiveBranchId, filters, page])

  useEffect(() => { loadExpenses() }, [loadExpenses])

  const loadSummary = useCallback(async () => {
    const today = new Date()
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10)
    const todayStr = today.toISOString().slice(0, 10)

    let base = supabase.from('expenses').select('amount')
    let monthQuery = supabase.from('expenses').select('amount').gte('expense_date', monthStart).lt('expense_date', nextMonthStart)
    let todayQuery = supabase.from('expenses').select('amount').eq('expense_date', todayStr)
    let catQuery = supabase.from('expenses').select('category:expense_categories(name), amount')
    if (effectiveBranchId) {
      base = base.eq('branch_id', effectiveBranchId)
      monthQuery = monthQuery.eq('branch_id', effectiveBranchId)
      todayQuery = todayQuery.eq('branch_id', effectiveBranchId)
      catQuery = catQuery.eq('branch_id', effectiveBranchId)
    }

    const [allRes, monthRes, todayRes, catRes] = await Promise.all([base, monthQuery, todayQuery, catQuery])

    const sum = (rows) => (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0)
    const byCategory = {}
    ;(catRes.data || []).forEach((r) => {
      const key = r.category?.name || 'Uncategorized'
      byCategory[key] = (byCategory[key] || 0) + Number(r.amount || 0)
    })
    setSummary({
      total: sum(allRes.data),
      thisMonth: sum(monthRes.data),
      today: sum(todayRes.data),
      byCategory: Object.entries(byCategory).sort((a, b) => b[1] - a[1])
    })
  }, [effectiveBranchId])

  useEffect(() => { loadSummary() }, [loadSummary])

  const applyFilters = (e) => {
    e.preventDefault()
    setPage(0)
  }

  const resetFilters = () => {
    setFilters({ branchId: '', categoryId: '', userId: '', from: '', to: '', search: '' })
    setPage(0)
  }

  const openNew = () => {
    setEditing(null)
    setForm({
      branch_id: staff?.role === 'owner' || staff?.role === 'admin' ? (activeBranchId || '') : activeBranchId,
      category_id: categories[0]?.id || '',
      title: '',
      description: '',
      amount: '',
      expense_date: new Date().toISOString().slice(0, 10)
    })
    setAttachment(null)
    setError(null)
    setShowForm(true)
  }

  const openEdit = (exp) => {
    setEditing(exp)
    setForm({
      branch_id: exp.branch_id,
      category_id: exp.category_id || '',
      title: exp.title,
      description: exp.description || '',
      amount: String(exp.amount),
      expense_date: exp.expense_date
    })
    setAttachment(null)
    setError(null)
    setShowForm(true)
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('Attachment must be under 10 MB.')
      e.target.value = ''
      return
    }
    setAttachment(file)
  }

  const uploadAttachment = async (path) => {
    if (!attachment) return null
    const { error } = await supabase.storage
      .from('expense-attachments')
      .upload(path, attachment, { upsert: true, cacheControl: '3600' })
    if (error) throw new Error(error.message)
    return supabase.storage.from('expense-attachments').getPublicUrl(path).data.publicUrl
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.branch_id) { setError('Please choose a branch.'); return }
    if (!form.title.trim()) { setError('Please enter a title.'); return }
    if (!form.amount || Number(form.amount) < 0) { setError('Please enter a valid amount.'); return }
    setSaving(true)
    setError(null)
    try {
      let attachmentUrl = editing?.attachment_url || null
      if (attachment) {
        setUploading(true)
        const ext = attachment.name.split('.').pop()
        const path = `${form.branch_id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        attachmentUrl = await uploadAttachment(path)
      }

      const payload = {
        branch_id: form.branch_id,
        category_id: form.category_id || null,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        amount: Number(form.amount),
        expense_date: form.expense_date,
        attachment_url: attachmentUrl
      }

      if (editing) {
        const { error } = await supabase.from('expenses').update(payload).eq('id', editing.id)
        if (error) throw new Error(error.message)
        logActivity({
          module: 'expenses',
          action: 'update',
          description: `Updated expense "${form.title}" (${formatMoney(payload.amount, { symbol: false })})`,
          branchId: form.branch_id,
          metadata: { expense_id: editing.id }
        })
      } else {
        const { error, data } = await supabase.from('expenses').insert([{ ...payload, created_by: staff?.id || null }]).select('id').single()
        if (error) throw new Error(error.message)
        logActivity({
          module: 'expenses',
          action: 'create',
          description: `Created expense "${form.title}" (${formatMoney(payload.amount, { symbol: false })})`,
          branchId: form.branch_id,
          metadata: { expense_id: data?.id }
        })
      }
      setShowForm(false)
      setPage(0)
      loadExpenses()
      loadSummary()
    } catch (err) {
      setError(err.message || 'Failed to save expense.')
    } finally {
      setSaving(false)
      setUploading(false)
    }
  }

  const remove = async (exp) => {
    if (!window.confirm(`Delete expense "${exp.title}"?`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', exp.id)
    if (error) { setError(error.message); return }
    logActivity({
      module: 'expenses',
      action: 'delete',
      description: `Deleted expense "${exp.title}"`,
      branchId: exp.branch_id,
      metadata: { expense_id: exp.id }
    })
    loadExpenses()
    loadSummary()
  }

  const canEdit = (exp) => isManager || exp.branch_id === activeBranchId

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Record and track branch expenses."
        actions={
          <button onClick={openNew} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">Add expense</button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-sm text-stone-500">Total recorded</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{formatMoney(summary.total)}</p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-sm text-stone-500">This month</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{formatMoney(summary.thisMonth)}</p>
        </div>
        <div className="bg-white rounded-xl border border-stone-200 p-4">
          <p className="text-sm text-stone-500">Today</p>
          <p className="text-2xl font-bold text-stone-900 mt-1">{formatMoney(summary.today)}</p>
        </div>
      </div>

      {/* Category breakdown */}
      {summary.byCategory.length > 0 && (
        <div className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
          <h3 className="font-semibold text-stone-800 mb-3">By category</h3>
          <div className="flex flex-wrap gap-3">
            {summary.byCategory.map(([name, amount]) => (
              <span key={name} className="inline-flex items-center gap-2 rounded-lg bg-stone-50 border border-stone-200 px-3 py-1.5 text-sm">
                <span className="text-stone-600">{name}</span>
                <span className="font-semibold text-stone-900">{formatMoney(amount)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <form onSubmit={applyFilters} className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {isManager && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Branch</label>
              <select value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Category</label>
            <select value={filters.categoryId} onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Created by</label>
            <select value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Anyone</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">From</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">To</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Search</label>
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Title or note…" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">Apply</button>
          <button type="button" onClick={resetFilters} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Reset</button>
          <span className="text-sm text-stone-500 ml-auto">{count} expense{count === 1 ? '' : 's'}</span>
        </div>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-stone-500">Loading expenses…</p>
      ) : expenses.length === 0 ? (
        <EmptyState message="No expenses found." hint="Record rent, utilities, salaries and other costs here." />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-stone-500 border-b border-stone-200 bg-stone-50">
                    <th className="px-5 py-3 font-medium">Expense</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 font-medium">Branch</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Recorded by</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((exp) => (
                    <tr key={exp.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                      <td className="px-5 py-3">
                        <button onClick={() => openEdit(exp)} className="font-medium text-brand-700 hover:text-brand-800">{exp.title}</button>
                        {exp.description && <div className="text-xs text-stone-400 max-w-[220px] truncate">{exp.description}</div>}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-block rounded-full bg-stone-100 text-stone-600 px-2.5 py-0.5 text-xs">{exp.category?.name || 'Uncategorized'}</span>
                      </td>
                      <td className="px-5 py-3 text-stone-600">{branches.find((b) => b.id === exp.branch_id)?.name || '—'}</td>
                      <td className="px-5 py-3 text-stone-600 whitespace-nowrap">{exp.expense_date}</td>
                      <td className="px-5 py-3 text-stone-600">{exp.creator?.name || '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatMoney(exp.amount)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {exp.attachment_url && (
                          <a href={exp.attachment_url} target="_blank" rel="noreferrer" className="text-stone-500 hover:text-stone-700 mr-3">Receipt</a>
                        )}
                        {canEdit(exp) && (
                          <>
                            <button onClick={() => openEdit(exp)} className="text-brand-600 hover:text-brand-700 mr-3">Edit</button>
                            <button onClick={() => remove(exp)} className="text-red-600 hover:text-red-700">Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-stone-500">Page {page + 1} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-stone-900">{editing ? 'Edit expense' : 'Add expense'}</h2>
              <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-600" aria-label="Close">✕</button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4 text-sm">
              {isManager && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Branch</label>
                  <select value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                    <option value="">Select branch…</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Category</label>
                <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">Uncategorized</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Title *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. March rent" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows="2" placeholder="Optional note…" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Amount *</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Date</label>
                  <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Attachment (optional)</label>
                <input type="file" accept="image/*,application/pdf" onChange={handleFile} className="w-full text-sm text-stone-600 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-stone-100 file:text-sm file:font-medium hover:file:bg-stone-200" />
                {(attachment || editing?.attachment_url) && (
                  <p className="text-xs text-stone-500 mt-1">
                    {attachment ? `Selected: ${attachment.name}` : 'Current receipt attached.'}
                  </p>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
                <button type="submit" disabled={saving || uploading} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Add expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
