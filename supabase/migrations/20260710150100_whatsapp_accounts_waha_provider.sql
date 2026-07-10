-- WAHA provider — additive, non-breaking (mirrors 20260625120000, the
-- evolution-go precedent). whatsapp_accounts.provider is free text (no value
-- CHECK), so 'waha' is already accepted; only the provider_config shape CHECK
-- and the FK to the new server registry need widening.

-- 1) FK to the server registry (nullable — only WAHA accounts fill it).
alter table public.whatsapp_accounts
  add column if not exists waha_server_id uuid
  references public.waha_servers (id) on delete restrict;

comment on column public.whatsapp_accounts.waha_server_id is
  'WAHA accounts only: FK to waha_servers. NULL for Meta/Evolution/Evolution Go. '
  'ON DELETE RESTRICT prevents removing a server while sessions are linked.';

create index if not exists idx_whatsapp_accounts_waha_server_id
  on public.whatsapp_accounts (waha_server_id);

-- 2) provider_config shape CHECK — add the 'waha' branch (sessionName only;
--    baseUrl/apiKey live on the server registry, not on the account).
alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_provider_config_shape;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_config_shape
  check (
    provider_config is null
    or (provider = 'meta' and provider_config ? 'phoneNumberId' and provider_config ? 'businessAccountId')
    or (provider = 'evolution' and provider_config ? 'baseUrl' and provider_config ? 'instanceName')
    or (provider = 'evolution-go' and provider_config ? 'baseUrl' and provider_config ? 'instanceId')
    or (provider = 'waha' and provider_config ? 'sessionName')
  );

-- 3) Deterministic webhook resolution by session name (mirrors instanceName/
--    phoneNumberId unique partial indexes from 20260615130500).
create unique index if not exists idx_whatsapp_accounts_waha_session_name
  on public.whatsapp_accounts ((provider_config ->> 'sessionName'))
  where provider = 'waha';

-- 4) integration_logs: allow 'whatsapp_waha' (mirrors 20260626031541, the
--    lesson from the evolution-go rollout — without this, every WAHA log
--    entry is silently dropped by the fail-open sink).
alter table public.integration_logs
  drop constraint if exists integration_logs_integration_name_check;

alter table public.integration_logs
  add constraint integration_logs_integration_name_check
  check (integration_name in (
    'whatsapp_meta', 'whatsapp_evolution', 'whatsapp_evolution_go', 'whatsapp_waha', 'melhor_envio'
  ));
