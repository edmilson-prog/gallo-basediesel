# PRD-103: RLS (Row Level Security)

> **✅ STATUS: CONCLUÍDO (com ressalvas) — 2026-06-09 · v0.73.0 Keystone**
>
> Implementado com adaptações registradas: schema único `public` (não `crm`+`storefront`), policies aplicadas via migrations MCP (56 no histórico remoto), helpers de identidade via JWT claims (`current_store_id()`, `current_seller_id()`, `is_staff()`), isolamento per-seller (Slices 1–4 + #43/#48), storefront anon read-only e suíte de regressão versionada (`supabase/tests/rls-regression.sql`).
>
> **Ressalvas (dívida rastreada, não bloqueia o done):**
> - CI de RLS (`.github/workflows/rls-tests.yml`) é **no-op até o secret `SUPABASE_DB_URL`** ser adicionado — issue **#45** / `docs/fase2-pendencias.md#a1-ci`.
> - Matriz visual completa (18 recursos × 5 ações × 4 scopes) resumida por buckets em `docs/db/rls-policies-fase2-mvp.md`, não tabela integral.
> - Cliente B2B/B2C (4º consumidor) sem claim/policies — deferido para a fase loja transacional (issue #41).

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                                                                                                                                                                                                                                        |
| **Repositório**       | _Repositório vivo da Fase 1, diretório `supabase/migrations/`_                                                                                                                                                                                                                                                                                                                                                                  |
| **Objetivo**          | Implementar a matriz canônica de permissões do PRD-006 Fase 1 como políticas Row-Level Security do Postgres, distribuídas nos schemas `crm` e `storefront`, distinguindo os 4 tipos de consumidor (vendedor interno, vendedor externo, cliente B2B, anônimo/B2C) e os 4 scopes (own / store / team / all). Imutabilidade de audit log enforced via policies. Defense-in-depth real — sem dependência do frontend para segurança |
| **Tipo**              | Feature                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Complexidade**      | Crítica                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Total de Fases**    | 5                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Prioridade**        | P0 — bloqueante para PRD-104 (Providers Reais) e qualquer operação multi-usuário em staging/prod                                                                                                                                                                                                                                                                                                                                |
| **Épico**             | Onda 4 — Backend Supabase Real (v2.0.0 Engine)                                                                                                                                                                                                                                                                                                                                                                                  |
| **PRDs Relacionados** | PRD-006 Fase 1 (matriz RBAC fonte); PRD-101 (Schema — habilita RLS, este escreve policies); PRD-107 (Auth Custom Claims — popula `seller_id`, `store_id`, `role` no JWT); PRD-102 (Edge Functions — usam `service_role` que bypassa RLS); PRD-104 (Providers Reais — depende de RLS para funcionar com segurança); PRD-189 Onda 12 (Permissões Cross-Store — estende este padrão)                                               |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Padrão de código**  | Policies SQL em arquivos `.sql` versionados em `supabase/migrations/`; uma migration por agrupamento lógico (core, comercial, gestão, audit, storefront)                                                                                                                                                                                                                                                                        |

### Critérios de Complexidade

> **Justificativa de Crítica:** RLS é a linha de defesa principal contra vazamento de dados em produção. Erro em uma policy pode (1) bloquear operação legítima causando downtime ou (2) expor dados de cliente A para cliente B — incidente de segurança grave com implicação LGPD. Envolve traduzir matriz RBAC do PRD-006 (18 recursos × 5 ações × 4 scopes) para SQL, com 4 tipos distintos de consumidor (vendedor interno, vendedor externo, cliente B2B, anônimo/B2C). Para cada tabela do PRD-101, decidir policies SELECT/INSERT/UPDATE/DELETE por role. Imutabilidade de audit log. Cross-schema (`storefront.product_reviews → crm.parts`). Testes obrigatórios e abrangentes — toda violação representa uma falha de segurança.

---

## Contexto do Problema

O PRD-101 (Schema) habilitou `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` em todas as tabelas. Isso é "fail closed" intencional: sem policy explícita, **ninguém acessa nada** (exceto `service_role`, que bypassa RLS por design — usado apenas em Edge Functions privilegiadas).

Este PRD escreve as policies que destravam o acesso legítimo, espelhando a matriz RBAC do PRD-006 Fase 1. A matriz tem 4 dimensões:

| Dimensão    | Valores possíveis                                                                            |
| ----------- | -------------------------------------------------------------------------------------------- |
| **Recurso** | 18 entidades (customers, orders, parts, commissions, audit_logs, etc.)                       |
| **Ação**    | 5 (create, read, update, delete, special)                                                    |
| **Scope**   | 4 (own, store, team [dormente], all)                                                         |
| **Role**    | 6 (owner, manager, seller_internal, seller_external, b2b_customer, b2c_customer + anonymous) |

A complexidade não está em escrever uma policy — está em **garantir consistência em toda a matriz** sem deixar buraco. O PRD-006 já entregou o `matrix.ts` no frontend; este PRD traduz para SQL.

**A diferença essencial:** o `matrix.ts` é convenção (frontend respeita ou não); o RLS é enforced no banco — bug no frontend não vaza dados. Esse é o ponto inteiro da existência deste PRD.

---

## Conceito da Solução

### Padrão das Policies

Cada tabela do schema `crm` terá tipicamente entre 4 e 8 policies, uma por combinação (action × role/scope). Padrão geral:

```sql
-- SELECT: Owner e Manager veem tudo da própria loja
CREATE POLICY "select_owner_manager_own_store" ON crm.customers
  FOR SELECT
  TO authenticated
  USING (
    store_id = crm.current_store_id()
    AND crm.current_role() IN ('owner', 'manager')
  );

-- SELECT: Vendedor interno só vê os clientes da própria carteira
CREATE POLICY "select_seller_own_portfolio" ON crm.customers
  FOR SELECT
  TO authenticated
  USING (
    seller_id = crm.current_seller_id()
    AND crm.current_role() = 'seller_internal'
  );

-- SELECT: Vendedor externo idem
CREATE POLICY "select_external_own_portfolio" ON crm.customers
  FOR SELECT
  TO authenticated
  USING (
    seller_id = crm.current_seller_id()
    AND crm.current_role() = 'seller_external'
  );

-- SELECT: Cliente B2B vê os próprios dados (via portal)
CREATE POLICY "select_b2b_own_data" ON crm.customers
  FOR SELECT
  TO authenticated
  USING (
    id = crm.current_customer_id()
    AND crm.current_role() = 'b2b_customer'
  );
```

Postgres aplica **OR** entre policies do mesmo tipo (SELECT) — usuário acessa a linha se **qualquer** policy permitir. Isso é intencional e útil: cada policy expressa uma regra positiva clara.

### Funções Helper SQL

Para evitar replicar a lógica de extração do JWT em cada policy, criamos funções utilitárias no schema `crm` (assim como `set_updated_at()` do PRD-101):

```sql
CREATE OR REPLACE FUNCTION crm.current_seller_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF((auth.jwt() -> 'app_metadata' ->> 'seller_id'), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION crm.current_store_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF((auth.jwt() -> 'app_metadata' ->> 'store_id'), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION crm.current_customer_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF((auth.jwt() -> 'app_metadata' ->> 'customer_id'), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION crm.current_role()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT auth.jwt() -> 'app_metadata' ->> 'role';
$$;

CREATE OR REPLACE FUNCTION crm.has_role(target_role text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT crm.current_role() = target_role;
$$;

CREATE OR REPLACE FUNCTION crm.has_any_role(target_roles text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT crm.current_role() = ANY(target_roles);
$$;
```

**Nota:** essas funções dependem do PRD-107 popular `app_metadata.seller_id`, `app_metadata.store_id`, `app_metadata.customer_id`, `app_metadata.role` no JWT do Supabase Auth. Enquanto o PRD-107 não está pronto, as funções retornam `NULL` e policies bloqueiam tudo (fail closed) — comportamento aceitável para staging vazio.

### 4 Tipos de Consumidor

| Role                  | JWT app_metadata                                     | Acesso esperado                                                                     |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **`owner`**           | `role: 'owner', store_id: X`                         | Acesso completo dentro do `store_id`; veta apenas tabelas globais não-store (raras) |
| **`manager`**         | `role: 'manager', store_id: X`                       | Acesso amplo dentro do `store_id`, mas sem operações destrutivas em config/audit    |
| **`seller_internal`** | `role: 'seller_internal', store_id: X, seller_id: Y` | Apenas dados da própria carteira; sem audit log de outros                           |
| **`seller_external`** | `role: 'seller_external', store_id: X, seller_id: Y` | Como `seller_internal` mas com escopo mais estrito (não enxerga BI agregado)        |
| **`b2b_customer`**    | `role: 'b2b_customer', customer_id: Z`               | Apenas dados próprios do cliente (orders, quotes, vehicles próprios) — usa portal   |
| **`b2c_customer`**    | `role: 'b2c_customer'` (sem store_id/seller_id)      | Apenas dados próprios via `storefront.customer_accounts`                            |
| **`anonymous`**       | (sem JWT, role=`anon`)                               | Apenas leitura de `storefront.products`, categories, content_pages                  |

### Cross-Schema Considerations

`storefront.product_reviews.part_id` referencia `crm.parts.id`. Policies de `product_reviews`:

- SELECT: público (anônimo lê reviews aprovadas)
- INSERT: apenas `b2c_customer` autenticado para seu próprio account
- UPDATE/DELETE: apenas owner/manager (moderação) ou o próprio autor

A leitura cross-schema da view `storefront.products` (que faz SELECT de `crm.parts`) só funciona porque a view foi criada com `SECURITY DEFINER` (vide PRD-101 RF-081 — corrigir lá se não estiver: views públicas devem ser `SECURITY DEFINER` apontando para função que retorna apenas linhas seguras).

### Padrão de Imutabilidade — `crm.audit_logs`

```sql
ALTER TABLE crm.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.audit_logs FORCE ROW LEVEL SECURITY;

-- Anyone authenticated can INSERT into audit_logs (Edge Functions normalmente)
CREATE POLICY "audit_insert_any_authenticated" ON crm.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Owner and Manager can SELECT audit logs of their own store
CREATE POLICY "audit_select_owner_manager_store" ON crm.audit_logs
  FOR SELECT TO authenticated
  USING (
    crm.has_any_role(ARRAY['owner', 'manager'])
    AND (
      payload -> 'storeId' IS NULL OR  -- system-wide log
      (payload ->> 'storeId')::uuid = crm.current_store_id()
    )
  );

-- Sellers can SELECT only their own actions
CREATE POLICY "audit_select_seller_own" ON crm.audit_logs
  FOR SELECT TO authenticated
  USING (
    crm.has_any_role(ARRAY['seller_internal', 'seller_external'])
    AND actor_id = crm.current_seller_id()
  );

-- No one can UPDATE
CREATE POLICY "audit_no_update" ON crm.audit_logs
  FOR UPDATE USING (false);

-- No one can DELETE
CREATE POLICY "audit_no_delete" ON crm.audit_logs
  FOR DELETE USING (false);
```

### Alternativas Consideradas

| Alternativa                                               | Por que descartada                                                                                        |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Aplicar segurança apenas no frontend (`matrix.ts` Fase 1) | Frontend é compromised pelo navegador; bug ou ataque dev tools vaza dados. RLS é defesa real              |
| Uma policy mega-genérica por tabela usando CASE           | Difícil de auditar, debugar e evoluir. Multiple policies + OR semantics do Postgres é mais claro          |
| Helper functions em `public` schema                       | Polui `public` (deliberadamente vazio per briefing v1.3). `crm` é o lar natural                           |
| Policies separadas para cada role e cada ação             | Explosão combinatória. Agrupar por `has_role`/`has_any_role` é manageable                                 |
| Usar Postgres roles separados (postgres-level) por user   | Não suportado pelo Supabase Auth padrão; quebra o modelo `authenticated` único                            |
| Skip RLS em staging para "facilitar dev"                  | Antipattern crítico. Bug de RLS só aparece em prod. Staging tem que ser fiel a prod                       |
| RLS apenas em SELECT (INSERT/UPDATE/DELETE livres)        | Inserts cross-store seriam permitidos; vendedor B colocaria pedido na carteira de vendedor A. Inaceitável |

---

## Escopo

### Incluído

- ✅ Migration `00000000000060_rls_helper_functions.sql`: funções `crm.current_seller_id`, `current_store_id`, `current_customer_id`, `current_role`, `has_role`, `has_any_role`
- ✅ Migration `00000000000061_rls_policies_core.sql`: policies em `crm.stores`, `crm.sellers`, `crm.brands`, `crm.categories`, `crm.parts`, `crm.applications`, `crm.customers`, `crm.vehicles`
- ✅ Migration `00000000000062_rls_policies_relational.sql`: policies em `crm.leads`, `crm.whatsapp_accounts`, `crm.conversations`, `crm.messages`, `crm.customer_notes`, `crm.customer_segments`, `crm.vehicle_service_entries`
- ✅ Migration `00000000000063_rls_policies_commercial.sql`: policies em `crm.carteira_transfers`, `crm.quotes`, `crm.quote_items`, `crm.orders`, `crm.order_items`
- ✅ Migration `00000000000064_rls_policies_gestao.sql`: policies em `crm.goals`, `crm.gamification_badges`, `crm.positivations`, `crm.abc_classifications`, `crm.commissions`, `crm.recommendations`
- ✅ Migration `00000000000065_rls_policies_config.sql`: policies em `crm.teams`, `crm.portal_settings`, `crm.platform_settings`, `crm.app_versions`, `crm.feature_flags`
- ✅ Migration `00000000000066_rls_policies_audit.sql`: policies em `crm.audit_logs` (incluindo imutabilidade) + `crm.processed_events`, `crm.integration_logs`
- ✅ Migration `00000000000067_rls_policies_llm.sql`: policies em `crm.llm_providers`, `crm.llm_overrides`, `crm.llm_usage_metrics`
- ✅ Migration `00000000000068_rls_policies_storefront.sql`: policies em `storefront.categories`, `storefront.featured`, `storefront.content_pages`, `storefront.cart_sessions`, `storefront.customer_accounts`, `storefront.addresses`, `storefront.product_reviews`
- ✅ View `storefront.products` revisitada para `SECURITY DEFINER` (vinda do PRD-101)
- ✅ Testes RLS automatizados em `supabase/tests/rls/` usando `pgTAP` ou framework similar — verifica violações típicas (vendedor A acessa cliente de vendedor B retorna 0 linhas)
- ✅ Workflow CI `.github/workflows/rls-tests.yml` que executa testes RLS após migrations em staging
- ✅ Documentação `docs/db/rls-policies.md`: matriz visual de todas as policies, mapeamento PRD-006 → SQL, troubleshooting comum
- ✅ Validação E2E manual: criar 4 usuários de teste (1 owner, 1 manager, 1 seller, 1 b2b_customer) e validar que cada um vê apenas o que deve ver

### Excluído

- ❌ População de `app_metadata` no JWT (vai no PRD-107)
- ❌ Substituição do `MockDataProvider` por `SupabaseDataProvider` (vai no PRD-104)
- ❌ Policies de tabelas que ainda não existem (Onda 5+: payment_attempts, notification_dispatch etc. — cada PRD escreve suas próprias policies)
- ❌ Permissões cross-store granulares (Onda 12 PRD-189 estende este padrão)
- ❌ Auditoria de tentativas de violação RLS (Postgres não loga isso por default; PRD-110 Monitoring avalia se vale instrumentar)
- ❌ Time-based access control (acesso só em horário comercial etc.) — fora de escopo
- ❌ IP-based access control — fora de escopo

---

## Requisitos Funcionais

### Funções Helper

- **RF-001:** Criar função `crm.current_seller_id() RETURNS uuid LANGUAGE sql STABLE` que retorna `NULLIF((auth.jwt() -> 'app_metadata' ->> 'seller_id'), '')::uuid`. Marcada `STABLE` para permitir cache do planner em uma transação.
- **RF-002:** Idem para `crm.current_store_id()`, `crm.current_customer_id()`.
- **RF-003:** Criar `crm.current_role() RETURNS text LANGUAGE sql STABLE` retornando `auth.jwt() -> 'app_metadata' ->> 'role'`.
- **RF-004:** Criar `crm.has_role(target_role text) RETURNS boolean LANGUAGE sql STABLE`.
- **RF-005:** Criar `crm.has_any_role(target_roles text[]) RETURNS boolean LANGUAGE sql STABLE`.
- **RF-006:** Conceder `GRANT EXECUTE` dessas funções aos roles `authenticated` e `anon`. Funções retornam NULL para anônimos (que não têm JWT com `app_metadata`).

### Policies Core (stores, sellers, parts, customers, vehicles)

#### `crm.stores`

- **RF-010:** SELECT: `authenticated` se `id = crm.current_store_id()` OU `has_role('owner')` (owner com escopo all, raríssimo).
- **RF-011:** INSERT/UPDATE/DELETE: apenas `service_role` (Edge Function); criação de novas lojas é operação admin manual.

#### `crm.sellers`

- **RF-012:** SELECT: `authenticated` se `store_id = crm.current_store_id()` (todos da mesma loja se enxergam — necessário para popup de seleção, atribuição de carteira, gamificação).
- **RF-013:** UPDATE próprio perfil: `authenticated` se `id = (SELECT id FROM crm.sellers WHERE auth_user_id = auth.uid())`. Apenas certas colunas: `name`, `phone`, `whatsapp`, `custom_claims`. **Owner/manager** podem UPDATE `role`, `is_active`, `store_id` via policy adicional.
- **RF-014:** INSERT: apenas `service_role` (criação via convite, fluxo Edge Function PRD-167).
- **RF-015:** DELETE: bloqueado para todos via policy `FOR DELETE USING (false)`; desativação usa `is_active = false` + soft delete em colunas adicionais se necessário.

#### `crm.brands` e `crm.categories`

- **RF-016:** SELECT: aberto a `authenticated` (sem filtro de loja — catálogo é global).
- **RF-017:** INSERT/UPDATE/DELETE: apenas `owner` e `manager`. Anônimo lê via `storefront` schema (RFs 080+).

#### `crm.parts`

- **RF-018:** SELECT: `authenticated` se `store_id = crm.current_store_id()` (catálogo por loja).
- **RF-019:** INSERT/UPDATE/DELETE: apenas `owner` e `manager`.
- **RF-020:** Vendedor (interno ou externo) tem SELECT mas não escreve. Cliente B2B só vê via `storefront.products` view.

#### `crm.applications` (compatibilidade peça↔veículo)

- **RF-021:** SELECT: `authenticated` (sem filtro de loja — compatibilidade é global).
- **RF-022:** INSERT/UPDATE/DELETE: apenas `owner` e `manager`.

#### `crm.customers`

- **RF-023:** SELECT: 4 policies em OR:
  - `owner`/`manager` se `store_id = current_store_id()` (acesso all-store)
  - `seller_internal` se `seller_id = current_seller_id()` (carteira própria)
  - `seller_external` idem
  - `b2b_customer` se `id = current_customer_id()` (próprios dados)
- **RF-024:** INSERT: `authenticated` se `store_id = current_store_id()` AND `has_any_role(['owner','manager','seller_internal','seller_external'])`. Cliente B2C/B2B não cria via portal (vai pelo storefront).
- **RF-025:** UPDATE: análogo ao SELECT — vendedor só edita os próprios. Owner/Manager edita qualquer um da loja.
- **RF-026:** DELETE: apenas `owner`. Vendedor não deleta cliente — apenas marca `is_active=false` (soft delete via UPDATE).

#### `crm.vehicles`

- **RF-027:** SELECT: idêntico ao customers, via `customer_id` (vendedor vê veículo de cliente da carteira; b2b_customer vê próprios; owner/manager veem da store).
- **RF-028:** INSERT/UPDATE/DELETE: vendedor responsável pelo cliente + owner/manager.

### Policies Relacionais (leads, conversations, messages, etc.)

#### `crm.leads`

- **RF-030:** SELECT/UPDATE/DELETE: vendedor enxerga apenas leads atribuídos (`seller_id = current_seller_id()`); owner/manager veem todos da store.
- **RF-031:** INSERT: vendedor cria leads para si próprio (`seller_id = current_seller_id()`); owner/manager criam para qualquer vendedor da store.

#### `crm.whatsapp_accounts`

- **RF-032:** SELECT: `authenticated` se `store_id = current_store_id()`.
- **RF-033:** INSERT/UPDATE/DELETE: apenas `owner` e `manager`.

#### `crm.conversations` e `crm.messages`

- **RF-034:** SELECT em `conversations`: vendedor responsável (`seller_id = current_seller_id()`); owner/manager veem todas da store; b2b_customer vê apenas as próprias (`customer_id = current_customer_id()`).
- **RF-035:** SELECT em `messages`: deriva da conversation acessível (`conversation_id IN (SELECT id FROM conversations WHERE ...)`). Postgres otimiza isso com index correto.
- **RF-036:** INSERT em `messages`: vendedor responsável pela conversation + Edge Functions de webhook (via service_role).
- **RF-037:** UPDATE/DELETE em `messages`: bloqueado — mensagens são imutáveis (já não têm `updated_at` per PRD-101 RF-023). Reforçado por `FOR UPDATE/DELETE USING (false)`.

#### `crm.customer_notes`

- **RF-038:** SELECT/INSERT: vendedor da carteira do customer; owner/manager.
- **RF-039:** UPDATE: apenas autor (`seller_id = current_seller_id()`) + owner/manager.
- **RF-040:** DELETE: soft delete via UPDATE `deleted_at`; DELETE físico bloqueado.

#### `crm.customer_segments`

- **RF-041:** SELECT: `authenticated` (segmentos são globais para uso em campanhas).
- **RF-042:** INSERT/UPDATE/DELETE: apenas `owner` e `manager`.

#### `crm.vehicle_service_entries`

- **RF-043:** SELECT/INSERT/UPDATE: vendedor responsável (via `vehicle.customer.seller_id`); owner/manager.
- **RF-044:** DELETE: bloqueado (histórico imutável).

### Policies Comerciais (carteira_transfers, quotes, orders)

#### `crm.carteira_transfers`

- **RF-050:** SELECT: ambos os vendedores envolvidos (`from_seller_id` ou `to_seller_id` = current); owner/manager veem todos.
- **RF-051:** INSERT: apenas `owner` e `manager` (transferências são operação de gestão).
- **RF-052:** UPDATE/DELETE: bloqueado — transferência é evento imutável.

#### `crm.quotes`

- **RF-053:** SELECT: vendedor responsável; owner/manager; cliente via `customer_id = current_customer_id()` (b2b_customer apenas).
- **RF-054:** INSERT: vendedor (próprio `seller_id`); owner/manager; Edge Function SDR (service_role).
- **RF-055:** UPDATE: vendedor responsável (se status != 'converted'); owner/manager (sempre).
- **RF-056:** DELETE: apenas owner (e só quotes draft).

#### `crm.quote_items`

- **RF-057:** SELECT/INSERT/UPDATE/DELETE: deriva da quote (`quote_id IN (...)`). Cascateamento natural.

#### `crm.orders`

- **RF-058:** SELECT: vendedor responsável; owner/manager; cliente B2B próprio; cliente B2C via `storefront.customer_accounts.linked_crm_customer_id`.
- **RF-059:** INSERT: vendedor (próprio `seller_id`); owner/manager; Edge Function checkout (service_role para inserções do storefront).
- **RF-060:** UPDATE: vendedor responsável (apenas certos status); owner/manager (todos status).
- **RF-061:** DELETE: bloqueado. Cancelamento via UPDATE `status = 'cancelled'`.

#### `crm.order_items`

- **RF-062:** Deriva da order. Mesma lógica de `quote_items`.

### Policies Gestão e BI

#### `crm.goals`

- **RF-070:** SELECT: vendedor vê metas próprias (`scope='seller' AND scope_ref_id = current_seller_id()`) + metas da store (`scope='store' AND scope_ref_id = current_store_id()`). Owner/manager veem todas.
- **RF-071:** INSERT/UPDATE/DELETE: apenas owner/manager.

#### `crm.gamification_badges`

- **RF-072:** SELECT: vendedor vê próprios + da store; owner/manager veem todos da store.
- **RF-073:** INSERT: apenas via Edge Function (service_role) — ganho de badge é evento sistêmico.
- **RF-074:** UPDATE/DELETE: bloqueado (badges imutáveis).

#### `crm.positivations`, `crm.abc_classifications`

- **RF-075:** SELECT: vendedor vê próprios clientes (via join); owner/manager veem da store.
- **RF-076:** INSERT/UPDATE: apenas Edge Function de cálculo (service_role).
- **RF-077:** DELETE: bloqueado.

#### `crm.commissions`

- **RF-078:** SELECT: vendedor vê próprias (`seller_id = current_seller_id()`); owner/manager veem da store.
- **RF-079:** INSERT/UPDATE: apenas Edge Function de cálculo (service_role); UPDATE de `status` para `approved`/`paid` apenas owner/manager.
- **RF-080:** DELETE: bloqueado (histórico imutável).

#### `crm.recommendations`

- **RF-081:** SELECT: vendedor responsável; owner/manager.
- **RF-082:** INSERT: Edge Function de IA (service_role) ou owner/manager.
- **RF-083:** UPDATE (dismiss/action): vendedor responsável; owner/manager.

### Policies Config

#### `crm.teams`

- **RF-090:** SELECT: `authenticated` da store (`store_id = current_store_id()`).
- **RF-091:** INSERT/UPDATE/DELETE: apenas owner.

#### `crm.portal_settings`

- **RF-092:** SELECT: cliente B2B próprio + owner/manager.
- **RF-093:** INSERT/UPDATE/DELETE: apenas owner/manager.

#### `crm.platform_settings`

- **RF-094:** SELECT: `authenticated` (configurações são públicas para o app).
- **RF-095:** INSERT/UPDATE/DELETE: apenas owner.

#### `crm.app_versions`

- **RF-096:** SELECT: `authenticated`.
- **RF-097:** INSERT: apenas via CI (service_role).
- **RF-098:** UPDATE/DELETE: bloqueado.

#### `crm.feature_flags`

- **RF-099:** SELECT: `authenticated` (frontend lê para decidir UI).
- **RF-100:** INSERT/UPDATE/DELETE: apenas owner.

### Policies Audit e Suporte

#### `crm.audit_logs`

- **RF-110:** INSERT: `authenticated` (qualquer usuário pode gerar audit — normalmente via Edge Function). Policy: `WITH CHECK (true)`.
- **RF-111:** SELECT: owner/manager da store + vendedor vê próprias ações (`actor_id = current_seller_id()`).
- **RF-112:** UPDATE: bloqueado via `FOR UPDATE USING (false)`.
- **RF-113:** DELETE: bloqueado via `FOR DELETE USING (false)`.

#### `crm.processed_events`

- **RF-114:** SELECT/INSERT/UPDATE: apenas service_role (uso interno de Edge Functions).
- **RF-115:** DELETE: bloqueado (idempotência permanente).

#### `crm.integration_logs`

- **RF-116:** SELECT: owner/manager.
- **RF-117:** INSERT: service_role (apenas Edge Functions logam).
- **RF-118:** UPDATE/DELETE: bloqueado.

### Policies LLM

#### `crm.llm_providers`, `crm.llm_overrides`

- **RF-120:** SELECT: `authenticated` (a UI precisa para mostrar quais providers estão ativos).
- **RF-121:** INSERT/UPDATE/DELETE: apenas owner.

#### `crm.llm_usage_metrics`

- **RF-122:** SELECT: owner/manager (dashboard PRD-151D).
- **RF-123:** INSERT: service_role (Edge Function LLM grava métricas).
- **RF-124:** UPDATE/DELETE: bloqueado.

### Policies Storefront

#### `storefront.categories`, `storefront.featured`, `storefront.content_pages`

- **RF-130:** SELECT: `anon` e `authenticated` quando `is_published=true` (ou `is_active=true`).
- **RF-131:** INSERT/UPDATE/DELETE: apenas `owner`/`manager` (via JWT autenticado com `crm` role).

#### `storefront.products` (view)

- **RF-132:** SELECT: `anon` e `authenticated`. View é `SECURITY DEFINER` e filtra `is_active=true` em `crm.parts`. Custos e dados sensíveis nunca expostos (RF-081 do PRD-101).

#### `storefront.cart_sessions`

- **RF-133:** SELECT: dono do cart (via `customer_account_id` se logado, ou via cookie `anonymous_token` matching).
- **RF-134:** INSERT/UPDATE/DELETE: idem.

#### `storefront.customer_accounts`

- **RF-135:** SELECT: dono (`auth_user_id = auth.uid()`); owner/manager (suporte).
- **RF-136:** INSERT: via Edge Function signup; UPDATE pelo próprio dono ou owner/manager.
- **RF-137:** DELETE: soft delete (LGPD direito ao esquecimento — PRD-191).

#### `storefront.addresses`

- **RF-138:** SELECT/INSERT/UPDATE/DELETE: dono do customer_account (cascade via FK).

#### `storefront.product_reviews`

- **RF-139:** SELECT: `anon` se `is_approved=true`; autor sempre vê próprias.
- **RF-140:** INSERT: B2C autenticado.
- **RF-141:** UPDATE (moderação): owner/manager.
- **RF-142:** DELETE: owner/manager + autor (próprio review).

### Testes Automatizados RLS

- **RF-150:** Diretório `supabase/tests/rls/` com arquivos `.sql` testando cenários de violação. Framework: `pgTAP` ou `supabase test db`.
- **RF-151:** Testes obrigatórios cobrem:
  - Vendedor A não vê customer de vendedor B (isolamento de carteira)
  - Vendedor não vê audit log de outro vendedor
  - Anônimo não vê schema `crm` (PostgREST bloqueia antes mesmo de RLS)
  - Anônimo vê `storefront.products` mas não `crm.parts`
  - B2B customer X não vê orders de cliente Y
  - UPDATE em audit_logs retorna 0 rows affected (policy bloqueia)
  - DELETE em messages retorna 0 rows affected
  - service_role bypassa todas as policies
- **RF-152:** Cada teste tem `setup` (cria fixture com 2 vendedores, 2 clientes, etc.) e `teardown`.
- **RF-153:** Workflow CI `.github/workflows/rls-tests.yml` executa todos os testes após cada migration aplicada em staging. Falha aborta deploy.

### Documentação

- **RF-160:** `docs/db/rls-policies.md` com:
  - Matriz visual completa: tabela × ação × role × scope
  - Mapeamento PRD-006 Fase 1 → policies SQL
  - Padrões de troubleshooting comuns ("Por que vendedor X não vê customer Y?")
  - Como debugar policies: `SET ROLE authenticated; SET request.jwt.claims = '...'; SELECT ...`
  - Como adicionar nova policy para PRD futuro

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança — fail closed):** Nenhuma tabela tem RLS desabilitada. Tabelas sem policy explícita ficam inacessíveis (RF-110 do PRD-101 garante `FORCE RLS`).
- **RNF-002 (Performance — policy overhead):** Funções helper são `STABLE`, permitindo cache do planner em uma transação. Policies usando `current_seller_id()` etc. não devem adicionar > 10ms p95 vs query sem RLS.
- **RNF-003 (Auditabilidade):** Toda mudança de policy gera registro em `docs/db/rls-changelog.md` versionado no Git.
- **RNF-004 (Manutenibilidade):** Policy names devem ser autodocumentantes: `<action>_<who>_<condition>` (ex: `select_seller_own_portfolio`, `audit_no_delete`).
- **RNF-005 (Cobertura de testes):** Pelo menos 1 teste por tabela cobrindo cenário de violação esperado. Cenários "boundary" cobertos (mudança de seller_id, transferência de carteira).
- **RNF-006 (Compatibilidade com PRD-107):** Quando PRD-107 estiver pronto e popular `app_metadata`, policies devem funcionar sem mudança. Se PRD-107 atrasar, policies bloqueiam tudo (fail closed) — comportamento aceitável em staging.
- **RNF-007 (LGPD):** Tabelas com PII (`customers`, `customer_accounts`, `messages`, `customer_notes`) têm policies que respeitam soft delete (`deleted_at IS NULL`) onde aplicável.

---

## Critérios de Aceitação

### RF-023 + RF-150: Isolamento de Carteira

```gherkin
DADO um vendedor A com seller_id=S1, store_id=ST1
  E um vendedor B com seller_id=S2, store_id=ST1 (mesma loja)
  E um customer C1 com seller_id=S1 (carteira de A)
  E um customer C2 com seller_id=S2 (carteira de B)
QUANDO vendedor A autenticado faz SELECT * FROM crm.customers
ENTÃO recebe APENAS C1
  E não recebe C2
  E recebe 1 linha total

QUANDO vendedor A tenta UPDATE customers SET name='hacked' WHERE id=C2.id
ENTÃO 0 rows affected (RLS bloqueia)
  E não há audit log de tentativa (Postgres não loga RLS denial por default)
```

### RF-111: Audit Log por Role

```gherkin
DADO um audit log inserido com actor_id=S1, payload contendo storeId=ST1
QUANDO seller S1 (interno) faz SELECT * FROM crm.audit_logs
ENTÃO recebe esse log (próprio)

QUANDO seller S2 (interno) faz SELECT
ENTÃO NÃO recebe esse log (actor_id != current_seller_id)

QUANDO owner da store ST1 faz SELECT
ENTÃO recebe esse log (storeId matching)

QUANDO owner da store ST2 (outra loja) faz SELECT
ENTÃO NÃO recebe esse log
```

### RF-112 + RF-113: Audit Imutável

```gherkin
DADO um audit log existente
QUANDO qualquer authenticated tenta UPDATE audit_logs SET payload='{}' WHERE id=...
ENTÃO 0 rows affected (policy FOR UPDATE USING (false))

QUANDO tenta DELETE FROM audit_logs WHERE id=...
ENTÃO 0 rows affected (policy FOR DELETE USING (false))

QUANDO service_role faz UPDATE
ENTÃO TAMBÉM 0 rows affected (FORCE RLS aplica até pra service_role em policies que retornam false)
```

### RF-130 + RF-132: Storefront Não Vaza Dados

```gherkin
DADO uma part em crm.parts com unit_cost=50, dintec_id='X', is_active=true
QUANDO anônimo (sem JWT) faz SELECT * FROM storefront.products WHERE id=<id>
ENTÃO recebe colunas id, name, description, price, brand_id, category_id, etc.
  E NÃO recebe unit_cost
  E NÃO recebe dintec_id

QUANDO anônimo tenta SELECT * FROM crm.parts
ENTÃO recebe 401/403 (PostgREST não expõe schema crm para anon)
```

### RF-058 + RF-150: B2B Customer Isolation

```gherkin
DADO customer C1 com b2b_portal habilitado, e suas orders [O1, O2]
  E customer C2 (outra empresa), com order [O3]
QUANDO usuário B2B autenticado como C1 faz SELECT * FROM crm.orders
ENTÃO recebe APENAS [O1, O2]
  E não recebe [O3]
```

### RF-151 + RF-153: CI Bloqueia Regressão

```gherkin
DADO um PR que altera policy de crm.customers permitindo seller ver TODOS os clientes
QUANDO o workflow rls-tests.yml executa
ENTÃO o teste "vendedor não vê customer de outro vendedor" falha
  E o workflow falha
  E o PR fica bloqueado
```

---

## Fases de Implementação

### Fase 1 — Helpers + Core (1 dia)

- Migration `00000000000060_rls_helper_functions.sql`
- Migration `00000000000061_rls_policies_core.sql` (stores, sellers, brands, categories, parts, applications, customers, vehicles)
- Smoke test manual: criar 2 sellers, 2 customers, autenticar como seller A, validar isolamento

### Fase 2 — Relacionais e Comerciais (1.5 dias)

- Migrations `00000000000062_rls_policies_relational.sql` + `00000000000063_rls_policies_commercial.sql`
- Validação manual: quotes/orders só visíveis ao seller responsável

### Fase 3 — Gestão, Config, Audit, LLM (1 dia)

- Migrations `00000000000064` a `00000000000067`
- Validação especial em `audit_logs` (imutabilidade)

### Fase 4 — Storefront + Testes Automatizados (1.5 dias)

- Migration `00000000000068_rls_policies_storefront.sql`
- Criação de `supabase/tests/rls/` com pgTAP ou similar
- Cobertura mínima: 1 teste por tabela do schema crm + todos do storefront
- Workflow `rls-tests.yml`

### Fase 5 — Documentação e Handoff (meio dia)

- Escrever `docs/db/rls-policies.md`
- Demo para Edmilson + Frederico simulando 4 personas (owner, manager, seller, b2b_customer)
- Marcar PRD como `_DONE`

---

## Dependências

### PRDs

- **Bloqueia:** PRD-104 (Providers Reais — depende de RLS funcionar para o frontend operar com segurança), PRD-105 (Realtime — filtros precisam de RLS), todas as Ondas 5+
- **Depende de:**
  - **PRD-101** (Schema — tabelas existem)
  - **PRD-102** (Edge Functions — algumas operações usam service_role para bypass)
  - **PRD-107** parcial — sem `app_metadata` populado, policies bloqueiam tudo (fail closed; aceitável em staging vazio). Cobertura completa só após PRD-107.

### Bibliotecas

- `pgTAP` (extensão Postgres para testes — ou framework `supabase test db` se preferível)
- Nenhuma lib JS adicional

### Decisões Pendentes

- **Framework de testes:** `pgTAP` (mais conhecido) vs `supabase test db` (nativo do CLI, mais simples). Sugestão: `supabase test db` por integração nativa.
- **Granularidade do `seller_external`:** mesmo conjunto de policies do `seller_internal` ou restrições adicionais (sem ver agregados de BI)? **Sugestão MVP:** mesmo conjunto; refinar em PRD-190 (Vendedor Externo Ativado).

---

## Cadeia de PRDs

```
   ┌──────────────┐
   │ PRD-101      │
   │ Schema       │ ← tabelas e FORCE RLS
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ PRD-102      │
   │ Edge Fn      │ ← service_role bypass
   └──────┬───────┘
          │
   ┌──────▼───────┐
   │ PRD-103      │ ← ESTE
   │ RLS          │
   └──────┬───────┘
          │
   ┌──────┼───────────┐
   ▼      ▼           ▼
 PRD-104 PRD-105   PRD-107
 Provider Realtime  Auth (popula app_metadata)
 Real
```

---

## Considerações de Segurança

- **Defense-in-depth:** RLS é a segunda camada (depois de PostgREST schema isolation). Combinado com JWT claims (PRD-107), forma 3 camadas.
- **Fail-closed:** RLS default bloqueia. Esquecer policy = inacessível. Antipattern oposto (permissive default) é desastroso.
- **`service_role` bypass:** Edge Functions privilegiadas (Onda 5+) usam service_role para operações cross-cutting (insert audit log, refresh views). Cuidado: nunca passar `service_role` para frontend.
- **Subquery em policy:** policies usando subquery (ex: `customer_id IN (SELECT ...)`) podem ter performance ruim. Postgres consegue otimizar muitas, mas validar com EXPLAIN ANALYZE em volumes realistas (PRD-108).
- **Auditoria de mudanças de policy:** mudança em policy é mudança de superfície de segurança. PR review obrigatório com 2 reviewers para PRs que tocam em `_rls_policies_*.sql`.
- **JWT claims tampering:** Supabase Auth assina JWT com HS256. Tampering exige conhecimento do secret. PRD-107 + Vault protegem o secret.
- \*\*Anti-pattern: usar RLS como "filtro": o frontend pode filtrar adicional, mas RLS é a fonte da verdade. Frontend que confia em RLS sem filtro adicional ainda funciona (é seguro).

---

## Fluxos de Uso

### Fluxo principal — Vendedor consulta carteira

```
[Vendedor logado] ──▶ Frontend chama supabase.from('customers').select('*')
                  ──▶ JWT com app_metadata.role=seller_internal, seller_id=S1, store_id=ST1
                  ──▶ Postgres recebe query
                  ──▶ Aplica policies em OR
                  ──▶ "seller_internal" se seller_id = current_seller_id() → matches
                  ──▶ Filtra linhas: apenas customers com seller_id=S1
                  ──▶ Retorna 23 linhas (em vez das 500 da loja toda)
```

### Fluxo de negação — Tentativa de violação

```
[Atacante via dev tools] ──▶ Modifica frontend para fazer DELETE em customer de outro vendedor
                         ──▶ Frontend faz supabase.from('customers').delete().eq('id', 'C2')
                         ──▶ JWT continua válido (atacante é seller S1 logítimo, só está tentando agir além)
                         ──▶ Postgres avalia policy DELETE
                         ──▶ Customer C2 tem seller_id=S2, não combina com current_seller_id()=S1
                         ──▶ 0 rows affected
                         ──▶ Frontend recebe { count: 0 }
                         ──▶ Vendedor não consegue deletar — dados protegidos
```

### Fluxo de Edge Function privilegiada

```
[Edge Function audit-write] ──▶ Importa createClient com SUPABASE_SERVICE_ROLE_KEY
                            ──▶ INSERT INTO crm.audit_logs (actor_id, action, ...)
                            ──▶ service_role bypassa RLS de SELECT/INSERT em audit_logs
                            ──▶ Insert sucesso
                            ──▶ Frontend que tentaria insert direto teria que ter auth.users mapeado pra seller
                                (também funciona — INSERT em audit_logs é livre para authenticated)
```

---

## Convenções de Código (Referência Rápida)

| Elemento          | Convenção                                        | Exemplo                                          |
| ----------------- | ------------------------------------------------ | ------------------------------------------------ |
| **Migration RLS** | prefixo numérico 6x                              | `00000000000061_rls_policies_core.sql`           |
| **Policy name**   | `<action>_<who>_<condition>`                     | `select_seller_own_portfolio`, `audit_no_delete` |
| **Função helper** | em schema `crm`, snake_case                      | `crm.current_seller_id`, `crm.has_any_role`      |
| **Marker STABLE** | sempre em helpers de JWT                         | `LANGUAGE sql STABLE`                            |
| **Test file**     | `supabase/tests/rls/<tabela>_isolation_test.sql` | `customers_isolation_test.sql`                   |

---

## Notas para o Agente Desenvolvedor

> **Contexto:** Claude Code CLI implementando. PRD escrito por Arquiteto na web.

### Esclarecimento de Dúvidas

> 💬 Pergunte antes: framework de testes RLS preferido (pgTAP vs `supabase test db`), e se vendedor_external compartilha policies com seller_internal no MVP (sugerido: sim).

### Instruções Obrigatórias

> ⚠️ **1. ANTES DE IMPLEMENTAR:** Releia PRD-006 Fase 1 completo. Toda divergência entre policy SQL e `matrix.ts` deve ser sinalizada. PRD-103 prevalece (mais granular), mas vale validar.

> ⚠️ **2. APÓS IMPLEMENTAR:**
>
> - Bump app para v2.0.0-rc.3
> - CHANGELOG: lista cada policy criada por tabela
> - Renomear para `PRD-103-rls_DONE.md`
> - Documentação `docs/db/rls-policies.md` completa
> - Testes RLS passando em CI

### Princípios de Implementação

| Princípio                     | Descrição                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------- |
| **Múltiplas policies OR**     | Em vez de mega-policy com CASE, escrever uma policy por intent (OR semantics)                      |
| **Helpers STABLE**            | Permitem cache do planner; performance comparável a queries sem RLS                                |
| **Test boundary cases**       | Mudança de seller_id, transferência de carteira, etc. — bug-prone                                  |
| **service_role bypass**       | Edge Functions privilegiadas usam; valide caso a caso                                              |
| **FORCE RLS sempre**          | Garante que mesmo `service_role` respeite policies que retornam `false` (como audit imutabilidade) |
| **MCP Supabase get_advisors** | Após aplicar policies, rodar advisors para detectar issues (políticas faltando, etc.)              |

### Orientações Específicas

| Aspecto                       | Orientação                                                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Performance**               | Policies com subquery podem ser lentas; EXPLAIN ANALYZE em volume realista                                                                |
| **Debugging policy**          | `SET ROLE authenticated; SET request.jwt.claims = '...'; SELECT ...` simula usuário                                                       |
| **Policy não aplica**         | Verificar `FORCE ROW LEVEL SECURITY` ativo; sem isso, owner do banco bypassa                                                              |
| **Custom claims path**        | `auth.jwt() -> 'app_metadata' ->> 'seller_id'` (não `user_metadata` — esse é editável pelo usuário)                                       |
| **NULL em current_seller_id** | Anônimo retorna NULL; comparação `seller_id = NULL` retorna NULL (não TRUE) — fail closed natural                                         |
| **Cross-schema FK**           | `storefront.product_reviews → crm.parts` funciona com RLS; policy de reviews usa `part_id IN (SELECT id FROM storefront.products)` (view) |

### O que NÃO Fazer

| ❌ Evitar                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- |
| `USING (true)` sem qualificação — abre tabela inteira (use só em casos justificados como `feature_flags` SELECT) |
| Lógica de negócio em policy (CASE complexo) — refatorar para função                                              |
| Subquery em policy sem index (lentidão garantida)                                                                |
| Esquecer `WITH CHECK` em INSERT/UPDATE — só USING não basta                                                      |
| `service_role` no frontend                                                                                       |
| Pular testes em alguma tabela "porque é simples"                                                                 |
| Misturar policies de schemas diferentes na mesma migration (separar por arquivo)                                 |
| Editar policy via Dashboard Supabase (sempre via migration versionada)                                           |
| Confiar apenas em RLS sem JWT validado (Edge Function deve `withAuth`)                                           |
| Hardcode de role names em policies — usar `has_role`/`has_any_role`                                              |

---

## Status de Implementação

| Campo                     | Valor       |
| ------------------------- | ----------- |
| **Status**                | ⏳ PENDENTE |
| **Data de Implementação** | -           |
| **Versão do App**         | -           |
| **Implementado por**      | -           |
| **Observações**           | -           |

---

## Histórico

| Data       | Versão | Alteração                                        |
| ---------- | ------ | ------------------------------------------------ |
| 27/05/2026 | v1     | Criação inicial — Sub-lote 1b do Lote 1 (Onda 4) |

---

**AILA - Sistemas Inteligentes**
