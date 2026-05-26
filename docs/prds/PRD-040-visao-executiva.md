# PRD-040: Visão Executiva (Cockpit)

## Informações Gerais

| Campo | Valor |
|-------|-------|
| **Projeto** | GALLO BASE DIESEL — Plataforma de Inteligência Comercial |
| **Repositório** | _A definir após criação no Lovable_ |
| **Objetivo** | Construir o dashboard executivo (cockpit) para o Owner — visão estratégica da empresa em uma tela, com KPIs macro, gráficos de tendência, comparativos cross-período e drill-down para análises detalhadas |
| **Tipo** | Feature |
| **Complexidade** | Alta |
| **Total de Fases** | 5 |
| **Prioridade** | Alta |
| **Épico** | Bloco 4b — Gestão B (Onda 2) |
| **PRDs Relacionados** | PRD-014 (Painel Gestor — operacional), PRD-024 (Painel SDR), PRD-041 (Vendas), PRD-042 (Metas), PRD-044 (Positivação), PRD-045 (ABC), PRD-046 (Carteira), PRD-049 (Rentabilidade), PRD-052 (Estoque) |
| **Implementação** | 🔵 Claude Code CLI |
| **Padrão de código** | Feature-based; código em `src/features/executive-cockpit/` |

### Critérios de Complexidade

> **Justificativa de Alta:** painel agregador que consome hooks de **8+ outros PRDs** (042, 044, 045, 046, 041, 047, 049, 052), 10+ KPIs estratégicos com tendências cross-período, múltiplos gráficos (linhas, áreas, distribuição), comparativo lado a lado (mês atual vs anterior, vs ano anterior), drill-down universal para PRDs específicos, customização opcional de layout pelo Owner, e diferenciação clara dos outros painéis operacionais.

---

## Contexto do Problema

Owner João Gallo precisa **visão estratégica em 30 segundos** ao abrir a plataforma. Hoje sem cockpit:

**Painéis operacionais não respondem perguntas estratégicas.** PRD-014 mostra fila de atendimento, PRD-024 mostra SDR — nenhum responde "como está a empresa este mês vs mês passado?". **Owner abre 5 telas para entender o quadro.** Vai em Pedidos, Metas, Positivação, Curva ABC, Carteira — junta informações mentalmente. **Falta visão de macrotendências.** Faturamento subindo ou caindo nos últimos 6 meses? Sem gráfico unificado, percepção é confusa.

Este PRD entrega: painel único agregador que consume hooks dos PRDs analíticos já redigidos (042, 044, 045, 046, etc.) e mostra a fotografia estratégica completa em uma tela navegável.

---

## Diferenciação entre painéis

| Painel | Pergunta | Audiência | Atualização |
|--------|----------|-----------|-------------|
| **PRD-014** (Painel Gestor) | Como vai o atendimento agora? | Owner + Gestor | Tempo real, operação diária |
| **PRD-024** (Painel SDR) | Como vai o agente SDR? | Owner + Gestor | Tempo real, foco SDR |
| **PRD-040** (Cockpit) — este | **Como vai a empresa?** | Owner principalmente | Diário/semanal/mensal estratégico |

---

## Conceito da Solução

### Layout

Rota `/app/cockpit` ou `/app/visao-executiva` substituindo placeholder do PRD-003. Layout `DashboardLayout`.

**Header global:** título "Visão Executiva", filtros (período, loja Owner), botão "Personalizar widgets" (placeholder Fase 2).

### 10+ KPIs estratégicos no topo

Grid 4×3 de cards (`<ExecutiveKpiCard>`), cada um com:
- Métrica + valor formatado
- Tendência (vs período anterior): % com seta
- Mini sparkline (linha pequena de evolução)
- Click leva à página de drill-down

| # | KPI | Fonte | Drill-down |
|---|-----|-------|-----------|
| 1 | **Faturamento** (mês) | Pedidos pagos | PRD-041 (Vendas) |
| 2 | **Ticket Médio** | PRD-042 ticket_medio | PRD-041 |
| 3 | **Total Pedidos** | Pedidos pagos count | PRD-041 |
| 4 | **Margem estimada** | PRD-049 (placeholder no MVP — % fixo sobre fatura) | PRD-049 |
| 5 | **Clientes Ativos** | PRD-046 byStatus.ativo | PRD-046 |
| 6 | **Positivação** | PRD-044 positivationRate | PRD-044 |
| 7 | **Churn do período** | PRD-046 churnRate | PRD-046 |
| 8 | **Novos Clientes** | PRD-042 novos_clientes tipo de meta | PRD-015 |
| 9 | **Pipeline Aberto** | Soma de orçamentos `enviado` + `aceito` não convertidos | PRD-031 |
| 10 | **Taxa Conversão Quote→Pedido** | Quotes convertidos / Quotes enviados | PRD-041 |
| 11 | **Comissões a pagar** | PRD-047 placeholder | PRD-047 |
| 12 | **NPS** (placeholder Fase 2) | Card "Em breve" | — |

### Gráficos macro

**Gráfico 1 — Evolução de faturamento e pedidos (12 meses)**:
- Recharts ComposedChart
- Eixo Y esquerdo: faturamento (área)
- Eixo Y direito: número de pedidos (linha)
- Drill-down para PRD-041

**Gráfico 2 — Distribuição da carteira (donut)**:
- Mesmo do PRD-046; aqui em versão compacta
- Click leva à carteira analítica

**Gráfico 3 — Performance por vendedor (bar)**:
- Top 5 vendedores por faturamento no período
- Drill-down para PRD-041 ou PRD-043

**Gráfico 4 — Curva ABC mini**:
- Pareto compacto com distribuição A/B/C
- Drill-down PRD-045

### Comparativo lado a lado

Card "Mês atual vs Mês anterior" com 3 linhas:
- Faturamento: R$ X (Δ +Y%)
- Pedidos: N (Δ +Y%)
- Ticket médio: R$ X (Δ +Y%)

Indicador visual: verde se cresceu, vermelho se caiu, cinza se manteve.

### Alertas executivos

Banner no topo (se houver):
- "Churn subiu 30% nos últimos 30 dias" (vermelho)
- "5 metas críticas para fechar este mês" (amarelo)
- "Faturamento abaixo de 70% da meta da loja" (vermelho)

Alertas calculados via `useExecutiveAlerts()` que agrega de outros PRDs.

### Personalização (placeholder Fase 2)

Botão "Personalizar widgets" no header com tooltip "Disponível na Fase 2".

### Permissões

- **Owner**: tudo, cross-store
- **Gestor**: visão da própria loja
- **Vendedor**: SEM ACESSO (este é cockpit executivo; vendedor usa /app/metas e ranking)
- **Financeiro**: read-only, focado em finanças

### Alternativas Consideradas

| Alternativa | Por que descartada |
|-------------|---------------------|
| Misturar com PRD-014 | Confunde operacional vs estratégico |
| Apenas KPIs sem gráficos | Sem tendência, vira fotografia estática |
| Sem comparativo cross-período | Direção (subindo/caindo) é central |
| 30+ KPIs | Sobrecarga cognitiva; 10-12 é o ponto |
| Customização total no MVP | Complexidade alta; defaults inteligentes suficientes |

---

## Escopo

### Incluído

- ✅ Página `/app/cockpit` (ou `/app/visao-executiva`) substituindo placeholder
- ✅ Header com filtros (período, loja Owner) + botão personalizar (placeholder)
- ✅ Grid 4×3 de 10-12 KPI cards com sparklines e tendências
- ✅ Drill-down funcional em cada KPI para PRD relevante
- ✅ 4 gráficos macro (faturamento+pedidos, donut carteira, bar top vendedores, mini Pareto ABC)
- ✅ Card "Mês atual vs Mês anterior" com 3 indicadores
- ✅ Hook agregador `useExecutiveMetrics(filters)` consumindo hooks dos PRDs 041/042/044/045/046/047/049
- ✅ Sistema de alertas executivos com banner colorido
- ✅ Permissões: Owner/Gestor/Financeiro; Vendedor bloqueado
- ✅ Mobile responsivo (KPIs em 2 colunas)

### Excluído

- ❌ Personalização de layout — Fase 2
- ❌ Export PDF/email automático — Fase 2
- ❌ Notificações inteligentes proativas — Fase 2
- ❌ NPS real (precisa de pesquisa com clientes) — Fase 2
- ❌ Forecasting com ML — Fase 2
- ❌ Comparativo com benchmarks de mercado — Fase 2

---

## Requisitos Funcionais

### Página principal

- **RF-001:** `ExecutiveCockpitPage` em `src/features/executive-cockpit/pages/`, rota `/app/cockpit`.
- **RF-002:** Header: título, filtros (período: mês/trim/ano/personalizado; loja para Owner; comparativo vs período anterior/mesmo mês ano anterior).
- **RF-003:** Botão "Personalizar widgets" com tooltip Fase 2.

### KPI Cards

- **RF-004:** Componente `<ExecutiveKpiCard>` recebendo: título, valor, tendência (com setas), sparkline, ação onClick (drill-down).
- **RF-005:** Renderizar 10-12 cards em grid 4×3 (responsivo: 2 cols mobile, 3 tablet, 4 desktop).
- **RF-006:** Cada card formatado conforme tipo (R$, %, número).
- **RF-007:** Click navega para PRD específico (URL definida na config do card).

### Hook agregador

- **RF-008:** Criar `useExecutiveMetrics(filters)` em `src/features/executive-cockpit/hooks/`.
- **RF-009:** Hook agrega dados de:
  - `usePositivationMetrics` (PRD-044)
  - `useABCMetrics` (PRD-045)
  - `usePortfolioMetrics` (PRD-046)
  - `useGoalsStatistics` (PRD-042)
  - `useSalesMetrics` (PRD-041) — stub se PRD-041 não implementado ainda
  - `useCommissionMetrics` (PRD-047) — stub se não implementado
  - `useMarginMetrics` (PRD-049) — stub no MVP (margem fixa)
- **RF-010:** Memoria via `useMemo`.

### Gráficos

- **RF-011:** Gráfico 1 — Faturamento + Pedidos: Recharts ComposedChart 12 meses, área + linha, drill-down PRD-041.
- **RF-012:** Gráfico 2 — Donut carteira: PieChart compacto consumindo `usePortfolioMetrics`, drill-down PRD-046.
- **RF-013:** Gráfico 3 — Top 5 vendedores: BarChart horizontal, drill-down PRD-041 ou PRD-043.
- **RF-014:** Gráfico 4 — Mini Pareto ABC: compacto, drill-down PRD-045.

### Comparativo

- **RF-015:** Card "Comparativo" com 3 linhas (faturamento, pedidos, ticket médio).
- **RF-016:** Indicadores verde/vermelho/cinza com setas e Δ%.

### Alertas

- **RF-017:** Hook `useExecutiveAlerts(filters)` calcula alertas:
  - Churn subiu > 20% vs período anterior
  - N+ metas críticas (< 50% atingido, < 7 dias restantes)
  - Faturamento < 70% da meta agregada da loja
- **RF-018:** Banner com cor por severidade, dismissible.

### Permissões

- **RF-019:** `<GuardedRoute permission={{ resource: 'cockpit', action: 'view' }}>`.
- **RF-020:** Vendedor bloqueado, redirecionado.
- **RF-021:** Financeiro vê em modo limitado (alguns cards ocultos via permissions).

---

## Requisitos Não-Funcionais

- **RNF-001:** Página renderiza em < 800ms agregando dados de múltiplos hooks.
- **RNF-002:** Memorização agressiva.
- **RNF-003:** Mobile usável com layout adaptado.
- **RNF-004:** WCAG 2.1 AA — gráficos com tabela alternativa.

---

## Critérios de Aceitação

```gherkin
DADO Owner acessa /app/cockpit
QUANDO página carrega
ENTÃO vê grid 4×3 de KPIs
  E 4 gráficos macro
  E card comparativo lado a lado
  E banner de alertas se houver

DADO Vendedor tenta acessar /app/cockpit
QUANDO GuardedRoute verifica
ENTÃO redirecionado para /app/inicio (sem permissão)

DADO clico no KPI "Faturamento"
QUANDO ação processa
ENTÃO sou navegado para /app/vendas (PRD-041) ou drill-down equivalente

DADO churn subiu 25% no período
QUANDO useExecutiveAlerts roda
ENTÃO banner aparece no topo: "Churn subiu 25% nos últimos 30 dias"
  E é dismissible
```

---

## Fases de Implementação

| Fase | Objetivo |
|------|----------|
| 1 | Hook agregador + KPI cards (10 cards básicos) |
| 2 | 4 gráficos macro |
| 3 | Comparativo lado a lado + alertas |
| 4 | Drill-downs + permissões |
| 5 | Mobile + polish + integrações com PRDs ainda não implementados (stubs) |

---

## Dependências

| PRD | Status |
|-----|--------|
| PRD-042/044/045/046 | 📝 |
| PRD-041 (Vendas) | ⏳ (stub aceito) |
| PRD-047 (Comissões) | ⏳ (stub aceito) |
| PRD-049 (Rentabilidade) | ⏳ (placeholder fixo) |

---

## Cadeia

| Ordem | PRD |
|-------|-----|
| 1-24 | 010-046 |
| **25** | **PRD-040 ATUAL** |
| 26+ | 041, 047-053 |

---

## Considerações de Segurança

- Cockpit expõe dados estratégicos completos — restrito a Owner/Gestor/Financeiro
- Gestor vê apenas loja própria
- Audit log de acessos não necessário (apenas leitura agregada)

---

## Convenções

| Elemento | Convenção |
|----------|-----------|
| Página | `ExecutiveCockpitPage` |
| Componentes | `<ExecutiveKpiCard>` |
| Hook | `useExecutiveMetrics`, `useExecutiveAlerts` |
| Pasta | `executive-cockpit/` |

---

## Notas para o Agente Desenvolvedor

- Cockpit é AGREGADOR — não calcula nada novo; consome hooks dos PRDs analíticos
- Stubs aceitáveis quando PRDs dependentes (041, 047, 049) ainda não implementados
- Sparklines pequenas via Recharts ResponsiveContainer
- Permissões críticas: Vendedor BLOQUEADO completamente
- Mobile: KPIs em 2 colunas, gráficos full-width

---

## Status

| Campo | Valor |
|-------|-------|
| Status | ⏳ PENDENTE |

---

## Histórico

| Data | Versão | Alteração |
|------|--------|-----------|
| 25/05/2026 | v1 | Criação inicial — cockpit executivo agregador de 8+ PRDs analíticos |

---

**AILA - Sistemas Inteligentes**
