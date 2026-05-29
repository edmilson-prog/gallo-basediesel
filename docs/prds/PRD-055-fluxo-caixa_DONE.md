# PRD-055: Fluxo de Caixa

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Construir a visão de Fluxo de Caixa (regime caixa) — entradas (pedidos pagos) vs saídas (despesas pagas + comissões), saldo acumulado, projeção de contas a pagar/receber, e alertas de saldo |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 4 — Gestão B (Onda 2) |
| **PRDs Relacionados** | PRD-032 (Pedido — entradas), PRD-047 (Comissões — saídas), PRD-048 (DRE — regime distinto), PRD-054 (Despesas — saídas), PRD-040 (Cockpit) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/cashflow/`; rota `/app/gestao/caixa` |
| **Origem** | Gap identificado no double-check de 28/05/2026 — slot originalmente planejado como PRD-051 no INDEX v1.0, deslocado durante redação do Bloco 4b; recuperado como PRD-055 |

### Critérios de Complexidade

> **Justificativa de Alta:** agrega entradas e saídas de **3 fontes** (pedidos PRD-032, despesas PRD-054, comissões PRD-047) sob regime de caixa, calcula saldo acumulado dia a dia (série temporal), projeta caixa futuro (contas a receber de pedidos pendentes + a pagar de despesas pendentes), alertas de saldo baixo/negativo, entradas/saídas manuais (aporte/retirada), gráfico de evolução com linha de saldo, e diferenciação conceitual rigorosa do DRE (regime competência vs caixa).

---

## Contexto do Problema

O DRE (PRD-048) mostra resultado por **competência** — quanto a empresa ganhou/gastou no mês, independente de quando o dinheiro entra/sai. Mas o Owner também precisa saber **quanto tem em caixa hoje e amanhã**. Três problemas que só o Fluxo de Caixa resolve:

**Resultado positivo no DRE, mas sem dinheiro em caixa.** Vendeu R$ 100k a prazo (30/60/90) — DRE mostra lucro, mas o dinheiro só entra depois. Sem visão de caixa, Owner não sabe se consegue pagar a folha amanhã. **Não sabe o que vai entrar e sair.** Contas a receber (pedidos pendentes) e a pagar (despesas pendentes) precisam de projeção. **Surpresa com saldo negativo.** Sem alerta, descobre que o caixa furou tarde demais.

Este PRD entrega: visão de caixa em regime de caixa, saldo acumulado, projeção, alertas — confirmado ausente no double-check de 28/05/2026.

---

## Conceito da Solução

### Regime de caixa (distinção do DRE)

| Dimensão | DRE (PRD-048) | Fluxo de Caixa (este) |
|----------|---------------|------------------------|
| Regime | Competência | Caixa |
| Pergunta | A empresa deu lucro? | Tenho dinheiro? |
| Entrada conta quando | Pedido é faturado (competência) | Pedido é **pago** (`paidAt`) |
| Despesa conta quando | Mês de competência | Despesa é **paga** (`paymentDate`) |

Mesma venda a prazo aparece no DRE no mês da venda, mas no Caixa só quando o cliente paga. Essa é a razão de existirem as duas telas.

### Fontes de movimentação

| Tipo | Fonte | Origem |
|------|-------|--------|
| **Entrada** | Pedidos pagos | PRD-032 (`IOrder` com `paymentStatus='paid'`, data = `paidAt`) |
| **Entrada** | Aporte de capital | manual neste PRD |
| **Saída** | Despesas pagas | PRD-054 (`IExpense` com `paymentDate`) |
| **Saída** | Comissões pagas | PRD-047 (`ICommission` com status pago) |
| **Saída** | Retirada (pró-labore, distribuição) | manual neste PRD |

### Modelo

```typescript
ICashFlowEntry {
  id: ID;
  type: 'entrada' | 'saida';
  source: 'pedido' | 'despesa' | 'comissao' | 'aporte' | 'retirada' | 'outro';
  sourceId?: ID;                   // orderId / expenseId / commissionId quando derivado
  description: string;
  amount: number;                  // sempre positivo; `type` define o sinal
  date: ISO8601;                   // data efetiva de caixa
  status: 'realizado' | 'previsto'; // previsto = projeção (pendente)
  storeId: ID;
  createdBy?: ID;                   // preenchido em manuais (aporte/retirada)
  createdAt: ISO8601;
}

ICashFlowSummary {
  period: { start: ISO8601; end: ISO8601 };
  openingBalance: number;          // saldo inicial do período
  totalInflows: number;            // entradas realizadas
  totalOutflows: number;           // saídas realizadas
  netFlow: number;                 // inflows - outflows
  closingBalance: number;          // opening + netFlow
  // Projeção (status='previsto')
  projectedInflows: number;        // pedidos pendentes a receber
  projectedOutflows: number;       // despesas pendentes a pagar + comissões a pagar
  projectedClosingBalance: number;
  // Série temporal
  dailyBalances: ICashFlowDailyPoint[];
}

ICashFlowDailyPoint {
  date: ISO8601;
  inflow: number;
  outflow: number;
  balance: number;                 // saldo acumulado até o dia
  isProjection: boolean;
}
```

### Entradas/saídas derivadas vs manuais

- **Derivadas** (maioria): geradas automaticamente de pedidos pagos, despesas pagas, comissões. Não editáveis aqui (a fonte manda).
- **Manuais**: aporte de capital e retirada — lançadas diretamente neste módulo (não têm fonte em outro PRD).

### Página `/app/gestao/caixa`

Substitui o placeholder atual (que apontava incorretamente para "PRD-051").

**KPIs no topo:**
- Saldo atual (realizado)
- Entradas do período
- Saídas do período
- Saldo projetado (fim do período, com previstos)

**Gráfico principal — Evolução do saldo:**
- Recharts: linha de saldo acumulado ao longo do tempo
- Área de entradas (verde) e saídas (vermelho) por dia/semana
- Trecho realizado (sólido) vs projetado (tracejado) a partir de hoje
- Linha de alerta de saldo mínimo configurável

**Tabela de movimentações:**
- Data
- Tipo (entrada/saída — ícone + cor)
- Origem (badge: pedido/despesa/comissão/aporte/retirada)
- Descrição (link para fonte se derivada)
- Valor (verde/vermelho)
- Status (realizado/previsto)

**Filtros:**
- Período (mês/trimestre/ano/personalizado)
- Tipo (entrada/saída/ambos)
- Origem (multi-select)
- Status (realizado/previsto/ambos)
- Loja (Owner)

### Projeção de caixa

Calculada a partir de:
- **A receber**: `IOrder` com `paymentStatus='pending_payment'` e previsão de pagamento (data estimada conforme prazo) → entradas previstas
- **A pagar**: `IExpense` com status `pendente`/`atrasado` e `dueDate` → saídas previstas; comissões a pagar (PRD-047 não fechadas) → saídas previstas

A projeção estende a série temporal para o futuro (tracejado).

### Alertas

`IPlatformSettings.cashflowSettings.minBalanceAlert` (default R$ 10.000):
- Banner vermelho se saldo atual < mínimo
- Banner amarelo se projeção cruza o mínimo nos próximos 30 dias ("Caixa projetado fica abaixo de R$ X em DD/MM")
- Banner crítico se projeção fica negativa ("Caixa projetado negativo em DD/MM")

### Entradas/saídas manuais

Botão "+ Lançamento manual":
- Tipo: aporte (entrada) ou retirada (saída)
- Valor, data, descrição
- Audit log

### Configuração

Sub-rota `/app/configuracoes/financeiro` (compartilhada com PRD-048/054) ganha:
- Saldo inicial do caixa (opening balance base)
- Alerta de saldo mínimo
- Banner: "Fluxo de Caixa opera em regime de caixa (dinheiro que entra/sai). Para resultado por competência, veja o DRE."

### Integração com Cockpit (PRD-040)

KPI "Saldo em Caixa" no cockpit consome `useCashFlowSummary`. Alerta de saldo baixo aparece também como insight no PRD-053.

### Permissões

| Papel | Ver | Lançar manual | Configurar |
|-------|-----|---------------|------------|
| **Owner** | ✅ | ✅ | ✅ |
| **Financeiro** | ✅ | ✅ | ✅ |
| **Gestor** | ✅ (read-only) | ❌ | ❌ |
| **Vendedor** | ❌ BLOQUEADO | ❌ | ❌ |

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|---------------------|
| Misturar com DRE | Regimes distintos (caixa vs competência); confundiria |
| Sem projeção | Owner não antecipa furo de caixa — perde o principal valor |
| Entradas derivadas editáveis aqui | Quebra fonte única (pedido/despesa mandam) |
| Sem entradas manuais | Aporte/retirada não têm fonte em outro PRD — precisam ser lançados |
| Projeção via ML | Fase 2; no MVP, projeção determinística (prazos + vencimentos) |
| Sem alertas | Surpresa de caixa negativo é o problema central a evitar |

**Decisão consolidada:** **regime de caixa agregando 3 fontes derivadas + 2 manuais, saldo acumulado em série temporal, projeção determinística de contas a pagar/receber, alertas de saldo, distinto do DRE.**

---

## Escopo

### Incluído

- ✅ Modelo `ICashFlowEntry`, `ICashFlowSummary`, `ICashFlowDailyPoint`, settings
- ✅ Engine `buildCashFlow(period, context)` agregando pedidos pagos + despesas pagas + comissões + manuais
- ✅ Engine `projectCashFlow(period, context)` para contas a pagar/receber
- ✅ Página `/app/gestao/caixa` substituindo o placeholder
- ✅ KPIs, gráfico de evolução (realizado + projetado), tabela de movimentações
- ✅ Filtros + URL sync
- ✅ Entradas/saídas manuais (aporte/retirada)
- ✅ Alertas de saldo (mínimo, projeção cruzando mínimo, projeção negativa)
- ✅ Link de movimentação derivada para sua fonte (pedido/despesa)
- ✅ Hook `useCashFlowSummary(filters)` exportado (consumido por PRD-040)
- ✅ Sub-rota de configuração (saldo inicial, alerta mínimo)
- ✅ Permissões (Vendedor bloqueado; Gestor read-only)
- ✅ Audit log em lançamentos manuais e config
- ✅ Mobile responsivo

### Excluído

- ❌ Conciliação bancária — Fase 2
- ❌ Múltiplas contas bancárias — Fase 2
- ❌ Importação de extrato (OFX) — Fase 2
- ❌ Projeção via ML/sazonalidade — Fase 2 (determinística no MVP)
- ❌ Categorização de fluxo (DRE-style) — o DRE cobre isso
- ❌ Cenários (otimista/pessimista) — Fase 2
- ❌ Exportação para Excel/contador — Fase 2
- ❌ Caixa por loja com transferência interna — Fase 2 (multi-loja real)

---

## Requisitos Funcionais

### Modelo e mocks

- **RF-001:** Tipos `ICashFlowEntry`, `ICashFlowSummary`, `ICashFlowDailyPoint`, `cashflowSettings`.
- **RF-002:** Mocks derivam de dados existentes (pedidos pagos do PRD-032, despesas pagas do PRD-054, comissões do PRD-047) — não duplicar; gerar via agregação.
- **RF-003:** ~6 lançamentos manuais mockados (2-3 aportes, 2-3 retiradas) ao longo de 12 meses.
- **RF-004:** Saldo inicial mockado (ex: R$ 50.000 em jan/2026).

### Engines

- **RF-005:** `buildCashFlow(period, context)`:
  - Entradas: pedidos com `paidAt` no período
  - Saídas: despesas com `paymentDate` no período + comissões pagas no período + retiradas
  - Entradas manuais: aportes
  - Calcula `openingBalance`, `totalInflows`, `totalOutflows`, `netFlow`, `closingBalance`
  - Monta `dailyBalances` (saldo acumulado dia a dia)
- **RF-006:** `projectCashFlow(period, context)`:
  - A receber: pedidos `pending_payment` com data estimada (prazo)
  - A pagar: despesas `pendente`/`atrasado` por `dueDate` + comissões não fechadas
  - Estende `dailyBalances` com pontos `isProjection=true`
- **RF-007:** Memorização agressiva.

### Página

- **RF-008:** `CashFlowPage` em `src/features/cashflow/pages/`, rota `/app/gestao/caixa`.
- **RF-009:** Substitui o `PlaceholderPage` atual.
- **RF-010:** 4 KPIs (saldo atual, entradas período, saídas período, saldo projetado).
- **RF-011:** Gráfico Recharts: linha de saldo + áreas de entrada/saída; realizado sólido, projetado tracejado a partir de hoje; linha de saldo mínimo.
- **RF-012:** Tabela de movimentações com 6 colunas; link de derivadas para fonte.
- **RF-013:** 5 filtros + URL sync.

### Projeção

- **RF-014:** Pedidos pendentes geram entradas previstas com data = `paidAt` estimado (criação + prazo do pagamento).
- **RF-015:** Despesas pendentes/atrasadas geram saídas previstas por `dueDate`.
- **RF-016:** Comissões não pagas geram saídas previstas.
- **RF-017:** Trecho projetado visualmente distinto (tracejado).

### Alertas

- **RF-018:** Setting `cashflowSettings.minBalanceAlert` (default R$ 10.000).
- **RF-019:** Banner vermelho se saldo atual < mínimo.
- **RF-020:** Banner amarelo se projeção cruza o mínimo em 30 dias (com data).
- **RF-021:** Banner crítico se projeção fica negativa (com data).

### Lançamentos manuais

- **RF-022:** Botão "+ Lançamento manual" abre modal: tipo (aporte/retirada), valor, data, descrição.
- **RF-023:** Cria `ICashFlowEntry` com `source='aporte'|'retirada'`, `status='realizado'`.
- **RF-024:** Audit log.

### Configuração

- **RF-025:** Sub-rota `/app/configuracoes/financeiro` ganha: saldo inicial + alerta mínimo.
- **RF-026:** Banner explicando regime de caixa vs competência.
- **RF-027:** Audit log em mudanças.

### Integração

- **RF-028:** `useCashFlowSummary(filters)` exportado.
- **RF-029:** PRD-040 (Cockpit) consome para KPI "Saldo em Caixa".
- **RF-030:** PRD-053 (Insights) pode emitir insight de saldo baixo (delta opcional registrado nos DELTAS).

### Permissões

- **RF-031:** `<GuardedRoute>` bloqueia Vendedor.
- **RF-032:** Gestor read-only.
- **RF-033:** Owner/Financeiro completo.

---

## Requisitos Não-Funcionais

- **RNF-001:** `buildCashFlow` + `projectCashFlow` para 12 meses < 500ms.
- **RNF-002:** Gráfico renderiza < 400ms.
- **RNF-003:** Memorização agressiva.
- **RNF-004:** Tipagem rigorosa; zero `any`.
- **RNF-005:** WCAG 2.1 AA — gráfico com tabela alternativa.

---

## Critérios de Aceitação

```gherkin
DADO Owner acessa /app/gestao/caixa
QUANDO a página carrega
ENTÃO vejo KPIs (saldo atual, entradas, saídas, saldo projetado)
  E gráfico de evolução do saldo
  E NÃO vejo mais o placeholder "será implementada no PRD-051"

DADO pedido pago em 15/jan (paidAt) de R$ 5.000
QUANDO buildCashFlow de janeiro roda
ENTÃO entrada de R$ 5.000 aparece em 15/jan
  E saldo acumulado sobe nesse dia

DADO venda a prazo: pedido faturado jan, pagamento previsto fev
QUANDO observo o caixa
ENTÃO a entrada NÃO aparece em janeiro (regime caixa)
  E aparece como PREVISTA em fevereiro (tracejado)
  E o DRE de janeiro (PRD-048) JÁ contava essa receita (competência)

DADO despesa paga (paymentDate) de R$ 2.000 em 10/jan
QUANDO caixa de janeiro roda
ENTÃO saída de R$ 2.000 aparece em 10/jan

DADO saldo atual R$ 8.000 e mínimo configurado R$ 10.000
QUANDO página carrega
ENTÃO banner vermelho "Saldo abaixo do mínimo"

DADO projeção indica saldo negativo em 20/mar
QUANDO observo
ENTÃO banner crítico "Caixa projetado negativo em 20/03"

DADO lanço aporte manual de R$ 30.000 hoje
QUANDO salvo
ENTÃO entrada manual criada, saldo sobe
  E audit log registra

DADO clico numa movimentação derivada de pedido
QUANDO ação processa
ENTÃO navego para o pedido (PRD-032)

DADO Vendedor tenta acessar /app/gestao/caixa
QUANDO GuardedRoute valida
ENTÃO bloqueado

DADO Gestor acessa
QUANDO observa
ENTÃO vê tudo read-only; botão de lançamento manual desabilitado
```

---

## Fases de Implementação

| Fase | Objetivo |
|------|----------|
| 1 | Modelo + engines (buildCashFlow + projectCashFlow) + mocks derivados |
| 2 | Página com KPIs + tabela de movimentações + filtros |
| 3 | Gráfico de evolução (realizado + projetado) |
| 4 | Alertas + lançamentos manuais |
| 5 | Configuração + integração Cockpit + permissões + polish |

### Detalhamento

**Fase 1:** tipos, `buildCashFlow`, `projectCashFlow`, mocks via agregação + 6 manuais + saldo inicial.
**Fase 2:** `CashFlowPage`, 4 KPIs, tabela, 5 filtros, URL sync.
**Fase 3:** gráfico Recharts com saldo + áreas + tracejado de projeção + linha de mínimo.
**Fase 4:** 3 níveis de alerta, modal de lançamento manual (aporte/retirada).
**Fase 5:** config (saldo inicial, alerta), KPI no Cockpit, permissões, mobile, `docs/cashflow.md`.

---

## Dependências

| PRD | Status | Relação |
|-----|--------|---------|
| PRD-032 (Pedido) | ✅ DONE | Entradas (pedidos pagos por `paidAt`) + projeção (a receber) |
| PRD-047 (Comissões) | 📝 | Saídas (comissões pagas) + projeção (a pagar) |
| PRD-048 (DRE) | ✅ DONE | Regime distinto (referência conceitual) |
| PRD-054 (Despesas) | ⏳ | Saídas (despesas pagas por `paymentDate`) + projeção (a pagar) |
| PRD-040 (Cockpit) | ✅ DONE | Consome `useCashFlowSummary` |

> **Ordem recomendada:** implementar PRD-054 (Despesas) antes ou junto — o Caixa depende das saídas de despesa para ser completo.

---

## Cadeia de PRDs

| Ordem | PRD | Status |
|-------|-----|--------|
| ... | Bloco 4b (040-053) | ✅ DONE |
| 54 | PRD-054 (Despesas) | 🔄 |
| **55** | **PRD-055 ATUAL** | ⏳ |

> Marco: com 054 e 055, o Bloco 4 (Gestão e BI) fica completo e fiel ao escopo financeiro originalmente planejado no INDEX v1.0.

---

## Considerações de Segurança

- Dados financeiros críticos — Vendedor BLOQUEADO; Gestor read-only.
- Lançamentos manuais (aporte/retirada) afetam saldo — audit log obrigatório.
- Projeção é estimativa — banner deixa claro que não é garantia.
- Saldo de caixa é informação estratégica sensível.

---

## Convenções de Código

| Elemento | Convenção |
|----------|-----------|
| Página | `CashFlowPage` |
| Componentes | `<CashFlowChart>`, `<CashFlowTable>`, `<ManualEntryModal>`, `<BalanceAlert>` |
| Engine | `buildCashFlow`, `projectCashFlow` |
| Hook | `useCashFlowSummary` |
| Pasta | `cashflow/` |
| Git | `feat(cashflow): add cash flow view with projection and alerts` |

---

## Notas para o Agente Desenvolvedor

### Princípios

- **Regime de caixa ≠ competência**: entrada conta no pagamento (`paidAt`), não no faturamento. Não confundir com DRE.
- **Derivadas não editáveis aqui**: pedido/despesa/comissão mandam; só aporte/retirada são manuais.
- **Projeção determinística**: prazos de pedido + vencimentos de despesa; sem ML no MVP.
- **Alertas são o coração**: o valor da tela é antecipar furo de caixa.
- **Vendedor bloqueado** — dado financeiro estratégico.
- **Mocks derivam de dados existentes** — não duplicar pedidos/despesas.

### O que NÃO Fazer

- Conciliação bancária / OFX (Fase 2)
- Múltiplas contas bancárias (Fase 2)
- Projeção via ML (Fase 2)
- Tornar entradas derivadas editáveis aqui
- Colapsar regime caixa com competência do DRE
- Duplicar lançamentos que já existem como pedido/despesa

---

## Status de Implementação

| Campo | Valor |
|-------|-------|
| **Status** | ✅ CONCLUÍDO |
| **Versão** | v0.46.0 — Treasury |
| **Data de conclusão** | 28/05/2026 |

> **Observações de implementação:** engine de regime de caixa com projeção determinística, alertas (mínimo/cruzamento/negativo), gráfico Recharts, lançamentos manuais e config (saldo inicial + alerta) em Configurações → Financeiro. Pendência menor: o KPI "Saldo em Caixa" no Cockpit (PRD-040, RF-029) não foi plugado para não alterar arquivos de outra feature em sessão paralela — o hook `useCashFlowSummary` já está exportado e pronto.

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 28/05/2026 | v1 | Criação inicial — recupera gap de Fluxo de Caixa identificado no double-check; regime de caixa com projeção e alertas, distinto do DRE |
| 28/05/2026 | v1 — DONE | Implementação concluída na v0.46.0 (Treasury): modelo, engine (build/project), mocks derivados + manuais, página com KPIs/gráfico/tabela/filtros, alertas e lançamentos manuais |

---

**AILA - Sistemas Inteligentes**
