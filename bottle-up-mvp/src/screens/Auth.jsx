import { useState } from 'react'
import { ArrowLeft, Recycle } from 'lucide-react'
import { supabase, supabaseConfigError } from '../lib/supabase.js'
import { Logo, PasswordField } from '../components/shared.jsx'

function AuthShell({ children, onBack, backLabel = 'Back' }) {
  return (
    <div className="authPage">
      <div className="authAtmosphere" aria-hidden="true" />
      <header className="authTop">
        <button type="button" className="authBackLink" onClick={onBack}>
          <ArrowLeft size={16} />
          {backLabel}
        </button>
        <div className="authTopBrand">
          <Logo size={28} />
          <span>Bottle<span>Up</span></span>
        </div>
        <span className="authTopSpacer" />
      </header>
      <main className="authMain">{children}</main>
    </div>
  )
}

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

  return (
    <AuthShell onBack={onDone} backLabel="Continue">
      <section className="authPanel">
        <div className="authPanelMark" aria-hidden="true"><Recycle size={22} strokeWidth={2.4} /></div>
        <h1 className="authTitle">Set a new password</h1>
        <p className="authCopy">You’re verified via the reset link — choose a new password for your account.</p>
        <form className="authForm" onSubmit={submit}>
          <PasswordField label="New password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" />
          <PasswordField label="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Type it again" />
          <button className="authButton" disabled={busy} type="submit">{busy ? 'Saving…' : 'Update password'}</button>
          {message && <div className={`authMessage ${error ? 'authError' : ''}`}>{message}</div>}
        </form>
      </section>
    </AuthShell>
  )
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

  return (
    <AuthShell onBack={onBack}>
      <section className="authPanel authPanelPanel">
        <h1 className="authTitle">{page === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}</h1>
        <div className="legalBody">{page === 'privacy' ? privacy : terms}</div>
      </section>
    </AuthShell>
  )
}

export function ConfigScreen() {
  return (
    <div className="authPage">
      <div className="authAtmosphere" aria-hidden="true" />
      <main className="authMain">
        <section className="authPanel">
          <div className="authTopBrand authPanelBrand">
            <Logo size={32} />
            <span>Bottle<span>Up</span></span>
          </div>
          <h1 className="authTitle">Supabase is not configured</h1>
          <p className="authCopy">Add the Supabase Project URL and browser-safe publishable/anon key to the deployment environment.</p>
          <div className="authMessage authConfig">{supabaseConfigError || 'No valid Supabase configuration was found.'}</div>
        </section>
      </main>
    </div>
  )
}

export function AuthPanel({ mode: initialMode, onBack }) {
  const [page, setPage] = useState(initialMode === 'signup' ? 'signup' : initialMode === 'forgot' ? 'forgot' : 'signin')
  const [fields, setFields] = useState({ fullName: '', phone: '', email: '', password: '', wantsCollector: false })
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (key, value) => setFields(f => ({ ...f, [key]: value }))

  const go = next => {
    setPage(next)
    setMessage('')
    setError(false)
  }

  const submit = async e => {
    e.preventDefault()
    setBusy(true)
    setMessage('')
    setError(false)
    try {
      if (page !== 'forgot' && fields.password.length < 8) {
        setMessage('Password must be at least 8 characters.')
        setError(true)
        return
      }

      if (page === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(fields.email, { redirectTo: window.location.origin })
        if (error) { setMessage(error.message); setError(true) }
        else { setMessage('If an account exists for that email, a reset link is on its way.'); setError(false) }
        return
      }

      const result = page === 'signup'
        ? await supabase.auth.signUp({
          email: fields.email,
          password: fields.password,
          options: { data: { full_name: fields.fullName, phone: fields.phone, wants_collector: fields.wantsCollector } },
        })
        : await supabase.auth.signInWithPassword({ email: fields.email, password: fields.password })

      if (result.error) { setMessage(result.error.message); setError(true); return }

      if (page === 'signup' && !result.data.session) {
        const success = fields.wantsCollector
          ? 'Account created. Check your email to confirm, then sign in — your collector application will be reviewed separately.'
          : 'Account created. Check your email to confirm your address, then sign in.'
        setPage('signin')
        setError(false)
        setMessage(success)
        return
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Authentication failed. Please try again.')
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const copy = {
    signin: {
      title: 'Welcome back',
      body: 'Sign in to schedule pickups and keep your recycling rewards with you.',
      cta: 'Sign in',
    },
    signup: {
      title: 'Create your account',
      body: 'One account for pickups, collection tracking, and verified points.',
      cta: 'Create account',
    },
    forgot: {
      title: 'Reset your password',
      body: 'Enter the email on your account and we’ll send a reset link.',
      cta: 'Send reset link',
    },
  }[page]

  return (
    <AuthShell onBack={onBack} backLabel="Home">
      <section className="authPanel" key={page}>
        <p className="authEyebrow">BottleUp</p>
        <h1 className="authTitle">{copy.title}</h1>
        <p className="authCopy">{copy.body}</p>

        <form className="authForm" onSubmit={submit}>
          {page === 'signup' && (
            <label className="authLabel">
              Full name
              <input className="authInput" required autoComplete="name" value={fields.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Your name" />
            </label>
          )}
          {page === 'signup' && (
            <label className="authLabel">
              Phone
              <input className="authInput" autoComplete="tel" value={fields.phone} onChange={e => set('phone', e.target.value)} placeholder="080…" />
            </label>
          )}

          <label className="authLabel">
            Email
            <input className="authInput" type="email" required autoComplete="email" value={fields.email} onChange={e => set('email', e.target.value)} placeholder="you@example.com" />
          </label>

          {page !== 'forgot' && (
            <PasswordField
              label="Password"
              value={fields.password}
              onChange={e => set('password', e.target.value)}
              placeholder="At least 8 characters"
            />
          )}

          {page === 'signin' && (
            <button type="button" className="authForgot" onClick={() => go('forgot')}>Forgot password?</button>
          )}

          {page === 'signup' && (
            <label className="authCheck">
              <input type="checkbox" checked={fields.wantsCollector} onChange={e => set('wantsCollector', e.target.checked)} />
              <span>Apply to become a collector <em>(reviewed by BottleUp before it takes effect)</em></span>
            </label>
          )}

          <button className="authButton" disabled={busy} type="submit">
            {busy ? 'Please wait…' : copy.cta}
          </button>

          {message && <div className={`authMessage ${error ? 'authError' : ''}`}>{message}</div>}
        </form>

        <footer className="authSwitch">
          {page === 'signin' && (
            <p>New here? <button type="button" onClick={() => go('signup')}>Create an account</button></p>
          )}
          {page === 'signup' && (
            <p>Already recycling with us? <button type="button" onClick={() => go('signin')}>Sign in</button></p>
          )}
          {page === 'forgot' && (
            <p>Remembered it? <button type="button" onClick={() => go('signin')}>Back to sign in</button></p>
          )}
        </footer>
      </section>
    </AuthShell>
  )
}
