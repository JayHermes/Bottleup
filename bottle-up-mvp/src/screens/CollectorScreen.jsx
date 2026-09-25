import React, { useEffect, useState } from 'react'
import { Package, Recycle, Truck, Weight } from 'lucide-react'
import { haversineKm } from '../lib/geo.js'
import {
  EmptyState, PageTitle, RequestCard, Stat,
} from '../components/shared.jsx'

const PickupsMap = React.lazy(() => import('../PickupsMap.jsx'))

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


export function CollectorScreen({ requests, userId, accept, startOnTheWay, collect }) {
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
  const kg = requests.filter(r => r.collector_id === userId && r.status === 'VERIFIED').reduce((a, r) => a + (r.actual_weight_kg || 0), 0)

  const actionFor = r => {
    if (r.status === 'AVAILABLE') return <button className="primary small" onClick={() => accept(r.id, myPos)}>Accept pickup</button>
    if (r.status === 'ACCEPTED' && r.collector_id === userId) return <button className="primary small" onClick={() => startOnTheWay(r.id, myPos)}>Start heading over</button>
    if (r.status === 'ON_THE_WAY' && r.collector_id === userId) return <CollectAction request={r} onCollect={collect} />
    return null
  }

  return <><PageTitle eyebrow="COLLECTOR MODE" title="Today's pickups" body={myPos ? "Sorted by distance from your current location." : "Accept nearby requests and keep every collection moving."} /><section className="collectorSummary"><Stat icon={Package} value={available.length} label="Available" /><Stat icon={Truck} value={mine.length} label="My pickups" /><Stat icon={Recycle} value={`${kg.toFixed(1)} kg`} label="Verified total" /></section>
    <React.Suspense fallback={<div className="mapShell mapLoading">Loading map…</div>}><PickupsMap points={available.filter(r => r.latitude != null && r.longitude != null).map(r => ({ lat: r.latitude, lng: r.longitude, popupHtml: `<strong>${r.material_type}</strong><br/>${r.pickup_location} · ${r.estimated_weight_kg} kg` }))} myPos={myPos} myPopupHtml="Your location" /></React.Suspense>
    <section className="sectionHead"><div><span className="eyebrow">QUEUE</span><h2>Available nearby</h2></div></section>{available.length ? <div className="requestList">{available.map(r => <RequestCard key={r.id} request={r} action={actionFor(r)} distanceKm={withDistance(r)} />)}</div> : <EmptyState title="Nothing nearby" body="New collection requests will appear here." />}{mine.length > 0 && <><section className="sectionHead"><div><span className="eyebrow">IN PROGRESS</span><h2>My pickups</h2></div></section><div className="requestList">{mine.map(r => <RequestCard key={r.id} request={r} action={actionFor(r)} />)}</div></>}</>
}
