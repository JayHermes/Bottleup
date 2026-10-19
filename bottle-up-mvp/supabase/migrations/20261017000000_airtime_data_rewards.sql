-- Automated airtime/data redemption on top of the points ledger
-- (20260927234455_points_ledger.sql) and its follow-up fix
-- (20261012150615_disambiguate_post_points.sql).
--
-- Adds:
--  1. OTP-based phone verification (profiles.phone_verified_at), so an
--     airtime/data top-up only ever goes to a number the account holder has
--     proven they control.
--  2. A kind/network/VTpass-shape on reward_catalog so airtime and data
--     bundles can be told apart from manually-fulfilled rewards (vouchers
--     etc.), which keep working exactly as before.
--  3. request_airtime_reward(): like request_reward(), but requires a
--     verified phone and creates the redemption as 'processing' instead of
--     'pending' — no admin decides it, an edge function (fulfil-airtime-
--     reward) fulfils it immediately after this call returns.
--  4. process_airtime_result(): the only way that edge function is allowed
--     to record what VTpass actually did. Granted to service_role only —
--     never to anon/authenticated — so a client can request a top-up but
--     can never mark one as fulfilled itself.
begin;

-- 1. Phone verification --------------------------------------------------

alter table public.profiles add column if not exists phone_verified_at timestamptz;

-- OTP codes are stored hashed and are never exposed to any client role —
-- only the request-phone-otp / verify-phone-otp edge functions (service
-- role) ever touch this table.
create table if not exists public.phone_otp_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists phone_otp_user_recent on public.phone_otp_requests(user_id, created_at desc);
alter table public.phone_otp_requests enable row level security;
revoke all on public.phone_otp_requests from public, anon, authenticated;

-- 2. Reward catalog: tell automated rewards apart from manual ones -------

alter table public.reward_catalog add column if not exists kind text not null default 'manual';
alter table public.reward_catalog add column if not exists network text;
alter table public.reward_catalog add column if not exists vtpass_service_id text;
alter table public.reward_catalog add column if not exists vtpass_variation_code text;
alter table public.reward_catalog add column if not exists amount_naira integer;

do $$ begin
  alter table public.reward_catalog add constraint reward_catalog_kind_check check (kind in ('manual','airtime','data'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.reward_catalog add constraint reward_catalog_network_check check (network is null or network in ('mtn','glo','airtel','9mobile'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.reward_catalog add constraint reward_catalog_amount_check check (amount_naira is null or amount_naira > 0);
exception when duplicate_object then null; end $$;
-- Airtime doesn't pin a network — the redeeming user picks it (the catalog
-- entry is just a ₦ amount). A data bundle is inherently network-specific,
-- since VTpass variation codes differ per network, so it must carry one.
do $$ begin
  alter table public.reward_catalog add constraint reward_catalog_automated_shape check (
    (kind = 'manual' and network is null and vtpass_service_id is null and vtpass_variation_code is null and amount_naira is null) or
    (kind = 'airtime' and network is null and vtpass_service_id is null and vtpass_variation_code is null and amount_naira is not null) or
    (kind = 'data' and network is not null and vtpass_service_id is not null and vtpass_variation_code is not null and amount_naira is not null)
  );
exception when duplicate_object then null; end $$;

-- The two existing airtime entries become automated; the voucher stays
-- 'manual' (fulfilled by the team exactly as it is today).
update public.reward_catalog set kind = 'airtime', amount_naira = 500 where id = 'free-pickup';
update public.reward_catalog set kind = 'airtime', amount_naira = 1000 where id = 'airtime-1000';
-- No data bundles are seeded here: VTpass's data variation codes and prices
-- are specific to your VTpass account and change over time, so inventing
-- placeholder ones here would silently ship wrong bundles. Insert real rows
-- once you have them from your VTpass dashboard, e.g.:
--   insert into public.reward_catalog (id, name, cost, note, kind, network, vtpass_service_id, vtpass_variation_code, amount_naira)
--   values ('data-mtn-1gb', 'MTN 1GB (30 days)', 650, 'Mobile data bundle', 'data', 'mtn', 'mtn-data', '<variation_code from VTpass>', <naira price from VTpass>);

-- 3. Redemption rows gain fulfilment/provider metadata --------------------

alter table public.reward_redemptions add column if not exists kind text not null default 'manual';
alter table public.reward_redemptions add column if not exists phone text;
alter table public.reward_redemptions add column if not exists network text;
alter table public.reward_redemptions add column if not exists provider text;
alter table public.reward_redemptions add column if not exists provider_request_id text;
alter table public.reward_redemptions add column if not exists provider_response jsonb;

alter table public.reward_redemptions drop constraint if exists reward_redemptions_status_check;
alter table public.reward_redemptions add constraint reward_redemptions_status_check
  check (status in ('pending','processing','fulfilled','rejected','failed'));
do $$ begin
  alter table public.reward_redemptions add constraint reward_redemptions_automated_shape check (
    (kind in ('airtime','data')) = (phone is not null and network is not null)
  );
exception when duplicate_object then null; end $$;

-- 4. request_airtime_reward(): request_reward(), but phone-gated and
--    'processing' instead of 'pending' — nothing waits on an admin here.

create or replace function bottleup_private.request_airtime_reward(p_reward_id text, p_request_key uuid, p_network text)
returns public.reward_redemptions language plpgsql security definer set search_path='' as $$
declare r public.reward_redemptions; reward public.reward_catalog; buyer public.profiles; network text;
begin
  if auth.uid() is null or p_request_key is null then raise exception 'Sign in and supply a request key'; end if;
  select * into buyer from public.profiles where id = auth.uid() for no key update;
  if not found then raise exception 'Account unavailable'; end if;
  if buyer.phone is null or buyer.phone_verified_at is null then
    raise exception 'Verify your phone number before redeeming airtime or data';
  end if;

  select * into r from public.reward_redemptions where user_id = auth.uid() and request_key = p_request_key;
  if found then
    if r.reward_id is distinct from p_reward_id then raise exception 'Request key already used for another reward'; end if;
    return r;
  end if;

  select * into reward from public.reward_catalog where id = p_reward_id and active and kind in ('airtime','data') for share;
  if not found then raise exception 'This reward is unavailable'; end if;

  if reward.kind = 'data' then
    network := reward.network; -- the bundle itself pins the network
  else
    if p_network is null or p_network not in ('mtn','glo','airtel','9mobile') then
      raise exception 'Choose the network this phone number is on';
    end if;
    network := p_network;
  end if;

  insert into public.reward_redemptions(user_id, reward_name, cost, request_key, reward_id, status, kind, phone, network)
  values (auth.uid(), reward.name, reward.cost, p_request_key, reward.id, 'processing', reward.kind, buyer.phone, network)
  returning * into r;
  perform bottleup_private.post_points(auth.uid(), 'redemption', -reward.cost, null, r.id);
  insert into public.notifications(user_id, message) values (auth.uid(), 'Sending your ' || reward.name || '…');
  return r;
end $$;

create or replace function public.request_airtime_reward(p_reward_id text, p_request_key uuid, p_network text default null)
returns public.reward_redemptions language sql security invoker set search_path='' as
$$select bottleup_private.request_airtime_reward(p_reward_id, p_request_key, p_network)$$;

-- 5. process_airtime_result(): the only path that can resolve a 'processing'
--    airtime/data redemption. service_role only — this is how we keep the
--    "fully automatic" flow from also being "the client can mark its own
--    reward fulfilled".

create or replace function bottleup_private.process_airtime_result(p_id uuid, p_status text, p_provider text, p_provider_request_id text, p_provider_response jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.reward_redemptions;
begin
  if p_status is null or p_status not in ('fulfilled','failed') then raise exception 'Invalid airtime result status'; end if;
  select * into r from public.reward_redemptions where id = p_id for update;
  if not found then raise exception 'Reward request not found'; end if;
  if r.kind not in ('airtime','data') then raise exception 'Not an airtime or data redemption'; end if;
  if r.status <> 'processing' then raise exception 'This redemption already has a result'; end if;
  if p_status = 'failed' then perform bottleup_private.post_points(r.user_id, 'refund', r.cost, null, r.id); end if;
  update public.reward_redemptions set
    status = p_status, fulfilled_at = now(),
    provider = p_provider, provider_request_id = p_provider_request_id, provider_response = p_provider_response
  where id = r.id;
  insert into public.notifications(user_id, message) values (
    r.user_id,
    case when p_status = 'fulfilled' then r.reward_name || ' delivered to your phone.'
         else r.reward_name || ' could not be delivered — your points were refunded.' end
  );
end $$;

create or replace function public.process_airtime_result(p_id uuid, p_status text, p_provider text default null, p_provider_request_id text default null, p_provider_response jsonb default null)
returns void language sql security invoker set search_path='' as
$$select bottleup_private.process_airtime_result(p_id, p_status, p_provider, p_provider_request_id, p_provider_response)$$;

-- 6. Grants — every new function defaults to EXECUTE for PUBLIC (i.e.
--    everyone, anon included); revoke that first, then grant deliberately.
--    The public wrapper is `security invoker`, so the calling role needs
--    EXECUTE on the bottleup_private function too, not just the wrapper —
--    same two-layer grant request_reward/decide_redemption already use.
revoke all on function public.request_airtime_reward(text, uuid, text) from public, anon, authenticated;
revoke all on function bottleup_private.request_airtime_reward(text, uuid, text) from public, anon, authenticated;
grant execute on function public.request_airtime_reward(text, uuid, text) to authenticated;
grant execute on function bottleup_private.request_airtime_reward(text, uuid, text) to authenticated;

revoke all on function public.process_airtime_result(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function bottleup_private.process_airtime_result(uuid, text, text, text, jsonb) from public, anon, authenticated;
-- The invoker wrapper's body references bottleup_private by name, which
-- needs schema USAGE for the calling role (service_role), same as
-- authenticated already has from the points-ledger migration.
grant usage on schema bottleup_private to service_role;
grant execute on function public.process_airtime_result(uuid, text, text, text, jsonb) to service_role;
grant execute on function bottleup_private.process_airtime_result(uuid, text, text, text, jsonb) to service_role;

commit;
