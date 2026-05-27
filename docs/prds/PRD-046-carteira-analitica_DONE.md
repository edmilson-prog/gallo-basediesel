# PRD-046: Carteira Analítica

## Informações Gerais

| Campo                 | Valor                                                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Projeto**           | GALLO BASE DIESEL — Plataforma de Inteligência Comercial                                                                                                                                                     |
| **Repositório**       | _A definir após criação no Lovable_                                                                                                                                                                          |
| **Objetivo**          | Construir visão analítica da saúde da carteira — distribuição por status (ativo/dormente/perdido), churn (saída), recuperação (retorno), análise por vendedor, e identificação proativa de clientes em risco |
| **Tipo**              | Feature                                                                                                                                                                                                      |
| **Complexidade**      | Alta                                                                                                                                                                                                         |
| **Total de Fases**    | 5                                                                                                                                                                                                            |
| **Prioridade**        | Alta                                                                                                                                                                                                         |
| **Épico**             | Bloco 4a — Gestão A (Onda 2)                                                                                                                                                                                 |
| **PRDs Relacionados** | PRD-012 (Ficha — lifecycleStatus), PRD-014 (Painel Gestor), PRD-018 (Carteira/Transferências), PRD-019 (settings lifecycle), PRD-032 (Pedidos), PRD-044 (Positivação), PRD-045 (Curva ABC)                   |
| **Implementação**     | 🔵 Claude Code CLI                                                                                                                                                                                           |
| **Padrão de código**  | Feature-based; código em `src/features/portfolio-analytics/`                                                                                                                                                 |

### Critérios de Complexidade

> **Justificativa de Alta:** análise multi-dimensional da carteira (status, churn, recuperação, valor), cálculo derivado de múltiplos PRDs (012, 032, 044, 045), 4 métricas principais com cálculos próprios, gráfico evolutivo temporal mostrando entradas/saídas de cada status no tempo, drill-down por vendedor, identificação proativa de clientes em risco com janelas configuráveis, integração transversal, e diferenciação clara de PRD-044 (positivação é binário do mês; aqui é saúde geral contínua).

---

## Contexto do Problema

Diferente de positivação (PRD-044 — comprou esse mês?) ou ABC (PRD-045 — quanto vale?), carteira analítica responde: **como está a saúde geral?**

**Quantos dormentes? Quantos perdidos?** Owner precisa visão executiva. **Churn está acelerando?** Comparativo temporal indica problema sistêmico ou pontual. **Quais vendedores perdem mais clientes?** Identifica necessidade de coaching ou redistribuição. **Quem recuperamos?** Reconhecer esforços de reativação.

Este PRD complementa PRDs 044 e 045 com **dimensão temporal e de status** — visão da carteira viva.

---

## Conceito da Solução

### Diferenciação clara

| PRD                                     | Pergunta                     | Período                             |
| --------------------------------------- | ---------------------------- | ----------------------------------- |
| PRD-044 (Positivação)                   | Comprou no período?          | Mês atual                           |
| PRD-045 (Curva ABC)                     | Quanto vale?                 | Últimos 12 meses                    |
| **PRD-046 (Carteira Analítica)** — este | **Como está a saúde geral?** | **Contínuo + comparativo temporal** |

### Status do cliente (vem de PRD-012)

Calculado por PRD-012 baseado em `IPlatformSettings.lifecycleThresholds`:

| Status    | Critério                                          |
| --------- | ------------------------------------------------- |
| Ativo     | Pedido pago nos últimos `activeDays` (default 30) |
| Dormente  | Sem pedido há `dormantDays` (default 90)          |
| Perdido   | Sem pedido há `lostDays` (default 365)            |
| Pré-venda | Cliente novo sem nenhum pedido                    |

### Métricas

```typescript
IPortfolioMetrics {
  totalCustomers: number;
  byStatus: {
    ativo: number;
    dormente: number;
    perdido: number;
    pre_venda: number;
  };
  // Churn (período)
  churn: {
    period: { start: ISO8601; end: ISO8601 };
    activeToDormant: number;       // viraram dormentes
    activeToLost: number;          // viraram perdidos diretos (raro)
    dormantToLost: number;         // dormentes que viraram perdidos
    churnRate: number;             // % de saída no período
  };
  // Recuperação (período)
  recovery: {
    dormantToActive: number;
    lostToActive: number;
    recoveryRate: number;          // % de recuperação
  };
  // Crescimento
  growth: {
    newCustomers: number;
    netGrowth: number;             // newCustomers - (activeToLost + activeToDormant)
  };
  // Em risco (próximos 15 dias)
  atRisk: {
    activeAtRisk: ICustomer[];     // perto de virar dormentes
    dormantAtRisk: ICustomer[];    // perto de virar perdidos
  };
}

ISellerPortfolio {
  sellerId: ID;
  portfolioSize: number;
  byStatus: IPortfolioMetrics['byStatus'];
  churn: number;
  recovery: number;
  healthScore: number;             // 0-100 (composite)
}
```

### Página `/app/carteira-analitica`

**Header**: filtros (período de análise, vendedor, loja Owner)

**KPIs no topo:**

- Total da carteira
- % Ativos
- % Dormentes
- % Perdidos
- Churn do período
- Recuperação do período
- Crescimento líquido

**Donut chart** mostrando distribuição visual (Ativo/Dormente/Perdido/Pré-venda).

**Gráfico evolutivo temporal** (Recharts):

- Linhas: contagem de cada status ao longo do tempo (últimos 6 meses por padrão)
- Cores semânticas (verde/amarelo/vermelho/cinza)
- Tooltip detalhado

**Fluxo de transições** (visualização tipo "sankey" simplificada ou tabela):

- Active → Dormant: X clientes
- Dormant → Lost: Y clientes
- Dormant → Active (recuperação): Z clientes
- Lost → Active (recuperação rara): W clientes

**Tabela "Saúde por vendedor"** (Gestor/Owner):

- Avatar + nome
- Tamanho da carteira
- % Ativos / % Dormentes / % Perdidos
- Churn no período
- Recuperação
- Health score (composite)

**Listas de risco:**

- "Em risco iminente (próximos 15 dias para virar dormente)" — link para PRD-044
- "Em risco crítico (próximos 15 dias para virar perdido)"

### Drill-down `/app/carteira-analitica/:sellerId`

Página individual com:

- KPIs do vendedor
- Mesmas visualizações filtradas
- Lista de clientes em cada status (paginada, click leva à ficha)

### Health Score

Composite score 0-100 por vendedor:

- 50% da nota: % de ativos na carteira
- 25%: taxa de recuperação no período
- 25% negativa: taxa de churn no período (inverso)

Fórmula:

```
healthScore = (activePercent * 0.5) + (recoveryRate * 0.25) + ((1 - churnRate) * 0.25) * 100
```

### Em risco iminente

Calculado via mesmo helper de PRD-044 (`atRisk`):

- **Ativo em risco**: `lastOrderDate + dormantDays - now < 15`
- **Dormente em risco**: `lastOrderDate + lostDays - now < 15`

Botão "Contatar" em cada cliente (placeholder, navega para conversa).

### Integração com PRD-014 (Painel Gestor)

Widget "Saúde da carteira":

- Mini donut da distribuição
- Indicadores de churn/recuperação
- Click leva para `/app/carteira-analitica`

### Permissões

- **Owner**: cross-store
- **Gestor**: loja
- **Vendedor**: apenas seu drill-down

### Alternativas Consideradas

| Alternativa                        | Por que descartada                                        |
| ---------------------------------- | --------------------------------------------------------- |
| Misturar com PRD-044 (positivação) | Conceitos distintos; ferramentas distintas                |
| Sem gráfico evolutivo              | Sem isso, vira foto sem filme — análise temporal é o core |
| Sem health score                   | Score sintético facilita comparação entre vendedores      |
| Em risco apenas no PRD-044         | Mover para cá faz sentido — visão de saúde inclui         |

---

## Escopo

### Incluído

- ✅ Modelo `IPortfolioMetrics`, `ISellerPortfolio`
- ✅ Engine `calculatePortfolioMetrics(period, context)` em `src/features/portfolio-analytics/engine/`
- ✅ Engine `calculateChurn(period, context)` calculando transições
- ✅ Engine `calculateHealthScore(sellerId, period)`
- ✅ Página `/app/carteira-analitica` substituindo placeholder do PRD-003
- ✅ Donut chart de distribuição (Recharts PieChart)
- ✅ Gráfico evolutivo temporal multi-linha
- ✅ Tabela "Saúde por vendedor" com health score colorido
- ✅ Listas de "em risco iminente" e "em risco crítico"
- ✅ Drill-down `/app/carteira-analitica/:sellerId`
- ✅ Widget no PRD-014
- ✅ Hooks `usePortfolioMetrics`, `useSellerPortfolio` exportáveis
- ✅ Permissões granulares
- ✅ Filtros + URL sync
- ✅ Audit não é necessário (apenas leitura derivada)

### Excluído

- ❌ Sugestões automáticas de ação por status — Fase 2
- ❌ Campanhas automatizadas para dormentes — Fase 2
- ❌ Previsão de churn com IA — Fase 2
- ❌ Cohort analysis avançada — Fase 2
- ❌ Export PDF/Excel — Fase 2
- ❌ Workflows de reativação — Fase 2

---

## Requisitos Funcionais

### Engine

- **RF-001:** Tipos `IPortfolioMetrics`, `ISellerPortfolio`, `IChurnData`, `IRecoveryData`.
- **RF-002:** `calculatePortfolioMetrics(period, context)`:
  - Agrupa customers por lifecycleStatus (calculado via PRD-012 helper)
  - Conta cada status
  - Calcula churn comparando status anterior vs atual
  - Calcula recovery similar
  - Identifica `atRisk` via thresholds
- **RF-003:** `calculateHealthScore(sellerId, period)`:
  - Fórmula composite (50/25/25)
  - Retorna número 0-100 + nota qualitativa ("Excelente" > 80, "Bom" 60-80, "Atenção" 40-60, "Crítico" < 40)
- **RF-004:** Hooks `usePortfolioMetrics(filters)`, `useSellerPortfolio(sellerId, period)`.

### Página principal

- **RF-005:** `PortfolioAnalyticsPage` em `src/features/portfolio-analytics/pages/`.
- **RF-006:** Filtros: período (mês/trim/semestre/ano/12 meses default/personalizado), vendedor, loja (Owner).
- **RF-007:** 7 KPIs: total, %ativos, %dormentes, %perdidos, churn, recovery, growth.
- **RF-008:** Donut chart distribuição (Recharts).
- **RF-009:** Gráfico evolutivo: LineChart com 4 linhas (status), eixo X = períodos amostrais.
- **RF-010:** Card "Transições no período" com 4-5 setas (active→dormant, dormant→lost, dormant→active, lost→active, new).
- **RF-011:** Tabela "Saúde por vendedor" com 9 colunas incluindo healthScore colorido.
- **RF-012:** Listas paginadas "Em risco iminente" e "Em risco crítico" com botão "Contatar".

### Drill-down

- **RF-013:** `SellerPortfolioPage` em `/app/carteira-analitica/:sellerId`.
- **RF-014:** Mesmas visualizações filtradas para um vendedor.
- **RF-015:** Lista completa da carteira com filtro por status e ordenação.

### Integração com PRD-014

- **RF-016:** Widget `<PortfolioHealthWidget>`:
  - Mini donut + KPIs essenciais (churn, recovery)
  - Click leva para `/app/carteira-analitica`

### Permissões

- **RF-017:** Vendedor: vê apenas seu drill-down.
- **RF-018:** Gestor: loja completa.
- **RF-019:** Owner: cross-store.

---

## Requisitos Não-Funcionais

- **RNF-001:** Cálculo < 300ms para 70 clientes em 12 meses de dados.
- **RNF-002:** Memorização agressiva — recalcula apenas quando dados-fonte mudam.
- **RNF-003:** WCAG 2.1 AA.

---

## Critérios de Aceitação

```gherkin
DADO 70 clientes com mix de status
QUANDO calculatePortfolioMetrics executa
ENTÃO byStatus tem contagens corretas
  E churn/recovery calculados via comparativo de período

DADO Vendedor com 80% ativos, 5% churn, 10% recovery
QUANDO calculateHealthScore executa
ENTÃO retorna ~85 (Excelente)

DADO Gestor acessa /app/carteira-analitica
QUANDO página carrega
ENTÃO vê KPIs, donut, gráfico evolutivo, tabela por vendedor
  E pode filtrar por período

DADO Vendedor acessa /app/carteira-analitica
QUANDO observa
ENTÃO redirecionado para /app/carteira-analitica/:meuId (sem ver outros)

DADO clico em "Contatar" um cliente em risco
QUANDO navego
ENTÃO sou levado à inbox/conversa filtrada por customer
```

---

## Fases de Implementação

| Fase | Objetivo                                             |
| ---- | ---------------------------------------------------- |
| 1    | Engines + hooks                                      |
| 2    | Página principal (KPIs, donut, gráfico evolutivo)    |
| 3    | Tabela por vendedor + health score + listas em risco |
| 4    | Drill-down por vendedor                              |
| 5    | Widget PRD-014 + polish                              |

---

## Dependências

| PRD                             | Status |
| ------------------------------- | ------ |
| PRD-012 (lifecycleStatus)       | 📝     |
| PRD-014 (widget)                | 📝     |
| PRD-019 (settings)              | 📝     |
| PRD-032 (pedidos)               | 📝     |
| PRD-044 (helper atRisk reusado) | 📝     |
| PRD-045 (badges complementares) | 📝     |

---

## Cadeia

| Ordem  | PRD               |
| ------ | ----------------- |
| 1-23   | 010-045           |
| **24** | **PRD-046 ATUAL** |

> **Marco:** Bloco 4a (Gestão A) completo.

---

## Considerações de Segurança

- Health score expõe performance comparativa — Vendedor vê só o seu
- Listas de risco contêm PII — permissões respeitam carteira

---

## Convenções

| Elemento | Convenção                                           |
| -------- | --------------------------------------------------- |
| Página   | `PortfolioAnalyticsPage`, `SellerPortfolioPage`     |
| Engine   | `calculatePortfolioMetrics`, `calculateHealthScore` |
| Pasta    | `portfolio-analytics/`                              |

---

## Notas para o Agente Desenvolvedor

- Diferenciar claramente de PRD-044 (positivação) e PRD-045 (ABC) — este é dimensão temporal e de status
- Health score é composite — fórmula explícita
- Reusar helper `atRisk` de PRD-044 (não duplicar)
- Gráfico evolutivo é o destaque — caprichar visualmente
- Permissões: Vendedor não vê tabela "por vendedor" da loja

---

## Status

| Campo         | Valor                                |
| ------------- | ------------------------------------ |
| Status        | ✅ IMPLEMENTADO                      |
| Versão        | v0.30.0 — Vitals (26/05/2026)        |
| Implementação | `src/features/portfolio-analytics/`  |

---

## Histórico

| Data       | Versão | Alteração                                                                                                   |
| ---------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| 25/05/2026 | v1     | Criação inicial — visão analítica de saúde da carteira com churn, recovery, health score, gráfico evolutivo |
| 26/05/2026 | v1.1   | Implementação concluída — engine pura, 5 queries TanStack, página principal + drill-down + widget PRD-014   |

---

**AILA - Sistemas Inteligentes**
