-- BottleUp MVP schema
-- Security model:
--   * Users never write to `profiles` directly. `role` and `points` can only be
--     changed by security-definer triggers/RPCs below. Editing your name goes
--     through update_own_full_name().
--   * pickup_requests status transitions happen only through RPCs that enforce
--     ownership (collector_id = auth.uid()) and ordering of statuses.
--   * rewards (redeem/fulfil/refund) and collector approvals go through RPCs
--     that are atomic and admin-gated.
--   * Photos are exif-free (re-encoded client-side) and stored in the private
--     `pickup-photos` bucket, access scoped to the owning user.

create extension if not exists pgcrypto;

----------------------------------------------------------------------------
-- Tables
----------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('user','collector','admin')),
  city text,
  points integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists recycling_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  contact text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists pickup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  collector_id uuid references profiles(id) on delete set null,
  material_type text not null,
  estimated_weight_kg numeric(10,2) not null,
  actual_weight_kg numeric(10,2),
  estimated_bottles integer,
  actual_bottles integer,
  pickup_location text not null,
  latitude double precision,
  longitude double precision,
  collector_latitude double precision,
  collector_longitude double precision,
  photo_url text,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ACCEPTED','ON_THE_WAY','COLLECTED','DELIVERED','VERIFIED','CANCELLED')),
  created_at timestamptz default now(),
  collected_at timestamptz,
  verified_at timestamptz
);

create table if not exists recycling_deliveries (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null references pickup_requests(id) on delete cascade,
  recycler_id uuid not null references recycling_partners(id),
  delivered_weight_kg numeric(10,2) not null,
  price_per_kg numeric(10,2),
  proof_url text,
  delivered_at timestamptz default now()
);

create table if not exists reward_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  pickup_request_id uuid not null references pickup_requests(id) on delete cascade,
  points integer not null,
  status text not null default 'issued' check (status in ('pending','issued','reversed')),
  created_at timestamptz default now()
);

create table if not exists bottleup_economics (
  id integer primary key default 1 check (id = 1),
  average_bottle_weight_kg numeric(8,4) not null default 0.025,
  platform_value_min_ngn numeric(10,2) not null default 150,
  platform_value_max_ngn numeric(10,2) not null default 200,
  platform_value_mid_ngn numeric(10,2) not null default 175,
  points_per_bottle integer not null default 10,
  points_per_kg integer not null default 100,
  reward_naira_per_point numeric(10,4) not null default 0.1,
  updated_at timestamptz default now()
);

insert into bottleup_economics (id, average_bottle_weight_kg, platform_value_min_ngn, platform_value_max_ngn, platform_value_mid_ngn, points_per_bottle, points_per_kg, reward_naira_per_point)
values (1, 0.025, 150, 200, 175, 10, 100, 0.1)
on conflict (id) do update set average_bottle_weight_kg = excluded.average_bottle_weight_kg, platform_value_min_ngn = excluded.platform_value_min_ngn, platform_value_max_ngn = excluded.platform_value_max_ngn, platform_value_mid_ngn = excluded.platform_value_mid_ngn, points_per_bottle = excluded.points_per_bottle, points_per_kg = excluded.points_per_kg, reward_naira_per_point = excluded.reward_naira_per_point, updated_at = now();

-- Notifications shown in the bell. Written only by triggers/RPCs below.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  created_at timestamptz default now()
);

-- Collector applications created server-side from the `wants_collector` signup
-- flag; decided only by an admin-gated RPC.
create table if not exists collector_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz default now(),
  decided_at timestamptz
);

-- Reward redemption requests. Inserted and decided only through RPCs that are
-- atomic (points are deducted/refunded in the same transaction).
create table if not exists reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  reward_name text not null,
  cost integer not null,
  status text not null default 'pending' check (status in ('pending','fulfilled','rejected')),
  created_at timestamptz default now(),
  decided_at timestamptz
);

----------------------------------------------------------------------------
-- Row level security
----------------------------------------------------------------------------

alter table profiles enable row level security;
alter table pickup_requests enable row level security;
alter table recycling_partners enable row level security;
alter table recycling_deliveries enable row level security;
alter table reward_transactions enable row level security;
alter table bottleup_economics enable row level security;
alter table notifications enable row level security;
alter table collector_applications enable row level security;
alter table reward_redemptions enable row level security;

-- profiles: read your own only; admins may read all (for joins/overview).
-- There is deliberately NO update policy: name edits go through
-- update_own_full_name(), role/points are managed by triggers and RPCs.
drop policy if exists "users can update own profile" on profiles;
create policy "users can read own profile" on profiles for select to authenticated using ((select auth.uid()) = id);
create policy "admins can read all profiles" on profiles for select to authenticated using ((select public.current_user_role()) = 'admin');

-- pickup_requests:
--   insert  -> the requesting user only.
--   select  -> the requesting user; admins; collectors see AVAILABLE requests
--              plus requests assigned to them (so a collector can't browse
--              another collector's or a fellow user's GPS/history).
--   update  -> none here; transitions happen via RPCs that enforce ownership.
drop policy if exists "users create pickup requests" on pickup_requests;
drop policy if exists "users and operations can read pickup requests" on pickup_requests;
drop policy if exists "operations can update pickup requests" on pickup_requests;
create policy "users create pickup requests" on pickup_requests for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pickup requests are scoped" on pickup_requests for select to authenticated using (
  (select auth.uid()) = user_id
  or (select public.current_user_role()) = 'admin'
  or ((select public.current_user_role()) = 'collector' and (status = 'AVAILABLE' or collector_id = (select auth.uid())))
);

-- recycling_partners: readable by all authenticated users (client list).
create policy "authenticated users can read recycling partners" on recycling_partners for select to authenticated using (true);

-- recycling_deliveries: features are not wired into the client yet; keep it
-- admin-only until collectors/partners flows ship.
create policy "admins can read recycling deliveries" on recycling_deliveries for select to authenticated using ((select public.current_user_role()) = 'admin');
create policy "admins can write recycling deliveries" on recycling_deliveries for insert to authenticated with check ((select public.current_user_role()) = 'admin');

-- reward_transactions: written by the verification trigger only.
create policy "users can read own reward transactions" on reward_transactions for select to authenticated using ((select auth.uid()) = user_id or (select public.current_user_role()) = 'admin');

-- economics: readable by all authenticated users.
create policy "authenticated users can read BottleUp economics" on bottleup_economics for select to authenticated using (true);

-- notifications: read/ack your own. Creation happens server-side (triggers/RPCs).
create policy "users can read own notifications" on notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "users can mark own notifications read" on notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- collector_applications: read own, or all for admins. No direct insert/update
-- from clients; the signup trigger inserts, decide_collector_application() updates.
create policy "users can read own collector application" on collector_applications for select to authenticated using ((select auth.uid()) = user_id);
create policy "admins can read collector applications" on collector_applications for select to authenticated using ((select public.current_user_role()) = 'admin');

-- reward_redemptions: read own, or all for admins. Inserts/updates via RPC only.
create policy "users can read own reward redemptions" on reward_redemptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "admins can read reward redemptions" on reward_redemptions for select to authenticated using ((select public.current_user_role()) = 'admin');

-- Storage: private `pickup-photos` bucket; every policy is scoped to the
-- caller's own folder (`<user_id>/<file>`). Re-encoded (EXIF-free) images only.
insert into storage.buckets (id, name, public)
values ('pickup-photos', 'pickup-photos', false)
on conflict (id) do update set public = false;
drop policy if exists "users can read own pickup photos" on storage.objects;
drop policy if exists "users can insert own pickup photos" on storage.objects;
drop policy if exists "users can update own pickup photos" on storage.objects;
drop policy if exists "users can delete own pickup photos" on storage.objects;
create policy "users can read own pickup photos" on storage.objects for select to authenticated
  using (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users can insert own pickup photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users can update own pickup photos" on storage.objects for update to authenticated
  using (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));
create policy "users can delete own pickup photos" on storage.objects for delete to authenticated
  using (bucket_id = 'pickup-photos' and (storage.foldername(name))[1] = (select auth.uid()::text));

----------------------------------------------------------------------------
-- Functions / triggers
----------------------------------------------------------------------------

-- Create the profile for a new auth user, and file a collector application if
-- they ticked the "apply to become a collector" box at signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_wants_collector boolean;
begin
  v_wants_collector := coalesce(new.raw_user_meta_data ->> 'wants_collector', '') = 'true';
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone')
  on conflict (id) do nothing;

  if v_wants_collector then
    insert into public.collector_applications (user_id) values (new.id);
  end if;
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;
revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

-- The only column users can self-edit: their display name.
create or replace function public.update_own_full_name(p_new_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_new_name is null or length(trim(p_new_name)) = 0 then
    raise exception 'Display name cannot be empty';
  end if;
  update public.profiles set full_name = trim(p_new_name) where id = (select auth.uid());
end;
$$;
revoke execute on function public.update_own_full_name(text) from public, anon;
grant execute on function public.update_own_full_name(text) to authenticated;

-- Credit the requesting user's points when a pickup is verified. Runs once and
-- only forward: the status must transition TO 'VERIFIED'.
create or replace function public.trg_pickup_verified()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_per_kg integer;
  v_points integer;
begin
  if new.status = 'VERIFIED' and (old.status is distinct from 'VERIFIED') then
    select points_per_kg into v_per_kg from public.bottleup_economics limit 1;
    v_points := round(coalesce(new.actual_weight_kg, 0) * coalesce(v_per_kg, 100));
    if v_points > 0 then
      update public.profiles set points = points + v_points where id = new.user_id;
      insert into public.reward_transactions (user_id, pickup_request_id, points, status)
      values (new.user_id, new.id, v_points, 'issued');
      insert into public.notifications (user_id, message)
      values (new.user_id, format('Pickup %s verified — %s points issued.', left(new.id::text, 8), v_points));
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_pickup_verified() from public, anon;

drop trigger if exists pickup_verified_trigger on pickup_requests;
create trigger pickup_verified_trigger after update on pickup_requests for each row execute function public.trg_pickup_verified();

-- Refund points when a pending redemption is declined. Called by
-- decide_redemption() inside the same transaction.
create or replace function public.trg_redemption_rejected()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'rejected' and old.status = 'pending' then
    update public.profiles set points = points + new.cost where id = new.user_id;
    insert into public.notifications (user_id, message)
    values (new.user_id, format('Your %s redemption was declined. %s points refunded.', new.reward_name, new.cost));
  end if;
  return new;
end;
$$;
revoke execute on function public.trg_redemption_rejected() from public, anon;

drop trigger if exists redemption_rejected_trigger on reward_redemptions;
create trigger redemption_rejected_trigger after update on reward_redemptions for each row execute function public.trg_redemption_rejected();

-- Collector accepts a request. Only a collector may run this, and only while
-- the request is still AVAILABLE (guards the race of two collectors grabbing it).
create or replace function public.accept_pickup(p_id uuid, p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if (select public.current_user_role()) <> 'collector' then
    raise exception 'Only collectors can accept pickups';
  end if;
  update public.pickup_requests
     set status = 'ACCEPTED',
         collector_id = (select auth.uid()),
         collector_latitude = p_lat,
         collector_longitude = p_lng
   where id = p_id and status = 'AVAILABLE';
  if not found then
    raise exception 'This pickup is no longer available';
  end if;
  select user_id into v_user from public.pickup_requests where id = p_id;
  insert into public.notifications (user_id, message)
  values (v_user, format('A collector accepted your pickup (%s).', left(p_id::text, 8)));
end;
$$;
revoke execute on function public.accept_pickup(uuid, double precision, double precision) from public, anon;
grant execute on function public.accept_pickup(uuid, double precision, double precision) to authenticated;

create or replace function public.start_on_the_way(p_id uuid, p_lat double precision default null, p_lng double precision default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pickup_requests
     set status = 'ON_THE_WAY',
         collector_latitude = coalesce(p_lat, collector_latitude),
         collector_longitude = coalesce(p_lng, collector_longitude)
   where id = p_id and collector_id = (select auth.uid()) and status = 'ACCEPTED';
  if not found then
    raise exception 'You are not the assigned collector for this pickup';
  end if;
end;
$$;
revoke execute on function public.start_on_the_way(uuid, double precision, double precision) from public, anon;
grant execute on function public.start_on_the_way(uuid, double precision, double precision) to authenticated;

-- Collector marks the collection done and records the weighed amount.
create or replace function public.collect_pickup(p_id uuid, p_weight numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_weight is null or p_weight <= 0 or p_weight > 20000 then
    raise exception 'Please enter a valid weight';
  end if;
  update public.pickup_requests
     set status = 'COLLECTED',
         actual_weight_kg = p_weight,
         collected_at = now()
   where id = p_id and collector_id = (select auth.uid()) and status = 'ON_THE_WAY';
  if not found then
    raise exception 'You are not the assigned collector for this pickup';
  end if;
end;
$$;
revoke execute on function public.collect_pickup(uuid, numeric) from public, anon;
grant execute on function public.collect_pickup(uuid, numeric) to authenticated;

-- Admin verifies a collected pickup; the trigger above credits points.
create or replace function public.verify_pickup(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
begin
  if (select public.current_user_role()) <> 'admin' then
    raise exception 'Only admins can verify pickups';
  end if;
  update public.pickup_requests
     set status = 'VERIFIED', verified_at = now()
   where id = p_id and status = 'COLLECTED';
  if not found then
    raise exception 'Only collected pickups can be verified';
  end if;
end;
$$;
revoke execute on function public.verify_pickup(uuid) from public, anon;
grant execute on function public.verify_pickup(uuid) to authenticated;

-- Redeem points for a reward. Atomic: checks balance and deducts in the same
-- query, then records the pending redemption. Idempotency: no duplicate
-- pending redemptions for the same reward.
create or replace function public.redeem_reward(p_reward_name text, p_cost integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'Invalid reward';
  end if;
  perform 1 from public.reward_redemptions
   where user_id = (select auth.uid()) and reward_name = p_reward_name and status = 'pending';
  if found then
    raise exception 'You already have a pending request for this reward';
  end if;

  update public.profiles set points = points - p_cost
   where id = (select auth.uid()) and points >= p_cost;
  if not found then
    raise exception 'Not enough points for this reward';
  end if;

  insert into public.reward_redemptions (user_id, reward_name, cost, status)
  values ((select auth.uid()), p_reward_name, p_cost, 'pending');
  insert into public.notifications (user_id, message)
  values ((select auth.uid()), format('%s redemption requested (%s pts).', p_reward_name, p_cost));
end;
$$;
revoke execute on function public.redeem_reward(text, integer) from public, anon;
grant execute on function public.redeem_reward(text, integer) to authenticated;

-- Admin decides a pending collector application. Approval grants the collector
-- role; rejection keeps/returns the user role. Atomic with the application.
create or replace function public.decide_collector_application(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if (select public.current_user_role()) <> 'admin' then
    raise exception 'Only admins can review collector applications';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  update public.collector_applications
     set status = p_status, decided_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'Application is not pending';
  end if;

  select user_id into v_user from public.collector_applications where id = p_id;
  update public.profiles
     set role = case when p_status = 'approved' then 'collector' else 'user' end
   where id = v_user;
  if p_status = 'approved' then
    insert into public.notifications (user_id, message)
    values (v_user, 'You are now a BottleUp collector — welcome aboard!');
  else
    insert into public.notifications (user_id, message)
    values (v_user, 'Your collector application was declined. You can still use BottleUp as a recycler.');
  end if;
end;
$$;
revoke execute on function public.decide_collector_application(uuid, text) from public, anon;
grant execute on function public.decide_collector_application(uuid, text) to authenticated;

-- Admin decides a pending redemption: fulfil, or decline (refund via trigger).
create or replace function public.decide_redemption(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select public.current_user_role()) <> 'admin' then
    raise exception 'Only admins can decide redemptions';
  end if;
  if p_status not in ('fulfilled', 'rejected') then
    raise exception 'Invalid decision';
  end if;

  update public.reward_redemptions set status = p_status, decided_at = now()
   where id = p_id and status = 'pending';
  if not found then
    raise exception 'Redemption is not pending';
  end if;
  if p_status = 'fulfilled' then
    insert into public.notifications (user_id, message)
    select user_id, format('Your %s redemption was fulfilled. Enjoy!', reward_name)
      from public.reward_redemptions where id = p_id;
  end if;
end;
$$;
revoke execute on function public.decide_redemption(uuid, text) from public, anon;
grant execute on function public.decide_redemption(uuid, text) to authenticated;

-- GDPR/NDPR right to erasure: removes the user's own data (their redemptions,
-- transactions, applications, notifications and pickups; collector entries
-- they created keep the delete-cascade benefit), then the auth account.
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.recycling_deliveries
   where pickup_request_id in (select id from public.pickup_requests where user_id = v_uid);
  delete from public.reward_transactions where user_id = v_uid;
  delete from public.reward_redemptions where user_id = v_uid;
  delete from public.collector_applications where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;
  delete from public.pickup_requests where user_id = v_uid;
  delete from public.profiles where id = v_uid;

  select count(*) into v_count from public.pickup_requests where collector_id = v_uid and status not in ('VERIFIED', 'DELIVERED', 'CANCELLED');
  delete from auth.users where id = v_uid;
end;
$$;
revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

create index if not exists pickup_requests_user_id_idx on pickup_requests(user_id);
create index if not exists pickup_requests_status_idx on pickup_requests(status);
create index if not exists reward_transactions_user_id_idx on reward_transactions(user_id);
create index if not exists notifications_user_id_idx on notifications(user_id);
create index if not exists reward_redemptions_user_id_idx on reward_redemptions(user_id);