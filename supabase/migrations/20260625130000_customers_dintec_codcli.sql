-- DINTEC anchor + BI snapshot columns for idempotent assisted CSV imports.
-- Adds the external code column (CODCLI from the DINTEC ERP) plus the
-- DINTEC-sourced BI snapshot fields to customers, so that re-running an
-- assisted import upserts instead of duplicating rows and the platform can
-- filter/sort by DINTEC-side recency, LTV and ABC class without conflating
-- them with the platform's own live-computed stats from real orders.
-- WhatsApp-only customers (never imported from DINTEC) keep all of these null.

alter table public.customers
  add column if not exists dintec_codcli text,
  add column if not exists dintec_ativo boolean,
  add column if not exists dintec_cliente_desde date,
  add column if not exists dintec_credit_limit numeric,
  add column if not exists dintec_vendedor_nome text,
  add column if not exists dintec_frequencia integer,
  add column if not exists dintec_ltv numeric,
  add column if not exists dintec_ticket_medio numeric,
  add column if not exists dintec_primeira_compra date,
  add column if not exists dintec_ultima_compra date,
  add column if not exists dintec_abc_class text,
  add column if not exists dintec_pct_receita numeric,
  add column if not exists dintec_synced_at timestamptz;

-- Partial unique index: at most one customer per DINTEC code, but many nulls allowed.
create unique index if not exists customers_dintec_codcli_key
  on public.customers (dintec_codcli)
  where dintec_codcli is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'customers_dintec_abc_class_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_dintec_abc_class_check
      check (dintec_abc_class is null or dintec_abc_class = any (array['A','B','C']));
  end if;
end $$;

comment on column public.customers.dintec_codcli is
  'DINTEC ERP customer code (CODCLI). Anchor for idempotent assisted CSV imports. Null for non-DINTEC customers (e.g. WhatsApp-only contacts).';
comment on column public.customers.dintec_ativo is
  'DINTEC CLIENTE.ATIVO snapshot at import time. Informational only — never drives customers.status.';
comment on column public.customers.dintec_synced_at is
  'Timestamp of the last DINTEC assisted import that touched this row. Used to identify/rollback a given import batch.';
