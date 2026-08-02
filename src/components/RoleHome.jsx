import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { fetchDefaultRoute } from '../lib/config'

// Landing route for the bare /admin path: resolves the configurable
// per-role default route and redirects there.
export default function RoleHome() {
  const { staff } = useAuth()
  const [route, setRoute] = useState(null)

  useEffect(() => {
    let active = true
    if (!staff?.role) return
    fetchDefaultRoute(staff.role).then((r) => {
      if (active) setRoute(r)
    })
    return () => { active = false }
  }, [staff?.role])

  if (!route) {
    return <div className="min-h-screen flex items-center justify-center bg-stone-100">
      <div className="text-stone-500">Redirecting…</div>
    </div>
  }
  return <Navigate to={route} replace />
}
