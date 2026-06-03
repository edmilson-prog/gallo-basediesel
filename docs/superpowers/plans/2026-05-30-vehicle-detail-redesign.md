# Vehicle Detail Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/app/veiculos/$id` into a wide (1600px), insight-rich detail page with three user-selectable layout modes (Saúde / Trilhos / Bento, default Saúde), a 5-cell KPI strip, and four new enrichment blocks — with no backend changes.

**Architecture:** Pure derivation utils (health/km/parts/KPIs) feed mode-agnostic card components; three thin "layout composer" components arrange those cards differently; a localStorage-backed hook + a header segmented switcher choose the active composer. The page keeps all existing mutations, modals, and the v0.49.1 single-scroll fix.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind v4 + shadcn/ui (new-york), recharts, Iconify, bun.

**Spec:** `docs/superpowers/specs/2026-05-30-vehicle-detail-redesign-design.md`

> **Verification note (project reality overrides the TDD template):** this repo has **no test runner** (`CLAUDE.md`: "Não há suite de testes configurada. Type-check é coberto pelo `noEmit` do `tsc` via `bun run build`"). Therefore each task verifies with **`bun run build`** (Vite + `tsc --noEmit`) and **`bunx eslint <files>`**, and runs **`bunx prettier --write <files>`** before commit (the Edit tool writes CRLF; prettier normalizes it). Pure functions are verified by type-check + careful review. Final UI validation is **manual by the user** (per their workflow — do not open a browser to validate).

---

## File Structure

**New (17):**

- `src/features/vehicles/utils/vehicleHealth.ts` — health score from maintenance rules
- `src/features/vehicles/utils/kmSeries.ts` — km-over-time series + usage/year
- `src/features/vehicles/utils/partsRanking.ts` — most-replaced-parts aggregation
- `src/features/vehicles/utils/vehicleKpis.ts` — last service + next maintenance helpers
- `src/features/vehicles/config/layout.ts` — layout enum/const/storage key
- `src/features/vehicles/hooks/useVehicleDetailLayout.ts` — persisted layout preference
- `src/features/vehicles/components/detail/VehicleLayoutSwitcher.tsx` — header segmented control
- `src/features/vehicles/components/detail/VehicleStatStrip.tsx` — 5 KPI cells
- `src/features/vehicles/components/detail/VehicleHealthCard.tsx` — SVG ring gauge
- `src/features/vehicles/components/detail/VehicleKmEvolutionCard.tsx` — recharts area chart
- `src/features/vehicles/components/detail/MostReplacedPartsCard.tsx` — CSS bar ranking
- `src/features/vehicles/components/detail/OwnerFleetCard.tsx` — owner's other vehicles
- `src/features/vehicles/components/detail/VehicleHistorySection.tsx` — tabbed full history
- `src/features/vehicles/components/detail/layouts/types.ts` — shared layout-props type
- `src/features/vehicles/components/detail/layouts/VehicleLayoutHealth.tsx` — mode A
- `src/features/vehicles/components/detail/layouts/VehicleLayoutRails.tsx` — mode B
- `src/features/vehicles/components/detail/layouts/VehicleLayoutBento.tsx` — mode C

**Modified (4):**

- `src/features/vehicles/i18n/pt-BR.ts` — new `detail.*` strings
- `src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx` — additive `limit`/`title`/`onSeeAll`
- `src/features/vehicles/components/detail/VehicleDetailHeader.tsx` — 1600 rail + switcher
- `src/features/vehicles/pages/VehicleDetailPage.tsx` — 1600 + layout state + new composition

---

## Task 1: Derivation utilities

**Files:**

- Create: `src/features/vehicles/utils/vehicleHealth.ts`
- Create: `src/features/vehicles/utils/kmSeries.ts`
- Create: `src/features/vehicles/utils/partsRanking.ts`
- Create: `src/features/vehicles/utils/vehicleKpis.ts`

- [ ] **Step 1: Create `vehicleHealth.ts`**

```ts
import type { IVehicle } from "@/shared/types";
import { computeRecommendations } from "./maintenanceRules";

export type VehicleHealthStatus = "ok" | "attention" | "overdue";

export interface IVehicleHealth {
  /** 0..100 — higher is healthier. */
  score: number;
  status: VehicleHealthStatus;
  overdueCount: number;
  upcomingCount: number;
}

const OVERDUE_PENALTY = 20;
const UPCOMING_PENALTY = 8;

/**
 * Consolidates the km-based maintenance rules into a single health snapshot.
 * Built on `computeRecommendations`, which already returns only the rules that
 * are overdue (remainingKm <= 0) or due soon (0 < remainingKm <= warnWindow).
 */
export function computeHealth(vehicle: IVehicle): IVehicleHealth {
  const recs = computeRecommendations(vehicle);
  const overdueCount = recs.filter((r) => r.remainingKm <= 0).length;
  const upcomingCount = recs.filter((r) => r.remainingKm > 0).length;
  const raw = 100 - OVERDUE_PENALTY * overdueCount - UPCOMING_PENALTY * upcomingCount;
  const score = Math.max(0, Math.min(100, raw));
  const status: VehicleHealthStatus =
    overdueCount > 0 ? "overdue" : upcomingCount > 0 ? "attention" : "ok";
  return { score, status, overdueCount, upcomingCount };
}
```

- [ ] **Step 2: Create `kmSeries.ts`**

```ts
import type { IVehicle } from "@/shared/types";

export interface IKmPoint {
  /** Short label, e.g. "mar/25" or "atual". */
  label: string;
  km: number;
  /** Sort key (ms). */
  ts: number;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function shortLabel(d: Date): string {
  return `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Ascending km-over-time series from service entries that carry a km reading,
 * plus a trailing "atual" point when currentKm is known and not lower than the
 * last reading. Returns [] when fewer than 2 usable points exist.
 */
export function buildKmSeries(vehicle: IVehicle, now: Date = new Date()): IKmPoint[] {
  const points: IKmPoint[] = [];
  for (const entry of vehicle.serviceHistory) {
    if (typeof entry.km !== "number") continue;
    const d = new Date(entry.date);
    if (Number.isNaN(d.getTime())) continue;
    points.push({ label: shortLabel(d), km: entry.km, ts: d.getTime() });
  }
  points.sort((a, b) => a.ts - b.ts);
  if (typeof vehicle.currentKm === "number") {
    const last = points[points.length - 1];
    if (!last || vehicle.currentKm >= last.km) {
      points.push({ label: "atual", km: vehicle.currentKm, ts: now.getTime() });
    }
  }
  return points.length >= 2 ? points : [];
}

/** Estimated usage in km/year, or null when not derivable. */
export function usagePerYear(vehicle: IVehicle, now: Date = new Date()): number | null {
  const current = vehicle.currentKm;
  if (typeof current !== "number") return null;

  const withKm = vehicle.serviceHistory
    .filter((e) => typeof e.km === "number" && !Number.isNaN(new Date(e.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const first = withKm[0];
  if (first) {
    const years = (now.getTime() - new Date(first.date).getTime()) / (365.25 * 24 * 3600 * 1000);
    const deltaKm = current - (first.km as number);
    if (years >= 0.1 && deltaKm > 0) return Math.round(deltaKm / years);
  }
  // Fallback: total km spread over the vehicle's age.
  const age = Math.max(1, now.getFullYear() - vehicle.year);
  return Math.round(current / age);
}
```

- [ ] **Step 3: Create `partsRanking.ts`**

```ts
import type { IVehicle } from "@/shared/types";

export interface IPartRank {
  name: string;
  count: number;
}

/** Aggregate part-name frequency across the service history, descending. */
export function rankParts(vehicle: IVehicle, topN = 6): IPartRank[] {
  const counts = new Map<string, number>();
  for (const entry of vehicle.serviceHistory) {
    for (const raw of entry.parts) {
      const name = raw.trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, topN);
}
```

- [ ] **Step 4: Create `vehicleKpis.ts`**

```ts
import type { IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { computeRecommendations } from "./maintenanceRules";

/** The most recent service entry by date, or null when there's no history. */
export function lastServiceEntry(vehicle: IVehicle): IVehicleServiceEntry | null {
  let latest: IVehicleServiceEntry | null = null;
  for (const entry of vehicle.serviceHistory) {
    if (!latest || entry.date.localeCompare(latest.date) > 0) latest = entry;
  }
  return latest;
}

export interface INextMaintenance {
  remainingKm: number;
  label: string;
}

/**
 * The soonest upcoming (not-yet-overdue) maintenance. Returns null when nothing
 * is upcoming — callers show an "em dia" / "—" treatment in that case.
 */
export function nextMaintenance(vehicle: IVehicle): INextMaintenance | null {
  const upcoming = computeRecommendations(vehicle)
    .filter((r) => r.remainingKm > 0)
    .sort((a, b) => a.remainingKm - b.remainingKm);
  const top = upcoming[0];
  return top ? { remainingKm: top.remainingKm, label: top.rule.label } : null;
}
```

- [ ] **Step 5: Verify build + lint**

Run: `bun run build`
Expected: `✓ built` with no TS errors.
Run: `bunx eslint src/features/vehicles/utils/vehicleHealth.ts src/features/vehicles/utils/kmSeries.ts src/features/vehicles/utils/partsRanking.ts src/features/vehicles/utils/vehicleKpis.ts`
Expected: exit 0, no output.

- [ ] **Step 6: Format + commit**

```bash
bunx prettier --write src/features/vehicles/utils/vehicleHealth.ts src/features/vehicles/utils/kmSeries.ts src/features/vehicles/utils/partsRanking.ts src/features/vehicles/utils/vehicleKpis.ts
git add src/features/vehicles/utils/
git commit -m "feat: add vehicle detail derivation utils (health, km series, parts, kpis)"
```

---

## Task 2: i18n strings

**Files:**

- Modify: `src/features/vehicles/i18n/pt-BR.ts`

- [ ] **Step 1: Add `seeAll` / `fullTab` / `summaryTitle` to the existing `detail.history` block**

Find the `history:` object inside `detail:` and add three keys after `view: "Ver pedido",`:

```ts
      derivedFromOrder: "Derivado do pedido",
      view: "Ver pedido",
      seeAll: "Ver histórico completo",
      fullTab: "Histórico completo",
      summaryTitle: "Histórico recente",
```

- [ ] **Step 2: Add the new blocks inside `detail:`**

Insert these blocks immediately after the `statusBanner: { ... },` object (still inside `detail:`):

```ts
    layout: {
      ariaLabel: "Escolher layout",
      health: "Saúde",
      rails: "Trilhos",
      bento: "Bento",
      healthHint: "Destaque para saúde e oportunidades",
      railsHint: "Coluna principal + barra lateral",
      bentoHint: "Mosaico de cards",
    },
    statStrip: {
      currentKm: "KM atual",
      nextMaintenance: "Próxima manutenção",
      nextMaintenanceValue: (km: number, label: string) =>
        `${km.toLocaleString("pt-BR")} km · ${label}`,
      nextNone: "Em dia",
      overdue: "Manutenções vencidas",
      overdueNone: "Nenhuma",
      lastVisit: "Última visita",
      noVisit: "Sem visitas",
      daysAgo: (n: number) => (n === 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`),
      usage: "Uso",
      usageValue: (km: number) => `${km.toLocaleString("pt-BR")} km/ano`,
      empty: "—",
    },
    health: {
      title: "Saúde do veículo",
      ok: "Em dia",
      attention: "Atenção",
      overdue: "Vencido",
      summary: (overdue: number, upcoming: number) =>
        `${overdue} ${overdue === 1 ? "vencida" : "vencidas"} · ${upcoming} a vencer`,
      ariaLabel: (score: number, status: string) =>
        `Saúde do veículo: ${score}% (${status})`,
    },
    kmEvolution: {
      title: "Evolução de KM",
      window: "Histórico",
      empty: "Sem dados suficientes de quilometragem.",
      tooltip: "Quilometragem",
    },
    parts: {
      title: "Peças mais trocadas",
      empty: "Nenhuma peça registrada ainda.",
      times: (n: number) => `${n}×`,
    },
    fleet: {
      title: "Frota do proprietário",
      empty: "Única unidade deste cliente.",
      loadError: "Não foi possível carregar a frota.",
    },
```

- [ ] **Step 2.1: Sanity-check accents** — confirm `Saúde`, `manutenção`, `proprietário`, `veículo`, `Peças` render with correct UTF-8 accents (no `Saude`/`manutencao`).

- [ ] **Step 3: Verify build + lint**

Run: `bun run build`
Expected: `✓ built`, no TS errors.
Run: `bunx eslint src/features/vehicles/i18n/pt-BR.ts`
Expected: exit 0.

- [ ] **Step 4: Format + commit**

```bash
bunx prettier --write src/features/vehicles/i18n/pt-BR.ts
git add src/features/vehicles/i18n/pt-BR.ts
git commit -m "feat: add vehicle detail redesign i18n strings"
```

---

## Task 3: VehicleStatStrip

**Files:**

- Create: `src/features/vehicles/components/detail/VehicleStatStrip.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { daysSince } from "@/shared/utils/format";
import { formatKm } from "../../utils/vehicleDisplay";
import { computeHealth } from "../../utils/vehicleHealth";
import { lastServiceEntry, nextMaintenance } from "../../utils/vehicleKpis";
import { usagePerYear } from "../../utils/kmSeries";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.statStrip;

interface IStatCell {
  icon: string;
  label: string;
  value: React.ReactNode;
  accent?: "warn" | "danger";
}

export interface IVehicleStatStripProps {
  vehicle: IVehicle;
  now?: Date;
}

/** Full-width KPI strip mirroring the customer detail pattern (hairline cells). */
export function VehicleStatStrip({ vehicle, now = new Date() }: IVehicleStatStripProps) {
  const next = nextMaintenance(vehicle);
  const { overdueCount } = computeHealth(vehicle);
  const last = lastServiceEntry(vehicle);
  const recency = last ? daysSince(last.date, now) : null;
  const usage = usagePerYear(vehicle, now);

  const cells: IStatCell[] = [
    { icon: "mdi:counter", label: COPY.currentKm, value: formatKm(vehicle.currentKm) },
    {
      icon: "mdi:wrench-clock",
      label: COPY.nextMaintenance,
      value: next ? COPY.nextMaintenanceValue(next.remainingKm, next.label) : COPY.nextNone,
      accent: next ? "warn" : undefined,
    },
    {
      icon: "mdi:alert-octagon-outline",
      label: COPY.overdue,
      value: overdueCount > 0 ? String(overdueCount) : COPY.overdueNone,
      accent: overdueCount > 0 ? "danger" : undefined,
    },
    {
      icon: "mdi:calendar-clock",
      label: COPY.lastVisit,
      value: recency === null ? COPY.noVisit : COPY.daysAgo(recency),
    },
    {
      icon: "mdi:speedometer",
      label: COPY.usage,
      value: usage === null ? COPY.empty : COPY.usageValue(usage),
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
          <dd
            className={cn(
              "mt-1 text-sm font-semibold tabular-nums text-foreground",
              cell.accent === "warn" && "text-amber-600 dark:text-amber-300",
              cell.accent === "danger" && "text-destructive",
            )}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/VehicleStatStrip.tsx` → exit 0.

- [ ] **Step 3: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/VehicleStatStrip.tsx
git add src/features/vehicles/components/detail/VehicleStatStrip.tsx
git commit -m "feat: add VehicleStatStrip KPI strip"
```

---

## Task 4: VehicleHealthCard

**Files:**

- Create: `src/features/vehicles/components/detail/VehicleHealthCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { computeHealth, type VehicleHealthStatus } from "../../utils/vehicleHealth";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.health;

const STATUS_META: Record<
  VehicleHealthStatus,
  { label: string; ring: string; text: string; icon: string }
> = {
  ok: {
    label: COPY.ok,
    ring: "text-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: "mdi:check-circle-outline",
  },
  attention: {
    label: COPY.attention,
    ring: "text-amber-500",
    text: "text-amber-600 dark:text-amber-300",
    icon: "mdi:alert-circle-outline",
  },
  overdue: {
    label: COPY.overdue,
    ring: "text-destructive",
    text: "text-destructive",
    icon: "mdi:alert-octagon-outline",
  },
};

const RADIUS = 34;
const CIRC = 2 * Math.PI * RADIUS;

export interface IVehicleHealthCardProps {
  vehicle: IVehicle;
  className?: string;
}

/** Vehicle-health ring gauge driven by the maintenance rules. Color + icon + text (never color alone). */
export function VehicleHealthCard({ vehicle, className }: IVehicleHealthCardProps) {
  const { score, status, overdueCount, upcomingCount } = computeHealth(vehicle);
  const meta = STATUS_META[status];
  const offset = CIRC * (1 - score / 100);

  return (
    <section
      className={cn(
        "flex flex-col items-center rounded-lg border border-border bg-card p-4",
        className,
      )}
    >
      <h2 className="mb-3 flex w-full items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:heart-pulse" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>
      <div
        className="relative grid h-32 w-32 place-items-center"
        role="img"
        aria-label={COPY.ariaLabel(score, meta.label)}
      >
        <svg viewBox="0 0 80 80" className="h-32 w-32 -rotate-90">
          <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            className={meta.ring}
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{score}</span>
          <span className={cn("text-xs font-medium", meta.text)}>{meta.label}</span>
        </div>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon icon={meta.icon} size={13} className={meta.text} />
        {COPY.summary(overdueCount, upcomingCount)}
      </p>
    </section>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/VehicleHealthCard.tsx` → exit 0.

- [ ] **Step 3: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/VehicleHealthCard.tsx
git add src/features/vehicles/components/detail/VehicleHealthCard.tsx
git commit -m "feat: add VehicleHealthCard ring gauge"
```

---

## Task 5: VehicleKmEvolutionCard

**Files:**

- Create: `src/features/vehicles/components/detail/VehicleKmEvolutionCard.tsx`

- [ ] **Step 1: Create the component** (mirrors `CustomerPurchaseEvolutionCard`)

```tsx
import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { buildKmSeries } from "../../utils/kmSeries";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.kmEvolution;

export interface IVehicleKmEvolutionCardProps {
  vehicle: IVehicle;
  now?: Date;
  className?: string;
}

export function VehicleKmEvolutionCard({
  vehicle,
  now = new Date(),
  className,
}: IVehicleKmEvolutionCardProps) {
  const series = useMemo(() => buildKmSeries(vehicle, now), [vehicle, now]);
  const hasData = series.length >= 2;

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
        <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">
          {COPY.empty}
        </div>
      ) : (
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="vehicleKmArea" x1="0" y1="0" x2="0" y2="1">
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
              <YAxis hide domain={["dataMin", "dataMax"]} />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--muted-foreground)" }}
                formatter={(value: unknown) => [
                  `${(value as number).toLocaleString("pt-BR")} km`,
                  COPY.tooltip,
                ]}
              />
              <Area
                type="monotone"
                dataKey="km"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#vehicleKmArea)"
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

- [ ] **Step 2: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/VehicleKmEvolutionCard.tsx` → exit 0.

- [ ] **Step 3: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/VehicleKmEvolutionCard.tsx
git add src/features/vehicles/components/detail/VehicleKmEvolutionCard.tsx
git commit -m "feat: add VehicleKmEvolutionCard area chart"
```

---

## Task 6: MostReplacedPartsCard

**Files:**

- Create: `src/features/vehicles/components/detail/MostReplacedPartsCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { rankParts } from "../../utils/partsRanking";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.parts;

export interface IMostReplacedPartsCardProps {
  vehicle: IVehicle;
  className?: string;
}

export function MostReplacedPartsCard({ vehicle, className }: IMostReplacedPartsCardProps) {
  const ranked = rankParts(vehicle);
  const max = ranked[0]?.count ?? 1;

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:podium" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>
      {ranked.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ul className="space-y-2.5">
          {ranked.map((part) => (
            <li key={part.name} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{part.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {COPY.times(part.count)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(part.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/MostReplacedPartsCard.tsx` → exit 0.

- [ ] **Step 3: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/MostReplacedPartsCard.tsx
git add src/features/vehicles/components/detail/MostReplacedPartsCard.tsx
git commit -m "feat: add MostReplacedPartsCard ranking"
```

---

## Task 7: OwnerFleetCard

**Files:**

- Create: `src/features/vehicles/components/detail/OwnerFleetCard.tsx`

- [ ] **Step 1: Create the component** (uses `provider.listByCustomer`, excludes current vehicle)

```tsx
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABEL,
  formatPlate,
  iconForBrand,
} from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.fleet;

export interface IOwnerFleetCardProps {
  customerId: ID;
  currentVehicleId: ID;
  className?: string;
}

export function OwnerFleetCard({ customerId, currentVehicleId, className }: IOwnerFleetCardProps) {
  const provider = useVehiclesProvider();
  const query = useQuery({
    queryKey: ["vehicle-owner-fleet", customerId] as const,
    queryFn: () => provider.listByCustomer(customerId),
    staleTime: 60_000,
  });

  const others = (query.data ?? []).filter((v) => v.id !== currentVehicleId);

  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
        <Icon icon="mdi:truck-multiple-outline" size={16} className="text-muted-foreground" />
        {COPY.title}
      </h2>
      {query.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : query.isError ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{COPY.loadError}</p>
      ) : others.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{COPY.empty}</p>
      ) : (
        <ul className="space-y-2">
          {others.map((v) => (
            <li key={v.id}>
              <Link
                to="/app/veiculos/$id"
                params={{ id: v.id }}
                className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 transition-colors hover:border-primary/30"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                  <Icon icon={iconForBrand(v.brand)} size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {v.brand} {v.model} · {v.year}
                  </p>
                  <p className="truncate font-mono text-[11px] uppercase text-muted-foreground">
                    {formatPlate(v.plate)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", STATUS_BADGE_CLASSES[v.cadastroStatus])}
                >
                  {STATUS_LABEL[v.cadastroStatus]}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/OwnerFleetCard.tsx` → exit 0.

- [ ] **Step 3: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/OwnerFleetCard.tsx
git add src/features/vehicles/components/detail/OwnerFleetCard.tsx
git commit -m "feat: add OwnerFleetCard cross-sell list"
```

---

## Task 8: ServiceHistoryTimeline summary mode + VehicleHistorySection

**Files:**

- Modify: `src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx` (full replacement below — additive props)
- Create: `src/features/vehicles/components/detail/VehicleHistorySection.tsx`

- [ ] **Step 1: Replace `ServiceHistoryTimeline.tsx` with this version** (adds `limit`, `title`, `onSeeAll`; default behavior unchanged)

```tsx
import { useMemo } from "react";
import type { IVehicle, IVehicleServiceEntry } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/shared/utils/format";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.history;
const SECTION_COPY = VEHICLE_STRINGS.detail.sections;

export interface IServiceHistoryTimelineProps {
  vehicle: IVehicle;
  canEdit?: boolean;
  onAddService?: () => void;
  /** When set, only the latest N entries render (summary mode). */
  limit?: number;
  /** Heading override (defaults to the section title). */
  title?: string;
  /** Shown as a "see all" button when the list is truncated by `limit`. */
  onSeeAll?: () => void;
}

export function ServiceHistoryTimeline({
  vehicle,
  canEdit,
  onAddService,
  limit,
  title,
  onSeeAll,
}: IServiceHistoryTimelineProps) {
  const sorted = useMemo<IVehicleServiceEntry[]>(
    () => [...vehicle.serviceHistory].sort((a, b) => b.date.localeCompare(a.date)),
    [vehicle.serviceHistory],
  );
  const visible = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  const truncated = typeof limit === "number" && sorted.length > limit;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title ?? SECTION_COPY.history}
      </h2>
      {sorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 px-5 py-5">
          <ol aria-hidden="true" className="mb-4 space-y-3 border-l border-border pl-4">
            {[0, 1, 2].map((i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-0.5 h-3 w-3 rounded-full border border-border bg-muted/50" />
                <div className="space-y-1.5">
                  <div className="h-2.5 w-2/5 rounded bg-foreground/[0.06]" />
                  <div className="h-2.5 w-3/5 rounded bg-foreground/[0.03]" />
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-sm text-xs text-muted-foreground">{COPY.emptyAutoHint}</p>
            {canEdit && onAddService && (
              <Button size="sm" onClick={onAddService}>
                <Icon icon="mdi:wrench" size={14} />
                {COPY.emptyCta}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <ol className="relative space-y-3 border-l border-border pl-4">
            {visible.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[21px] top-1 grid h-3 w-3 place-items-center rounded-full border border-border bg-primary" />
                <div className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {formatDateBR(entry.date)}
                    </span>
                    {entry.km !== undefined && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {entry.km.toLocaleString("pt-BR")} km
                      </span>
                    )}
                  </div>
                  {entry.parts.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {entry.parts.map((p, i) => (
                        <Badge
                          key={`${entry.id}-${i}`}
                          variant="outline"
                          className="text-[10px] text-muted-foreground"
                        >
                          {p}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {entry.orderId && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <Icon icon="mdi:link-variant" size={10} className="-mt-0.5 inline" />{" "}
                      {COPY.derivedFromOrder} {entry.orderId}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {truncated && onSeeAll && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={onSeeAll}>
              {COPY.seeAll}
              <Icon icon="mdi:arrow-down" size={14} />
            </Button>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create `VehicleHistorySection.tsx`** (forwardRef so the page can scroll to it)

```tsx
import { forwardRef } from "react";
import type { IVehicle } from "@/shared/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ServiceHistoryTimeline } from "./ServiceHistoryTimeline";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";

const COPY = VEHICLE_STRINGS.detail.history;

export interface IVehicleHistorySectionProps {
  vehicle: IVehicle;
  canEdit?: boolean;
  onAddService?: () => void;
}

/**
 * Long-content area below the bento. Tabs are scaffolded for future sections
 * (documents, costs); for now the single "Histórico completo" tab holds the
 * full service timeline.
 */
export const VehicleHistorySection = forwardRef<HTMLDivElement, IVehicleHistorySectionProps>(
  function VehicleHistorySection({ vehicle, canEdit, onAddService }, ref) {
    return (
      <div ref={ref} className="scroll-mt-6 rounded-lg border border-border bg-card p-4">
        <Tabs defaultValue="history">
          <TabsList>
            <TabsTrigger value="history">{COPY.fullTab}</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="mt-4">
            <ServiceHistoryTimeline
              vehicle={vehicle}
              canEdit={canEdit}
              onAddService={onAddService}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  },
);
```

- [ ] **Step 3: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx src/features/vehicles/components/detail/VehicleHistorySection.tsx` → exit 0.

- [ ] **Step 4: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx src/features/vehicles/components/detail/VehicleHistorySection.tsx
git add src/features/vehicles/components/detail/ServiceHistoryTimeline.tsx src/features/vehicles/components/detail/VehicleHistorySection.tsx
git commit -m "feat: add history summary mode and tabbed full-history section"
```

---

## Task 9: Layout composers (A / B / C)

**Files:**

- Create: `src/features/vehicles/components/detail/layouts/types.ts`
- Create: `src/features/vehicles/components/detail/layouts/VehicleLayoutHealth.tsx`
- Create: `src/features/vehicles/components/detail/layouts/VehicleLayoutRails.tsx`
- Create: `src/features/vehicles/components/detail/layouts/VehicleLayoutBento.tsx`

> Borderless sections (`MaintenanceRecommendations`, `ServiceHistoryTimeline`, `VehicleOwnerCard`) are wrapped in a `rounded-lg border border-border bg-card p-4` tile when they sit next to card components, for visual parity. Card-providing components (`VehicleHealthCard`, `VehicleKmEvolutionCard`, `MostReplacedPartsCard`, `OwnerFleetCard`, `CompatiblePartsPlaceholder`) are placed directly and receive `className` for grid spans.

- [ ] **Step 1: Create `layouts/types.ts`**

```ts
import type { IVehicle } from "@/shared/types";

/** Shared contract for all three layout composers — they only arrange cards. */
export interface IVehicleLayoutProps {
  vehicle: IVehicle;
  now: Date;
  canEdit: boolean;
  onAddService: () => void;
  onUpdated: () => void;
  onSeeFullHistory: () => void;
}
```

- [ ] **Step 2: Create `VehicleLayoutHealth.tsx`** (mode A — default)

```tsx
import { VehicleHealthCard } from "../VehicleHealthCard";
import { VehicleKmEvolutionCard } from "../VehicleKmEvolutionCard";
import { MaintenanceRecommendations } from "../MaintenanceRecommendations";
import { ServiceHistoryTimeline } from "../ServiceHistoryTimeline";
import { VehicleOwnerCard } from "../VehicleOwnerCard";
import { OwnerFleetCard } from "../OwnerFleetCard";
import { MostReplacedPartsCard } from "../MostReplacedPartsCard";
import { VehicleTechSpecs } from "../VehicleTechSpecs";
import { CompatiblePartsPlaceholder } from "../CompatiblePartsPlaceholder";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import type { IVehicleLayoutProps } from "./types";

const HISTORY_COPY = VEHICLE_STRINGS.detail.history;

export function VehicleLayoutHealth({
  vehicle,
  now,
  canEdit,
  onAddService,
  onUpdated,
  onSeeFullHistory,
}: IVehicleLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <VehicleHealthCard vehicle={vehicle} className="lg:col-span-3" />
        <VehicleKmEvolutionCard vehicle={vehicle} now={now} className="lg:col-span-6" />
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-3">
          <MaintenanceRecommendations vehicle={vehicle} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-lg border border-border bg-card p-4 lg:col-span-8">
          <ServiceHistoryTimeline
            vehicle={vehicle}
            canEdit={canEdit}
            onAddService={onAddService}
            limit={3}
            title={HISTORY_COPY.summaryTitle}
            onSeeAll={onSeeFullHistory}
          />
        </div>
        <div className="space-y-6 lg:col-span-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <VehicleOwnerCard customerId={vehicle.customerId} />
          </div>
          <OwnerFleetCard customerId={vehicle.customerId} currentVehicleId={vehicle.id} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <MostReplacedPartsCard vehicle={vehicle} className="lg:col-span-6" />
        <div className="space-y-6 lg:col-span-6">
          <VehicleTechSpecs vehicle={vehicle} canEdit={canEdit} onUpdated={onUpdated} />
          <CompatiblePartsPlaceholder vehicle={vehicle} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `VehicleLayoutRails.tsx`** (mode B — classic CRM with sticky aside)

```tsx
import { VehicleHealthCard } from "../VehicleHealthCard";
import { VehicleKmEvolutionCard } from "../VehicleKmEvolutionCard";
import { MaintenanceRecommendations } from "../MaintenanceRecommendations";
import { ServiceHistoryTimeline } from "../ServiceHistoryTimeline";
import { VehicleOwnerCard } from "../VehicleOwnerCard";
import { OwnerFleetCard } from "../OwnerFleetCard";
import { MostReplacedPartsCard } from "../MostReplacedPartsCard";
import { VehicleTechSpecs } from "../VehicleTechSpecs";
import { CompatiblePartsPlaceholder } from "../CompatiblePartsPlaceholder";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import type { IVehicleLayoutProps } from "./types";

const HISTORY_COPY = VEHICLE_STRINGS.detail.history;

export function VehicleLayoutRails({
  vehicle,
  now,
  canEdit,
  onAddService,
  onUpdated,
  onSeeFullHistory,
}: IVehicleLayoutProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <VehicleKmEvolutionCard vehicle={vehicle} now={now} className="lg:col-span-8" />
        <VehicleHealthCard vehicle={vehicle} className="lg:col-span-4" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <div className="rounded-lg border border-border bg-card p-4">
            <ServiceHistoryTimeline
              vehicle={vehicle}
              canEdit={canEdit}
              onAddService={onAddService}
              limit={3}
              title={HISTORY_COPY.summaryTitle}
              onSeeAll={onSeeFullHistory}
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <MaintenanceRecommendations vehicle={vehicle} />
          </div>
          <MostReplacedPartsCard vehicle={vehicle} />
        </div>
        <aside className="space-y-6 lg:sticky lg:top-6 lg:col-span-4 lg:self-start">
          <div className="rounded-lg border border-border bg-card p-4">
            <VehicleOwnerCard customerId={vehicle.customerId} />
          </div>
          <OwnerFleetCard customerId={vehicle.customerId} currentVehicleId={vehicle.id} />
          <VehicleTechSpecs vehicle={vehicle} canEdit={canEdit} onUpdated={onUpdated} />
          <CompatiblePartsPlaceholder vehicle={vehicle} />
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `VehicleLayoutBento.tsx`** (mode C — modular mosaic)

```tsx
import { VehicleHealthCard } from "../VehicleHealthCard";
import { VehicleKmEvolutionCard } from "../VehicleKmEvolutionCard";
import { MaintenanceRecommendations } from "../MaintenanceRecommendations";
import { ServiceHistoryTimeline } from "../ServiceHistoryTimeline";
import { VehicleOwnerCard } from "../VehicleOwnerCard";
import { OwnerFleetCard } from "../OwnerFleetCard";
import { MostReplacedPartsCard } from "../MostReplacedPartsCard";
import { VehicleTechSpecs } from "../VehicleTechSpecs";
import { CompatiblePartsPlaceholder } from "../CompatiblePartsPlaceholder";
import { VEHICLE_STRINGS } from "../../../i18n/pt-BR";
import type { IVehicleLayoutProps } from "./types";

const HISTORY_COPY = VEHICLE_STRINGS.detail.history;

export function VehicleLayoutBento({
  vehicle,
  now,
  canEdit,
  onAddService,
  onUpdated,
  onSeeFullHistory,
}: IVehicleLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      <VehicleHealthCard vehicle={vehicle} />
      <VehicleKmEvolutionCard vehicle={vehicle} now={now} className="md:col-span-2" />
      <div className="rounded-lg border border-border bg-card p-4">
        <MaintenanceRecommendations vehicle={vehicle} />
      </div>

      <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
        <ServiceHistoryTimeline
          vehicle={vehicle}
          canEdit={canEdit}
          onAddService={onAddService}
          limit={3}
          title={HISTORY_COPY.summaryTitle}
          onSeeAll={onSeeFullHistory}
        />
      </div>
      <MostReplacedPartsCard vehicle={vehicle} className="md:col-span-2" />

      <div className="rounded-lg border border-border bg-card p-4">
        <VehicleOwnerCard customerId={vehicle.customerId} />
      </div>
      <OwnerFleetCard customerId={vehicle.customerId} currentVehicleId={vehicle.id} />
      <div className="rounded-lg border border-border bg-card p-4 md:col-span-2">
        <VehicleTechSpecs vehicle={vehicle} canEdit={canEdit} onUpdated={onUpdated} />
      </div>
      <CompatiblePartsPlaceholder vehicle={vehicle} className="md:col-span-2" />
    </div>
  );
}
```

> **Note:** `CompatiblePartsPlaceholder` must accept an optional `className`. If it does not already, add `className?: string` to its props and merge it via `cn(...)` on its root element as part of this step (check the file first; if it already forwards `className`, no change needed).

- [ ] **Step 5: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/layouts/` → exit 0.

- [ ] **Step 6: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/layouts/
git add src/features/vehicles/components/detail/layouts/ src/features/vehicles/components/detail/CompatiblePartsPlaceholder.tsx
git commit -m "feat: add vehicle detail layout composers (health, rails, bento)"
```

---

## Task 10: Layout preference (config + hook + switcher)

**Files:**

- Create: `src/features/vehicles/config/layout.ts`
- Create: `src/features/vehicles/hooks/useVehicleDetailLayout.ts`
- Create: `src/features/vehicles/components/detail/VehicleLayoutSwitcher.tsx`

- [ ] **Step 1: Create `config/layout.ts`**

```ts
export type VehicleDetailLayout = "health" | "rails" | "bento";

export const VEHICLE_DETAIL_LAYOUTS: VehicleDetailLayout[] = ["health", "rails", "bento"];

export const DEFAULT_VEHICLE_DETAIL_LAYOUT: VehicleDetailLayout = "health";

export const VEHICLE_LAYOUT_STORAGE_KEY = "gallo-vehicle-detail-layout";
```

- [ ] **Step 2: Create `hooks/useVehicleDetailLayout.ts`**

```ts
import { useCallback, useState } from "react";
import {
  DEFAULT_VEHICLE_DETAIL_LAYOUT,
  VEHICLE_DETAIL_LAYOUTS,
  VEHICLE_LAYOUT_STORAGE_KEY,
  type VehicleDetailLayout,
} from "../config/layout";

function readStoredLayout(): VehicleDetailLayout {
  if (typeof window === "undefined") return DEFAULT_VEHICLE_DETAIL_LAYOUT;
  const raw = window.localStorage.getItem(VEHICLE_LAYOUT_STORAGE_KEY);
  return VEHICLE_DETAIL_LAYOUTS.includes(raw as VehicleDetailLayout)
    ? (raw as VehicleDetailLayout)
    : DEFAULT_VEHICLE_DETAIL_LAYOUT;
}

/**
 * Global (all-vehicles) layout preference, persisted to localStorage. Reads
 * synchronously on first render (lazy initializer) so the correct layout paints
 * first — no flash of the default.
 */
export function useVehicleDetailLayout(): [
  VehicleDetailLayout,
  (layout: VehicleDetailLayout) => void,
] {
  const [layout, setLayoutState] = useState<VehicleDetailLayout>(readStoredLayout);

  const setLayout = useCallback((next: VehicleDetailLayout) => {
    setLayoutState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VEHICLE_LAYOUT_STORAGE_KEY, next);
    }
  }, []);

  return [layout, setLayout];
}
```

- [ ] **Step 3: Create `VehicleLayoutSwitcher.tsx`** (mirrors the `LeadsHeader` ToggleGroup idiom)

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";
import { VEHICLE_DETAIL_LAYOUTS, type VehicleDetailLayout } from "../../config/layout";

const COPY = VEHICLE_STRINGS.detail.layout;

const ICONS: Record<VehicleDetailLayout, string> = {
  health: "mdi:heart-pulse",
  rails: "mdi:view-split-vertical",
  bento: "mdi:view-grid-outline",
};

const LABELS: Record<VehicleDetailLayout, string> = {
  health: COPY.health,
  rails: COPY.rails,
  bento: COPY.bento,
};

export interface IVehicleLayoutSwitcherProps {
  value: VehicleDetailLayout;
  onChange: (layout: VehicleDetailLayout) => void;
}

export function VehicleLayoutSwitcher({ value, onChange }: IVehicleLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as VehicleDetailLayout);
      }}
      variant="outline"
      size="sm"
      aria-label={COPY.ariaLabel}
    >
      {VEHICLE_DETAIL_LAYOUTS.map((layout) => (
        <ToggleGroupItem key={layout} value={layout} aria-label={LABELS[layout]}>
          <Icon icon={ICONS[layout]} size={16} />
          <span className="ml-1 hidden sm:inline">{LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 4: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/config/layout.ts src/features/vehicles/hooks/useVehicleDetailLayout.ts src/features/vehicles/components/detail/VehicleLayoutSwitcher.tsx` → exit 0.

- [ ] **Step 5: Format + commit**

```bash
bunx prettier --write src/features/vehicles/config/layout.ts src/features/vehicles/hooks/useVehicleDetailLayout.ts src/features/vehicles/components/detail/VehicleLayoutSwitcher.tsx
git add src/features/vehicles/config/layout.ts src/features/vehicles/hooks/useVehicleDetailLayout.ts src/features/vehicles/components/detail/VehicleLayoutSwitcher.tsx
git commit -m "feat: add vehicle detail layout preference and switcher"
```

---

## Task 11: Wire the page + header together

**Files:**

- Modify: `src/features/vehicles/components/detail/VehicleDetailHeader.tsx` (full replacement below)
- Modify: `src/features/vehicles/pages/VehicleDetailPage.tsx` (full replacement below)

- [ ] **Step 1: Replace `VehicleDetailHeader.tsx`** (1600 rail + always-visible switcher)

```tsx
import { Link } from "@tanstack/react-router";
import type { IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { STATUS_BADGE_CLASSES, STATUS_LABEL, iconForBrand } from "../../utils/vehicleDisplay";
import { VEHICLE_STRINGS } from "../../i18n/pt-BR";
import { VehicleLayoutSwitcher } from "./VehicleLayoutSwitcher";
import type { VehicleDetailLayout } from "../../config/layout";

export interface IVehicleDetailHeaderProps {
  vehicle: IVehicle;
  canEdit: boolean;
  onEdit: () => void;
  onAddService: () => void;
  layout: VehicleDetailLayout;
  onLayoutChange: (layout: VehicleDetailLayout) => void;
}

export function VehicleDetailHeader({
  vehicle,
  canEdit,
  onEdit,
  onAddService,
  layout,
  onLayoutChange,
}: IVehicleDetailHeaderProps) {
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
        <Link
          to="/app/veiculos"
          className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Icon icon="mdi:arrow-left" size={14} />
          {VEHICLE_STRINGS.detail.backToList}
        </Link>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Icon icon={iconForBrand(vehicle.brand)} size={28} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground sm:text-xl">
              <span>
                {vehicle.brand} {vehicle.model}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  · {vehicle.year}
                </span>
              </span>
              <Badge
                variant="outline"
                className={cn("text-xs", STATUS_BADGE_CLASSES[vehicle.cadastroStatus])}
              >
                {STATUS_LABEL[vehicle.cadastroStatus]}
              </Badge>
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded border border-border bg-muted px-1.5 font-mono uppercase text-foreground">
                {vehicle.plate ?? "—"}
              </span>
              <span aria-hidden>·</span>
              <span>{vehicle.engine || "—"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <VehicleLayoutSwitcher value={layout} onChange={onLayoutChange} />
            {canEdit && (
              <>
                <Button variant="outline" size="sm" onClick={onEdit}>
                  <Icon icon="mdi:pencil" size={14} />
                  {VEHICLE_STRINGS.detail.edit}
                </Button>
                <Button size="sm" onClick={onAddService}>
                  <Icon icon="mdi:wrench" size={14} />
                  {VEHICLE_STRINGS.detail.addService}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `VehicleDetailPage.tsx`** (1600 rail, layout state, new composition; mutations/modals unchanged)

```tsx
import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ID } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useVehicleDetail } from "../hooks/useVehicleDetail";
import { useVehicleDetailLayout } from "../hooks/useVehicleDetailLayout";
import { VehicleDetailHeader } from "../components/detail/VehicleDetailHeader";
import { VehicleStatusBanner } from "../components/detail/VehicleStatusBanner";
import { VehicleStatStrip } from "../components/detail/VehicleStatStrip";
import { VehicleHistorySection } from "../components/detail/VehicleHistorySection";
import { VehicleLayoutHealth } from "../components/detail/layouts/VehicleLayoutHealth";
import { VehicleLayoutRails } from "../components/detail/layouts/VehicleLayoutRails";
import { VehicleLayoutBento } from "../components/detail/layouts/VehicleLayoutBento";
import type { IVehicleLayoutProps } from "../components/detail/layouts/types";
import { EditVehicleModal } from "../components/EditVehicleModal";
import { AddServiceEntryModal } from "../components/detail/AddServiceEntryModal";
import { VEHICLE_STRINGS } from "../i18n/pt-BR";

export function VehicleDetailPage() {
  const { id } = useParams({ from: "/app/veiculos/$id" });
  const detail = useVehicleDetail(id as ID);
  const provider = useVehiclesProvider();
  const navigate = useNavigate();
  const canEdit = usePermission("vehicle", "edit");
  const canApprove = usePermission("vehicle", "approve");
  const [layout, setLayout] = useVehicleDetailLayout();

  const [editOpen, setEditOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const historyRef = useRef<HTMLDivElement>(null);
  const now = useMemo(() => new Date(), []);

  if (detail.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const vehicle = detail.vehicle;
  if (!vehicle) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="mdi:truck-remove-outline" size={24} />
        </div>
        <p className="text-sm font-semibold text-foreground">{VEHICLE_STRINGS.detail.notFound}</p>
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/app/veiculos" })}>
          <Icon icon="mdi:arrow-left" size={14} />
          {VEHICLE_STRINGS.detail.backToList}
        </Button>
      </div>
    );
  }

  const handleApprove = async () => {
    await provider.update(vehicle.id, { cadastroStatus: "aprovado" });
    auditLog({
      action: "vehicle.approved",
      resource: "vehicle",
      resourceId: vehicle.id,
      before: { cadastroStatus: vehicle.cadastroStatus },
      after: { cadastroStatus: "aprovado" },
    });
    toast.success("Veículo aprovado.");
    await detail.invalidate();
  };

  const handleReject = async () => {
    await provider.update(vehicle.id, { cadastroStatus: "rejeitado" });
    auditLog({
      action: "vehicle.rejected",
      resource: "vehicle",
      resourceId: vehicle.id,
      before: { cadastroStatus: vehicle.cadastroStatus },
      after: { cadastroStatus: "rejeitado", reason: rejectReason || undefined },
    });
    toast.success("Veículo rejeitado.");
    setRejectReason("");
    setRejectOpen(false);
    await detail.invalidate();
  };

  const goToFullHistory = () =>
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const layoutProps: IVehicleLayoutProps = {
    vehicle,
    now,
    canEdit,
    onAddService: () => setServiceOpen(true),
    onUpdated: () => void detail.invalidate(),
    onSeeFullHistory: goToFullHistory,
  };

  return (
    <div className="flex min-h-full flex-col bg-background">
      <VehicleDetailHeader
        vehicle={vehicle}
        canEdit={canEdit}
        onEdit={() => setEditOpen(true)}
        onAddService={() => setServiceOpen(true)}
        layout={layout}
        onLayoutChange={setLayout}
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        <VehicleStatusBanner
          vehicle={vehicle}
          canApprove={canApprove}
          onApprove={() => void handleApprove()}
          onReject={() => setRejectOpen(true)}
        />

        <VehicleStatStrip vehicle={vehicle} now={now} />

        {layout === "health" && <VehicleLayoutHealth {...layoutProps} />}
        {layout === "rails" && <VehicleLayoutRails {...layoutProps} />}
        {layout === "bento" && <VehicleLayoutBento {...layoutProps} />}

        <VehicleHistorySection
          ref={historyRef}
          vehicle={vehicle}
          canEdit={canEdit}
          onAddService={() => setServiceOpen(true)}
        />
      </div>

      <EditVehicleModal
        open={editOpen}
        vehicle={vehicle}
        onClose={() => setEditOpen(false)}
        onSaved={() => void detail.invalidate()}
      />

      <AddServiceEntryModal
        open={serviceOpen}
        vehicle={vehicle}
        onClose={() => setServiceOpen(false)}
        onSaved={() => void detail.invalidate()}
      />

      <AlertDialog open={rejectOpen} onOpenChange={(o) => !o && setRejectOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{VEHICLE_STRINGS.bulk.rejectReasonTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              Informe um motivo para a rejeição (opcional). O vendedor que cadastrou poderá
              reapresentar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label className="text-xs">{VEHICLE_STRINGS.bulk.rejectReasonPlaceholder}</Label>
            <Textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectReason("")}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleReject()}>
              {VEHICLE_STRINGS.bulk.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 3: Verify build + lint**

Run: `bun run build` → `✓ built`.
Run: `bunx eslint src/features/vehicles/components/detail/VehicleDetailHeader.tsx src/features/vehicles/pages/VehicleDetailPage.tsx` → exit 0.

- [ ] **Step 4: Restart dev server to clear Vite cache** (HMR on 5173 has been flaky; do a clean restart so the user can validate)

```bash
# kill listener on 5173, clear cache, restart in background
taskkill //PID <pid-on-5173> //F ; rm -rf node_modules/.vite ; bun run dev
```

- [ ] **Step 5: Format + commit**

```bash
bunx prettier --write src/features/vehicles/components/detail/VehicleDetailHeader.tsx src/features/vehicles/pages/VehicleDetailPage.tsx
git add src/features/vehicles/components/detail/VehicleDetailHeader.tsx src/features/vehicles/pages/VehicleDetailPage.tsx
git commit -m "feat: wire vehicle detail redesign (1600 rail, layout switcher, enriched bento)"
```

---

## Task 12: Final verification, manual QA, version bump

**Files:**

- Modify: `package.json`, `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Full build + lint of the whole project**

Run: `bun run build` → `✓ built`, no TS errors.
Run: `bunx eslint .` → exit 0.

- [ ] **Step 2: Manual QA checklist (user-driven — do NOT open a browser to validate)**
  - Switch Saúde / Trilhos / Bento — content recomposes; selection persists across reload (localStorage `gallo-vehicle-detail-layout`).
  - Rich-history vehicle (e.g. `/app/veiculos/vehicle-0059`): KM chart renders, health ring reflects overdue/upcoming, parts ranking populated, fleet lists siblings.
  - Sparse vehicle (no km / no history): every block shows its empty state; KPIs degrade to "—"/"Sem visitas"; no crash.
  - Pending vehicle: status banner still shows; approve/reject still work.
  - "Ver histórico completo" scrolls to the tabbed full history.
  - Single vertical scrollbar (v0.49.1 fix holds); 1600px width; light/dark + each theme; responsive at 1024/768/375.

- [ ] **Step 3: Bump version → 0.50.0 (MINOR, new codename `Cockpit`)**

In `package.json`: `"version": "0.49.2"` → `"version": "0.50.0"`.

In `CHANGELOG.md`, add at the top (below the header lines):

```markdown
## [0.50.0] — Cockpit · 2026-05-30

Redesenho da página de detalhamento do veículo: largura ampla (1600px), faixa de indicadores no topo e três modos de visualização que o usuário escolhe (Saúde, Trilhos e Bento), além de novos blocos de inteligência.

### Added

- **Três modos de layout no detalhe do veículo** — seletor no cabeçalho alterna entre **Saúde** (padrão), **Trilhos** e **Bento**; a preferência é lembrada para todos os veículos.
- **Faixa de indicadores** — KM atual, próxima manutenção, manutenções vencidas, última visita e uso (km/ano).
- **Saúde do veículo** — medidor visual consolidando o estado das manutenções (em dia / atenção / vencido).
- **Evolução de KM** — gráfico da quilometragem ao longo do tempo.
- **Frota do proprietário** — outras unidades do mesmo cliente, com atalho.
- **Peças mais trocadas** — ranking das peças mais frequentes no histórico.

### Changed

- **Detalhe do veículo em largura ampla (1600px)** — aproveita melhor telas largas e reorganiza o conteúdo em cards.
- **Histórico de manutenção** — resumo no painel principal com atalho para o histórico completo na área de abas.
```

In `CLAUDE.md`, update the version line:
`- **SemVer.** MINOR/MAJOR recebem **codinome em inglês** (atual: \`Cockpit\` — v0.50.0).`

- [ ] **Step 4: Build once more (version is injected via `__APP_VERSION__`) + commit**

Run: `bun run build` → `✓ built`.

```bash
bunx prettier --write package.json CHANGELOG.md
git add package.json CHANGELOG.md CLAUDE.md
git commit -m "chore: bump version to 0.50.0 Cockpit"
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/vehicle-detail-redesign
gh pr create --base main --head feat/vehicle-detail-redesign \
  --title "feat: vehicle detail redesign with 3 layout modes (v0.50.0 Cockpit)" \
  --body "Implements docs/superpowers/specs/2026-05-30-vehicle-detail-redesign-design.md"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** §3 decisions 1–7 → Tasks 10/11 (modes+switcher+persistence+1600), Task 3 (KPI strip), Tasks 4–7 (4 enrichment blocks), Task 8 (hybrid tabs). §6 derivations → Task 1. §9 i18n → Task 2. §7 tokens/charts → enforced in component tasks. All covered.
- **Placeholder scan:** no TBD/TODO; every code step has full code. The only conditional is Task 9 Step 4's `className` check on `CompatiblePartsPlaceholder` (explicit, with the exact change to make).
- **Type consistency:** `IVehicleLayoutProps` defined in Task 9 (`layouts/types.ts`) and consumed identically in Tasks 9 & 11. `VehicleDetailLayout` defined in Task 10 and used in Tasks 10/11. `computeHealth`/`nextMaintenance`/`lastServiceEntry`/`usagePerYear`/`buildKmSeries`/`rankParts` signatures defined in Task 1 match their call sites in Tasks 3/4/5/6. Switcher `value/onChange` matches header `layout/onLayoutChange` → page `[layout, setLayout]`.

```

```
