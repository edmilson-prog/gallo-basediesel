-- PRD-034/035 — model kits (parent + child). DDL ONLY; the static items seed
-- references part-ufi-* ids absent from the empty (faker) parts table, so the
-- seed is deferred to the data-migration step (would violate the part FK now).
create table if not exists public.model_kits (
  id          text primary key,
  model_id    text not null references public.vehicle_models (id) on delete cascade,
  store_id    text not null references public.stores (id) on delete cascade,
  name        text not null,
  category    text not null,
  status      text not null default 'rascunho',
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists model_kits_model_id_idx on public.model_kits (model_id);
create index if not exists model_kits_store_id_idx on public.model_kits (store_id);
create index if not exists model_kits_status_idx on public.model_kits (status);

create table if not exists public.model_kit_items (
  id               text primary key,
  kit_id           text not null references public.model_kits (id) on delete cascade,
  part_id          text not null references public.parts (id) on delete restrict,
  default_quantity integer not null default 1,
  is_optional      boolean not null default false,
  note             text
);
create index if not exists model_kit_items_kit_id_idx on public.model_kit_items (kit_id);
create index if not exists model_kit_items_part_id_idx on public.model_kit_items (part_id);

alter table public.model_kits enable row level security;
alter table public.model_kit_items enable row level security;
drop policy if exists model_kits_select_poc_temp on public.model_kits;
create policy model_kits_select_poc_temp on public.model_kits for select to anon, authenticated using (true);
drop policy if exists model_kit_items_select_poc_temp on public.model_kit_items;
create policy model_kit_items_select_poc_temp on public.model_kit_items for select to anon, authenticated using (true);
