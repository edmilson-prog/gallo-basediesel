---
objeto: stores
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: platform
rls_enabled: true
colunas: 9
edge_functions: [whatsapp-webhook, whatsapp-import-history]
prds_relacionados: [PRD-004, PRD-101, PRD-104, PRD-107]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `stores`

> Loja/unidade da plataforma — raiz do escopo multi-loja. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** platform · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: COMMENT ON stores, no próprio banco)`

> Stores/units of the platform. Maps to IStore (src/shared/types/platform.ts). POC for Fase 2.

Ponto de ancoragem do modelo multi-loja — **todas as 33 tabelas operacionais** carregam `store_id`
apontando para esta tabela. É o eixo horizontal do escopo; `sellers` é o eixo vertical (per-seller).
`🔍 inferido (in-degree de FKs + CLAUDE.md)`

Pontos-chave de domínio: `🔍 inferido (fonte: src/shared/types/platform.ts → IStore)`
- **Tipos de loja:** `matriz` (sede, caso único no MVP), `filial` (unidade própria) ou `parceira`
  (terceiro); validado por check constraint no banco.
- **`settings` JSONB:** carrega um subconjunto fiel de `IPlatformSettings` — configurações
  operacionais completas da loja (pipeline de leads, regras de gamificação, thresholds de ciclo de
  vida, configurações de comissão, frete, SDR, storefront, etc.). No MVP o campo é populado via seed
  com escalares + arrays pequenos; arrays pesados (catálogo de tags, etc.) ficam vazios até os PRDs
  específicos os preencherem. `🔍 (migration 20260608135134 + IStore.settings)`
- **`active_divisions`:** divisões ativas para a loja (PARTS/SERVICE/INDUSTRIAL). Default `{parts}`;
  SERVICE e INDUSTRIAL são dormentes mas modeladas desde o dia 1. `🔍 (IStore + CLAUDE.md)`
- **`manager_id`:** FK opcional para `sellers.id` — o gestor que recebe notificações derivadas
  dirigidas ao papel de gestão (PRD-008 reconciler). Adicionado em PRD-107 (migration
  `20260608233829`); null enquanto o link owner↔seller não está estabelecido.
  `🔍 (migration 20260608233829 + IStore.managerId)`
- **Edge Functions:** `whatsapp-webhook` e `whatsapp-import-history` consultam `stores.manager_id`
  (via service_role, sem RLS) para resolver o seller padrão de distribuição quando nenhum contato
  ou carteira casa. `🔍 (supabase/functions/whatsapp-webhook/index.ts:179–184)`
- **Provider Supabase:** `supabaseStoresProvider` (POC para PRD-104) — apenas `list()` e `get()`;
  sem mutações client-side (INSERT/DELETE não têm policy). `🔍 (src/providers/data/impl/supabase/stores.ts)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `name` | text | não | — | — |
| 3 | `type` | text | não | — | — |
| 4 | `address` | text | não | — | — |
| 5 | `cnpj` | text | não | — | — |
| 6 | `settings` | jsonb | não | — | — |
| 7 | `active_divisions` | text[] | não | `'{parts}'::text[]` | — |
| 8 | `created_at` | timestamptz | não | — | — |
| 9 | `manager_id` | uuid | sim | — | FK → `sellers.id` · Gestor seller for the store (recipient of manager-targeted derived notifications). Nullable. |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/platform.ts → IStore + migrations)`

| coluna | significado |
|--------|-------------|
| `type` | Hierarquia de unidade: `matriz` = sede (apenas 1 no MVP); `filial` = unidade própria; `parceira` = terceiro. Validado por check constraint. |
| `settings` | JSONB com `IPlatformSettings` completo: pipeline de leads, gamificação, thresholds de ciclo de vida, SDR, comissões, frete, storefront e e-commerce. Alterado pela tela de Configurações (várias rotas `/app/configuracoes/*`). |
| `active_divisions` | Array das divisões ativas (`parts`/`service`/`industrial`). Default `{parts}`; SERVICE e INDUSTRIAL dormentes mas modeladas. |
| `manager_id` | FK opcional para o seller que exerce o papel de gestor da loja — usado como destinatário de notificações derivadas (PRD-008) e como fallback de atribuição no webhook WhatsApp. Pode ser `null` antes de PRD-107 estar configurado. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `manager_id` → `sellers.id`

**Entrando (referenciam esta tabela):**

- `ai_usage_events.store_id` → `stores.id`
- `asset_combos.store_id` → `stores.id`
- `asset_library_items.store_id` → `stores.id`
- `audit_logs.store_id` → `stores.id`
- `carteira_transfers.store_id` → `stores.id`
- `cash_flow_entries.store_id` → `stores.id`
- `commissions.store_id` → `stores.id`
- `conversation_notes.store_id` → `stores.id`
- `conversations.store_id` → `stores.id`
- `customers.store_id` → `stores.id`
- `departments.store_id` → `stores.id`
- `distribution_traces.store_id` → `stores.id`
- `expenses.store_id` → `stores.id`
- `goals.store_id` → `stores.id`
- `leads.store_id` → `stores.id`
- `media_assets.store_id` → `stores.id`
- `message_templates.store_id` → `stores.id`
- `model_kits.store_id` → `stores.id`
- `notifications.store_id` → `stores.id`
- `orders.store_id` → `stores.id`
- `parts.store_id` → `stores.id`
- `product_indicators.store_id` → `stores.id`
- `profiles.store_id` → `stores.id`
- `quick_replies.store_id` → `stores.id`
- `quotes.store_id` → `stores.id`
- `recommendations.store_id` → `stores.id`
- `roles.store_id` → `stores.id`
- `rotation_queues.store_id` → `stores.id`
- `scheduled_sends.store_id` → `stores.id`
- `sdr_escalations.store_id` → `stores.id`
- `sellers.store_id` → `stores.id`
- `trackable_links.store_id` → `stores.id`
- `whatsapp_accounts.store_id` → `stores.id`

## RLS — Row Level Security `[regra: mecânico]`

### `stores_select` — SELECT · roles: `{authenticated}`
- **USING:** `(id = ( SELECT current_store_id() AS current_store_id))`

### `stores_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`
- **WITH CHECK:** `(id = ( SELECT current_store_id() AS current_store_id))`

**Justificativa do desenho:** `🔍 inferido (fonte: migration 20260608220448 + CLAUDE.md)`
- **Isolamento radical por loja:** a policy de SELECT usa `id = current_store_id()` — uma sessão
  só enxerga a própria linha de `stores`. Isso garante que settings/dados de uma loja nunca vazam
  para outra sessão, mesmo em ambiente multi-tenant futuro.
- **UPDATE restrito a staff:** `is_staff()` bloqueia vendedores de alterar configurações da loja
  (settings, active_divisions, etc.). O `WITH CHECK` repete apenas `id = current_store_id()` —
  intencionalmente mais frouxo que o `USING`, pois o UPDATE já está filtrado pela checagem de staff.
- **Sem INSERT/DELETE client-side:** não há policy para INSERT nem DELETE; lojas são criadas e
  removidas apenas via migrations/scripts de infraestrutura (operação owner-exclusiva de infra),
  não pela UI.
- **Edge Functions leem via service_role:** as funções `whatsapp-webhook` e
  `whatsapp-import-history` consultam `stores` diretamente com o cliente admin (bypass de RLS),
  pois precisam resolver `manager_id` antes de o contexto de sessão estar disponível.
  `🔍 (supabase/functions/whatsapp-webhook/index.ts:178–184)`

## Índices `[mecânico]`

- `idx_stores_manager_id` — `CREATE INDEX idx_stores_manager_id ON public.stores USING btree (manager_id)`
- `stores_pkey` — `CREATE UNIQUE INDEX stores_pkey ON public.stores USING btree (id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `stores_type_check`: `(type = ANY (ARRAY['matriz'::text, 'filial'::text, 'parceira'::text]))`

**Narrativa** `🔍 inferido (platform.ts + migrations + CLAUDE.md)`:
- O check `type in ('matriz','filial','parceira')` reflete a hierarquia jurídico-operacional da
  distribuidora; no MVP há apenas a `matriz` (seed `store-matriz`). Filiais e parceiras são
  modeladas para expansão sem migration adicional.
- O `id` original da migration POC era `text` (seed com `'store-matriz'`), mas a tabela
  definitiva usa `uuid` (`gen_random_uuid()`) — a divergência PK text→uuid foi resolvida nas
  migrations subsequentes. `🔍 (migration 20260608135134 vs. ficha mecânica col #1 uuid)`
- `settings` nunca é nulo; a migration exige `NOT NULL`. Um store sem configuração editorial
  operacional não é válido — é o settings que determina o comportamento de toda a plataforma
  (SDR, distribuição, comissões, gamificação, etc.).
- `active_divisions` default `{parts}` garante que toda nova loja nasce com pelo menos uma
  divisão ativa; arrays vazios romperiam filtros de divisão em todo o CRM.

## Perguntas pendentes

- ❓ A migration POC original (`20260608135134`) cria `id` como `text primary key` (seed `'store-matriz'`), mas a ficha mecânica lista `id` como `uuid`. Confirmar: houve migration posterior que converteu o PK para uuid, ou o banco de produção ainda carrega `id text`?
- ❓ `settings` é um JSONB enorme com +20 subchaves de `IPlatformSettings`. Existe intenção de normalizar alguma subchave em tabela própria (ex.: `pipeline_stages`, `loss_reasons`) para facilitar queries e edição atômica, ou o JSONB monolítico é a decisão permanente?
- ❓ Não há policy de INSERT client-side para `stores`. A criação de filiais/parceiras no futuro passará por migration ou haverá uma Edge Function owner-only com service_role?

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
