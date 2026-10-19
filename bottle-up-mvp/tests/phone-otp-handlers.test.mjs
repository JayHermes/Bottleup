import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { normalizeNigerianPhone, generateOtpCode, hashOtpCode, otpExpiry } from '../supabase/functions/_shared/phone.mjs'

const loadHandler = async (path, extraGlobals = {}) => {
  const source = stripTypeScriptTypes(
    (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/^import .*;\n/gm, ''),
    { mode: 'strip' },
  )
  let handler
  runInNewContext(source, {
    Deno: { serve: (value) => { handler = value }, env: { get: (key) => extraGlobals.env?.[key] } },
    createClient: extraGlobals.createClient,
    fetch: extraGlobals.fetch,
    Response, console: { error() {} }, setTimeout,
    normalizeNigerianPhone, generateOtpCode, hashOtpCode, otpExpiry,
  })
  return handler
}
const baseEnv = {
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-only', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
  PHONE_OTP_PEPPER: 'test-pepper', TERMII_API_KEY: 'test-termii-key', TERMII_SENDER_ID: 'BottleUp',
}
const userId = 'test-user'

function otpTable(rows, overrides = {}) {
  return {
    insert: (row) => ({
      select: () => ({
        single: async () => {
          const id = `otp-${rows.length + 1}`
          rows.push({ id, ...row, attempts: 0, consumed_at: null })
          return { data: { id }, error: null }
        },
      }),
    }),
    select: () => ({
      eq: (col1, val1) => ({
        gte: () => ({
          order: () => ({ data: rows.filter((r) => r.user_id === val1), error: null }),
        }),
        eq: (col2, val2) => ({
          is: () => ({
            order: () => ({
              limit: () => ({
                maybeSingle: async () => {
                  const match = rows
                    .filter((r) => r.user_id === val1 && r.phone === val2 && !r.consumed_at)
                    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
                  return { data: match ?? null, error: null }
                },
              }),
            }),
          }),
        }),
      }),
    }),
    update: (patch) => ({
      eq: (col, val) => {
        const row = rows.find((r) => r.id === val)
        if (row) Object.assign(row, patch)
        // Thenable so a bare `await update().eq(...)` resolves, but also
        // chainable so `update().eq(...).is(...)` works — verify-phone-otp
        // uses both shapes.
        return { then: (resolve) => resolve({ error: null }), is: async () => ({ error: null }) }
      },
    }),
    delete: () => ({ eq: async (col, val) => { const i = rows.findIndex((r) => r.id === val); if (i >= 0) rows.splice(i, 1); return { error: null } } }),
  }
}

function makeDb({ authenticated = true, otpRows = [], profilesUpdateError = null } = {}) {
  let profileUpdateCount = 0
  const db = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: userId } : null }, error: authenticated ? null : new Error('invalid') }) },
    from(table) {
      if (table === 'phone_otp_requests') return otpTable(otpRows)
      if (table === 'profiles') {
        return {
          update: () => ({ eq: async () => { profileUpdateCount++; return { error: profilesUpdateError } } }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
  return { db, otpRows, profileUpdateCount: () => profileUpdateCount }
}

const request = (body, token = true) => new Request('https://test.invalid/fn', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer test-only' } : {}) }, body: JSON.stringify(body),
})

test('request-phone-otp: auth, validation, rate-limit and send-failure cleanup', async (t) => {
  await t.test('rejects missing config, bad auth and bad phone', async () => {
    let handler = await loadHandler('../supabase/functions/request-phone-otp/index.ts', { env: {}, createClient: () => makeDb().db, fetch: async () => ({ ok: true, json: async () => ({}) }) })
    assert.equal((await handler(new Request('https://test.invalid', { method: 'OPTIONS' }))).status, 200)
    assert.equal((await handler(new Request('https://test.invalid'))).status, 405)
    assert.equal((await handler(request({ phone: '08031234567' }, false))).status, 401)
    assert.equal((await handler(request({ phone: '08031234567' }))).status, 503) // no env configured

    handler = await loadHandler('../supabase/functions/request-phone-otp/index.ts', {
      env: baseEnv, createClient: () => makeDb({ authenticated: false }).db, fetch: async () => ({ ok: true, json: async () => ({}) }),
    })
    assert.equal((await handler(request({ phone: '08031234567' }))).status, 401)

    handler = await loadHandler('../supabase/functions/request-phone-otp/index.ts', {
      env: baseEnv, createClient: () => makeDb().db, fetch: async () => ({ ok: true, json: async () => ({}) }),
    })
    assert.equal((await handler(request({ phone: 'not-a-phone' }))).status, 400)
  })

  await t.test('sends a code, stores it hashed, and is rate-limited on resend', async () => {
    const { otpRows } = makeDb()
    let fetchBody
    const handler = await loadHandler('../supabase/functions/request-phone-otp/index.ts', {
      env: baseEnv,
      createClient: () => makeDb({ otpRows }).db,
      fetch: async (url, opts) => { fetchBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ message_id: 'abc' }) } },
    })
    const res = await handler(request({ phone: '08031234567' }))
    assert.equal(res.status, 200)
    assert.equal((await res.json()).sent, true)
    assert.equal(otpRows.length, 1)
    assert.equal(otpRows[0].phone, '+2348031234567')
    assert.notEqual(otpRows[0].code_hash, undefined)
    assert.match(fetchBody.sms, /is your Bottle Up verification code/)

    // Immediate resend is throttled.
    otpRows[0].created_at = new Date().toISOString()
    const resend = await handler(request({ phone: '08031234567' }))
    assert.equal(resend.status, 429)
  })

  await t.test('a failed SMS send is reported and the orphan row is removed', async () => {
    const { otpRows } = makeDb()
    const handler = await loadHandler('../supabase/functions/request-phone-otp/index.ts', {
      env: baseEnv, createClient: () => makeDb({ otpRows }).db,
      fetch: async () => { throw new Error('network down') },
    })
    const res = await handler(request({ phone: '08031234567' }))
    assert.equal(res.status, 502)
    assert.equal(otpRows.length, 0)
  })
})

test('verify-phone-otp: wrong code, expiry, attempt limit and success path', async () => {
  const makeRow = async (overrides = {}) => ({
    id: 'otp-1', user_id: userId, phone: '+2348031234567',
    code_hash: await hashOtpCode('123456', baseEnv.PHONE_OTP_PEPPER),
    attempts: 0, expires_at: new Date(Date.now() + 600_000).toISOString(), consumed_at: null, created_at: new Date().toISOString(),
    ...overrides,
  })

  let otpRows = [await makeRow()]
  let handler = await loadHandler('../supabase/functions/verify-phone-otp/index.ts', { env: baseEnv, createClient: () => makeDb({ otpRows }).db })
  assert.equal((await handler(request({ phone: '08031234567', code: '000000' }))).status, 400) // wrong code
  assert.equal(otpRows[0].attempts, 1)

  otpRows = [await makeRow({ expires_at: new Date(Date.now() - 1000).toISOString() })]
  handler = await loadHandler('../supabase/functions/verify-phone-otp/index.ts', { env: baseEnv, createClient: () => makeDb({ otpRows }).db })
  assert.equal((await handler(request({ phone: '08031234567', code: '123456' }))).status, 400) // expired

  otpRows = [await makeRow({ attempts: 5 })]
  handler = await loadHandler('../supabase/functions/verify-phone-otp/index.ts', { env: baseEnv, createClient: () => makeDb({ otpRows }).db })
  assert.equal((await handler(request({ phone: '08031234567', code: '123456' }))).status, 429) // too many attempts

  otpRows = [await makeRow()]
  const state = makeDb({ otpRows })
  handler = await loadHandler('../supabase/functions/verify-phone-otp/index.ts', { env: baseEnv, createClient: () => state.db })
  const res = await handler(request({ phone: '08031234567', code: '123456' }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { verified: true, phone: '+2348031234567' })
  assert.notEqual(otpRows[0].consumed_at, null)
  assert.equal(state.profileUpdateCount(), 1)
})
