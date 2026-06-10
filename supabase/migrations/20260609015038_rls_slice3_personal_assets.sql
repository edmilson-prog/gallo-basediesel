-- RBAC fino Slice 3 — personal assets isolation (quick_replies, asset_combos).
-- Per-seller pattern: store_id = current_store_id() AND (is_staff() OR owner_id = current_seller_id()).
-- quick_replies SELECT additionally exposes `shared` snippets to the whole store.
-- Staff (owner/manager) keep store-wide scope via is_staff() short-circuit.

-- ---- quick_replies -------------------------------------------------------
drop policy if exists quick_replies_select on public.quick_replies;
create policy quick_replies_select on public.quick_replies
  for select to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or scope = 'shared' or owner_id = public.current_seller_id())
  );

drop policy if exists quick_replies_insert on public.quick_replies;
create policy quick_replies_insert on public.quick_replies
  for insert to authenticated
  with check (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

drop policy if exists quick_replies_update on public.quick_replies;
create policy quick_replies_update on public.quick_replies
  for update to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  )
  with check (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

drop policy if exists quick_replies_delete on public.quick_replies;
create policy quick_replies_delete on public.quick_replies
  for delete to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

-- ---- asset_combos --------------------------------------------------------
drop policy if exists asset_combos_select on public.asset_combos;
create policy asset_combos_select on public.asset_combos
  for select to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

drop policy if exists asset_combos_insert on public.asset_combos;
create policy asset_combos_insert on public.asset_combos
  for insert to authenticated
  with check (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

drop policy if exists asset_combos_update on public.asset_combos;
create policy asset_combos_update on public.asset_combos
  for update to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  )
  with check (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  );

drop policy if exists asset_combos_delete on public.asset_combos;
create policy asset_combos_delete on public.asset_combos
  for delete to authenticated
  using (
    store_id = public.current_store_id()
    and (public.is_staff() or owner_id = public.current_seller_id())
  );
