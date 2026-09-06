import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PackagePlus, Truck, ShieldCheck, Coins, MapPin } from 'lucide-react'
import './styles.css'

const PLASTIC_TYPES = ['PET Bottles', 'Plastic Containers', 'HDPE Plastic', 'Mixed Plastic']

const STAGES = ['Posted', 'Accepted', 'Collected', 'Verified']
const STATUS_TO_STAGE = { AVAILABLE: 0, ACCEPTED: 1, COLLECTED: 2, VERIFIED: 3 }
const STATUS_LABEL = { AVAILABLE: 'Posted', ACCEPTED: 'Accepted', COLLECTED: 'Collected', VERIFIED: 'Verified' }

// Reward tiers, in kilograms of verified plastic. Gold is reserved for
// reward moments only — everywhere else the brand runs on green.
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

function Logo({ size = 30 }) {
  // A bottle silhouette built into the brand's "B", matching the BottleUp mark.
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 4h6v4.2c2.6 1 4 3 4 5.8v24c0 2.2-1.8 4-4 4h-6c-2.2 0-4-1.8-4-4V14c0-2.8 1.4-4.8 4-5.8V4Z" fill="var(--green-bright)" />
      <rect x="16" y="2" width="4" height="5" rx="1" fill="var(--green-bright)" />
      <path d="M12 22h12v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8Z" fill="var(--ink)" opacity=".35" />
    </svg>
  )
}

function BottleGauge({ progress, next }) {
  const fillPct = Math.round(progress * 100)
  const clipId = 'gaugeClip'
  return (
    <svg className="bottleGauge" viewBox="0 0 64 96" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${fillPct}% of the way to ${next ? next.name : 'max tier'}`}>
      <defs>
        <clipPath id={clipId}>
          <path d="M22 8h20v8.4c4.8 1.8 8 6.4 8 12V80c0 4.4-3.6 8-8 8H22c-4.4 0-8-3.6-8-8V28.4c0-5.6 3.2-10.2 8-12V8Z" />
        </clipPath>
        <linearGradient id="gaugeFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--gold)" />
          <stop offset="100%" stopColor="var(--green-bright)" />
        </linearGradient>
      </defs>
      <path d="M22 8h20v8.4c4.8 1.8 8 6.4 8 12V80c0 4.4-3.6 8-8 8H22c-4.4 0-8-3.6-8-8V28.4c0-5.6 3.2-10.2 8-12V8Z" fill="var(--surface-3)" stroke="var(--line)" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="10" y={96 - fillPct * 0.8} width="44" height="96" fill="url(#gaugeFill)" />
      </g>
      <rect x="26" y="2" width="12" height="7" rx="2" fill="var(--surface-3)" stroke="var(--line)" />
    </svg>
  )
}

function StageTracker({ status }) {
  const idx = STATUS_TO_STAGE[status] ?? 0
  return (
    <div className="stages" aria-label={`Stage: ${STATUS_LABEL[status]}`}>
      {STAGES.map((label, i) => (
        <React.Fragment key={label}>
          <span className={`dot ${i <= idx ? 'done' : ''}`} />
          {i < STAGES.length - 1 && <span className={`bar ${i < idx ? 'done' : ''}`} />}
        </React.Fragment>
      ))}
      <small>{STATUS_LABEL[status]}</small>
    </div>
  )
}

function App() {
  const [role, setRole] = useState('user')
  const [requests, setRequests] = useState(initialRequests)
  const [form, setForm] = useState({ type: PLASTIC_TYPES[0], estimate: '', location: '' })

  const totalPoints = useMemo(() => requests.reduce((a, r) => a + (r.points || 0), 0), [requests])
  const verifiedCount = requests.filter(r => r.status === 'VERIFIED').length
  const collectedCount = requests.filter(r => r.status === 'COLLECTED' || r.status === 'VERIFIED').length

  const myKg = useMemo(
    () => requests.filter(r => r.user === 'You' && r.status === 'VERIFIED').reduce((a, r) => a + (r.actual || 0), 0),
    [requests]
  )
  const tierInfo = useMemo(() => {
    let current = TIERS[0]
    let next = null
    for (let i = 0; i < TIERS.length; i++) {
      if (myKg >= TIERS[i].from) current = TIERS[i]
      else { next = TIERS[i]; break }
    }
    if (!next) return { current, next: null, progress: 1 }
    const span = next.from - current.from
    const progress = span > 0 ? Math.min(1, (myKg - current.from) / span) : 1
    return { current, next, progress }
  }, [myKg])

  const submit = e => {
    e.preventDefault()
    if (!form.estimate || !form.location) return
    setRequests(r => [
      { id: `BU-${String(r.length + 1).padStart(3, '0')}`, user: 'You', type: form.type, estimate: Number(form.estimate), actual: 0, location: form.location, status: 'AVAILABLE', collector: null, points: 0 },
      ...r,
    ])
    setForm({ type: PLASTIC_TYPES[0], estimate: '', location: '' })
  }
  const accept = id => setRequests(rs => rs.map(r => (r.id === id ? { ...r, status: 'ACCEPTED', collector: 'You' } : r)))
  const collect = id => setRequests(rs => rs.map(r => (r.id === id ? { ...r, status: 'COLLECTED', actual: r.actual || r.estimate } : r)))
  const verify = id => setRequests(rs => rs.map(r => (r.id === id ? { ...r, status: 'VERIFIED', points: Math.round((r.actual || r.estimate) * 100) } : r)))

  const roles = ['user', 'collector', 'admin']

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <div className="word">
            <b>BottleUp</b>
            <small>Recycle. Reward. Repeat.</small>
          </div>
        </div>
        <div className="roleSwitch">
          {roles.map(x => (
            <button key={x} className={role === x ? 'active' : ''} onClick={() => setRole(x)}>{x}</button>
          ))}
        </div>
      </header>

      <main>
        {role === 'user' && (
          <div className="gaugeCard">
            <div className="copy">
              <p className="tier">{tierInfo.current.name.toUpperCase()} TIER</p>
              <h2>{myKg.toFixed(1)} kg verified so far</h2>
              <p>
                {tierInfo.next
                  ? `${(tierInfo.next.from - myKg).toFixed(1)} kg to go before you reach ${tierInfo.next.name}.`
                  : "You've reached the top tier — thank you for keeping plastic out of the ocean."}
              </p>
              <div className="track"><span style={{ width: `${Math.round(tierInfo.progress * 100)}%` }} /></div>
            </div>
            <BottleGauge progress={tierInfo.progress} next={tierInfo.next} />
          </div>
        )}

        <section className="statStrip">
          <div className="stat"><PackagePlus size={18} /><b>{requests.length}</b><span>Requests posted</span></div>
          <div className="stat"><Truck size={18} /><b>{collectedCount}</b><span>Picked up</span></div>
          <div className="stat"><ShieldCheck size={18} /><b>{verifiedCount}</b><span>Verified</span></div>
          <div className="stat"><Coins size={18} /><b>{totalPoints}</b><span>Tokens rewarded</span></div>
        </section>

        {role === 'user' && (
          <div className="grid">
            <section className="panel">
              <h2>Post a pickup</h2>
              <form onSubmit={submit}>
                <label>
                  Plastic type
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    {PLASTIC_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label>
                  Estimated weight (kg)
                  <input type="number" min="0.1" step="0.1" value={form.estimate} onChange={e => setForm({ ...form, estimate: e.target.value })} placeholder="e.g. 5" />
                </label>
                <label>
                  Pickup area
                  <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Uyo" />
                </label>
                <button className="primary">Post request</button>
              </form>
            </section>
            <RequestList
              title="My requests"
              emptyTitle="No requests yet"
              emptyBody="Post your first pickup and a collector nearby will accept it."
              rows={requests.filter(r => r.user === 'You' || r.user === 'Ada')}
            />
          </div>
        )}

        {role === 'collector' && (
          <div className="grid">
            <RequestList
              title="Available pickups"
              emptyTitle="Nothing posted nearby"
              emptyBody="Check back soon — new requests show up here as they're posted."
              rows={requests.filter(r => ['AVAILABLE', 'ACCEPTED'].includes(r.status))}
              action={r =>
                r.status === 'AVAILABLE'
                  ? <button className="primary small" onClick={() => accept(r.id)}>Accept</button>
                  : <button className="primary small" onClick={() => collect(r.id)}>Mark collected</button>
              }
            />
            <RequestList
              title="My collections"
              emptyTitle="No collections yet"
              emptyBody="Accept a pickup on the left to start your first run."
              rows={requests.filter(r => r.collector === 'You')}
            />
          </div>
        )}

        {role === 'admin' && (
          <div className="grid">
            <RequestList
              title="Verification queue"
              emptyTitle="Queue is clear"
              emptyBody="Collected pickups will land here for you to verify and reward."
              rows={requests.filter(r => r.status === 'COLLECTED')}
              action={r => <button className="primary small" onClick={() => verify(r.id)}>Verify + reward</button>}
            />
            <RequestList title="All activity" emptyTitle="No activity yet" emptyBody="Requests will appear here as they come in." rows={requests} />
          </div>
        )}
      </main>

      <nav className="tabBar">
        {roles.map(x => (
          <button key={x} className={role === x ? 'active' : ''} onClick={() => setRole(x)}>
            <span>{x}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function RequestList({ title, rows, action, emptyTitle, emptyBody }) {
  return (
    <section className="panel">
      <div className="panelHead">
        <h2>{title}</h2>
        <span>{rows.length}</span>
      </div>
      <div className="list">
        {rows.length === 0 ? (
          <div className="empty"><b>{emptyTitle}</b>{emptyBody}</div>
        ) : (
          rows.map(r => (
            <article className="reqCard" key={r.id}>
              <div className="top">
                <div>
                  <div className="type">{r.type}</div>
                  <div className="meta">
                    <span>{r.id}</span>
                    <span><MapPin size={13} />{r.location}</span>
                    <span>{r.actual || r.estimate} kg</span>
                  </div>
                </div>
                <span className={`badge ${STATUS_LABEL[r.status].toLowerCase()}`}>{STATUS_LABEL[r.status]}</span>
              </div>
              <StageTracker status={r.status} />
              <div className="actionRow">
                {r.points > 0 && <span className="reward"><Coins size={14} />{r.points} tokens</span>}
                {action?.(r)}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  )
}

createRoot(document.getElementById('root')).render(<App />)
