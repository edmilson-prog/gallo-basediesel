# Indicadores por Produto

> Spec de design: `docs/superpowers/specs/2026-06-02-indicadores-por-produto-design.md`
> Tipos de domínio: `src/shared/types/indicators.ts`
> Engine: `src/features/indicators/engine/`
> Feature: `src/features/indicators/`

---

## Conceito

Um **Indicador de Produto** é um conceito **separado** de Meta (Goals — PRD-042).

| Dimensão | Meta | Indicador de Produto |
|---|---|---|
| O que mede | Faturamento total do vendedor ou loja | Vendas de um **recorte de produto** específico |
| Recorte | Nenhum (totalizador geral) | Categoria / SKU / Grupo de peças |
| Criado por | Owner / Gestor | Owner / Gestor |
| Visível para | Vendedor (suas metas) | Vendedor (indicadores do escopo) |

Indicadores reutilizam toda a maquinaria de progresso das Metas:
`GoalProgressStatus` (semáforo verde/amarelo/vermelho), projeção linear, gráfico de evolução acumulada, and shared helpers `computeProjection`, `describePeriodWindow`, `statusFromRatio`, `computeWindowedTrend`.

---

## Modelo de Dados

### `IProductIndicator` (`src/shared/types/indicators.ts`)

```typescript
interface IProductIndicator {
  id: ID;
  storeId: ID;
  name: string;                  // auto-gerado ou customizado
  selector: ProductSelector;     // discriminated union — ver abaixo
  metric: IndicatorMetric;
  scopeLevel: IndicatorScopeLevel;
  sellerId?: ID;                 // presente quando scopeLevel === "individual"
  period: IIndicatorPeriod;
  targetValue: number;
  status: IndicatorStatus;
  division?: Division;           // restringe à divisão (default "parts" no MVP)
  rewardDescription?: string;    // texto livre exibido aos vendedores
  createdBy: ID;                 // ator (Owner/Gestor)
  cancelReason?: string;         // preenchido ao cancelar
  createdAt: ISO8601;
  updatedAt: ISO8601;
}
```

### `ProductSelector` — discriminated union

```typescript
type ProductSelector =
  | { kind: "category"; categories: PartCategory[] }
  | { kind: "sku"; partIds: ID[] }
  | { kind: "group"; label: string; categories?: PartCategory[]; partIds?: ID[] };
```

- **`category`** — um ou mais dentre os 10 tipos de peça (`filtro`, `freio`, `correia`, `motor`, `embreagem`, `eletrica`, `transmissao`, `suspensao`, `arrefecimento`, `lubrificante`).
- **`sku`** — lista explícita de `partId`s do catálogo.
- **`group`** — nome livre + combinação de categorias e/ou SKUs.
- **`subcategory` está fora do MVP** — ver issue #23 para rastreamento.

### Tipos relacionados

| Tipo | Valores |
|---|---|
| `IndicatorMetric` | `"faturamento"` \| `"quantidade"` \| `"margem"` \| `"pedidos"` |
| `IndicatorScopeLevel` | `"store"` \| `"individual"` \| `"global"` |
| `IndicatorPeriodType` | `"diario"` \| `"semanal"` \| `"mensal"` \| `"trimestral"` \| `"anual"` |
| `IndicatorStatus` | `"ativo"` \| `"concluido"` \| `"arquivado"` \| `"cancelado"` |

### `IIndicatorProgress` (runtime, nunca persistido)

```typescript
interface IIndicatorProgress {
  indicatorId: ID;
  currentValue: number;
  percentage: number;         // 0..200 (pode ultrapassar 100)
  projection: number;         // projeção linear de fechamento
  daysRemaining: number;
  totalDays: number;
  status: GoalProgressStatus; // semáforo reusado das Metas
  trend: GoalProgressTrend;
  paceRatio: number;          // percentage / expectedAtDate
  contributors: IIndicatorContributor[];  // ranking por vendedor
}
```

---

## Engine de Cálculo

### Arquivo: `src/features/indicators/engine/`

#### `calculateIndicatorProgress(indicator, context)` — pure function

Calcula o progresso em runtime a partir de pedidos pagos no período.

```typescript
function calculateIndicatorProgress(
  indicator: IProductIndicator,
  context: { orders: IOrder[]; parts?: IPart[]; now?: Date }
): IIndicatorProgress
```

Fluxo interno:
1. Constrói o `partsMap` (ID → IPart) para fallback de categoria.
2. Chama `buildItemMatcher(selector, partsMap)` — predicado por item.
3. Itera os `orders`, filtrando por `matchesScope` + `isPaid` + janela de datas ISO.
4. Para cada pedido que bate, chama `computeOrderContribution`.
5. Acumula `currentValue` e `bySeller` (ranking de contribuição).
6. Usa `describePeriodWindow` + `computeProjection` + `statusFromRatio` + `computeWindowedTrend` — os mesmos helpers das Metas.
7. Retorna `IIndicatorProgress` completo.

**`now`** é injetável para estabilidade de memo (evita re-renders por `new Date()` inline).

#### `computeOrderContribution(order, metric, matches)` — shared helper

```typescript
function computeOrderContribution(
  order: IOrder,
  metric: IndicatorMetric,
  matches: (item: IOrderItem) => boolean
): { matched: boolean; value: number }
```

Computa quanto um único pedido contribui para a métrica:
- `faturamento` → soma de `item.total` dos itens que batem.
- `quantidade` → soma de `item.quantity`.
- `margem` → soma de `item.marginValue`.
- `pedidos` → `1` quando ao menos um item bate (contagem por pedido, não por item).

Retorna `{ matched: false, value: 0 }` se nenhum item do pedido bate.

Esta função é **compartilhada** e usada pelo engine, pelo `IndicatorEvolutionChart` (acumulação diária) e pela `IndicatorCompositionSection` (tabela de pedidos contribuintes).

#### `buildItemMatcher(selector, partsMap)` — decisão C1/C2

```typescript
function buildItemMatcher(
  selector: ProductSelector,
  partsMap: Map<ID, IPart>
): (item: IOrderItem) => boolean
```

Decide se um `IOrderItem` conta para o indicador. Implementa a estratégia de resolução de categoria em duas camadas:

**C1 — Campo denormalizado (primário):** `IOrderItem.partCategory` — snapshot gravado no momento da venda. É a fonte preferencial por ser O(1) e não requerer join.

**C2 — Catálogo de peças (fallback):** `partsMap.get(item.partId)?.category` — usado quando `partCategory` está ausente (itens legados ou importados antes da denormalização).

**Razão da decisão C1:** performance em consultas analíticas + compatibilidade futura com Supabase (o snapshot em `order_items` evita JOINs na tabela `parts` a cada recalculo de indicador). O fallback C2 garante retrocompatibilidade.

---

## Provider e Mocks

### `IIndicatorsProvider` (`src/providers/data/contracts/indicators.ts`)

```typescript
interface IIndicatorsProvider {
  list(params?: IListIndicatorsParams): Promise<IPaginatedResult<IProductIndicator>>;
  upsert(indicator: IProductIndicator): Promise<IProductIndicator>;
  update(id: ID, patch: Partial<IProductIndicator>): Promise<IProductIndicator>;
}
```

`IListIndicatorsParams` suporta filtros: `storeId`, `scopeLevel`, `sellerId`, `metric`, `status` + paginação.

### Implementações

| Impl | Arquivo | Descrição |
|---|---|---|
| Mock | `src/providers/data/impl/mock/indicators.ts` | Delega para `indicatorsApi` (store in-memory) |
| Supabase | `src/providers/data/impl/supabase/indicators.ts` | Stub — drop-in planejado para Fase 2 |

O switch entre implementações é feito pela env `VITE_DATA_SOURCE=mock|supabase` via `factory.ts` (padrão Provider Pattern do projeto).

### Gerador de seeds (`src/mocks/generators/indicator.ts`)

A função `generateIndicators(ctx, { sellers, now? })` gera **~10 indicadores seed**:
- 4 de escopo `store` (filtros faturamento, freios quantidade, lubrificantes margem, linha pesada grupo).
- 2 de escopo `individual` (para o primeiro vendedor não-gestor: filtros faturamento + freios pedidos).
- 3 históricos (meses anteriores, com status `concluido`/`arquivado` alternados).
- 1 `cancelado` (com `cancelReason`).

O store in-memory (`src/mocks/store/`) persiste mutações durante a sessão do browser.

---

## Rotas

| Rota | Arquivo | Quem acessa |
|---|---|---|
| `/app/gestao/indicadores` | `app.gestao.indicadores.index.tsx` | Owner, Gestor → `AggregatedIndicatorsDashboard`; Vendedor/VendedorExterno → `VendedorIndicatorsDashboard` |
| `/app/gestao/indicadores/novo` | `app.gestao.indicadores.novo.tsx` | Owner, Gestor |
| `/app/gestao/indicadores/$id` | `app.gestao.indicadores.$id.tsx` | Todos os roles (guarda de acesso no componente) |

O widget `IndicatorsWidget` (top-5 indicadores ativos por atingimento) é exibido no **Painel do Gestor** (PRD-014 integration), via `src/features/indicators/components/IndicatorsWidget.tsx`.

---

## Hooks

| Hook | Arquivo | Uso |
|---|---|---|
| `useIndicators(params)` | `hooks/useIndicators.ts` | Lista indicadores com progresso calculado; usado na dashboard |
| `useStoreIndicators(storeId)` | `hooks/useIndicators.ts` | Wrapper conveniente de `useIndicators` |
| `useIndicatorProgress(id)` | `hooks/useIndicatorProgress.ts` | Indicador único para a página de detalhe |
| `useIndicatorFilters()` | `hooks/useIndicatorFilters.ts` | Filtros locais por `selectorKind`, `metric`, `scopeLevel`, `status` |
| `useIndicatorAutoStatusUpdate()` | `hooks/useIndicatorAutoStatusUpdate.ts` | Auto-transição no fim do período (máx. 1x/24h via `localStorage`) |
| `useIndicatorMilestoneToast()` | `hooks/useIndicatorMilestoneToast.ts` | Toast de marco 50/80/100% (guardado por `localStorage`) |

### Dados carregados pelos hooks

- `useIndicators` carrega em paralelo: lista de indicadores (`pageSize: 500`) + pedidos pagos (`pageSize: 5000`) + catálogo de peças (`pageSize: 5000`). O progresso de todos os indicadores é computado em um único `useMemo`.
- `useIndicatorProgress` carrega o indicador + pedidos com escopo mínimo (scoped por `storeId`/`sellerId`) + catálogo. As mesmas query keys são reutilizadas pelo `IndicatorDetailPage` para cache hit (sem re-fetch).

---

## Permissões (RBAC)

Resource: `"indicator"` — espelha as permissões do resource `"goal"`.

| Role | Permissões |
|---|---|
| Owner | CRUD em todos os indicadores (qualquer loja) |
| Gestor | CRUD nos indicadores da loja dele |
| Vendedor | `view` (leitura), escopo `own` — `p("indicator", ["view"], "own")` |
| VendedorExterno | `view` (leitura), escopo `own` — `p("indicator", ["view"], "own")` |
| Financeiro | Leitura dos indicadores da loja |

> O grant `own` é único na matriz; como ele resolve para indicadores de escopo `store`/`global` (vs. somente os `individual` do próprio vendedor) é tratado pela camada de enforcement do RBAC, não por grants separados na matriz.

Criação e edição (botões "Novo indicador", "Editar", "Arquivar", "Cancelar indicador") são renderizados condicionalmente: `canCreate = userRole === "Owner" || userRole === "Gestor"`.

---

## Notificações

### Toasts de marco (vendedor)

`useIndicatorMilestoneToast` (montado em `VendedorIndicatorsDashboard`) dispara um toast ao cruzar os marcos **50%**, **80%** e **100%** de atingimento. Cada marco por indicador é guardado em `localStorage` (`gallo-indicator-milestones`) para não repetir ao recarregar a página.

Ao montar pela primeira vez (ref `seededRef`), o hook marca silenciosamente todos os marcos já alcançados — sem disparar toasts retroativos.

### Status automático no fim do período

`useIndicatorAutoStatusUpdate` (montado em `AggregatedIndicatorsDashboard`) executa ao montar e no máximo uma vez a cada 24 horas (`gallo-indicator-auto-status-run`). Para cada indicador `ativo` com `period.end < now`:
- `percentage >= 100` → status `"concluido"` + audit `indicator_auto_complete`
- caso contrário → status `"arquivado"` + audit `indicator_auto_archive`

Após as transições, invalida as queries `["indicators"]` via TanStack Query.

---

## Componentes

### Dashboard (`IndicatorsPage`)

| Componente | Responsabilidade |
|---|---|
| `AggregatedIndicatorsDashboard` | Visão Owner/Gestor: KPI strip (4 cells), filtros, gráfico de barras, tabela |
| `VendedorIndicatorsDashboard` | Visão Vendedor: grade de cards (1→2→3 cols) com `useIndicatorMilestoneToast` |
| `IndicatorProgressChart` | Bar chart de atingimento por indicador (Recharts `BarChart` + `ResponsiveContainer`) |
| `IndicatorsTable` | Tabela em `overflow-x-auto` — nome, recorte, métrica, escopo, período, alvo, progresso, status, projeção |
| `IndicatorFiltersBar` | Filtros por tipo de recorte, métrica, escopo e status |
| `IndicatorCard` | Card individual para a visão do vendedor |
| `ListStatStrip` | KPI strip compartilhado (responsive: `grid-cols-2 sm:grid-cols-4`) |

### Criação (`NewIndicatorPage`)

Formulário em cards empilhados com 5 seções:
1. **Recorte de produto** — `ProductSelectorField` (mode category/sku/group).
2. **Métrica** — radio group em `grid md:grid-cols-2`.
3. **Escopo e período** — radio group em `grid md:grid-cols-3`; selects de loja/vendedor/período; campos de data em `grid grid-cols-1 md:grid-cols-2`.
4. **Valor-alvo** — input numérico com preview BRL.
5. **Recompensa** — textarea opcional.
6. **Nome** — auto-gerado a partir de métrica + recorte + período; editável.

CTAs: "Salvar rascunho" (status `arquivado`) e "Criar indicador" (status `ativo`).

### Detalhe (`IndicatorDetailPage`)

| Seção | Componente |
|---|---|
| Header + ações | inline no `IndicatorDetailPage` |
| Resumo de progresso | `IndicatorProgressSummary` |
| Evolução (gráfico de linhas) | `IndicatorEvolutionChart` |
| Ranking de contribuição | `ContributionRanking` (oculto para escopo individual) |
| Pedidos contribuintes | `IndicatorCompositionSection` (tabela em `overflow-x-auto`) |

O `IndicatorEvolutionChart` desenha duas linhas cumulativas — **Realizado** (acumulado de `computeOrderContribution`) e **Esperado** (proporção linear da meta). Períodos longos são amostrados em até 60 pontos via `sampleDays` para legibilidade.

### Modais e diálogos

| Componente | Trigger |
|---|---|
| `EditIndicatorModal` | Botão "Editar" (Owner/Gestor, status `ativo`) — edita nome, valor-alvo e recompensa; recorte/métrica/período são imutáveis |
| `CancelIndicatorDialog` | Botão "Cancelar indicador" — exige motivo; grava `cancelReason` |

---

## Fora do MVP

| Item | Status | Referência |
|---|---|---|
| Subcategoria no `ProductSelector` | Planejado | Issue #23 |
| Indicadores em cascata (store → individual automático) | Não planejado | — |
| Escopo de equipe (`team`) | Dormante | Comentário em `IndicatorScopeLevel` |
| Forecasting ML | Pós-Fase 2 | — |
| Export (CSV/PDF) | Pós-Fase 2 | — |

---

## Relacionamentos com o restante do sistema

- **Pedidos (`IOrder`):** fonte primária de dados. O engine filtra por `paymentStatus === "pago"` e pela janela ISO do período.
- **Catálogo de peças (`IPart`):** usado como fallback C2 para resolver categorias.
- **Vendedores (`ISeller`):** resolvidos para nomes de exibição no ranking e no detalhe.
- **Audit log:** todas as ações (criar, editar, arquivar, cancelar, auto-complete, auto-archive) são registradas via `recordAuditLogSync`.
- **Metas (`IGoal`):** sem relação de dados — compartilham apenas helpers de progresso (`src/shared/progress/`) e componentes de UI (`GoalProgressBar`, `GoalStatusBadge`).
