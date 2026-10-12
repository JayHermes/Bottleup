import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { receiptPayload, encodeReceipt, validateReceiptAccount, validateConfigAccount } from '../supabase/functions/record-recycling-receipt/receipt-core.mjs'

const source = stripTypeScriptTypes((await readFile(new URL('../supabase/functions/record-recycling-receipt/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, ''), { mode: 'strip' })
const pickupId = '00000000-0000-4000-8000-000000000001'
function setup({ authenticated = true, role = 'admin', pickup, databaseError = null } = {}) {
  let handler
  let updateCount = 0
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'test-only', SUPABASE_SERVICE_ROLE_KEY: 'test-only' }
  const db = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'test-admin' } : null }, error: authenticated ? null : new Error('invalid') }) },
    from(table) {
      const query = {
        select: () => query, eq: () => query,
        update: () => { updateCount++; return query },
        maybeSingle: async () => ({ data: table === 'profiles' ? { role } : pickup, error: databaseError }),
        then: resolve => resolve({ error: null }),
      }
      return query
    },
  }
  runInNewContext(source, {
    Deno: { serve: value => { handler = value }, env: { get: key => env[key] } },
    createClient: () => db, Response, Buffer, console: { error() {} },
    receiptPayload, encodeReceipt, validateReceiptAccount, validateConfigAccount,
  })
  return { invoke: handler, updates: () => updateCount }
}
const request = (body = { pickup_id: pickupId }, token = true) => new Request('https://test.invalid/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer test-only' } : {}) }, body: JSON.stringify(body) })

test('receipt endpoint enforces authentication, admin role and verified pickups before signing', async () => {
  let app = setup()
  assert.equal((await app.invoke(new Request('https://test.invalid', { method: 'OPTIONS' }))).status, 200)
  assert.equal((await app.invoke(new Request('https://test.invalid'))).status, 405)
  assert.equal((await app.invoke(request({}, false))).status, 401)
  app = setup({ authenticated: false }); assert.equal((await app.invoke(request())).status, 401)
  for (const role of ['user', 'collector']) {
    app = setup({ role }); assert.equal((await app.invoke(request())).status, 403); assert.equal(app.updates(), 0)
  }
  app = setup(); assert.equal((await app.invoke(request({ pickup_id: 'not-a-uuid' }))).status, 400)
  assert.equal((await app.invoke(request())).status, 404)
  app = setup({ pickup: { id: pickupId, status: 'COLLECTED' } }); assert.equal((await app.invoke(request())).status, 409)
  app = setup({ pickup: { id: pickupId, status: 'VERIFIED', actual_weight_kg: 0 } }); assert.equal((await app.invoke(request())).status, 409)
  app = setup({ pickup: { id: pickupId, status: 'VERIFIED', actual_weight_kg: 1, verified_at: '2026-10-12T10:00:00Z' } })
  assert.equal((await app.invoke(request())).status, 503)
  assert.equal(app.updates(), 0)
})
