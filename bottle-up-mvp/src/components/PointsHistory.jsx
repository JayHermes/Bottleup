import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const labels = { opening: 'Opening balance', pickup: 'Verified recycling', redemption: 'Reward requested', refund: 'Reward refunded' }
export default function PointsHistory({ userId, preview }) {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!preview)
  const [limit, setLimit] = useState(25)
  const [retry, setRetry] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  useEffect(() => {
    if (preview || !supabase) return
    let active = true
    const load = async () => {
      const { data, error } = await supabase.from('points_ledger').select('id,kind,points,weight_kg,created_at').eq('user_id', userId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1)
      if (!active) return
      setError(error ? 'Points history could not be loaded.' : '')
      if (!error) { setEntries(data.slice(0, limit)); setHasMore(data.length > limit) }
      setLoading(false)
    }
    load()
    const onFocus = () => { if (document.visibilityState === 'visible') load() }
    const channel = supabase.channel(`ledger-${userId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'points_ledger', filter: `user_id=eq.${userId}` }, load).subscribe(status => { if (status === 'SUBSCRIBED') load() })
    window.addEventListener('focus', onFocus)
    const poll = setInterval(onFocus, 30000)
    return () => { active = false; supabase.removeChannel(channel); window.removeEventListener('focus', onFocus); clearInterval(poll) }
  }, [userId, preview, limit, retry])
  return <section className="dashPanel" aria-label="Points history"><h2>Your points history</h2>
    {loading && <p role="status">Loading points history…</p>}
    {error && <p role="alert">{error} <button className="secondary" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
    {!loading && !error && !entries.length && <p>{preview ? 'Your verified recycling and rewards will appear here.' : 'No points activity yet. Points arrive after your first pickup is verified.'}</p>}
    {entries.map(entry => <div className="historyRow" key={entry.id}><div><strong>{labels[entry.kind]}</strong><span>{entry.weight_kg ? `${entry.weight_kg} kg · ` : ''}{new Date(entry.created_at).toLocaleDateString()}</span></div><strong>{entry.points > 0 ? '+' : ''}{entry.points.toLocaleString()} pts</strong></div>)}
    {hasMore && <button className="secondary" onClick={() => setLimit(n => n + 25)}>Load more</button>}
  </section>
}
