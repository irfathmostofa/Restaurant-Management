import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBranch } from "../../context/BranchContext";
import { useAuth } from "../../context/AuthContext";
import supabase from "../../lib/supabase";
import PageHeader from "../../components/admin/PageHeader";
import { useCurrency } from "../../context/CurrencyContext";
import { shortOrderNo, fmtDateTime } from "../../lib/printing";

export default function Dashboard() {
  const { staff } = useAuth();
  const {
    branches,
    activeBranch,
    activeBranchId,
    setActiveBranchId,
    canSwitchBranches,
  } = useBranch();
  const { formatMoney } = useCurrency();
  const [stats, setStats] = useState(null);
  const [popularItems, setPopularItems] = useState([]);
  const [recentSales, setRecentSales] = useState([]);
  const [todaySales, setTodaySales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewing, setViewing] = useState(null);

  // Helper function to generate invoice number
  const generateInvoiceNo = (orderId, paidAt) => {
    const date = new Date(paidAt || Date.now());
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const shortId = orderId ? orderId.slice(0, 6).toUpperCase() : "XXXXXX";
    return `INV-${year}${month}${day}-${shortId}`;
  };

  // Calculate order total from items
  const calculateOrderTotal = (items) => {
    if (!items || items.length === 0) return 0;
    return items.reduce((sum, item) => {
      return (
        sum + Number(item.price_at_order || 0) * Number(item.quantity || 0)
      );
    }, 0);
  };

  useEffect(() => {
    if (!activeBranchId) {
      setStats(null);
      setPopularItems([]);
      setRecentSales([]);
      setTodaySales(0);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        console.log("🚀 Loading dashboard for branch:", activeBranchId);

        // Get today's date
        const today = new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const startOfDay = `${todayStr}T00:00:00`;
        const endOfDay = `${todayStr}T23:59:59`;

        // === 1. Fetch Stats ===
        const [ordersRes, tablesRes, reservationsRes] = await Promise.all([
          supabase
            .from("orders")
            .select("id, status")
            .eq("branch_id", activeBranchId)
            .not("status", "in", '("paid","cancelled")'),
          supabase
            .from("tables")
            .select("id, status")
            .eq("branch_id", activeBranchId),
          supabase
            .from("reservations")
            .select("id")
            .eq("branch_id", activeBranchId)
            .eq("date", todayStr)
            .in("status", ["pending", "confirmed"]),
        ]);

        if (!active) return;

        setStats({
          activeOrders: ordersRes.data?.length || 0,
          tables: tablesRes.data?.length || 0,
          occupiedTables: (tablesRes.data || []).filter(
            (t) => t.status === "occupied",
          ).length,
          todayReservations: reservationsRes.data?.length || 0,
        });

        // === 2. Fetch Today's Sales ===
        const { data: todayPayments } = await supabase
          .from("payments")
          .select("amount")
          .eq("branch_id", activeBranchId)
          .gte("paid_at", startOfDay)
          .lte("paid_at", endOfDay);

        if (todayPayments && todayPayments.length > 0) {
          const total = todayPayments.reduce(
            (sum, p) => sum + Number(p.amount || 0),
            0,
          );
          setTodaySales(total);
        } else {
          setTodaySales(0);
        }

        // === 3. Fetch Popular Items ===
        const { data: orderItems } = await supabase
          .from("order_items")
          .select(
            `
            menu_item_id,
            name,
            quantity,
            price_at_order
          `,
          )
          .eq("branch_id", activeBranchId)
          .limit(200);

        if (orderItems && orderItems.length > 0) {
          const itemMap = {};
          orderItems.forEach((item) => {
            const key = item.menu_item_id || "unknown";
            if (itemMap[key]) {
              itemMap[key].quantity += item.quantity || 1;
            } else {
              itemMap[key] = {
                menu_item_id: key,
                name: item.name || "Unknown Item",
                quantity: item.quantity || 1,
                price: item.price_at_order || 0,
                photo_url: null,
              };
            }
          });

          const sorted = Object.values(itemMap)
            .sort((a, b) => b.quantity - a.quantity)
            .slice(0, 5);

          setPopularItems(sorted);
        } else {
          setPopularItems([]);
        }

        // === 4. Fetch Recent Sales ===
        let salesData = [];

        // Get recent payments
        const { data: paymentData, error: paymentError } = await supabase
          .from("payments")
          .select(
            `
            id,
            amount,
            paid_amount,
            change_amount,
            paid_at,
            payment_method_id,
            cashier_id,
            order_id,
            branch_id,
            invoice_no,
            subtotal,
            discount,
            vat,
            tax,
            service_charge
          `,
          )
          .eq("branch_id", activeBranchId)
          .order("paid_at", { ascending: false })
          .limit(5);

        if (paymentError) {
          console.error("❌ Payment query error:", paymentError);
        }

        console.log(
          `💳 Payment query returned: ${paymentData?.length || 0} results`,
        );

        if (paymentData && paymentData.length > 0) {
          const orderIds = paymentData
            .map((p) => p.order_id)
            .filter((id) => id);

          if (orderIds.length > 0) {
            // Fetch orders WITHOUT the 'total' column
            const { data: orderData, error: orderError } = await supabase
              .from("orders")
              .select(
                `
                id,
                type,
                customer_name,
                created_at,
                status,
                table_id
              `,
              )
              .in("id", orderIds);

            if (orderError) {
              console.error("❌ Order query error:", orderError);
            }

            if (orderData && orderData.length > 0) {
              // Fetch order items for these orders
              const { data: itemsData, error: itemsError } = await supabase
                .from("order_items")
                .select(
                  `
                  id,
                  order_id,
                  name,
                  quantity,
                  price_at_order,
                  notes
                `,
                )
                .in("order_id", orderIds);

              if (itemsError) {
                console.error("❌ Order items query error:", itemsError);
              }

              // Group items by order_id
              const itemsByOrder = {};
              if (itemsData) {
                itemsData.forEach((item) => {
                  if (!itemsByOrder[item.order_id]) {
                    itemsByOrder[item.order_id] = [];
                  }
                  itemsByOrder[item.order_id].push(item);
                });
              }

              // Create order map
              const orderMap = {};
              orderData.forEach((order) => {
                const items = itemsByOrder[order.id] || [];
                orderMap[order.id] = {
                  ...order,
                  order_items: items,
                  total: calculateOrderTotal(items),
                };
              });

              // Get cashier names
              const cashierIds = paymentData
                .map((p) => p.cashier_id)
                .filter((id) => id);

              let cashierMap = {};
              if (cashierIds.length > 0) {
                const { data: cashiers } = await supabase
                  .from("staff")
                  .select("id, name")
                  .in("id", cashierIds);

                if (cashiers) {
                  cashierMap = cashiers.reduce((acc, c) => {
                    acc[c.id] = c.name;
                    return acc;
                  }, {});
                }
              }

              // Get payment methods
              const methodIds = paymentData
                .map((p) => p.payment_method_id)
                .filter((id) => id);

              let methodMap = {};
              if (methodIds.length > 0) {
                const { data: methods } = await supabase
                  .from("payment_methods")
                  .select("id, name, icon")
                  .in("id", methodIds);

                if (methods) {
                  methodMap = methods.reduce((acc, m) => {
                    acc[m.id] = m;
                    return acc;
                  }, {});
                }
              }

              // Combine everything
              salesData = paymentData.map((payment) => {
                const order = orderMap[payment.order_id];
                const orderItems = order?.order_items || [];
                const total = order?.total || calculateOrderTotal(orderItems);

                return {
                  id: order?.id || payment.id,
                  payment_id: payment.id,
                  order_id: payment.order_id,
                  shortId: order?.id
                    ? order.id.slice(0, 8).toUpperCase()
                    : "N/A",
                  invoiceNo:
                    payment.invoice_no ||
                    generateInvoiceNo(order?.id, payment.paid_at),
                  type: order?.type || "—",
                  customer: order?.customer_name || "Guest",
                  total: payment.amount || total || 0,
                  paidAmount: payment.paid_amount || payment.amount || 0,
                  paymentMethod:
                    methodMap[payment.payment_method_id]?.name || "—",
                  paymentIcon: methodMap[payment.payment_method_id]?.icon || "",
                  cashier: cashierMap[payment.cashier_id] || "—",
                  cashier_id: payment.cashier_id,
                  items: orderItems,
                  created_at: order?.created_at || payment.paid_at,
                  paid_at: payment.paid_at,
                  tableId: order?.table_id,
                  branch_id: payment.branch_id,
                  // Payment details for modal
                  subtotal: payment.subtotal || 0,
                  discount: payment.discount || 0,
                  vat: payment.vat || 0,
                  tax: payment.tax || 0,
                  service_charge: payment.service_charge || 0,
                  change_amount: payment.change_amount || 0,
                };
              });

              console.log(`✅ Created ${salesData.length} sales from payments`);
            }
          }
        }

        // Fallback: If no payments, try paid orders directly
        if (salesData.length === 0) {
          console.log("🔄 No sales from payments, trying paid orders...");

          const { data: paidOrders, error: paidOrdersError } = await supabase
            .from("orders")
            .select(
              `
              id,
              type,
              customer_name,
              created_at,
              status,
              table_id
            `,
            )
            .eq("branch_id", activeBranchId)
            .eq("status", "paid")
            .order("created_at", { ascending: false })
            .limit(5);

          if (paidOrdersError) {
            console.error("❌ Paid orders query error:", paidOrdersError);
          }

          if (paidOrders && paidOrders.length > 0) {
            const orderIds = paidOrders.map((o) => o.id);

            const { data: itemsData, error: itemsError } = await supabase
              .from("order_items")
              .select(
                `
                id,
                order_id,
                name,
                quantity,
                price_at_order,
                notes
              `,
              )
              .in("order_id", orderIds);

            if (itemsError) {
              console.error("❌ Order items query error:", itemsError);
            }

            const itemsByOrder = {};
            if (itemsData) {
              itemsData.forEach((item) => {
                if (!itemsByOrder[item.order_id]) {
                  itemsByOrder[item.order_id] = [];
                }
                itemsByOrder[item.order_id].push(item);
              });
            }

            salesData = paidOrders.map((order) => {
              const items = itemsByOrder[order.id] || [];
              const total = calculateOrderTotal(items);

              return {
                id: order.id,
                order_id: order.id,
                shortId: order.id.slice(0, 8).toUpperCase(),
                invoiceNo: generateInvoiceNo(order.id, order.created_at),
                type: order.type,
                customer: order.customer_name || "Guest",
                total: total,
                paidAmount: total,
                paymentMethod: "—",
                paymentIcon: "",
                cashier: "—",
                items: items,
                created_at: order.created_at,
                paid_at: order.created_at,
                tableId: order.table_id,
                branch_id: activeBranchId,
                subtotal: total,
                discount: 0,
                vat: 0,
                tax: 0,
                service_charge: 0,
                change_amount: 0,
              };
            });

            console.log(
              `✅ Created ${salesData.length} sales from paid orders`,
            );
          }
        }

        if (!active) return;
        setRecentSales(salesData);
        console.log(`🎯 FINAL: ${salesData.length} recent sales loaded`);
      } catch (error) {
        console.error("❌ Fatal error loading dashboard:", error);
        setError("Failed to load dashboard data. Please refresh the page.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [activeBranchId]);

  const statCards = stats
    ? [
        {
          label: "Active orders",
          value: stats.activeOrders,
          to: "/admin/orders",
        },
        { label: "Tables", value: stats.tables, to: "/admin/tables" },
        {
          label: "Occupied tables",
          value: stats.occupiedTables,
          to: "/admin/tables",
        },
        {
          label: "Today's reservations",
          value: stats.todayReservations,
          to: "/admin/reservations",
        },
        {
          label: "Today's Sales",
          value: formatMoney(todaySales),
          to: "/admin/invoices",
        },
      ]
    : [];

  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  // Handle print from dashboard modal
  const handlePrint = (sale) => {
    // For now, just navigate to invoices page
    window.location.href = "/admin/invoices";
  };

  return (
    <div>
      <PageHeader
        title={`Welcome, ${staff?.name?.split(" ")[0] || "there"}`}
        subtitle={
          canSwitchBranches
            ? `You oversee ${branches.length} branch${branches.length === 1 ? "" : "es"}.`
            : activeBranch
              ? `You are assigned to ${activeBranch.name}.`
              : "No branch assigned yet."
        }
      />

      {!activeBranchId && canSwitchBranches ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center">
          <p className="text-stone-500 mb-2">
            Select a branch to see its dashboard.
          </p>
          <Link
            to="/admin/branches"
            className="text-brand-600 text-sm font-medium hover:underline"
          >
            Manage branches
          </Link>
        </div>
      ) : loading ? (
        <div className="text-stone-500">Loading…</div>
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-700">
          <p>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-3 px-4 py-2 bg-red-100 rounded-lg hover:bg-red-200 transition-colors text-sm"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-3">
            {statCards.map((s) => (
              <Link
                key={s.label}
                to={s.to}
                className="bg-white rounded-xl border border-stone-200 p-5 hover:border-brand-400 hover:shadow transition-all"
              >
                <div className="text-2xl font-bold text-stone-900">
                  {s.value}
                </div>
                <div className="text-sm text-stone-500 mt-1">{s.label}</div>
              </Link>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Recent Sales */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-4">
                🕐 Recent Sales
              </h2>
              {recentSales.length > 0 ? (
                <div className="space-y-4">
                  {recentSales.map((sale) => (
                    <div
                      key={sale.id}
                      className="border-b border-stone-100 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium text-stone-800 truncate">
                            {sale.customer}
                          </span>
                          <span className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded font-mono whitespace-nowrap">
                            {sale.invoiceNo}
                          </span>
                        </div>
                        <span className="font-bold text-brand-600 whitespace-nowrap ml-2">
                          {formatMoney(sale.total)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-stone-400 truncate">
                          {formatDate(sale.paid_at || sale.created_at)}
                        </span>
                        <button
                          onClick={() => setViewing(sale)}
                          className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 whitespace-nowrap ml-2"
                        >
                          <span>View invoice</span>
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-stone-400">No recent sales</p>
                  <p className="text-xs text-stone-400 mt-1">
                    Complete a payment to see sales here
                  </p>
                </div>
              )}
              {recentSales.length > 0 && (
                <Link
                  to="/admin/invoices"
                  className="block mt-4 text-center text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  View all invoices →
                </Link>
              )}
            </div>
            {/* Popular Items */}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-4">
                🔥 Popular Items
              </h2>
              {popularItems.length > 0 ? (
                <div className="space-y-3">
                  {popularItems.map((item, index) => (
                    <div
                      key={item.menu_item_id || index}
                      className="flex items-center gap-4"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
                        #{index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-stone-800 truncate">
                          {item.name}
                        </div>
                        <div className="text-sm text-stone-500">
                          {formatMoney(item.price)}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="font-bold text-brand-600">
                          {item.quantity}
                        </div>
                        <div className="text-xs text-stone-500">orders</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-stone-400 text-center py-8">
                  No popular items yet
                </p>
              )}
            </div>
          </div>

          {/* Quick Actions & Branch Info */}
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-3">
                Quick actions
              </h2>
              <div className="flex flex-wrap gap-3">
                {[
                  { to: "/admin/order-taking", label: "📝 Take an order" },
                  { to: "/admin/menu", label: "📋 Edit menu" },
                  {
                    to: "/admin/reservations",
                    label: "📅 Review reservations",
                  },
                  { to: "/admin/invoices", label: "🧾 View invoices" },
                ].map((a) => (
                  <Link
                    key={a.to}
                    to={a.to}
                    className="px-4 py-2 rounded-lg bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100 transition-colors"
                  >
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-semibold text-stone-900 mb-3">Branch info</h2>
              {activeBranch ? (
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-stone-500 inline">Name: </dt>
                    <dd className="inline font-medium">{activeBranch.name}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500 inline">Address: </dt>
                    <dd className="inline">{activeBranch.address || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-stone-500 inline">Contact: </dt>
                    <dd className="inline">
                      {activeBranch.contact_info || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-stone-500 inline">Status: </dt>
                    <dd className="inline">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          activeBranch.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {activeBranch.is_active ? "Active" : "Inactive"}
                      </span>
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-stone-500 text-sm">No branch selected.</p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Invoice Detail Modal */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewing(null);
          }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/50">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">
                  Invoice Details
                </h2>
                <p className="text-sm text-stone-500">
                  {viewing.invoiceNo || `INV-${shortOrderNo(viewing.id)}`}
                </p>
              </div>
              <button
                onClick={() => setViewing(null)}
                className="text-stone-400 hover:text-stone-600 p-1 rounded-lg hover:bg-stone-100 transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Invoice Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Order ID
                  </p>
                  <p className="text-sm font-mono text-stone-800 mt-1">
                    #{shortOrderNo(viewing.id)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Date
                  </p>
                  <p className="text-sm text-stone-800 mt-1">
                    {fmtDateTime(viewing.paid_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Type
                  </p>
                  <p className="text-sm text-stone-800 mt-1 capitalize">
                    {viewing.type || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Customer
                  </p>
                  <p className="text-sm text-stone-800 mt-1">
                    {viewing.customer || "Guest"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Payment Method
                  </p>
                  <p className="text-sm text-stone-800 mt-1">
                    {viewing.paymentIcon} {viewing.paymentMethod}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Cashier
                  </p>
                  <p className="text-sm text-stone-800 mt-1">
                    {viewing.cashier || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Table
                  </p>
                  <p className="text-sm text-stone-800 mt-1">
                    {viewing.tableId || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Branch
                  </p>
                  <p className="text-sm text-stone-800 mt-1">
                    {branches.find((b) => b.id === viewing.branch_id)?.name ||
                      "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Status
                  </p>
                  <p className="text-sm mt-1">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Paid
                    </span>
                  </p>
                </div>
              </div>

              {/* Order Items */}
              <div>
                <h3 className="text-sm font-semibold text-stone-900 mb-3">
                  Order Items
                </h3>
                <div className="bg-stone-50 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-100/50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-stone-500 uppercase tracking-wider">
                          Item
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                          Qty
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                          Price
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-stone-500 uppercase tracking-wider">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200/50">
                      {(viewing.items || []).map((item) => (
                        <tr
                          key={item.id}
                          className="hover:bg-stone-100/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-stone-800">
                            {item.name}
                            {item.notes && (
                              <p className="text-xs text-stone-400 mt-0.5">
                                {item.notes}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-stone-600">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-3 text-right text-stone-600">
                            {formatMoney(item.price_at_order)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-stone-800">
                            {formatMoney(
                              Number(item.price_at_order) *
                                Number(item.quantity),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-stone-200 pt-4">
                <div className="space-y-1.5 max-w-xs ml-auto">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Subtotal</span>
                    <span className="text-stone-800">
                      {formatMoney(viewing.subtotal || 0)}
                    </span>
                  </div>
                  {Number(viewing.discount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Discount</span>
                      <span className="text-red-600">
                        -{formatMoney(viewing.discount)}
                      </span>
                    </div>
                  )}
                  {Number(viewing.service_charge) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Service Charge</span>
                      <span className="text-stone-800">
                        {formatMoney(viewing.service_charge)}
                      </span>
                    </div>
                  )}
                  {Number(viewing.vat) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">VAT</span>
                      <span className="text-stone-800">
                        {formatMoney(viewing.vat)}
                      </span>
                    </div>
                  )}
                  {Number(viewing.tax) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Tax</span>
                      <span className="text-stone-800">
                        {formatMoney(viewing.tax)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-stone-200">
                    <span className="text-stone-900">Grand Total</span>
                    <span className="text-brand-600">
                      {formatMoney(viewing.total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">Paid Amount</span>
                    <span className="text-stone-800">
                      {formatMoney(viewing.paidAmount || viewing.total)}
                    </span>
                  </div>
                  {Number(viewing.change_amount) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-stone-500">Change</span>
                      <span className="text-green-600">
                        {formatMoney(viewing.change_amount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-200 bg-stone-50/50">
              <button
                onClick={() => setViewing(null)}
                className="px-4 py-2 rounded-lg border border-stone-300 text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors"
              >
                Close
              </button>
              <Link
                to="/admin/invoices"
                className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                View All Invoices
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
