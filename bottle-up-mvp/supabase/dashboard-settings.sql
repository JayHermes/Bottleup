-- Run after schema.sql in the project's SQL editor. Safe to run again.
-- Client uses the authenticated user's JWT; no service key belongs in the browser.
create table if not exists public.bank_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bank_name text not null check (length(trim(bank_name)) between 1 and 100),
  account_holder text not null check (length(trim(account_holder)) between 1 and 120),
  account_number text not null check (account_number ~ '^[0-9]{10}$')
);
alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from anon, authenticated;
grant select, insert, update, delete on public.bank_accounts to authenticated;
drop policy if exists bank_account_owner on public.bank_accounts;
create policy bank_account_owner on public.bank_accounts for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
