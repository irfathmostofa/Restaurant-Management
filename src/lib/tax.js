// Tax / VAT calculation helpers.
//
// Tax configuration lives in `tax_settings` (global) and `branch_tax_settings`
// (per-branch overrides). The client merges them with fetchEffectiveTaxSettings
// and every total shown in the POS, billing and invoices is computed here so
// there is a single source of truth.

import supabase from './supabase'

export const DEFAULT_TAX_SETTINGS = {
  is_vat_enabled: false,
  vat_name: 'VAT',
  vat_rate: 0,
  is_tax_enabled: false,
  tax_name: 'Tax',
  tax_rate: 0,
  service_charge_enabled: false,
  service_charge_rate: 0,
  price_includes_tax: false
}

const TAX_KEYS = [
  'is_vat_enabled',
  'vat_name',
  'vat_rate',
  'is_tax_enabled',
  'tax_name',
  'tax_rate',
  'service_charge_enabled',
  'service_charge_rate',
  'price_includes_tax'
]

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

// Merges the global tax settings with a branch override (branch values win
// where they are not null).
export async function fetchEffectiveTaxSettings(branchId) {
  const [globalRes, branchRes] = await Promise.all([
    supabase.from('tax_settings').select('*').limit(1).maybeSingle(),
    branchId
      ? supabase.from('branch_tax_settings').select('*').eq('branch_id', branchId).maybeSingle()
      : Promise.resolve({ data: null })
  ])
  const g = globalRes.data ? { ...DEFAULT_TAX_SETTINGS, ...globalRes.data } : { ...DEFAULT_TAX_SETTINGS }
  const b = branchRes.data
  if (!b) return g
  const merged = { ...g }
  TAX_KEYS.forEach((k) => { if (b[k] !== null && b[k] !== undefined) merged[k] = b[k] })
  return merged
}

/**
 * Computes every total for an order.
 *  - discount is subtracted from the subtotal before tax is applied
 *  - when price_includes_tax is true, VAT/tax are "unwound" from the price
 *  - the service charge is always calculated on the original subtotal
 */
export function computeTotals({ subtotal, discount = 0, taxSettings }) {
  const t = taxSettings || DEFAULT_TAX_SETTINGS
  const vatRate = Number(t.vat_rate) || 0
  const taxRate = Number(t.tax_rate) || 0
  const svcRate = Number(t.service_charge_rate) || 0
  const base = round2(Math.max(0, Number(subtotal) || 0))
  const disc = round2(Math.min(base, Math.max(0, Number(discount) || 0)))
  const discounted = round2(base - disc)

  let vat = 0
  let tax = 0
  if (t.price_includes_tax) {
    // Menu prices already include VAT/tax. The customer pays the discounted
    // price; VAT/tax are informational breakdowns of the amount embedded in
    // the price, derived from the combined net base.
    const totalRate = (t.is_vat_enabled ? vatRate : 0) + (t.is_tax_enabled ? taxRate : 0)
    if (totalRate > 0) {
      const net = round2(discounted / (1 + totalRate / 100))
      if (t.is_vat_enabled && vatRate > 0) vat = round2((net * vatRate) / 100)
      if (t.is_tax_enabled && taxRate > 0) tax = round2((net * taxRate) / 100)
    }
  } else {
    if (t.is_vat_enabled && vatRate > 0) vat = round2((discounted * vatRate) / 100)
    if (t.is_tax_enabled && taxRate > 0) tax = round2((discounted * taxRate) / 100)
  }

  const serviceCharge = t.service_charge_enabled && svcRate > 0 ? round2((base * svcRate) / 100) : 0
  // In inclusive mode the total is the (already tax-inclusive) discounted
  // amount plus the service charge; taxes must not be added again on top.
  const grandTotal = round2(
    t.price_includes_tax ? discounted + serviceCharge : discounted + vat + tax + serviceCharge
  )

  return { subtotal: base, discount: disc, vat, tax, serviceCharge, grandTotal }
}
