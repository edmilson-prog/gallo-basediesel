# Indicadores por Produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o conceito de **Indicador por produto** — acompanhamento de vendas por recorte de produto (categoria/SKU/grupo) contra um alvo, com métricas (faturamento/quantidade/margem/pedidos), escopo (loja/individual/global), ranking de contribuição por vendedor e acompanhamento rico (semáforo, projeção, gráfico evolutivo, notificações de marco).

**Architecture:** Entidade própria (`IProductIndicator`) separada de Metas, com tipos, provider, rotas e telas próprios, **reusando** a maquinaria de progresso das metas. Os helpers `statusFromRatio`/`computeTrend` são extraídos para `src/shared/progress/` e a categoria da peça é denormalizada em `IOrderItem` (decisão C1, com fallback C2 resolvendo via catálogo).

**Tech Stack:** React + TypeScript (strict), TanStack Router (file-based) + TanStack Query, Tailwind v4 + shadcn/ui, Recharts, Provider Pattern (mock/supabase), Vite + Bun.

> **Validação neste projeto:** não há test runner (CLAUDE.md). A validação de cada task usa:
>
> - `bun run build` → type-check (`tsc --noEmit`) + build de produção.
> - `bun run lint` → ESLint (inclui `no-restricted-imports` da camada de providers).
> - Para a engine pura (Fase 1), um script descartável rodado com `bun run <script>.ts` que faz asserções e é removido antes do commit.
> - Verificação manual da UI pelo usuário (não abrir browser/preview automaticamente).

---

## File Structure

**Tipos & progresso compartilhado**

- `src/shared/types/indicators.ts` _(novo)_ — `IProductIndicator`, `IIndicatorProgress`, `ProductSelector`, unions.
- `src/shared/types/index.ts` _(modificar)_ — re-export dos tipos novos.
- `src/shared/types/commercial.ts` _(modificar)_ — campos aditivos `partCategory?`/`partSubcategory?` em `IOrderItem`.
- `src/shared/progress/index.ts` _(novo)_ — `statusFromRatio`, `computeWindowedTrend` (extraídos das metas).
- `src/features/goals/engine/calculate.ts` _(modificar)_ — passa a importar de `src/shared/progress`.

**Engine do indicador**

- `src/features/indicators/engine/matcher.ts` _(novo)_ — `buildItemMatcher(selector, partsMap)`.
- `src/features/indicators/engine/calculate.ts` _(novo)_ — `calculateIndicatorProgress(indicator, context)`.

**Provider & mocks**

- `src/providers/data/contracts/indicators.ts` _(novo)_ — `IIndicatorsProvider`, `IListIndicatorsParams`.
- `src/providers/data/contracts/index.ts` _(modificar)_ — registrar no barrel + `IDataProviders`.
- `src/providers/data/index.ts` _(modificar)_ — export do hook + tipos.
- `src/providers/data/hooks/useIndicatorsProvider.ts` _(novo)_.
- `src/providers/data/impl/mock/indicators.ts` _(novo)_.
- `src/providers/data/impl/supabase/indicators.ts` _(novo, stub NotImplementedError)_.
- `src/providers/data/factory.ts` _(modificar)_ — registrar mock + supabase.
- `src/mocks/api/indicators.ts` _(novo)_ — `indicatorsApi`.
- `src/mocks/api/index.ts` _(modificar)_ — export `indicatorsApi`.
- `src/mocks/generators/indicator.ts` _(novo)_ — `generateIndicators`.
- `src/mocks/generators/order.ts` _(modificar)_ — carimbar `partCategory` no item (C1).
- `src/mocks/generators/bootstrap.ts` _(modificar)_ — gerar e incluir `indicators` no dataset.
- `src/mocks/store/mutations.ts` _(modificar)_ — `indicators` em `CollectionKey`/`CollectionMap`.
- `src/mocks/store/selectors.ts` _(modificar)_ — `selectAllIndicators`.

**Feature hooks**

- `src/features/indicators/hooks/useIndicatorProgress.ts` _(novo)_.
- `src/features/indicators/hooks/useIndicators.ts` _(novo)_ — `useIndicators`, `useStoreIndicators`.
- `src/features/indicators/hooks/useIndicatorAutoStatusUpdate.ts` _(novo)_.

**UI**

- `src/features/indicators/i18n/pt-BR.ts` _(novo)_.
- `src/features/indicators/pages/IndicatorsPage.tsx` _(novo)_ — dashboard.
- `src/features/indicators/pages/NewIndicatorPage.tsx` _(novo)_ — criação.
- `src/features/indicators/pages/IndicatorDetailPage.tsx` _(novo)_ — detalhe.
- `src/features/indicators/components/ProductSelectorField.tsx` _(novo)_ — seletor multimodal.
- `src/features/indicators/components/ContributionRanking.tsx` _(novo)_ — ranking de contribuição.
- `src/features/indicators/components/IndicatorEvolutionChart.tsx` _(novo)_ — gráfico evolutivo.
- `src/features/indicators/components/IndicatorsWidget.tsx` _(novo)_ — widget do painel.
- `src/routes/app.gestao.indicadores.tsx` _(novo)_ — layout Outlet.
- `src/routes/app.gestao.indicadores.index.tsx` _(novo)_.
- `src/routes/app.gestao.indicadores.novo.tsx` _(novo)_.
- `src/routes/app.gestao.indicadores.$id.tsx` _(novo)_.
- `src/features/shell/config/navigation.ts` _(modificar)_ — item de menu "Indicadores".
- `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx` _(modificar)_ — montar `IndicatorsWidget`.

---

## FASE 1 — Tipos, denormalização C1, engine, helpers compartilhados, mocks, hooks de dados

### Task 1: Tipos do Indicador

**Files:**

- Create: `src/shared/types/indicators.ts`
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Criar o arquivo de tipos**

`src/shared/types/indicators.ts`:

```typescript
import type { Division, ID, ISO8601 } from "./common";
import type { PartCategory } from "./part-identification";
import type { GoalProgressStatus, GoalProgressTrend } from "./goals";

/** Metric an indicator tracks against the product slice. */
export type IndicatorMetric = "faturamento" | "quantidade" | "margem" | "pedidos";

/** Scope level — `team` is intentionally omitted (dormant per briefing). */
export type IndicatorScopeLevel = "store" | "individual" | "global";

/** Time granularity. */
export type IndicatorPeriodType = "diario" | "semanal" | "mensal" | "trimestral" | "anual";

/** Lifecycle status. */
export type IndicatorStatus = "ativo" | "concluido" | "arquivado" | "cancelado";

/**
 * Product slice the indicator measures. Discriminated by `kind`.
 * Subcategory is intentionally out of MVP — see issue #23.
 */
export type ProductSelector =
  | { kind: "category"; categories: PartCategory[] }
  | { kind: "sku"; partIds: ID[] }
  | { kind: "group"; label: string; categories?: PartCategory[]; partIds?: ID[] };

/** Time-bounded period of an indicator. */
export interface IIndicatorPeriod {
  type: IndicatorPeriodType;
  start: ISO8601;
  end: ISO8601;
}

/**
 * Product indicator — a target value for a metric, measured against a product
 * slice (category / sku / group), scoped by level and period.
 *
 * Separate concept from IGoal (PRD-042) — see
 * docs/superpowers/specs/2026-06-02-indicadores-por-produto-design.md
 */
export interface IProductIndicator {
  id: ID;
  storeId: ID;
  /** Human-readable name (autogenerated or customized). */
  name: string;
  selector: ProductSelector;
  metric: IndicatorMetric;
  scopeLevel: IndicatorScopeLevel;
  /** Present when `scopeLevel === "individual"`. */
  sellerId?: ID;
  period: IIndicatorPeriod;
  targetValue: number;
  status: IndicatorStatus;
  /** Restricts the indicator to a division when set (default parts in MVP). */
  division?: Division;
  /** Free-text reward shown to sellers. */
  rewardDescription?: string;
  /** Actor (Owner/Gestor) that created it. */
  createdBy: ID;
  /** Reason captured when status moves to `cancelado`. */
  cancelReason?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** Per-seller contribution to a collective indicator. */
export interface IIndicatorContributor {
  sellerId: ID;
  /** Matched value attributed to this seller (BRL or count per metric). */
  value: number;
  /** Fraction of `currentValue` (0..1). */
  share: number;
}

/**
 * Derived progress of an indicator — computed at runtime by
 * `calculateIndicatorProgress`. Never persisted.
 */
export interface IIndicatorProgress {
  indicatorId: ID;
  currentValue: number;
  /** Percentage of `targetValue` reached (0..200). */
  percentage: number;
  /** Linear projection if pace holds (capped at 200% of target). */
  projection: number;
  daysRemaining: number;
  totalDays: number;
  /** Traffic-light status (reuses the goals type). */
  status: GoalProgressStatus;
  trend: GoalProgressTrend;
  /** Pre-computed ratio `percentage / expectedAtDate`. */
  paceRatio: number;
  /** Seller breakdown, sorted desc by `value`. */
  contributors: IIndicatorContributor[];
}
```

- [ ] **Step 2: Re-exportar no barrel**

Em `src/shared/types/index.ts`, após a linha `export type { IGoalProgress, GoalProgressStatus, GoalProgressTrend } from "./goals";`, adicionar:

```typescript
export type {
  IProductIndicator,
  IIndicatorProgress,
  IIndicatorContributor,
  IIndicatorPeriod,
  ProductSelector,
  IndicatorMetric,
  IndicatorScopeLevel,
  IndicatorPeriodType,
  IndicatorStatus,
} from "./indicators";
```

- [ ] **Step 3: Type-check**

Run: `bun run build`
Expected: PASS (sem erros de tipo).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/indicators.ts src/shared/types/index.ts
git commit -m "feat(indicators): add product indicator domain types"
```

---

### Task 2: Denormalizar categoria no item de pedido (C1)

**Files:**

- Modify: `src/shared/types/commercial.ts:158-176` (`IOrderItem`)
- Modify: `src/mocks/generators/order.ts` (`generateOrderItems`)

- [ ] **Step 1: Adicionar campos aditivos opcionais ao `IOrderItem`**

Em `src/shared/types/commercial.ts`, dentro de `interface IOrderItem`, após o campo `appliedToVehicleId?: ID;`, adicionar:

```typescript
  /**
   * Snapshot of the part's category at sale time (denormalized for product
   * indicators — see indicators design). Optional/additive: when absent, the
   * indicator engine resolves it via the parts catalog (fallback).
   */
  partCategory?: import("./part-identification").PartCategory;
  /** Snapshot of the part's subcategory at sale time. Captured for issue #23; unused in MVP. */
  partSubcategory?: string;
```

- [ ] **Step 2: Carimbar a categoria nos dois caminhos de geração de item**

Em `src/mocks/generators/order.ts`, função `generateOrderItems`:

No ramo `sourceQuote` (dentro do `.map`), o objeto retornado adiciona após `marginValue`:

```typescript
        partCategory: part?.category,
        partSubcategory: part?.subcategory,
```

No ramo aleatório (o `items.push({ ... })`), adicionar após `marginValue`:

```typescript
      partCategory: part.category,
      partSubcategory: part.subcategory,
```

- [ ] **Step 3: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/commercial.ts src/mocks/generators/order.ts
git commit -m "feat(indicators): denormalize part category onto order items"
```

---

### Task 3: Extrair helpers de progresso compartilhados

**Files:**

- Create: `src/shared/progress/index.ts`
- Modify: `src/features/goals/engine/calculate.ts`

- [ ] **Step 1: Criar o módulo compartilhado**

`src/shared/progress/index.ts`:

```typescript
import type { GoalProgressStatus } from "@/shared/types";

/**
 * Traffic-light status from attainment vs. expected-by-date pace.
 * Extracted from the goals engine so goals and indicators share one rule.
 */
export function statusFromRatio(percentage: number, daysRatio: number): GoalProgressStatus {
  if (percentage >= 100) return "concluida";
  const expected = daysRatio * 100;
  if (expected <= 0) return "no_caminho";
  const ratio = percentage / expected;
  if (ratio >= 1.0) return "no_caminho";
  if (ratio >= 0.7) return "atencao";
  return "atrasada";
}

/** One contribution sample: a timestamp and the value realized at it. */
export interface IProgressSample {
  ts: string;
  value: number;
}

/**
 * Trend over the period: compares the value realized in the first half of the
 * elapsed window against the second half. Generic over the value being summed
 * (order total for goals, matched item value for indicators).
 */
export function computeWindowedTrend(
  samples: IProgressSample[],
  fromIso: string,
  now: Date,
): import("@/shared/types").GoalProgressTrend {
  const half = new Date((new Date(fromIso).getTime() + now.getTime()) / 2).toISOString();
  let firstHalf = 0;
  let secondHalf = 0;
  for (const s of samples) {
    if (s.ts < half) firstHalf += s.value;
    else secondHalf += s.value;
  }
  if (firstHalf === 0 && secondHalf === 0) return "estavel";
  if (firstHalf === 0) return "subindo";
  const diff = (secondHalf - firstHalf) / firstHalf;
  if (diff > 0.1) return "subindo";
  if (diff < -0.1) return "caindo";
  return "estavel";
}
```

- [ ] **Step 2: Reapontar a engine de metas para o módulo compartilhado**

Em `src/features/goals/engine/calculate.ts`:

1. Remover a função local `statusFromRatio` (linhas ~34-42) e a função local `computeTrend` (linhas ~44-68).
2. Adicionar no topo, junto aos imports: `import { statusFromRatio, computeWindowedTrend } from "@/shared/progress";`
3. Substituir a chamada `const trend = computeTrend(goal, context.orders, fromIso, toIso, now);` por:

```typescript
const trendSamples = context.orders
  .filter((o) => matchesGoal(o, goal) && isPaid(o))
  .map((o) => ({ ts: o.paidAt ?? o.createdAt, value: o.total }))
  .filter((s) => s.ts >= fromIso && s.ts <= toIso);
const trend = computeWindowedTrend(trendSamples, fromIso, now);
```

(Mantém o comportamento idêntico: mesma soma de `order.total` por metade do período.)

- [ ] **Step 3: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS. Comportamento das metas inalterado (mesma fórmula).

- [ ] **Step 4: Commit**

```bash
git add src/shared/progress/index.ts src/features/goals/engine/calculate.ts
git commit -m "refactor(progress): extract shared status/trend helpers from goals engine"
```

---

### Task 4: Matcher de produto

**Files:**

- Create: `src/features/indicators/engine/matcher.ts`

- [ ] **Step 1: Implementar o matcher**

`src/features/indicators/engine/matcher.ts`:

```typescript
import type { ID, IOrderItem, IPart, ProductSelector } from "@/shared/types";

/**
 * Build the per-item predicate that decides whether an order item counts
 * toward the indicator. Resolves the item's category from the denormalized
 * field (C1) and falls back to the parts catalog (C2) when absent.
 */
export function buildItemMatcher(
  selector: ProductSelector,
  partsMap: Map<ID, IPart>,
): (item: IOrderItem) => boolean {
  return (item: IOrderItem): boolean => {
    const category = item.partCategory ?? partsMap.get(item.partId)?.category;
    switch (selector.kind) {
      case "category":
        return category != null && selector.categories.includes(category);
      case "sku":
        return selector.partIds.includes(item.partId);
      case "group":
        return (
          (category != null && (selector.categories?.includes(category) ?? false)) ||
          (selector.partIds?.includes(item.partId) ?? false)
        );
    }
  };
}
```

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/indicators/engine/matcher.ts
git commit -m "feat(indicators): add product selector matcher"
```

---

### Task 5: Engine de cálculo do progresso do indicador

**Files:**

- Create: `src/features/indicators/engine/calculate.ts`

- [ ] **Step 1: Implementar `calculateIndicatorProgress`**

`src/features/indicators/engine/calculate.ts`:

```typescript
import type {
  ID,
  IOrder,
  IPart,
  IProductIndicator,
  IIndicatorProgress,
  IIndicatorContributor,
} from "@/shared/types";
import { computeProjection, describePeriodWindow } from "@/features/goals/engine/projection";
import { statusFromRatio, computeWindowedTrend, type IProgressSample } from "@/shared/progress";
import { buildItemMatcher } from "./matcher";

export interface IIndicatorContext {
  orders: IOrder[];
  /** Catalog used as fallback to resolve item categories when not denormalized. */
  parts?: IPart[];
  /** Reference clock — defaults to `new Date()`; injectable for memo stability. */
  now?: Date;
}

function isWithin(iso: string | undefined, fromIso: string, toIso: string): boolean {
  if (!iso) return false;
  return iso >= fromIso && iso <= toIso;
}

function matchesScope(order: IOrder, ind: IProductIndicator): boolean {
  if (order.storeId !== ind.storeId) return false;
  if (ind.scopeLevel === "individual" && order.sellerId !== ind.sellerId) return false;
  if (ind.division && order.division !== ind.division) return false;
  return true;
}

/**
 * Pure function — compute the runtime progress of a product indicator.
 * Aggregates only the order items matching the product selector, within
 * scope + period, for paid orders.
 */
export function calculateIndicatorProgress(
  indicator: IProductIndicator,
  context: IIndicatorContext,
): IIndicatorProgress {
  const now = context.now ?? new Date();
  const fromIso = indicator.period.start;
  const toIso = indicator.period.end;

  const partsMap = new Map<ID, IPart>((context.parts ?? []).map((p) => [p.id, p]));
  const matches = buildItemMatcher(indicator.selector, partsMap);

  let currentValue = 0;
  const orderIdsWithMatch = new Set<ID>();
  const bySeller = new Map<ID, number>();
  const samples: IProgressSample[] = [];

  for (const order of context.orders) {
    if (!matchesScope(order, indicator)) continue;
    if (order.paymentStatus !== "pago") continue;
    const ts = order.paidAt ?? order.createdAt;
    if (!isWithin(ts, fromIso, toIso)) continue;

    let orderMatchedValue = 0;
    let orderMatched = false;
    for (const item of order.items) {
      if (!matches(item)) continue;
      orderMatched = true;
      switch (indicator.metric) {
        case "faturamento":
          orderMatchedValue += item.total;
          break;
        case "quantidade":
          orderMatchedValue += item.quantity;
          break;
        case "margem":
          orderMatchedValue += item.marginValue;
          break;
        case "pedidos":
          // counted once per order below
          break;
      }
    }

    if (!orderMatched) continue;
    orderIdsWithMatch.add(order.id);

    const contribution = indicator.metric === "pedidos" ? 1 : orderMatchedValue;
    currentValue += contribution;
    bySeller.set(order.sellerId, (bySeller.get(order.sellerId) ?? 0) + contribution);
    samples.push({ ts, value: contribution });
  }

  if (indicator.metric === "pedidos") {
    currentValue = orderIdsWithMatch.size;
  }

  const window = describePeriodWindow(indicator.period, now);
  const percentage =
    indicator.targetValue > 0 ? Math.round((currentValue / indicator.targetValue) * 1000) / 10 : 0;
  const projection = computeProjection(
    currentValue,
    window.daysPassed,
    window.totalDays,
    indicator.targetValue,
  );
  const paceRatio = window.daysRatio > 0 ? percentage / (window.daysRatio * 100) : 1;
  const status = statusFromRatio(percentage, window.daysRatio);
  const trend = computeWindowedTrend(samples, fromIso, now);

  const contributors: IIndicatorContributor[] = [...bySeller.entries()]
    .map(([sellerId, value]) => ({
      sellerId,
      value,
      share: currentValue > 0 ? value / currentValue : 0,
    }))
    .sort((a, b) => b.value - a.value);

  return {
    indicatorId: indicator.id,
    currentValue,
    percentage,
    projection,
    daysRemaining: window.daysRemaining,
    totalDays: window.totalDays,
    status,
    trend,
    paceRatio,
    contributors,
  };
}
```

> Nota: `IIndicatorPeriod` é estruturalmente compatível com o parâmetro de `describePeriodWindow` (que só lê `.start`/`.end`).

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/indicators/engine/calculate.ts
git commit -m "feat(indicators): add runtime progress calculation engine"
```

---

### Task 6: Validar a engine com script descartável

**Files:**

- Create (temporário): `scripts/_validate-indicators.ts`

- [ ] **Step 1: Escrever o script de asserção**

`scripts/_validate-indicators.ts`:

```typescript
import { calculateIndicatorProgress } from "../src/features/indicators/engine/calculate";
import type { IOrder, IProductIndicator } from "../src/shared/types";

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("ok:", msg);
}

const baseOrder = (over: Partial<IOrder>): IOrder =>
  ({
    id: "o1",
    storeId: "store-1",
    customerId: "c1",
    sellerId: "s1",
    items: [],
    subtotal: 0,
    discount: 0,
    shipping: 0,
    total: 0,
    paymentCondition: "À vista",
    paymentStatus: "pago",
    fulfillmentStatus: "entregue",
    origin: "manual",
    division: "parts",
    paidAt: "2026-05-10T12:00:00.000Z",
    createdAt: "2026-05-10T12:00:00.000Z",
    updatedAt: "2026-05-10T12:00:00.000Z",
    ...over,
  }) as IOrder;

const indicator: IProductIndicator = {
  id: "ind-1",
  storeId: "store-1",
  name: "Filtros Maio",
  selector: { kind: "category", categories: ["filtro"] },
  metric: "faturamento",
  scopeLevel: "store",
  period: { type: "mensal", start: "2026-05-01T00:00:00.000Z", end: "2026-05-31T23:59:59.000Z" },
  targetValue: 400_000,
  status: "ativo",
  createdBy: "owner",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

const orders: IOrder[] = [
  baseOrder({
    id: "o1",
    sellerId: "s1",
    items: [
      {
        id: "i1",
        partId: "p1",
        partSku: "F1",
        partName: "Filtro",
        quantity: 2,
        unitPrice: 0,
        unitCost: 0,
        discount: 0,
        total: 100_000,
        marginValue: 30_000,
        partCategory: "filtro",
      },
      {
        id: "i2",
        partId: "p2",
        partSku: "B1",
        partName: "Freio",
        quantity: 1,
        unitPrice: 0,
        unitCost: 0,
        discount: 0,
        total: 50_000,
        marginValue: 10_000,
        partCategory: "freio",
      },
    ],
  }),
  baseOrder({
    id: "o2",
    sellerId: "s2",
    items: [
      {
        id: "i3",
        partId: "p1",
        partSku: "F1",
        partName: "Filtro",
        quantity: 1,
        unitPrice: 0,
        unitCost: 0,
        discount: 0,
        total: 60_000,
        marginValue: 20_000,
        partCategory: "filtro",
      },
    ],
  }),
];

const now = new Date("2026-05-16T12:00:00.000Z"); // ~half the period

const fat = calculateIndicatorProgress(indicator, { orders, now });
assert(fat.currentValue === 160_000, "faturamento soma só filtros (100k + 60k)");
assert(fat.contributors[0].sellerId === "s1", "ranking: s1 lidera (100k)");
assert(fat.contributors.length === 2, "ranking tem 2 vendedores");

const qty = calculateIndicatorProgress(
  { ...indicator, metric: "quantidade", targetValue: 10 },
  { orders, now },
);
assert(qty.currentValue === 3, "quantidade soma unidades de filtro (2 + 1)");

const ped = calculateIndicatorProgress(
  { ...indicator, metric: "pedidos", targetValue: 5 },
  { orders, now },
);
assert(ped.currentValue === 2, "pedidos conta pedidos distintos com filtro");

const mar = calculateIndicatorProgress(
  { ...indicator, metric: "margem", targetValue: 100_000 },
  { orders, now },
);
assert(mar.currentValue === 50_000, "margem soma marginValue de filtros (30k + 20k)");

// Fallback C2: item sem partCategory, resolvido via parts catalog
const ordersNoCat: IOrder[] = [
  baseOrder({
    id: "o3",
    items: [
      {
        id: "i4",
        partId: "p1",
        partSku: "F1",
        partName: "Filtro",
        quantity: 1,
        unitPrice: 0,
        unitCost: 0,
        discount: 0,
        total: 70_000,
        marginValue: 0,
      },
    ],
  }),
];
const viaCatalog = calculateIndicatorProgress(indicator, {
  orders: ordersNoCat,
  parts: [{ id: "p1", category: "filtro" } as never],
  now,
});
assert(viaCatalog.currentValue === 70_000, "fallback C2 resolve categoria via catálogo");

console.log("\nALL PASSED");
```

- [ ] **Step 2: Rodar o script**

Run: `bun run scripts/_validate-indicators.ts`
Expected: termina com `ALL PASSED` e exit 0.

- [ ] **Step 3: Remover o script (não comitar)**

```bash
rm scripts/_validate-indicators.ts
```

(Sem commit — a task é só validação. Se `scripts/` ficou vazio, remova a pasta.)

---

### Task 7: Provider, contrato e wiring no store de mocks

**Files:**

- Create: `src/providers/data/contracts/indicators.ts`
- Create: `src/mocks/api/indicators.ts`
- Create: `src/providers/data/impl/mock/indicators.ts`
- Create: `src/providers/data/impl/supabase/indicators.ts`
- Create: `src/providers/data/hooks/useIndicatorsProvider.ts`
- Create: `src/mocks/generators/indicator.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Modify: `src/providers/data/index.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/mocks/api/index.ts`
- Modify: `src/mocks/store/mutations.ts`
- Modify: `src/mocks/store/selectors.ts`
- Modify: `src/mocks/generators/bootstrap.ts`

- [ ] **Step 1: Contrato do provider**

`src/providers/data/contracts/indicators.ts`:

```typescript
import type { ID, IProductIndicator } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListIndicatorsParams extends IPaginationParams {
  storeId?: ID;
  scopeLevel?: IProductIndicator["scopeLevel"];
  sellerId?: ID;
  metric?: IProductIndicator["metric"];
  status?: IProductIndicator["status"];
}

/**
 * Contract for product indicators access.
 *
 * @see ../../../mocks/api/indicators.ts
 */
export interface IIndicatorsProvider {
  list(params?: IListIndicatorsParams): Promise<IPaginatedResult<IProductIndicator>>;
  upsert(indicator: IProductIndicator): Promise<IProductIndicator>;
  update(id: ID, patch: Partial<IProductIndicator>): Promise<IProductIndicator>;
}
```

- [ ] **Step 2: Mock API**

`src/mocks/api/indicators.ts`:

```typescript
import type { ID, IProductIndicator } from "@/shared/types";
import { selectAllIndicators } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListIndicatorsParams extends IPaginationParams {
  storeId?: ID;
  scopeLevel?: IProductIndicator["scopeLevel"];
  sellerId?: ID;
  metric?: IProductIndicator["metric"];
  status?: IProductIndicator["status"];
}

export const indicatorsApi = {
  list(params: IListIndicatorsParams = {}): Promise<IPaginatedResult<IProductIndicator>> {
    return runApi(
      "indicatorsApi",
      "list",
      () => {
        let all = selectAllIndicators();
        if (params.storeId) all = all.filter((i) => i.storeId === params.storeId);
        if (params.scopeLevel) all = all.filter((i) => i.scopeLevel === params.scopeLevel);
        if (params.sellerId) all = all.filter((i) => i.sellerId === params.sellerId);
        if (params.metric) all = all.filter((i) => i.metric === params.metric);
        if (params.status) all = all.filter((i) => i.status === params.status);
        const sorted = [...all].sort((a, b) => b.period.end.localeCompare(a.period.end));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async upsert(indicator: IProductIndicator): Promise<IProductIndicator> {
    return runApi("indicatorsApi", "upsert", () =>
      upsert("indicators", { ...indicator, updatedAt: new Date().toISOString() }),
    );
  },

  async update(id: ID, patch: Partial<IProductIndicator>): Promise<IProductIndicator> {
    return runApi("indicatorsApi", "update", () => {
      const updated = patchById("indicators", id, {
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      if (!updated) throw new MockNotFoundError("indicator", id);
      return updated;
    });
  },
};
```

- [ ] **Step 3: Exportar `indicatorsApi`**

Em `src/mocks/api/index.ts`, adicionar (junto aos outros `export ... from`):

```typescript
export { indicatorsApi } from "./indicators";
```

> Verifique também que `@/mocks` re-exporta de `api/index.ts` como faz com `goalsApi` (Task 1 do mockGoalsProvider importa `{ goalsApi } from "@/mocks"`). Se `goalsApi` é exportado de `src/mocks/index.ts`, adicione `indicatorsApi` na mesma lista.

- [ ] **Step 4: Mock provider**

`src/providers/data/impl/mock/indicators.ts`:

```typescript
import { indicatorsApi } from "@/mocks";
import type { IIndicatorsProvider } from "../../contracts/indicators";
import { scopedListParams } from "./_storeScope";

export const mockIndicatorsProvider: IIndicatorsProvider = {
  list: (params) => indicatorsApi.list(scopedListParams(params, "indicator")),
  upsert: (indicator) => indicatorsApi.upsert(indicator),
  update: (id, patch) => indicatorsApi.update(id, patch),
};
```

> Verifique a assinatura de `scopedListParams` em `src/providers/data/impl/mock/_storeScope.ts`. Se o segundo argumento for um union fechado de entidades, adicione `"indicator"` a esse union. Se não aceitar o tipo, replique o padrão usado por `mockGoalsProvider` exatamente.

- [ ] **Step 5: Supabase stub**

`src/providers/data/impl/supabase/indicators.ts` — espelhar `impl/supabase/goals.ts` (mesmo padrão de `NotImplementedError`):

```typescript
import type { IIndicatorsProvider } from "../../contracts/indicators";
import { NotImplementedError } from "../../errors";

export const supabaseIndicatorsProvider: IIndicatorsProvider = {
  list: () => Promise.reject(new NotImplementedError("indicators.list")),
  upsert: () => Promise.reject(new NotImplementedError("indicators.upsert")),
  update: () => Promise.reject(new NotImplementedError("indicators.update")),
};
```

> Abra `impl/supabase/goals.ts` e copie a forma exata (assinatura do `NotImplementedError`, default export vs named) para manter consistência.

- [ ] **Step 6: Hook do provider**

`src/providers/data/hooks/useIndicatorsProvider.ts` — espelhar `hooks/useGoalsProvider.ts`:

```typescript
import { useDataProviders } from "../context";
import type { IIndicatorsProvider } from "../contracts/indicators";

export function useIndicatorsProvider(): IIndicatorsProvider {
  return useDataProviders().indicators;
}
```

> Abra `hooks/useGoalsProvider.ts` e replique exatamente (nome do hook de contexto, caminho do import).

- [ ] **Step 7: Registrar no barrel de contratos e em `IDataProviders`**

Em `src/providers/data/contracts/index.ts`:

1. `import type { IIndicatorsProvider } from "./indicators";`
2. `export type { IIndicatorsProvider, IListIndicatorsParams } from "./indicators";`
3. Em `interface IDataProviders`, adicionar: `indicators: IIndicatorsProvider;`

- [ ] **Step 8: Registrar na factory**

Em `src/providers/data/factory.ts`:

1. `import { mockIndicatorsProvider } from "./impl/mock/indicators";`
2. `import { supabaseIndicatorsProvider } from "./impl/supabase/indicators";`
3. Em `mockProviders`, adicionar: `indicators: mockIndicatorsProvider,`
4. Em `supabaseProviders`, adicionar: `indicators: supabaseIndicatorsProvider,`

- [ ] **Step 9: Exportar hook + tipos no barrel público**

Em `src/providers/data/index.ts`:

1. Na lista `export type { ... } from "./contracts";`, adicionar `IIndicatorsProvider,` e `IListIndicatorsParams,`.
2. Adicionar: `export { useIndicatorsProvider } from "./hooks/useIndicatorsProvider";`

- [ ] **Step 10: Wiring no store de mocks**

Em `src/mocks/store/mutations.ts`:

1. No union `CollectionKey`, adicionar `| "indicators"`.
2. No `CollectionMap`, adicionar `indicators: IProductIndicator;` (e importar o tipo no topo do arquivo).

Em `src/mocks/store/selectors.ts`, após `selectAllGoals`, adicionar:

```typescript
export function selectAllIndicators() {
  return getMockState().indicators;
}
```

- [ ] **Step 11: Gerador de indicadores**

`src/mocks/generators/indicator.ts`:

```typescript
import type {
  ID,
  ISeller,
  IProductIndicator,
  IndicatorMetric,
  ProductSelector,
} from "@/shared/types";
import { SEED_STORE_ID } from "../data";
import { monthRange, monthRef, type ISeededContext } from "./utils";

const METRIC_LABEL: Record<IndicatorMetric, string> = {
  faturamento: "Faturamento",
  quantidade: "Quantidade",
  margem: "Margem",
  pedidos: "Pedidos",
};

function selectorLabel(sel: ProductSelector): string {
  switch (sel.kind) {
    case "category":
      return sel.categories.join(" + ");
    case "sku":
      return `${sel.partIds.length} SKU(s)`;
    case "group":
      return sel.label;
  }
}

interface IMakeInput {
  id: ID;
  selector: ProductSelector;
  metric: IndicatorMetric;
  scopeLevel: IProductIndicator["scopeLevel"];
  sellerId?: ID;
  targetValue: number;
  start: Date;
  end: Date;
  status: IProductIndicator["status"];
}

function make(input: IMakeInput): IProductIndicator {
  const month = input.start.toLocaleDateString("pt-BR", { month: "long" });
  const cap = month.charAt(0).toUpperCase() + month.slice(1);
  const nowISO = new Date().toISOString();
  return {
    id: input.id,
    storeId: SEED_STORE_ID,
    name: `${METRIC_LABEL[input.metric]} — ${selectorLabel(input.selector)} — ${cap} ${input.start.getFullYear()}`,
    selector: input.selector,
    metric: input.metric,
    scopeLevel: input.scopeLevel,
    sellerId: input.sellerId,
    period: { type: "mensal", start: input.start.toISOString(), end: input.end.toISOString() },
    targetValue: input.targetValue,
    status: input.status,
    division: "parts",
    createdBy: "seller-joao-gallo",
    createdAt: nowISO,
    updatedAt: nowISO,
  };
}

/**
 * Product indicators seed: a mix of selector kinds (category/sku/group),
 * metrics, scopes (store + individual) and statuses, plus a few months of
 * history and one canceled indicator.
 */
export function generateIndicators(
  _ctx: ISeededContext,
  options: { sellers: ISeller[]; now?: Date },
): IProductIndicator[] {
  const now = options.now ?? new Date();
  const out: IProductIndicator[] = [];
  const cur = monthRange(now);
  const period = monthRef(now);
  const featured = options.sellers.find((s) => s.id !== "seller-joao-gallo") ?? options.sellers[0];

  // Active — collective category (the canonical "R$ 400k em filtros")
  out.push(
    make({
      id: `ind-${period}-store-filtros-fat`,
      selector: { kind: "category", categories: ["filtro"] },
      metric: "faturamento",
      scopeLevel: "store",
      targetValue: 400_000,
      start: cur.start,
      end: cur.end,
      status: "ativo",
    }),
  );
  out.push(
    make({
      id: `ind-${period}-store-freios-qtd`,
      selector: { kind: "category", categories: ["freio"] },
      metric: "quantidade",
      scopeLevel: "store",
      targetValue: 800,
      start: cur.start,
      end: cur.end,
      status: "ativo",
    }),
  );
  out.push(
    make({
      id: `ind-${period}-store-lubrificante-margem`,
      selector: { kind: "category", categories: ["lubrificante"] },
      metric: "margem",
      scopeLevel: "store",
      targetValue: 60_000,
      start: cur.start,
      end: cur.end,
      status: "ativo",
    }),
  );
  out.push(
    make({
      id: `ind-${period}-store-linhapesada-grupo`,
      selector: {
        kind: "group",
        label: "Linha pesada",
        categories: ["motor", "transmissao", "suspensao"],
      },
      metric: "faturamento",
      scopeLevel: "store",
      targetValue: 250_000,
      start: cur.start,
      end: cur.end,
      status: "ativo",
    }),
  );
  if (featured) {
    out.push(
      make({
        id: `ind-${period}-${featured.id}-filtros-fat`,
        selector: { kind: "category", categories: ["filtro"] },
        metric: "faturamento",
        scopeLevel: "individual",
        sellerId: featured.id,
        targetValue: 80_000,
        start: cur.start,
        end: cur.end,
        status: "ativo",
      }),
    );
    out.push(
      make({
        id: `ind-${period}-${featured.id}-pedidos-freio`,
        selector: { kind: "category", categories: ["freio"] },
        metric: "pedidos",
        scopeLevel: "individual",
        sellerId: featured.id,
        targetValue: 15,
        start: cur.start,
        end: cur.end,
        status: "ativo",
      }),
    );
  }

  // History — last 3 months, status by attainment is decided at calc time;
  // seed them as concluido/arquivado alternately for variety.
  for (let i = 1; i <= 3; i += 1) {
    const past = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const range = monthRange(past);
    out.push(
      make({
        id: `ind-${monthRef(past)}-store-filtros-fat`,
        selector: { kind: "category", categories: ["filtro"] },
        metric: "faturamento",
        scopeLevel: "store",
        targetValue: 380_000,
        start: range.start,
        end: range.end,
        status: i % 2 === 0 ? "arquivado" : "concluido",
      }),
    );
  }

  // One canceled
  out.push({
    ...make({
      id: `ind-${period}-store-eletrica-cancelado`,
      selector: { kind: "category", categories: ["eletrica"] },
      metric: "faturamento",
      scopeLevel: "store",
      targetValue: 90_000,
      start: cur.start,
      end: cur.end,
      status: "cancelado",
    }),
    cancelReason: "Reorientação de mix de produtos no trimestre",
  });

  return out;
}
```

> Confirme que `monthRange`/`monthRef` existem em `src/mocks/generators/utils.ts` (usados por `goal.ts`). Se a assinatura diferir, ajuste a chamada para casar com a usada em `generateGoals`.

- [ ] **Step 12: Incluir no bootstrap**

Em `src/mocks/generators/bootstrap.ts`:

1. Import: `import { generateIndicators } from "./indicator";` (junto a `generateGoals`).
2. Em `interface IBootstrappedDataset`, adicionar `indicators: IProductIndicator[];` (e importar `IProductIndicator` no bloco de imports de tipos no topo).
3. Após `const goals = generateGoals(ctx, { sellers, now });`, adicionar:
   `const indicators = generateIndicators(ctx, { sellers, now });`
4. No objeto `dataset` (onde aparece `goals,`), adicionar `indicators,`.

- [ ] **Step 13: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS. Sem violação de `no-restricted-imports` (features só importam de `@/providers/data`).

- [ ] **Step 14: Commit**

```bash
git add src/providers/data src/mocks
git commit -m "feat(indicators): add provider, mock api, generator and store wiring"
```

---

### Task 8: Hooks reativos da feature

**Files:**

- Create: `src/features/indicators/hooks/useIndicatorProgress.ts`
- Create: `src/features/indicators/hooks/useIndicators.ts`

- [ ] **Step 1: `useIndicatorProgress` (espelha `useGoalProgress`)**

`src/features/indicators/hooks/useIndicatorProgress.ts`:

```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IProductIndicator, IIndicatorProgress } from "@/shared/types";
import { useIndicatorsProvider, useOrdersProvider, usePartsProvider } from "@/providers/data";
import { calculateIndicatorProgress } from "../engine/calculate";

export interface IUseIndicatorProgressResult {
  indicator: IProductIndicator | undefined;
  progress: IIndicatorProgress | undefined;
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
}

const STALE_MS = 30_000;

export function useIndicatorProgress(indicatorId: ID | undefined): IUseIndicatorProgressResult {
  const indicatorsProvider = useIndicatorsProvider();
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();

  const listQuery = useQuery({
    queryKey: ["indicators", "list", "all"],
    queryFn: () => indicatorsProvider.list({ pageSize: 500 }),
    staleTime: STALE_MS,
    enabled: Boolean(indicatorId),
  });

  const indicator = listQuery.data?.data.find((i) => i.id === indicatorId);

  const ordersQuery = useQuery({
    queryKey: [
      "indicators",
      "progress-orders",
      indicator?.storeId,
      indicator?.sellerId,
      indicator?.scopeLevel,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: indicator?.storeId,
        sellerId: indicator?.scopeLevel === "individual" ? indicator.sellerId : undefined,
        paymentStatus: "pago",
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
    enabled: Boolean(indicator),
  });

  // Catalog only needed as fallback when items lack the denormalized category.
  const partsQuery = useQuery({
    queryKey: ["indicators", "progress-parts"],
    queryFn: () => partsProvider.list({ pageSize: 5000 }),
    staleTime: STALE_MS,
    enabled: Boolean(indicator),
  });

  const progress = useMemo(() => {
    if (!indicator) return undefined;
    return calculateIndicatorProgress(indicator, {
      orders: ordersQuery.data?.data ?? [],
      parts: partsQuery.data?.data ?? [],
    });
  }, [indicator, ordersQuery.data, partsQuery.data]);

  return {
    indicator,
    progress,
    isLoading: listQuery.isLoading || ordersQuery.isLoading || partsQuery.isLoading,
    hasError: listQuery.isError || ordersQuery.isError || partsQuery.isError,
    refetch: () => {
      void listQuery.refetch();
      void ordersQuery.refetch();
      void partsQuery.refetch();
    },
  };
}
```

> Confirme os params reais de `ordersProvider.list` (`IListOrdersParams`) e `partsProvider.list` (`IListPartsParams`) nos contratos. `paymentStatus: "pago"` é usado por `useGoalProgress`, então é válido. Ajuste `pageSize` se o contrato usar outro nome.

- [ ] **Step 2: `useIndicators` / `useStoreIndicators`**

`src/features/indicators/hooks/useIndicators.ts`:

```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IProductIndicator, IIndicatorProgress } from "@/shared/types";
import { useIndicatorsProvider, useOrdersProvider, usePartsProvider } from "@/providers/data";
import type { IListIndicatorsParams } from "@/providers/data";
import { calculateIndicatorProgress } from "../engine/calculate";

const STALE_MS = 30_000;

export interface IIndicatorWithProgress {
  indicator: IProductIndicator;
  progress: IIndicatorProgress;
}

/**
 * Lists indicators (optionally filtered) and computes each one's progress from
 * a single shared orders+parts load. Used by the dashboard.
 */
export function useIndicators(params: IListIndicatorsParams = {}) {
  const indicatorsProvider = useIndicatorsProvider();
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();

  const listQuery = useQuery({
    queryKey: ["indicators", "list", params],
    queryFn: () => indicatorsProvider.list({ pageSize: 500, ...params }),
    staleTime: STALE_MS,
  });

  const ordersQuery = useQuery({
    queryKey: ["indicators", "all-orders", params.storeId],
    queryFn: () =>
      ordersProvider.list({ storeId: params.storeId, paymentStatus: "pago", pageSize: 5000 }),
    staleTime: STALE_MS,
  });

  const partsQuery = useQuery({
    queryKey: ["indicators", "progress-parts"],
    queryFn: () => partsProvider.list({ pageSize: 5000 }),
    staleTime: STALE_MS,
  });

  const items: IIndicatorWithProgress[] = useMemo(() => {
    const indicators = listQuery.data?.data ?? [];
    const orders = ordersQuery.data?.data ?? [];
    const parts = partsQuery.data?.data ?? [];
    return indicators.map((indicator) => ({
      indicator,
      progress: calculateIndicatorProgress(indicator, { orders, parts }),
    }));
  }, [listQuery.data, ordersQuery.data, partsQuery.data]);

  return {
    items,
    isLoading: listQuery.isLoading || ordersQuery.isLoading || partsQuery.isLoading,
    hasError: listQuery.isError || ordersQuery.isError || partsQuery.isError,
    refetch: () => {
      void listQuery.refetch();
      void ordersQuery.refetch();
      void partsQuery.refetch();
    },
  };
}

export function useStoreIndicators(storeId: ID | undefined) {
  return useIndicators(storeId ? { storeId } : {});
}
```

- [ ] **Step 3: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/indicators/hooks
git commit -m "feat(indicators): add reactive progress hooks"
```

---

## FASE 2 — Dashboard, rotas, navegação, i18n

### Task 9: i18n e rotas-esqueleto

**Files:**

- Create: `src/features/indicators/i18n/pt-BR.ts`
- Create: `src/routes/app.gestao.indicadores.tsx`
- Create: `src/routes/app.gestao.indicadores.index.tsx`
- Create: `src/routes/app.gestao.indicadores.novo.tsx`
- Create: `src/routes/app.gestao.indicadores.$id.tsx`

- [ ] **Step 1: i18n**

`src/features/indicators/i18n/pt-BR.ts` — espelhar a forma de `src/features/goals/i18n/pt-BR.ts` (objeto plano de strings). Incluir labels:

```typescript
export const indicatorsPtBR = {
  title: "Indicadores",
  subtitle: "Acompanhamento de vendas por produto",
  new: "Novo indicador",
  empty: "Nenhum indicador ainda — crie o primeiro",
  emptySeller: "Você ainda não participa de nenhum indicador ativo",
  metric: {
    faturamento: "Faturamento",
    quantidade: "Quantidade",
    margem: "Margem",
    pedidos: "Pedidos",
  },
  scope: { store: "Loja", individual: "Individual", global: "Global" },
  status: {
    ativo: "Ativo",
    concluido: "Concluído",
    arquivado: "Arquivado",
    cancelado: "Cancelado",
  },
  selectorKind: { category: "Categoria", sku: "Produtos", group: "Grupo" },
  kpis: {
    active: "Indicadores ativos",
    avgAttainment: "Atingimento médio",
    above: "Acima de 100%",
    behind: "Atrasados",
  },
  contribution: "Contribuição por vendedor",
  evolution: "Evolução",
  expected: "Esperado",
  realized: "Realizado",
} as const;
```

> Abra `src/features/goals/i18n/pt-BR.ts` e siga o mesmo formato de export (default vs named) usado lá.

- [ ] **Step 2: Layout Outlet** — `src/routes/app.gestao.indicadores.tsx` (copia exata do padrão de `app.gestao.metas.tsx`):

```typescript
import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Indicators section layout. Outlet-only wrapper so child routes
 * (`/`, `/novo`, `/$id`) render under the same path namespace.
 */
export const Route = createFileRoute("/app/gestao/indicadores")({
  component: () => <Outlet />,
});
```

- [ ] **Step 3: Rotas filhas (esqueleto que monta as páginas)**

Abra `src/routes/app.gestao.metas.index.tsx` para ver o padrão exato de `beforeLoad`/guard de papel e `validateSearch`. Replique-o nos três arquivos abaixo, trocando o componente importado:

`src/routes/app.gestao.indicadores.index.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { IndicatorsPage } from "@/features/indicators/pages/IndicatorsPage";

export const Route = createFileRoute("/app/gestao/indicadores/")({
  component: IndicatorsPage,
});
```

`src/routes/app.gestao.indicadores.novo.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { NewIndicatorPage } from "@/features/indicators/pages/NewIndicatorPage";

export const Route = createFileRoute("/app/gestao/indicadores/novo")({
  component: NewIndicatorPage,
});
```

`src/routes/app.gestao.indicadores.$id.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { IndicatorDetailPage } from "@/features/indicators/pages/IndicatorDetailPage";

export const Route = createFileRoute("/app/gestao/indicadores/$id")({
  component: IndicatorDetailPage,
});
```

> Se `app.gestao.metas.novo.tsx` aplica um guard de papel (Owner/Gestor) via `beforeLoad`, copie esse `beforeLoad` para `app.gestao.indicadores.novo.tsx`. Verifique o nome real do arquivo de "nova meta" (`nova` vs `novo`) e o padrão de guard antes de implementar.

- [ ] **Step 4: Criar stubs mínimos das páginas para o build passar**

Crie os três arquivos de página com um corpo mínimo (serão preenchidos nas Tasks 10–13). Ex. `src/features/indicators/pages/IndicatorsPage.tsx`:

```typescript
export function IndicatorsPage() {
  return null;
}
```

Idem para `NewIndicatorPage.tsx` e `IndicatorDetailPage.tsx`.

- [ ] **Step 5: Type-check (gera `routeTree.gen.ts`)**

Run: `bun run build`
Expected: PASS. O plugin do TanStack Router regenera `routeTree.gen.ts` incluindo as novas rotas.

- [ ] **Step 6: Commit**

```bash
git add src/features/indicators/i18n src/features/indicators/pages src/routes/app.gestao.indicadores* src/routeTree.gen.ts
git commit -m "feat(indicators): add i18n, routes and page scaffolds"
```

---

### Task 10: Item de navegação

**Files:**

- Modify: `src/features/shell/config/navigation.ts`

- [ ] **Step 1: Adicionar o item "Indicadores"**

Abra `src/features/shell/config/navigation.ts` e localize o item de navegação de **Metas** (label "Metas", rota `/app/gestao/metas`). Copie a estrutura desse item para um novo item "Indicadores" imediatamente após, com:

- `label: "Indicadores"`
- rota/`to`: `/app/gestao/indicadores`
- ícone Iconify apropriado (ex.: `"mdi:chart-line"` ou `"mdi:target-variant"`) — siga o formato de ícone usado pelo item de Metas.
- as mesmas chaves de permissão/papel que o item de Metas usa (Owner/Gestor/Vendedor podem ver; a leitura do vendedor é tratada na página).

> Replique exatamente o shape do objeto de item existente (mesmas propriedades). Não invente propriedades novas.

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/shell/config/navigation.ts
git commit -m "feat(indicators): add navigation entry"
```

---

### Task 11: Dashboard (`IndicatorsPage`)

**Files:**

- Modify: `src/features/indicators/pages/IndicatorsPage.tsx`

- [ ] **Step 1: Implementar o dashboard**

Abra `src/features/goals/pages/` (o dashboard agregado de metas) e os componentes de layout `src/shared/list-views/` + `src/shared/list-views/ListStatStrip.tsx` para reusar o shell de lista, os KPIs e o padrão de filtros com URL sync. Implemente `IndicatorsPage` reusando esses blocos. A página deve:

1. Obter o papel do usuário (mesmo hook usado por `GoalsPage` — verifique no arquivo real, ex. `useAuth`/`useCurrentUser`) e a loja ativa.
2. Chamar `useStoreIndicators(storeId)`.
3. **Gestor/Owner:** renderizar
   - **KPIs** (via `ListStatStrip` ou equivalente): `indicadores ativos`, `atingimento médio` (média de `progress.percentage` dos ativos), `acima de 100%` (count `percentage >= 100`), `atrasados` (count `status === "atrasada"`).
   - **Filtros** (recorte/`selectorKind`, métrica, escopo, status) com URL sync — replicar o mecanismo de `GoalsFiltersBar`.
   - **Tabela** com colunas: Nome, Recorte (badge com `selectorKind` + label), Métrica (badge), Escopo (avatar do vendedor ou "Loja"), Período, Alvo (formatado por métrica — BRL para faturamento/margem, número para quantidade/pedidos), Progresso (barra + valor + %), Status (badge colorido pelo semáforo), Projeção. Linha clicável → `/app/gestao/indicadores/$id`.
   - **Bar chart** de % atingido por indicador (Recharts) — espelhar `SellerProgressBarChart` de goals.
4. **Vendedor:** renderizar somente cards/linhas dos indicadores onde `scopeLevel === "individual" && sellerId === user.id` **ou** `scopeLevel === "store"` (modo leitura, sem ações de criar/editar). Se vazio: `EmptyState` com `indicatorsPtBR.emptySeller`.
5. Botão "Novo indicador" (Owner/Gestor) → `/app/gestao/indicadores/novo`.

Formatação monetária: usar o helper de moeda já existente no projeto (procure `formatCurrency`/`formatBRL` em `src/shared/` ou `src/lib/`; reuse o mesmo que `GoalsPage` usa).

Tokens: apenas semânticos (`bg-background`, `text-foreground`, `text-muted-foreground`, cores de status via as classes já usadas no semáforo das metas).

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 3: Verificação manual (usuário)**

Acessar `/app/gestao/indicadores` como Gestor: ver KPIs, tabela com os ~6 indicadores ativos do seed (incluindo "Faturamento — filtro — <mês>"), filtros funcionando e bar chart. Como Vendedor: ver só os seus + os de loja, sem botão criar.

- [ ] **Step 4: Commit**

```bash
git add src/features/indicators/pages/IndicatorsPage.tsx
git commit -m "feat(indicators): implement dashboard with kpis, table and chart"
```

---

## FASE 3 — Criação

### Task 12: Seletor de produto multimodal

**Files:**

- Create: `src/features/indicators/components/ProductSelectorField.tsx`

- [ ] **Step 1: Implementar o campo de seletor**

Componente controlado que recebe `value: ProductSelector` e `onChange(next: ProductSelector)`. UI:

1. Um grupo de toggle/`Tabs` (shadcn) para escolher `kind`: **Categoria** | **Produtos** | **Grupo**.
2. `kind === "category"`: chips multi-seleção das 10 `PartCategory` (importar a lista; criar um array local `const PART_CATEGORIES: PartCategory[] = ["filtro","freio","correia","motor","embreagem","eletrica","transmissao","suspensao","arrefecimento","lubrificante"]` com labels em pt-BR). Atualiza `{ kind: "category", categories }`.
3. `kind === "sku"`: campo de busca que consulta `usePartsProvider().list({ search, pageSize: 20 })` (verifique o nome do param de busca em `IListPartsParams`) e permite adicionar SKUs a uma lista de chips. Atualiza `{ kind: "sku", partIds }`.
4. `kind === "group"`: um input de `label` + os mesmos chips de categoria + a mesma busca de SKU; combina em `{ kind: "group", label, categories, partIds }`.

Reusar os componentes shadcn já presentes em `src/components/ui/` (Tabs, Input, Badge/Chip, Command/Combobox se existir). Não adicionar dependências.

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/indicators/components/ProductSelectorField.tsx
git commit -m "feat(indicators): add multimodal product selector field"
```

---

### Task 13: Página de criação (`NewIndicatorPage`)

**Files:**

- Modify: `src/features/indicators/pages/NewIndicatorPage.tsx`

- [ ] **Step 1: Implementar o formulário de criação**

Abra `src/features/goals/pages/NewGoalPage.tsx` e replique o padrão (react-hook-form + zod + `@hookform/resolvers`, layout de seções, navegação pós-save, toast via sonner, audit log via `recordAuditLog`). Seções:

1. **Recorte de produto** — `<ProductSelectorField>` (Task 12). Validação zod: pelo menos uma categoria, SKU ou (no grupo) `label` + ao menos um item.
2. **Métrica** — radios das 4 (`indicatorsPtBR.metric`), cada uma com explicação inline curta.
3. **Escopo + período** — radio escopo (`store`/`individual`/`global`; `individual` mostra dropdown de vendedor — reuse o mesmo seletor de vendedor de `NewGoalPage`); `period.type` (diario/semanal/mensal/trimestral/anual); datas `start`/`end` auto-preenchidas pelo tipo de período (replicar o util de auto-preenchimento de datas de `NewGoalPage`; se não existir reaproveitável, criar `computePeriodDates(type, ref): { start, end }` em `src/features/indicators/utils/period.ts`).
4. **Valor-alvo** — input numérico; formatação BRL para faturamento/margem, número para quantidade/pedidos. Sugestão opcional: rótulo "Período anterior: X" se houver indicador equivalente concluído (consultar `useIndicators` filtrando mesmo selector+metric+scope no período anterior; se complexo, omitir a sugestão no MVP e deixar o input puro — **não** deixar placeholder, simplesmente não renderizar a sugestão).
5. **Recompensa** — textarea opcional → `rewardDescription`.

Nome autogerado (mesmo formato do gerador: `"<Métrica> — <recorte> — <Mês> <Ano>"`), editável.

Ao salvar: montar `IProductIndicator` (id via o helper de id usado no projeto — verifique como `NewGoalPage` gera id; se usa `crypto.randomUUID()` ou um util, use o mesmo), `status: "ativo"`, `storeId` da loja ativa, `createdBy` do usuário. Chamar `useIndicatorsProvider().upsert(indicator)`, `recordAuditLog({ action: "indicator_create", ... })` (seguir a forma de `ICreateAuditInput`), toast de sucesso, navegar para `/app/gestao/indicadores/$id`.

Guard: a rota `/novo` já bloqueia Vendedor (Task 9 Step 3).

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 3: Verificação manual (usuário)**

Como Gestor, criar um indicador "Faturamento — filtro — mensal — loja — R$ 400k", salvar, confirmar navegação para o detalhe e aparição na lista.

- [ ] **Step 4: Commit**

```bash
git add src/features/indicators/pages/NewIndicatorPage.tsx src/features/indicators/utils 2>/dev/null
git commit -m "feat(indicators): implement creation page with multimodal selector"
```

---

## FASE 4 — Detalhe

### Task 14: Ranking de contribuição e gráfico evolutivo

**Files:**

- Create: `src/features/indicators/components/ContributionRanking.tsx`
- Create: `src/features/indicators/components/IndicatorEvolutionChart.tsx`

- [ ] **Step 1: `ContributionRanking`**

Recebe `contributors: IIndicatorContributor[]`, `metric`, e uma forma de resolver nome do vendedor (passar `sellers` ou usar `useSellersProvider`). Renderiza uma lista de barras horizontais (uma por vendedor) com nome, valor formatado pela métrica e `share` em %. Ordenado desc (já vem ordenado da engine). Reusar a barra de progresso/estilo do componente `SellerProgressBarChart` de goals ou um `<div>` com width proporcional usando tokens semânticos. Para acessibilidade (RNF), incluir uma `<table>` visualmente oculta ou `aria-label` com os valores.

- [ ] **Step 2: `IndicatorEvolutionChart`**

Espelhar o gráfico evolutivo do detalhe de meta (procure em `src/features/goals/` o LineChart "realizado vs esperado"; reuse a mesma abordagem Recharts). Recebe a série acumulada realizada (derivada dos pedidos no período, bucketizada por dia) e a linha esperada proporcional (`targetValue * diaPassado/totalDias`). Se o detalhe de meta já tiver um util que monta essa série, extraia/compartilhe; senão, monte localmente:

- agrupar contribuições por dia (reusar a lógica da engine: itens que casam, por `paidAt`), acumular.
- linha esperada: pontos `(dia_i, targetValue * i / totalDays)`.

Duas linhas: realizado (cor da marca, cheia) e esperado (cinza tracejado). Tooltip com data/realizado/esperado. Tabela alternativa para a11y.

- [ ] **Step 3: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/indicators/components/ContributionRanking.tsx src/features/indicators/components/IndicatorEvolutionChart.tsx
git commit -m "feat(indicators): add contribution ranking and evolution chart"
```

---

### Task 15: Página de detalhe (`IndicatorDetailPage`)

**Files:**

- Modify: `src/features/indicators/pages/IndicatorDetailPage.tsx`

- [ ] **Step 1: Implementar o detalhe**

Abra `src/features/goals/pages/GoalDetailPage.tsx` e o `DetailLayout` em `src/shared/detail-views/` para reusar o shell. Usar `useParams` para o `$id`, `useIndicatorProgress(id)`. Seções:

1. **Header:** nome, badges (recorte/`selectorKind`, métrica, escopo), datas, status badge (cor do semáforo), ações (Owner/Gestor: Editar, Arquivar, Cancelar — Vendedor: nenhuma). Editar/Arquivar/Cancelar via `useIndicatorsProvider().update(id, patch)` + `recordAuditLog`. Cancelar pede motivo (`cancelReason`). (Pode reusar o modal/confirm pattern de `GoalDetailPage`; se um `EditGoalModal` existir, crie um `EditIndicatorModal` análogo permitindo editar `name`, `targetValue`, `rewardDescription` — **não** `selector`/`metric`/`scopeLevel`/`period`.)
2. **Resumo de progresso:** barra grande, `currentValue`/`targetValue` formatados pela métrica, `%`, semáforo, projeção ("Mantendo o ritmo: X (Y%)"), dias restantes (usar `progress`).
3. **Gráfico evolutivo:** `<IndicatorEvolutionChart>`.
4. **Ranking de contribuição:** `<ContributionRanking>` (esconder/observar que para `scopeLevel === "individual"` o ranking terá um único vendedor — nesse caso, ocultar a seção).
5. **Composição:** tabela paginada dos pedidos que contribuíram (itens que casam) — reusar o helper de matcher para listar; cada linha link para o pedido (`/app/.../pedidos/$id` — verifique a rota real de detalhe de pedido). Carregar via `useOrdersProvider`.

Loading/empty/error states seguindo o padrão de `GoalDetailPage`.

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 3: Verificação manual (usuário)**

Abrir o detalhe do indicador de filtros: progresso coerente com os pedidos do seed, gráfico evolutivo realizado vs esperado, ranking com os vendedores que venderam filtros, composição listando os pedidos.

- [ ] **Step 4: Commit**

```bash
git add src/features/indicators/pages/IndicatorDetailPage.tsx src/features/indicators/components 2>/dev/null
git commit -m "feat(indicators): implement detail page with progress, chart, ranking and composition"
```

---

## FASE 5 — Status automático, notificações, widget, polish

### Task 16: Status automático

**Files:**

- Create: `src/features/indicators/hooks/useIndicatorAutoStatusUpdate.ts`

- [ ] **Step 1: Implementar o hook**

Abra `src/features/goals/hooks/` e localize `useGoalAutoStatusUpdate` (se existir) para espelhar exatamente. O hook:

- Roda no mount (e ao virar o dia, se o de metas o fizer).
- Para indicadores com `period.end < now` e `status === "ativo"`: calcular `progress.percentage`; se `>= 100` → `status: "concluido"`, senão `"arquivado"`. Chamar `useIndicatorsProvider().update(id, { status })` + `recordAuditLog({ action: "indicator_auto_complete" | "indicator_auto_archive" })`.

Montar o hook num ponto raiz já usado por metas (verifique onde `useGoalAutoStatusUpdate` é chamado — provavelmente um provider/layout do app — e adicione a chamada do de indicadores ao lado).

> Se `useGoalAutoStatusUpdate` **não** existir no código, simplifique: implemente a transição on-mount no `IndicatorsPage` (efeito que percorre `items` e atualiza os vencidos), e ajuste esta task para refletir isso.

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/indicators/hooks/useIndicatorAutoStatusUpdate.ts
git commit -m "feat(indicators): add automatic status transition at period end"
```

---

### Task 17: Notificações de marco

**Files:**

- Modify: `src/features/indicators/hooks/useIndicatorProgress.ts` (ou um hook dedicado, conforme padrão de metas)

- [ ] **Step 1: Espelhar o mecanismo de marco das metas**

Localize no código de metas como os toasts de marco (50/80/100%) são disparados (procure por `goalMilestoneThresholds` / `IPlatformSettings` e o uso de `toast` do sonner). Replique para indicadores:

- ler thresholds de `IPlatformSettings` (reuse a mesma chave se fizer sentido, ou adicione `indicatorMilestoneThresholds` em `IPlatformSettings` com default `[0.5, 0.8, 1.0]` — verifique o tipo em `src/shared/types/platform.ts` e o seed em `seedStore.ts`).
- quando `progress.percentage` cruza um threshold, `toast` com mensagem (ex.: "🎯 Indicador <nome> atingiu 50%!"). Guardar marcos já notificados (mesmo mecanismo das metas — provavelmente um `Set`/ref ou flag persistida).

> Se o padrão de metas for muito acoplado, implemente uma versão mínima: no `useIndicators`/`IndicatorsPage`, comparar `percentage` atual vs anterior (ref) e disparar toast ao cruzar os thresholds. Documente a escolha no commit.

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/indicators src/shared/types/platform.ts src/mocks/data/seedStore.ts 2>/dev/null
git commit -m "feat(indicators): add milestone toast notifications"
```

---

### Task 18: Widget no Painel do Gestor

**Files:**

- Create: `src/features/indicators/components/IndicatorsWidget.tsx`
- Modify: `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx`

- [ ] **Step 1: Implementar o widget**

`IndicatorsWidget`: usa `useStoreIndicators(storeId)`, filtra `status === "ativo"`, renderiza um card compacto (título "Indicadores do mês") com até ~5 linhas: nome, mini-barra de `percentage`, % e badge de semáforo. Cada linha → `/app/gestao/indicadores/$id`. Reusar o componente de card/seção que os outros widgets do painel usam (abrir `ManagerDashboardPage.tsx` para ver o wrapper de widget e copiar).

- [ ] **Step 2: Montar no painel**

Em `ManagerDashboardPage.tsx`, importar e renderizar `<IndicatorsWidget />` na grade de widgets, ao lado do widget de metas (se existir) — seguir o layout/grid já usado.

- [ ] **Step 3: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 4: Verificação manual (usuário)**

Abrir o Painel do Gestor: widget "Indicadores do mês" presente, com os ativos e mini-barras; click leva ao detalhe.

- [ ] **Step 5: Commit**

```bash
git add src/features/indicators/components/IndicatorsWidget.tsx src/features/manager-dashboard/pages/ManagerDashboardPage.tsx
git commit -m "feat(indicators): add manager dashboard widget"
```

---

### Task 19: Documentação e polish responsivo

**Files:**

- Create: `docs/indicators.md`
- Modify: arquivos de UI conforme necessário (responsivo)

- [ ] **Step 1: Doc da feature**

`docs/indicators.md`: visão geral do conceito (Indicador ≠ Meta), modelo (`IProductIndicator`, `ProductSelector`, métricas, escopos), engine (matcher + agregação + ranking), decisão C1 (categoria no item) + fallback, rotas, permissões, e o que ficou fora do MVP (subcategoria → issue #23). Referenciar o spec.

- [ ] **Step 2: Revisar responsividade**

Verificar nas 3 páginas: cards em coluna única no mobile, tabela com scroll horizontal, gráficos com container responsivo (Recharts `<ResponsiveContainer>`), seguindo o que metas já fazem.

- [ ] **Step 3: Type-check + lint + build final**

Run: `bun run build && bun run lint`
Expected: PASS.

- [ ] **Step 4: Verificação manual final (usuário)**

Fluxo completo: criar indicador → ver na lista → abrir detalhe → ver widget no painel → conferir mobile.

- [ ] **Step 5: Commit**

```bash
git add docs/indicators.md src/features/indicators
git commit -m "docs(indicators): add feature documentation and responsive polish"
```

---

## Self-Review (cobertura do spec)

- **§4 Modelo** → Tasks 1, 2 (C1). ✅
- **§5 Engine (matcher + 4 métricas + contribuição + helpers compartilhados)** → Tasks 3, 4, 5, 6. ✅
- **§6 Providers/mocks/hooks** → Tasks 7, 8. ✅
- **§7 UI (dashboard, criação, detalhe, widget)** → Tasks 9–15, 18. ✅
- **§8 Notificações/permissões/status automático/audit** → Tasks 13, 15, 16, 17. ✅ (permissões via guards de rota Task 9 + render condicional Task 11/15).
- **§9 Fases** → mapeadas 1:1. ✅
- **§10 Fora do MVP (subcategoria)** → `ProductSelector` sem `subcategory`; doc Task 19 + issue #23. ✅
- **§11 RNF** → performance (engine linear, Task 5), a11y (tabela alternativa Task 14), responsivo (Task 19), tokens semânticos (notas nas tasks de UI), zero `any` (type-check em toda task). ✅

**Consistência de nomes:** `calculateIndicatorProgress`, `buildItemMatcher`, `IProductIndicator`, `IIndicatorProgress`, `ProductSelector` (kinds `category`/`sku`/`group`), `IIndicatorsProvider`, `indicatorsApi`, `mockIndicatorsProvider`, `useIndicatorsProvider`, `useIndicatorProgress`, `useIndicators`/`useStoreIndicators`, `generateIndicators`, `selectAllIndicators`, campos `partCategory`/`partSubcategory` — usados de forma idêntica em todas as tasks. ✅

**Pontos que dependem de verificação no código (marcados inline nas tasks):** assinatura de `scopedListParams`, params reais de `IListOrdersParams`/`IListPartsParams`, existência de `useGoalAutoStatusUpdate`, formato do item de navegação, helpers de moeda/id, mecanismo de marco das metas. Cada um tem instrução de "abrir o arquivo X e espelhar".
