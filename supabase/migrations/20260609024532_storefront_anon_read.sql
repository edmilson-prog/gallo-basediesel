-- ============================================================================
-- Storefront anon read surface (PRD-103 / Fase 2)
-- Goal: let the public B2C storefront (anon role) read the catalog and the
-- storefront config WITHOUT leaking commercial data (cost/margin/supplier/
-- stock) or the rest of platform settings (commissions/financial/cnpj).
-- anon WRITE stays forbidden. authenticated is untouched.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Catalog: column-scoped SELECT for anon on `parts`.
--    anon currently holds blanket table grants (Supabase default) gated only
--    by RLS. Revoke that and re-grant SELECT on PUBLIC columns only, so a row
--    policy cannot leak cost/margin/supplier/stock columns.
-- ---------------------------------------------------------------------------
revoke all on public.parts from anon;

grant select (
  id, sku, name, description,
  oem_codes, oem_codes_text, equivalent_part_ids, cross_references,
  segment, application_notes, applications,
  brand, category, subcategory, is_original,
  image_url, unit_price, gtin, reference, group_label, part_type,
  weight_kg, box_quantity, fractionable, unit_of_measure,
  division, active, store_id, created_at, updated_at
) on public.parts to anon;

-- Row gate: anon only sees ACTIVE parts. Inactive/discontinued stay hidden.
drop policy if exists parts_select_anon on public.parts;
create policy parts_select_anon
  on public.parts
  for select
  to anon
  using (active = true);

-- ---------------------------------------------------------------------------
-- B. Storefront config: a SECURITY DEFINER function that returns ONLY the
--    `storefront` slice of stores.settings (never cnpj / commissions /
--    financial / manager_id). No view -> no security_definer_view advisor.
-- ---------------------------------------------------------------------------
create or replace function public.storefront_config(p_store_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select settings -> 'storefront'
  from public.stores
  where id = p_store_id;
$$;

revoke all on function public.storefront_config(uuid) from public;
grant execute on function public.storefront_config(uuid) to anon, authenticated;

comment on function public.storefront_config(uuid) is
  'Public storefront config (settings->''storefront'') for the B2C loja. SECURITY DEFINER so anon never gets blanket SELECT on stores. Read-only.';

-- C. Orders ranking ("mais vendidos") is intentionally NOT exposed to anon.
--    Featured falls back to catalog order; a storefront_featured RPC is a
--    future follow-up.
-- D. vehicle_models: public pages read vehicle data from parts.applications
--    (jsonb), so no anon policy is added here.
