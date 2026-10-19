import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { runInNewContext } from 'node:vm'
import { buildVtpassPayload, interpretVtpassResponse, vtpassRequestId } from '../supabase/functions/_shared/vtpass.mjs'

const redemptionId = '00000000-0000-4000-8000-000000000021'
const userId = 'test-user'

async function loadHandler({ redemption, reward = { amount_naira: 500, vtpass_service_id: null, vtpass_variation_code: null }, fetchImpl, rpcError = null, rpcCalls = [] }) {
  const source = stripTypeScriptTypes(
    (await readFile(new URL('../supabase/functions/fulfil-airtime-reward/index.ts', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, ''),
    { mode: 'strip' },
  )
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from(table) {
      const row = table === 'reward_redemptions' ? redemption : reward
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args })
      return { error: rpcError }
    },
  }
  let handler
  runInNewContext(source, {
    Deno: {
      serve: (value) => { handler = value },
      env: { get: (key) => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x', VTPASS_API_KEY: 'k', VTPASS_SECRET_KEY: 's' }[key]) },
    },
    createClient: () => db,
    fetch: fetchImpl,
    Response, console: { error() {} }, setTimeout: (fn) => fn(), // run "immediately" in tests
    buildVtpassPayload, interpretVtpassResponse, vtpassRequestId,
  })
  return { invoke: handler, rpcCalls }
}

const request = (body) => new Request('https://test.invalid/fn', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-only' }, body: JSON.stringify(body),
})
const processingRedemption = (overrides = {}) => ({
  id: redemptionId, user_id: userId, reward_id: 'free-pickup', kind: 'airtime', status: 'processing', phone: '+2348011112222', network: 'mtn', ...overrides,
})

test('fulfil-airtime-reward: input validation and ownership', async () => {
  const rpcCalls = []
  const { invoke } = await loadHandler({ redemption: processingRedemption(), rpcCalls, fetchImpl: async () => ({ json: async () => ({ code: '000' }) }) })
  assert.equal((await invoke(new Request('https://test.invalid', { method: 'OPTIONS' }))).status, 200)
  assert.equal((await invoke(request({ redemption_id: 'not-a-uuid' }))).status, 400)

  const foreignRedemption = processingRedemption({ user_id: 'someone-else' })
  const { invoke: invokeForeign } = await loadHandler({ redemption: foreignRedemption, fetchImpl: async () => ({ json: async () => ({}) }) })
  assert.equal((await invokeForeign(request({ redemption_id: redemptionId }))).status, 404)

  const manualRedemption = processingRedemption({ kind: 'manual' })
  const { invoke: invokeManual } = await loadHandler({ redemption: manualRedemption, fetchImpl: async () => ({ json: async () => ({}) }) })
  assert.equal((await invokeManual(request({ redemption_id: redemptionId }))).status, 409)
})

test('fulfil-airtime-reward: an already-resolved redemption is reported, not re-billed', async () => {
  let calls = 0
  const { invoke } = await loadHandler({
    redemption: processingRedemption({ status: 'fulfilled' }),
    fetchImpl: async () => { calls++; return { json: async () => ({ code: '000' }) } },
  })
  const res = await invoke(request({ redemption_id: redemptionId }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'fulfilled', redemption_id: redemptionId })
  assert.equal(calls, 0) // never called VTpass for an already-settled redemption
})

test('fulfil-airtime-reward: a successful VTpass response resolves fulfilled via the RPC', async () => {
  const rpcCalls = []
  const { invoke } = await loadHandler({
    redemption: processingRedemption(),
    rpcCalls,
    fetchImpl: async (url) => {
      assert.match(url, /\/pay$/)
      return { json: async () => ({ code: '000', content: { transactions: { status: 'delivered' } } }) }
    },
  })
  const res = await invoke(request({ redemption_id: redemptionId }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'fulfilled', redemption_id: redemptionId })
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, 'process_airtime_result')
  assert.equal(rpcCalls[0].args.p_status, 'fulfilled')
  assert.equal(rpcCalls[0].args.p_provider, 'vtpass')
})

test('fulfil-airtime-reward: a pending response is requeried once, then resolved', async () => {
  const rpcCalls = []
  let callCount = 0
  const { invoke } = await loadHandler({
    redemption: processingRedemption(),
    rpcCalls,
    fetchImpl: async (url) => {
      callCount++
      if (url.endsWith('/pay')) return { json: async () => ({ code: '099', content: { transactions: { status: 'pending' } } }) }
      assert.match(url, /\/requery$/)
      return { json: async () => ({ code: '000', content: { transactions: { status: 'delivered' } } }) }
    },
  })
  const res = await invoke(request({ redemption_id: redemptionId }))
  assert.equal(callCount, 2)
  assert.deepEqual(await res.json(), { status: 'fulfilled', redemption_id: redemptionId })
})

test('fulfil-airtime-reward: a VTpass failure resolves failed (refund happens inside the RPC)', async () => {
  const rpcCalls = []
  const { invoke } = await loadHandler({
    redemption: processingRedemption(),
    rpcCalls,
    fetchImpl: async () => ({ json: async () => ({ code: '016', response_description: 'INSUFFICIENT BALANCE' }) }),
  })
  const res = await invoke(request({ redemption_id: redemptionId }))
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { status: 'failed', redemption_id: redemptionId })
  assert.equal(rpcCalls[0].args.p_status, 'failed')
})

test('fulfil-airtime-reward: an unexpected error still fails closed via the RPC', async () => {
  const rpcCalls = []
  const { invoke } = await loadHandler({
    redemption: processingRedemption(),
    rpcCalls,
    fetchImpl: async () => { throw new Error('network blip') },
  })
  const res = await invoke(request({ redemption_id: redemptionId }))
  assert.equal(res.status, 502)
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].args.p_status, 'failed')
  assert.equal(rpcCalls[0].args.p_id, redemptionId)
})

test('fulfil-airtime-reward: a data bundle pulls serviceID/variation from the catalog row', async () => {
  const rpcCalls = []
  let sentBody
  const { invoke } = await loadHandler({
    redemption: processingRedemption({ kind: 'data', network: 'mtn' }),
    reward: { amount_naira: 500, vtpass_service_id: 'mtn-data', vtpass_variation_code: 'test-variation' },
    rpcCalls,
    fetchImpl: async (url, opts) => { sentBody = JSON.parse(opts.body); return { json: async () => ({ code: '000' }) } },
  })
  await invoke(request({ redemption_id: redemptionId }))
  assert.equal(sentBody.serviceID, 'mtn-data')
  assert.equal(sentBody.variation_code, 'test-variation')
  assert.equal(sentBody.billersCode, '+2348011112222')
})
