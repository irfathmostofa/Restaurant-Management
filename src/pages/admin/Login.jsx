import { useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { fetchDefaultRoute } from '../../lib/config'
import { logActivity } from '../../lib/activity'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/admin/dashboard'

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setError(error.message)
      return
    }
    if (data.user) {
      // Resolve the landing page for the signed-in user's role. The default
      // fallback (`/admin/dashboard`) is only used when the user was deep
      // linked to a specific page; otherwise we honour the configurable
      // per-role route stored in role_default_routes.
      let dest = from
      if (from === '/admin/dashboard') {
        const { data: staffRow } = await supabase.from('staff').select('role, branch_id').eq('user_id', data.user.id).maybeSingle()
        dest = await fetchDefaultRoute(staffRow?.role)
        logActivity({
          module: 'auth',
          action: 'login',
          description: `Signed in as ${data.user.email}`,
          branchId: staffRow?.branch_id
        })
      }
      setLoading(false)
      navigate(dest, { replace: true })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-stone-900 via-stone-800 to-brand-950 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-600 text-white font-bold text-xl mb-3">R</span>
          <h1 className="text-2xl font-bold text-white">RestaurantHub Staff Portal</h1>
          <p className="text-stone-400 text-sm mt-1">Sign in to manage your branch</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="you@restaurant.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="text-xs text-stone-400 text-center">
            No account? Ask your owner to create a staff profile for you.
          </p>
        </form>

        <div className="text-center mt-6">
          <Link to="/" className="text-sm text-stone-400 hover:text-white transition-colors">← Back to restaurant website</Link>
        </div>
      </div>
    </div>
  )
}
