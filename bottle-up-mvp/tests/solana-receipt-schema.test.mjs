import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('receipt migration preserves pickups and denies client proof tampering', async () => {
  const db = new PGlite()
  try {
    await db.exec(await readFile(new URL('./points-baseline.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260927234455_points_ledger.sql', import.meta.url), 'utf8'))
    const migration = await readFile(new URL('../../solana-verification/migrations/202610120001_add_solana_receipt_fields.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const user = '00000000-0000-0000-0000-000000000001'
    await db.exec(`insert into auth.users(id) values('${user}'); insert into profiles(id,role) values('${user}','user');`)
    await db.exec(`set request.jwt.claim.sub='${user}'; set role authenticated;`)
    const pickup = (await db.query("insert into pickup_requests(user_id,material_type,estimated_weight_kg,pickup_location) values(auth.uid(),'PET Bottles',1,'TEST ONLY') returning id,solana_receipt_status")).rows[0]
    assert.equal(pickup.solana_receipt_status, 'not_requested')
    await assert.rejects(db.exec(`update pickup_requests set solana_receipt_status='confirmed' where id='${pickup.id}'`))
    await assert.rejects(db.exec("insert into pickup_requests(user_id,material_type,estimated_weight_kg,pickup_location,solana_receipt_address) values(auth.uid(),'PET Bottles',1,'TEST ONLY','fake')"))
    await db.exec('reset role')
    await assert.rejects(db.exec(`update pickup_requests set solana_receipt_status='invalid' where id='${pickup.id}'`))
    await db.exec(`update pickup_requests set solana_receipt_status='confirmed',solana_receipt_address='test-receipt' where id='${pickup.id}'`)
    await db.exec('set role authenticated')
    assert.equal((await db.query(`select solana_receipt_address from pickup_requests where id='${pickup.id}'`)).rows[0].solana_receipt_address, 'test-receipt')
  } finally { await db.close() }
})
