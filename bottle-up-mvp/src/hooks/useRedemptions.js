import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function useRedemptions(userId) {
  const [redemptions, setRedemptions] = useState([])
  const reload = () => {
    if (!supabase || !userId) return
    supabase.from('reward_redemptions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      .then(({ data }) => setRedemptions(data || []))
  }
  useEffect(() => {
    reload()
    if (!supabase || !userId) return
    const channel = supabase
      .channel(`redemptions-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reward_redemptions', filter: `user_id=eq.${userId}` }, reload)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [userId])
  return { redemptions, reload }
}
