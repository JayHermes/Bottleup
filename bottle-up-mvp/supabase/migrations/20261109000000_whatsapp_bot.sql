-- WhatsApp Bot V1
-- Persistent conversation state survives Edge Function restarts.
create table if not exists public.whatsapp_sessions (
  phone text primary key,
  state text not null default 'idle',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.whatsapp_sessions enable row level security;
revoke all on public.whatsapp_sessions from public, anon, authenticated;
create index if not exists whatsapp_sessions_updated_at_idx
  on public.whatsapp_sessions(updated_at);
comment on table public.whatsapp_sessions is
  'Short-lived conversation state for the BottleUp WhatsApp bot; identity remains in profiles/auth.users.';
