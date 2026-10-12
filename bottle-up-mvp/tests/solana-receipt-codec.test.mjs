import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { receiptPayload, encodeReceipt, validateReceiptAccount, validateConfigAccount, discriminator } from '../supabase/functions/record-recycling-receipt/receipt-core.mjs'

test('receipt encoding and recovery validate exact Anchor account layout', async () => {
  const pickup = { id: '00000000-0000-4000-8000-000000000001', status: 'VERIFIED', actual_weight_kg: 5.5, verified_at: '2026-10-12T10:00:00Z', material_type: 'PET Bottles', photo_url: null }
  const payload = await receiptPayload(pickup)
  assert.deepEqual(Buffer.from(payload.pickupHash), createHash('sha256').update(pickup.id).digest())
  assert.equal(payload.weightGrams, 5500n)
  const encoded = await encodeReceipt(payload)
  assert.equal(encoded.length, 90)
  assert.deepEqual(Buffer.from(encoded.slice(0, 8)), createHash('sha256').update('global:record_receipt').digest().subarray(0, 8))
  assert.equal(new DataView(encoded.buffer).getBigUint64(40, true), 5500n)
  const authority = new Uint8Array(32).fill(7)
  const receipt = new Uint8Array(123)
  receipt.set(encoded)
  receipt.set(await discriminator('account:RecyclingReceipt'))
  receipt.set(authority, 90)
  await validateReceiptAccount(receipt, payload, authority)
  for (const offset of [0, 8, 40, 48, 50, 82, 90]) {
    const altered = receipt.slice(); altered[offset] ^= 1
    await assert.rejects(validateReceiptAccount(altered, payload, authority), /does not match/)
  }
  await assert.rejects(validateReceiptAccount(receipt.slice(0, 100), payload, authority))
  const config = new Uint8Array(41)
  config.set(await discriminator('account:ReceiptConfig')); config.set(authority, 8)
  await validateConfigAccount(config, authority)
  await assert.rejects(validateConfigAccount(config, new Uint8Array(32)))
  for (const changes of [{ status: 'COLLECTED' }, { actual_weight_kg: 0 }, { actual_weight_kg: 'NaN' }, { actual_weight_kg: 30000 }, { verified_at: 'bad' }]) await assert.rejects(receiptPayload({ ...pickup, ...changes }))
})
