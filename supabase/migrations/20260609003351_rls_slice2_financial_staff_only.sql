-- PRD-103 RBAC fino Slice 2.
-- 2a) Financial/managerial tables become staff-only: a non-staff seller sees
--     nothing (P&L, cash flow, distribution audit are not theirs to read).
-- 2b) goals/recommendations/product_indicators were store-wide (cross-seller
--     leak); now per-seller like Slice 1 (staff see all; a seller sees own;
--     store-level rows with null seller_id are staff-only).

------------------------------------------------------------------- 2a staff-only
-- expenses
alter policy expenses_select on public.expenses
  using (store_id = public.current_store_id() and public.is_staff());
alter policy expenses_insert on public.expenses
  with check (store_id = public.current_store_id() and public.is_staff());
alter policy expenses_update on public.expenses
  using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());
alter policy expenses_delete on public.expenses
  using (store_id = public.current_store_id() and public.is_staff());

-- cash_flow_entries
alter policy cash_flow_entries_select on public.cash_flow_entries
  using (store_id = public.current_store_id() and public.is_staff());
alter policy cash_flow_entries_insert on public.cash_flow_entries
  with check (store_id = public.current_store_id() and public.is_staff());
alter policy cash_flow_entries_update on public.cash_flow_entries
  using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());
alter policy cash_flow_entries_delete on public.cash_flow_entries
  using (store_id = public.current_store_id() and public.is_staff());

-- distribution_traces
alter policy distribution_traces_select on public.distribution_traces
  using (store_id = public.current_store_id() and public.is_staff());
alter policy distribution_traces_insert on public.distribution_traces
  with check (store_id = public.current_store_id() and public.is_staff());
alter policy distribution_traces_update on public.distribution_traces
  using (store_id = public.current_store_id() and public.is_staff())
  with check (store_id = public.current_store_id() and public.is_staff());
alter policy distribution_traces_delete on public.distribution_traces
  using (store_id = public.current_store_id() and public.is_staff());

------------------------------------------------------------------- 2b per-seller
-- goals
alter policy goals_select on public.goals
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy goals_insert on public.goals
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy goals_update on public.goals
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy goals_delete on public.goals
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));

-- recommendations
alter policy recommendations_select on public.recommendations
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy recommendations_insert on public.recommendations
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy recommendations_update on public.recommendations
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy recommendations_delete on public.recommendations
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));

-- product_indicators
alter policy product_indicators_select on public.product_indicators
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy product_indicators_insert on public.product_indicators
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy product_indicators_update on public.product_indicators
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()))
  with check (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
alter policy product_indicators_delete on public.product_indicators
  using (store_id = public.current_store_id() and (public.is_staff() or seller_id = public.current_seller_id()));
