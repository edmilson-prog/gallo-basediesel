-- PRD-016/104 — vehicles (fleet members owned by a customer). text PK.
create table if not exists public.vehicles (
  id text primary key,
  customer_id text not null references public.customers (id),
  brand text not null,
  model text not null,
  year integer not null,
  engine text not null,
  model_id text,
  plate text,
  vin text,
  current_km integer,
  service_history jsonb not null default '[]'::jsonb,
  cadastro_status text not null,
  created_at timestamptz not null default now()
);

create index if not exists vehicles_customer_id_idx on public.vehicles (customer_id);
create index if not exists vehicles_brand_idx on public.vehicles (brand);
create index if not exists vehicles_cadastro_status_idx on public.vehicles (cadastro_status);
create index if not exists vehicles_created_at_idx on public.vehicles (created_at);

alter table public.vehicles enable row level security;

drop policy if exists "vehicles_select_poc_temp" on public.vehicles;
create policy "vehicles_select_poc_temp"
  on public.vehicles for select to anon, authenticated using (true);
