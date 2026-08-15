-- Part categories catalog — makes the part taxonomy user-manageable.
--
-- Until now the ten families lived only in TypeScript. This table does NOT
-- replace them: it is an override-and-extend layer. A row either customises a
-- built-in family (same `value`) or introduces a new one. The built-ins remain
-- in code as the guaranteed fallback, so the application behaves exactly as it
-- does today while this table is empty — which is how it ships.
--
-- The join key is `value`, not `id`: `parts.category` is plain `text` and
-- predates this table (see 20260608150303_create_parts_table_v2.sql), and it is
-- deliberately left unconstrained. Adding a foreign key now would reject the
-- ~1.981 parts whose category is NULL and every historical
-- `order_items.part_category` snapshot.
--
-- Writes are Owner-STRICT, mirroring conversation_tags (20260703120000).
create table if not exists public.part_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  -- Slug written to parts.category. Lowercase kebab so it is URL- and
  -- filter-safe; the app derives it from the label on creation.
  value text not null,
  label text not null,
  -- Iconify name (e.g. 'mdi:air-filter'), resolved at runtime.
  icon text not null default 'mdi:cube-outline',
  -- Curated palette id (e.g. 'emerald'), NOT a Tailwind class: Tailwind
  -- generates classes by scanning source at build time, so a class string
  -- stored here would never exist in the stylesheet.
  color text not null default 'slate',
  position integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint part_categories_value_format
    check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint part_categories_label_not_blank
    check (length(btrim(label)) > 0)
);

comment on table public.part_categories is
  'User-managed part families. Overrides/extends the built-in taxonomy; parts.category stores `value`.';
comment on column public.part_categories.value is
  'Slug stored in parts.category — the join key. Immutable once parts reference it.';
comment on column public.part_categories.color is
  'Curated palette id resolved to static Tailwind classes in the app, never a class string.';

-- One row per family per store, and no two families sharing a display name.
create unique index if not exists part_categories_store_value_uq
  on public.part_categories (store_id, value);
create unique index if not exists part_categories_store_label_uq
  on public.part_categories (store_id, lower(label));
create index if not exists part_categories_store_idx
  on public.part_categories (store_id);

alter table public.part_categories enable row level security;

-- SELECT: any authenticated member of the store — the taxonomy drives filters,
-- pickers and grouped views for every role.
create policy part_categories_select
  on public.part_categories for select to authenticated
  using (store_id = (select public.current_store_id()));

-- Writes: Owner only (strict — fail-closed via NULL semantics of `= 'owner'`).
create policy part_categories_insert
  on public.part_categories for insert to authenticated
  with check (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );

create policy part_categories_update
  on public.part_categories for update to authenticated
  using (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  )
  with check (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );

create policy part_categories_delete
  on public.part_categories for delete to authenticated
  using (
    (select public.current_app_role()) = 'owner'
    and store_id = (select public.current_store_id())
  );
