import { useEffect, useMemo, useState, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import { useCurrency } from '../../context/CurrencyContext'
import { fetchSettings, DEFAULT_SETTINGS } from '../../lib/config'
import { buildKotHtml, openPrintWindow, printHtml } from '../../lib/printing'
import { hasKitchenItems } from '../../lib/kitchen'
import useOrderReadyNotifications from '../../hooks/useOrderReadyNotifications'
import { logActivity } from '../../lib/activity'
import PageHeader from '../../components/admin/PageHeader'

export default function OrderTaking() {
  const { activeBranch, activeBranchId } = useBranch()
  const { staff } = useAuth()
  const { formatMoney } = useCurrency()
  const navigate = useNavigate()
  const [tables, setTables] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [categories, setCategories] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [orderType, setOrderType] = useState('dine-in')
  const [selectedTable, setSelectedTable] = useState(null)
  const [customerName, setCustomerName] = useState('')
  const [cart, setCart] = useState([]) // { menu_item_id, name, price, quantity, notes, requires_kitchen }
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const searchRef = useRef(null)
  const { notifications, dismiss } = useOrderReadyNotifications(activeBranchId)

  useEffect(() => {
    if (!activeBranchId) return
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('tables').select('*').eq('branch_id', activeBranchId).order('number'),
      supabase.from('menu_items').select('*').eq('branch_id', activeBranchId).order('sort_order'),
      supabase.from('categories').select('*').eq('branch_id', activeBranchId).order('sort_order')
    ]).then(([tablesRes, menuRes, catRes]) => {
      if (!active) return
      if (!tablesRes.error) setTables(tablesRes.data || [])
      if (!menuRes.error) setMenuItems(menuRes.data || [])
      if (!catRes.error) setCategories(catRes.data || [])
      setLoading(false)
    })
    return () => { active = false }
  }, [activeBranchId])

  // Keyboard shortcut: "/" focuses search, Enter submits when cart is ready.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.key === '/' && searchRef.current) {
        e.preventDefault()
        searchRef.current.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return menuItems.filter((i) => {
      if (!i.is_available) return false
      if (activeCategory !== 'all' && i.category_id !== activeCategory) return false
      if (q && !i.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [menuItems, activeCategory, search])

  if (!activeBranch) {
    return <p className="text-stone-500">Select a branch to take orders.</p>
  }

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id)
      if (existing) return prev.map((c) => c.menu_item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c)
      return [{
        menu_item_id: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: 1,
        notes: '',
        requires_kitchen: item.requires_kitchen !== false
      }, ...prev]
    })
  }

  const updateQty = (menuItemId, delta) => {
    setCart((prev) => prev.map((c) => {
      if (c.menu_item_id !== menuItemId) return c
      const q = Math.max(0, c.quantity + delta)
      return { ...c, quantity: q }
    }).filter((c) => c.quantity > 0))
  }

  const setNotes = (menuItemId, notes) => {
    setCart((prev) => prev.map((c) => c.menu_item_id === menuItemId ? { ...c, notes } : c))
  }

  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const hasKitchenInCart = hasKitchenItems(cart)

  const submitOrder = async () => {
    if (cart.length === 0) {
      setError('Add at least one item.')
      return
    }
    if (orderType === 'dine-in' && !selectedTable) {
      setError('Select a table for dine-in orders.')
      return
    }
    setSubmitting(true)
    setError(null)

    // Open the KOT print window synchronously so popup blockers don't block it.
    const kotWin = hasKitchenInCart ? openPrintWindow() : null

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        branch_id: activeBranchId,
        table_id: orderType === 'dine-in' ? selectedTable : null,
        type: orderType,
        // Orders with only non-kitchen items are ready immediately.
        status: hasKitchenInCart ? 'received' : 'ready',
        staff_id: staff?.id || null,
        customer_name: customerName || null
      }])
      .select()
      .single()

    if (orderError) {
      if (kotWin) kotWin.close()
      setError(orderError.message)
      setSubmitting(false)
      return
    }

    const settings = await fetchSettings()
    const defaultPrepTime = settings.default_prep_time || DEFAULT_SETTINGS.default_prep_time

    const itemsPayload = cart.map((c) => ({
      order_id: order.id,
      branch_id: activeBranchId,
      menu_item_id: c.menu_item_id,
      name: c.name,
      quantity: c.quantity,
      notes: c.notes || null,
      price_at_order: c.price,
      requires_kitchen: c.requires_kitchen,
      // Kitchen-required items queue for the kitchen; the rest are ready now.
      kitchen_status: c.requires_kitchen ? 'pending' : 'ready',
      estimated_prep_time: c.requires_kitchen ? (Number(defaultPrepTime) || 5) : 0
    }))
    const { error: itemsError } = await supabase.from('order_items').insert(itemsPayload)
    if (itemsError) {
      if (kotWin) kotWin.close()
      setSubmitting(false)
      setError(itemsError.message)
      return
    }

    if (orderType === 'dine-in') {
      await supabase.from('tables').update({ status: 'occupied' }).eq('id', selectedTable)
    }

    // Print the kitchen ticket (kitchen-required items only, no prices).
    if (kotWin) {
      const kitchenItems = cart.filter((c) => c.requires_kitchen)
      const tableNumber = orderType === 'dine-in'
        ? tables.find((t) => t.id === selectedTable)?.number
        : null
      const html = buildKotHtml({
        restaurantName: settings.restaurant_name || DEFAULT_SETTINGS.restaurant_name,
        branch: activeBranch,
        orderNo: order.id.slice(0, 8).toUpperCase(),
        tableNumber,
        waiterName: staff?.name || '',
        items: kitchenItems,
        defaultPrepTime,
        printTime: new Date().toISOString(),
        logoUrl: settings.restaurant_logo || ''
      })
      printHtml(kotWin, html)
    }

    logActivity({
      module: 'orders',
      action: 'create',
      description: `Created ${orderType} order #${order.id.slice(0, 8).toUpperCase()} (${cart.length} item${cart.length === 1 ? '' : 's'}, ${formatMoney(total, { symbol: false })})`,
      branchId: activeBranchId,
      metadata: { order_id: order.id, type: orderType }
    })

    setSubmitting(false)
    // Success → reset cart, navigate to billing to collect payment.
    setCart([])
    setCustomerName('')
    setSelectedTable(null)
    navigate('/admin/billing', { state: { newOrderId: order.id } })
  }

  return (
    <div>
      <PageHeader
        title="POS / Order Taking"
        subtitle={activeBranch ? `Take an order at ${activeBranch.name}` : 'Select a branch'}
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

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Left: menu area */}
        <div className="flex-1 min-w-0">
          {/* Order type + customer + table (top bar) */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-2">
                <button
                  onClick={() => setOrderType('dine-in')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${orderType === 'dine-in' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-stone-600 border-stone-300 hover:border-brand-400'}`}
                >
                  Dine-in
                </button>
                <button
                  onClick={() => { setOrderType('takeaway'); setSelectedTable(null) }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${orderType === 'takeaway' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-stone-600 border-stone-300 hover:border-brand-400'}`}
                >
                  Takeaway
                </button>
              </div>

              {orderType === 'dine-in' && (
                <div className="flex flex-wrap gap-2">
                  {tables.filter((t) => t.status !== 'occupied').map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTable(t.id)}
                      className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-colors ${selectedTable === t.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-stone-700 border-stone-300 hover:border-brand-400'}`}
                    >
                      {t.number}
                    </button>
                  ))}
                  {tables.filter((t) => t.status === 'occupied').length > 0 && (
                    <span className="text-xs text-stone-400 self-center">{tables.filter((t) => t.status === 'occupied').length} occupied</span>
                  )}
                </div>
              )}

              <div className="flex-1 min-w-[180px]">
                <input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name (optional)"
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          {/* Search + categories */}
          <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search menu… (press "/")'
              className="w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-3"
            />
            <div className="flex gap-2 overflow-x-auto pb-1 -mb-1">
              <button
                onClick={() => setActiveCategory('all')}
                className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${activeCategory === 'all' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-stone-600 border-stone-300 hover:border-brand-400'}`}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${activeCategory === cat.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-stone-600 border-stone-300 hover:border-brand-400'}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            {loading ? (
              <p className="text-stone-500 py-10 text-center">Loading menu…</p>
            ) : visibleItems.length === 0 ? (
              <p className="text-stone-400 py-10 text-center">No menu items match.{'\u00A0'}<Link to="/admin/menu" className="text-brand-600 hover:text-brand-700">Manage menu</Link></p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[calc(100vh-320px)] min-h-[320px] overflow-y-auto pr-1">
                {visibleItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className="text-left p-3 rounded-lg border border-stone-200 hover:border-brand-400 hover:bg-brand-50/50 transition-colors active:scale-[0.98]"
                  >
                    {item.photo_url && (
                      <img src={item.photo_url} alt={item.name} className="w-full h-20 object-cover rounded-md mb-2" loading="lazy" />
                    )}
                    <div className="flex justify-between items-start gap-2">
                      <span className="font-medium text-stone-800 text-sm leading-tight">{item.name}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-brand-700 text-sm font-semibold whitespace-nowrap">{formatMoney(item.price)}</span>
                      <span className={`shrink-0 text-[10px] font-medium rounded px-1.5 py-0.5 ${item.requires_kitchen !== false ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {item.requires_kitchen !== false ? 'Kitchen' : 'Ready'}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: cart */}
        <div className="w-full xl:w-[380px] shrink-0">
          <div className="bg-white rounded-xl border border-stone-200 p-5 xl:sticky xl:top-24">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-stone-900">Current order</h2>
              <span className="text-xs font-medium rounded-full bg-stone-100 text-stone-600 px-2.5 py-0.5 capitalize">{orderType}{selectedTable ? ` · T${tables.find((t) => t.id === selectedTable)?.number}` : ''}</span>
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-8">Tap items on the left to add them.</p>
            ) : (
              <ul className="space-y-3 mb-4 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                {cart.map((c) => (
                  <li key={c.menu_item_id} className="border border-stone-100 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <span className="font-medium text-sm text-stone-800">{c.name}</span>
                      <span className="text-sm font-semibold text-stone-900 whitespace-nowrap">{formatMoney(c.price * c.quantity)}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => updateQty(c.menu_item_id, -1)} className="w-8 h-8 rounded-md border border-stone-300 text-stone-600 hover:bg-stone-50 text-lg leading-none">−</button>
                      <span className="w-8 text-center text-sm font-medium">{c.quantity}</span>
                      <button onClick={() => updateQty(c.menu_item_id, 1)} className="w-8 h-8 rounded-md border border-stone-300 text-stone-600 hover:bg-stone-50 text-lg leading-none">+</button>
                      <span className="ml-auto text-xs text-stone-400">{formatMoney(c.price)} each</span>
                    </div>
                    <input
                      value={c.notes}
                      onChange={(e) => setNotes(c.menu_item_id, e.target.value)}
                      placeholder="Notes (e.g. no onions)"
                      className="w-full px-2.5 py-1.5 rounded-md border border-stone-200 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <div className="flex items-center justify-between border-t border-stone-200 pt-4 mb-4">
              <span className="font-medium text-stone-700">Total</span>
              <span className="text-xl font-bold text-stone-900">{formatMoney(total)}</span>
            </div>

            <button
              onClick={submitOrder}
              disabled={submitting || cart.length === 0}
              className="w-full py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors active:scale-[0.99]"
            >
              {submitting ? 'Placing order…' : (hasKitchenInCart ? 'Send to kitchen' : 'Place order')}
            </button>
            <div className="flex items-center justify-between mt-3 text-sm">
              <Link to="/admin/orders" className="text-brand-600 hover:text-brand-700">View order queue</Link>
              <button onClick={() => setCart([])} className="text-stone-500 hover:text-stone-700">Clear cart</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
