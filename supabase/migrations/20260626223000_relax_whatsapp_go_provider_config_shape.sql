-- WhatsApp Evolution Go — relax provider_config shape.
--
-- The server registry (whatsapp_go_servers, resolved via whatsapp_accounts.go_server_id)
-- now owns base_url, so evolution-go accounts no longer carry `baseUrl` in provider_config:
-- the wizard inserts only { instanceId }. The previous CHECK still required `baseUrl` for
-- evolution-go, so the INSERT was rejected with
--   "violates check constraint whatsapp_accounts_provider_config_shape".
--
-- Relax ONLY the evolution-go branch to require `instanceId` (baseUrl no longer mandatory).
-- meta and evolution branches are unchanged. Backward compatible: legacy evolution-go rows
-- that still hold { baseUrl, instanceId } keep satisfying (provider_config ? 'instanceId').
-- Idempotent (drop if exists + re-add). The ADD re-validates existing rows; all current
-- accounts (meta / evolution) satisfy their unchanged branches.

alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_provider_config_shape;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_config_shape
  check (
    (provider_config is null)
    or ((provider = 'meta') and (provider_config ? 'phoneNumberId') and (provider_config ? 'businessAccountId'))
    or ((provider = 'evolution') and (provider_config ? 'baseUrl') and (provider_config ? 'instanceName'))
    or ((provider = 'evolution-go') and (provider_config ? 'instanceId'))
  );
