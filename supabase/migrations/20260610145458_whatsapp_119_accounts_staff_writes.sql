-- PRD-119 — Admin → Integrações → WhatsApp out of the Fase-1 placeholder.
--
-- whatsapp_accounts got the generic store-direct policies (any seller of the
-- store could write). Account configuration is sensitive operational config
-- (label, credentials_ref prefix, provider_config), so writes become
-- staff-only. SELECT stays store-wide: the conversation UI reads the
-- capability matrix of the account for every seller (PRD-011).

alter policy whatsapp_accounts_insert on public.whatsapp_accounts
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

alter policy whatsapp_accounts_update on public.whatsapp_accounts
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

alter policy whatsapp_accounts_delete on public.whatsapp_accounts
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
