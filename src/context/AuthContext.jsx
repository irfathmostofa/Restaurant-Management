import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import supabase from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [staff, setStaff] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadStaff = useCallback(async (userId) => {
    if (!userId) {
      setStaff(null)
      return
    }
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .maybeSingle()
    if (error) {
      console.error('Failed to load staff profile:', error.message)
      setStaff(null)
    } else {
      setStaff(data)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      return loadStaff(data.session?.user?.id)
    }).catch(() => {}).finally(() => setLoading(false))

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      loadStaff(newSession?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadStaff])

  const value = {
    session,
    user: session?.user ?? null,
    staff,
    loading,
    refreshStaff: () => loadStaff(session?.user?.id)
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
