# PRD-134: Payment Webhook (Confirmação Multi-Provider)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/payment-webhook/`_ |
| **Objetivo** | Fechar o ciclo de pagamento: Edge Function que recebe webhooks de **ambos** os gateways, roteados por path (`/asaas/<storeId>` e `/mercadopago/<storeId>`), valida autenticidade conforme o provider (token estático Asaas via `timingSafeEqual`; HMAC manifest MP), garante idempotência via `processed_events`, trata o **payload thin do MP com re-fetch obrigatório** (`getChargeStatus`), e executa a cascata: `crm.payment_charges.status` → `crm.orders.payment_status` → Realtime → UI do PRD-133 transiciona ao vivo. Este PRD é o **escritor único do status `paid`**. Inclui a guarda `paid-after-local-expiry` prometida no PRD-133, tratamento de refund/chargeback iniciados no painel do gateway, e divergência de valor pago |
| **Tipo** | Integração |
| **Complexidade** | Crítica |
| **Total de Fases** | 5 |
| **Prioridade** | P0 — sem webhook, nenhum pagamento é confirmado; o PIX do PRD-133 fica eternamente "aguardando" |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-132 (utilities Asaas: `verifyWebhookAuth`/`parseWebhookEvent` full); PRD-132B (utilities MP: HMAC + thin); PRD-133 (cria charges; UI que reage); PRD-114 (padrão de webhook unificado — espelhado); PRD-102 (`withIdempotency`, `processed_events`, audit); PRD-105 (Realtime propaga); PRD-110 (alerta de chargeback); PRD-135 (boleto: overdue→paid); PRD-138 (refund — consome transições daqui); PRD-139 (conciliação — consome `payment_amount_mismatch`); PRD-047 F1 (comissão — ponto de extensão pós-pagamento) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function `supabase/functions/payment-webhook/index.ts`, padrão `_shared` do PRD-102, espelhando a estrutura do PRD-114 |

### Critérios de Complexidade

> **Justificativa de Crítica:** é a porta por onde **dinheiro confirmado** entra no sistema — e recebe payload do mundo. Falso positivo (webhook forjado aceito) = pedido liberado sem pagamento; falso negativo (webhook legítimo rejeitado) = cliente pagou e o pedido não anda. Soma as armadilhas dos dois gateways: Asaas retenta agressivamente (idempotência obrigatória), MP manda payload thin (confiar no corpo = processar vazio; o estado real exige re-fetch autenticado). Transições de estado não são lineares (overdue→paid é válida para boleto; expired→paid é válida na guarda; paid→refunded/chargeback vêm de fora). A resolução de store **antes** de poder validar a assinatura é o problema do ovo-e-galinha resolvido via storeId no path.

---

## Contexto do Problema

PRD-133 deixou o cliente olhando um QR com "Aguardando pagamento...". O cliente paga no app do banco. E aí:

1. O gateway (Asaas ou MP) detecta o crédito e dispara webhook para nossa URL
2. Precisamos: autenticar, deduplicar, descobrir qual charge é, obter o estado **real**, persistir, propagar
3. A UI transiciona para "✓ Pagamento confirmado" sem o cliente tocar em nada
4. O pedido sai de `pending_payment` → `paid` e o fulfillment pode começar

Sem este PRD, a Onda 7 cria cobranças que nunca se confirmam. Com ele mal-feito, confirmamos pagamentos que não existem.

**O problema do ovo-e-galinha:** o webhook chega sem dizer de qual store é — mas o segredo para validar a assinatura é **por store** (`payment_config`). Não dá para procurar a charge antes de confiar no payload, e não dá para validar sem saber a store. Solução: **storeId no path da URL** configurada no painel de cada gateway (`/payment-webhook/asaas/<storeId>`). A URL é, ela própria, parte da configuração segura.

---

## Conceito da Solução

### Arquitetura

```
[Asaas]  POST /functions/v1/payment-webhook/asaas/<storeId>
[MP]     POST /functions/v1/payment-webhook/mercadopago/<storeId>
                          │
                          ▼
┌────────────────────────────────────────────────────────────┐
│ payment-webhook                                             │
│                                                             │
│ 1. Parse path → provider + storeId                          │
│ 2. Valida store existe + payment_config presente            │
│ 3. provider via factory (override = provider do path)       │
│ 4. provider.verifyWebhookAuth(rawBody, headers) → 403 se ✗  │
│ 5. provider.parseWebhookEvent(payload) → null? 200 ignore   │
│ 6. withIdempotency('payment-webhook:'+provider+':'+eventId) │
│ 7. payloadStyle:                                            │
│      'full' (Asaas) → status já no evento                   │
│      'thin' (MP)    → getChargeStatus(providerChargeId) ◄── re-fetch
│ 8. Lookup charge por (provider_charge_id, store_id)         │
│ 9. Máquina de transições (RF-050)                           │
│ 10. UPDATE payment_charges + cascata orders (se paid/refund)│
│ 11. Pontos de extensão pós-pagamento (stubs)                │
│ 12. Audit + 200 OK                                          │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼ Realtime (PRD-105)
        PixPaymentPanel transiciona "✓ Pagamento confirmado"
```

### Máquina de Transições

| De → Para | Gatilho | Ação na cascata |
|-----------|---------|-----------------|
| `pending → paid` | payment_confirmed | `orders.payment_status='paid'`, `orders.paid_at`, extensões |
| `pending → overdue` | payment_overdue (boleto) | só a charge; order intacto (boleto vencido ainda é pagável) |
| `overdue → paid` | payment_confirmed após vencimento | **válida** — boleto pago com multa/juros; cascata normal |
| `expired → paid` | **guarda paid-after-local-expiry** | cron local expirou, mas o dinheiro entrou: reverte para `paid`, cascata normal, audit `paid_after_local_expiry` |
| `paid → refunded` / `paid → partially_refunded` | payment_refunded (refund feito no painel do gateway) | `orders.payment_status='refunded'`, audit; PRD-138 consome |
| `paid → chargeback` | payment_chargeback | charge atualizada, **alerta crítico Owner** (PRD-110), order intacto (decisão humana) |
| `paid → paid` (re-entrega) | idempotência já barrou; se escapou, UPDATE noop | nada — transição idempotente |
| qualquer → estado anterior (regressão) | — | **rejeitada**: paid nunca volta a pending; log warning |

**Princípio:** o gateway é a verdade final sobre dinheiro. Nosso estado local (`expired` pelo cron) cede quando o gateway diz `paid`.

### Divergência de Valor

`paid_amount ≠ charge.amount` (PIX pago com valor editado, taxa descontada, etc.): **aceita o pagamento** (status `paid`, `paid_amount` real persistido), mas registra audit `payment_amount_mismatch { expected, received, delta }`. A conciliação (PRD-139) lista essas divergências para o financeiro decidir. Bloquear aqui travaria pedidos por centavos de taxa.

### Charge Não Encontrada

`provider_charge_id` sem match local: 200 OK + audit `payment_webhook_orphan` (warning). Causas legítimas: cobrança criada direto no painel do gateway (fora do sistema), ambiente cruzado (webhook de sandbox apontado para prod), charge de antes do go-live. Nunca 4xx/5xx — o gateway retentaria para sempre.

### Pontos de Extensão Pós-Pagamento

No `pending→paid`, após a cascata, hooks **stub** declarados (não implementados aqui):

```typescript
// post-payment-hooks.ts — cada um é try/catch isolado; falha não desfaz o paid
await runPostPaymentHooks(charge, order, ctx)
// → notifyCustomerPaymentConfirmed(order)   // Onda 8 (PRD-141/143): stub → audit 'hook_skipped_no_notifications'
// → triggerCommissionCalculation(order)      // PRD-047 real cálculo: stub → audit
// → triggerFulfillmentStart(order)           // operacional futuro: stub → audit
```

Paridade com o padrão do PRD-129 RF-060 (Resend stub): registrar a intenção, nunca bloquear o pagamento.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| storeId descoberto via lookup da charge antes da validação | Confiar em payload não-autenticado para resolver o segredo = inversão insegura; path resolve |
| Webhook único sem provider no path (detectar por header) | Headers são forjáveis; path explícito + secret por store é determinístico |
| Confiar no corpo do webhook MP | Payload thin não traz estado; design do MP exige re-fetch (PRD-132B RF-052) |
| Bloquear pagamento com valor divergente | Trava pedido por taxa/centavos; aceitar + audit + conciliação (PRD-139) é o correto |
| Implementar comissão/notificação aqui | Acoplamento; hooks stub mantêm o webhook enxuto e os PRDs donos implementam |
| 4xx para charge órfã | Gateway retenta infinitamente; 200 + audit é o padrão (mesmo racional do PRD-114 RF-090) |

---

## Escopo

### Incluído

- ✅ Edge Function `supabase/functions/payment-webhook/index.ts` com roteamento `/asaas/<storeId>` e `/mercadopago/<storeId>`
- ✅ Migration aditiva: `crm.orders.paid_at timestamptz`
- ✅ Validação de store + `payment_config` antes de qualquer processamento (path inválido → 404 genérico)
- ✅ Validação de autenticidade delegada ao provider: `verifyWebhookAuth` (Asaas token estático / MP HMAC manifest — PRDs 132/132B) → 403 em falha + log warning
- ✅ Idempotência via `withIdempotency('payment-webhook:'+provider+':'+rawEventId)` + `processed_events`
- ✅ Re-fetch obrigatório para `payloadStyle='thin'` (MP): `provider.getChargeStatus(providerChargeId)` antes de qualquer persistência
- ✅ Lookup da charge por `(provider_charge_id, store_id)`; órfã → 200 + audit warning
- ✅ Máquina de transições completa (tabela do conceito), incluindo `overdue→paid` e a guarda `expired→paid` (`paid_after_local_expiry`)
- ✅ Rejeição de regressões (paid→pending) com log
- ✅ Cascata: UPDATE `payment_charges` (status, paid_amount, paid_at, `webhook_event_ids` append) → UPDATE `crm.orders` (`payment_status`, `paid_at`) quando aplicável
- ✅ Divergência de valor: aceita + audit `payment_amount_mismatch`
- ✅ Refund via gateway: `paid→refunded/partially_refunded` + cascata + audit
- ✅ Chargeback: charge atualizada + **alerta crítico Owner** via PRD-110 + audit
- ✅ Pontos de extensão pós-pagamento (`post-payment-hooks.ts`) com 3 stubs isolados em try/catch
- ✅ Resposta 200 OK em < 3s p95; 200 mesmo em warnings; 403 só em auth inválida; 404 só em path/store inválido
- ✅ Configuração documentada: cadastrar URL no painel Asaas (Webhooks + token) e MP (Notificações + secret), uma por store
- ✅ Testes: roteamento, auth por provider (fixtures reais), idempotência, thin re-fetch, cada transição da máquina (incluindo guarda e regressão), divergência de valor, órfã, hooks isolados
- ✅ Teste E2E com MockPaymentProvider: criar charge (133) → simular webhook → painel transiciona
- ✅ Documentação `docs/dev/payment-webhook.md`

### Excluído

- ❌ Refund **iniciado pelo sistema** (PRD-138 — aqui só refund vindo do gateway)
- ❌ Conciliação de divergências (PRD-139 — aqui só o registro)
- ❌ Implementação real dos hooks pós-pagamento (Onda 8 + PRD-047; stubs aqui)
- ❌ Notificação ao cliente (Onda 8)
- ❌ Webhook de boleto overdue por cron local (PRD-135 — aqui só o evento vindo do gateway)
- ❌ Retry/polling ativo de status (webhook é push; polling de contingência fica para PRD-139 se necessário)
- ❌ Disputa/mediação de chargeback (processo manual no painel do gateway)

---

## Requisitos Funcionais

### Roteamento e Resolução de Store

- **RF-001:** Aceita POST em `/functions/v1/payment-webhook/<provider>/<storeId>`, `provider ∈ {asaas, mercadopago}`.
- **RF-002:** Provider desconhecido ou `storeId` malformado → 404 genérico.
- **RF-003:** Store inexistente, inativa ou sem `payment_config` → 404 genérico + log warning (não revelar qual condição falhou).
- **RF-004:** Factory com override: `getPaymentProvider(storeId, providerDoPath)` — ignora o `defaultProvider` da config (webhook sabe de onde veio; a store pode ter trocado o default com charges antigas do outro gateway ainda vivas).

### Autenticação

- **RF-010:** `provider.verifyWebhookAuth(rawBody, headers)`:
  - Asaas: header `asaas-access-token` vs Vault `asaas_webhook_token_<storeId>` (`timingSafeEqual`) — PRD-132 RF-080
  - MP: `x-signature` (ts, v1) + manifest `id:...;request-id:...;ts:...;` + HMAC do Vault — PRD-132B RF-050
- **RF-011:** Falha → 403 + audit `payment_webhook_auth_failed { provider, storeId, ip }`. Sem corpo detalhado.
- **RF-012:** rawBody lido **uma vez** antes de qualquer parse (HMAC valida bytes originais — mesmo cuidado do PRD-114).

### Parse e Idempotência

- **RF-020:** `provider.parseWebhookEvent(payload)`:
  - `null` (evento irrelevante, ex: `merchant_order` do MP) → 200 `{ status:'ignored' }`
  - `eventType:'other'` → 200 + audit `payment_webhook_unmapped` (visibilidade de eventos novos)
- **RF-021:** `eventKey = 'payment-webhook:'+provider+':'+event.rawEventId`; `withIdempotency` — replay retorna 200 cached < 100ms sem reprocessar.

### Re-fetch Thin (MP)

- **RF-030:** Se `event.payloadStyle === 'thin'`:
  1. `provider.getChargeStatus(event.providerChargeId)` (autenticado, timeout 15s)
  2. Status/paidAmount/paidAt vêm **exclusivamente** do re-fetch
  3. Re-fetch falhou (rede/5xx) → **500** (exceção à regra do 200: MP retenta com backoff e o evento ainda não foi marcado em `processed_events` — replay futuro completa)
- **RF-031:** `payloadStyle === 'full'` (Asaas): status do evento usado direto; `getChargeStatus` **não** é chamado (economia + o evento full é assinado).

### Lookup e Máquina de Transições

- **RF-040:** Charge por `(provider_charge_id = event.providerChargeId, store_id)`:
  - Não achou → 200 + audit `payment_webhook_orphan { providerChargeId, eventType }`.
- **RF-050:** Transições válidas (executar) e inválidas (logar e ignorar) conforme tabela do conceito. Implementação como função pura `resolveTransition(currentStatus, incomingStatus): { action: 'apply'|'noop'|'reject', flags?: ['paid_after_local_expiry'] }` — testável isoladamente.
- **RF-051:** `expired → paid`: aplica + flag → audit `paid_after_local_expiry { chargeId, expiredAt, paidAt }`.
- **RF-052:** Regressão (`paid → pending` etc.): `reject` → log warning `payment_webhook_regression_rejected` + 200 OK (estado local intacto).

### Cascata de Persistência

- **RF-060:** UPDATE `crm.payment_charges`:
  - `status`, `paid_amount`, `paid_at` (do evento full ou do re-fetch)
  - `webhook_event_ids = array_append(webhook_event_ids, eventKey)`
  - `refunded_amount`/`refunded_at` quando refund
- **RF-061:** Se transição resultou em `paid`: UPDATE `crm.orders SET payment_status='paid', paid_at=<paidAt>` WHERE `id=charge.order_id AND payment_status='pending_payment'` — o WHERE guarda contra corrida com "Marcar como pago" manual (PRD-133 RF-093): se já está `paid` manual, charge atualiza, order fica como está, audit nota `order_already_paid_manually`.
- **RF-062:** Se `refunded/partially_refunded`: `orders.payment_status='refunded'` (total) ou mantém `paid` + audit (parcial — PRD-138 define política fina; aqui o conservador).
- **RF-063:** `chargeback`: charge atualizada; order **intacto** (reversão de fulfillment é decisão humana); alerta crítico.
- **RF-064:** Charge + order no mesmo bloco transacional (consistência).

### Divergência de Valor

- **RF-070:** `paidAmount` presente e `|paidAmount - charge.amount| > 0.01` → aplica `paid` normalmente + audit `payment_amount_mismatch { chargeId, expected, received, delta }`. Nunca bloqueia.

### Hooks Pós-Pagamento

- **RF-080:** `post-payment-hooks.ts` com `runPostPaymentHooks(charge, order, ctx)` executado **após** commit da cascata, cada hook em try/catch isolado:
  - `notifyCustomerPaymentConfirmed` → stub: audit `hook_skipped_no_notifications` (Onda 8 substitui)
  - `triggerCommissionCalculation` → stub: audit `hook_skipped_commission_pending_prd047`
  - `triggerFulfillmentStart` → stub: audit
- **RF-081:** Falha em hook **jamais** reverte o `paid` nem altera o response.

### Alertas

- **RF-090:** `chargeback` → alerta crítico Owner via PRD-110 (email): charge, order, valor, link.
- **RF-091:** `payment_webhook_auth_failed` ≥ 5 em 10min para a mesma store → alerta warning (possível ataque ou secret rotacionado sem atualizar Vault).

### Response

- **RF-100:** 200 `{ status:'ok'|'ignored', traceId }` em processamento completo, órfã, unmapped, regressão.
- **RF-101:** 403 apenas auth inválida; 404 apenas path/store inválido; 500 apenas re-fetch thin falho (RF-030) ou erro catastrófico — caminhos onde o retry do gateway é desejado.

### Configuração Externa

- **RF-110:** Documentar por store:
  - **Asaas:** Painel → Integrações → Webhooks: URL `<supabase>/functions/v1/payment-webhook/asaas/<storeId>`, token = valor do Vault, eventos: `PAYMENT_RECEIVED, PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_REFUNDED, PAYMENT_CHARGEBACK_REQUESTED`
  - **MP:** Painel → Notificações → Webhooks: URL `.../mercadopago/<storeId>`, tópico `payment`, copiar a assinatura secreta para o Vault

### Testes

- **RF-120:** Unitários: `resolveTransition` (matriz completa: 8 transições válidas + regressões), auth fixtures reais dos dois providers (válida/byte alterado/header ausente), parse→ignored, divergência.
- **RF-121:** Integração (mock): full path Asaas (evento full → paid direto); full path MP (thin → re-fetch → paid); idempotência (replay); órfã; guarda expired→paid; corrida com pago-manual (RF-061).
- **RF-122:** E2E: charge do PRD-133 em painel aberto → webhook simulado → painel "✓ Confirmado" < 3s.

### Documentação

- **RF-130:** `docs/dev/payment-webhook.md`: arquitetura, ovo-e-galinha do storeId-no-path, full vs thin, máquina de transições (diagrama), configuração nos painéis, troubleshooting (auth falhando = checar token/secret no Vault e URL; MP sem confirmar = checar tópico `payment`).

---

## Requisitos Não-Funcionais

- **RNF-001 (Segurança):** nenhum byte do payload processado antes da autenticação; rawBody validado byte-a-byte.
- **RNF-002 (Idempotência):** replay nunca duplica cascata; `processed_events` + transições idempotentes.
- **RNF-003 (Escritor único):** `paid` em `orders.payment_status` nasce aqui (exceto manual explícito do PRD-032, com guarda de corrida RF-061).
- **RNF-004 (Performance):** full < 1.5s p95; thin (com re-fetch) < 3s p95.
- **RNF-005 (Dinheiro nunca ignorado):** `expired→paid` e `overdue→paid` sempre aceitas; divergência de valor nunca bloqueia.
- **RNF-006 (Auditabilidade):** todo evento → 1+ entradas de audit; `webhook_event_ids` reconstrói a linha do tempo da charge.

---

## Critérios de Aceitação

### RF-030: Thin Re-fetch (MP)

```gherkin
DADO webhook MP { type:'payment', data:{ id:'987' } } com x-signature válida
QUANDO processado
ENTÃO getChargeStatus('987') é chamado ANTES de qualquer persistência
  E o status persistido vem do re-fetch (approved → paid)
  E nada do corpo da notificação é usado como estado

DADO o re-fetch falha (MP 500)
QUANDO processado
ENTÃO response 500 (MP vai retentar)
  E processed_events NÃO marca o evento (replay futuro completa)
```

### RF-050 + RF-051: Guarda Expired→Paid

```gherkin
DADO charge C1 marcada 'expired' pelo cron local (PRD-133) há 2min
QUANDO webhook confirma pagamento de C1 (cliente pagou no último segundo)
ENTÃO C1.status='paid', paid_at preenchido
  E orders.payment_status='paid'
  E audit 'paid_after_local_expiry'
  E painel aberto transiciona para "✓ Confirmado"
```

### RF-061: Corrida com Pagamento Manual

```gherkin
DADO seller marcou O1 como pago manualmente (PRD-032) às 14:00
  E webhook do PIX da mesma O1 chega às 14:01
QUANDO processado
ENTÃO charge.status='paid' (atualizada normalmente)
  E orders.payment_status permanece 'paid' (WHERE pending_payment não bate)
  E audit 'order_already_paid_manually'
  E nenhum erro
```

### RF-021: Idempotência

```gherkin
DADO evento Asaas processado (charge paid, order paid)
QUANDO o MESMO evento chega de novo (retry Asaas)
ENTÃO withIdempotency retorna 200 cached em < 100ms
  E zero UPDATEs adicionais
```

### RF-070: Divergência de Valor

```gherkin
DADO charge de R$ 430,00 e webhook confirmando R$ 429,57 recebidos
QUANDO processado
ENTÃO status='paid', paid_amount=429.57
  E audit payment_amount_mismatch { expected:430.00, received:429.57, delta:-0.43 }
  E order liberado normalmente (PRD-139 lista para o financeiro)
```

---

## Fases de Implementação

### Fase 1 — Roteamento + Auth + Schema (1 dia)
- Path parsing, resolução de store, 404 genérico
- Migration `orders.paid_at`
- Delegação de auth aos providers + 403/audit

### Fase 2 — Parse + Idempotência + Thin (1.5 dias)
- parseWebhookEvent → ignored/unmapped
- withIdempotency
- Re-fetch thin com 500-em-falha (RF-030)

### Fase 3 — Máquina de Transições + Cascata (2 dias)
- `resolveTransition` pura + matriz de testes
- UPDATE charge + order transacional + guarda de corrida
- Divergência, órfã, regressão

### Fase 4 — Hooks + Alertas (1 dia)
- post-payment-hooks stubs isolados
- Chargeback → alerta crítico; auth-fail repetido → warning

### Fase 5 — E2E + Configuração + Docs (1 dia)
- E2E painel transiciona
- Cadastro nos painéis (sandbox) documentado com prints
- payment-webhook.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-132 + 132B (utilities de auth/parse + getChargeStatus), PRD-133 (charges existem; UI reage), PRD-102 (idempotency, audit), PRD-105 (Realtime), PRD-110 (alertas)
- **Bloqueia:** PRD-135 (boleto paid/overdue passa por aqui), PRD-138 (refund consome transições), PRD-139 (conciliação consome mismatches), PRD-140B
- **Decisões Pendentes:**
  - Refund **parcial** via gateway: manter order `paid` + audit (conservador, sugerido) vs estado próprio — PRD-138 fecha
  - Threshold de divergência para alerta ativo (audit sempre; alerta só se `|delta| > R$ 1,00`? — sugerido sim)
  - Janela do alerta de auth-fail (5 em 10min sugerido)

---

## Considerações de Segurança

- Autenticação **antes** de qualquer parse de negócio; rawBody íntegro para HMAC
- storeId no path não é segredo — é roteamento; o segredo (token/HMAC secret) é por store no Vault
- Payload thin do MP é defesa em profundidade: webhook forjado que passasse não injeta estado (re-fetch autenticado é a fonte)
- 404/403 genéricos; nenhum detalhe de validação vazado
- `paid` com escritor único + guarda de corrida explícita
- Chargeback alerta humano — nunca reversão automática de fulfillment

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.4; CHANGELOG; renomear `PRD-134-payment-webhook_DONE.md`; E2E com painel transicionando gravado/documentado; URLs cadastradas nos painéis sandbox.

| Princípio | Descrição |
|-----------|-----------|
| **Thin = re-fetch, sempre** | Corpo da notificação MP jamais vira estado |
| **Dinheiro vence o estado local** | expired→paid e overdue→paid aplicam |
| **Idempotência antes de tudo** | processed_events na frente da cascata |
| **storeId no path** | Resolve o ovo-e-galinha do segredo por store |
| **Hooks nunca desfazem paid** | try/catch isolado, stub audita |

| ❌ Evitar |
|-----------|
| Processar antes de autenticar |
| Usar corpo thin como estado |
| 4xx/5xx em órfã/unmapped (retry eterno) |
| Bloquear paid por divergência de centavos |
| Regressão paid→pending |
| Reverter fulfillment em chargeback automaticamente |

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
| 09/06/2026 | v1 | Criação inicial — Sub-lote 4b do Lote 4 (Onda 7) |

---

**AILA - Sistemas Inteligentes**
