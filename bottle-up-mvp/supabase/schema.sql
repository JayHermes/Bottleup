create extension if not exists "uuid-ossp";

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role text not null default 'user' check (role in ('user','collector','admin')),
  city text,
  points integer not null default 0,
  created_at timestamptz default now()
);

create table recycling_partners (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  city text,
  contact text,
  active boolean default true,
  created_at timestamptz default now()
);

create table pickup_requests (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id),
  collector_id uuid references profiles(id),
  material_type text not null,
  estimated_weight_kg numeric(10,2) not null,
  actual_weight_kg numeric(10,2),
  pickup_location text not null,
  photo_url text,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ACCEPTED','COLLECTED','DELIVERED','VERIFIED','CANCELLED')),
  created_at timestamptz default now(),
  collected_at timestamptz,
  verified_at timestamptz
);

create table recycling_deliveries (
  id uuid primary key default uuid_generate_v4(),
  pickup_request_id uuid not null references pickup_requests(id),
  recycler_id uuid not null references recycling_partners(id),
  delivered_weight_kg numeric(10,2) not null,
  price_per_kg numeric(10,2),
  proof_url text,
  delivered_at timestamptz default now()
);

create table reward_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references profiles(id),
  pickup_request_id uuid not null references pickup_requests(id),
  points integer not null,
  status text not null default 'issued' check (status in ('pending','issued','reversed')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table pickup_requests enable row level security;
alter table recycling_partners enable row level security;
alter table recycling_deliveries enable row level security;
alter table reward_transactions enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create policy "users can read own profile"
on profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "users can update own profile"
on profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "users create pickup requests"
on pickup_requests for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "users and operations can read pickup requests"
on pickup_requests for select to authenticated
using (
  (select auth.uid()) = user_id
  or (select public.current_user_role()) in ('collector', 'admin')
);

create policy "operations can update pickup requests"
on pickup_requests for update to authenticated
using ((select public.current_user_role()) in ('collector', 'admin'))
with check ((select public.current_user_role()) in ('collector', 'admin'));

create policy "authenticated users can read recycling partners"
on recycling_partners for select to authenticated
using (true);

create policy "users can read own reward transactions"
on reward_transactions for select to authenticated
using ((select auth.uid()) = user_id or (select public.current_user_role()) = 'admin');

create policy "admins can issue reward transactions"
on reward_transactions for insert to authenticated
with check ((select public.current_user_role()) = 'admin');

create index if not exists pickup_requests_user_id_idx on pickup_requests(user_id);
create index if not exists pickup_requests_status_idx on pickup_requests(status);
create index if not exists reward_transactions_user_id_idx on reward_transactions(user_id);
