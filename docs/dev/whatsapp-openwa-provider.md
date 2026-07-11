# WhatsApp OpenWA — Provider Engine

> **Servidor de referência:** `openwa.ailainteligente.com.br` (fork [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA), whatsapp-web.js)
> **Contrato confirmado ao vivo:** 2026-07-07 a 2026-07-09 (probing + pareamento real + e2e inbound real)

---

## 1. O que é

Quarto engine WhatsApp da plataforma (ao lado de Meta Cloud API, Evolution v2 e Evolution Go) — sessão self-hosted baseada em `whatsapp-web.js`. Pareamento por QR, mesma família de UX que Evolution/Evolution Go (`isEvolutionFamily`).

**Não é failover do Evolution** — é um engine independente, pensado como opção primária/redundante para números novos.

Capacidades honestas (menores que Meta/Evolution):

| Recurso | Suportado |
|---|---|
| Templates HSM | ❌ |
| Mensagens interativas | ❌ |
| Upload de mídia separado | ❌ — mídia sai sempre por URL |
| Reações | ✅ |
| Mensagem proativa | ✅ |
| Webhook customizável | ✅ |
| Confirmação de leitura | ✅ |

---

## 2. Modelo de autenticação — registry, igual ao Evolution Go

Ao contrário do Evolution v2 clássico (apikey por instância), a OpenWA usa **UMA chave global por servidor** para TUDO — administração de sessão (create/start/stop/delete/webhooks) E mensageria usam a mesma chave (confirmado ao vivo: testes de admin e de envio usaram a chave idêntica).

### Tabela `whatsapp_openwa_servers`

| coluna | tipo | descrição |
|---|---|---|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `text` NOT NULL UNIQUE | Nome amigável |
| `base_url` | `text` NOT NULL | Endpoint do servidor |
| `api_key_ref` | `text` NOT NULL UNIQUE | Ponteiro para o segredo no Vault |
| `created_at` / `updated_at` | `timestamptz` | auditoria |

FK em `whatsapp_accounts.openwa_server_id` (`ON DELETE RESTRICT`, só preenchida em contas `openwa`). RLS Owner-only (mesmo padrão de `whatsapp_go_servers`).

### `provider_config` — shape mínimo

```json
{ "sessionId": "<uuid gerado pelo servidor no pareamento>" }
```

`""` antes do primeiro pareamento (satisfaz o CHECK de shape `provider_config ? 'sessionId'` por presença de chave, não por truthiness). **Nunca** carrega `baseUrl`/`apiKeySecretName` — isso vive só no registry.

---

## 3. Contrato REST confirmado ao vivo

Todas as rotas sob `/api` (prefixado por `openwaRequest`), header `x-api-key`.

### Sessão

| Rota | Uso |
|---|---|
| `POST /sessions` `{ name }` | Cria sessão → `{ id, name, status: "created" }` |
| `POST /sessions/{id}/start` | Inicia conexão (QR fica disponível) |
| `GET /sessions/{id}/qr` | `{ qrCode: "data:image/png;base64,..." }` — ausente = já pareada |
| `GET /sessions/{id}` | `{ id, status, phone, pushName, lastActive, lastError, ... }` |
| `POST /sessions/{id}/stop` | Desconecta sem apagar a sessão |
| `DELETE /sessions/{id}` | Remove a sessão do servidor |
| `POST /sessions/{id}/webhooks` `{ url, events }` | Registra webhook (sem upsert-by-url — registrar 1x no pareamento) |
| `GET /sessions/{id}/contacts/{jid}` | Resolve um JID → `{ id: "<fone>@c.us", name, pushName, number, ... }` |

**Status confirmado:** sessão pareada reporta `"ready"` (nome do evento nativo do whatsapp-web.js), **não** `"connected"` — `getOpenWaStatus`/`healthCheck` aceitam ambos (`"connected"` como fallback defensivo).

**Sem rota de restart dedicada** — implementado como `stop` best-effort + `start`.

### Mensagens

| Rota | Body |
|---|---|
| `POST /sessions/{id}/messages/send-text` | `{ chatId, text }` |
| `POST /sessions/{id}/messages/send-image` | `{ chatId, url, caption? }` |
| `POST /sessions/{id}/messages/send-video` | `{ chatId, url, caption? }` |
| `POST /sessions/{id}/messages/send-audio` | `{ chatId, url }` |
| `POST /sessions/{id}/messages/send-document` | `{ chatId, url, filename? }` |
| `GET /sessions/{id}/messages` | `{ messages: [...] }` — shape do registro abaixo |

Sem upload separado — mídia outbound **sempre** por URL (signed Supabase Storage). Sem endpoint de download por id — mídia inbound chega **inline em base64** no webhook (`metadata.media.data`); o provider empacota os bytes no próprio `mediaId` opaco (`OpenWaProvider.downloadInboundMedia` decodifica local, zero HTTP).

Sem suporte confirmado a *reply/quote* — nenhum nome de campo testado (`quotedMessageId`/`quotedMsgId`/`replyTo`) foi aceito; `replyToMessageId` é descartado silenciosamente.

### Registro de mensagem (`GET /sessions/{id}/messages`, confirmado)

```
{ id, sessionId, waMessageId, chatId, chatName, from, to, body, type,
  direction: "incoming"|"outgoing", timestamp (unix seconds),
  metadata: null | { media: { mimetype, data (base64), filename? } },
  status, createdAt }
```

`id` é o uuid da linha **deste servidor** (session-scoped) — usar sempre `waMessageId` para `provider_message_id`/correlação de ack.

---

## 4. Envelope de webhook — inferido, com fallback defensivo

Eventos registrados: `message.received`, `message.ack`, `message.sent`, `session.status`, `session.qr`.

Formato assumido: `{ event, sessionId, data: <registro de mensagem> }`. O parser (`src/providers/whatsapp/openwa/parser.ts`) também aceita o registro **sem** envelope (bare), desde que pareça uma mensagem (`from`/`chatId`/`waMessageId` presentes) — um mismatch de shape vira `"ignored"` (RNF-007), nunca um crash. Eventos `session.*` não carregam mensagem e são descartados como não-suportados (mesmo tratamento).

---

## 5. Duas armadilhas descobertas só com tráfego real (2026-07-09)

### 5.1 — `@lid` é resolvível (vantagem sobre o Evolution v2)

DMs chegam com JID de privacidade `@lid` (sem telefone). O Evolution v2 **descarta** esses eventos (não tem como resolver). A OpenWA **tem**: `GET /sessions/{id}/contacts/{lid}` responde `{ id: "<fone>@c.us", ... }` — o campo `number` apenas ecoa os dígitos do lid consultado, **nunca usar**.

O webhook (`whatsapp-webhook/index.ts`, bloco `provider === "openwa"`) resolve `from`/`to`/`chatId` **antes** do parse, com cache por-request e best-effort (falha na resolução preserva o `@lid` original, que o parser então descarta normalmente).

### 5.2 — o campo `direction` mente durante o re-sync de histórico

Reconectar uma sessão (`stop` + `start`) dispara um re-sync de histórico no servidor. Mensagens enviadas do próprio celular chegaram com `direction: "incoming"` — confiar nesse campo classificou ecos como inbound e criou uma conversa invertida para o número da própria conta.

**Fix:** o id serializado do whatsapp-web.js carrega `fromMe` como primeiro token (`"true_..."` / `"false_..."`) — o parser usa esse prefixo como fonte de verdade, `direction` só como fallback quando o id não segue o padrão.

### 5.3 — `"ready"` não garante socket vivo

Uma sessão pode reportar `status: "ready"` com `lastActive` estagnado e nenhuma mensagem realmente fluindo — 1 ocorrência observada (2026-07-09), causa raiz não isolada (pode ser socket morto real ou apenas ausência legítima de tráfego; a demora exata do engasgo não foi medida). `stop` + `start` reconectou em ~5s **sem novo QR** e o re-sync trouxe as mensagens perdidas.

**Ainda não implementado:** detecção automática desse estado (ex.: `lastActive` estagnado por N minutos) no tick de saúde (`whatsapp_health_tick`) — hoje só Evolution/Evolution Go têm monitoramento ativo. Ver `docs/dev/whatsapp-failover.md`.

---

## 6. Cobertura dos call sites

| Arquivo | Uso | Cobertura openwa |
|---|---|---|
| `supabase/functions/whatsapp-connect/index.ts` | qr / test / state / logout / restart / delete | ✅ bloco dedicado (`resolveOpenWaServer`) |
| `supabase/functions/whatsapp-send/index.ts` | Envio outbound | ✅ `resolveOpenWaServerConfigs` |
| `supabase/functions/whatsapp-webhook/index.ts` | Inbound, ecos, resolução de `@lid` | ✅ bloco dedicado (`openwaGate` + `openwaServers` map) |
| `supabase/functions/scheduled-send-worker/index.ts` | Envios agendados | ❌ **não coberto** — só tem fast-exit para `evolution-go`; uma conta `openwa` com `scheduledSend` pendente falhará por falta de `baseUrl`/`apiKeySecretName` no `providerConfig`. Pendência conhecida, replicar o padrão de `resolveGoBaseUrls`/`resolveOpenWaServerConfigs` antes de habilitar agendamento para openwa em produção. |

Ações do `whatsapp-connect` **deliberadamente não implementadas** para openwa: `test-message` (mensagem de teste ad-hoc) e sincronização de fotos (`whatsapp-avatar-sync` rejeita openwa com 422) — a UI (`WhatsAppAccountsPage`, `ConversationMenu`) esconde esses botões para contas openwa em vez de deixá-los quebrar.

---

## 7. Diagnóstico

Enquanto o envelope de webhook segue **inferido** (não documentado oficialmente pelo fork), dois desfechos que normalmente seriam silenciosos (`status-unmatched`, `account-not-found`) são persistidos em `integration_logs` **só para o provider `openwa`** — os demais engines mantêm o filtro de ruído original (ack duplicado, `connection.update`). Strings longas (mídia inline em base64) são truncadas a 2KB antes de logar.

---

## 8. Cutover

1. Migration `20260707140000_whatsapp_openwa_servers` (aplicada em prod 2026-07-08).
2. Deploy: `whatsapp-connect`, `whatsapp-webhook`, `whatsapp-send`.
3. Cadastrar o servidor real em `Configurações → Integrações → Chaves & API` (grupo servidores OpenWA).
4. Parear um número pelo wizard (`Adicionar número → OpenWA`).
5. Smoke: mensagem real inbound → aparece no Inbox com telefone correto; resposta outbound pelo app chega no celular.
6. **Antes de produção real:** decidir sobre a lacuna do item 6 (scheduled-send-worker) e sobre detecção de stall (item 5.3).
