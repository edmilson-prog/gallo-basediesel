-- Supplier as a first-class entity (ui_kit `financeiro`, fatia 1).
--
-- Four parts, deliberately in one file because they are one change:
--   1. the table
--   2. RLS mirroring `expenses` (financial data is staff-only)
--   3. the `supplier` RBAC resource — WITHOUT this the sidebar entry is hidden
--      from every role, Owner included (the app hydrates from these tables,
--      not from the TypeScript matrix)
--   4. backfill from `parts.supplier`, which is where supplier names live today
--
-- id/store_id are uuid, NOT text. `expenses` (the table part 1 otherwise
-- mirrors) still shows `text` in its original creation migration
-- (20260608152916), but that predates the project-wide text->uuid conversion
-- (20260608182429_convert_reference_pks_to_uuid.sql), which rewrote every
-- reference PK/FK in `public` to uuid. Every table created since — pix_keys,
-- contacts, conversation_pins, nps_schema, ... — uses
-- `id uuid primary key default gen_random_uuid()` and uuid FKs to
-- stores/sellers, and public.current_store_id() (used by the RLS policies
-- below) itself returns uuid. A text id/store_id here would make the foreign
-- key and the RLS predicate fail to apply (uuid = text has no operator); see
-- the same note in 20260807130000_create_pix_keys_table.sql.

------------------------------------------------------------------ 1. table
create table if not exists public.suppliers (
  id                       uuid primary key default gen_random_uuid(),
  store_id                 uuid not null references public.stores (id),
  name                     text not null,
  trade_name               text,
  document                 text,
  category                 text not null default 'parts' check (category = any (array[
                             'parts','services','freight','financial'
                           ]::text[])),
  payment_terms            text,
  lead_time_days           integer check (lead_time_days is null or lead_time_days >= 0),
  contact_name             text,
  contact_phone            text,
  preferred_payment_method text check (preferred_payment_method is null or preferred_payment_method = any (array[
                             'boleto','pix','transferencia','debito_automatico'
                           ]::text[])),
  supplied_items           text[] not null default '{}'::text[],
  status                   text not null default 'active' check (status = any (array[
                             'active','inactive'
                           ]::text[])),
  registry_status          text,
  registry_activity        text,
  city                     text,
  state                    text,
  source                   text not null default 'manual' check (source = any (array[
                             'manual','catalog_backfill'
                           ]::text[])),
  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists suppliers_store_id_idx on public.suppliers (store_id);
create index if not exists suppliers_status_idx on public.suppliers (store_id, status);
create index if not exists suppliers_category_idx on public.suppliers (store_id, category);

-- One CNPJ per store, but many records may legitimately have none yet.
create unique index if not exists suppliers_store_document_key
  on public.suppliers (store_id, document)
  where document is not null;

------------------------------------------------------------------ 2. RLS
-- Mirrors expenses (20260609003351_rls_slice2_financial_staff_only.sql): a
-- non-staff seller reads nothing. Supplier carries payment terms and, once
-- `payable` lands, purchase amounts — that is cost data.
alter table public.suppliers enable row level security;

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (store_id = public.current_store_id() and public.is_staff());

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (store_id = public.current_store_id() and public.is_staff());

------------------------------------------------------------------ 3. RBAC seed
-- Grants agreed with the owner: Owner, Gestor and Financeiro. Vendedor stays
-- out — same cost/margin boundary already applied in the catalog.
-- sort_order 27 appends Fornecedores after the Financeiro group's existing
-- scale (Despesas 22, DRE Gerencial 23, Estoque 24, Fluxo de Caixa 25,
-- Rentabilidade 26) instead of reordering the group's front.
insert into public.rbac_resources (key, label, "group", sort_order)
values ('supplier', 'Fornecedores', 'Financeiro', 27)
on conflict (key) do nothing;

insert into public.role_permissions (role_id, resource, actions, scope)
values
  ('Owner',      'supplier', array['view','create','edit','delete'], 'all'),
  ('Gestor',     'supplier', array['view','create','edit'],          'store'),
  ('Financeiro', 'supplier', array['view','create','edit'],          'store')
on conflict (role_id, resource) do nothing;

------------------------------------------------------------------ 4. backfill
-- `parts.supplier` holds 127 distinct strings over 4.005 parts; 3.311 of those
-- parts say "Não informado". The normalization below MUST agree with
-- src/features/suppliers/engine/supplierName.ts — same placeholder rejection,
-- same &amp; decoding, same UFI alias, same title-casing of all-caps names.
--
-- Accent folding uses `translate`, not `unaccent`: the `unaccent` extension is
-- not installed on this project (pg_extension holds only pg_cron, pg_net,
-- pg_stat_statements, pg_trgm, pgcrypto, plpgsql, supabase_vault, uuid-ossp),
-- and on this Supabase project extensions live in the `extensions` schema, not
-- `public`, so an unqualified `unaccent(...)` call would fail even after
-- installing it. This migration already needs the owner's explicit sign-off
-- to apply in production; asking for a new extension on top of that raises
-- that ask without need. `translate` is deterministic, needs no privilege and
-- no schema qualification, and covers the Brazilian company names this
-- backfill actually compares — its three uses below are placeholder
-- rejection, the UFI alias, and dedupe grouping.
--
-- `id` is derived deterministically (md5 of the dedupe key + store, cast to
-- uuid) instead of gen_random_uuid(), so re-running this backfill is
-- idempotent via `on conflict (id) do nothing` rather than creating
-- duplicate suppliers on a second apply.
--
-- All-caps names are title-cased with `initcap`, then have connector words
-- (de/da/do/das/dos/e/em/para) lowercased back down to match
-- `titleCaseWord()` in the TS engine — these are display names in a
-- Brazilian product, and "Pako Distribuidora De Auto Pecas" reads as wrong
-- Portuguese. The leading-space form of each `replace` (`' De ' -> ' de '`)
-- means a connector word can only be lowercased when something precedes it,
-- so a name that legitimately STARTS with one of these words is left
-- capitalized — mirroring the engine's `index > 0` guard exactly.
-- `replace` (not `regexp_replace`) on purpose: Postgres regexes cannot
-- case-fold a captured backreference, so there is no single-pass regex that
-- both matches and lowercases the connector in one step.
with cleaned as (
  select
    replace(btrim(p.supplier), '&amp;', '&') as raw,
    regexp_replace(
      translate(
        lower(replace(btrim(p.supplier), '&amp;', '&')),
        'áàâãäéèêëíìîïóòôõöúùûüçñ',
        'aaaaaeeeeiiiiooooouuuucn'
      ),
      '\s+', ' ', 'g'
    ) as key,
    p.store_id
  from public.parts p
  where btrim(coalesce(p.supplier, '')) <> ''
),
filtered as (
  select * from cleaned
  where key not in ('nao informado', 'sem fornecedor', 'n a', '-')
),
canonical as (
  select
    store_id,
    case
      when key in ('ufi', 'ufi filters') then 'UFI Filters'
      when raw = upper(raw) then
        replace(replace(replace(replace(replace(replace(replace(replace(
          initcap(raw),
          ' De ', ' de '), ' Da ', ' da '), ' Do ', ' do '),
          ' Das ', ' das '), ' Dos ', ' dos '), ' E ', ' e '),
          ' Em ', ' em '), ' Para ', ' para ')
      else raw
    end as name,
    case
      when key in ('ufi', 'ufi filters') then 'ufi filters'
      else key
    end as dedupe_key
  from filtered
)
insert into public.suppliers (id, store_id, name, category, source, supplied_items)
select
  md5(dedupe_key || store_id::text)::uuid,
  store_id,
  min(name),
  'parts',
  'catalog_backfill',
  '{}'::text[]
from canonical
group by dedupe_key, store_id
on conflict (id) do nothing;
