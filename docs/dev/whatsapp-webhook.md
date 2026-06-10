# whatsapp-webhook — webhook unificado (PRD-114)

> Edge Function pública (`verify_jwt: false` **by design**) que recebe os
> webhooks da Meta Cloud API e da Evolution API, valida a origem fail-closed
> e processa via o núcleo compartilhado `_shared/whatsapp/webhook/core.ts`
> (espelho de `src/providers/whatsapp/webhook/core.ts`).

## Rotas

| Rota | Uso |
| --- | --- |
| `GET /functions/v1/whatsapp-webhook/meta` | Handshake de verificação Meta (`hub.challenge`) |
| `POST /functions/v1/whatsapp-webhook/meta` | Eventos Meta (mensagens + statuses) |
| `POST /functions/v1/whatsapp-webhook/evolution` | Eventos Evolution (`messages.upsert`/`messages.update`) |

Provider desconhecido → 400; método errado → 405.

## Autenticação (fail-closed — únicos 4xx em POST)

| Provider | Gate |
| --- | --- |
| Meta | HMAC-SHA256 do corpo cru no header `x-hub-signature-256`, secret **de APP** `WHATSAPP_META_APP_SECRET` (a Meta assina por app, não por número — por isso é global, desvio do modelo per-account). Secret ausente ⇒ 403 |
| Evolution | `<credentials_ref>_WEBHOOK_SECRET` da conta (HMAC no header `x-webhook-signature`) **ou**, sem secret, IP allowlist `EVOLUTION_ALLOWED_IPS` (csv). Nenhum dos dois configurado ⇒ **403 fail-closed** |

Handshake Meta: `WHATSAPP_META_VERIFY_TOKEN` (comparação constant-time);
responde o `hub.challenge` em texto puro.

## Pipeline (núcleo `webhook/core.ts` — 11 testes Vitest)

1. **Parse defensivo** (parsers puros dos PRDs 112/113). Payload irreconhecível,
   eco `fromMe` e eventos não-mensagem (`connection.update`…) ⇒ `ignored` + 200.
2. **Idempotência**: `event_key = whatsapp:<provider>:<providerMessageId>` em
   `public.processed_events`. Duplicata ⇒ 200 sem reprocessar (Meta retenta 2-3×).
3. **Status** (`delivered`/`read`/`failed`): casa por `messages.provider_message_id`,
   atualiza `status` + `delivered_at`/`read_at`/`failure_reason` + append em
   `webhook_event_ids`. Outbound desconhecido ⇒ warn + 200.
4. **Resolução de conta**: Meta por `provider_config.phoneNumberId` (fallback
   dígitos do `phone_number`); Evolution por `provider_config.instanceName`.
   Conta não achada ⇒ warn + 200 (não marca processado — replay possível).
5. **Cliente**: match por dígitos do telefone na loja. Novo ⇒ cliente mínimo
   `b2c` com `tags=['pending_review']` e **`seller_id` = manager da loja**
   (fallback: vendedor ativo mais antigo) — `customers.seller_id` é NOT NULL,
   o `seller_id=null` do PRD é impossível aqui (desvio registrado).
6. **Conversa**: reusa aberta (status ∉ `resolvida|arquivada`); senão cria
   `status='aguardando'`, `channel='whatsapp'`, herdando o vendedor do cliente.
7. **Mensagem**: `direction='in'`, `author_type='customer'`, `status='delivered'`,
   `provider_message_id`, `webhook_event_ids=[eventKey]`. Conversa recebe
   `last_message_at` + `unread_count+1`. **Marca de idempotência logo após o
   insert** — retry do provider jamais duplica a mensagem.
8. **Mídia síncrona** (URL da Meta expira em ~5min): download via engine real
   (timeout 15s) → upload no bucket `whatsapp-media` em
   `conversations/<conv>/<msg>/media.<ext>` → `media_download_status='ok'`.
   Falha/timeout ⇒ `'failed'` (retry manual), mensagem fica.
9. **Audit**: `audit_logs` com ator `integration:whatsapp-webhook`, telefone
   mascarado (`***1234`). Realtime (PRD-105) propaga o INSERT sozinho.

Erro interno após os gates ⇒ log + Sentry + **200** `{status:'error-logged'}`
(RF-090 — a Meta não pode entrar em retry storm).

## Configuração externa (quando os secrets existirem)

**Meta** (Business Manager → WhatsApp → Configuration → Webhook):
- Callback URL: `https://<ref>.supabase.co/functions/v1/whatsapp-webhook/meta`
- Verify token: o valor de `WHATSAPP_META_VERIFY_TOKEN`
- Webhook fields: `messages` (inclui statuses)

**Evolution** (`POST /webhook/set/{instance}`):
- URL: `https://<ref>.supabase.co/functions/v1/whatsapp-webhook/evolution`
- Eventos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`
- Recomendado: configurar webhook secret e setar `<ref>_WEBHOOK_SECRET`;
  senão, preencher `EVOLUTION_ALLOWED_IPS` com o IP da VPS

## Smokes executados no deploy (2026-06-10, v1)

| Caso | Resultado |
| --- | --- |
| GET handshake sem token configurado | 403 ✅ |
| POST /meta sem assinatura (secret ausente) | 403 `webhook not configured` ✅ |
| POST /evolution sem secret/allowlist | 403 fail-closed ✅ |
| POST provider desconhecido | 400 ✅ |
| GET /evolution | 405 ✅ |

O e2e com mensagem real está **gated** nos mesmos itens dos PRDs 112/113
(credenciais Meta / VPS Evolution) + secrets desta função.

## Troubleshooting

| Sintoma | Causa provável |
| --- | --- |
| 403 em tudo | Secrets não configurados (fail-closed é o estado de fábrica) |
| Assinatura Meta sempre inválida | `WHATSAPP_META_APP_SECRET` ≠ App Secret do app certo, ou body re-serializado por proxy (HMAC é do corpo CRU) |
| Mensagem não aparece no Inbox | conferir logs da função (outcome `account-not-found`? `provider_config` da conta sem phoneNumberId/instanceName) |
| `media_download_status='failed'` | URL expirou (>5min) ou VPS fora — retry manual |
| Cliente duplicado | formato de telefone divergente — o match é por dígitos; conferir como o cliente foi cadastrado |

## Manutenção

⚠️ Qualquer mudança em `src/providers/whatsapp/` exige rodar
`bun run scripts/sync-whatsapp-shared.ts` e **redeployar** as functions que
usam `_shared/whatsapp/` (hoje: `whatsapp-webhook`).
