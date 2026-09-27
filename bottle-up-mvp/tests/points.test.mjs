import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const migration = await readFile(new URL('../supabase/migrations/20260927234455_points_ledger.sql', import.meta.url),'utf8')
test('points: real schema upgrade, pickup lifecycle, spending, retries, refunds and RLS', async t => {
 const db=new PGlite()
 const as=async n=>db.exec(`reset role; set request.jwt.claim.sub='${uid(n)}'; set role authenticated;`)
 const balance=async()=>Number((await db.query('select points from profiles where id=auth.uid()')).rows[0].points)
 try {
 await db.exec(await readFile(new URL('./points-baseline.sql',import.meta.url),'utf8'))
 await db.exec(`insert into auth.users(id) values('${uid(1)}'),('${uid(2)}'),('${uid(3)}'),('${uid(4)}');
 insert into profiles(id,role,points) values('${uid(1)}','user',25),('${uid(2)}','collector',0),('${uid(3)}','admin',0),('${uid(4)}','user',0);`)
 await db.exec(`begin; ${migration} commit;`)
 await as(1)
 assert.equal(await balance(),25)
 assert.equal((await db.query('select points from points_ledger')).rows[0].points,25)
 await t.test('no direct balance, role, ledger, price or verification tampering',async()=>{
  await assert.rejects(db.exec('update profiles set points=90000'))
  await assert.rejects(db.exec("update profiles set role='admin'"))
  await assert.rejects(db.exec("insert into points_ledger(user_id,kind,points) values(auth.uid(),'opening',500)"))
  await assert.rejects(db.exec("update reward_catalog set cost=1"))
  await assert.rejects(db.exec(`insert into pickup_requests(user_id,material_type,estimated_weight_kg,pickup_location,status) values(auth.uid(),'PET',5,'Test','VERIFIED')`))
  await assert.rejects(db.exec(`select bottleup_private.post_points(auth.uid(),'opening',500)`))
  await assert.rejects(db.exec(`select public.redeem_reward('Free Pickup',1)`))
 })
 let pickup
 await t.test('only approved assigned collector can collect; admin verifies once',async()=>{
  pickup=(await db.query("insert into pickup_requests(user_id,material_type,estimated_weight_kg,pickup_location) values(auth.uid(),'PET',10,'Test address') returning id")).rows[0].id
  await assert.rejects(db.exec(`select accept_pickup('${pickup}')`))
  await assert.rejects(db.exec(`select verify_pickup('${pickup}')`))
  await as(3); await assert.rejects(db.exec(`select verify_pickup('${pickup}')`))
  await as(2); await db.exec(`select accept_pickup('${pickup}'); select accept_pickup('${pickup}');`)
  await assert.rejects(db.exec(`select collect_pickup('${pickup}',10)`))
  await db.exec(`select start_on_the_way('${pickup}')`)
  for(const bad of ['0','-1',"'NaN'",'20001','0.001','null']) await assert.rejects(db.exec(`select collect_pickup('${pickup}',${bad})`))
  await as(4);await assert.rejects(db.exec(`select collect_pickup('${pickup}',10)`))
  await as(2);await db.exec(`select collect_pickup('${pickup}',10);select collect_pickup('${pickup}',10)`)
  await assert.rejects(db.exec(`select collect_pickup('${pickup}',11)`))
  await assert.rejects(db.exec(`select verify_pickup('${pickup}')`))
  await as(3);await db.exec(`select verify_pickup('${pickup}');select verify_pickup('${pickup}')`)
  await assert.rejects(db.exec(`update pickup_requests set status='COLLECTED' where id='${pickup}'`))
  await as(1);assert.equal(await balance(),1025)
  assert.equal((await db.query("select * from points_ledger where kind='pickup'")).rows.length,1)
 })
 let redemption
 await t.test('server price, debit, request-key replay, mismatch and insufficient funds',async()=>{
  redemption=(await db.query(`select (request_reward('airtime-1000','${uid(10)}')).id`)).rows[0].id
  assert.equal(await balance(),525)
  assert.equal((await db.query(`select (request_reward('airtime-1000','${uid(10)}')).id`)).rows[0].id,redemption)
  assert.equal(await balance(),525)
  await assert.rejects(db.exec(`select request_reward('free-pickup','${uid(10)}')`))
  await assert.rejects(db.exec(`select request_reward('voucher-2000','${uid(11)}')`))
  await assert.rejects(db.exec(`select request_reward('made-up','${uid(11)}')`))
  assert.equal(await balance(),525)
  assert.equal((await db.query('select * from reward_redemptions')).rows.length,1)
 })
 await t.test('admin-only decisions; refund once; terminal decision cannot change',async()=>{
  await assert.rejects(db.exec(`select decide_redemption('${redemption}','rejected')`))
  await as(3);await db.exec(`select decide_redemption('${redemption}','rejected');select decide_redemption('${redemption}','rejected')`)
  await assert.rejects(db.exec(`select decide_redemption('${redemption}','fulfilled')`))
  await as(1);assert.equal(await balance(),1025)
  const r=(await db.query(`select (request_reward('voucher-2000','${uid(12)}')).id`)).rows[0].id
  assert.equal(await balance(),25)
  await as(3);await db.exec(`select decide_redemption('${r}','fulfilled');select decide_redemption('${r}','fulfilled')`)
  await assert.rejects(db.exec(`select decide_redemption('${r}','rejected')`))
 })
 await t.test('cross-user isolation, anonymous denial, history immutability, reconciliation',async()=>{
  await as(4); assert.equal((await db.query('select * from points_ledger')).rows.length,0)
  assert.equal((await db.query('select * from reward_redemptions')).rows.length,0)
  assert.equal((await db.query('select * from profiles')).rows.length,1)
  await db.exec('set role anon')
  await assert.rejects(db.exec('select * from points_ledger'))
  await assert.rejects(db.exec(`select request_reward('free-pickup','${uid(15)}')`))
  await db.exec('reset role')
  await assert.rejects(db.exec('update points_ledger set points=1'))
  const mismatch=await db.query('select p.id from profiles p left join points_ledger l on l.user_id=p.id group by p.id,p.points having p.points<>coalesce(sum(l.points),0)')
  assert.equal(mismatch.rows.length,0)
 })
 }finally{await db.close()}
})

test('fresh project bootstrap installs the same points commands and signup flow', async () => {
 const db = new PGlite()
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
   create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(bucket_id text,name text);
   create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;`)
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'))
  await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${uid(90)}','{"full_name":"Fresh test","wants_collector":true}')`)
  assert.equal((await db.query(`select role from profiles where id='${uid(90)}'`)).rows[0].role,'user')
  assert.equal((await db.query('select status from collector_applications')).rows[0].status,'pending')
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${uid(90)}';`)
  await db.exec("select update_own_full_name('Updated name')")
  assert.equal((await db.query('select name from reward_catalog')).rows.length,3)
  await assert.rejects(db.exec(`select request_reward('free-pickup','${uid(91)}')`))
 } finally { await db.close() }
})
