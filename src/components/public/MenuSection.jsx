import { useState } from 'react'
import { useMenuData } from '../../context/MenuDataContext'
import { usePublicSite } from '../../context/PublicSiteContext'

export default function MenuSection() {
  const { categories, items, loading, error } = useMenuData()
  const { selectedBranch } = usePublicSite()
  const [activeCat, setActiveCat] = useState(null)

  if (!selectedBranch) return null

  const grouped = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id)
  }))

  const handleCatClick = (catId) => {
    setActiveCat(catId)
    document.getElementById(`menu-${catId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section id="menu" className="py-14 bg-stone-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-3xl font-bold text-stone-900">Our Menu</h2>
            <p className="text-stone-500 mt-1">From the kitchen of <span className="font-medium text-stone-700">{selectedBranch.name}</span></p>
          </div>
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-8" style={{ scrollbarWidth: 'thin' }}>
          <button
            onClick={() => { setActiveCat(null); document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' }) }}
            className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${activeCat === null ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-stone-600 border-stone-300 hover:border-brand-400'}`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCatClick(cat.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${activeCat === cat.id ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-stone-600 border-stone-300 hover:border-brand-400'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-stone-500">Loading menu…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <div className="space-y-10">
            {grouped.map((cat) => (
              <div key={cat.id} id={`menu-${cat.id}`} className="scroll-mt-24">
                <h3 className="text-xl font-semibold text-stone-800 mb-4 border-b-2 border-brand-200 pb-2">{cat.name}</h3>
                {cat.items.length === 0 ? (
                  <p className="text-sm text-stone-400 italic">No items in this category yet.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {cat.items.map((item) => (
                      <article key={item.id} className={`bg-white rounded-xl border border-stone-200 overflow-hidden flex ${item.is_available ? '' : 'opacity-60'}`}>
                        <div className="w-24 h-24 shrink-0 bg-stone-100 flex items-center justify-center text-3xl">
                          {item.photo_url ? <img src={item.photo_url} alt={item.name} className="w-full h-full object-cover" /> : <span>🍽️</span>}
                        </div>
                        <div className="p-4 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-semibold text-stone-900">{item.name}</h4>
                            <span className="font-semibold text-brand-700 whitespace-nowrap">${Number(item.price).toFixed(2)}</span>
                          </div>
                          {item.description && <p className="text-sm text-stone-500 mt-1 line-clamp-2">{item.description}</p>}
                          {!item.is_available && (
                            <span className="inline-block mt-2 text-xs font-medium bg-stone-200 text-stone-600 rounded-full px-2 py-0.5">Sold out</span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
