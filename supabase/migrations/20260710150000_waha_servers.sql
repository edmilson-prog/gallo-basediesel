-- WAHA (devlikeapro/waha) — server registry.
-- Platform-level (no store scope): one row per WAHA server. Holds the
-- friendly name, endpoint and Vault POINTERS to the global X-Api-Key
-- (api_key_ref) and the webhook HMAC secret (webhook_hmac_ref) — the secrets
-- themselves never live here. Sessions link via
-- whatsapp_accounts.waha_server_id (ON DELETE RESTRICT = delete guard).
-- Mirrors whatsapp_go_servers (20260626190000) byte-for-byte in shape.
--
-- Owner-only RLS mirrors ai_settings / whatsapp_go_servers: predicate
-- "(select public.current_app_role()) = 'owner'" (initplan, evaluated once
-- per statement). Edge Functions use service_role (bypasses RLS).
-- Additive + idempotent DDL.

create table if not exists public.waha_servers (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null unique,
  base_url          text        not null,
  api_key_ref       text        not null unique,
  webhook_hmac_ref  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint waha_servers_api_key_ref_pattern
    check (api_key_ref ~ '^[A-Z][A-Z0-9_]{2,64}$'),
  constraint waha_servers_webhook_hmac_ref_pattern
    check (webhook_hmac_ref is null or webhook_hmac_ref ~ '^[A-Z][A-Z0-9_]{2,64}$')
);

comment on table public.waha_servers is
  'Registry of WAHA (devlikeapro/waha) servers. Platform-level, Owner-only. '
  'api_key_ref / webhook_hmac_ref are Vault secret name pointers — the '
  'secrets themselves never live here.';

alter table public.waha_servers enable row level security;

drop policy if exists waha_servers_owner_all on public.waha_servers;
create policy waha_servers_owner_all
  on public.waha_servers
  for all
  to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');
