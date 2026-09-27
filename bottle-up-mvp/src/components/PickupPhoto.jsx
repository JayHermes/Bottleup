import React, { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function PickupPhoto({ path }) {
  const [url, setUrl] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!path) return null
  async function open() {
    setBusy(true); setError('')
    try {
      if (!supabase) throw new Error()
      const { data, error } = await supabase.storage.from('pickup-photos').createSignedUrl(path, 300)
      if (error) throw error
      setUrl(data.signedUrl)
    } catch { setError('Could not load this photo. You may not have access. Please try again.') }
    finally { setBusy(false) }
  }
  return <div className="pickupPhoto"><button className="textButton" disabled={busy} onClick={() => url ? setUrl(null) : open()}>{busy ? 'Loading photo…' : url ? 'Hide photo' : 'View photo'}</button>{error && <p role="alert">{error}</p>}{url && <img src={url} alt="Plastic prepared for this pickup" onError={() => { setUrl(null); setError('Photo link expired or unavailable. Select View photo to retry.') }}/>}</div>
}
