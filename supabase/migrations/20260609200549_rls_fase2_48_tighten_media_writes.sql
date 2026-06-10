-- #48: tighten media_assets writes to match the per-seller SELECT scope (#43).
--
-- Before: INSERT/UPDATE/DELETE only checked store_id, so any authenticated user
-- in the store could mutate (or inject) any media row — including injecting a
-- media asset into another seller's conversation gallery.
--
-- SELECT (#43) is unchanged. INSERT mirrors the conversations *visibility*
-- (own + pool) so inbound archival (ensureFromMessage) and outbound upload
-- (quick-send) keep working for the conversations a seller actually interacts
-- with. UPDATE/DELETE mirror the media SELECT scope (own conversation/customer
-- or staff) so a seller can only mutate media it can already see.
--
-- Helpers wrapped in (select ...) per PRD-108; the customer/conversation
-- subqueries hit existing indexes (customers_seller_id_idx,
-- conversations_assigned_seller_id_idx).

-- INSERT: own customer OR own/pool conversation OR staff
drop policy if exists media_assets_insert on public.media_assets;
create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (customer_id is not null and customer_id in (
            select id from public.customers
            where seller_id = (select public.current_seller_id())))
      or (conversation_id is not null and conversation_id in (
            select id from public.conversations
            where store_id = (select public.current_store_id())
              and (assigned_seller_id = (select public.current_seller_id())
                   or assigned_seller_id is null)))
    )
  );

-- UPDATE: mirror the media SELECT scope (own conversation/customer or staff)
drop policy if exists media_assets_update on public.media_assets;
create policy media_assets_update on public.media_assets
  for update to authenticated
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (customer_id is not null and customer_id in (
            select id from public.customers
            where seller_id = (select public.current_seller_id())))
      or (conversation_id is not null and conversation_id in (
            select id from public.conversations
            where assigned_seller_id = (select public.current_seller_id())))
    )
  )
  with check (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (customer_id is not null and customer_id in (
            select id from public.customers
            where seller_id = (select public.current_seller_id())))
      or (conversation_id is not null and conversation_id in (
            select id from public.conversations
            where assigned_seller_id = (select public.current_seller_id())))
    )
  );

-- DELETE: mirror the media SELECT scope
drop policy if exists media_assets_delete on public.media_assets;
create policy media_assets_delete on public.media_assets
  for delete to authenticated
  using (
    store_id = (select public.current_store_id())
    and (
      (select public.is_staff())
      or (customer_id is not null and customer_id in (
            select id from public.customers
            where seller_id = (select public.current_seller_id())))
      or (conversation_id is not null and conversation_id in (
            select id from public.conversations
            where assigned_seller_id = (select public.current_seller_id())))
    )
  );
