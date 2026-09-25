import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

export function usePickupRequests(userId) {
  const [requests, setRequests] = useState(null) // null = still loading
  const [requestsError, setRequestsError] = useState('')

  const reload = () => {
    if (!supabase || !userId) return
    // RLS already scopes this to what the signed-in account is allowed to see —
    // own requests for a user, available + assigned for a collector, everything for an admin.
    supabase.from('pickup_requests').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) setRequestsError(error.message); else { setRequests(data); setRequestsError('') } })
  }

  useEffect(() => {
    reload()
    if (!supabase || !userId) return
    const channel = supabase
      .channel('pickup_requests_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_requests' }, reload)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [userId])

  return { requests: requests || [], loadingRequests: requests === null, requestsError, reload }
}
