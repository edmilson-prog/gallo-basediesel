-- Evolution Go provider — additive, non-breaking.
--
-- Discovery (MCP inspection of production, 2026-06-25): there is NO provider
-- VALUE check constraint on `whatsapp_accounts` or `messages` — both
-- `provider` columns are free `text NOT NULL`, so the value 'evolution-go' is
-- ALREADY accepted with no migration. The only constraint that actually blocks
-- an evolution-go account is `whatsapp_accounts_provider_config_shape`, which
-- validates the provider_config shape per provider and currently only knows
-- 'meta' and 'evolution'. With provider='evolution-go' and a non-null
-- provider_config, none of its OR branches match and the row is rejected.
--
-- This migration extends that single check to add an 'evolution-go' branch
-- requiring `baseUrl` + `instanceId` (mirroring IEvolutionGoAccountConfig and
-- the build.ts requireString guards). The existing meta/evolution branches are
-- preserved verbatim, so it is strictly more permissive — every row that
-- passed before still passes. Idempotent via DROP ... IF EXISTS.

alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_provider_config_shape;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_config_shape
  check (
    provider_config is null
    or (provider = 'meta' and provider_config ? 'phoneNumberId' and provider_config ? 'businessAccountId')
    or (provider = 'evolution' and provider_config ? 'baseUrl' and provider_config ? 'instanceName')
    or (provider = 'evolution-go' and provider_config ? 'baseUrl' and provider_config ? 'instanceId')
  );
