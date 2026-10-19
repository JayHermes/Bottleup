import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const pointsMigration = await readFile(new URL('../supabase/migrations/20260927234455_points_ledger.sql', import.meta.url), 'utf8')
const disambiguateMigration = await readFile(new URL('../supabase/migrations/20261012150615_disambiguate_post_points.sql', import.meta.url), 'utf8')
const migration = await readFile(new URL('../supabase/migrations/20261017000000_airtime_data_rewards.sql', import.meta.url), 'utf8')

test('airtime/data rewards: phone verification gate, automatic fulfilment, service-role-only results, and RLS', async t => {
  const db = new PGlite()
  const as = async n => db.exec(`reset role; set request.jwt.claim.sub='${uid(n)}'; set role authenticated;`)
  const asService = async () => db.exec(`reset role; set role service_role;`)
  const balance = async () => Number((await db.query('select points from profiles where id=auth.uid()')).rows[0].points)
  try {
    await db.exec(await readFile(new URL('./points-baseline.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into auth.users(id) values('${uid(1)}'),('${uid(2)}');
      insert into profiles(id,role,points) values('${uid(1)}','user',2000),('${uid(2)}','user',2000);`)
    await db.exec(`begin; ${pointsMigration} commit;`)
    await db.exec(`begin; ${disambiguateMigration} commit;`)
    // service_role mirrors the Postgres role Supabase maps its service-role API
    // key to: it bypasses RLS and keeps whatever table privileges it had before
    // the earlier migrations revoked them from public/anon/authenticated.
    await db.exec(`create role service_role bypassrls;`)
    await db.exec(migration)
    await db.exec(migration) // replay must be a no-op, not an error

    await t.test('phone_otp_requests is not reachable by anon/authenticated', async () => {
      await as(1)
      await assert.rejects(db.exec(`select * from phone_otp_requests`))
      await assert.rejects(db.exec(`insert into phone_otp_requests(user_id,phone,code_hash,expires_at) values(auth.uid(),'+2348000000000','x',now())`))
    })

    await t.test('redemption is refused until the phone is verified', async () => {
      await as(1)
      await assert.rejects(db.exec(`select request_airtime_reward('free-pickup','${uid(20)}','mtn')`), /Verify your phone/)
      assert.equal(await balance(), 2000)
    })

    // Only an edge function using the service-role key can set these — direct
    // SQL (as the unrestricted bootstrap role) stands in for that, since
    // PGlite can't run the Deno function.
    await db.exec(`reset role;
      update profiles set phone='+2348011112222', phone_verified_at=now() where id='${uid(1)}';
      update profiles set phone='+2348033334444', phone_verified_at=now() where id='${uid(2)}';`)

    let airtimeRedemption
    await t.test('airtime redemption requires a network, debits once, replays idempotently', async () => {
      await as(1)
      await assert.rejects(db.exec(`select request_airtime_reward('free-pickup','${uid(21)}',null)`), /Choose the network/)
      await assert.rejects(db.exec(`select request_airtime_reward('free-pickup','${uid(21)}','safaricom')`))
      const row = (await db.query(`select (request_airtime_reward('free-pickup','${uid(21)}','mtn')).*`)).rows[0]
      airtimeRedemption = row.id
      assert.equal(row.status, 'processing')
      assert.equal(row.kind, 'airtime')
      assert.equal(row.phone, '+2348011112222')
      assert.equal(row.network, 'mtn')
      assert.equal(await balance(), 1700) // 2000 - 300 (free-pickup's cost)
      // Same request key replays the same row without debiting again.
      const replay = (await db.query(`select (request_airtime_reward('free-pickup','${uid(21)}','mtn')).id as id`)).rows[0].id
      assert.equal(replay, airtimeRedemption)
      assert.equal(await balance(), 1700)
    })

    await t.test('a data bundle pins its own network regardless of what the client sends', async () => {
      await db.exec(`reset role;
        insert into reward_catalog(id,name,cost,note,kind,network,vtpass_service_id,vtpass_variation_code,amount_naira)
        values('data-mtn-test','MTN 1GB (test)',400,'Mobile data bundle','data','mtn','mtn-data','test-variation',500)`)
      await as(2)
      const row = (await db.query(`select (request_airtime_reward('data-mtn-test','${uid(22)}','glo')).*`)).rows[0]
      assert.equal(row.kind, 'data')
      assert.equal(row.network, 'mtn') // catalog's network wins, not the client-supplied 'glo'
      assert.equal(await balance(), 1600)
    })

    await t.test('only service_role can record a result; authenticated is refused even for its own redemption', async () => {
      await as(1)
      await assert.rejects(db.exec(`select process_airtime_result('${airtimeRedemption}','fulfilled','vtpass','req-1','{}')`))
      await asService()
      await db.exec(`select process_airtime_result('${airtimeRedemption}','fulfilled','vtpass','req-1','{"ok":true}')`)
      await db.exec(`reset role;`) // service_role has no raw table grants either — only the one RPC — so read back unrestricted
      const row = (await db.query(`select status,provider,provider_request_id from reward_redemptions where id='${airtimeRedemption}'`)).rows[0]
      assert.equal(row.status, 'fulfilled')
      assert.equal(row.provider, 'vtpass')
      assert.equal(row.provider_request_id, 'req-1')
      await assert.rejects(db.exec(`select process_airtime_result('${airtimeRedemption}','fulfilled','vtpass','req-1','{}')`), /already has a result/)
    })

    await t.test('a failed top-up refunds the points it debited', async () => {
      await as(1)
      const row = (await db.query(`select (request_airtime_reward('airtime-1000','${uid(23)}','mtn')).*`)).rows[0]
      assert.equal(await balance(), 1200) // 1700 - 500
      await asService()
      await db.exec(`select process_airtime_result('${row.id}','failed','vtpass',null,'{"error":"insufficient balance"}')`)
      await as(1)
      assert.equal(await balance(), 1700) // refunded
      assert.equal((await db.query(`select status from reward_redemptions where id='${row.id}'`)).rows[0].status, 'failed')
    })

    await t.test('manual rewards (e.g. the voucher) are untouched', async () => {
      await as(2)
      const row = (await db.query(`select (request_reward('voucher-2000','${uid(24)}')).*`)).rows[0]
      assert.equal(row.kind, 'manual')
      assert.equal(row.phone, null)
    })
  } finally {
    await db.close()
  }
})
