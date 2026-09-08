import { createClient } from '@supabase/supabase-js'

const cleanEnv = value => value?.trim().replace(/^['"]|['"]$/g, '')

const rawUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const key = cleanEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)

let url = rawUrl
let supabase = null
let supabaseConfigError = null

if (!url || !key) {
  supabaseConfigError = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY/VITE_SUPABASE_ANON_KEY.'
} else {
  try {
    // Accept the normal Supabase API URL. Also recover from the common mistake of
    // pasting the Supabase dashboard project URL instead of the project API URL.
    const dashboardMatch = url.match(/^https?:\/\/supabase\.com\/dashboard\/project\/([^/]+)\/?$/i)
    if (dashboardMatch) {
      url = `https://${dashboardMatch[1]}.supabase.co`
    } else if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`
    }

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
