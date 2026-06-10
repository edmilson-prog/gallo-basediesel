-- PRD-108 perf — cover the 21 unindexed foreign keys flagged by the advisor.
-- Plain (non-CONCURRENT) indexes: tables are small and apply_migration runs in a tx.
create index if not exists idx_asset_combos_owner_id on public.asset_combos(owner_id);
create index if not exists idx_asset_favorites_asset_id on public.asset_favorites(asset_id);
create index if not exists idx_carteira_transfers_created_by on public.carteira_transfers(created_by);
create index if not exists idx_cash_flow_entries_created_by on public.cash_flow_entries(created_by);
create index if not exists idx_conversations_whatsapp_account_id on public.conversations(whatsapp_account_id);
create index if not exists idx_customer_notes_author_id on public.customer_notes(author_id);
create index if not exists idx_customers_converted_by_seller_id on public.customers(converted_by_seller_id);
create index if not exists idx_distribution_traces_customer_id on public.distribution_traces(customer_id);
create index if not exists idx_distribution_traces_lead_id on public.distribution_traces(lead_id);
create index if not exists idx_goals_created_by on public.goals(created_by);
create index if not exists idx_media_assets_linked_order_id on public.media_assets(linked_order_id);
create index if not exists idx_media_assets_linked_part_id on public.media_assets(linked_part_id);
create index if not exists idx_media_assets_linked_vehicle_id on public.media_assets(linked_vehicle_id);
create index if not exists idx_orders_canceled_by on public.orders(canceled_by);
create index if not exists idx_profiles_seller_id on public.profiles(seller_id);
create index if not exists idx_profiles_store_id on public.profiles(store_id);
create index if not exists idx_quotes_approved_by on public.quotes(approved_by);
create index if not exists idx_sdr_escalations_lead_id on public.sdr_escalations(lead_id);
create index if not exists idx_sdr_escalations_urgent_broadcast_claimed_by_seller_id on public.sdr_escalations(urgent_broadcast_claimed_by_seller_id);
create index if not exists idx_sellers_parent_seller_id on public.sellers(parent_seller_id);
create index if not exists idx_stores_manager_id on public.stores(manager_id);
