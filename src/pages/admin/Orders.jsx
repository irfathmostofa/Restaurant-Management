import { useEffect, useState, useCallback } from "react";
import supabase from "../../lib/supabase";
import { useBranch } from "../../context/BranchContext";
import { useAuth } from "../../context/AuthContext";
import { useCurrency } from "../../context/CurrencyContext";
import PageHeader from "../../components/admin/PageHeader";
import EmptyState from "../../components/admin/EmptyState";
import {
  KITCHEN_STATUS,
  KITCHEN_STATUS_LABELS,
  kitchenItemsOf,
  hasKitchenItems,
  orderKitchenStatus,
  orderKitchenEta,
} from "../../lib/kitchen";

const STATUS_STYLE = {
  received: "bg-amber-100 text-amber-700",
  preparing: "bg-sky-100 text-sky-700",
  ready: "bg-emerald-100 text-emerald-700",
  served: "bg-stone-200 text-stone-600",
  paid: "bg-stone-100 text-stone-500",
  cancelled: "bg-red-100 text-red-700",
};

const NEXT_STATUS = {
  received: "preparing",
  preparing: "ready",
  ready: "served",
  served: "paid",
  paid: null,
  cancelled: null,
};

const KITCHEN_STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-700",
  preparing: "bg-sky-100 text-sky-700",
  ready: "bg-emerald-100 text-emerald-700",
};

const groupBy = (arr, key) =>
  (arr || []).reduce((acc, item) => {
    (acc[item[key]] = acc[item[key]] || []).push(item);
    return acc;
  }, {});

// mm:ss for a countdown, "+mm:ss" once it goes past zero (overdue).
const formatCountdown = (totalSeconds) => {
  const overdue = totalSeconds < 0;
  const s = Math.abs(Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const str = `${m}:${String(sec).padStart(2, "0")}`;
  return overdue ? `+${str}` : str;
};

export default function Orders() {
  const { activeBranch, activeBranchId } = useBranch();
  const { staff } = useAuth();
  const { formatMoney } = useCurrency();
  const isKitchen = staff?.role === "kitchen";
  const [orders, setOrders] = useState([]);
  const [itemsByOrder, setItemsByOrder] = useState({});
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPaid, setShowPaid] = useState(false);
  const [busy, setBusy] = useState({});
  // Shared clock tick — one interval for the whole board, not one per
  // ticket, so live countdown timers stay in sync and cheap.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isKitchen) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isKitchen]);

  const loadItems = useCallback(async (orderIds) => {
    if (orderIds.length === 0) return;
    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .in("order_id", orderIds);
    if (error) return;
    setItemsByOrder((prev) => ({ ...prev, ...groupBy(data, "order_id") }));
  }, []);

  useEffect(() => {
    if (!activeBranchId) return;
    let active = true;
    setLoading(true);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("orders")
      .select("*")
      .eq("branch_id", activeBranchId)
      .or(`status.in.(received,preparing,ready,served),created_at.gt.${cutoff}`)
      .order("created_at", { ascending: false })
      .then(async ({ data: ordersData, error: ordersError }) => {
        if (!active) return;
        if (!ordersError && ordersData) setOrders(ordersData);
        const ids = (ordersData || []).map((o) => o.id);
        if (ids.length > 0) {
          const { data: itemsData } = await supabase
            .from("order_items")
            .select("*")
            .in("order_id", ids);
          if (active && itemsData)
            setItemsByOrder(groupBy(itemsData, "order_id"));
        }
        const { data: tablesData } = await supabase
          .from("tables")
          .select("id, number")
          .eq("branch_id", activeBranchId);
        if (active && tablesData) setTables(tablesData);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activeBranchId]);

  useEffect(() => {
    if (!activeBranchId) return;
    const channel = supabase
      .channel("orders-realtime-" + activeBranchId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `branch_id=eq.${activeBranchId}`,
        },
        (payload) => {
          setOrders((prev) => {
            if (payload.eventType === "DELETE")
              return prev.filter((o) => o.id !== payload.old.id);
            if (payload.eventType === "INSERT") {
              loadItems([payload.new.id]);
              return [payload.new, ...prev];
            }
            return prev.map((o) => (o.id === payload.new.id ? payload.new : o));
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBranchId, loadItems]);

  useEffect(() => {
    if (!activeBranchId) return;
    const channel = supabase
      .channel("items-realtime-" + activeBranchId)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_items",
          filter: `branch_id=eq.${activeBranchId}`,
        },
        (payload) => {
          setItemsByOrder((prev) => {
            const next = { ...prev };
            const list =
              next[payload.new?.order_id || payload.old?.order_id] || [];
            if (payload.eventType === "DELETE") {
              next[payload.old.order_id] = list.filter(
                (it) => it.id !== payload.old.id,
              );
            } else {
              const merged = list.filter((it) => it.id !== payload.new.id);
              next[payload.new.order_id] = [...merged, payload.new];
            }
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeBranchId]);

  if (!activeBranch)
    return <p className="text-stone-500">Select a branch to view orders.</p>;

  const tableNumber = (id) => tables.find((t) => t.id === id)?.number;

  const setStatus = async (order, status) => {
    await supabase.from("orders").update({ status }).eq("id", order.id);
    setOrders(orders.map((o) => (o.id === order.id ? { ...o, status } : o)));
  };

  const updateKitchenItems = async (orderId, patch) => {
    const { data: items } = await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", orderId)
      .neq("kitchen_status", KITCHEN_STATUS.READY);
    const ids = (items || []).map((i) => i.id);
    if (ids.length) {
      await supabase.from("order_items").update(patch).in("id", ids);
    }
  };

  const startPreparing = async (order) => {
    setBusy((b) => ({ ...b, [order.id]: "start" }));
    await updateKitchenItems(order.id, {
      kitchen_status: KITCHEN_STATUS.PREPARING,
      prep_started_at: new Date().toISOString(),
    });
    await supabase
      .from("orders")
      .update({ status: "preparing" })
      .eq("id", order.id);
    setBusy((b) => ({ ...b, [order.id]: null }));
  };

  const addPrepMinutes = async (order, minutes) => {
    setBusy((b) => ({ ...b, [order.id]: `+${minutes}` }));
    const { data: items } = await supabase
      .from("order_items")
      .select("id, estimated_prep_time")
      .eq("order_id", order.id)
      .neq("kitchen_status", KITCHEN_STATUS.READY);
    for (const it of items || []) {
      await supabase
        .from("order_items")
        .update({
          estimated_prep_time: Number(it.estimated_prep_time) + minutes,
        })
        .eq("id", it.id);
    }
    setBusy((b) => ({ ...b, [order.id]: null }));
  };

  const markReady = async (order) => {
    setBusy((b) => ({ ...b, [order.id]: "ready" }));
    await updateKitchenItems(order.id, {
      kitchen_status: KITCHEN_STATUS.READY,
    });
    await supabase
      .from("orders")
      .update({ status: "ready" })
      .eq("id", order.id);
    setBusy((b) => ({ ...b, [order.id]: null }));
  };

  const orderTotal = (id) =>
    (itemsByOrder[id] || []).reduce(
      (sum, it) => sum + Number(it.price_at_order) * it.quantity,
      0,
    );

  const displayed = isKitchen
    ? orders
        .filter((o) => !["paid", "cancelled"].includes(o.status))
        .filter((o) => hasKitchenItems(itemsByOrder[o.id]))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : orders.filter((o) =>
        showPaid ? true : !["paid", "cancelled"].includes(o.status),
      );

  const KitchenTicket = ({ order }) => {
    const items = itemsByOrder[order.id] || [];
    const kitchenItems = kitchenItemsOf(items);
    const status = orderKitchenStatus(items) || KITCHEN_STATUS.PENDING;
    const eta = orderKitchenEta(items);
    const isReady = status === KITCHEN_STATUS.READY;
    const isPreparing = status === KITCHEN_STATUS.PREPARING;
    const isBusy = busy[order.id];

    // Live countdown: earliest prep_started_at among items currently
    // preparing, target = that item's own estimated_prep_time (in minutes,
    // grows when staff taps +1/+2/+5). Falls back gracefully if items were
    // started at slightly different times.
    let countdownSeconds = null;
    let overdue = false;
    if (isPreparing) {
      const preparingItems = kitchenItems.filter(
        (it) =>
          it.kitchen_status === KITCHEN_STATUS.PREPARING && it.prep_started_at,
      );
      if (preparingItems.length > 0) {
        const remainders = preparingItems.map((it) => {
          const startedMs = new Date(it.prep_started_at).getTime();
          const targetMs =
            startedMs + Number(it.estimated_prep_time || 0) * 60000;
          return (targetMs - now) / 1000;
        });
        // Show the item with the least time remaining — the one about to
        // (or already) breach its target.
        countdownSeconds = Math.min(...remainders);
        overdue = countdownSeconds < 0;
      }
    }

    return (
      <div
        className={`bg-white rounded-xl border p-5 ${isReady ? "border-emerald-200" : overdue ? "border-red-300" : "border-stone-200"}`}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <span className="text-xs uppercase tracking-wide text-stone-400">
              Order
            </span>
            <div className="font-bold text-stone-900 text-lg">
              #{order.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span
              className={`text-xs font-medium rounded-full px-2.5 py-1 ${KITCHEN_STATUS_STYLE[status]}`}
            >
              {KITCHEN_STATUS_LABELS[status]}
            </span>
            <span className="text-xs text-stone-400 capitalize">
              {order.type}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3 text-sm">
          <div>
            <span className="text-xs text-stone-400 block">Table</span>
            <span className="font-medium">
              {order.type === "takeaway"
                ? "Takeaway"
                : tableNumber(order.table_id) || "—"}
            </span>
          </div>
          <div>
            <span className="text-xs text-stone-400 block">Customer</span>
            <span className="font-medium truncate">
              {order.customer_name || "Guest"}
            </span>
          </div>
        </div>

        <ul className="text-sm text-stone-800 space-y-1 mb-4">
          {kitchenItems.map((it) => (
            <li key={it.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {it.quantity}× {it.name}
                </span>
                <span
                  className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${KITCHEN_STATUS_STYLE[it.kitchen_status]}`}
                >
                  {KITCHEN_STATUS_LABELS[it.kitchen_status]}
                </span>
              </div>
              {it.notes && (
                <p className="text-xs text-stone-500 ml-4">• {it.notes}</p>
              )}
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between pt-3 border-t border-stone-200 mb-3">
          <span className="text-xs text-stone-400">
            {isReady
              ? "Status"
              : isPreparing
                ? overdue
                  ? "Overdue by"
                  : "Time remaining"
                : "Estimated time"}
          </span>
          {isReady ? (
            <span className="text-lg font-bold text-emerald-600">Ready</span>
          ) : isPreparing && countdownSeconds !== null ? (
            <span
              className={`text-lg font-bold tabular-nums ${overdue ? "text-red-600 animate-pulse" : "text-stone-900"}`}
            >
              {formatCountdown(countdownSeconds)}
            </span>
          ) : (
            <span className="text-lg font-bold text-stone-900">{eta} min</span>
          )}
        </div>

        {!isReady && (
          <div className="flex flex-wrap gap-2">
            {status === KITCHEN_STATUS.PENDING && (
              <button
                onClick={() => startPreparing(order)}
                disabled={!!isBusy}
                className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
              >
                {isBusy === "start" ? "…" : "Start Preparing"}
              </button>
            )}
            {[1, 2, 5].map((n) => (
              <button
                key={n}
                onClick={() => addPrepMinutes(order, n)}
                disabled={!!isBusy}
                className="px-3 py-2 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
              >
                +{n}
              </button>
            ))}
            {status === KITCHEN_STATUS.PREPARING && (
              <button
                onClick={() => markReady(order)}
                disabled={!!isBusy}
                className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
              >
                {isBusy === "ready" ? "…" : "Ready"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title={isKitchen ? "Kitchen Display" : "Order Monitoring"}
        subtitle={
          activeBranch
            ? `Live orders at ${activeBranch.name}`
            : "Select a branch"
        }
        actions={
          !isKitchen && (
            <button
              onClick={() => setShowPaid(!showPaid)}
              className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-50"
            >
              {showPaid ? "Hide paid" : "Show all"}
            </button>
          )
        }
      />

      {loading ? (
        <p className="text-stone-500">Loading orders…</p>
      ) : displayed.length === 0 ? (
        <EmptyState
          message={isKitchen ? "Kitchen queue is empty." : "No active orders."}
          hint={
            isKitchen
              ? "New orders appear here in real time."
              : "New orders appear here in real time."
          }
        />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map((o) =>
            isKitchen ? (
              <KitchenTicket key={o.id} order={o} />
            ) : (
              <div
                key={o.id}
                className="bg-white rounded-xl border border-stone-200 p-5"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wide text-stone-400">
                      Order
                    </span>
                    <div className="font-semibold text-stone-900">
                      #{o.id.slice(0, 8).toUpperCase()}
                    </div>
                  </div>
                  <span className="text-xs font-medium rounded-full px-2.5 py-1 capitalize bg-stone-100 text-stone-600">
                    {o.type}
                  </span>
                </div>

                <div className="mb-3">
                  <span
                    className={`text-xs font-medium rounded-full px-2.5 py-0.5 capitalize ${STATUS_STYLE[o.status] || "bg-stone-100"}`}
                  >
                    {o.status}
                  </span>
                  {o.customer_name && (
                    <span className="text-xs text-stone-500 ml-2">
                      for {o.customer_name}
                    </span>
                  )}
                  {hasKitchenItems(itemsByOrder[o.id]) && (
                    <span className="ml-2 text-xs text-stone-500">
                      ETA {orderKitchenEta(itemsByOrder[o.id])} min
                    </span>
                  )}
                </div>

                <ul className="text-sm text-stone-700 space-y-1 mb-4">
                  {(itemsByOrder[o.id] || []).map((it) => (
                    <li key={it.id} className="flex justify-between gap-2">
                      <span>
                        {it.quantity}× {it.name}
                      </span>
                      <span className="text-stone-500">
                        {formatMoney(Number(it.price_at_order) * it.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                  <span className="font-semibold text-stone-900">
                    {formatMoney(orderTotal(o.id))}
                  </span>
                  <div className="flex items-center gap-2">
                    {NEXT_STATUS[o.status] && (
                      <button
                        onClick={() => setStatus(o, NEXT_STATUS[o.status])}
                        className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700"
                      >
                        Mark {NEXT_STATUS[o.status]}
                      </button>
                    )}
                    {!["served", "paid", "cancelled"].includes(o.status) && (
                      <button
                        onClick={() => setStatus(o, "cancelled")}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
