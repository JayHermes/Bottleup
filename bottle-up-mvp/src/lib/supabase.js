import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let supabase = null
let supabaseConfigError = null

if (!url || !key) {
  supabaseConfigError = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.'
} else {
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('VITE_SUPABASE_URL must use http or https.')
    }
    supabase = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  } catch (error) {
    supabaseConfigError = error instanceof Error ? error.message : 'Invalid Supabase configuration.'
  }
}

export { supabase, supabaseConfigError }
