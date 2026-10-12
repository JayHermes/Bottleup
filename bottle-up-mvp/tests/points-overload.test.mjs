import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
test('legacy helper defaults cannot block verification, redemption or refund', async () => {
  const db = new PGlite()
  const fix = await readFile(new URL('../supabase/migrations/20261012150615_disambiguate_post_points.sql', import.meta.url), 'utf8')
  try {
    await db.exec(await readFile(new URL('./points-baseline.sql', import.meta.url), 'utf8'))
    await db.exec(await readFile(new URL('../supabase/migrations/20260927234455_points_ledger.sql', import.meta.url), 'utf8'))
    await db.exec(fix) // Fresh projects have no legacy overload.
    await db.exec(`create function bottleup_private.post_points(p_user uuid,p_kind text,p_points integer,p_pickup uuid default null,p_redemption uuid default null,p_weight numeric default null,p_rate integer default null) returns void language plpgsql security definer set search_path='' as $$begin raise exception 'Legacy overload selected'; end $$;
      revoke all on function bottleup_private.post_points(uuid,text,integer,uuid,uuid,numeric,integer) from public,anon,authenticated;
      insert into auth.users(id) values('${uid(1)}'),('${uid(2)}');
      insert into public.profiles(id,role) values('${uid(1)}','user'),('${uid(2)}','admin');`)
    const pickup = (await db.query(`insert into public.pickup_requests(user_id,material_type,estimated_weight_kg,actual_weight_kg,pickup_location,status) values('${uid(1)}','PET',10,10,'Overload test','COLLECTED') returning id`)).rows[0].id
    await db.exec(`set request.jwt.claim.sub='${uid(2)}'; set role authenticated`)
    await assert.rejects(db.exec(`select public.verify_pickup('${pickup}')`), /not unique/)
    await db.exec('reset role')
    assert.equal((await db.query(`select points from public.profiles where id='${uid(1)}'`)).rows[0].points, 0)
    await db.exec(fix)
    await db.exec(fix) // Safe to replay.
    const legacy = (await db.query(`select pronargdefaults from pg_proc where oid='bottleup_private.post_points_with_rate(uuid,text,integer,uuid,uuid,numeric,integer)'::regprocedure`)).rows[0]
    assert.equal(legacy.pronargdefaults, 4)
    await db.exec(`set role authenticated; select public.verify_pickup('${pickup}'); select public.verify_pickup('${pickup}'); reset role`)
    assert.equal((await db.query(`select points from public.profiles where id='${uid(1)}'`)).rows[0].points, 1000)
    assert.equal((await db.query(`select count(*)::int as n from public.points_ledger where pickup_id='${pickup}'`)).rows[0].n, 1)
    await db.exec(`set request.jwt.claim.sub='${uid(1)}'; set role authenticated`)
    const redemption = (await db.query(`select (public.request_reward('airtime-1000','${uid(3)}')).id`)).rows[0].id
    await db.exec(`reset role; set request.jwt.claim.sub='${uid(2)}'; set role authenticated;
      select public.decide_redemption('${redemption}','rejected'); select public.decide_redemption('${redemption}','rejected'); reset role`)
    assert.equal((await db.query(`select points from public.profiles where id='${uid(1)}'`)).rows[0].points, 1000)
    await db.exec('set role authenticated')
    await assert.rejects(db.exec(`select bottleup_private.post_points('${uid(1)}','opening',100)`), /permission denied/)
    await assert.rejects(db.exec(`select bottleup_private.post_points_with_rate('${uid(1)}','opening',100,null,null,null,null)`), /permission denied/)
  } finally { await db.close() }
})
