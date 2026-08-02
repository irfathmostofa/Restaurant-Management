export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  WAITER: 'waiter',
  KITCHEN: 'kitchen',
  CASHIER: 'cashier'
}

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  waiter: 'Waiter / Order-taker',
  kitchen: 'Kitchen',
  cashier: 'Cashier'
}

// Navigation shown per role. Keys in ROLES.
export const NAV_BY_ROLE = {
  owner: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: 'grid' },
    { to: '/admin/branches', label: 'Branches', icon: 'building' },
    { to: '/admin/menu', label: 'Menu', icon: 'utensils' },
    { to: '/admin/tables', label: 'Tables', icon: 'layout' },
    { to: '/admin/reservations', label: 'Reservations', icon: 'calendar' },
    { to: '/admin/staff', label: 'Staff', icon: 'users' },
    { to: '/admin/orders', label: 'Orders', icon: 'clipboard' },
    { to: '/admin/reports', label: 'Reports', icon: 'chart' },
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' },
    { to: '/admin/payment-methods', label: 'Payment Methods', icon: 'wallet' },
    { to: '/admin/settings', label: 'Settings', icon: 'sparkles' }
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: 'grid' },
    { to: '/admin/branches', label: 'Branches', icon: 'building' },
    { to: '/admin/menu', label: 'Menu', icon: 'utensils' },
    { to: '/admin/tables', label: 'Tables', icon: 'layout' },
    { to: '/admin/reservations', label: 'Reservations', icon: 'calendar' },
    { to: '/admin/staff', label: 'Staff', icon: 'users' },
    { to: '/admin/orders', label: 'Orders', icon: 'clipboard' },
    { to: '/admin/reports', label: 'Reports', icon: 'chart' },
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' },
    { to: '/admin/payment-methods', label: 'Payment Methods', icon: 'wallet' },
    { to: '/admin/settings', label: 'Settings', icon: 'sparkles' }
  ],
  manager: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: 'grid' },
    { to: '/admin/menu', label: 'Menu', icon: 'utensils' },
    { to: '/admin/tables', label: 'Tables', icon: 'layout' },
    { to: '/admin/reservations', label: 'Reservations', icon: 'calendar' },
    { to: '/admin/staff', label: 'Staff', icon: 'users' },
    { to: '/admin/orders', label: 'Orders', icon: 'clipboard' },
    { to: '/admin/reports', label: 'Reports', icon: 'chart' },
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' },
    { to: '/admin/payment-methods', label: 'Payment Methods', icon: 'wallet' }
  ],
  waiter: [
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' },
    { to: '/admin/billing', label: 'Billing', icon: 'wallet' }
  ],
  cashier: [
    { to: '/admin/billing', label: 'POS / Billing', icon: 'wallet' },
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' }
  ],
  kitchen: [
    { to: '/admin/orders', label: 'Kitchen Display', icon: 'clipboard' }
  ]
}

// Which routes can be accessed by which roles.
// owner/admin: everything. manager: everything except /admin/branches and /admin/staff? No —
// manager == admin scoped to branch, but staff/accounts are owner-level per requirements.
// Keep staff management owner/admin only.
export const ROLE_ROUTES = {
  owner: new Set(['dashboard', 'branches', 'menu', 'tables', 'reservations', 'staff', 'orders', 'reports', 'order-taking', 'billing', 'payment-methods', 'settings']),
  admin: new Set(['dashboard', 'branches', 'menu', 'tables', 'reservations', 'staff', 'orders', 'reports', 'order-taking', 'billing', 'payment-methods', 'settings']),
  manager: new Set(['dashboard', 'menu', 'tables', 'reservations', 'orders', 'reports', 'order-taking', 'billing', 'payment-methods']),
  waiter: new Set(['order-taking', 'billing']),
  cashier: new Set(['order-taking', 'billing']),
  kitchen: new Set(['orders'])
}

// Default landing route per role (client-side fallback; the DB table
// `role_default_routes` is authoritative and editable in Admin -> Settings).
export const DEFAULT_ROUTE_BY_ROLE = {
  owner: '/admin/dashboard',
  admin: '/admin/dashboard',
  manager: '/admin/dashboard',
  cashier: '/admin/billing',
  waiter: '/admin/order-taking',
  kitchen: '/admin/orders'
}

// Route segments that are order/kitchen only (used by guards).
export const isRouteAllowedForRole = (role, pathname) => {
  if (!role) return false
  const segments = pathname.split('/').filter(Boolean)
  const segment = segments.pop() || 'dashboard'
  // The portal root (/admin) only redirects to the role's landing page.
  if (segment === 'admin' && segments.length <= 1) return true
  return ROLE_ROUTES[role]?.has(segment) ?? false
}

export const canManageBranches = (role) => role === ROLES.OWNER || role === ROLES.ADMIN
export const canManageStaff = (role) => role === ROLES.OWNER || role === ROLES.ADMIN
export const isFullAccess = (role) => role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MANAGER
export const isPOSRole = (role) => role === ROLES.WAITER || role === ROLES.CASHIER || role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MANAGER
