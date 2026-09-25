import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function useNotifications(userId) {
  const [notifications, setNotifications] = useState([])

  const reload = () => {
    if (!supabase || !userId) return
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setNotifications(data || []))
  }

  useEffect(() => {
    reload()
    if (!supabase || !userId) return
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, reload)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [userId])

  const markRead = id => supabase.from('notifications').update({ read: true }).eq('id', id).then(reload)
  const markAllRead = () => { const ids = notifications.filter(n => !n.read).map(n => n.id); if (ids.length) supabase.from('notifications').update({ read: true }).in('id', ids).then(reload) }

  return { notifications, unreadCount: notifications.filter(n => !n.read).length, markRead, markAllRead }
}
