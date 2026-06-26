# PRD-136: Cartão de Crédito (Multi-Provider)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `payment-create-charge/handlers/card.ts` + `src/features/payments/card/`_ |
| **Objetivo** | Terceiro método de pagamento: cartão de crédito com **tokenização client-side** (dados do cartão jamais tocam nossos servidores — PCI scope mínimo). `CardPaymentForm` no checkout da /loja (e venda assistida no /app) com máscara, detecção de bandeira por BIN e seletor de parcelas (valores do PRD-137). Handler `card` na Edge Function do PRD-133 recebe **apenas o token** + parcelas e despacha `provider.createCardCharge`. Aprovação é **síncrona** — `approved → paid` na hora, o que exige um **DELTA declarado sobre o PRD-134** (escritor único vira dois escritores coordenados e idempotentes). Rejeição com mensagem amigável + retry com outro cartão. Diferença de maturidade entre os providers tratada por capability |
| **Tipo** | Integração |
| **Complexidade** | Crítica |
| **Total de Fases** | 5 |
| **Prioridade** | P1 — pendente decisão do cliente (P0 vs P1, registrada no INDEX); arquitetura entregue independente |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-132 (`createCardCharge` Asaas + capability `supportsCardTokenization`); PRD-132B (MP: token via SDK JS + mapeamento `status_detail`); PRD-133 (Edge host + dual-context + painel base); PRD-134 (**DELTA**: escritor de `paid`); PRD-137 (plano de parcelas — consome); PRD-138 (refund de cartão); PRD-140 (anti-fraude — consome sinais daqui); PRD-064 F1 (checkout host) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Tokenizers por provider em `src/features/payments/card/tokenizers/`; handler em Edge Function; zero dado de cartão em Edge/DB/log |

### Critérios de Complexidade

> **Justificativa de Crítica:** cartão é o método com maior superfície regulatória (PCI-DSS) e maior taxa de falha legítima (recusas do emissor). Três riscos distintos: (1) **vazamento de PAN** — um único `console.log` do formulário em produção é incidente PCI; a arquitetura inteira existe para que o número do cartão viva apenas no browser, dentro do SDK do gateway; (2) **dupla escrita de `paid`** — aprovação síncrona + webhook subsequente do mesmo pagamento exigem coordenação idempotente explícita, senão a cascata roda duas vezes; (3) **assimetria de providers** — MP tem SDK JS de tokenização maduro; Asaas historicamente recebe cartão server-side, o que mudaria nosso scope PCI — tratado como capability com gate de implementação, nunca como "passa pelo Edge e pronto".

---

## Contexto do Problema

O passo 3 do checkout (PRD-064) lista "Cartão de crédito — integração disponível na Fase 2". Para o B2C da /loja (peça avulsa, caminhoneiro na estrada), cartão parcelado é frequentemente o único meio viável de fechar um carrinho de R$ 1.500.

O desafio não é chamar a API — é fazê-lo **sem nunca ver o cartão**:

```
┌─ Browser do cliente ─────────────────────────────┐
│  CardPaymentForm                                   │
│  número/validade/CVV/nome  ──► SDK do gateway      │
│                                  │                 │
│                                  ▼                 │
│                            token opaco             │
└──────────────────────────────────┬────────────────┘
                                   │ só o token viaja
                                   ▼
                    payment-create-charge (Edge)
                                   │
                                   ▼
                    provider.createCardCharge(token, installments)
                                   │
                          approved │ rejected
                                   ▼
                        paid síncrono │ mensagem amigável + retry
```

Nosso backend conhece: `token`, `last4`, `brand`, `installments`. Nada mais. PCI SAQ-A.

---

## Conceito da Solução

### Tokenizers por Provider

```typescript
// src/features/payments/card/tokenizers/ICardTokenizer.ts
export interface ICardTokenizer {
  readonly providerName: 'asaas' | 'mercado_pago'
  /** Carrega o SDK do gateway (script tag dinâmica) — uma vez por sessão */
  init(publicKey: string): Promise<void>
  /** Tokeniza NO BROWSER. Dados nunca saem do closure do SDK. */
  tokenize(card: CardFormData): Promise<CardToken>
}

export interface CardFormData {
  number: string          // vive só no form → SDK; jamais em state global/log
  holderName: string
  expMonth: string
  expYear: string
  cvv: string
  holderDocument: string  // CPF/CNPJ do titular (antifraude do gateway)
}

export interface CardToken {
  token: string
  brand: string           // visa, master, elo, amex, hipercard
  last4: string
  paymentMethodId?: string  // MP exige no charge
  issuerId?: string         // MP
}
```

| Provider | Tokenização client-side | Status |
|----------|------------------------|--------|
| **Mercado Pago** | SDK JS V2 oficial (`MercadoPago.js`): `mp.createCardToken(...)` retorna token + `payment_method_id` + `issuer_id`. Public key por store (`payment_config.mpPublicKey` — **não** é segredo, fica no config jsonb, não no Vault) | Maduro, caminho de referência |
| **Asaas** | A validar na implementação: se existir endpoint de tokenização chamável do browser com chave pública, implementar `AsaasTokenizer`; **senão**, `capabilities.supportsCardTokenization=false` para Asaas → UI de cartão indisponível quando a store usa Asaas como default (mensagem: "Cartão disponível via Mercado Pago — contate a loja") | **Gate de implementação** (RF-090). Pass-through de PAN pelo Edge é proibido por este PRD |

A interface do PRD-132 já previu a flag — aqui ela ganha consequência de UI.

### DELTA Declarado sobre o PRD-134 — Dois Escritores Coordenados

O RNF-003 do PRD-134 estabeleceu "escritor único de `paid`". Cartão aprovado **sincronicamente** é a exceção legítima: o gateway já confirmou na resposta do `createCardCharge`. Manter o pedido em `pending` esperando webhook seria UX absurda (cliente aprovado olhando "aguardando").

**Novo contrato (substitui RNF-003 do 134):**

> `paid` tem **dois escritores coordenados e idempotentes**: (a) o webhook (PRD-134) para PIX/boleto e para qualquer evento assíncrono; (b) o handler de cartão (este PRD) para aprovação síncrona. Ambos usam a mesma cascata (`UPDATE orders ... WHERE payment_status='pending_payment'`) e a mesma máquina de transições — o webhook do gateway que chega **depois** da aprovação síncrona encontra `paid→paid` e faz noop (transição já prevista na tabela do 134).

O handler de cartão **reusa** `resolveTransition` + a função de cascata extraída do 134 para um módulo `_shared/payment-cascade.ts` (refactor declarado: 134 e 136 importam do mesmo lugar — zero duplicação da lógica financeira).

### Fluxo de Recusa e Retry

Cartão recusado é rotina (limite, CVV, antifraude do emissor):

1. `createCardCharge` → `failed` + `failureReason` amigável (mapeamento PRD-132B RF-031; equivalente Asaas em RF-050 aqui)
2. Charge persistida como `failed` (histórico/antifraude PRD-140) — `failed` está **fora** do UNIQUE parcial → nova tentativa imediatamente permitida
3. UI: mensagem no form, campos preservados exceto CVV (limpo), cliente corrige ou troca de cartão
4. ≥ 3 falhas no mesmo pedido em 10min → cooldown de 15min + audit `card_retry_throttled` (sinal para PRD-140)

### 3DS (Autenticação do Emissor)

MP pode exigir desafio 3DS em transações de risco (`status='pending'` + `status_detail='pending_challenge'`). MVP: tratar como `pending` com mensagem "Confirme a compra no app do seu banco" + Realtime aguardando o webhook resolver. Fluxo de iframe 3DS completo fica como evolução pós-MVP (capability `supports3dsChallenge` documentada como futura).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Cartão raw pela Edge Function (Asaas server-side) | PCI scope explode (SAQ-D); um log errado = incidente. Proibido por este PRD |
| Checkout hospedado (MP Checkout Pro) | Quebra o wizard do PRD-064; tokenização transparente preserva a UX |
| iframe de campos do gateway (Secure Fields) | Mais isolamento, porém SDKs de tokenização já dão SAQ-A; Secure Fields fica como hardening futuro |
| Esperar webhook mesmo em aprovação síncrona | UX inaceitável; coordenação idempotente resolve com segurança |
| Salvar cartão para recorrência | Fora do MVP (briefing); tokens de uso único apenas |
| Capturar em dois tempos (auth + capture) | Captura imediata é o padrão do varejo; dois tempos só faria sentido com fulfillment longo — não é o caso |

---

## Escopo

### Incluído

- ✅ Interface `ICardTokenizer` + `MercadoPagoTokenizer` (SDK JS V2, lazy-load, public key do `payment_config`)
- ✅ `AsaasTokenizer` **condicionado ao gate RF-090** (spike na Fase 1; se inviável client-side, capability false + UI degradada documentada)
- ✅ Componente `CardPaymentForm`: máscaras, detecção de bandeira por BIN (lib local, sem chamada externa), validação Luhn client-side (feedback imediato, não substitui o gateway), CVV nunca persistido em state global, seletor de parcelas alimentado pelo PRD-137 (`computeInstallmentPlan`)
- ✅ Handler `card` na Edge Function do 133 (preenche o último `NOT_IMPLEMENTED`): recebe `{ cardToken, brand, last4, installments, paymentMethodId?, issuerId? }` — **valida que nenhum campo se parece com PAN** (RF-031, defesa em profundidade)
- ✅ Refactor `_shared/payment-cascade.ts` extraído do PRD-134 (DELTA declarado): `resolveTransition` + cascata charge→order compartilhadas
- ✅ Aprovação síncrona: charge `paid` + cascata + hooks pós-pagamento (mesmos stubs do 134) na própria resposta
- ✅ `pending` (3DS/análise): painel "Confirme no app do seu banco" + Realtime aguarda webhook
- ✅ Recusa: charge `failed` persistida (last4, brand, failureReason, rawStatus), retry liberado, throttle ≥3 falhas/10min
- ✅ Host /loja: passo 3 do checkout — selecionar "Cartão" expande o form inline; aprovação navega direto para confirmação com "✓ Pagamento aprovado"
- ✅ Host /app: "Cobrar no cartão" (venda assistida — vendedor digita com o cliente ao telefone? **Não**: MOTO é risco alto → /app exibe apenas link/QR que abre o form no celular do cliente — `payment-link` simples: rota pública `/loja/pagar/:orderId` com guest-context do 133)
- ✅ Audit: `card_charge_attempted` (last4/brand apenas), `card_charge_approved`, `card_charge_rejected { failureCode }`, `card_retry_throttled`
- ✅ Testes: tokenizer MP mockado, validação anti-PAN do handler, dupla escrita (síncrono + webhook replay = 1 cascata), retry/throttle, Luhn/BIN, E2E mock (tok_approve/tok_decline do PRD-132)
- ✅ Documentação `docs/dev/payment-card-flow.md` (inclui o resultado do gate Asaas e o mapa PCI do fluxo)

### Excluído

- ❌ Salvar cartão / recorrência (fora do MVP)
- ❌ Fluxo 3DS com iframe de desafio (pós-MVP; `pending`+webhook cobre)
- ❌ Captura em dois tempos
- ❌ Cartão de débito (gateways tratam como modalidade própria; avaliar demanda)
- ❌ Antifraude próprio (PRD-140 — aqui só os sinais)
- ❌ Digitação de cartão pelo vendedor no /app (MOTO — substituído pelo payment-link)
- ❌ Apple Pay / Google Pay (pós-MVP)

---

## Requisitos Funcionais

### Tokenizers

- **RF-001:** `MercadoPagoTokenizer.init(publicKey)`: injeta `https://sdk.mercadopago.com/js/v2` uma vez; instancia `new MercadoPago(publicKey)`.
- **RF-002:** `tokenize(card)`: `mp.createCardToken({...})` → `{ token, last4, brand }` + `getPaymentMethods({ bin })` → `paymentMethodId`, `issuerId`. Erros do SDK mapeados para mensagens pt-BR de campo (número inválido, validade, CVV).
- **RF-003:** `CardFormData` vive apenas no escopo do submit; nunca em store global, props drilling além do form, ou qualquer log. ESLint rule custom (`no-card-data-leak`) cobrindo os campos no diretório.
- **RF-004:** Public key MP em `payment_config.mpPublicKey` (jsonb — é pública por design); **nunca** confundir com o access token (Vault).

### Gate Asaas (RF-090 adiantado por dependência)

- **RF-010:** Fase 1 inclui spike documentado: existe tokenização Asaas chamável do browser sem expor segredo? 
  - **Sim** → implementar `AsaasTokenizer`; `capabilities.supportsCardTokenization=true` confirmado
  - **Não** → migration de dados: stores com `defaultProvider='asaas'` ganham `payment_config.cardVia='mercado_pago'` (roteamento por método: cartão usa MP mesmo com Asaas default para PIX/boleto) **ou** capability false + UI indisponível — decisão registrada no resultado do spike
- **RF-011:** Em nenhuma hipótese PAN transita pela Edge Function. Code review do handler exige checagem explícita.

### CardPaymentForm

- **RF-020:** Campos: número (máscara por bandeira), validade MM/AA, CVV (3-4 dígitos por bandeira), nome impresso, CPF/CNPJ do titular, seletor de parcelas.
- **RF-021:** Detecção de bandeira por BIN local (tabela estática: visa/master/elo/amex/hipercard) → ícone + máscara + tamanho de CVV.
- **RF-022:** Luhn client-side: feedback "número inválido" antes do submit (economia de tokenização falha).
- **RF-023:** Seletor de parcelas: opções de `computeInstallmentPlan(order.total, config, 'card')` (PRD-137) — "3x de R$ 143,33 sem juros" / "6x de R$ 75,12 com juros — total R$ 450,72".
- **RF-024:** Submit: `tokenize()` → loading → invoca Edge com payload mínimo → trata os 3 desfechos (RF-040/041/042).
- **RF-025:** CVV limpo após qualquer desfecho; demais campos preservados em recusa.

### Handler `card` (Edge)

- **RF-030:** `method='card'` no switch do 133: input Zod `{ cardToken, brand, last4 (4 dígitos), installments (1..config.max), paymentMethodId?, issuerId?, holderDocument }`.
- **RF-031:** **Validação anti-PAN:** qualquer campo string com 13–19 dígitos consecutivos passando Luhn → `400` imediato + audit `pan_in_payload_blocked` (alerta warning). Defesa contra integração errada do form.
- **RF-032:** Dual-context herdado (guest do checkout + auth do payment-link/app); idempotência `'payment-charge:'+orderId+':card:'+attemptN` (cada tentativa é um attempt — recusa não bloqueia a próxima).
- **RF-033:** Pre-check: charge `pending|paid|overdue` de **qualquer** método → guarda "uma cobrança viva" (PRD-135 RF-041) aplica; `failed` anteriores não bloqueiam.

### Desfechos

- **RF-040 (approved):** charge INSERT direto como `paid` (paid_amount, paid_at, last4, brand, installments) → cascata via `_shared/payment-cascade.ts` (order `paid` com WHERE-guard) → hooks pós-pagamento (stubs do 134) → response `{ status:'paid', installments }`. Webhook posterior do gateway: `paid→paid` noop (idempotência por design).
- **RF-041 (pending — 3DS/análise):** charge `pending` + response `{ status:'pending', message:'Confirme a compra no aplicativo do seu banco' }`; painel aguarda webhook (134) via Realtime/polling-guest.
- **RF-042 (rejected):** charge `failed` + `failure_reason` amigável + `rawStatus` preservado; response 200 `{ status:'failed', failureReason }` (não é erro HTTP — é desfecho de negócio); retry liberado.
- **RF-043:** Throttle: ≥3 `failed` do mesmo order em 10min → `429` com `retryAfter` 15min + audit `card_retry_throttled`.

### Refactor `_shared/payment-cascade.ts` (DELTA PRD-134)

- **RF-050:** Extrair de `payment-webhook`: `resolveTransition`, `applyChargeUpdate`, `applyOrderCascade`, `runPostPaymentHooks`. PRD-134 passa a importar; este PRD importa. Testes do 134 continuam verdes (refactor sem mudança de comportamento) + novo teste: aprovação síncrona seguida de webhook replay do mesmo pagamento = exatamente 1 cascata.
- **RF-051:** Mapeamento de recusa Asaas (equivalente ao 132B RF-031) adicionado em `payment/asaas/errors.ts` se o gate aprovar cartão Asaas.

### Hosts

- **RF-060 (/loja):** passo 3 — radio "Cartão" expande `CardPaymentForm` inline (sem navegação); aprovado → `/loja/pedido-confirmado` já em estado pago ("✓ Pagamento aprovado no cartão final {last4}").
- **RF-061 (/app — payment-link):** botão "Enviar link de pagamento" gera/copia `https://<loja>/pagar/:orderId` (rota pública nova, guest-context do 133, renderiza método conforme escolha do cliente: PIX/boleto/cartão) + ação "Enviar por WhatsApp" (composer pré-preenchido). Substitui qualquer digitação MOTO.
- **RF-062:** Rota `/loja/pagar/:orderId`: valida guest-context; pedido pago → "Este pedido já está pago ✓"; pendente → seletor de método reusando os painéis (Pix/Boleto/Card).

### Audit e Sinais

- **RF-070:** Eventos com **apenas** last4/brand/installments/failureCode — nunca nome do titular ou documento no payload de audit.
- **RF-071:** Sinais para PRD-140: contagem de `failed` por order/IP/janela exposta via view simples `crm.v_card_failure_signals`.

### Testes

- **RF-080:** Unitários: Luhn/BIN, anti-PAN (RF-031 com PAN real de teste 4111...), throttle, mapeamentos de recusa.
- **RF-081:** Integração mock: tok_approve → paid síncrono + cascata 1×; tok_decline → failed + retry ok; replay de webhook pós-aprovação → noop; guarda uma-cobrança-viva.
- **RF-082:** E2E /loja: checkout cartão aprovado fim-a-fim; payment-link no /app abre e paga.

### Gate e Documentação

- **RF-090:** Spike Asaas (Fase 1) com resultado escrito em `docs/dev/payment-card-flow.md` §"Gate Asaas" + decisão aplicada (tokenizer OU roteamento `cardVia` OU capability false).
- **RF-091:** `payment-card-flow.md`: mapa PCI (onde cada dado vive), DELTA do escritor duplo, fluxo 3DS-pending, payment-link.

---

## Requisitos Não-Funcionais

- **RNF-001 (PCI SAQ-A):** PAN/CVV existem apenas browser→SDK do gateway; Edge/DB/logs conhecem token+last4+brand. ESLint custom + anti-PAN runtime + code review obrigatório no diretório.
- **RNF-002 (Idempotência da dupla escrita):** aprovação síncrona + webhook do mesmo pagamento = exatamente 1 cascata (teste RF-081 é gate de merge).
- **RNF-003 (UX de recusa):** mensagem amigável < 2s após submit; campos preservados (exceto CVV); retry sem fricção.
- **RNF-004 (Time-to-approve):** submit → "✓ aprovado" < 5s p95 (tokenização + charge).
- **RNF-005 (Sem MOTO):** nenhum caminho permite o vendedor digitar cartão de terceiro.

---

## Critérios de Aceitação

### RNF-002: Dupla Escrita Coordenada

```gherkin
DADO cartão aprovado sincronicamente (charge paid, order paid, hooks rodaram)
QUANDO o webhook do gateway sobre o MESMO pagamento chega 8s depois
ENTÃO resolveTransition(paid, paid) = noop
  E zero novos UPDATEs em orders
  E hooks NÃO rodam de novo
  E webhook_event_ids registra o evento (linha do tempo completa)
```

### RF-031: Anti-PAN

```gherkin
DADO integração errada enviando { cardToken: '4111111111111111', ... }
QUANDO o handler valida
ENTÃO 400 imediato, nada persiste, nada vai ao gateway
  E audit pan_in_payload_blocked + alerta warning
```

### RF-042 + RF-043: Recusa e Throttle

```gherkin
DADO tok_decline (mock)
QUANDO submit
ENTÃO response 200 { status:'failed', failureReason:'Saldo/limite insuficiente' }
  E charge failed persistida (last4, rawStatus)
  E novo submit permitido imediatamente

DADO 3 recusas do mesmo pedido em 10min
QUANDO 4ª tentativa
ENTÃO 429 retryAfter=900 + audit card_retry_throttled
```

### RF-061: Payment-Link sem MOTO

```gherkin
DADO venda por telefone no /app
QUANDO seller clica "Enviar link de pagamento" e envia por WhatsApp
ENTÃO cliente abre /loja/pagar/:orderId no próprio celular
  E digita o cartão no próprio dispositivo (tokenização local)
  E aprovação reflete no /app via Realtime
  E em nenhum momento o seller viu dados do cartão
```

---

## Fases de Implementação

### Fase 1 — Spike Asaas + Tokenizer MP (1.5 dias)
- Gate RF-090 documentado + decisão
- MercadoPagoTokenizer + lazy SDK
- ESLint no-card-data-leak

### Fase 2 — Refactor Cascade + Handler (2 dias)
- `_shared/payment-cascade.ts` (DELTA 134, testes verdes)
- Handler card: anti-PAN, 3 desfechos, throttle

### Fase 3 — CardPaymentForm (1.5 dias)
- Máscaras/BIN/Luhn, parcelas (PRD-137), submit, desfechos na UI

### Fase 4 — Hosts + Payment-Link (1.5 dias)
- /loja passo 3 inline
- Rota /loja/pagar/:orderId + botão e WhatsApp no /app

### Fase 5 — Testes + Docs (1 dia)
- Dupla escrita, E2E, sinais 140
- payment-card-flow.md (com mapa PCI e resultado do gate)
- `_DONE`

---

## Dependências

- **Depende de:** PRD-132/132B (createCardCharge + capability), PRD-133 (Edge host + guest + painéis), PRD-134 (cascade — refatorada aqui), PRD-137 (plano de parcelas — **co-dependência**: 137 entrega a função pura; este consome; ordem de implementação: 137 Fase 1 antes deste Fase 3)
- **Bloqueia:** PRD-138 (refund de cartão), PRD-140 (sinais), PRD-140B
- **DELTAs declarados:** PRD-134 (RNF-003 substituído + extração `payment-cascade.ts`)
- **Decisões Pendentes:**
  - **Cartão P0 vs P1** (cliente) — arquitetura independe; go-live PIX/boleto-only é viável
  - **Resultado do gate Asaas** (spike Fase 1) — define tokenizer vs `cardVia` vs capability false
  - 3DS iframe completo — pós-MVP confirmar demanda

---

## Considerações de Segurança

- PCI SAQ-A por arquitetura: tokenização client-side; tripla defesa (ESLint estático, anti-PAN runtime, review humano)
- Public key ≠ secret: mpPublicKey no jsonb; access token no Vault — confusão entre os dois é o erro nº 1 de integrações MP
- Payment-link elimina MOTO (vendedor jamais manipula cartão)
- Throttle de recusas limita card-testing (fraudador validando cartões roubados) — sinal direto pro PRD-140
- Audit sem PII de titular

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.6; CHANGELOG; renomear `PRD-136-cartao-credito_DONE.md`; resultado do gate Asaas registrado; teste de dupla escrita como gate de merge.

| Princípio | Descrição |
|-----------|-----------|
| **PAN só no browser** | Token é tudo que o backend conhece |
| **Dois escritores, uma cascata** | Síncrono + webhook idempotentes via módulo compartilhado |
| **Recusa é rotina** | UX de retry sem fricção; throttle contra abuso |
| **Sem MOTO, nunca** | Payment-link no celular do cliente |
| **Gate Asaas honesto** | Sem client-side → cartão via MP ou indisponível; jamais pass-through |

| ❌ Evitar |
|-----------|
| Qualquer campo do form em log/state global |
| PAN pela Edge "só dessa vez" |
| Cascata duplicada (síncrono + webhook) |
| Vendedor digitando cartão de cliente |
| Confundir public key com access token |
| Bloquear retry após 1 recusa |

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
| 09/06/2026 | v1 | Criação inicial — Sub-lote 4c do Lote 4 (Onda 7) |

---

**AILA - Sistemas Inteligentes**
