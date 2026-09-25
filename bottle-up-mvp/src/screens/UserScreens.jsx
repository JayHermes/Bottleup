import React, { useMemo, useState } from 'react'
import {
  ArrowRight, Check, ChevronRight, Coins, Gift, Leaf, MapPin, Pencil, Recycle,
  ShieldCheck, Truck, WalletCards,
} from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { haversineKm } from '../lib/geo.js'
import { POINTS_PER_KG, REWARDS, STATUS_LABEL, TIERS } from '../constants.js'
import {
  Avatar, BottleGauge, EmptyState, PageTitle, RequestCard, StageTracker,
} from '../components/shared.jsx'
import { PickupModal } from '../components/PickupModal.jsx'

const PickupsMap = React.lazy(() => import('../PickupsMap.jsx'))

export function UserHome({ requests, setScreen, onSubmitPickup, profile, userId }) {
  const myRequests = requests.filter(r => r.user_id === userId)
  const points = profile?.points || 0
  const myKg = points / POINTS_PER_KG
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
    {active && <section className="activePickup"><div><span className="eyebrow">ACTIVE PICKUP</span><h2>{active.material_type}</h2><p>{active.pickup_location} · {active.estimated_weight_kg} kg estimated</p></div><div className="activeRight"><span className="status available">{STATUS_LABEL[active.status]}</span><button className="textButton" onClick={() => setScreen('pickups')}>Track <ChevronRight size={15} /></button></div><StageTracker status={active.status} /></section>}
    <section className="sectionHead"><div><span className="eyebrow">ACTIVITY</span><h2>Recent pickups</h2></div><button className="textButton" onClick={() => setScreen('pickups')}>View all <ChevronRight size={15} /></button></section>
    {myRequests.length ? <div className="requestList">{myRequests.slice(0, 3).map(r => <RequestCard key={r.id} request={r} />)}</div> : <EmptyState title="No pickups yet" body="Schedule your first collection and your history will appear here." />}
    {showForm && <PickupModal onSubmit={onSubmitPickup} close={() => setShowForm(false)} />}
  </>
}


export function PickupsScreen({ requests, userId }) {
  const mine = requests.filter(r => r.user_id === userId)
  const tracking = mine.find(r => ['ACCEPTED', 'ON_THE_WAY'].includes(r.status) && r.latitude != null && r.collector_latitude != null)
  const distance = tracking ? haversineKm(tracking.latitude, tracking.longitude, tracking.collector_latitude, tracking.collector_longitude) : null

  return <><PageTitle eyebrow="YOUR ACTIVITY" title="Pickups" body="Track every collection from request to verified weight." />
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
    {mine.length ? <div className="requestList">{mine.map(r => <RequestCard key={r.id} request={r} />)}</div> : <EmptyState title="No pickups yet" body="Schedule your first collection from Home." />}<section className="history"><div className="sectionHead"><div><span className="eyebrow">HISTORY</span><h2>Verified collections</h2></div></div>{mine.filter(r => r.status === 'VERIFIED').map(r => <div className="historyRow" key={`h-${r.id}`}><div><strong>{new Date(r.verified_at || r.created_at).toLocaleDateString()}</strong><span>{r.actual_weight_kg} kg · {r.material_type}</span></div><span className="verified"><Check size={13} /> Verified</span></div>)}</section></>
}


export function RewardsScreen({ points, redeem, redemptions }) {
  const pending = redemptions.filter(r => r.status === 'pending')
  return <><PageTitle eyebrow="YOUR REWARDS" title="Rewards" body="Turn your verified recycling into something useful." /><div className="rewardHero"><div className="rewardBalance"><Coins size={28} /><div><strong>{points.toLocaleString()}</strong><span>available points</span></div></div><span>100 points = 1 kg verified plastic</span></div><div className="sectionHead"><div><span className="eyebrow">MARKETPLACE</span><h2>Redeem your points</h2></div></div><div className="rewardGrid">{REWARDS.map(r => <div className="rewardCard" key={r.name}><div className="rewardIcon"><Gift size={20} /></div><div><strong>{r.name}</strong><p>{r.note}</p></div><div className="rewardCost"><span>{r.cost.toLocaleString()} pts</span><button className="secondary" disabled={points < r.cost} onClick={() => redeem(r)}>Redeem</button></div></div>)}</div>
    {redemptions.length > 0 && <><div className="sectionHead"><div><span className="eyebrow">HISTORY</span><h2>Your redemptions</h2></div></div><div className="requestList">{redemptions.map(r => <div className="historyRow" key={r.id}><div><strong>{r.reward_name}</strong><span>{r.cost} pts · {new Date(r.created_at).toLocaleDateString()}</span></div><span className={`status ${r.status}`}>{r.status === 'pending' ? 'Pending' : r.status === 'fulfilled' ? 'Fulfilled' : 'Declined — refunded'}</span></div>)}</div></>}
    <div className="pilotNote"><ShieldCheck size={17} /><div><strong>Pilot rewards</strong><span>{pending.length > 0 ? `You have ${pending.length} redemption${pending.length > 1 ? 's' : ''} awaiting fulfilment.` : 'Reward fulfilment is handled by the BottleUp team as each partner activates. Your points remain attached to your account.'}</span></div></div></>
}


export function WalletScreen({ points, redemptions }) {
  const pendingCost = redemptions.filter(r => r.status === 'pending').reduce((a, r) => a + r.cost, 0)
  return <><PageTitle eyebrow="BOTTLEUP WALLET" title="Wallet" body="Keep track of what you've earned and what is pending." /><div className="walletGrid"><div className="walletMain"><span>Available reward value</span><strong>₦{(Math.floor(points / 500) * 1000).toLocaleString()}</strong><small>based on redeemable rewards currently shown</small></div><div className="walletStat"><span>Total earned</span><strong>{points.toLocaleString()} pts</strong></div><div className="walletStat"><span>Pending rewards</span><strong>{pendingCost.toLocaleString()} pts</strong></div></div><div className="pilotNote"><WalletCards size={17} /><div><strong>Redemption, not cash withdrawal</strong><span>The MVP treats BottleUp Wallet as a reward balance. Cash-out infrastructure is intentionally not part of this pilot.</span></div></div></>
}


export function ProfileScreen({ profile, email, onSaveName, notify }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const startEdit = () => { setDraft(profile?.full_name || ''); setEditing(true) }
  const save = async () => {
    setSaving(true)
    await onSaveName(draft.trim())
    setSaving(false)
    setEditing(false)
  }

  const deleteAccount = async () => {
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.rpc('delete_own_account')
    if (error) { setDeleteError(error.message); setDeleting(false); return }
    // Account is gone — the session is no longer valid, sign out client-side to land back on the landing page.
    supabase.auth.signOut()
  }

  const placeholderRows = [
    [MapPin, 'Saved addresses'],
    [Truck, 'Pickup preferences'],
    [WalletCards, 'Payment & wallet'],
    [ShieldCheck, 'Support'],
  ]

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
    <div className="settingsList">
      {placeholderRows.map(([Icon, label]) => <div key={label} onClick={() => notify(`${label} is coming soon.`)}><div><Icon size={17} /><span>{label}</span></div><ChevronRight size={17} /></div>)}
    </div>
    <button className="secondary" style={{ marginTop: 18 }} onClick={() => supabase.auth.signOut()}>Sign out</button>

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
