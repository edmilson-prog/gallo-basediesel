-- RBAC fino Slice 4 — per-seller isolation on the owner-scoped derived tables
-- (customer_segments, asset_favorites, asset_send_log). Keeps the parent-store
-- scope and adds the per-seller cut. customer_segments SELECT also exposes
-- `shared` segments to the whole store (mirrors quick_replies). Staff keep
-- store-wide scope via the is_staff() short-circuit.

-- ---- customer_segments ---------------------------------------------------
drop policy if exists customer_segments_select on public.customer_segments;
create policy customer_segments_select on public.customer_segments
  for select to authenticated
  using (
    owner_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or scope = 'shared' or owner_id = public.current_seller_id())
  );

drop policy if exists customer_segments_insert on public.customer_segments;
create policy customer_segments_insert on public.customer_segments
  for insert to authenticated
  with check (
    owner_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

drop policy if exists customer_segments_update on public.customer_segments;
create policy customer_segments_update on public.customer_segments
  for update to authenticated
  using (
    owner_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or owner_id = public.current_seller_id())
  )
  with check (
    owner_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

drop policy if exists customer_segments_delete on public.customer_segments;
create policy customer_segments_delete on public.customer_segments
  for delete to authenticated
  using (
    owner_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

-- ---- asset_favorites -----------------------------------------------------
drop policy if exists asset_favorites_select on public.asset_favorites;
create policy asset_favorites_select on public.asset_favorites
  for select to authenticated
  using (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );

drop policy if exists asset_favorites_insert on public.asset_favorites;
create policy asset_favorites_insert on public.asset_favorites
  for insert to authenticated
  with check (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );

drop policy if exists asset_favorites_update on public.asset_favorites;
create policy asset_favorites_update on public.asset_favorites
  for update to authenticated
  using (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  )
  with check (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );

drop policy if exists asset_favorites_delete on public.asset_favorites;
create policy asset_favorites_delete on public.asset_favorites
  for delete to authenticated
  using (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );

-- ---- asset_send_log ------------------------------------------------------
drop policy if exists asset_send_log_select on public.asset_send_log;
create policy asset_send_log_select on public.asset_send_log
  for select to authenticated
  using (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );

drop policy if exists asset_send_log_insert on public.asset_send_log;
create policy asset_send_log_insert on public.asset_send_log
  for insert to authenticated
  with check (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );

drop policy if exists asset_send_log_update on public.asset_send_log;
create policy asset_send_log_update on public.asset_send_log
  for update to authenticated
  using (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  )
  with check (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );

drop policy if exists asset_send_log_delete on public.asset_send_log;
create policy asset_send_log_delete on public.asset_send_log
  for delete to authenticated
  using (
    seller_id in (select id from public.sellers where store_id = public.current_store_id())
    and (public.is_staff() or seller_id = public.current_seller_id())
  );
