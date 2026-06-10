# MetaCloudProvider — Meta WhatsApp Cloud API (PRD-112)

> Engine real do `IWhatsAppProvider` (PRD-111) para a Meta Cloud API.
> Código em `src/providers/whatsapp/meta/` — **runtime-agnostic** (só Web
> APIs e imports relativos), espelhável byte a byte para
> `supabase/functions/_shared/whatsapp/` nos PRDs 114/115.

## Versão da API

`v20.0`, **pinada** em `meta/constants.ts` (`META_GRAPH_BASE_URL`). Bump é PR
explícito — nunca `v_LATEST` (RNF-006).

## Credenciais e configuração

Nada de segredo no banco. A conta (`whatsapp_accounts`) carrega:

| Onde | O quê |
| --- | --- |
| `provider_config` (jsonb) | `{ "phoneNumberId": "...", "businessAccountId": "..." }` — não-secreto, CHECK da migration `20260610115402` |
| `credentials_ref` (text) | **Prefixo** dos secrets nas Edge Functions |

Secrets resolvidos em runtime via `deps.resolveSecret` (cache 60s em memória):

| Secret | Uso |
| --- | --- |
| `<ref>_ACCESS_TOKEN` | Bearer em toda chamada Graph (escopos `whatsapp_business_messaging` + `whatsapp_business_management`) |
| `<ref>_APP_SECRET` | HMAC-SHA256 do webhook (`X-Hub-Signature-256`) |
| `<ref>_VERIFY_TOKEN` | Handshake GET do webhook (PRD-114) |

Como obter: Meta Business Manager → app WhatsApp → System User token
(permanente) com os 2 escopos; App Secret em App Settings → Basic. O
`phoneNumberId` (≠ número) aparece em WhatsApp → API Setup.

## Construção

```ts
import { buildWhatsAppEngine } from "@/providers/whatsapp";

const provider = buildWhatsAppEngine({
  engine: "meta",
  accountId: account.id,
  providerConfig: account.providerConfig, // { phoneNumberId, businessAccountId }
  credentialsRef: account.credentialsRef, // ex.: WHATSAPP_META_MATRIZ
  deps: {
    resolveSecret: (name) => Promise.resolve(Deno.env.get(name)), // edge
    logIntegration: (entry) => insertIntegrationLog(entry),        // service client
  },
});
```

No app (browser) a factory **não** instancia este engine — segredos são
server-side; use `getEngineCapabilities("meta")` para superfícies read-only.

## Endpoints cobertos

| Operação | Endpoint |
| --- | --- |
| sendText / sendMedia / sendTemplate / sendInteractive | `POST /{phoneNumberId}/messages` |
| uploadOutboundMedia | `POST /{phoneNumberId}/media` (multipart; ≤16MiB, mime na lista de `constants.ts`) |
| downloadInboundMedia | `GET /{mediaId}` → URL temporária (~5min) → `GET <url>` com Bearer. **Persistir imediatamente** (Storage — PRD-114) |
| healthCheck | `GET /{phoneNumberId}?fields=display_phone_number,verified_name,quality_rating` (5s timeout, nunca lança) |

## Mapeamento de erros (RF-110)

| Código Meta | `WhatsAppProviderError.code` | HTTP | Semântica |
| --- | --- | --- | --- |
| 131026 | `VALIDATION_ERROR` | 422 | Número não é WhatsApp |
| 131047 | `TEMPLATE_REQUIRED` | 422 | **Fora da janela de 24h** — PRD-117 decide template |
| 132 / 132000–132999 | `TEMPLATE_NOT_FOUND` | 422 | Template inexistente/não aprovado |
| 190 | `UNAUTHORIZED` | 401 | Token inválido/expirado |
| 4, 17, 80007 ou HTTP 429 | `RATE_LIMITED` | 429 | `details.retryAfter` quando a Meta manda `Retry-After`; caller decide backoff (sem retry no provider) |
| 100 | `VALIDATION_ERROR` | 422 | Parâmetro inválido |
| demais | `INTEGRATION_ERROR` | 502 | `details.fbtraceId` para suporte Meta |

## Webhook

- `verifyWebhookSignature(rawBody, signature)` — HMAC-SHA256 do **corpo cru**
  com App Secret, comparação **constant-time** (`crypto.ts`). Secret ausente ⇒
  `false` (rejeita, nunca lança).
- `parseInboundMessage(rawPayload)` — navega `entry[].changes[].value`:
  `messages[]` → `IInboundMessage` (text, mídia c/ `mediaId`, location/contact,
  replies de botão/lista normalizados como `text`, tipos não suportados como
  `contentType: "unknown"`); `statuses[]` → `IInboundStatus`
  (sent/delivered/read/failed + `failureReason`).

## Auditoria e segurança

- Toda chamada loga via sink injetado → `public.integration_logs`
  (`integration_name='whatsapp_meta'`): endpoint, status, latência, traceId,
  payloads **sanitizados** (`sanitize.ts`: chaves token/secret/authorization
  redigidas, corpo truncado em 10KB). O access token só existe no header
  `Authorization` — nunca em log, erro ou resposta (RNF-001).
- Header `X-Business-Use-Case-Usage` exposto em `IMetaResponse.rateLimitUsage`
  (RNF-007 — métrica no PRD-120).

## Teste de integração (gated — Fase 5 do PRD)

Sem credenciais Meta da GALLO ainda (decisão pendente do índice da Onda 5).
Quando existirem:

1. Criar test number no painel WhatsApp → API Setup (ou usar o número real).
2. Setar secrets `WHATSAPP_META_<X>_ACCESS_TOKEN/_APP_SECRET/_VERIFY_TOKEN`.
3. Preencher `provider_config` da conta e validar o CHECK.
4. `sendText` para um número opted-in; conferir `wamid` e linha em
   `integration_logs`; responder e validar parse no webhook (PRD-114).

## Troubleshooting

| Sintoma | Causa provável |
| --- | --- |
| `UNAUTHORIZED` com nome do secret | Secret não setado nas Edge Functions (`credentials_ref` errado?) |
| `TEMPLATE_REQUIRED` ao mandar texto | Cliente não escreveu nas últimas 24h — usar HSM (PRDs 116/117) |
| Download de mídia 404 logo após webhook | URL temporária expirou (~5min) — baixar no handler, nunca depois |
| `RATE_LIMITED` recorrente | Quality rating caiu — conferir `healthCheck().detail` |
