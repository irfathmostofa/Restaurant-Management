import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import supabase from "../../lib/supabase";
import { useBranch } from "../../context/BranchContext";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import { fetchSettings, DEFAULT_SETTINGS } from "../../lib/config";
import { hasKitchenItems } from "../../lib/kitchen";
import useOrderReadyNotifications from "../../hooks/useOrderReadyNotifications";
import { logActivity } from "../../lib/activity";
import PageHeader from "../../components/admin/PageHeader";
import Modal from "../../components/admin/Modal";
import { useToast } from "../../components/Toast";

export default function OrderTaking() {
  const { activeBranch, activeBranchId } = useBranch();
  const { success, warning, info } = useToast();
  const { staff } = useAuth();
  const { formatMoney } = useCurrency();
  const navigate = useNavigate();
  const [tables, setTables] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [orderType, setOrderType] = useState("dine-in");
  const [selectedTable, setSelectedTable] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [variantPickerItem, setVariantPickerItem] = useState(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const searchRef = useRef(null);
  const { notifications, dismiss } = useOrderReadyNotifications(activeBranchId);
  const canAccessBilling = ["owner", "admin", "manager", "cashier"].includes(
    staff?.role,
  );

  // Check if user is a waiter
  const isWaiter = staff?.role === "waiter";

  useEffect(() => {
    if (!activeBranchId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      supabase
        .from("tables")
        .select("*")
        .eq("branch_id", activeBranchId)
        .order("number"),
      supabase
        .from("branch_menu_items")
        .select(
          "is_available, menu_item_id, menu_items(*, menu_item_variants(*))",
        )
        .eq("branch_id", activeBranchId),
      supabase.from("categories").select("*").order("sort_order"),
    ]).then(([tablesRes, bmiRes, catRes]) => {
      if (!active) return;
      if (!tablesRes.error) setTables(tablesRes.data || []);
      if (!bmiRes.error) {
        const merged = (bmiRes.data || [])
          .filter((row) => row.menu_items)
          .map((row) => {
            const { menu_item_variants, ...item } = row.menu_items;
            return {
              ...item,
              branch_available: row.is_available,
              variants: (menu_item_variants || [])
                .slice()
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
            };
          })
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        setMenuItems(merged);
      }
      if (!catRes.error) setCategories(catRes.data || []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [activeBranchId]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      if (e.key === "Enter") {
        if (tag === "textarea" || tag === "select") return;
        if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
        if (canSubmitRef.current) {
          e.preventDefault();
          submitRef.current?.();
        }
        return;
      }
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "/" && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menuItems.filter((i) => {
      if (!i.is_available) return false;
      if (!i.branch_available) return false;
      if (activeCategory !== "all" && i.category_id !== activeCategory)
        return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menuItems, activeCategory, search]);

  const categoriesWithItems = useMemo(() => {
    const activeIds = new Set(
      menuItems
        .filter((i) => i.is_available && i.branch_available)
        .map((i) => i.category_id),
    );
    return categories.filter((c) => activeIds.has(c.id));
  }, [categories, menuItems]);

  const submitRef = useRef(null);
  const canSubmitRef = useRef(false);

  if (!activeBranch) {
    return <p className="text-stone-500">Select a branch to take orders.</p>;
  }

  const handleItemTap = (item) => {
    if (item.variants && item.variants.length > 0) setVariantPickerItem(item);
    else addLineToCart(item, null);
  };

  const addLineToCart = (item, variant) => {
    const key = variant ? `${item.id}:${variant.id}` : item.id;
    const name = variant ? `${item.name} (${variant.name})` : item.name;
    const price =
      Number(item.price) + (variant ? Number(variant.price_delta || 0) : 0);

    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing)
        return prev.map((c) =>
          c.key === key ? { ...c, quantity: c.quantity + 1 } : c,
        );
      return [
        {
          key,
          menu_item_id: item.id,
          variant_id: variant?.id || null,
          name,
          price,
          quantity: 1,
          notes: "",
          requires_kitchen: item.requires_kitchen !== false,
        },
        ...prev,
      ];
    });
    setVariantPickerItem(null);
  };

  const cartCountForItem = (itemId) =>
    cart
      .filter((c) => c.menu_item_id === itemId)
      .reduce((s, c) => s + c.quantity, 0);

  const updateQty = (key, delta) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.key === key
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  };

  const setNotes = (key, notes) =>
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, notes } : c)));

  const totalQty = cart.reduce((s, c) => s + c.quantity, 0);
  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const hasKitchenInCart = hasKitchenItems(cart);
  const availableTables = tables.filter((t) => t.status !== "occupied");
  const occupiedCount = tables.filter((t) => t.status === "occupied").length;
  const selectedTableInfo = tables.find((t) => t.id === selectedTable);

  const submitOrder = async () => {
    if (cart.length === 0) {
      setError("Add at least one item.");
      return;
    }
    if (orderType === "dine-in" && !selectedTable) {
      setError("Select a table for dine-in orders.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert([
        {
          branch_id: activeBranchId,
          table_id: orderType === "dine-in" ? selectedTable : null,
          type: orderType,
          status: hasKitchenInCart ? "received" : "ready",
          staff_id: staff?.id || null,
          customer_name: customerName || null,
          notes: orderNotes.trim() || null,
        },
      ])
      .select()
      .single();

    if (orderError) {
      setError(orderError.message);
      setSubmitting(false);
      return;
    }

    const settings = await fetchSettings();
    const defaultPrepTime =
      settings.default_prep_time || DEFAULT_SETTINGS.default_prep_time;

    const itemsPayload = cart.map((c) => ({
      order_id: order.id,
      branch_id: activeBranchId,
      menu_item_id: c.menu_item_id,
      name: c.name,
      quantity: c.quantity,
      notes: c.notes || null,
      price_at_order: c.price,
      requires_kitchen: c.requires_kitchen,
      kitchen_status: c.requires_kitchen ? "pending" : "ready",
      estimated_prep_time: c.requires_kitchen
        ? Number(defaultPrepTime) || 5
        : 0,
    }));
    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsPayload);
    if (itemsError) {
      await supabase
        .from("orders")
        .delete()
        .eq("id", order.id)
        .select()
        .then(({ error: delError }) => {
          if (delError)
            console.error(
              "Failed to roll back orphaned order:",
              delError.message,
            );
        });
      setSubmitting(false);
      setError(itemsError.message);
      return;
    }

    if (orderType === "dine-in") {
      await supabase
        .from("tables")
        .update({ status: "occupied" })
        .eq("id", selectedTable);
    }

    logActivity({
      module: "orders",
      action: "create",
      description: `Created ${orderType} order #${order.id.slice(0, 8).toUpperCase()} (${cart.length} item${cart.length === 1 ? "" : "s"}, ${formatMoney(total, { symbol: false })})`,
      branchId: activeBranchId,
      metadata: { order_id: order.id, type: orderType },
    });

    setSubmitting(false);
    setCart([]);
    setCustomerName("");
    setOrderNotes("");
    setSelectedTable(null);
    setMobileCartOpen(false);
    success("Order placed successfully!", 3000);
    // Redirect logic based on role
    if (isWaiter) {
      // Waiter stays on the same page - no navigation
      // Optionally show a success message
      setError(null); // Clear any previous errors
      // You could add a success toast or notification here
    } else if (canAccessBilling) {
      navigate("/admin/billing", { state: { newOrderId: order.id } });
    } else {
      navigate("/admin/orders");
    }
  };

  submitRef.current = submitOrder;
  canSubmitRef.current = cart.length > 0 && !submitting;

  const CartBody = () => (
    <>
      <div className="px-5 py-4 border-b border-stone-700 flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h2 className="font-bold">Current order</h2>
          <span className="text-xs text-stone-400">
            {orderType === "dine-in"
              ? selectedTableInfo
                ? `Table ${selectedTableInfo.number}`
                : "No table selected"
              : "Takeaway"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold rounded-full bg-stone-700 px-2.5 py-1">
            {totalQty} item{totalQty === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => setMobileCartOpen(false)}
            className="xl:hidden w-7 h-7 flex items-center justify-center rounded-full hover:bg-stone-700 text-stone-300"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3 min-h-0">
        {cart.length === 0 ? (
          <p className="text-sm text-stone-400 text-center py-10">
            Tap items to add them.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {cart.map((c) => (
              <li key={c.key} className="bg-stone-800 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="text-sm font-bold whitespace-nowrap">
                    {formatMoney(c.price * c.quantity)}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => updateQty(c.key, -1)}
                    className="w-7 h-7 rounded-md bg-stone-700 hover:bg-stone-600 text-lg leading-none"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-semibold">
                    {c.quantity}
                  </span>
                  <button
                    onClick={() => updateQty(c.key, 1)}
                    className="w-7 h-7 rounded-md bg-stone-700 hover:bg-stone-600 text-lg leading-none"
                  >
                    +
                  </button>
                  <span className="ml-auto text-xs text-stone-400">
                    {formatMoney(c.price)} each
                  </span>
                </div>
                <input
                  value={c.notes}
                  onChange={(e) => setNotes(c.key, e.target.value)}
                  placeholder="Notes (e.g. no onions)"
                  className="w-full px-2.5 py-1.5 rounded-md bg-stone-900 border border-stone-700 text-xs text-white placeholder-stone-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="px-5 pt-3 pb-5 border-t border-stone-700 shrink-0">
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex items-center justify-between mb-4">
          <span className="text-stone-300 font-medium">Total</span>
          <span className="text-2xl font-bold">{formatMoney(total)}</span>
        </div>
        <button
          onClick={submitOrder}
          disabled={submitting || cart.length === 0}
          className="w-full py-3.5 rounded-lg bg-brand-600 text-white font-bold hover:bg-brand-700 disabled:opacity-40 transition-colors active:scale-[0.99]"
        >
          {submitting
            ? "Placing order…"
            : hasKitchenInCart
              ? "Send to kitchen"
              : "Place order"}
        </button>
        <div className="flex items-center justify-between mt-3 text-sm">
          <Link
            to="/admin/orders"
            className="text-brand-400 hover:text-brand-300"
          >
            View order queue
          </Link>
          <button
            onClick={() => setCart([])}
            className="text-stone-400 hover:text-stone-200"
          >
            Clear cart
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div>
      <PageHeader
        title="POS / Order Taking"
        subtitle={`Take an order at ${activeBranch.name}`}
      />

      {notifications.length > 0 && (
        <div className="mb-5 space-y-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="flex items-center justify-between bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-4 py-3 text-sm"
            >
              <span>
                Order <b>#{n.shortId}</b> is ready to serve.
              </span>
              <button
                onClick={() => dismiss(n.id)}
                className="ml-4 text-emerald-700 font-medium hover:underline"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Order context bar */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="flex rounded-lg border border-stone-300 overflow-hidden shrink-0 w-full sm:w-auto">
            <button
              onClick={() => setOrderType("dine-in")}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold transition-colors ${orderType === "dine-in" ? "bg-brand-600 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
            >
              🍽 Dine-in
            </button>
            <button
              onClick={() => {
                setOrderType("takeaway");
                setSelectedTable(null);
              }}
              className={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold transition-colors ${orderType === "takeaway" ? "bg-brand-600 text-white" : "bg-white text-stone-600 hover:bg-stone-50"}`}
            >
              🥡 Takeaway
            </button>
          </div>

          {orderType === "dine-in" && (
            <div className="w-full sm:w-auto shrink-0 flex items-center gap-2">
              <select
                value={selectedTable ?? ""}
                onChange={(e) => setSelectedTable(e.target.value || null)}
                className={`w-full sm:w-auto px-3 py-2 rounded-lg border text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 ${!selectedTable ? "border-amber-300 text-amber-700" : "border-stone-300 text-stone-800"}`}
              >
                <option value="">Select table…</option>
                {availableTables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.number} · seats {t.capacity}
                  </option>
                ))}
              </select>
              {occupiedCount > 0 && (
                <span className="text-xs text-stone-400 whitespace-nowrap">
                  {occupiedCount} occupied
                </span>
              )}
            </div>
          )}

          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name (optional)"
            className="w-full sm:flex-1 sm:min-w-[160px] px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Order notes (optional)"
            className="w-full sm:flex-1 sm:min-w-[180px] px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Search + category filter bar */}
      <div className="mb-4 bg-white rounded-xl border border-stone-200 p-3 xl:sticky xl:top-24 z-10">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search menu… (press "/")'
            className="w-full sm:w-56 shrink-0 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1 sm:pb-0 sm:mb-0 ">
            <button
              onClick={() => setActiveCategory("all")}
              className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeCategory === "all" ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-stone-100"}`}
            >
              All items
            </button>
            {categoriesWithItems.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeCategory === cat.id ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4">
        {/* Product grid */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-stone-200 p-4 xl:h-[calc(100vh-260px)] xl:flex xl:flex-col overflow-hidden">
            {loading ? (
              <p className="text-stone-500 py-10 text-center">Loading menu…</p>
            ) : visibleItems.length === 0 ? (
              <p className="text-stone-400 py-10 text-center">
                No menu items match.{"\u00A0"}
                <Link
                  to="/admin/menu"
                  className="text-brand-600 hover:text-brand-700"
                >
                  Manage menu
                </Link>
              </p>
            ) : (
              <div className=" h-full overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-3 xl:gap-4">
                  {visibleItems.map((item) => {
                    const hasVariants =
                      item.variants && item.variants.length > 0;
                    const inCartQty = cartCountForItem(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemTap(item)}
                        className="relative flex flex-col text-left rounded-xl border-2 border-stone-200 hover:border-brand-500 bg-white hover:shadow-md transition-all active:scale-[0.97] overflow-hidden h-full"
                      >
                        {inCartQty > 0 && (
                          <span className="absolute top-2 right-2 z-10 min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full bg-brand-600 text-white text-xs font-bold shadow">
                            {inCartQty}
                          </span>
                        )}
                        {/* Fixed aspect ratio so every card's image area is the
                         same shape regardless of card width or row height. */}
                        <div className="aspect-[4/2] w-full shrink-0 bg-stone-100 flex items-center justify-center overflow-hidden">
                          {item.photo_url ? (
                            <img
                              src={item.photo_url}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-2xl text-stone-300">🍽</span>
                          )}
                        </div>
                        {/* flex-1 + min-h-0 guarantees this block always keeps
                         its own space instead of collapsing when the grid
                         stretches the card to match a taller row-sibling. */}
                        <div className="p-2.5 lg:p-3.5 flex-1 min-h-0 flex flex-col">
                          <div className="font-semibold text-stone-800 text-sm lg:text-[15px] leading-snug line-clamp-2 mb-1 lg:mb-1.5">
                            {item.name}
                          </div>
                          <div className="flex items-center justify-between mt-auto gap-1.5">
                            <span className="text-brand-700 text-sm lg:text-base font-bold whitespace-nowrap">
                              {hasVariants
                                ? `From ${formatMoney(item.price)}`
                                : formatMoney(item.price)}
                            </span>
                            <span
                              className={`shrink-0 text-[9px] lg:text-[10px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 lg:px-2 lg:py-1 ${item.requires_kitchen !== false ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}
                            >
                              {item.requires_kitchen !== false
                                ? "Kitchen"
                                : "Ready"}
                            </span>
                          </div>
                          {hasVariants && (
                            <div className="mt-1 lg:mt-1.5 text-[10px] lg:text-[11px] font-medium text-blue-600">
                              {item.variants.length} option
                              {item.variants.length === 1 ? "" : "s"} →
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Cart / receipt panel — desktop: fixed-height sticky column */}
        <div className="hidden xl:block w-[380px] shrink-0">
          <div className="bg-stone-900 text-white rounded-xl overflow-hidden sticky top-24 flex flex-col h-[calc(100vh-260px)]">
            <CartBody />
          </div>
        </div>
      </div>

      {cart.length > 0 && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="xl:hidden fixed bottom-4 left-4 right-4 z-30 flex items-center justify-between gap-3 bg-stone-900 text-white rounded-xl px-5 py-3.5 shadow-xl active:scale-[0.99] transition-transform"
        >
          <span className="flex items-center gap-2 font-semibold text-sm">
            <span className="w-6 h-6 flex items-center justify-center rounded-full bg-brand-600 text-xs">
              {totalQty}
            </span>
            View order
          </span>
          <span className="font-bold">{formatMoney(total)}</span>
        </button>
      )}

      {mobileCartOpen && (
        <div className="xl:hidden fixed inset-0 z-40 flex items-end">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileCartOpen(false)}
          />
          <div className="relative w-full bg-stone-900 text-white rounded-t-2xl flex flex-col h-[85vh] max-h-[85vh]">
            <CartBody />
          </div>
        </div>
      )}

      {/* Variant picker */}
      <Modal
        open={!!variantPickerItem}
        onClose={() => setVariantPickerItem(null)}
        title={
          variantPickerItem
            ? `Choose an option — ${variantPickerItem.name}`
            : "Choose an option"
        }
      >
        <div className="space-y-2">
          {variantPickerItem?.variants.map((v) => (
            <button
              key={v.id}
              onClick={() => addLineToCart(variantPickerItem, v)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-stone-200 hover:border-brand-400 hover:bg-brand-50/50 transition-colors text-left"
            >
              <span className="font-medium text-stone-800">{v.name}</span>
              <span className="text-sm font-semibold text-brand-700">
                {formatMoney(
                  Number(variantPickerItem.price) + Number(v.price_delta || 0),
                )}
              </span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
