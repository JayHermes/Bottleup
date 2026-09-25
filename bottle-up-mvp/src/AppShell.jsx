import { useState } from 'react'
import {
  ArrowRight, Bell, Check, Gift, Home, Package, UserRound, Users, WalletCards, X,
} from 'lucide-react'
import { supabase } from './lib/supabase.js'
import { normalizeImage } from './lib/images.js'
import { PHOTO_BUCKET } from './constants.js'
import { usePickupRequests } from './hooks/usePickupRequests.js'
import { useNotifications } from './hooks/useNotifications.js'
import { useRedemptions } from './hooks/useRedemptions.js'
import { Avatar, Logo } from './components/shared.jsx'
import {
  UserHome, PickupsScreen, RewardsScreen, WalletScreen, ProfileScreen,
} from './screens/UserScreens.jsx'
import { CollectorScreen } from './screens/CollectorScreen.jsx'
import { AdminScreen } from './screens/AdminScreen.jsx'

export function AppShell({ onExit, profile, email, userId, onSaveName }) {
  const realRole = profile?.role || 'user' // source of truth: the profiles table, protected by RLS + a trigger no client can bypass
  const [previewRole, setPreviewRole] = useState(null) // only ever used when realRole === 'admin'
  const role = realRole === 'admin' ? (previewRole || 'admin') : realRole
  const canPreview = realRole === 'admin'

  const [screen, setScreen] = useState('home')
  const [notice, setNotice] = useState('')
  const { requests, loadingRequests, requestsError, reload } = usePickupRequests(userId)
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(userId)
  const { redemptions, reload: reloadRedemptions } = useRedemptions(userId)
  const [notifOpen, setNotifOpen] = useState(false)

  const points = profile?.points || 0

  const submitPickup = async ({ type, estimate, location, photo, coords }) => {
    let photo_url = null
    if (photo) {
      // Private bucket + RLS-scoped path (`<user_id>/<file>`). The stored value
      // is the object path, not a public URL.
      const safePhoto = await normalizeImage(photo)
      const path = `${userId}/${Date.now()}-${safePhoto.name}`
      const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, safePhoto)
      if (upErr) return upErr
      photo_url = path
    }
    const { error } = await supabase.from('pickup_requests').insert({
      user_id: userId, material_type: type, estimated_weight_kg: Number(estimate), pickup_location: location, photo_url,
      latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
    })
    if (!error) { reload(); setScreen('pickups'); setNotice('Pickup request submitted.') }
    return error
  }
  const accept = async (id, coords) => { const { error } = await supabase.rpc('accept_pickup', { p_id: id, p_lat: coords?.lat ?? null, p_lng: coords?.lng ?? null }); setNotice(error ? error.message : 'Pickup accepted.'); reload() }
  const startOnTheWay = async (id, coords) => { const { error } = await supabase.rpc('start_on_the_way', { p_id: id, p_lat: coords?.lat ?? null, p_lng: coords?.lng ?? null }); setNotice(error ? error.message : 'Marked as on the way.'); reload() }
  const collect = async (id, weight) => { const { error } = await supabase.rpc('collect_pickup', { p_id: id, p_weight: Number(weight) }); setNotice(error ? error.message : 'Collection marked as collected.'); reload() }
  const verify = async id => { const { error } = await supabase.rpc('verify_pickup', { p_id: id }); setNotice(error ? error.message : 'Weight verified and points issued.'); reload() }
  const redeem = async reward => {
    const { error } = await supabase.rpc('redeem_reward', { p_reward_name: reward.name, p_cost: reward.cost })
    // profile.points updates on its own via the live subscription in useAuth — no manual refresh needed
    if (error) setNotice(error.message)
    else { setNotice(`${reward.name} redemption request received.`); reloadRedemptions() }
  }
  const nav = [{ id: 'home', label: 'Home', icon: Home }, { id: 'pickups', label: 'Pickups', icon: Package }, { id: 'rewards', label: 'Rewards', icon: Gift }, { id: 'wallet', label: 'Wallet', icon: WalletCards }, { id: 'profile', label: 'Profile', icon: UserRound }]

  const content = loadingRequests ? null : role === 'collector' ? <CollectorScreen {...{ requests, userId, accept, startOnTheWay, collect }} /> : role === 'admin' ? <AdminScreen {...{ requests, verify }} /> : screen === 'home' ? <UserHome {...{ requests, setScreen, onSubmitPickup: submitPickup, profile, userId }} /> : screen === 'pickups' ? <PickupsScreen requests={requests} userId={userId} /> : screen === 'rewards' ? <RewardsScreen points={points} redeem={redeem} redemptions={redemptions} /> : screen === 'wallet' ? <WalletScreen points={points} redemptions={redemptions} /> : <ProfileScreen profile={profile} email={email} onSaveName={onSaveName} notify={setNotice} />

  return <>{notifOpen && <div className="notifBackdrop" onClick={() => setNotifOpen(false)} />}<div className="app"><header className="topbar"><div className="topInner"><button className="brand brandButton" onClick={() => { setPreviewRole(null); setScreen('home') }}><Logo /><span>Bottle<span>Up</span></span></button><div className="topActions"><div className="notifWrap"><button className="iconButton" title="Notifications" onClick={() => setNotifOpen(o => !o)}><Bell size={18} />{unreadCount > 0 && <span className="notifDot">{unreadCount > 9 ? '9+' : unreadCount}</span>}</button>{notifOpen && <div className="notifPanel"><div className="notifHead"><strong>Notifications</strong>{unreadCount > 0 && <button onClick={markAllRead}>Mark all read</button>}</div>{notifications.length ? notifications.map(n => <button key={n.id} className={`notifRow ${n.read ? '' : 'unread'}`} onClick={() => markRead(n.id)}><span>{n.message}</span><small>{new Date(n.created_at).toLocaleDateString()}</small></button>) : <div className="notifEmpty">Nothing yet — updates on your pickups will show up here.</div>}</div>}</div><Avatar name={profile?.full_name} email={email} size="sm" /></div></div></header><div className="appBody"><aside className="sidebar"><div className="rolePill"><span>{canPreview && previewRole ? 'PREVIEWING' : 'ACCOUNT'}</span><strong>{role === 'user' ? 'User' : role === 'collector' ? 'Collector' : 'Admin'}</strong></div>{role === 'user' && nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'navItem active' : 'navItem'} onClick={() => setScreen(id)}><Icon size={18} />{label}</button>)}<div className="sideBottom">{canPreview && <div className="previewSwitch"><span className="previewLabel">PREVIEW AS</span><div className="previewOptions">{['user', 'collector', 'admin'].map(r => <button key={r} className={role === r ? 'active' : ''} onClick={() => setPreviewRole(r === 'admin' ? null : r)}>{r === 'user' ? 'User' : r === 'collector' ? 'Collector' : 'Admin'}</button>)}</div></div>}<button className="navItem" onClick={onExit}><ArrowRight size={18} />Sign out</button></div></aside><main className="main">{notice && <button className="notice" onClick={() => setNotice('')}><Check size={15} />{notice}<X size={14} /></button>}{requestsError && <div className="authMessage authError" style={{ marginBottom: 14 }}>{requestsError}</div>}{content}</main></div><nav className="mobileNav">{role === 'user' ? nav.map(({ id, label, icon: Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><Icon size={18} /><span>{label}</span></button>) : <>{canPreview && ['user', 'collector', 'admin'].map(r => <button key={r} className={role === r ? 'active' : ''} onClick={() => setPreviewRole(r === 'admin' ? null : r)}><Users size={18} /><span>{r === 'user' ? 'User' : r === 'collector' ? 'Collector' : 'Admin'}</span></button>)}<button onClick={onExit}><ArrowRight size={18} /><span>Sign out</span></button></>}</nav></div></>
}
