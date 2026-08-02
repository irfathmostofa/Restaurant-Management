import { usePublicSite } from '../../context/PublicSiteContext'

export default function Footer() {
  const { selectedBranch, branches } = usePublicSite()

  return (
    <footer id="contact" className="bg-stone-900 text-stone-300">
      <div className="max-w-7xl mx-auto px-4 py-10 grid md:grid-cols-3 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-600 text-white font-bold">R</span>
            <span className="font-semibold text-white">RestaurantHub</span>
          </div>
          <p className="text-sm text-stone-400">Fresh food, honest pricing, and great service across our branches.</p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">This branch</h3>
          {selectedBranch ? (
            <div className="text-sm space-y-2">
              <p className="font-medium text-stone-200">{selectedBranch.name}</p>
              <p className="flex items-start gap-2 text-stone-400">
                <span className="text-brand-400">📍</span> {selectedBranch.address || 'Address coming soon'}
              </p>
              <p className="flex items-start gap-2 text-stone-400">
                <span className="text-brand-400">📞</span> {selectedBranch.contact_info || 'Contact coming soon'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-stone-500">Select a branch to see its details.</p>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">All branches</h3>
          <ul className="text-sm space-y-1.5 text-stone-400">
            {branches.map((b) => (
              <li key={b.id} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                {b.name}
              </li>
            ))}
          </ul>
          <div className="flex gap-4 mt-4 text-sm">
            <a href="#" className="text-stone-400 hover:text-brand-400 transition-colors">Instagram</a>
            <a href="#" className="text-stone-400 hover:text-brand-400 transition-colors">Facebook</a>
            <a href="#" className="text-stone-400 hover:text-brand-400 transition-colors">X</a>
          </div>
        </div>
      </div>
      <div className="border-t border-stone-800 py-4 text-center text-xs text-stone-500">
        © {new Date().getFullYear()} RestaurantHub. All rights reserved.
      </div>
    </footer>
  )
}
