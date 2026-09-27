import React from 'react'
import { Icon } from './Icons.jsx'
import './contact-links.css'

const contacts = [
  { label: 'BottleUp on X', icon: 'logo-x', href: 'https://x.com/botle_up?s=21' },
  { label: 'BottleUp on TikTok', icon: 'logo-tiktok', href: 'https://www.tiktok.com/@usebottleup' },
  { label: 'BottleUp on Instagram', icon: 'logo-instagram', href: 'https://www.instagram.com/usebottleup' },
  { label: 'Email BottleUp support', icon: 'mail-outline', href: 'mailto:usebottleup@gmail.com' },
]

export default function ContactLinks() {
  return <nav className="contactLinks" aria-label="BottleUp social media and support">
    {contacts.map(({ label, icon, href }) => <a key={icon} href={href} aria-label={label} title={label}
      {...(href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      <Icon name={icon} size={21} />
    </a>)}
  </nav>
}
