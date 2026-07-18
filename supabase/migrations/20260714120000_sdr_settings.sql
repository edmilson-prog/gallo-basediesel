-- SDR production pilot settings, scoped per store (one row per store that
-- opts into the pilot). Modeled on the ai_settings singleton pattern
-- (20260617143000_ai_settings_and_usage_events.sql) but keyed by store_id
-- instead of a fixed id=1, since the v1 pilot is explicitly per-store
-- (docs/superpowers/plans/2026-07-13-sdr-producao-piloto-recepcao-triagem.md).
create table if not exists public.sdr_settings (
  store_id                   uuid primary key references public.stores (id),
  sdr_enabled                boolean not null default false,
  backstop_timeout_minutes   integer not null default 2,
  system_prompt              text not null default '',
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users (id)
);

comment on table public.sdr_settings is
  'Configuração do agente SDR de produção por loja (piloto controlado, recepção/triagem). Owner-only. sdr-respond lê via service_role (bypassa RLS).';

alter table public.sdr_settings enable row level security;

drop policy if exists sdr_settings_owner_read on public.sdr_settings;
create policy sdr_settings_owner_read
  on public.sdr_settings for select to authenticated
  using ((select public.current_app_role()) = 'owner');

drop policy if exists sdr_settings_owner_write on public.sdr_settings;
create policy sdr_settings_owner_write
  on public.sdr_settings for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');
