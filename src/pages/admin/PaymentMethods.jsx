import { useEffect, useState } from 'react'
import supabase from '../../lib/supabase'
import { useBranch } from '../../context/BranchContext'
import PageHeader from '../../components/admin/PageHeader'
import EmptyState from '../../components/admin/EmptyState'

// Branch-wise payment method configuration. Owners/admins can switch branches
// (header switcher); managers are locked to their own branch by RLS.
export default function PaymentMethods() {
  const { activeBranch, activeBranchId } = useBranch()
  const [methods, setMethods] = useState([]) // [{ payment_method_id, is_enabled, payment_methods: {...} }]
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!activeBranchId) return
    let active = true
    setLoading(true)
    Promise.all([
      supabase.from('payment_methods').select('*').order('name'),
      supabase.from('branch_payment_methods').select('*, payment_methods(*)').eq('branch_id', activeBranchId)
    ]).then(([allRes, confRes]) => {
      if (!active) return
      if (allRes.error) { console.error(allRes.error.message); setLoading(false); return }
      const all = allRes.data || []
      const confMap = {}
      ;(confRes.data || []).forEach((c) => { confMap[c.payment_method_id] = c })
      // Show every method, defaulting to enabled when no config row exists.
      setMethods(all.map((m) => {
        const conf = confMap[m.id]
        return {
          payment_method_id: m.id,
          is_enabled: conf ? conf.is_enabled : true,
          payment_methods: m
        }
      }))
      setLoading(false)
    })
    return () => { active = false }
  }, [activeBranchId])

  if (!activeBranch) {
    return <p className="text-stone-500">Select a branch to configure payment methods.</p>
  }

  const toggle = async (row) => {
    const next = !row.is_enabled
    setSavingId(row.payment_method_id)
    setError(null)
    const { error: err } = await supabase
      .from('branch_payment_methods')
      .upsert({
        branch_id: activeBranchId,
        payment_method_id: row.payment_method_id,
        is_enabled: next
      }, { onConflict: 'branch_id,payment_method_id' })
    if (err) {
      setError(err.message)
    } else {
      setMethods(methods.map((m) => m.payment_method_id === row.payment_method_id ? { ...m, is_enabled: next } : m))
    }
    setSavingId(null)
  }

  return (
    <div>
      <PageHeader
        title="Payment Methods"
        subtitle={activeBranch ? `Methods available at ${activeBranch.name} for cashiers to accept` : 'Select a branch'}
      />

      {loading ? (
        <p className="text-stone-500">Loading…</p>
      ) : methods.length === 0 ? (
        <EmptyState message="No payment methods available." hint="Run the schema migrations to seed the default payment methods." />
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200 bg-stone-50">
                <th className="px-5 py-3 font-medium">Method</th>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {methods.map((row) => (
                <tr key={row.payment_method_id} className="border-b border-stone-50 hover:bg-stone-50/50">
                  <td className="px-5 py-3 font-medium text-stone-800">
                    {row.payment_methods.icon && <span className="mr-2">{row.payment_methods.icon}</span>}
                    {row.payment_methods.name}
                  </td>
                  <td className="px-5 py-3 text-stone-500 font-mono">{row.payment_methods.code}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => toggle(row)}
                      disabled={savingId === row.payment_method_id}
                      className={`text-xs font-medium rounded-full px-3 py-1 transition-colors disabled:opacity-50 ${
                        row.is_enabled
                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                          : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                      }`}
                    >
                      {row.is_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  )
}
