-- PRD-027 "Dispatch" — asset library (4 tables). created_by is a plain text
-- actor id (no FK: profiles PK is auth_user_id/uuid, not a text id). faker → no seed.
create table if not exists public.asset_library_items (
  id               text primary key,
  store_id         text not null references public.stores (id),
  division         text not null default 'parts',
  title            text not null,
  category         text not null,
  brand            text,
  product_line     text,
  kind             text not null,
  storage_ref      text,
  media_asset_id   text,
  url              text,
  version          integer not null default 1,
  previous_version jsonb,
  status           text not null default 'draft',
  sensitivity      text not null default 'normal',
  allowed_role_ids text[],
  created_by       text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists asset_library_items_store_id_idx on public.asset_library_items (store_id);
create index if not exists asset_library_items_status_idx on public.asset_library_items (status);
create index if not exists asset_library_items_category_idx on public.asset_library_items (category);
create index if not exists asset_library_items_updated_at_idx on public.asset_library_items (updated_at desc);

create table if not exists public.asset_combos (
  id         text primary key,
  store_id   text not null references public.stores (id),
  title      text not null,
  asset_ids  text[] not null default '{}',
  owner_id   text not null references public.sellers (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists asset_combos_store_id_idx on public.asset_combos (store_id);

create table if not exists public.asset_favorites (
  seller_id  text not null references public.sellers (id),
  asset_id   text not null references public.asset_library_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (seller_id, asset_id)
);
create index if not exists asset_favorites_seller_id_idx on public.asset_favorites (seller_id);

create table if not exists public.asset_send_log (
  id         text primary key,
  seller_id  text not null references public.sellers (id),
  asset_id   text not null references public.asset_library_items (id) on delete cascade,
  sent_at    timestamptz not null default now()
);
create index if not exists asset_send_log_seller_id_idx on public.asset_send_log (seller_id, sent_at desc);
create index if not exists asset_send_log_asset_id_idx on public.asset_send_log (asset_id);

alter table public.asset_library_items enable row level security;
alter table public.asset_combos enable row level security;
alter table public.asset_favorites enable row level security;
alter table public.asset_send_log enable row level security;
drop policy if exists asset_library_items_select_poc_temp on public.asset_library_items;
create policy asset_library_items_select_poc_temp on public.asset_library_items for select to anon, authenticated using (true);
drop policy if exists asset_combos_select_poc_temp on public.asset_combos;
create policy asset_combos_select_poc_temp on public.asset_combos for select to anon, authenticated using (true);
drop policy if exists asset_favorites_select_poc_temp on public.asset_favorites;
create policy asset_favorites_select_poc_temp on public.asset_favorites for select to anon, authenticated using (true);
drop policy if exists asset_send_log_select_poc_temp on public.asset_send_log;
create policy asset_send_log_select_poc_temp on public.asset_send_log for select to anon, authenticated using (true);
