-- PRD-101/104 — parts catalog. text PK ('part-...'); faker-generated → no seed.
create table if not exists public.parts (
  id                    text primary key,
  sku                   text not null,
  name                  text not null,
  description           text,
  oem_codes             text[] not null default '{}',
  equivalent_part_ids   text[] not null default '{}',
  cross_references      jsonb,
  segment               text,
  application_notes     text,
  applications          jsonb not null default '[]'::jsonb,
  brand                 text not null,
  supplier              text not null,
  category              text,
  subcategory           text,
  is_original           boolean,
  image_url             text,
  unit_cost             numeric not null default 0,
  unit_price            numeric not null default 0,
  margin_percent        numeric not null default 0,
  gtin                  text,
  sefaz_status          text,
  sefaz_checked_at      timestamptz,
  supplier_code         text,
  reference             text,
  group_label           text,
  part_type             text,
  price_tables          jsonb,
  fiscal                jsonb,
  weight_kg             numeric,
  storage_location      text,
  box_quantity          integer,
  fractionable          boolean,
  unit_of_measure       text,
  suppliers             jsonb,
  average_cost          numeric,
  stock_available       integer not null default 0,
  stock_minimum         integer not null default 0,
  division              text not null default 'parts',
  active                boolean not null default true,
  store_id              text references public.stores (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- Flattened OEM codes for substring ILIKE search; maintained by trigger
  -- (array_to_string isn't immutable enough for a generated column here).
  oem_codes_text        text
);

create or replace function public.parts_set_oem_codes_text()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.oem_codes_text := array_to_string(new.oem_codes, ' ');
  return new;
end;
$$;

drop trigger if exists parts_oem_codes_text_biu on public.parts;
create trigger parts_oem_codes_text_biu
  before insert or update on public.parts
  for each row execute function public.parts_set_oem_codes_text();

create index if not exists parts_store_id_idx on public.parts (store_id);
create index if not exists parts_brand_idx on public.parts (brand);
create index if not exists parts_active_idx on public.parts (active);
create index if not exists parts_category_idx on public.parts (category);
create index if not exists parts_stock_available_idx on public.parts (stock_available);
create index if not exists parts_oem_codes_gin_idx on public.parts using gin (oem_codes);

alter table public.parts enable row level security;

drop policy if exists "parts_select_poc_temp" on public.parts;
create policy "parts_select_poc_temp"
  on public.parts for select to anon, authenticated using (true);
