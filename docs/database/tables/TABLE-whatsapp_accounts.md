---
objeto: whatsapp_accounts
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: conversations
rls_enabled: true
colunas: 16
edge_functions: [whatsapp-connect, whatsapp-send, whatsapp-webhook]
prds_relacionados: [PRD-111, PRD-112, PRD-113, PRD-114, PRD-115, PRD-119, PRD-120]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `whatsapp_accounts`

> Conta/número WhatsApp conectado (com failover). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/conversation.ts → IWhatsAppAccount; src/providers/whatsapp/factory.ts; CLAUDE.md PRD-111/119/120)`

Cada linha representa um **número WhatsApp configurado por loja** — pode ser uma conta Meta Cloud API
ou uma instância Evolution. A plataforma suporta **múltiplas contas por loja** (multi-instância,
v0.97.0 `Switchboard`): diferentes números podem ter finalidades distintas (`purpose`), e cada
conversa fica vinculada à conta de origem (`conversations.whatsapp_account_id`).

Pontos-chave de domínio:

- **Segredos fora do banco:** `credentials_ref` é um prefixo opaco que aponta para secrets de Edge
  Function nomeados por convenção (ex.: `{credentials_ref}_API_KEY`). O secret em si **jamais**
  transita por esta tabela. A Edge Function `whatsapp-connect` resolve a chave Vault-first via
  `createSecretResolver`. `🔍 (factory.ts, whatsapp-connect/index.ts)`
- **Engines server-side:** os engines reais Meta (`MetaCloudProvider`) e Evolution
  (`EvolutionProvider`) rodam exclusivamente em Edge Functions (`whatsapp-send`,
  `whatsapp-webhook`). No app (browser), o factory retorna mock ou a matriz de capacidades
  estática (`getEngineCapabilities`) — nunca instancia um engine real. `🔍 (factory.ts RF-013)`
- **Failover Meta ↔ Evolution (PRD-120):** `failover_account_id` aponta para uma conta reserva.
  O `whatsapp_health_tick` (pg_cron `*/5`) avalia o error rate da janela de 15 min em
  `integration_logs`, transita `current_state` e auto-ativa/restaura o failover. A lógica
  mirror do tick vive em `src/providers/whatsapp/failover.ts` (engine puro testado). Templates
  HSM em failover exigem que a reserva seja Meta — caso contrário o send retorna
  `FAILOVER_INCOMPATIBLE` (422). `🔍 (failover.ts; migration 20260610152000/153000)`
- **Trigger de conexão:** qualquer flip de `status` (connected ↔ disconnected), vindo de qualquer
  caminho (`whatsapp-connect`, webhook, logout), dispara `notify_whatsapp_connection_change()`
  via trigger `AFTER UPDATE OF status`, que insere notificação in-app para o gestor da loja.
  `🔍 (migration 20260611185107)`
- **Índices únicos por provedor:** `instanceName` (Evolution) e `phoneNumberId` (Meta) têm índices
  UNIQUE parciais em `provider_config ->> 'field'`, garantindo que dois números distintos não
  compartilhem a mesma instância/ID de provedor dentro do projeto. `🔍 (índices da tabela)`

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `label` | text | não | — | — |
| 4 | `phone_number` | text | não | — | — |
| 5 | `provider` | text | não | — | — |
| 6 | `credentials_ref` | text | não | — | — |
| 7 | `status` | text | não | — | — |
| 8 | `capabilities` | jsonb | não | `'{}'::jsonb` | — |
| 9 | `created_at` | timestamptz | não | `now()` | — |
| 10 | `provider_config` | jsonb | sim | — | Non-secret engine config (PRD-111). meta: phoneNumberId/businessAccountId; evolution: baseUrl/instanceName. Secrets live in Edge Function secrets, named by credentials_ref. |
| 11 | `failover_account_id` | uuid | sim | — | FK → `whatsapp_accounts.id` ‹on delete set null› · Backup account for NEW outbound while primary is down/paused (PRD-120). History never migrates. |
| 12 | `failover_policy` | text | não | `'disabled'::text` | — |
| 13 | `current_state` | text | não | `'healthy'::text` | Health state maintained by whatsapp_health_tick + manual owner action (PRD-120). |
| 14 | `state_changed_at` | timestamptz | sim | — | — |
| 15 | `is_failover_active` | boolean | não | `false` | — |
| 16 | `purpose` | text | não | `'atendimento'::text` | Multi-instância: onde a instância aparece — atendimento (caixa), campanha (disparo) ou ambos. |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/conversation.ts → IWhatsAppAccount; COMMENTs do banco; CLAUDE.md PRD-111/119/120)`

| coluna | significado |
|--------|-------------|
| `label` | Nome amigável da conta, exibido nas telas de configuração e como origem da conversa no Inbox. Editável por staff via tela Configurações → WhatsApp (PRD-119). |
| `phone_number` | Número E.164 do número conectado. Para Evolution, gravado/atualizado pelo `whatsapp-connect` ao detectar sessão `open` via `fetchInstanceProfile`. |
| `provider` | Engine de envio: `meta` (Meta Cloud API v20.0) ou `evolution` (Evolution API). Determina quais campos de `provider_config` são válidos e qual engine de Edge Function é usado. |
| `credentials_ref` | Prefixo opaco para os secrets de Edge Function (ex.: `WA_EVO_CAMPANHAS` → secret `WA_EVO_CAMPANHAS_API_KEY`). **Jamais** contém o segredo — é só o nome-chave do cofre. |
| `status` | Estado de conexão em tempo real: `connected`, `disconnected` ou `pending`. Atualizado pelo `whatsapp-connect` (ação `test`/`qr`/`state`/`logout`) e pelo webhook (`connection.update`). |
| `capabilities` | Matriz de capacidades do provedor (`IWhatsAppCapabilities`): `supportsTemplatesHsm`, `supportsInteractiveButtons`, `supportsLists`, `supportsReactions`, `supportsProactiveMessaging`, `supportsReadStatusInGroups`. |
| `provider_config` | Config não-secreta do engine — COMMENT no banco: *"Non-secret engine config (PRD-111). meta: phoneNumberId/businessAccountId; evolution: baseUrl/instanceName. Secrets live in Edge Function secrets, named by credentials_ref."* Índices únicos parciais garantem unicidade de `instanceName` (Evolution) e `phoneNumberId` (Meta). |
| `current_state` | Estado de saúde — COMMENT no banco: *"Health state maintained by whatsapp_health_tick + manual owner action (PRD-120)."* Valores: `healthy`, `degraded`, `down`, `paused`. `paused` é sticky (sai só por ação manual do Owner). |
| `state_changed_at` | Momento da última transição de `current_state`. Usado pelo tick para calcular o intervalo de 30 min antes do auto-restore (RF-031). |
| `failover_policy` | Política de failover — COMMENT no banco (via CHECK): `disabled` (sem reserva), `manual` (Owner ativa/desativa), `automatic` (tick ativa em `down`/`paused`, restaura em `healthy` por 30 min). |
| `failover_account_id` | Conta reserva para novos envios outbound enquanto a primária está com failover ativo — COMMENT no banco: *"Backup account for NEW outbound while primary is down/paused (PRD-120). History never migrates."* AUTO-REFERÊNCIA: FK para a própria tabela, com `ON DELETE SET NULL`. CHECK impede apontar para si mesmo. |
| `is_failover_active` | `true` enquanto novos envios estão sendo roteados pela conta reserva. Gerenciado pelo tick (auto) ou por ação manual do Owner auditada. |
| `purpose` | Finalidade da instância multi-instância — COMMENT no banco: *"Multi-instância: onde a instância aparece — atendimento (caixa), campanha (disparo) ou ambos."* Controla em quais contextos da UI a conta aparece como opção. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `failover_account_id` → `whatsapp_accounts.id` — on delete `SET NULL`
- `store_id` → `stores.id`

**Entrando (referenciam esta tabela):**

- `conversations.whatsapp_account_id` → `whatsapp_accounts.id`
- `message_templates.whatsapp_account_id` → `whatsapp_accounts.id`
- `whatsapp_account_access_rules.whatsapp_account_id` → `whatsapp_accounts.id`
- `whatsapp_accounts.failover_account_id` → `whatsapp_accounts.id`

## RLS — Row Level Security `[regra: mecânico]`

### `whatsapp_accounts_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `whatsapp_accounts_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

### `whatsapp_accounts_select` — SELECT · roles: `{authenticated}`
- **USING:** `(store_id = ( SELECT current_store_id() AS current_store_id))`

### `whatsapp_accounts_update` — UPDATE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND ( SELECT is_staff() AS is_staff))`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies + CLAUDE.md + whatsapp-connect/index.ts)`
- **Isolamento por loja:** todo acesso exige `store_id = current_store_id()` — nenhum usuário
  enxerga contas de outra loja. O Owner tem acesso cross-store via lógica de papel (não por
  exceção na RLS), validado no `whatsapp-connect` (`caller.role !== 'owner'`).
- **Escrita restrita a staff** (`is_staff()`): criar, editar e excluir contas é ato de gestão.
  `provider_config` (baseUrl, instanceName, phoneNumberId etc.) só é editável por staff via
  tela Configurações → WhatsApp (PRD-119).
- **Leitura para todos os autenticados da loja:** vendedores não-staff conseguem ler as contas
  para filtrar Inbox por instância, ver o número de origem da conversa etc.
- **Edge Functions usam `admin` (service_role):** as Edges `whatsapp-connect`, `whatsapp-send` e
  `whatsapp-webhook` operam com a chave de serviço e contornam a RLS intencionalmente — as
  operações de status/estado não passam pelo JWT do atendente.

## Índices `[mecânico]`

- `idx_whatsapp_accounts_failover_account` — `CREATE INDEX idx_whatsapp_accounts_failover_account ON public.whatsapp_accounts USING btree (failover_account_id) WHERE (failover_account_id IS NOT NULL)`
- `whatsapp_accounts_evolution_instance_uq` — `CREATE UNIQUE INDEX whatsapp_accounts_evolution_instance_uq ON public.whatsapp_accounts USING btree (((provider_config ->> 'instanceName'::text))) WHERE ((provider = 'evolution'::text) AND (provider_config ? 'instanceName'::text))`
- `whatsapp_accounts_meta_phone_number_id_uq` — `CREATE UNIQUE INDEX whatsapp_accounts_meta_phone_number_id_uq ON public.whatsapp_accounts USING btree (((provider_config ->> 'phoneNumberId'::text))) WHERE ((provider = 'meta'::text) AND (provider_config ? 'phoneNumberId'::text))`
- `whatsapp_accounts_pkey` — `CREATE UNIQUE INDEX whatsapp_accounts_pkey ON public.whatsapp_accounts USING btree (id)`
- `whatsapp_accounts_store_id_idx` — `CREATE INDEX whatsapp_accounts_store_id_idx ON public.whatsapp_accounts USING btree (store_id)`

## Triggers `[mecânico]`

- `whatsapp_accounts_notify_connection` — AFTER UPDATE OF `status` → `notify_whatsapp_connection_change()`

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `whatsapp_accounts_current_state_check`: `(current_state = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text, 'paused'::text]))`
- `whatsapp_accounts_failover_not_self`: `((failover_account_id IS NULL) OR (failover_account_id <> id))`
- `whatsapp_accounts_failover_policy_check`: `(failover_policy = ANY (ARRAY['disabled'::text, 'manual'::text, 'automatic'::text]))`
- `whatsapp_accounts_failover_policy_requires_target`: `((failover_policy = 'disabled'::text) OR (failover_account_id IS NOT NULL))`
- `whatsapp_accounts_provider_config_shape`: `((provider_config IS NULL) OR ((provider = 'meta'::text) AND (provider_config ? 'phoneNumberId'::text) AND (provider_config ? 'businessAccountId'::text)) OR ((provider = 'evolution'::text) AND (provider_config ? 'baseUrl'::text) AND (provider_config ? 'instanceName'::text)))`
- `whatsapp_accounts_purpose_check`: `(purpose = ANY (ARRAY['atendimento'::text, 'campanha'::text, 'ambos'::text]))`

**Narrativa** `🔍 inferido (conversation.ts; failover.ts; migration 20260610152000/153000; migration 20260611185107; whatsapp-connect/index.ts; CLAUDE.md)`:

- **Segredos por referência:** `credentials_ref` é o prefixo do secret no cofre da Edge Function.
  A Edge `whatsapp-connect` concatena o sufixo (`_API_KEY`) e resolve Vault-first via
  `createSecretResolver`. O browser nunca vê nem trafega o segredo real.
- **Ciclo de vida da conexão (Evolution):** via `whatsapp-connect`, o staff solicita ação
  (`test`/`qr`/`state`/`logout`/`restart`/`test-message`). O fluxo de pareamento (`qr`) cria
  a instância no servidor Evolution (idempotente), configura o webhook para
  `/functions/v1/whatsapp-webhook/evolution` e devolve o QR Base64. Ao detectar sessão
  `open`, o `markConnected` atualiza `status='connected'` e captura `phone_number` /
  `profileName` em `provider_config` via `fetchInstanceProfile`.
- **Trigger de notificação de conexão:** `notify_whatsapp_connection_change()` (SECURITY DEFINER,
  `AFTER UPDATE OF status`) detecta transições meaningful (`connected ↔ disconnected`) e insere
  notificação in-app para o `manager_id` da loja. Notificações de `pending` não disparam
  (ruído de setup filtrado). `🔍 (migration 20260611185107)`
- **Health tick e failover (PRD-120):** `whatsapp_health_tick()` roda via `pg_cron` a cada 5
  minutos. Avalia o error rate dos últimos 15 min em `integration_logs` por provedor
  (`integration_name = 'whatsapp_' || provider`). Thresholds: ≥ 70% → `down`; ≥ 10% →
  `degraded`; < 10% e ≥ 5 chamadas → `healthy`. `paused` é sticky (só Owner desfaz).
  Auto-ativa failover quando `policy='automatic'` e `state in ('down','paused')`; auto-restaura
  após 30 minutos contínuos em `healthy`. A lógica é espelhada no engine puro TypeScript
  `src/providers/whatsapp/failover.ts` (drift consciente, como as regras de notificações
  derivadas). O healthCheck ativo (ping ao provedor) está **DEFERIDO** (pg_net não habilitado).
- **Failover incompatível:** templates HSM (`kind='template'`) não podem ser enviados por uma
  conta reserva Evolution — o engine `send/core.ts` lança `FAILOVER_INCOMPATIBLE` (422) para
  evitar que o envio saia sem template. `🔍 (failover.ts resolveEffectiveAccount)`
- **Unicidade de instância:** os índices únicos parciais impedem dois registros com o mesmo
  `instanceName` (Evolution) ou `phoneNumberId` (Meta) dentro do mesmo projeto Supabase,
  mesmo que em lojas diferentes. Isso garante que o webhook roteie cada mensagem para a conta
  correta via match exato. `🔍 (CLAUDE.md — v0.97.0 Switchboard)`

## Perguntas pendentes

- ❓ `capabilities` é preenchido na criação e nunca recalculado automaticamente. Confirmar se o
  campo é estático (fixo por engine na criação) ou se existe plano de re-sync com o provedor.
- ❓ O `status` de uma conta Meta é atualizado por algum webhook de status de conta, ou só por
  polling manual (`whatsapp-connect action=test`)? O webhook Evolution cobre `connection.update`
  mas não está claro o equivalente Meta.
- ❓ `profileName` gravado em `provider_config` (campo extra além dos dois obrigatórios do CHECK
  `whatsapp_accounts_provider_config_shape`) não é validado pela constraint — confirmar se isso
  é intencional ou se a constraint deve ser relaxada formalmente.

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
