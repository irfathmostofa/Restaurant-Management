import { createContext, useContext, useEffect, useState } from 'react'
import supabase from '../lib/supabase'

const PublicSiteContext = createContext(null)

const STORAGE_KEY = 'restaurant-selected-branch'

export function PublicSiteProvider({ children }) {
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState(null)
  const [branchesLoaded, setBranchesLoaded] = useState(false)

  useEffect(() => {
    let active = true
    supabase.from('branches').select('*').eq('is_active', true).order('name')
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error('Failed to load branches:', error.message)
          setBranchesLoaded(true)
          return
        }
        const list = data || []
        setBranches(list)
        if (list.length > 0) {
          const stored = localStorage.getItem(STORAGE_KEY)
          const storedValid = list.some((b) => b.id === stored)
          setSelectedBranchId(storedValid ? stored : list[0].id)
        }
        setBranchesLoaded(true)
      })
    return () => { active = false }
  }, [])

  const selectBranch = (id) => {
    localStorage.setItem(STORAGE_KEY, id)
    setSelectedBranchId(id)
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null

  return (
    <PublicSiteContext.Provider
      value={{
        branches,
        branchesLoaded,
        selectedBranch,
        selectedBranchId,
        selectBranch
      }}
    >
      {children}
    </PublicSiteContext.Provider>
  )
}

export const usePublicSite = () => useContext(PublicSiteContext)
