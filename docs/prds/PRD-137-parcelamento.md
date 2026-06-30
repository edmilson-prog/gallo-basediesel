# PRD-137: Parcelamento (Cartão + Carnê de Boletos)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _Repositório vivo, `src/features/payments/installments/` + handlers da Edge `payment-create-charge`_ |
| **Objetivo** | Parcelamento nas duas modalidades do varejo de peças: **cartão** (parcelas na adquirente, "sem juros até N" com juros simples acima, configurável por store) e **boleto em carnê** (N boletos com vencimentos mensais para B2B, venda assistida). Centro da solução é a função pura `computeInstallmentPlan(amount, config, method)` — única fonte dos valores exibidos e cobrados. Introduz o modelo de **grupo de parcelas** em `crm.payment_charges` (`installment_group_id` + `installment_number`), migra o UNIQUE parcial, e cria o estado `partially_paid` em `crm.orders` com **DELTA declarado na cascata do PRD-134** (lógica de grupo: todas pagas → `paid`; ≥1 → `partially_paid`). Carnê via Asaas é nativo (`installmentCount`); via MP é emulado com criação compensatória |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | P1 |
| **Épico** | Onda 7 — Pagamentos (v2.3.0 "Cash") |
| **PRDs Relacionados** | PRD-132 (capabilities + `payment_charges`); PRD-132B (MP sem carnê nativo); PRD-135 (handler boleto + painel — base do carnê); PRD-136 (seletor de parcelas no cartão — **co-dependência**: consome a função daqui); PRD-134 (**DELTA**: cascata ganha lógica de grupo); PRD-064 F1 (checkout); PRD-032 F1 (pedido /app); PRD-071 F1 (portal B2B — visualização) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | `computeInstallmentPlan` pura e testada exaustivamente em `src/features/payments/installments/computeInstallmentPlan.ts`; handlers estendem os existentes |

### Critérios de Complexidade

> **Justificativa de Alta:** parcelamento mexe em três invariantes financeiras ao mesmo tempo. (1) **Aritmética de centavos:** R$ 100 ÷ 3 não existe — a distribuição do resto precisa ser determinística e somar exatamente o total (auditoria bate centavo a centavo). (2) **O UNIQUE "uma cobrança viva"** (PRDs 132/135) colide frontalmente com "6 boletos vivos do mesmo pedido" — a migração do índice precisa preservar a proteção para avulsos sem bloquear o carnê. (3) **`paid` deixa de ser binário:** um pedido com 2 de 6 parcelas pagas não é nem `pending` nem `paid` — o novo `partially_paid` atravessa a cascata do 134, a UI do 032, o portal do 071 e a conciliação futura do 139. Emulação do carnê no MP adiciona o problema clássico de criação parcial (criou 3 de 6 e falhou).

---

## Contexto do Problema

Dois cenários reais da Turbo Diesel travados sem parcelamento:

**B2C /loja:** kit de embreagem R$ 1.860. Caminhoneiro autônomo não paga à vista — paga "6x no cartão". Sem o seletor de parcelas, o carrinho morre no passo 3.

**B2B venda assistida:** transportadora compra R$ 12.000 em filtros. O financeiro dela trabalha com "entrada + 5 boletos de 30 em 30 dias". Hoje o vendedor faz isso **fora do sistema** (emite boletos avulsos no internet banking) — zero rastreio, zero conciliação, comissão calculada errada.

O PRD-136 já desenhou o seletor de parcelas no `CardPaymentForm` apontando para `computeInstallmentPlan` (RF-023) — a função nasce aqui. O PRD-135 entregou o boleto avulso — o carnê o generaliza.

---

## Conceito da Solução

### Config por Store

Extensão do `payment_config` (PRD-132):

```jsonc
"installments": {
  "card": {
    "maxInstallments": 12,
    "interestFreeUpTo": 3,          // até 3x sem juros (lojista absorve a taxa)
    "interestPctMonth": 1.99,       // acima: juros simples a.m. embutidos no total
    "minInstallmentValue": 50.00    // nenhuma parcela abaixo disso
  },
  "boleto": {
    "maxInstallments": 6,
    "intervalDays": 30,             // vencimentos mensais
    "minInstallmentValue": 100.00
    // carnê sem juros embutidos no MVP — encargos só por atraso (PRD-135)
  }
}
```

### `computeInstallmentPlan` — Função Pura

```typescript
export interface InstallmentOption {
  n: number
  installmentValue: number        // parcela "base" (demais parcelas)
  firstInstallmentValue: number   // absorve o resto dos centavos
  totalValue: number              // soma exata — invariante auditável
  interestApplied: boolean
  label: string                   // "6x de R$ 75,12 com juros — total R$ 450,72"
}

export function computeInstallmentPlan(
  amount: number,
  config: InstallmentsConfig,
  method: 'card' | 'boleto'
): InstallmentOption[]
```

Regras:

1. Gera `n = 1..maxInstallments`, parando quando `totalValue / n < minInstallmentValue` (n=1 sempre existe).
2. **Cartão:** `n ≤ interestFreeUpTo` → `total = amount`, sem juros; acima → **juros simples** `total = round(amount × (1 + n × interestPctMonth/100), 2)`. O total com juros é o `transaction_amount` enviado ao gateway — nós definimos o preço, o gateway só divide (paridade com a decisão do PRD-135: encargos de **atraso** são do gateway; juros de **parcelamento** são preço nosso).
3. **Boleto:** sem juros; `total = amount` sempre.
4. **Centavos:** `installmentValue = floor(total/n, 2)`; `firstInstallmentValue = total − installmentValue × (n−1)`. Invariante testada: `first + base×(n−1) === total` para qualquer entrada.
5. Determinística, sem I/O, sem datas — vencimentos são responsabilidade do handler (separação testável).

### Modelo de Grupo em `payment_charges`

```sql
ALTER TABLE crm.payment_charges
  ADD COLUMN installment_group_id uuid,
  ADD COLUMN installment_number integer NOT NULL DEFAULT 1,
  ADD COLUMN installment_total integer NOT NULL DEFAULT 1;

-- Avulso: group_id NULL, number=1, total=1 (default — zero impacto no legado)
-- Carnê 6x: 6 rows, mesmo group_id, number 1..6, total=6, cada uma com seu boleto_due_date
```

### Migração do UNIQUE

O índice do PRD-135 (`(order_id, method) WHERE status IN ('pending','paid','overdue')`) bloquearia a 2ª parcela do carnê. Migra para:

```sql
DROP INDEX crm.<idx_135>;
CREATE UNIQUE INDEX ON crm.payment_charges (order_id, method, installment_number)
  WHERE status IN ('pending','paid','overdue');
```

Proteções preservadas: avulso continua 1-viva-por-método (number=1 colide com number=1); carnê tem exatamente uma viva por posição. A **guarda de negócio** "uma cobrança viva por pedido entre métodos" (PRD-135 RF-041) ganha cláusula: carnê ativo conta como cobrança viva do método boleto — PIX/cartão exigem cancelar o carnê inteiro antes.

### `partially_paid` + DELTA na Cascata do 134

```sql
ALTER TABLE crm.orders DROP CONSTRAINT orders_payment_status_check;
ALTER TABLE crm.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending_payment','partially_paid','paid','refunded'));
```

**DELTA declarado — `_shared/payment-cascade.ts` (PRD-134/136), `applyOrderCascade` ganha lógica de grupo:**

```typescript
if (charge.installment_total > 1) {
  const paidCount = await countPaidInGroup(charge.installment_group_id)
  if (paidCount === charge.installment_total)
    → orders.payment_status = 'paid', paid_at = now()        // última parcela
  else if (paidCount >= 1 && order.payment_status === 'pending_payment')
    → orders.payment_status = 'partially_paid'                // primeira parcela
  // parcelas intermediárias: noop no order (já partially_paid)
} else {
  // comportamento atual (avulso) intacto
}
```

WHERE-guards de corrida preservados; testes do 134 permanecem verdes (avulso) + matriz nova (1ª/intermediária/última/replay).

**Fulfillment em `partially_paid`:** decisão de negócio manual (como já é no PRD-032) — a UI mostra "Parcialmente pago (2/6)" com destaque; nenhuma automação de liberação no MVP.

### Carnê: Nativo (Asaas) vs Emulado (MP)

Nova capability: `supportsNativeBoletoInstallments` — Asaas `true`, MP `false`, Mock `true`.

| | Asaas (nativo) | MP (emulado) |
|---|---|---|
| Criação | 1 chamada: `POST /payments { installmentCount, installmentValue, ... }` → Asaas gera o carnê | Loop de N `createBoletoCharge`, dueDates `D+dueDays, +30, +60...` |
| Registro local | `GET /payments?installment={id}` → N cobranças com seus `provider_charge_id`/vencimentos → N INSERTs | Cada iteração já retorna a charge → INSERT por parcela |
| Falha no meio | Atômico no gateway | **Criação compensatória**: falhou a parcela k → `cancelCharge` nas k−1 criadas no gateway, zero INSERTs locais, erro único ao usuário, audit `carne_creation_compensated` |

Handler único `handleBoletoCarne` despacha pelo capability — consumidores não sabem a diferença.

### UI

**Cartão (/loja e payment-link):** o seletor do `CardPaymentForm` (PRD-136 RF-023) renderiza as `InstallmentOption.label`; o submit envia `installments` + o handler recomputa server-side e usa `totalValue` como valor cobrado (**nunca** confiar no total vindo do cliente — RF-031).

**Carnê (/app apenas):** seção Pagamento ganha "Gerar carnê de boletos" ao lado de "Gerar boleto" → modal: seletor de N (opções da função) + **preview das parcelas** (valor + vencimento de cada) + confirmação → `BoletoCarnePanel`: lista das N parcelas, cada linha com badge de status individual (pending/paid/overdue), vencimento, e expansão para linha digitável + PDF daquela parcela. Barra de progresso "2/6 pagas". Carnê **não** disponível no checkout /loja: guest não assume compromisso parcelado sem análise — venda assistida B2B é o canal (decisão registrada).

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|--------------------|
| Tabela Price (juros compostos) no cartão | Juros simples é transparente, explicável ao cliente e suficiente; Price fica como evolução se o financeiro pedir |
| Juros calculados pelo gateway ("installments do emissor") | Imprevisível por bandeira/emissor; preço definido por nós mantém o total exibido = total cobrado |
| Tabela própria `installment_plans` | Grupo dentro de `payment_charges` reusa todo o pipeline (webhook 134, painéis 135, conciliação 139) sem join novo |
| Carnê emulado também no Asaas (uniformidade) | Nativo é atômico e gerenciado; emular onde há nativo é assumir risco grátis |
| `partially_paid` como flag booleana no order | Estado no CHECK é consultável, indexável e aparece em filtros/relatórios naturalmente |
| Carnê no checkout /loja | Compromisso parcelado de guest sem crédito = inadimplência; B2B assistido é o canal correto |

---

## Escopo

### Incluído

- ✅ `computeInstallmentPlan` pura + bateria exaustiva (centavos, mínimos, juros, limites)
- ✅ Extensão do `payment_config.installments` (card + boleto) com defaults documentados
- ✅ Migrations: colunas de grupo em `payment_charges`; UNIQUE migrado; CHECK de `orders.payment_status` com `partially_paid`
- ✅ **DELTA `_shared/payment-cascade.ts`**: lógica de grupo no `applyOrderCascade` (matriz de testes nova; avulso intacto)
- ✅ Capability `supportsNativeBoletoInstallments` (interface PRD-132 estendida — delta declarado)
- ✅ `handleBoletoCarne`: caminho nativo Asaas (criação + fetch das N + INSERTs) e emulado MP (loop + **compensação** em falha)
- ✅ Idempotência do carnê: `'payment-charge:'+orderId+':boleto:carne'` (grupo inteiro é a unidade)
- ✅ Cartão: handler do 136 recomputa o plano server-side; `totalValue` é o cobrado; divergência com o cliente → 422
- ✅ Guarda "uma cobrança viva" estendida: carnê ativo bloqueia outros métodos; cancelamento de carnê = cancela todas as parcelas `pending|overdue` (parcelas `paid` ficam — refund é PRD-138)
- ✅ `BoletoCarnePanel` (/app): lista de parcelas, status individual, progresso, expansão por parcela, cancelar carnê (permissão + motivo, padrão PRD-135 RF-060)
- ✅ Seletor de parcelas do cartão alimentado (fecha a co-dependência do PRD-136 RF-023)
- ✅ Cron de overdue (PRD-135 RF-050) cobre parcelas do carnê sem mudança (cada parcela é uma charge boleto)
- ✅ UI do pedido (/app) e portal (/portal): badge `partially_paid` "Parcialmente pago (k/N)"
- ✅ Audit: `carne_created { groupId, n, total }`, `carne_creation_compensated`, `carne_cancelled`, `order_partially_paid`
- ✅ Testes: função pura (tabela de casos), migração do UNIQUE (avulso colide / carnê não), cascata de grupo (1ª/meio/última/replay), compensação MP (falha na k-ésima), E2E carnê 3x com mock (pagar 1ª → partially_paid; pagar todas → paid)
- ✅ Documentação `docs/dev/payment-installments.md`

### Excluído

- ❌ Tabela Price / juros compostos (evolução)
- ❌ Carnê no checkout /loja (decisão registrada — B2B assistido)
- ❌ Entrada diferenciada ("entrada + N") — modelável como avulso + carnê em pedidos distintos; nativo fica pós-MVP
- ❌ Renegociação de carnê (alterar vencimentos) — cancelar parcelas abertas + novo carnê é o fluxo
- ❌ Análise de crédito / limite por cliente (Fase 3, GALLO ERP)
- ❌ Antecipação de recebíveis (operação do lojista no gateway)
- ❌ Juros de atraso (já cobertos pelo PRD-135 via gateway)

---

## Requisitos Funcionais

### Função Pura

- **RF-001:** `computeInstallmentPlan` conforme conceito; exportada e única fonte de valores de parcela em todo o sistema (UI e handlers).
- **RF-002:** Invariante de centavos: `firstInstallmentValue + installmentValue×(n−1) === totalValue` — teste property-based com 1.000 amounts aleatórios.
- **RF-003:** `n=1` sempre presente (à vista é "1x"); opções ordenadas crescente; lista vazia jamais.
- **RF-004:** Labels pt-BR: sem juros → "3x de R$ 620,00 sem juros"; com juros → "6x de R$ 326,04 com juros — total R$ 1.956,24".

### Config

- **RF-010:** Leitura com defaults seguros na ausência (`card: 1x apenas` / `boleto: 1x apenas` — parcelamento é opt-in por store).
- **RF-011:** Validação Zod da estrutura ao salvar config (PRD-140B consolida a UI de configuração; aqui o schema).

### Schema

- **RF-020:** Migrations das colunas de grupo (defaults preservam todo o legado como avulso).
- **RF-021:** UNIQUE migrado conforme conceito; teste confirma: 2º avulso pendente colide; parcelas 1..6 do mesmo grupo não.
- **RF-022:** CHECK de `orders.payment_status` ganha `partially_paid` (migration com `DROP/ADD CONSTRAINT` — verificação prévia de valores existentes).

### Cartão Server-Side

- **RF-030:** Handler do 136: recebe `installments` (n); **recomputa** `computeInstallmentPlan` server-side; cobra `totalValue` da opção n.
- **RF-031:** Cliente enviou total próprio ou n fora das opções → `422 VALIDATION_ERROR` "Opções de parcelamento atualizadas — revise" (config mudou entre render e submit).
- **RF-032:** Charge persiste `installments=n`, `installment_total=1` (cartão é UMA cobrança no gateway — o parcelamento é da adquirente; grupo é conceito de carnê).

### Carnê — Criação

- **RF-040:** `handleBoletoCarne({ orderId, n })`: valida n contra as opções; `assertPayerAddress` (PRD-135) aplica; vencimentos `[D+dueDays, +intervalDays, +2×intervalDays, ...]` (dias úteis via `addBusinessDays`).
- **RF-041:** Capability nativa (Asaas): `installmentCount=n, installmentValue=base` → fetch das N geradas → INSERT cada uma com `installment_number` pelo vencimento crescente; `firstInstallmentValue` na nº 1.
- **RF-042:** Emulado (MP): loop sequencial; falha na k-ésima → `cancelCharge` nas k−1 + zero INSERTs + `AppError INTEGRATION_ERROR` única + audit `carne_creation_compensated { failedAt: k }`.
- **RF-043:** Sucesso: N INSERTs no mesmo bloco transacional local; response com o grupo completo (parcelas + vencimentos).
- **RF-044:** Carnê é /app-only nesta fase: handler exige contexto autenticado (guest → `403`).

### Cascata de Grupo (DELTA 134)

- **RF-050:** `applyOrderCascade` conforme conceito; `countPaidInGroup` dentro da mesma transação (consistência sob webhooks concorrentes de 2 parcelas).
- **RF-051:** Última parcela paga → `paid` + `paid_at`; primeira → `partially_paid` (com WHERE-guard `pending_payment`); intermediárias → noop no order.
- **RF-052:** Replay de webhook de parcela já paga → noop completo (idempotência herdada).
- **RF-053:** Refund de parcela (PRD-138) **não** regride o order automaticamente — política definida lá; aqui o estado de grupo apenas.

### Cancelamento de Carnê

- **RF-060:** "Cancelar carnê" (/app, permissão PRD-135 RF-060): cancela no gateway todas as parcelas `pending|overdue` do grupo; `paid` permanecem; motivo obrigatório; audit por parcela + agregado.
- **RF-061:** Pós-cancelamento: parcelas vivas zeradas → outros métodos liberados (guarda); order com parcelas pagas permanece `partially_paid` (resolução financeira via PRD-138 ou acordo manual).

### UI

- **RF-070:** Seletor do cartão (PRD-136): opções via RF-001; default = maior n sem juros.
- **RF-071:** Modal "Gerar carnê": seletor de N + preview (tabela parcela × valor × vencimento) + confirmação explícita do total.
- **RF-072:** `BoletoCarnePanel`: progresso k/N, lista com badge/vencimento/valor por parcela, expansão → linha digitável + PDF (reusa átomos do `BoletoPaymentPanel`), CTA "Cancelar carnê".
- **RF-073:** Badge de order: `partially_paid` → "Parcialmente pago (k/N)" em /app (PRD-032) e /portal (PRD-071, leitura).
- **RF-074:** "Enviar por WhatsApp" do carnê: composer com resumo (N parcelas, vencimentos) + linha digitável da **próxima** parcela em aberto.

### Testes

- **RF-080:** Property-based da função pura; tabela de juros (limites de interestFreeUpTo); mínimos cortando opções.
- **RF-081:** Integração: nativo mock, emulado com falha na 3ª (compensação verificada no gateway mock), cascata 1ª/última/replay, cancelamento parcial de carnê.
- **RF-082:** E2E /app: carnê 3x → pagar 1ª (webhook mock) → "Parcialmente pago (1/3)" → pagar restantes → `paid`.

### Documentação

- **RF-090:** `payment-installments.md`: a função pura como contrato, aritmética de centavos, nativo vs emulado + compensação, estados de grupo, decisão /app-only do carnê.

---

## Requisitos Não-Funcionais

- **RNF-001 (Centavo exato):** soma das parcelas ≡ total cobrado, sempre — invariante com teste property-based como gate de merge.
- **RNF-002 (Preço definido por nós):** total com juros calculado server-side; valor do cliente jamais confiado.
- **RNF-003 (Atomicidade do carnê):** ou as N parcelas existem (gateway + local) ou nenhuma — compensação no caminho emulado.
- **RNF-004 (Legado intacto):** todo fluxo avulso (132–136) passa sem alteração de comportamento — defaults das colunas garantem.
- **RNF-005 (Transparência):** label sempre exibe o total com juros antes do submit; preview do carnê antes da confirmação.

---

## Critérios de Aceitação

### RF-002: Centavos

```gherkin
DADO amount=100.00, carnê 3x
QUANDO computeInstallmentPlan
ENTÃO firstInstallmentValue=33.34, installmentValue=33.33
  E 33.34 + 33.33×2 = 100.00 (exato)
```

### RF-051: Estados de Grupo

```gherkin
DADO carnê 6x criado (order pending_payment)
QUANDO webhook confirma a parcela 1
ENTÃO order → 'partially_paid' E badge "Parcialmente pago (1/6)"
QUANDO parcelas 2..5 confirmam
ENTÃO order permanece 'partially_paid' (noops) E badge atualiza k/6
QUANDO parcela 6 confirma
ENTÃO order → 'paid' com paid_at
```

### RF-042: Compensação MP

```gherkin
DADO store com MP default, carnê 6x, gateway falha na criação da 4ª
QUANDO handleBoletoCarne executa
ENTÃO as 3 criadas são canceladas no gateway
  E zero charges persistem localmente
  E usuário recebe UM erro ("Não foi possível gerar o carnê — tente novamente")
  E audit carne_creation_compensated { failedAt: 4 }
```

### RF-031: Total Server-Side

```gherkin
DADO config 12x/1.99% e cliente enviando installments=6 com total adulterado no payload
QUANDO handler recomputa
ENTÃO o valor cobrado é o totalValue server-side da opção 6
  E payload de total do cliente é ignorado por design
```

---

## Fases de Implementação

### Fase 1 — Função Pura + Config (1 dia)
- computeInstallmentPlan + property-based
- Schema Zod da config + defaults

### Fase 2 — Migrations + Cascata de Grupo (1.5 dias)
- Colunas, UNIQUE, CHECK partially_paid
- DELTA payment-cascade + matriz de testes

### Fase 3 — Carnê (2 dias)
- Capability + caminho nativo Asaas
- Caminho emulado MP + compensação
- Cancelamento de carnê

### Fase 4 — UI (1.5 dias)
- Seletor cartão (fecha PRD-136 RF-023)
- Modal preview + BoletoCarnePanel + badges k/N

### Fase 5 — E2E + Docs (1 dia)
- Fluxo 3x completo com mock
- payment-installments.md
- `_DONE`

---

## Dependências

- **Depende de:** PRD-132/132B (providers + capability nova), PRD-135 (handler boleto, painel, cron, guarda), PRD-134/136 (`payment-cascade.ts` — alterado aqui), PRD-136 (co-dependência: Fase 1 daqui antes da Fase 3 de lá)
- **Bloqueia:** PRD-138 (refund de parcela), PRD-139 (conciliação de grupos), PRD-140B
- **DELTAs declarados:** PRD-134 (cascata de grupo), PRD-132 (capability `supportsNativeBoletoInstallments`), PRD-135 (UNIQUE migrado + guarda estendida)
- **Decisões Pendentes:**
  - Defaults comerciais: `interestFreeUpTo=3`, `interestPctMonth=1.99`, carnê `max=6` — confirmar com financeiro GALLO
  - Carnê /app-only (sugerido e assumido) — revalidar com Owner antes do go-live
  - Fulfillment em `partially_paid` permanece manual (assumido)

---

## Considerações de Segurança

- Total cobrado nunca vem do cliente — recomputação server-side obrigatória
- Carnê exige contexto autenticado + permissão (compromisso financeiro em nome da loja)
- Cancelamento de carnê auditado por parcela (trilha completa para disputa)
- Compensação evita boletos órfãos no gateway (pagáveis sem registro local — risco de dinheiro invisível)

---

## Notas para o Agente Desenvolvedor

> ⚠️ **APÓS:** Bump v2.3.0-rc.7; CHANGELOG; renomear `PRD-137-parcelamento_DONE.md`; anotar os 3 DELTAs nos arquivos `_DONE` dos PRDs 132/134/135.

| Princípio | Descrição |
|-----------|-----------|
| **Uma função, todos os valores** | UI e cobrança saem da mesma `computeInstallmentPlan` |
| **Centavo fecha sempre** | Resto na primeira parcela; invariante testada |
| **Grupo é a unidade do carnê** | Idempotência, cancelamento e cascata pensam em grupo |
| **Nativo onde há, compensação onde não** | Asaas atômico; MP nunca deixa parcial |
| **partially_paid é estado, não flag** | CHECK, filtros e badges de primeira classe |

| ❌ Evitar |
|-----------|
| Confiar no total vindo do cliente |
| Parcela órfã no gateway após falha (compensar!) |
| Regredir order ao cancelar carnê com parcelas pagas |
| Juros recalculados em mais de um lugar |
| Carnê para guest |
| Quebrar o avulso (defaults protegem — testar) |

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
