-- Apply to the existing project without deleting uploaded objects.
update storage.buckets set public = false, file_size_limit = 8388608,
 allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'pickup-photos';
drop policy if exists "anyone can view pickup photos" on storage.objects;
drop policy if exists "users upload own pickup photos" on storage.objects;
drop policy if exists "pickup_photo_insert" on storage.objects;
drop policy if exists "pickup_photo_read" on storage.objects;
drop policy if exists "pickup_photo_delete" on storage.objects;
create policy pickup_photo_insert on storage.objects for insert to authenticated
with check (bucket_id='pickup-photos' and (storage.foldername(name))[1]=(select auth.uid()::text));
create policy pickup_photo_read on storage.objects for select to authenticated
using (bucket_id='pickup-photos' and (
 (storage.foldername(name))[1]=(select auth.uid()::text)
 or exists (select 1 from public.pickup_requests p where p.photo_url=storage.objects.name
   and (p.collector_id=(select auth.uid()) or exists
     (select 1 from public.profiles a where a.id=(select auth.uid()) and a.role='admin')))
));
create policy pickup_photo_delete on storage.objects for delete to authenticated
using (bucket_id='pickup-photos' and (storage.foldername(name))[1]=(select auth.uid()::text)
 and not exists(select 1 from public.pickup_requests p where p.photo_url=storage.objects.name));
