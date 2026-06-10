-- Derived tables: no store_id of their own; scope is inherited from a parent
-- row that does carry store_id. Same per-store predicate, expressed as an IN
-- against the parent (parent RLS also applies, to the same store — no recursion).

do $$
declare
  rec record;
begin
  for rec in
    select * from (values
      ('order_items','order_id','orders'),
      ('quote_items','quote_id','quotes'),
      ('messages','conversation_id','conversations'),
      ('sdr_sessions','conversation_id','conversations'),
      ('vehicles','customer_id','customers'),
      ('customer_notes','customer_id','customers'),
      ('model_kit_items','kit_id','model_kits'),
      ('customer_segments','owner_id','sellers'),
      ('asset_favorites','seller_id','sellers'),
      ('asset_send_log','seller_id','sellers')
    ) as t(tbl, fk, parent)
  loop
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_select_poc_temp', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_select', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_insert', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_update', rec.tbl);
    execute format('drop policy if exists %I on public.%I', rec.tbl || '_delete', rec.tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (%I in (select id from public.%I where store_id = public.current_store_id()))',
      rec.tbl || '_select', rec.tbl, rec.fk, rec.parent);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%I in (select id from public.%I where store_id = public.current_store_id()))',
      rec.tbl || '_insert', rec.tbl, rec.fk, rec.parent);
    execute format(
      'create policy %I on public.%I for update to authenticated using (%I in (select id from public.%I where store_id = public.current_store_id())) with check (%I in (select id from public.%I where store_id = public.current_store_id()))',
      rec.tbl || '_update', rec.tbl, rec.fk, rec.parent, rec.fk, rec.parent);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%I in (select id from public.%I where store_id = public.current_store_id()))',
      rec.tbl || '_delete', rec.tbl, rec.fk, rec.parent);
  end loop;
end $$;

-- vehicle_models: global reference catalogue. Any authenticated user reads;
-- only staff (owner/manager) writes.
drop policy if exists "vehicle_models_select_poc_temp" on public.vehicle_models;
create policy "vehicle_models_select" on public.vehicle_models for select to authenticated
  using (true);
create policy "vehicle_models_insert" on public.vehicle_models for insert to authenticated
  with check (public.is_staff());
create policy "vehicle_models_update" on public.vehicle_models for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy "vehicle_models_delete" on public.vehicle_models for delete to authenticated
  using (public.is_staff());
