import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFile(new URL(name, import.meta.url), 'utf8')
test('deployed profile/catalog queries work without activating airtime or granting verification writes', async () => {
  const db = new PGlite()
  const user = '00000000-0000-0000-0000-000000000001'
  try {
    await db.exec(await sql('./points-baseline.sql'))
    await db.exec(`insert into auth.users(id) values('${user}'); insert into public.profiles(id,role,points) values('${user}','user',125);`)
    await db.exec(await sql('../supabase/migrations/20260927234455_points_ledger.sql'))
    const patch = await sql('../supabase/migrations/20261020132828_frontend_profile_compatibility.sql')
    await db.exec(`set request.jwt.claim.sub='${user}'; set role authenticated`)
    await assert.rejects(db.query(`select id,full_name,role,points,city,phone,phone_verified_at from public.profiles where id='${user}'`), /does not exist/)
    await db.exec('reset role')
    await db.exec(patch)
    await db.exec(patch)
    await db.exec('set role authenticated')
    const profile = (await db.query(`select id,full_name,role,points,city,phone,phone_verified_at from public.profiles where id='${user}'`)).rows[0]
    assert.equal(profile.points,125)
    assert.equal(profile.phone_verified_at,null)
    const rewards = (await db.query('select id,name,cost,note,kind,network from public.reward_catalog where active order by cost')).rows
    assert.ok(rewards.length > 0)
    assert.ok(rewards.every(r => r.kind === 'manual' && r.network === null))
    await assert.rejects(db.exec(`update public.profiles set phone_verified_at=now() where id='${user}'`), /permission denied/)
    await db.exec('reset role')
    // The subsequent feature migration must remain compatible with this repair.
    await db.exec('create role service_role bypassrls')
    await db.exec(await sql('../supabase/migrations/20261017000000_airtime_data_rewards.sql'))
    assert.equal((await db.query(`select points from public.profiles where id='${user}'`)).rows[0].points,125)
  } finally { await db.close() }
})
