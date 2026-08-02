import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useBranch } from '../../context/BranchContext'
import { NAV_BY_ROLE, ROLE_LABELS, DEFAULT_ROUTE_BY_ROLE } from '../../lib/roles'
import Icon from '../Icon'
import supabase from '../../lib/supabase'

export default function AdminShell() {
  const { staff, session } = useAuth()
  const { branches, activeBranch, activeBranchId, setActiveBranchId, canSwitchBranches } = useBranch()
  const navigate = useNavigate()

  if (!staff || !session) return null

  const nav = NAV_BY_ROLE[staff.role] || []

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-stone-100 flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-stone-900 text-stone-300 flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="px-5 py-5 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-600 text-white font-bold">R</span>
            <div>
              <div className="font-semibold text-white text-sm leading-tight">RestaurantHub</div>
              <div className="text-xs text-stone-500">Staff Portal</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-600 text-white' : 'text-stone-400 hover:bg-stone-800 hover:text-white'
                }`
              }
            >
              <Icon name={item.icon} className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-stone-800 space-y-3">
          <div className="text-sm">
            <div className="font-medium text-white">{staff.name}</div>
            <div className="text-xs text-stone-500">{ROLE_LABELS[staff.role] || staff.role}</div>
            {activeBranch && <div className="text-xs text-brand-400 mt-1">{activeBranch.name}</div>}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
          >
            <Icon name="log-out" className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 ml-60 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-stone-200 px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-stone-500">
            <button onClick={() => navigate(DEFAULT_ROUTE_BY_ROLE[staff.role] || '/admin/dashboard')} className="hover:text-brand-600">
              {DEFAULT_ROUTE_BY_ROLE[staff.role]?.includes('order-taking') ? 'Order Taking' : 'Dashboard'}
            </button>
          </div>
          {canSwitchBranches && (
            <select
              value={activeBranchId ?? ''}
              onChange={(e) => setActiveBranchId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {!activeBranchId && <option value="">Select branch</option>}
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {!canSwitchBranches && activeBranch && (
            <span className="text-sm font-medium text-stone-600">Branch: {activeBranch.name}</span>
          )}
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
