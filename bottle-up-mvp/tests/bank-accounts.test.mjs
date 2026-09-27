// Run with node --test; install @electric-sql/pglite separately or supply PGLITE_MODULE.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
test('bank details: ownership isolation, validation, leading zeroes and deletion', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');`)
    const sql = await readFile(new URL('../supabase/dashboard-settings.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';`)
    await db.exec(`insert into public.bank_accounts values (auth.uid(), 'Test Bank', 'Test User', '0123456789')`)
    assert.equal((await db.query('select account_number from public.bank_accounts')).rows[0].account_number, '0123456789')
    await assert.rejects(db.exec(`update public.bank_accounts set account_number = '123'`))
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';`)
    assert.equal((await db.query('select * from public.bank_accounts')).rows.length, 0)
    await assert.rejects(db.exec(`insert into public.bank_accounts values ('00000000-0000-0000-0000-000000000001', 'Other Bank', 'Other User', '1234567890')`))
    await db.exec(`update public.bank_accounts set bank_name = 'Tampered'; delete from public.bank_accounts;`)
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';`)
    assert.equal((await db.query('select bank_name from public.bank_accounts')).rows[0].bank_name, 'Test Bank')
    await db.exec(`update public.bank_accounts set bank_name = 'Updated Bank';`)
    assert.equal((await db.query('select bank_name from public.bank_accounts')).rows[0].bank_name, 'Updated Bank')
    await db.exec('set role anon')
    await assert.rejects(db.exec('select * from public.bank_accounts'))
    await db.exec(`set role authenticated; delete from public.bank_accounts;`)
    assert.equal((await db.query('select * from public.bank_accounts')).rows.length, 0)
  } finally { await db.close() }
})
