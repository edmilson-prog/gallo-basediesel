# PRD-114: Webhook Unificado WhatsApp

> ✅ **STATUS (2026-06-10): CONCLUÍDO** — Edge Function `whatsapp-webhook`
> deployada (v1, `verify_jwt:false` by design) com gates fail-closed validados
> por 5 smokes HTTP; núcleo de processamento **runtime-agnostic** em
> `src/providers/whatsapp/webhook/core.ts` (espelhado p/ `_shared/whatsapp/`
> via `scripts/sync-whatsapp-shared.ts`) com **11 testes Vitest** cobrindo
> idempotência, resolução cliente/conversa, status, mídia com timeout e
> payloads ignoráveis. Migration `20260610124828` (`public.processed_events` +
> colunas `provider_message_id`/`webhook_event_ids`/`media_download_status`/
> `failure_reason` em `messages`). Desvios registrados em
> `docs/dev/whatsapp-webhook.md`: **(1)** schema `public` (não `crm`);
> **(2)** `customers.seller_id` é NOT NULL ⇒ cliente auto-criado vai para o
> manager da loja com tag `pending_review` (não `seller_id=null`);
> **(3)** assinatura Meta é por APP ⇒ secrets globais
> `WHATSAPP_META_APP_SECRET`/`_VERIFY_TOKEN` (não per-account);
> **(4)** Evolution sem secret E sem allowlist ⇒ 403 fail-closed;
> **(5)** marca de idempotência logo após o INSERT da mensagem (zero
> duplicação em retry); **(6)** testes unitários em Vitest via `IWebhookDb`
> injetado (sem runner Deno no repo); **(7)** e2e com mensagem real **gated**
> nos secrets/credenciais (mesmos gates dos PRDs 112/113). Bump v2.1.0-rc.4
> não se aplica (SemVer 0.x próprio).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/whatsapp-webhook/`_ |
| **Objetivo** | Edge Function que recebe webhooks de **ambos** os providers WhatsApp (Meta Cloud e Evolution), identifica o provider pela URL ou header, valida HMAC signature, faz parsing via provider apropriado (PRDs 112/113), persiste mensagem em `crm.messages`, atualiza `crm.conversations`, dispara realtime (PRD-105). Idempotência garantida via `crm.processed_events`. Mídia baixada e armazenada imediatamente (URL Meta expira) |
| **Tipo** | Integração |
| **Complexidade** | Crítica |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — sem webhook, mensagens inbound não chegam — feature core do CRM |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-111 (interface providers); PRD-112 (Meta — verifica signature + parser); PRD-113 (Evolution — idem); PRD-101 (`messages`, `conversations`, `customers`, `processed_events`); PRD-102 (Edge Function infra — usa `_shared`); PRD-103 (RLS — Edge Function usa service_role); PRD-105 (Realtime — recebe INSERT em messages); PRD-106 (Storage — mídia inbound); PRD-115 (Envio — produz IDs que voltam em status) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function `supabase/functions/whatsapp-webhook/index.ts`, seguindo padrão `_shared` do PRD-102 |

### Critérios de Complexidade

> **Justificativa de Crítica:** webhook é a porta de entrada de dados externos no sistema — qualquer falha causa perda de mensagem ou, pior, processamento duplicado/manipulado. Combina: validação de signature (HMAC, anti-replay), idempotência (Meta retenta agressivamente), parser multi-provider, persistência cross-table (messages + conversations + customers se novo), download síncrono de mídia (Meta URL expira em ~5min), realtime trigger automático (PRD-105), audit log estruturado. Erro vaza dados de cliente, perde mensagem ou cria conversas duplicadas.

---

## Contexto do Problema

Após PRDs 112 (Meta) e 113 (Evolution) implementarem a metade de **envio**, falta a metade de **recepção** — o webhook que o WhatsApp chama quando o cliente manda mensagem para o número do GALLO.

Sem este PRD:
- Mensagens dos clientes não chegam ao CRM
- A tela de Inbox/Conversa do PRD-010/011 não recebe atualizações
- Toda a operação WhatsApp fica unidirecional (só GALLO → cliente)

A criticidade vem de:
- **Recebe payload do mundo:** atacantes podem tentar forjar payload — validação HMAC obrigatória
- **Meta retenta agressivamente:** mesmo evento chega 2-3× — idempotência obrigatória
- **URL de mídia expira:** se demorar para baixar, perdeu — download síncrono
- **2 providers, 1 endpoint conceitual:** roteamento por URL ou header
- **Mensagem inbound dispara cascata:** persistir + atualizar conversation + criar customer se novo + audit + realtime

---

## Conceito da Solução

### Arquitetura

```
[Meta Cloud / Evolution API]
       │
       │ POST webhook
       ▼
┌──────────────────────────────────────────┐
│ supabase/functions/whatsapp-webhook       │
│                                           │
│ 1. Identificar provider (URL path)        │
│ 2. Validar signature (HMAC)               │
│ 3. Idempotência check (processed_events)  │
│ 4. Parser via IWhatsAppProvider           │
│ 5. Resolver conta + conversa + customer   │
│ 6. Persistir message + atualizar convers. │
│ 7. Baixar mídia (se inbound media)        │
│ 8. Audit log                              │
│ 9. Marcar processed_events                │
│ 10. Responder 200 OK rápido               │
└──────────────────────────────────────────┘
       │
       ▼
[crm.messages INSERT]
       │
       └──▶ Realtime → frontend atualiza inbox/conversa
```

### Roteamento por URL

```
POST /functions/v1/whatsapp-webhook/meta      → provider Meta
POST /functions/v1/whatsapp-webhook/evolution  → provider Evolution
GET  /functions/v1/whatsapp-webhook/meta      → verificação do webhook Meta (hub.challenge)
```

Path `/meta` ou `/evolution` permite servir ambos no mesmo Edge Function, simplificando deploy.

### Verificação de Webhook Meta (handshake)

Meta envia GET com `hub.mode=subscribe&hub.challenge=XXX&hub.verify_token=YYY` para validar o endpoint na configuração. Edge Function responde 200 com `hub.challenge` se `verify_token` bater.

### Idempotência

Cada evento Meta tem `entry[].id` + `changes[].value.messages[0].id` (ou `statuses[0].id`). Evolution tem `data.key.id`. Hash desses + provider name vira a `event_key` em `processed_events`.

```typescript
const eventKey = `whatsapp:${provider}:${messageId}`
await withIdempotency(eventKey, ctx, async () => {
  // processa
})
```

Segunda chamada com mesma `event_key` retorna sem reprocessar (responde 200 OK assim mesmo — Meta não retenta).

### Resolução de Conta, Conversa e Cliente

```
[parseInboundMessage retorna: fromPhone, toAccountPhone, ...]
   │
   ▼
1. Buscar whatsapp_account WHERE phone_number = toAccountPhone → accountId, storeId
2. Buscar customer WHERE whatsapp = fromPhone AND store_id = storeId
   ├── existe → customerId
   └── não existe → criar customer minimal (name=phone, seller_id=null, status pending)
3. Buscar conversation WHERE customer_id = customerId AND whatsapp_account_id = accountId AND status != 'closed'
   ├── existe → conversationId
   └── não existe → criar conversation (seller_id=customer.seller_id, status='open')
4. INSERT message com conversation_id, content, direction='inbound'
5. UPDATE conversation last_message_at, unread_count++
```

### Download Síncrono de Mídia

```typescript
if (inbound.type === 'message' && inbound.mediaId) {
  // Baixa AGORA (URL Meta expira em ~5min)
  const media = await provider.downloadInboundMedia(inbound.mediaId)
  // Upload pra Storage privado
  const path = `conversations/${conversationId}/${messageId}/${filename}`
  await storage.upload('whatsapp-media', path, media.buffer)
  inbound.mediaStoragePath = path  // grava o path no message
}
```

Falha no download não bloqueia o registro da mensagem — message é inserido com `media_download_status='failed'`; retry posterior (PRD futuro ou manual).

### Resposta Rápida

Edge Function tem limite de tempo (60s no Supabase). Webhook precisa responder 200 OK rapidamente, senão Meta marca como falha e retenta. Estratégia:
- Validar + persistir mensagem (sincrono, rápido)
- Download de mídia: tentar sincronamente; se demorar muito (>15s), responder 200 e enfileirar download via outra Edge Function (`whatsapp-media-fetch`)
- Para MVP: tentativa sincrona com timeout 15s; failed status para retry manual

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| 2 Edge Functions separadas (`webhook-meta` + `webhook-evolution`) | Duplica código `_shared`; um endpoint roteado é mais limpo |
| Queue dedicada (RabbitMQ, AWS SQS) | Overkill para volume MVP; Edge Function sincrona + idempotency basta |
| Webhook armazena raw payload e processa async via job | Complexidade extra; sincrono com retry idempotente funciona bem |
| Sem validação HMAC ("vamos confiar no IP") | Inaceitável — atacante pode forjar payload trivialmente |
| Download de mídia em background sempre | Aumenta complexidade; sincrono cobre 99% dos casos < 5MB |
| Criar customer sem confirmação humana | Cliente novo sem verificação é spam-friendly; minimal record com `is_pending=true` resolve |

---

## Escopo

### Incluído

- ✅ Edge Function `supabase/functions/whatsapp-webhook/index.ts` que roteia por path `/meta` e `/evolution`
- ✅ Verificação Meta (GET com hub.challenge)
- ✅ Validação HMAC signature via `provider.verifyWebhookSignature` (Meta) ou validação configurada (Evolution v2+ ou IP allowlist)
- ✅ Idempotência via `withIdempotency` (PRD-102) usando `crm.processed_events`
- ✅ Parser via `provider.parseInboundMessage` (delega a 112/113)
- ✅ Resolução de account → store → customer (cria se novo, com `is_pending=true`) → conversation (cria se não existe ou está fechada)
- ✅ Persistência em `crm.messages` (inbound) com todos os campos: `meta_message_id`, `content`, `content_type`, `media_url` (storage path), etc.
- ✅ UPDATE em `crm.conversations`: `last_message_at`, `unread_count`, possível `seller_id` (se customer já tinha)
- ✅ Tratamento de InboundStatus (delivered/read/failed): UPDATE em messages outbound previamente enviados (`dispatch_status`, `webhook_event_ids[]`)
- ✅ Download síncrono de mídia + upload para `whatsapp-media` (PRD-106) com timeout 15s; failed → `media_download_status='failed'`
- ✅ Audit log via `writeAuditLog` (PRD-102)
- ✅ IP allowlist opcional para Evolution (sem HMAC)
- ✅ Resposta 200 OK sempre (mesmo em erro interno) para evitar retry agressivo Meta — mas registra log para investigação
- ✅ Configuração de webhook em Meta Business Manager + Evolution Dashboard documentada
- ✅ Testes unitários: roteamento por path, validação signature, idempotência, parsing fixtures, resolução customer/conversation
- ✅ Teste de integração: enviar mensagem real ida para staging, validar registro
- ✅ Documentação `docs/dev/whatsapp-webhook.md`

### Excluído

- ❌ Lógica de envio (PRD-115)
- ❌ Templates HSM (PRD-116)
- ❌ Session 24h tracking (PRD-117 — leitura aqui apenas atualiza `last_inbound_at` na conversation)
- ❌ Status tracking detalhado (PRD-118 amplia)
- ❌ Retry queue para download de mídia falhada (job manual no MVP; PRD futuro automatiza)
- ❌ Detecção de spam / opt-out automático (Onda 13)
- ❌ Auto-resposta (chatbot) — feature separada, fora da Onda 5

---

## Requisitos Funcionais

### Roteamento e Verificação

- **RF-001:** Edge Function aceita requests em `/functions/v1/whatsapp-webhook/<provider>` onde `<provider>` ∈ `{meta, evolution}`.
- **RF-002:** Provider desconhecido retorna `400 Bad Request`.
- **RF-003:** Meta GET com `hub.mode=subscribe&hub.challenge=XXX&hub.verify_token=YYY`:
  - Resolve `meta_whatsapp_webhook_verify_token` no Vault
  - Compara com `YYY` (`timingSafeEqual`)
  - Se igual: responde 200 com body `XXX` (apenas o challenge, sem JSON)
  - Senão: responde 403
- **RF-004:** Evolution não tem fluxo de verificação padrão — POST direto.

### Validação de Signature

- **RF-010:** Para Meta:
  - Header `x-hub-signature-256` esperado
  - Resolve `appSecret` via Vault
  - Chama `provider.verifyWebhookSignature(rawBody, header)`
  - Inválido: 403 + log de warning
- **RF-011:** Para Evolution:
  - Se `vaultRef_webhookSecret` configurado: validar HMAC
  - Senão: validar IP de origem contra allowlist em env `EVOLUTION_ALLOWED_IPS` (comma-separated)
  - Inválido: 403 + log

### Idempotência

- **RF-020:** Extrai `messageId` do payload (após parsing):
  - Meta: `entry[].changes[].value.messages[0].id` ou `statuses[0].id`
  - Evolution: `data.key.id`
- **RF-021:** `eventKey = whatsapp:${provider}:${messageId}` (ou hash sha256 do raw body se messageId ausente)
- **RF-022:** Chama `withIdempotency(eventKey, ctx, ...)` (PRD-102):
  - Se já processado: retorna 200 OK imediatamente, sem reprocessar
  - Se novo: processa, grava em `processed_events`, retorna 200

### Parsing

- **RF-030:** Carrega provider via `getWhatsAppProvider(accountId)` — mas accountId ainda não é conhecido!
- **RF-031:** Estratégia: fazer pre-parse pelo provider concreto (sem accountId) para extrair `toAccountPhone`, depois resolver accountId via DB, depois usar provider correto para parsing final.
  - Em prática: instanciar provider "stub" (sem credenciais) apenas para usar `parseInboundMessage` que é stateless
  - Ou: parsing local na Edge Function (pequeno fork do parser) — mas duplica lógica
  - **Decisão recomendada:** parser stateless exportado de cada provider, importado direto pela Edge Function sem instanciar classe
- **RF-032:** Após parsing, recebe `InboundMessage` ou `InboundStatus` normalizado.

### Resolução de Entidades

- **RF-040:** Para `InboundMessage`:
  1. Buscar `crm.whatsapp_accounts` WHERE `phone_number = inbound.toAccountPhone` AND `is_active = true`
     - Não achou → log erro + responder 200 (não é nossa conta — caso de provider mal-configurado)
  2. Buscar `crm.customers` WHERE `whatsapp = inbound.fromPhone` AND `store_id = account.store_id`
     - Não achou → criar customer minimal: `name = inbound.fromPhone`, `whatsapp = inbound.fromPhone`, `store_id`, `seller_id = null`, `customer_type = 'b2c'`, `lgpd_status = 'not_collected'`, `is_active = true`, `tags = ['pending_review']`
  3. Buscar `crm.conversations` WHERE `customer_id = X` AND `whatsapp_account_id = Y` AND `status != 'closed'`
     - Não achou → criar conversation: `customer_id`, `whatsapp_account_id`, `seller_id = customer.seller_id` (pode ser null), `channel = 'whatsapp'`, `status = 'open'`, `last_message_at = inbound.timestamp`, `unread_count = 0`

### Persistência da Mensagem

- **RF-050:** INSERT em `crm.messages`:
  - `conversation_id`
  - `direction = 'inbound'`
  - `content_type` (text/image/audio/...)
  - `content` (text ou caption)
  - `media_url` (path no Storage, preenchido após RF-070)
  - `meta_message_id = inbound.providerMessageId`
  - `webhook_event_ids = [eventKey]` (array de event keys que tocaram essa mensagem)
  - `sender_seller_id = null` (inbound)
  - `is_internal_note = false`
  - `created_at = inbound.timestamp`
- **RF-051:** UPDATE em `crm.conversations`:
  - `last_message_at = inbound.timestamp`
  - `unread_count = unread_count + 1`
- **RF-052:** Realtime (PRD-105) propaga INSERT automaticamente — frontend atualiza inbox.

### Processamento de Status

- **RF-060:** Para `InboundStatus`:
  - Buscar `crm.messages` WHERE `meta_message_id = status.providerMessageId`
  - UPDATE `dispatch_status = status.status`
  - APPEND `webhook_event_ids = webhook_event_ids || [eventKey]`
  - Se `status = 'failed'`: APPEND `failure_reason` em payload (via jsonb)
- **RF-061:** Mensagem não encontrada (status de outbound não nosso?): apenas log warning, responde 200 OK.

### Download de Mídia

- **RF-070:** Se `inbound.mediaId`:
  - Instancia provider real (com accountId resolvido) → tem credenciais para baixar
  - Chama `provider.downloadInboundMedia(mediaId)` com timeout 15s
  - Upload para bucket `whatsapp-media` (PRD-106) path `conversations/<conv_id>/<message_id>/<filename>`
  - Update `messages.media_url` com path
  - Falha (timeout, erro 404 expirado): `messages.media_download_status = 'failed'`, log error
- **RF-071:** Documento, imagem, áudio, vídeo — todos seguem mesmo padrão.

### Audit Log

- **RF-080:** `writeAuditLog`:
  - `actor_type = 'integration'`
  - `entity_type = 'message'`
  - `entity_id = <novo message_id>`
  - `action = 'webhook_received'`
  - `payload = { provider, fromPhone, contentType, hasMedia, etc. }` (sem PII além do estritamente necessário)
  - `trace_id`
  - `integration_context = { provider, eventKey }`

### Response

- **RF-090:** Sempre responde 200 OK quando processamento completa (mesmo que com warnings).
- **RF-091:** Apenas responde 4xx/5xx em:
  - 400 provider desconhecido
  - 403 signature inválida
  - 405 método não permitido
  - 500 erro catastrófico não-tratado (raríssimo)
- **RF-092:** Body do response 200 = `{ status: 'ok', traceId }` — Meta ignora body, mas útil para debug.

### Testes

- **RF-100:** Testes unitários:
  - Roteamento por path
  - Verificação Meta (hub.challenge)
  - Validação signature válida e inválida
  - Idempotência (segunda chamada com mesma key)
  - Resolução customer/conversation (criação de novo)
  - Processamento de status
- **RF-101:** Teste de integração (Sandbox/staging):
  - Enviar mensagem real para número de teste GALLO
  - Validar registro em `crm.messages`
  - Validar mídia baixada para `whatsapp-media` bucket
  - Validar audit log

### Configuração Externa

- **RF-110:** Documentar passo a passo:
  - Meta Business Manager → WhatsApp → Configuration → Webhook: URL = `<supabase>/functions/v1/whatsapp-webhook/meta`, Verify Token = (valor do Vault), eventos subscritos: `messages`, `message_statuses`
  - Evolution Dashboard → Settings → Webhook: URL = `<supabase>/functions/v1/whatsapp-webhook/evolution`, eventos: `messages.upsert`, `messages.update`, `connection.update`

### Documentação

- **RF-120:** `docs/dev/whatsapp-webhook.md`:
  - Arquitetura
  - Fluxo de processamento
  - Schema de payloads (Meta + Evolution) — fixtures de exemplo
  - Configuração externa (Meta Business Manager, Evolution)
  - Troubleshooting (signature falhando, mensagem não chega, mídia perdida)

---

## Requisitos Não-Funcionais

- **RNF-001 (Performance):** Webhook responde < 5s p95 (incluindo download de mídia pequena). Meta penaliza > 10s.
- **RNF-002 (Confiabilidade):** Idempotência garantida; retry de Meta nunca duplica mensagem em `crm.messages`.
- **RNF-003 (Segurança — signature):** Validação HMAC com `timingSafeEqual`; signature inválida nunca processada.
- **RNF-004 (Segurança — input):** Payload validado e tipado antes de tocar banco; injection impossível (parametrized queries via Supabase client).
- **RNF-005 (Auditabilidade):** Audit log em 100% de mensagens processadas.
- **RNF-006 (Mídia):** URL Meta tem TTL ~5min; download síncrono dentro de 15s ou marca failed.
- **RNF-007 (Disponibilidade):** Edge Function não pode falhar catastroficamente em payload inesperado — defensive parsing.

---

## Critérios de Aceitação

### RF-003: Verificação Meta

```gherkin
DADO o Verify Token configurado no Vault como "ABC123"
QUANDO Meta envia GET com hub.verify_token=ABC123&hub.challenge=XYZ
ENTÃO Edge Function responde 200 com body "XYZ" (texto plano)

QUANDO o token enviado é diferente
ENTÃO responde 403
```

### RF-022 + RNF-002: Idempotência

```gherkin
DADO uma mensagem inbound chegando pela primeira vez
QUANDO processada
ENTÃO INSERT em crm.messages
  E linha em crm.processed_events com eventKey

QUANDO a mesma mensagem chega de novo (Meta retry)
ENTÃO withIdempotency detecta event já processado
  E NÃO faz INSERT novo em messages (zero duplicação)
  E retorna 200 OK em < 50ms
```

### RF-040 + RF-050: Resolução e Persistência

```gherkin
DADO um cliente NOVO (whatsapp não cadastrado) envia primeira mensagem
QUANDO processada
ENTÃO crm.customers tem novo registro: name=<phone>, whatsapp=<phone>, tags=['pending_review']
  E crm.conversations tem nova conversation: status='open', seller_id=null
  E crm.messages tem a mensagem inserida

DADO cliente JÁ cadastrado envia mensagem
QUANDO processada
ENTÃO customer NÃO é duplicado (já existe match por whatsapp)
  E se há conversation aberta, é reusada (não cria nova)
```

### RF-070 + RNF-006: Download de Mídia

```gherkin
DADO uma mensagem inbound com imagem (mediaId presente)
QUANDO processada
ENTÃO download de mídia é tentado em < 15s
  E imagem é upload em whatsapp-media bucket no path /conversations/<conv>/<msg>/<file>
  E messages.media_url contém o path

DADO mídia que demora > 15s para baixar
QUANDO timeout
ENTÃO message é registrado com media_download_status='failed'
  E log error registrado
  E response 200 OK mesmo assim (não retentar Meta)
```

### RF-090 + RF-092: Resposta Rápida

```gherkin
DADO qualquer evento webhook processado com sucesso ou warning
QUANDO completa
ENTÃO response status 200 OK
  E body { status: 'ok', traceId }
  E tempo total < 5s p95
```

### RF-060: Status de Outbound

```gherkin
DADO uma mensagem outbound previamente enviada (provider_message_id=M1, dispatch_status='sent')
QUANDO chega webhook de status delivered para M1
ENTÃO UPDATE messages SET dispatch_status='delivered' WHERE meta_message_id=M1
  E webhook_event_ids array recebe novo evento
```

---

## Fases de Implementação

### Fase 1 — Roteamento + Verificação Meta (1 dia)
- Edge Function scaffold
- Routes /meta, /evolution
- GET verification Meta

### Fase 2 — Signature + Idempotência + Parser (2 dias)
- HMAC validation Meta
- IP allowlist / HMAC opcional Evolution
- withIdempotency
- Integração com parsers dos PRDs 112/113

### Fase 3 — Resolução + Persistência (2 dias)
- Lógica customer/conversation/message
- UPDATE conversations
- Status updates para outbound
- Audit log

### Fase 4 — Download de Mídia (1 dia)
- Download síncrono com timeout
- Upload para Storage
- failed handling

### Fase 5 — Teste E2E + Docs (1 dia)
- Sandbox Meta + Evolution real
- `docs/dev/whatsapp-webhook.md`
- Configuração documentada
- `_DONE`

---

## Dependências

- **Depende de:** PRD-111 (interface), PRD-112 (parser Meta + signature), PRD-113 (parser Evolution), PRD-101 (todas as tabelas), PRD-102 (`_shared`, `withIdempotency`, `writeAuditLog`), PRD-103 (RLS — Edge Function usa service_role), PRD-105 (Realtime atualiza inbox), PRD-106 (Storage para mídia), PRD-107 (auth não aplicável aqui — webhook é público com HMAC)
- **Bloqueia:** PRD-115 (depende de webhook para receber status de entrega), PRD-117 (24h window baseado em last_inbound_at), PRD-118 (status tracking)
- **Decisões Pendentes:** parser stateless export (sugerido); timeout download mídia (15s sugerido); customer auto-criado com `is_pending`/`tags` (confirmar com produto).

---

## Considerações de Segurança

- **HMAC obrigatório** com `timingSafeEqual` (PRD-112 já entrega)
- **Validação de input:** parser defensivo; payload malformado lança AppError, nunca processa
- **service_role apenas em Edge Function:** never propaga ao caller
- **Sanitização de audit log:** PII apenas dentro do necessário (`fromPhone` ofuscado se possível)
- **Mídia em bucket privado** (`whatsapp-media`) — política RLS no PRD-106
- **Auto-criação de customer:** marca como `pending_review` para vendedor revisar — não vira lead automático sem revisão
- **Rate limit Edge Function:** Supabase já impõe; atacante não floodar
- **No-retry em erro interno:** responde 200 OK mesmo em erro (registrado em log) para evitar retry agressivo Meta

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.4; CHANGELOG; renomear `PRD-114-whatsapp-webhook_DONE.md`; teste E2E com mensagem real documentado; configuração Meta/Evolution registrada.

| Princípio | Descrição |
|-----------|-----------|
| **200 OK sempre que possível** | Meta retenta agressivamente; reduzir falsos negativos |
| **Idempotência primeiro** | Antes de qualquer processamento, checa processed_events |
| **Mídia agora ou nunca** | Sincrono com timeout; URL Meta expira |
| **Parser defensivo** | Payload inesperado vira AppError, nunca trava |
| **Customer minimal** | Não cria dados que vão precisar de cleanup; pending_review |

| ❌ Evitar |
|-----------|
| Skipar validação HMAC ("é só ambiente de teste") |
| Processar antes de checar idempotência |
| Download de mídia async sem registrar message primeiro |
| Resposta 5xx em erro interno (Meta retenta forever) |
| Criar customer "rico" com defaults inventados |
| Reusar conversation closed |
| Esquecer audit log |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO (com desvios documentados — ver nota no topo) |
| **Data** | 2026-06-10 |
| **Versão** | PR do PRD-114 (bump no merge) |
| **Por** | Claude Code CLI |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2b do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**
