-- OpenWA provider — additive, non-breaking.
--
-- Mirrors 20260625120000_whatsapp_evolution_go_provider.sql: `provider` is a
-- free `text NOT NULL` column on `whatsapp_accounts`/`messages` (no VALUE check
-- constraint), so the value 'openwa' is already accepted. The only gate is
-- `whatsapp_accounts_provider_config_shape`, which validates provider_config
-- shape per provider and currently only knows 'meta', 'evolution' and
-- 'evolution-go'. OpenWA reuses the SAME shape as classic Evolution
-- (`baseUrl` + `instanceName`, per IOpenWaAccountConfig), so this migration
-- adds an 'openwa' OR-branch identical to the 'evolution' one. Existing
-- branches are preserved verbatim — strictly more permissive. Idempotent via
-- DROP ... IF EXISTS.
--
-- NOTE: the evolution-go branch here matches the RELAXED shape from
-- 20260626223000_relax_whatsapp_go_provider_config_shape.sql (instanceId
-- only, no baseUrl — base_url now lives in whatsapp_go_servers). Do not
-- reintroduce the baseUrl requirement for evolution-go.

alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_provider_config_shape;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_config_shape
  check (
    provider_config is null
    or (provider = 'meta' and provider_config ? 'phoneNumberId' and provider_config ? 'businessAccountId')
    or (provider = 'evolution' and provider_config ? 'baseUrl' and provider_config ? 'instanceName')
    or (provider = 'evolution-go' and provider_config ? 'instanceId')
    or (provider = 'openwa' and provider_config ? 'baseUrl' and provider_config ? 'instanceName')
  );
