-- Issue #43: tighten per-seller RLS on audit_logs, carteira_transfers and
-- media_assets so they mirror the PRD-006 permission matrix. All three SELECT
-- policies were store-scoped only, leaking store-wide rows to non-staff sellers.

-- 1. audit_logs: readable by Owner/Gestor (is_staff) + Financeiro only.
--    INSERT stays store-scoped: the audit logger records on behalf of every
--    acting user, so non-staff must keep inserting their own trail.
alter policy "audit_logs_select" on public.audit_logs
  using (
    store_id = (select current_store_id())
    and ((select is_staff()) or (select current_app_role()) = 'financeiro')
  );

-- 2. carteira_transfers: managed only by staff (Owner/Gestor) — matrix gives
--    sellers no `transfer` permission at all. Tighten read AND writes.
alter policy "carteira_transfers_select" on public.carteira_transfers
  using (store_id = (select current_store_id()) and (select is_staff()));

alter policy "carteira_transfers_insert" on public.carteira_transfers
  with check (store_id = (select current_store_id()) and (select is_staff()));

alter policy "carteira_transfers_update" on public.carteira_transfers
  using (store_id = (select current_store_id()) and (select is_staff()))
  with check (store_id = (select current_store_id()) and (select is_staff()));

alter policy "carteira_transfers_delete" on public.carteira_transfers
  using (store_id = (select current_store_id()) and (select is_staff()));

-- 3. media_assets: sellers see only media tied to their own customers or
--    conversations (matrix: media view scope "own"). Staff still see all.
--    Writes left store-scoped for now (media ingestion semantics unsettled).
alter policy "media_assets_select" on public.media_assets
  using (
    store_id = (select current_store_id())
    and (
      (select is_staff())
      or (customer_id is not null
          and customer_id in (
            select id from public.customers where seller_id = (select current_seller_id())
          ))
      or (conversation_id is not null
          and conversation_id in (
            select id from public.conversations where assigned_seller_id = (select current_seller_id())
          ))
    )
  );
