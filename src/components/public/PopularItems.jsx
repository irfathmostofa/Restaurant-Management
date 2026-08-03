import { useEffect, useRef, useState } from "react";
import supabase from "../../lib/supabase";
import { usePublicSite } from "../../context/PublicSiteContext";
import { useCurrency } from "../../context/CurrencyContext";

export default function PopularItems() {
  const { selectedBranchId } = usePublicSite();
  const { formatMoney } = useCurrency();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (!selectedBranchId) return;
    let active = true;
    setLoading(true);
    // menu_items is GLOBAL now — "featured AND available AND on this
    // branch's menu" has to be resolved through branch_menu_items.
    supabase
      .from("branch_menu_items")
      .select("is_available, menu_items!inner(*)")
      .eq("branch_id", selectedBranchId)
      .eq("is_available", true)
      .eq("menu_items.is_featured", true)
      .eq("menu_items.is_available", true)
      .order("sort_order", { referencedTable: "menu_items" })
      .limit(8)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setItems([]);
        } else {
          setItems((data || []).map((row) => row.menu_items).filter(Boolean));
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedBranchId]);

  const updateScrollState = () => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
  }, [items]);

  const scrollByCards = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector("[data-card]");
    const cardWidth = card
      ? card.getBoundingClientRect().width + 20
      : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * cardWidth * 2, behavior: "smooth" });
  };

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <section id="popular" className="py-14 bg-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-sm font-medium text-brand-600 uppercase tracking-wide mb-1">
              Customer favourites
            </p>
            <h2 className="text-3xl font-bold text-stone-900">
              Popular menu items
            </h2>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <a
              href="#menu"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View full menu →
            </a>
            <div className="flex items-center gap-2 ml-2">
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                disabled={!canScrollLeft}
                aria-label="Scroll left"
                className="w-9 h-9 rounded-full border border-stone-300 flex items-center justify-center text-stone-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                disabled={!canScrollRight}
                aria-label="Scroll right"
                className="w-9 h-9 rounded-full border border-stone-300 flex items-center justify-center text-stone-600 hover:border-brand-400 hover:text-brand-600 disabled:opacity-30 disabled:pointer-events-none transition-colors"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div
          ref={trackRef}
          onScroll={updateScrollState}
          className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-1 px-1"
          style={{ scrollbarWidth: "thin" }}
        >
          {items.map((item) => (
            <article
              key={item.id}
              data-card
              className="group snap-start shrink-0 w-[65%] xs:w-[55%] sm:w-[42%] md:w-[31%] lg:w-[23%] bg-white rounded-xl border border-stone-200 overflow-hidden hover:shadow-lg hover:border-brand-200 transition-shadow"
            >
              <div className="h-32 bg-stone-100 overflow-hidden">
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    alt={item.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl text-stone-300">
                    &#127869;
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-stone-900">{item.name}</h3>
                  <span className="font-bold text-brand-700 whitespace-nowrap">
                    {formatMoney(item.price)}
                  </span>
                </div>
                {item.description && (
                  <p className="text-sm text-stone-500 mt-1 line-clamp-2">
                    {item.description}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>

        <a
          href="#menu"
          className="sm:hidden mt-4 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          View full menu →
        </a>
      </div>
    </section>
  );
}
