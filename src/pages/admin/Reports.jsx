import { useEffect, useState, useMemo } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import PageHeader from '../../components/admin/PageHeader'

export default function Reports() {
  const { branches, activeBranchId, setActiveBranchId, canSwitchBranches } = useBranch()
  const { formatMoney } = useCurrency()
  const [period, setPeriod] = useState('week')
  const [orders, setOrders] = useState([])
  const [itemsByOrder, setItemsByOrder] = useState({})
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('branch') // branch | consolidated

  const branchId = mode === 'consolidated' ? null : activeBranchId

  useEffect(() => {
    let active = true
    setLoading(true)

    const since = new Date()
    if (period === 'day') since.setDate(since.getDate() - 1)
    else if (period === 'week') since.setDate(since.getDate() - 7)
    else if (period === 'month') since.setMonth(since.getMonth() - 1)
    else since.setFullYear(since.getFullYear() - 1)

    const query = supabase
      .from('orders')
      .select('*')
      .gte('created_at', since.toISOString())
      .in('status', ['paid', 'served'])

    const q = branchId ? query.eq('branch_id', branchId) : query
    q.then(async ({ data, error }) => {
      if (!active) return
      if (error) { console.error(error.message); setLoading(false); return }
      setOrders(data || [])
      const ids = (data || []).map((o) => o.id)
      if (ids.length) {
        const { data: items } = await supabase.from('order_items').select('*').in('order_id', ids)
        if (!items) { setLoading(false); return }
        const map = {}
        items.forEach((it) => {
          map[it.order_id] = map[it.order_id] || []
          map[it.order_id].push(it)
        })
        setItemsByOrder(map)
      } else {
        setItemsByOrder({})
      }

      // Tax/VAT collected in the period, from payments.
      const payQuery = supabase
        .from('payments')
        .select('amount, vat, tax, service_charge, branch_id')
        .gte('paid_at', since.toISOString())
      const { data: pays } = branchId ? await payQuery.eq('branch_id', branchId) : await payQuery
      if (active && !pays?.error) setPayments(pays || [])
      setLoading(false)
    })

    return () => { active = false }
  }, [branchId, period])

  const stats = useMemo(() => {
    const paidOrders = orders.filter((o) => o.status === 'paid')
    const revenue = paidOrders.reduce((sum, o) => sum + (itemsByOrder[o.id] || []).reduce((s, it) => s + Number(it.price_at_order) * it.quantity, 0), 0)
    const itemCounts = {}
    Object.values(itemsByOrder).flat().forEach((it) => {
      itemCounts[it.name] = (itemCounts[it.name] || 0) + it.quantity
    })
    const bestSellers = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const ordersPerDay = orders.length
    const taxTotal = payments.reduce((s, p) => s + Number(p.vat || 0) + Number(p.tax || 0), 0)
    const serviceChargeTotal = payments.reduce((s, p) => s + Number(p.service_charge || 0), 0)
    const collectedTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
    return {
      revenue,
      orderCount: orders.length,
      paidCount: paidOrders.length,
      bestSellers,
      ordersPerDay,
      taxTotal,
      serviceChargeTotal,
      collectedTotal
    }
  }, [orders, itemsByOrder, payments])

  return (
    <div>
      <PageHeader
        title="Sales Reports"
        subtitle="Revenue, taxes and best sellers across your branches."
        actions={
          <>
            {canSwitchBranches && (
              <>
                <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-sm bg-white">
                  <option value="branch">This branch</option>
                  <option value="consolidated">All branches</option>
                </select>
                {mode === 'branch' && (
                  <select value={activeBranchId ?? ''} onChange={(e) => setActiveBranchId(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-sm bg-white">
                    {!activeBranchId && <option value="">Select branch</option>}
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
              </>
            )}
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-sm bg-white">
              <option value="day">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="year">Last 12 months</option>
            </select>
          </>
        }
      />

      {mode === 'consolidated' && (
        <p className="text-sm text-stone-500 mb-4">Consolidated across all {branches.length} branch{branches.length === 1 ? '' : 'es'}.</p>
      )}

      {loading ? (
        <p className="text-stone-500">Loading reports…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="text-sm text-stone-500">Revenue</div>
              <div className="text-2xl font-bold text-stone-900 mt-1">{formatMoney(stats.revenue)}</div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="text-sm text-stone-500">Orders</div>
              <div className="text-2xl font-bold text-stone-900 mt-1">{stats.orderCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="text-sm text-stone-500">Paid orders</div>
              <div className="text-2xl font-bold text-stone-900 mt-1">{stats.paidCount}</div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="text-sm text-stone-500">Avg order value</div>
              <div className="text-2xl font-bold text-stone-900 mt-1">{stats.paidCount ? formatMoney(stats.revenue / stats.paidCount) : formatMoney(0)}</div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-4">Tax & charges collected</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-500">VAT + tax</dt>
                  <dd className="font-semibold text-stone-900">{formatMoney(stats.taxTotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-500">Service charge</dt>
                  <dd className="font-semibold text-stone-900">{formatMoney(stats.serviceChargeTotal)}</dd>
                </div>
                <div className="flex justify-between border-t border-stone-100 pt-3">
                  <dt className="font-medium text-stone-700">Total collected</dt>
                  <dd className="font-bold text-stone-900">{formatMoney(stats.collectedTotal)}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-4">Best sellers</h2>
              {stats.bestSellers.length === 0 ? (
                <p className="text-stone-500 text-sm">No items sold in this period.</p>
              ) : (
                <ol className="space-y-3">
                  {stats.bestSellers.map(([name, qty], i) => (
                    <li key={name} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="flex-1 text-sm text-stone-800">{name}</span>
                      <span className="text-sm font-medium text-stone-600">{qty} sold</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
