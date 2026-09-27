import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
test('pickup photos: private bucket, owner uploads, assigned access, orphan-only deletion', async () => {
 const db = new PGlite()
 const owner='00000000-0000-0000-0000-000000000001', collector='00000000-0000-0000-0000-000000000002', other='00000000-0000-0000-0000-000000000003', admin='00000000-0000-0000-0000-000000000004'
 try {
 await db.exec(`create role authenticated; create schema auth; create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 create table storage.buckets(id text primary key, public boolean, file_size_limit bigint,allowed_mime_types text[]);
 insert into storage.buckets values ('pickup-photos',true,null,null);
 create table storage.objects(bucket_id text,name text);
 alter table storage.objects enable row level security;
 create table public.profiles(id uuid,role text);
 create table public.pickup_requests(photo_url text,collector_id uuid);
 grant usage on schema auth,storage to authenticated;
 grant select,insert,delete on storage.objects to authenticated;
 grant select on public.profiles,public.pickup_requests to authenticated;
 insert into public.profiles values ('${owner}','user'),('${collector}','collector'),('${other}','user'),('${admin}','admin');
 insert into public.pickup_requests values ('${owner}/attached.jpg','${collector}');`)
 await db.exec(await readFile(new URL('../supabase/pickup-photo-storage.sql',import.meta.url),'utf8'))
 assert.equal((await db.query('select public from storage.buckets')).rows[0].public,false)
 await db.exec(`set role authenticated; set request.jwt.claim.sub='${owner}'; insert into storage.objects values ('pickup-photos','${owner}/attached.jpg'),('pickup-photos','${owner}/orphan.jpg');`)
 await assert.rejects(db.exec(`insert into storage.objects values ('pickup-photos','${other}/fake.jpg')`))
 await db.exec('delete from storage.objects')
 assert.equal((await db.query('select * from storage.objects')).rows.length,1)
 await db.exec(`set request.jwt.claim.sub='${collector}'`)
 assert.equal((await db.query('select * from storage.objects')).rows.length,1)
 await db.exec('delete from storage.objects')
 assert.equal((await db.query('select * from storage.objects')).rows.length,1)
 await db.exec(`set request.jwt.claim.sub='${other}'`)
 assert.equal((await db.query('select * from storage.objects')).rows.length,0)
 await db.exec(`set request.jwt.claim.sub='${admin}'`)
 assert.equal((await db.query('select * from storage.objects')).rows.length,1)
 } finally { await db.close() }
})
