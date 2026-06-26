# PRD-132B: Mercado Pago Provider

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/providers/payment/mercadopago/`_ |
| **Objetivo** | Segunda implementação concreta do `IPaymentProvider` (PRD-132): **Mercado Pago** via API de Payments (`/v1/payments`). Auth Bearer, header `X-Idempotency-Key` obrigatório, PIX com QR via `point_of_interaction.transaction_data`, boleto (`bolbradesco`), cartão tokenizado client-side, webhook **thin** (notificação só avisa — exige re-fetch via `getChargeStatus`) com validação HMAC do header `x-signature`. Capabilities e diferenças vs Asaas explicitadas para o PRD-134 tratar uniformemente |
| **Tipo** | Integração |
| **Complexidade** | Alta |
| **Total de Fases** | 4 |
| **Prioridade** | P0 — gateway paralelo do MVP |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-132 (interface + Asaas — pré-requisito); PRD-100 (Vault); PRD-102 (integration_logs); PRD-133 (PIX consome); PRD-134 (webhook — usa utilities daqui); PRD-136 (tokenização cartão via SDK MP) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | TS estrito; classe `MercadoPagoProvider` em `src/providers/payment/mercadopago/MercadoPagoProvider.ts` |

### Critérios de Complexidade

> **Justificativa de Alta:** Mercado Pago tem três pegadinhas que o Asaas não tem. (1) **Webhook thin:** a notificação traz só `{ type:'payment', data:{ id } }` — o estado real exige `GET /v1/payments/{id}`; quem confiar no corpo da notificação processa dado vazio. (2) **HMAC composto:** `x-signature` valida um *manifest* montado com `data.id` + `x-request-id` + `ts` — errar a ordem ou o formato invalida tudo silenciosamente. (3) **`X-Idempotency-Key` obrigatório** em POST — omitir gera erro; repetir com payload diferente gera conflito. Erro em qualquer um causa pagamento confirmado não-registrado ou cobrança duplicada.

---

## Contexto do Problema

PRD-132 entregou a interface + Asaas. O briefing v1.3 §13.2 exige **Mercado Pago em paralelo** — motivos do cliente:
- Marca que o comprador final do `/loja` reconhece e confia (reduz abandono no checkout)
- Conta MP da Turbo Diesel já existente com histórico
- Redundância: incidente em um gateway não para a operação (mesmo racional do failover WhatsApp, PRD-120)

A implementação precisa caber **exatamente** na interface do PRD-132 — consumidores (133-140B) não enxergam diferença além das `capabilities`.

---

## Conceito da Solução

### Estrutura

```
src/providers/payment/mercadopago/
├── MercadoPagoProvider.ts
├── client.ts           ← Bearer + X-Idempotency-Key + integration_log
├── signature.ts        ← validação HMAC x-signature (manifest)
├── mappers.ts          ← payloads + status mapping MP → canônico
├── errors.ts           ← erros MP → AppError
├── constants.ts        ← base URL, payment_method_ids
└── __tests__/
```

### Autenticação e Idempotência

| Aspecto | Detalhe |
|---------|---------|
| **Auth** | `Authorization: Bearer <ACCESS_TOKEN>` (Vault: `mp_access_token_<storeId>`) |
| **Base URL** | `https://api.mercadopago.com` — único; sandbox por **credenciais de teste** (`TEST-...`), não por URL |
| **Idempotência** | Header `X-Idempotency-Key` **obrigatório** em todo POST. Valor: `crm.payment_charges.idempotency_key` (`'payment-charge:'+orderId+':'+method+':'+attempt`) — retry seguro garantido pelo próprio MP |

### PIX

```typescript
// POST /v1/payments
{
  transaction_amount: 430.00,
  payment_method_id: 'pix',
  description: 'Pedido #PD-2026-0042 — GALLO Base Diesel',
  external_reference: orderId,
  date_of_expiration: '2026-06-09T15:30:00.000-03:00',   // now + expirationMinutes
  payer: {
    email: customer.email ?? placeholderEmail(customer),  // MP exige email
    first_name, last_name,
    identification: { type: 'CPF'|'CNPJ', number: document }
  }
}
// Response →
// point_of_interaction.transaction_data.qr_code          (copia-e-cola)
// point_of_interaction.transaction_data.qr_code_base64   (imagem)
```

**Peculiaridade:** MP **exige** `payer.email`. Customer sem email (comum em B2C de balcão) → gerar placeholder determinístico `cliente+<internalId>@gallodiesel.com.br` e registrar warning no outcome — não bloquear a venda.

### Boleto

`payment_method_id: 'bolbradesco'` + `payer` completo com endereço (boleto registrado exige). Response: `transaction_details.external_resource_url` (PDF) + `barcode.content`. **Linha digitável** não vem separada — derivada do barcode ou usa-se a URL (PRD-135 detalha; capability registra a limitação).

### Cartão

`payment_method_id` do bin + `token` (gerado client-side pelo SDK JS do MP — PRD-136) + `installments` + `payer.identification`. Resposta sincrona: `approved → paid`, `rejected → failed` com `status_detail` mapeado para mensagem pt-BR amigável (`cc_rejected_insufficient_amount` → "Saldo insuficiente", etc.).

### Webhook Thin + HMAC

MP envia:
```json
{ "type": "payment", "action": "payment.updated", "data": { "id": "123456789" } }
```
Headers: `x-signature: ts=1699999999,v1=<hmac>` e `x-request-id`.

Validação (`signature.ts`):
```typescript
// manifest EXATO (ordem e formato fixos):
const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
const expected = hmacSha256(manifest, webhookSecret)   // Vault: mp_webhook_secret_<storeId>
return timingSafeEqual(expected, v1)
```

`parseWebhookEvent` retorna `{ payloadStyle: 'thin', providerChargeId: data.id, eventType: 'payment_updated→other?' }` — **sem status**. PRD-134, ao ver `thin`, chama `provider.getChargeStatus(providerChargeId)` para obter o estado real antes de persistir. Essa é a diferença central vs Asaas, e a interface já a previu (`webhookPayloadStyle`).

### Status Mapping MP → Canônico

| MP `status` | Canônico |
|-------------|----------|
| `pending` / `in_process` | `pending` |
| `approved` | `paid` |
| `rejected` | `failed` |
| `cancelled` | `cancelled` (ou `expired` se `status_detail='expired'`) |
| `refunded` | `refunded` |
| `partially_refunded` | `partially_refunded` |
| `charged_back` | `chargeback` |

`rawStatus` sempre preservado (`status + ':' + status_detail`).

### Refund e Cancel

- Refund: `POST /v1/payments/{id}/refunds` (body `{ amount }` se parcial) — exige `X-Idempotency-Key`
- Cancel: `PUT /v1/payments/{id} { status: 'cancelled' }` — só `pending`/`in_process`

### Capabilities Mercado Pago

```typescript
{
  supportsPix: true,
  supportsBoleto: true,
  supportsCard: true,
  supportsInstallments: true,
  maxInstallments: 12,
  supportsPartialRefund: true,
  supportsCardTokenization: true,        // SDK JS client-side
  webhookAuthMethod: 'hmac',
  webhookPayloadStyle: 'thin'            // ← PRD-134 re-fetch obrigatório
}
```

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Checkout Pro (redirect hospedado MP) | Quebra a UX do wizard PRD-064; API transparente mantém o cliente na `/loja` |
| SDK Node oficial do MP | Camada fina sobre REST; cliente HTTP próprio mantém padrão do projeto (integration_log, AppError, Vault) e paridade com o provider Asaas |
| Confiar no corpo do webhook | Payload thin não traz estado; re-fetch é mandatório por design do MP |
| Sandbox por URL separada | MP não tem; credenciais TEST- no mesmo endpoint — documentado |
| Bloquear venda sem email do payer | Email placeholder determinístico resolve sem atrito; warning registrado |

---

## Escopo

### Incluído

- ✅ `MercadoPagoProvider` implementando `IPaymentProvider` completo
- ✅ `client.ts`: Bearer (Vault sob demanda), `X-Idempotency-Key` em todo POST, timeout 30s, `withIntegrationLog('payment_mercado_pago')`
- ✅ `createPixCharge`: payload + extração de `transaction_data` (qr_code + base64 + expiração)
- ✅ Email placeholder determinístico para payer sem email + warning
- ✅ `createBoletoCharge` (`bolbradesco`) com payer completo; limitação de linha digitável documentada para o PRD-135
- ✅ `createCardCharge` com token + installments + mapeamento de `status_detail` de rejeição para pt-BR
- ✅ `getChargeStatus` (`GET /v1/payments/{id}`) com mapping completo + `rawStatus`
- ✅ `cancelCharge` (PUT status=cancelled, só pending) e `refundCharge` (total/parcial, idempotente)
- ✅ `signature.ts`: parse de `x-signature` (`ts`,`v1`), montagem do manifest exato, HMAC-SHA256 + `timingSafeEqual`
- ✅ `parseWebhookEvent` retornando `payloadStyle:'thin'` + `rawEventId = x-request-id` (fallback `type:data.id:ts`)
- ✅ `healthCheck`: `GET /v1/payment_methods` — 200 healthy / 401 down / 5xx degraded
- ✅ `errors.ts`: 401, 400 (`cause[]`), 409 idempotency conflict, mapeamento de `status_detail` de cartão
- ✅ Capabilities conforme conceito
- ✅ Vault entries: `mp_access_token_<storeId>`, `mp_webhook_secret_<storeId>`
- ✅ Testes unitários: signature (manifest correto/byte alterado/header malformado), mappers (todos os status + status_detail principais), email placeholder, fixtures de webhook
- ✅ Teste integração opt-in com credenciais TEST- (PIX sandbox real) — documentado
- ✅ Documentação `docs/dev/payment-mercadopago.md` + atualização da capabilities matrix em `payment-providers.md`

### Excluído

- ❌ Checkout Pro / Bricks (UI hospedada MP)
- ❌ Tokenização client-side e UI de cartão (PRD-136 — SDK JS lá)
- ❌ Webhook receiver (PRD-134)
- ❌ UI de QR/boleto (PRDs 133/135)
- ❌ Split/marketplace, assinaturas, MP Point (maquininha física) — fora do MVP
- ❌ Conciliação de taxas MP (PRD-139)

---

## Requisitos Funcionais

### Client

- **RF-001:** `mpRequest(method, path, body?, opts?)`: Bearer do Vault sob demanda; `X-Idempotency-Key` obrigatório em POST (de `opts.idempotencyKey` — caller passa o `idempotency_key` da charge); timeout 30s; integration_log sanitizado (token removido, cartão → last4).
- **RF-002:** Base URL única `https://api.mercadopago.com`; `environment` define apenas qual Vault entry usar (token prod vs TEST-).

### PIX

- **RF-010:** `createPixCharge` monta payload conforme conceito; `date_of_expiration = now + input.expirationMinutes` em ISO com offset.
- **RF-011:** Extrai `point_of_interaction.transaction_data`: `qr_code → qrCodePayload`, `qr_code_base64 → qrCodeImageBase64`, expiração → `expiresAt`.
- **RF-012:** Payer sem email → `cliente+<internalId>@gallodiesel.com.br` (determinístico) + warning no retorno; nunca bloqueia.
- **RF-013:** `payer.identification.type` = `'CPF'|'CNPJ'` conforme `documentType`.

### Boleto

- **RF-020:** `createBoletoCharge`: `payment_method_id:'bolbradesco'`, payer com `address` (rua/número/CEP/cidade/UF do customer — obrigatório para registrado); `date_of_expiration` da `dueDate`.
- **RF-021:** Retorna `boletoUrl = transaction_details.external_resource_url`, `barCode = barcode.content`, `digitableLine` derivada do barcode quando possível (senão vazio — PRD-135 trata exibindo URL).

### Cartão

- **RF-030:** `createCardCharge`: `token`, `installments`, `payment_method_id` (vem junto do token no PRD-136), `payer.identification`.
- **RF-031:** `approved → paid` sincrono; `rejected → failed` com `failureReason` mapeado de `status_detail`:
  - `cc_rejected_insufficient_amount` → "Saldo/limite insuficiente"
  - `cc_rejected_bad_filled_security_code` → "CVV inválido"
  - `cc_rejected_bad_filled_date` → "Validade inválida"
  - `cc_rejected_call_for_authorize` → "Autorize a compra com seu banco"
  - `cc_rejected_high_risk` → "Pagamento recusado por segurança"
  - demais → "Pagamento recusado — tente outro cartão"

### Status / Cancel / Refund

- **RF-040:** `getChargeStatus`: GET `/v1/payments/{id}`; mapping da tabela do conceito; `rawStatus = status+':'+status_detail`; `paidAmount = transaction_amount`, `paidAt = date_approved`.
- **RF-041:** `cancelCharge`: `PUT { status:'cancelled' }`; pago → AppError "use refund" (paridade com Asaas RF-071).
- **RF-042:** `refundCharge`: POST `/refunds` com `X-Idempotency-Key` próprio (`'refund:'+chargeId+':'+amount`); parcial via `{ amount }`; mapeia `RefundResult`.

### Webhook Utilities

- **RF-050:** `verifyWebhookAuth(rawBody, headers)`:
  1. Parse `x-signature` → `ts`, `v1` (formato `ts=...,v1=...`); malformado → false
  2. `dataId` extraído do body (`data.id`, lowercase se alfanumérico — regra MP)
  3. Manifest exato: `` `id:${dataId};request-id:${headers['x-request-id']};ts:${ts};` ``
  4. HMAC-SHA256 com `mp_webhook_secret_<storeId>` (Vault) + `timingSafeEqual`
- **RF-051:** `parseWebhookEvent(rawPayload)`:
  - `type !== 'payment'` → `null` (PRD-134 ignora merchant_order etc.)
  - Retorna `{ provider:'mercado_pago', eventType:'other', providerChargeId: data.id, payloadStyle:'thin', rawEventId, rawPayload }` — **sem status** (re-fetch no PRD-134)
- **RF-052:** Documentar contrato no código: consumidor que receber `payloadStyle:'thin'` DEVE chamar `getChargeStatus` antes de persistir.

### Health / Erros

- **RF-060:** `healthCheck`: `GET /v1/payment_methods` (leve, autenticado).
- **RF-061:** `errors.ts`: 401 → UNAUTHORIZED; 400 `cause[]` → VALIDATION_ERROR (primeira description, traduzida quando código conhecido); 409 → CONFLICT "Requisição duplicada (idempotency)"; 429 → RATE_LIMITED; 5xx → INTEGRATION_ERROR.

### Testes

- **RF-070:** Unitários: signature (4 casos: válido, byte alterado no body, ts trocado, header malformado); manifest byte-a-byte contra exemplo oficial; mappers (7 status + 6 status_detail); email placeholder determinístico; parseWebhookEvent (payment / merchant_order→null).
- **RF-071:** Integração opt-in: PIX com token TEST-, QR gerado, getChargeStatus — documentado.

### Documentação

- **RF-080:** `docs/dev/payment-mercadopago.md`: onboarding (credenciais prod/TEST, configurar webhook + secret no painel), manifest da assinatura explicado, payload thin e a regra de re-fetch, tabela status/status_detail, troubleshooting (assinatura falhando = checar ordem do manifest).
- **RF-081:** Atualizar capabilities matrix em `payment-providers.md` (Asaas × MP × Mock).

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança):** access token e webhook secret só no Vault; manifest HMAC com `timingSafeEqual`.
- **RNF-002 (Idempotência):** `X-Idempotency-Key` em 100% dos POST; retry de rede nunca duplica cobrança/refund.
- **RNF-003 (Paridade de contrato):** qualquer consumidor que funciona com Asaas funciona com MP trocando só o `defaultProvider` (exceto comportamentos flagados em capabilities).
- **RNF-004 (Auditabilidade):** integration_log em 100%; `rawStatus` sempre persistido.
- **RNF-005 (Performance):** createPixCharge < 2.5s p95 (1 chamada — MP retorna QR inline, diferente do Asaas).

---

## Critérios de Aceitação

### RF-050: HMAC do Webhook

```gherkin
DADO secret 'WSK' no Vault, body { type:'payment', data:{ id:'123' } },
     headers x-request-id='req-9', x-signature='ts=111,v1=<hmac>'
QUANDO v1 = HMAC-SHA256('id:123;request-id:req-9;ts:111;', 'WSK')
  E verifyWebhookAuth é chamado
ENTÃO retorna true

QUANDO um byte do body muda (data.id='124') mantendo a assinatura
ENTÃO manifest diverge E retorna false

QUANDO x-signature está malformado (sem 'v1=')
ENTÃO retorna false sem exception
```

### RF-051 + RF-052: Thin Payload

```gherkin
DADO webhook MP { type:'payment', data:{ id:'987' } }
QUANDO parseWebhookEvent
ENTÃO retorna payloadStyle='thin', providerChargeId='987', SEM status
  E o consumidor (PRD-134) é obrigado a chamar getChargeStatus('987')
  E só então persiste o estado real

DADO webhook { type:'merchant_order', ... }
QUANDO parseWebhookEvent
ENTÃO retorna null (ignorado)
```

### RF-012: Email Placeholder

```gherkin
DADO customer balcão sem email (internalId='c-55')
QUANDO createPixCharge
ENTÃO payer.email = 'cliente+c-55@gallodiesel.com.br'
  E cobrança criada normalmente
  E warning 'PAYER_EMAIL_PLACEHOLDER' no retorno
```

### RF-031: Rejeição de Cartão Amigável

```gherkin
DADO MP responde status='rejected', status_detail='cc_rejected_insufficient_amount'
QUANDO createCardCharge
ENTÃO CardChargeResult { status:'failed', failureReason:'Saldo/limite insuficiente' }
  E rawStatus='rejected:cc_rejected_insufficient_amount' preservado para audit
```

---

## Fases de Implementação

### Fase 1 — Client + Erros (1 dia)
- client.ts (Bearer + X-Idempotency-Key + integration_log)
- errors.ts + testes

### Fase 2 — Cobranças (1.5 dias)
- PIX (transaction_data) + email placeholder
- Boleto (bolbradesco) + Cartão (status_detail map)
- getChargeStatus / cancel / refund

### Fase 3 — Webhook Utils (1 dia)
- signature.ts (manifest + HMAC + timingSafeEqual)
- parseWebhookEvent thin
- Fixtures + testes byte-a-byte

### Fase 4 — Sandbox + Docs (0.5 dia)
- Teste TEST- documentado
- payment-mercadopago.md + matrix atualizada
- `_DONE`

---

## Dependências

- **Depende de:** PRD-132 (interface, factory, schema, Vault pattern), PRD-100, PRD-102
- **Bloqueia:** PRD-133 (PIX multi-provider), PRD-134 (webhook precisa das utilities de AMBOS os providers), PRDs 135-140B
- **Decisões Pendentes:**
  - Conta MP da Turbo Diesel: confirmar acesso às credenciais prod + gerar TEST-
  - Domínio do email placeholder (`gallodiesel.com.br` sugerido — confirmar)
  - Linha digitável de boleto MP: derivar do barcode vs exibir só URL (PRD-135 decide; capability já registra)

---

## Considerações de Segurança

- Access token e webhook secret exclusivamente no Vault; resolução sob demanda
- Manifest HMAC validado com `timingSafeEqual` — ordem e formato exatos testados byte-a-byte
- Payload thin é também proteção: mesmo webhook forjado que passe não injeta estado — o estado vem do re-fetch autenticado
- Cartão: token only; `status_detail` de risco (`cc_rejected_high_risk`) exposto ao usuário de forma genérica (não ensinar fraudador)
- Email placeholder não vaza PII (usa internalId, não documento)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.2; CHANGELOG; renomear `PRD-132B-payment-mercadopago_DONE.md`; teste TEST- documentado.

| Princípio | Descrição |
|-----------|-----------|
| **Thin = re-fetch sempre** | Nunca persistir estado vindo do corpo da notificação |
| **Manifest é sagrado** | `id:...;request-id:...;ts:...;` — ordem, lowercase, ponto-e-vírgula final |
| **X-Idempotency-Key em todo POST** | Inclusive refunds, com key própria |
| **Paridade com Asaas** | Mesmo contrato, capabilities flagam o resto |

| ❌ Evitar |
|-----------|
| Processar webhook sem re-fetch (thin!) |
| Montar manifest "de cabeça" sem teste byte-a-byte |
| POST sem X-Idempotency-Key |
| Bloquear venda por falta de email do payer |
| Expor status_detail cru de risco ao usuário |
| URL de sandbox inventada (MP não tem — é credencial TEST-) |

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
