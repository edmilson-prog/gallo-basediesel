-- WhatsApp Evolution Go — server registry.
-- Platform-level (no store scope): one row per evo-go server. Holds the
-- friendly name, endpoint and a Vault POINTER to the server-wide global key
-- (api_key_ref); the key itself lives in the Vault. Go accounts link via
-- whatsapp_accounts.go_server_id (ON DELETE RESTRICT = delete guard).
--
-- Owner-only RLS mirrors ai_settings (20260617143000_ai_settings_and_usage_events.sql):
-- predicate "(select public.current_app_role()) = 'owner'" — the (select ...) wrapper
-- forces PostgreSQL to evaluate the function once per statement (initplan) rather
-- than once per row, matching the canonical codebase pattern.
-- Edge Functions use service_role (bypasses RLS).
-- Additive + idempotent DDL.

-- ---------------------------------------------------------------------------
-- whatsapp_go_servers (registry table)
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_go_servers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null unique,
  base_url    text        not null,
  api_key_ref text        not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint whatsapp_go_servers_api_key_ref_pattern
    check (api_key_ref ~ '^[A-Z][A-Z0-9_]{2,64}$')
);

comment on table public.whatsapp_go_servers is
  'Registry of Evolution Go (whatsmeow) servers. Platform-level, Owner-only. '
  'api_key_ref is a Vault secret name pointer — the key itself never lives here.';

-- ---------------------------------------------------------------------------
-- FK column on whatsapp_accounts
-- ---------------------------------------------------------------------------
alter table public.whatsapp_accounts
  add column if not exists go_server_id uuid
  references public.whatsapp_go_servers (id) on delete restrict;

comment on column public.whatsapp_accounts.go_server_id is
  'Evolution Go accounts only: FK to whatsapp_go_servers. NULL for Meta/v2 accounts. '
  'ON DELETE RESTRICT prevents removing a server while accounts are linked.';

create index if not exists idx_whatsapp_accounts_go_server_id
  on public.whatsapp_accounts (go_server_id);

-- ---------------------------------------------------------------------------
-- RLS — Owner-only (mirrors ai_settings policy pattern)
-- ---------------------------------------------------------------------------
alter table public.whatsapp_go_servers enable row level security;

drop policy if exists whatsapp_go_servers_owner_all on public.whatsapp_go_servers;
create policy whatsapp_go_servers_owner_all
  on public.whatsapp_go_servers
  for all
  to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');
