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

create policy "users can read own profile" on profiles for select using (auth.uid() = id);
create policy "users can update own profile" on profiles for update using (auth.uid() = id);
create policy "users create pickup requests" on pickup_requests for insert with check (auth.uid() = user_id);
create policy "users see own pickup requests" on pickup_requests for select using (auth.uid() = user_id);
