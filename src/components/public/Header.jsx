import { useEffect, useState } from 'react'
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
  const [menuOpen, setMenuOpen] = useState(false)

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

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-stone-300 text-stone-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile navigation */}
      {menuOpen && (
        <nav className="md:hidden border-t border-stone-200 bg-white px-4 py-3 flex flex-col gap-1 text-sm font-medium text-stone-600">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="px-2 py-2 rounded-lg hover:bg-stone-50 hover:text-brand-600">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  )
}
