import React, {useMemo, useState} from 'react'
import { createRoot } from 'react-dom/client'
import { Recycle, PackagePlus, Truck, ShieldCheck, Coins, MapPin } from 'lucide-react'
import './styles.css'

const initialRequests = [
  {id:'BU-001', user:'Ada', type:'PET Bottles', estimate:4, actual:0, location:'Uyo', status:'AVAILABLE', collector:null, points:0},
  {id:'BU-002', user:'Musa', type:'Plastic Containers', estimate:7, actual:6.5, location:'Uyo', status:'COLLECTED', collector:'Ekemini', points:0},
]

function App(){
 const [role,setRole]=useState('user');
 const [requests,setRequests]=useState(initialRequests);
 const [form,setForm]=useState({type:'PET Bottles',estimate:'',location:''});
 const totalKg=useMemo(()=>requests.reduce((a,r)=>a+(r.actual||0),0),[requests]);
 const totalPoints=useMemo(()=>requests.reduce((a,r)=>a+(r.points||0),0),[requests]);
 const submit=e=>{e.preventDefault(); if(!form.estimate||!form.location)return; setRequests(r=>[{id:`BU-${String(r.length+1).padStart(3,'0')}`,user:'You',type:form.type,estimate:Number(form.estimate),actual:0,location:form.location,status:'AVAILABLE',collector:null,points:0},...r]); setForm({type:'PET Bottles',estimate:'',location:''})}
 const accept=id=>setRequests(rs=>rs.map(r=>r.id===id?{...r,status:'ACCEPTED',collector:'You'}:r));
 const collect=id=>setRequests(rs=>rs.map(r=>r.id===id?{...r,status:'COLLECTED',actual:r.actual||r.estimate}:r));
 const verify=id=>setRequests(rs=>rs.map(r=>r.id===id?{...r,status:'VERIFIED',points:Math.round((r.actual||r.estimate)*100)}:r));
 return <div className="app">
  <header><div className="brand"><Recycle size={28}/><span>Bottle Up</span></div><nav>{['user','collector','admin'].map(x=><button className={role===x?'active':''} onClick={()=>setRole(x)} key={x}>{x}</button>)}</nav></header>
  <main>
   <section className="hero"><div><p className="eyebrow">TURN PLASTIC INTO VALUE</p><h1>Collect. Recover. Reward.</h1><p>Coordinate plastic pickups, verify recycling, and reward participation from one simple platform.</p></div><div className="heroCard"><Coins/><strong>{totalPoints}</strong><span>reward points issued</span></div></section>
   <section className="stats"><div><PackagePlus/><b>{requests.length}</b><span>Requests</span></div><div><Truck/><b>{requests.filter(r=>r.status==='COLLECTED'||r.status==='VERIFIED').length}</b><span>Collected</span></div><div><Recycle/><b>{totalKg.toFixed(1)} kg</b><span>Recovered</span></div><div><ShieldCheck/><b>{requests.filter(r=>r.status==='VERIFIED').length}</b><span>Verified</span></div></section>

   {role==='user' && <div className="grid"><section className="panel"><h2>Request a pickup</h2><form onSubmit={submit}><label>Plastic type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option>PET Bottles</option><option>Plastic Containers</option><option>HDPE Plastic</option><option>Mixed Plastic</option></select></label><label>Estimated weight (kg)<input type="number" min="0.1" step="0.1" value={form.estimate} onChange={e=>setForm({...form,estimate:e.target.value})} placeholder="e.g. 5"/></label><label>Pickup area<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="e.g. Uyo"/></label><button className="primary">Submit request</button></form></section><RequestList title="My requests" rows={requests.filter(r=>r.user==='You'||r.user==='Ada')} /></div>}

   {role==='collector' && <div className="grid"><RequestList title="Available pickups" rows={requests.filter(r=>['AVAILABLE','ACCEPTED'].includes(r.status))} action={(r)=>r.status==='AVAILABLE'?<button className="primary small" onClick={()=>accept(r.id)}>Accept</button>:<button className="primary small" onClick={()=>collect(r.id)}>Mark collected</button>} /><RequestList title="My collections" rows={requests.filter(r=>r.collector==='You')} /></div>}

   {role==='admin' && <div className="grid"><RequestList title="Verification queue" rows={requests.filter(r=>r.status==='COLLECTED')} action={(r)=><button className="primary small" onClick={()=>verify(r.id)}>Verify + reward</button>} /><RequestList title="All activity" rows={requests} /></div>}
  </main>
 </div>
}
function RequestList({title,rows,action}){return <section className="panel"><h2>{title}</h2><div className="list">{rows.length===0?<div className="empty">Nothing here yet.</div>:rows.map(r=><article key={r.id}><div className="icon"><Recycle/></div><div className="grow"><div className="row"><strong>{r.type}</strong><span className={`status ${r.status.toLowerCase()}`}>{r.status}</span></div><div className="meta"><span>{r.id}</span><span><MapPin size={14}/>{r.location}</span><span>{r.actual||r.estimate} kg</span>{r.points>0&&<span>{r.points} pts</span>}</div></div>{action?.(r)}</article>)}</div></section>}
createRoot(document.getElementById('root')).render(<App/>)
