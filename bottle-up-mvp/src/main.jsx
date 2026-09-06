import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, Bell, Camera, Check, ChevronRight, Coins, Home, Leaf,
  MapPin, Package, Recycle, ShieldCheck, Truck, UserRound, Users,
  Weight, X, Zap
} from 'lucide-react'
import './styles.css'

const PLASTIC_TYPES = ['PET Bottles', 'Plastic Containers', 'HDPE Plastic', 'Mixed Plastic']
const STAGES = ['Submitted', 'Accepted', 'Collected', 'Verified']
const STATUS_TO_STAGE = { AVAILABLE: 0, ACCEPTED: 1, COLLECTED: 2, VERIFIED: 3 }
const STATUS_LABEL = { AVAILABLE: 'Awaiting collector', ACCEPTED: 'Collector assigned', COLLECTED: 'Collected', VERIFIED: 'Verified' }
const TIERS = [
  { name: 'Bronze', from: 0 },
  { name: 'Silver', from: 10 },
  { name: 'Gold', from: 25 },
  { name: 'Platinum', from: 50 },
]

const initialRequests = [
  { id: 'BU-001', user: 'Ada', type: 'PET Bottles', estimate: 4, actual: 0, location: 'Uyo', status: 'AVAILABLE', collector: null, points: 0 },
  { id: 'BU-002', user: 'Musa', type: 'Plastic Containers', estimate: 7, actual: 6.5, location: 'Uyo', status: 'COLLECTED', collector: 'Ekemini', points: 0 },
]

function Logo({ size = 32 }) {
  return (
    <div className="logoMark" style={{ width: size, height: size }} aria-hidden="true">
      <Recycle size={size * .62} strokeWidth={2.7} />
    </div>
  )
}

function StageTracker({ status }) {
  const idx = STATUS_TO_STAGE[status] ?? 0
  return (
    <div className="stageWrap">
      <div className="stages">
        {STAGES.map((label, i) => (
          <React.Fragment key={label}>
            <span className={`stageDot ${i <= idx ? 'done' : ''}`}>{i < idx ? <Check size={9} /> : i === idx ? <span /> : null}</span>
            {i < STAGES.length - 1 && <span className={`stageLine ${i < idx ? 'done' : ''}`} />}
          </React.Fragment>
        ))}
      </div>
      <div className="stageLabels">
        {STAGES.map((label, i) => <span className={i <= idx ? 'done' : ''} key={label}>{label}</span>)}
      </div>
    </div>
  )
}

function Stat({ icon: Icon, value, label }) {
  return <div className="miniStat"><div className="miniIcon"><Icon size={16} /></div><strong>{value}</strong><span>{label}</span></div>
}

function RequestCard({ request, action, compact = false }) {
  return (
    <article className={`requestCard ${compact ? 'compact' : ''}`}>
      <div className="requestTop">
        <div className="requestIcon"><Package size={18} /></div>
        <div className="requestMain">
          <div className="requestTitle">{request.type}</div>
          <div className="requestMeta">
            <span>{request.id}</span><span><MapPin size={12} />{request.location}</span><span><Weight size={12} />{request.actual || request.estimate} kg</span>
          </div>
        </div>
        <span className={`status ${request.status.toLowerCase()}`}>{STATUS_LABEL[request.status]}</span>
      </div>
      <StageTracker status={request.status} />
      {(request.points > 0 || action) && <div className="requestBottom">
        {request.points > 0 ? <span className="points"><Coins size={14} />+{request.points} points</span> : <span />}
        {action}
      </div>}
    </article>
  )
}

function EmptyState({ icon: Icon = Package, title, body }) {
  return <div className="emptyState"><div className="emptyIcon"><Icon size={22} /></div><strong>{title}</strong><p>{body}</p></div>
}

function UserHome({ requests, setScreen, form, setForm, submit }) {
  const myRequests = requests.filter(r => r.user === 'You' || r.user === 'Ada')
  const myKg = useMemo(() => requests.filter(r => r.user === 'You' && r.status === 'VERIFIED').reduce((a, r) => a + (r.actual || 0), 0), [requests])
  const points = useMemo(() => requests.filter(r => r.user === 'You').reduce((a, r) => a + (r.points || 0), 0), [requests])
  const tierInfo = useMemo(() => {
    let current = TIERS[0], next = null
    for (const tier of TIERS) { if (myKg >= tier.from) current = tier; else { next = tier; break } }
    return { current, next, progress: next ? Math.min(1, (myKg - current.from) / (next.from - current.from)) : 1 }
  }, [myKg])
  const [showForm, setShowForm] = useState(false)
  const recent = myRequests.slice(0, 2)

  return (
    <>
      <section className="hero">
        <div className="heroCopy">
          <span className="eyebrow"><Leaf size={13} />YOUR IMPACT</span>
          <h1>Keep plastic moving.</h1>
          <p>Recycle your plastic, get it collected, and earn Bottle Up Points.</p>
          <button className="primary large" onClick={() => setShowForm(true)}>Schedule a pickup <ArrowRight size={17} /></button>
        </div>
        <div className="heroOrb"><Recycle size={54} strokeWidth={1.5} /><span>Small action.<br />Real impact.</span></div>
      </section>

      <section className="impactGrid">
        <div className="impactCard featured"><div className="impactLabel"><Recycle size={16} /> Plastic recycled</div><strong>{myKg.toFixed(1)}<small>kg</small></strong><span>verified through Bottle Up</span></div>
        <div className="impactCard"><div className="impactLabel"><Coins size={16} /> Bottle Up Points</div><strong>{points.toLocaleString()}</strong><span>available points</span></div>
        <div className="impactCard"><div className="impactLabel"><Zap size={16} /> Tier</div><strong>{tierInfo.current.name}</strong><span>{tierInfo.next ? `${(tierInfo.next.from - myKg).toFixed(1)} kg to ${tierInfo.next.name}` : 'Top tier reached'}</span></div>
      </section>

      <section className="tierCard">
        <div className="tierTop"><div><span className="eyebrow">YOUR JOURNEY</span><h2>{tierInfo.current.name} → {tierInfo.next?.name || 'Platinum'}</h2></div><div className="tierNumber">{Math.round(tierInfo.progress * 100)}%</div></div>
        <div className="progress"><span style={{ width: `${Math.max(4, tierInfo.progress * 100)}%` }} /></div>
        <div className="tierFoot"><span>{myKg.toFixed(1)} kg</span><span>{tierInfo.next ? `${tierInfo.next.from} kg` : '50+ kg'}</span></div>
      </section>

      <section className="sectionHead"><div><span className="eyebrow">ACTIVITY</span><h2>Your pickups</h2></div><button className="textButton" onClick={() => setScreen('pickups')}>View all <ChevronRight size={15} /></button></section>
      {recent.length ? <div className="requestList">{recent.map(r => <RequestCard key={r.id} request={r} />)}</div> : <EmptyState title="No pickups yet" body="Your collection history will appear here." />}

      {showForm && <PickupModal form={form} setForm={setForm} submit={e => { submit(e); setShowForm(false) }} close={() => setShowForm(false)} />}
    </>
  )
}

function PickupModal({ form, setForm, submit, close }) {
  const [photo, setPhoto] = useState(null)
  return <div className="modalBackdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
    <div className="modal">
      <div className="modalHead"><div><span className="eyebrow">NEW COLLECTION</span><h2>Schedule a pickup</h2></div><button className="iconButton" onClick={close}><X size={18} /></button></div>
      <form onSubmit={submit}>
        <label>What are you recycling?<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{PLASTIC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Estimated weight<input required type="number" min="0.1" step="0.1" value={form.estimate} onChange={e => setForm({ ...form, estimate: e.target.value })} placeholder="e.g. 5 kg" /></label>
        <label>Pickup location<div className="inputWithIcon"><MapPin size={16} /><input required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Area or landmark" /></div></label>
        <label>Photo <span className="optional">optional</span><label className="photoDrop"><Camera size={20} /><span>{photo ? photo.name : 'Add a photo of your plastic'}</span><input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] || null)} /></label></label>
        <div className="formNote"><ShieldCheck size={15} /> Final points are based on verified weight after collection.</div>
        <button className="primary large" type="submit">Submit collection request <ArrowRight size={17} /></button>
      </form>
    </div>
  </div>
}

function UserScreen({ screen, requests, setScreen, form, setForm, submit }) {
  if (screen === 'home') return <UserHome {...{ requests, setScreen, form, setForm, submit }} />
  if (screen === 'pickups') return <><PageTitle eyebrow="YOUR ACTIVITY" title="Pickups" body="Track every collection from request to verified weight." />{requests.filter(r => r.user === 'You' || r.user === 'Ada').length ? <div className="requestList">{requests.filter(r => r.user === 'You' || r.user === 'Ada').map(r => <RequestCard key={r.id} request={r} />)}</div> : <EmptyState title="No pickups yet" body="Schedule your first collection from Home." />}</>
  if (screen === 'rewards') return <><PageTitle eyebrow="YOUR REWARDS" title="Bottle Up Points" body="Your points grow with every verified kilogram." /><div className="rewardHero"><Coins size={30} /><strong>{requests.filter(r => r.user === 'You').reduce((a, r) => a + (r.points || 0), 0).toLocaleString()}</strong><span>points earned</span></div><div className="tierList">{TIERS.map((t, i) => <div className="tierRow" key={t.name}><div className="tierBadge">{i + 1}</div><div><strong>{t.name}</strong><span>{t.from}+ kg verified</span></div><span className="tierState">{i === 0 ? 'Current' : 'Coming soon'}</span></div>)}</div></>
  return <><PageTitle eyebrow="YOUR ACCOUNT" title="Profile" body="Your Bottle Up account and collection preferences." /><div className="profileCard"><div className="avatar">Y</div><div><strong>You</strong><span>Uyo, Nigeria</span></div><ChevronRight size={18} /></div><div className="infoCard"><div><span>Account status</span><strong>Active</strong></div><div><span>Member since</span><strong>September 2026</strong></div></div></>
}

function PageTitle({ eyebrow, title, body }) { return <div className="pageTitle"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div> }

function CollectorScreen({ requests, accept, collect }) {
  const available = requests.filter(r => ['AVAILABLE', 'ACCEPTED'].includes(r.status))
  const mine = requests.filter(r => r.collector === 'You')
  return <><PageTitle eyebrow="COLLECTOR MODE" title="Today's pickups" body="Accept nearby requests and keep every collection moving." /><section className="collectorSummary"><Stat icon={Package} value={available.filter(r => r.status === 'AVAILABLE').length} label="Available" /><Stat icon={Truck} value={mine.length} label="My pickups" /><Stat icon={Recycle} value="0 kg" label="Collected today" /></section><section className="sectionHead"><div><span className="eyebrow">QUEUE</span><h2>Available nearby</h2></div></section>{available.length ? <div className="requestList">{available.map(r => <RequestCard key={r.id} request={r} action={r.status === 'AVAILABLE' ? <button className="primary small" onClick={() => accept(r.id)}>Accept pickup</button> : <button className="primary small" onClick={() => collect(r.id)}>Mark collected</button>} />)}</div> : <EmptyState title="Nothing nearby" body="New collection requests will appear here." />}</>
}

function AdminScreen({ requests, verify }) {
  const collected = requests.filter(r => r.status === 'COLLECTED')
  const verified = requests.filter(r => r.status === 'VERIFIED')
  const totalKg = verified.reduce((a, r) => a + (r.actual || 0), 0)
  return <><PageTitle eyebrow="OPERATIONS" title="Bottle Up overview" body="Keep collections, verification and rewards moving." /><section className="adminStats"><Stat icon={Users} value="2" label="Users" /><Stat icon={Package} value={requests.length} label="Requests" /><Stat icon={Recycle} value={`${totalKg.toFixed(1)} kg`} label="Verified plastic" /><Stat icon={Coins} value={verified.reduce((a, r) => a + (r.points || 0), 0)} label="Points issued" /></section><section className="sectionHead"><div><span className="eyebrow">ACTION REQUIRED</span><h2>Verification queue</h2></div><span className="queueCount">{collected.length} waiting</span></section>{collected.length ? <div className="requestList">{collected.map(r => <RequestCard key={r.id} request={r} action={<button className="primary small" onClick={() => verify(r.id)}>Verify + reward</button>} />)}</div> : <EmptyState icon={ShieldCheck} title="Queue is clear" body="Collected pickups will appear here for verification." />}<section className="sectionHead activityHead"><div><span className="eyebrow">RECENT</span><h2>All activity</h2></div></section><div className="requestList">{requests.map(r => <RequestCard key={r.id} request={r} compact />)}</div></>
}

function App() {
  const [role, setRole] = useState('user')
  const [screen, setScreen] = useState('home')
  const [requests, setRequests] = useState(initialRequests)
  const [form, setForm] = useState({ type: PLASTIC_TYPES[0], estimate: '', location: '' })

  const submit = e => { e.preventDefault(); if (!form.estimate || !form.location) return; setRequests(r => [{ id: `BU-${String(r.length + 1).padStart(3, '0')}`, user: 'You', type: form.type, estimate: Number(form.estimate), actual: 0, location: form.location, status: 'AVAILABLE', collector: null, points: 0 }, ...r]); setForm({ type: PLASTIC_TYPES[0], estimate: '', location: '' }); setScreen('pickups') }
  const accept = id => setRequests(rs => rs.map(r => r.id === id ? { ...r, status: 'ACCEPTED', collector: 'You' } : r))
  const collect = id => setRequests(rs => rs.map(r => r.id === id ? { ...r, status: 'COLLECTED', actual: r.actual || r.estimate } : r))
  const verify = id => setRequests(rs => rs.map(r => r.id === id ? { ...r, status: 'VERIFIED', points: Math.round((r.actual || r.estimate) * 100) } : r))
  const switchRole = r => { setRole(r); setScreen('home') }

  return <div className="app">
    <header className="topbar">
      <button className="brandButton" onClick={() => { setRole('user'); setScreen('home') }}><Logo /><span><strong>BottleUp</strong><small>Recycle. Reward. Repeat.</small></span></button>
      <div className="devSwitch"><span>Preview</span>{['user','collector','admin'].map(r => <button key={r} className={role === r ? 'active' : ''} onClick={() => switchRole(r)}>{r}</button>)}</div>
      <button className="iconButton notification"><Bell size={18} /><i /></button>
    </header>

    <main>
      {role === 'user' && <UserScreen {...{ screen, requests, setScreen, form, setForm, submit }} />}
      {role === 'collector' && <CollectorScreen {...{ requests, accept, collect }} />}
      {role === 'admin' && <AdminScreen {...{ requests, verify }} />}
    </main>

    <nav className="bottomNav">
      {role === 'user' ? <>{[[Home,'home','Home'],[Package,'pickups','Pickups'],[Coins,'rewards','Rewards'],[UserRound,'profile','Profile']].map(([Icon, key, label]) => <button key={key} className={screen === key ? 'active' : ''} onClick={() => setScreen(key)}><Icon size={18} /><span>{label}</span></button>)}</> : <><button className="active"><Home size={18} /><span>Overview</span></button><button><Package size={18} /><span>Collections</span></button><button><Users size={18} /><span>People</span></button><button><UserRound size={18} /><span>Profile</span></button></>}
    </nav>
  </div>
}

createRoot(document.getElementById('root')).render(<App />)
