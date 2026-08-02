import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import supabase from '../../lib/supabase'
import { usePublicSite } from '../../context/PublicSiteContext'
import { useCurrency } from '../../context/CurrencyContext'

export default function PopularItems() {
  const { selectedBranchId } = usePublicSite()
  const { formatMoney } = useCurrency()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedBranchId) return
    let active = true
    setLoading(true)
    supabase
      .from('menu_items')
      .select('*')
      .eq('branch_id', selectedBranchId)
      .eq('is_featured', true)
      .eq('is_available', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (!active) return
        if (error) { setItems([]) } else { setItems(data || []) }
        setLoading(false)
      })
    return () => { active = false }
  }, [selectedBranchId])

  if (loading) return null
  if (items.length === 0) return null

  return (
    <section id="popular" className="py-14 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-sm font-medium text-brand-600 uppercase tracking-wide mb-1">Customer favourites</p>
            <h2 className="text-3xl font-bold text-stone-900">Popular menu items</h2>
          </div>
          <Link to="#menu" className="hidden sm:inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
            View full menu →
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {items.slice(0, 8).map((item) => (
            <article key={item.id} className="group bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-lg hover:border-brand-200 transition-shadow">
              <div className="h-32 bg-stone-100 overflow-hidden">
                {item.photo_url
                  ? <img src={item.photo_url} alt={item.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  : <div className="w-full h-full flex items-center justify-center text-3xl text-stone-300">&#127869;</div>}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-stone-900">{item.name}</h3>
                  <span className="font-bold text-brand-700 whitespace-nowrap">{formatMoney(item.price)}</span>
                </div>
                {item.description && <p className="text-sm text-stone-500 mt-1 line-clamp-2">{item.description}</p>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
