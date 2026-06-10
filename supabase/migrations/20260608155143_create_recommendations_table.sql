-- PRD-053 — proactive analytics/IA insights. text PK; faker → no seed.
create table if not exists public.recommendations (
  id text primary key,
  store_id text not null references public.stores (id),
  seller_id text not null references public.sellers (id),
  subject_id text not null references public.customers (id),
  type text not null,
  priority text not null,
  title text not null,
  description text not null,
  action_href text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists recommendations_store_id_idx on public.recommendations (store_id);
create index if not exists recommendations_seller_id_idx on public.recommendations (seller_id);
create index if not exists recommendations_subject_id_idx on public.recommendations (subject_id);
create index if not exists recommendations_resolved_idx on public.recommendations (resolved);
create index if not exists recommendations_type_idx on public.recommendations (type);

alter table public.recommendations enable row level security;
drop policy if exists recommendations_select_poc_temp on public.recommendations;
create policy recommendations_select_poc_temp on public.recommendations for select to anon, authenticated using (true);
