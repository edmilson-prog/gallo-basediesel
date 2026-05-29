# Gráfico "Evolução de Venda" (mês atual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um card hero full-width no topo da aba Visão Geral de `/app/gestao/vendas` mostrando o faturamento acumulado diário do mês corrente, comparado à meta, com previsão de fechamento, comparativos históricos, KPIs e drill-down por vendedor.

**Architecture:** Util puro (`evolution.ts`) que transforma pedidos em séries diárias acumuladas; hook (`useSalesEvolution`) que busca as 3 janelas de pedidos + meta via goals e deriva KPIs; componente Recharts (`SalesEvolutionChart`) com toggles de série e modo "por vendedor". Escopo RBAC e meta reutilizam infraestrutura existente.

**Tech Stack:** React + TypeScript (strict), TanStack Query, Recharts, Tailwind v4 + shadcn/ui, Iconify. Bun como runtime. Sem runner de testes no projeto — verificação por `bun run build` (type-check via `tsc --noEmit`) + teste manual de UI pelo usuário.

---

## Notas de contexto (ler antes de começar)

- **Sem suite de testes.** O projeto não tem runner (ver `CLAUDE.md`). A verificação de cada task é: `bun run build` passar (type-check) + inspeção manual. NÃO criar arquivos `*.test.ts` nem instalar runner (YAGNI, fora de escopo no spec).
- **Provider de pedidos** retorna `IPaginatedResult<IOrder>` → usar `result.data` (NÃO `.items`). Ver `src/providers/data/contracts/_shared.ts:15`.
- **IOrder** tem: `total: number`, `paidAt?: ISO8601`, `createdAt: ISO8601`, `sellerId: ID`, `storeId: ID`, `paymentStatus`, `division`, `items[]`. Ver uso em `src/features/goals/utils/composition.ts`.
- **Tokens:** componentes consomem apenas tokens semânticos / `var(--gallo-*)`. Cores categóricas das séries: vermelho/roxo/amarelo/cinza, padrão do cockpit (`var(--gallo-industrial-yellow, #C79C2C)`).
- **Meta (Objetivo):** vem de `useGoalsWithProgress({ storeId, sellerId, statuses: ["ativa"] })` → `items: { goal, progress }[]`. Ver `src/features/goals/hooks/useGoalsWithProgress.ts:20`.
- Spec de referência: `docs/superpowers/specs/2026-05-28-evolucao-venda-mensal-design.md`.

## File Structure

- **Create** `src/features/sales-analytics/utils/evolution.ts` — tipos + funções puras `buildDailyEvolution`, `buildSellerEvolution`, `computeEvolutionKpis`. Sem React, sem I/O.
- **Create** `src/features/sales-analytics/hooks/useSalesEvolution.ts` — hook: 3 queries de pedidos + sellers + meta; chama o util; retorna séries + KPIs + flags.
- **Create** `src/features/sales-analytics/components/charts/SalesEvolutionChart.tsx` — componente visual (Recharts ComposedChart, KPIs, legenda-toggle, botão drill-down).
- **Modify** `src/features/sales-analytics/i18n/pt-BR.ts` — novas strings.
- **Modify** `src/features/sales-analytics/pages/SalesAnalyticsPage.tsx` — renderizar o chart no topo do `TabsContent value="overview"`, passando `scope` e `canDrillDown`.
- **Modify** `src/features/sales-analytics/index.ts` (se necessário) — re-export do componente (verificar se o barrel exporta componentes; só adicionar se o padrão existir).

---

### Task 1: i18n strings

**Files:**

- Modify: `src/features/sales-analytics/i18n/pt-BR.ts`

- [ ] **Step 1: Adicionar as chaves antes do fechamento `} as const;`**

Inserir o bloco abaixo logo após a chave `chartEmpty: "Sem dados no período",` (linha ~68):

```ts
  // Evolution chart (mês atual)
  evolutionTitle: "Evolução de venda",
  evolutionSubtitle: "Faturamento acumulado diário — comparado à meta do mês",
  evolutionSubtitleSeller: "Faturamento acumulado por vendedor — mês atual",
  evolutionSeriesVendas: "Vendas no mês",
  evolutionSeriesObjetivo: "Objetivo",
  evolutionSeriesPrevisao: "Previsão de vendas",
  evolutionSeriesMesPassado: "Mês passado",
  evolutionSeriesAnoPassado: "Ano passado",
  evolutionToday: "Hoje",
  evolutionOutros: "Outros",
  evolutionDrillDown: "Detalhar por vendedor",
  evolutionDrillDownBack: "Voltar ao consolidado",
  evolutionNoGoal: "Sem meta definida para o mês",
  evolutionKpiRealized: "Realizado (até hoje)",
  evolutionKpiTarget: "Meta do mês",
  evolutionKpiProjection: "Projeção fim do mês",
  evolutionKpiGap: "Gap projetado",
  evolutionKpiOfTarget: "da meta",
  evolutionKpiExpectedToday: "esperado hoje",
  evolutionKpiBelow: "abaixo da meta",
  evolutionKpiAbove: "acima da meta",
```

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: build passa sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add src/features/sales-analytics/i18n/pt-BR.ts
git commit -m "feat(sales): add i18n strings for monthly evolution chart"
```

---

### Task 2: Util puro de séries diárias

**Files:**

- Create: `src/features/sales-analytics/utils/evolution.ts`

- [ ] **Step 1: Criar o arquivo com tipos e funções puras**

```ts
import type { ID, IOrder } from "@/shared/types";

/** Weekday initials in pt-BR, indexed by Date.getDay() (0=Sun). */
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export interface IDailyEvolutionPoint {
  /** Day of month, 1..daysInMonth. */
  day: number;
  /** Weekday initial (pt-BR). */
  weekdayLabel: string;
  isWeekend: boolean;
  /** Cumulative realized revenue up to this day; null after today. */
  vendas: number | null;
  /** Cumulative linear target; null when there is no goal. */
  objetivo: number | null;
  /** Run-rate forecast; null before today (connects at today). */
  previsao: number | null;
  /** Cumulative revenue of the previous month, by day-of-month. */
  mesPassado: number;
  /** Cumulative revenue of the same month last year, by day-of-month. */
  anoPassado: number;
}

export interface ISellerEvolutionSeries {
  sellerId: ID;
  sellerName: string;
  /** Cumulative realized revenue per day (aligned to the day axis); null after today. */
  data: (number | null)[];
}

export interface IEvolutionKpis {
  /** Realized revenue as of today. */
  realized: number;
  /** Target value expected today (proportional); 0 when no goal. */
  expectedToday: number;
  /** Full monthly target; 0 when no goal. */
  target: number;
  /** Projected revenue at month end (forecast). */
  projection: number;
  /** target - projection (positive = below target). */
  gap: number;
}

export interface IBuildEvolutionInput {
  /** "Today" — drives current month, day count and the realized cutoff. */
  referenceDate: Date;
  currentMonthOrders: IOrder[];
  previousMonthOrders: IOrder[];
  lastYearMonthOrders: IOrder[];
  /** Monthly revenue target, or null when no active goal. */
  targetValue: number | null;
}

function orderTimestamp(order: IOrder): string {
  return order.paidAt ?? order.createdAt;
}

/** Bucket paid orders' revenue by day-of-month. Index 0 unused; days are 1-based. */
function revenueByDay(orders: IOrder[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const o of orders) {
    if (o.paymentStatus !== "pago") continue;
    const day = new Date(orderTimestamp(o)).getDate();
    out.set(day, (out.get(day) ?? 0) + o.total);
  }
  return out;
}

/** Cumulative array for days 1..daysInMonth from a per-day map. */
function cumulative(byDay: Map<number, number>, daysInMonth: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    acc += byDay.get(d) ?? 0;
    out.push(acc);
  }
  return out;
}

export function buildDailyEvolution(input: IBuildEvolutionInput): IDailyEvolutionPoint[] {
  const {
    referenceDate,
    currentMonthOrders,
    previousMonthOrders,
    lastYearMonthOrders,
    targetValue,
  } = input;

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);

  const curCum = cumulative(revenueByDay(currentMonthOrders), daysInMonth);
  const prevCum = cumulative(revenueByDay(previousMonthOrders), daysInMonth);
  const lastYearCum = cumulative(revenueByDay(lastYearMonthOrders), daysInMonth);

  const realizedToday = curCum[today - 1] ?? 0;
  const runRate = today > 0 ? realizedToday / today : 0;

  const points: IDailyEvolutionPoint[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const weekday = new Date(year, month, d).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    points.push({
      day: d,
      weekdayLabel: WEEKDAY_LABELS[weekday],
      isWeekend,
      vendas: d <= today ? curCum[d - 1] : null,
      objetivo: targetValue == null ? null : Math.round((targetValue * d) / daysInMonth),
      previsao: d < today ? null : Math.round(runRate * d),
      mesPassado: prevCum[d - 1],
      anoPassado: lastYearCum[d - 1],
    });
  }
  return points;
}

export function computeEvolutionKpis(
  points: IDailyEvolutionPoint[],
  referenceDate: Date,
  targetValue: number | null,
): IEvolutionKpis {
  const daysInMonth = points.length;
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);
  const todayPoint = points[today - 1];
  const lastPoint = points[daysInMonth - 1];
  const realized = todayPoint?.vendas ?? 0;
  const target = targetValue ?? 0;
  const expectedToday = todayPoint?.objetivo ?? 0;
  const projection = lastPoint?.previsao ?? realized;
  return { realized, expectedToday, target, projection, gap: target - projection };
}

const SELLER_TOP_N = 6;

export function buildSellerEvolution(
  currentMonthOrders: IOrder[],
  sellerNameById: Map<ID, string>,
  referenceDate: Date,
  outrosLabel: string,
): ISellerEvolutionSeries[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);

  // per-seller per-day revenue
  const bySeller = new Map<ID, Map<number, number>>();
  const totals = new Map<ID, number>();
  for (const o of currentMonthOrders) {
    if (o.paymentStatus !== "pago") continue;
    const day = new Date(o.paidAt ?? o.createdAt).getDate();
    const perDay = bySeller.get(o.sellerId) ?? new Map<number, number>();
    perDay.set(day, (perDay.get(day) ?? 0) + o.total);
    bySeller.set(o.sellerId, perDay);
    totals.set(o.sellerId, (totals.get(o.sellerId) ?? 0) + o.total);
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, SELLER_TOP_N).map(([id]) => id);
  const rest = ranked.slice(SELLER_TOP_N).map(([id]) => id);

  const toSeries = (
    sellerId: ID,
    name: string,
    perDayMaps: Map<number, number>[],
  ): ISellerEvolutionSeries => {
    const data: (number | null)[] = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      for (const m of perDayMaps) acc += m.get(d) ?? 0;
      data.push(d <= today ? acc : null);
    }
    return { sellerId, sellerName: name, data };
  };

  const series = top.map((id) =>
    toSeries(id, sellerNameById.get(id) ?? "—", [bySeller.get(id) ?? new Map()]),
  );

  if (rest.length > 0) {
    series.push(
      toSeries(
        "outros",
        outrosLabel,
        rest.map((id) => bySeller.get(id) ?? new Map()),
      ),
    );
  }
  return series;
}
```

- [ ] **Step 2: Sanity review (manual, sem runner)**

Reler o arquivo e confirmar:

- `vendas` é `null` para `day > today` e cumulativo até `today`.
- `previsao[today] === curCum[today-1]` (mesmo valor → linhas conectam): como `runRate = realizedToday/today` e `previsao[today] = round(runRate*today) = round(realizedToday)`. OK (diferença ≤ arredondamento).
- `objetivo` é `null` quando `targetValue == null`.
- Sem imports de React/Recharts (arquivo puro).

- [ ] **Step 3: Type-check**

Run: `bun run build`
Expected: passa sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/features/sales-analytics/utils/evolution.ts
git commit -m "feat(sales): add pure daily evolution series builders"
```

---

### Task 3: Hook useSalesEvolution

**Files:**

- Create: `src/features/sales-analytics/hooks/useSalesEvolution.ts`

- [ ] **Step 1: Criar o hook**

```ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { useOrdersProvider, useSellersProvider } from "@/providers/data";
import { useGoalsWithProgress } from "@/features/goals/hooks/useGoalsWithProgress";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";
import {
  buildDailyEvolution,
  buildSellerEvolution,
  computeEvolutionKpis,
  type IDailyEvolutionPoint,
  type IEvolutionKpis,
  type ISellerEvolutionSeries,
} from "../utils/evolution";

const STALE_MS = 30_000;

export interface IUseSalesEvolutionParams {
  scope: { storeId?: ID; sellerId?: ID };
}

export interface IUseSalesEvolutionResult {
  isLoading: boolean;
  hasError: boolean;
  hasGoal: boolean;
  referenceDate: Date;
  points: IDailyEvolutionPoint[];
  sellerSeries: ISellerEvolutionSeries[];
  kpis: IEvolutionKpis;
}

function monthRangeIso(year: number, month: number): { sinceIso: string; untilIso: string } {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { sinceIso: start.toISOString(), untilIso: end.toISOString() };
}

export function useSalesEvolution(params: IUseSalesEvolutionParams): IUseSalesEvolutionResult {
  const { scope } = params;
  const ordersProvider = useOrdersProvider();
  const sellersProvider = useSellersProvider();

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();

  const cur = useMemo(() => monthRangeIso(year, month), [year, month]);
  const prev = useMemo(() => monthRangeIso(year, month - 1), [year, month]);
  const lastYear = useMemo(() => monthRangeIso(year - 1, month), [year, month]);

  const baseKey = ["sales-evolution", scope.storeId, scope.sellerId] as const;

  const curQuery = useQuery({
    queryKey: [...baseKey, "current", cur.sinceIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: cur.sinceIso,
        until: cur.untilIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const prevQuery = useQuery({
    queryKey: [...baseKey, "previous", prev.sinceIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: prev.sinceIso,
        until: prev.untilIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const lastYearQuery = useQuery({
    queryKey: [...baseKey, "lastYear", lastYear.sinceIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: lastYear.sinceIso,
        until: lastYear.untilIso,
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["sales-evolution", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId }),
    staleTime: STALE_MS,
  });

  const goals = useGoalsWithProgress({
    storeId: scope.storeId,
    sellerId: scope.sellerId,
    statuses: ["ativa"],
  });

  // Resolve the active monthly revenue target for the current month.
  const targetValue = useMemo<number | null>(() => {
    const wantLevel = scope.sellerId ? "individual" : "store";
    const match = goals.items.find(({ goal }) => {
      if (goal.metric !== "revenue") return false;
      if (goal.period.type !== "monthly") return false;
      if (goal.level !== wantLevel) return false;
      const startMonth = new Date(goal.period.start).getMonth();
      const startYear = new Date(goal.period.start).getFullYear();
      return startMonth === month && startYear === year;
    });
    return match ? match.goal.targetValue : null;
  }, [goals.items, scope.sellerId, month, year]);

  const sellerNameById = useMemo(() => {
    const map = new Map<ID, string>();
    for (const s of sellersQuery.data ?? []) map.set(s.id, s.name);
    return map;
  }, [sellersQuery.data]);

  const isLoading =
    curQuery.isLoading || prevQuery.isLoading || lastYearQuery.isLoading || goals.isLoading;
  const hasError = curQuery.isError || prevQuery.isError || lastYearQuery.isError || goals.hasError;

  const points = useMemo(
    () =>
      buildDailyEvolution({
        referenceDate: now,
        currentMonthOrders: curQuery.data?.data ?? [],
        previousMonthOrders: prevQuery.data?.data ?? [],
        lastYearMonthOrders: lastYearQuery.data?.data ?? [],
        targetValue,
      }),
    [now, curQuery.data, prevQuery.data, lastYearQuery.data, targetValue],
  );

  const sellerSeries = useMemo(
    () => buildSellerEvolution(curQuery.data?.data ?? [], sellerNameById, now, S.evolutionOutros),
    [curQuery.data, sellerNameById, now],
  );

  const kpis = useMemo(
    () => computeEvolutionKpis(points, now, targetValue),
    [points, now, targetValue],
  );

  return {
    isLoading,
    hasError,
    hasGoal: targetValue != null,
    referenceDate: now,
    points,
    sellerSeries,
    kpis,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: passa. Se `useGoalsWithProgress` ou os providers tiverem assinatura diferente da assumida, ajustar imports/campos conforme o erro.

- [ ] **Step 3: Commit**

```bash
git add src/features/sales-analytics/hooks/useSalesEvolution.ts
git commit -m "feat(sales): add useSalesEvolution data hook"
```

---

### Task 4: Componente SalesEvolutionChart (modo consolidado + KPIs + toggles)

**Files:**

- Create: `src/features/sales-analytics/components/charts/SalesEvolutionChart.tsx`

- [ ] **Step 1: Criar o componente (consolidado)**

```tsx
import { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { useSalesEvolution } from "../../hooks/useSalesEvolution";

export interface ISalesEvolutionChartProps {
  scope: { storeId?: ID; sellerId?: ID };
  canDrillDown: boolean;
}

type SeriesKey = "vendas" | "objetivo" | "previsao" | "mesPassado" | "anoPassado";

const SERIES_META: Record<SeriesKey, { label: string; color: string; dashed: boolean }> = {
  vendas: { label: S.evolutionSeriesVendas, color: "#ef4444", dashed: false },
  objetivo: { label: S.evolutionSeriesObjetivo, color: "#7c3aed", dashed: false },
  previsao: { label: S.evolutionSeriesPrevisao, color: "#f59e0b", dashed: true },
  mesPassado: { label: S.evolutionSeriesMesPassado, color: "#94a3b8", dashed: true },
  anoPassado: { label: S.evolutionSeriesAnoPassado, color: "#94a3b8", dashed: true },
};

const SELLER_COLORS = ["#ef4444", "#7c3aed", "#0ea5e9", "#f59e0b", "#16a34a", "#db2777", "#94a3b8"];

export function SalesEvolutionChart({ scope, canDrillDown }: ISalesEvolutionChartProps) {
  const { isLoading, hasGoal, referenceDate, points, sellerSeries, kpis } = useSalesEvolution({
    scope,
  });
  const [visible, setVisible] = useState<Record<SeriesKey, boolean>>({
    vendas: true,
    objetivo: true,
    previsao: true,
    mesPassado: false,
    anoPassado: false,
  });
  const [bySeller, setBySeller] = useState(false);

  const today = referenceDate.getDate();
  const daysInMonth = points.length;
  const empty = !isLoading && points.every((p) => (p.vendas ?? 0) === 0 && p.mesPassado === 0);

  const toggle = (k: SeriesKey) => setVisible((v) => ({ ...v, [k]: !v[k] }));

  return (
    <Card className="flex w-full flex-col gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
            <Icon icon="mdi:chart-areaspline-variant" size={20} className="text-muted-foreground" />
            {S.evolutionTitle}
          </h2>
          <p className="text-xs text-muted-foreground">
            {bySeller ? S.evolutionSubtitleSeller : S.evolutionSubtitle}
          </p>
        </div>
        {canDrillDown && (
          <Button
            variant={bySeller ? "default" : "outline"}
            size="sm"
            onClick={() => setBySeller((v) => !v)}
            className="gap-2"
          >
            <Icon icon="mdi:account-group-outline" size={16} />
            {bySeller ? S.evolutionDrillDownBack : S.evolutionDrillDown}
          </Button>
        )}
      </header>

      {!bySeller && <EvolutionKpis kpis={kpis} hasGoal={hasGoal} isLoading={isLoading} />}

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : empty ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{S.chartEmpty}</p>
      ) : (
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="evolutionVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis
                dataKey="day"
                type="number"
                domain={[1, daysInMonth]}
                ticks={points.map((p) => p.day)}
                interval={0}
                tickLine={false}
                stroke="var(--border)"
                height={36}
                tick={(props) => <DayTick {...props} points={points} />}
              />
              <YAxis
                tickFormatter={(v: number) => formatBRLCompact(v)}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                tickLine={false}
                width={64}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
                labelFormatter={(d: number) => `Dia ${d}`}
                formatter={(value: number, key: string) => {
                  if (bySeller) return [formatBRL(value), key];
                  const meta = SERIES_META[key as SeriesKey];
                  return [formatBRL(value), meta ? meta.label : key];
                }}
              />

              {points
                .filter((p) => p.isWeekend)
                .map((p) => (
                  <ReferenceArea
                    key={`we-${p.day}`}
                    x1={p.day - 0.5}
                    x2={p.day + 0.5}
                    fill="var(--muted)"
                    fillOpacity={0.35}
                  />
                ))}
              <ReferenceLine
                x={today}
                stroke="var(--muted-foreground)"
                strokeWidth={1.4}
                label={{
                  value: S.evolutionToday,
                  position: "insideTopRight",
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />

              {!bySeller ? (
                <>
                  {visible.anoPassado && (
                    <Line
                      type="monotone"
                      dataKey="anoPassado"
                      stroke={SERIES_META.anoPassado.color}
                      strokeWidth={1.5}
                      strokeDasharray="2 3"
                      dot={false}
                      connectNulls
                    />
                  )}
                  {visible.mesPassado && (
                    <Line
                      type="monotone"
                      dataKey="mesPassado"
                      stroke={SERIES_META.mesPassado.color}
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                  {visible.objetivo && (
                    <Line
                      type="linear"
                      dataKey="objetivo"
                      stroke={SERIES_META.objetivo.color}
                      strokeWidth={2.5}
                      dot={false}
                      connectNulls
                    />
                  )}
                  {visible.previsao && (
                    <Line
                      type="monotone"
                      dataKey="previsao"
                      stroke={SERIES_META.previsao.color}
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={false}
                    />
                  )}
                  {visible.vendas && (
                    <Area
                      type="monotone"
                      dataKey="vendas"
                      stroke={SERIES_META.vendas.color}
                      strokeWidth={3}
                      fill="url(#evolutionVendas)"
                      dot={{ r: 3, fill: SERIES_META.vendas.color }}
                      activeDot={{ r: 5 }}
                    />
                  )}
                </>
              ) : (
                <>
                  {visible.objetivo && (
                    <Line
                      type="linear"
                      dataKey="objetivo"
                      stroke={SERIES_META.objetivo.color}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                      connectNulls
                    />
                  )}
                  {sellerSeries.map((s, i) => (
                    <Line
                      key={s.sellerId}
                      type="monotone"
                      dataKey={(_, idx) => s.data[idx]}
                      name={s.sellerName}
                      stroke={SELLER_COLORS[i % SELLER_COLORS.length]}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  ))}
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!bySeller && (
        <div className="flex flex-wrap justify-center gap-2">
          {(Object.keys(SERIES_META) as SeriesKey[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                visible[k]
                  ? "border-border bg-background"
                  : "border-border bg-background opacity-40",
              )}
            >
              <span
                className="inline-block h-0 w-4 rounded"
                style={{
                  borderTopWidth: 3,
                  borderTopStyle: SERIES_META[k].dashed ? "dashed" : "solid",
                  borderTopColor: SERIES_META[k].color,
                }}
              />
              {SERIES_META[k].label}
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

interface IDayTickProps {
  x?: number;
  y?: number;
  payload?: { value: number };
  points: { day: number; weekdayLabel: string; isWeekend: boolean }[];
}

function DayTick({ x = 0, y = 0, payload, points }: IDayTickProps) {
  const p = points.find((pt) => pt.day === payload?.value);
  if (!p) return null;
  const muted = p.isWeekend;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={12}
        textAnchor="middle"
        fontSize={11}
        fontWeight={600}
        fill={muted ? "var(--muted-foreground)" : "var(--foreground)"}
        opacity={muted ? 0.55 : 1}
      >
        {p.day}
      </text>
      <text
        x={0}
        y={0}
        dy={26}
        textAnchor="middle"
        fontSize={10}
        fill="var(--muted-foreground)"
        opacity={muted ? 0.5 : 0.85}
      >
        {p.weekdayLabel}
      </text>
    </g>
  );
}

interface IEvolutionKpisProps {
  kpis: {
    realized: number;
    expectedToday: number;
    target: number;
    projection: number;
    gap: number;
  };
  hasGoal: boolean;
  isLoading: boolean;
}

function EvolutionKpis({ kpis, hasGoal, isLoading }: IEvolutionKpisProps) {
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  const pctTarget =
    hasGoal && kpis.target > 0 ? Math.round((kpis.projection / kpis.target) * 100) : null;
  const below = kpis.gap > 0;
  return (
    <div className="flex flex-wrap gap-2">
      <KpiCell
        label={S.evolutionKpiRealized}
        value={formatBRL(kpis.realized)}
        sub={
          hasGoal ? `${formatBRL(kpis.expectedToday)} ${S.evolutionKpiExpectedToday}` : undefined
        }
      />
      <KpiCell
        label={S.evolutionKpiTarget}
        value={hasGoal ? formatBRL(kpis.target) : S.evolutionNoGoal}
      />
      <KpiCell
        label={S.evolutionKpiProjection}
        value={formatBRL(kpis.projection)}
        sub={pctTarget != null ? `${pctTarget}% ${S.evolutionKpiOfTarget}` : undefined}
        subClass={pctTarget != null && pctTarget >= 100 ? "text-primary" : "text-destructive"}
      />
      {hasGoal && (
        <KpiCell
          label={S.evolutionKpiGap}
          value={`${below ? "-" : "+"}${formatBRL(Math.abs(kpis.gap))}`}
          valueClass={below ? "text-destructive" : "text-primary"}
          sub={below ? S.evolutionKpiBelow : S.evolutionKpiAbove}
        />
      )}
    </div>
  );
}

function KpiCell({
  label,
  value,
  sub,
  valueClass,
  subClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  subClass?: string;
}) {
  return (
    <div className="min-w-[150px] flex-1 rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold text-foreground", valueClass)}>{value}</p>
      {sub && <p className={cn("mt-0.5 text-[11px] text-muted-foreground", subClass)}>{sub}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verificar imports existentes**

Confirmar que existem: `@/components/ui/button` (Button), `@/components/ui/card` (Card), `@/lib/utils` (cn). Rodar:

Run: `bun run build`
Expected: passa. Se `cn` ou `Button` tiverem caminho diferente, corrigir conforme o erro do compilador.

> Nota Recharts: `dataKey` como função `(_, idx) => s.data[idx]` recebe `(entry, index)`. Se o type-check reclamar da assinatura, usar `dataKey={(entry: unknown, idx: number) => s.data[idx] ?? undefined}`.

- [ ] **Step 3: Commit**

```bash
git add src/features/sales-analytics/components/charts/SalesEvolutionChart.tsx
git commit -m "feat(sales): add SalesEvolutionChart component with toggles and drill-down"
```

---

### Task 5: Integrar o chart no topo da aba Visão Geral

**Files:**

- Modify: `src/features/sales-analytics/pages/SalesAnalyticsPage.tsx`

- [ ] **Step 1: Importar o componente**

Adicionar junto aos imports de tabs (após a linha `import { SalesHeader } from "../components/SalesHeader";`):

```ts
import { SalesEvolutionChart } from "../components/charts/SalesEvolutionChart";
```

- [ ] **Step 2: Calcular `canDrillDown` e renderizar no topo do overview**

Logo após `const tab = (filtersCtl.activeTab as TabId) ?? "overview";` adicionar:

```ts
const canDrillDown = userRole === "Owner" || userRole === "Gestor";
```

Depois, no `TabsContent value="overview"`, inserir o chart como primeiro filho, acima de `<SalesOverviewTab ...>`:

```tsx
<TabsContent value="overview" className="focus-visible:outline-none">
  <div className="mb-4">
    <SalesEvolutionChart scope={scope} canDrillDown={canDrillDown} />
  </div>
  <SalesOverviewTab
    analytics={analytics}
    onCategoryFilter={filtersCtl.setCategory}
    onBrandFilter={filtersCtl.setVehicleBrand}
  />
</TabsContent>
```

- [ ] **Step 3: Type-check**

Run: `bun run build`
Expected: passa sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/features/sales-analytics/pages/SalesAnalyticsPage.tsx
git commit -m "feat(sales): mount evolution chart atop the overview tab"
```

---

### Task 6: Verificação manual e ajustes finais

**Files:** (nenhum por padrão; ajustes conforme achados)

- [ ] **Step 1: Subir o dev server e validar visualmente**

Run: `bun run dev`
O usuário valida manualmente em `/app/gestao/vendas` (aba Visão Geral). Conferir:

- Card full-width no topo, antes da linha de KPIs da overview.
- Linhas Vendas (área vermelha até hoje) + Objetivo (roxo) + Previsão (amarelo tracejado a partir de hoje).
- Linha vertical "Hoje" e colunas de fim de semana sombreadas; eixo X com dia + letra do dia.
- Chips ligam/desligam séries; Mês passado / Ano passado começam ocultos.
- Strip de KPIs coerente (Realizado/Meta/Projeção/Gap).
- Botão "Detalhar por vendedor" (apenas Owner/Gestor) alterna para linhas por vendedor e volta.
- Trocar tema claro/escuro: contraste das séries permanece legível.

- [ ] **Step 2: Validar papéis**

Logar como Vendedor: botão de detalhe não aparece; Objetivo usa a meta individual (ou some com aviso se não houver). Logar como Gestor: escopo restrito à loja.

- [ ] **Step 3: Corrigir o que aparecer**

Se houver ajustes (cores, espaçamentos, label "Hoje" cortado, tick sobreposto em meses de 31 dias), editar `SalesEvolutionChart.tsx` e revalidar. Para sobreposição de ticks em telas estreitas, considerar `interval="preserveStartEnd"` no `XAxis` em breakpoint pequeno (opcional).

- [ ] **Step 4: Commit final (se houve ajustes)**

```bash
git add -A src/features/sales-analytics
git commit -m "fix(sales): polish evolution chart after manual review"
```

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura do spec:**

- Posição topo/full-width → Task 5. ✓
- 5 séries com toggle (defaults) → Task 4 (`SERIES_META`, `visible`). ✓
- Eixo dia + dia-da-semana + fim de semana esmaecido/sombreado → Task 4 (`DayTick`, `ReferenceArea`). ✓
- Linha "Hoje" → Task 4 (`ReferenceLine`). ✓
- Objetivo via goals (loja/individual; aviso sem meta) → Task 3 (`targetValue`) + Task 4 (`evolutionNoGoal`). ✓
- Previsão run-rate conectando em hoje → Task 2 (`previsao`). ✓
- Comparativos mês/ano passado → Task 2 + Task 4. ✓
- Strip de KPIs → Task 4 (`EvolutionKpis`). ✓
- Drill-down por vendedor (top 6 + Outros, só Owner/Gestor, toggle in-place) → Task 2 (`buildSellerEvolution`) + Task 4 (`bySeller`) + Task 5 (`canDrillDown`). ✓
- Escopo RBAC reutilizado / sem filtro de período → Task 3 + Task 5. ✓
- Métrica fixa (faturamento), sem persistência de toggles, `RevenueOverTimeChart` mantido → respeitado (nada removido). ✓

**Placeholder scan:** nenhum TBD/TODO; todos os steps com código completo. ✓

**Consistência de tipos:** `IDailyEvolutionPoint`/`ISellerEvolutionSeries`/`IEvolutionKpis` definidos na Task 2 e usados igual nas Tasks 3–4; `useSalesEvolution` retorna exatamente o consumido pelo componente. ✓

**Risco conhecido:** assinatura de `dataKey` como função no Recharts e caminhos de `Button`/`cn` — cobertos por notas de ajuste nas Tasks 4. Sem runner de testes → verificação por `bun run build` + manual (coerente com o projeto).
