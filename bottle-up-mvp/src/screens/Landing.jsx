import { useEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#good', label: 'The good stuff' },
  { href: '#faq', label: 'Got questions?' },
]

export function Landing({ onAuth, onLegal }) {
  const rootRef = useRef(null)

  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      duration: 1.15,
      smoothWheel: true,
    })

    const reveals = rootRef.current?.querySelectorAll('[data-reveal]') || []
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) entry.target.classList.add('is-in')
        })
      },
      { threshold: 0.16, rootMargin: '0px 0px -8% 0px' },
    )
    reveals.forEach(el => io.observe(el))

    return () => {
      io.disconnect()
      lenis.destroy()
    }
  }, [])

  return (
    <div className="lp" ref={rootRef}>
      <header className="lpNav">
        <a className="lpBrand" href="#top" aria-label="bottleup home">bottleup<span>.</span></a>
        <nav className="lpLinks" aria-label="Primary">
          {NAV.map(item => (
            <a key={item.href} href={item.href}>{item.label}</a>
          ))}
        </nav>
        <button type="button" className="lpSignIn" onClick={() => onAuth('signin')}>
          Sign in <ArrowRight size={15} strokeWidth={2.4} />
        </button>
      </header>

      <section className="lpHero" id="top">
        <div className="lpHeroInner">
          <div className="lpHeroCopy" data-reveal>
            <p className="lpKicker">Little plastic. A lot of possibility.</p>
            <h1>Don’t throw it away.<br />Put it to work.</h1>
            <p className="lpLead">
              Schedule a pickup, get your plastic collected and verified, then earn points you can actually use.
            </p>
            <div className="lpHeroActions">
              <button type="button" className="lpPrimary" onClick={() => onAuth('signup')}>
                Start recycling <ArrowRight size={17} strokeWidth={2.4} />
              </button>
              <a className="lpTextLink" href="#how">See how it works</a>
            </div>
          </div>

          <div className="lpHeroArt" data-reveal>
            <div className="lpHeroFrame">
              <img src="/hero-people.png" alt="Neighbors recycling with BottleUp" />
              <div className="lpStamp" aria-hidden="true">
                <span>Small acts.</span>
                <span>Good things.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lpSection" id="how" data-reveal>
        <p className="lpEyebrow">How it works</p>
        <h2>One simple loop.</h2>
        <p className="lpSectionCopy">From the bag in your home to a verified collection — and back again.</p>
        <div className="lpSteps">
          {[
            ['01', 'Set it aside', 'Keep your plastic instead of throwing it away.'],
            ['02', 'Schedule', 'Tell us what you have, how much, and where to collect.'],
            ['03', 'Get collected', 'A collector accepts and handles the pickup.'],
            ['04', 'Get verified', 'Weight is confirmed and your points are issued.'],
          ].map(([n, t, b]) => (
            <article key={n} className="lpStep">
              <span>{n}</span>
              <strong>{t}</strong>
              <p>{b}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lpSection lpBand" id="good" data-reveal>
        <p className="lpEyebrow">The good stuff</p>
        <h2>1 kg verified = 100 points.</h2>
        <p className="lpSectionCopy">
          Your points build with every verified collection. Rewards in the pilot unlock as partners go live.
        </p>
      </section>

      <section className="lpSection" id="faq" data-reveal>
        <p className="lpEyebrow">Got questions?</p>
        <h2>Straight answers.</h2>
        <div className="lpFaq">
          <div>
            <strong>Do I need an account?</strong>
            <p>Yes — so pickups, points, and rewards stay attached to you.</p>
          </div>
          <div>
            <strong>Is location required?</strong>
            <p>A text address works. Precise GPS is optional and helps collectors find you faster.</p>
          </div>
          <div>
            <strong>When do I get points?</strong>
            <p>After an admin verifies the collected weight — not on the estimate.</p>
          </div>
        </div>
      </section>

      <footer className="lpFooter">
        <a className="lpBrand" href="#top">bottleup<span>.</span></a>
        <span>Recycle better. Track it. Get rewarded.</span>
        <div className="lpLegal">
          <button type="button" onClick={() => onLegal('privacy')}>Privacy</button>
          <button type="button" onClick={() => onLegal('terms')}>Terms</button>
        </div>
      </footer>
    </div>
  )
}
