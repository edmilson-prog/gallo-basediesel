-- Sub-projeto 1 (integração LLM real): configuração global de IA + histórico de uso.
--
-- ai_settings é SINGLETON GLOBAL (id=1, garantido por check): a IA é o "cérebro"
-- da plataforma — orçamento, roteamento e status de provedor são únicos (as chaves
-- de API vivem no Vault, não aqui). ai_usage_events é append-only: uma linha por
-- chamada real ao LLM, gravada EXCLUSIVAMENTE pelo service_role (Edge ai-generate).
-- RLS owner-only no padrão canônico (select public.current_app_role()) = 'owner'.
-- Additive + idempotent DDL.

-- ---------------------------------------------------------------------------
-- ai_settings (singleton)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_settings (
  id                  smallint primary key default 1 check (id = 1),
  master_enabled      boolean     not null default false,
  default_provider_id text        not null default 'anthropic',
  budget              jsonb       not null,
  providers           jsonb       not null,
  routing             jsonb       not null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);

comment on table public.ai_settings is
  'Configuração global de IA (singleton id=1). Owner-only. Chaves de API NÃO vivem aqui (Vault).';

alter table public.ai_settings enable row level security;

create policy "ai_settings_owner_read"
  on public.ai_settings for select to authenticated
  using ((select public.current_app_role()) = 'owner');

create policy "ai_settings_owner_write"
  on public.ai_settings for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');

-- ---------------------------------------------------------------------------
-- ai_usage_events (append-only; insert via service_role apenas)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  source        text not null check (source in ('playground','routed')),
  feature       text,
  provider_id   text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_brl      numeric(12,4) not null default 0,
  latency_ms    integer not null default 0,
  status        text not null check (status in ('ok','error','fallback')),
  caller_id     uuid references auth.users(id),
  store_id      uuid references public.stores(id),
  created_at    timestamptz not null default now()
);

comment on table public.ai_usage_events is
  'Append-only. Uma linha por chamada real ao LLM. INSERT só pelo service_role (Edge ai-generate).';

alter table public.ai_usage_events enable row level security;

-- Owner lê tudo. Sem policy de INSERT/UPDATE/DELETE p/ authenticated → escrita
-- exclusiva do service_role (que faz bypass de RLS).
create policy "ai_usage_events_owner_read"
  on public.ai_usage_events for select to authenticated
  using ((select public.current_app_role()) = 'owner');

create index if not exists idx_ai_usage_events_ts
  on public.ai_usage_events (ts desc);
create index if not exists idx_ai_usage_events_feature
  on public.ai_usage_events (feature) where feature is not null;
