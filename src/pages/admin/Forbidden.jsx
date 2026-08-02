import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function Forbidden() {
  const { staff } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
      <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
        <div className="text-4xl mb-3">🚫</div>
        <h1 className="text-xl font-bold text-stone-900 mb-2">Access denied</h1>
        <p className="text-stone-600 mb-5">
          Your role ({staff?.role}) doesn’t have permission to view this page.
        </p>
        <Link to="/admin/dashboard" className="inline-block px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium">
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
