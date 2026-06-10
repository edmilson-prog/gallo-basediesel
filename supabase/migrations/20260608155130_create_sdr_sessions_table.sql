-- PRD-020/024 — SDR agent session store. text PK; faker → no seed.
create table if not exists public.sdr_sessions (
  id text primary key,
  conversation_id text not null references public.conversations (id),
  state text not null,
  collected_data jsonb not null default '{}'::jsonb,
  last_activity_at timestamptz not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  finish_reason text,
  paused_from_state text
);
create index if not exists sdr_sessions_conversation_id_idx on public.sdr_sessions (conversation_id);
create index if not exists sdr_sessions_state_idx on public.sdr_sessions (state);
create index if not exists sdr_sessions_started_at_idx on public.sdr_sessions (started_at desc);

alter table public.sdr_sessions enable row level security;
drop policy if exists sdr_sessions_select_poc_temp on public.sdr_sessions;
create policy sdr_sessions_select_poc_temp on public.sdr_sessions for select to anon, authenticated using (true);
