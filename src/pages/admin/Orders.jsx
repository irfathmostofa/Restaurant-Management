import { useEffect, useState, useCallback } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/admin/PageHeader'
import EmptyState from '../../components/admin/EmptyState'

const NEXT_STATUS = {
  received: 'preparing',
  preparing: 'ready',
  ready: 'served',
  served: 'paid',
  paid: null,
  cancelled: null
}
const STATUS_STYLE = {
  received: 'bg-amber-100 text-amber-700',
  preparing: 'bg-sky-100 text-sky-700',
  ready: 'bg-emerald-100 text-emerald-700',
  served: 'bg-stone-200 text-stone-600',
  paid: 'bg-stone-100 text-stone-500',
  cancelled: 'bg-red-100 text-red-700'
}

export default function Orders() {
  const { activeBranch, activeBranchId } = useBranch()
  const { staff } = useAuth()
  const isKitchen = staff?.role === 'kitchen'
  const [orders, setOrders] = useState([])
  const [itemsByOrder, setItemsByOrder] = useState({})
  const [loading, setLoading] = useState(true)
  const [showPaid, setShowPaid] = useState(false)

  const loadItems = useCallback(async (orderIds) => {
    if (orderIds.length === 0) return
    const { data, error } = await supabase.from('order_items').select('*').in('order_id', orderIds)
    if (error) return
    setItemsByOrder((prev) => {
      const next = { ...prev }
      data.forEach((it) => {
        next[it.order_id] = next[it.order_id] || []
        next[it.order_id].push(it)
      })
      return next
    })
  }, [])

  useEffect(() => {
    if (!activeBranchId) return
    let active = true
    setLoading(true)
    supabase.from('orders').select('*').eq('branch_id', activeBranchId).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (!error) {
          setOrders(data || [])
          loadItems((data || []).map((o) => o.id))
        }
        setLoading(false)
      })
    return () => { active = false }
  }, [activeBranchId, loadItems])

  // Realtime: order status changes + new orders
  useEffect(() => {
    if (!activeBranchId) return
    const channel = supabase
      .channel('orders-realtime-' + activeBranchId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${activeBranchId}` }, (payload) => {
        setOrders((prev) => {
          if (payload.eventType === 'DELETE') return prev.filter((o) => o.id !== payload.old.id)
          if (payload.eventType === 'INSERT') {
            loadItems([payload.new.id])
            return [payload.new, ...prev]
          }
          return prev.map((o) => o.id === payload.new.id ? payload.new : o)
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeBranchId, loadItems])

  if (!activeBranch) return <p className="text-stone-500">Select a branch to view orders.</p>

  const setStatus = async (order, status) => {
    await supabase.from('orders').update({ status }).eq('id', order.id)
    setOrders(orders.map((o) => o.id === order.id ? { ...o, status } : o))
  }

  const orderTotal = (id) => (itemsByOrder[id] || []).reduce((sum, it) => sum + Number(it.price_at_order) * it.quantity, 0)

  const filtered = isKitchen || !showPaid
    ? orders.filter((o) => (isKitchen ? !['paid', 'cancelled'].includes(o.status) : !['paid', 'cancelled'].includes(o.status)))
    : orders

  return (
    <div>
      <PageHeader
        title={isKitchen ? 'Kitchen Order Queue' : 'Order Monitoring'}
        subtitle={activeBranch ? `Live orders at ${activeBranch.name}` : 'Select a branch'}
        actions={!isKitchen && (
          <button
            onClick={() => setShowPaid(!showPaid)}
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50"
          >
            {showPaid ? 'Hide paid' : 'Show all'}
          </button>
        )}
      />

      {loading ? (
        <p className="text-stone-500">Loading orders…</p>
      ) : filtered.length === 0 ? (
        <EmptyState message="No active orders." hint="New orders appear here in real time." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((o) => (
            <div key={o.id} className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wide text-stone-400">Order</span>
                  <div className="font-semibold text-stone-900">#{o.id.slice(0, 8)}</div>
                </div>
                <span className="text-xs font-medium rounded-full px-2.5 py-1 capitalize bg-stone-100 text-stone-600">{o.type}</span>
              </div>

              <div className="mb-3">
                <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 capitalize ${STATUS_STYLE[o.status] || 'bg-stone-100'}`}>{o.status}</span>
                {o.customer_name && <span className="text-xs text-stone-500 ml-2">for {o.customer_name}</span>}
              </div>

              <ul className="text-sm text-stone-700 space-y-1 mb-4">
                {(itemsByOrder[o.id] || []).map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="text-stone-500">${(Number(it.price_at_order) * it.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                <span className="font-semibold text-stone-900">${orderTotal(o.id).toFixed(2)}</span>
                {NEXT_STATUS[o.status] && (
                  <button
                    onClick={() => setStatus(o, NEXT_STATUS[o.status])}
                    className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                  >
                    {isKitchen && o.status === 'received' ? 'Start preparing' : `Mark ${NEXT_STATUS[o.status]}`}
                  </button>
                )}
                {o.status !== 'cancelled' && o.status !== 'paid' && (
                  <button onClick={() => setStatus(o, 'cancelled')} className="text-xs text-red-500 hover:text-red-700 ml-3">Cancel</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
