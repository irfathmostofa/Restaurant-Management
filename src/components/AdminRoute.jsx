import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isRouteAllowedForRole } from '../lib/roles'
import supabase from '../lib/supabase'

export default function AdminRoute() {
  const { session, staff, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="text-stone-500">Loading…</div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  if (!staff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100">
        <div className="text-center max-w-md p-8 bg-white rounded-xl shadow">
          <h1 className="text-xl font-semibold mb-2">No staff profile</h1>
          <p className="text-stone-600 mb-4">
            Your account is not linked to a staff profile. Ask an owner to assign you a
            role and branch.
          </p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  // Route-level access control: block even if the URL is guessed.
  if (!isRouteAllowedForRole(staff.role, location.pathname)) {
    return <Navigate to="/admin/forbidden" replace />
  }

  return <Outlet />
}
