-- Schema-only production snapshot before points upgrade; no user data.
create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
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
grant all on all tables in schema public to authenticated;

