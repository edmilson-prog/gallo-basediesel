-- Store-direct tables: drop the temp permissive SELECT policy and install
-- per-store CRUD policies (authenticated only — anon loses CRM access).

do $$
declare
  t text;
  tables text[] := array[
    'customers','orders','quotes','leads','conversations','parts','commissions',
    'expenses','cash_flow_entries','goals','media_assets','recommendations',
    'carteira_transfers','distribution_traces','product_indicators','quick_replies',
    'scheduled_sends','sdr_escalations','trackable_links','whatsapp_accounts',
    'model_kits','asset_combos','asset_library_items'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I on public.%I', t || '_select_poc_temp', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (store_id = public.current_store_id())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (store_id = public.current_store_id())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (store_id = public.current_store_id()) with check (store_id = public.current_store_id())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (store_id = public.current_store_id())', t || '_delete', t);
  end loop;
end $$;

-- audit_logs: immutable (INSERT + SELECT, no UPDATE/DELETE).
drop policy if exists "audit_logs_select_poc_temp" on public.audit_logs;
create policy "audit_logs_select" on public.audit_logs for select to authenticated
  using (store_id = public.current_store_id());
create policy "audit_logs_insert" on public.audit_logs for insert to authenticated
  with check (store_id = public.current_store_id());
create policy "audit_logs_no_update" on public.audit_logs for update to authenticated
  using (false);
create policy "audit_logs_no_delete" on public.audit_logs for delete to authenticated
  using (false);

-- sellers: same-store read; writes are staff-only, plus self-update of own row.
drop policy if exists "sellers_select_poc_temp" on public.sellers;
create policy "sellers_select" on public.sellers for select to authenticated
  using (store_id = public.current_store_id());
create policy "sellers_insert" on public.sellers for insert to authenticated
  with check (store_id = public.current_store_id() and public.is_staff());
create policy "sellers_update" on public.sellers for update to authenticated
  using (store_id = public.current_store_id() and (public.is_staff() or auth_user_id = (select auth.uid())))
  with check (store_id = public.current_store_id());
create policy "sellers_delete" on public.sellers for delete to authenticated
  using (store_id = public.current_store_id() and public.is_staff());

-- stores: read/update only the caller's own store; no client insert/delete.
drop policy if exists "stores_select_poc_temp" on public.stores;
create policy "stores_select" on public.stores for select to authenticated
  using (id = public.current_store_id());
create policy "stores_update" on public.stores for update to authenticated
  using (id = public.current_store_id() and public.is_staff())
  with check (id = public.current_store_id());
