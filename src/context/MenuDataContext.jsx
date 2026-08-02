import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import supabase from '../lib/supabase'

// Per-branch menu + category data for the public site.
const MenuDataContext = createContext(null)

export function MenuDataProvider({ children }) {
  const [branchId, setBranchId] = useState(null)
  const [categories, setCategories] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(async (id) => {
    if (!id) return
    setLoading(true)
    setError(null)
    const [catRes, itemRes] = await Promise.all([
      supabase.from('categories').select('*').eq('branch_id', id).order('sort_order'),
      supabase.from('menu_items').select('*').eq('branch_id', id).order('sort_order')
    ])
    if (catRes.error) setError(catRes.error.message)
    if (itemRes.error) setError(itemRes.error.message)
    if (!catRes.error) setCategories(catRes.data || [])
    if (!itemRes.error) setItems(itemRes.data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (branchId) load(branchId)
  }, [branchId, load])

  return (
    <MenuDataContext.Provider
      value={{ branchId, setBranchId, categories, items, loading, error }}
    >
      {children}
    </MenuDataContext.Provider>
  )
}

export const useMenuData = () => useContext(MenuDataContext)
