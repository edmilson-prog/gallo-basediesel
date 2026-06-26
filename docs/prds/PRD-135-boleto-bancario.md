# PRD-135: Boleto Bancário (Multi-Provider)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `supabase/functions/payment-create-charge/` (handler boleto) + `src/features/payments/`_ |
| **Objetivo** | Segundo método de pagamento real: boleto registrado via Asaas ou Mercado Pago. Implementa o handler `method='boleto'` na Edge Function do PRD-133 (que já tem o switch), com vencimento/multa/juros de `payment_config`. UI `BoletoPaymentPanel` (linha digitável copiável + botão PDF + vencimento + status) nos dois hosts (/loja e /app). Diferença conceitual central vs PIX: **`overdue` não é terminal** — boleto vencido continua pagável com multa/juros, então `overdue→paid` é transição de primeira classe (PRD-134 já a suporta). Cron local marca vencidos; segunda via é **reexibição** (a URL do gateway é permanente), não regeneração |
| **Tipo** | Integração |
| **Complexidade** | Média |
| **Total de Fases** | 4 |
| **Prioridade** | P1 — B2B de peças pesadas compra a boleto; essencial para o portal, não bloqueia o go-live PIX-only |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-132 (`createBoletoCharge` Asaas); PRD-132B (`bolbradesco` MP + limitação da linha digitável); PRD-133 (Edge Function host + dual-context + padrões de UI reaproveitados); PRD-134 (paid/overdue/refund via webhook); PRD-064 F1 (/loja host); PRD-032 F1 (/app host); PRD-137 (parcelamento em N boletos — consome este); PRD-141 Onda 8 (envio por email — stub aqui) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Handler em `payment-create-charge/handlers/boleto.ts`; UI em `src/features/payments/BoletoPaymentPanel.tsx` |

### Critérios de Complexidade

> **Justificativa de Média:** a infraestrutura pesada já existe (Edge dual-context do 133, providers do 132/132B, confirmação do 134). O que resta é lógica de domínio com três sutilezas: (1) `overdue` não-terminal muda a máquina mental herdada do PIX — vencido ≠ morto; (2) a linha digitável no MP pode não vir separada (PRD-132B RF-021) — a UI precisa degradar com elegância; (3) boleto registrado exige endereço completo do pagador, que o guest checkout nem sempre coletou — validação pré-criação com mensagem acionável.

---

## Contexto do Problema

O comprador B2B de peças diesel **vive de boleto**: o financeiro da transportadora não paga PIX no celular do dono — emite boleto, agenda no banco, paga no vencimento. O placeholder do PRD-064 ("Boleto será enviado por email") e o portal B2B (PRD-071) precisam disso de verdade.

Fluxo alvo:

1. Pedido confirmado com `paymentMethod='boleto'` → boleto registrado gerado no gateway da store
2. Cliente vê **na hora**: linha digitável (copia → internet banking) + PDF para download/impressão
3. Vencimento em D+`boletoDueDays` (default 3); multa e juros de `payment_config` aplicados pelo próprio gateway após o vencimento
4. Pagou → webhook (PRD-134) confirma, compensação típica D+1
5. Venceu sem pagar → `overdue` (cron local + webhook do gateway); **continua pagável** — UI muda o tom, não mata o boleto
6. Cliente desistiu/trocou de método → cancelamento explícito libera a criação de outra cobrança

---

## Conceito da Solução

### Handler `boleto` na Edge Function do PRD-133

O switch já existe (PRD-133 RF-002 retornava `NOT_IMPLEMENTED`). Este PRD o preenche:

```typescript
// payment-create-charge/handlers/boleto.ts
async function handleBoleto(order, customer, store, config, ctx): Promise<BoletoResponse> {
  // 1. Validação específica: boleto registrado exige endereço completo do pagador
  assertPayerAddress(customer)        // RF-020 — falha acionável

  // 2. Datas e encargos da config
  const dueDate = addBusinessDays(today(), config.boletoDueDays ?? 3)
  const input: BoletoChargeInput = {
    orderId: order.id, storeId: store.id,
    amount: order.total_value,
    description: `Pedido #${order.number} — ${store.name}`,
    customer: mapChargeCustomer(customer),
    dueDate,
    finePct: config.boletoFinePct ?? 2.0,
    interestPctMonth: config.boletoInterestPctMonth ?? 1.0,
  }

  // 3. Provider transparente (Asaas ou MP)
  const result = await provider.createBoletoCharge(input)

  // 4. Persistência (mesma payment_charges; colunas boleto_*)
  return insertBoletoCharge(result, input, ctx)
}
```

### `overdue` Não-Terminal — A Diferença vs PIX

| Aspecto | PIX (`expired`) | Boleto (`overdue`) |
|---------|-----------------|--------------------|
| Após o prazo | QR **morto** — pagar é impossível | Boleto **vivo** — pagável com multa+juros (gateway calcula) |
| Transição de saída | `expired → paid` só via guarda (caso-limite de segundos) | `overdue → paid` é fluxo **normal** (PRD-134 tabela) |
| Ação do usuário | "Gerar novo código" (regeneração) | Nenhuma necessária — mesma linha digitável funciona |
| UNIQUE parcial | `expired` sai do índice → nova charge permitida | `overdue` **permanece** "ativa" para fins de unicidade? |

**Decisão do último ponto:** o UNIQUE parcial do PRD-132 (`WHERE status IN ('pending','paid')`) deixa `overdue` **fora** — tecnicamente permitiria segunda charge boleto. Mas regenerar boleto vencido é errado (o vencido segue pagável; dois boletos vivos = pagamento duplo). **Migration aditiva** estende o índice:

```sql
DROP INDEX crm.payment_charges_order_id_method_idx;  -- nome real conforme PRD-132
CREATE UNIQUE INDEX ON crm.payment_charges (order_id, method)
  WHERE status IN ('pending','paid','overdue');
```

`overdue` agora bloqueia nova charge do mesmo método. Para trocar de método (cliente desistiu do boleto e quer PIX): **cancelar** o boleto primeiro (RF-060) — fluxo explícito, auditado. PIX não regride: `expired` continua fora (regeneração do 133 preservada).

### Cron Local de Vencimento

Estende a função `payment-expire-charges` do PRD-133 (mesma execução `*/10min`, segundo UPDATE):

```sql
UPDATE crm.payment_charges
SET status = 'overdue'
WHERE status = 'pending' AND method = 'boleto'
  AND boleto_due_date < current_date;   -- vence no fim do dia; gateway tem tolerância própria
```

O webhook `payment_overdue` do gateway (PRD-134) também marca — quem chegar primeiro; ambos idempotentes.

### Linha Digitável — Degradação no MP

PRD-132B RF-021 registrou: MP (`bolbradesco`) entrega `external_resource_url` + `barcode.content`, mas a linha digitável formatada pode não vir. Estratégia em camadas na UI:

1. `digitableLine` presente (Asaas sempre; MP às vezes) → campo copiável primário
2. Ausente, `barCode` presente → derivar a linha digitável do código de barras (algoritmo determinístico — campo bancário padrão FEBRABAN, lib utilitária `boleto-utils` ou implementação própria de ~40 linhas com DV módulo 10/11)
3. Derivação indisponível → painel mostra só "Abrir boleto (PDF)" em destaque + barcode em texto; copiar fica no PDF

A derivação (camada 2) é determinística e testável — incluída no escopo como `deriveDigitableLine(barCode)`.

### UI — `BoletoPaymentPanel`

```
┌──────────────────────────────────────────────┐
│  Pague com Boleto                             │
│                                               │
│  Vencimento: 12/06/2026        R$ 430,00      │
│                                               │
│  ┌──────────────────────────────────┐[Copiar]│
│  │ 34191.09008 63521.510047 91020...│        │
│  └──────────────────────────────────┘        │
│                                               │
│  [ ⬇ Abrir boleto (PDF) ]                    │
│                                               │
│  Após o pagamento, a compensação leva         │
│  até 1 dia útil.                              │
│                                               │
│  Aguardando pagamento...        ◌             │
└──────────────────────────────────────────────┘

estados: awaiting → paid ✓ | overdue (âmbar):
│  ⚠ Boleto vencido em 12/06 — ainda pode ser  │
│  pago; multa e juros serão acrescidos pelo    │
│  banco.            [ ⬇ Abrir boleto (PDF) ]  │
```

Reusa a casca do `PixPaymentPanel` (PRD-133): mesmos estados-base + `overdue` próprio; mesmo hook generalizado.

### Generalização do Hook

`usePixCharge(orderId)` → **`usePaymentCharge(orderId, method)`** (refactor leve, drop-in): mesma criação/carga, mesmo Realtime/polling-guest, estado derivado ganha `overdue`. PRD-133 consumidores atualizados na mesma PR (delta declarado).

### Hosts

- **/loja:** `OrderConfirmedPage` com `paymentMethod='boleto'` → charge no mount + `<BoletoPaymentPanel variant='storefront'/>`. Placeholder "será enviado por email" → painel real; email automático segue stub Onda 8.
- **/app:** seção Pagamento ganha "Gerar boleto" (paralelo ao "Gerar cobrança PIX"); modal com painel + "Enviar por WhatsApp" (linha digitável + URL pré-preenchidas no composer); botão **"Cancelar boleto"** (Owner/Manager/seller responsável) com confirm + motivo curto.

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Boleto não-registrado (mais simples) | Bancos não aceitam mais desde 2021; registrado é o único caminho |
| Regenerar boleto vencido (paridade com PIX) | Vencido segue pagável; dois vivos = risco de pagamento duplo; UNIQUE estendido + cancelamento explícito |
| Linha digitável sempre derivada localmente (ignorar a do provider) | A do provider é canônica quando existe; derivação é fallback, não substituto |
| Painel separado sem reusar o do PIX | Estados 90% idênticos; casca comum + variações é menos código e UX consistente |
| Email do boleto agora | Onda 8 (PRD-141) é a dona; stub com audit, mesmo padrão do PRD-129 RF-060 |
| Multa/juros calculados por nós | Gateway calcula e cobra; nós só configuramos (paridade com a decisão fiscal do PRD-128) |

---

## Escopo

### Incluído

- ✅ Handler `boleto` em `payment-create-charge` (preenche o switch do PRD-133 RF-002)
- ✅ Validação pré-criação de endereço do pagador (`assertPayerAddress`) com erro acionável
- ✅ `dueDate = hoje + boletoDueDays` (dias úteis, helper `addBusinessDays`), `finePct`/`interestPctMonth` da config
- ✅ Persistência em `payment_charges` (boleto_url, boleto_digitable_line, boleto_due_date)
- ✅ Migration aditiva: UNIQUE parcial estendido com `'overdue'`
- ✅ Extensão do cron `payment-expire-charges`: segundo UPDATE marcando boletos vencidos como `overdue` + audit agregado
- ✅ `deriveDigitableLine(barCode)` — fallback determinístico FEBRABAN (DV mód. 10/11) + testes com boletos reais de fixture
- ✅ Componente `BoletoPaymentPanel` (awaiting/paid/overdue/cancelled/error) com degradação em 3 camadas da linha digitável
- ✅ Refactor `usePixCharge` → `usePaymentCharge(orderId, method)` (delta no PRD-133 declarado; consumidores atualizados)
- ✅ Host /loja: painel na `OrderConfirmedPage` para `paymentMethod='boleto'`
- ✅ Host /app: "Gerar boleto" + modal + "Enviar por WhatsApp" + **"Cancelar boleto"** (confirm + motivo, permissão, `provider.cancelCharge` + status `cancelled` + audit) — cancelado sai do UNIQUE, liberando outro método
- ✅ Stub de email do boleto (config `autoEmailCustomer` compartilhada): audit `boleto_email_skipped_no_resend` (padrão PRD-129)
- ✅ Guest-context herdado do PRD-133 sem mudanças (mesmas 4 validações)
- ✅ Audit: `payment_charge_created` (method=boleto), `boleto_cancelled { reason }`, `payment_charges_overdue` (cron agregado)
- ✅ Testes: assertPayerAddress (completo/faltando campo), deriveDigitableLine (fixtures), UNIQUE com overdue (bloqueia nova / cancelled libera), cron overdue, painel por estado, overdue→paid fim-a-fim com mock (webhook 134)
- ✅ Documentação `docs/dev/payment-boleto-flow.md`

### Excluído

- ❌ Parcelamento em N boletos (PRD-137 — consome o handler daqui)
- ❌ Envio real por email (Onda 8 / PRD-141)
- ❌ Protesto/negativação de boleto vencido (operação manual no gateway)
- ❌ Desconto por antecipação (regra comercial futura)
- ❌ Boleto híbrido com QR PIX embutido (suportado pelos gateways; avaliar pós-MVP — capability futura)
- ❌ Alteração de vencimento de boleto emitido (cancelar + reemitir é o fluxo)
- ❌ Régua de cobrança de vencidos (Onda 8, drip)

---

## Requisitos Funcionais

### Handler

- **RF-001:** `method='boleto'` no switch do PRD-133 deixa de retornar `NOT_IMPLEMENTED` e invoca `handleBoleto`.
- **RF-002:** Dual-context (auth + guest) e `withIdempotency` herdados sem alteração (`'payment-charge:'+orderId+':boleto'`).
- **RF-003:** Pre-check de charge ativa (RF-031 do 133) cobre boleto: `pending`/`overdue` existente → retorna a existente (recarregar = reexibir, nunca duplicar).

### Validação de Endereço

- **RF-010:** `assertPayerAddress(customer)`: exige `address.street`, `number` (ou street contendo número), `zipCode` (8 dígitos), `city`, `state` — boleto registrado rejeita sem isso.
- **RF-011:** Falha → `VALIDATION_ERROR 422` com lista dos campos faltantes em pt-BR: contexto /app aponta "complete o endereço na ficha do cliente"; contexto guest aponta o passo 2 do checkout.
- **RF-012:** Guest do checkout (PRD-064 passo 2 coleta endereço completo) normalmente passa; customer placeholder antigo sem endereço falha com mensagem acionável.

### Datas e Encargos

- **RF-020:** `dueDate = addBusinessDays(today, config.boletoDueDays ?? 3)` — pula sáb/dom (feriados nacionais: lista estática anual em `constants.ts`; suficiente para MVP).
- **RF-021:** `finePct` default 2.0, `interestPctMonth` default 1.0 — passados ao provider, que registra no boleto; **nós nunca recalculamos** o valor com encargos (gateway é a fonte, paridade RF-070 do 134: `paid_amount` real prevalece).

### Persistência

- **RF-030:** INSERT em `payment_charges`: `method='boleto'`, `status='pending'`, `boleto_url`, `boleto_digitable_line` (do provider OU derivada OU null), `boleto_due_date`, request/response, idempotency_key.
- **RF-031:** `digitableLine` ausente do provider + `barCode` presente → tenta `deriveDigitableLine`; sucesso persiste derivada + audit `digitable_line_derived`; falha persiste null (UI degrada).

### UNIQUE Estendido

- **RF-040:** Migration: índice parcial passa a `WHERE status IN ('pending','paid','overdue')`.
- **RF-041:** Consequência verificada em teste: order com boleto `overdue` não cria segunda charge boleto **nem** charge PIX? — **Não**: o índice é por `(order_id, method)`; boleto overdue bloqueia só outro **boleto**. PIX no mesmo order continua possível? **Decisão:** sim tecnicamente, mas o handler adiciona guarda de negócio: criar charge de método B com charge de método A em `pending|overdue` exige cancelar A antes (`VALIDATION_ERROR 422` "Cancele a cobrança ativa de <método> antes de gerar outra") — um pedido, uma cobrança viva. Auditado.

### Cron Overdue

- **RF-050:** Segundo UPDATE na função do cron (PRD-133 RF-050): `pending+boleto+due_date < current_date → overdue`; audit agregado `payment_charges_overdue { count }`; Realtime propaga (painéis abertos viram âmbar).
- **RF-051:** Webhook `payment_overdue` do gateway (PRD-134) produz a mesma transição — idempotente, sem conflito.

### Cancelamento

- **RF-060:** /app, charge boleto `pending|overdue`: botão "Cancelar boleto" (Owner/Manager/seller responsável) → modal confirm + motivo (texto curto obrigatório) → `provider.cancelCharge(providerChargeId)` → `status='cancelled'` + audit `boleto_cancelled { reason, by }`.
- **RF-061:** `cancelled` sai do UNIQUE → outro método (ou novo boleto) liberado.
- **RF-062:** Boleto `paid` não cancela (provider já barra — PRD-132 RF-071; UI nem mostra o botão).
- **RF-063:** Guest **não** cancela (sem botão na /loja; quem troca de método pelo telefone, o vendedor cancela no /app).

### UI — Painel

- **RF-070:** `<BoletoPaymentPanel orderId variant/>`, estados: `loading | awaiting | paid | overdue | cancelled | error`.
- **RF-071:** `awaiting`: vencimento em destaque, valor, linha digitável copiável (camadas RF-031/conceito), botão primário "Abrir boleto (PDF)" (`boleto_url`, nova aba), nota de compensação D+1.
- **RF-072:** `overdue`: âmbar; "Vencido em <data> — ainda pode ser pago; multa e juros serão acrescidos pelo banco"; PDF e linha digitável **permanecem ativos**.
- **RF-073:** `paid`: check verde + valor + data (paridade PIX).
- **RF-074:** Linha digitável null (degradação camada 3): só PDF em destaque + barcode em `<code>` selecionável.
- **RF-075:** Acessibilidade: paridade com PRD-133 RF-075.

### Hook Generalizado

- **RF-080:** `usePaymentCharge(orderId, method)` substitui `usePixCharge` (alias deprecado mantido 1 release); estado ganha `overdue`; Realtime/polling-guest inalterados. **DELTA declarado sobre PRD-133** — consumidores PIX atualizados nesta PR.

### Hosts

- **RF-090:** /loja: `paymentMethod='boleto'` → `ensureCharge` no mount + painel; placeholder de email removido (stub audit cobre intenção).
- **RF-091:** /app: "Gerar boleto" (visível se `pending_payment` + sem charge viva), modal, "Enviar por WhatsApp" (composer: linha digitável + URL + vencimento), "Cancelar boleto" (RF-060), histórico de charges já cobre boleto (PRD-133 RF-092).

### Testes

- **RF-100:** Unitários: `assertPayerAddress` (5 casos), `deriveDigitableLine` (3 fixtures reais + inválido), `addBusinessDays` (sexta→quarta com feriado).
- **RF-101:** Integração (mock): criar→awaiting; cron→overdue (Realtime âmbar); webhook 134 overdue→paid (fluxo normal!); cancelar→cancelled→novo método liberado; guarda RF-041 (PIX vivo bloqueia boleto).
- **RF-102:** E2E /loja guest: checkout boleto → painel com PDF e linha → simular pago → ✓.

### Documentação

- **RF-110:** `docs/dev/payment-boleto-flow.md`: overdue não-terminal (e por que difere do PIX), camadas da linha digitável, UNIQUE estendido + guarda de método único, cancelamento, encargos por conta do gateway.

---

## Requisitos Não-Funcionais

- **RNF-001 (Vencido ≠ morto):** `overdue` preserva todos os meios de pagamento na UI; `overdue→paid` é caminho feliz.
- **RNF-002 (Uma cobrança viva por pedido):** UNIQUE + guarda de negócio; troca de método sempre via cancelamento auditado.
- **RNF-003 (Degradação elegante):** ausência de linha digitável nunca quebra o painel — PDF é o mínimo garantido.
- **RNF-004 (Encargos do gateway):** valor com multa/juros jamais calculado localmente; `paid_amount` real do 134 prevalece.
- **RNF-005 (Time-to-boleto):** confirmação → painel com PDF < 4s p95.

---

## Critérios de Aceitação

### RF-050 + PRD-134: Overdue → Paid (caminho feliz)

```gherkin
DADO boleto vencido ontem (cron marcou overdue; painel âmbar)
QUANDO o cliente paga no banco com multa+juros (R$ 437,12 sobre R$ 430,00)
  E o webhook do gateway confirma
ENTÃO transição overdue→paid aplicada (PRD-134 tabela)
  E paid_amount=437.12 persistido
  E audit payment_amount_mismatch registra o delta dos encargos
  E painel transiciona para "✓ Pago" ao vivo
```

### RF-041: Uma Cobrança Viva

```gherkin
DADO charge boleto 'overdue' no pedido O1
QUANDO tentam gerar PIX para O1
ENTÃO 422 "Cancele a cobrança ativa de boleto antes de gerar outra"
QUANDO seller cancela o boleto (motivo registrado)
ENTÃO status='cancelled' E PIX pode ser gerado
```

### RF-031 + RF-074: Camadas da Linha Digitável

```gherkin
DADO provider MP retorna barcode sem digitableLine
QUANDO deriveDigitableLine(barCode) sucede
ENTÃO linha derivada persistida + audit digitable_line_derived
  E painel mostra campo copiável normal

DADO derivação falha (barcode malformado)
ENTÃO digitable_line=null
  E painel degrada: PDF em destaque + barcode selecionável, sem erro
```

### RF-010: Endereço Acionável

```gherkin
DADO customer placeholder sem CEP
QUANDO seller tenta gerar boleto no /app
ENTÃO 422 listando "CEP" faltante
  E mensagem: "Complete o endereço na ficha do cliente para emitir boleto registrado"
```

---

## Fases de Implementação

### Fase 1 — Handler + Validações + Schema (1 dia)
- handleBoleto, assertPayerAddress, addBusinessDays
- Migration UNIQUE estendido + guarda RF-041
- Persistência

### Fase 2 — Derivação + Cron (1 dia)
- deriveDigitableLine + fixtures
- Extensão do cron (overdue) + audit

### Fase 3 — UI + Hook Generalizado (1.5 dias)
- usePaymentCharge (refactor + delta PRD-133)
- BoletoPaymentPanel (5 estados, 3 camadas)
- Hosts /loja e /app + cancelamento + WhatsApp

### Fase 4 — Testes + Docs (1 dia)
- Integração mock (incl. overdue→paid e guarda de método)
- E2E guest
- payment-boleto-flow.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-132/132B (createBoletoCharge), PRD-133 (Edge host + dual-context + UI base + cron), PRD-134 (overdue/paid/refund)
- **Bloqueia:** PRD-137 (parcelamento em N boletos), PRD-140B
- **DELTA declarado:** PRD-133 — `usePixCharge` → `usePaymentCharge(orderId, method)`; consumidores atualizados nesta PR
- **Decisões Pendentes:**
  - `boletoDueDays=3`, `finePct=2.0`, `interestPctMonth=1.0` — confirmar com financeiro GALLO
  - Lista de feriados nacionais estática anual (sugerido) vs API de feriados (overkill MVP)
  - Boleto híbrido com PIX embutido — avaliar pós-MVP

---

## Considerações de Segurança

- `boleto_url` é pública-por-link do gateway (sem auth) — não expor em logs além do necessário; painel acessa direto
- Cancelamento com permissão + motivo + audit (operação financeira sensível)
- Guest sem cancelamento (superfície mínima)
- Encargos nunca calculados localmente — sem vetor de manipulação de valor

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.5; CHANGELOG; renomear `PRD-135-boleto-bancario_DONE.md`; delta do hook no PRD-133 anotado no arquivo `_DONE` correspondente.

| Princípio | Descrição |
|-----------|-----------|
| **Overdue é vivo** | Vencido paga com encargos; UI muda o tom, não mata |
| **Uma cobrança viva por pedido** | Trocar método = cancelar antes, auditado |
| **Derivar é fallback** | Linha do provider quando existe; FEBRABAN quando não |
| **Encargos são do gateway** | paid_amount real prevalece, delta vai pro audit |
| **Segunda via = reexibir** | URL é permanente; nunca regenerar vencido |

| ❌ Evitar |
|-----------|
| Tratar overdue como expired (regenerar) |
| Duas cobranças vivas no mesmo pedido |
| Calcular multa/juros localmente |
| Quebrar o painel por linha digitável ausente |
| Cancelamento sem motivo/audit |
| dueDate caindo em fim de semana |

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
