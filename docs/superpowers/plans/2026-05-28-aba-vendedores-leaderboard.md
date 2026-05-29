# Aba "Vendedores" (leaderboard + pódio + drawer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma aba dedicada "Vendedores" em `/app/gestao/vendas` com leaderboard + pódio + drawer de detalhe por vendedor, substituindo o antigo "detalhar por vendedor" raso (o toggle do gráfico permanece como atalho).

**Architecture:** Um hook agregador (`useSellerLeaderboard`) lê orders/quotes/sellers/goals/customers via os providers existentes e delega a agregação a uma função pura testável (`buildSellerLeaderboard`). Componentes de apresentação (header com seletor de métrica, pódio, linhas do leaderboard, tabela densa, drawer) consomem o resultado. O orquestrador `SellersTab` controla métrica ativa, toggle de tabela, drawer sincronizado com `?vendedor=<id>` e o modo "minha posição" do Vendedor. A aba opera sobre o **mês corrente** (como o gráfico de evolução), pois meta/atingimento são mensais — o filtro de período não a afeta, apenas a loja/escopo.

**Tech Stack:** React + TypeScript (strict), TanStack Router/Query, Tailwind v4 + shadcn/ui (`Card`, `Sheet`, `Progress`, `Avatar`, `ToggleGroup`), Recharts, Iconify, Bun.

---

## Convenções de verificação (LEIA ANTES DE COMEÇAR)

- **Não há runner de testes** neste projeto (decisão do projeto — ver `CLAUDE.md`). A verificação de cada task é **type-check incremental** + **checagem manual de UI pelo usuário** no fim.
- **Type-check:** rode `bunx tsc --noEmit`. O codebase tem **erros pré-existentes** tolerados pelo `vite build`. O critério é: **nenhum erro novo nos arquivos criados/alterados por esta task**. Para isolar, filtre pelo caminho do arquivo, ex.:
  `bunx tsc --noEmit 2>&1 | grep "features/sales-analytics/hooks/useSellerLeaderboard"` → deve sair **vazio**.
- **Não usar `git add -A` / `git add .`** — adicionar arquivos por nome (regra do projeto). Não commitar a screenshot solta em `docs/images/`.
- **Não abrir browser/preview** para validar — o usuário testa a UI manualmente (apenas peça F5 ao final).
- Strings de UI em **pt-BR com acentos**; código em inglês; interfaces de domínio prefixadas com `I`.
- Consumir **apenas tokens semânticos** (`text-success`, `text-warning`, `text-destructive`, `text-primary`, `bg-*/10`, `bg-muted`, `border-border`, etc.). Nunca hex em componente (exceto tons de medalha ouro/prata/bronze, restritos ao elemento da medalha).

---

## File Structure

**Criar:**
- `src/features/sales-analytics/utils/sellerLeaderboard.ts` — tipos + função pura `buildSellerLeaderboard` (agregação/ranking) e helpers `attainmentBand`, `rankMetricValue`.
- `src/features/sales-analytics/hooks/useSellerLeaderboard.ts` — hook que faz as queries e chama a função pura.
- `src/features/sales-analytics/components/sellers/SellersSummaryHeader.tsx` — mini-cards de resumo + seletor de métrica + toggle "Ver como tabela".
- `src/features/sales-analytics/components/sellers/SellerPodium.tsx` — top 3.
- `src/features/sales-analytics/components/sellers/SellerLeaderboardRow.tsx` — linha clicável do leaderboard.
- `src/features/sales-analytics/components/sellers/SellerMiniChart.tsx` — mini gráfico cumulativo individual (drawer).
- `src/features/sales-analytics/components/sellers/SellerDetailDrawer.tsx` — `Sheet` lateral com todas as métricas.
- `src/features/sales-analytics/components/sellers/SellersTable.tsx` — visão densa premium (toggle).
- `src/features/sales-analytics/components/tabs/SellersTab.tsx` — orquestrador da aba.

**Modificar:**
- `src/features/sales-analytics/i18n/pt-BR.ts` — novas strings (bloco "Sellers tab").
- `src/features/sales-analytics/pages/SalesAnalyticsPage.tsx` — registrar a aba "Vendedores" (condicional por RBAC), `TabId`, `TabsContent`.
- `src/features/sales-analytics/hooks/useSalesFilters.ts` — aceitar/validar o search param `vendedor` para deep-link do drawer (já existe `vendedor` como filtro; ver Task 8 — reutilizamos, sem novo param).

---

## Task 1: Strings de UI (i18n)

**Files:**
- Modify: `src/features/sales-analytics/i18n/pt-BR.ts`

- [ ] **Step 1: Adicionar bloco de strings da aba Vendedores**

No objeto `SALES_ANALYTICS_STRINGS`, logo **após** a linha `tabFunnel: "Funil",` (linha ~13), adicionar a chave da nova aba:

```ts
  tabSellers: "Vendedores",
```

E **antes** do bloco `// Access` (linha ~145), inserir:

```ts
  // Sellers tab (leaderboard)
  sellersTitle: "Ranking de vendedores",
  sellersSubtitle: "Resultado e atingimento de meta de cada vendedor — mês atual",
  sellersSummarySellers: "Vendedores",
  sellersSummaryRevenue: "Faturamento",
  sellersSummaryAttainment: "Atingimento médio",
  sellersRankBy: "Ranquear por",
  sellersMetricRevenue: "Valor vendido",
  sellersMetricAttainment: "% da meta",
  sellersMetricOrders: "Nº de pedidos",
  sellersMetricTicket: "Ticket médio",
  sellersViewTable: "Ver como tabela",
  sellersViewCards: "Ver como ranking",
  sellersPodiumTitle: "Pódio do mês",
  sellersColRank: "#",
  sellersColSeller: "Vendedor",
  sellersColAttainment: "Meta",
  sellersColRevenue: "Vendido",
  sellersColOrders: "Pedidos",
  sellersColTicket: "Ticket médio",
  sellersColProjection: "Previsão",
  sellersColForecast: "Prev. atingimento",
  sellersColCustomers: "Clientes",
  sellersColPositived: "Positivados",
  sellersColQuotes: "Orç. abertos",
  sellersTotalLabel: "vendedores",
  sellersDrawerPosition: "lugar",
  sellersDrawerOfTarget: "da meta",
  sellersDrawerTarget: "Meta",
  sellersDrawerNoTarget: "Sem meta no mês",
  sellersDrawerOpenQuotes: "Orçamentos em aberto",
  sellersDrawerChartLegend: "— vendas acumuladas · - - meta do mês",
  sellersDrawerViewProfile: "Ver vendas deste vendedor",
  sellersTrendVsLastMonth: "vs mês anterior",
  sellersEmpty: "Nenhuma venda de vendedores no período",
  sellersMyPosition: "Sua posição no ranking",
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "sales-analytics/i18n/pt-BR"`
Expected: saída **vazia** (sem erros novos).

- [ ] **Step 3: Commit**

```bash
git add src/features/sales-analytics/i18n/pt-BR.ts
git commit -m "feat(sales): add i18n strings for Sellers tab"
```

---

## Task 2: Função pura de agregação e helpers

**Files:**
- Create: `src/features/sales-analytics/utils/sellerLeaderboard.ts`

- [ ] **Step 1: Criar o arquivo com tipos, helpers e a função pura**

```ts
import type { ID, IOrder, IQuote, ISeller } from "@/shared/types";
import type { TrendDirection } from "@/features/manager-dashboard/utils/kpiMath";
import { computeTrend } from "@/features/manager-dashboard/utils/kpiMath";

/** Metric the leaderboard is sorted by (and shown as primary value). */
export type SellerRankMetric = "revenue" | "attainmentPct" | "orderCount" | "avgTicket";

/** Visual band for goal attainment (drives token color + redundant icon). */
export type AttainmentBand = "below" | "warning" | "success" | "none";

export interface ISellerLeaderboardRow {
  rank: number;
  sellerId: ID;
  sellerName: string;
  revenue: number;
  orderCount: number;
  avgTicket: number;
  /** Monthly individual revenue target, or null when none. */
  target: number | null;
  /** realized / target * 100; null when no target. */
  attainmentPct: number | null;
  /** Run-rate projection for month end. */
  projection: number;
  /** projection / target * 100; null when no target. */
  attainmentForecastPct: number | null;
  trend: TrendDirection;
  /** Percent change vs previous month (sign preserved); null when not comparable. */
  trendPct: number | null;
  /** Distinct customers assigned to this seller (carteira). */
  customerCount: number;
  /** Distinct customers with a paid order this month (positivados). */
  positivedCustomers: number;
  /** Count of open quotes (status "enviado"). */
  quoteCount: number;
  /** Sum of open quotes' total. */
  openQuotesValue: number;
  /** Cumulative paid revenue per day-of-month, null after today (sparkline/chart). */
  dailySeries: (number | null)[];
}

export interface ISellerLeaderboardSummary {
  sellerCount: number;
  totalRevenue: number;
  /** Average attainment across sellers that have a target; null when none. */
  avgAttainmentPct: number | null;
}

export interface IBuildSellerLeaderboardInput {
  referenceDate: Date;
  sellers: ISeller[];
  /** Paid orders of the current month (whole month range). */
  currentMonthOrders: IOrder[];
  /** Paid orders of the previous month (for trend). */
  previousMonthOrders: IOrder[];
  /** Open quotes (already filtered to status "enviado"). */
  openQuotes: IQuote[];
  /** sellerId -> count of customers in this seller's wallet. */
  customerCountBySeller: Map<ID, number>;
  /** sellerId -> monthly revenue target; absent when no goal. */
  targetBySeller: Map<ID, number>;
}

export interface IBuildSellerLeaderboardResult {
  rows: ISellerLeaderboardRow[];
  summary: ISellerLeaderboardSummary;
  daysInMonth: number;
}

/** Classify an attainment percentage into a visual band. */
export function attainmentBand(attainmentPct: number | null): AttainmentBand {
  if (attainmentPct == null) return "none";
  if (attainmentPct >= 100) return "success";
  if (attainmentPct >= 70) return "warning";
  return "below";
}

/** The comparable numeric value for the active ranking metric. */
export function rankMetricValue(row: ISellerLeaderboardRow, metric: SellerRankMetric): number {
  switch (metric) {
    case "revenue":
      return row.revenue;
    case "attainmentPct":
      return row.attainmentPct ?? -1;
    case "orderCount":
      return row.orderCount;
    case "avgTicket":
      return row.avgTicket;
    default:
      return row.revenue;
  }
}

const dayOf = (o: IOrder): number => new Date(o.paidAt ?? o.createdAt).getDate();

/** Build per-seller aggregated rows + summary, sorted by `metric`, ranks assigned. */
export function buildSellerLeaderboard(
  input: IBuildSellerLeaderboardInput,
  metric: SellerRankMetric,
): IBuildSellerLeaderboardResult {
  const {
    referenceDate,
    sellers,
    currentMonthOrders,
    previousMonthOrders,
    openQuotes,
    customerCountBySeller,
    targetBySeller,
  } = input;

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);

  // Per-seller accumulators for the current month.
  const revenue = new Map<ID, number>();
  const orderCount = new Map<ID, number>();
  const perDay = new Map<ID, Map<number, number>>();
  const buyers = new Map<ID, Set<ID>>();
  for (const o of currentMonthOrders) {
    if (o.paymentStatus !== "pago") continue;
    revenue.set(o.sellerId, (revenue.get(o.sellerId) ?? 0) + o.total);
    orderCount.set(o.sellerId, (orderCount.get(o.sellerId) ?? 0) + 1);
    const dmap = perDay.get(o.sellerId) ?? new Map<number, number>();
    const d = dayOf(o);
    dmap.set(d, (dmap.get(d) ?? 0) + o.total);
    perDay.set(o.sellerId, dmap);
    const set = buyers.get(o.sellerId) ?? new Set<ID>();
    set.add(o.customerId);
    buyers.set(o.sellerId, set);
  }

  const prevRevenue = new Map<ID, number>();
  for (const o of previousMonthOrders) {
    if (o.paymentStatus !== "pago") continue;
    prevRevenue.set(o.sellerId, (prevRevenue.get(o.sellerId) ?? 0) + o.total);
  }

  const openCount = new Map<ID, number>();
  const openValue = new Map<ID, number>();
  for (const q of openQuotes) {
    openCount.set(q.sellerId, (openCount.get(q.sellerId) ?? 0) + 1);
    openValue.set(q.sellerId, (openValue.get(q.sellerId) ?? 0) + q.total);
  }

  const cumulativeSeries = (dmap: Map<number, number> | undefined): (number | null)[] => {
    const out: (number | null)[] = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      acc += dmap?.get(d) ?? 0;
      out.push(d <= today ? acc : null);
    }
    return out;
  };

  const rows: ISellerLeaderboardRow[] = sellers.map((seller) => {
    const rev = revenue.get(seller.id) ?? 0;
    const oc = orderCount.get(seller.id) ?? 0;
    const target = targetBySeller.get(seller.id) ?? null;
    const runRate = today > 0 ? rev / today : 0;
    const projection = Math.round(runRate * daysInMonth);
    const trendInfo = computeTrend(rev, prevRevenue.get(seller.id) ?? 0, false);
    return {
      rank: 0,
      sellerId: seller.id,
      sellerName: seller.fullName,
      revenue: rev,
      orderCount: oc,
      avgTicket: oc > 0 ? rev / oc : 0,
      target,
      attainmentPct: target && target > 0 ? (rev / target) * 100 : null,
      projection,
      attainmentForecastPct: target && target > 0 ? (projection / target) * 100 : null,
      trend: trendInfo.direction,
      trendPct: trendInfo.changePct,
      customerCount: customerCountBySeller.get(seller.id) ?? 0,
      positivedCustomers: buyers.get(seller.id)?.size ?? 0,
      quoteCount: openCount.get(seller.id) ?? 0,
      openQuotesValue: openValue.get(seller.id) ?? 0,
      dailySeries: cumulativeSeries(perDay.get(seller.id)),
    };
  });

  rows.sort((a, b) => rankMetricValue(b, metric) - rankMetricValue(a, metric));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  const withTarget = rows.filter((r) => r.attainmentPct != null);
  const summary: ISellerLeaderboardSummary = {
    sellerCount: rows.length,
    totalRevenue: rows.reduce((acc, r) => acc + r.revenue, 0),
    avgAttainmentPct:
      withTarget.length > 0
        ? withTarget.reduce((acc, r) => acc + (r.attainmentPct ?? 0), 0) / withTarget.length
        : null,
  };

  return { rows, summary, daysInMonth };
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "sales-analytics/utils/sellerLeaderboard"`
Expected: saída **vazia**.

- [ ] **Step 3: Commit**

```bash
git add src/features/sales-analytics/utils/sellerLeaderboard.ts
git commit -m "feat(sales): add seller leaderboard aggregation util"
```

---

## Task 3: Hook `useSellerLeaderboard`

**Files:**
- Create: `src/features/sales-analytics/hooks/useSellerLeaderboard.ts`

- [ ] **Step 1: Criar o hook**

```ts
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import {
  useCustomersProvider,
  useGoalsProvider,
  useOrdersProvider,
  useQuotesProvider,
  useSellersProvider,
} from "@/providers/data";
import {
  buildSellerLeaderboard,
  type IBuildSellerLeaderboardResult,
  type SellerRankMetric,
} from "../utils/sellerLeaderboard";

const STALE_MS = 30_000;

export interface IUseSellerLeaderboardParams {
  /** Store scope; leaderboard is always computed store-wide (never seller-locked). */
  storeId?: ID;
  metric: SellerRankMetric;
}

export interface IUseSellerLeaderboardResult extends IBuildSellerLeaderboardResult {
  isLoading: boolean;
  hasError: boolean;
  referenceDate: Date;
}

function monthRangeIso(year: number, month: number): { sinceIso: string; untilIso: string } {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { sinceIso: start.toISOString(), untilIso: end.toISOString() };
}

export function useSellerLeaderboard(
  params: IUseSellerLeaderboardParams,
): IUseSellerLeaderboardResult {
  const { storeId, metric } = params;
  const ordersProvider = useOrdersProvider();
  const sellersProvider = useSellersProvider();
  const quotesProvider = useQuotesProvider();
  const goalsProvider = useGoalsProvider();
  const customersProvider = useCustomersProvider();

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();
  const month = now.getMonth();
  const cur = useMemo(() => monthRangeIso(year, month), [year, month]);
  const prev = useMemo(() => monthRangeIso(year, month - 1), [year, month]);

  const queries = useQueries({
    queries: [
      {
        queryKey: ["seller-leaderboard", "orders-cur", storeId, cur.sinceIso],
        queryFn: () =>
          ordersProvider.list({
            storeId,
            paymentStatus: "pago",
            since: cur.sinceIso,
            until: cur.untilIso,
            pageSize: 2000,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "orders-prev", storeId, prev.sinceIso],
        queryFn: () =>
          ordersProvider.list({
            storeId,
            paymentStatus: "pago",
            since: prev.sinceIso,
            until: prev.untilIso,
            pageSize: 2000,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "sellers", storeId],
        queryFn: () => sellersProvider.list({ storeId }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "quotes-open", storeId],
        queryFn: () => quotesProvider.list({ storeId, status: "enviado", pageSize: 2000 }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "goals", storeId],
        queryFn: () => goalsProvider.list({ storeId, pageSize: 500 }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["seller-leaderboard", "customers", storeId],
        queryFn: () => customersProvider.list({ storeId, pageSize: 2000 }),
        staleTime: STALE_MS,
      },
    ],
  });

  const [ordersCur, ordersPrev, sellersQ, quotesQ, goalsQ, customersQ] = queries;
  const isLoading = queries.some((q) => q.isLoading);
  const hasError = queries.some((q) => q.isError);

  const targetBySeller = useMemo(() => {
    const map = new Map<ID, number>();
    for (const goal of goalsQ.data?.data ?? []) {
      if (goal.level !== "individual") continue;
      if (goal.metric !== "revenue") continue;
      if (goal.period.type !== "monthly") continue;
      const start = new Date(goal.period.start);
      if (start.getMonth() !== month || start.getFullYear() !== year) continue;
      if (!goal.targetId) continue;
      map.set(goal.targetId, goal.targetValue);
    }
    return map;
  }, [goalsQ.data, month, year]);

  const customerCountBySeller = useMemo(() => {
    const map = new Map<ID, number>();
    for (const c of customersQ.data?.data ?? []) {
      if (!c.sellerId) continue;
      map.set(c.sellerId, (map.get(c.sellerId) ?? 0) + 1);
    }
    return map;
  }, [customersQ.data]);

  const result = useMemo(
    () =>
      buildSellerLeaderboard(
        {
          referenceDate: now,
          sellers: sellersQ.data ?? [],
          currentMonthOrders: ordersCur.data?.data ?? [],
          previousMonthOrders: ordersPrev.data?.data ?? [],
          openQuotes: quotesQ.data?.data ?? [],
          customerCountBySeller,
          targetBySeller,
        },
        metric,
      ),
    [now, sellersQ.data, ordersCur.data, ordersPrev.data, quotesQ.data, customerCountBySeller, targetBySeller, metric],
  );

  return { ...result, isLoading, hasError, referenceDate: now };
}
```

> **Verificado (não mudar):** `sellersProvider.list(params?)` retorna `Promise<ISeller[]>` (sem paginação) → `sellers: sellersQ.data ?? []` está **correto**. `customersProvider.list` retorna `IPaginatedResult<ICustomer>` → `customersQ.data?.data ?? []` está **correto**. `ICustomer` expõe `sellerId: ID` (`src/shared/types/customer.ts:43`) → `c.sellerId` está **correto**. Não há ajustes a fazer aqui.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "sales-analytics/hooks/useSellerLeaderboard"`
Expected: saída **vazia**.

- [ ] **Step 4: Commit**

```bash
git add src/features/sales-analytics/hooks/useSellerLeaderboard.ts
git commit -m "feat(sales): add useSellerLeaderboard hook"
```

---

## Task 4: Header de resumo + linha do leaderboard + pódio

**Files:**
- Create: `src/features/sales-analytics/components/sellers/SellersSummaryHeader.tsx`
- Create: `src/features/sales-analytics/components/sellers/SellerLeaderboardRow.tsx`
- Create: `src/features/sales-analytics/components/sellers/SellerPodium.tsx`

- [ ] **Step 1: Criar `SellersSummaryHeader.tsx`**

```tsx
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import type { SellerRankMetric } from "../../utils/sellerLeaderboard";
import type { ISellerLeaderboardSummary } from "../../utils/sellerLeaderboard";

const METRICS: { value: SellerRankMetric; label: string }[] = [
  { value: "revenue", label: S.sellersMetricRevenue },
  { value: "attainmentPct", label: S.sellersMetricAttainment },
  { value: "orderCount", label: S.sellersMetricOrders },
  { value: "avgTicket", label: S.sellersMetricTicket },
];

export interface ISellersSummaryHeaderProps {
  summary: ISellerLeaderboardSummary;
  metric: SellerRankMetric;
  onMetric: (m: SellerRankMetric) => void;
  showTable: boolean;
  onToggleTable: () => void;
}

export function SellersSummaryHeader({
  summary,
  metric,
  onMetric,
  showTable,
  onToggleTable,
}: ISellersSummaryHeaderProps) {
  const fmtPct = (n: number | null) =>
    n == null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Stat label={S.sellersSummarySellers} value={String(summary.sellerCount)} />
          <Stat label={S.sellersSummaryRevenue} value={formatBRLCompact(summary.totalRevenue)} />
          <Stat label={S.sellersSummaryAttainment} value={fmtPct(summary.avgAttainmentPct)} />
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={onToggleTable}>
          <Icon icon={showTable ? "mdi:view-agenda-outline" : "mdi:table"} size={16} />
          {showTable ? S.sellersViewCards : S.sellersViewTable}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {S.sellersRankBy}
        </span>
        <ToggleGroup
          type="single"
          value={metric}
          onValueChange={(v) => v && onMetric(v as SellerRankMetric)}
          className="flex-wrap justify-start"
        >
          {METRICS.map((m) => (
            <ToggleGroupItem key={m.value} value={m.value} size="sm" className="text-xs">
              {m.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="min-w-[120px] flex-1 gap-0 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}
```

> **Nota:** Confirme a API do `ToggleGroup`/`ToggleGroupItem` em `src/components/ui/toggle-group.tsx` (props `type`, `value`, `onValueChange`, `size`). Se `size` não existir no item, remova-o e use `className="px-3 text-xs"`.

- [ ] **Step 2: Criar `SellerLeaderboardRow.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { formatBRLCompact } from "@/shared/utils/format";
import { attainmentBand, type ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";

const BAND_BAR: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  below: "bg-destructive",
  none: "bg-muted-foreground/40",
};
const BAND_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  below: "text-destructive",
  none: "text-muted-foreground",
};

export interface ISellerLeaderboardRowProps {
  row: ISellerLeaderboardRow;
  onSelect: (sellerId: string) => void;
  selected?: boolean;
}

export function SellerLeaderboardRow({ row, onSelect, selected }: ISellerLeaderboardRowProps) {
  const band = attainmentBand(row.attainmentPct);
  const pct = row.attainmentPct;
  const trendIcon =
    row.trend === "up" ? "mdi:arrow-up" : row.trend === "down" ? "mdi:arrow-down" : "mdi:minus";
  const trendClass =
    row.trend === "up" ? "text-success" : row.trend === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <button
      type="button"
      onClick={() => onSelect(row.sellerId)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
        selected && "outline outline-2 outline-primary/60 bg-muted/40",
      )}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
        {row.rank}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {row.sellerName}
      </span>
      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block">
        <span
          className={cn("block h-full rounded-full", BAND_BAR[band])}
          style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }}
        />
      </span>
      <span className={cn("w-12 text-right text-xs font-bold tabular-nums", BAND_TEXT[band])}>
        {pct == null ? "—" : `${Math.round(pct)}%`}
      </span>
      <span className="w-20 text-right text-sm font-bold tabular-nums text-foreground">
        {formatBRLCompact(row.revenue)}
      </span>
      <Icon icon={trendIcon} size={16} className={cn("shrink-0", trendClass)} />
      <Icon icon="mdi:chevron-right" size={18} className="shrink-0 text-muted-foreground/50" />
    </button>
  );
}
```

- [ ] **Step 3: Criar `SellerPodium.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import type { ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";

// Medal tones are universal semantics — fixed colors are intentional here.
const MEDALS = [
  { grad: "from-amber-400 to-amber-600", icon: "mdi:medal", order: "order-2", h: "pt-5" },
  { grad: "from-slate-300 to-slate-500", icon: "mdi:medal-outline", order: "order-1", h: "" },
  { grad: "from-amber-700 to-amber-900", icon: "mdi:medal-outline", order: "order-3", h: "" },
];

export interface ISellerPodiumProps {
  top3: ISellerLeaderboardRow[];
  onSelect: (sellerId: string) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function SellerPodium({ top3, onSelect }: ISellerPodiumProps) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {S.sellersPodiumTitle}
      </p>
      <div className="flex items-end justify-center gap-3">
        {top3.map((row, i) => {
          const m = MEDALS[i]!;
          return (
            <button
              key={row.sellerId}
              type="button"
              onClick={() => onSelect(row.sellerId)}
              className={cn(
                "flex flex-1 flex-col items-center rounded-2xl bg-gradient-to-b p-3 text-center text-white transition-transform hover:-translate-y-0.5",
                m.grad,
                m.order,
                m.h,
              )}
            >
              <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-white/25 text-xs font-extrabold">
                {initials(row.sellerName)}
              </span>
              <Icon icon={m.icon} size={18} className="opacity-90" />
              <span className="mt-1 truncate text-xs font-bold">{row.sellerName}</span>
              <span className="text-sm font-extrabold tabular-nums">
                {formatBRLCompact(row.revenue)}
              </span>
              {row.attainmentPct != null && (
                <span className="text-[10px] opacity-90">
                  {Math.round(row.attainmentPct)}% {S.sellersDrawerOfTarget}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "components/sellers/Seller"`
Expected: saída **vazia** (ajuste props do ToggleGroup se acusar erro).

- [ ] **Step 5: Commit**

```bash
git add src/features/sales-analytics/components/sellers/SellersSummaryHeader.tsx src/features/sales-analytics/components/sellers/SellerLeaderboardRow.tsx src/features/sales-analytics/components/sellers/SellerPodium.tsx
git commit -m "feat(sales): add sellers summary header, leaderboard row and podium"
```

---

## Task 5: Mini gráfico + drawer de detalhe

**Files:**
- Create: `src/features/sales-analytics/components/sellers/SellerMiniChart.tsx`
- Create: `src/features/sales-analytics/components/sellers/SellerDetailDrawer.tsx`

- [ ] **Step 1: Criar `SellerMiniChart.tsx`**

```tsx
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, YAxis } from "recharts";

export interface ISellerMiniChartProps {
  /** Cumulative paid revenue per day-of-month (null after today). */
  dailySeries: (number | null)[];
  /** Monthly target for the reference line; null hides it. */
  target: number | null;
}

export function SellerMiniChart({ dailySeries, target }: ISellerMiniChartProps) {
  const data = dailySeries.map((v, i) => ({ day: i + 1, vendas: v }));
  return (
    <div className="h-28 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="sellerMiniArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[0, "dataMax"]} />
          {target != null && target > 0 && (
            <ReferenceLine y={target} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeWidth={1.2} />
          )}
          <Area
            type="monotone"
            dataKey="vendas"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#sellerMiniArea)"
            connectNulls
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Criar `SellerDetailDrawer.tsx`**

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { attainmentBand, type ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";
import { SellerMiniChart } from "./SellerMiniChart";

export interface ISellerDetailDrawerProps {
  row: ISellerLeaderboardRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const BAND_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  below: "text-destructive",
  none: "text-muted-foreground",
};

export function SellerDetailDrawer({ row, open, onOpenChange }: ISellerDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-extrabold text-primary">
                  {row.rank}º
                </span>
                <span className="flex flex-col">
                  <span className="text-base">{row.sellerName}</span>
                  <span className={cn("text-xs font-medium", BAND_TEXT[attainmentBand(row.attainmentPct)])}>
                    {row.attainmentPct == null
                      ? S.sellersDrawerNoTarget
                      : `${Math.round(row.attainmentPct)}% ${S.sellersDrawerOfTarget}`}
                  </span>
                </span>
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-6">
              <SellerMiniChart dailySeries={row.dailySeries} target={row.target} />
              <p className="-mt-2 text-center text-[10px] text-muted-foreground">
                {S.sellersDrawerChartLegend}
              </p>

              <dl className="flex flex-col">
                <Metric label={S.sellersColRevenue} value={formatBRL(row.revenue)} />
                <Metric label={S.sellersDrawerTarget} value={row.target == null ? "—" : formatBRL(row.target)} />
                <Metric label={S.sellersColProjection} value={formatBRL(row.projection)} />
                <Metric label={S.sellersColOrders} value={String(row.orderCount)} />
                <Metric label={S.sellersColTicket} value={formatBRL(row.avgTicket)} />
                <Metric label={S.sellersColPositived} value={String(row.positivedCustomers)} />
                <Metric label={S.sellersColCustomers} value={String(row.customerCount)} />
                <Metric
                  label={S.sellersDrawerOpenQuotes}
                  value={`${row.quoteCount} · ${formatBRL(row.openQuotesValue)}`}
                  last
                />
              </dl>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between py-2 text-sm",
        !last && "border-b border-dashed border-border",
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-bold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
```

> **Nota:** Confirme os exports de `src/components/ui/sheet.tsx` (`Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`). Se a API expõe `side`, o default (`right`) já serve.

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "components/sellers/Seller\(MiniChart\|DetailDrawer\)"`
Expected: saída **vazia**.

- [ ] **Step 4: Commit**

```bash
git add src/features/sales-analytics/components/sellers/SellerMiniChart.tsx src/features/sales-analytics/components/sellers/SellerDetailDrawer.tsx
git commit -m "feat(sales): add seller detail drawer with individual mini chart"
```

---

## Task 6: Tabela densa premium (visão alternativa)

**Files:**
- Create: `src/features/sales-analytics/components/sellers/SellersTable.tsx`

- [ ] **Step 1: Criar `SellersTable.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { attainmentBand, type ISellerLeaderboardRow } from "../../utils/sellerLeaderboard";

const BAND_BAR: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  below: "bg-destructive",
  none: "bg-muted-foreground/40",
};

export interface ISellersTableProps {
  rows: ISellerLeaderboardRow[];
  onSelect: (sellerId: string) => void;
}

export function SellersTable({ rows, onSelect }: ISellersTableProps) {
  const total = rows.reduce(
    (acc, r) => {
      acc.revenue += r.revenue;
      acc.orders += r.orderCount;
      acc.quotes += r.quoteCount;
      return acc;
    },
    { revenue: 0, orders: 0, quotes: 0 },
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            <Th className="text-left">{S.sellersColRank}</Th>
            <Th className="text-left">{S.sellersColSeller}</Th>
            <Th>{S.sellersColAttainment}</Th>
            <Th>{S.sellersColRevenue}</Th>
            <Th>{S.sellersColOrders}</Th>
            <Th>{S.sellersColTicket}</Th>
            <Th>{S.sellersColProjection}</Th>
            <Th>{S.sellersColPositived}</Th>
            <Th>{S.sellersColQuotes}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const band = attainmentBand(r.attainmentPct);
            return (
              <tr
                key={r.sellerId}
                onClick={() => onSelect(r.sellerId)}
                className="cursor-pointer border-t border-border/60 hover:bg-muted/50"
              >
                <Td className="text-left font-bold text-muted-foreground">{r.rank}</Td>
                <Td className="text-left font-semibold text-foreground">{r.sellerName}</Td>
                <Td>
                  <span className="flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted md:block">
                      <span
                        className={cn("block h-full", BAND_BAR[band])}
                        style={{ width: `${Math.min(100, Math.max(0, r.attainmentPct ?? 0))}%` }}
                      />
                    </span>
                    {r.attainmentPct == null ? "—" : `${Math.round(r.attainmentPct)}%`}
                  </span>
                </Td>
                <Td className="font-bold">{formatBRLCompact(r.revenue)}</Td>
                <Td>{r.orderCount}</Td>
                <Td>{formatBRL(r.avgTicket)}</Td>
                <Td>{formatBRLCompact(r.projection)}</Td>
                <Td>{r.positivedCustomers}</Td>
                <Td>{r.quoteCount}</Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-muted/60 text-sm font-extrabold">
            <Td className="text-left" />
            <Td className="text-left">
              {rows.length} {S.sellersTotalLabel}
            </Td>
            <Td>—</Td>
            <Td>{formatBRLCompact(total.revenue)}</Td>
            <Td>{total.orders}</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>{total.quotes}</Td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2 text-right font-semibold", className)}>{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 text-right tabular-nums", className)}>{children}</td>;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "components/sellers/SellersTable"`
Expected: saída **vazia**.

- [ ] **Step 3: Commit**

```bash
git add src/features/sales-analytics/components/sellers/SellersTable.tsx
git commit -m "feat(sales): add dense premium sellers table view"
```

---

## Task 7: Orquestrador `SellersTab`

**Files:**
- Create: `src/features/sales-analytics/components/tabs/SellersTab.tsx`

- [ ] **Step 1: Criar `SellersTab.tsx`**

```tsx
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import { useSellerLeaderboard } from "../../hooks/useSellerLeaderboard";
import type { SellerRankMetric } from "../../utils/sellerLeaderboard";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";
import { SellersSummaryHeader } from "../sellers/SellersSummaryHeader";
import { SellerPodium } from "../sellers/SellerPodium";
import { SellerLeaderboardRow } from "../sellers/SellerLeaderboardRow";
import { SellersTable } from "../sellers/SellersTable";
import { SellerDetailDrawer } from "../sellers/SellerDetailDrawer";

export interface ISellersTabProps {
  storeId?: ID;
  /** When set, the viewer is a Vendedor — only their own row is shown (rank preserved). */
  viewerSellerId?: ID;
  /** Selected seller for the drawer (deep-link via ?vendedor=). */
  selectedSellerId?: string;
  onSelectSeller: (sellerId: string | undefined) => void;
}

export function SellersTab({
  storeId,
  viewerSellerId,
  selectedSellerId,
  onSelectSeller,
}: ISellersTabProps) {
  const [metric, setMetric] = useState<SellerRankMetric>("revenue");
  const [showTable, setShowTable] = useState(false);
  const { rows, summary, isLoading } = useSellerLeaderboard({ storeId, metric });

  const visibleRows = useMemo(
    () => (viewerSellerId ? rows.filter((r) => r.sellerId === viewerSellerId) : rows),
    [rows, viewerSellerId],
  );

  const showPodium = !viewerSellerId && visibleRows.length >= 4;
  const top3 = showPodium ? visibleRows.slice(0, 3) : [];
  const listRows = showPodium ? visibleRows.slice(3) : visibleRows;

  const selectedRow = useMemo(
    () => rows.find((r) => r.sellerId === selectedSellerId) ?? null,
    [rows, selectedSellerId],
  );

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </Card>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-12 text-center">
        <Icon icon="mdi:trophy-broken" size={40} className="text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{S.sellersEmpty}</p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5 p-5">
      {viewerSellerId ? (
        <p className="text-sm font-semibold text-muted-foreground">{S.sellersMyPosition}</p>
      ) : (
        <SellersSummaryHeader
          summary={summary}
          metric={metric}
          onMetric={setMetric}
          showTable={showTable}
          onToggleTable={() => setShowTable((v) => !v)}
        />
      )}

      {showTable && !viewerSellerId ? (
        <SellersTable rows={visibleRows} onSelect={(id) => onSelectSeller(id)} />
      ) : (
        <div className="flex flex-col gap-4">
          {showPodium && <SellerPodium top3={top3} onSelect={(id) => onSelectSeller(id)} />}
          <div className="flex flex-col gap-2">
            {listRows.map((row) => (
              <SellerLeaderboardRow
                key={row.sellerId}
                row={row}
                selected={row.sellerId === selectedSellerId}
                onSelect={(id) => onSelectSeller(id)}
              />
            ))}
          </div>
        </div>
      )}

      <SellerDetailDrawer
        row={selectedRow}
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) onSelectSeller(undefined);
        }}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "components/tabs/SellersTab"`
Expected: saída **vazia**.

- [ ] **Step 3: Commit**

```bash
git add src/features/sales-analytics/components/tabs/SellersTab.tsx
git commit -m "feat(sales): add SellersTab orchestrator (podium + leaderboard + table + drawer)"
```

---

## Task 8: Integrar na página de Vendas (aba + RBAC + deep-link)

**Files:**
- Modify: `src/features/sales-analytics/pages/SalesAnalyticsPage.tsx`

- [ ] **Step 1: Importar `SellersTab` e ampliar `TabId`**

Em `src/features/sales-analytics/pages/SalesAnalyticsPage.tsx`, adicionar o import (após a linha que importa `SalesOverviewTab`, ~linha 13):

```tsx
import { SellersTab } from "../components/tabs/SellersTab";
```

Trocar a definição de `TabId` (linha 19):

```tsx
type TabId = "overview" | "sellers" | "products" | "customers" | "funnel";
```

- [ ] **Step 2: Registrar a aba condicionalmente por RBAC**

Substituir a const `TAB_DEFS` (linhas 21-26) por uma função que recebe o papel. A aba "Vendedores" aparece para `Owner`/`Gestor`/`Vendedor` (Vendedor vê só a própria posição); some para `Financeiro`:

```tsx
function buildTabDefs(canSeeSellers: boolean): { id: TabId; label: string; icon: string }[] {
  const base: { id: TabId; label: string; icon: string }[] = [
    { id: "overview", label: S.tabOverview, icon: "mdi:view-dashboard-outline" },
  ];
  if (canSeeSellers) {
    base.push({ id: "sellers", label: S.tabSellers, icon: "mdi:trophy-outline" });
  }
  base.push(
    { id: "products", label: S.tabProducts, icon: "mdi:package-variant-closed" },
    { id: "customers", label: S.tabCustomers, icon: "mdi:account-group-outline" },
    { id: "funnel", label: S.tabFunnel, icon: "mdi:filter-variant" },
  );
  return base;
}
```

- [ ] **Step 3: Derivar visibilidade e papel do viewer no corpo do componente**

Logo após `const canDrillDown = userRole === "Owner" || userRole === "Gestor";` (linha ~103), adicionar:

```tsx
  const canSeeSellers =
    userRole === "Owner" || userRole === "Gestor" || userRole === "Vendedor";
  const sellersViewerId = userRole === "Vendedor" ? currentUser?.sellerId : undefined;
  const tabDefs = buildTabDefs(canSeeSellers);
  const selectedSellerParam =
    typeof filtersCtl.filters.seller === "string" && filtersCtl.filters.seller !== "all"
      ? filtersCtl.filters.seller
      : undefined;
```

> **Nota:** Reutilizamos o search param **`vendedor`** já existente (gerenciado por `useSalesFilters`) como deep-link do drawer — sem criar param novo. `filtersCtl.setSeller(id)` grava `?vendedor=id`; `setSeller("all")` limpa.

- [ ] **Step 4: Trocar `TAB_DEFS.map` por `tabDefs.map`**

Na `TabsList` (linha ~124), trocar `{TAB_DEFS.map((def) => (` por `{tabDefs.map((def) => (`.

- [ ] **Step 5: Adicionar o `TabsContent` da aba "sellers"**

Imediatamente após o fechamento do `</TabsContent>` de `value="overview"` (linha ~145), inserir:

```tsx
        {canSeeSellers && (
          <TabsContent value="sellers" className="focus-visible:outline-none">
            <SellersTab
              storeId={scope.storeId ?? storeId}
              viewerSellerId={sellersViewerId}
              selectedSellerId={selectedSellerParam}
              onSelectSeller={(id) => filtersCtl.setSeller(id ?? "all")}
            />
          </TabsContent>
        )}
```

> **Nota de escopo:** passamos `scope.storeId ?? storeId` para a aba sempre operar **store-wide** (o leaderboard nunca é seller-locked; a restrição ao Vendedor acontece via `viewerSellerId`). Como `useSellerLeaderboard` recebe apenas `storeId`, o lock de vendedor do `scope` não afeta o ranking.

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit 2>&1 | grep "sales-analytics/pages/SalesAnalyticsPage"`
Expected: saída **vazia**.

- [ ] **Step 7: Commit**

```bash
git add src/features/sales-analytics/pages/SalesAnalyticsPage.tsx
git commit -m "feat(sales): wire Sellers tab into sales page with RBAC and deep-link"
```

---

## Task 9: Verificação final e ajustes

**Files:** (nenhum novo — verificação)

- [ ] **Step 1: Type-check completo dos arquivos da feature**

Run: `bunx tsc --noEmit 2>&1 | grep "sales-analytics/\(hooks/useSellerLeaderboard\|utils/sellerLeaderboard\|components/sellers\|components/tabs/SellersTab\|pages/SalesAnalyticsPage\|i18n/pt-BR\)"`
Expected: saída **vazia**. Se houver erro, corrigir o arquivo apontado e re-rodar.

- [ ] **Step 2: Build de produção (sanity)**

Run: `bun run build`
Expected: build conclui sem erro (lembrando que `tsc` não roda no build; o objetivo aqui é garantir que o bundler resolve todos os imports novos).

- [ ] **Step 3: Verificação manual de UI (usuário)**

Pedir ao usuário para dar **F5** em `localhost` → `/app/gestao/vendas` e validar, logado como **Owner/Gestor**:
- Existe a aba **"Vendedores"** entre "Visão geral" e "Produtos".
- Header de resumo (vendedores, faturamento, atingimento médio) + seletor "Ranquear por" (4 opções) trocando a ordenação.
- Pódio dos 3 primeiros (com ≥4 vendedores) + leaderboard abaixo, com barra de meta colorida por faixa e seta de tendência.
- Clicar em qualquer vendedor (pódio ou linha) abre o **drawer** com métricas + mini gráfico; a URL ganha `?vendedor=<id>`; fechar limpa o param.
- Botão **"Ver como tabela"** alterna para a tabela densa com total no rodapé.
- Logado como **Vendedor**: a aba mostra **apenas o próprio card** ("Sua posição no ranking"), sem os colegas.
- O toggle **"Detalhar por vendedor"** na aba "Visão geral" continua funcionando como antes (não regrediu).

- [ ] **Step 4: Commit de eventuais ajustes pós-verificação**

```bash
git add <arquivos ajustados por nome>
git commit -m "fix(sales): adjust Sellers tab after manual verification"
```

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura da spec:** §2 escopo/aba/RBAC → Task 8; §3 estrutura (header/pódio/leaderboard/drawer/tabela) → Tasks 4-7; §4 métrica de ranqueamento → Task 4 (header) + Task 2 (`rankMetricValue`); §5 dados → Tasks 2-3; §6 faixas de cor → `attainmentBand` (Task 2) + classes nos componentes (Tasks 4-6); §7 estados/microinterações → Task 7 (loading/empty/<4/drawer/deep-link); §8 componentização → todas as tasks; §9 fora de escopo respeitado (sem column-visibility, sem export, sem persistência); §10 não-regressão → Task 9 Step 3.
- **Placeholders:** nenhum — todo passo tem código/comando completo.
- **Consistência de tipos:** `ISellerLeaderboardRow`, `SellerRankMetric`, `attainmentBand`, `rankMetricValue`, `IUseSellerLeaderboardResult` usados com a mesma assinatura em todas as tasks. Bandas (`success`/`warning`/`below`/`none`) idênticas nos mapas de Row/Table/Drawer.
- **Riscos sinalizados inline:** API do `ToggleGroup` (Task 4), shape de `sellersProvider.list`/campo `sellerId` do customer (Task 3 Step 2), exports do `Sheet` (Task 5) — todos com instrução de ajuste.
