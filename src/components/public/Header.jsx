import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePublicSite } from '../../context/PublicSiteContext'
import { useMenuData } from '../../context/MenuDataContext'

const NAV_LINKS = [
  { href: '#popular', label: 'Popular' },
  { href: '#branches', label: 'Branches' },
  { href: '#menu', label: 'Menu' },
  { href: '#reserve', label: 'Reservation' },
  { href: '#contact', label: 'Contact' }
]

export default function Header() {
  const { branches, branchesLoaded, selectedBranchId, selectBranch } = usePublicSite()
  const { setBranchId } = useMenuData()

  useEffect(() => {
    setBranchId(selectedBranchId)
  }, [selectedBranchId, setBranchId])

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-stone-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-600 text-white font-bold text-lg">R</span>
          <span className="font-semibold text-stone-900 text-lg hidden sm:block">RestaurantHub</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-stone-600">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-brand-600 transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <label className="sr-only" htmlFor="branch-select">Branch</label>
          <select
            id="branch-select"
            value={selectedBranchId ?? ''}
            onChange={(e) => selectBranch(e.target.value)}
            disabled={!branchesLoaded}
            className="px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {!branchesLoaded && <option value="">Loading…</option>}
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>
    </header>
  )
}
