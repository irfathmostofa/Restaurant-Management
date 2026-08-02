import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { CurrencyProvider } from './context/CurrencyContext'
import AdminRoute from './components/AdminRoute'
import AdminShell from './components/admin/AdminShell'
import PublicSite from './components/public/PublicSite'
import RoleHome from './components/RoleHome'

// Lazy-load the admin pages so the initial bundle stays small and each
// module only loads when it is first visited.
const Login = lazy(() => import('./pages/admin/Login'))
const Forbidden = lazy(() => import('./pages/admin/Forbidden'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Branches = lazy(() => import('./pages/admin/Branches'))
const Menu = lazy(() => import('./pages/admin/Menu'))
const Tables = lazy(() => import('./pages/admin/Tables'))
const Reservations = lazy(() => import('./pages/admin/Reservations'))
const Staff = lazy(() => import('./pages/admin/Staff'))
const Orders = lazy(() => import('./pages/admin/Orders'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const OrderTaking = lazy(() => import('./pages/admin/OrderTaking'))
const Billing = lazy(() => import('./pages/admin/Billing'))
const PaymentMethods = lazy(() => import('./pages/admin/PaymentMethods'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const Invoices = lazy(() => import('./pages/admin/Invoices'))
const Expenses = lazy(() => import('./pages/admin/Expenses'))
const Profile = lazy(() => import('./pages/admin/Profile'))
const ActivityLogs = lazy(() => import('./pages/admin/ActivityLogs'))
const TaxSettings = lazy(() => import('./pages/admin/TaxSettings'))

export default function App() {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public customer website */}
            <Route path="/" element={<PublicSite />} />
            <Route path="/branch/:branchId" element={<PublicSite />} />

            {/* Admin portal */}
            <Route path="/admin/login" element={<Login />} />
            <Route path="/admin/forbidden" element={<Forbidden />} />
            <Route path="/admin" element={<AdminRoute />}>
              <Route element={<BranchProvider />}>
                <Route element={<AdminShell />}>
                  <Route index element={<RoleHome />} />
                  <Route path="dashboard" element={<Dashboard />} />
                  <Route path="branches" element={<Branches />} />
                  <Route path="menu" element={<Menu />} />
                  <Route path="tables" element={<Tables />} />
                  <Route path="reservations" element={<Reservations />} />
                  <Route path="staff" element={<Staff />} />
                  <Route path="orders" element={<Orders />} />
                  <Route path="reports" element={<Reports />} />
                  <Route path="order-taking" element={<OrderTaking />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="payment-methods" element={<PaymentMethods />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="invoices" element={<Invoices />} />
                  <Route path="expenses" element={<Expenses />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="activity-logs" element={<ActivityLogs />} />
                  <Route path="tax-settings" element={<TaxSettings />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </CurrencyProvider>
    </AuthProvider>
  )
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">
      Loading…
    </div>
  )
}
