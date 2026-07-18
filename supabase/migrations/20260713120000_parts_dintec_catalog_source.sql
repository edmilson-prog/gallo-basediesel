-- Colunas de proveniência para o import assistido de produtos DINTEC/planilhas
-- de fornecedor (docs/superpowers/specs/2026-07-13-dintec-product-import-design.md).
-- Espelha o padrão de customers (20260625130000_customers_dintec_codcli.sql):
-- dintec_codpro é a âncora de idempotência do track Firebird; catalog_source
-- rastreia a proveniência dos 3 tracks (dintec_erp / supplier_ufi /
-- supplier_turbo_filtros) sem precisar de uma tabela separada.

alter table public.parts
  add column if not exists dintec_codpro integer,
  add column if not exists dintec_synced_at timestamptz,
  add column if not exists catalog_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'parts_catalog_source_check'
      and conrelid = 'public.parts'::regclass
  ) then
    alter table public.parts
      add constraint parts_catalog_source_check
      check (catalog_source is null or catalog_source = any (
        array['dintec_erp', 'supplier_ufi', 'supplier_turbo_filtros', 'manual']
      ));
  end if;
end $$;

-- Âncora de idempotência do track Firebird — no máximo um `parts` por CODPRO.
create unique index if not exists parts_dintec_codpro_key
  on public.parts (dintec_codpro)
  where dintec_codpro is not null;

-- Chave de idempotência do track de planilha (upsert por sku). Verificado
-- sem duplicatas nas 351 linhas atuais antes de aplicar esta migration.
create unique index if not exists parts_sku_key
  on public.parts (sku);

comment on column public.parts.dintec_codpro is
  'DINTEC ERP product code (PRODUTO.CODPRO). Anchor for idempotent assisted CSV imports. Null for parts sourced from supplier spreadsheets or created manually.';
comment on column public.parts.catalog_source is
  'Provenance of this catalog row: dintec_erp (Firebird PRODUTO import), supplier_ufi (UFI quote spreadsheet), supplier_turbo_filtros (Turbo Filtros application spreadsheet), manual (staff-entered). Null for pre-existing rows predating this column.';
comment on column public.parts.dintec_synced_at is
  'Timestamp of the last assisted import batch that touched this row (any of the 3 tracks). Used to identify/rollback a given batch.';
