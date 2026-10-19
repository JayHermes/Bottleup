import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNigerianPhone, generateOtpCode, hashOtpCode, otpExpiry } from '../supabase/functions/_shared/phone.mjs'

test('normalizeNigerianPhone accepts the common input shapes and rejects junk', () => {
  for (const input of ['08031234567', '2348031234567', '+2348031234567', ' +234 803 123 4567 ', '+234-803-123-4567']) {
    assert.equal(normalizeNigerianPhone(input), '+2348031234567', input)
  }
  for (const bad of ['0803123456', '080312345678', '+1234567890123', 'not-a-phone', '', null, undefined, '0603123456', '8031234567']) {
    assert.equal(normalizeNigerianPhone(bad), null, String(bad))
  }
})

test('generateOtpCode produces a 6-digit string with no leading zero', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateOtpCode()
    assert.match(code, /^[1-9]\d{5}$/)
  }
})

test('hashOtpCode is deterministic for the same pepper and code, and differs across either', async () => {
  const a = await hashOtpCode('123456', 'pepper-a')
  const b = await hashOtpCode('123456', 'pepper-a')
  const c = await hashOtpCode('123456', 'pepper-b')
  const d = await hashOtpCode('654321', 'pepper-a')
  assert.equal(a, b)
  assert.notEqual(a, c)
  assert.notEqual(a, d)
  assert.match(a, /^[0-9a-f]{64}$/)
})

test('otpExpiry defaults to 10 minutes out', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  assert.equal(otpExpiry(now), '2026-01-01T00:10:00.000Z')
  assert.equal(otpExpiry(now, 5), '2026-01-01T00:05:00.000Z')
})
