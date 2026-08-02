import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import supabase from '../lib/supabase'

export const DEFAULT_CURRENCY = {
  name: 'US Dollar',
  iso_code: 'USD',
  symbol: '$',
  symbol_position: 'before',
  decimal_precision: 2,
  thousand_separator: ','
}

const CurrencyContext = createContext(null)

// Loads the single-row currency configuration once and exposes a
// `formatMoney` helper used by every monetary display in the app.
export function CurrencyProvider({ children }) {
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('currency_settings')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setCurrency({ ...DEFAULT_CURRENCY, ...data })
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const formatMoney = useCallback((amount, opts = {}) => {
    const n = Number(amount || 0)
    const precision = currency.decimal_precision ?? DEFAULT_CURRENCY.decimal_precision
    const fixed = n.toFixed(precision)
    const [int, dec] = fixed.split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousand_separator || ',')
    const body = dec !== undefined ? `${grouped}.${dec}` : grouped
    const sym = opts.symbol === false ? '' : (currency.symbol || '$')
    return currency.symbol_position === 'after' ? `${body} ${sym}`.trim() : `${sym}${body}`
  }, [currency])

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('currency_settings').select('*').limit(1).maybeSingle()
    if (data) setCurrency({ ...DEFAULT_CURRENCY, ...data })
    return data || null
  }, [])

  return (
    <CurrencyContext.Provider value={{ currency, formatMoney, loading, refresh }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export const useCurrency = () => useContext(CurrencyContext)
