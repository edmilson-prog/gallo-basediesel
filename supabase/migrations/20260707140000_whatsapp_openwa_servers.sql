-- WhatsApp OpenWA — server registry + provider_config shape correction.
--
-- SUPERSEDES the openwa branch added in 20260706150000_whatsapp_openwa_provider.sql.
-- That migration modeled OpenWA on classic Evolution (per-account baseUrl +
-- instanceName + per-account credentials_ref API key). Live-testing against
-- the real server (rmyndharis/OpenWA fork, confirmed 2026-07-07) showed the
-- ACTUAL shape is architecturally closer to Evolution Go: ONE global API key
-- authenticates an entire server for ALL sessions, and sessions are addressed
-- by a server-generated UUID (`POST /api/sessions` returns `{id, ...}`), not a
-- client-chosen instanceName. So OpenWA needs the SAME registry pattern as
-- whatsapp_go_servers (mirrors 20260626190000_whatsapp_go_servers.sql
-- verbatim), and provider_config only needs to carry that session id.
--
-- Additive + idempotent DDL.

-- ---------------------------------------------------------------------------
-- whatsapp_openwa_servers (registry table)
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_openwa_servers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  base_url    text        not null,
  api_key_ref text        not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint whatsapp_openwa_servers_api_key_ref_pattern
    check (api_key_ref ~ '^[A-Z][A-Z0-9_]{2,64}$')
);

comment on table public.whatsapp_openwa_servers is
  'Registry of OpenWA (whatsapp-web.js self-hosted) servers. Platform-level, Owner-only. '
  'api_key_ref is a Vault secret name pointer to the server-wide global key — the key itself never lives here.';

-- ---------------------------------------------------------------------------
-- FK column on whatsapp_accounts
-- ---------------------------------------------------------------------------
alter table public.whatsapp_accounts
  add column if not exists openwa_server_id uuid
  references public.whatsapp_openwa_servers (id) on delete restrict;

comment on column public.whatsapp_accounts.openwa_server_id is
  'OpenWA accounts only: FK to whatsapp_openwa_servers. NULL for Meta/Evolution/Evolution-Go accounts. '
  'ON DELETE RESTRICT prevents removing a server while accounts are linked.';

create index if not exists idx_whatsapp_accounts_openwa_server_id
  on public.whatsapp_accounts (openwa_server_id);

-- ---------------------------------------------------------------------------
-- RLS — Owner-only (mirrors whatsapp_go_servers policy pattern)
-- ---------------------------------------------------------------------------
alter table public.whatsapp_openwa_servers enable row level security;

drop policy if exists whatsapp_openwa_servers_owner_all on public.whatsapp_openwa_servers;
create policy whatsapp_openwa_servers_owner_all
  on public.whatsapp_openwa_servers
  for all
  to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');

-- ---------------------------------------------------------------------------
-- provider_config shape correction — 'openwa' now only needs sessionId.
-- Existing branches (meta/evolution/evolution-go) preserved verbatim.
-- ---------------------------------------------------------------------------
alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_provider_config_shape;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_config_shape
  check (
    provider_config is null
    or (provider = 'meta' and provider_config ? 'phoneNumberId' and provider_config ? 'businessAccountId')
    or (provider = 'evolution' and provider_config ? 'baseUrl' and provider_config ? 'instanceName')
    or (provider = 'evolution-go' and provider_config ? 'instanceId')
    or (provider = 'openwa' and provider_config ? 'sessionId')
  );
