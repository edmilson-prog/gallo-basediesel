-- PRD-055 — cashflow: stores ONLY manual movements (aporte/retirada); derived
-- movements + projections are computed at read time. text PK; faker → no seed.
create table if not exists public.cash_flow_entries (
  id          text primary key,
  type        text not null,
  source      text not null,
  source_id   text,
  description text not null,
  amount      numeric not null,
  date        timestamptz not null,
  status      text not null default 'realizado',
  store_id    text not null references public.stores (id),
  created_by  text references public.sellers (id),
  created_at  timestamptz not null default now()
);

create index if not exists cash_flow_entries_store_id_idx on public.cash_flow_entries (store_id);
create index if not exists cash_flow_entries_date_idx on public.cash_flow_entries (date);

alter table public.cash_flow_entries enable row level security;
drop policy if exists "cash_flow_entries_select_poc_temp" on public.cash_flow_entries;
create policy "cash_flow_entries_select_poc_temp" on public.cash_flow_entries for select to anon, authenticated using (true);
