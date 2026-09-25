import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [profile, setProfile] = useState(null)
  const [recovering, setRecovering] = useState(false)

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(newSession ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) { setProfile(null); return }
    let cancelled = false
    supabase.from('profiles').select('id, full_name, role, points, city').eq('id', session.user.id).single()
      .then(({ data, error }) => { if (!cancelled) setProfile(error ? null : data) })

    // Live update: if an admin verifies one of my pickups from another device/session,
    // my points here should update without me needing to refresh.
    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
        payload => setProfile(payload.new))
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [session])

  const refreshProfile = () => {
    if (!supabase || !session) return
    supabase.from('profiles').select('id, full_name, role, points, city').eq('id', session.user.id).single()
      .then(({ data, error }) => setProfile(error ? null : data))
  }

  return { session, profile, refreshProfile, loading: session === undefined, recovering, clearRecovering: () => setRecovering(false) }
}
