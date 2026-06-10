# PRD-112: Meta Cloud API Provider

> ✅ **STATUS (2026-06-10): CONCLUÍDO** — engine `MetaCloudProvider` entregue em
> `src/providers/whatsapp/meta/` (client Bearer + timeout 30s, HMAC
> constant-time via Web Crypto, parser completo de inbound/status, mapeamento
> de erros RF-110, upload/download de mídia em 2 passos, healthCheck) com 26
> testes Vitest. Desvios registrados em `docs/dev/whatsapp-meta-provider.md`:
> **(1)** sem Vault — secrets de Edge Function nomeados pelo prefixo
> `credentials_ref` (`<ref>_ACCESS_TOKEN/_APP_SECRET/_VERIFY_TOKEN`),
> resolvidos via `deps.resolveSecret` injetado (cache 60s); **(2)** código
> runtime-agnostic em `src/` (espelho p/ `_shared/whatsapp/` nos PRDs
> 114/115), não classe edge-only; **(3)** `AppError` → `WhatsAppProviderError`;
> **(4)** `crm.integration_logs` → `public.integration_logs` (migration
> `20260610122110`, RLS owner-read validada ao vivo; gravação efetiva nos
> PRDs 114/115 via sink injetado); **(5)** `verifyWebhookSignature` async;
> **(6)** teste de integração Sandbox **gated** — sem credenciais Meta da
> GALLO ainda (passo a passo documentado). Bump v2.1.0-rc.2 do PRD não se
> aplica (repo usa SemVer 0.x próprio — bump no merge do PR #53).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/whatsapp/meta/`_ |
| **Objetivo** | Implementação real do `IWhatsAppProvider` para Meta WhatsApp Cloud API: autenticação via Bearer token (Vault), endpoints de envio (text/media/template/interactive), upload e download de mídia, validação HMAC de webhook, parsing de payloads inbound (mensagens e status), tratamento de rate limiting e erros específicos, instrumentação via `integration_logs` |
| **Tipo** | Integração |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — provider primário do MVP |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-111 (interface — pré-requisito); PRD-100 (Vault); PRD-101 (`whatsapp_accounts`, `messages`, `integration_logs`); PRD-102 (Edge Functions consomem); PRD-114 (Webhook handler usa `verifyWebhookSignature` e `parseInboundMessage`); PRD-115 (Envio); PRD-116 (Templates HSM); PRD-117 (Session 24h); PRD-118 (Status); PRD-120 (Failover) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | TS estrito; classe `MetaCloudProvider` em `src/providers/whatsapp/meta/MetaCloudProvider.ts`; helpers em arquivos auxiliares |

### Critérios de Complexidade

> **Justificativa de Alta:** integração com API externa de terceiro com múltiplos endpoints, formats próprios, rate limiting nuançado, regras de session 24h, HSM templates, HMAC signature, lifecycle de mídia (upload separado, ID temporário, download por ID). Erros têm semântica específica (24h window, template não aprovado, número não opted-in). Misconfig vaza dados ou bloqueia envio. Webhook signature validation tem que ser bulletproof (recebe payload do mundo).

---

## Contexto do Problema

PRD-111 entregou a interface `IWhatsAppProvider` + mock. Este PRD entrega a **implementação real para Meta Cloud API** — o caminho oficial recomendado pela Meta para acessar WhatsApp Business Platform.

Diferente de SDKs Twilio ou Stripe que abstraem muito, Meta Cloud API é REST puro com peculiaridades:
- **Bearer token** com escopo `whatsapp_business_messaging` + `whatsapp_business_management`
- **Phone Number ID** (não o número em si) identifica de qual número se está enviando
- **Templates HSM** precisam ser pré-aprovados pela Meta; texto livre só dentro da janela de 24h pós-mensagem do cliente
- **Mídia** tem fluxo de 2 passos: upload → recebe ID → envia mensagem referenciando ID
- **Webhook signature** com HMAC-SHA256 usando App Secret
- **Rate limits** por número (depende de tier de qualidade da conta)

---

## Conceito da Solução

### Estrutura

```
src/providers/whatsapp/meta/
├── MetaCloudProvider.ts        ← classe implementa IWhatsAppProvider
├── client.ts                    ← HTTP client para Meta Graph API
├── signature.ts                 ← validação HMAC
├── parser.ts                    ← parseInboundMessage / parseInboundStatus
├── mappers.ts                   ← Meta payload ↔ tipos normalizados
├── errors.ts                    ← mapeia erros Meta para AppError
├── constants.ts                 ← endpoints, versão da API
└── __tests__/
```

### Endpoints Cobertos (Meta Graph API v20.0+)

| Operação | Endpoint | Método |
|----------|----------|--------|
| Enviar mensagem | `/{phone_number_id}/messages` | POST |
| Upload de mídia | `/{phone_number_id}/media` | POST (multipart) |
| Download de mídia (URL) | `/{media_id}` | GET (retorna URL temporária) |
| Download de mídia (binário) | URL retornada acima | GET (com Bearer) |
| Healthcheck | `/{phone_number_id}` | GET (info do número) |

### Autenticação

```typescript
// Resolução de credenciais em runtime
async function getMetaCredentials(account: WhatsAppAccount): Promise<MetaCreds> {
  const creds = account.provider_credentials as MetaCredsRefs
  return {
    accessToken: await vault.resolve(creds.vaultRef_accessToken),
    phoneNumberId: creds.phoneNumberId,
    businessAccountId: creds.businessAccountId,
    appSecret: await vault.resolve(creds.appSecret_vaultRef),
    webhookVerifyToken: await vault.resolve(creds.vaultRef_webhookVerifyToken),
  }
}
```

Vault resolve via service_role (Edge Function). Provider em si nunca recebe segredo no construtor — resolve sob demanda.

### Validação HMAC do Webhook

```typescript
// signature.ts
import { createHmac, timingSafeEqual } from 'crypto'

export function verifyMetaWebhookSignature(rawBody: string, signature: string, appSecret: string): boolean {
  // signature vem como "sha256=abc123..."
  if (!signature?.startsWith('sha256=')) return false
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
```

`timingSafeEqual` é obrigatório — comparação ingênua vaza informação por timing attack.

### Parsing de Inbound

Meta envia payload aninhado em `entry[].changes[].value.messages[]` (mensagens) ou `entry[].changes[].value.statuses[]` (status). Parser navega isso e retorna `InboundMessage | InboundStatus` normalizado.

### Rate Limiting e Retry

Meta retorna `429` com header `X-Business-Use-Case-Usage`. Provider:
1. Captura header e atualiza métrica interna
2. Em 429, lança `AppError('RATE_LIMITED', 429, ...)` — caller decide retry com backoff
3. Não implementa retry automático no provider (responsabilidade do caller / queue)

### Integration Log

Toda chamada outbound registrada em `crm.integration_logs` via helper `withIntegrationLog` (PRD-102):
- `integration_name = 'whatsapp_meta'`
- `endpoint`, `request_payload` (sanitizado — sem PII além do necessário), `response_payload`, `http_status`, `latency_ms`, `error_message`, `trace_id`

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| SDK oficial da Meta | Não há SDK Node/Deno oficial maduro; REST direto é o padrão |
| `whatsapp-web.js` (biblioteca não-oficial via QR code) | Não-oficial, viola TOS, banido em uso comercial. Meta Cloud é oficial |
| Provider sem Vault (token direto no DB) | Vazamento crítico se DB acessado indevidamente |
| Retry automático no provider | Sem visibilidade do caller; melhor lançar e deixar queue/Edge retry |
| Cache de upload de mídia | Mídia tem TTL próprio na Meta; cache complica |

---

## Escopo

### Incluído

- ✅ Classe `MetaCloudProvider` em `src/providers/whatsapp/meta/MetaCloudProvider.ts` implementando `IWhatsAppProvider`
- ✅ HTTP client `client.ts` com Bearer auth, timeout, integration_log automático
- ✅ Validação HMAC `signature.ts` com `timingSafeEqual`
- ✅ Parser `parser.ts`: navega payload Meta e retorna `InboundMessage` ou `InboundStatus`
- ✅ Mappers para tipos normalizados (text, image, audio, video, document, location, contact, interactive responses)
- ✅ Mapeamento de erros Meta (`error.code`, `error.subcode`) para AppError
- ✅ Resolução de credenciais via Vault (Edge Function helper `vault.resolve`)
- ✅ `capabilities` configurada: `supportsTemplates=true`, `supportsInteractive=true`, `supportsMediaUpload=true`, `maxMessageLength=4096`, `maxMediaSizeBytes=16777216` (16MB)
- ✅ `sendText`, `sendMedia`, `sendTemplate`, `sendInteractive` implementados contra Graph API
- ✅ `uploadOutboundMedia` (2 passos: POST /media → recebe id)
- ✅ `downloadInboundMedia` (GET /media_id → URL → GET URL)
- ✅ `verifyWebhookSignature`, `parseInboundMessage`
- ✅ `healthCheck` (GET phone_number_id, retorna `healthy` se 200 + token válido)
- ✅ Integration log em toda chamada
- ✅ Testes unitários: parser com fixtures reais Meta; signature validation; mappers; error mapping
- ✅ Testes de integração (opt-in, contra Sandbox da Meta) — script manual + documentação
- ✅ Documentação `docs/dev/whatsapp-meta-provider.md`

### Excluído

- ❌ Lógica de session 24h window (PRD-117 — provider só envia; caller checa janela)
- ❌ Lógica de fallback de template (PRD-116 — provider só executa template informado)
- ❌ Retry automático com backoff (caller decide)
- ❌ Endpoint de gestão de templates (criar/aprovar template é workflow manual no Meta Business Manager — PRD-116 documenta processo)
- ❌ Suporte a Conversations API (Graph API v22+) — usar Cloud API estável
- ❌ Cobrança e billing por categoria de conversa (apenas registrar, análise em PRD-118/120)

---

## Requisitos Funcionais

### Inicialização e Credenciais

- **RF-001:** Construtor recebe `WhatsAppAccount` (objeto da tabela `crm.whatsapp_accounts`). Não recebe credenciais raw.
- **RF-002:** Credenciais resolvidas via `vault.resolve(vaultRef)` apenas quando necessário (sob demanda em cada operação ou cached por minuto na instância).
- **RF-003:** `providerName = 'meta'`; `capabilities` conforme conceito.
- **RF-004:** Versão da Meta Graph API fixada em constante (`API_VERSION = 'v20.0'` ou superior estável); endpoint base `https://graph.facebook.com/${API_VERSION}`.

### HTTP Client

- **RF-010:** `client.ts` expõe `metaRequest(method, path, body?, options?)` que:
  - Adiciona header `Authorization: Bearer <accessToken>`
  - Timeout 30s default (configurável por chamada)
  - Em 429: lança `AppError('RATE_LIMITED', 429, ..., { retryAfter })`
  - Em 4xx/5xx: lança `AppError` com código apropriado (via `mapMetaError`)
  - Logs via `withIntegrationLog('whatsapp_meta', ...)`
  - Inclui traceId no header `X-Trace-Id` (custom — Meta ignora)

### Envio de Texto

- **RF-020:** `sendText({ accountId, to, text, replyToMessageId, traceId })`:
  - Valida `to` no formato E.164 (regex)
  - Valida `text.length <= 4096`
  - POST `/{phone_number_id}/messages` com body:
    ```json
    {
      "messaging_product": "whatsapp",
      "recipient_type": "individual",
      "to": "<E.164 sem +>",
      "type": "text",
      "text": { "body": "<text>" },
      "context": { "message_id": "<replyToMessageId>" }  // opcional
    }
    ```
  - Retorna `{ providerMessageId: response.messages[0].id, status: 'sent' }`

### Envio de Mídia

- **RF-030:** `sendMedia({ accountId, to, mediaType, mediaId, caption?, filename?, traceId })`:
  - `mediaType ∈ {image, audio, video, document, sticker}`
  - Mídia já deve estar uploaded (ID via `uploadOutboundMedia`)
  - POST com body apropriado por tipo (`image: { id, caption }`, `document: { id, caption, filename }`)

### Upload de Mídia

- **RF-040:** `uploadOutboundMedia(file: Buffer, mimeType: string)`:
  - POST multipart `/{phone_number_id}/media` com fields: `messaging_product=whatsapp`, `file=<binary>`, `type=<mimeType>`
  - Retorna `{ mediaId: response.id }`
  - Valida tamanho < 16MB; valida `mimeType` na lista suportada Meta

### Download de Inbound Media

- **RF-050:** `downloadInboundMedia(mediaId)`:
  - GET `/{mediaId}` (Bearer) → recebe `{ url, mime_type, sha256, file_size }`
  - GET na `url` com Bearer → recebe binário
  - Retorna `{ buffer, mimeType, sha256, sizeBytes }`
  - **Importante:** URL é temporária (~5min); fluxo de receber webhook → baixar imediatamente → guardar em Storage (PRD-106) é responsabilidade do PRD-114

### Template (HSM)

- **RF-060:** `sendTemplate({ accountId, to, templateName, languageCode, components, traceId })`:
  - POST com body:
    ```json
    {
      "messaging_product": "whatsapp",
      "to": "<E.164>",
      "type": "template",
      "template": {
        "name": "<templateName>",
        "language": { "code": "<languageCode>" },
        "components": [...]
      }
    }
    ```
  - Se erro 132 (template não aprovado / não existe): mapeia para `AppError('TEMPLATE_NOT_FOUND', 422, ...)`
  - PRD-116 controla quais templates podem ser usados

### Mensagens Interativas

- **RF-070:** `sendInteractive({ accountId, to, type, body, buttons?, listItems?, traceId })`:
  - `type ∈ {button, list, cta_url}`
  - Construção do payload conforme spec Meta interactive
  - Retorna `SendResult` padrão

### Validação de Webhook

- **RF-080:** `verifyWebhookSignature(rawBody: string, signature: string)`:
  - Resolve `appSecret` via Vault
  - HMAC-SHA256 com `timingSafeEqual` (anti timing attack)
  - Retorna boolean

### Parsing de Inbound

- **RF-090:** `parseInboundMessage(rawPayload)`:
  - Navega `entry[0].changes[0].value`
  - Se `value.messages`: retorna `InboundMessage`
    - `contentType` derivado de `messages[0].type` (text/image/audio/video/document/location/contacts/interactive/button/reaction/order)
    - `text` para mensagens text + caption de mídia
    - `mediaId` para mídia
    - `fromPhone` = `messages[0].from` (em E.164 sem +)
    - `toAccountPhone` = `metadata.display_phone_number`
    - `providerMessageId` = `messages[0].id`
    - `accountId` resolvido pelo caller (parser não acessa DB)
  - Se `value.statuses`: retorna `InboundStatus`
  - Mensagens unsupported (e.g. `unknown` type): retorna InboundMessage com `contentType: 'unknown'` e payload bruto

### Healthcheck

- **RF-100:** `healthCheck()`:
  - GET `/{phone_number_id}?fields=display_phone_number,verified_name,quality_rating`
  - Retorna `{ status: 'healthy', details: { phoneNumber, qualityRating, ... } }` se 200
  - Senão `{ status: 'degraded'|'down', error: '...' }`

### Mapeamento de Erros Meta

- **RF-110:** Arquivo `errors.ts` mapeia códigos Meta para AppError:
  - `131026` (não-WhatsApp number) → `VALIDATION_ERROR 422 "Número não é WhatsApp"`
  - `131047` (reengagement template not allowed) → `TEMPLATE_REQUIRED 422 "Fora da janela de 24h, use template"`
  - `132` (template error) → `TEMPLATE_NOT_FOUND 422`
  - `190` (token inválido) → `UNAUTHORIZED 401`
  - `4`, `17`, `80007` (rate limit) → `RATE_LIMITED 429`
  - `100` (parameter inválido) → `VALIDATION_ERROR 422`
  - Outros → `INTEGRATION_ERROR 502` + log detalhado

### Integration Log

- **RF-120:** Toda chamada via `client.ts` registra em `crm.integration_logs`:
  - `integration_name='whatsapp_meta'`
  - `direction='outbound'`
  - `endpoint`, `http_status`, `latency_ms`, `trace_id`
  - `request_payload` e `response_payload` em JSONB **sanitizados** (truncar body grande > 10KB; remover access tokens se ainda houver)

### Testes

- **RF-130:** Testes unitários:
  - Parser com fixtures (text, image, audio, status delivered/read/failed, button reply, list reply)
  - Signature validation (válida, inválida, formato errado)
  - Mappers
  - Error mapping cobrindo principais códigos Meta
- **RF-131:** Testes integração (opt-in, contra Sandbox/Test Number Meta) — documentado em `docs/dev/whatsapp-meta-provider.md` com passo a passo

### Documentação

- **RF-140:** `docs/dev/whatsapp-meta-provider.md`:
  - Como obter access token e configurar Business Account
  - Schema esperado de `provider_credentials`
  - Endpoints e versão API
  - Lista de templates necessários (referenciado em PRD-116)
  - Tabela de mapeamento de erros
  - Troubleshooting comum

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança — token):** Access token nunca em log, response, console, nem header de erro retornado ao caller
- **RNF-002 (Segurança — HMAC):** `timingSafeEqual` obrigatório; testes cobrindo edge cases (empty, malformed)
- **RNF-003 (Performance):** sendText p95 < 800ms (Meta latência típica + nossa overhead); upload de mídia depende do tamanho
- **RNF-004 (Confiabilidade):** falha de rede vira AppError; nunca exception não-tratada
- **RNF-005 (Auditabilidade):** integration_log em 100% das chamadas
- **RNF-006 (Compatibilidade):** versão API fixada; bump explícito por PR
- **RNF-007 (Quota awareness):** rate limit headers parseados; métrica registrada

---

## Critérios de Aceitação

### RF-020: Envio de Texto Bem-sucedido

```gherkin
DADO uma whatsapp_account A1 (provider=meta) com credenciais válidas
QUANDO sendText({ accountId: A1, to: '+5555912345678', text: 'Olá' })
ENTÃO faz POST para Meta com payload correto
  E recebe response com message id
  E retorna { providerMessageId: '<id>', status: 'sent' }
  E integration_log registra a chamada
```

### RF-080 + RNF-002: HMAC Signature

```gherkin
DADO um payload rawBody e o appSecret correto
QUANDO assino com HMAC-SHA256: signature = 'sha256=' + hmac
  E chamo verifyWebhookSignature(rawBody, signature)
ENTÃO retorna true

QUANDO mudo um único byte do rawBody mantendo a signature antiga
ENTÃO retorna false

QUANDO passo signature malformada (sem 'sha256=' ou length errado)
ENTÃO retorna false (sem lançar exception)
```

### RF-090: Parser de Inbound

```gherkin
DADO um payload Meta válido de mensagem text recebida
QUANDO parseInboundMessage(payload)
ENTÃO retorna InboundMessage com type='message', contentType='text'
  E text contém o texto correto
  E fromPhone em E.164 sem +
  E providerMessageId presente

DADO payload de status 'read'
QUANDO parseInboundMessage(payload)
ENTÃO retorna InboundStatus com status='read', providerMessageId correto
```

### RF-110: Erro de Janela 24h

```gherkin
DADO um envio de texto livre para número que não enviou mensagem nas últimas 24h
QUANDO sendText é chamado
ENTÃO Meta retorna error code 131047
  E mapMetaError converte para AppError('TEMPLATE_REQUIRED', 422, 'Fora da janela de 24h, use template')
  E caller recebe AppError e pode decidir usar template (lógica PRD-117)
```

### RF-120: Integration Log

```gherkin
DADO qualquer chamada feita pelo provider Meta
QUANDO completa (sucesso ou erro)
ENTÃO existe linha em crm.integration_logs com:
  integration_name='whatsapp_meta'
  endpoint preenchido
  http_status preenchido
  latency_ms > 0
  trace_id presente
  E payload sanitizado (sem access token)
```

---

## Fases de Implementação

### Fase 1 — Client + Auth + Erros (1.5 dias)
- `client.ts`, auth, integration_log
- `errors.ts` mapeamento Meta
- Testes unitários de error mapping

### Fase 2 — Envio (text/media/template/interactive) (2 dias)
- sendText, sendMedia, sendTemplate, sendInteractive
- uploadOutboundMedia
- Validação de input
- Testes

### Fase 3 — Webhook (signature + parser) (1.5 dias)
- HMAC com timingSafeEqual
- Parser para todos os tipos
- Fixtures completas
- Testes unitários

### Fase 4 — Healthcheck + Download Media (1 dia)
- healthCheck
- downloadInboundMedia (2 passos)
- Capabilities consolidadas

### Fase 5 — Teste de Integração + Docs (1 dia)
- Sandbox Meta: enviar mensagem real ida e volta
- `docs/dev/whatsapp-meta-provider.md` completo
- `_DONE`

---

## Dependências

### PRDs
- **Depende de:** PRD-111 (interface), PRD-100 (Vault), PRD-101 (whatsapp_accounts schema, integration_logs), PRD-102 (Edge Functions context para resolver Vault — provider pode rodar em Edge Function ou no client se credentials estiverem disponíveis; recomendação: operações de envio via Edge Function privilegiada)
- **Bloqueia:** PRD-114, PRD-115, PRD-116, PRD-117, PRD-118, PRD-120

### Decisões Pendentes
- **Versão Meta Graph API:** v20.0 sugerido (estável em 2026); confirmar antes de implementar
- **Onde provider Meta roda:** Edge Function (recomendado, service_role pode resolver Vault) vs frontend (limitado, sem service_role)
- **Templates iniciais aprovados:** lista pré-aprovada pela Meta no negócio do cliente — confirmar com GALLO antes de PRD-116

---

## Considerações de Segurança

- **Access token e App Secret no Vault** apenas; nunca no código
- **HMAC com timingSafeEqual:** anti timing attack
- **URL temporária de mídia:** baixar imediatamente, salvar no Storage privado (PRD-106 + PRD-114)
- **Sanitização de log:** access token nunca em integration_logs ou Sentry
- **Webhook verify token:** comparação simples mas via env, não hardcoded
- **Rate limit headers:** monitorar para detectar uso abusivo ou downgrade de quality rating

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.2; CHANGELOG; renomear `PRD-112-meta-cloud-api-provider_DONE.md`; testes de integração Sandbox documentados.

| Princípio | Descrição |
|-----------|-----------|
| **timingSafeEqual sempre** | HMAC nunca com `===` |
| **URL de mídia é temporária** | Baixar e persistir imediatamente |
| **Erro 131047 = template** | Caller PRD-117 sabe o que fazer |
| **Versão da API fixada** | Não usar latest; bump explícito |
| **Vault em runtime** | Credencial nunca no construtor |

| ❌ Evitar |
|-----------|
| Token em código, log ou exception |
| HMAC ingênuo (timing attack) |
| Confiar que URL de mídia persiste |
| Retry automático sem visibilidade do caller |
| Usar API version variável (`v_LATEST`) |
| Skipar integration_log em "operações pequenas" |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO (com desvios documentados — ver nota no topo) |
| **Data** | 2026-06-10 |
| **Versão** | PR #53 (bump no merge) |
| **Por** | Claude Code CLI |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2a do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**
