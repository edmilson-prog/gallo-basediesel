---
objeto: conversations
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: conversations
rls_enabled: true
colunas: 15
edge_functions: [whatsapp-webhook, whatsapp-send, whatsapp-import-history]
prds_relacionados: [PRD-022, PRD-111, PRD-112, PRD-113, PRD-114, PRD-115, PRD-118, PRD-119, PRD-120, PRD-213]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `conversations`

> Conversa de atendimento (WhatsApp), por loja/cliente/número. `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/conversation.ts → IConversation + CLAUDE.md + migrations)`

Núcleo do módulo de atendimento — representa um **thread de mensagens** entre a loja e um
cliente ou lead, qualquer que seja o canal (`whatsapp`, `ecommerce`, `phone`, `site`).

Pontos-chave de domínio:

- **Invariante de participante:** exatamente um dos dois campos `customer_id` / `lead_id` deve
  ser preenchido — a regra é documentada no tipo `IConversation` e reforçada na camada de
  serviço; o banco não impõe FK em `lead_id` (ver Dicionário). `🔍 (conversation.ts JSDoc)`
- **Multi-instância (v0.97.0 Switchboard):** `whatsapp_account_id` liga a conversa a uma conta
  WhatsApp específica (número/instância). O pool de conversas não atribuídas é **scoped por
  instância**: um seller só vê o pool das instâncias às quais tem acesso via
  `whatsapp_account_access_rules`. `🔍 (CLAUDE.md + migrations 20260615130300/400)`
- **Distribuição na criação (client-side):** quando uma conversa é criada via
  `conversations.create()` (fluxo inbound pelo provider), o engine puro `distributeConversation`
  (PRD-013) seleciona o atendente por carteira/especialidade e, em seguida, a fila de rodízio
  `applyRotationOverride` (PRD-213) substitui o resultado quando a fila está governando o
  revezamento. O resultado é persistido em `assigned_seller_id`. `🔍 (conversations.ts supabase)`
- **Webhook real NÃO usa a fila:** o Edge Function `whatsapp-webhook` atribui diretamente
  `customer.sellerId` (carteira) à conversa nova, sem passar pelo rodízio. A fila de rodízio
  server-side é explicitamente **DEFERIDA** (espelha o PRD-212 server-side). `🔍 (CLAUDE.md +
  src/providers/whatsapp/webhook/core.ts)`
- **Status flow:** 5 estados — `aguardando` → `em_andamento` → `aguardando_cliente` →
  `resolvida` → `arquivada`; automação de reabertura (`autoReopenResolvedOnInbound`) gateada
  em settings (jsonb, sem migration própria). `🔍 (conversation.ts ConversationStatus)`
- **Outbound:** `createOutbound` cria conversa atribuída diretamente ao seller que iniciou
  (sem distribuição/rodízio); `conversations_insert` RLS permite se `assigned_seller_id = current_seller_id()`.

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `store_id` | uuid | não | — | FK → `stores.id` |
| 3 | `customer_id` | uuid | sim | — | FK → `customers.id` |
| 4 | `lead_id` | text | sim | — | — |
| 5 | `assigned_seller_id` | uuid | sim | — | FK → `sellers.id` |
| 6 | `channel` | text | não | — | — |
| 7 | `whatsapp_account_id` | uuid | sim | — | FK → `whatsapp_accounts.id` |
| 8 | `status` | text | não | — | — |
| 9 | `is_sdr_active` | boolean | não | `false` | — |
| 10 | `tags` | text[] | não | `'{}'::text[]` | — |
| 11 | `linked_order_id` | text | sim | — | — |
| 12 | `last_message_at` | timestamptz | não | — | — |
| 13 | `unread_count` | integer | não | `0` | — |
| 14 | `created_at` | timestamptz | não | `now()` | — |
| 15 | `updated_at` | timestamptz | não | `now()` | — |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/conversation.ts → IConversation)`

| coluna | significado |
|--------|-------------|
| `customer_id` / `lead_id` | Participante da conversa — mutuamente exclusivos. Exatamente um deve estar preenchido (invariante de aplicação, não de banco). |
| `lead_id` | **Tipo `text` sem FK** — `leads.id` é uuid mas a coluna aqui é `text` (decisão original); a RPC `search_conversations` faz o cast `l.id::text = c.lead_id` para o join. Sem índice de FK referencial. |
| `channel` | Canal de origem: `whatsapp` \| `ecommerce` \| `phone` \| `site`. No MVP quase toda conversa real é `whatsapp`. |
| `whatsapp_account_id` | Instância WhatsApp (número) à qual a conversa está vinculada. `NULL` em conversas de outros canais ou pré-multi-instância. Governa o pool de não-atribuídos por instância. |
| `assigned_seller_id` | Atendente responsável. `NULL` = conversa no pool (não reivindicada). |
| `status` | Estado do fluxo de atendimento: `aguardando` → `em_andamento` → `aguardando_cliente` → `resolvida` → `arquivada`. |
| `is_sdr_active` | Agente SDR está dirigindo a conversa ativamente. `false` = atendimento humano (ou SDR pausado). |
| `tags` | Rótulos livres para filtragem na Inbox. O GIN index (`conversations_tags_gin_idx`) suporta busca por sobreposição (`overlaps`). |
| `linked_order_id` | Pedido vinculado (PRD-067 RF-006) — preenchido quando a conversa é criada automaticamente a partir de um pedido e-commerce. Tipo `text` (sem FK formal). |
| `last_message_at` | Timestamp da última mensagem; usado como cursor de ordenação padrão na Inbox e como filtro de período. |
| `unread_count` | Contador de mensagens não lidas pelo atendente. Zerado por `markRead`. Incrementado na criação (`1` para a primeira mensagem inbound). |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `assigned_seller_id` → `sellers.id`
- `customer_id` → `customers.id`
- `store_id` → `stores.id`
- `whatsapp_account_id` → `whatsapp_accounts.id`

**Entrando (referenciam esta tabela):**

- `conversation_notes.conversation_id` → `conversations.id`
- `conversation_participants.conversation_id` → `conversations.id`
- `distribution_traces.conversation_id` → `conversations.id`
- `media_assets.conversation_id` → `conversations.id`
- `messages.conversation_id` → `conversations.id`
- `orders.conversation_id` → `conversations.id`
- `quotes.conversation_id` → `conversations.id`
- `scheduled_sends.conversation_id` → `conversations.id`
- `sdr_escalations.conversation_id` → `conversations.id`
- `sdr_sessions.conversation_id` → `conversations.id`
- `trackable_links.conversation_id` → `conversations.id`

## RLS — Row Level Security `[regra: mecânico]`

### `conversations_delete` — DELETE · roles: `{authenticated}`
- **USING:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `conversations_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id))))`

### `conversations_select` — SELECT · roles: `{authenticated}`
- **USING:** `( SELECT can_access_conversation(conversations.id) AS can_access_conversation)`

### `conversations_update` — UPDATE · roles: `{authenticated}`
- **USING:** `( SELECT can_access_conversation(conversations.id) AS can_access_conversation)`
- **WITH CHECK:** `((store_id = ( SELECT current_store_id() AS current_store_id)) AND (( SELECT is_staff() AS is_staff) OR (assigned_seller_id = ( SELECT current_seller_id() AS current_seller_id)) OR (assigned_seller_id IS NULL)))`

**Justificativa do desenho:** `🔍 inferido (fonte: migrations 20260615130300/400 + 20260614190000 + CLAUDE.md)`

- **`can_access_conversation(conv uuid)`** é o **ponto único de decisão** para SELECT e UPDATE
  (USING). SECURITY DEFINER, STABLE — bypasssA RLS das tabelas-base para evitar recursão e ser
  cacheável no plano. Garante acesso se o seller satisfaz qualquer um dos quatro critérios:
  1. `is_staff()` — owner/gestor veem tudo na loja;
  2. `assigned_seller_id = current_seller_id()` — atendente responsável;
  3. `is_conversation_participant(conv)` — co-responsável registrado em `conversation_participants`;
  4. Pool scoped por instância: `assigned_seller_id IS NULL` e `whatsapp_account_id` está entre as
     instâncias acessíveis ao seller via `whatsapp_account_access_rules`.
- **Pool de não-atribuídos:** qualquer seller pode reivindicar uma conversa do pool se a instância
  pertence ao seu acesso (UPDATE WITH CHECK permite `assigned_seller_id = current_seller_id()` ou
  IS NULL → auto-reivindicação).
- **Transferência via RPC SECURITY DEFINER (`transfer_conversation`):** um seller não-staff não
  pode fazer UPDATE que tire a linha do seu próprio escopo SELECT (PostgreSQL rejeita mesmo com
  WITH CHECK frouxo). A RPC contorna isso: valida caller (staff, ou dono/não-atribuída) + target
  (seller ativo na mesma loja) e executa com privilégios elevados. `assignSeller` do provider
  Supabase sempre roteia por esta RPC. `🔍 (migration 20260614190000 + conversations.ts)`
- **INSERT/DELETE:** mantêm o padrão mais simples — store-scoped + (staff ou próprio seller).
  Não usam `can_access_conversation` (o insert ainda não tem id definitivo; o delete é ato de
  gestão).
- **messages:** toda política de `messages` delega a `can_access_conversation(conversation_id)`,
  fechando o vazamento cross-seller que existia antes da migration 20260615130400 (era apenas
  store-scoped).

## Índices `[mecânico]`

- `conversations_assigned_seller_id_idx` — `CREATE INDEX conversations_assigned_seller_id_idx ON public.conversations USING btree (assigned_seller_id)`
- `conversations_channel_idx` — `CREATE INDEX conversations_channel_idx ON public.conversations USING btree (channel)`
- `conversations_customer_id_idx` — `CREATE INDEX conversations_customer_id_idx ON public.conversations USING btree (customer_id)`
- `conversations_last_message_at_idx` — `CREATE INDEX conversations_last_message_at_idx ON public.conversations USING btree (last_message_at DESC)`
- `conversations_lead_id_idx` — `CREATE INDEX conversations_lead_id_idx ON public.conversations USING btree (lead_id)`
- `conversations_pkey` — `CREATE UNIQUE INDEX conversations_pkey ON public.conversations USING btree (id)`
- `conversations_status_idx` — `CREATE INDEX conversations_status_idx ON public.conversations USING btree (status)`
- `conversations_store_id_idx` — `CREATE INDEX conversations_store_id_idx ON public.conversations USING btree (store_id)`
- `conversations_tags_gin_idx` — `CREATE INDEX conversations_tags_gin_idx ON public.conversations USING gin (tags)`
- `idx_conversations_customer_assigned` — `CREATE INDEX idx_conversations_customer_assigned ON public.conversations USING btree (customer_id, assigned_seller_id)`
- `idx_conversations_lead_assigned` — `CREATE INDEX idx_conversations_lead_assigned ON public.conversations USING btree (lead_id, assigned_seller_id)`
- `idx_conversations_whatsapp_account_id` — `CREATE INDEX idx_conversations_whatsapp_account_id ON public.conversations USING btree (whatsapp_account_id)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**Narrativa** `🔍 inferido (fonte: conversations.ts supabase + webhook/core.ts + CLAUDE.md + migrations)`:

**Atribuição na criação (fluxo inbound client-side):**
1. `distributeConversation` (PRD-013, engine puro) avalia carteira, especialidade, carga e
   round-robin para selecionar um candidato.
2. `applyRotationOverride` (PRD-213) substitui a decisão se a fila de rodízio da loja está
   governando o revezamento — `criterionMatched` fica `'round_robin'` em ambos os casos.
3. O `effective.selectedSellerId` é gravado em `assigned_seller_id`. Se nenhum seller é
   selecionado, a conversa entra no pool (`assigned_seller_id IS NULL`, `status='aguardando'`).
4. Uma única `distribution_traces` row é gravada por conversa (um trace/conversa).
5. Os ponteiros do rodízio são avançados apenas se a fila governou; caso contrário o
   `lastAssignedSellerId` da settings é atualizado (legado round-robin PRD-013).

**Fluxo do webhook (`whatsapp-webhook`, Edge Function):**
- O webhook **não passa pelo rodízio**: atribui `customer.sellerId` (carteira do cliente)
  diretamente. A fila de rodízio server-side está explicitamente DEFERIDA.

**Invariante de participante:**
- Exatamente um de `customer_id` / `lead_id` preenchido — reforçado no provider (lança exceção
  se ambos ausentes); o banco não tem constraint. `🔍 (conversations.ts create)`

**Transferência:**
- Toda reatribuição a outro seller passa pela RPC `transfer_conversation` (SECURITY DEFINER).
  O UPDATE direto de `assigned_seller_id` a outro seller é rejeitado pela RLS.
  `transfer_conversation` também força `is_sdr_active = false`. `🔍 (migration 20260614190000)`

**Arquivamento:**
- `archive()` é um UPDATE de `status → 'arquivada'`, não uma deleção física.

**Atomicidade:**
- A sequência `create` (conversa → messages → distribution_trace → advance cursor) **não é
  transacional** (PostgREST não suporta tx multi-statement client-side). Falhas intermediárias
  podem deixar o banco em estado parcial. Atomicidade via Edge Function foi identificada como
  melhoria futura. `🔍 (conversations.ts header comment)`

## Perguntas pendentes

- ❓ `lead_id` é `text` sem FK referenciando `leads.id` (uuid) — foi intencional para evitar
  conflito de tipos no schema inicial, mas nunca foi migrado para `uuid` com FK formal. Há risco
  de registros órfãos se um lead for excluído (sem cascade). Confirmar se permanece como está.
- ❓ Aproximadamente 28 conversas em produção sem `customer_id` (antes da Onda 5 / WhatsApp
  multi-instância), mencionadas na memória do projeto. Essas conversas têm `lead_id` preenchido,
  ou são genuinamente sem participante? Confirmar e avaliar backfill.
- ❓ Não há CHECK constraint para `channel` nem para `status` — valores inválidos seriam aceitos.
  O controle é inteiramente por aplicação. Foi uma decisão deliberada (flexibilidade) ou lacuna?
- ❓ INSERT/DELETE RLS usam `is_staff() OR assigned_seller_id = current_seller_id()` — o
  `createOutbound` funciona porque o seller insere com `assigned_seller_id = próprio id`. Se um
  seller criar uma conversa sem `assigned_seller_id` (pool), a INSERT RLS bloquearia (`is_staff()`
  seria necessário). Confirmar se esse cenário é intencional ou se a INSERT RLS deveria permitir
  inserir com `assigned_seller_id IS NULL` para não-staff.

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
