import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import PageHeader from '../../components/admin/PageHeader'
import EmptyState from '../../components/admin/EmptyState'

export default function Billing() {
  const { activeBranch, activeBranchId } = useBranch()
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const [itemsByOrder, setItemsByOrder] = useState({})
  const [loading, setLoading] = useState(true)
  const [payingOrder, setPayingOrder] = useState(null)
  const [payMethod, setPayMethod] = useState('cash')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState(null)
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

  useEffect(() => {
    if (!activeBranchId) return
    const channel = supabase
      .channel('billing-realtime-' + activeBranchId)
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

  // Highlight a freshly-created order (from order-taking).
  useEffect(() => {
    const id = location.state?.newOrderId
    if (id && !showPaid) {
      setPayingOrder(id)
      setShowPaid(true)
      window.history.replaceState({}, '')
    }
  }, [location.state, showPaid])

  if (!activeBranch) return <p className="text-stone-500">Select a branch to bill orders.</p>

  const total = (id) => (itemsByOrder[id] || []).reduce((s, it) => s + Number(it.price_at_order) * it.quantity, 0)

  const billable = orders.filter((o) => o.status !== 'paid' && o.status !== 'cancelled')

  const processPayment = async () => {
    if (!payingOrder) return
    setPaying(true)
    setError(null)
    const amount = total(payingOrder)
    const { error: payError } = await supabase.from('payments').insert([{
      order_id: payingOrder,
      amount,
      method: payMethod
    }])
    if (payError) {
      setError(payError.message)
      setPaying(false)
      return
    }
    await supabase.from('orders').update({ status: 'paid' }).eq('id', payingOrder)
    if (orderTable(payingOrder)) {
      await supabase.from('tables').update({ status: 'available' }).eq('id', orderTable(payingOrder))
    }
    setPaying(false)
    setPayingOrder(null)
  }

  const orderTable = (orderId) => orders.find((o) => o.id === orderId)?.table_id || null

  const target = orders.find((o) => o.id === payingOrder)

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle={activeBranch ? `Collect payment at ${activeBranch.name}` : 'Select a branch'}
        actions={
          <button
            onClick={() => setShowPaid(!showPaid)}
            className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50"
          >
            {showPaid ? 'Hide paid' : 'Show paid'}
          </button>
        }
      />

      {loading ? (
        <p className="text-stone-500">Loading…</p>
      ) : billable.length === 0 && !showPaid ? (
        <EmptyState message="No unpaid orders." hint="Orders sent to the kitchen will appear here." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(showPaid ? orders : billable).map((o) => (
            <div key={o.id} className={`bg-white rounded-xl border p-5 ${o.status === 'paid' ? 'border-stone-200 opacity-70' : 'border-stone-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs uppercase tracking-wide text-stone-400">Order</span>
                  <div className="font-semibold text-stone-900">#{o.id.slice(0, 8)}</div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium rounded-full px-2.5 py-0.5 capitalize bg-stone-100 text-stone-600">{o.type}</span>
                  <div className="text-xs text-stone-400 mt-1 capitalize">{o.status}</div>
                </div>
              </div>
              <ul className="text-sm text-stone-700 space-y-1 mb-3">
                {(itemsByOrder[o.id] || []).map((it) => (
                  <li key={it.id} className="flex justify-between gap-2">
                    <span>{it.quantity}× {it.name}</span>
                    <span className="text-stone-500">${(Number(it.price_at_order) * it.quantity).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                <span className="font-semibold text-stone-900">${total(o.id).toFixed(2)}</span>
                {o.status !== 'paid' && (
                  <button onClick={() => setPayingOrder(o.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                    Charge
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment modal */}
      {target && payingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPayingOrder(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Charge order</h2>
            <div className="text-3xl font-bold text-stone-900 mb-4">${total(payingOrder).toFixed(2)}</div>
            <div className="space-y-2 mb-4">
              {['cash', 'card', 'upi', 'qr'].map((m) => (
                <label key={m} className="flex items-center gap-2 p-3 rounded-lg border border-stone-200 cursor-pointer hover:border-brand-400">
                  <input type="radio" name="method" value={m} checked={payMethod === m} onChange={() => setPayMethod(m)} className="accent-brand-600" />
                  <span className="text-sm text-stone-800 capitalize">{m}</span>
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setPayingOrder(null)} className="flex-1 px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
              <button onClick={processPayment} disabled={paying} className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                {paying ? 'Processing…' : 'Confirm payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
