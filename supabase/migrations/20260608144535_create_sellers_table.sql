-- PRD-101 slice: crm sellers (kept in public for now; text PK preserves the
-- stable mock ids referenced across seed entities). Maps to ISeller
-- (src/shared/types/people.ts).

create table public.sellers (
  id                   text primary key,
  store_id             text not null references public.stores (id) on delete restrict,
  auth_user_id         uuid unique references auth.users (id) on delete set null,
  full_name            text not null,
  email                text not null unique,
  phone                text,
  type                 text not null check (type in ('internal', 'external', 'representative')),
  availability         text not null default 'offline'
                         check (availability in ('online', 'ausente', 'ocupado', 'offline')),
  divisions            text[] not null default '{parts}',
  theme_preference     jsonb,
  region               text,
  commission_tier      text check (commission_tier is null
                         or commission_tier in ('junior', 'pleno', 'senior', 'master')),
  parent_seller_id     text references public.sellers (id) on delete set null,
  commission_rule      jsonb,
  vehicle_cadastro_mode text,
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table public.sellers is
  'Sales team (staff/external/representative). Maps to ISeller (people.ts). PRD-101.';

create index idx_sellers_store_id on public.sellers (store_id);
create index idx_sellers_active on public.sellers (active);

-- Now that sellers exists, give profiles.seller_id referential integrity.
alter table public.profiles
  add constraint profiles_seller_id_fkey
  foreign key (seller_id) references public.sellers (id) on delete set null;

-- RLS on (advisor requires it). TEMP permissive read until PRD-103 (per-store,
-- role-aware policies) + the access-token hook land. Same POC stance as stores.
alter table public.sellers enable row level security;

create policy "sellers_select_poc_temp"
  on public.sellers
  for select
  to anon, authenticated
  using (true);

-- Seed: the 6 mock sellers (src/mocks/data/seedSellers.ts), stable ids preserved.
insert into public.sellers (id, store_id, full_name, email, phone, type, availability, divisions, region, commission_tier, active, created_at)
values
  ('seller-joao-gallo',      'store-matriz', 'Fernando Mello Muniz Gallo', 'fernando@gallobasediesel.com.br', '(55) 99800-0001', 'internal', 'online',  '{parts}', null,           null,    true, '2026-01-01T08:00:00.000Z'),
  ('seller-marina-cardoso',  'store-matriz', 'Marina Cardoso',             'marina@gallobasediesel.com.br',   '(55) 99800-0003', 'internal', 'ausente', '{parts}', null,           null,    true, '2026-01-10T08:00:00.000Z'),
  ('seller-carlos-santos',   'store-matriz', 'Lucas Costa',                'lucas@gallobasediesel.com.br',    '(55) 99800-0002', 'internal', 'online',  '{parts}', null,           null,    true, '2026-01-05T08:00:00.000Z'),
  ('seller-rafael-lima',     'store-matriz', 'Cauan Bulegon',              'caua@gallobasediesel.com.br',     '(55) 99800-0004', 'internal', 'ocupado', '{parts}', null,           null,    true, '2026-01-12T08:00:00.000Z'),
  ('seller-ramon-schimidt',  'store-matriz', 'Ramon Schimidt',             'ramon@gallobasediesel.com.br',    '(55) 99800-0005', 'internal', 'online',  '{parts}', null,           null,    true, '2026-01-15T08:00:00.000Z'),
  ('seller-welligton-nunes', 'store-matriz', 'Welligton Nunes',            'welligton@gallobasediesel.com.br','(55) 99800-0006', 'external', 'online',  '{parts}', 'Noroeste RS', 'pleno', true, '2026-01-18T08:00:00.000Z')
on conflict (id) do nothing;
