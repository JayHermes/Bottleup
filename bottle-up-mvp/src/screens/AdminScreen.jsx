import { useEffect, useState } from 'react'
import { Coins, Gift, Package, Recycle, ShieldCheck, UserRound, Users } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { POINTS_PER_KG } from '../constants.js'
import { EmptyState, PageTitle, RequestCard, Stat } from '../components/shared.jsx'

export function AdminScreen({ requests, verify }) {
  const collected = requests.filter(r => r.status === 'COLLECTED')
  const verified = requests.filter(r => r.status === 'VERIFIED')
  const totalKg = verified.reduce((a, r) => a + (r.actual_weight_kg || 0), 0)
  const totalPoints = verified.reduce((a, r) => a + Math.round((r.actual_weight_kg || 0) * POINTS_PER_KG), 0)

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
