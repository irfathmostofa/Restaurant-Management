export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'manager',
  WAITER: 'waiter',
  KITCHEN: 'kitchen'
}

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  waiter: 'Waiter / Order-taker',
  kitchen: 'Kitchen'
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
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' }
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
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' }
  ],
  manager: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: 'grid' },
    { to: '/admin/menu', label: 'Menu', icon: 'utensils' },
    { to: '/admin/tables', label: 'Tables', icon: 'layout' },
    { to: '/admin/reservations', label: 'Reservations', icon: 'calendar' },
    { to: '/admin/staff', label: 'Staff', icon: 'users' },
    { to: '/admin/orders', label: 'Orders', icon: 'clipboard' },
    { to: '/admin/reports', label: 'Reports', icon: 'chart' },
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' }
  ],
  waiter: [
    { to: '/admin/order-taking', label: 'Order Taking', icon: 'edit' },
    { to: '/admin/billing', label: 'Billing', icon: 'wallet' }
  ],
  kitchen: [
    { to: '/admin/orders', label: 'Order Queue', icon: 'clipboard' }
  ]
}

// Which routes can be accessed by which roles.
// owner/admin: everything. manager: everything except /admin/branches and /admin/staff? No —
// manager == admin scoped to branch, but staff/accounts are owner-level per requirements.
// Keep staff management owner/admin only.
export const ROLE_ROUTES = {
  owner: new Set(['dashboard', 'branches', 'menu', 'tables', 'reservations', 'staff', 'orders', 'reports', 'order-taking', 'billing']),
  admin: new Set(['dashboard', 'branches', 'menu', 'tables', 'reservations', 'staff', 'orders', 'reports', 'order-taking', 'billing']),
  manager: new Set(['dashboard', 'menu', 'tables', 'reservations', 'orders', 'reports', 'order-taking', 'billing']),
  waiter: new Set(['order-taking', 'billing']),
  kitchen: new Set(['orders'])
}

// Default landing route per role.
export const DEFAULT_ROUTE_BY_ROLE = {
  owner: '/admin/dashboard',
  admin: '/admin/dashboard',
  manager: '/admin/dashboard',
  waiter: '/admin/order-taking',
  kitchen: '/admin/orders'
}

// Route segments that are order/kitchen only (used by guards).
export const isRouteAllowedForRole = (role, pathname) => {
  if (!role) return false
  const segment = pathname.split('/').filter(Boolean).pop() || 'dashboard'
  return ROLE_ROUTES[role]?.has(segment) ?? false
}

export const canManageBranches = (role) => role === ROLES.OWNER || role === ROLES.ADMIN
export const canManageStaff = (role) => role === ROLES.OWNER || role === ROLES.ADMIN
export const isFullAccess = (role) => role === ROLES.OWNER || role === ROLES.ADMIN || role === ROLES.MANAGER
