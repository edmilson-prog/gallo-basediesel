-- D2: tighten asset_library_items writes to is_staff() (Owner/Gestor only).
-- Before: writes were store-scoped only (any authenticated in-store user could
-- mutate). Mirrors the #48 media_assets pattern. SELECT stays store-scoped.

drop policy if exists asset_library_items_insert on public.asset_library_items;
create policy asset_library_items_insert on public.asset_library_items
  for insert to authenticated
  with check (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );

drop policy if exists asset_library_items_update on public.asset_library_items;
create policy asset_library_items_update on public.asset_library_items
  for update to authenticated
  using (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  )
  with check (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );

drop policy if exists asset_library_items_delete on public.asset_library_items;
create policy asset_library_items_delete on public.asset_library_items
  for delete to authenticated
  using (
    store_id = (select public.current_store_id())
    and (select public.is_staff())
  );
