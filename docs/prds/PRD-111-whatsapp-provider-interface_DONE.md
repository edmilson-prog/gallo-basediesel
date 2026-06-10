# PRD-111: WhatsApp Provider Interface

> ✅ **STATUS (2026-06-10): CONCLUÍDO com ressalvas.**
>
> **Entregue:** `src/providers/whatsapp/` — interface `IWhatsAppProvider` + tipos normalizados (prefixo `I`, convenção do repo), `MockWhatsAppProvider` completo (RF-020..024), factory `getWhatsAppProvider(accountId)` com cache por conta + `invalidateWhatsAppProviderCache` (RF-010..015), barrel `@/providers/whatsapp`, 15 testes Vitest (contrato + cache + gate mock), env `VITE_WHATSAPP_PROVIDER` documentado, migration `20260610115402_whatsapp_111_provider_config` (coluna `provider_config` jsonb + CHECK de shape por provider, espelhada no Git) e `docs/dev/whatsapp-providers.md`.
>
> **Desvios conscientes (detalhados no doc dev):** (1) schema `public`/client único — não existe `crm`/`crmClient`; (2) `provider_credentials` → **`provider_config` (config não-secreta) + `credentials_ref` (nome do secret nas Edge Functions)** — segredos nunca no banco, padrão da casa; (3) sem `ProviderFactory` central (RF-040 adaptado para o barrel); (4) engines reais `meta`/`evolution` lançam `NotImplementedError` até os PRDs 112/113 (staging idêntico ao da Fase 2); (5) implementação edge dos engines definirá layout em `supabase/functions/_shared/whatsapp/` no PRD-112.

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/whatsapp/`_ |
| **Objetivo** | Consolidar a interface `IWhatsAppProvider` abstrata que normaliza o contrato de comunicação com WhatsApp, independente de qual provider concreto (Meta Cloud API ou Evolution API) está em uso. Factory por conta (`IWhatsAppAccount.provider`) escolhe a implementação. Esta é a fundação do Provider Pattern aplicado a WhatsApp — PRDs 112 (Meta) e 113 (Evolution) implementam contra esta interface, e os PRDs 114-120 consomem |
| **Tipo** | Feature |
| **Complexidade** | Média |
| **Total de Fases** | 3 |
| **Prioridade** | P0 — bloqueia toda a Onda 5 |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-005 Fase 1 (Provider Pattern — esqueleto IWhatsAppProvider); PRD-011 Fase 1 (Conversa Multicanal — consumidor); PRD-101 (Schema — `crm.whatsapp_accounts.provider`); PRD-112 (Meta Cloud API); PRD-113 (Evolution API); PRD-114 (Webhook unificado); PRD-115 (Envio); PRD-119 (Migração de stubs) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | TS estrito; pasta `src/providers/whatsapp/`; interface em `src/providers/whatsapp/IWhatsAppProvider.ts`; factory em `factory.ts` |

### Critérios de Complexidade

> **Justificativa de Média:** interface bem definida pra cobrir 2 providers heterogêneos (Meta tem rate limits, templates HSM, business account ID; Evolution roda em VPS própria com modelo diferente) sem vazar especificidades de cada. Trade-off entre "interface lowest common denominator" (simples mas perde recursos) vs "interface rica com optional capabilities" (flexível mas mais complexa). Decisão errada empurra refactor em todos os PRDs 112-120.

---

## Contexto do Problema

A Fase 1 modelou `IWhatsAppAccount` com campo `provider: 'meta' | 'evolution'` (PRD-007 Multistore + PRD-011 Conversa). O PRD-101 materializou a tabela `crm.whatsapp_accounts`. Mas hoje:
- Não existe contrato unificado para enviar/receber mensagens
- Cada feature do `/app` que precisa de WhatsApp acabaria reimplementando lógica do provider
- Trocar entre Meta e Evolution em tempo de execução é teórico — sem interface, é trocar implementação grande

Este PRD entrega a abstração que torna tudo isso real. Após este PRD, PRD-112 (Meta) e PRD-113 (Evolution) **implementam contra a mesma interface**. PRDs 114-120 consomem sem se preocupar com provider concreto.

---

## Conceito da Solução

### Interface `IWhatsAppProvider`

```typescript
// src/providers/whatsapp/IWhatsAppProvider.ts
export interface IWhatsAppProvider {
  readonly providerName: 'meta' | 'evolution'

  // ===== Envio =====
  sendText(input: SendTextInput): Promise<SendResult>
  sendMedia(input: SendMediaInput): Promise<SendResult>
  sendTemplate(input: SendTemplateInput): Promise<SendResult>          // HSM (PRD-116)
  sendInteractive(input: SendInteractiveInput): Promise<SendResult>    // botões/lista

  // ===== Recepção (utilities para webhook) =====
  verifyWebhookSignature(rawBody: string, signature: string): boolean
  parseInboundMessage(rawPayload: unknown): InboundMessage | InboundStatus

  // ===== Mídia =====
  downloadInboundMedia(mediaId: string): Promise<MediaDownloadResult>
  uploadOutboundMedia(file: File | Buffer, mimeType: string): Promise<{ mediaId: string }>

  // ===== Health =====
  healthCheck(): Promise<HealthCheckResult>

  // ===== Capabilities (opcional — pode variar por provider) =====
  readonly capabilities: ProviderCapabilities
}

export interface ProviderCapabilities {
  supportsTemplates: boolean
  supportsInteractive: boolean
  supportsMediaUpload: boolean
  supportsStatusReadReceipts: boolean    // delivered/read
  supportsCustomWebhook: boolean         // Evolution permite custom; Meta não
  maxMessageLength: number               // 4096 Meta, ~65k Evolution
  maxMediaSizeBytes: number              // 16MB Meta, configurável Evolution
}
```

### Tipos Normalizados

```typescript
export interface SendTextInput {
  accountId: string                // crm.whatsapp_accounts.id
  to: string                       // E.164: +5555912345678
  text: string
  replyToMessageId?: string        // se respondendo a inbound
  traceId?: string
}

export interface SendResult {
  providerMessageId: string        // meta_message_id ou evolution id
  status: 'queued' | 'sent'
  estimatedDeliveryAt?: string
}

export interface InboundMessage {
  type: 'message'
  providerMessageId: string
  fromPhone: string
  toAccountPhone: string
  accountId: string                // resolvido a partir do toAccountPhone
  contentType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'contact'
  text?: string
  mediaId?: string                 // para download via downloadInboundMedia
  mediaCaption?: string
  timestamp: string                // ISO 8601
  rawPayload: unknown              // original (para audit)
}

export interface InboundStatus {
  type: 'status'
  providerMessageId: string        // referencia o id de uma outbound prévia
  status: 'sent' | 'delivered' | 'read' | 'failed'
  failureReason?: string
  timestamp: string
}

// ... outros (SendMediaInput, SendTemplateInput, MediaDownloadResult, HealthCheckResult)
```

### Factory por Conta

```typescript
// src/providers/whatsapp/factory.ts
import { MetaCloudProvider } from './meta/MetaCloudProvider'
import { EvolutionProvider } from './evolution/EvolutionProvider'
import { crmClient } from '@/providers/supabase/clients'

const cache = new Map<string, IWhatsAppProvider>()

export async function getWhatsAppProvider(accountId: string): Promise<IWhatsAppProvider> {
  if (cache.has(accountId)) return cache.get(accountId)!

  const { data: account, error } = await crmClient
    .from('whatsapp_accounts')
    .select('id, provider, phone_number, provider_credentials')
    .eq('id', accountId)
    .single()

  if (error || !account) throw new AppError('NOT_FOUND', 404, 'Conta WhatsApp não encontrada')

  const provider = account.provider === 'meta'
    ? new MetaCloudProvider(account)
    : new EvolutionProvider(account)

  cache.set(accountId, provider)
  return provider
}
```

### Princípios da Interface

| Princípio | Decisão |
|-----------|---------|
| **Lowest common denominator + capabilities** | Métodos básicos em todos; capabilities flagam opcionais (Templates HSM são só Meta, por exemplo) |
| **Tipos normalizados** | Payload bruto fica em `rawPayload` para auditoria; consumidores usam tipos canônicos |
| **Identifiers consistentes** | Sempre `providerMessageId` (não `meta_message_id` específico) |
| **traceId propagation** | Toda chamada aceita traceId para correlação |
| **Failure handling** | Erros sempre via `AppError`; provider-specific errors mapeados |

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Interface separada por provider (sem abstração) | Consumidores teriam que conhecer cada um — anula benefício do Provider Pattern |
| Apenas Meta no MVP, deixar Evolution para depois | Cliente já usa Evolution em algumas linhas comerciais; suporte desde dia 1 era requisito |
| Interface mínima (só send + receive) | Mídia, status, templates ficam em ar; PRDs 115-118 reimplementariam |
| Capabilities sempre dinâmicas (query a cada uso) | Adiciona latência; provider sabe estaticamente o que suporta |
| Adapter pattern em vez de Provider | Pattern semanticamente equivalente; nomenclatura "Provider" mantém consistência com PRD-005 |

---

## Escopo

### Incluído

- ✅ Interface `IWhatsAppProvider` em `src/providers/whatsapp/IWhatsAppProvider.ts`
- ✅ Tipos normalizados: `SendTextInput`, `SendMediaInput`, `SendTemplateInput`, `SendInteractiveInput`, `SendResult`, `InboundMessage`, `InboundStatus`, `MediaDownloadResult`, `HealthCheckResult`, `ProviderCapabilities`
- ✅ Factory `getWhatsAppProvider(accountId)` com cache em memória
- ✅ Mock provider `MockWhatsAppProvider` em `src/providers/whatsapp/mock/` — implementa interface retornando dados sintéticos para desenvolvimento e testes
- ✅ Atualização do `ProviderFactory` central (PRD-104) para expor `getWhatsAppProvider`
- ✅ Atualização da tabela `crm.whatsapp_accounts.provider_credentials` esquema documentado (Vault refs por provider)
- ✅ Testes unitários da factory e do mock provider
- ✅ Documentação `docs/dev/whatsapp-providers.md`: arquitetura, como adicionar novo provider futuro, contrato de cada método

### Excluído

- ❌ Implementação Meta Cloud API (vai no PRD-112)
- ❌ Implementação Evolution API (vai no PRD-113)
- ❌ Webhook handler (vai no PRD-114)
- ❌ Lógica de session 24h window (vai no PRD-117)
- ❌ Lógica de templates HSM aprovados (PRD-116)
- ❌ Status tracking detalhado (PRD-118)
- ❌ Failover automático entre providers (PRD-120)

---

## Requisitos Funcionais

### Interface

- **RF-001:** Arquivo `src/providers/whatsapp/IWhatsAppProvider.ts` define a interface conforme conceito acima. TypeScript estrito (sem `any`).
- **RF-002:** Tipos `SendTextInput`, `SendMediaInput`, `SendTemplateInput`, `SendInteractiveInput`, `InboundMessage`, `InboundStatus`, `MediaDownloadResult`, `HealthCheckResult`, `ProviderCapabilities` em arquivos auxiliares ou `types.ts` no mesmo diretório.
- **RF-003:** `providerName: 'meta' | 'evolution'` é union literal (não enum). Adicionar novo provider futuro requer extender union — propositalmente explícito.
- **RF-004:** `capabilities` é readonly e fixo por instância — provider sabe estaticamente o que suporta.

### Factory

- **RF-010:** `getWhatsAppProvider(accountId): Promise<IWhatsAppProvider>` em `src/providers/whatsapp/factory.ts`.
- **RF-011:** Lê `provider` e `provider_credentials` de `crm.whatsapp_accounts` via `crmClient`.
- **RF-012:** Cache em memória por `accountId` (instância reutilizada — providers são stateless por contrato).
- **RF-013:** Cache invalidado em: mudança de `provider` ou `provider_credentials` (via Realtime PRD-105 ou refresh manual).
- **RF-014:** Erro claro se conta não existe ou está inativa: `AppError('NOT_FOUND', 404, 'Conta WhatsApp não encontrada ou inativa')`.
- **RF-015:** Se `VITE_DATA_SOURCE=mock` ou env `VITE_WHATSAPP_PROVIDER=mock`, factory retorna `MockWhatsAppProvider` para qualquer accountId.

### MockWhatsAppProvider

- **RF-020:** Implementação completa da interface retornando dados sintéticos.
- **RF-021:** `sendText` retorna `{ providerMessageId: 'mock-<uuid>', status: 'sent' }` sem fazer chamada externa.
- **RF-022:** `parseInboundMessage` aceita payload mock-formatado.
- **RF-023:** `healthCheck` sempre retorna healthy.
- **RF-024:** `capabilities` retorna todas as features como `true`.

### Tabela `crm.whatsapp_accounts.provider_credentials` — Schema Documentado

- **RF-030:** Para `provider='meta'`, `provider_credentials` deve ter formato:
  ```json
  {
    "vaultRef_accessToken": "meta_whatsapp_access_token",
    "businessAccountId": "...",
    "phoneNumberId": "...",
    "vaultRef_webhookVerifyToken": "meta_whatsapp_webhook_verify_token",
    "appSecret_vaultRef": "meta_whatsapp_app_secret"
  }
  ```
- **RF-031:** Para `provider='evolution'`, formato:
  ```json
  {
    "baseUrl": "https://evo.gallodiesel.com.br",
    "vaultRef_apiKey": "evolution_api_key",
    "instanceName": "gallo-matriz"
  }
  ```
- **RF-032:** Constraint CHECK no schema (RF-021 do PRD-101 — adicionar via migration aditiva se necessário) que valida estrutura mínima esperada por provider.
- **RF-033:** Documentação detalhada em `docs/dev/whatsapp-providers.md`.

### Provider Factory Central (Update)

- **RF-040:** `src/providers/ProviderFactory.ts` (do PRD-104) ganha método `getWhatsAppProvider(accountId)` que delega para `whatsapp/factory.ts`.
- **RF-041:** Consumidores (componentes, hooks, Edge Functions) usam sempre via factory central.

### Testes

- **RF-050:** Testes unitários para factory: cache funciona; troca de provider invalida cache; conta inexistente retorna AppError.
- **RF-051:** Testes para MockWhatsAppProvider: todos os métodos retornam tipos corretos.
- **RF-052:** Teste de type-safety: arquivo `.test.ts` que tenta consumir provider via `IWhatsAppProvider` — `tsc` deve passar sem casts.

### Documentação

- **RF-060:** `docs/dev/whatsapp-providers.md`: arquitetura, decisões, schema de `provider_credentials` por provider, como criar nova implementação (template baseado em mock), capabilities reference.

---

## Requisitos Não-Funcionais

- **RNF-001 (Type safety):** `tsc` sem warnings; nenhum `any` na interface.
- **RNF-002 (Performance — factory):** cache hit < 1ms; cache miss (query DB) < 50ms.
- **RNF-003 (Extensibilidade):** adicionar novo provider futuro (ex: Twilio) exige apenas: criar pasta, implementar interface, ajustar union literal, factory.
- **RNF-004 (Manutenibilidade):** interface estável; mudanças quebrando exigem PR com revisão dos PRDs 112-120 impactados.
- **RNF-005 (Segurança):** factory nunca expõe credenciais (apenas vault refs no objeto credentials passado ao provider — provider resolve internamente).

---

## Critérios de Aceitação

### RF-010 + RF-012: Factory Retorna Provider Correto

```gherkin
DADO uma whatsapp_account A1 com provider='meta'
QUANDO getWhatsAppProvider(A1) é chamado
ENTÃO retorna instância de MetaCloudProvider
  E providerName retornado é 'meta'

QUANDO chamado novamente para A1
ENTÃO retorna a MESMA instância (cache hit)
```

### RF-014: Erro Claro para Conta Inválida

```gherkin
DADO accountId X que não existe em crm.whatsapp_accounts
QUANDO getWhatsAppProvider(X) é chamado
ENTÃO lança AppError com code='NOT_FOUND' e httpStatus=404
  E mensagem "Conta WhatsApp não encontrada ou inativa"
```

### RF-020 + RF-024: Mock Implementa Interface

```gherkin
DADO VITE_WHATSAPP_PROVIDER=mock
QUANDO getWhatsAppProvider(qualquer-id) é chamado
ENTÃO retorna MockWhatsAppProvider
  E capabilities tem todos os campos true
  E sendText retorna { providerMessageId: 'mock-...', status: 'sent' } sem chamar API externa
```

### RF-002 + RNF-001: Type Safety

```gherkin
DADO tsc rodando no projeto
QUANDO compila src/providers/whatsapp/**
ENTÃO zero erros, zero warnings
  E nenhum uso de any
  E todos os métodos da interface têm assinatura completa
```

---

## Fases de Implementação

### Fase 1 — Interface + Tipos (meio dia)
- `IWhatsAppProvider.ts` + tipos auxiliares
- `ProviderCapabilities` documentada
- Testes de type-safety

### Fase 2 — Factory + Mock (1 dia)
- `factory.ts` com cache
- `MockWhatsAppProvider`
- Integração ao ProviderFactory central
- Testes unitários

### Fase 3 — Docs + Handoff (meio dia)
- `docs/dev/whatsapp-providers.md`
- Demo: trocar provider via env, ver factory escolher correto
- `_DONE`

---

## Dependências

### PRDs
- **Bloqueia:** PRD-112, PRD-113, PRD-114, todas as Onda 5
- **Depende de:** PRD-005 Fase 1 (Provider Pattern), PRD-101 (`crm.whatsapp_accounts`), PRD-104 (ProviderFactory central), PRD-103 (RLS — provider lê whatsapp_accounts respeitando policies)

### Decisões Pendentes
- **Capabilities como readonly fixo vs dinâmico:** sugerido readonly fixo (provider declara estaticamente)
- **Cache TTL na factory:** sugerido sem TTL (invalidação por mudança explícita); avaliar se causa stale credentials
- **Adicionar Twilio futuro:** apenas se cliente solicitar — fora do MVP

---

## Considerações de Segurança

- **Credenciais nunca no código:** factory lê vault refs, provider resolve com service_role apenas em runtime
- **Provider sem state compartilhado:** instâncias separadas por conta evitam vazamento entre contas
- **RLS protege whatsapp_accounts:** factory respeita policies (RF-014 implícito)
- **Logs sanitizados:** factory não loga credenciais (consistente com PRD-110)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.1; CHANGELOG; renomear `PRD-111-whatsapp-provider-interface_DONE.md`; documentação completa.

| Princípio | Descrição |
|-----------|-----------|
| **Interface estável** | Mudança aqui = refactor em PRDs 112-120 |
| **Capabilities flagam diferenças** | Sem if (provider==='meta') em consumidores |
| **Mock primeiro** | Implementação mock vem antes para destravar testes |
| **Factory por conta** | Não singleton — cada conta pode usar provider diferente |

| ❌ Evitar |
|-----------|
| Métodos específicos de Meta na interface base |
| `any` em qualquer assinatura |
| Vazar credenciais via logs |
| Cache sem invalidação |
| Singleton global (cada conta é independente) |
| Mock que diverge do contrato real |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO (com ressalvas — ver nota no topo) |
| **Data** | 2026-06-10 |
| **Versão** | pós-v0.75.0 (bump da Onda 5 ao fechar o bloco) |
| **Por** | Claude Code (AILA) |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 27/05/2026 | v1 | Criação inicial — Sub-lote 2a do Lote 2 (Onda 5) |

---

**AILA - Sistemas Inteligentes**
