import { useEffect, useState, useCallback } from 'react'
import { usePublicSite } from '../../context/PublicSiteContext'
import { useMenuData } from '../../context/MenuDataContext'
import supabase from '../../lib/supabase'

export default function Hero() {
  const { branches, selectedBranchId, selectedBranch } = usePublicSite()
  const { setBranchId } = useMenuData()

  const [form, setForm] = useState({
    branch_id: '',
    customer_name: '',
    contact: '',
    party_size: 2,
    date: '',
    time: '19:00'
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null)
  const [error, setError] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [availabilityDate, setAvailabilityDate] = useState('')

  const todayStr = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    if (selectedBranchId) {
      setForm((f) => ({ ...f, branch_id: selectedBranchId }))
      setSuccess(null)
    }
  }, [selectedBranchId])

  useEffect(() => {
    setBranchId(selectedBranchId)
  }, [selectedBranchId, setBranchId])

  const loadAvailability = useCallback(async (branchId, date) => {
    if (!branchId) return
    const dateStr = date || new Date().toISOString().slice(0, 10)
    setAvailabilityDate(dateStr)
    const { data: tables, error } = await supabase.rpc('available_tables', { branch: branchId })
    if (error) {
      setAvailability(null)
      return
    }
    const total = tables
    const { data: reserved } = await supabase.rpc('reserved_tables', { branch: branchId, on_date: dateStr })
    const open = Math.max(0, (total || 0) - (reserved || 0))
    setAvailability({ total: total || 0, reserved: reserved || 0, open })
  }, [])

  useEffect(() => {
    if (selectedBranchId) loadAvailability(selectedBranchId, form.date)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- form.date handled via dep below
  }, [selectedBranchId, form.date])

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
    setSuccess(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    const { error } = await supabase.from('reservations').insert([{
      branch_id: form.branch_id,
      customer_name: form.customer_name,
      contact: form.contact,
      party_size: Number(form.party_size),
      date: form.date,
      time: form.time
    }])
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    setSuccess({
      name: form.customer_name,
      branch: branches.find((b) => b.id === form.branch_id)?.name || '',
      date: form.date,
      time: form.time,
      party_size: form.party_size
    })
    setForm((f) => ({ ...f, customer_name: '', contact: '' }))
    loadAvailability(form.branch_id, form.date)
  }

  return (
    <section id="reserve" className="relative overflow-hidden bg-gradient-to-br from-stone-900 via-stone-800 to-brand-950 text-white">
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #f0821f 0, transparent 40%), radial-gradient(circle at 80% 60%, #f39b46 0, transparent 30%)' }} />
      <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm text-brand-200 mb-4">
            <span className="text-brand-300">✦</span> Welcome to RestaurantHub
          </p>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4">
            Delicious food, <br />
            <span className="text-brand-400">served your way.</span>
          </h1>
          <p className="text-stone-300 text-lg mb-6 max-w-md">
            Fresh ingredients, honest recipes, and warm hospitality at our branches.
            Reserve a table in seconds.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <div className="rounded-lg bg-white/10 px-4 py-2 flex items-center gap-2">
              <span className="text-brand-300">{selectedBranch ? selectedBranch.name : '—'}</span>
            </div>
          </div>

          {/* Branch-wise availability */}
          <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/10">
            <h2 className="text-sm font-semibold text-brand-200 mb-3">Table availability — {selectedBranch?.name ?? 'select a branch'}</h2>
            {availability ? (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-white/10 p-3">
                  <div className="text-2xl font-bold">{availability.open}</div>
                  <div className="text-xs text-stone-400">Tables open on {availabilityDate}</div>
                </div>
                <div className="rounded-lg bg-white/10 p-3">
                  <div className="text-2xl font-bold">{availability.reserved}</div>
                  <div className="text-xs text-stone-400">Reserved</div>
                </div>
                <div className="rounded-lg bg-white/10 p-3">
                  <div className="text-2xl font-bold">{availability.total}</div>
                  <div className="text-xs text-stone-400">Total tables</div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-400">Pick a branch and date to see live availability.</p>
            )}
          </div>
        </div>

        {/* Reservation form */}
        <div className="bg-white text-stone-900 rounded-2xl shadow-2xl p-6 md:p-8">
          <h2 className="text-xl font-bold mb-1">Reserve a table</h2>
          <p className="text-sm text-stone-500 mb-5">We’ll hold your table for 15 minutes.</p>

          {success ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
              </div>
              <h3 className="font-semibold text-emerald-800 mb-1">Reservation confirmed!</h3>
              <p className="text-sm text-emerald-700">
                Thanks {success.name}! We’ve received your request for {success.party_size} at {success.branch} on {success.date} at {success.time}.
              </p>
              <button
                onClick={() => setSuccess(null)}
                className="mt-4 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Make another reservation
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">Branch</label>
                <select
                  name="branch_id"
                  value={form.branch_id}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Select a branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
                  <input
                    name="customer_name"
                    value={form.customer_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Contact</label>
                  <input
                    name="contact"
                    value={form.contact}
                    onChange={handleChange}
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    placeholder="Phone / email"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Party size</label>
                  <input
                    type="number"
                    name="party_size"
                    min="1"
                    max="20"
                    value={form.party_size}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Date</label>
                  <input
                    type="date"
                    name="date"
                    min={todayStr}
                    value={form.date}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">Time</label>
                  <input
                    type="time"
                    name="time"
                    value={form.time}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? 'Booking…' : 'Reserve a table'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
