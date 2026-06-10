# PRD-113: Evolution API Provider

> ✅ **STATUS (2026-06-10): CONCLUÍDO** — engine `EvolutionProvider` entregue em
> `src/providers/whatsapp/evolution/` (client `apikey`, sendText/sendMedia por
> URL, healthCheck via connectionState, parser `messages.upsert`/`update`,
> `PROVIDER_DISCONNECTED` 503, HSM/interactive lançando `NOT_SUPPORTED` 422)
> com 22 testes Vitest. Desvios registrados em
> `docs/dev/whatsapp-evolution-provider.md`: **(1)** mesmo modelo de secrets
> do PRD-112 (`<ref>_API_KEY` obrigatório, `<ref>_WEBHOOK_SECRET` opcional —
> sem secret, webhook confia no IP allowlist do PRD-114); **(2)**
> `supportsMediaUpload=false` (PRD dizia `true`): Evolution não tem upload
> separado — mídia vai por URL, `uploadOutboundMedia` lança `NOT_SUPPORTED`;
> **(3)** healthCheck tri-state do PRD colapsado no contrato booleano do
> PRD-111 (`healthy` + `detail: "state: ..."`); **(4)** `integration_logs` em
> `public` (migration `20260610122110`); **(5)** teste de integração **gated**
> — decisão da VPS (AILA × GALLO) pendente com Edmilson. Bump v2.1.0-rc.3 do
> PRD não se aplica (SemVer 0.x próprio — bump no merge do PR #53).

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/whatsapp/evolution/`_ |
| **Objetivo** | Implementação alternativa do `IWhatsAppProvider` para Evolution API (open-source, hospedada em VPS própria). Provider sem janela de 24h, sem templates HSM, ideal para contas em processo de homologação Meta ou como fallback quando Meta tem incidente. Capabilities reduzidas vs Meta (sem HSM, sem interactive nativo aprovado pelo WhatsApp), mas com fluxo mais simples |
| **Tipo** | Integração |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — alternativa primária para contas não-Meta |
| **Épico** | Onda 5 — WhatsApp Real (v2.1.0 Bridge) |
| **PRDs Relacionados** | PRD-111 (interface); PRD-112 (Meta — irmão); PRD-114 (Webhook unificado); PRD-115 (Envio); PRD-120 (Failover Meta↔Evolution) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | TS estrito; classe `EvolutionProvider` em `src/providers/whatsapp/evolution/EvolutionProvider.ts` |

### Critérios de Complexidade

> **Justificativa de Média:** Evolution é mais simples que Meta (sem 24h window, sem HSM aprovação), mas tem outras peculiaridades: gestão de instância (precisa conectar via QR Code se desconectar), API key auth simples, payloads próprios diferentes de Meta, dependência de hospedagem própria (saúde da VPS importa). Menor complexidade que PRD-112 mas integração nova com curva de aprendizado.

---

## Contexto do Problema

Evolution API (https://github.com/EvolutionAPI/evolution-api) é uma reimplementação open-source que se conecta ao WhatsApp via biblioteca Baileys, atuando como ponte. Vantagens vs Meta Cloud API:

| Aspecto | Meta Cloud | Evolution |
|---------|------------|-----------|
| Janela de 24h | Sim — fora dela, só template HSM | **Não** — texto livre sempre |
| Aprovação Meta Business | Necessária (pode demorar dias/semanas) | **Não exigida** |
| Templates HSM | Sim | Não (ou simulado) |
| Custo por conversa | Sim (varia por categoria) | Apenas custo da VPS |
| Conformidade Meta TOS | 100% oficial | Zona cinzenta (tecnicamente fora dos TOS do WhatsApp) |
| Confiabilidade | Alta (Meta SLA) | Depende da VPS + estabilidade Baileys |

Cenários de uso:
- Conta nova em homologação Meta (sem aprovação ainda) → Evolution por enquanto
- Conta de "atendimento" interno (poucos contatos conhecidos) → Evolution ok
- Conta principal de marketing → Meta (oficial, escalável)

Cliente GALLO usa Evolution em parte da operação; suporte é requisito.

---

## Conceito da Solução

### Estrutura

```
src/providers/whatsapp/evolution/
├── EvolutionProvider.ts
├── client.ts             ← HTTP client Evolution
├── parser.ts             ← parse webhook payload Evolution
├── mappers.ts
├── errors.ts
├── constants.ts          ← rotas Evolution
└── __tests__/
```

### Endpoints Evolution (v2+)

| Operação | Endpoint | Método |
|----------|----------|--------|
| Enviar texto | `/message/sendText/{instance}` | POST |
| Enviar mídia | `/message/sendMedia/{instance}` | POST |
| Status da instância | `/instance/connectionState/{instance}` | GET |
| Conectar (QR Code) | `/instance/connect/{instance}` | GET |
| Logout (desconectar) | `/instance/logout/{instance}` | DELETE |
| Configurar webhook | `/webhook/set/{instance}` | POST |

### Autenticação

Header `apikey: <api_key>` (não Bearer). Resolvido do Vault.

### Webhook Evolution

Evolution envia para URL configurada (apontamos para nossa Edge Function PRD-114). Payload formato próprio (diferente Meta). **Sem HMAC oficial** — mas Evolution v2+ suporta assinatura via webhook secret opcional. Se disponível, validamos; senão, confiamos em IP allowlist (configurada em PRD-114).

### Capabilities Reduzidas

```typescript
capabilities = {
  supportsTemplates: false,           // HSM não existe nativamente
  supportsInteractive: false,          // botões/listas limitados; usar com cautela
  supportsMediaUpload: true,
  supportsStatusReadReceipts: true,
  supportsCustomWebhook: true,
  maxMessageLength: 65536,             // sem limite estrito do WhatsApp Web
  maxMediaSizeBytes: 64 * 1024 * 1024  // configurável; default 64MB
}
```

### Tratamento de Instância Desconectada

Quando a instância Evolution perde conexão WhatsApp (telefone desliga, sessão expira), envio falha com erro específico. Provider:
1. Detecta erro e mapeia para `AppError('PROVIDER_DISCONNECTED', 503, 'WhatsApp desconectado, reconectar via QR Code')`
2. Healthcheck reflete estado
3. PRD-120 (Failover) ou alerta operacional reage

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Apenas Meta Cloud no MVP | Cliente já usa Evolution; corte abrupto não viável |
| WPP Connect (similar Evolution) | Menos popular; Evolution tem comunidade maior |
| Twilio API for WhatsApp | Custo alto; cliente prefere stack atual |
| WhatsApp Web (whatsapp-web.js) | Mais frágil; Evolution já abstrai isso |

---

## Escopo

### Incluído

- ✅ Classe `EvolutionProvider` implementando `IWhatsAppProvider`
- ✅ HTTP client com auth `apikey` e integration_log
- ✅ Endpoints: sendText, sendMedia, healthCheck (connectionState)
- ✅ Parser de webhook Evolution para `InboundMessage` e `InboundStatus`
- ✅ Mappers Evolution payload ↔ tipos normalizados
- ✅ Mapeamento de erros Evolution para AppError
- ✅ Validação opcional de webhook signature (se Evolution v2+ configurado com secret)
- ✅ Capabilities configuradas (HSM false, interactive false)
- ✅ Tratamento de instância desconectada (`PROVIDER_DISCONNECTED`)
- ✅ `sendTemplate` e `sendInteractive` lançam erro claro indicando não-suporte (consumidor lida)
- ✅ Testes unitários: parser com fixtures Evolution; error mapping; capabilities
- ✅ Teste de integração (opt-in, contra instância Evolution de homologação)
- ✅ Documentação `docs/dev/whatsapp-evolution-provider.md`: setup VPS, criação de instância, conexão QR Code, configuração webhook

### Excluído

- ❌ Provisionamento automático de instância Evolution (manual via Dashboard Evolution)
- ❌ QR Code rendering no nosso app (fluxo manual via Dashboard Evolution)
- ❌ Templates HSM simulados (provider não tenta emular; consumidor decide)
- ❌ Mensagens interativas (botões/listas) — limitação técnica
- ❌ Cobrança/billing (Evolution sem custo por mensagem)

---

## Requisitos Funcionais

### Inicialização

- **RF-001:** Construtor recebe `WhatsAppAccount` com `provider='evolution'`.
- **RF-002:** `provider_credentials` esperado:
  ```json
  {
    "baseUrl": "https://evo.gallodiesel.com.br",
    "vaultRef_apiKey": "evolution_api_key",
    "instanceName": "gallo-matriz",
    "vaultRef_webhookSecret": "evolution_webhook_secret"  // opcional
  }
  ```
- **RF-003:** API key resolvida via Vault sob demanda.
- **RF-004:** `providerName='evolution'`; capabilities conforme conceito.

### HTTP Client

- **RF-010:** `client.ts` expõe `evolutionRequest(method, path, body?)`:
  - Header `apikey: <key>`
  - Timeout 30s
  - integration_log via `withIntegrationLog('whatsapp_evolution', ...)`
  - Mapeia erros via `errors.ts`

### sendText

- **RF-020:** POST `/message/sendText/{instance}`:
  ```json
  {
    "number": "<phone E.164 sem +>",
    "text": "<text>",
    "quoted": { "key": { "id": "<replyToMessageId>" } }  // opcional
  }
  ```
  Retorna `{ providerMessageId: response.key.id, status: 'sent' }`

### sendMedia

- **RF-030:** POST `/message/sendMedia/{instance}`:
  ```json
  {
    "number": "<phone>",
    "mediatype": "image|audio|video|document",
    "media": "<base64 ou URL>",
    "caption": "<opcional>",
    "fileName": "<opcional para document>"
  }
  ```
- **RF-031:** Para evitar payload gigante em base64, **preferir passar URL pública** (mídia já no Storage Supabase PRD-106). Provider monta URL signed e passa para Evolution baixar.

### sendTemplate / sendInteractive — Não suportados

- **RF-040:** `sendTemplate`: lança `AppError('NOT_SUPPORTED', 422, 'Provider Evolution não suporta templates HSM')`.
- **RF-041:** `sendInteractive`: lança `AppError('NOT_SUPPORTED', 422, 'Provider Evolution não suporta mensagens interativas')`.
- **RF-042:** Consumidores (PRDs 115, 116) checam `provider.capabilities` antes de chamar.

### healthCheck

- **RF-050:** GET `/instance/connectionState/{instance}` → recebe `{ state: 'open'|'connecting'|'close' }`.
- **RF-051:** Mapeia:
  - `open` → `{ status: 'healthy' }`
  - `connecting` → `{ status: 'degraded', details: { state } }`
  - `close` → `{ status: 'down', details: { state } }`

### Webhook Parser

- **RF-060:** `parseInboundMessage(rawPayload)`:
  - Evolution envia eventos como `messages.upsert`, `messages.update`, `connection.update`
  - Para `messages.upsert` com `key.fromMe=false`: retorna `InboundMessage`
  - Para `messages.update` com `update.status` definido: retorna `InboundStatus`
  - Mapeia tipos: `conversation`/`extendedTextMessage` → text; `imageMessage` → image; etc.
- **RF-061:** `verifyWebhookSignature`:
  - Se webhook secret configurado (RF-002): valida HMAC-SHA256 com `timingSafeEqual`
  - Senão: retorna `true` (caller já valida por IP allowlist no PRD-114)

### uploadOutboundMedia / downloadInboundMedia

- **RF-070:** `uploadOutboundMedia`: Evolution não tem endpoint separado de upload (envia mídia direto). Implementação retorna `mediaId` sintético (URL pública gerada) ou lança não-suporte.
- **RF-071:** `downloadInboundMedia(mediaId)`: GET na URL própria do Evolution (`/chat/getBase64FromMediaMessage/{instance}` ou similar conforme versão). Retorna binário + metadata.

### Tratamento de Erros Evolution

- **RF-080:** Mapeia erros HTTP Evolution + códigos internos:
  - HTTP 401 → `UNAUTHORIZED 401` (apikey inválida)
  - HTTP 404 com message contendo "instance" → `NOT_FOUND 404` (instância inexistente)
  - HTTP 400 com "not connected" / "session" → `PROVIDER_DISCONNECTED 503`
  - Outros 4xx/5xx → `INTEGRATION_ERROR 502`

### Capabilities Check Helper

- **RF-090:** Consumidores devem checar `provider.capabilities.supportsTemplates` antes de `sendTemplate`. Documentado em `docs/dev/whatsapp-evolution-provider.md`.

### Testes

- **RF-100:** Testes unitários:
  - Parser com fixtures Evolution (text, image, audio, status)
  - Mappers
  - Error mapping
  - capabilities corretas
- **RF-101:** Teste de integração (opt-in): instância Evolution real homologação; enviar texto, receber, validar parsing

### Documentação

- **RF-110:** `docs/dev/whatsapp-evolution-provider.md`:
  - Setup VPS recomendado (Docker, recursos mínimos)
  - Criação de instância no Evolution Dashboard
  - QR Code: como conectar o WhatsApp
  - Configurar webhook apontando para Edge Function (PRD-114)
  - Schema `provider_credentials` esperado
  - Limites e diferenças vs Meta
  - Troubleshooting (instância desconecta, etc.)

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança):** API key no Vault; webhook secret idem
- **RNF-002 (Conectividade):** timeout 30s; falha de rede vira AppError
- **RNF-003 (Auditabilidade):** integration_log em 100% das chamadas
- **RNF-004 (Resilience):** instância desconectada não trava app — caller decide fallback (PRD-120)
- **RNF-005 (Capabilities consistency):** consumidor checa capabilities; provider lança erro claro se chamado fora do suportado

---

## Critérios de Aceitação

### RF-020: sendText Evolution

```gherkin
DADO uma whatsapp_account A2 com provider='evolution' e instância conectada
QUANDO sendText({ accountId: A2, to: '+5555912345678', text: 'Olá' })
ENTÃO faz POST /message/sendText/<instance>
  E recebe response com key.id
  E retorna { providerMessageId, status: 'sent' }
  E integration_log registra
```

### RF-040: sendTemplate lança Não-Suporte

```gherkin
DADO provider Evolution
QUANDO sendTemplate é chamado
ENTÃO lança AppError com code='NOT_SUPPORTED', httpStatus=422
  E mensagem "Provider Evolution não suporta templates HSM"
  E consumidor (PRD-115) trata fallback (texto livre, já que Evolution não tem janela 24h)
```

### RF-050: Healthcheck Reflete Estado

```gherkin
DADO instância Evolution conectada (state=open)
QUANDO healthCheck()
ENTÃO retorna { status: 'healthy', details: { state: 'open' } }

DADO instância desconectada (state=close)
QUANDO healthCheck()
ENTÃO retorna { status: 'down', details: { state: 'close' } }
```

### RF-080: Detecção de Desconexão

```gherkin
DADO instância Evolution desconectada
QUANDO sendText é tentado
ENTÃO Evolution retorna 400 com "not connected"
  E provider mapeia para AppError('PROVIDER_DISCONNECTED', 503, ...)
  E caller (PRD-120 Failover ou PRD-115) decide próxima ação
```

---

## Fases de Implementação

### Fase 1 — Client + Auth + Erros (1 dia)
- `client.ts`, apikey, integration_log, error mapping

### Fase 2 — Envio + Healthcheck (1 dia)
- sendText, sendMedia, healthCheck
- sendTemplate/Interactive como não-suportados

### Fase 3 — Webhook + Parser (1 dia)
- parser de eventos Evolution
- signature opcional
- Fixtures + testes

### Fase 4 — Docs + Teste Real (1 dia)
- Instância de homologação
- Teste manual ida e volta
- `docs/dev/whatsapp-evolution-provider.md`
- `_DONE`

---

## Dependências

### PRDs
- **Depende de:** PRD-111 (interface), PRD-100 (Vault), PRD-101 (whatsapp_accounts), PRD-102 (Edge Functions)
- **Bloqueia:** PRD-114 (webhook unificado), PRD-120 (failover)

### Decisões Pendentes
- **VPS de Evolution:** quem hospeda — AILA ou GALLO? Custo e responsabilidade. **Tratativa:** confirmar com Edmilson.
- **Versão Evolution:** v2.x pinned; bump explícito por PR
- **Webhook secret:** habilitar se Evolution v2+ está em uso

---

## Considerações de Segurança

- **API key no Vault** — nunca em código
- **VPS hardening:** firewall, fail2ban, monitoring — responsabilidade de quem hospeda; PRD-110 monitora saúde via healthCheck
- **Webhook validação:** secret HMAC se disponível; IP allowlist sempre (PRD-114)
- **TOS WhatsApp:** Evolution está em zona cinzenta; cliente ciente do risco; documentar
- **Logs sanitizados:** payloads de mensagem podem conter PII — `integration_logs` trunca conforme convenção

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.1.0-rc.3; CHANGELOG; renomear `PRD-113-evolution-api-provider_DONE.md`; teste real homologação documentado.

| Princípio | Descrição |
|-----------|-----------|
| **Capabilities honestas** | HSM/interactive não disponível — lança erro claro |
| **Disconnect = state real** | healthCheck reflete; alerta operacional |
| **Mídia via URL** | Não enviar base64 gigante; usar Storage |
| **Webhook secret se possível** | Validar HMAC quando configurado |

| ❌ Evitar |
|-----------|
| Simular HSM com texto livre |
| Tratar instância desconectada como erro genérico |
| Enviar mídia em base64 grande no payload |
| Confiar em Evolution para mensagem crítica sem failover (PRD-120) |
| Logar API key |

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
