import React from 'react'
import {
  ArrowRight, Check, ChevronRight, Coins, Leaf, Package, Recycle, ShieldCheck, Truck,
} from 'lucide-react'
import { Logo } from '../components/shared.jsx'

export function Landing({ onAuth, onLegal }) {
  return <div className="landing">
    <header className="landingNav"><div className="brand"><Logo /><span>Bottle<span>Up</span></span></div><button className="ghostButton" onClick={() => onAuth('signin')}>Sign in <ArrowRight size={15} /></button></header>
    <main>
      <section className="landingHero">
        <div className="landingCopy">
          <span className="eyebrow"><Leaf size={13} />RECYCLING THAT COMES BACK TO YOU</span>
          <h1>Don’t throw it away.<br /><em>Put it to work.</em></h1>
          <p>BottleUp makes recycling easier. Schedule a pickup, get your materials collected and verified, then earn points you can use for rewards.</p>
          <div className="landingActions"><button className="primary large" onClick={() => onAuth('signup')}>Start recycling <ArrowRight size={17} /></button><a href="#how">See how it works</a></div>
        </div>
        <div className="landingVisual"><div className="bottleIllustration"><Recycle size={92} strokeWidth={1.2} /><span>RECYCLE<br />REPEAT<br />REWARD</span></div><div className="floatCard"><Check size={16} /><div><strong>Collection verified</strong><span>5.2 kg · +520 points</span></div></div></div>
      </section>

      <section className="problem" id="why"><div><span className="eyebrow">WHY BOTTLEUP</span><h2>Recycling shouldn't feel like a dead end.</h2></div><p>There is recyclable material everywhere, but collection is often scattered. People hand materials over without knowing where they went, how much was actually recovered or whether they received fair value. BottleUp brings the journey into one place.</p></section>

      <section className="how" id="how"><div className="sectionIntro"><span className="eyebrow">HOW IT WORKS</span><h2>One simple loop.</h2><p>From the bag in your home to a verified collection — and back again.</p></div>
        <div className="loopFlow">{[
          [Leaf,'Recycle','Set aside your plastic instead of throwing it away.'],
          [Package,'Schedule','Tell us what you have, how much and where to collect it.'],
          [Truck,'Get collected','A collector accepts the request and handles the pickup.'],
          [ShieldCheck,'Get verified','Weight is confirmed and your points are issued.'],
        ].map(([Icon,t,b], i, arr) => <React.Fragment key={t}><div className="loopStep"><span className="loopBadge"><Icon size={18} /></span><strong>{t}</strong><p>{b}</p></div>{i < arr.length - 1 && <span className="loopArrow"><ChevronRight size={16} /></span>}</React.Fragment>)}</div>
        <div className="loopReturn"><span className="loopSpin"><Recycle size={15} /></span>Then it repeats — every verified kg starts the loop again.</div>
      </section>

      <section className="landingReward"><div><span className="eyebrow">EARN AS YOU RECYCLE</span><h2>1 kg of verified plastic = <strong>100 points.</strong></h2><p>Your points build with every verified collection. Rewards shown in the pilot can be redeemed once the corresponding reward partner is active.</p></div><div className="pointPill"><Coins size={19} /><strong>100</strong><span>points / kg</span></div></section>
    </main>
    <footer className="landingFooter"><div className="brand"><Logo size={28} /><span>Bottle<span>Up</span></span></div><span>Recycle better. Track it. Get rewarded.</span><div className="legalLinks"><button onClick={() => onLegal('privacy')}>Privacy</button><button onClick={() => onLegal('terms')}>Terms</button></div></footer>
  </div>
}
