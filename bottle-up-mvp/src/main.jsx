import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, Bell, Camera, Check, ChevronRight, Coins, Gift, Home, Leaf,
  MapPin, Package, Pencil, Recycle, ShieldCheck, Truck, UserRound, Users,
  WalletCards, Weight, X
} from './components/Icons.jsx'
import './styles.css'
import './components/dashboard.css'
import DashboardHome from './components/DashboardHome.jsx'
import BankAccount from './components/BankAccount.jsx'
import PickupPhoto from './components/PickupPhoto.jsx'
import PointsHistory from './components/PointsHistory.jsx'
import ContactLinks from './components/ContactLinks.jsx'
import Landing from './components/Landing.jsx'
import { AuthLayout, AuthPanel, ResetPasswordScreen } from './components/AuthPages.jsx'
import { BrandMark, BrandLogo } from './components/Brand.jsx'
import { supabase } from './lib/supabase.js'
import { geocode, staticMapUrl } from './lib/mapbox.js'

function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [profile, setProfile] = useState(null)
  const [recovering, setRecovering] = useState(false)
  const [profileError, setProfileError] = useState('')

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
    const load = () => supabase.from('profiles').select('id, full_name, role, points, city').eq('id', session.user.id).single()
      .then(({ data, error }) => { if (!cancelled) { setProfile(error ? null : data); setProfileError(error ? 'We could not load your balance. Please retry.' : '') } })
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    window.addEventListener('focus', load)
    document.addEventListener('visibilitychange', onVisible)
    const poll = window.setInterval(onVisible, 30000)

    // Live update: if an admin verifies one of my pickups from another device/session,
    // my points here should update without me needing to refresh.
    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
        load)
      .subscribe(status => { if (status === 'SUBSCRIBED') load() })

    return () => { cancelled = true; supabase.removeChannel(channel); window.removeEventListener('focus', load); document.removeEventListener('visibilitychange', onVisible); clearInterval(poll) }
  }, [session])

  const refreshProfile = () => {
    if (!supabase || !session) return
    return supabase.from('profiles').select('id, full_name, role, points, city').eq('id', session.user.id).single()
      .then(({ data, error }) => { setProfile(error ? null : data); setProfileError(error ? 'We could not load your balance. Please retry.' : '') })
  }

  return { session, profile, profileError, refreshProfile, loading: session === undefined, recovering, clearRecovering: () => setRecovering(false) }
}

function useNotifications(userId) {
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

function useRedemptions(userId) {
  const [redemptions, setRedemptions] = useState([])
  const [error, setError] = useState('')
  const reload = async () => {
    if (!supabase || !userId) return
    const { data, error } = await supabase.from('reward_redemptions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
    setError(error ? 'Reward requests could not be refreshed. Pending totals may be out of date.' : '')
    if (!error) setRedemptions(data)
  }
  useEffect(() => {
    reload()
    if (!supabase || !userId) return
    const channel = supabase.channel(`redemptions-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reward_redemptions', filter: `user_id=eq.${userId}` }, reload)
      .subscribe(status => { if (status === 'SUBSCRIBED') reload() })
    const visible = () => { if (document.visibilityState === 'visible') reload() }
    window.addEventListener('focus', visible)
    const poll = setInterval(visible, 30000)
    return () => { supabase.removeChannel(channel); window.removeEventListener('focus', visible); clearInterval(poll) }
  }, [userId])
  return { redemptions, reload, error }
}

// Straight-line distance in km — good enough to sort "nearest first" without a maps API/key.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Re-encode images through a canvas before upload: strips EXIF metadata (which
// can embed precise GPS and device info) and downscales to a sane size.
async function normalizeImage(file) {
  if (!file || !file.type.startsWith('image/')) return file
  try {
    const bitmap = await createImageBitmap(file)
    const max = 1600
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) throw new Error('Image conversion failed')
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    throw new Error('This photo could not be processed. Please choose a JPEG, PNG or WebP image.')
  }
}

function usePickupRequests(userId) {
  const [requests, setRequests] = useState(null) // null = still loading
  const [requestsError, setRequestsError] = useState('')

  const reload = () => {
    if (!supabase || !userId) return
    // RLS already scopes this to what the signed-in account is allowed to see —
    // own requests for a user, available + assigned for a collector, everything for an admin.
    supabase.from('pickup_requests').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) { setRequestsError(error.message); setRequests([]) } else { setRequests(data); setRequestsError('') } })
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

const PLASTIC_TYPES = ['PET Bottles', 'Plastic Containers', 'HDPE Plastic', 'Mixed Plastic']
const BOTTLES_PER_KG = 50 // what someone types in the pickup form; storage and every backend calculation stay in kg
const STAGES = ['Submitted', 'Accepted', 'On the way', 'Collected', 'Verified']
const STATUS_TO_STAGE = { AVAILABLE: 0, ACCEPTED: 1, ON_THE_WAY: 2, COLLECTED: 3, VERIFIED: 4 }
const STATUS_LABEL = { AVAILABLE: 'Awaiting collector', ACCEPTED: 'Collector assigned', ON_THE_WAY: 'On the way', COLLECTED: 'Collected', VERIFIED: 'Verified', DELIVERED: 'Delivered for verification', CANCELLED: 'Cancelled' }
const POINTS_PER_KG = 70 // what the requester earns per verified kg — must match bottleup_private.pickup_rate() in the database
const COLLECTOR_RATE_PER_KG = 25 // what the collector earns per verified kg (when one is assigned) — must match bottleup_private.collector_rate()
const PHOTO_BUCKET = 'pickup-photos'
const REWARDS = [
  { name: '₦500 Airtime', cost: 300, note: 'Mobile airtime reward' },
  { name: '₦1,000 Airtime', cost: 500, note: 'Mobile airtime reward' },
  { name: '₦2,000 Shopping Voucher', cost: 1000, note: 'Partner voucher' },
]
const TIERS = [
  { name: 'Bronze', from: 0 },
  { name: 'Silver', from: 10 },
  { name: 'Gold', from: 25 },
  { name: 'Platinum', from: 50 },
]

function BottleGauge({ progress = 0 }) {
  const fillPct = Math.round(progress * 100)
  return (
    <svg className="bottleGauge" width={64} height={92} viewBox="0 0 64 92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${fillPct}% to next tier`}>
      <defs>
        <clipPath id="jarClip"><path d="M22 6h20v8c5 2 8 6.6 8 12v50c0 4.4-3.6 8-8 8H22c-4.4 0-8-3.6-8-8V26c0-5.4 3-10 8-12V6Z" /></clipPath>
        <linearGradient id="jarFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--green-bright)" />
        </linearGradient>
      </defs>
      <path d="M22 6h20v8c5 2 8 6.6 8 12v50c0 4.4-3.6 8-8 8H22c-4.4 0-8-3.6-8-8V26c0-5.4 3-10 8-12V6Z" fill="var(--surface-3)" stroke="var(--line)" />
      <g clipPath="url(#jarClip)"><rect x="8" y={92 - fillPct * 0.76} width="48" height="92" fill="url(#jarFill)" /></g>
      <rect x="26" y="1" width="12" height="6" rx="2" fill="var(--surface-3)" stroke="var(--line)" />
    </svg>
  )
}

function Logo({ size = 34 }) {
  return <div className="logoMark" style={{ width: size, height: size, background: 'transparent', boxShadow: 'none', color: 'var(--cream)', '--brand-mark-cutout': 'var(--ink)' }} aria-hidden="true"><BrandMark size={size} /></div>
}

const AVATAR_TONES = ['t1', 't2', 't3', 't4', 't5']
function initials(name, email) {
  const s = (name || '').trim()
  if (s) { const parts = s.split(/\s+/); return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase() }
  return (email || '?').trim().charAt(0).toUpperCase()
}
function avatarTone(name, email) {
  const s = (name || email || '?')
  let hash = 0
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length]
}
function Avatar({ name, email, size = 'md' }) {
  return <span className={`avatar avatar-${size} ${avatarTone(name, email)}`}>{initials(name, email)}</span>
}

function LegalScreen({ page, onBack }) {
  const privacy = <>
    <h2>What we collect</h2>
    <p>To run BottleUp we collect your name, phone number, and email address when you sign up; the material type, estimated and verified weight, and location text (plus GPS coordinates only if you choose to add them) for each pickup you request; photos you optionally attach to a pickup; and your points balance and reward redemption history.</p>
    <h2>Why we collect it</h2>
    <p>This information is used to operate the pickup-and-verification loop itself — matching your request to a collector, letting an admin verify the collected weight, and crediting the correct points to your account. We don't sell your data, and we don't use it for advertising.</p>
    <h2>Who can see it</h2>
    <p>Collectors can see the pickups they've accepted. Admins can see pickups and applications needed to run verification and collector approval. Your authentication and data storage are handled by Supabase, our infrastructure provider.</p>
    <h2>Your choices</h2>
    <p>Adding a photo and precise GPS location are both optional. You can edit your name from your Profile at any time. You can also permanently delete your account and your own pickup data directly from Profile — pickups you collected for other people remain on their record, with your name removed from them.</p>
    <h2>A note on where we are</h2>
    <p>BottleUp is an early-stage pilot. This policy describes what we actually do today, in plain language, rather than a full legal document — if you have concerns about how your data is handled, please reach out directly.</p>
  </>
  const terms = <>
    <h2>Using BottleUp</h2>
    <p>You must provide accurate information when requesting a pickup, including a realistic estimated weight — final points are always based on the weight verified after collection, not your estimate.</p>
    <h2>Collectors</h2>
    <p>Becoming a collector requires applying through signup and being approved by BottleUp. Approval isn't automatic, and BottleUp may decline or revoke collector status at its discretion.</p>
    <h2>Points and rewards</h2>
    <p>Points are earned at a fixed rate (1 kg of verified plastic = {POINTS_PER_KG} points) and have no cash value. Rewards shown in the app may be limited by partner availability and are not guaranteed to be redeemable at all times. BottleUp Wallet is a reward balance, not a cash account — there is no cash withdrawal.</p>
    <h2>Conduct</h2>
    <p>Don't misrepresent the material or weight of a pickup, and don't attempt to circumvent the verification process. Accounts found doing so may be suspended.</p>
    <h2>Changes</h2>
    <p>Because BottleUp is actively being built, these terms may change as features are added. We'll aim to keep this page current with what the product actually does.</p>
  </>
  return <AuthLayout mode="legal" onBack={onBack}><span className="bu-auth-eyebrow">A LITTLE CLARITY</span><h1>{page === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}</h1><div className="legalBody">{page === 'privacy' ? privacy : terms}</div></AuthLayout>
}

function StageTracker({ status }) {
  if (status === 'CANCELLED') return <p className="requestMeta">This request was cancelled.</p>
  const idx = STATUS_TO_STAGE[status] ?? 0
  return <div className="stageWrap"><div className="stages">{STAGES.map((label, i) => <React.Fragment key={label}><span className={`stageDot ${i <= idx ? 'done' : ''}`}>{i < idx ? <Check size={9} /> : i === idx ? <span /> : null}</span>{i < STAGES.length - 1 && <span className={`stageLine ${i < idx ? 'done' : ''}`} />}</React.Fragment>)}</div><div className="stageLabels">{STAGES.map((label, i) => <span className={i <= idx ? 'done' : ''} key={label}>{label}</span>)}</div></div>
}

function Stat({ icon: Icon, value, label }) { return <div className="miniStat"><div className="miniIcon"><Icon size={16} /></div><strong>{value}</strong><span>{label}</span></div> }

function RequestCard({ request, action, compact = false, distanceKm, pointsRate = POINTS_PER_KG }) {
  const weight = request.actual_weight_kg || request.estimated_weight_kg
  const earnedPoints = request.status === 'VERIFIED' ? Math.round((request.actual_weight_kg || 0) * pointsRate) : 0
  return <article className={`requestCard ${compact ? 'compact' : ''}`}><div className="requestTop"><div className="requestIcon"><Package size={18} /></div><div className="requestMain"><div className="requestTitle">{request.material_type}</div><div className="requestMeta"><span>{request.id.slice(0, 8)}</span><span><MapPin size={12} />{request.pickup_location}</span><span><Weight size={12} />{weight} kg</span>{distanceKm != null && <span className="distanceBadge">{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away</span>}</div></div><span className={`status ${request.status.toLowerCase()}`}>{STATUS_LABEL[request.status]}</span></div><StageTracker status={request.status} /><PickupPhoto path={request.photo_url} />{(earnedPoints > 0 || action) && <div className="requestBottom">{earnedPoints > 0 ? <span className="points"><Coins size={14} />+{earnedPoints} points</span> : <span />}{action}</div>}</article>
}

function EmptyState({ icon: Icon = Package, title, body }) { return <div className="emptyState"><div className="emptyIcon"><Icon size={22} /></div><strong>{title}</strong><p>{body}</p></div> }

function PageTitle({ eyebrow, title, body }) { return <div className="pageTitle"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div> }

function PickupModal({ onSubmit, close }) {
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
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setLocateError(''); setError('Please choose a JPEG, PNG or WebP photo.'); e.target.value = ''; return }
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
    // The person counts bottles (what they can actually see in front of them);
    // storage and every downstream calculation still work in kg, so convert
    // here, at the one place bottles become a number anyone typed in.
    const estimateKg = Number(estimate) / BOTTLES_PER_KG
    // If they didn't tap "use my location," fall back to converting what they
    // typed into coordinates, so distance-sorting still works for this pickup.
    try {
      const finalCoords = coords || await geocode(`${location}, Nigeria`)
      const err = await onSubmit({ type, estimate: estimateKg, location, photo, coords: finalCoords })
      if (err) setError(err.message || 'Could not submit this request. Please try again.')
      else close()
    } catch { setError('Could not submit this request. Please try again.') } finally { setBusy(false) }
  }

  return <div className="pickupFlow">
    <div className="pickupHead"><button className="iconButton" aria-label="Close pickup form" onClick={close}><X size={18} /></button><span className="eyebrow">NEW COLLECTION</span><span style={{ width: 34 }} /></div>

    <label className="photoHero">
      {preview
        ? <img src={preview} alt="Your plastic" />
        : <div className="photoPlaceholder"><Camera size={26} /><strong>Add a photo</strong><span>Helps verify weight faster · optional</span></div>}
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} />
    </label>

    <form id="pickupForm" className="pickupForm" onSubmit={submit}>
      <label>What are you recycling?<select value={type} onChange={e => setType(e.target.value)}>{PLASTIC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Approximate number of bottles<input required type="number" min="1" step="1" value={estimate} onChange={e => setEstimate(e.target.value)} placeholder="e.g. 40 bottles" /></label>
      <p className="fieldHint">About {BOTTLES_PER_KG} bottles ≈ 1 kg. Your final reward is based on the actual weight collectors verify.</p>
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

function PickupsScreen({ requests, userId, onNew }) {
  const [filter, setFilter] = useState('All')
  const [search, setSearch] = useState('')
  const mine = requests.filter(r => r.user_id === userId && (filter === 'All' || (filter === 'Verified' ? r.status === 'VERIFIED' : !['VERIFIED', 'CANCELLED'].includes(r.status))) && `${r.material_type} ${r.pickup_location}`.toLowerCase().includes(search.toLowerCase()))
  const tracking = mine.find(r => ['ACCEPTED', 'ON_THE_WAY'].includes(r.status) && r.latitude != null && r.collector_latitude != null)
  const distance = tracking ? haversineKm(tracking.latitude, tracking.longitude, tracking.collector_latitude, tracking.collector_longitude) : null

  return <><PageTitle eyebrow="YOUR ACTIVITY" title="Pickups" body="Track every collection from request to verified weight." /><div className="pickupToolbar"><div className="filterTabs">{['All','Active','Verified'].map(label => <button key={label} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div><input aria-label="Search pickups" placeholder="Search collections…" value={search} onChange={e => setSearch(e.target.value)}/><button className="primary" onClick={onNew}>New pickup</button></div>
    {tracking && (
      <section className="trackingCard">
        <div className="sectionHead"><div><span className="eyebrow">LIVE</span><h2>Your collector</h2></div>{distance != null && <span className="distanceBadge">{distance < 1 ? `${Math.round(distance * 1000)} m away` : `${distance.toFixed(1)} km away`}</span>}</div>
        <React.Suspense fallback={<div className="mapShell mapLoading">Loading map…</div>}>
          <PickupsMap
            points={[{ lat: tracking.collector_latitude, lng: tracking.collector_longitude, popupHtml: 'Your collector' }]}
            myPos={{ lat: tracking.latitude, lng: tracking.longitude }}
            myPopupHtml="Your pickup location"
          />
        </React.Suspense>
      </section>
    )}
    {mine.length ? <div className="requestList">{mine.map(r => <RequestCard key={r.id} request={r} />)}</div> : <EmptyState title="No matching collections" body="Try another filter or book a new pickup." />}</>
}

function RewardsScreen({ points, redeem, redemptions, rewards, rewardsError }) {
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState(null)
  const confirmationRef = useRef(null)
  useEffect(() => { if (selected) confirmationRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [selected])
  const [error, setError] = useState('')
  async function confirmReward() {
    setBusy(true); setError('')
    try { await redeem(selected); setSelected(null) } catch (err) { setError(err.message || 'Could not request this reward. Please retry.') } finally { setBusy(false) }
  }
  const pending = redemptions.filter(r => r.status === 'pending')
  return <><PageTitle eyebrow="YOUR REWARDS" title="Rewards" body="Turn your verified recycling into something useful." /><div className="rewardHero"><div className="rewardBalance"><Coins size={28} /><div><strong>{points.toLocaleString()}</strong><span>available points</span></div></div><span>{POINTS_PER_KG} points = 1 kg verified plastic</span></div><div className="sectionHead"><div><span className="eyebrow">MARKETPLACE</span><h2>Redeem your points</h2></div></div>{rewardsError && <p role="alert">{rewardsError}</p>}<div className="rewardGrid">{rewards.map(r => <div className="rewardCard" key={r.name}><div className="rewardIcon"><Gift size={20} /></div><div><strong>{r.name}</strong><p>{r.note}</p></div><div className="rewardCost"><span>{r.cost.toLocaleString()} pts</span><button className="secondary" disabled={busy || points < r.cost} onClick={() => { setSelected({ ...r, requestKey: crypto.randomUUID() }); setError('') }}>Redeem</button></div></div>)}</div>
    {redemptions.length > 0 && <><div className="sectionHead"><div><span className="eyebrow">HISTORY</span><h2>Your redemptions</h2></div></div><div className="requestList">{redemptions.map(r => <div className="historyRow" key={r.id}><div><strong>{r.reward_name}</strong><span>{r.cost} pts · {new Date(r.created_at).toLocaleDateString()}</span></div><span className={`status ${r.status}`}>{r.status === 'pending' ? 'Pending' : r.status === 'fulfilled' ? 'Fulfilled' : 'Declined — refunded'}</span></div>)}</div></>}
    {selected && <section ref={confirmationRef} className="dashPanel" role="region" aria-label="Confirm reward"><h2>Redeem {selected.name}?</h2><p>This uses {selected.cost} points. The BottleUp team will fulfil the request after it is approved.</p>{error && <p role="alert">{error}</p>}<div className="dashActions"><button className="primary" disabled={busy} onClick={confirmReward}>{busy ? 'Requesting…' : 'Confirm redemption'}</button><button className="secondary" disabled={busy} onClick={() => setSelected(null)}>Cancel</button></div></section>}
    <div className="pilotNote"><ShieldCheck size={17} /><div><strong>Pilot rewards</strong><span>{pending.length > 0 ? `You have ${pending.length} redemption${pending.length > 1 ? 's' : ''} awaiting fulfilment.` : 'Reward fulfilment is handled by the BottleUp team as each partner activates. Your points remain attached to your account.'}</span></div></div></>
}

function WalletScreen({ points, redemptions, userId, preview }) {
  const pending = redemptions.filter(r => r.status === 'pending').reduce((a,r) => a + r.cost, 0)
  return <><PageTitle eyebrow="YOUR BOTTLEUP WALLET" title="A little back. A lot of good." body="Your recycling rewards and bank details, together in one place."/><div className="walletGrid"><div className="walletMain"><span>Available points</span><strong>{points.toLocaleString()}<small> pts</small></strong><small>Earned through verified recycling</small></div><div className="walletStat"><span>Pending rewards</span><strong>{pending.toLocaleString()} pts</strong><p>Awaiting fulfilment</p></div></div><PointsHistory userId={userId} preview={preview}/><BankAccount userId={userId} preview={preview}/></>
}

function ProfileScreen({ profile, email, onSaveName, notify, onExit, setScreen, preview }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const startEdit = () => { setDraft(profile?.full_name || ''); setEditing(true) }
  const save = async () => {
    setSaving(true)
    try { await onSaveName(draft.trim()); setEditing(false) } catch (error) { notify(error.message || 'Could not save your name.') } finally { setSaving(false) }
  }

  const deleteAccount = async () => {
    setDeleting(true)
    setDeleteError('')
    if (preview || !supabase) { setDeleteError('Account deletion is unavailable in the design preview.'); setDeleting(false); return }
    const { error } = await supabase.rpc('delete_own_account')
    if (error) { setDeleteError(error.message); setDeleting(false); return }
    // Account is gone — the session is no longer valid, sign out client-side to land back on the landing page.
    supabase.auth.signOut()
  }



  return <>
    <PageTitle eyebrow="YOUR ACCOUNT" title="Profile" body="Your BottleUp account and collection preferences." />
    <div className="profileCard">
      <Avatar name={profile?.full_name} email={email} size="lg" />
      {editing ? (
        <div className="profileEdit">
          <input className="authInput" autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="Your name" />
          <div className="profileEditActions"><button className="primary small" disabled={saving || !draft.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button><button className="secondary small" onClick={() => setEditing(false)}>Cancel</button></div>
        </div>
      ) : (
        <><div className="profileIdentity"><strong>{profile?.full_name || 'Add your name'}</strong><span>{email}</span></div><button className="iconButton" onClick={startEdit} title="Edit name"><Pencil size={16} /></button></>
      )}
    </div>
    <section className="dashPanel"><span className="eyebrow">PAYMENT DETAILS</span><h2>Make your account yours.</h2><p>Add or update your bank account securely from your wallet.</p><button className="primary" onClick={() => setScreen('wallet')}>Manage bank details <ArrowRight size={16}/></button></section>
    <section className="dashPanel dashboardHelp"><h2>A little help along the way</h2><details><summary>When will I receive my points?</summary><p>Points are added after the BottleUp team verifies the collected weight. Each verified kilogram earns {POINTS_PER_KG} points.</p></details><details><summary>What should I prepare for collection?</summary><p>Keep your plastic together for collection and add a clear pickup address when you book. A photo is optional. Our recycling team handles the cleaning.</p></details><details><summary>Can I withdraw cash?</summary><p>Cash withdrawals are not available in the pilot. Bank details can be stored for future payouts. You can request the rewards shown in Rewards.</p></details></section>
    <section className="dashPanel dashboardSupport"><span className="eyebrow">SUPPORT & COMMUNITY</span><h2>We’re here to help.</h2><p>Email us for help with your account, pickups or rewards, or find BottleUp on social media.</p><ContactLinks /></section>
    <button className="secondary" onClick={onExit}>Sign out</button>

    <div className="dangerZone">
      {!confirmingDelete ? (
        <button className="dangerLink" onClick={() => setConfirmingDelete(true)}>Delete my account</button>
      ) : (
        <div className="dangerConfirm">
          <strong>This permanently deletes your account.</strong>
          <p>Your profile and your own pickup requests will be removed. Pickups you collected for other people stay on their record, just without your name attached. This can't be undone.</p>
          {deleteError && <div className="authMessage authError">{deleteError}</div>}
          <div className="profileEditActions">
            <button className="dangerButton" disabled={deleting} onClick={deleteAccount}>{deleting ? 'Deleting…' : 'Yes, permanently delete'}</button>
            <button className="secondary small" onClick={() => { setConfirmingDelete(false); setDeleteError('') }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  </>
}

function CollectAction({ request, onCollect }) {
  const [weight, setWeight] = useState(String(request.estimated_weight_kg))
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (!weight || Number(weight) <= 0) return
    setBusy(true)
    await onCollect(request.id, weight)
    setBusy(false)
  }
  return <div className="collectAction"><div className="inputWithIcon"><Weight size={14} /><input type="number" min="0.1" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} /></div><button className="primary small" disabled={busy} onClick={go}>{busy ? 'Saving…' : 'Confirm collected'}</button></div>
}

const PickupsMap = React.lazy(() => import('./PickupsMap.jsx'))

function CollectorScreen({ requests, userId, accept, startOnTheWay, collect }) {
  const [myPos, setMyPos] = useState(null)
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => setMyPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // silent — distance sorting is a nice-to-have, not required to use the screen
      { timeout: 8000 }
    )
  }, [])

  const withDistance = r => myPos && r.latitude != null && r.longitude != null
    ? haversineKm(myPos.lat, myPos.lng, r.latitude, r.longitude)
    : null

  const available = requests.filter(r => r.status === 'AVAILABLE')
    .map(r => ({ r, d: withDistance(r) }))
    .sort((a, b) => (a.d ?? Infinity) - (b.d ?? Infinity))
    .map(x => x.r)
  const mine = requests.filter(r => r.collector_id === userId && r.status !== 'VERIFIED')
  const completed = requests.filter(r => r.collector_id === userId && r.status === 'VERIFIED')
  const kg = completed.reduce((a, r) => a + (r.actual_weight_kg || 0), 0)
  const myPoints = Math.round(kg * COLLECTOR_RATE_PER_KG)

  const actionFor = r => {
    if (r.status === 'AVAILABLE') return <button className="primary small" onClick={() => accept(r.id, myPos)}>Accept pickup</button>
    if (r.status === 'ACCEPTED' && r.collector_id === userId) return <button className="primary small" onClick={() => startOnTheWay(r.id, myPos)}>Start heading over</button>
    if (r.status === 'ON_THE_WAY' && r.collector_id === userId) return <CollectAction request={r} onCollect={collect} />
    return null
  }

  return <><PageTitle eyebrow="COLLECTOR MODE" title="Today's pickups" body={myPos ? "Sorted by distance from your current location." : "Accept nearby requests and keep every collection moving."} /><section className="collectorSummary"><Stat icon={Package} value={available.length} label="Available" /><Stat icon={Truck} value={mine.length} label="My pickups" /><Stat icon={Recycle} value={`${kg.toFixed(1)} kg`} label="Verified total" /><Stat icon={Coins} value={myPoints} label="Points earned" /></section>
    <React.Suspense fallback={<div className="mapShell mapLoading">Loading map…</div>}><PickupsMap points={available.filter(r => r.latitude != null && r.longitude != null).map(r => ({ lat: r.latitude, lng: r.longitude, popupHtml: `<strong>${r.material_type}</strong><br/>${r.pickup_location} · ${r.estimated_weight_kg} kg` }))} myPos={myPos} myPopupHtml="Your location" /></React.Suspense>
    <section className="sectionHead"><div><span className="eyebrow">QUEUE</span><h2>Available nearby</h2></div></section>{available.length ? <div className="requestList">{available.map(r => <RequestCard key={r.id} request={r} action={actionFor(r)} distanceKm={withDistance(r)} />)}</div> : <EmptyState title="Nothing nearby" body="New collection requests will appear here." />}{mine.length > 0 && <><section className="sectionHead"><div><span className="eyebrow">IN PROGRESS</span><h2>My pickups</h2></div></section><div className="requestList">{mine.map(r => <RequestCard key={r.id} request={r} action={actionFor(r)} pointsRate={COLLECTOR_RATE_PER_KG} />)}</div></>}
    {completed.length > 0 && <><section className="sectionHead"><div><span className="eyebrow">HISTORY</span><h2>Completed collections</h2></div></section><div className="requestList">{completed.map(r => <RequestCard key={r.id} request={r} pointsRate={COLLECTOR_RATE_PER_KG} compact />)}</div></>}</>
}

function AdminScreen({ requests, verify }) {
  const collected = requests.filter(r => r.status === 'COLLECTED')
  const verified = requests.filter(r => r.status === 'VERIFIED')
  const totalKg = verified.reduce((a, r) => a + (r.actual_weight_kg || 0), 0)
  const totalPoints = verified.reduce((a, r) => a + Math.round((r.actual_weight_kg || 0) * POINTS_PER_KG) + (r.collector_id ? Math.round((r.actual_weight_kg || 0) * COLLECTOR_RATE_PER_KG) : 0), 0)

  const [applications, setApplications] = useState(null) // null = loading
  const [appError, setAppError] = useState('')
  const [userCount, setUserCount] = useState(null)
  const [redemptionQueue, setRedemptionQueue] = useState(null)
  const [redemptionError, setRedemptionError] = useState('')

  useEffect(() => {
    if (!supabase) return
    supabase.from('profiles').select('id', { count: 'exact', head: true }).then(({ count }) => setUserCount(count))
  }, [])

  const loadRedemptions = () => {
    if (!supabase) return
    supabase.from('reward_redemptions').select('id, reward_name, cost, created_at, profiles!user_id(full_name)').eq('status', 'pending').order('created_at', { ascending: true })
      .then(({ data, error }) => { if (error) setRedemptionError(error.message); else { setRedemptionQueue(data); setRedemptionError('') } })
  }
  useEffect(loadRedemptions, [])
  const decideRedemption = async (id, status) => {
    const { error } = await supabase.rpc('decide_redemption', { p_id: id, p_status: status })
    if (error) setRedemptionError(error.message)
    else loadRedemptions()
  }

  const loadApplications = () => {
    if (!supabase) return
    supabase
      .from('collector_applications')
      .select('id, created_at, profiles!user_id(full_name, phone)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (error) setAppError(error.message)
        else { setApplications(data); setAppError('') }
      })
  }
  useEffect(loadApplications, [])

  const decide = async (id, status) => {
    const { error } = await supabase.rpc('decide_collector_application', { p_id: id, p_status: status })
    if (error) setAppError(error.message)
    else loadApplications()
  }

  return <><PageTitle eyebrow="OPERATIONS" title="BottleUp overview" body="Keep collections, verification and rewards moving." /><section className="adminStats"><Stat icon={Users} value={userCount ?? '—'} label="Users" /><Stat icon={Package} value={requests.length} label="Requests" /><Stat icon={Recycle} value={`${totalKg.toFixed(1)} kg`} label="Verified plastic" /><Stat icon={Coins} value={totalPoints} label="Points issued" /></section>

    <section className="sectionHead"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Collector applications</h2></div>{applications && <span className="queueCount">{applications.length} waiting</span>}</section>
    {appError && <div className="authMessage authError" style={{ marginBottom: 12 }}>{appError}</div>}
    {applications === null ? null : applications.length ? (
      <div className="requestList">{applications.map(a => (
        <article className="requestCard" key={a.id}>
          <div className="requestTop">
            <div className="requestIcon"><UserRound size={18} /></div>
            <div className="requestMain">
              <div className="requestTitle">{a.profiles?.full_name || 'Unnamed applicant'}</div>
              <div className="requestMeta"><span>{a.profiles?.phone || 'No phone on file'}</span><span>Applied {new Date(a.created_at).toLocaleDateString()}</span></div>
            </div>
          </div>
          <div className="requestBottom"><span /><div style={{ display: 'flex', gap: 8 }}><button className="secondary small" onClick={() => decide(a.id, 'rejected')}>Reject</button><button className="primary small" onClick={() => decide(a.id, 'approved')}>Approve collector</button></div></div>
        </article>
      ))}</div>
    ) : <EmptyState icon={UserRound} title="No pending applications" body="New collector requests from signup will appear here." />}

    <section className="sectionHead"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Redemption requests</h2></div>{redemptionQueue && <span className="queueCount">{redemptionQueue.length} waiting</span>}</section>
    {redemptionError && <div className="authMessage authError" style={{ marginBottom: 12 }}>{redemptionError}</div>}
    {redemptionQueue === null ? null : redemptionQueue.length ? (
      <div className="requestList">{redemptionQueue.map(r => (
        <article className="requestCard" key={r.id}>
          <div className="requestTop">
            <div className="requestIcon"><Gift size={18} /></div>
            <div className="requestMain">
              <div className="requestTitle">{r.reward_name}</div>
              <div className="requestMeta"><span>{r.profiles?.full_name || 'Unnamed user'}</span><span>{r.cost} pts</span><span>{new Date(r.created_at).toLocaleDateString()}</span></div>
            </div>
          </div>
          <div className="requestBottom"><span /><div style={{ display: 'flex', gap: 8 }}><button className="secondary small" onClick={() => decideRedemption(r.id, 'rejected')}>Decline & refund</button><button className="primary small" onClick={() => decideRedemption(r.id, 'fulfilled')}>Mark fulfilled</button></div></div>
        </article>
      ))}</div>
    ) : <EmptyState icon={Gift} title="No pending redemptions" body="Requests to redeem points for rewards will appear here." />}

    <section className="sectionHead"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Verification queue</h2></div><span className="queueCount">{collected.length} waiting</span></section>{collected.length ? <div className="requestList">{collected.map(r => <RequestCard key={r.id} request={r} action={<button className="primary small" onClick={() => verify(r.id)}>Verify + reward</button>} />)}</div> : <EmptyState icon={ShieldCheck} title="Queue is clear" body="Collected pickups will appear here for verification." />}<section className="sectionHead activityHead"><div><span className="eyebrow">RECENT</span><h2>All activity</h2></div></section><div className="requestList">{requests.map(r => <RequestCard key={r.id} request={r} compact />)}</div></>
}

function AppShell({ onExit, profile, email, userId, onSaveName, refreshProfile = async () => {}, preview = false }) {
  const realRole = profile?.role || 'user' // source of truth: the profiles table, protected by database write privileges and validated commands
  const [previewRole, setPreviewRole] = useState(null) // only ever used when realRole === 'admin'
  const role = realRole === 'admin' ? (previewRole || 'admin') : realRole
  const canPreview = realRole === 'admin'

  const [screen, setScreen] = useState('home')
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [screen])
  const [notice, setNotice] = useState('')
  const live = usePickupRequests(preview ? null : userId)
  const { requestsError, reload } = live
  const requests = preview ? PREVIEW_REQUESTS : live.requests
  const loadingRequests = preview ? false : live.loadingRequests
  const [showPickup, setShowPickup] = useState(false)
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(preview ? null : userId)
  const { redemptions, reload: reloadRedemptions, error: redemptionsError } = useRedemptions(preview ? null : userId)
  const [notifOpen, setNotifOpen] = useState(false)

  const points = profile.points
  const [rewards, setRewards] = useState(preview ? REWARDS : [])
  const [rewardsError, setRewardsError] = useState('')
  useEffect(() => {
    if (preview || !supabase) return
    supabase.from('reward_catalog').select('id,name,cost,note').eq('active', true).order('cost').then(({data,error}) => { setRewards(data || []); setRewardsError(error ? 'Rewards are unavailable. Please reload to try again.' : '') })
  }, [preview])

  const submitPickup = async ({ type, estimate, location, photo, coords }) => {
    if (preview || !supabase) return new Error('Preview only. Connect the database to request a pickup. Nothing has been saved.')
    let photo_url = null
    if (photo) {
      // Private bucket + RLS-scoped path (`<user_id>/<file>`). The stored value
      // is the object path, not a public URL.
      const safePhoto = await normalizeImage(photo)
      const path = `${userId}/${crypto.randomUUID()}.jpg`
      const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, safePhoto)
      if (upErr) return upErr
      photo_url = path
    }
    const { error } = await supabase.from('pickup_requests').insert({
      user_id: userId, material_type: type, estimated_weight_kg: Number(estimate), pickup_location: location, photo_url,
      latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
    })
    if (error && photo_url) {
      const { error: cleanupError } = await supabase.storage.from(PHOTO_BUCKET).remove([photo_url])
      if (cleanupError) return new Error('Pickup could not be saved. The photo may remain in your private storage. Please retry the request.')
    }
    if (!error) { reload(); setScreen('pickups'); setNotice('Pickup request submitted.') }
    return error
  }
  const accept = async (id, coords) => { const { error } = await supabase.rpc('accept_pickup', { p_id: id, p_lat: coords?.lat ?? null, p_lng: coords?.lng ?? null }); setNotice(error ? error.message : 'Pickup accepted.'); reload() }
  const startOnTheWay = async (id, coords) => { const { error } = await supabase.rpc('start_on_the_way', { p_id: id, p_lat: coords?.lat ?? null, p_lng: coords?.lng ?? null }); setNotice(error ? error.message : 'Marked as on the way.'); reload() }
  const collect = async (id, weight) => { const { error } = await supabase.rpc('collect_pickup', { p_id: id, p_weight: Number(weight) }); setNotice(error ? error.message : 'Collection marked as collected.'); reload() }
  const verify = async id => { const { error } = await supabase.rpc('verify_pickup', { p_id: id }); setNotice(error ? error.message : 'Weight verified and points issued.'); reload() }
  const redeem = async reward => {
    if (preview || !supabase) throw new Error('Preview only. No reward has been requested.')
    const storageKey = `bottleup-reward:${userId}:${reward.id}`
    let requestKey = reward.requestKey
    try { requestKey = sessionStorage.getItem(storageKey) || requestKey; sessionStorage.setItem(storageKey, requestKey) } catch { /* The in-memory key still protects retries when storage is disabled. */ }
    const { error } = await supabase.rpc('request_reward', { p_reward_id: reward.id, p_request_key: requestKey })
    // Explicit reload covers delayed or disconnected realtime subscriptions.
    if (error) { setNotice(error.message); throw error }
    else { try { sessionStorage.removeItem(storageKey) } catch {} setNotice(`${reward.name} redemption request received.`); reloadRedemptions(); await refreshProfile() }
  }
  const nav = [{ id: 'home', label: 'Home', icon: Home }, { id: 'pickups', label: 'Pickups', icon: Package }, { id: 'rewards', label: 'Rewards', icon: Gift }, { id: 'wallet', label: 'Wallet', icon: WalletCards }, { id: 'profile', label: 'Profile', icon: UserRound }]

  const content = loadingRequests ? null : role === 'collector' ? <CollectorScreen {...{ requests, userId, accept, startOnTheWay, collect }} /> : role === 'admin' ? <AdminScreen {...{ requests, verify }} /> : screen === 'home' ? <DashboardHome {...{ requests, setScreen, profile, userId }} onNew={() => setShowPickup(true)} /> : screen === 'pickups' ? <PickupsScreen requests={requests} userId={userId} onNew={() => setShowPickup(true)} /> : screen === 'rewards' ? <RewardsScreen points={points} redeem={redeem} redemptions={redemptions} rewards={rewards} rewardsError={rewardsError} /> : screen === 'wallet' ? <WalletScreen points={points} redemptions={redemptions} userId={userId} preview={preview} /> : <ProfileScreen profile={profile} email={email} onSaveName={onSaveName} notify={setNotice} onExit={onExit} setScreen={setScreen} preview={preview} />

  return <>{notifOpen && <div className="notifBackdrop" onClick={() => setNotifOpen(false)} />}<div className="app dashboard">{preview && <div className="previewBanner">Design preview · Sample data · Changes are not saved <a href="/">Back to website ↗</a></div>}<header className="topbar"><div className="topInner"><button className="brand brandButton" onClick={() => { setPreviewRole(null); setScreen('home') }}><BrandLogo /></button><div className="topActions"><div className="notifWrap"><button className="iconButton" title="Notifications" onClick={() => setNotifOpen(o => !o)}><Bell size={18} />{unreadCount > 0 && <span className="notifDot">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>{notifOpen && <div className="notifPanel"><div className="notifHead"><strong>Notifications</strong>{unreadCount > 0 && <button onClick={markAllRead}>Mark all read</button>}</div>{notifications.length ? notifications.map(n => <button key={n.id} className={`notifRow ${n.read ? '' : 'unread'}`} onClick={() => markRead(n.id)}><span>{n.message}</span><small>{new Date(n.created_at).toLocaleDateString()}</small></button>) : <div className="notifEmpty">Nothing yet — updates on your pickups will show up here.</div>}</div>}</div><Avatar name={profile?.full_name} email={email} size="sm" /></div></div></header><div className="appBody"><aside className="sidebar"><div className="rolePill"><span>{canPreview && previewRole ? 'PREVIEWING' : 'ACCOUNT'}</span><strong>{role === 'user' ? 'User' : role === 'collector' ? 'Collector' : 'Admin'}</strong></div>{role === 'user' && nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'navItem active' : 'navItem'} onClick={() => setScreen(id)}><Icon size={18} />{label}</button>)}<div className="sideBottom">{canPreview && <div className="previewSwitch"><span className="previewLabel">PREVIEW AS</span><div className="previewOptions">{['user', 'collector', 'admin'].map(r => <button key={r} className={role === r ? 'active' : ''} onClick={() => setPreviewRole(r === 'admin' ? null : r)}>{r === 'user' ? 'User' : r === 'collector' ? 'Collector' : 'Admin'}</button>)}</div></div>}<button className="navItem" onClick={onExit}><ArrowRight size={18} />Sign out</button></div></aside><main className="main">{notice && <button className="notice" onClick={() => setNotice('')}><Check size={15} />{notice}<X size={14} /></button>}{redemptionsError && <p role="alert">{redemptionsError} <button className="secondary" onClick={reloadRedemptions}>Retry</button></p>}{requestsError && <div className="authMessage authError" style={{ marginBottom: 14 }}>{requestsError} <button className="secondary" onClick={reload}>Retry</button></div>}{loadingRequests && <p role="status">Loading your dashboard…</p>}{content}{showPickup && <PickupModal onSubmit={submitPickup} close={() => setShowPickup(false)}/>}</main></div><nav className="mobileNav">{role === 'user' ? nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><Icon size={18} /><span>{label}</span></button>) : <>{canPreview && ['user', 'collector', 'admin'].map(r => <button key={r} className={role === r ? 'active' : ''} onClick={() => setPreviewRole(r === 'admin' ? null : r)}><Users size={18} /><span>{r === 'user' ? 'User' : r === 'collector' ? 'Collector' : 'Admin'}</span></button>)}<button onClick={onExit}><ArrowRight size={18} /><span>Sign out</span></button></>}</nav></div></>
}

function App() {
  const { session, profile, profileError, refreshProfile, loading, recovering, clearRecovering } = useAuth()
  const [authMode, setAuthMode] = useState(null)
  const [legalPage, setLegalPage] = useState(null)

  if (loading) return null
  if (legalPage) return <LegalScreen page={legalPage} onBack={() => setLegalPage(null)} />
  if (recovering) return <ResetPasswordScreen onDone={clearRecovering} />

  if (!session) {
    return authMode
      ? <AuthPanel mode={authMode} onBack={() => setAuthMode(null)} onLegal={setLegalPage} />
      : <Landing onAuth={setAuthMode} onLegal={setLegalPage} />
  }

  if (!profile) return <main className="dashPanel" style={{ margin: 32 }}><p role={profileError ? "alert" : "status"}>{profileError || "Loading your account and balance…"}</p><button className="secondary" onClick={refreshProfile}>Retry</button><button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button></main>

  const onSaveName = async fullName => {
    if (!fullName) return
    const { error } = await supabase.rpc('update_own_full_name', { p_new_name: fullName })
    if (error) throw error
    refreshProfile()
  }

  return <AppShell onExit={() => supabase.auth.signOut()} profile={profile} email={session.user.email} userId={session.user.id} onSaveName={onSaveName} refreshProfile={refreshProfile} />
}

const PREVIEW_REQUESTS = import.meta.env.DEV ? [
  { id: 'preview-1', user_id: 'preview', material_type: 'PET Bottles', estimated_weight_kg: 3.5, pickup_location: 'Yaba, Lagos', status: 'ACCEPTED', created_at: '2026-09-26T12:00:00Z' },
  { id: 'preview-2', user_id: 'preview', material_type: 'Plastic Containers', estimated_weight_kg: 5, actual_weight_kg: 5.5, pickup_location: 'Yaba, Lagos', status: 'VERIFIED', created_at: '2026-09-22T12:00:00Z' },
  { id: 'preview-3', user_id: 'preview', material_type: 'PET Bottles', estimated_weight_kg: 7, actual_weight_kg: 7, pickup_location: 'Yaba, Lagos', status: 'VERIFIED', created_at: '2026-09-18T12:00:00Z' },
] : []
function DesignPreview() {
  const [profile, setProfile] = useState({ full_name: 'Ada Okafor', role: 'user', points: 950 })
  return <AppShell preview profile={profile} email="ada@example.com" userId="preview" onExit={() => window.location.assign('/')} onSaveName={async full_name => setProfile({ ...profile, full_name })}/>
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'))
if (import.meta.hot) import.meta.hot.data.root = root
root.render(import.meta.env.DEV && window.location.pathname === '/dashboard-preview' ? <DesignPreview/> : <App />)
