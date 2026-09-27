// Requires the schema fixture + migration loaded into a disposable Postgres 17
// container named bottleup-points-test. Never points at production.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
const uid = n => `10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
function sql(query) {
 return new Promise((resolve,reject)=>{
  const p=spawn('docker',['exec','-i','bottleup-points-test','psql','-U','postgres','-v','ON_ERROR_STOP=1','-At'])
  let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b)
  p.on('error',reject);p.on('close',code=>code ? reject(new Error(err)) : resolve(out.trim()));p.stdin.end(query)
 })
}
const userSql=q=>`begin; set local role authenticated; set local request.jwt.claim.sub='${uid(1)}'; ${q}; commit;`
test('Postgres simultaneous spends and retries cannot double debit or overspend',{skip:!process.env.POINTS_CONCURRENCY},async()=>{
 await sql(`insert into auth.users(id) values('${uid(1)}'); insert into profiles(id,points) values('${uid(1)}',0); select bottleup_private.post_points('${uid(1)}','opening',600);`)
 const same=await Promise.all(Array.from({length:8},()=>sql(userSql(`select (request_reward('free-pickup','${uid(10)}')).id`))))
 assert.equal(new Set(same).size,1)
 assert.equal(await sql(`select points from profiles where id='${uid(1)}'`),'300')
 const competing=await Promise.allSettled(Array.from({length:8},(_,i)=>sql(userSql(`select request_reward('free-pickup','${uid(20+i)}')`))))
 assert.equal(competing.filter(x=>x.status==='fulfilled').length,1)
 assert.equal(await sql(`select points from profiles where id='${uid(1)}'`),'0')
 assert.equal(await sql(`select count(*) from reward_redemptions where user_id='${uid(1)}'`),'2')
 assert.equal(await sql(`select sum(points) from points_ledger where user_id='${uid(1)}'`),'0')
})
