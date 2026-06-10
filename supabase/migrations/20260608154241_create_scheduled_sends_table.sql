-- PRD-027 D-15 — scheduled sends. text PK; faker → no seed.
create table if not exists public.scheduled_sends (
  id text primary key,
  store_id text not null references public.stores (id),
  conversation_id text not null references public.conversations (id),
  scheduled_for timestamptz not null,
  payload jsonb not null,
  status text not null default 'pending',
  failure_reason text,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_sends_conversation_id_idx on public.scheduled_sends (conversation_id);
create index if not exists scheduled_sends_status_scheduled_for_idx on public.scheduled_sends (status, scheduled_for);
create index if not exists scheduled_sends_store_id_idx on public.scheduled_sends (store_id);

alter table public.scheduled_sends enable row level security;
drop policy if exists scheduled_sends_select_poc_temp on public.scheduled_sends;
create policy scheduled_sends_select_poc_temp on public.scheduled_sends for select to anon, authenticated using (true);
