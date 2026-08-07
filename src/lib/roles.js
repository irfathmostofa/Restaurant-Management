export const ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  MANAGER: "manager",
  WAITER: "waiter",
  KITCHEN: "kitchen",
  CASHIER: "cashier",
};

export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  waiter: "Waiter / Order-taker",
  kitchen: "Kitchen",
  cashier: "Cashier",
};

// Navigation shown per role. Keys in ROLES.
export const NAV_BY_ROLE = {
  owner: [
    { to: "/admin/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/admin/order-taking", label: "POS / Order", icon: "edit" },
    { to: "/admin/billing", label: "Billing", icon: "wallet" },
    { to: "/admin/orders", label: "Orders", icon: "clipboard" },
    { to: "/admin/invoices", label: "Invoices", icon: "receipt" },
    { to: "/admin/expenses", label: "Expenses", icon: "coins" },
    { to: "/admin/menu", label: "Menu", icon: "utensils" },
    { to: "/admin/tables", label: "Tables", icon: "layout" },
    { to: "/admin/reservations", label: "Reservations", icon: "calendar" },
    { to: "/admin/staff", label: "Staff", icon: "users" },
    { to: "/admin/branches", label: "Branches", icon: "building" },
    { to: "/admin/reports", label: "Reports", icon: "chart" },
    { to: "/admin/payment-methods", label: "Payment Methods", icon: "wallet" },
    { to: "/admin/tax-settings", label: "Tax & VAT", icon: "percent" },
    { to: "/admin/activity-logs", label: "Activity Logs", icon: "activity" },
    { to: "/admin/settings", label: "Settings", icon: "sparkles" },
  ],
  admin: [
    { to: "/admin/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/admin/order-taking", label: "POS / Order", icon: "edit" },
    { to: "/admin/billing", label: "Billing", icon: "wallet" },
    { to: "/admin/orders", label: "Orders", icon: "clipboard" },
    { to: "/admin/invoices", label: "Invoices", icon: "receipt" },
    { to: "/admin/expenses", label: "Expenses", icon: "coins" },
    { to: "/admin/menu", label: "Menu", icon: "utensils" },
    { to: "/admin/tables", label: "Tables", icon: "layout" },
    { to: "/admin/reservations", label: "Reservations", icon: "calendar" },
    { to: "/admin/staff", label: "Staff", icon: "users" },
    { to: "/admin/branches", label: "Branches", icon: "building" },
    { to: "/admin/reports", label: "Reports", icon: "chart" },
    { to: "/admin/payment-methods", label: "Payment Methods", icon: "wallet" },
    { to: "/admin/tax-settings", label: "Tax & VAT", icon: "percent" },
    { to: "/admin/activity-logs", label: "Activity Logs", icon: "activity" },
    { to: "/admin/settings", label: "Settings", icon: "sparkles" },
  ],
  manager: [
    { to: "/admin/dashboard", label: "Dashboard", icon: "grid" },
    { to: "/admin/order-taking", label: "POS / Order", icon: "edit" },
    { to: "/admin/billing", label: "Billing", icon: "wallet" },
    { to: "/admin/orders", label: "Orders", icon: "clipboard" },
    { to: "/admin/expenses", label: "Expenses", icon: "coins" },
    { to: "/admin/menu", label: "Menu", icon: "utensils" },
    { to: "/admin/tables", label: "Tables", icon: "layout" },
    { to: "/admin/reservations", label: "Reservations", icon: "calendar" },
    { to: "/admin/staff", label: "Staff", icon: "users" },
    { to: "/admin/reports", label: "Reports", icon: "chart" },
    { to: "/admin/payment-methods", label: "Payment Methods", icon: "wallet" },
  ],
  waiter: [
    { to: "/admin/order-taking", label: "POS / Order", icon: "edit" },
    { to: "/admin/orders", label: "Orders", icon: "clipboard" },
  ],
  cashier: [
    { to: "/admin/order-taking", label: "POS / Order", icon: "edit" },
    { to: "/admin/billing", label: "Billing", icon: "wallet" },
  ],
  kitchen: [
    { to: "/admin/orders", label: "Kitchen Display", icon: "clipboard" },
  ],
};

// Which routes can be accessed by which roles.
// owner/admin: everything. manager: everything branch-scoped except the
// owner/admin-only modules (branches, invoices, activity logs, tax settings).
// Profile is available to every authenticated staff member.
export const ROLE_ROUTES = {
  owner: new Set([
    "dashboard",
    "branches",
    "menu",
    "tables",
    "reservations",
    "staff",
    "orders",
    "reports",
    "order-taking",
    "billing",
    "payment-methods",
    "settings",
    "invoices",
    "expenses",
    "profile",
    "activity-logs",
    "tax-settings",
  ]),
  admin: new Set([
    "dashboard",
    "branches",
    "menu",
    "tables",
    "reservations",
    "staff",
    "orders",
    "reports",
    "order-taking",
    "billing",
    "payment-methods",
    "settings",
    "invoices",
    "expenses",
    "profile",
    "activity-logs",
    "tax-settings",
  ]),
  manager: new Set([
    "dashboard",
    "menu",
    "tables",
    "reservations",
    "staff",
    "orders",
    "reports",
    "order-taking",
    "billing",
    "payment-methods",
    "expenses",
    "profile",
  ]),
  waiter: new Set(["order-taking", "orders", "profile"]),
  cashier: new Set(["order-taking", "billing", "profile"]),
  kitchen: new Set(["orders", "profile"]),
};

// Default landing route per role (client-side fallback; the DB table
// `role_default_routes` is authoritative and editable in Admin -> Settings).
export const DEFAULT_ROUTE_BY_ROLE = {
  owner: "/admin/dashboard",
  admin: "/admin/dashboard",
  manager: "/admin/dashboard",
  cashier: "/admin/billing",
  waiter: "/admin/order-taking",
  kitchen: "/admin/orders",
};

// Route segments that are order/kitchen only (used by guards).
export const isRouteAllowedForRole = (role, pathname) => {
  if (!role) return false;
  const segments = pathname.split("/").filter(Boolean);
  const segment = segments.pop() || "dashboard";
  // The portal root (/admin) only redirects to the role's landing page.
  if (segment === "admin" && segments.length <= 1) return true;
  return ROLE_ROUTES[role]?.has(segment) ?? false;
};

export const canManageBranches = (role) =>
  role === ROLES.OWNER || role === ROLES.ADMIN;
// Managers may manage staff within their own branch (never owner/admin rows,
// never other branches — enforced by RLS + the protect_staff_privileges trigger).
export const canManageStaff = (role) =>
  role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MANAGER;
export const isManagerOnly = (role) => role === ROLES.MANAGER;
export const canManageExpenses = (role) =>
  role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MANAGER;
export const canViewInvoices = (role) =>
  role === ROLES.OWNER || role === ROLES.ADMIN;
export const canViewActivityLogs = (role) =>
  role === ROLES.OWNER || role === ROLES.ADMIN;
export const canManageTaxes = (role) =>
  role === ROLES.OWNER || role === ROLES.ADMIN;
export const isFullAccess = (role) =>
  role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MANAGER;
export const isPOSRole = (role) =>
  role === ROLES.WAITER ||
  role === ROLES.CASHIER ||
  role === ROLES.OWNER ||
  role === ROLES.ADMIN ||
  role === ROLES.MANAGER;
