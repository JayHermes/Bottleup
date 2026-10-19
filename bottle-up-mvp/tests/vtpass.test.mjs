import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVtpassPayload, interpretVtpassResponse, vtpassRequestId, AIRTIME_SERVICE_IDS } from '../supabase/functions/_shared/vtpass.mjs'

test('vtpassRequestId prefixes a timestamp and strips dashes from the redemption id', () => {
  const now = new Date('2026-10-18T06:05:09.000Z')
  const id = vtpassRequestId('00000000-0000-0000-0000-000000000021', now)
  assert.equal(id, '20261018060509' + '0'.repeat(30) + '21')
  assert.ok(id.startsWith('20261018060509'))
  assert.ok(id.length <= 50)
})

test('buildVtpassPayload: airtime maps the network to a VTpass serviceID and carries the catalog amount', () => {
  for (const [network, serviceID] of Object.entries(AIRTIME_SERVICE_IDS)) {
    const payload = buildVtpassPayload({ kind: 'airtime', network, phone: '+2348011112222', amountNaira: 500, requestId: 'req-1' })
    assert.deepEqual(payload, { request_id: 'req-1', serviceID, amount: 500, phone: '+2348011112222' })
  }
  assert.throws(() => buildVtpassPayload({ kind: 'airtime', network: 'safaricom', phone: '+2348011112222', amountNaira: 500, requestId: 'req-1' }), /No VTpass serviceID/)
})

test('buildVtpassPayload: data uses the catalog-pinned serviceID/variation code, not the network map', () => {
  const payload = buildVtpassPayload({
    kind: 'data', network: 'mtn', phone: '+2348011112222', amountNaira: 500,
    vtpassServiceId: 'mtn-data', vtpassVariationCode: 'test-variation', requestId: 'req-2',
  })
  assert.deepEqual(payload, {
    request_id: 'req-2', serviceID: 'mtn-data', billersCode: '+2348011112222',
    variation_code: 'test-variation', phone: '+2348011112222', amount: 500,
  })
})

test('interpretVtpassResponse: a clean "000"/delivered response is fulfilled', () => {
  assert.equal(interpretVtpassResponse({ code: '000', content: { transactions: { status: 'delivered' } } }), 'fulfilled')
  assert.equal(interpretVtpassResponse({ code: '000' }), 'fulfilled') // no nested status at all is still a plain success
})

test('interpretVtpassResponse: a non-000 code or an explicit failed status is failed', () => {
  assert.equal(interpretVtpassResponse({ code: '016', response_description: 'INSUFFICIENT BALANCE' }), 'failed')
  assert.equal(interpretVtpassResponse({ code: '000', content: { transactions: { status: 'failed' } } }), 'failed')
})

test('interpretVtpassResponse: "099" or an unresolved status is pending (needs a requery)', () => {
  assert.equal(interpretVtpassResponse({ code: '099', content: { transactions: { status: 'pending' } } }), 'pending')
  assert.equal(interpretVtpassResponse({}), 'pending')
})
