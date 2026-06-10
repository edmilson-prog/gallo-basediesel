-- PRD-046 — product indicators (metric target over a product slice). text PK; faker → no seed.
create table if not exists public.product_indicators (
  id text primary key,
  store_id text not null references public.stores (id),
  name text not null,
  selector jsonb not null,
  metric text not null,
  scope_level text not null,
  seller_id text references public.sellers (id),
  period jsonb not null,
  target_value numeric not null,
  status text not null,
  division text,
  reward_description text,
  created_by text not null,
  cancel_reason text,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index if not exists product_indicators_store_id_idx on public.product_indicators (store_id);
create index if not exists product_indicators_seller_id_idx on public.product_indicators (seller_id);
create index if not exists product_indicators_status_idx on public.product_indicators (status);
create index if not exists product_indicators_scope_level_idx on public.product_indicators (scope_level);

alter table public.product_indicators enable row level security;
drop policy if exists product_indicators_select_poc_temp on public.product_indicators;
create policy product_indicators_select_poc_temp on public.product_indicators for select to anon, authenticated using (true);
