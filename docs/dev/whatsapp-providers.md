# WhatsApp Providers — arquitetura (PRD-111)

> Fundação da Onda 5 (WhatsApp Real). Os PRDs 112 (Meta Cloud API) e 113
> (Evolution API) implementam contra a interface descrita aqui; os PRDs
> 114–120 (webhook, envio, templates, janela 24h, status, migração, failover)
> consomem só a abstração.

## Visão geral

```
src/providers/whatsapp/
├── IWhatsAppProvider.ts   # contrato único (envio, recepção, mídia, health)
├── types.ts               # tipos normalizados (I*) — fronteira canônica
├── factory.ts             # getWhatsAppProvider(accountId) + cache por conta
├── mock/MockWhatsAppProvider.ts  # engine sintético (default em mock)
├── factory.test.ts        # contrato + cache + RF-015
└── index.ts               # barrel público (@/providers/whatsapp)
```

- **Factory por conta, não singleton:** cada linha de `whatsapp_accounts`
  carrega o próprio `provider` — duas lojas podem operar Meta e Evolution em
  paralelo. Instâncias são cacheadas por `accountId` (providers são stateless
  por contrato); `invalidateWhatsAppProviderCache(accountId?)` derruba o cache
  após trocar `provider`/`provider_config`.
- **Resolução do engine:** `VITE_WHATSAPP_PROVIDER=mock` **ou** fonte de dados
  ativa `mock` (default do build) → `MockWhatsAppProvider` para qualquer id.
  Fonte `supabase` → lookup da conta (RLS se aplica) e engine do `provider`;
  até os PRDs 112/113, `meta`/`evolution` lançam `NotImplementedError`
  apontando o PRD que os implementa (mesmo padrão de staging dos data
  providers da Fase 2).
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
| `verifyWebhookSignature(rawBody, signature)` | Validação criptográfica/token do webhook (PRD-114). Sem side effects. |
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
browser. A implementação edge dos engines (PRDs 112/113) seguirá este mesmo
contrato em `supabase/functions/_shared/whatsapp/` (decisão de layout no
PRD-112). No app, a factory existe para o modo mock (desenvolvimento/testes)
e para superfícies read-only (capabilities, health do dashboard).

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

## Capabilities de referência (valores esperados nos PRDs 112/113)

| Capability | Meta Cloud | Evolution | Mock |
| --- | --- | --- | --- |
| `supportsTemplates` (HSM) | ✅ | ❌ | ✅ |
| `supportsInteractive` | ✅ | parcial (depende da versão) | ✅ |
| `supportsMediaUpload` | ✅ | ✅ | ✅ |
| `supportsStatusReadReceipts` | ✅ | ✅ | ✅ |
| `supportsCustomWebhook` | ❌ | ✅ | ✅ |
| `maxMessageLength` | 4096 | ~65k | 4096 |
| `maxMediaSizeBytes` | 16 MiB | configurável (VPS) | 16 MiB |

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
