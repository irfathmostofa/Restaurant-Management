import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import supabase from '../../lib/supabase'
import PageHeader from '../../components/admin/PageHeader'

export default function Dashboard() {
  const { staff } = useAuth()
  const { branches, activeBranch, activeBranchId, setActiveBranchId, canSwitchBranches } = useBranch()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!activeBranchId) {
      setStats(null)
      return
    }
    let active = true
    const load = async () => {
      const [ordersRes, tablesRes, resRes, itemsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('branch_id', activeBranchId).not('status', 'in', '("paid","cancelled")'),
        supabase.from('tables').select('*').eq('branch_id', activeBranchId),
        supabase.from('reservations').select('*').eq('branch_id', activeBranchId).eq('date', new Date().toISOString().slice(0, 10)),
        supabase.from('menu_items').select('*').eq('branch_id', activeBranchId).eq('is_available', true)
      ])
      if (!active) return
      setStats({
        activeOrders: ordersRes.data?.length || 0,
        tables: tablesRes.data?.length || 0,
        occupiedTables: (tablesRes.data || []).filter((t) => t.status === 'occupied').length,
        todayReservations: resRes.data?.length || 0,
        availableItems: itemsRes.data?.length || 0
      })
    }
    load()
    return () => { active = false }
  }, [activeBranchId])

  const statCards = stats ? [
    { label: 'Active orders', value: stats.activeOrders, to: '/admin/orders' },
    { label: 'Tables', value: stats.tables, to: '/admin/tables' },
    { label: 'Occupied tables', value: stats.occupiedTables, to: '/admin/tables' },
    { label: "Today's reservations", value: stats.todayReservations, to: '/admin/reservations' },
    { label: 'Available menu items', value: stats.availableItems, to: '/admin/menu' }
  ] : []

  return (
    <div>
      <PageHeader
        title={`Welcome, ${staff?.name?.split(' ')[0] || 'there'}`}
        subtitle={
          canSwitchBranches
            ? `You oversee ${branches.length} branch${branches.length === 1 ? '' : 'es'}.`
            : activeBranch
              ? `You are assigned to ${activeBranch.name}.`
              : 'No branch assigned yet.'
        }
      />

      {canSwitchBranches && (
        <div className="mb-6 flex items-center gap-3">
          <label className="text-sm font-medium text-stone-600">Viewing branch</label>
          <select
            value={activeBranchId ?? ''}
            onChange={(e) => setActiveBranchId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {!activeBranchId && <option value="">Select a branch</option>}
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {!activeBranchId && canSwitchBranches ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <p className="text-stone-500 mb-2">Select a branch to see its dashboard.</p>
          <Link to="/admin/branches" className="text-brand-600 text-sm font-medium hover:underline">Manage branches</Link>
        </div>
      ) : stats ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {statCards.map((s) => (
              <Link key={s.label} to={s.to} className="bg-white rounded-xl border border-stone-200 p-5 hover:border-brand-400 hover:shadow transition-all">
                <div className="text-2xl font-bold text-stone-900">{s.value}</div>
                <div className="text-sm text-stone-500 mt-1">{s.label}</div>
              </Link>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-3">Quick actions</h2>
              <div className="flex flex-wrap gap-3">
                {[
                  { to: '/admin/order-taking', label: 'Take an order' },
                  { to: '/admin/menu', label: 'Edit menu' },
                  { to: '/admin/reservations', label: 'Review reservations' }
                ].map((a) => (
                  <Link key={a.to} to={a.to} className="px-4 py-2 rounded-lg bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100 transition-colors">
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-3">Branch info</h2>
              {activeBranch ? (
                <dl className="space-y-2 text-sm">
                  <div><dt className="text-stone-500 inline">Name: </dt><dd className="inline font-medium">{activeBranch.name}</dd></div>
                  <div><dt className="text-stone-500 inline">Address: </dt><dd className="inline">{activeBranch.address || '—'}</dd></div>
                  <div><dt className="text-stone-500 inline">Contact: </dt><dd className="inline">{activeBranch.contact_info || '—'}</dd></div>
                </dl>
              ) : (
                <p className="text-stone-500 text-sm">No branch selected.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="text-stone-500">Loading…</div>
      )}
    </div>
  )
}
