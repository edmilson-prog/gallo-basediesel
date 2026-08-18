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

-- No standalone store_id-only index: it would be a leading-column subset of
-- both composites below, so Postgres already serves a store_id-only lookup
-- from either one — a third index would only cost write throughput.
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
--
-- `is_staff()` alone is NOT enough for select/insert/update: it resolves to
-- `current_app_role() in ('owner','manager')` and excludes 'financeiro'. The
-- RBAC seed below (part 3) grants Financeiro view/create/edit on this
-- resource — that is the decision taken with the owner ("Quem enxerga:
-- Owner, Gestor, Financeiro", see the spec) — so a policy gated on
-- `is_staff()` alone would leave a Financeiro user with the menu item and
-- the RBAC grant but every query returning zero rows. Same idiom already
-- used for `audit_logs_select` in
-- 20260609163912_rls_fase2_43_tighten_audit_transfers_media.sql:11.
--
-- `delete` is the ONE exception — see its own comment below: the RBAC seed
-- grants `delete` to Owner alone, so `suppliers_delete` does NOT get the
-- `is_staff()`-or-financeiro treatment the other three do.
alter table public.suppliers enable row level security;

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or public.current_app_role() = 'financeiro')
  );

drop policy if exists suppliers_insert on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (
    store_id = public.current_store_id()
    and (public.is_staff() or public.current_app_role() = 'financeiro')
  );

drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers for update to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or public.current_app_role() = 'financeiro')
  )
  with check (
    store_id = public.current_store_id()
    and (public.is_staff() or public.current_app_role() = 'financeiro')
  );

-- Deliberately TIGHTER than select/insert/update above: the RBAC seed
-- (part 3, below) grants `delete` on `supplier` to Owner ONLY — Gestor and
-- Financeiro get view/create/edit, no delete. A policy admitting
-- `is_staff()` here would over-grant Gestor (`is_staff()` is true for both
-- owner and manager); admitting the financeiro branch used by the other
-- three policies would over-grant Financeiro. Either lets a role delete
-- through the API what the RBAC matrix says it cannot — RLS is the actual
-- enforcement point, so it has to match the seed's grant exactly, not
-- just be "at least as permissive" as the read/write policies beside it.
drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (
    store_id = public.current_store_id()
    and public.current_app_role() = 'owner'
  );

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
-- Portuguese. Each connector is fixed with its own `regexp_replace`, not a
-- plain `replace(' De ', ' de ')`: a padded-string match needs a space on
-- BOTH sides, so a connector that is the LAST word of a name (there is real
-- data like this — a raw supplier ending "... AUTOMOTIVOS E") would never be
-- matched and would stay capitalized. `(?<= )` is a fixed-width lookbehind
-- that asserts the preceding space without consuming it (so two adjacent
-- connectors both get fixed), and `\y` is Postgres's word-boundary escape,
-- which treats end-of-string as a boundary too — closing exactly the
-- trailing-word case above. Requiring the preceding space (rather than just
-- `\y` on both sides) preserves the engine's `index > 0` guard, so a name
-- that legitimately STARTS with a connector is left alone. Verified against
-- production data in task-2-report.md before this was committed.
with cleaned as (
  select
    replace(btrim(p.supplier), '&amp;', '&') as raw,
    -- `key` is the dedupe/placeholder-matching value, not the display name.
    -- It intentionally does NOT decode `&nbsp;` or strip `.`/`,` the way
    -- normalizeSupplierName() in the TS engine does — measured against
    -- production `parts.supplier`, zero rows contain `&nbsp;` and including
    -- the punctuation-to-space step doesn't change the distinct-key count
    -- (still 125 either way), so both gaps are currently inert. Left as-is
    -- rather than chasing a zero-impact difference; would need attention if
    -- a future import ever introduces either.
    --
    -- A THIRD gap existed here — `key` did not strip trailing legal-form
    -- suffixes (ltda|me|epp|eireli|s a|sa|s/a) the way normalizeSupplierName()
    -- does when building the join key `stats()`/`statsMany()` use at runtime
    -- (src/providers/data/impl/supabase/suppliers.ts `joinKey()`). Unlike the
    -- two gaps above, this one was NOT inert: measured against production
    -- `parts.supplier`, "Auto Vans Pecas Eireli ME" (4 peças) and "AUTO VANS
    -- PECAS LTDA" (1 peça) got distinct `key`s here — so this backfill would
    -- have created two separate `suppliers` rows for one real supplier —
    -- while normalizeSupplierName() collapses both onto the identical engine
    -- key "auto vans pecas", which would have made `stats()`/`statsMany()`
    -- double-count `linkedParts` and `purchasesLast12Months` across both rows
    -- on the KPI strip. FIXED below: the `deduped` CTE (further down) strips
    -- the same suffixes off `key` before grouping, so this backfill now
    -- produces exactly one row for that pair, same as the engine would at
    -- runtime. The suffix strip is deliberately applied to the DEDUPE KEY
    -- ONLY, never to `name` (the display name, built above from `raw`) — the
    -- spec's decision is that the join key folds legal-form spelling
    -- differences but the name shown on screen keeps "Ltda"/"ME", since
    -- that's the company's actual registered name.
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
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        initcap(raw),
                        '(?<= )De\y', 'de', 'g'),
                      '(?<= )Da\y', 'da', 'g'),
                    '(?<= )Do\y', 'do', 'g'),
                  '(?<= )Das\y', 'das', 'g'),
                '(?<= )Dos\y', 'dos', 'g'),
              '(?<= )E\y', 'e', 'g'),
            '(?<= )Em\y', 'em', 'g'),
          '(?<= )Para\y', 'para', 'g'
        )
      else raw
    end as name,
    case
      when key in ('ufi', 'ufi filters') then 'ufi filters'
      else key
    end as pre_suffix_key
  from filtered
),
deduped as (
  select
    store_id,
    name,
    -- Strips trailing legal-form suffixes (ltda|me|epp|eireli|s a|sa|s/a)
    -- off the dedupe key, mirroring normalizeSupplierName()'s suffix strip
    -- — see the header comment above `key` for why (a measured, real
    -- production collision, not a hypothetical one). Applied 4 times, not
    -- once: the pattern anchors on `$`, so a single application removes AT
    -- MOST one trailing suffix word, and a real name can carry more than
    -- one ("… Eireli ME" needs two passes to fully strip). This mirrors
    -- the TS engine's `while (suffix.test(out))` loop, which has no fixed
    -- bound; 4 passes covers every case measured in production (max
    -- observed: 2) with headroom.
    --
    -- Applied to `pre_suffix_key` (→ `dedupe_key`) only, never to `name`:
    -- the display name keeps its legal-form suffix on purpose (see header
    -- comment) — only the grouping key folds the spelling difference away.
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            pre_suffix_key,
            '\s+(ltda|me|epp|eireli|s a|sa|s/a)$', ''
          ),
          '\s+(ltda|me|epp|eireli|s a|sa|s/a)$', ''
        ),
        '\s+(ltda|me|epp|eireli|s a|sa|s/a)$', ''
      ),
      '\s+(ltda|me|epp|eireli|s a|sa|s/a)$', ''
    ) as dedupe_key
  from canonical
)
insert into public.suppliers (id, store_id, name, category, source, supplied_items)
select
  md5(dedupe_key || store_id::text)::uuid,
  store_id,
  min(name),
  'parts',
  'catalog_backfill',
  '{}'::text[]
from deduped
group by dedupe_key, store_id
on conflict (id) do nothing;
