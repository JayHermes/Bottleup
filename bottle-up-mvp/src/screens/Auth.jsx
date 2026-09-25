import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase, supabaseConfigError } from '../lib/supabase.js'
import { Logo, PasswordField } from '../components/shared.jsx'

export function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async e => {
    e.preventDefault()
    if (password !== confirm) { setMessage('Passwords do not match.'); setError(true); return }
    setBusy(true)
    setMessage('')
    setError(false)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) { setMessage(error.message); setError(true); return }
    setMessage('Password updated. Taking you in…')
    setTimeout(onDone, 1200)
  }

  return <div className="authGate">
    <div className="authCard">
      <div className="authBrand"><Logo /><span>Bottle<span>Up</span></span></div>
      <h1 className="authTitle">Set a new password</h1>
      <p className="authCopy">You're verified via the reset link — choose a new password for your account.</p>
      <form className="authForm" onSubmit={submit}>
        <PasswordField label="New password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
        <PasswordField label="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type it again" />
        <button className="authButton" disabled={busy} type="submit">{busy ? 'Saving…' : 'Update password'}</button>
        {message && <div className={`authMessage ${error ? 'authError' : ''}`}>{message}</div>}
      </form>
    </div>
  </div>
}


export function LegalScreen({ page, onBack }) {
  const privacy = <>
    <h2>What we collect</h2>
    <p>To run BottleUp we collect your name, phone number, and email address when you sign up; the material type, estimated and verified weight, and location text (plus GPS coordinates only if you choose to add them) for each pickup you request; photos you optionally attach to a pickup; and your points balance and reward redemption history.</p>
    <h2>Why we collect it</h2>
    <p>This information is used to operate the pickup-and-verification loop itself — matching your request to a collector, letting an admin verify the collected weight, and crediting the correct points to your account. We don't sell your data, and we don't use it for advertising.</p>
    <h2>Who can see it</h2>
    <p>Collectors can see the pickups they've accepted. Admins can see pickups and applications needed to run verification and collector approval. Your authentication and data storage are handled by Supabase, our infrastructure provider.</p>
    <h2>Your choices</h2>
    <p>Adding a photo and precise GPS location are both optional. You can edit your name from your Profile at any time. You can also permanently delete your account and your own pickup data directly from Profile — pickups you collected for other people remain on their record, with your name removed from them.</p>
    <h2>A note on where we are</h2>
    <p>BottleUp is an early-stage pilot. This policy describes what we actually do today, in plain language, rather than a full legal document — if you have concerns about how your data is handled, please reach out directly.</p>
  </>
  const terms = <>
    <h2>Using BottleUp</h2>
    <p>You must provide accurate information when requesting a pickup, including a realistic estimated weight — final points are always based on the weight verified after collection, not your estimate.</p>
    <h2>Collectors</h2>
    <p>Becoming a collector requires applying through signup and being approved by BottleUp. Approval isn't automatic, and BottleUp may decline or revoke collector status at its discretion.</p>
    <h2>Points and rewards</h2>
    <p>Points are earned at a fixed rate (1 kg of verified plastic = 100 points) and have no cash value. Rewards shown in the app may be limited by partner availability and are not guaranteed to be redeemable at all times. BottleUp Wallet is a reward balance, not a cash account — there is no cash withdrawal.</p>
    <h2>Conduct</h2>
    <p>Don't misrepresent the material or weight of a pickup, and don't attempt to circumvent the verification process. Accounts found doing so may be suspended.</p>
    <h2>Changes</h2>
    <p>Because BottleUp is actively being built, these terms may change as features are added. We'll aim to keep this page current with what the product actually does.</p>
  </>
  return <div className="authGate"><div className="authCard legalCard"><button className="iconButton authBack" onClick={onBack}><X size={18} /></button><div className="authBrand"><Logo /><span>Bottle<span>Up</span></span></div><h1 className="authTitle">{page === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}</h1><div className="legalBody">{page === 'privacy' ? privacy : terms}</div></div></div>
}


export function ConfigScreen() {
  return <div className="authGate"><div className="authCard"><div className="authBrand"><Logo /><span>Bottle<span>Up</span></span></div><h1 className="authTitle">Supabase is not configured</h1><p className="authCopy">Add the Supabase Project URL and browser-safe publishable/anon key to the deployment environment.</p><div className="authMessage authConfig">{supabaseConfigError || 'No valid Supabase configuration was found.'}</div></div></div>
}


export function AuthPanel({ mode: initialMode, onBack }) {
  const [mode, setMode] = useState(initialMode) // 'signin' | 'signup' | 'forgot'
  const [fields, setFields] = useState({ fullName: '', phone: '', email: '', password: '', wantsCollector: false })
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key, value) => setFields(f => ({ ...f, [key]: value }))

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    setError(false)
    try {
      if (mode !== 'forgot' && fields.password.length < 8) {
        setMessage('Password must be at least 8 characters.'); setError(true); return
      }
      if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(fields.email, { redirectTo: window.location.origin })
        if (error) { setMessage(error.message); setError(true) }
        else { setMessage('If an account exists for that email, a reset link is on its way.'); setError(false) }
        return
      }

      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: fields.email, password: fields.password, options: { data: { full_name: fields.fullName, phone: fields.phone, wants_collector: fields.wantsCollector } } })
        : await supabase.auth.signInWithPassword({ email: fields.email, password: fields.password })

      if (result.error) { setMessage(result.error.message); setError(true); return }

      if (mode === 'signup' && !result.data.session) {
        setMessage(fields.wantsCollector
          ? 'Account created. Check your email to confirm your address, then sign in — your collector application will be reviewed separately.'
          : 'Account created. Check your email to confirm your address, then come back and sign in.')
        setError(false)
        setMode('signin')
        return
      }
      // A session now exists — the useAuth listener at the top level picks it up
      // and swaps this panel for the real app automatically.
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Authentication failed. Please try again.')
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return <div className="authGate">
    <div className="authCard">
      <button className="iconButton authBack" onClick={onBack}><X size={18} /></button>
      <div className="authBrand"><Logo /><span>Bottle<span>Up</span></span></div>
      <h1 className="authTitle">{mode === 'forgot' ? 'Reset your password' : 'Recycle. Reward. Repeat.'}</h1>
      <p className="authCopy">{mode === 'forgot' ? "Enter the email on your account and we'll send a link to set a new password." : 'Create your BottleUp account or sign in to schedule pickups and keep your recycling activity attached to your account.'}</p>
      {mode !== 'forgot' && <div className="authTabs">
        <button className={`authTab ${mode === 'signin' ? 'active' : ''}`} type="button" onClick={() => { setMode('signin'); setMessage('') }}>Sign in</button>
        <button className={`authTab ${mode === 'signup' ? 'active' : ''}`} type="button" onClick={() => { setMode('signup'); setMessage('') }}>Create account</button>
      </div>}
      <form className="authForm" onSubmit={submit}>
        {mode === 'signup' && <label className="authLabel">Full name<input className="authInput" required value={fields.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Your name" /></label>}
        {mode === 'signup' && <label className="authLabel">Phone<input className="authInput" value={fields.phone} onChange={e => set('phone', e.target.value)} placeholder="080..." /></label>}
        {mode === 'signup' && <label className="authCheck"><input type="checkbox" checked={fields.wantsCollector} onChange={e => set('wantsCollector', e.target.checked)} /><span>I'd like to apply to become a collector <em>(reviewed by BottleUp before it takes effect)</em></span></label>}
        <label className="authLabel">Email<input className="authInput" type="email" required value={fields.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" /></label>
        {mode !== 'forgot' && <PasswordField label="Password" value={fields.password} onChange={e => set('password', e.target.value)} placeholder="At least 8 characters" />}
        {mode === 'signin' && <button type="button" className="authForgot" onClick={() => { setMode('forgot'); setMessage('') }}>Forgot password?</button>}
        <button className="authButton" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'signup' ? 'Create account' : 'Sign in'}</button>
        {mode === 'forgot' && <button type="button" className="authForgot" onClick={() => { setMode('signin'); setMessage('') }}>Back to sign in</button>}
        {message && <div className={`authMessage ${error ? 'authError' : ''}`}>{message}</div>}
      </form>
      <div className="authNote">Your account is secured by Supabase Auth. Your pickup data is tied to your authenticated user.</div>
    </div>
  </div>
}
