import React, { useState } from 'react'
import {
  Check, Coins, Eye, EyeOff, MapPin, Package, Recycle, Weight,
} from 'lucide-react'
import { POINTS_PER_KG, STAGES, STATUS_LABEL, STATUS_TO_STAGE } from '../constants.js'

export function PasswordField({ label, value, onChange, placeholder }) {
  const [visible, setVisible] = useState(false)
  return <label className="authLabel">{label}<div className="passwordField"><input className="authInput" type={visible ? 'text' : 'password'} required minLength={8} value={value} onChange={onChange} placeholder={placeholder} /><button type="button" className="passwordToggle" onClick={() => setVisible(v => !v)} tabIndex={-1} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
}

export function BottleGauge({ progress = 0 }) {
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

export function Logo({ size = 34 }) {
  return <div className="logoMark" style={{ width: size, height: size }} aria-hidden="true"><Recycle size={size * .62} strokeWidth={2.7} /></div>
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
export function Avatar({ name, email, size = 'md' }) {
  return <span className={`avatar avatar-${size} ${avatarTone(name, email)}`}>{initials(name, email)}</span>
}

export function StageTracker({ status }) {
  const idx = STATUS_TO_STAGE[status] ?? 0
  return <div className="stageWrap"><div className="stages">{STAGES.map((label, i) => <React.Fragment key={label}><span className={`stageDot ${i <= idx ? 'done' : ''}`}>{i < idx ? <Check size={9} /> : i === idx ? <span /> : null}</span>{i < STAGES.length - 1 && <span className={`stageLine ${i < idx ? 'done' : ''}`} />}</React.Fragment>)}</div><div className="stageLabels">{STAGES.map((label, i) => <span className={i <= idx ? 'done' : ''} key={label}>{label}</span>)}</div></div>
}

export function Stat({ icon: Icon, value, label }) { return <div className="miniStat"><div className="miniIcon"><Icon size={16} /></div><strong>{value}</strong><span>{label}</span></div> }

export function RequestCard({ request, action, compact = false, distanceKm }) {
  const weight = request.actual_weight_kg || request.estimated_weight_kg
  const earnedPoints = request.status === 'VERIFIED' ? Math.round((request.actual_weight_kg || 0) * POINTS_PER_KG) : 0
  return <article className={`requestCard ${compact ? 'compact' : ''}`}><div className="requestTop"><div className="requestIcon"><Package size={18} /></div><div className="requestMain"><div className="requestTitle">{request.material_type}</div><div className="requestMeta"><span>{request.id.slice(0, 8)}</span><span><MapPin size={12} />{request.pickup_location}</span><span><Weight size={12} />{weight} kg</span>{distanceKm != null && <span className="distanceBadge">{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away</span>}</div></div><span className={`status ${request.status.toLowerCase()}`}>{STATUS_LABEL[request.status]}</span></div><StageTracker status={request.status} />{(earnedPoints > 0 || action) && <div className="requestBottom">{earnedPoints > 0 ? <span className="points"><Coins size={14} />+{earnedPoints} points</span> : <span />}{action}</div>}</article>
}

export function EmptyState({ icon: Icon = Package, title, body }) { return <div className="emptyState"><div className="emptyIcon"><Icon size={22} /></div><strong>{title}</strong><p>{body}</p></div> }

export function PageTitle({ eyebrow, title, body }) { return <div className="pageTitle"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div> }
