-- Additive migration. Does not modify Bottle Up's existing pickup verification flow.
alter table public.pickup_requests
  add column if not exists solana_receipt_address text,
  add column if not exists solana_tx_signature text,
  add column if not exists solana_receipt_status text not null default 'not_requested',
  add column if not exists solana_receipt_error text,
  add column if not exists solana_recorded_at timestamptz;

alter table public.pickup_requests
  drop constraint if exists pickup_requests_solana_receipt_status_check;

alter table public.pickup_requests
  add constraint pickup_requests_solana_receipt_status_check
  check (solana_receipt_status in ('not_requested', 'pending', 'submitted', 'confirmed', 'failed'));

create unique index if not exists pickup_requests_solana_tx_signature_unique
  on public.pickup_requests (solana_tx_signature)
  where solana_tx_signature is not null;

create unique index if not exists pickup_requests_solana_receipt_address_unique
  on public.pickup_requests (solana_receipt_address)
  where solana_receipt_address is not null;
