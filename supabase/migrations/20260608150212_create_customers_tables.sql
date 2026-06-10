-- PRD-110+ — customers (B2B/B2C discriminated union as nullable columns) + notes.
-- Faker-generated → no seed.
create table if not exists public.customers (
  id                      text primary key,
  store_id                text not null references public.stores (id),
  type                    text not null check (type in ('B2B', 'B2C')),
  email                   text,
  phone                   text not null,
  address                 jsonb,
  seller_id               text not null references public.sellers (id),
  status                  text not null check (status in ('ativo', 'dormente', 'recuperacao', 'perdido')),
  tags                    text[] not null default '{}',
  first_purchase_at       timestamptz,
  last_purchase_at        timestamptz,
  converted_from_lead_id  text,
  converted_from_lead_at  timestamptz,
  converted_by_seller_id  text references public.sellers (id),
  purchase_stats          jsonb,
  abc_class               text check (abc_class in ('A', 'B', 'C')),
  abc_share               numeric,
  overdue_titles_count    integer,
  portal                  jsonb,
  is_guest_checkout       boolean,
  has_b2b_portal          boolean,
  portal_contract         jsonb,
  cnpj                    text,
  razao_social            text,
  nome_fantasia           text,
  contact_name            text,
  cpf                     text,
  full_name               text,
  created_at              timestamptz not null default now()
);

create index if not exists customers_store_id_idx on public.customers (store_id);
create index if not exists customers_seller_id_idx on public.customers (seller_id);
create index if not exists customers_status_idx on public.customers (status);
create index if not exists customers_type_idx on public.customers (type);
create index if not exists customers_has_b2b_portal_idx on public.customers (has_b2b_portal);
create index if not exists customers_created_at_idx on public.customers (created_at);

alter table public.customers enable row level security;

drop policy if exists "customers_select_poc_temp" on public.customers;
create policy "customers_select_poc_temp"
  on public.customers for select to anon, authenticated using (true);

create table if not exists public.customer_notes (
  id           text primary key,
  customer_id  text not null references public.customers (id) on delete cascade,
  author_id    text not null references public.sellers (id),
  content      text not null,
  created_at   timestamptz not null default now()
);

create index if not exists customer_notes_customer_id_idx on public.customer_notes (customer_id);
create index if not exists customer_notes_created_at_idx on public.customer_notes (created_at);

alter table public.customer_notes enable row level security;

drop policy if exists "customer_notes_select_poc_temp" on public.customer_notes;
create policy "customer_notes_select_poc_temp"
  on public.customer_notes for select to anon, authenticated using (true);
