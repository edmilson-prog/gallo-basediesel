# PRD-048: DRE (Demonstrativo de Resultados)

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                     |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                          |
| **Objetivo**          | Construir DRE simplificado — receita bruta (pedidos pagos), custos estimados (custo unitário por produto), despesas mockadas, resultado líquido — com comparativo cross-período e drill-down nos componentes |
| **Tipo**              | Feature                                                                                                                                                                                                      |
| **Complexidade**      | Alta                                                                                                                                                                                                         |
| **Total de Fases**    | 5                                                                                                                                                                                                            |
| **Prioridade**        | Alta                                                                                                                                                                                                         |
| **Épico**             | Bloco 4b — Gestão B (Onda 2)                                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-030 (Catálogo — custo unitário), PRD-032 (Pedido — receita), PRD-040 (Cockpit), PRD-047 (Comissões — despesa), PRD-049 (Rentabilidade)                                                                   |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                           |
| **Padrão de código**  | Feature-based; código em `src/features/dre/`                                                                                                                                                                 |

### Critérios de Complexidade

> **Justificativa de Alta:** estrutura financeira clássica (receita → CMV → margem bruta → despesas → resultado líquido) com 4 níveis de agregação, cálculo derivado complexo somando múltiplas fontes (pedidos, comissões, despesas mockadas), comparativo cross-período (vs mês anterior, vs ano anterior, vs orçado), drill-down em cada componente, estrutura preparada para integração contábil real, e impacto direto no entendimento estratégico do negócio.

---

## Contexto do Problema

Owner João Gallo abre Excel todo mês para fechar resultado. Hoje sem DRE integrado:

**Resultado descoberto tarde.** Vendas R$ 500k, mas qual o resultado líquido? Depende de custos e despesas — sem integração, descobre no dia 10 do mês seguinte. **Sem visualização de margem bruta.** Receita aparece, mas qual % é margem? Sem DRE, gestão volta a planilha. **Comparativos manuais.** "Este mês vs anterior" exige montar tabela à mão.

Este PRD entrega: DRE automático com receita real (pedidos pagos), CMV estimado (custo unitário do catálogo), despesas mockadas configuráveis, e comparativos cross-período. Estrutura preparada para integração contábil real na Fase 2.

---

## Conceito da Solução

### Estrutura clássica do DRE

```
RECEITA BRUTA                       R$ 500.000
(-) Impostos sobre vendas             R$ 80.000   [placeholder configurável]
(-) Devoluções                        R$ 5.000    [PRD-032 status=devolvido]
= RECEITA LÍQUIDA                   R$ 415.000

(-) Custo das Mercadorias (CMV)      R$ 200.000   [sum(item.cost * qty)]
= MARGEM BRUTA                       R$ 215.000   (51.8%)

(-) Despesas Operacionais            R$ 80.000
    - Comissões                       R$ 25.000   [PRD-047]
    - Folha de pagamento              R$ 35.000   [placeholder configurável]
    - Aluguel + Infra                 R$ 12.000   [placeholder]
    - Outros                          R$ 8.000    [placeholder]
= RESULTADO OPERACIONAL              R$ 135.000   (32.5% da receita líquida)

(-) Impostos sobre lucro             R$ 27.000    [placeholder configurável %]
= RESULTADO LÍQUIDO                  R$ 108.000   (26.0%)
```

### Custo unitário (do PRD-030)

Estender `IPart` em PRD-030 (adicionar campo opcional):

```typescript
IPart {
  // ... campos existentes
  unitCost?: number;  // custo de aquisição (R$)
}
```

Vendedores não veem `unitCost`. Apenas Owner/Gestor/Financeiro. Adicionado ao formulário de edição de peça (PRD-030 update mínimo).

No MVP: 70% das peças mockadas têm `unitCost` (ratio realista; ratio ~0.6 do `unitPrice`); 30% sem (geram alerta no DRE).

### Configurações financeiras

Settings:

```typescript
IPlatformSettings.financialSettings {
  taxOnSalesPct: number;          // ex: 0.16 (16%)
  taxOnProfitPct: number;          // ex: 0.20 (20%)
  // Despesas mensais fixas (mock)
  fixedExpenses: {
    payroll: number;               // R$ 35.000 default
    rentInfra: number;             // R$ 12.000
    other: number;                 // R$ 8.000
  };
}
```

Configurável em `/app/configuracoes/financeiro` (Owner/Financeiro).

### Modelo

```typescript
IDREPeriod {
  period: { start: ISO8601; end: ISO8601 };
  storeId?: ID;                  // null = consolidado
  // Receitas
  grossRevenue: number;          // pedidos pagos
  taxOnSales: number;
  returns: number;
  netRevenue: number;
  // CMV
  cmv: number;
  cmvCoverage: number;           // % de pedidos com unitCost definido (0-100)
  grossMargin: number;
  grossMarginPct: number;
  // Despesas operacionais
  commissions: number;            // do PRD-047
  payroll: number;
  rentInfra: number;
  otherExpenses: number;
  totalOperatingExpenses: number;
  operatingResult: number;
  operatingResultPct: number;
  // Líquido
  taxOnProfit: number;
  netResult: number;
  netResultPct: number;
  // Comparativos
  vsPreviousPeriod?: IDREComparison;
  vsYearAgo?: IDREComparison;
}

IDREComparison {
  delta: number;
  deltaPct: number;
  direction: 'up' | 'down' | 'flat';
}
```

### Página `/app/dre`

**Header:** filtros (período mensal/trim/anual, loja Owner).

**Coluna principal: tabela do DRE**

Linhas em hierarquia:

- Receita Bruta (destaque visual)
- (-) Impostos (recuo)
- (-) Devoluções (recuo)
- = Receita Líquida (subtotal destaque)
- (-) CMV (recuo)
- = Margem Bruta (subtotal + %)
- (-) Despesas Operacionais (expansível)
  - Comissões
  - Folha
  - Aluguel + Infra
  - Outros
- = Resultado Operacional (subtotal + %)
- (-) Impostos sobre Lucro
- = **Resultado Líquido** (destaque grande + %)

**Coluna lateral: comparativos**

3 colunas comparativas:

1. Período atual
2. Período anterior (com Δ%)
3. Mesmo período ano anterior (com Δ%)

### Gráficos

**Gráfico 1 — Evolução do Resultado** (12 meses):

- Linha de receita
- Linha de custos
- Linha de resultado líquido
- Eixo Y duplo se necessário

**Gráfico 2 — Composição de despesas** (donut):

- Comissões, Folha, Aluguel+Infra, Outros

### Alertas no DRE

Banner no topo se:

- CMV coverage < 90% (muitas peças sem custo cadastrado)
- Margem bruta < 30% (alerta amarelo)
- Resultado operacional negativo (alerta vermelho)
- Queda > 20% vs período anterior

### Drill-downs

- Click em "Receita Bruta" → PRD-041 (vendas)
- Click em "CMV" → PRD-049 (rentabilidade)
- Click em "Comissões" → PRD-047
- Click em "Devoluções" → PRD-032 com filtro status=devolvido

### Configuração `/app/configuracoes/financeiro`

Sub-rota PRD-019 (Owner/Financeiro):

- Taxa de impostos sobre vendas (slider 0-25%, default 16%)
- Taxa de impostos sobre lucro (slider 0-30%, default 20%)
- Despesas fixas mensais (3 inputs: folha, aluguel+infra, outros)
- Banner: "Integração contábil real disponível na Fase 2 — esses valores são estimativas"

### Permissões

- **Owner**: tudo
- **Financeiro**: tudo (visualiza + configura financeiro)
- **Gestor**: vê DRE da loja (read-only, sem configurar)
- **Vendedor**: SEM ACESSO

### Alternativas Consideradas

| Alternativa                                         | Por que descartada                                    |
| --------------------------------------------------- | ----------------------------------------------------- |
| DRE complexo com sub-contas detalhadas              | MVP precisa de visão simples; complexidade vira ruído |
| Sem comparativo cross-período                       | Tendência é central                                   |
| Sem alertas                                         | Owner não percebe degradação                          |
| Custos hardcoded (sem unitCost no PRD-030)          | Impede análise de margem por produto (PRD-049)        |
| Despesas fixas obrigatórias por categoria detalhada | Complexidade desnecessária no MVP                     |
| Sem coverage de CMV                                 | Owner não saberia se está confiando em dados parciais |

---

## Escopo

### Incluído

- ✅ Modelo `IDREPeriod`, `IDREComparison`, settings financeiros
- ✅ Atualizar `IPart` (PRD-030) com `unitCost` opcional + mock 70% preenchido
- ✅ Atualizar formulário PRD-030 com campo `unitCost` (Owner/Gestor/Financeiro only)
- ✅ Engine `calculateDRE(period, context)` em `src/features/dre/engine/`
- ✅ Página `/app/dre` substituindo placeholder do PRD-003
- ✅ Tabela do DRE com hierarquia visual
- ✅ Comparativos com período anterior e ano anterior (deltas e %)
- ✅ 2 gráficos: evolução temporal, composição despesas
- ✅ Alertas no topo (CMV coverage, margem, resultado, queda)
- ✅ Drill-downs para PRDs 041/047/049
- ✅ Sub-rota `/app/configuracoes/financeiro` (Owner/Financeiro)
- ✅ Indicador de CMV coverage no painel
- ✅ Hooks consumíveis pelo PRD-040
- ✅ Permissões: Owner/Financeiro tudo; Gestor read-only; Vendedor bloqueado
- ✅ Audit log em mudanças de configuração financeira

### Excluído

- ❌ Integração contábil real (NF, fluxo de caixa, conciliação) — Fase 2
- ❌ Múltiplas filiais com consolidação avançada — Fase 2
- ❌ Categorização de despesas customizada — Fase 2
- ❌ Plano de contas completo — Fase 2
- ❌ Export para contador (XLSX/SPED) — Fase 2
- ❌ Projeção / forecast — Fase 2
- ❌ Análise por centro de custo — Fase 2

---

## Requisitos Funcionais

### Modelo e settings

- **RF-001:** Tipos `IDREPeriod`, `IDREComparison` em `src/shared/types/dre.ts`.
- **RF-002:** Settings em `IPlatformSettings.financialSettings`.
- **RF-003:** Defaults: taxOnSales=16%, taxOnProfit=20%, payroll=35000, rentInfra=12000, other=8000.
- **RF-004:** Atualizar `IPart` (PRD-030) adicionando `unitCost?: number`.
- **RF-005:** Mocks (PRD-004 update): 70% das peças com unitCost realista (~60-70% do unitPrice).

### Engine

- **RF-006:** `calculateDRE(period, context)` função pura:
  - Soma pedidos pagos no período = grossRevenue
  - Calcula taxOnSales = grossRevenue \* settings.taxOnSalesPct
  - Soma pedidos `returned` no período = returns
  - netRevenue = grossRevenue - taxOnSales - returns
  - CMV = sum(orderItems where order.paid && period).map(item => item.quantity \* (item.partUnitCost || 0))
  - cmvCoverage = % de items que tinham unitCost
  - grossMargin = netRevenue - cmv
  - commissions = sum(ICommission do período) via PRD-047
  - payroll, rentInfra, otherExpenses = settings
  - totalOperatingExpenses = soma
  - operatingResult = grossMargin - totalOperatingExpenses
  - taxOnProfit = max(0, operatingResult) \* settings.taxOnProfitPct
  - netResult = operatingResult - taxOnProfit
- **RF-007:** Calcula comparativos (vsPreviousPeriod, vsYearAgo) executando função para outros períodos.

### Página

- **RF-008:** `DREPage` em `src/features/dre/pages/`, rota `/app/dre`.
- **RF-009:** Header com filtros: período (mensal default), loja (Owner).
- **RF-010:** Tabela hierárquica:
  - Linhas com recuo conforme nível
  - Subtotais destacados (negrito + cor)
  - Resultado Líquido em destaque maior
- **RF-011:** 3 colunas comparativas: atual, anterior (Δ + %), ano anterior (Δ + %).
- **RF-012:** Linhas expansíveis em "Despesas Operacionais".
- **RF-013:** Gráfico 1 — LineChart 12 meses (receita, custos, resultado).
- **RF-014:** Gráfico 2 — PieChart composição de despesas.
- **RF-015:** Banner de alertas (calculados via `useDREAlerts`).

### Drill-downs

- **RF-016:** Cada linha clicável navega para PRD relevante:
  - Receita Bruta → /app/vendas (PRD-041)
  - CMV → /app/rentabilidade (PRD-049)
  - Comissões → /app/comissoes (PRD-047)
  - Devoluções → /app/pedidos?status=devolvido (PRD-032)

### Configuração

- **RF-017:** `FinancialConfigPage` em `/app/configuracoes/financeiro`.
- **RF-018:** Sub-rota de PRD-019 (substitui placeholder).
- **RF-019:** Sliders e inputs para 5 valores configuráveis.
- **RF-020:** Banner explicativo: "Integração contábil real disponível na Fase 2".
- **RF-021:** Salvar com audit log.

### CMV coverage

- **RF-022:** Indicador no header do DRE: "CMV calculado sobre X% dos pedidos (Y peças sem custo cadastrado)".
- **RF-023:** Click leva à lista de peças sem custo no catálogo (filtro especial em PRD-030).

### Permissões

- **RF-024:** `<GuardedRoute permission={{ resource: 'dre', action: 'view' }}>`.
- **RF-025:** Vendedor bloqueado totalmente.
- **RF-026:** Gestor read-only (sem editar config).
- **RF-027:** Owner/Financeiro: tudo.

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo do DRE < 500ms com 120 pedidos.
- **RNF-002:** Memorização agressiva.
- **RNF-003:** Mobile responsivo (tabela com scroll horizontal).
- **RNF-004:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO 80 pedidos pagos em janeiro totalizando R$ 500k
  E settings.taxOnSalesPct=16%
QUANDO calculateDRE executa para janeiro
ENTÃO grossRevenue=500000, taxOnSales=80000
  E netRevenue=420000 (descontando returns também)

DADO 60 dos 80 pedidos têm itens com unitCost definido
QUANDO calcula CMV
ENTÃO cmvCoverage = 75%
  E banner alerta: "CMV calculado sobre 75% dos pedidos"

DADO Owner acessa /app/dre
QUANDO observa
ENTÃO vê tabela com 3 colunas (atual / anterior / ano anterior)
  E Δ% destacados em verde/vermelho
  E gráficos abaixo

DADO Vendedor tenta acessar /app/dre
QUANDO GuardedRoute valida
ENTÃO redirecionado para /sem-permissao

DADO operatingResult < 0 (prejuízo operacional)
QUANDO useDREAlerts roda
ENTÃO banner vermelho: "Resultado operacional negativo no período"
```

---

## Fases de Implementação

| Fase | Objetivo                                         |
| ---- | ------------------------------------------------ |
| 1    | Modelo + settings + atualizar IPart com unitCost |
| 2    | Engine calculateDRE com comparativos             |
| 3    | Página DRE com tabela hierárquica                |
| 4    | Gráficos + drill-downs + configuração            |
| 5    | Alertas + CMV coverage + polish + mobile         |

---

## Dependências

| PRD                           | Status          |
| ----------------------------- | --------------- |
| PRD-030 (precisa unitCost)    | 📝 (atualizar)  |
| PRD-032 (receita)             | 📝              |
| PRD-040 (consome hook)        | 📝              |
| PRD-047 (comissões = despesa) | 📝 (lote atual) |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-27   | 010-047           |
| **28** | **PRD-048 ATUAL** |
| 29+    | 049-053           |

---

## Considerações de Segurança

- Dados financeiros estratégicos críticos — Owner/Financeiro only
- Mudanças em settings: audit log obrigatório
- Custo unitário é informação sensível — visibilidade restrita
- Banner explícito sobre limitação MVP (estimativas, não contabilidade real)

---

## Convenções

| Elemento | Convenção                        |
| -------- | -------------------------------- |
| Página   | `DREPage`, `FinancialConfigPage` |
| Engine   | `calculateDRE`                   |
| Pasta    | `dre/`, `financial-config/`      |

---

## Notas para o Agente Desenvolvedor

- DRE é estrutura clássica — seguir o padrão (não inventar)
- Comparativos cross-período são o destaque visual
- CMV coverage é proteção contra interpretação errada de dados parciais
- Drill-downs essenciais — cada linha leva a algum lugar
- Banner sobre Fase 2 deixa claro que é estimativa

---

## Status

| Campo  | Valor       |
| ------ | ----------- |
| Status | ⏳ PENDENTE |

---

## Histórico

| Data       | Versão | Alteração                                                                                                        |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — DRE simplificado com receita real, CMV estimado, despesas mockadas, comparativos cross-período |

---

**AILA - Sistemas Inteligentes**
