-- PRD-103 RBAC fino: non-staff sellers see/manage only their own carteira on the
-- core seller-owned entities; staff (is_staff) keep store-wide access. Child
-- tables (order_items, quote_items, messages, customer_notes, vehicles,
-- sdr_sessions) inherit automatically — their policies read the parent through
-- the parent's RLS. Only the helper-source changes; the store scope is preserved.

-- customers (seller_id)
alter policy customers_select on public.customers
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy customers_insert on public.customers
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy customers_update on public.customers
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy customers_delete on public.customers
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));

-- orders (seller_id)
alter policy orders_select on public.orders
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy orders_insert on public.orders
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy orders_update on public.orders
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy orders_delete on public.orders
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));

-- quotes (seller_id)
alter policy quotes_select on public.quotes
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy quotes_insert on public.quotes
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy quotes_update on public.quotes
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy quotes_delete on public.quotes
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));

-- leads (seller_id; unassigned leads have null seller_id -> only staff see them)
alter policy leads_select on public.leads
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy leads_insert on public.leads
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy leads_update on public.leads
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy leads_delete on public.leads
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));

-- commissions (seller_id)
alter policy commissions_select on public.commissions
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy commissions_insert on public.commissions
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy commissions_update on public.commissions
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy commissions_delete on public.commissions
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));

-- conversations (assigned_seller_id; unassigned -> only staff)
alter policy conversations_select on public.conversations
  using (store_id = public.current_store_id() and (public.is_staff() or assigned_seller_id = public.current_seller_id()));
alter policy conversations_insert on public.conversations
  with check (store_id = public.current_store_id() and (public.is_staff() or assigned_seller_id = public.current_seller_id()));
alter policy conversations_update on public.conversations
  using (store_id = public.current_store_id() and (public.is_staff() or assigned_seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or assigned_seller_id = public.current_seller_id()));
alter policy conversations_delete on public.conversations
  using (store_id = public.current_store_id() and (public.is_staff() or assigned_seller_id = public.current_seller_id()));
