import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, Bell, Camera, Check, ChevronRight, Coins, Gift, Home, Leaf,
  MapPin, Package, Pencil, Recycle, ShieldCheck, Truck, UserRound, Users,
  WalletCards, Weight, X
} from 'lucide-react'
import './styles.css'
import { supabase, supabaseConfigError } from './lib/supabase.js'

function useAuth() {
  const [session, setSession] = useState(undefined) // undefined = still checking, null = signed out
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession ?? null))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !session) { setProfile(null); return }
    let cancelled = false
    supabase.from('profiles').select('id, full_name, role, points, city').eq('id', session.user.id).single()
      .then(({ data, error }) => { if (!cancelled) setProfile(error ? null : data) })
    return () => { cancelled = true }
  }, [session])

  const refreshProfile = () => {
    if (!supabase || !session) return
    supabase.from('profiles').select('id, full_name, role, points, city').eq('id', session.user.id).single()
      .then(({ data, error }) => setProfile(error ? null : data))
  }

  return { session, profile, refreshProfile, loading: session === undefined }
}

const PLASTIC_TYPES = ['PET Bottles', 'Plastic Containers', 'HDPE Plastic', 'Mixed Plastic']
const STAGES = ['Submitted', 'Accepted', 'Collected', 'Verified']
const STATUS_TO_STAGE = { AVAILABLE: 0, ACCEPTED: 1, COLLECTED: 2, VERIFIED: 3 }
const STATUS_LABEL = { AVAILABLE: 'Awaiting collector', ACCEPTED: 'Collector assigned', COLLECTED: 'Collected', VERIFIED: 'Verified' }
const POINTS_PER_KG = 100
const REWARDS = [
  { name: 'Free Pickup', cost: 300, note: 'One scheduled pickup' },
  { name: '₦1,000 Airtime', cost: 500, note: 'Mobile airtime reward' },
  { name: '₦2,000 Shopping Voucher', cost: 1000, note: 'Partner voucher' },
]
const TIERS = [
  { name: 'Bronze', from: 0 },
  { name: 'Silver', from: 10 },
  { name: 'Gold', from: 25 },
  { name: 'Platinum', from: 50 },
]

const initialRequests = [
  { id: 'BU-001', user: 'Ada', type: 'PET Bottles', estimate: 4, actual: 0, location: 'Uyo', status: 'AVAILABLE', collector: null, points: 0, date: 'Sep 4' },
  { id: 'BU-002', user: 'Musa', type: 'Plastic Containers', estimate: 7, actual: 6.5, location: 'Uyo', status: 'COLLECTED', collector: 'Ekemini', points: 0, date: 'Sep 3' },
]

function BottleGauge({ progress = 0 }) {
  const fillPct = Math.round(progress * 100)
  return (
    <svg width={64} height={92} viewBox="0 0 64 92" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${fillPct}% to next tier`}>
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
  return <div className="logoMark" style={{ width: size, height: size }} aria-hidden="true"><Recycle size={size * .62} strokeWidth={2.7} /></div>
}

function Landing({ onAuth }) {
  return <div className="landing">
    <header className="landingNav"><div className="brand"><Logo /><span>Bottle<span>Up</span></span></div><button className="ghostButton" onClick={() => onAuth('signin')}>Sign in <ArrowRight size={15} /></button></header>
    <main>
      <section className="landingHero">
        <div className="landingCopy">
          <span className="eyebrow"><Leaf size={13} />RECYCLING THAT COMES BACK TO YOU</span>
          <h1>Don’t throw it away.<br /><em>Put it to work.</em></h1>
          <p>BottleUp makes recycling easier. Schedule a pickup, get your materials collected and verified, then earn points you can use for rewards.</p>
          <div className="landingActions"><button className="primary large" onClick={() => onAuth('signup')}>Start recycling <ArrowRight size={17} /></button><a href="#how">See how it works</a></div>
        </div>
        <div className="landingVisual"><div className="bottleIllustration"><Recycle size={92} strokeWidth={1.2} /><span>RECYCLE<br />REPEAT<br />REWARD</span></div><div className="floatCard"><Check size={16} /><div><strong>Collection verified</strong><span>5.2 kg · +520 points</span></div></div></div>
      </section>

      <section className="problem" id="why"><div><span className="eyebrow">WHY BOTTLEUP</span><h2>Recycling shouldn't feel like a dead end.</h2></div><p>There is recyclable material everywhere, but collection is often scattered. People hand materials over without knowing where they went, how much was actually recovered or whether they received fair value. BottleUp brings the journey into one place.</p></section>

      <section className="how" id="how"><div className="sectionIntro"><span className="eyebrow">HOW IT WORKS</span><h2>One simple loop.</h2><p>From the bag in your home to a verified collection — and back again.</p></div>
        <div className="loopFlow">{[
          [Leaf,'Recycle','Set aside your plastic instead of throwing it away.'],
          [Package,'Schedule','Tell us what you have, how much and where to collect it.'],
          [Truck,'Get collected','A collector accepts the request and handles the pickup.'],
          [ShieldCheck,'Get verified','Weight is confirmed and your points are issued.'],
        ].map(([Icon,t,b], i, arr) => <React.Fragment key={t}><div className="loopStep"><span className="loopBadge"><Icon size={18} /></span><strong>{t}</strong><p>{b}</p></div>{i < arr.length - 1 && <span className="loopArrow"><ChevronRight size={16} /></span>}</React.Fragment>)}</div>
        <div className="loopReturn"><span className="loopSpin"><Recycle size={15} /></span>Then it repeats — every verified kg starts the loop again.</div>
      </section>

      <section className="landingReward"><div><span className="eyebrow">EARN AS YOU RECYCLE</span><h2>1 kg of verified plastic = <strong>100 points.</strong></h2><p>Your points build with every verified collection. Rewards shown in the pilot can be redeemed once the corresponding reward partner is active.</p></div><div className="pointPill"><Coins size={19} /><strong>100</strong><span>points / kg</span></div></section>
    </main>
    <footer className="landingFooter"><div className="brand"><Logo size={28} /><span>Bottle<span>Up</span></span></div><span>Recycle better. Track it. Get rewarded.</span></footer>
  </div>
}

function ConfigScreen() {
  return <div className="authGate"><div className="authCard"><div className="authBrand"><Logo /><span>Bottle<span>Up</span></span></div><h1 className="authTitle">Supabase is not configured</h1><p className="authCopy">Add the Supabase Project URL and browser-safe publishable/anon key to the deployment environment.</p><div className="authMessage authConfig">{supabaseConfigError || 'No valid Supabase configuration was found.'}</div></div></div>
}

function AuthPanel({ mode: initialMode, onBack }) {
  const [mode, setMode] = useState(initialMode)
  const [fields, setFields] = useState({ fullName: '', phone: '', email: '', password: '' })
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key, value) => setFields(f => ({ ...f, [key]: value }))

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    setError(false)
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: fields.email, password: fields.password, options: { data: { full_name: fields.fullName, phone: fields.phone } } })
        : await supabase.auth.signInWithPassword({ email: fields.email, password: fields.password })

      if (result.error) { setMessage(result.error.message); setError(true); return }

      if (mode === 'signup' && !result.data.session) {
        setMessage('Account created. Check your email to confirm your address, then come back and sign in.')
        setError(false)
        setMode('signin')
        return
      }
      // A session now exists — the useAuth listener at the top level picks it up
      // and swaps this panel for the real app automatically.
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Authentication failed. Please try again.')
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return <div className="authGate">
    <div className="authCard">
      <button className="iconButton authBack" onClick={onBack}><X size={18} /></button>
      <div className="authBrand"><Logo /><span>Bottle<span>Up</span></span></div>
      <h1 className="authTitle">Recycle. Reward. Repeat.</h1>
      <p className="authCopy">Create your BottleUp account or sign in to schedule pickups and keep your recycling activity attached to your account.</p>
      <div className="authTabs">
        <button className={`authTab ${mode === 'signin' ? 'active' : ''}`} type="button" onClick={() => { setMode('signin'); setMessage('') }}>Sign in</button>
        <button className={`authTab ${mode === 'signup' ? 'active' : ''}`} type="button" onClick={() => { setMode('signup'); setMessage('') }}>Create account</button>
      </div>
      <form className="authForm" onSubmit={submit}>
        {mode === 'signup' && <label className="authLabel">Full name<input className="authInput" required value={fields.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Your name" /></label>}
        {mode === 'signup' && <label className="authLabel">Phone<input className="authInput" value={fields.phone} onChange={e => set('phone', e.target.value)} placeholder="080..." /></label>}
        <label className="authLabel">Email<input className="authInput" type="email" required value={fields.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" /></label>
        <label className="authLabel">Password<input className="authInput" type="password" required minLength={6} value={fields.password} onChange={e => set('password', e.target.value)} placeholder="At least 6 characters" /></label>
        <button className="authButton" disabled={busy} type="submit">{busy ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        {message && <div className={`authMessage ${error ? 'authError' : ''}`}>{message}</div>}
      </form>
      <div className="authNote">Your account is secured by Supabase Auth. Your pickup data is tied to your authenticated user.</div>
    </div>
  </div>
}

function StageTracker({ status }) {
  const idx = STATUS_TO_STAGE[status] ?? 0
  return <div className="stageWrap"><div className="stages">{STAGES.map((label, i) => <React.Fragment key={label}><span className={`stageDot ${i <= idx ? 'done' : ''}`}>{i < idx ? <Check size={9} /> : i === idx ? <span /> : null}</span>{i < STAGES.length - 1 && <span className={`stageLine ${i < idx ? 'done' : ''}`} />}</React.Fragment>)}</div><div className="stageLabels">{STAGES.map((label, i) => <span className={i <= idx ? 'done' : ''} key={label}>{label}</span>)}</div></div>
}

function Stat({ icon: Icon, value, label }) { return <div className="miniStat"><div className="miniIcon"><Icon size={16} /></div><strong>{value}</strong><span>{label}</span></div> }

function RequestCard({ request, action, compact = false }) {
  return <article className={`requestCard ${compact ? 'compact' : ''}`}><div className="requestTop"><div className="requestIcon"><Package size={18} /></div><div className="requestMain"><div className="requestTitle">{request.type}</div><div className="requestMeta"><span>{request.id}</span><span><MapPin size={12} />{request.location}</span><span><Weight size={12} />{request.actual || request.estimate} kg</span></div></div><span className={`status ${request.status.toLowerCase()}`}>{STATUS_LABEL[request.status]}</span></div><StageTracker status={request.status} />{(request.points > 0 || action) && <div className="requestBottom">{request.points > 0 ? <span className="points"><Coins size={14} />+{request.points} points</span> : <span />}{action}</div>}</article>
}

function EmptyState({ icon: Icon = Package, title, body }) { return <div className="emptyState"><div className="emptyIcon"><Icon size={22} /></div><strong>{title}</strong><p>{body}</p></div> }

function PageTitle({ eyebrow, title, body }) { return <div className="pageTitle"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div> }

function PickupModal({ form, setForm, submit, close }) {
  const [photo, setPhoto] = useState(null)
  const [preview, setPreview] = useState(null)

  const onPhoto = e => {
    const file = e.target.files?.[0] || null
    setPhoto(file)
    setPreview(prev => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null })
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
      <label>What are you recycling?<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{PLASTIC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Estimated weight<input required type="number" min="0.1" step="0.1" value={form.estimate} onChange={e => setForm({ ...form, estimate: e.target.value })} placeholder="e.g. 5 kg" /></label>
      <label>Pickup location<div className="inputWithIcon"><MapPin size={16} /><input required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Area or landmark" /></div></label>
      <div className="formNote"><ShieldCheck size={15} /> Final points are based on verified weight after collection.</div>
    </form>

    <div className="pickupSticky"><button className="primary large" form="pickupForm" type="submit">Submit collection request <ArrowRight size={17} /></button></div>
  </div>
}

function UserHome({ requests, setScreen, form, setForm, submit }) {
  const myRequests = requests.filter(r => r.user === 'You')
  const myKg = useMemo(() => myRequests.filter(r => r.status === 'VERIFIED').reduce((a, r) => a + (r.actual || 0), 0), [myRequests])
  const points = useMemo(() => myRequests.reduce((a, r) => a + (r.points || 0), 0), [myRequests])
  const tierInfo = useMemo(() => { let current = TIERS[0], next = null; for (const tier of TIERS) { if (myKg >= tier.from) current = tier; else { next = tier; break } } return { current, next, progress: next ? Math.max(0, Math.min(1, (myKg - current.from) / (next.from - current.from))) : 1 } }, [myKg])
  const [showForm, setShowForm] = useState(false)
  const active = myRequests.find(r => r.status !== 'VERIFIED')
  return <>
    <section className="hero"><div className="heroCopy"><span className="eyebrow"><Leaf size={13} />YOUR IMPACT</span><h1>Keep plastic moving.</h1><p>Recycle your plastic, get it collected, and earn BottleUp Points.</p><button className="primary large" onClick={() => setShowForm(true)}>Schedule a pickup <ArrowRight size={17} /></button></div><div className="heroOrb"><Recycle size={54} strokeWidth={1.5} /><span>Small action.<br />Real impact.</span></div></section>
    <section className="jarHero">
      <BottleGauge progress={tierInfo.progress} />
      <div className="jarCopy">
        <span className="eyebrow"><Recycle size={13} />YOUR IMPACT</span>
        <div className="jarKg">{myKg.toFixed(1)}<small>kg recycled</small></div>
        <div className="jarMeta"><span className="tierChip">{tierInfo.current.name} tier</span><span>{tierInfo.next ? `${Math.max(0, tierInfo.next.from - myKg).toFixed(1)} kg to ${tierInfo.next.name}` : 'Top tier reached'}</span></div>
        <div className="progress"><span style={{ width: `${Math.max(4, tierInfo.progress * 100)}%` }} /></div>
      </div>
      <div className="jarPoints"><Coins size={18} /><strong>{points.toLocaleString()}</strong><span>points</span></div>
    </section>
    {active && <section className="activePickup"><div><span className="eyebrow">ACTIVE PICKUP</span><h2>{active.type}</h2><p>{active.location} · {active.estimate} kg estimated</p></div><div className="activeRight"><span className="status available">{STATUS_LABEL[active.status]}</span><button className="textButton" onClick={() => setScreen('pickups')}>Track <ChevronRight size={15} /></button></div><StageTracker status={active.status} /></section>}
    <section className="sectionHead"><div><span className="eyebrow">ACTIVITY</span><h2>Recent pickups</h2></div><button className="textButton" onClick={() => setScreen('pickups')}>View all <ChevronRight size={15} /></button></section>
    {myRequests.length ? <div className="requestList">{myRequests.slice(0, 3).map(r => <RequestCard key={r.id} request={r} />)}</div> : <EmptyState title="No pickups yet" body="Schedule your first collection and your history will appear here." />}
    {showForm && <PickupModal form={form} setForm={setForm} submit={e => { submit(e); setShowForm(false) }} close={() => setShowForm(false)} />}
  </>
}

function PickupsScreen({ requests }) {
  const mine = requests.filter(r => r.user === 'You')
  return <><PageTitle eyebrow="YOUR ACTIVITY" title="Pickups" body="Track every collection from request to verified weight." />{mine.length ? <div className="requestList">{mine.map(r => <RequestCard key={r.id} request={r} />)}</div> : <EmptyState title="No pickups yet" body="Schedule your first collection from Home." />}<section className="history"><div className="sectionHead"><div><span className="eyebrow">HISTORY</span><h2>Verified collections</h2></div></div>{mine.filter(r => r.status === 'VERIFIED').map(r => <div className="historyRow" key={`h-${r.id}`}><div><strong>{r.date || 'Sep 4'}</strong><span>{r.actual || r.estimate} kg · {r.type}</span></div><span className="verified"><Check size={13} /> Verified</span></div>)}</section></>
}

function RewardsScreen({ points, redeem }) {
  return <><PageTitle eyebrow="YOUR REWARDS" title="Rewards" body="Turn your verified recycling into something useful." /><div className="rewardHero"><div className="rewardBalance"><Coins size={28} /><div><strong>{points.toLocaleString()}</strong><span>available points</span></div></div><span>100 points = 1 kg verified plastic</span></div><div className="sectionHead"><div><span className="eyebrow">MARKETPLACE</span><h2>Redeem your points</h2></div></div><div className="rewardGrid">{REWARDS.map(r => <div className="rewardCard" key={r.name}><div className="rewardIcon"><Gift size={20} /></div><div><strong>{r.name}</strong><p>{r.note}</p></div><div className="rewardCost"><span>{r.cost.toLocaleString()} pts</span><button className="secondary" disabled={points < r.cost} onClick={() => redeem(r)}>Redeem</button></div></div>)}</div><div className="pilotNote"><ShieldCheck size={17} /><div><strong>Pilot rewards</strong><span>Reward fulfilment will be enabled as BottleUp activates each partner. Your points remain attached to your account.</span></div></div></>
}

function WalletScreen({ points }) {
  return <><PageTitle eyebrow="BOTTLEUP WALLET" title="Wallet" body="Keep track of what you've earned and what is pending." /><div className="walletGrid"><div className="walletMain"><span>Available reward value</span><strong>₦{Math.floor(points / 500) * 1000 .toLocaleString()}</strong><small>based on redeemable rewards currently shown</small></div><div className="walletStat"><span>Total earned</span><strong>{points.toLocaleString()} pts</strong></div><div className="walletStat"><span>Pending rewards</span><strong>0</strong></div></div><div className="pilotNote"><WalletCards size={17} /><div><strong>Redemption, not cash withdrawal</strong><span>The MVP treats BottleUp Wallet as a reward balance. Cash-out infrastructure is intentionally not part of this pilot.</span></div></div></>
}

function ProfileScreen({ profile, email, onSaveName, notify }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)

  const startEdit = () => { setDraft(profile?.full_name || ''); setEditing(true) }
  const save = async () => {
    setSaving(true)
    await onSaveName(draft.trim())
    setSaving(false)
    setEditing(false)
  }

  const initial = (profile?.full_name || email || '?').trim().charAt(0).toUpperCase()
  const placeholderRows = [
    [MapPin, 'Saved addresses'],
    [Truck, 'Pickup preferences'],
    [WalletCards, 'Payment & wallet'],
    [ShieldCheck, 'Support'],
  ]

  return <>
    <PageTitle eyebrow="YOUR ACCOUNT" title="Profile" body="Your BottleUp account and collection preferences." />
    <div className="profileCard">
      <div className="avatar">{initial}</div>
      {editing ? (
        <div className="profileEdit">
          <input className="authInput" autoFocus value={draft} onChange={e => setDraft(e.target.value)} placeholder="Your name" />
          <div className="profileEditActions"><button className="primary small" disabled={saving || !draft.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</button><button className="secondary small" onClick={() => setEditing(false)}>Cancel</button></div>
        </div>
      ) : (
        <><div><strong>{profile?.full_name || 'Add your name'}</strong><span>{email}</span></div><button className="iconButton" onClick={startEdit} title="Edit name"><Pencil size={16} /></button></>
      )}
    </div>
    <div className="settingsList">
      {placeholderRows.map(([Icon, label]) => <div key={label} onClick={() => notify(`${label} is coming soon.`)}><div><Icon size={17} /><span>{label}</span></div><ChevronRight size={17} /></div>)}
    </div>
    <button className="secondary" style={{ marginTop: 18 }} onClick={() => supabase.auth.signOut()}>Sign out</button>
  </>
}

function CollectorScreen({ requests, accept, collect }) {
  const available = requests.filter(r => ['AVAILABLE', 'ACCEPTED'].includes(r.status))
  const mine = requests.filter(r => r.collector === 'You')
  const kg = requests.filter(r => r.collector === 'You' && r.status === 'COLLECTED').reduce((a, r) => a + (r.actual || r.estimate || 0), 0)
  return <><PageTitle eyebrow="COLLECTOR MODE" title="Today's pickups" body="Accept nearby requests and keep every collection moving." /><section className="collectorSummary"><Stat icon={Package} value={available.filter(r => r.status === 'AVAILABLE').length} label="Available" /><Stat icon={Truck} value={mine.length} label="My pickups" /><Stat icon={Recycle} value={`${kg.toFixed(1)} kg`} label="Collected today" /></section><section className="sectionHead"><div><span className="eyebrow">QUEUE</span><h2>Available nearby</h2></div></section>{available.length ? <div className="requestList">{available.map(r => <RequestCard key={r.id} request={r} action={r.status === 'AVAILABLE' ? <button className="primary small" onClick={() => accept(r.id)}>Accept pickup</button> : <button className="primary small" onClick={() => collect(r.id)}>Mark collected</button>} />)}</div> : <EmptyState title="Nothing nearby" body="New collection requests will appear here." />}</>
}

function AdminScreen({ requests, verify }) {
  const collected = requests.filter(r => r.status === 'COLLECTED')
  const verified = requests.filter(r => r.status === 'VERIFIED')
  const totalKg = verified.reduce((a, r) => a + (r.actual || 0), 0)
  return <><PageTitle eyebrow="OPERATIONS" title="BottleUp overview" body="Keep collections, verification and rewards moving." /><section className="adminStats"><Stat icon={Users} value="2" label="Users" /><Stat icon={Package} value={requests.length} label="Requests" /><Stat icon={Recycle} value={`${totalKg.toFixed(1)} kg`} label="Verified plastic" /><Stat icon={Coins} value={verified.reduce((a, r) => a + (r.points || 0), 0)} label="Points issued" /></section><section className="sectionHead"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Verification queue</h2></div><span className="queueCount">{collected.length} waiting</span></section>{collected.length ? <div className="requestList">{collected.map(r => <RequestCard key={r.id} request={r} action={<button className="primary small" onClick={() => verify(r.id)}>Verify + reward</button>} />)}</div> : <EmptyState icon={ShieldCheck} title="Queue is clear" body="Collected pickups will appear here for verification." />}<section className="sectionHead activityHead"><div><span className="eyebrow">RECENT</span><h2>All activity</h2></div></section><div className="requestList">{requests.map(r => <RequestCard key={r.id} request={r} compact />)}</div></>
}

function AppShell({ onExit, profile, email, onSaveName }) {
  const [role, setRole] = useState('user')
  const [screen, setScreen] = useState('home')
  const [requests, setRequests] = useState(initialRequests)
  const [form, setForm] = useState({ type: PLASTIC_TYPES[0], estimate: '', location: '' })
  const [notice, setNotice] = useState('')

  const points = requests.filter(r => r.user === 'You').reduce((a, r) => a + (r.points || 0), 0)
  const submit = e => { e.preventDefault(); if (!form.estimate || !form.location) return; setRequests(r => [{ id: `BU-${String(r.length + 1).padStart(3, '0')}`, user: 'You', type: form.type, estimate: Number(form.estimate), actual: 0, location: form.location, status: 'AVAILABLE', collector: null, points: 0, date: 'Sep 6' }, ...r]); setForm({ type: PLASTIC_TYPES[0], estimate: '', location: '' }); setScreen('pickups'); setNotice('Pickup request submitted.') }
  const accept = id => { setRequests(rs => rs.map(r => r.id === id ? { ...r, status: 'ACCEPTED', collector: 'You' } : r)); setNotice('Pickup accepted.') }
  const collect = id => { setRequests(rs => rs.map(r => r.id === id ? { ...r, status: 'COLLECTED', actual: r.actual || r.estimate } : r)); setNotice('Collection marked as collected.') }
  const verify = id => { setRequests(rs => rs.map(r => r.id === id ? { ...r, status: 'VERIFIED', points: Math.round((r.actual || r.estimate) * POINTS_PER_KG) } : r)); setNotice('Weight verified and points issued.') }
  const redeem = reward => { if (points >= reward.cost) setNotice(`${reward.name} redemption request received.`) }
  const nav = [{ id: 'home', label: 'Home', icon: Home }, { id: 'pickups', label: 'Pickups', icon: Package }, { id: 'rewards', label: 'Rewards', icon: Gift }, { id: 'wallet', label: 'Wallet', icon: WalletCards }, { id: 'profile', label: 'Profile', icon: UserRound }]

  const content = role === 'collector' ? <CollectorScreen {...{ requests, accept, collect }} /> : role === 'admin' ? <AdminScreen {...{ requests, verify }} /> : screen === 'home' ? <UserHome {...{ requests, setScreen, form, setForm, submit }} /> : screen === 'pickups' ? <PickupsScreen requests={requests} /> : screen === 'rewards' ? <RewardsScreen points={points} redeem={redeem} /> : screen === 'wallet' ? <WalletScreen points={points} /> : <ProfileScreen profile={profile} email={email} onSaveName={onSaveName} notify={setNotice} />

  return <div className="app"><header className="topbar"><div className="topInner"><button className="brand brandButton" onClick={() => { setRole('user'); setScreen('home') }}><Logo /><span>Bottle<span>Up</span></span></button><div className="topActions"><button className="iconButton" title="Notifications"><Bell size={18} /></button><button className="avatar miniAvatar">{role === 'user' ? 'Y' : role === 'collector' ? 'C' : 'A'}</button></div></div></header><div className="appBody"><aside className="sidebar"><div className="rolePill"><span>PREVIEW</span><strong>{role === 'user' ? 'User' : role === 'collector' ? 'Collector' : 'Admin'}</strong></div>{role === 'user' && nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'navItem active' : 'navItem'} onClick={() => setScreen(id)}><Icon size={18} />{label}</button>)}<div className="sideBottom"><button className="navItem" onClick={() => setRole(role === 'user' ? 'collector' : role === 'collector' ? 'admin' : 'user')}><Users size={18} />Switch preview role</button><button className="navItem" onClick={onExit}><ArrowRight size={18} />Sign out</button></div></aside><main className="main">{notice && <button className="notice" onClick={() => setNotice('')}><Check size={15} />{notice}<X size={14} /></button>}{content}</main></div><nav className="mobileNav">{role === 'user' && nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><Icon size={18} /><span>{label}</span></button>)}</nav></div>
}

function App() {
  const { session, profile, refreshProfile, loading } = useAuth()
  const [authMode, setAuthMode] = useState(null)

  if (supabaseConfigError) return <ConfigScreen />
  if (loading) return null

  if (!session) {
    return authMode
      ? <AuthPanel mode={authMode} onBack={() => setAuthMode(null)} />
      : <Landing onAuth={setAuthMode} />
  }

  const onSaveName = async fullName => {
    if (!fullName) return
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', session.user.id)
    if (!error) refreshProfile()
  }

  return <AppShell onExit={() => supabase.auth.signOut()} profile={profile} email={session.user.email} onSaveName={onSaveName} />
}

createRoot(document.getElementById('root')).render(<App />)
