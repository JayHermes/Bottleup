-- Restore reads by the deployed frontend while the airtime/OTP backend is
-- staged separately. Do not mark phones verified or activate paid fulfilment.
alter table public.profiles add column if not exists phone_verified_at timestamptz;
alter table public.reward_catalog add column if not exists kind text not null default 'manual';
alter table public.reward_catalog add column if not exists network text;
notify pgrst, 'reload schema';
