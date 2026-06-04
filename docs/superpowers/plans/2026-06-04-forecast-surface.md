# PRD-056 Forecast — Surface Implementation Plan (Plan A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the closing-forecast (PRD-056) a navigable surface: a page at `/app/gestao/forecast` with the 3 scenarios + composition breakdown + per-seller drill-down, a cockpit widget, a sidebar menu entry, and an Owner config page — all built on the already-merged pure core (`computeForecast`, `buildForecastInput`, `useForecast`).

**Architecture:** The page/widget consume a new `useStoreForecast` hook that loads orders/leads/goals/sellers via the existing data providers **once** and computes the store forecast + per-seller forecasts with the pure functions (no per-seller hook loops). Visual components reuse the project's design system (Card, GoalStatusBadge, GoalProgressBar, ExecutiveKpiCard patterns). Routes are file-based (TanStack Router auto-generates `routeTree.gen.ts`).

**Tech Stack:** React 19, TanStack Router + Query, Tailwind v4, shadcn/ui, Iconify.

**Verification policy:** Surface/UI is verified by `bunx tsc --noEmit` (delta: zero NEW errors in touched files — the repo has ~315 pre-existing baseline errors), `bun run build` (the real gate — must stay green), and `bunx eslint <touched paths>` (must be clean). **Do NOT add jsdom/RTL or open a browser** — the user tests UI manually.

**Source design:** `docs/superpowers/specs/2026-06-04-forecast-copiloto-fundacao-design.md` §8 (UX guidance). **Exploration facts** are embedded in each task below.

**Branch:** `feat/prd-056-057-foundation` (continue here; PR #35).

---

## Conventions

- Imports via `@/` alias. Import `@/providers/data` and `@/mocks` only from the package **barrel** (ESLint `no-restricted-imports`).
- pt-BR for all user-facing strings (with accents). English for code identifiers.
- Reuse, don't recreate: `GoalStatusBadge`, `GoalProgressBar`, `Card`, `Icon`, `Skeleton`, `EmptyState`, `formatBRL`/`formatGoalValue`.
- `tsc --noEmit` won't be globally clean — verify your touched files contribute **zero** errors (`bunx tsc --noEmit 2>&1 | grep <your-file>` must be empty), and `bun run build` must pass.
- Per task: implement → run verification → commit with the given message.

## File Structure

| File | Responsibility |
|------|----------------|
| `src/shared/types/platform.ts` (modify) | add optional `forecast?: IForecastConfig` |
| `src/features/sales-forecast/hooks/useStoreForecast.ts` (create) | load providers once → store + per-seller forecasts |
| `src/features/sales-forecast/components/ForecastScenarioCard.tsx` (create) | one scenario card |
| `src/features/sales-forecast/components/ForecastBreakdown.tsx` (create) | stacked CSS bar + legend table |
| `src/features/sales-forecast/components/ForecastSellersTable.tsx` (create) | per-seller drill-down list |
| `src/features/sales-forecast/components/ForecastWidget.tsx` (create) | compact cockpit widget |
| `src/features/sales-forecast/pages/SalesForecastPage.tsx` (create) | the page + filters + states |
| `src/features/sales-forecast/pages/forecastSearch.ts` (create) | `validateForecastSearch` |
| `src/features/sales-forecast/index.ts` (modify) | export page/widget/hook/search |
| `src/routes/app.gestao.forecast.tsx` (create) | route |
| `src/features/shell/config/routes.ts` (modify) | `GESTAO_FORECAST` constant |
| `src/features/shell/config/navigation.ts` (modify) | "Forecast" menu item |
| `src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx` (modify) | mount `<ForecastWidget>` |
| `src/features/sales-forecast/pages/ForecastConfigPage.tsx` (create) | Owner config page |
| `src/routes/app.configuracoes.forecast.tsx` (create) | config route |

---

## Task 1: Add optional forecast config to platform settings

**Files:** Modify `src/shared/types/platform.ts`; verify `src/shared/types/index.ts` exports `IForecastConfig`.

- [ ] **Step 1:** In `src/shared/types/platform.ts`, add an import and an optional field to `IPlatformSettings` (place the field near the other feature-config fields like `abcCurveSettings`):

```ts
import type { IForecastConfig } from "./forecast";
```
```ts
  /** Forecast engine tuning (PRD-056). Undefined → DEFAULT_FORECAST_CONFIG. */
  forecast?: IForecastConfig;
```

- [ ] **Step 2:** Confirm `IForecastConfig` is re-exported from the shared types barrel. Read `src/shared/types/index.ts`; if `forecast` types aren't exported, add `export * from "./forecast";` (match the existing export style).

- [ ] **Step 3:** Verify: `bunx tsc --noEmit 2>&1 | grep -E "platform.ts|forecast.ts"` → empty. `bun run build` → green.

- [ ] **Step 4:** Commit:
```bash
git add src/shared/types/platform.ts src/shared/types/index.ts
git commit -m "feat(sales-forecast): add optional forecast config to platform settings (PRD-056)"
```

---

## Task 2: `useStoreForecast` hook (store + per-seller, single load)

**File:** Create `src/features/sales-forecast/hooks/useStoreForecast.ts`.

**Context / exact APIs (from exploration — verify field names while implementing):**
- Providers via barrel `@/providers/data`: `useOrdersProvider()`, `useLeadsProvider()`, `useSellersProvider()`, `useGoalsProvider()` (confirm each is exported; if a goals provider hook isn't exported, reuse `useGoalsWithProgress` from `@/features/goals` with `{ storeId, statuses: ["ativa"] }`).
- `ordersProvider.list({ storeId, paymentStatus: "pago", since, until, pageSize: 2000 })` → `IPaginatedResult<IOrder>` (`.data`). Use `IOrder.total`, `IOrder.sellerId`, `IOrder.paidAt`.
- `leadsProvider.list({ storeId, pageSize: 2000 })` → `.data: ILead[]`.
- `sellersProvider.list({ storeId, active: true })` → sellers; **verify the display-name field on `ISeller`** in `src/shared/types/people.ts` (e.g. `name`/`displayName`/`fullName`).
- `sumBy` from `@/features/sales-analytics/utils/aggregations` (`sumBy<T>(items, valueFn): number`).
- Pure core from `@/features/sales-forecast`: `buildForecastInput`, `computeForecast`, `DEFAULT_FORECAST_CONFIG`.
- Month bounds: replicate the `monthBounds(now)` helper used in `useForecast.ts` (no `@/mocks` import).
- Fetch with `@tanstack/react-query` `useQuery` (pattern from `useForecast.ts`).

- [ ] **Step 1:** Implement the hook with this shape:

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrdersProvider, useLeadsProvider, useSellersProvider } from "@/providers/data";
import { useGoalsWithProgress } from "@/features/goals";
import { sumBy } from "@/features/sales-analytics/utils/aggregations";
import type { ID } from "@/shared/types/common";
import type { GoalLevel, IGoalPeriod } from "@/shared/types/bi";
import type { ForecastMetric, IForecast, IForecastConfig } from "@/shared/types/forecast";
import { buildForecastInput, computeForecast, DEFAULT_FORECAST_CONFIG } from "@/features/sales-forecast";

export interface ISellerForecast { sellerId: ID; sellerName: string; forecast: IForecast; }
export interface IUseStoreForecastResult {
  storeForecast: IForecast | null;
  bySeller: ISellerForecast[];
  isLoading: boolean;
  hasError: boolean;
}
export interface IUseStoreForecastParams { storeId: ID; metric: ForecastMetric; config?: IForecastConfig; }

function monthBounds(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}
```

The hook:
1. `now = useMemo(() => new Date(), [])`; `bounds = monthBounds(now)`; `period: IGoalPeriod = { type: "monthly", start: bounds.start, end: bounds.end }`.
2. `ordersQuery = useQuery({ queryKey: ["store-forecast","orders",storeId,bounds.start], queryFn: () => ordersProvider.list({ storeId, paymentStatus: "pago", since: bounds.start, until: bounds.end, pageSize: 2000 }), staleTime: 30_000 })`.
3. `leadsQuery` similar (`{ storeId, pageSize: 2000 }`).
4. `sellersQuery = useQuery({ queryKey:["store-forecast","sellers",storeId], queryFn: () => sellersProvider.list({ storeId, active: true }) })` — normalize result to an array (handle `.data` vs array).
5. `goals = useGoalsWithProgress({ storeId, statuses: ["ativa"] })`.
6. `isLoading = ordersQuery.isLoading || leadsQuery.isLoading || sellersQuery.isLoading || goals.isLoading`. `hasError` analogous (`.isError`/`.hasError`).
7. In a `useMemo` (guarded by `!isLoading && !hasError`): build a helper `compute(scopeSellerId?: ID): IForecast` that:
   - filters orders/leads to the seller when `scopeSellerId` is set (`o.sellerId === scopeSellerId`);
   - `realizedValue = metric === "revenue" ? sumBy(orders, o => o.total) : orders.length`;
   - `avgTicket = orders.length ? sumBy(orders, o => o.total) / orders.length : undefined`;
   - finds the matching active goal (`level` store vs individual, `metric`, period contains `now`) → `target`;
   - `level: GoalLevel = scopeSellerId ? "individual" : "store"`;
   - `buildForecastInput({ scope: { level, targetId: scopeSellerId ?? storeId, storeId, sellerId: scopeSellerId }, metric, period, realizedValue, avgTicket, leads, target, now })` → `computeForecast(input, config ?? DEFAULT_FORECAST_CONFIG)`.
   - `storeForecast = compute()`; `bySeller = sellers.map(s => ({ sellerId: s.id, sellerName: <display name>, forecast: compute(s.id) }))` sorted by largest gap of the `provavel` scenario first (sellers pulling the gap down on top). Sellers with no orders AND no leads may be filtered out.
8. Return `{ storeForecast, bySeller, isLoading, hasError }`.

- [ ] **Step 2:** Verify: `bunx tsc --noEmit 2>&1 | grep useStoreForecast` → empty. `bunx eslint src/features/sales-forecast/hooks/useStoreForecast.ts` → clean. `bun run build` → green.

- [ ] **Step 3:** Commit:
```bash
git add src/features/sales-forecast/hooks/useStoreForecast.ts
git commit -m "feat(sales-forecast): add useStoreForecast (store + per-seller, single load)"
```

---

## Task 3: `ForecastScenarioCard` + `ForecastBreakdown` components

**Files:** Create `src/features/sales-forecast/components/ForecastScenarioCard.tsx` and `ForecastBreakdown.tsx`.

**Design (spec §8) + exact APIs:**
- `Card` from `@/components/ui/card` (base `flex h-full flex-col gap-3 p-5`).
- `GoalStatusBadge` from `@/features/goals/components/GoalStatusBadge` — props `{ mode: "progress", value: GoalProgressStatus, size?: "sm"|"md" }`.
- `formatGoalValue(metric, value)` from `@/features/goals/utils/formatGoalValue` — **note** it takes a `GoalMetric`; pass the forecast `metric` (`"revenue"|"tickets"`, both valid GoalMetric). `formatBRL` from `@/shared/utils/format`.
- `Icon` from `@/components/Icon` (`<Icon icon="mdi:..." size={n} />`).
- Types from `@/shared/types/forecast`: `IForecastScenario`, `IForecastBreakdown`, `ForecastMetric`.

- [ ] **Step 1: `ForecastBreakdown.tsx`** — props `{ breakdown: IForecastBreakdown; metric: ForecastMetric }`. Render:
  - A stacked horizontal bar: `<div role="img" aria-label={...full pt-BR description...} className="flex h-3 w-full overflow-hidden rounded-full bg-muted">` with three child `<div aria-hidden>` whose `style={{ width: pct% }}`: realizado `bg-primary`, pipeline `bg-primary/45`, ritmo `bg-muted-foreground/30` (add `border-l border-dashed border-background` on the ritmo segment). Widths = each part / total (guard total=0 → empty bar). `transition-all duration-300`.
  - A legend **table** (not just colors) below: three rows, each = a colored dot (`size-2 rounded-full` matching the segment) + label ("Realizado" / "Pipeline ponderado" / "Ritmo") + value `formatGoalValue(metric, part)` right-aligned (`font-mono tabular-nums`). On mobile keep as a 1-col list.
  - `aria-label` example: `"Composição: realizado R$ 100.000, pipeline ponderado R$ 30.000, ritmo R$ 0"` (use formatted values).

- [ ] **Step 2: `ForecastScenarioCard.tsx`** — props `{ scenario: IForecastScenario; metric: ForecastMetric; highlighted?: boolean; showBreakdown?: boolean }`. Render a `Card`:
  - When `highlighted` (the provável), add `border-primary/50 ring-1 ring-primary/20` and a `Badge` "Provável" (`@/components/ui/badge`, default variant). Else `border-border`.
  - Header row: scenario name label (`Pessimista`/`Provável`/`Otimista` — map from `scenario.type`) as `text-base font-semibold` + a trend icon (`mdi:trending-down`/`mdi:trending-neutral`/`mdi:trending-up`) in `text-muted-foreground`. **The textual name is the primary non-color signal (WCAG).**
  - Value: `formatGoalValue(metric, scenario.projectedValue)` in `text-2xl font-semibold tracking-tight` (highlighted may use `text-3xl`).
  - Gap line: if `scenario.gapToTarget !== undefined`, show `<GoalStatusBadge mode="progress" value={scenario.status} size="sm" />` + text: when gap > 0 `"Faltam {formatGoalValue(metric, gap)} ({(gapPercent*100).toFixed(1)}%)"`; when gap <= 0 `"{formatGoalValue(metric, -gap)} acima da meta"`. If `ordersNeeded` present, a muted micro-line `"≈ {ordersNeeded} pedidos para a meta"`. If `gapToTarget === undefined`, show `"Sem meta definida para o período"` in `text-muted-foreground` (no badge).
  - If `showBreakdown` (only the provável), render `<ForecastBreakdown breakdown={scenario.breakdown} metric={metric} />` + a footer note `text-xs text-muted-foreground` "Projeção determinística (ritmo + pipeline ponderado)".

- [ ] **Step 3:** Verify: `bunx tsc --noEmit 2>&1 | grep -E "ForecastScenarioCard|ForecastBreakdown"` → empty. `bunx eslint` on both files → clean. `bun run build` → green.

- [ ] **Step 4:** Commit:
```bash
git add src/features/sales-forecast/components/ForecastScenarioCard.tsx src/features/sales-forecast/components/ForecastBreakdown.tsx
git commit -m "feat(sales-forecast): add ForecastScenarioCard + ForecastBreakdown (PRD-056)"
```

---

## Task 4: `ForecastSellersTable` component

**File:** Create `src/features/sales-forecast/components/ForecastSellersTable.tsx`.

- [ ] **Step 1:** Props `{ rows: ISellerForecast[]; metric: ForecastMetric }` (`ISellerForecast` from `../hooks/useStoreForecast`). Use `@/components/ui/table` (`Table, TableHeader, TableBody, TableRow, TableHead, TableCell`). Columns: **Vendedor** · **Realizado** (`formatGoalValue(metric, forecast.realizedValue)`) · **Provável** (provável scenario `projectedValue`) · **Gap** (`<GoalStatusBadge size="sm">` of the provável status + short gap text). Add `<caption className="sr-only">Forecast por vendedor</caption>`, `scope="col"` on headers. Rows already sorted by largest gap (from the hook). Numbers `tabular-nums`.
  - On mobile (`md:hidden`), render an alternative stacked `<ul>` of cards (one per seller) instead of the wide table; show the table only `md:block`. (Reuse the same data.)
  - Empty: if `rows.length === 0`, render `<p className="py-6 text-center text-sm text-muted-foreground">Sem vendedores com dados no período.</p>`.

- [ ] **Step 2:** Verify tsc-delta + eslint + `bun run build` green.

- [ ] **Step 3:** Commit:
```bash
git add src/features/sales-forecast/components/ForecastSellersTable.tsx
git commit -m "feat(sales-forecast): add ForecastSellersTable drill-down (PRD-056)"
```

---

## Task 5: `ForecastWidget` for the cockpit

**File:** Create `src/features/sales-forecast/components/ForecastWidget.tsx`.

**Context:** Mirrors other cockpit widgets (Card + header + states). Uses the existing `useForecast({ storeId, metric: "revenue" })` hook (already in the feature). Props `{ storeId?: ID }` (default to `"store-matriz"` when absent, like `CommissionsWidget`).

- [ ] **Step 1:** Implement a `Card className="flex h-full flex-col gap-3 p-5"`:
  - Header: `<h2>` "Forecast de fechamento" + `<Icon icon="mdi:chart-timeline" size={18} className="text-primary" />`; right side `<Link to="/app/gestao/forecast" className="text-xs text-primary hover:underline">Ver forecast</Link>`.
  - **Fail isolated:** wrap the body so an error renders a small inline message (`text-sm text-muted-foreground` + retry) instead of throwing — never break the cockpit. (`useForecast` returns `hasError`; on error show the inline state.)
  - Loading → `Skeleton` rows. Loaded → the **provável** scenario: value `text-2xl`, a `GoalProgressBar` (from `@/features/goals/components/GoalProgressBar`, props `{ percentage, status }`) where `percentage = realizedValue/targetValue*100` (guard no target → hide bar), a gap line with `GoalStatusBadge`, and a mini breakdown bar (reuse `ForecastBreakdown` or a `h-1.5` inline variant). If `forecast.lowConfidence`, a tiny amber note.
  - Empty (no forecast / `storeForecast` null) → muted "Dados insuficientes para projetar".

- [ ] **Step 2:** Verify tsc-delta + eslint + `bun run build` green.

- [ ] **Step 3:** Commit:
```bash
git add src/features/sales-forecast/components/ForecastWidget.tsx
git commit -m "feat(sales-forecast): add ForecastWidget for cockpit (PRD-056)"
```

---

## Task 6: `SalesForecastPage` + search validation + barrel

**Files:** Create `src/features/sales-forecast/pages/SalesForecastPage.tsx`, `src/features/sales-forecast/pages/forecastSearch.ts`; modify `src/features/sales-forecast/index.ts`.

**Context:** Page lives in `DashboardLayout`? Check how other gestão pages wrap (e.g., `SalesAnalyticsPage`) — most page components render their own content and the route/layout wraps. Follow `SalesAnalyticsPage`'s outer structure (read it). Scope store via `useCurrentStore()` (`@/features/multistore`); metric via URL search.

- [ ] **Step 1: `forecastSearch.ts`** — export `validateForecastSearch(search: Record<string, unknown>): { metric: ForecastMetric }` returning `{ metric: search.metric === "tickets" ? "tickets" : "revenue" }`. (Mirror the lightweight `validate*Search` pattern; read `validateSalesSearch` for the exact shape/return convention and match it.)

- [ ] **Step 2: `SalesForecastPage.tsx`:**
  - Header: `<h1>` "Forecast de fechamento" + subtitle "Projeção de onde o período vai fechar — realizado + pipeline ponderado + ritmo." Period label: "Mês atual" (the engine currently projects the current month).
  - A metric toggle (Faturamento / Pedidos) bound to URL search (`useSearch`/`useNavigate` from the route, pattern from sales). Map Faturamento→`revenue`, Pedidos→`tickets`.
  - `storeId = currentStoreId ?? "store-matriz"`. `const { storeForecast, bySeller, isLoading, hasError } = useStoreForecast({ storeId, metric })`.
  - **Low-confidence banner** (when `storeForecast?.lowConfidence`): amber banner (`bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/40 rounded-md px-4 py-3`) + `mdi:alert-circle-outline` + "Projeção pouco confiável — poucos dias decorridos. A precisão melhora ao longo do mês."
  - **3 scenarios**: `grid grid-cols-1 gap-4 md:grid-cols-3`. Render `<ForecastScenarioCard>` for pessimista, provável (highlighted + showBreakdown), otimista. On mobile order **Provável → Pessimista → Otimista** (render provável first in the DOM and reorder on `md` with CSS order utilities, or render a separate mobile order).
  - **Sellers table**: `<ForecastSellersTable rows={bySeller} metric={metric} />` (only meaningful for store scope).
  - **States:** loading → `Skeleton`s; error → inline error with retry; empty (no realized + no pipeline) → `EmptyState` (`@/features/shell/components/EmptyState`) "Dados insuficientes para projetar".
  - A11y: one `<h1>`, `<h2>` per section; the metric toggle keyboard-accessible.

- [ ] **Step 3:** Update `src/features/sales-forecast/index.ts` to also export: `SalesForecastPage`, `validateForecastSearch`, `ForecastWidget`, `useStoreForecast`.

- [ ] **Step 4:** Verify tsc-delta + `bunx eslint src/features/sales-forecast` clean + `bun run build` green.

- [ ] **Step 5:** Commit:
```bash
git add src/features/sales-forecast/pages/SalesForecastPage.tsx src/features/sales-forecast/pages/forecastSearch.ts src/features/sales-forecast/index.ts
git commit -m "feat(sales-forecast): add SalesForecastPage with scenarios, breakdown and per-seller drill-down (PRD-056)"
```

---

## Task 7: Route + sidebar menu entry

**Files:** Create `src/routes/app.gestao.forecast.tsx`; modify `src/features/shell/config/routes.ts` and `src/features/shell/config/navigation.ts`.

- [ ] **Step 1:** In `src/features/shell/config/routes.ts`, add (near other `GESTAO_*` constants):
```ts
GESTAO_FORECAST: "/app/gestao/forecast",
```

- [ ] **Step 2:** In `src/features/shell/config/navigation.ts`, add this item to the **Gestão** group `items` array (place it right after "Vendas" or "Metas", logically near forecasting):
```ts
{ label: "Forecast", icon: "mdi:chart-timeline", to: ROUTES.GESTAO_FORECAST, roles: ["Owner", "Gestor", "Financeiro"] },
```

- [ ] **Step 3:** Create `src/routes/app.gestao.forecast.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SalesForecastPage, validateForecastSearch } from "@/features/sales-forecast";

export const Route = createFileRoute("/app/gestao/forecast")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Financeiro"]),
  validateSearch: validateForecastSearch,
  component: SalesForecastPage,
});
```
(If `SalesForecastPage` needs a layout wrapper that sibling gestão routes use, mirror `app.gestao.vendas.tsx` exactly — read it first.)

- [ ] **Step 4:** Verify: `bun run dev` is not required; run `bun run build` (this regenerates the route tree and type-checks via the build) → green. Confirm `src/routeTree.gen.ts` now references the forecast route (it's auto-generated — do not hand-edit). tsc-delta on the route file → empty.

- [ ] **Step 5:** Commit:
```bash
git add src/routes/app.gestao.forecast.tsx src/features/shell/config/routes.ts src/features/shell/config/navigation.ts src/routeTree.gen.ts
git commit -m "feat(sales-forecast): wire /app/gestao/forecast route + sidebar menu entry (PRD-056)"
```

---

## Task 8: Mount `ForecastWidget` in the cockpit

**File:** Modify `src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx`.

- [ ] **Step 1:** Read the widgets `<section>` (around lines 321-328, the `lg:grid-cols-3` grid with `RankingHighlightWidget`/`CommissionsWidget`/`RecentMovementsWidget`). Add the import `import { ForecastWidget } from "@/features/sales-forecast";` and mount `<ForecastWidget storeId={scope.storeId} />` — either as a new card in that grid or in a new `<section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">` right after it (prefer a new section so the existing 3-col grid stays balanced). Use `scope.storeId` (already computed in the page).

- [ ] **Step 2:** Verify: `bunx tsc --noEmit 2>&1 | grep ExecutiveCockpitPage` → no NEW errors vs baseline; `bun run build` green; `bunx eslint src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx` clean.

- [ ] **Step 3:** Commit:
```bash
git add src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx
git commit -m "feat(sales-forecast): mount ForecastWidget in the executive cockpit (PRD-056)"
```

---

## Task 9: `ForecastConfigPage` (Owner) + route

**Files:** Create `src/features/sales-forecast/pages/ForecastConfigPage.tsx`; create `src/routes/app.configuracoes.forecast.tsx`; export the page from the feature barrel.

**Context:** Follow the `ShippingConfigPage` molde (read it): `useCurrentStore`, `useAuth`, `useCurrentRole`, `hasPermission`, `Forbidden`, `SectionHeader`, `usePlatformSettings(storeId)`, draft state, dirty check, `useUnsavedChanges`, sticky save/discard footer, `UnsavedChangesDialog`. Save with `update({ forecast: draft }, "settings.forecast.update")` (auditLog is automatic inside `usePlatformSettings.update`). Draft defaults to `settings.forecast ?? DEFAULT_FORECAST_CONFIG` (the field is optional).

- [ ] **Step 1:** Implement `ForecastConfigPage` editing `IForecastConfig`:
  - `temperatureWeights` (frio/morno/quente) — three numeric inputs or sliders (0..1).
  - `scenarioFactors` (pessimista/otimista; provável fixed at 1.0, can be read-only) — numeric inputs.
  - `pipelineWeightingMode` — select (`temperature`/`stage`/`hybrid`).
  - `lowConfidenceMinDays` — numeric input.
  - Info banner: "Projeção determinística baseada em ritmo + pipeline. Modelo preditivo (ML) com sazonalidade disponível na Fase 2." (`text-sm text-muted-foreground` in a bordered box).
  - Guard with `Forbidden` when `!canView`; gate edits on `canEdit` (Owner). Use `SectionHeader title="Forecast de Fechamento"`.

- [ ] **Step 2:** Create `src/routes/app.configuracoes.forecast.tsx`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { ForecastConfigPage } from "@/features/sales-forecast/pages/ForecastConfigPage";

export const Route = createFileRoute("/app/configuracoes/forecast")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <ForecastConfigPage />
    </SettingsLayout>
  ),
});
```
If the settings area has its own nav config (look for a settings navigation list near `navigation.ts` / SettingsLayout), add a "Forecast" entry there (Owner-only). If not found, the route is reachable directly — note it.

- [ ] **Step 3:** Export `ForecastConfigPage` from `src/features/sales-forecast/index.ts`.

- [ ] **Step 4:** Verify tsc-delta + eslint + `bun run build` green.

- [ ] **Step 5:** Commit:
```bash
git add src/features/sales-forecast/pages/ForecastConfigPage.tsx src/routes/app.configuracoes.forecast.tsx src/features/sales-forecast/index.ts src/routeTree.gen.ts
git commit -m "feat(sales-forecast): add Owner ForecastConfigPage + route (PRD-056)"
```

---

## Task 10: Final verification

- [ ] **Step 1:** `bun run build` → green.
- [ ] **Step 2:** `bunx eslint src/features/sales-forecast src/features/executive-cockpit/pages/ExecutiveCockpitPage.tsx src/features/shell/config/navigation.ts src/features/shell/config/routes.ts src/routes/app.gestao.forecast.tsx src/routes/app.configuracoes.forecast.tsx` → clean.
- [ ] **Step 3:** `bunx tsc --noEmit 2>&1 | grep -E "sales-forecast|app.gestao.forecast|app.configuracoes.forecast"` → empty (zero new errors).
- [ ] **Step 4:** Existing forecast unit tests still green: `bunx vitest run src/features/sales-forecast` → pass.
- [ ] **Step 5:** Confirm the route tree includes `/app/gestao/forecast` and `/app/configuracoes/forecast`. No commit needed if Tasks 1-9 committed cleanly; otherwise commit any leftover `routeTree.gen.ts`.

## Self-Review checklist (controller, after execution)
- Forecast appears in the sidebar (Gestão group) and `/app/gestao/forecast` renders the 3 scenarios + breakdown + sellers table.
- Cockpit shows the ForecastWidget and it fails isolated (doesn't break the cockpit).
- Owner config page saves via platform settings (audit fired).
- `bun run build` green; touched files contribute zero new tsc errors; eslint clean.
- Manual UI verification is left to the user (per preference).

## Out of scope (Plan B / later)
- PRD-057 Copilot surface (panel, provider, adapter, TopBar button, config).
- Period selector beyond current month; margin metric; Metas-page gap enrichment.
