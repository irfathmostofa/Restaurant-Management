import { useEffect, useState } from 'react'
import supabase from '../../lib/supabase'
import PageHeader from '../../components/admin/PageHeader'
import ImageUploader from '../../components/admin/ImageUploader'
import { fetchAllRoleRoutes, fetchSettings, DEFAULT_SETTINGS } from '../../lib/config'
import { ROLES, ROLE_LABELS, DEFAULT_ROUTE_BY_ROLE } from '../../lib/roles'

const ROUTE_OPTIONS = [
  { value: '/admin/dashboard', label: 'Dashboard' },
  { value: '/admin/order-taking', label: 'Order Screen' },
  { value: '/admin/billing', label: 'POS / Billing' },
  { value: '/admin/orders', label: 'Kitchen Display' }
]

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [routes, setRoutes] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

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
    setTimeout(() => setSaved(false), 2500)
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
    </div>
  )
}
