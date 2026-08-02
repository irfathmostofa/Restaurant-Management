import { useEffect, useState, useCallback } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useCurrency } from '../../context/CurrencyContext'
import PageHeader from '../../components/admin/PageHeader'
import EmptyState from '../../components/admin/EmptyState'
import { buildInvoiceHtml, openPrintWindow, printHtml, shortOrderNo, fmtDateTime } from '../../lib/printing'
import { logActivity } from '../../lib/activity'

const PAGE_SIZE = 15

const ORDER_TYPES = [
  { value: 'dine-in', label: 'Dine-in' },
  { value: 'takeaway', label: 'Takeaway' }
]

export default function Invoices() {
  const { branches } = useBranch()
  const { formatMoney, currency } = useCurrency()

  const [filters, setFilters] = useState({
    invoiceNo: '',
    customer: '',
    methodId: '',
    cashierId: '',
    branchId: '',
    orderType: '',
    from: '',
    to: ''
  })
  const [page, setPage] = useState(0)
  const [data, setData] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [methods, setMethods] = useState([])
  const [cashiers, setCashiers] = useState([])
  const [tablesMap, setTablesMap] = useState({})
  const [viewing, setViewing] = useState(null)
  const [printing, setPrinting] = useState(false)
  const [error, setError] = useState(null)

  // Lookup data for the filters.
  useEffect(() => {
    Promise.all([
      supabase.from('payment_methods').select('*').order('name'),
      supabase.from('staff').select('id, name').order('name'),
      supabase.from('tables').select('id, number')
    ]).then(([mRes, cRes, tRes]) => {
      if (!mRes.error) setMethods(mRes.data || [])
      if (!cRes.error) setCashiers(cRes.data || [])
      if (!tRes.error) {
        const map = {}
        ;(tRes.data || []).forEach((t) => { map[t.id] = t.number })
        setTablesMap(map)
      }
    })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    let query = supabase
      .from('payments')
      .select('*, orders(*, order_items(*)), cashier:staff(id, name), payment_methods(id, name, code)', { count: 'exact' })
      .order('paid_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (filters.invoiceNo) query = query.ilike('invoice_no', `%${filters.invoiceNo}%`)
    if (filters.customer) query = query.ilike('orders.customer_name', `%${filters.customer}%`)
    if (filters.methodId) query = query.eq('payment_method_id', filters.methodId)
    if (filters.cashierId) query = query.eq('cashier_id', filters.cashierId)
    if (filters.branchId) query = query.eq('branch_id', filters.branchId)
    if (filters.orderType) query = query.eq('orders.type', filters.orderType)
    if (filters.from) query = query.gte('paid_at', `${filters.from}T00:00:00`)
    if (filters.to) query = query.lte('paid_at', `${filters.to}T23:59:59`)

    const { data, count: total, error } = await query
    if (error) {
      setError(error.message)
      setData([])
      setCount(0)
    } else {
      setData(data || [])
      setCount(total || 0)
    }
    setLoading(false)
  }, [filters, page])

  useEffect(() => { load() }, [load])

  const applyFilters = (e) => {
    e.preventDefault()
    setPage(0)
    load()
  }

  const resetFilters = () => {
    setFilters({ invoiceNo: '', customer: '', methodId: '', cashierId: '', branchId: '', orderType: '', from: '', to: '' })
    setPage(0)
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  const doPrint = (payment) => {
    const order = payment.orders
    const items = order?.order_items || []
    const win = openPrintWindow()
    const html = buildInvoiceHtml({
      restaurantName: 'RestaurantHub',
      branch: branches.find((b) => b.id === payment.branch_id) || undefined,
      invoiceNo: payment.invoice_no || `INV-${shortOrderNo(order?.id)}`,
      orderNo: shortOrderNo(order?.id),
      orderTime: order?.created_at || payment.paid_at,
      cashierName: payment.cashier?.name || '',
      tableNumber: order?.table_id ? tablesMap[order.table_id] : undefined,
      customerName: order?.customer_name,
      items,
      subtotal: payment.subtotal ?? 0,
      discount: payment.discount ?? 0,
      vat: payment.vat ?? 0,
      tax: payment.tax ?? 0,
      serviceCharge: payment.service_charge ?? 0,
      grandTotal: payment.amount,
      paymentMethod: payment.payment_methods?.name || '—',
      paidAmount: payment.paid_amount ?? payment.amount,
      changeAmount: payment.change_amount ?? 0,
      qrData: payment.invoice_no || '',
      currency
    })
    printHtml(win, html)
    logActivity({
      module: 'invoices',
      action: 'print',
      description: `Printed invoice ${payment.invoice_no || shortOrderNo(order?.id)} (${payment.payment_methods?.name || '—'})`,
      branchId: payment.branch_id,
      metadata: { invoice_id: payment.id, invoice_no: payment.invoice_no }
    })
  }

  const handlePrint = (payment) => {
    setPrinting(true)
    setTimeout(() => { doPrint(payment); setPrinting(false) }, 50)
  }

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Search, filter and reprint customer invoices."
      />

      {/* Filters */}
      <form onSubmit={applyFilters} className="bg-white rounded-xl border border-stone-200 p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Invoice number</label>
            <input value={filters.invoiceNo} onChange={(e) => setFilters({ ...filters, invoiceNo: e.target.value })} placeholder="INV-2025…" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Customer name</label>
            <input value={filters.customer} onChange={(e) => setFilters({ ...filters, customer: e.target.value })} placeholder="Search customer…" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Payment method</label>
            <select value={filters.methodId} onChange={(e) => setFilters({ ...filters, methodId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All methods</option>
              {methods.map((m) => <option key={m.id} value={m.id}>{m.icon} {m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Cashier</label>
            <select value={filters.cashierId} onChange={(e) => setFilters({ ...filters, cashierId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All cashiers</option>
              {cashiers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
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
            <label className="block text-xs font-medium text-stone-500 mb-1">Order type</label>
            <select value={filters.orderType} onChange={(e) => setFilters({ ...filters, orderType: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">All types</option>
              {ORDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">From date</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">To date</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700">Search</button>
          <button type="button" onClick={resetFilters} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Reset</button>
          <span className="text-sm text-stone-500 ml-auto">{count} invoice{count === 1 ? '' : 's'}</span>
        </div>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p className="text-stone-500">Loading invoices…</p>
      ) : data.length === 0 ? (
        <EmptyState message="No invoices found." hint="Adjust the filters, or charge an order to generate an invoice." />
      ) : (
        <>
          <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-stone-500 border-b border-stone-200 bg-stone-50">
                    <th className="px-5 py-3 font-medium">Invoice</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Customer</th>
                    <th className="px-5 py-3 font-medium">Method</th>
                    <th className="px-5 py-3 font-medium">Cashier</th>
                    <th className="px-5 py-3 font-medium text-right">Amount</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id} className="border-b border-stone-50 hover:bg-stone-50/50">
                      <td className="px-5 py-3">
                        <button onClick={() => setViewing(p)} className="font-mono font-medium text-brand-700 hover:text-brand-800">
                          {p.invoice_no || `INV-${shortOrderNo(p.orders?.id)}`}
                        </button>
                        <div className="text-xs text-stone-400">{p.orders?.type || '—'}</div>
                      </td>
                      <td className="px-5 py-3 text-stone-600 whitespace-nowrap">{fmtDateTime(p.paid_at)}</td>
                      <td className="px-5 py-3 text-stone-700">{p.orders?.customer_name || 'Guest'}</td>
                      <td className="px-5 py-3 text-stone-600">{p.payment_methods?.name || '—'}</td>
                      <td className="px-5 py-3 text-stone-600">{p.cashier?.name || '—'}</td>
                      <td className="px-5 py-3 text-right font-semibold text-stone-900">{formatMoney(p.amount)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <button onClick={() => setViewing(p)} className="text-brand-600 hover:text-brand-700 mr-3">View</button>
                        <button onClick={() => handlePrint(p)} disabled={printing} className="text-stone-500 hover:text-stone-700 disabled:opacity-50">Print</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
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

      {/* Detail modal */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-stone-900">Invoice details</h2>
              <button onClick={() => setViewing(null)} className="text-stone-400 hover:text-stone-600" aria-label="Close">✕</button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-stone-500 block">Invoice</span><span className="font-mono font-medium text-stone-900">{viewing.invoice_no || `INV-${shortOrderNo(viewing.orders?.id)}`}</span></div>
                <div><span className="text-stone-500 block">Order</span><span className="font-mono text-stone-700">#{shortOrderNo(viewing.orders?.id)}</span></div>
                <div><span className="text-stone-500 block">Date</span><span className="text-stone-800">{fmtDateTime(viewing.paid_at)}</span></div>
                <div><span className="text-stone-500 block">Type</span><span className="capitalize text-stone-800">{viewing.orders?.type || '—'}</span></div>
                <div><span className="text-stone-500 block">Customer</span><span className="text-stone-800">{viewing.orders?.customer_name || 'Guest'}</span></div>
                <div><span className="text-stone-500 block">Cashier</span><span className="text-stone-800">{viewing.cashier?.name || '—'}</span></div>
                <div><span className="text-stone-500 block">Payment method</span><span className="text-stone-800">{viewing.payment_methods?.name || '—'}</span></div>
                <div><span className="text-stone-500 block">Branch</span><span className="text-stone-800">{branches.find((b) => b.id === viewing.branch_id)?.name || '—'}</span></div>
              </div>

              <div>
                <h3 className="font-medium text-stone-700 mb-2">Items</h3>
                <ul className="space-y-1">
                  {(viewing.orders?.order_items || []).map((it) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span className="text-stone-700">{it.quantity}× {it.name}</span>
                      <span className="text-stone-500">{formatMoney(Number(it.price_at_order) * it.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-1 border-t border-stone-100 pt-3">
                <div className="flex justify-between"><span className="text-stone-500">Subtotal</span><span>{formatMoney(viewing.subtotal ?? 0)}</span></div>
                {Number(viewing.discount) > 0 && <div className="flex justify-between"><span className="text-stone-500">Discount</span><span>-{formatMoney(viewing.discount)}</span></div>}
                {Number(viewing.service_charge) > 0 && <div className="flex justify-between"><span className="text-stone-500">Service charge</span><span>{formatMoney(viewing.service_charge)}</span></div>}
                {Number(viewing.vat) > 0 && <div className="flex justify-between"><span className="text-stone-500">VAT</span><span>{formatMoney(viewing.vat)}</span></div>}
                {Number(viewing.tax) > 0 && <div className="flex justify-between"><span className="text-stone-500">Tax</span><span>{formatMoney(viewing.tax)}</span></div>}
                <div className="flex justify-between font-bold text-stone-900"><span>Grand total</span><span>{formatMoney(viewing.amount)}</span></div>
                <div className="flex justify-between"><span className="text-stone-500">Paid</span><span>{formatMoney(viewing.paid_amount ?? viewing.amount)}</span></div>
                {Number(viewing.change_amount) > 0 && <div className="flex justify-between"><span className="text-stone-500">Change</span><span>{formatMoney(viewing.change_amount)}</span></div>}
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setViewing(null); handlePrint(viewing) }} disabled={printing} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
                  {printing ? 'Printing…' : 'Print invoice'}
                </button>
                <button onClick={() => setViewing(null)} className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
