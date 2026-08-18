-- NPS transacional (PRD-148B), redesenhado em
-- docs/superpowers/specs/2026-08-12-nps-pesquisa-satisfacao-design.md.
--
-- Divergências deliberadas do PRD, por evidência de produção (12/08/2026):
--   * schema `public`, não `crm` — o schema crm não existe neste projeto;
--   * customer_id NULLABLE — 293 das 348 conversas resolvidas nos últimos 30
--     dias pertencem a leads, não a clientes cadastrados. Exigir cliente
--     descartaria 84% do sinal disponível;
--   * config em tabela própria, no padrão de `sdr_settings` — o
--     `platform_settings` que o PRD pressupõe não existe neste banco;
--   * gatilho primário é a conversa resolvida (o PRD elegia o pedido
--     entregue, mas a tabela `orders` está vazia em produção).
--
-- SEM coluna `classification`: promotor/neutro/detrator é SEMPRE derivado do
-- score, como o PRD exige.
--
-- Nada dispara ao aplicar esta migration: `nps_settings.enabled` nasce false e
-- não há linha de settings para loja nenhuma.

create table public.nps_surveys (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),

  conversation_id uuid references public.conversations(id) on delete set null,
  customer_id uuid references public.customers(id),
  lead_id text,                        -- espelha conversations.lead_id, que é TEXT
  phone_digits text not null,          -- chave de cooldown: atravessa lead e cliente
  recipient_name text,                 -- snapshot do primeiro nome no envio

  trigger text not null
    check (trigger in ('conversation_resolved','order_delivered','manual')),
  order_id uuid references public.orders(id),

  token text unique not null,
  channel text check (channel in ('whatsapp','email')),
  status text not null default 'pending'
    check (status in ('pending','sent','responded','expired','suppressed','failed')),

  score smallint check (score between 0 and 10),
  comment text,

  sent_at timestamptz,
  responded_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.nps_surveys is
  'PRD-148B: pesquisas de NPS transacional. Mutações exclusivas de service_role (nps-scheduler e nps-submit) — não há policy de INSERT/UPDATE para authenticated.';
comment on column public.nps_surveys.phone_digits is
  'Chave de cooldown. Telefone só de dígitos, resolvido de customers ou leads — o mesmo contato pode aparecer como lead numa conversa e como cliente noutra.';
comment on column public.nps_surveys.token is
  'Credencial de uso único da landing pública. Opaco, 64 chars, não enumerável, expira em expires_at.';

create index nps_surveys_store_status_idx on public.nps_surveys (store_id, status);
create index nps_surveys_phone_created_idx on public.nps_surveys (phone_digits, created_at desc);
create index nps_surveys_responded_idx on public.nps_surveys (responded_at) where status = 'responded';

-- Anti-duplicata estrutural: uma pesquisa por conversa, mesmo que o scheduler
-- seja reexecutado ou rode concorrente.
create unique index nps_surveys_conversation_uniq
  on public.nps_surveys (conversation_id) where conversation_id is not null;

create table public.nps_settings (
  store_id uuid primary key references public.stores(id),
  enabled boolean not null default false,
  trigger_conversation_enabled boolean not null default true,
  trigger_conversation_delay_hours integer not null default 2,
  trigger_order_enabled boolean not null default false,
  trigger_order_delay_hours integer not null default 24,
  cooldown_days integer not null default 30,
  token_expiry_days integer not null default 7,
  window_days integer not null default 90,
  sampling_rate numeric not null default 1.0 check (sampling_rate between 0 and 1),
  send_window_start_hour integer not null default 9,
  send_window_end_hour integer not null default 20,
  min_responses_for_score integer not null default 5,
  max_backfill_days integer not null default 3,
  daily_cap integer not null default 50,
  whatsapp_account_id uuid references public.whatsapp_accounts(id),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.nps_settings is
  'PRD-148B: configuração de NPS por loja. `enabled` nasce false — nada dispara antes de o dono ligar conscientemente.';
comment on column public.nps_settings.max_backfill_days is
  'Backstop anti-disparo em massa: o scheduler ignora conversas resolvidas há mais que isto. Sem ele, ligar o switch dispararia para todo o backlog histórico de uma vez.';
comment on column public.nps_settings.daily_cap is
  'Backstop anti-disparo em massa: teto de pesquisas por loja por dia. Limita o estrago mesmo se a elegibilidade tiver bug.';
comment on column public.nps_settings.min_responses_for_score is
  'Abaixo disto nenhuma superfície exibe número — só "Coletando dados (N/x)". Um NPS 100 de duas respostas é desinformação executiva.';

alter table public.nps_surveys enable row level security;
alter table public.nps_settings enable row level security;

-- Leitura das pesquisas: staff vê a loja inteira; vendedor vê apenas as de
-- clientes da própria carteira. Espelha customers_select, inclusive o wrapper
-- (select fn()) — que faz o helper rodar uma vez por query, não por linha.
create policy nps_surveys_select on public.nps_surveys for select to authenticated
using (
  store_id = (select public.current_store_id())
  and (
    (select public.is_staff())
    or exists (
      select 1
      from public.customers c
      where c.id = nps_surveys.customer_id
        and c.seller_id = (select public.current_seller_id())
    )
  )
);

-- Sem policy de INSERT/UPDATE/DELETE: só service_role escreve.

-- Configuração: staff da loja lê; apenas o Owner escreve.
create policy nps_settings_select on public.nps_settings for select to authenticated
using (
  store_id = (select public.current_store_id())
  and (select public.is_staff())
);

create policy nps_settings_owner_write on public.nps_settings for all to authenticated
using ((select public.current_app_role()) = 'owner')
with check ((select public.current_app_role()) = 'owner');

-- RBAC: sem estas linhas o menu desaparece para TODOS, inclusive o Owner — o
-- editor de papéis não tem linha para consultar.
insert into public.rbac_resources (key, label, "group", sort_order) values
  ('nps',          'NPS — Satisfação', 'Atendimento',  36),
  ('settings_nps', 'NPS',              'Configuração', 44)
on conflict (key) do nothing;

-- Ids de papel de sistema === slug (20260616095122_rbac_roles.sql).
-- Vendedor e Financeiro ficam de fora por desenho: a postura anti
-- compare-and-shame do PRD-051 proíbe ranking de NPS por vendedor.
insert into public.role_permissions (role_id, resource, actions, scope) values
  ('Owner',  'nps',          array['view'],        'all'),
  ('Owner',  'settings_nps', array['view','edit'], 'all'),
  ('Gestor', 'nps',          array['view'],        'store'),
  ('Gestor', 'settings_nps', array['view'],        'store')
on conflict (role_id, resource) do nothing;
