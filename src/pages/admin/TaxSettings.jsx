import { useEffect, useState, useCallback } from 'react'
import supabase from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { canManageTaxes } from '../../lib/roles'
import { DEFAULT_TAX_SETTINGS } from '../../lib/tax'
import PageHeader from '../../components/admin/PageHeader'
import { logActivity } from '../../lib/activity'

const OVERRIDE_KEYS = [
  'is_vat_enabled', 'vat_name', 'vat_rate',
  'is_tax_enabled', 'tax_name', 'tax_rate',
  'service_charge_enabled', 'service_charge_rate',
  'price_includes_tax'
]

const FIELDS = [
  { key: 'is_vat_enabled', label: 'Enable VAT', type: 'boolean' },
  { key: 'vat_name', label: 'VAT name', type: 'text', placeholder: 'VAT' },
  { key: 'vat_rate', label: 'VAT rate (%)', type: 'number' },
  { key: 'is_tax_enabled', label: 'Enable tax', type: 'boolean' },
  { key: 'tax_name', label: 'Tax name', type: 'text', placeholder: 'Tax' },
  { key: 'tax_rate', label: 'Tax rate (%)', type: 'number' },
  { key: 'service_charge_enabled', label: 'Enable service charge', type: 'boolean' },
  { key: 'service_charge_rate', label: 'Service charge (%)', type: 'number' },
  { key: 'price_includes_tax', label: 'Prices include tax', type: 'boolean' }
]

// Merges a global config with a nullable branch-override row (branch wins).
function mergeOverride(global, override) {
  const out = { ...global }
  OVERRIDE_KEYS.forEach((k) => {
    const v = override?.[k]
    if (v !== undefined && v !== null) out[k] = v
  })
  return out
}

function Field({ f, value, onChange }) {
  if (f.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-stone-700 py-2">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(f.key, e.target.checked)} className="rounded" />
        {f.label}
      </label>
    )
  }
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1">{f.label}</label>
      <input
        type={f.type === 'number' ? 'number' : 'text'}
        step={f.type === 'number' ? '0.01' : undefined}
        min={f.type === 'number' ? '0' : undefined}
        value={value === undefined || value === null ? '' : value}
        onChange={(e) => onChange(f.key, e.target.value)}
        placeholder={f.placeholder || ''}
        className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}

export default function TaxSettings() {
  const { staff: me } = useAuth()
  const { branches } = useBranch()

  const [global, setGlobal] = useState({ ...DEFAULT_TAX_SETTINGS })
  // branch_id -> raw override row (nullable fields)
  const [overrideRows, setOverrideRows] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [overrideTarget, setOverrideTarget] = useState('') // branch_id or ''
  const [overrideDraft, setOverrideDraft] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [globalRes, overrideRes] = await Promise.all([
      supabase.from('tax_settings').select('*').limit(1).maybeSingle(),
      supabase.from('branch_tax_settings').select('*')
    ])
    if (globalRes.error) setError(globalRes.error.message)
    else if (globalRes.data) setGlobal({ ...DEFAULT_TAX_SETTINGS, ...globalRes.data })

    const map = {}
    ;(overrideRes.data || []).forEach((r) => { map[r.branch_id] = r })
    setOverrideRows(map)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    setOverrideTarget((prev) => (branches.some((b) => b.id === prev) ? prev : ''))
  }, [branches])

  if (!canManageTaxes(me?.role)) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
        <p className="text-stone-500">Only owners and admins can manage tax & VAT settings.</p>
      </div>
    )
  }

  const setGlobalField = (key, value) => setGlobal((g) => ({ ...g, [key]: value }))

  const saveGlobal = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    const payload = {
      is_vat_enabled: !!global.is_vat_enabled,
      vat_name: global.vat_name,
      vat_rate: Number(global.vat_rate) || 0,
      is_tax_enabled: !!global.is_tax_enabled,
      tax_name: global.tax_name,
      tax_rate: Number(global.tax_rate) || 0,
      service_charge_enabled: !!global.service_charge_enabled,
      service_charge_rate: Number(global.service_charge_rate) || 0,
      price_includes_tax: !!global.price_includes_tax
    }
    const { error } = await supabase
      .from('tax_settings')
      .update(payload)
      .eq('id', global.id)
      .select('id')
      .maybeSingle()

    if (error && /No rows/.test(error.message)) {
      const { error: insertError } = await supabase.from('tax_settings').insert([payload])
      if (insertError) { setError(insertError.message); setSaving(false); return }
    } else if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    setSaving(false)
    setSaved(true)
    logActivity({ module: 'tax', action: 'update', description: 'Updated global tax/VAT settings' })
    setTimeout(() => setSaved(false), 2500)
  }

  const openOverride = (branchId) => {
    const base = { ...DEFAULT_TAX_SETTINGS, ...global }
    const draft = mergeOverride(base, overrideRows[branchId])
    setOverrideTarget(branchId)
    setOverrideDraft(draft)
    setError(null)
  }

  const setDraft = (key, value) => setOverrideDraft((d) => ({ ...d, [key]: value }))

  const saveOverride = async (e) => {
    e.preventDefault()
    if (!overrideTarget) return
    setSaving(true)
    setError(null)
    const payload = {}
    OVERRIDE_KEYS.forEach((k) => { payload[k] = overrideDraft[k] })
    const { error } = await supabase
      .from('branch_tax_settings')
      .upsert({ branch_id: overrideTarget, ...payload }, { onConflict: 'branch_id' })
    setSaving(false)
    if (error) { setError(error.message); return }
    logActivity({
      module: 'tax',
      action: 'update',
      description: `Updated tax settings for ${branches.find((b) => b.id === overrideTarget)?.name || 'branch'}`,
      branchId: overrideTarget
    })
    setOverrideTarget('')
    load()
  }

  const clearOverride = async (branchId) => {
    if (!overrideRows[branchId]) return
    if (!window.confirm('Reset this branch to use the global tax settings?')) return
    const { error } = await supabase.from('branch_tax_settings').delete().eq('branch_id', branchId)
    if (error) { setError(error.message); return }
    logActivity({
      module: 'tax',
      action: 'update',
      description: `Cleared tax override for ${branches.find((b) => b.id === branchId)?.name || 'branch'}`,
      branchId
    })
    load()
  }

  const overrideFor = (branchId) => mergeOverride({ ...DEFAULT_TAX_SETTINGS, ...global }, overrideRows[branchId])
  const hasOverride = (branchId) => !!overrideRows[branchId]

  return (
    <div>
      <PageHeader title="Tax & VAT" subtitle="Configure sales tax, VAT and service charges. Branch overrides fall back to the global settings." />

      {loading ? (
        <p className="text-stone-500">Loading tax settings…</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Global settings */}
          <form onSubmit={saveGlobal} className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
            <div>
              <h2 className="font-semibold text-stone-900">Global settings</h2>
              <p className="text-sm text-stone-500">Applied to every branch unless overridden.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field f={FIELDS[0]} value={global.is_vat_enabled} onChange={setGlobalField} />
              <Field f={FIELDS[6]} value={global.service_charge_enabled} onChange={setGlobalField} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field f={FIELDS[1]} value={global.vat_name} onChange={setGlobalField} />
              <Field f={FIELDS[2]} value={global.vat_rate} onChange={setGlobalField} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field f={FIELDS[3]} value={global.is_tax_enabled} onChange={setGlobalField} />
              <Field f={FIELDS[8]} value={global.price_includes_tax} onChange={setGlobalField} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field f={FIELDS[4]} value={global.tax_name} onChange={setGlobalField} />
              <Field f={FIELDS[5]} value={global.tax_rate} onChange={setGlobalField} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field f={FIELDS[7]} value={global.service_charge_rate} onChange={setGlobalField} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center gap-4">
              <button type="submit" disabled={saving} className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
                {saving ? 'Saving…' : 'Save global settings'}
              </button>
              {saved && <span className="text-sm text-emerald-600 font-medium">Saved.</span>}
            </div>
          </form>

          {/* Branch overrides */}
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-semibold text-stone-900 mb-1">Branch overrides</h2>
            <p className="text-sm text-stone-500 mb-4">Customize tax rules for specific branches.</p>

            {branches.length === 0 ? (
              <p className="text-sm text-stone-400">No branches configured.</p>
            ) : (
              <div className="space-y-3">
                {branches.map((b) => {
                  const eff = overrideFor(b.id)
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-3 border border-stone-200 rounded-lg px-4 py-3">
                      <div>
                        <div className="font-medium text-stone-800">{b.name}</div>
                        <div className="text-xs text-stone-500">
                          {hasOverride(b.id)
                            ? `VAT ${Number(eff.vat_rate) || 0}% · Tax ${Number(eff.tax_rate) || 0}% · Service ${Number(eff.service_charge_rate) || 0}%`
                            : 'Using global settings'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openOverride(b.id)} className="px-3 py-1.5 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">
                          {hasOverride(b.id) ? 'Edit' : 'Override'}
                        </button>
                        {hasOverride(b.id) && (
                          <button onClick={() => clearOverride(b.id)} className="px-3 py-1.5 rounded-lg border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50">
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Override modal */}
      {overrideTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOverrideTarget('')} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-stone-900">
                Tax settings — {branches.find((b) => b.id === overrideTarget)?.name || 'Branch'}
              </h2>
              <button onClick={() => setOverrideTarget('')} className="text-stone-400 hover:text-stone-600" aria-label="Close">✕</button>
            </div>
            <form onSubmit={saveOverride} className="p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <Field f={FIELDS[0]} value={overrideDraft.is_vat_enabled} onChange={setDraft} />
                <Field f={FIELDS[6]} value={overrideDraft.service_charge_enabled} onChange={setDraft} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field f={FIELDS[1]} value={overrideDraft.vat_name} onChange={setDraft} />
                <Field f={FIELDS[2]} value={overrideDraft.vat_rate} onChange={setDraft} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field f={FIELDS[3]} value={overrideDraft.is_tax_enabled} onChange={setDraft} />
                <Field f={FIELDS[8]} value={overrideDraft.price_includes_tax} onChange={setDraft} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field f={FIELDS[4]} value={overrideDraft.tax_name} onChange={setDraft} />
                <Field f={FIELDS[5]} value={overrideDraft.tax_rate} onChange={setDraft} />
              </div>
              <Field f={FIELDS[7]} value={overrideDraft.service_charge_rate} onChange={setDraft} />
              <p className="text-xs text-stone-400">Only saved fields override the global settings. Unchanged values keep following the global configuration.</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setOverrideTarget('')} className="flex-1 px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
                  {saving ? 'Saving…' : 'Save override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
