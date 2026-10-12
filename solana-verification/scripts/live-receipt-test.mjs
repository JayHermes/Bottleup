// Temporary synthetic fixtures only. No reward RPCs or physical recycling claims.
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID, randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
const require = createRequire(new URL('../../bottle-up-mvp/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')
if (!process.env.BOTTLEUP_TEST_KEYS_FILE) throw new Error('Set BOTTLEUP_TEST_KEYS_FILE to a private Supabase CLI API-key JSON file.')
const keys = JSON.parse(await readFile(process.env.BOTTLEUP_TEST_KEYS_FILE, 'utf8'))
const serviceKey = keys.find(key => key.name === 'service_role')?.api_key
const anonKey = keys.find(key => key.name === 'anon')?.api_key
const url = 'https://sdubpqggmhadoqmjrgaf.supabase.co'
if (!serviceKey || !anonKey) throw new Error('Required keys are missing')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(url, serviceKey, options)
const fixtureId = randomUUID(), users = [], pickupIds = []
const results = { project: 'sdubpqggmhadoqmjrgaf', tested_at: new Date().toISOString(), fixture: 'synthetic; no physical collection or points awarded', checks: [] }
const manifest = process.env.BOTTLEUP_TEST_MANIFEST || '/private/tmp/bottleup-test-fixtures.json'
const output = process.env.BOTTLEUP_TEST_RESULTS || '/private/tmp/bottleup-live-test-results.json'
const saveManifest = () => writeFile(manifest, JSON.stringify({ users, pickupIds }), { mode: 0o600 })
const check = result => { if (result.error) throw new Error(result.error.message); return result.data }
async function account(role) {
  const password = randomBytes(32).toString('base64url')
  const email = `bottleup-devnet-test-${fixtureId}-${role}@example.invalid`
  const created = check(await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'DEVNET TEST — temporary fixture' } }))
  users.push(created.user.id); await saveManifest()
  if (role === 'admin') check(await service.from('profiles').update({ role: 'admin' }).eq('id', created.user.id))
  const client = createClient(url, anonKey, options)
  const signedIn = check(await client.auth.signInWithPassword({ email, password }))
  return { id: created.user.id, token: signedIn.session.access_token }
}
async function expect(name, token, pickupId, expected) {
  const response = await fetch(`${url}/functions/v1/record-recycling-receipt`, {
    method: 'POST', headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ pickup_id: pickupId }), signal: AbortSignal.timeout(90000),
  })
  const body = await response.json()
  assert.equal(response.status, expected, `${name}: ${JSON.stringify(body)}`)
  results.checks.push({ name, status: response.status })
  return body
}
try {
  const ordinary = await account('user'), admin = await account('admin')
  const pickup = check(await service.from('pickup_requests').insert({ user_id: ordinary.id, material_type: 'PET Bottles', estimated_weight_kg: 1, pickup_location: 'DEVNET TEST ONLY — no physical recycling', status: 'AVAILABLE' }).select().single())
  pickupIds.push(pickup.id); await saveManifest()
  await expect('unauthenticated rejected', null, pickup.id, 401)
  await expect('ordinary user rejected', ordinary.token, pickup.id, 403)
  await expect('unverified pickup rejected', admin.token, pickup.id, 409)
  // This test-only VERIFIED fixture does not issue points and is removed below.
  check(await service.from('pickup_requests').update({ status: 'VERIFIED', actual_weight_kg: 1, verified_at: new Date().toISOString(), verified_by: admin.id }).eq('id', pickup.id))
  if (process.argv.includes('--configuration-only')) {
    await expect('configured function reaches undeployed Devnet program', admin.token, pickup.id, 500)
    results.devnet_end_to_end = 'pending program deployment'
  } else {
    const first = await expect('verified pickup recorded', admin.token, pickup.id, 200)
    assert.equal(first.status, 'confirmed')
    const retry = await expect('retry recovers same receipt', admin.token, pickup.id, 200)
    assert.equal(retry.receipt_address, first.receipt_address)
    assert.equal(retry.tx_signature, first.tx_signature)
    assert.equal(retry.recovered, true)
    const saved = check(await service.from('pickup_requests').select('solana_receipt_status,solana_tx_signature,solana_receipt_address,onchain_tx_signature').eq('id', pickup.id).single())
    assert.equal(saved.solana_receipt_status, 'confirmed')
    assert.equal(saved.solana_tx_signature, first.tx_signature)
    assert.equal(saved.onchain_tx_signature, first.tx_signature)
    check(await service.from('pickup_requests').update({ solana_tx_signature: null, solana_receipt_status: 'failed' }).eq('id', pickup.id))
    const recovered = await expect('lost database signature recovered', admin.token, pickup.id, 200)
    assert.equal(recovered.tx_signature, first.tx_signature)
    assert.equal(recovered.receipt_address, first.receipt_address)
    Object.assign(results, { devnet_end_to_end: 'passed', receipt_address: first.receipt_address, transaction_signature: first.tx_signature, explorer: first.explorer_url })
  }
} finally {
  const errors = []
  for (const id of pickupIds) { const result = await service.from('pickup_requests').delete().eq('id', id); if (result.error) errors.push(result.error.message) }
  for (const id of users) {
    const demotion = await service.from('profiles').update({ role: 'user' }).eq('id', id)
    if (demotion.error) errors.push(demotion.error.message)
    const result = await service.auth.admin.deleteUser(id); if (result.error) errors.push(result.error.message)
  }
  results.fixtures_cleaned_up = errors.length === 0
  await writeFile(output, JSON.stringify(results, null, 2) + '\n', { mode: 0o600 })
  if (errors.length) throw new Error(`Fixture cleanup failed: ${errors.join('; ')}`)
}
console.log(JSON.stringify(results, null, 2))
