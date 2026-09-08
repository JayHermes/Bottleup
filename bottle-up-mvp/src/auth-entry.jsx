import { supabase, supabaseConfigError } from './lib/supabase.js'

const root = document.getElementById('root')

const styles = `
.buAuthBackdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:rgba(5,14,11,.72);backdrop-filter:blur(10px)}
.buAuthCard{width:min(440px,100%);padding:32px;border:1px solid #2a473a;border-radius:24px;background:#12221d;color:#f5f3e9;box-shadow:0 25px 80px rgba(0,0,0,.38);font-family:Inter,ui-sans-serif,system-ui,sans-serif;position:relative}
.buAuthClose{position:absolute;right:16px;top:16px;border:1px solid #2a473a;background:#183028;color:#dce9e2;border-radius:10px;width:36px;height:36px;cursor:pointer;font-size:20px}
.buAuthBrand{display:flex;align-items:center;gap:10px;font:800 22px/1.2 'Baloo 2',sans-serif;margin-bottom:24px}.buAuthLogo{width:38px;height:38px;border-radius:11px;background:#26a65f;display:grid;place-items:center}.buAuthTitle{font:800 30px/1.1 'Baloo 2',sans-serif;margin:0 0 8px}.buAuthCopy{color:#9bb0a6;font-size:13px;line-height:1.6;margin:0 0 22px}.buAuthTabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:18px}.buAuthTab{border:1px solid #2a473a;background:#183028;color:#9bb0a6;border-radius:10px;padding:10px;font-weight:800;cursor:pointer}.buAuthTab.active{background:#26a65f;color:#fff;border-color:#26a65f}.buAuthForm{display:grid;gap:13px}.buAuthLabel{display:grid;gap:6px;font-size:11px;font-weight:800}.buAuthInput{width:100%;box-sizing:border-box;border:1px solid #2a473a;background:#0b1512;color:#f5f3e9;border-radius:11px;padding:12px 13px;outline:none}.buAuthInput:focus{border-color:#26a65f}.buAuthButton{border:0;background:#26a65f;color:#fff;border-radius:12px;padding:13px 16px;font-weight:800;cursor:pointer;margin-top:4px}.buAuthButton:disabled{opacity:.6;cursor:wait}.buAuthMessage{padding:10px 12px;border-radius:10px;background:#183028;color:#9bb0a6;font-size:11px;line-height:1.5}.buAuthError{background:#3b201e;color:#f4b4ae}.buAuthNote{margin-top:16px;color:#6f887d;font-size:10px;line-height:1.5;text-align:center}
.buNotifications{position:fixed;z-index:9000;width:min(360px,calc(100vw - 28px));border:1px solid #dbe5df;background:#fff;color:#17231e;border-radius:16px;box-shadow:0 20px 50px rgba(15,35,26,.18);overflow:hidden}.buNotificationsHead{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #e7ece9}.buNotificationsHead strong{font-size:14px}.buNotificationsHead span{font-size:10px;color:#789087}.buNotificationsBody{padding:24px 18px 26px;text-align:center}.buNotificationsIcon{width:42px;height:42px;border-radius:12px;margin:0 auto 10px;display:grid;place-items:center;background:#edf7f0;color:#26a65f}.buNotificationsBody strong{display:block;font-size:13px;margin-bottom:5px}.buNotificationsBody p{margin:0;color:#82918b;font-size:11px;line-height:1.5}
.buAvatar{overflow:hidden;position:relative}.buAvatar::after{content:'';position:absolute;inset:0;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,.16),transparent 55%);pointer-events:none}
`

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: styles }))

let authModal = null
let authMode = 'signin'
let pendingEntryButton = null
let authenticatedForEntry = false

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
}

function initials(name, email = '') {
  const source = String(name || '').trim() || String(email || '').split('@')[0] || 'BottleUp'
  const parts = source.split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0][0]).toUpperCase().slice(0, 2)
}

function avatarHue(name) {
  let hash = 0
  for (const char of String(name || 'BottleUp')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return Math.abs(hash) % 360
}

function applyProfileAvatar(user) {
  const name = user?.user_metadata?.full_name || user?.email || 'BottleUp'
  const letters = initials(name, user?.email)
  const hue = avatarHue(name)
  document.querySelectorAll('.avatar, .miniAvatar').forEach(el => {
    el.textContent = letters
    el.classList.add('buAvatar')
    el.setAttribute('aria-label', name)
    el.title = name
    el.style.background = `hsl(${hue} 34% 34%)`
    el.style.color = '#fff'
  })
}

function closeAuth() {
  authModal?.remove()
  authModal = null
  pendingEntryButton = null
}

function renderAuthModal(message = '', error = false) {
  authModal?.remove()
  authModal = document.createElement('div')
  authModal.className = 'buAuthBackdrop'
  authModal.innerHTML = `
    <div class="buAuthCard" role="dialog" aria-modal="true" aria-label="BottleUp account access">
      <button class="buAuthClose" type="button" aria-label="Close">×</button>
      <div class="buAuthBrand"><div class="buAuthLogo">♻</div><span>Bottle<span style="color:#5be394">Up</span></span></div>
      <h2 class="buAuthTitle">${authMode === 'signup' ? 'Create your BottleUp account' : 'Welcome back'}</h2>
      <p class="buAuthCopy">${authMode === 'signup' ? 'Sign up to schedule pickups, track collections and earn rewards.' : 'Sign in to access your BottleUp dashboard and recycling history.'}</p>
      <div class="buAuthTabs"><button class="buAuthTab ${authMode === 'signin' ? 'active' : ''}" data-auth-mode="signin">Sign in</button><button class="buAuthTab ${authMode === 'signup' ? 'active' : ''}" data-auth-mode="signup">Create account</button></div>
      <form class="buAuthForm">
        ${authMode === 'signup' ? '<label class="buAuthLabel">Full name<input class="buAuthInput" name="fullName" autocomplete="name" required placeholder="Your name" /></label><label class="buAuthLabel">Phone<input class="buAuthInput" name="phone" autocomplete="tel" placeholder="080..." /></label>' : ''}
        <label class="buAuthLabel">Email<input class="buAuthInput" name="email" type="email" autocomplete="email" required placeholder="you@example.com" /></label>
        <label class="buAuthLabel">Password<input class="buAuthInput" name="password" type="password" autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required placeholder="At least 6 characters" /></label>
        <button class="buAuthButton" type="submit">${authMode === 'signup' ? 'Create account' : 'Sign in'}</button>
        ${message ? `<div class="buAuthMessage ${error ? 'buAuthError' : ''}">${escapeHtml(message)}</div>` : ''}
      </form>
      <div class="buAuthNote">You can browse BottleUp freely. Account access is only required when you choose to enter the app.</div>
    </div>`
  document.body.appendChild(authModal)

  authModal.querySelector('.buAuthClose').addEventListener('click', closeAuth)
  authModal.addEventListener('mousedown', event => { if (event.target === authModal) closeAuth() })
  authModal.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
    authMode = button.dataset.authMode
    renderAuthModal()
  }))
  authModal.querySelector('form').addEventListener('submit', handleAuthSubmit)
}

async function handleAuthSubmit(event) {
  event.preventDefault()
  const form = event.currentTarget
  const button = form.querySelector('button[type="submit"]')
  button.disabled = true
  button.textContent = authMode === 'signup' ? 'Creating account...' : 'Signing in...'
  const values = Object.fromEntries(new FormData(form).entries())
  try {
    const result = authMode === 'signup'
      ? await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { full_name: values.fullName, phone: values.phone } } })
      : await supabase.auth.signInWithPassword({ email: values.email, password: values.password })

    if (result.error) {
      renderAuthModal(result.error.message, true)
      return
    }
    if (authMode === 'signup' && !result.data.session) {
      authMode = 'signin'
      renderAuthModal('Account created. Check your email to confirm your address, then sign in.', false)
      return
    }

    authenticatedForEntry = true
    const user = result.data.user || (await supabase.auth.getUser()).data.user
    applyProfileAvatar(user)
    const buttonToOpen = pendingEntryButton
    closeAuth()
    if (buttonToOpen && document.contains(buttonToOpen)) buttonToOpen.click()
  } catch (error) {
    renderAuthModal(error instanceof Error ? error.message : 'Authentication failed. Please try again.', true)
  }
}

function openAccess(button) {
  pendingEntryButton = button
  if (authenticatedForEntry) {
    button.click()
    return
  }
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) {
      authenticatedForEntry = true
      applyProfileAvatar(data.session.user)
      button.click()
      return
    }
    authMode = 'signin'
    renderAuthModal()
  }).catch(() => renderAuthModal('Unable to check your session. Please try again.', true))
}

function installLandingAccessGate() {
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button')
    if (!button || !document.body.contains(button)) return
    const text = button.textContent?.replace(/\s+/g, ' ').trim()
    if (text !== 'Open BottleUp →' && text !== 'Start recycling →' && text !== 'Open BottleUp') return
    if (authenticatedForEntry) return
    event.preventDefault()
    event.stopImmediatePropagation()
    openAccess(button)
  }, true)
}

function installNotifications() {
  document.addEventListener('click', event => {
    const bell = event.target.closest?.('.topActions .iconButton')
    if (!bell || !bell.querySelector('svg')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    document.querySelector('.buNotifications')?.remove()

    const panel = document.createElement('div')
    panel.className = 'buNotifications'
    panel.innerHTML = `<div class="buNotificationsHead"><strong>Notifications</strong><span>ALL CAUGHT UP</span></div><div class="buNotificationsBody"><div class="buNotificationsIcon">♢</div><strong>No notifications at this time</strong><p>New pickup updates, collection confirmations and reward activity will appear here.</p></div>`
    document.body.appendChild(panel)
    const rect = bell.getBoundingClientRect()
    const right = Math.max(14, window.innerWidth - rect.right)
    panel.style.top = `${Math.min(window.innerHeight - 220, rect.bottom + 10)}px`
    panel.style.right = `${right}px`

    const close = e => {
      if (!panel.contains(e.target) && e.target !== bell) {
        panel.remove()
        document.removeEventListener('mousedown', close)
      }
    }
    setTimeout(() => document.addEventListener('mousedown', close), 0)
  }, true)
}

async function boot() {
  if (!supabase) {
    root.innerHTML = `<div style="padding:40px;font-family:system-ui"><h2>Supabase is not configured</h2><p>${escapeHtml(supabaseConfigError || 'No valid Supabase configuration was found.')}</p></div>`
    return
  }

  try {
    await import('./main.jsx')
    installLandingAccessGate()
    installNotifications()
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      authenticatedForEntry = true
      applyProfileAvatar(data.session.user)
    }
  } catch (error) {
    console.error('BottleUp app failed to load:', error)
    root.innerHTML = `<div style="padding:40px;font-family:system-ui"><h2>BottleUp could not load</h2><p>${escapeHtml(error instanceof Error ? error.message : 'The app failed to load.')}</p></div>`
  }
}

boot()
