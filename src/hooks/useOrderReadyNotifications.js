import { useCallback, useEffect, useRef, useState } from 'react'
import supabase from '../lib/supabase'

// Live "order ready" notifications for a branch. Returns a list of orders
// that transitioned to `ready` while this hook was mounted; each entry
// auto-removes after a few seconds.
export default function useOrderReadyNotifications(branchId) {
  const [notifications, setNotifications] = useState([])
  const seen = useRef(new Set())
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  useEffect(() => {
    if (!branchId) return
    seen.current.clear()
    setNotifications([])
    const timerMap = timers.current
    const channel = supabase
      .channel('order-ready-notif-' + branchId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `branch_id=eq.${branchId}` }, (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : payload.new
        if (row && row.status === 'ready' && !seen.current.has(row.id)) {
          seen.current.add(row.id)
          setNotifications((prev) => [...prev, { id: row.id, shortId: row.id.slice(0, 8) }])
          const t = setTimeout(() => dismiss(row.id), 8000)
          timerMap.set(row.id, t)
        }
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      timerMap.forEach((t) => clearTimeout(t))
      timerMap.clear()
    }
  }, [branchId, dismiss])

  return { notifications, dismiss }
}
