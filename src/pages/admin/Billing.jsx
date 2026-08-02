import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import PageHeader from '../../components/admin/PageHeader'
import EmptyState from '../../components/admin/EmptyState'
import { fetchSettings, DEFAULT_SETTINGS } from '../../lib/config'
import { buildInvoiceHtml, openPrintWindow, printHtml, fmtMoney } from '../../lib/printing'
import { hasKitchenItems, orderKitchenEta } from '../../lib/kitchen'
import useOrderReadyNotifications from '../../hooks/useOrderReadyNotifications'

const groupBy = (arr, key) => (arr || []).reduce((acc, item) => {
  ;(acc[item[key]] = acc[item[key]] || []).push(item)
  return acc
}, {})

const makeInvoiceNo = () => {
  const d = new Date()
  const pad = (x) => String(x).padStart(2, '0')
  return `INV-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
}

export default function Billing() {
  const { activeBranch, activeBranchId } = useBranch()
  const { staff } = useAuth()
  const location = useLocation()
  const [orders, setOrders] = useState([])
  const [itemsByOrder, setItemsByOrder] = useState({})
  const [tables, setTables] = useState([])
  const [paymentMethods, setPaymentMethods] = useState([])
  const [paymentsByOrder, setPaymentsByOrder] = useState({})
  const [staffMap, setStaffMap] = useState({})
  const [loading, setLoading] = useState(true)
  const [payingOrder, setPayingOrder] = useState(null)
  const [payMethodId, setPayMethodId] = useState(null)
  const [discount, setDiscount] = useState('')
  const [tax, setTax] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState(null)
  const [showPaid, setShowPaid] = useState(false)
  const { notifications, dismiss } = useOrderReadyNotifications(activeBranchId)

  const loadItems = useCallback(async (orderIds) => {
    if (orderIds.length === 0) return
    const { data, error } = await supabase.from('order_items').select('*').in('order_id', orderIds)
    if (error) return
    setItemsByOrder((prev) => ({ ...prev, ...groupBy(data, 'order_id') }))
  }, [])

  const openPayModal = (orderId) => {
    setPayingOrder(orderId)
    setPayMethodId(paymentMethods[0]?.id || null)
    setDiscount('')
    setTax('')
    setPaidAmount('')
    setError(null)
  }

  useEffect(() => {
    if (!activeBranchId) return
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('orders').select('*').eq('branch_id', activeBranchId).order('created_at', { ascending: false }),
      supabase.from('order_items').select('*').eq('branch_id', activeBranchId),
      supabase.from('tables').select('*').eq('branch_id', activeBranchId),
      supabase.from('branch_payment_methods').select('payment_methods(*)').eq('branch_id', activeBranchId).eq('is_enabled', true),
      supabase.from('payments').select('*').eq('branch_id', activeBranchId),
      supabase.from('staff').select('id, name')
    ]).then(([ordersRes, itemsRes, tablesRes, bpmRes, payRes, staffRes]) => {
      if (!active) return
      if (!ordersRes.error) setOrders(ordersRes.data || [])
      if (!itemsRes.error) setItemsByOrder(groupBy(itemsRes.data, 'order_id'))
      if (!tablesRes.error) setTables(tablesRes.data || [])
      if (!staffRes.error) {
        const map = {}
        ;(staffRes.data || []).forEach((s) => { map[s.id] = s.name })
        setStaffMap(map)
      }
      if (!payRes.error) setPaymentsByOrder(groupBy(payRes.data, 'order_id'))
      const methods = (bpmRes.data || []).map((r) => r.payment_methods).filter((m) => m && m.is_active)
      if (methods.length > 0) {
        setPaymentMethods(methods)
      } else {
        // Backward compatibility: before branch config existed, enable all.
        supabase.from('payment_methods').select('*').eq('is_active', true).then(({ data }) => {
          if (active) setPaymentMethods(data || [])
        })
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [activeBranchId])

  // Realtime: order status changes + new orders
  useEffect(() => {
    if (!activeBranchId) return
    const channel = supabase
      .channel('billing-orders-realtime-' + activeBranchId)
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

  // Realtime: kitchen ETA / status changes (POS reflects the kitchen live)
  useEffect(() => {
    if (!activeBranchId) return
    const channel = supabase
      .channel('billing-items-realtime-' + activeBranchId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `branch_id=eq.${activeBranchId}` }, (payload) => {
        setItemsByOrder((prev) => {
          const next = { ...prev }
          const list = next[payload.new?.order_id || payload.old?.order_id] || []
          if (payload.eventType === 'DELETE') {
            next[payload.old.order_id] = list.filter((it) => it.id !== payload.old.id)
          } else {
            next[payload.new.order_id] = [...list.filter((it) => it.id !== payload.new.id), payload.new]
          }
          return next
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeBranchId])

  // Realtime: payment status updates
  useEffect(() => {
    if (!activeBranchId) return
    const channel = supabase
      .channel('billing-payments-realtime-' + activeBranchId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments', filter: `branch_id=eq.${activeBranchId}` }, (payload) => {
        setPaymentsByOrder((prev) => ({
          ...prev,
          [payload.new.order_id]: [...(prev[payload.new.order_id] || []).filter((p) => p.id !== payload.new.id), payload.new]
        }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeBranchId])

  // Highlight a freshly-created order (from order-taking).
  useEffect(() => {
    const id = location.state?.newOrderId
    if (id && !showPaid) {
      openPayModal(id)
      setShowPaid(true)
      window.history.replaceState({}, '')
    }
  }, [location.state, showPaid]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once methods are known, pick a default selection for the open modal.
  useEffect(() => {
    if (payingOrder && !payMethodId && paymentMethods.length > 0) {
      setPayMethodId(paymentMethods[0].id)
    }
  }, [payingOrder, payMethodId, paymentMethods])

  if (!activeBranch) return <p className="text-stone-500">Select a branch to bill orders.</p>

  const total = (id) => (itemsByOrder[id] || []).reduce((s, it) => s + Number(it.price_at_order) * it.quantity, 0)

  const billable = orders.filter((o) => o.status !== 'paid' && o.status !== 'cancelled')

  const target = orders.find((o) => o.id === payingOrder)
  const selectedMethod = paymentMethods.find((m) => m.id === payMethodId)
  const subtotal = payingOrder ? total(payingOrder) : 0
  const disc = Number(discount) || 0
  const taxAmt = Number(tax) || 0
  const grandTotal = Math.max(0, subtotal - disc + taxAmt)
  const isCash = selectedMethod?.code === 'cash'
  const received = isCash ? Number(paidAmount) || 0 : grandTotal
  const change = isCash ? Math.max(0, received - grandTotal) : 0

  const processPayment = async () => {
    if (!payingOrder) return
    const order = orders.find((o) => o.id === payingOrder)
    if (!selectedMethod) {
      setError('No payment method selected.')
      return
    }
    if (isCash && received < grandTotal) {
      setError('Amount received is less than the total.')
      return
    }
    setPaying(true)
    setError(null)

    // Open the invoice print window synchronously (popup-blocker safe).
    const win = openPrintWindow()
    const invoiceNo = makeInvoiceNo()

    const { error: payError } = await supabase.from('payments').insert([{
      order_id: payingOrder,
      branch_id: activeBranchId,
      amount: grandTotal,
      payment_method_id: selectedMethod.id,
      invoice_no: invoiceNo,
      subtotal,
      discount: disc,
      tax: taxAmt,
      paid_amount: received,
      change_amount: change,
      cashier_id: staff?.id || null
    }])
    if (payError) {
      if (win) win.close()
      setError(payError.message)
      setPaying(false)
      return
    }
    await supabase.from('orders').update({ status: 'paid' }).eq('id', payingOrder)
    if (order?.table_id) {
      await supabase.from('tables').update({ status: 'available' }).eq('id', order.table_id)
    }

    const orderId = payingOrder
    setPaying(false)
    setPayingOrder(null)

    if (win) {
      const settings = await fetchSettings()
      const items = itemsByOrder[orderId] || []
      const tableNumber = tables.find((t) => t.id === order?.table_id)?.number
      const html = buildInvoiceHtml({
        restaurantName: settings.restaurant_name || DEFAULT_SETTINGS.restaurant_name,
        branch: activeBranch,
        invoiceNo,
        orderNo: order.id.slice(0, 8).toUpperCase(),
        orderTime: order.created_at,
        cashierName: staff?.name || '',
        tableNumber,
        customerName: order.customer_name,
        items,
        subtotal,
        discount: disc,
        tax: taxAmt,
        grandTotal,
        paymentMethod: selectedMethod.name,
        paidAmount: received,
        changeAmount: change,
        footer: settings.invoice_footer || DEFAULT_SETTINGS.invoice_footer,
        qrData: invoiceNo
      })
      printHtml(win, html)
    }
  }

  const reprintInvoice = async (order) => {
    const payment = (paymentsByOrder[order.id] || [])[0]
    if (!payment) return
    const win = openPrintWindow()
    const settings = await fetchSettings()
    const method = paymentMethods.find((m) => m.id === payment.payment_method_id)
    const items = itemsByOrder[order.id] || []
    const html = buildInvoiceHtml({
      restaurantName: settings.restaurant_name || DEFAULT_SETTINGS.restaurant_name,
      branch: activeBranch,
      invoiceNo: payment.invoice_no || `INV-${order.id.slice(0, 8).toUpperCase()}`,
      orderNo: order.id.slice(0, 8).toUpperCase(),
      orderTime: order.created_at,
      cashierName: staffMap[payment.cashier_id] || '',
      tableNumber: tables.find((t) => t.id === order.table_id)?.number,
      customerName: order.customer_name,
      items,
      subtotal: payment.subtotal ?? total(order.id),
      discount: payment.discount ?? 0,
      tax: payment.tax ?? 0,
      grandTotal: payment.amount,
      paymentMethod: method?.name || '—',
      paidAmount: payment.paid_amount ?? payment.amount,
      changeAmount: payment.change_amount ?? 0,
      footer: settings.invoice_footer || DEFAULT_SETTINGS.invoice_footer,
      qrData: payment.invoice_no || ''
    })
    printHtml(win, html)
  }

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

      {notifications.length > 0 && (
        <div className="mb-5 space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm">
              <span>Order <b>#{n.shortId}</b> is ready to serve.</span>
              <button onClick={() => dismiss(n.id)} className="ml-4 text-emerald-700 font-medium hover:underline">Dismiss</button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-stone-500">Loading…</p>
      ) : billable.length === 0 && !showPaid ? (
        <EmptyState message="No unpaid orders." hint="Orders sent to the kitchen will appear here." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(showPaid ? orders : billable).map((o) => {
            const eta = hasKitchenItems(itemsByOrder[o.id]) ? orderKitchenEta(itemsByOrder[o.id]) : null
            return (
              <div key={o.id} className={`bg-white rounded-xl border p-5 ${o.status === 'paid' ? 'border-stone-200 opacity-70' : 'border-stone-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs uppercase tracking-wide text-stone-400">Order</span>
                    <div className="font-semibold text-stone-900">#{o.id.slice(0, 8).toUpperCase()}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium rounded-full px-2.5 py-0.5 capitalize bg-stone-100 text-stone-600">{o.type}</span>
                    <div className="text-xs text-stone-400 mt-1 capitalize">{o.status}</div>
                  </div>
                </div>
                {eta !== null && o.status !== 'paid' && (
                  <div className="mb-2">
                    <span className={`inline-block text-xs font-medium rounded-full px-2.5 py-0.5 ${eta > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {eta > 0 ? `ETA ${eta} min` : 'Ready'}
                    </span>
                  </div>
                )}
                <ul className="text-sm text-stone-700 space-y-1 mb-3">
                  {(itemsByOrder[o.id] || []).map((it) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span>{it.quantity}× {it.name}</span>
                      <span className="text-stone-500">${(Number(it.price_at_order) * it.quantity).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                  <span className="font-semibold text-stone-900">{fmtMoney(total(o.id))}</span>
                  <div className="flex items-center gap-2">
                    {o.status === 'paid' ? (
                      <button onClick={() => reprintInvoice(o)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-600 text-sm font-medium hover:bg-stone-50">
                        Reprint
                      </button>
                    ) : (
                      <button onClick={() => openPayModal(o.id)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
                        Charge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Payment modal */}
      {target && payingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setPayingOrder(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Charge order</h2>

            <div className="flex justify-between items-center mb-4">
              <span className="text-sm text-stone-500">Subtotal</span>
              <span className="text-xl font-bold text-stone-900">{fmtMoney(subtotal)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Discount ($)</label>
                <input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">VAT / Tax ($)</label>
                <input type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="0.00" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <label className="block text-sm font-medium text-stone-700 mb-1">Payment method</label>
              {paymentMethods.length === 0 ? (
                <p className="text-sm text-stone-400">No payment methods configured for this branch.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((m) => (
                    <label key={m.id} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer ${payMethodId === m.id ? 'border-brand-400 bg-brand-50' : 'border-stone-200 hover:border-brand-400'}`}>
                      <input type="radio" name="method" value={m.id} checked={payMethodId === m.id} onChange={() => setPayMethodId(m.id)} className="accent-brand-600" />
                      <span className="text-sm text-stone-800">{m.icon && <span className="mr-1">{m.icon}</span>}{m.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center py-3 border-t border-stone-100">
              <span className="font-semibold text-stone-800">Grand total</span>
              <span className="text-2xl font-bold text-stone-900">{fmtMoney(grandTotal)}</span>
            </div>

            {isCash && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-stone-700 mb-1">Cash received</label>
                <input type="number" min="0" step="0.01" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} placeholder={grandTotal.toFixed(2)} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
                <p className="text-sm text-stone-500 mt-1">Change: <b className="text-stone-800">{fmtMoney(change)}</b></p>
              </div>
            )}

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setPayingOrder(null)} className="flex-1 px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
              <button onClick={processPayment} disabled={paying || paymentMethods.length === 0} className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
                {paying ? 'Processing…' : 'Confirm payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
