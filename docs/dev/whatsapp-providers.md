# WhatsApp Providers — arquitetura (PRDs 111/112/113)

> Fundação da Onda 5 (WhatsApp Real). O PRD-111 definiu a interface; os PRDs
> 112 (Meta Cloud API) e 113 (Evolution API) entregaram os engines reais; os
> PRDs 114–120 (webhook, envio, templates, janela 24h, status, migração,
> failover) consomem só a abstração.

## Visão geral

```
src/providers/whatsapp/
├── IWhatsAppProvider.ts   # contrato único (envio, recepção, mídia, health)
├── types.ts               # tipos normalizados (I*) + deps/configs de engine
├── errors.ts              # WhatsAppProviderError (code + httpStatus)
├── phone.ts               # E.164 (assertE164/toWireNumber/toE164)
├── crypto.ts              # HMAC-SHA256 (Web Crypto) + constant-time compare
├── sanitize.ts            # redação de segredos + truncamento p/ logs (10KB)
├── http.ts                # ciclo compartilhado: timeout 30s, latência, log sink
├── build.ts               # buildWhatsAppEngine(row + deps) — puro, server-side
├── factory.ts             # getWhatsAppProvider(accountId) + cache por conta (app)
├── meta/                  # MetaCloudProvider (PRD-112): client, signature,
│                          #   parser, errors, constants + testes
├── evolution/             # EvolutionProvider (PRD-113): client, parser,
│                          #   errors, constants + testes
├── mock/MockWhatsAppProvider.ts  # engine sintético (default em mock)
├── factory.test.ts        # contrato + cache + RF-015
└── index.ts               # barrel público (@/providers/whatsapp)
```

**Regra de ouro da camada: runtime-agnostic.** Todo arquivo usa só Web APIs
(`fetch`, `crypto.subtle`, `FormData`) e **imports relativos** — sem
`import.meta.env`, sem `@/`, sem Deno/Node APIs (exceções: `factory.ts`, que é
app-side, e os testes). Dependências de ambiente entram **injetadas**
(`IEngineDeps`: `resolveSecret`, `logIntegration`, `fetchFn`). Por isso o
mesmo código roda nos testes Vitest e será espelhado byte a byte em
`supabase/functions/_shared/whatsapp/` nos PRDs 114/115 (decisão de layout
que o PRD-112 resolveu).

- **Factory por conta, não singleton:** cada linha de `whatsapp_accounts`
  carrega o próprio `provider` — duas lojas podem operar Meta e Evolution em
  paralelo. Instâncias são cacheadas por `accountId` (providers são stateless
  por contrato); `invalidateWhatsAppProviderCache(accountId?)` derruba o cache
  após trocar `provider`/`provider_config`.
- **Resolução do engine:** `VITE_WHATSAPP_PROVIDER=mock` **ou** fonte de dados
  ativa `mock` (default do build) → `MockWhatsAppProvider` para qualquer id.
  Fonte `supabase` → lookup da conta (RLS se aplica); para `meta`/`evolution`
  a factory **do app** lança `WhatsAppProviderError('NOT_SUPPORTED', 501)`:
  os engines reais exigem secrets e rodam **server-side** — Edge Functions os
  instanciam via `buildWhatsAppEngine` (PRDs 114/115). Superfícies read-only
  do app usam `getEngineCapabilities(engine)` (matriz estática, sem segredo).
- **Capabilities, não if-por-provider:** consumidores ramificam por
  `provider.capabilities.supportsTemplates` etc., nunca por
  `providerName === 'meta'`.
- **Tipos normalizados na fronteira:** payload bruto do provider só existe em
  `rawPayload` (auditoria). Identificador canônico é `providerMessageId`.
  Todo envio aceita `traceId` (correlação PRD-110).

## Contrato (resumo por método)

| Método | Contrato |
| --- | --- |
| `sendText/sendMedia/sendTemplate/sendInteractive` | Recebem input normalizado, retornam `ISendResult { providerMessageId, status: 'queued'\|'sent' }`. Erros sempre via throw (nunca result de erro). |
| `verifyWebhookSignature(rawBody, signature)` | **Async** (Web Crypto HMAC). Validação criptográfica/token do webhook (PRD-114), comparação constant-time. Nunca lança — input inválido ⇒ `false`. |
| `parseInboundMessage(rawPayload)` | Normaliza para `IInboundMessage` ou `IInboundStatus`; **lança** em payload irreconhecível. |
| `downloadInboundMedia(mediaId)` | Bytes + mime do objeto de mídia do provider. |
| `uploadOutboundMedia(data, mimeType)` | Sobe mídia, retorna `{ mediaId }` para usar em `sendMedia`. |
| `healthCheck()` | Probe leve; insumo do failover (PRD-120). Nunca lança — reporta `healthy: false`. |
| `capabilities` | Matriz estática readonly (RF-004). |

## Configuração por conta (`whatsapp_accounts`)

| Coluna | Papel |
| --- | --- |
| `provider` | Engine: `meta` \| `evolution`. |
| `provider_config` (jsonb, migration `20260610115402`) | Config **não-secreta** do engine. CHECK garante o shape mínimo por provider. |
| `credentials_ref` (text) | **Nome do secret** nas Edge Functions que completa a config (o "Vault" da casa — padrão `RESEND_API_KEY`). Nunca o segredo em si. |

Shapes do `provider_config`:

```jsonc
// provider = 'meta'
{ "phoneNumberId": "1234567890", "businessAccountId": "9876543210" }

// provider = 'evolution'
{ "baseUrl": "https://evo.gallodiesel.com.br", "instanceName": "gallo-matriz" }
```

> ⚠️ **Desvio documentado do PRD-111 (RF-030/031):** o PRD modela um
> `provider_credentials` jsonb com vault refs. A casa mantém **segredos fora
> do banco** — eles vivem como secrets das Edge Functions; o jsonb guarda só
> config não-secreta e `credentials_ref` nomeia o secret. Mesma garantia
> (RNF-005), menos superfície.

## Onde o engine real roda

O envio/recepção REAL (tokens Meta, apiKey Evolution) acontece **server-side
nas Edge Functions** (webhook PRD-114, envio PRD-115) — segredos jamais no
browser. Os engines (PRDs 112/113) vivem em `src/providers/whatsapp/{meta,evolution}/`
como código runtime-agnostic; os PRDs 114/115 os espelham em
`supabase/functions/_shared/whatsapp/` no deploy, injetando
`resolveSecret: (n) => Deno.env.get(n)` e um `logIntegration` que grava em
`public.integration_logs` (service_role; tabela da migration
`20260610122110` — RLS owner-only read, sem write policies). No app, a
factory existe para o modo mock (desenvolvimento/testes) e para superfícies
read-only (`getEngineCapabilities`).

## Como adicionar um provider novo (ex.: Twilio — fora do MVP)

1. Ampliar a union `WhatsAppProviderEngine` em `types.ts` (RF-003 — explícito
   de propósito).
2. Criar `src/providers/whatsapp/twilio/TwilioProvider.ts` implementando
   `IWhatsAppProvider` (use o `MockWhatsAppProvider` como template do shape de
   cada método).
3. Adicionar o case na factory (`factory.ts`).
4. Definir o shape de `provider_config` + atualizar o CHECK
   (`whatsapp_accounts_provider_config_shape`) via migration aditiva.
5. Documentar capabilities aqui e cobrir com testes de contrato.

## Capabilities entregues (PRDs 112/113 — valores reais dos engines)

| Capability | Meta Cloud | Evolution | Mock |
| --- | --- | --- | --- |
| `supportsTemplates` (HSM) | ✅ | ❌ (`sendTemplate` lança `NOT_SUPPORTED`) | ✅ |
| `supportsInteractive` | ✅ (buttons ≤3, list ≤10) | ❌ (`sendInteractive` lança `NOT_SUPPORTED`) | ✅ |
| `supportsMediaUpload` | ✅ (2 passos) | ❌ — mídia vai por **URL** em `sendMedia` | ✅ |
| `supportsStatusReadReceipts` | ✅ | ✅ (acks Baileys) | ✅ |
| `supportsCustomWebhook` | ❌ | ✅ | ✅ |
| `maxMessageLength` | 4096 | 65536 | 4096 |
| `maxMediaSizeBytes` | 16 MiB | 64 MiB (configurável na VPS) | 16 MiB |

Detalhes por engine: `docs/dev/whatsapp-meta-provider.md` e
`docs/dev/whatsapp-evolution-provider.md`.

## Desvios do PRD-111 (registrados)

1. **Schema `public`**, não `crm`; client único `getSupabaseClient()` — não
   existe `crmClient` (realidade da Fase 2 desde o PRD-101).
2. **`provider_config` + `credentials_ref`** no lugar de
   `provider_credentials` (ver acima).
3. **Sem `ProviderFactory` central** — o PRD-104 real não criou esse agregador;
   o acesso é pelo barrel `@/providers/whatsapp` (RF-040 adaptado).
4. **Prefixo `I` nos tipos** (`ISendTextInput`, …) — convenção do repositório.
5. **Erro de conta:** classe própria `WhatsAppAccountNotFoundError` (não há
   `AppError` no repo); mensagem pt-BR idêntica à do PRD.
6. **`verifyWebhookSignature` é async** (ajuste dos PRDs 112/113, mesmo PR):
   o HMAC usa Web Crypto (`crypto.subtle`), que é assíncrono. Engines também
   ganharam `InboundContentType: "unknown"` (PRD-112 RF-090) e o erro comum
   `WhatsAppProviderError` em `errors.ts`.
