import { useState } from 'react'
import { supabase, supabaseConfigError } from './lib/supabase.js'
import { useAuth } from './hooks/useAuth.js'
import { AppShell } from './AppShell.jsx'
import { Landing } from './screens/Landing.jsx'
import {
  AuthPanel, ConfigScreen, LegalScreen, ResetPasswordScreen,
} from './screens/Auth.jsx'

export function App() {
  const { session, profile, refreshProfile, loading, recovering, clearRecovering } = useAuth()
  const [authMode, setAuthMode] = useState(null)
  const [legalPage, setLegalPage] = useState(null)

  if (supabaseConfigError) return <ConfigScreen />
  if (loading) return null
  if (legalPage) return <LegalScreen page={legalPage} onBack={() => setLegalPage(null)} />
  if (recovering) return <ResetPasswordScreen onDone={clearRecovering} />

  if (!session) {
    return authMode
      ? <AuthPanel mode={authMode} onBack={() => setAuthMode(null)} />
      : <Landing onAuth={setAuthMode} onLegal={setLegalPage} />
  }

  const onSaveName = async fullName => {
    if (!fullName) return
    const { error } = await supabase.rpc('update_own_full_name', { p_new_name: fullName })
    if (!error) refreshProfile()
  }

  return <AppShell onExit={() => supabase.auth.signOut()} profile={profile} email={session.user.email} userId={session.user.id} onSaveName={onSaveName} />
}
