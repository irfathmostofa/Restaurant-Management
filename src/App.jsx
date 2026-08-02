import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import AdminRoute from './components/AdminRoute'
import AdminShell from './components/admin/AdminShell'
import PublicSite from './components/public/PublicSite'
import Login from './pages/admin/Login'
import Forbidden from './pages/admin/Forbidden'
import Dashboard from './pages/admin/Dashboard'
import Branches from './pages/admin/Branches'
import Menu from './pages/admin/Menu'
import Tables from './pages/admin/Tables'
import Reservations from './pages/admin/Reservations'
import Staff from './pages/admin/Staff'
import Orders from './pages/admin/Orders'
import Reports from './pages/admin/Reports'
import OrderTaking from './pages/admin/OrderTaking'
import Billing from './pages/admin/Billing'

export default function App() {
  return (
    <AuthProvider>
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
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
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
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
