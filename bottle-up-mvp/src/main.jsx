import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowRight, Bell, Camera, Check, ChevronRight, Coins, Gift, Home, Leaf,
  MapPin, Package, Recycle, ShieldCheck, Truck, UserRound, Users,
  WalletCards, Weight, X, Zap
} from 'lucide-react'
import './styles.css'

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

function Logo({ size = 34 }) {
  return <div className="logoMark" style={{ width: size, height: size }} aria-hidden="true"><Recycle size={size * .62} strokeWidth={2.7} /></div>
}

function Landing({ enter }) {
  return <div className="landing">
    <header className="landingNav"><div className="brand"><Logo /><span>Bottle<span>Up</span></span></div><button className="ghostButton" onClick={enter}>Open BottleUp <ArrowRight size={15} /></button></header>
    <main>
      <section className="landingHero">
        <div className="landingCopy">
          <span className="eyebrow"><Leaf size={13} />RECYCLING THAT COMES BACK TO YOU</span>
          <h1>Don’t throw it away.<br /><em>Put it to work.</em></h1>
          <p>BottleUp makes recycling easier. Schedule a pickup, get your materials collected and verified, then earn points you can use for rewards.</p>
          <div className="landingActions"><button className="primary large" onClick={enter}>Start recycling <ArrowRight size={17} /></button><a href="#how">See how it works</a></div>
        </div>
        <div className="landingVisual"><div className="bottleIllustration"><Recycle size={92} strokeWidth={1.2} /><span>RECYCLE<br />REPEAT<br />REWARD</span></div><div className="floatCard"><Check size={16} /><div><strong>Collection verified</strong><span>5.2 kg · +520 points</span></div></div></div>
      </section>

      <section className="problem" id="why"><div><span className="eyebrow">WHY BOTTLEUP</span><h2>Recycling shouldn't feel like a dead end.</h2></div><p>There is recyclable material everywhere, but collection is often scattered. People hand materials over without knowing where they went, how much was actually recovered or whether they received fair value. BottleUp brings the journey into one place.</p></section>

      <section className="how" id="how"><div className="sectionIntro"><span className="eyebrow">HOW IT WORKS</span><h2>One simple loop.</h2><p>From the bag in your home to a verified collection.</p></div><div className="howGrid">{[
        ['01','Recycle','Set aside your plastic instead of throwing it away.'],
        ['02','Schedule','Tell us what you have, how much and where to collect it.'],
        ['03','Get collected','A collector accepts the request and handles the pickup.'],
        ['04','Get verified','Weight is confirmed and your points are issued.'],
      ].map(([n,t,b]) => <div className="howCard" key={n}><span>{n}</span><div><strong>{t}</strong><p>{b}</p></div></div>)}</div></section>

      <section className="landingReward"><div><span className="eyebrow">EARN AS YOU RECYCLE</span><h2>1 kg of verified plastic = <strong>100 points.</strong></h2><p>Your points build with every verified collection. Rewards shown in the pilot can be redeemed once the corresponding reward partner is active.</p></div><div className="pointPill"><Coins size={19} /><strong>100</strong><span>points / kg</span></div></section>
    </main>
    <footer className="landingFooter"><div className="brand"><Logo size={28} /><span>Bottle<span>Up</span></span></div><span>Recycle better. Track it. Get rewarded.</span></footer>
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
  return <div className="modalBackdrop" onMouseDown={e => e.target === e.currentTarget && close()}><div className="modal"><div className="modalHead"><div><span className="eyebrow">NEW COLLECTION</span><h2>Schedule a pickup</h2></div><button className="iconButton" onClick={close}><X size={18} /></button></div><form onSubmit={submit}><label>What are you recycling?<select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>{PLASTIC_TYPES.map(t => <option key={t}>{t}</option>)}</select></label><label>Estimated weight<input required type="number" min="0.1" step="0.1" value={form.estimate} onChange={e => setForm({ ...form, estimate: e.target.value })} placeholder="e.g. 5 kg" /></label><label>Pickup location<div className="inputWithIcon"><MapPin size={16} /><input required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Area or landmark" /></div></label><div className="fieldLabel">Photo <span className="optional">optional</span><label className="photoDrop"><Camera size={20} /><span>{photo ? photo.name : 'Add a photo of your plastic'}</span><input type="file" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] || null)} /></label></div><div className="formNote"><ShieldCheck size={15} /> Final points are based on verified weight after collection.</div><button className="primary large" type="submit">Submit collection request <ArrowRight size={17} /></button></form></div></div>
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
    <section className="impactGrid"><div className="impactCard featured"><div className="impactLabel"><Recycle size={16} /> Plastic recycled</div><strong>{myKg.toFixed(1)}<small>kg</small></strong><span>verified through BottleUp</span></div><div className="impactCard"><div className="impactLabel"><Coins size={16} /> BottleUp Points</div><strong>{points.toLocaleString()}</strong><span>1 kg verified = 100 points</span></div><div className="impactCard"><div className="impactLabel"><Zap size={16} /> Tier</div><strong>{tierInfo.current.name}</strong><span>{tierInfo.next ? `${Math.max(0, tierInfo.next.from - myKg).toFixed(1)} kg to ${tierInfo.next.name}` : 'Top tier reached'}</span></div></section>
    {active && <section className="activePickup"><div><span className="eyebrow">ACTIVE PICKUP</span><h2>{active.type}</h2><p>{active.location} · {active.estimate} kg estimated</p></div><div className="activeRight"><span className="status available">{STATUS_LABEL[active.status]}</span><button className="textButton" onClick={() => setScreen('pickups')}>Track <ChevronRight size={15} /></button></div><StageTracker status={active.status} /></section>}
    <section className="tierCard"><div className="tierTop"><div><span className="eyebrow">YOUR JOURNEY</span><h2>{tierInfo.current.name} → {tierInfo.next?.name || 'Platinum'}</h2></div><div className="tierNumber">{Math.round(tierInfo.progress * 100)}%</div></div><div className="progress"><span style={{ width: `${Math.max(4, tierInfo.progress * 100)}%` }} /></div><div className="tierFoot"><span>{myKg.toFixed(1)} kg</span><span>{tierInfo.next ? `${tierInfo.next.from} kg` : '50+ kg'}</span></div></section>
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

function ProfileScreen() {
  return <><PageTitle eyebrow="YOUR ACCOUNT" title="Profile" body="Your BottleUp account and collection preferences." /><div className="profileCard"><div className="avatar">Y</div><div><strong>You</strong><span>Uyo, Nigeria</span></div><ChevronRight size={18} /></div><div className="settingsList"><div><div><MapPin size={17} /><span>Saved addresses</span></div><ChevronRight size={17} /></div><div><div><Truck size={17} /><span>Pickup preferences</span></div><ChevronRight size={17} /></div><div><div><WalletCards size={17} /><span>Payment & wallet</span></div><ChevronRight size={17} /></div><div><div><ShieldCheck size={17} /><span>Support</span></div><ChevronRight size={17} /></div></div></>
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

function AppShell({ onExit }) {
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

  const content = role === 'collector' ? <CollectorScreen {...{ requests, accept, collect }} /> : role === 'admin' ? <AdminScreen {...{ requests, verify }} /> : screen === 'home' ? <UserHome {...{ requests, setScreen, form, setForm, submit }} /> : screen === 'pickups' ? <PickupsScreen requests={requests} /> : screen === 'rewards' ? <RewardsScreen points={points} redeem={redeem} /> : screen === 'wallet' ? <WalletScreen points={points} /> : <ProfileScreen />

  return <div className="app"><header className="topbar"><div className="topInner"><button className="brand brandButton" onClick={() => { setRole('user'); setScreen('home') }}><Logo /><span>Bottle<span>Up</span></span></button><div className="topActions"><button className="iconButton" title="Notifications"><Bell size={18} /></button><button className="avatar miniAvatar">{role === 'user' ? 'Y' : role === 'collector' ? 'C' : 'A'}</button></div></div></header><div className="appBody"><aside className="sidebar"><div className="rolePill"><span>PREVIEW</span><strong>{role === 'user' ? 'User' : role === 'collector' ? 'Collector' : 'Admin'}</strong></div>{role === 'user' && nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'navItem active' : 'navItem'} onClick={() => setScreen(id)}><Icon size={18} />{label}</button>)}<div className="sideBottom"><button className="navItem" onClick={() => setRole(role === 'user' ? 'collector' : role === 'collector' ? 'admin' : 'user')}><Users size={18} />Switch preview role</button><button className="navItem" onClick={onExit}><ArrowRight size={18} />Back to landing</button></div></aside><main className="main">{notice && <button className="notice" onClick={() => setNotice('')}><Check size={15} />{notice}<X size={14} /></button>}{content}</main></div><nav className="mobileNav">{role === 'user' && nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><Icon size={18} /><span>{label}</span></button>)}</nav></div>
}

function App() {
  const [started, setStarted] = useState(false)
  return started ? <AppShell onExit={() => setStarted(false)} /> : <Landing enter={() => setStarted(true)} />
}

createRoot(document.getElementById('root')).render(<App />)
