import { supabase, supabaseConfigError } from './lib/supabase.js'

const root = document.getElementById('root')

const styles = `
.authGate{min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 75% 10%,#173a2c 0,#0b1512 42%),#0b1512;color:#f5f3e9;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.authCard{width:min(440px,100%);padding:32px;border:1px solid #2a473a;border-radius:24px;background:#12221d;box-shadow:0 25px 80px rgba(0,0,0,.28)}.authBrand{display:flex;align-items:center;gap:10px;font:800 22px 'Baloo 2',sans-serif;margin-bottom:28px}.authLogo{width:38px;height:38px;border-radius:11px;background:#26a65f;display:grid;place-items:center}.authTitle{font:800 34px/1 'Baloo 2',sans-serif;margin:0 0 8px}.authCopy{color:#9bb0a6;font-size:13px;line-height:1.6;margin:0 0 24px}.authTabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:20px}.authTab{border:1px solid #2a473a;background:#183028;color:#9bb0a6;border-radius:10px;padding:10px;font-weight:800;cursor:pointer}.authTab.active{background:#26a65f;color:#fff;border-color:#26a65f}.authForm{display:grid;gap:13px}.authLabel{display:grid;gap:6px;font-size:11px;font-weight:800}.authInput{width:100%;box-sizing:border-box;border:1px solid #2a473a;background:#0b1512;color:#f5f3e9;border-radius:11px;padding:12px 13px;outline:none}.authInput:focus{border-color:#26a65f}.authButton{border:0;background:#26a65f;color:#fff;border-radius:12px;padding:13px 16px;font-weight:800;cursor:pointer;margin-top:4px}.authButton:disabled{opacity:.6;cursor:wait}.authMessage{margin:4px 0 0;padding:10px 12px;border-radius:10px;background:#183028;color:#9bb0a6;font-size:11px;line-height:1.5}.authError{background:#3b201e;color:#f4b4ae}.authConfig{background:#3c3016;color:#f4d28e}.authNote{margin-top:18px;color:#6f887d;font-size:10px;line-height:1.5;text-align:center}
`

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: styles }))

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

function showMessage(message) {
  root.innerHTML = `<div class="authGate"><div class="authCard"><div class="authBrand"><div class="authLogo">♻</div><span>Bottle<span style="color:#5be394">Up</span></span></div><h1 class="authTitle">Something went wrong</h1><p class="authCopy">BottleUp could not finish loading this page.</p><div class="authMessage authError">${escapeHtml(message)}</div></div></div>`
}

function renderAuth(message = '', error = false, mode = 'signin') {
  root.innerHTML = `
    <div class="authGate">
      <div class="authCard">
        <div class="authBrand"><div class="authLogo">♻</div><span>Bottle<span style="color:#5be394">Up</span></span></div>
        <h1 class="authTitle">Recycle. Reward. Repeat.</h1>
        <p class="authCopy">Create your BottleUp account or sign in to schedule pickups and keep your recycling activity attached to your account.</p>
        <div class="authTabs"><button class="authTab ${mode === 'signin' ? 'active' : ''}" data-mode="signin">Sign in</button><button class="authTab ${mode === 'signup' ? 'active' : ''}" data-mode="signup">Create account</button></div>
        <form class="authForm" id="authForm">
          <label class="authLabel signupOnly" ${mode === 'signup' ? '' : 'hidden'}>Full name<input class="authInput" name="fullName" autocomplete="name" ${mode === 'signup' ? 'required' : ''} placeholder="Your name" /></label>
          <label class="authLabel signupOnly" ${mode === 'signup' ? '' : 'hidden'}>Phone<input class="authInput" name="phone" autocomplete="tel" placeholder="080..." /></label>
          <label class="authLabel">Email<input class="authInput" name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></label>
          <label class="authLabel">Password<input class="authInput" name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required placeholder="At least 6 characters" /></label>
          <button class="authButton" type="submit">${mode === 'signup' ? 'Create account' : 'Sign in'}</button>
          ${message ? `<div class="authMessage ${error ? 'authError' : ''}">${escapeHtml(message)}</div>` : ''}
        </form>
        <div class="authNote">Your account is secured by Supabase Auth. Your pickup data is tied to your authenticated user.</div>
      </div>
    </div>`

  const form = document.getElementById('authForm')
  const tabs = [...document.querySelectorAll('.authTab')]
  tabs.forEach(tab => tab.addEventListener('click', () => renderAuth('', false, tab.dataset.mode)))

  form.addEventListener('submit', async event => {
    event.preventDefault()
    const button = form.querySelector('.authButton')
    button.disabled = true
    button.textContent = mode === 'signup' ? 'Creating account...' : 'Signing in...'
    const values = Object.fromEntries(new FormData(form).entries())

    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.fullName, phone: values.phone } } })
        : await supabase.auth.signInWithPassword({ email: values.email, password: values.password })

      if (result.error) {
        renderAuth(result.error.message, true, mode)
        return
      }

      if (mode === 'signup' && !result.data.session) {
        renderAuth('Account created. Check your email to confirm your address, then come back and sign in.', false, 'signin')
        return
      }

      await loadApp()
    } catch (error) {
      renderAuth(error instanceof Error ? error.message : 'Authentication failed. Please try again.', true, mode)
    }
  })
}

async function loadApp() {
  try {
    await import('./main.jsx')
  } catch (error) {
    console.error('BottleUp app failed to load:', error)
    showMessage(error instanceof Error ? error.message : 'The BottleUp app failed to load.')
  }
}

if (!supabase) {
  root.innerHTML = `<div class="authGate"><div class="authCard"><div class="authBrand"><div class="authLogo">♻</div><span>BottleUp</span></div><h1 class="authTitle">Supabase is not configured</h1><p class="authCopy">Add the Supabase Project URL and browser-safe publishable/anon key to the deployment environment.</p><div class="authMessage authConfig">${escapeHtml(supabaseConfigError || 'No valid Supabase configuration was found.')}</div></div></div>`
} else {
  supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') window.location.reload()
  })
  supabase.auth.getSession().then(async ({ data: { session }, error }) => {
    if (error) return renderAuth(error.message, true)
    if (!session) return renderAuth()
    await loadApp()
  }).catch(error => renderAuth(error instanceof Error ? error.message : 'Unable to check your session.', true))
}
