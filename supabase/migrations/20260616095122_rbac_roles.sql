-- PRD-211 — Persisted RBAC catalog (roles, role_permissions, rbac_resources).
--
-- Until now the permission matrix lived only in the frontend
-- (`src/features/rbac/permissions/`), enforced as UX discipline while the real
-- protection stayed in the hand-written per-table RLS policies. This migration
-- persists that same matrix into three tables so the platform can read, render
-- and (later) EDIT roles in-app without a code deploy.
--
-- Scope of THIS migration: schema + RLS + a faithful seed of the 7 system roles
-- and the 35-resource catalog. The seed is generated verbatim from
-- `buildRoleSeed()` / `buildResourceSeed()` (parity guarded by `seed.test.ts`),
-- so the persisted catalog reproduces the frontend matrix exactly (empty diff).
--
-- Reads are open to any authenticated member (the UI needs the matrix to render
-- the RBAC screen); the role catalog is not customer-sensitive data. Writes are
-- Owner-only, reusing the canonical production predicate
-- `current_app_role() = 'owner'` (same as `integration_logs_owner_read`).
--
-- NOTE: `store_id` is `uuid` (FK to `public.stores(id)`, which is uuid) — system
-- roles carry `store_id = null`; future custom per-store roles reference a real
-- store. Idempotent DDL so a re-run is a no-op.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.rbac_resources (
  key text primary key,
  label text not null,
  "group" text not null,
  sort_order integer not null default 0
);

comment on table public.rbac_resources is
  'RBAC resource catalog (PRD-211). One row per protectable resource; mirrors RESOURCES.';

create table if not exists public.roles (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_owner_immutable boolean not null default false,
  base_role text not null,
  store_id uuid references public.stores(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.roles is
  'RBAC roles (PRD-211). System roles use id = slug and store_id = null; custom roles are store-scoped.';

create table if not exists public.role_permissions (
  role_id text not null references public.roles(id) on delete cascade,
  resource text not null,
  actions text[] not null default '{}',
  scope text not null default 'own',
  primary key (role_id, resource)
);

comment on table public.role_permissions is
  'RBAC permissions per role (PRD-211). One row per (role, resource); mirrors PERMISSIONS_MATRIX.';

create index if not exists role_permissions_role_id_idx
  on public.role_permissions (role_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.rbac_resources enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;

-- SELECT: any authenticated member can read the catalog (UI renders the matrix).
create policy "rbac_resources_select"
  on public.rbac_resources for select to authenticated
  using (true);

create policy "roles_select"
  on public.roles for select to authenticated
  using (true);

create policy "role_permissions_select"
  on public.role_permissions for select to authenticated
  using (true);

-- Writes: Owner-only, reusing the canonical production predicate
-- (current_app_role() = 'owner'), wrapped in a SELECT for InitPlan caching.
create policy "rbac_resources_write"
  on public.rbac_resources for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');

create policy "roles_write"
  on public.roles for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');

create policy "role_permissions_write"
  on public.role_permissions for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');

-- ---------------------------------------------------------------------------
-- Seed — generated from buildRoleSeed() / buildResourceSeed() (PRD-211 RF-003).
-- Parity with the frontend matrix is enforced by seed.test.ts.
-- ---------------------------------------------------------------------------

-- rbac_resources
insert into public.rbac_resources (key, label, "group", sort_order) values
  ('customer', 'Clientes', 'Comercial', 0),
  ('commission', 'Comissões', 'Comercial', 1),
  ('indicator', 'Indicadores', 'Comercial', 2),
  ('lead', 'Leads', 'Comercial', 3),
  ('goal', 'Metas', 'Comercial', 4),
  ('quote', 'Orçamentos', 'Comercial', 5),
  ('order', 'Pedidos', 'Comercial', 6),
  ('recommendation', 'Recomendações', 'Comercial', 7),
  ('segment', 'Segmentos', 'Comercial', 8),
  ('transfer', 'Transferências', 'Comercial', 9),
  ('vehicle', 'Veículos', 'Comercial', 10),
  ('customer_service_analytics', 'Análise de Atendimento', 'Atendimento', 11),
  ('asset_library', 'Biblioteca de Ativos', 'Atendimento', 12),
  ('conversation', 'Conversas', 'Atendimento', 13),
  ('scheduled_send', 'Envios Agendados', 'Atendimento', 14),
  ('trackable_link', 'Links Rastreáveis', 'Atendimento', 15),
  ('message', 'Mensagens', 'Atendimento', 16),
  ('media', 'Mídia', 'Atendimento', 17),
  ('quick_reply', 'Respostas Rápidas', 'Atendimento', 18),
  ('part', 'Catálogo', 'Catálogo', 19),
  ('modelKit', 'Kits por modelo', 'Catálogo', 20),
  ('vehicleModel', 'Modelos de veículo', 'Catálogo', 21),
  ('expense', 'Despesas', 'Financeiro', 22),
  ('dre', 'DRE Gerencial', 'Financeiro', 23),
  ('inventory', 'Estoque', 'Financeiro', 24),
  ('cashflow', 'Fluxo de Caixa', 'Financeiro', 25),
  ('profitability', 'Rentabilidade', 'Financeiro', 26),
  ('storefront_admin', 'Admin E-commerce', 'E-commerce', 27),
  ('ecommerce_integration', 'Integração E-commerce', 'E-commerce', 28),
  ('audit_log', 'Auditoria', 'Gestão', 29),
  ('insight', 'Insights', 'Gestão', 30),
  ('store', 'Lojas', 'Gestão', 31),
  ('seller', 'Vendedores', 'Gestão', 32),
  ('settings', 'Configurações', 'Configuração', 33),
  ('role', 'Papéis', 'Configuração', 34)
on conflict (key) do nothing;

-- roles
insert into public.roles (id, slug, name, description, is_system, is_owner_immutable, base_role, store_id) values
  ('Owner', 'Owner', 'Owner', 'Fundador da loja — visão e poder total em todos os dados e configurações.', true, true, 'Owner', null),
  ('Gestor', 'Gestor', 'Gestor', 'Gerencia operação de uma loja (filial ou matriz), aprova comissões e orçamentos.', true, false, 'Gestor', null),
  ('Vendedor', 'Vendedor', 'Vendedor', 'Atende clientes da própria carteira, cria orçamentos e acompanha pedidos.', true, false, 'Vendedor', null),
  ('SDR', 'SDR', 'SDR', 'Qualifica leads e prepara conversas; cria orçamentos como agente, sem acesso financeiro.', true, false, 'SDR', null),
  ('Cliente', 'Cliente', 'Cliente', 'Usuário B2B/B2C do portal — vê o próprio histórico e abre atendimento.', true, false, 'Cliente', null),
  ('VendedorExterno', 'VendedorExterno', 'Vendedor Externo', 'Vendedor de campo com região atribuída — equivalente ao Vendedor no MVP.', true, false, 'VendedorExterno', null),
  ('Financeiro', 'Financeiro', 'Financeiro', 'Acompanha pedidos da loja, aprova comissões e visualiza auditoria.', true, false, 'Financeiro', null)
on conflict (id) do nothing;

-- role_permissions
insert into public.role_permissions (role_id, resource, actions, scope) values
  ('Owner', 'customer', '{view,create,edit,delete}', 'all'),
  ('Owner', 'vehicle', '{view,create,edit,delete}', 'all'),
  ('Owner', 'lead', '{view,create,edit,delete}', 'all'),
  ('Owner', 'conversation', '{view,create,edit,delete}', 'all'),
  ('Owner', 'message', '{view,create,edit,delete}', 'all'),
  ('Owner', 'part', '{view,create,edit,delete}', 'all'),
  ('Owner', 'vehicleModel', '{view,create,edit,delete}', 'all'),
  ('Owner', 'modelKit', '{view,create,edit,delete}', 'all'),
  ('Owner', 'quote', '{view,create,edit,delete,approve}', 'all'),
  ('Owner', 'order', '{view,create,edit,delete}', 'all'),
  ('Owner', 'commission', '{view,create,edit,delete,approve}', 'all'),
  ('Owner', 'goal', '{view,create,edit,delete}', 'all'),
  ('Owner', 'indicator', '{view,create,edit,delete}', 'all'),
  ('Owner', 'recommendation', '{view,create,edit,delete}', 'all'),
  ('Owner', 'transfer', '{view,create,edit,delete}', 'all'),
  ('Owner', 'segment', '{view,create,edit,delete}', 'all'),
  ('Owner', 'seller', '{view,create,edit,delete}', 'all'),
  ('Owner', 'store', '{view,create,edit,delete}', 'all'),
  ('Owner', 'settings', '{view,create,edit,delete}', 'all'),
  ('Owner', 'audit_log', '{view}', 'all'),
  ('Owner', 'media', '{view,create,edit,delete}', 'all'),
  ('Owner', 'role', '{view,create,edit,delete}', 'all'),
  ('Owner', 'dre', '{view,edit}', 'all'),
  ('Owner', 'expense', '{view,create,edit,delete}', 'all'),
  ('Owner', 'cashflow', '{view,create}', 'all'),
  ('Owner', 'profitability', '{view}', 'all'),
  ('Owner', 'inventory', '{view,edit}', 'all'),
  ('Owner', 'customer_service_analytics', '{view}', 'all'),
  ('Owner', 'insight', '{view,edit,delete}', 'all'),
  ('Owner', 'storefront_admin', '{view,edit}', 'all'),
  ('Owner', 'ecommerce_integration', '{view,edit}', 'all'),
  ('Owner', 'asset_library', '{view,create,edit,delete}', 'all'),
  ('Owner', 'quick_reply', '{view,create,edit,delete}', 'all'),
  ('Owner', 'trackable_link', '{view,create,edit,delete}', 'all'),
  ('Owner', 'scheduled_send', '{view,create,edit,delete}', 'all'),
  ('Gestor', 'customer', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'vehicle', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'lead', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'conversation', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'message', '{create}', 'store'),
  ('Gestor', 'part', '{view,create,edit}', 'store'),
  ('Gestor', 'vehicleModel', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'modelKit', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'quote', '{view,create,edit,delete,approve}', 'store'),
  ('Gestor', 'order', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'commission', '{approve}', 'store'),
  ('Gestor', 'goal', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'indicator', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'recommendation', '{view}', 'store'),
  ('Gestor', 'transfer', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'segment', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'seller', '{view}', 'store'),
  ('Gestor', 'store', '{view}', 'own'),
  ('Gestor', 'settings', '{view}', 'store'),
  ('Gestor', 'audit_log', '{view}', 'store'),
  ('Gestor', 'media', '{view,edit,delete}', 'store'),
  ('Gestor', 'role', '{view}', 'store'),
  ('Gestor', 'dre', '{view}', 'store'),
  ('Gestor', 'expense', '{view}', 'store'),
  ('Gestor', 'cashflow', '{view}', 'store'),
  ('Gestor', 'profitability', '{view}', 'store'),
  ('Gestor', 'inventory', '{view}', 'store'),
  ('Gestor', 'customer_service_analytics', '{view}', 'store'),
  ('Gestor', 'insight', '{view,edit}', 'store'),
  ('Gestor', 'storefront_admin', '{view}', 'store'),
  ('Gestor', 'asset_library', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'quick_reply', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'trackable_link', '{view,create,edit,delete}', 'store'),
  ('Gestor', 'scheduled_send', '{view,create,edit,delete}', 'store'),
  ('Vendedor', 'customer', '{view,edit}', 'own'),
  ('Vendedor', 'vehicle', '{view,edit}', 'own'),
  ('Vendedor', 'lead', '{view,edit}', 'own'),
  ('Vendedor', 'conversation', '{view,edit}', 'own'),
  ('Vendedor', 'message', '{view,create}', 'own'),
  ('Vendedor', 'media', '{view}', 'own'),
  ('Vendedor', 'part', '{view}', 'store'),
  ('Vendedor', 'vehicleModel', '{view}', 'store'),
  ('Vendedor', 'modelKit', '{view,create}', 'store'),
  ('Vendedor', 'quote', '{view,edit}', 'own'),
  ('Vendedor', 'order', '{view}', 'own'),
  ('Vendedor', 'commission', '{view}', 'own'),
  ('Vendedor', 'goal', '{view}', 'own'),
  ('Vendedor', 'indicator', '{view}', 'own'),
  ('Vendedor', 'recommendation', '{view}', 'own'),
  ('Vendedor', 'segment', '{view,create,edit}', 'own'),
  ('Vendedor', 'seller', '{view}', 'own'),
  ('Vendedor', 'settings', '{view}', 'own'),
  ('Vendedor', 'asset_library', '{view}', 'own'),
  ('Vendedor', 'quick_reply', '{view}', 'own'),
  ('Vendedor', 'trackable_link', '{create}', 'own'),
  ('Vendedor', 'scheduled_send', '{create}', 'own'),
  ('SDR', 'customer', '{view}', 'store'),
  ('SDR', 'vehicle', '{view}', 'store'),
  ('SDR', 'lead', '{view,create}', 'own'),
  ('SDR', 'conversation', '{view,create}', 'own'),
  ('SDR', 'message', '{view,create}', 'own'),
  ('SDR', 'media', '{view}', 'own'),
  ('SDR', 'part', '{view}', 'store'),
  ('SDR', 'quote', '{view,create}', 'own'),
  ('SDR', 'recommendation', '{view}', 'own'),
  ('SDR', 'seller', '{view}', 'store'),
  ('SDR', 'asset_library', '{view}', 'own'),
  ('SDR', 'quick_reply', '{view}', 'own'),
  ('SDR', 'trackable_link', '{create}', 'own'),
  ('SDR', 'scheduled_send', '{create}', 'own'),
  ('Cliente', 'vehicle', '{view}', 'own'),
  ('Cliente', 'conversation', '{view,create}', 'own'),
  ('Cliente', 'message', '{view,create}', 'own'),
  ('Cliente', 'part', '{view}', 'store'),
  ('Cliente', 'quote', '{view}', 'own'),
  ('Cliente', 'order', '{view}', 'own'),
  ('VendedorExterno', 'customer', '{view,edit}', 'own'),
  ('VendedorExterno', 'vehicle', '{view,edit}', 'own'),
  ('VendedorExterno', 'lead', '{view,edit}', 'own'),
  ('VendedorExterno', 'conversation', '{view,edit}', 'own'),
  ('VendedorExterno', 'message', '{view,create}', 'own'),
  ('VendedorExterno', 'media', '{view}', 'own'),
  ('VendedorExterno', 'part', '{view}', 'store'),
  ('VendedorExterno', 'quote', '{view,edit}', 'own'),
  ('VendedorExterno', 'order', '{view}', 'own'),
  ('VendedorExterno', 'commission', '{view}', 'own'),
  ('VendedorExterno', 'goal', '{view}', 'own'),
  ('VendedorExterno', 'indicator', '{view}', 'own'),
  ('VendedorExterno', 'recommendation', '{view}', 'own'),
  ('VendedorExterno', 'segment', '{view,edit}', 'own'),
  ('VendedorExterno', 'seller', '{view}', 'own'),
  ('Financeiro', 'customer', '{view}', 'store'),
  ('Financeiro', 'quote', '{view}', 'store'),
  ('Financeiro', 'order', '{view}', 'store'),
  ('Financeiro', 'commission', '{view,approve}', 'store'),
  ('Financeiro', 'goal', '{view}', 'store'),
  ('Financeiro', 'indicator', '{view}', 'store'),
  ('Financeiro', 'seller', '{view}', 'store'),
  ('Financeiro', 'store', '{view}', 'own'),
  ('Financeiro', 'part', '{view}', 'store'),
  ('Financeiro', 'audit_log', '{view}', 'store'),
  ('Financeiro', 'dre', '{view,edit}', 'store'),
  ('Financeiro', 'expense', '{view,create,edit,delete}', 'store'),
  ('Financeiro', 'cashflow', '{view,create}', 'store'),
  ('Financeiro', 'profitability', '{view}', 'store'),
  ('Financeiro', 'inventory', '{view}', 'store'),
  ('Financeiro', 'customer_service_analytics', '{view}', 'store'),
  ('Financeiro', 'insight', '{view}', 'store')
on conflict (role_id, resource) do nothing;
