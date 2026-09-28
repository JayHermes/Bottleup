-- Fresh Supabase projects ONLY. Never run this bootstrap against an existing project.
-- Existing BottleUP production uses versioned migrations; see docs/points-system.md.
begin;
create table public.profiles (id uuid not null, full_name text, phone text, role text not null default 'user'::text, city text, points integer not null default 0, created_at timestamp with time zone default now());
create table public.recycling_partners (id uuid not null default gen_random_uuid(), name text not null, city text, contact text, active boolean default true, created_at timestamp with time zone default now());
create table public.recycling_deliveries (id uuid not null default gen_random_uuid(), pickup_request_id uuid not null, recycler_id uuid not null, delivered_weight_kg numeric(10,2) not null, price_per_kg numeric(10,2), proof_url text, delivered_at timestamp with time zone default now());
create table public.reward_transactions (id uuid not null default gen_random_uuid(), user_id uuid not null, pickup_request_id uuid not null, points integer not null, status text not null default 'issued'::text, created_at timestamp with time zone default now());
create table public.collector_applications (id uuid not null default gen_random_uuid(), user_id uuid not null, status text not null default 'pending'::text, created_at timestamp with time zone not null default now(), reviewed_at timestamp with time zone, reviewed_by uuid);
create table public.pickup_requests (id uuid not null default gen_random_uuid(), user_id uuid not null, collector_id uuid, material_type text not null, estimated_weight_kg numeric(10,2) not null, actual_weight_kg numeric(10,2), pickup_location text not null, photo_url text, status text not null default 'AVAILABLE'::text, created_at timestamp with time zone default now(), collected_at timestamp with time zone, verified_at timestamp with time zone, on_the_way_at timestamp with time zone, verified_by uuid, latitude double precision, longitude double precision, collector_latitude double precision, collector_longitude double precision);
create table public.reward_redemptions (id uuid not null default gen_random_uuid(), user_id uuid not null, reward_name text not null, cost integer not null, status text not null default 'pending'::text, created_at timestamp with time zone not null default now(), fulfilled_at timestamp with time zone, fulfilled_by uuid);
create table public.notifications (id uuid not null default gen_random_uuid(), user_id uuid not null, message text not null, read boolean not null default false, created_at timestamp with time zone not null default now());
create table public.bank_accounts (user_id uuid not null, bank_name text not null, account_holder text not null, account_number text not null);
alter table recycling_partners add constraint recycling_partners_pkey PRIMARY KEY (id);
alter table collector_applications add constraint collector_applications_pkey PRIMARY KEY (id);
alter table reward_redemptions add constraint reward_redemptions_pkey PRIMARY KEY (id);
alter table notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table pickup_requests add constraint pickup_requests_pkey PRIMARY KEY (id);
alter table recycling_deliveries add constraint recycling_deliveries_pkey PRIMARY KEY (id);
alter table reward_transactions add constraint reward_transactions_pkey PRIMARY KEY (id);
alter table profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table bank_accounts add constraint bank_accounts_pkey PRIMARY KEY (user_id);
alter table collector_applications add constraint collector_applications_user_id_key UNIQUE (user_id);
alter table pickup_requests add constraint pickup_requests_status_check CHECK ((status = ANY (ARRAY['AVAILABLE'::text, 'ACCEPTED'::text, 'ON_THE_WAY'::text, 'COLLECTED'::text, 'VERIFIED'::text, 'CANCELLED'::text])));
alter table pickup_requests add constraint pickup_requests_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES profiles(id);
alter table collector_applications add constraint collector_applications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table collector_applications add constraint collector_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table collector_applications add constraint collector_applications_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id);
alter table reward_redemptions add constraint reward_redemptions_cost_check CHECK ((cost > 0));
alter table reward_redemptions add constraint reward_redemptions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'fulfilled'::text, 'rejected'::text])));
alter table reward_redemptions add constraint reward_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table reward_redemptions add constraint reward_redemptions_fulfilled_by_fkey FOREIGN KEY (fulfilled_by) REFERENCES profiles(id);
alter table notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table bank_accounts add constraint bank_accounts_bank_name_check CHECK (((length(TRIM(BOTH FROM bank_name)) >= 1) AND (length(TRIM(BOTH FROM bank_name)) <= 100)));
alter table bank_accounts add constraint bank_accounts_account_holder_check CHECK (((length(TRIM(BOTH FROM account_holder)) >= 1) AND (length(TRIM(BOTH FROM account_holder)) <= 120)));
alter table bank_accounts add constraint bank_accounts_account_number_check CHECK ((account_number ~ '^[0-9]{10}$'::text));
alter table bank_accounts add constraint bank_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table profiles add constraint profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'collector'::text, 'admin'::text])));
alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table pickup_requests add constraint pickup_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table pickup_requests add constraint pickup_requests_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES profiles(id);
alter table recycling_deliveries add constraint recycling_deliveries_pickup_request_id_fkey FOREIGN KEY (pickup_request_id) REFERENCES pickup_requests(id);
alter table recycling_deliveries add constraint recycling_deliveries_recycler_id_fkey FOREIGN KEY (recycler_id) REFERENCES recycling_partners(id);
alter table reward_transactions add constraint reward_transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'issued'::text, 'reversed'::text])));
alter table reward_transactions add constraint reward_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id);
alter table reward_transactions add constraint reward_transactions_pickup_request_id_fkey FOREIGN KEY (pickup_request_id) REFERENCES pickup_requests(id);
CREATE OR REPLACE FUNCTION public.handle_redemption_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    update profiles set points = points + old.cost where id = old.user_id;
    new.fulfilled_at := now();
    new.fulfilled_by := auth.uid();
  elsif new.status = 'fulfilled' and old.status is distinct from 'fulfilled' then
    new.fulfilled_at := now();
    new.fulfilled_by := auth.uid();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_pickup_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.status is distinct from old.status then
    if new.status = 'ACCEPTED' then
      insert into notifications (user_id, message) values (new.user_id, 'A collector accepted your pickup request.');
    elsif new.status = 'ON_THE_WAY' then
      insert into notifications (user_id, message) values (new.user_id, 'Your collector is on the way.');
    elsif new.status = 'COLLECTED' then
      insert into notifications (user_id, message) values (new.user_id, 'Your pickup was collected and is awaiting verification.');
    elsif new.status = 'VERIFIED' then
      insert into notifications (user_id, message) values (new.user_id, format('Your pickup was verified — +%s points!', round(new.actual_weight_kg * 100)::int));
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_application_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into notifications (user_id, message) values (new.user_id, 'Your collector application was approved!');
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    insert into notifications (user_id, message) values (new.user_id, 'Your collector application was not approved this time.');
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_redemption_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.status = 'fulfilled' and old.status is distinct from 'fulfilled' then
    insert into notifications (user_id, message) values (new.user_id, format('Your %s redemption was fulfilled.', new.reward_name));
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    insert into notifications (user_id, message) values (new.user_id, format('Your %s redemption was declined and points were refunded.', new.reward_name));
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.limit_open_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  open_count integer;
begin
  select count(*) into open_count from pickup_requests
  where user_id = new.user_id and status not in ('VERIFIED','CANCELLED');
  if open_count >= 5 then
    raise exception 'You already have several open pickup requests — wait for one to be collected or verified before posting more.';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_collector()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists(select 1 from profiles where id = auth.uid() and role in ('collector','admin'));
$function$;

CREATE OR REPLACE FUNCTION public.validate_pickup_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Immutable once posted, unless admin
  if not public.is_admin() and old.status <> 'AVAILABLE' then
    if new.material_type <> old.material_type
       or new.estimated_weight_kg <> old.estimated_weight_kg
       or new.pickup_location <> old.pickup_location
       or new.user_id <> old.user_id then
      raise exception 'This request can no longer be edited';
    end if;
  end if;

  if new.status is distinct from old.status then
    case
      when old.status = 'AVAILABLE' and new.status = 'ACCEPTED' then
        if not public.is_collector() then
          raise exception 'Only a collector can accept a pickup';
        end if;
        if new.collector_id is distinct from auth.uid() and not public.is_admin() then
          raise exception 'You can only accept a pickup for yourself';
        end if;

      when old.status = 'ACCEPTED' and new.status = 'ON_THE_WAY' then
        if old.collector_id is distinct from auth.uid() and not public.is_admin() then
          raise exception 'Only the assigned collector can update this pickup';
        end if;
        new.on_the_way_at := now();

      when old.status = 'ON_THE_WAY' and new.status = 'COLLECTED' then
        if old.collector_id is distinct from auth.uid() and not public.is_admin() then
          raise exception 'Only the assigned collector can update this pickup';
        end if;
        if new.actual_weight_kg is null then
          raise exception 'Enter the actual collected weight before marking as collected';
        end if;
        new.collected_at := now();

      when old.status = 'COLLECTED' and new.status = 'VERIFIED' then
        if not public.is_admin() then
          raise exception 'Only an admin can verify a pickup';
        end if;
        if new.actual_weight_kg is null then
          raise exception 'Cannot verify a pickup with no weight recorded';
        end if;
        new.verified_at := now();
        new.verified_by := auth.uid();

      when new.status = 'CANCELLED' and old.status in ('AVAILABLE','ACCEPTED') then
        if old.user_id is distinct from auth.uid() and not public.is_admin() then
          raise exception 'Only the requester can cancel this pickup';
        end if;

      else
        if not public.is_admin() then
          raise exception 'That status change is not allowed (% -> %)', old.status, new.status;
        end if;
    end case;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.award_points_on_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  pts integer;
begin
  if new.status = 'VERIFIED' and old.status is distinct from 'VERIFIED' then
    pts := round(new.actual_weight_kg * 100)::integer;

    insert into reward_transactions (user_id, pickup_request_id, points, status)
    values (new.user_id, new.id, pts, 'issued');

    update profiles set points = points + pts where id = new.user_id;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;
    if new.points is distinct from old.points then
      raise exception 'Points can only be changed by the system';
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin');
$function$;

CREATE OR REPLACE FUNCTION public.handle_collector_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update profiles set role = 'collector' where id = new.user_id;
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data ->> 'full_name', 'user')
  on conflict (id) do nothing;

  if (new.raw_user_meta_data ->> 'wants_collector')::boolean is true then
    insert into public.collector_applications (user_id, status)
    values (new.id, 'pending')
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_reward(p_reward_name text, p_cost integer)
 RETURNS reward_redemptions
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  current_points integer;
  result reward_redemptions;
begin
  select points into current_points from profiles where id = auth.uid();
  if current_points is null or current_points < p_cost then
    raise exception 'Not enough points for this reward';
  end if;

  update profiles set points = points - p_cost where id = auth.uid();

  insert into reward_redemptions (user_id, reward_name, cost, status)
  values (auth.uid(), p_reward_name, p_cost, 'pending')
  returning * into result;

  return result;
end;
$function$;

CREATE TRIGGER trg_protect_profile_fields BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_fields();
CREATE TRIGGER trg_validate_pickup_transition BEFORE UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION validate_pickup_transition();
CREATE TRIGGER trg_award_points AFTER UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION award_points_on_verification();
CREATE TRIGGER trg_collector_approval BEFORE UPDATE ON public.collector_applications FOR EACH ROW EXECUTE FUNCTION handle_collector_approval();
CREATE TRIGGER trg_redemption_decision BEFORE UPDATE ON public.reward_redemptions FOR EACH ROW EXECUTE FUNCTION handle_redemption_decision();
CREATE TRIGGER trg_notify_pickup_status AFTER UPDATE ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION notify_pickup_status_change();
CREATE TRIGGER trg_notify_application AFTER UPDATE ON public.collector_applications FOR EACH ROW EXECUTE FUNCTION notify_application_decision();
CREATE TRIGGER trg_notify_redemption AFTER UPDATE ON public.reward_redemptions FOR EACH ROW EXECUTE FUNCTION notify_redemption_decision();
CREATE TRIGGER trg_limit_open_requests BEFORE INSERT ON public.pickup_requests FOR EACH ROW EXECUTE FUNCTION limit_open_requests();
alter table public.profiles enable row level security; create policy "admins manage all profiles" on public.profiles for UPDATE to authenticated using (is_admin());
alter table public.profiles enable row level security; create policy "admins read all profiles" on public.profiles for SELECT to authenticated using (is_admin());
alter table public.profiles enable row level security; create policy "users can read own profile" on public.profiles for SELECT to authenticated using ((auth.uid() = id));
alter table public.profiles enable row level security; create policy "users can update own profile" on public.profiles for UPDATE to authenticated using ((auth.uid() = id));
alter table public.reward_transactions enable row level security; create policy "users read own rewards" on public.reward_transactions for SELECT to authenticated using ((auth.uid() = user_id));
alter table public.collector_applications enable row level security; create policy "admins update applications" on public.collector_applications for UPDATE to authenticated using (is_admin());
alter table public.collector_applications enable row level security; create policy "own or admin read applications" on public.collector_applications for SELECT to authenticated using (((auth.uid() = user_id) OR is_admin()));
alter table public.collector_applications enable row level security; create policy "users create own application" on public.collector_applications for INSERT to authenticated with check (((auth.uid() = user_id) AND (status = 'pending'::text)));
alter table public.pickup_requests enable row level security; create policy "admins update any pickup" on public.pickup_requests for UPDATE to authenticated using (is_admin());
alter table public.pickup_requests enable row level security; create policy "collectors and admins see relevant pickups" on public.pickup_requests for SELECT to authenticated using (((auth.uid() = user_id) OR (collector_id = auth.uid()) OR (is_collector() AND (status = 'AVAILABLE'::text)) OR is_admin()));
alter table public.pickup_requests enable row level security; create policy "collectors update assigned or claimable pickups" on public.pickup_requests for UPDATE to authenticated using ((is_collector() AND ((status = 'AVAILABLE'::text) OR (collector_id = auth.uid()))));
alter table public.pickup_requests enable row level security; create policy "users create pickup requests" on public.pickup_requests for INSERT to authenticated with check ((auth.uid() = user_id));
alter table public.pickup_requests enable row level security; create policy "users see own pickup requests" on public.pickup_requests for SELECT to authenticated using ((auth.uid() = user_id));
alter table public.pickup_requests enable row level security; create policy "users update own pickups while available" on public.pickup_requests for UPDATE to authenticated using (((auth.uid() = user_id) AND (status = ANY (ARRAY['AVAILABLE'::text, 'ACCEPTED'::text]))));
alter table public.reward_redemptions enable row level security; create policy "admins update redemptions" on public.reward_redemptions for UPDATE to authenticated using (is_admin());
alter table public.reward_redemptions enable row level security; create policy "own or admin read redemptions" on public.reward_redemptions for SELECT to authenticated using (((auth.uid() = user_id) OR is_admin()));
alter table public.notifications enable row level security; create policy "users mark own notifications read" on public.notifications for UPDATE to authenticated using ((auth.uid() = user_id));
alter table public.notifications enable row level security; create policy "users see own notifications" on public.notifications for SELECT to authenticated using ((auth.uid() = user_id));
alter table public.bank_accounts enable row level security; create policy bank_account_owner on public.bank_accounts for ALL to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));



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
 ('free-pickup','₦500 Airtime',300,'Mobile airtime reward'),
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

alter table public.recycling_deliveries enable row level security;
alter table public.recycling_partners enable row level security;
grant select,insert,update,delete on public.bank_accounts to authenticated;
revoke all on public.bank_accounts from anon;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into storage.buckets(id,name,public) values('pickup-photos','pickup-photos',false) on conflict(id) do nothing;
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

commit;
