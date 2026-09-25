import { useState } from 'react'
import { ArrowRight, Camera, Check, MapPin, ShieldCheck, X } from 'lucide-react'
import { geocode, staticMapUrl } from '../lib/mapbox.js'
import { PLASTIC_TYPES } from '../constants.js'

export function PickupModal({ onSubmit, close }) {
  const [type, setType] = useState(PLASTIC_TYPES[0])
  const [estimate, setEstimate] = useState('')
  const [location, setLocation] = useState('')
  const [coords, setCoords] = useState(null) // { lat, lng } once captured
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState('')
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const onPhoto = e => {
    const file = e.target.files?.[0] || null
    if (file) {
      if (!file.type.startsWith('image/')) { setLocateError(''); setError('Please choose an image file.'); e.target.value = ''; return }
      if (file.size > 8 * 1024 * 1024) { setError('That photo is over 8MB — try a smaller one.'); e.target.value = ''; return }
    }
    setError('')
    setPhoto(file)
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null })
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocateError('Location is not available on this device.'); return }
    setLocating(true)
    setLocateError('')
    navigator.geolocation.getCurrentPosition(
      pos => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false) },
      () => { setLocateError("Couldn't get your location — you can still type it below."); setLocating(false) },
      { timeout: 10000 }
    )
  }

  const submit = async e => {
    e.preventDefault()
    if (!estimate || !location) return
    setBusy(true)
    setError('')
    // If they didn't tap "use my location," fall back to converting what they
    // typed into coordinates, so distance-sorting still works for this pickup.
    const finalCoords = coords || await geocode(`${location}, Nigeria`)
    const err = await onSubmit({ type, estimate, location, photo, coords: finalCoords })
    setBusy(false)
    if (err) setError(err.message || 'Could not submit this request. Please try again.')
    else close()
  }

  return <div className="pickupFlow">
    <div className="pickupHead"><button className="iconButton" onClick={close}><X size={18} /></button><span className="eyebrow">NEW COLLECTION</span><span style={{ width: 34 }} /></div>

    <label className="photoHero">
      {preview
        ? <img src={preview} alt="Your plastic" />
        : <div className="photoPlaceholder"><Camera size={26} /><strong>Add a photo</strong><span>Helps verify weight faster · optional</span></div>}
      <input type="file" accept="image/*" onChange={onPhoto} />
    </label>

    <form id="pickupForm" className="pickupForm" onSubmit={submit}>
      <label>What are you recycling?<select value={type} onChange={e => setType(e.target.value)}>{PLASTIC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Estimated weight<input required type="number" min="0.1" step="0.1" value={estimate} onChange={e => setEstimate(e.target.value)} placeholder="e.g. 5 kg" /></label>
      <label>Pickup location<div className="inputWithIcon"><MapPin size={16} /><input required value={location} onChange={e => setLocation(e.target.value)} placeholder="Area or landmark" /></div></label>
      <button type="button" className="locateButton" onClick={useMyLocation} disabled={locating}>
        {coords ? <><Check size={14} />Precise location captured</> : locating ? 'Getting your location…' : <><MapPin size={14} />Add my precise location <span>(optional, helps collectors find you)</span></>}
      </button>
      {coords && staticMapUrl(coords.lat, coords.lng) && <img className="locateMap" src={staticMapUrl(coords.lat, coords.lng)} alt="Your captured pickup location" />}
      {locateError && <div className="authMessage authError">{locateError}</div>}
      <div className="formNote"><ShieldCheck size={15} /> Final points are based on verified weight after collection.</div>
      {error && <div className="authMessage authError">{error}</div>}
    </form>

    <div className="pickupSticky"><button className="primary large" form="pickupForm" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit collection request'} <ArrowRight size={17} /></button></div>
  </div>
}
