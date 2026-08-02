import { Link } from 'react-router-dom'
import { usePublicSite } from '../../context/PublicSiteContext'

export default function OurBranches() {
  const { branches } = usePublicSite()

  if (branches.length === 0) return null

  return (
    <section id="branches" className="py-14 bg-stone-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="mb-8">
          <p className="text-sm font-medium text-brand-600 uppercase tracking-wide mb-1">Find us</p>
          <h2 className="text-3xl font-bold text-stone-900">Our branches</h2>
          <p className="text-stone-500 mt-1">Every branch has its own menu, kitchen and team.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {branches.map((b) => (
            <article key={b.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden flex flex-col hover:shadow-lg transition-shadow">
              <div className="h-40 bg-stone-100 overflow-hidden">
                {b.image_url
                  ? <img src={b.image_url} alt={b.name} loading="lazy" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-4xl text-stone-300">🏠</div>}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-semibold text-lg text-stone-900 mb-1">{b.name}</h3>
                {b.description && <p className="text-sm text-stone-500 mb-3">{b.description}</p>}

                <dl className="space-y-2 text-sm text-stone-600 mb-4">
                  {b.address && (
                    <div className="flex items-start gap-2">
                      <span className="text-brand-500 shrink-0">📍</span>
                      <span>{b.address}</span>
                    </div>
                  )}
                  {b.contact_info && (
                    <div className="flex items-center gap-2">
                      <span className="text-brand-500 shrink-0">📞</span>
                      <span>{b.contact_info}</span>
                    </div>
                  )}
                  {b.opening_hours && (
                    <div className="flex items-center gap-2">
                      <span className="text-brand-500 shrink-0">🕐</span>
                      <span>{b.opening_hours}</span>
                    </div>
                  )}
                </dl>

                <div className="mt-auto flex flex-wrap gap-3 pt-3 border-t border-stone-100">
                  <Link to={`/branch/${b.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">View menu</Link>
                  {b.map_link && (
                    <a href={b.map_link} target="_blank" rel="noreferrer" className="text-sm font-medium text-stone-500 hover:text-stone-700">Open in maps</a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
