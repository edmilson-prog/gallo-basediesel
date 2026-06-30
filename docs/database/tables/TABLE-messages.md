---
objeto: messages
tipo: tabela
schema: public
status: existente
tier: nucleo
dominio: conversations
rls_enabled: true
colunas: 19
edge_functions: [whatsapp-send, whatsapp-webhook, whatsapp-media-backfill]
prds_relacionados: [PRD-022, PRD-114, PRD-115, PRD-118, PRD-119]
atualizado_em: 2026-06-17
fonte_contexto: inferido
---

# `messages`

> Mensagem individual de uma conversa (in/outbound). `🔍 inferido (nome + CLAUDE.md/PRD)`

**Status:** existente · **Tier:** nucleo · **Domínio:** conversations · **RLS:** habilitada

## Descrição da entidade

`🔍 inferido (fonte: src/shared/types/conversation.ts → IMessage + supabase/messages.ts + CLAUDE.md PRDs 115/118)`

Cada linha representa um único utterance dentro de uma `IConversation` — pode ser uma mensagem
de texto pura, um item de mídia (imagem/áudio/vídeo/documento/sticker) ou uma mensagem
sistema/SDR.

Pontos-chave de domínio:

- **Direção:** `direction = 'in'` (inbound, vinda do cliente via WhatsApp) ou `'out'` (outbound,
  enviada pelo vendedor/sistema). O índice parcial `idx_messages_outbound_sent_at` otimiza as
  consultas de analytics que filtram somente outbound.
- **Gravação por Edge Function:** no modo `supabase` toda mensagem inbound é gravada pela Edge
  `whatsapp-webhook` (service_role), não pelo app; mensagens outbound são gravadas pela Edge
  `whatsapp-send` (persist-before-send — a linha existe com `status='queued'` antes do dispatch
  chegar ao provedor, garantindo que uma falha do provedor não produza um "envio fantasma").
- **Id compartilhado otimista / Realtime:** o app gera um `id = crypto.randomUUID()` no cliente e
  passa-o à Edge `whatsapp-send` como `messageId`; a Edge insere a linha com esse UUID. Assim o
  bubble otimista e o INSERT via Realtime compartilham o mesmo id, evitando duplicata de bolha
  durante a janela de envio. `🔍 (CLAUDE.md PRD-118 + send/core.ts ISendRequest.messageId)`
- **Mídia:** `media_type` + `media_url` carregam o tipo e a referência; a URL pode ser um path
  no bucket `whatsapp-media` (inbound, gravado pelo webhook após download) ou uma URL pública
  (outbound, assinada antes de ser passada ao provedor). A Edge `whatsapp-media-backfill` faz
  re-fetch de mídias inbound que o import de histórico deixou sem bytes
  (`media_download_status = 'failed'`).
- **Status de entrega:** lifecycle monotônico por anti-regressão via `statusAdvances()` — veja
  "Regras de negócio" abaixo.
- **`provider_message_id` é UNIQUE:** permite que o webhook localize a linha outbound pelo wamid
  Meta / key.id Evolution e aplique o ack de status sem ambiguidade (índice
  `messages_provider_message_id_key`).

## Colunas `[mecânico]`

| # | coluna | tipo | nulo | default | observação |
|--:|--------|------|:----:|---------|------------|
| 1 | `id` | uuid | não | `gen_random_uuid()` | **PK** |
| 2 | `conversation_id` | uuid | não | — | FK → `conversations.id` |
| 3 | `direction` | text | não | — | — |
| 4 | `author_type` | text | não | — | — |
| 5 | `author_id` | text | sim | — | — |
| 6 | `provider` | text | não | — | — |
| 7 | `text` | text | não | `''::text` | — |
| 8 | `media_type` | text | sim | — | — |
| 9 | `media_url` | text | sim | — | — |
| 10 | `status` | text | não | — | — |
| 11 | `sent_at` | timestamptz | não | — | — |
| 12 | `delivered_at` | timestamptz | sim | — | — |
| 13 | `read_at` | timestamptz | sim | — | — |
| 14 | `created_at` | timestamptz | não | `now()` | — |
| 15 | `provider_message_id` | text | sim | — | Canonical provider message id (Meta wamid / Evolution key.id) — PRD-114. |
| 16 | `webhook_event_ids` | text[] | não | `'{}'::text[]` | — |
| 17 | `media_download_status` | text | sim | — | Inbound media fetch outcome (PRD-114): ok = stored in whatsapp-media bucket; failed = URL expired/timeout, manual retry. |
| 18 | `failure_reason` | text | sim | — | — |
| 19 | `failure_code` | text | sim | — | PRD-118: provider error code of a failed dispatch/status (e.g. '131026'). |

## Dicionário de colunas-chave

Significado das colunas não óbvias. `🔍 inferido (fonte: src/shared/types/conversation.ts → IMessage + COMMENT ON COLUMN no banco + supabase/messages.ts + send/core.ts)`

| coluna | significado |
|--------|-------------|
| `direction` | `'in'` = inbound (cliente → plataforma via WhatsApp); `'out'` = outbound (plataforma → cliente). |
| `author_type` | Quem produziu a mensagem: `'customer'` / `'seller'` / `'sdr'` / `'system'`. |
| `author_id` | Identificador do autor quando relevante (sellerId, customerId, sdrId). Nulo p/ mensagens sistema e echoes inbound sem resolution de customer. |
| `provider` | Engine que entregou/originou: `'meta'` (Cloud API), `'evolution'` (Baileys) ou `'mock'`. |
| `text` | Corpo em texto plano. **Empty string** (nunca NULL) quando a mensagem é somente mídia. Default `''::text`. |
| `media_type` | Payload de mídia: `image` / `audio` / `video` / `document` / `sticker`. NULL = mensagem de texto pura. |
| `media_url` | Path no bucket `whatsapp-media` (inbound) ou URL externa assinada (outbound). NULL quando download falhou ou não há mídia. |
| `status` | Lifecycle de entrega: `queued` → `sent` → `delivered` → `read` (ou `failed` como terminal recuperável — ver Regras). |
| `sent_at` | Timestamp original do WhatsApp (`messageTimestamp`) para inbound; tempo de envio para outbound. Pode ser anterior a `created_at` em backlog de reconexão. |
| `delivered_at` / `read_at` | Preenchidos pelo webhook quando o ack chega; limpos (voltam a NULL) quando um `delivered`/`read` supera um `failed` transitório. |
| `provider_message_id` | `wamid` Meta ou `key.id` Evolution. UNIQUE — permite lookup do outbound row pelo webhook para aplicar acks. Colunas com COMMENT no banco (PRD-114). |
| `webhook_event_ids` | Array de todos os `event_key` processados para esta linha (idempotência — o webhook dedup antes de entrar aqui, mas o array guarda o histórico). Default `'{}'`. |
| `media_download_status` | Resultado do fetch de mídia inbound: `ok` (bytes no bucket), `failed` (URL expirou/timeout — retry manual), `expired` (definitivamente irrecuperável). CHECK constraint no banco. COMMENT: "Inbound media fetch outcome (PRD-114): ok = stored in whatsapp-media bucket; failed = URL expired/timeout, manual retry." |
| `failure_reason` | Texto legível da falha de dispatch (PRD-114/118). Limpo quando um ack posterior supera o `failed`. |
| `failure_code` | Código semântico do erro do provedor (ex.: `'131026'` = número inválido Meta). COMMENT: "PRD-118: provider error code of a failed dispatch/status (e.g. '131026')." Limpo junto com `failure_reason` na recuperação. |

## Relacionamentos `[mecânico]`

**Saindo (esta tabela referencia):**

- `conversation_id` → `conversations.id`

**Entrando (referenciam esta tabela):**

- `media_assets.message_id` → `messages.id`

## RLS — Row Level Security `[regra: mecânico]`

### `messages_delete` — DELETE · roles: `{authenticated}`
- **USING:** `( SELECT can_access_conversation(messages.conversation_id) AS can_access_conversation)`

### `messages_insert` — INSERT · roles: `{authenticated}`
- **WITH CHECK:** `( SELECT can_access_conversation(messages.conversation_id) AS can_access_conversation)`

### `messages_select` — SELECT · roles: `{authenticated}`
- **USING:** `( SELECT can_access_conversation(messages.conversation_id) AS can_access_conversation)`

### `messages_update` — UPDATE · roles: `{authenticated}`
- **USING:** `( SELECT can_access_conversation(messages.conversation_id) AS can_access_conversation)`
- **WITH CHECK:** `( SELECT can_access_conversation(messages.conversation_id) AS can_access_conversation)`

**Justificativa do desenho:** `🔍 inferido (fonte: expressões das policies + CLAUDE.md PRD-115/118 + webhook/core.ts)`

- **Delegação total a `can_access_conversation()`:** nenhuma policy de `messages` menciona
  `store_id` ou `is_staff()` diretamente — o acesso à linha de mensagem é herdado do acesso à
  conversa pai. Isso evita duplicar a lógica multi-instância (acesso por seller/papel/loja +
  participantes co-responsáveis) em cada policy.
- **Multi-instância safe:** `can_access_conversation()` já incorpora as regras de Camada 1
  (acesso à instância) e Camada 2 (participantes), introduzidas pelo v0.97.0 `Switchboard`. Não
  é necessário reescrever policies de `messages` para suportar novos padrões de acesso.
- **Mutações via service_role (Edges):** na prática, INSERT de mensagens inbound é feito pela
  Edge `whatsapp-webhook` (service_role, bypass RLS) e INSERT outbound pela Edge `whatsapp-send`
  (service_role). O cliente autenticado usa UPDATE somente via `markStatus` no provider. As
  policies INSERT/UPDATE existem como defesa em profundidade para acessos diretos via API.
- ❓ Confirmar se algum fluxo cliente chama INSERT em `messages` diretamente (fora das Edges),
  ou se as policies INSERT/DELETE são puramente defesa em profundidade.

## Índices `[mecânico]`

- `idx_messages_outbound_sent_at` — `CREATE INDEX idx_messages_outbound_sent_at ON public.messages USING btree (sent_at DESC) WHERE (direction = 'out'::text)`
- `messages_conversation_id_idx` — `CREATE INDEX messages_conversation_id_idx ON public.messages USING btree (conversation_id)`
- `messages_conversation_sent_at_idx` — `CREATE INDEX messages_conversation_sent_at_idx ON public.messages USING btree (conversation_id, sent_at)`
- `messages_pkey` — `CREATE UNIQUE INDEX messages_pkey ON public.messages USING btree (id)`
- `messages_provider_message_id_key` — `CREATE UNIQUE INDEX messages_provider_message_id_key ON public.messages USING btree (provider_message_id)`
- `messages_sent_at_idx` — `CREATE INDEX messages_sent_at_idx ON public.messages USING btree (sent_at)`

## Triggers `[mecânico]`

- _nenhum_

## Regras de negócio

**CHECK constraints (regras explícitas no banco) `[mecânico]`:**

- `messages_media_download_status_check`: `(media_download_status = ANY (ARRAY['ok'::text, 'failed'::text, 'expired'::text]))`

**Narrativa** `🔍 inferido (fonte: src/providers/whatsapp/messageStatus.ts + send/core.ts + whatsapp-webhook/index.ts + CLAUDE.md PRD-115/118)`:

- **Lifecycle de status (outbound):** `queued → sent → delivered → read` com `failed` como
  estado terminal recuperável. A Edge `whatsapp-send` insere com `status='queued'` (persist-
  before-send); ao receber confirmação do provedor grava `status='sent'`. Acks posteriores
  (`delivered`, `read`) chegam via webhook e avançam o status. `failed` senta em rank 2 no
  mapa `MESSAGE_STATUS_RANK` — abaixo de `delivered` (3) e `read` (4) — para que um `delivered`
  subsequente possa superá-lo (Baileys/Evolution emite ack ERROR espúrio em reconexão
  multi-device para mensagens já entregues; tratar `failed` como terminal superior frouxaria
  esses bubbles em "Tentar novamente" mesmo com a mensagem entregue).
- **Anti-regressão:** `statusAdvances(current, incoming)` retorna `true` somente quando
  `MESSAGE_STATUS_RANK[incoming] >= MESSAGE_STATUS_RANK[current]` — status nunca regride.
  Igual ao atual é aceito (idempotente). Implementado em `messageStatus.ts` (runtime-agnostic,
  espelhado em `_shared/whatsapp/messageStatus.ts` para uso nas Edges).
- **Idempotência por `webhook_event_ids`:** o webhook dedup pelo `event_key` na tabela
  `processed_events` antes de tocar `messages`; o array `webhook_event_ids` é atualizado
  **sempre** (mesmo quando o status não avança), preservando o histórico de todos os acks
  recebidos para uma linha.
- **Mensagens inbound:** gravadas diretamente com `status='delivered'` (cliente enviou, nós
  recebemos). `sent_at` = `messageTimestamp` original do WhatsApp; `created_at` = hora em que
  a Edge processou o evento (pode ser posterior em backlog de reconexão ou import de histórico).
  A diferença é exposta como `receivedAt` no `IMessage` do frontend.
- **Mídia inbound:** o webhook faz download imediato para `whatsapp-media` e registra
  `media_download_status='ok'` + path em `media_url`. Falha no download → `status='failed'`
  (WhatsApp retém mídia apenas ~3-4 semanas; após expirar torna-se `expired`). A Edge
  `whatsapp-media-backfill` re-tenta rows com `status='failed'` newest-first.
- **Limpeza de falha na recuperação:** quando o webhook aplica um ack `delivered` ou `read`
  após um `failed` transitório, os campos `failure_reason` e `failure_code` são explicitamente
  setados a NULL (patch em `applyStatusToMessage`), mantendo a linha consistente.

## Perguntas pendentes

- ❓ Confirmar se algum fluxo cliente chama INSERT em `messages` diretamente (fora das Edges), ou se as policies INSERT/DELETE são puramente defesa em profundidade.
- ❓ `direction` não tem CHECK constraint no banco — os valores válidos (`'in'`/`'out'`) são impostos apenas no nível da aplicação/Edge. Avaliar se vale adicionar constraint para enrijecer o esquema.
- ❓ `media_url` de outbound: o webhook armazena path no bucket; a Edge `whatsapp-send` persiste path ou URL assinada efêmera? O `supabase/messages.ts` (`resolveMediaUrl`) re-assina qualquer URL própria do bucket, mas confirmar se o persist-before-send já grava o path limpo (sem TTL) para evitar links expirados em `media_url`.

## Histórico

| data | evento |
|------|--------|
| 2026-06-17 | Bootstrap — ficha gerada (esqueleto mecânico) a partir de introspecção read-only do banco. |
| 2026-06-17 | Bootstrap — enriquecimento de contexto (Fase 3). |
