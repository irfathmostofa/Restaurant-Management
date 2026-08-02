import { useEffect, useState } from 'react'
import supabase from '../../lib/supabase'
import { useCurrency } from '../../context/CurrencyContext'
import PageHeader from '../../components/admin/PageHeader'
import ImageUploader from '../../components/admin/ImageUploader'
import { fetchAllRoleRoutes, fetchSettings, DEFAULT_SETTINGS } from '../../lib/config'
import { ROLES, ROLE_LABELS, DEFAULT_ROUTE_BY_ROLE } from '../../lib/roles'
import { DEFAULT_CURRENCY } from '../../context/CurrencyContext'
import { logActivity } from '../../lib/activity'

const ROUTE_OPTIONS = [
  { value: '/admin/dashboard', label: 'Dashboard' },
  { value: '/admin/order-taking', label: 'Order Screen' },
  { value: '/admin/billing', label: 'POS / Billing' },
  { value: '/admin/orders', label: 'Kitchen Display' }
]

export default function Settings() {
  const { currency, refresh } = useCurrency()
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [routes, setRoutes] = useState({})
  const [currencyForm, setCurrencyForm] = useState(DEFAULT_CURRENCY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [currencySaving, setCurrencySaving] = useState(false)
  const [currencySaved, setCurrencySaved] = useState(false)
  const [currencyError, setCurrencyError] = useState(null)

  useEffect(() => {
    let active = true
    Promise.all([fetchSettings(), fetchAllRoleRoutes()]).then(([settingsData, routesData]) => {
      if (!active) return
      setSettings({ ...DEFAULT_SETTINGS, ...settingsData })
      setRoutes(routesData)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    setCurrencyForm({ ...DEFAULT_CURRENCY, ...currency })
  }, [currency])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)

    const settingsRows = [
      ['restaurant_name', settings.restaurant_name],
      ['invoice_footer', settings.invoice_footer],
      ['default_prep_time', settings.default_prep_time],
      ['restaurant_logo', settings.restaurant_logo]
    ]
    const { error: settingsError } = await supabase
      .from('settings')
      .upsert(settingsRows.map(([key, value]) => ({ key, value })), { onConflict: 'key' })
    if (settingsError) {
      setError(settingsError.message)
      setSaving(false)
      return
    }

    const routeRows = Object.entries(ROLES)
      .map(([, role]) => ({ role, route: routes[role] || DEFAULT_ROUTE_BY_ROLE[role] }))
    const { error: routesError } = await supabase
      .from('role_default_routes')
      .upsert(routeRows, { onConflict: 'role' })
    if (routesError) {
      setError(routesError.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setSaved(true)
    logActivity({ module: 'settings', action: 'update', description: 'Updated restaurant settings and role landing pages' })
    setTimeout(() => setSaved(false), 2500)
  }

  const saveCurrency = async (e) => {
    e.preventDefault()
    setCurrencySaving(true)
    setCurrencySaved(false)
    setCurrencyError(null)
    const payload = {
      name: currencyForm.name,
      iso_code: currencyForm.iso_code,
      symbol: currencyForm.symbol,
      symbol_position: currencyForm.symbol_position,
      decimal_precision: Number(currencyForm.decimal_precision),
      thousand_separator: currencyForm.thousand_separator || ','
    }
    const { error } = await supabase
      .from('currency_settings')
      .update(payload)
      .eq('id', currency.id)
      .select('id')
      .maybeSingle()

    if (error && /No rows/.test(error.message)) {
      const { error: insertError } = await supabase.from('currency_settings').insert([payload])
      if (insertError) { setCurrencyError(insertError.message); setCurrencySaving(false); return }
    } else if (error) {
      setCurrencyError(error.message)
      setCurrencySaving(false)
      return
    }
    await refresh()
    setCurrencySaving(false)
    setCurrencySaved(true)
    logActivity({ module: 'currency', action: 'update', description: `Updated currency to ${payload.name} (${payload.iso_code})` })
    setTimeout(() => setCurrencySaved(false), 2500)
  }

  if (loading) return <p className="text-stone-500">Loading settings…</p>

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Restaurant-wide display info and configurable per-role landing pages."
      />

      <form onSubmit={save} className="max-w-2xl space-y-6">
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="font-semibold text-stone-900 mb-4">Restaurant info</h2>
          <div className="space-y-4">
            <div>
              <ImageUploader
                label="Restaurant logo"
                value={settings.restaurant_logo || ''}
                onChange={(url) => setSettings({ ...settings, restaurant_logo: url })}
                bucket="branding"
                folder="restaurant"
                maxDimension={512}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Restaurant name</label>
              <input value={settings.restaurant_name || ''} onChange={(e) => setSettings({ ...settings, restaurant_name: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Invoice footer (thank-you message)</label>
              <input value={settings.invoice_footer || ''} onChange={(e) => setSettings({ ...settings, invoice_footer: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Default kitchen prep time (minutes)</label>
              <input type="number" min="1" value={settings.default_prep_time || ''} onChange={(e) => setSettings({ ...settings, default_prep_time: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="font-semibold text-stone-900 mb-1">Role landing pages</h2>
          <p className="text-sm text-stone-500 mb-4">Where each role lands right after login. Changes apply without touching app code.</p>
          <div className="space-y-3">
            {Object.values(ROLES).map((role) => (
              <div key={role} className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-stone-700 w-40">{ROLE_LABELS[role] || role}</span>
                <select
                  value={routes[role] || DEFAULT_ROUTE_BY_ROLE[role] || '/admin/dashboard'}
                  onChange={(e) => setRoutes({ ...routes, [role]: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {ROUTE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Settings saved.</span>}
        </div>
      </form>

      <form onSubmit={saveCurrency} className="max-w-2xl bg-white rounded-xl border border-stone-200 p-6 space-y-4 mt-6">
        <div>
          <h2 className="font-semibold text-stone-900">Currency</h2>
          <p className="text-sm text-stone-500">Controls how money is displayed across the website, POS, invoices and reports.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Currency name</label>
            <input value={currencyForm.name} onChange={(e) => setCurrencyForm({ ...currencyForm, name: e.target.value })} placeholder="US Dollar" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">ISO code</label>
            <input value={currencyForm.iso_code} onChange={(e) => setCurrencyForm({ ...currencyForm, iso_code: e.target.value })} placeholder="USD" maxLength={3} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Symbol</label>
            <input value={currencyForm.symbol} onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })} placeholder="$" className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Symbol position</label>
            <select value={currencyForm.symbol_position} onChange={(e) => setCurrencyForm({ ...currencyForm, symbol_position: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value="before">Before amount ($100)</option>
              <option value="after">After amount (100 $)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Decimal places</label>
            <select value={currencyForm.decimal_precision} onChange={(e) => setCurrencyForm({ ...currencyForm, decimal_precision: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500">
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Thousand separator</label>
            <input value={currencyForm.thousand_separator} onChange={(e) => setCurrencyForm({ ...currencyForm, thousand_separator: e.target.value })} placeholder="," maxLength={1} className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        {currencyError && <p className="text-sm text-red-600">{currencyError}</p>}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={currencySaving} className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
            {currencySaving ? 'Saving…' : 'Save currency'}
          </button>
          {currencySaved && <span className="text-sm text-emerald-600 font-medium">Currency saved.</span>}
          <span className="text-sm text-stone-500 ml-auto">Preview: {formatCurrencyPreview(currencyForm, 1234.5)}</span>
        </div>
      </form>
    </div>
  )
}

export function formatCurrencyPreview(currency, amount = 1234.5) {
  const c = { ...DEFAULT_CURRENCY, ...currency }
  const n = Number(amount || 0)
  const fixed = n.toFixed(c.decimal_precision ?? 2)
  const [int, dec] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, c.thousand_separator || ',')
  const body = dec !== undefined ? `${grouped}.${dec}` : grouped
  const sym = c.symbol || '$'
  return c.symbol_position === 'after' ? `${body} ${sym}`.trim() : `${sym}${body}`
}
