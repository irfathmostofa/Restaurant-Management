import { useEffect, useState, useCallback } from 'react'
import supabase from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { canViewActivityLogs, ROLE_LABELS } from '../../lib/roles'
import PageHeader from '../../components/admin/PageHeader'
import EmptyState from '../../components/admin/EmptyState'
import { fmtDateTime } from '../../lib/printing'

const PAGE_SIZE = 30

const MODULES = [
  { value: 'auth', label: 'Auth' },
  { value: 'orders', label: 'Orders' },
  { value: 'payments', label: 'Payments' },
  { value: 'invoices', label: 'Invoices' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'menu', label: 'Menu' },
  { value: 'products', label: 'Products' },
  { value: 'branches', label: 'Branches' },
  { value: 'tables', label: 'Tables' },
  { value: 'reservations', label: 'Reservations' },
  { value: 'staff', label: 'Staff' },
  { value: 'settings', label: 'Settings' },
  { value: 'tax', label: 'Tax' },
  { value: 'currency', label: 'Currency' },
  { value: 'profile', label: 'Profile' }
]

export default function ActivityLogs() {
  const { staff: me } = useAuth()
  const { branches } = useBranch()

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [count, setCount] = useState(0)
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({
    search: '',
    module: '',
    action: '',
    userId: '',
    branchId: '',
    from: '',
    to: ''
  })
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('activity_logs')
      .select('staff_id, user_name, role')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        const seen = new Map()
        ;(data || []).forEach((l) => {
          const key = l.staff_id || l.user_name
          if (key && !seen.has(key)) seen.set(key, l)
        })
        setUsers(Array.from(seen.values()))
      })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase
      .from('activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (filters.search) query = query.or(`user_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`)
    if (filters.module) query = query.eq('module', filters.module)
    if (filters.action) query = query.ilike('action', `%${filters.action}%`)
    if (filters.userId) query = query.eq('staff_id', filters.userId)
    if (filters.branchId) query = query.eq('branch_id', filters.branchId)
    if (filters.from) query = query.gte('created_at', `${filters.from}T00:00:00`)
    if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`)

    const { data, count: total, error } = await query
    if (error) {
      setError(error.message)
      setLogs([])
      setCount(0)
    } else {
      setLogs(data || [])
      setCount(total || 0)
      setTotalPages(Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)))
    }
    setLoading(false)
  }, [filters, page])

  useEffect(() => { load() }, [load])

  if (!canViewActivityLogs(me?.role)) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
        <p className="text-stone-500">Only owners and admins can view activity logs.</p>
      </div>
    )
  }

  const applyFilters = (e) => {
    e.preventDefault()
    setPage(0)
  }

  const resetFilters = () => {
    setFilters({ search: '', module: '', action: '', userId: '', branchId: '', from: '', to: '' })
    setPage(0)
  }

  const actionColor = (action) => {
    const a = action?.toLowerCase() || ''
    if (a.includes('delete') || a.includes('cancel') || a.includes('logout')) return 'bg-red-50 text-red-700'
    if (a.includes('create') || a.includes('insert') || a.includes('login') || a.includes('paid')) return 'bg-emerald-50 text-emerald-700'
    if (a.includes('update') || a.includes('change') || a.includes('print')) return 'bg-sky-50 text-sky-700'
    return 'bg-stone-100 text-stone-600'
  }

  return (
    <div>
      <PageHeader title="Activity Logs" subtitle="Audit trail of actions across the system (kept for 7 days)." />

      {/* Filters */}
      <form onSubmit={applyFilters} className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Search user or description</label>
            <input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search…" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Module</label>
            <select value={filters.module} onChange={(e) => setFilters({ ...filters, module: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All modules</option>
              {MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Action</label>
            <input value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })} placeholder="e.g. create, print…" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">User</label>
            <select value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All users</option>
              {users.map((u) => <option key={u.staff_id || u.user_name} value={u.staff_id || ''}>{u.user_name}</option>)}
            </select>
          </div>
          {branches.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-1">Branch</label>
              <select value={filters.branchId} onChange={(e) => setFilters({ ...filters, branchId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">From</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">To</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">Apply</button>
          <button type="button" onClick={resetFilters} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Reset</button>
          <span className="text-sm text-stone-500 ml-auto">{count} entr{count === 1 ? 'y' : 'ies'}</span>
        </div>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-stone-500">Loading logs…</p>
      ) : logs.length === 0 ? (
        <EmptyState message="No activity recorded yet." hint="Actions like orders, payments and staff changes will appear here." />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[820px]">
                <thead>
                  <tr className="text-left text-stone-500 border-b border-stone-200 bg-stone-50">
                    <th className="px-5 py-3 font-medium">Time</th>
                    <th className="px-5 py-3 font-medium">User</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Module</th>
                    <th className="px-5 py-3 font-medium">Action</th>
                    <th className="px-5 py-3 font-medium">Description</th>
                    <th className="px-5 py-3 font-medium">Branch</th>
                    <th className="px-5 py-3 font-medium">IP / Device</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b border-stone-50 hover:bg-stone-50/50 align-top">
                      <td className="px-5 py-3 text-stone-600 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                      <td className="px-5 py-3 font-medium text-stone-800">{l.user_name || '—'}</td>
                      <td className="px-5 py-3 text-stone-600">{l.role ? (ROLE_LABELS[l.role] || l.role) : '—'}</td>
                      <td className="px-5 py-3 text-stone-600">{l.module}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${actionColor(l.action)}`}>{l.action}</span>
                      </td>
                      <td className="px-5 py-3 text-stone-700">{l.description || '—'}</td>
                      <td className="px-5 py-3 text-stone-600">{branches.find((b) => b.id === l.branch_id)?.name || '—'}</td>
                      <td className="px-5 py-3 text-stone-500 text-xs max-w-[180px] truncate">
                        {l.ip_address ? <span className="block">{l.ip_address}</span> : null}
                        {l.device_info ? <span className="block truncate">{l.device_info}</span> : null}
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
    </div>
  )
}
