# Página dedicada de detalhamento do cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma segunda forma de visualização do detalhamento do cliente — uma página dedicada larga (`/app/clientes/$id`) acionada ao clicar no nome, com faixa de stats + hero analítico (bento 12-col) + as 7 abas atuais — mantendo o painel lateral de consulta rápida.

**Architecture:** Padrão Híbrido (Opção C), espelhando o redesign do detalhe de veículos: trilho `max-w-7xl`, header full-bleed com breadcrumb, faixa de stats full-width, hero analítico em bento de 12 colunas (gráfico de evolução `col-6`, timeline `col-3`, pendências `col-3`) e `ProfileTabs` reutilizado intacto abaixo. As 7 abas e seus providers não mudam, exceto a `OverviewTab` que ganha um `variant="page"` (2 colunas + oculta o `MetricsCard`).

**Tech Stack:** React + TanStack Router (file-based) + Tailwind CSS v4 + shadcn/ui (new-york) + recharts + Iconify. Sem novos pacotes.

**Spec:** `docs/superpowers/specs/2026-05-29-pagina-dedicada-cliente-design.md`

---

## Nota sobre verificação (projeto sem testes)

Este repositório **não tem runner de testes** (ver `CLAUDE.md`). O gate de cada task é:

```bash
bun run build
```

(Vite + `tsc --noEmit`. O projeto possui erros de tipo pré-existentes não relacionados; ao avaliar, confirme que **nenhum novo erro** vem dos arquivos tocados.) Quando útil, rode também:

```bash
bunx eslint <arquivos tocados>
```

A validação visual é **manual pelo usuário** — não abrir browser/preview automaticamente.

---

## File Structure

**Novos arquivos:**

- `src/features/customers/pages/CustomerDetailPage.tsx` — shell da página (compõe header + strip + hero + tabs).
- `src/features/customers/components/detail/CustomerDetailHeader.tsx` — header full-bleed com breadcrumb e ações.
- `src/features/customers/components/detail/CustomerStatStrip.tsx` — faixa de stats full-width.
- `src/features/customers/components/detail/CustomerPurchaseEvolutionCard.tsx` — gráfico de evolução (recharts).
- `src/features/customers/components/detail/CustomerRelationshipTimeline.tsx` — timeline de relacionamento.
- `src/features/customers/components/detail/CustomerPendingActionsCard.tsx` — pendências acionáveis.
- `src/features/customers/utils/purchaseSeries.ts` — agregação mensal de pedidos (função pura).

**Arquivos modificados:**

- `src/features/customers/i18n/pt-BR.ts` — bloco `detail`.
- `src/routes/app.clientes.$id.tsx` — renderiza `CustomerDetailPage`.
- `src/features/customers/components/ProfileTabs.tsx` — props opcionais de aba controlada + `overviewVariant`.
- `src/features/customers/components/tabs/OverviewTab.tsx` — prop `variant`.
- `src/features/customers/components/list/CustomersTable.tsx` — nome clicável → `onOpenDetail`.
- `src/features/customers/pages/CustomersListPage.tsx` — passa `onOpenDetail`.
- `src/features/customers/components/ProfileHeader.tsx` — botão "expandir" no `variant="column"`.

**Ordem de build:** componentes folha primeiro (não quebram o build mesmo sem uso), depois o shell, depois o wiring de rota/tabela/painel.

---

### Task 1: Strings i18n (bloco `detail`)

**Files:**

- Modify: `src/features/customers/i18n/pt-BR.ts`

- [ ] **Step 1: Adicionar o bloco `detail` ao objeto `CUSTOMER_STRINGS`**

Inserir uma nova chave `detail` dentro de `CUSTOMER_STRINGS` (antes da chave `fiche`, mantendo o padrão do arquivo):

```ts
  detail: {
    breadcrumb: "Clientes",
    openFullPage: "Abrir página completa",
    statStrip: {
      ticketMedio: "Ticket médio",
      ltv: "LTV",
      recency: "Recência",
      frequency: "Frequência",
      abc: "Curva ABC",
      recencyNever: "Sem compras",
      recencyDays: (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`,
      frequencyValue: (n: number) => `${n} ${n === 1 ? "pedido" : "pedidos"}`,
      abcShare: (share: string) => `${share} da receita`,
      empty: "—",
    },
    evolution: {
      title: "Evolução de compras",
      window: "Últimos 12 meses",
      empty: "Sem pedidos pagos para exibir ainda.",
      average: "Média mensal",
    },
    timeline: {
      title: "Relacionamento",
      customerSince: "Cliente desde",
      convertedFromLead: "Convertido de lead",
      lastPurchase: "Última compra",
      lastPurchaseDays: (n: number) => `há ${n} ${n === 1 ? "dia" : "dias"}`,
      recentNote: "Nota recente",
      seeAllNotes: "Ver todas as notas",
      empty: "Sem eventos de relacionamento ainda.",
    },
    pending: {
      title: "Pendências e ações",
      openQuotes: "Orçamentos abertos",
      vehiclesToApprove: "Veículos para aprovar",
      unseenRecommendations: "Recomendações",
      overdueRepurchase: "Recompra atrasada",
      overdueHint: (n: number) => `${n} dias sem comprar`,
      allClear: "Tudo em dia com este cliente.",
    },
  },
```

- [ ] **Step 2: Verificar build**

Run: `bun run build`
Expected: build conclui sem novos erros de tipo nos arquivos tocados.

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/i18n/pt-BR.ts
git commit -m "feat(customers): add i18n strings for dedicated detail page"
```

---

### Task 2: Faixa de stats (`CustomerStatStrip`)

**Files:**

- Create: `src/features/customers/components/detail/CustomerStatStrip.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { daysSince, formatBRL, formatPercent } from "@/shared/utils/format";
import { ABC_BADGE_CLASSES } from "../../utils/customerDisplay";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.statStrip;

export interface ICustomerStatStripProps {
  customer: ICustomer;
}

interface IStatCell {
  icon: string;
  label: string;
  value: React.ReactNode;
}

/**
 * Full-width KPI strip rendered between the page header and the analytics hero.
 * Mirrors the vehicle detail "stat strip" pattern: hairline cells via gap-px on
 * a bg-border parent with bg-card cells. Read-only snapshot of purchaseStats.
 */
export function CustomerStatStrip({ customer }: ICustomerStatStripProps) {
  const stats = customer.purchaseStats;
  const recency = customer.lastPurchaseAt ? daysSince(customer.lastPurchaseAt) : null;

  const cells: IStatCell[] = [
    {
      icon: "mdi:cash-multiple",
      label: COPY.ticketMedio,
      value: stats ? formatBRL(stats.ticketMedio) : COPY.empty,
    },
    {
      icon: "mdi:trophy-outline",
      label: COPY.ltv,
      value: stats ? formatBRL(stats.ltv) : COPY.empty,
    },
    {
      icon: "mdi:calendar-clock",
      label: COPY.recency,
      value: recency === null ? COPY.recencyNever : COPY.recencyDays(recency),
    },
    {
      icon: "mdi:repeat-variant",
      label: COPY.frequency,
      value: stats ? COPY.frequencyValue(stats.orderCount12m) : COPY.empty,
    },
    {
      icon: "mdi:tag-multiple-outline",
      label: COPY.abc,
      value: customer.abcClass ? (
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
              ABC_BADGE_CLASSES[customer.abcClass],
            )}
          >
            {customer.abcClass}
          </span>
          {typeof customer.abcShare === "number" && (
            <span className="text-xs text-muted-foreground">
              {COPY.abcShare(formatPercent(customer.abcShare))}
            </span>
          )}
        </span>
      ) : (
        COPY.empty
      ),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={11} />
            {cell.label}
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `bun run build`
Expected: sem novos erros. (Componente ainda não usado — ok.)

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/components/detail/CustomerStatStrip.tsx
git commit -m "feat(customers): add customer stat strip component"
```

---

### Task 3: Agregação mensal + gráfico de evolução

**Files:**

- Create: `src/features/customers/utils/purchaseSeries.ts`
- Create: `src/features/customers/components/detail/CustomerPurchaseEvolutionCard.tsx`

- [ ] **Step 1: Criar a função pura de agregação**

`src/features/customers/utils/purchaseSeries.ts`:

```ts
import type { IOrder } from "@/shared/types";

export interface IMonthlyPurchasePoint {
  /** "YYYY-MM" bucket key. */
  month: string;
  /** Short pt-BR label, e.g. "jun". */
  label: string;
  /** Sum of paid order totals in the month (BRL). */
  total: number;
}

const MONTH_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/**
 * Aggregate the customer's PAID orders into the last `months` calendar buckets
 * (oldest → newest), filling empty months with 0. Pure function — `now` is
 * injectable for deterministic behavior.
 */
export function buildMonthlyPurchaseSeries(
  orders: IOrder[],
  months = 12,
  now: Date = new Date(),
): IMonthlyPurchasePoint[] {
  const buckets = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, 0);
  }

  for (const order of orders) {
    if (order.paymentStatus !== "pago") continue;
    const d = new Date(order.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + order.total);
    }
  }

  return Array.from(buckets.entries()).map(([month, total]) => {
    const monthIndex = Number(month.slice(5, 7)) - 1;
    return { month, label: MONTH_LABELS[monthIndex] ?? "", total };
  });
}

export function averageOf(points: IMonthlyPurchasePoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + p.total, 0) / points.length;
}
```

- [ ] **Step 2: Criar o card do gráfico**

`src/features/customers/components/detail/CustomerPurchaseEvolutionCard.tsx`:

```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { formatBRL } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { averageOf, buildMonthlyPurchaseSeries } from "../../utils/purchaseSeries";

const COPY = CUSTOMER_STRINGS.detail.evolution;

export interface ICustomerPurchaseEvolutionCardProps {
  customer: ICustomer;
  className?: string;
}

export function CustomerPurchaseEvolutionCard({
  customer,
  className,
}: ICustomerPurchaseEvolutionCardProps) {
  const provider = useOrdersProvider();
  const query = useQuery({
    queryKey: ["customer-orders", customer.id] as const,
    queryFn: () => provider.listByCustomer(customer.id),
    staleTime: 60_000,
  });

  const series = useMemo(() => buildMonthlyPurchaseSeries(query.data ?? []), [query.data]);
  const average = useMemo(() => averageOf(series), [series]);
  const hasData = series.some((p) => p.total > 0);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Icon icon="mdi:chart-areaspline" size={16} className="text-muted-foreground" />
          {COPY.title}
        </h2>
        <span className="text-xs text-muted-foreground">{COPY.window}</span>
      </header>

      {!hasData ? (
        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
          {COPY.empty}
        </div>
      ) : (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="customerEvoArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              />
              <YAxis hide domain={[0, "dataMax"]} />
              {average > 0 && (
                <ReferenceLine
                  y={average}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                formatter={(value: number) => [formatBRL(value), COPY.title]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#customerEvoArea)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
```

> Nota a11y: `isAnimationActive={false}` evita animação que ignora `prefers-reduced-motion` (recharts não respeita a media query nativamente).

- [ ] **Step 3: Verificar build**

Run: `bun run build`
Expected: sem novos erros.

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/utils/purchaseSeries.ts src/features/customers/components/detail/CustomerPurchaseEvolutionCard.tsx
git commit -m "feat(customers): add purchase evolution chart with monthly aggregation"
```

---

### Task 4: Timeline de relacionamento

**Files:**

- Create: `src/features/customers/components/detail/CustomerRelationshipTimeline.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { useMemo } from "react";
import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { daysSince, formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.timeline;

export interface ICustomerRelationshipTimelineProps {
  customer: ICustomer;
  className?: string;
}

interface ITimelineNode {
  icon: string;
  title: string;
  detail: string;
  muted?: boolean;
}

export function CustomerRelationshipTimeline({
  customer,
  className,
}: ICustomerRelationshipTimelineProps) {
  const nodes = useMemo<ITimelineNode[]>(() => {
    const out: ITimelineNode[] = [];
    const since = customer.firstPurchaseAt ?? customer.createdAt;
    if (since) {
      out.push({
        icon: "mdi:account-star-outline",
        title: COPY.customerSince,
        detail: formatDateBR(since),
      });
    }
    if (customer.convertedFromLeadAt) {
      out.push({
        icon: "mdi:account-convert-outline",
        title: COPY.convertedFromLead,
        detail: formatDateBR(customer.convertedFromLeadAt),
      });
    }
    if (customer.lastPurchaseAt) {
      const d = daysSince(customer.lastPurchaseAt);
      out.push({
        icon: "mdi:cart-outline",
        title: COPY.lastPurchase,
        detail: `${formatDateBR(customer.lastPurchaseAt)} · ${COPY.lastPurchaseDays(d)}`,
      });
    }
    const recentNotes = [...customer.notes]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 2);
    for (const note of recentNotes) {
      out.push({
        icon: "mdi:note-text-outline",
        title: COPY.recentNote,
        detail: `${formatDateBR(note.createdAt)} — ${note.content.slice(0, 60)}`,
        muted: true,
      });
    }
    return out;
  }, [customer]);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:timeline-clock-outline" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>

      {nodes.length === 0 ? (
        <p className="text-xs text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ol className="relative space-y-3 border-l border-border pl-4">
          {nodes.map((node, i) => (
            <li key={i} className="relative">
              <span
                className={cn(
                  "absolute -left-[21px] grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-card",
                  node.muted ? "bg-muted-foreground/50" : "bg-primary",
                )}
                aria-hidden
              />
              <div className="flex items-start gap-1.5">
                <Icon
                  icon={node.icon}
                  size={13}
                  className="mt-0.5 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground">{node.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground" title={node.detail}>
                    {node.detail}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `bun run build`
Expected: sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/components/detail/CustomerRelationshipTimeline.tsx
git commit -m "feat(customers): add relationship timeline component"
```

---

### Task 5: Pendências e ações

**Files:**

- Create: `src/features/customers/components/detail/CustomerPendingActionsCard.tsx`

- [ ] **Step 1: Criar o componente**

O card recebe um callback `onNavigateTab` (definido na página) para focar a aba relevante. Cada contagem usa um `useQuery` independente (lazy, não bloqueia o resto da página).

```tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, TabKey } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useQuotesProvider } from "@/providers/data/hooks/useQuotesProvider";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { useRecommendationsProvider } from "@/providers/data/hooks/useRecommendationsProvider";
import { daysSince } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.pending;
const MVP_REC_TYPES = ["recovery", "vehicle_maintenance", "follow_up"] as const;

/** Tab keys the timeline/pending blocks can deep-link into. */
export type PendingTabTarget = "quotes" | "vehicles" | "recommendations" | "orders";

export interface ICustomerPendingActionsCardProps {
  customer: ICustomer;
  onNavigateTab: (tab: PendingTabTarget) => void;
  className?: string;
}

interface IPendingItem {
  icon: string;
  label: string;
  count?: number;
  hint?: string;
  target: PendingTabTarget;
  critical?: boolean;
}

export function CustomerPendingActionsCard({
  customer,
  onNavigateTab,
  className,
}: ICustomerPendingActionsCardProps) {
  const quotesProvider = useQuotesProvider();
  const vehiclesProvider = useVehiclesProvider();
  const recommendationsProvider = useRecommendationsProvider();

  const openQuotes = useQuery({
    queryKey: ["pending-open-quotes", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      quotesProvider
        .list({ customerId: customer.id, pageSize: 200 })
        .then(
          (r) => r.data.filter((q) => q.status === "enviado" || q.status === "rascunho").length,
        ),
  });

  const pendingVehicles = useQuery({
    queryKey: ["pending-vehicles-approval", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      vehiclesProvider
        .listByCustomer(customer.id)
        .then((vs) => vs.filter((v) => v.cadastroStatus === "pendente").length),
  });

  const unseenRecs = useQuery({
    queryKey: ["pending-recommendations", customer.id] as const,
    staleTime: 60_000,
    queryFn: () =>
      recommendationsProvider
        .list({
          subjectId: customer.id,
          resolved: false,
          type: [...MVP_REC_TYPES],
          pageSize: 50,
        })
        .then((r) => r.data.length),
  });

  // Overdue repurchase heuristic: recency exceeds the average days between
  // purchases (derived from orderCount12m over a 365-day window).
  const overdueDays = useMemo(() => {
    if (!customer.lastPurchaseAt) return null;
    const stats = customer.purchaseStats;
    if (!stats || stats.orderCount12m <= 0) return null;
    const avgInterval = 365 / stats.orderCount12m;
    const recency = daysSince(customer.lastPurchaseAt);
    return recency > avgInterval * 1.5 ? recency : null;
  }, [customer]);

  const items = useMemo<IPendingItem[]>(() => {
    const out: IPendingItem[] = [];
    if ((openQuotes.data ?? 0) > 0) {
      out.push({
        icon: "mdi:file-document-outline",
        label: COPY.openQuotes,
        count: openQuotes.data,
        target: "quotes",
      });
    }
    if ((pendingVehicles.data ?? 0) > 0) {
      out.push({
        icon: "mdi:truck-alert-outline",
        label: COPY.vehiclesToApprove,
        count: pendingVehicles.data,
        target: "vehicles",
        critical: true,
      });
    }
    if ((unseenRecs.data ?? 0) > 0) {
      out.push({
        icon: "mdi:lightbulb-on-outline",
        label: COPY.unseenRecommendations,
        count: unseenRecs.data,
        target: "recommendations",
      });
    }
    if (overdueDays !== null) {
      out.push({
        icon: "mdi:clock-alert-outline",
        label: COPY.overdueRepurchase,
        hint: COPY.overdueHint(overdueDays),
        target: "orders",
        critical: true,
      });
    }
    return out;
  }, [openQuotes.data, pendingVehicles.data, unseenRecs.data, overdueDays]);

  return (
    <section className={cn("rounded-lg border border-primary/40 bg-primary/5 p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:flash-outline" size={16} className="text-primary" />
        {COPY.title}
      </h2>

      {items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="mdi:check-circle-outline" size={14} className="text-emerald-500" />
          {COPY.allClear}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                onClick={() => onNavigateTab(item.target)}
                className="flex w-full items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:border-border hover:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <Icon
                  icon={item.icon}
                  size={15}
                  className={cn(item.critical ? "text-rose-500" : "text-muted-foreground")}
                />
                <span className="min-w-0 flex-1 truncate text-foreground">{item.label}</span>
                {typeof item.count === "number" && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {item.count}
                  </span>
                )}
                {item.hint && (
                  <span className="text-[11px] text-muted-foreground">{item.hint}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

> **Verificar antes de implementar:** confirme que `TabKey` é exportável de `@/shared/types`. Se **não** for um tipo compartilhado (hoje `TabKey` é local em `ProfileTabs.tsx`), **remova** o import de `TabKey` deste arquivo — ele não é usado aqui (usamos `PendingTabTarget`). O import está listado por engano; o componente só precisa de `ICustomer`.

- [ ] **Step 2: Corrigir o import**

Remover `TabKey` do import de tipos — manter apenas:

```ts
import type { ICustomer } from "@/shared/types";
```

- [ ] **Step 3: Verificar build**

Run: `bun run build`
Expected: sem novos erros. Confirme as assinaturas reais: `quotesProvider.list({ customerId, pageSize }) → { data: IQuote[] }`, `vehiclesProvider.listByCustomer(id) → IVehicle[]`, `recommendationsProvider.list({ subjectId, resolved, type, pageSize }) → { data: IRecommendation[] }`.

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/components/detail/CustomerPendingActionsCard.tsx
git commit -m "feat(customers): add pending actions card"
```

---

### Task 6: Header da página (`CustomerDetailHeader`)

**Files:**

- Create: `src/features/customers/components/detail/CustomerDetailHeader.tsx`

- [ ] **Step 1: Criar o componente**

Reusa `ProfileBadges`, `PreConversionBadge`, `CoverageBanner`, `ProfileMenu` e a lógica de "Criar orçamento" do `ProfileHeader`. Header full-bleed (`border-b bg-card`) com conteúdo interno no trilho `max-w-7xl`.

```tsx
import { Link, useNavigate } from "@tanstack/react-router";
import type { ICustomer } from "@/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CoverageBanner } from "@/features/carteira/components/CoverageBanner";
import { getCustomerDisplay } from "../../utils/customerDisplay";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { ProfileBadges } from "../ProfileBadges";
import { PreConversionBadge } from "../PreConversionBadge";
import { ProfileMenu } from "../ProfileMenu";

export interface ICustomerDetailHeaderProps {
  customer: ICustomer;
}

export function CustomerDetailHeader({ customer }: ICustomerDetailHeaderProps) {
  const display = getCustomerDisplay(customer);
  const navigate = useNavigate();

  const handleCreateQuote = () => {
    const params = new URLSearchParams({ customerId: customer.id });
    void navigate({ to: `/app/orcamentos/novo?${params.toString()}` as never });
  };

  return (
    <header className="shrink-0 border-b border-border bg-card">
      <div className="mx-auto w-full max-w-7xl space-y-3 px-4 py-5 sm:px-6">
        <nav
          className="flex items-center gap-1 text-xs text-muted-foreground"
          aria-label="breadcrumb"
        >
          <Link
            to="/app/clientes"
            className="rounded transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {CUSTOMER_STRINGS.detail.breadcrumb}
          </Link>
          <Icon icon="mdi:chevron-right" size={14} />
          <span className="truncate text-foreground">{display.name}</span>
        </nav>

        <div className="flex items-start gap-3">
          <Avatar className="h-16 w-16 shrink-0 text-lg">
            <AvatarFallback
              className="font-semibold"
              style={{ backgroundColor: display.bg, color: display.fg }}
              aria-hidden
            >
              {display.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1.5">
            <h1
              className="text-xl font-semibold uppercase leading-tight text-foreground"
              title={display.name}
            >
              {display.name}
            </h1>
            <ProfileBadges
              customer={customer}
              preConversionSlot={<PreConversionBadge customer={customer} />}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="default" size="sm" className="gap-1.5" onClick={handleCreateQuote}>
              <Icon icon="mdi:file-document-plus-outline" size={14} />
              {CUSTOMER_STRINGS.header.createQuote}
            </Button>
            <ProfileMenu customer={customer} />
          </div>
        </div>

        <CoverageBanner customer={customer} />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verificar build**

Run: `bun run build`
Expected: sem novos erros. Confirme que `PreConversionBadge`, `ProfileMenu` e `CoverageBanner` aceitam apenas `customer` (ver `ProfileHeader.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/components/detail/CustomerDetailHeader.tsx
git commit -m "feat(customers): add dedicated detail page header"
```

---

### Task 7: `OverviewTab variant` + aba controlada no `ProfileTabs`

**Files:**

- Modify: `src/features/customers/components/tabs/OverviewTab.tsx`
- Modify: `src/features/customers/components/ProfileTabs.tsx`

- [ ] **Step 1: Adicionar `variant` à `OverviewTab`**

Substituir o conteúdo de `OverviewTab.tsx` por:

```tsx
import type { ICustomer } from "@/shared/types";
import { cn } from "@/lib/utils";
import { MetricsCard } from "../cards/MetricsCard";
import { CadastraisCard } from "../cards/CadastraisCard";
import { StatusWalletCard } from "../cards/StatusWalletCard";
import { TagsCard } from "../cards/TagsCard";
import { PortalCard } from "../cards/PortalCard";

export interface IOverviewTabProps {
  customer: ICustomer;
  /** `column` (default) = lateral panel, 1 column with metrics card.
   *  `page` = dedicated page, 2 columns and metrics hidden (stat strip covers it). */
  variant?: "column" | "page";
}

export function OverviewTab({ customer, variant = "column" }: IOverviewTabProps) {
  if (variant === "page") {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-3">
          <CadastraisCard customer={customer} />
        </div>
        <div className="space-y-3">
          <StatusWalletCard customer={customer} />
          <TagsCard customer={customer} />
          <PortalCard customer={customer} />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3")}>
      <MetricsCard customer={customer} />
      <CadastraisCard customer={customer} />
      <StatusWalletCard customer={customer} />
      <TagsCard customer={customer} />
      <PortalCard customer={customer} />
    </div>
  );
}
```

- [ ] **Step 2: Tornar a aba controlável e propagar `overviewVariant` no `ProfileTabs`**

Editar `ProfileTabs.tsx`. Exportar o tipo `TabKey`, aceitar props opcionais de controle e a variante do overview. Substituir a assinatura e o estado:

```tsx
export type TabKey =
  | "overview"
  | "orders"
  | "quotes"
  | "vehicles"
  | "conversations"
  | "notes"
  | "recommendations";

export interface IProfileTabsProps {
  customer: ICustomer;
  conversation?: IConversation | null;
  /** Controlled active tab (optional). Falls back to internal state. */
  activeTab?: TabKey;
  onActiveTabChange?: (tab: TabKey) => void;
  /** Layout density of the Overview tab. */
  overviewVariant?: "column" | "page";
}

export function ProfileTabs({
  customer,
  conversation,
  activeTab,
  onActiveTabChange,
  overviewVariant = "column",
}: IProfileTabsProps) {
  const [internal, setInternal] = useState<TabKey>("overview");
  const active = activeTab ?? internal;
  const setActive = (v: TabKey) => {
    setInternal(v);
    onActiveTabChange?.(v);
  };
  // ... resto inalterado, mas:
  //   <Tabs value={active} onValueChange={(v) => setActive(v as TabKey)} ...>
  //   e na aba overview: {active === "overview" && <OverviewTab customer={customer} variant={overviewVariant} />}
```

Aplicar as duas alterações pontuais no corpo existente:

- `<Tabs value={active} onValueChange={(v) => setActive(v as TabKey)} ...>` (já usa `active`/`setActive`).
- A linha do overview passa a: `{active === "overview" && <OverviewTab customer={customer} variant={overviewVariant} />}`.

- [ ] **Step 3: Verificar build**

Run: `bun run build`
Expected: sem novos erros. O painel lateral (`CustomerProfile`) continua chamando `<ProfileTabs customer conversation />` sem as props novas → defaults preservam o comportamento atual.

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/components/tabs/OverviewTab.tsx src/features/customers/components/ProfileTabs.tsx
git commit -m "feat(customers): support page variant overview and controlled tabs"
```

---

### Task 8: Shell da página (`CustomerDetailPage`)

**Files:**

- Create: `src/features/customers/pages/CustomerDetailPage.tsx`

- [ ] **Step 1: Criar o componente**

```tsx
import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCustomerProfile } from "../hooks/useCustomerProfile";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";
import { ProfileSkeleton } from "../components/ProfileSkeleton";
import { ProfileTabs, type TabKey } from "../components/ProfileTabs";
import { CustomerDetailHeader } from "../components/detail/CustomerDetailHeader";
import { CustomerStatStrip } from "../components/detail/CustomerStatStrip";
import { CustomerPurchaseEvolutionCard } from "../components/detail/CustomerPurchaseEvolutionCard";
import { CustomerRelationshipTimeline } from "../components/detail/CustomerRelationshipTimeline";
import {
  CustomerPendingActionsCard,
  type PendingTabTarget,
} from "../components/detail/CustomerPendingActionsCard";

export interface ICustomerDetailPageProps {
  customerId: ID;
}

export function CustomerDetailPage({ customerId }: ICustomerDetailPageProps) {
  const { customer, isLoading, isError, notFound, refetch } = useCustomerProfile(customerId);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleNavigateTab = (target: PendingTabTarget) => {
    setActiveTab(target as TabKey);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isLoading) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <ProfileSkeleton variant="page" />
      </div>
    );
  }

  if (notFound || isError || !customer) {
    const copy = notFound ? CUSTOMER_STRINGS.notFound : CUSTOMER_STRINGS.loadError;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon
            icon={notFound ? "mdi:account-question-outline" : "mdi:alert-circle-outline"}
            size={24}
          />
        </div>
        <div className="space-y-1">
          <h1 className="text-sm font-semibold text-foreground">{copy.title}</h1>
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        </div>
        <div className="flex gap-2">
          {isError && !notFound && (
            <Button variant="secondary" size="sm" onClick={refetch}>
              {CUSTOMER_STRINGS.loadError.retry}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigate({ to: "/app/clientes" })}
          >
            <Icon icon="mdi:arrow-left" size={14} />
            {CUSTOMER_STRINGS.backToList}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
        <CustomerDetailHeader customer={customer} />

        <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6">
          <CustomerStatStrip customer={customer} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <CustomerPurchaseEvolutionCard customer={customer} className="lg:col-span-6" />
            <CustomerRelationshipTimeline customer={customer} className="lg:col-span-3" />
            <CustomerPendingActionsCard
              customer={customer}
              onNavigateTab={handleNavigateTab}
              className="lg:col-span-3"
            />
          </div>

          <div ref={tabsRef} className="rounded-lg border border-border bg-card">
            <ProfileTabs
              customer={customer}
              activeTab={activeTab}
              onActiveTabChange={setActiveTab}
              overviewVariant="page"
            />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
```

> **Verificar:** `ProfileSkeleton` aceita `variant="page"` (ver assinatura em `ProfileSkeleton.tsx`). Se não aceitar, usar `<ProfileSkeleton />` sem prop.

- [ ] **Step 2: Verificar build**

Run: `bun run build`
Expected: sem novos erros.

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/pages/CustomerDetailPage.tsx
git commit -m "feat(customers): assemble dedicated customer detail page shell"
```

---

### Task 9: Ligar a rota `/app/clientes/$id`

**Files:**

- Modify: `src/routes/app.clientes.$id.tsx`

- [ ] **Step 1: Substituir o conteúdo**

```tsx
import { createFileRoute, useParams } from "@tanstack/react-router";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";

export const Route = createFileRoute("/app/clientes/$id")({
  component: CustomerProfileRoute,
});

function CustomerProfileRoute() {
  const { id } = useParams({ from: "/app/clientes/$id" });
  return <CustomerDetailPage customerId={id} />;
}
```

- [ ] **Step 2: Verificar build + visual**

Run: `bun run build`
Expected: sem novos erros. **Validação visual manual:** acessar `/app/clientes/<id>` direto deve renderizar a nova página (header + strip + hero + abas).

- [ ] **Step 3: Commit**

```bash
git add src/routes/app.clientes.$id.tsx
git commit -m "feat(customers): wire dedicated detail page route"
```

---

### Task 10: Nome clicável na tabela → página dedicada

**Files:**

- Modify: `src/features/customers/components/list/CustomersTable.tsx`
- Modify: `src/features/customers/pages/CustomersListPage.tsx`

- [ ] **Step 1: Adicionar `onOpenDetail` à `CustomersTable`**

Em `CustomersTable.tsx`:

1. Adicionar à interface `ICustomersTableProps`:

```ts
  onOpenDetail: (id: ID) => void;
```

2. Receber `onOpenDetail` no destructuring do componente e repassar ao `CustomerRow`.
3. Adicionar `onOpenDetail` à interface `ICustomerRowProps` e ao destructuring de `CustomerRow`.
4. Passar para `renderCell` via o contexto: adicionar `onOpenDetail` a `ICellContext` e ao objeto passado em `renderCell(col, { ... })`.
5. No `case "name"`, transformar o nome em `<button>` clicável que abre a página, com `stopPropagation` para não disparar o `onSelectDetail` da linha:

```tsx
    case "name":
      return (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
            style={{ background: display.bg, color: display.fg }}
          >
            {display.initials}
          </span>
          <div className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx.onOpenDetail(customer.id);
              }}
              className="block max-w-full truncate text-left text-sm font-medium uppercase text-foreground transition-colors hover:text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              title={`Abrir página de ${name}`}
            >
              {highlightSearchTerm(name, searchTerm)}
            </button>
            <p className="truncate text-xs text-muted-foreground">
              {highlightSearchTerm(customer.phone, searchTerm)}
            </p>
          </div>
        </div>
      );
```

> Nota: ajustar a assinatura de `renderCell` para receber `ctx` inteiro (ou desestruturar `onOpenDetail`). Hoje `renderCell(col, ctx)` já desestrutura — adicionar `onOpenDetail` à lista desestruturada e usar `onOpenDetail(customer.id)`.

- [ ] **Step 2: Passar `onOpenDetail` na `CustomersListPage`**

Em `CustomersListPage.tsx`, no JSX da `<CustomersTable ... />` (≈ linha 482), adicionar:

```tsx
                onOpenDetail={(id) => void navigate({ to: "/app/clientes/$id", params: { id } })}
```

(`navigate` já existe no componente, linha 56.)

- [ ] **Step 3: Verificar build + visual**

Run: `bun run build`
Expected: sem novos erros. **Visual:** na lista, clicar no **nome** abre a página; clicar no **resto da linha** abre o painel lateral.

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/components/list/CustomersTable.tsx src/features/customers/pages/CustomersListPage.tsx
git commit -m "feat(customers): open dedicated page when clicking customer name"
```

---

### Task 11: Botão "expandir" no painel lateral

**Files:**

- Modify: `src/features/customers/components/ProfileHeader.tsx`

- [ ] **Step 1: Adicionar o botão de expandir (apenas no `variant="column"`)**

Em `ProfileHeader.tsx`:

1. Garantir o import de `Link`:

```ts
import { Link, useNavigate } from "@tanstack/react-router";
```

2. Na linha de ações (o `div` com `Button` "Criar orçamento" + `ProfileMenu`), adicionar, **apenas quando `variant === "column"`**, um botão de ícone que navega para a página dedicada:

```tsx
<div className="flex items-center gap-1.5">
  <Button
    variant="default"
    size="sm"
    className="flex-1 gap-1.5 sm:flex-none"
    onClick={handleCreateQuote}
  >
    <Icon icon="mdi:file-document-plus-outline" size={14} />
    {CUSTOMER_STRINGS.header.createQuote}
  </Button>
  {variant === "column" && (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="px-2"
      title={CUSTOMER_STRINGS.detail.openFullPage}
    >
      <Link
        to="/app/clientes/$id"
        params={{ id: customer.id }}
        aria-label={CUSTOMER_STRINGS.detail.openFullPage}
      >
        <Icon icon="mdi:arrow-expand" size={14} />
      </Link>
    </Button>
  )}
  <ProfileMenu customer={customer} />
</div>
```

- [ ] **Step 2: Verificar build + visual**

Run: `bun run build`
Expected: sem novos erros. **Visual:** no painel lateral, o ícone de expandir aparece no header e leva à página dedicada. No `variant="page"` o botão não aparece (o `CustomerDetailHeader` não usa `ProfileHeader`, então não há regressão).

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/components/ProfileHeader.tsx
git commit -m "feat(customers): add expand-to-full-page button on quick-view panel"
```

---

### Task 12: Verificação final

- [ ] **Step 1: Build completo**

Run: `bun run build`
Expected: build de produção conclui; nenhum erro novo de tipo nos arquivos tocados.

- [ ] **Step 2: Lint dos arquivos tocados**

Run:

```bash
bunx eslint src/features/customers/pages/CustomerDetailPage.tsx src/features/customers/components/detail src/features/customers/components/list/CustomersTable.tsx src/features/customers/components/ProfileHeader.tsx src/features/customers/components/ProfileTabs.tsx src/features/customers/components/tabs/OverviewTab.tsx src/features/customers/pages/CustomersListPage.tsx src/features/customers/utils/purchaseSeries.ts src/routes/app.clientes.$id.tsx
```

Expected: sem erros.

- [ ] **Step 3: Checklist de validação visual manual (usuário)**

Confirmar em `/app/clientes`:

- Clicar no **nome** → abre `/app/clientes/:id` (página larga). Clicar no **resto da linha** → painel lateral.
- Painel lateral exibe o ícone **expandir** → leva à mesma página.
- Página dedicada: breadcrumb funcional, faixa de stats (5 KPIs), hero (gráfico de evolução + timeline + pendências), e as 7 abas — a aba **Visão geral** em 2 colunas, **sem** o card de Métricas (coberto pela faixa).
- Pendências: clicar numa linha foca a aba correspondente e rola até as abas.
- Responsivo: `< lg` empilha; sem scroll horizontal em 375px.
- Light e dark mode + temas (parts/service/industrial) sem cores fora dos tokens.

- [ ] **Step 4: Commit final (se houver ajustes do checklist)**

```bash
git add -A
git commit -m "fix(customers): polish dedicated detail page after manual review"
```

---

## Self-Review (cobertura da spec)

- **Interação (nome → página, linha → painel, expandir):** Tasks 10, 11. ✔
- **Breadcrumb + header full-bleed + trilho max-w-7xl:** Tasks 6, 8. ✔
- **Faixa de stats (5 KPIs):** Task 2. ✔
- **Hero bento 12-col (gráfico 6 / timeline 3 / pendências 3) + empilha < lg:** Tasks 3,4,5,8. ✔
- **Gráfico de evolução (recharts, agregação mensal, pedidos pagos, prefers-reduced-motion):** Task 3. ✔
- **Timeline (cliente desde / lead / última compra / notas):** Task 4. ✔
- **Pendências acionáveis (orçamentos / veículos / recomendações / recompra atrasada) + deep-link:** Tasks 5, 8. ✔
- **Abas intactas + OverviewTab variant page (2 col, oculta MetricsCard):** Task 7. ✔
- **i18n pt-BR:** Task 1. ✔
- **Tokens semânticos, a11y, responsivo:** distribuído (Tasks 2–8) + checklist Task 12. ✔
- **Rota refeita:** Task 9. ✔
- **Sem novos pacotes / sem mudança de dados-providers-RBAC:** respeitado (só leituras de providers existentes). ✔

Pontos a confirmar durante a execução (sinalizados nos steps): assinatura de `ProfileSkeleton variant`, props de `PreConversionBadge/ProfileMenu/CoverageBanner`, e remoção do import acidental de `TabKey` na Task 5.

```

```
