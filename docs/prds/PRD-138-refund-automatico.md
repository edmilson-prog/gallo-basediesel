# PRD-138: Refund Automático (Multi-Provider)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/payment-refund/` + `src/features/payments/refund/`_ |
| **Objetivo** | Substituir o placeholder "Refund" da tela de pedido (PRD-032) por estorno real: Edge Function `payment-refund` com permissão Owner/Manager, motivo obrigatório, suporte a **total e parcial** (nova tabela `crm.payment_refunds` para o histórico de N estornos), e roteamento por método — **PIX e cartão** via `provider.refundCharge` (devolução Bacen / estorno na fatura); **boleto não tem refund nativo** nos gateways → fluxo manual estruturado (transferência fora + registro com `manual_refund=true` e comprovante). **Fecha a decisão pendente do PRD-134:** refund parcial mantém o order `paid` + audit; total → `refunded`. Trigger integrado ao cancelamento de pedido pago. Janela Bacen de 90 dias do PIX validada |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P1 |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-032 F1 (placeholder substituído); PRD-132/132B (`refundCharge` + capability `supportsPartialRefund`); PRD-134 (webhook de refund — agora idempotente com o iniciado aqui; **decisão pendente fechada**); PRD-135 (boleto sem refund nativo); PRD-136 (estorno de cartão); PRD-137 (refund de parcela de carnê); PRD-139 (conciliação consome `payment_refunds`); PRD-110 (alerta) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Edge Function + `RefundDialog` em `src/features/payments/refund/`; tabela própria para histórico |

### Critérios de Complexidade

> **Justificativa de Alta:** refund é a única operação da onda que **tira dinheiro da conta do lojista** — permissão, motivo, idempotência e trilha de auditoria são requisitos de primeira linha, não acessórios. Três assimetrias somam complexidade: (1) **por método** — PIX devolve via Bacen em segundos, cartão estorna na fatura em até 2 ciclos, boleto simplesmente **não tem** API de refund (o dinheiro entrou por compensação bancária; sai por transferência manual que precisamos registrar sem fingir que foi automática); (2) **parcial × total** mudam o estado do order de formas diferentes (decisão do 134 fechada aqui); (3) **dupla origem** — refund iniciado por nós × refund feito no painel do gateway chegam pelos mesmos webhooks e não podem duplicar valores.

---

## Contexto do Problema

Cenários reais que hoje terminam em planilha:

1. **Cliente desistiu após pagar PIX** — vendedor cancela o pedido; o estorno é feito no painel do gateway, sem vínculo com o pedido, sem motivo registrado, comissão fica errada.
2. **Item em falta num pedido de R$ 2.300 pago** — devolver R$ 180 do item faltante (parcial) mantendo o resto do pedido andando.
3. **Boleto pago e pedido cancelado** — não existe botão em lugar nenhum: o financeiro faz um PIX manual para o cliente e ninguém registra.

O PRD-032 deixou o botão "Refund" como placeholder esperando exatamente este PRD. O PRD-134 já recebe webhooks de refund (iniciados no painel) — agora o sistema também **inicia**, e os dois caminhos convergem idempotentes.

---

## Conceito da Solução

### Nova Tabela `crm.payment_refunds`

Uma charge pode ter N estornos parciais — agregados na charge, histórico em tabela própria:

```sql
CREATE TABLE crm.payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id uuid NOT NULL REFERENCES crm.payment_charges(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES crm.orders(id),          -- denormalizado p/ conciliação
  store_id uuid NOT NULL REFERENCES crm.stores(id),

  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','completed','failed')),

  -- automático (PIX/cartão)
  provider_refund_id text,

  -- manual (boleto)
  manual_refund boolean NOT NULL DEFAULT false,
  manual_reference text,            -- comprovante: id da transferência/PIX feito por fora

  requested_by uuid NOT NULL REFERENCES crm.sellers(id),
  idempotency_key text UNIQUE,
  failure_reason text,

  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX ON crm.payment_refunds (charge_id);
CREATE INDEX ON crm.payment_refunds (store_id, created_at DESC);

ALTER TABLE crm.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.payment_refunds FORCE ROW LEVEL SECURITY;
-- SELECT: Owner/Manager da store; seller responsável (leitura); INSERT/UPDATE service_role
```

`payment_charges` mantém os agregados (`refunded_amount`, `refunded_at`, status `refunded|partially_refunded`) — migration aditiva acrescenta `refund_count integer DEFAULT 0` para exibição rápida.

### Edge Function `payment-refund`

```
[Owner/Manager clica "Estornar" no pedido]
   │
   └─▶ RefundDialog: valor (default = restante estornável) + motivo (≥10 chars)
        + aviso por método (PIX: minutos · cartão: até 2 faturas · boleto: fluxo manual)
   │
   └─▶ POST /functions/v1/payment-refund { chargeId, amount, reason }
        │
        ├── 1. withAuth + role ∈ {owner, manager}            (403 caso contrário)
        ├── 2. withIdempotency('payment-refund:'+chargeId+':'+amountCents+':'+nonce)
        ├── 3. Carrega charge: status ∈ {paid, partially_refunded}
        ├── 4. Valida: amount ≤ paid_amount − refunded_amount
        ├── 5. PIX: valida janela Bacen (paid_at + 90 dias)
        ├── 6. Roteia por método:
        │      pix|card → provider.refundCharge(providerChargeId, amount)
        │      boleto   → AppError MANUAL_REFUND_REQUIRED (fluxo RF-050)
        ├── 7. INSERT payment_refunds (processing→completed) + agregados na charge
        ├── 8. Cascata order (RF-060 — fecha a decisão do 134)
        ├── 9. Hooks: recálculo de comissão (stub, padrão 134) + audit
        └── 10. Response { refundId, status, method, eta }
```

### Refund por Método

| Método | Caminho | Prazo ao cliente | Observações |
|--------|---------|------------------|-------------|
| **PIX** | `refundCharge` → devolução Bacen | Minutos | Janela: até **90 dias** do `paid_at` (regra Bacen). Fora dela → erro orientando transferência manual (fluxo do boleto reutilizado) |
| **Cartão** | `refundCharge` → estorno | Até 2 faturas (bandeira) | Parcelado: estorno do valor sobre a transação única (a adquirente ajusta as parcelas futuras do portador) |
| **Boleto** | **Sem API** | — | RF-050: dialog muda para modo manual — orienta a transferência por fora, exige `manual_reference` (comprovante), registra `manual_refund=true` e atualiza estados **sem** chamada ao gateway |

### Fechamento da Decisão Pendente do PRD-134

Registrada lá como aberta ("refund parcial: manter order `paid` + audit vs estado próprio"). **Fechada aqui:**

| Situação | `payment_charges.status` | `orders.payment_status` |
|----------|--------------------------|--------------------------|
| Refund **total** (`refunded_amount = paid_amount`) | `refunded` | `refunded` |
| Refund **parcial** | `partially_refunded` | **mantém `paid`** + audit `order_partial_refund { amount, totalRefunded, remaining }` |
| Parcela de carnê estornada (PRD-137) | parcela → `refunded` | order **mantém** o estado de grupo (`partially_paid`/`paid`) + audit — sem regressão automática |

Racional: parcial significa "o pedido continua válido com ajuste financeiro" (item faltante, desconto pós-venda) — regredir o order travaria fulfillment legítimo. O webhook do gateway confirmando o refund que **nós** iniciamos encontra os estados já aplicados → `refunded→refunded` / `partially_refunded→partially_refunded` noop (máquina do 134, sem mudança). Se o webhook trouxer valor divergente do nosso agregado → audit `refund_amount_mismatch` (PRD-139 concilia).

### Trigger no Cancelamento de Pedido

O "Cancelar pedido" do PRD-032, quando `payment_status ∈ {paid, partially_paid}` e existe charge estornável:

```
Modal de cancelamento ganha bloco:
  ☑ Estornar pagamento agora (R$ 430,00 via PIX — cai em minutos)
  Motivo do estorno: [preenchido com o motivo do cancelamento, editável]
```

Confirmou → cancela o pedido **e** dispara o refund na sequência (duas operações auditadas separadamente; falha do refund **não** desfaz o cancelamento — alerta + retry manual pelo botão). Boleto → o bloco vira instrução do fluxo manual.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Refund dentro do webhook handler (134) | Origens diferentes (nós × painel); função própria com permissão/motivo/dialog é outra natureza de operação |
| Sem tabela própria (só agregados na charge) | N parciais sem histórico individual = conciliação cega e disputa impossível |
| Fingir refund automático de boleto (transferência via API de payout) | Payout é outro produto/escopo nos dois gateways; honestidade operacional: manual estruturado com comprovante |
| Seller executa refund | Tira dinheiro da conta — Owner/Manager only; seller vê o botão desabilitado com tooltip orientando |
| Regredir order em refund parcial | Trava fulfillment legítimo de ajuste pós-venda; decisão conservadora do 134 confirmada |
| Estorno automático sempre no cancelamento (sem checkbox) | Cancelamentos com acordo comercial (crédito para próxima compra) existem; opt-out explícito preserva |

---

## Escopo

### Incluído

- ✅ Migration: tabela `crm.payment_refunds` + RLS; aditiva em `payment_charges` (`refund_count`)
- ✅ Edge Function `payment-refund`: permissão, idempotência, validações (estornável, saldo, janela PIX 90d), roteamento por método, INSERT + agregados, cascata
- ✅ **Fluxo manual de boleto** (RF-050): modo manual no dialog, `manual_reference` obrigatório, registro sem chamada ao gateway, estados idênticos ao automático
- ✅ **Fechamento da decisão do 134** (RF-060): parcial mantém `paid` + audit; total → `refunded`; carnê sem regressão de grupo
- ✅ Convergência idempotente com o webhook (134 inalterado: noops + `refund_amount_mismatch` em divergência)
- ✅ `RefundDialog`: valor com default/validação de saldo, motivo ≥10, aviso de prazo por método, modo manual para boleto, confirmação explícita
- ✅ Substituição do placeholder do PRD-032: botão "Estornar" real (habilitado por estado+permissão), **histórico de estornos** na seção Pagamento (lista de `payment_refunds`)
- ✅ Trigger no cancelamento de pedido pago (checkbox + motivo herdado + falha não-bloqueante com alerta)
- ✅ Refund de parcela de carnê (PRD-137): dialog por parcela no `BoletoCarnePanel` quando parcela paga é boleto → manual; quando carnê futuro for cartão/PIX → automático (preparado)
- ✅ Hook stub `triggerCommissionRecalculation` (padrão 134 — PRD-047 real implementa)
- ✅ Portal B2B (/portal): pedido exibe "Estornado" / "Estorno parcial de R$ X" (leitura)
- ✅ Audit: `payment_refund_requested`, `payment_refund_completed`, `payment_refund_failed`, `payment_refund_manual_registered`, `order_partial_refund`
- ✅ Alerta (PRD-110): refund `failed` → warning Owner com link
- ✅ Testes: permissões, saldo, janela 90d, parcial×total×sequência de parciais até total, manual de boleto, idempotência, convergência com webhook replay, trigger de cancelamento
- ✅ Documentação `docs/dev/payment-refund.md`

### Excluído

- ❌ Cálculo real de comissão revertida (PRD-047 — stub aqui)
- ❌ Payout/transferência automática para refund de boleto (produto separado dos gateways; avaliar pós-MVP)
- ❌ Aprovação em duas etapas (solicita→aprova) — Owner/Manager direto no MVP; workflow fica para B2B avançado (Onda 10)
- ❌ Refund de taxas do gateway (a taxa fica com o gateway; conciliação no 139 evidencia)
- ❌ Crédito em loja como alternativa ao estorno (feature comercial futura)
- ❌ Disputa/chargeback (PRD-134 alerta; processo é manual no painel)

---

## Requisitos Funcionais

### Permissão e Entrada

- **RF-001:** `withAuth` + `role ∈ {owner, manager}`; seller → 403 com mensagem orientando ("Solicite a um gestor"). UI já desabilita com tooltip.
- **RF-002:** Input Zod: `{ chargeId: uuid, amount: number>0, reason: string(10..500), manualReference?: string }`.
- **RF-003:** Idempotência: `'payment-refund:'+chargeId+':'+amountCents+':'+clientNonce` (nonce do dialog — duplo clique não duplica; novo pedido de mesmo valor gera nonce novo e é legítimo).

### Validações

- **RF-010:** Charge `status ∈ {paid, partially_refunded}`; senão 422 "Apenas cobranças pagas podem ser estornadas".
- **RF-011:** `amount ≤ paid_amount − refunded_amount` (saldo estornável); senão 422 com o saldo na mensagem.
- **RF-012:** PIX: `now() ≤ paid_at + 90 dias`; fora → 422 "Janela de devolução PIX (90 dias) expirada — registre estorno manual" com CTA que troca o dialog para o modo manual.
- **RF-013:** Capability `supportsPartialRefund=false` (futuro provider) + `amount < saldo` → 422 orientando refund total.

### Execução Automática (PIX/Cartão)

- **RF-020:** INSERT `payment_refunds` como `processing` **antes** da chamada (intenção registrada mesmo se cair no meio).
- **RF-021:** `provider.refundCharge(providerChargeId, amount)`; sucesso → `completed` + `provider_refund_id` + `completed_at`.
- **RF-022:** Falha do gateway → `failed` + `failure_reason` mapeado pt-BR + alerta Owner; agregados da charge **não** mudam; retry = nova solicitação (novo registro, trilha completa).
- **RF-023:** Agregados (transação local): `refunded_amount += amount`, `refund_count += 1`, `refunded_at = now()`, status `refunded` se zerou o saldo senão `partially_refunded`.

### Fluxo Manual (Boleto)

- **RF-050:** `method='boleto'` → Edge retorna `409 MANUAL_REFUND_REQUIRED { instructions }`; dialog troca para modo manual: passo-a-passo (transferir R$ X ao cliente por PIX/TED fora do sistema) + campo `manualReference` obrigatório (id/descrição do comprovante).
- **RF-051:** Submissão manual: mesmo endpoint com `manualReference` → INSERT `manual_refund=true, status='completed'` direto (sem gateway) + agregados + cascata — estados finais **idênticos** ao automático; audit `payment_refund_manual_registered`.
- **RF-052:** PIX fora da janela (RF-012) reutiliza exatamente este modo manual.

### Cascata no Order (fecha decisão do 134)

- **RF-060:** Pós-`completed`: saldo zerado → `orders.payment_status='refunded'`; parcial → mantém + audit `order_partial_refund`; charge de carnê → order intacto no estado de grupo + audit. Tudo via `_shared/payment-cascade.ts` (função nova `applyRefundCascade` ao lado das existentes — DELTA declarado no módulo, 134/136/137 intactos).
- **RF-061:** Webhook do gateway confirmando o refund iniciado aqui: noop de status (máquina do 134); valor divergente do agregado → audit `refund_amount_mismatch` (139 concilia).

### Trigger no Cancelamento

- **RF-070:** Modal "Cancelar pedido" (PRD-032), quando há charge estornável: checkbox "Estornar pagamento agora" (default marcado) + valor + método + prazo; motivo do estorno pré-preenchido com o do cancelamento.
- **RF-071:** Confirmado: cancela o pedido → dispara o refund (mesma Edge, mesmo pipeline). Refund falhou → pedido **permanece cancelado** + alerta + botão "Estornar" disponível para retry.
- **RF-072:** Boleto: checkbox vira instrução do fluxo manual (link abre o dialog em modo manual após o cancelamento).

### UI

- **RF-080:** Seção Pagamento (PRD-032): botão "Estornar" substitui o placeholder — visível se charge `paid|partially_refunded`; desabilitado para seller (tooltip).
- **RF-081:** `RefundDialog`: valor default = saldo estornável; validação live; motivo com contador; aviso de prazo por método; confirmação final com resumo ("Estornar R$ 180,00 de R$ 2.300,00 — o pedido permanece pago").
- **RF-082:** Histórico de estornos na seção: lista de `payment_refunds` (data, valor, motivo, quem, automático/manual, status) — Realtime atualiza.
- **RF-083:** `BoletoCarnePanel` (137): ação "Estornar" por parcela paga → dialog (modo manual por ser boleto).
- **RF-084:** /portal: badge e linha de histórico em leitura.

### Testes

- **RF-090:** Unitários: validações (saldo, janela 90d com fixtures de data, permissão), idempotência por nonce, mapeamentos de falha.
- **RF-091:** Integração mock: parcial mantém `paid`; sequência 180+2.120 fecha em `refunded`; manual de boleto fim-a-fim; webhook replay pós-refund = noop; trigger de cancelamento com falha de refund (pedido cancelado + alerta).
- **RF-092:** E2E: pedido pago PIX → estorno parcial → histórico exibe → estorno do restante → order `refunded` → portal reflete.

### Documentação

- **RF-100:** `payment-refund.md`: matriz método×caminho×prazo, decisão do 134 fechada (tabela), fluxo manual com responsabilidades, convergência com webhook, janela Bacen.

---

## Requisitos Não-Funcionais

- **RNF-001 (Quatro-olhos mínimo):** permissão Owner/Manager + motivo obrigatório + confirmação explícita + trilha completa — nenhum estorno anônimo ou sem porquê.
- **RNF-002 (Idempotência):** duplo clique, retry de rede e webhook subsequente jamais duplicam valor estornado.
- **RNF-003 (Saldo nunca negativo):** `refunded_amount ≤ paid_amount` garantido por validação + recheck na transação dos agregados.
- **RNF-004 (Honestidade do manual):** boleto nunca aparenta automação; comprovante obrigatório; mesmos estados finais.
- **RNF-005 (Cancelamento resiliente):** falha do refund não reverte cancelamento — operações independentes com trilhas próprias.

---

## Critérios de Aceitação

### RF-060: Parcial Mantém Paid (decisão do 134 fechada)

```gherkin
DADO pedido R$ 2.300 pago (PIX) e item faltante de R$ 180
QUANDO Manager estorna R$ 180 com motivo "Item 7891-X em falta"
ENTÃO payment_refunds ganha registro completed de 180.00
  E charge: partially_refunded, refunded_amount=180.00
  E order: payment_status PERMANECE 'paid'
  E audit order_partial_refund { amount:180, remaining:2120 }
  E fulfillment segue normal
```

### RF-050/051: Manual de Boleto

```gherkin
DADO charge boleto paga de R$ 950 e pedido cancelado
QUANDO Manager abre o estorno
ENTÃO dialog em modo manual: instrução de transferência + campo comprovante obrigatório
QUANDO submete com manualReference='PIX E2E a1b2c3'
ENTÃO refund manual_refund=true, completed, SEM chamada ao gateway
  E charge refunded E order refunded
  E audit payment_refund_manual_registered
```

### RF-012: Janela Bacen

```gherkin
DADO PIX pago há 91 dias
QUANDO tenta estorno automático
ENTÃO 422 "Janela de devolução PIX (90 dias) expirada..."
  E CTA leva ao modo manual (mesmo fluxo do boleto)
```

### RF-061: Convergência com Webhook

```gherkin
DADO estorno parcial concluído por aqui (charge partially_refunded, agregado 180.00)
QUANDO o webhook do gateway sobre ESTE refund chega
ENTÃO resolveTransition noop (estado já aplicado)
  E zero alteração nos agregados
  E webhook_event_ids registra (linha do tempo completa)
```

### RF-071: Cancelamento Resiliente

```gherkin
DADO cancelamento com "Estornar agora" marcado e gateway fora do ar
QUANDO confirma
ENTÃO pedido CANCELADO com sucesso
  E refund registrado como failed + alerta Owner
  E botão "Estornar" disponível para retry (nova solicitação)
```

---

## Fases de Implementação

### Fase 1 — Schema + Edge Core (1.5 dias)
- Tabela payment_refunds + RLS + aditiva
- Permissão, validações, idempotência, janela 90d

### Fase 2 — Automático + Cascata (1.5 dias)
- PIX/cartão via refundCharge, processing→completed/failed
- applyRefundCascade no módulo compartilhado (DELTA) + convergência com webhook

### Fase 3 — Manual de Boleto (1 dia)
- 409 MANUAL_REFUND_REQUIRED + registro com comprovante
- Reuso para PIX fora da janela

### Fase 4 — UI + Trigger (1.5 dias)
- RefundDialog (modos automático/manual) + histórico na seção Pagamento
- Trigger no cancelamento + carnê por parcela + portal

### Fase 5 — Testes + Docs (1 dia)
- Matriz parcial/total/sequência, replay, E2E
- payment-refund.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-132/132B (refundCharge), PRD-134 (máquina/cascata — módulo estendido), PRD-135 (boleto), PRD-136 (cartão), PRD-137 (carnê por parcela), PRD-032 F1 (host)
- **Bloqueia:** PRD-139 (conciliação consome payment_refunds + mismatches), PRD-140B
- **DELTAs declarados:** `_shared/payment-cascade.ts` ganha `applyRefundCascade`; **decisão pendente do PRD-134 fechada** (parcial mantém `paid`)
- **Decisões Pendentes:**
  - Aprovação em duas etapas (solicita/aprova) — fora do MVP, revalidar na Onda 10
  - Threshold de alerta por valor estornado (audit sempre; alerta extra acima de R$ X?) — sugerido não no MVP (executor já é gestor)

---

## Considerações de Segurança

- Operação que saca da conta: Owner/Manager + motivo + confirmação + idempotência por nonce
- Comprovante obrigatório no manual — sem registro "no fio do bigode"
- `failure_reason` do gateway sanitizado antes de exibir
- RLS: cliente do portal vê apenas leitura dos próprios estornos
- Convergência idempotente elimina o vetor "estornar duas vezes via painel+sistema"

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.8; CHANGELOG; renomear `PRD-138-refund-automatico_DONE.md`; anotar nos `_DONE` do 134 o fechamento da decisão e o DELTA do módulo de cascata.

| Princípio | Descrição |
|-----------|-----------|
| **Tira dinheiro = quatro-olhos mínimo** | Permissão + motivo + confirmação + trilha |
| **Parcial não regride o order** | Ajuste financeiro ≠ pedido inválido |
| **Boleto manual é honesto** | Comprovante obrigatório; nunca fingir automação |
| **Duas origens, um estado** | Iniciado aqui × painel convergem por noop |
| **Intenção antes da chamada** | processing registrado mesmo se o gateway cair |

| ❌ Evitar |
|-----------|
| Seller estornando |
| Refund sem motivo ou sem registro individual |
| Saldo estornado > pago |
| Regressão de order em parcial |
| Boleto "automático" |
| Reverter cancelamento por falha do refund |

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
| 10/06/2026 | v1 | Criação inicial — Sub-lote 4c do Lote 4 (Onda 7) |

---

**AILA - Sistemas Inteligentes**
