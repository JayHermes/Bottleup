-- Upgrade the existing BottleUP database. Apply once, in one transaction.
-- The ledger is authoritative from cutover; opening entries preserve balances.
lock table public.profiles, public.pickup_requests, public.reward_redemptions in share row exclusive mode;
create schema if not exists bottleup_private;
revoke all on schema bottleup_private from public, anon;
grant usage on schema bottleup_private to authenticated;

create table public.reward_catalog (
  id text primary key, name text not null unique, cost integer not null check(cost > 0),
  note text not null, active boolean not null default true
);
insert into public.reward_catalog(id,name,cost,note) values
 ('free-pickup','Free Pickup',300,'One scheduled pickup'),
 ('airtime-1000','₦1,000 Airtime',500,'Mobile airtime reward'),
 ('voucher-2000','₦2,000 Shopping Voucher',1000,'Partner voucher');
alter table public.reward_catalog enable row level security;
create policy catalog_read on public.reward_catalog for select to authenticated using(active);
revoke all on public.reward_catalog from public, anon, authenticated;
grant select on public.reward_catalog to authenticated;

alter table public.reward_redemptions add column request_key uuid;
alter table public.reward_redemptions add column reward_id text references public.reward_catalog(id);
alter table public.reward_redemptions add constraint redemption_request_unique unique(user_id,request_key);
alter table public.profiles add constraint points_nonnegative check(points >= 0);

create table public.points_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('opening','pickup','redemption','refund')),
 points integer not null check(points <> 0),
 pickup_id uuid references public.pickup_requests(id),
 redemption_id uuid references public.reward_redemptions(id),
 weight_kg numeric(10,2), rate integer,
 created_at timestamptz not null default now(),
 constraint ledger_source_shape check(
   (kind='opening' and points>0 and pickup_id is null and redemption_id is null) or
   (kind='pickup' and points>0 and pickup_id is not null and redemption_id is null and weight_kg is not null and weight_kg>0 and rate is not null and rate=100) or
   (kind='redemption' and points<0 and redemption_id is not null and pickup_id is null) or
   (kind='refund' and points>0 and redemption_id is not null and pickup_id is null)),
 unique(pickup_id), unique(redemption_id,kind)
);
create unique index ledger_one_opening on public.points_ledger(user_id) where kind='opening';
create index ledger_user_history on public.points_ledger(user_id,created_at desc,id);
alter table public.points_ledger enable row level security;
create policy ledger_owner_read on public.points_ledger for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.points_ledger from public,anon,authenticated;
grant select on public.points_ledger to authenticated;
insert into public.points_ledger(user_id,kind,points) select id,'opening',points from public.profiles where points>0;

-- Replace legacy money-changing triggers. Direct writes are revoked below.
drop trigger if exists trg_protect_profile_fields on public.profiles;
drop trigger if exists trg_award_points on public.pickup_requests;
drop trigger if exists trg_redemption_decision on public.reward_redemptions;
drop trigger if exists trg_validate_pickup_transition on public.pickup_requests;

create function bottleup_private.immutable_ledger() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Points history is append-only'; end $$;
create trigger ledger_immutable before update or delete on public.points_ledger for each row execute function bottleup_private.immutable_ledger();

-- This internal helper is not granted to API roles. Every entry and its cached
-- balance change commit together. The guarded UPDATE serializes concurrent spends.
create function bottleup_private.post_points(p_user uuid,p_kind text,p_points integer,p_pickup uuid default null,p_redemption uuid default null,p_weight numeric default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.profiles set points=points+p_points where id=p_user and points::bigint+p_points between 0 and 2147483647;
 if not found then raise exception 'Not enough points or account unavailable'; end if;
 insert into public.points_ledger(user_id,kind,points,pickup_id,redemption_id,weight_kg,rate)
 values(p_user,p_kind,p_points,p_pickup,p_redemption,p_weight,case when p_kind='pickup' then 100 end);
end $$;

create function bottleup_private.verify_pickup(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.pickup_requests; earned integer;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Only admins can verify pickups'; end if;
 select * into r from public.pickup_requests where id=p_id for update;
 if not found then raise exception 'Pickup not found'; end if;
 if r.status='VERIFIED' then return; end if;
 if r.status<>'COLLECTED' then raise exception 'Collect the pickup before verification'; end if;
 if r.actual_weight_kg is null or not (r.actual_weight_kg between 0.01 and 20000) then raise exception 'A positive verified weight is required'; end if;
 earned:=round(r.actual_weight_kg*100)::integer;
 perform bottleup_private.post_points(r.user_id,'pickup',earned,r.id,null,r.actual_weight_kg);
 insert into public.reward_transactions(user_id,pickup_request_id,points,status) values(r.user_id,r.id,earned,'issued');
 update public.pickup_requests set status='VERIFIED',verified_at=now(),verified_by=auth.uid() where id=r.id;
end $$;

create function bottleup_private.request_reward(p_reward_id text,p_request_key uuid) returns public.reward_redemptions language plpgsql security definer set search_path='' as $$
declare r public.reward_redemptions; reward public.reward_catalog;
begin
 if auth.uid() is null or p_request_key is null then raise exception 'Sign in and supply a request key'; end if;
 -- Lock only the balance row; NO KEY UPDATE avoids conflicting with FK readers.
 perform 1 from public.profiles where id=auth.uid() for no key update;
 if not found then raise exception 'Account unavailable'; end if;
 select * into r from public.reward_redemptions where user_id=auth.uid() and request_key=p_request_key;
 if found then
   if r.reward_id is distinct from p_reward_id then raise exception 'Request key already used for another reward'; end if;
   return r;
 end if;
 select * into reward from public.reward_catalog where id=p_reward_id and active for share;
 if not found then raise exception 'This reward is unavailable'; end if;
 insert into public.reward_redemptions(user_id,reward_name,cost,request_key,reward_id)
 values(auth.uid(),reward.name,reward.cost,p_request_key,reward.id) returning * into r;
 perform bottleup_private.post_points(auth.uid(),'redemption',-reward.cost,null,r.id);
 insert into public.notifications(user_id,message) values(auth.uid(),'Your '||reward.name||' reward request is awaiting fulfilment.');
 return r;
end $$;

create function bottleup_private.decide_redemption(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare r public.reward_redemptions;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Only admins can decide rewards'; end if;
 if p_status is null or p_status not in ('fulfilled','rejected') then raise exception 'Invalid reward decision'; end if;
 select * into r from public.reward_redemptions where id=p_id for update;
 if not found then raise exception 'Reward request not found'; end if;
 if r.status=p_status then return; end if;
 if r.status<>'pending' then raise exception 'This reward was already decided'; end if;
 if p_status='rejected' then perform bottleup_private.post_points(r.user_id,'refund',r.cost,null,r.id); end if;
 update public.reward_redemptions set status=p_status,fulfilled_at=now(),fulfilled_by=auth.uid() where id=r.id;
end $$;

create function bottleup_private.accept_pickup(p_id uuid,p_lat double precision default null,p_lng double precision default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_collector() then raise exception 'An approved collector account is required'; end if;
 update public.pickup_requests set status='ACCEPTED',collector_id=auth.uid(),collector_latitude=p_lat,collector_longitude=p_lng where id=p_id and status='AVAILABLE';
 if not found and not exists(select 1 from public.pickup_requests where id=p_id and collector_id=auth.uid() and status='ACCEPTED') then raise exception 'Pickup no longer available'; end if;
end $$;
create function bottleup_private.start_on_the_way(p_id uuid,p_lat double precision default null,p_lng double precision default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_collector() then raise exception 'An approved collector account is required'; end if;
 update public.pickup_requests set status='ON_THE_WAY',on_the_way_at=now(),collector_latitude=p_lat,collector_longitude=p_lng where id=p_id and collector_id=auth.uid() and status='ACCEPTED';
 if not found and not exists(select 1 from public.pickup_requests where id=p_id and collector_id=auth.uid() and status='ON_THE_WAY') then raise exception 'Only the assigned collector can start an accepted pickup'; end if;
end $$;
create function bottleup_private.collect_pickup(p_id uuid,p_weight numeric) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_collector() then raise exception 'An approved collector account is required'; end if;
 if p_weight is null or not (p_weight between 0.01 and 20000) or p_weight<>round(p_weight,2) then raise exception 'Enter a weight from 0.01 to 20,000 kg, with at most two decimals'; end if;
 update public.pickup_requests set status='COLLECTED',actual_weight_kg=p_weight,collected_at=now() where id=p_id and collector_id=auth.uid() and status='ON_THE_WAY';
 if not found and not exists(select 1 from public.pickup_requests where id=p_id and collector_id=auth.uid() and status='COLLECTED' and actual_weight_kg=p_weight) then raise exception 'Only the assigned collector can record this collection'; end if;
end $$;
create function bottleup_private.decide_collector_application(p_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Only admins can decide applications'; end if;
 if p_status is null or p_status not in ('approved','rejected') then raise exception 'Invalid application decision'; end if;
 update public.collector_applications set status=p_status where id=p_id and status='pending';
 if not found and not exists(select 1 from public.collector_applications where id=p_id and status=p_status) then raise exception 'Application already decided or not found'; end if;
end $$;
create function bottleup_private.update_own_full_name(p_new_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_new_name is null or length(trim(p_new_name)) not between 1 and 120 then raise exception 'Enter a name between 1 and 120 characters'; end if;
 update public.profiles set full_name=trim(p_new_name) where id=auth.uid();
 if not found then raise exception 'Account unavailable'; end if;
end $$;

-- Public functions are thin invoker endpoints; privileged implementation stays
-- outside the API's exposed schemas. All commands authenticate/authorize again.
create function public.verify_pickup(p_id uuid) returns void language sql security invoker set search_path='' as $$select bottleup_private.verify_pickup(p_id)$$;
create function public.request_reward(p_reward_id text,p_request_key uuid) returns public.reward_redemptions language sql security invoker set search_path='' as $$select bottleup_private.request_reward(p_reward_id,p_request_key)$$;
create function public.decide_redemption(p_id uuid,p_status text) returns void language sql security invoker set search_path='' as $$select bottleup_private.decide_redemption(p_id,p_status)$$;
create function public.accept_pickup(p_id uuid,p_lat double precision default null,p_lng double precision default null) returns void language sql security invoker set search_path='' as $$select bottleup_private.accept_pickup(p_id,p_lat,p_lng)$$;
create function public.start_on_the_way(p_id uuid,p_lat double precision default null,p_lng double precision default null) returns void language sql security invoker set search_path='' as $$select bottleup_private.start_on_the_way(p_id,p_lat,p_lng)$$;
create function public.collect_pickup(p_id uuid,p_weight numeric) returns void language sql security invoker set search_path='' as $$select bottleup_private.collect_pickup(p_id,p_weight)$$;
create function public.decide_collector_application(p_id uuid,p_status text) returns void language sql security invoker set search_path='' as $$select bottleup_private.decide_collector_application(p_id,p_status)$$;
create function public.update_own_full_name(p_new_name text) returns void language sql security invoker set search_path='' as $$select bottleup_private.update_own_full_name(p_new_name)$$;
-- Old clients must refresh; never accept client-controlled reward pricing.
create or replace function public.redeem_reward(p_reward_name text,p_cost integer) returns public.reward_redemptions language plpgsql security invoker set search_path='' as $$begin raise exception 'Please refresh BottleUp before redeeming a reward'; end$$;

-- Remove client mutation privileges, including any historical column grants.
do $$declare t text; cols text; begin
 foreach t in array array['profiles','pickup_requests','reward_transactions','reward_redemptions','collector_applications','notifications'] loop
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns where table_schema='public' and table_name=t;
 execute format('revoke insert (%s),update (%s),references (%s) on public.%I from public,anon,authenticated',cols,cols,cols,t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
grant insert(user_id,material_type,estimated_weight_kg,pickup_location,photo_url,latitude,longitude) on public.pickup_requests to authenticated;
grant update(read) on public.notifications to authenticated;
grant insert(user_id) on public.collector_applications to authenticated;
drop policy if exists "users create pickup requests" on public.pickup_requests;
create policy "users create pickup requests" on public.pickup_requests for insert to authenticated with check(
 user_id=(select auth.uid()) and status='AVAILABLE' and collector_id is null and actual_weight_kg is null
 and estimated_weight_kg between 0.01 and 20000 and length(trim(pickup_location)) between 1 and 500
 and (photo_url is null or photo_url like auth.uid()::text||'/%'));

-- Remove superseded write policies as well as privileges.
do $$declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and cmd in ('UPDATE','ALL') and tablename in ('profiles','pickup_requests','reward_transactions','reward_redemptions','collector_applications') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;

-- Harden retained triggers/role predicates. Their unqualified tables live in
-- public, which API roles cannot CREATE in. None are RPC entry points.
revoke create on schema public from public,anon,authenticated;
do $$declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('handle_new_user','is_admin','is_collector','handle_collector_approval','notify_application_decision','notify_redemption_decision','notify_pickup_status_change','limit_open_requests','protect_profile_fields','validate_pickup_transition','award_points_on_verification','handle_redemption_decision') loop
 execute format('alter function %s set search_path=public,pg_temp',f.signature);
 execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.is_admin(),public.is_collector() to authenticated;
revoke all on all functions in schema bottleup_private from public,anon,authenticated;
do $$declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','bottleup_private') and p.proname in ('verify_pickup','request_reward','decide_redemption','accept_pickup','start_on_the_way','collect_pickup','decide_collector_application','update_own_full_name') loop
 execute format('revoke execute on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
revoke execute on function public.redeem_reward(text,integer) from public,anon;
grant execute on function public.redeem_reward(text,integer) to authenticated;

-- Supabase Postgres Changes requires explicit publication membership.
do $$declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['profiles','pickup_requests','reward_redemptions','notifications','points_ledger'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop;
 end if;
end $$;
notify pgrst,'reload schema';
