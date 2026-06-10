-- PRD-115+ : public.leads (lead pipeline). text PK ('lead-...'); faker → no seed.
create table if not exists public.leads (
  id                        text primary key,
  store_id                  text not null references public.stores (id),
  seller_id                 text not null references public.sellers (id),
  name                      text not null,
  phone                     text not null,
  email                     text,
  stage                     jsonb not null,
  temperature               text not null,
  origin                    text not null,
  estimated_value           numeric,
  next_action_at            timestamptz,
  loss_reason               text,
  loss_notes                text,
  converted_to_customer_id  text references public.customers (id),
  conversations             text[] not null default '{}',
  tags                      text[] not null default '{}',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists leads_store_id_idx on public.leads (store_id);
create index if not exists leads_seller_id_idx on public.leads (seller_id);
create index if not exists leads_temperature_idx on public.leads (temperature);
create index if not exists leads_updated_at_idx on public.leads (updated_at desc);
create index if not exists leads_converted_to_customer_id_idx on public.leads (converted_to_customer_id);
create index if not exists leads_stage_gin_idx on public.leads using gin (stage);

alter table public.leads enable row level security;

drop policy if exists "leads_select_poc_temp" on public.leads;
create policy "leads_select_poc_temp"
  on public.leads for select to anon, authenticated using (true);
