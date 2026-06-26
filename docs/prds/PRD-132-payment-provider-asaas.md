# PRD-132: Payment Provider Interface + Asaas

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/payment/`_ |
| **Objetivo** | Estabelecer a interface abstrata `IPaymentProvider` (Provider Pattern, espelhando PRDs 111/121/127), a tabela `crm.payment_charges` (registro local de toda cobrança), migrations aditivas (`crm.stores.payment_config`, `crm.customers.gateway_refs`), factory por store, `MockPaymentProvider`, e a **primeira implementação concreta: Asaas** — cobranças PIX, boleto e cartão via API v3, com sandbox, webhook token e mapeamento de erros |
| **Tipo** | Integração |
| **Complexidade** | Crítica |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — bloqueia toda a Onda 7 |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-005 F1 (Provider Pattern); PRD-100 (Vault); PRD-101 (`crm.orders.payment_status`); PRD-102 (Edge infra, idempotency, integration_logs); PRD-103 (RLS); PRD-132B (Mercado Pago — irmão); PRD-133 (PIX consome); PRD-134 (Webhook); PRD-135/136 (Boleto/Cartão); PRD-064 F1 (checkout — consumidor final); PRD-032 F1 (pedido /app) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | TS estrito; interface em `src/providers/payment/IPaymentProvider.ts`; Asaas em `src/providers/payment/asaas/` |

### Critérios de Complexidade

> **Justificativa de Crítica:** dinheiro real. Cobrança duplicada, valor errado ou refund indevido geram dano financeiro direto e desgaste com cliente final. A interface precisa absorver 2 gateways heterogêneos (Asaas manda webhook "gordo" com payload completo e autentica por token estático; Mercado Pago manda webhook "magro" que exige re-fetch e autentica por HMAC). Asaas exige customer cadastrado **antes** da cobrança — lifecycle extra que a interface precisa esconder dos consumidores. Idempotência tripla (header + idempotency_key + UNIQUE no DB).

### Nota de Re-escopo (09/06/2026)

> O roadmap original previa um PRD genérico "PIX Open Banking estrutura". Seguindo o padrão consolidado nas Ondas 5 e 6 (PRD-111 WhatsApp Interface, PRD-121 DINTEC Interface, PRD-127 NFe Interface), **a interface `IPaymentProvider` nasce neste PRD junto com o primeiro provider concreto (Asaas)** — não há número livre para um PRD de interface isolado e a numeração do INDEX é estável. PRD-132B implementa Mercado Pago contra a interface daqui.

---

## Contexto do Problema

A Fase 1 entregou checkout completo (PRD-064) e gestão de pedidos (PRD-032) com pagamento **placeholder**: o cliente escolhe PIX/boleto/cartão, o pedido nasce `pending_payment`, e... nada acontece. O banner "modo demonstração" avisa.

Conforme briefing v1.3 §13.2, a decisão é operar **dois gateways em paralelo** — Asaas e Mercado Pago — selecionáveis por store:
- **Asaas:** forte em PIX + boleto registrado para PMEs; API simples; webhook com payload completo
- **Mercado Pago:** ubiquidade no varejo BR; cliente final confia na marca; checkout transparente

Operar os dois exige a mesma disciplina das ondas anteriores: interface estável, capabilities flagando diferenças, factory por store, e **nenhum `if (provider === 'asaas')` em consumidor**.

---

## Conceito da Solução

### Interface `IPaymentProvider`

```typescript
// src/providers/payment/IPaymentProvider.ts
export interface IPaymentProvider {
  readonly providerName: 'asaas' | 'mercado_pago' | 'mock'
  readonly capabilities: PaymentProviderCapabilities

  // ===== Criação de cobranças =====
  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>
  createBoletoCharge(input: BoletoChargeInput): Promise<BoletoChargeResult>
  createCardCharge(input: CardChargeInput): Promise<CardChargeResult>

  // ===== Consulta e ciclo de vida =====
  getChargeStatus(providerChargeId: string): Promise<ChargeStatusResult>
  cancelCharge(providerChargeId: string): Promise<{ cancelled: boolean }>
  refundCharge(providerChargeId: string, amount?: number): Promise<RefundResult>

  // ===== Webhook (utilities para PRD-134) =====
  verifyWebhookAuth(rawBody: string, headers: Record<string, string>): Promise<boolean>
  parseWebhookEvent(rawPayload: unknown): PaymentWebhookEvent | null

  // ===== Health =====
  healthCheck(): Promise<{ status: 'healthy' | 'degraded' | 'down'; details?: unknown }>
}

export interface PaymentProviderCapabilities {
  supportsPix: boolean
  supportsBoleto: boolean
  supportsCard: boolean
  supportsInstallments: boolean
  maxInstallments: number                 // 12 em ambos
  supportsPartialRefund: boolean
  supportsCardTokenization: boolean       // PRD-136 usa
  webhookAuthMethod: 'static_token' | 'hmac'
  webhookPayloadStyle: 'full' | 'thin'    // Asaas: full; MP: thin (exige re-fetch)
}
```

### Tipos Normalizados

```typescript
export interface ChargeBaseInput {
  orderId: string                  // crm.orders.id (correlação)
  storeId: string
  amount: number                   // centavos? NÃO — decimal BRL (numeric 12,2); provider converte se precisar
  description: string              // "Pedido #PD-2026-0042 — GALLO Base Diesel"
  customer: ChargeCustomer
  traceId?: string
}

export interface ChargeCustomer {
  internalId: string               // crm.customers.id
  name: string
  document: string                 // CPF/CNPJ dígitos
  documentType: 'cpf' | 'cnpj'
  email?: string
  phone?: string
}

export interface PixChargeInput extends ChargeBaseInput {
  expirationMinutes: number        // default vem de payment_config (30)
}

export interface PixChargeResult {
  providerChargeId: string
  qrCodePayload: string            // copia-e-cola (BR Code EMV)
  qrCodeImageBase64?: string       // PNG base64 (se provider entrega)
  expiresAt: string                // ISO
  status: 'pending'
}

export interface BoletoChargeInput extends ChargeBaseInput {
  dueDate: string                  // ISO date
  finePct?: number                 // multa após vencimento
  interestPctMonth?: number        // juros a.m.
}

export interface BoletoChargeResult {
  providerChargeId: string
  boletoUrl: string                // PDF/visualização
  digitableLine: string            // linha digitável
  barCode?: string
  dueDate: string
  status: 'pending'
}

export interface CardChargeInput extends ChargeBaseInput {
  cardToken: string                // tokenizado client-side (PRD-136)
  installments: number             // 1..maxInstallments
  holderInfo?: { name: string; document: string; postalCode: string }
}

export interface CardChargeResult {
  providerChargeId: string
  status: 'paid' | 'pending' | 'failed'   // cartão pode aprovar sincrono
  installments: number
  failureReason?: string
}

export type ChargeStatus =
  | 'pending' | 'paid' | 'expired' | 'overdue'
  | 'cancelled' | 'refunded' | 'partially_refunded'
  | 'failed' | 'chargeback'

export interface ChargeStatusResult {
  providerChargeId: string
  status: ChargeStatus
  paidAmount?: number
  paidAt?: string
  rawStatus: string                // status original do provider (audit)
}

export interface RefundResult {
  providerChargeId: string
  status: 'refunded' | 'partially_refunded' | 'refund_failed'
  refundedAmount: number
  refundedAt?: string
  failureReason?: string
}

export interface PaymentWebhookEvent {
  provider: 'asaas' | 'mercado_pago'
  eventType: 'payment_received' | 'payment_confirmed' | 'payment_overdue'
            | 'payment_refunded' | 'payment_chargeback' | 'payment_failed' | 'other'
  providerChargeId: string
  /** 'full': payload já traz status/valores. 'thin': PRD-134 deve chamar getChargeStatus */
  payloadStyle: 'full' | 'thin'
  status?: ChargeStatus
  paidAmount?: number
  paidAt?: string
  rawEventId: string               // para idempotência (processed_events)
  rawPayload: unknown
}
```

### Tabela Nova `crm.payment_charges`

```sql
CREATE TABLE crm.payment_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES crm.orders(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES crm.stores(id),

  provider text NOT NULL CHECK (provider IN ('asaas','mercado_pago','mock')),
  environment text NOT NULL CHECK (environment IN ('production','sandbox')),

  provider_charge_id text NOT NULL,
  method text NOT NULL CHECK (method IN ('pix','boleto','card')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','expired','overdue','cancelled',
                      'refunded','partially_refunded','failed','chargeback')),

  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_amount numeric(12,2),
  paid_at timestamptz,

  -- PIX
  pix_qr_payload text,
  pix_qr_expires_at timestamptz,

  -- Boleto
  boleto_url text,
  boleto_digitable_line text,
  boleto_due_date date,

  -- Cartão
  card_last4 text,
  installments integer,

  -- Refund
  refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  refunded_at timestamptz,

  -- Audit / idempotência
  request_payload jsonb NOT NULL,
  response_payload jsonb,
  idempotency_key text UNIQUE,
  webhook_event_ids text[] NOT NULL DEFAULT '{}',

  created_by uuid REFERENCES crm.sellers(id),   -- null em checkout visitante
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1 cobrança ATIVA por (order, method): PIX expirado pode gerar nova, mas nunca 2 pendentes
CREATE UNIQUE INDEX ON crm.payment_charges (order_id, method)
  WHERE status IN ('pending','paid');

CREATE INDEX ON crm.payment_charges (store_id, created_at DESC);
CREATE INDEX ON crm.payment_charges (provider_charge_id);
CREATE INDEX ON crm.payment_charges (status) WHERE status = 'pending';  -- expiração/polling

ALTER TABLE crm.payment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.payment_charges FORCE ROW LEVEL SECURITY;
-- RLS (estende PRD-103): Owner/Manager da store; seller responsável pelo order;
-- cliente B2B dono do order (portal). INSERT/UPDATE apenas service_role.
```

### Migrations Aditivas

```sql
-- Config por store
ALTER TABLE crm.stores ADD COLUMN payment_config jsonb;
-- Estrutura esperada:
-- {
--   "defaultProvider": "asaas" | "mercado_pago",
--   "environment": "production" | "sandbox",
--   "vaultRef_asaasApiKey": "asaas_api_key_<storeId>",
--   "vaultRef_asaasWebhookToken": "asaas_webhook_token_<storeId>",
--   "vaultRef_mpAccessToken": "mp_access_token_<storeId>",
--   "vaultRef_mpWebhookSecret": "mp_webhook_secret_<storeId>",
--   "pixExpirationMinutes": 30,
--   "boletoDueDays": 3,
--   "boletoFinePct": 2.0,
--   "boletoInterestPctMonth": 1.0,
--   "maxInstallments": 12
-- }

-- Refs do customer nos gateways (Asaas exige customer pré-cadastrado)
ALTER TABLE crm.customers ADD COLUMN gateway_refs jsonb NOT NULL DEFAULT '{}';
-- { "asaas_customer_id": "cus_xxx", "mp_customer_id": "..." }
```

### Factory por Store

```typescript
// src/providers/payment/factory.ts
export async function getPaymentProvider(
  storeId: string,
  override?: 'asaas' | 'mercado_pago'      // PRD-134 usa: webhook sabe de qual provider veio
): Promise<IPaymentProvider> {
  if (isMockMode()) return new MockPaymentProvider()

  const config = await fetchPaymentConfig(storeId)   // crm.stores.payment_config
  if (!config) throw new AppError('NOT_CONFIGURED', 422,
    'Pagamentos não configurados para esta loja. Configure em /app/configuracoes/pagamentos.')

  const provider = override ?? config.defaultProvider
  switch (provider) {
    case 'asaas':        return new AsaasProvider({ storeId, config })
    case 'mercado_pago': return new MercadoPagoProvider({ storeId, config })  // PRD-132B
    default:             throw new AppError('VALIDATION_ERROR', 422, 'Provider desconhecido')
  }
}
```

Cache por `(storeId, provider)`. Credenciais resolvidas do Vault **sob demanda** dentro do provider (nunca no construtor) — mesmo padrão do PRD-112.

### Implementação Asaas

```
src/providers/payment/asaas/
├── AsaasProvider.ts
├── client.ts           ← HTTP client (access_token header, integration_log)
├── customers.ts        ← resolve/cria customer Asaas (gateway_refs)
├── mappers.ts          ← payloads + status mapping
├── errors.ts           ← errors[] Asaas → AppError
├── constants.ts        ← endpoints, base URLs prod/sandbox
└── __tests__/
```

| Aspecto | Detalhe Asaas |
|---------|---------------|
| **Auth** | Header `access_token: $API_KEY` (Vault) |
| **Base URL** | `https://api.asaas.com/v3` (prod) · `https://api-sandbox.asaas.com/v3` (sandbox) |
| **Pré-requisito** | Cobrança exige `customer` Asaas: `customers.ts` busca por `cpfCnpj`, cria se ausente (`POST /customers`), persiste em `crm.customers.gateway_refs.asaas_customer_id` |
| **PIX** | `POST /payments { billingType:'PIX', customer, value, dueDate, description, externalReference: orderId }` → depois `GET /payments/{id}/pixQrCode` → `{ payload, encodedImage, expirationDate }` |
| **Boleto** | `billingType:'BOLETO'` + `fine`/`interest` → response traz `bankSlipUrl`, `identificationField` (linha digitável) |
| **Cartão** | `billingType:'CREDIT_CARD'` + `creditCardToken` + `installmentCount` (PRD-136 entrega tokenização; aqui o contrato) |
| **Status nativo** | `PENDING→pending`, `RECEIVED/CONFIRMED→paid`, `OVERDUE→overdue`, `REFUNDED→refunded`, `RECEIVED_IN_CASH→paid` |
| **Refund** | `POST /payments/{id}/refund` com `value` opcional (parcial) |
| **Webhook auth** | Header `asaas-access-token` comparado via `timingSafeEqual` com token do Vault (`webhookAuthMethod: 'static_token'`) |
| **Webhook payload** | **Full** — evento traz objeto `payment` completo (status, value, paymentDate); PRD-134 não precisa re-fetch |
| **Eventos** | `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED` |
| **Erros** | 401 → `UNAUTHORIZED`; 400 com `errors[{code,description}]` → `VALIDATION_ERROR` com primeira description pt-BR (Asaas já responde em português) |

**Capabilities Asaas:** `{ supportsPix: true, supportsBoleto: true, supportsCard: true, supportsInstallments: true, maxInstallments: 12, supportsPartialRefund: true, supportsCardTokenization: true, webhookAuthMethod: 'static_token', webhookPayloadStyle: 'full' }`

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| PRD de interface separado (como 111/121/127) | Sem número livre; numeração do INDEX é estável. Interface nasce com o 1º provider, declarado em nota de re-escopo |
| Gateway único (só Asaas) | Briefing §13.2 decidiu paralelo; lock-in de pagamento é risco P0 |
| Stripe / Pagar.me / Iugu | Cliente decidiu Asaas + MP (custo, PIX nativo, marca conhecida no varejo BR) |
| Valores em centavos (integer) | `crm.orders` já usa `numeric(12,2)`; manter consistência. Provider converte internamente se a API exigir |
| Customer Asaas criado em job batch | On-demand com cache em `gateway_refs` é mais simples e cobre visitante do checkout |
| Tabela de charges por método (pix_charges, boleto_charges...) | Uma tabela com colunas opcionais por método simplifica conciliação (PRD-139) e RLS |

---

## Escopo

### Incluído

- ✅ Interface `IPaymentProvider` + todos os tipos normalizados em `src/providers/payment/`
- ✅ Migration: tabela `crm.payment_charges` + RLS + UNIQUE parcial (1 ativa por order/method)
- ✅ Migrations aditivas: `crm.stores.payment_config jsonb`, `crm.customers.gateway_refs jsonb`
- ✅ Factory `getPaymentProvider(storeId, override?)` com cache e fallback mock
- ✅ `MockPaymentProvider`: QR fake determinístico, boleto fake, cartão aprova se `cardToken='tok_approve'` / falha se `'tok_decline'`, refund sempre OK — viabiliza E2E sem sandbox
- ✅ `AsaasProvider` completo: client, lifecycle de customer (`gateway_refs`), createPixCharge (2 passos), createBoletoCharge, createCardCharge (contrato; tokenização no PRD-136), getChargeStatus, cancelCharge, refundCharge (total e parcial), verifyWebhookAuth (token estático + `timingSafeEqual`), parseWebhookEvent, healthCheck (`GET /finance/balance` ou `/customers?limit=1`)
- ✅ Mapeamento de status Asaas → `ChargeStatus` canônico
- ✅ Mapeamento de erros Asaas (`errors[]`) → AppError com mensagem pt-BR
- ✅ `integration_logs` (`payment_asaas`) em 100% das chamadas, payloads sanitizados (sem API key, sem dados completos de cartão — apenas last4)
- ✅ Integração ao `ProviderFactory` central (PRD-104): `getPaymentProvider`
- ✅ Vault entries documentadas: `asaas_api_key_<storeId>`, `asaas_webhook_token_<storeId>`
- ✅ Testes unitários: factory, mock, mappers de status/erro, customers.ts (busca→cria→cacheia), fixtures de webhook Asaas
- ✅ Teste de integração opt-in contra sandbox Asaas (criar cobrança PIX real, consultar status) — documentado
- ✅ Documentação `docs/dev/payment-providers.md` (arquitetura geral) + `docs/dev/payment-asaas.md`

### Excluído

- ❌ Mercado Pago (PRD-132B)
- ❌ Edge Function de criação de cobrança + UI de QR (PRD-133)
- ❌ Webhook receiver (PRD-134 — aqui só as utilities `verifyWebhookAuth`/`parseWebhookEvent`)
- ❌ UI de boleto e fluxo completo (PRD-135)
- ❌ Tokenização de cartão client-side e UI (PRD-136)
- ❌ Parcelamento com juros configurável (PRD-137)
- ❌ Trigger automático de refund no cancelamento (PRD-138 — aqui só o método `refundCharge`)
- ❌ Conciliação (PRD-139), anti-fraude (PRD-140)
- ❌ Split de pagamento / marketplace (fora do MVP)
- ❌ Assinaturas/recorrência (fora do MVP)

---

## Requisitos Funcionais

### Interface e Tipos

- **RF-001:** `IPaymentProvider` + tipos conforme conceito, TS estrito, zero `any`.
- **RF-002:** `providerName` union literal `'asaas' | 'mercado_pago' | 'mock'`.
- **RF-003:** `capabilities` readonly fixo por instância.
- **RF-004:** `ChargeStatus` union canônico com 9 estados; todo provider mapeia para esse conjunto.

### Schema

- **RF-010:** Migration `crm.payment_charges` conforme conceito.
- **RF-011:** UNIQUE parcial `(order_id, method) WHERE status IN ('pending','paid')` — nunca 2 cobranças ativas do mesmo método para o mesmo order; PIX expirado pode gerar nova.
- **RF-012:** RLS: SELECT para Owner/Manager da store + seller responsável do order + customer B2B dono (portal); mutações apenas service_role.
- **RF-013:** Migration aditiva `crm.stores.payment_config jsonb` com estrutura documentada em comment SQL.
- **RF-014:** Migration aditiva `crm.customers.gateway_refs jsonb DEFAULT '{}'`.
- **RF-015:** Trigger `updated_at` (padrão PRD-101 RF-100).

### Factory

- **RF-020:** `getPaymentProvider(storeId, override?)`: lê `payment_config`, retorna provider de `defaultProvider` ou do `override`.
- **RF-021:** `payment_config` ausente → `AppError('NOT_CONFIGURED', 422)` com mensagem orientando configuração.
- **RF-022:** Cache por `(storeId, provider)`; invalidação em mudança de config (Realtime ou refresh).
- **RF-023:** `VITE_DATA_SOURCE=mock` ou `VITE_PAYMENT_PROVIDER=mock` → `MockPaymentProvider` sempre.

### MockPaymentProvider

- **RF-030:** Implementa interface completa com dados determinísticos.
- **RF-031:** `createPixCharge` retorna `qrCodePayload='00020126...MOCK'`, `expiresAt=now()+input.expirationMinutes`.
- **RF-032:** `createCardCharge`: `cardToken='tok_approve'` → `paid`; `'tok_decline'` → `failed` com `failureReason`; outros → `pending`.
- **RF-033:** `verifyWebhookAuth` sempre true; `parseWebhookEvent` aceita payload mock-formatado.
- **RF-034:** Capabilities: tudo true, `maxInstallments=12`, `webhookPayloadStyle='full'`.

### Asaas — Client

- **RF-040:** `client.ts` expõe `asaasRequest(method, path, body?)`:
  - Header `access_token` resolvido do Vault sob demanda
  - Base URL por `environment` (prod/sandbox)
  - Timeout 30s
  - `withIntegrationLog('payment_asaas', ...)` — request/response sanitizados (sem key; cartão nunca logado além de last4)
  - 4xx/5xx → `mapAsaasError`

### Asaas — Customer Lifecycle

- **RF-050:** `resolveAsaasCustomerId(customer: ChargeCustomer, storeId)`:
  1. Lê `crm.customers.gateway_refs.asaas_customer_id` → retorna se presente
  2. `GET /customers?cpfCnpj=<document>` → se existe no Asaas, persiste ref e retorna
  3. `POST /customers { name, cpfCnpj, email, mobilePhone, externalReference: internalId }` → persiste ref e retorna
- **RF-051:** Falha na criação → AppError com description do Asaas (já pt-BR).
- **RF-052:** Visitante do checkout (customer placeholder criado pelo PRD-064) segue o mesmo fluxo — `gateway_refs` no placeholder.

### Asaas — Cobranças

- **RF-060:** `createPixCharge`:
  1. Resolve customer (RF-050)
  2. `POST /payments { billingType:'PIX', customer, value: amount, dueDate: today+expiração, description, externalReference: orderId }`
  3. `GET /payments/{id}/pixQrCode` → `{ payload, encodedImage, expirationDate }`
  4. Retorna `PixChargeResult`
- **RF-061:** `createBoletoCharge`: `billingType:'BOLETO'`, `dueDate`, `fine: { value: finePct }`, `interest: { value: interestPctMonth }`; retorna `bankSlipUrl` + `identificationField`.
- **RF-062:** `createCardCharge`: `billingType:'CREDIT_CARD'`, `creditCardToken`, `installmentCount`, `creditCardHolderInfo`; resposta `CONFIRMED` → `paid` sincrono.
- **RF-063:** Valores: `amount` decimal BRL repassado direto (`value` no Asaas também é decimal).

### Asaas — Consulta, Cancel, Refund

- **RF-070:** `getChargeStatus`: `GET /payments/{id}` → mapeia status nativo → canônico; retorna `rawStatus` para audit.
- **RF-071:** `cancelCharge`: `DELETE /payments/{id}` (só `pending`); pago → AppError `VALIDATION_ERROR` "Cobrança paga não pode ser cancelada — use refund".
- **RF-072:** `refundCharge(id, amount?)`: `POST /payments/{id}/refund` (body `{ value }` se parcial); mapeia para `RefundResult`.

### Asaas — Webhook Utilities

- **RF-080:** `verifyWebhookAuth(rawBody, headers)`:
  - Lê `headers['asaas-access-token']`
  - Resolve `asaas_webhook_token_<storeId>` do Vault
  - Compara via `timingSafeEqual`
- **RF-081:** `parseWebhookEvent(rawPayload)`:
  - `event` → mapeia (`PAYMENT_RECEIVED|PAYMENT_CONFIRMED → payment_confirmed`, `PAYMENT_OVERDUE → payment_overdue`, `PAYMENT_REFUNDED → payment_refunded`, `PAYMENT_CHARGEBACK_REQUESTED → payment_chargeback`)
  - `payment.id` → `providerChargeId`; `payment.status/value/paymentDate` → campos canônicos
  - `payloadStyle: 'full'`; `rawEventId = event + ':' + payment.id + ':' + dateCreated`
  - Evento desconhecido → `eventType: 'other'` (PRD-134 loga e ignora)

### Asaas — Health

- **RF-090:** `healthCheck`: `GET /customers?limit=1` — 200 → healthy; 401 → down (`apikey inválida`); timeout/5xx → degraded.

### Mapeamento de Erros

- **RF-100:** `errors.ts`:
  - 401 → `UNAUTHORIZED 401`
  - 400 com `errors[]` → `VALIDATION_ERROR 422` com primeira `description` (pt-BR nativo do Asaas)
  - `invalid_customer` → mensagem orientando dados do cliente
  - 5xx/timeout → `INTEGRATION_ERROR 502`

### Testes

- **RF-110:** Unitários: factory (config presente/ausente/mock); mock provider; mappers de status (todos os estados Asaas); error mapping; customers.ts (3 cenários de RF-050); parseWebhookEvent com fixtures reais Asaas (RECEIVED, OVERDUE, REFUNDED); verifyWebhookAuth (válido/inválido/ausente).
- **RF-111:** Integração opt-in contra sandbox Asaas: criar cobrança PIX, obter QR, consultar status — script + passo a passo documentado.

### Documentação

- **RF-120:** `docs/dev/payment-providers.md`: arquitetura, interface, capabilities matrix (Asaas × MP × Mock), schema de `payment_config` e `gateway_refs`, Vault entries, como adicionar provider futuro.
- **RF-121:** `docs/dev/payment-asaas.md`: onboarding (criar conta, gerar API key, configurar webhook token no painel), endpoints usados, tabela de status/erros, troubleshooting.

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança — credenciais):** API key e webhook token apenas no Vault; resolvidos sob demanda; jamais em log/response.
- **RNF-002 (Segurança — cartão):** dados de cartão nunca trafegam por nossos servidores além do token; `request_payload` registra apenas `cardToken` truncado + last4. PCI-DSS scope mínimo.
- **RNF-003 (Idempotência):** UNIQUE no DB + `idempotency_key`; camada de Edge Function (PRD-133) adiciona `withIdempotency`.
- **RNF-004 (Auditabilidade):** `integration_logs` em 100% das chamadas; `request_payload`/`response_payload` persistidos em `payment_charges`.
- **RNF-005 (Performance):** createPixCharge completo (2 chamadas Asaas) < 3s p95.
- **RNF-006 (Type safety):** `tsc` estrito sem warnings.

---

## Critérios de Aceitação

### RF-050: Customer Lifecycle

```gherkin
DADO customer C1 sem gateway_refs.asaas_customer_id
QUANDO createPixCharge para C1
ENTÃO busca GET /customers?cpfCnpj — não existe
  E POST /customers cria
  E crm.customers.gateway_refs.asaas_customer_id persistido
  E cobrança criada com esse customer

QUANDO segunda cobrança para C1
ENTÃO usa o id cacheado em gateway_refs (zero chamadas de customer)
```

### RF-060: PIX em 2 Passos

```gherkin
DADO order O1 (R$ 430,00) e payment_config válido (Asaas sandbox)
QUANDO provider.createPixCharge({ orderId: O1, amount: 430.00, expirationMinutes: 30 })
ENTÃO POST /payments com billingType=PIX e externalReference=O1
  E GET /payments/{id}/pixQrCode retorna payload + encodedImage
  E resultado { providerChargeId, qrCodePayload, qrCodeImageBase64, expiresAt≈now+30min, status:'pending' }
  E integration_log com 2 entradas payment_asaas
```

### RF-011: UNIQUE de Cobrança Ativa

```gherkin
DADO charge PIX pending para order O1
QUANDO segunda charge PIX é tentada para O1 (consumidor bypassou idempotência)
ENTÃO INSERT viola UNIQUE (order_id, method) WHERE status IN ('pending','paid')
  E erro mapeado: "Já existe cobrança PIX ativa para este pedido"

DADO a charge anterior expirou (status='expired')
QUANDO nova charge PIX é criada
ENTÃO INSERT passa (parcial index não cobre expired)
```

### RF-080: Webhook Token

```gherkin
DADO webhook token 'WTK123' no Vault
QUANDO verifyWebhookAuth(body, { 'asaas-access-token': 'WTK123' })
ENTÃO retorna true (timingSafeEqual)

QUANDO header ausente ou divergente
ENTÃO retorna false sem lançar exception
```

### RF-071: Cancel Só de Pendente

```gherkin
DADO charge com status='paid'
QUANDO cancelCharge
ENTÃO AppError VALIDATION_ERROR "Cobrança paga não pode ser cancelada — use refund"
  E nenhuma chamada DELETE ao Asaas
```

---

## Fases de Implementação

### Fase 1 — Interface + Tipos + Schema (1.5 dias)
- IPaymentProvider + tipos
- Migrations (payment_charges, payment_config, gateway_refs) + RLS
- Testes de type-safety

### Fase 2 — Factory + Mock (1 dia)
- factory.ts + cache + NOT_CONFIGURED
- MockPaymentProvider completo
- Testes

### Fase 3 — Asaas Client + Customers (1.5 dias)
- client.ts + integration_log + errors.ts
- customers.ts (lifecycle gateway_refs)
- Testes dos 3 cenários

### Fase 4 — Asaas Cobranças + Webhook Utils (2 dias)
- createPixCharge (2 passos), Boleto, Card
- getChargeStatus, cancel, refund
- verifyWebhookAuth + parseWebhookEvent + fixtures
- healthCheck

### Fase 5 — Sandbox + Docs (1 dia)
- Teste integração sandbox documentado
- payment-providers.md + payment-asaas.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-100 (Vault), PRD-101 (orders, customers, stores), PRD-102 (Edge infra, integration_logs), PRD-103 (RLS), PRD-104 (ProviderFactory central)
- **Bloqueia:** PRD-132B, 133, 134, 135, 136, 137, 138, 139, 140, 140B (toda a Onda 7)
- **Decisões Pendentes:**
  - **defaultProvider por store** — sugerido `asaas` como default inicial; Owner alterna em config
  - **Conta sandbox Asaas** — criar antes da Fase 5 (teste de integração)
  - **Cartão P0 vs P1** — contrato `createCardCharge` entregue aqui de qualquer forma; UI/tokenização (PRD-136) é onde a decisão pesa
  - `pixExpirationMinutes` default 30 e `boletoDueDays` default 3 — confirmar com Owner

---

## Considerações de Segurança

- **Vault para tudo:** API key, webhook token; resolução sob demanda, nunca no construtor
- **PCI scope mínimo:** cartão só por token; nunca número completo em log, DB ou memória além da chamada
- **RLS estrito** em `payment_charges` — cliente vê só as próprias cobranças via portal
- **`timingSafeEqual`** na validação do webhook token
- **Audit financeiro:** request/response persistidos; toda mutação com trace_id
- **Sanitização de integration_logs:** access_token removido; cartão → last4

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.1; CHANGELOG; renomear `PRD-132-payment-provider-asaas_DONE.md`; teste sandbox documentado.

| Princípio | Descrição |
|-----------|-----------|
| **Interface estável** | Mudança aqui = refactor em 132B-140B |
| **Customer lifecycle escondido** | Consumidor não sabe que Asaas exige pré-cadastro |
| **1 cobrança ativa por order/method** | UNIQUE parcial é a última linha de defesa |
| **Cartão = token only** | PCI scope mínimo, sempre |
| **Mock viabiliza E2E** | tok_approve/tok_decline determinísticos |

| ❌ Evitar |
|-----------|
| `if (provider === 'asaas')` fora da pasta asaas/ |
| API key em log, response ou construtor |
| Número de cartão em qualquer persistência |
| 2 cobranças pendentes do mesmo método |
| Confiar em status do request sem mapear rawStatus |
| Criar customer Asaas em loop (cachear em gateway_refs) |

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ⏳ PENDENTE |
| **Data** | - |
| **Versão** | - |
| **Por** | - |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 09/06/2026 | v1 | Criação inicial — Sub-lote 4a do Lote 4 (Onda 7) |

---

**AILA - Sistemas Inteligentes**
