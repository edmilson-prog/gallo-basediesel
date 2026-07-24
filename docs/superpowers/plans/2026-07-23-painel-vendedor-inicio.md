# Painel do Vendedor ("Início") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Painel não disponível para o seu papel" block that `/app/inicio` shows to the Vendedor role with a real, personal dashboard (greeting, 5 KPIs, monthly goal, activity chart, own queue, store ranking, and a placeholder "records" card).

**Architecture:** New self-contained feature `src/features/seller-dashboard/` that composes existing providers/engines (no new provider, no migration). Pure business logic lives in `engine/*.ts` (tested with Vitest); React Query hooks in `hooks/*.ts` mirror the established pattern from `useCustomerServiceMetrics`; presentational components in `components/*.tsx` consume the hooks. `ManagerDashboardPage.tsx` swaps its Vendedor `EmptyState` branch for `<SellerDashboardPage />`.

**Tech Stack:** React 19, TypeScript strict, TanStack Query, TanStack Router, Vitest, Tailwind v4 (semantic tokens only), recharts, Provider Pattern (`@/providers/data`).

## Global Constraints

- Provider Pattern only — never import `@/mocks` or `@/providers/data/impl/*` directly; use the `@/providers/data` barrel.
- User-facing strings: português do Brasil with correct accents, centralized in `i18n/pt-BR.ts`. Code/comments: English.
- No hardcoded hex colors — use semantic Tailwind tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `border`, `text-severity-*`) and CSS vars (`var(--border)`, `var(--primary)`) inside `recharts` props.
- TDD for every pure function in `engine/`: write the failing test first.
- File/dir naming: kebab-case files, PascalCase components, camelCase functions/hooks, `I`-prefixed interfaces.
- No database migration in this feature — every data point is sourced from providers/engines that already exist in production.
- Single PR for the whole feature (per spec's delivery sequence decision).

---

## File Structure

```
src/features/seller-dashboard/
├── index.ts                          # barrel — exports SellerDashboardPage only
├── i18n/
│   └── pt-BR.ts                      # SELLER_DASHBOARD_STRINGS
├── engine/
│   ├── period.ts                     # resolveSellerPeriod (pure)
│   ├── period.test.ts
│   ├── formatters.ts                 # formatMinutesLabel, formatWaitLabel, greetingLabel (pure)
│   ├── formatters.test.ts
│   ├── hourlyActivity.ts             # bucketConversationsByHour (pure)
│   ├── hourlyActivity.test.ts
│   ├── goalPace.ts                   # deriveGoalPace (pure)
│   └── goalPace.test.ts
├── hooks/
│   ├── useSellerPeriod.ts            # period state (wraps engine/period.ts)
│   ├── useSellerServiceMetrics.ts    # conversations+messages+orders+escalations → KPIs
│   ├── useSellerGoalProgress.ts      # goals → goal + pace
│   ├── useSellerQueue.ts             # idle summary → queue entries
│   └── useSellerRanking.ts           # gamification ranking → this seller's entry
├── components/
│   ├── SellerGreeting.tsx            # header + period toggle
│   ├── SellerKpiRow.tsx              # 5 KPI cards
│   ├── SellerGoalCard.tsx            # monthly goal progress
│   ├── SellerActivityChart.tsx       # recharts bar chart (hourly/daily)
│   ├── SellerQueueCard.tsx           # "sua fila agora"
│   ├── SellerRankingCard.tsx         # store ranking position
│   └── SellerRecordsCard.tsx         # static "em breve" placeholder
└── pages/
    └── SellerDashboardPage.tsx       # composition root
```

**Modify:**
- `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx:1-78` — swap the Vendedor `EmptyState` branch for `<SellerDashboardPage />`; drop the now-unused `EmptyState` import.
- `src/features/manager-dashboard/i18n/pt-BR.ts:86-90` — remove the now-unused `noAccessTitle`/`noAccessDescription`/`noAccessCta` keys.

---

### Task 1: Period engine — `resolveSellerPeriod`

**Files:**
- Create: `src/features/seller-dashboard/engine/period.ts`
- Test: `src/features/seller-dashboard/engine/period.test.ts`

**Interfaces:**
- Produces: `type SellerPeriodKey = "hoje" | "7d" | "30d"`; `interface ISellerPeriodWindow { key: SellerPeriodKey; label: string; startIso: string; endIso: string; previousStartIso: string; previousEndIso: string }`; `function resolveSellerPeriod(key: SellerPeriodKey, nowIso: string): ISellerPeriodWindow`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/seller-dashboard/engine/period.test.ts
import { describe, expect, it } from "vitest";
import { resolveSellerPeriod } from "./period";

describe("resolveSellerPeriod", () => {
  it("resolves 'hoje' as a 1-day window ending now, with the previous 1-day window before it", () => {
    const w = resolveSellerPeriod("hoje", "2026-07-23T18:00:00.000Z");
    expect(w.label).toBe("Hoje");
    expect(w.endIso).toBe("2026-07-23T18:00:00.000Z");
    expect(w.startIso).toBe("2026-07-22T18:00:00.000Z");
    expect(w.previousEndIso).toBe(w.startIso);
    expect(w.previousStartIso).toBe("2026-07-21T18:00:00.000Z");
  });

  it("resolves '7d' and '30d' with matching-length previous windows", () => {
    const w7 = resolveSellerPeriod("7d", "2026-07-23T12:00:00.000Z");
    expect(w7.label).toBe("7 dias");
    expect(w7.startIso).toBe("2026-07-16T12:00:00.000Z");
    expect(w7.previousStartIso).toBe("2026-07-09T12:00:00.000Z");

    const w30 = resolveSellerPeriod("30d", "2026-07-23T12:00:00.000Z");
    expect(w30.label).toBe("30 dias");
    expect(w30.startIso).toBe("2026-06-23T12:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/seller-dashboard/engine/period.test.ts`
Expected: FAIL — `Cannot find module './period'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/seller-dashboard/engine/period.ts

export type SellerPeriodKey = "hoje" | "7d" | "30d";

export interface ISellerPeriodWindow {
  key: SellerPeriodKey;
  label: string;
  startIso: string;
  endIso: string;
  previousStartIso: string;
  previousEndIso: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<SellerPeriodKey, number> = { hoje: 1, "7d": 7, "30d": 30 };
const PERIOD_LABELS: Record<SellerPeriodKey, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
};

/**
 * Resolves a rolling window (and the matching-length window right before it,
 * for delta comparisons) ending at `nowIso`.
 */
export function resolveSellerPeriod(key: SellerPeriodKey, nowIso: string): ISellerPeriodWindow {
  const endMs = new Date(nowIso).getTime();
  const days = PERIOD_DAYS[key];
  const startMs = endMs - days * DAY_MS;
  const previousStartMs = startMs - days * DAY_MS;
  return {
    key,
    label: PERIOD_LABELS[key],
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    previousStartIso: new Date(previousStartMs).toISOString(),
    previousEndIso: new Date(startMs).toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/seller-dashboard/engine/period.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/seller-dashboard/engine/period.ts src/features/seller-dashboard/engine/period.test.ts
git commit -m "feat(seller-dashboard): add period window engine"
```

---

### Task 2: Formatters engine — minutes, wait time, greeting

**Files:**
- Create: `src/features/seller-dashboard/engine/formatters.ts`
- Test: `src/features/seller-dashboard/engine/formatters.test.ts`

**Interfaces:**
- Produces: `function formatMinutesLabel(ms: number): string`; `function formatWaitLabel(fromIso: string, now: Date): string`; `function greetingLabel(hour: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/seller-dashboard/engine/formatters.test.ts
import { describe, expect, it } from "vitest";
import { formatMinutesLabel, formatWaitLabel, greetingLabel } from "./formatters";

describe("formatMinutesLabel", () => {
  it("formats sub-hour durations as minutes", () => {
    expect(formatMinutesLabel(3 * 60_000)).toBe("3 min");
  });
  it("formats hour+minute durations", () => {
    expect(formatMinutesLabel(72 * 60_000)).toBe("1h 12min");
  });
  it("formats whole-hour durations without a minutes suffix", () => {
    expect(formatMinutesLabel(120 * 60_000)).toBe("2h");
  });
  it("returns an em dash for zero or negative durations", () => {
    expect(formatMinutesLabel(0)).toBe("—");
    expect(formatMinutesLabel(-5)).toBe("—");
  });
});

describe("formatWaitLabel", () => {
  const now = new Date("2026-07-23T18:00:00.000Z");
  it("formats minutes, hours and days", () => {
    expect(formatWaitLabel("2026-07-23T17:35:00.000Z", now)).toBe("25 min");
    expect(formatWaitLabel("2026-07-23T15:00:00.000Z", now)).toBe("3h");
    expect(formatWaitLabel("2026-07-19T16:00:00.000Z", now)).toBe("4d 2h");
  });
});

describe("greetingLabel", () => {
  it("returns the right greeting per hour bucket", () => {
    expect(greetingLabel(8)).toBe("Bom dia");
    expect(greetingLabel(14)).toBe("Boa tarde");
    expect(greetingLabel(21)).toBe("Boa noite");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/seller-dashboard/engine/formatters.test.ts`
Expected: FAIL — `Cannot find module './formatters'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/seller-dashboard/engine/formatters.ts

/** Compact duration label from milliseconds: "3 min", "1h 12min", "2h". */
export function formatMinutesLabel(ms: number): string {
  if (ms <= 0) return "—";
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`;
}

/** Compact elapsed-since label from an ISO instant: "25 min", "3h", "4d 2h". */
export function formatWaitLabel(fromIso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(fromIso).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

/** Time-of-day greeting in pt-BR from an hour-of-day (0-23). */
export function greetingLabel(hour: number): string {
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/seller-dashboard/engine/formatters.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/seller-dashboard/engine/formatters.ts src/features/seller-dashboard/engine/formatters.test.ts
git commit -m "feat(seller-dashboard): add formatting helpers"
```

---

### Task 3: Hourly activity engine — `bucketConversationsByHour`

**Files:**
- Create: `src/features/seller-dashboard/engine/hourlyActivity.ts`
- Test: `src/features/seller-dashboard/engine/hourlyActivity.test.ts`

**Interfaces:**
- Produces: `interface IHourlyActivityPoint { hour: number; label: string; count: number }`; `function bucketConversationsByHour(conversations: { createdAt: string }[], referenceIso: string): IHourlyActivityPoint[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/seller-dashboard/engine/hourlyActivity.test.ts
import { describe, expect, it } from "vitest";
import { bucketConversationsByHour } from "./hourlyActivity";

describe("bucketConversationsByHour", () => {
  it("counts conversations in BRT-adjusted hourly buckets, rolling 8h window ending at the reference hour", () => {
    const referenceIso = "2026-07-23T17:00:00.000Z"; // 14h BRT (UTC-3, fixed offset)
    const conversations = [
      { createdAt: "2026-07-23T17:05:00.000Z" }, // 14h05 BRT
      { createdAt: "2026-07-23T17:40:00.000Z" }, // 14h40 BRT
      { createdAt: "2026-07-23T13:10:00.000Z" }, // 10h10 BRT
      { createdAt: "2026-07-22T17:05:00.000Z" }, // previous day — excluded
    ];
    const result = bucketConversationsByHour(conversations, referenceIso);
    expect(result).toHaveLength(8); // hours 7..14 BRT
    expect(result[0]).toMatchObject({ hour: 7, label: "7h", count: 0 });
    expect(result[result.length - 1]).toMatchObject({ hour: 14, label: "14h", count: 2 });
    expect(result.find((p) => p.hour === 10)).toMatchObject({ count: 1 });
  });

  it("clamps the window start at 0 for early-morning references", () => {
    const referenceIso = "2026-07-23T06:30:00.000Z"; // 3h30 BRT
    const result = bucketConversationsByHour([], referenceIso);
    expect(result).toHaveLength(4); // hours 0..3
    expect(result[0]!.hour).toBe(0);
    expect(result[result.length - 1]!.hour).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/seller-dashboard/engine/hourlyActivity.test.ts`
Expected: FAIL — `Cannot find module './hourlyActivity'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/seller-dashboard/engine/hourlyActivity.ts

export interface IHourlyActivityPoint {
  hour: number;
  label: string;
  count: number;
}

const HOUR_MS = 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * HOUR_MS;
const WINDOW_HOURS = 7;

/**
 * Buckets conversations by hour-of-day for the same calendar day as
 * `referenceIso`, in America/Sao_Paulo time (fixed UTC-3 — Brazil has had
 * no DST since 2019, so a plain offset subtraction is deterministic and
 * doesn't depend on the runtime's local timezone). Returns a rolling
 * window of `WINDOW_HOURS + 1` points ending at the reference hour.
 */
export function bucketConversationsByHour(
  conversations: { createdAt: string }[],
  referenceIso: string,
): IHourlyActivityPoint[] {
  const toBrt = (iso: string) => new Date(new Date(iso).getTime() - BRT_OFFSET_MS);

  const refBrt = toBrt(referenceIso);
  const refDayKey = refBrt.toISOString().slice(0, 10);
  const currentHour = refBrt.getUTCHours();
  const startHour = Math.max(0, currentHour - WINDOW_HOURS);

  const counts = new Map<number, number>();
  for (const conv of conversations) {
    const brt = toBrt(conv.createdAt);
    if (brt.toISOString().slice(0, 10) !== refDayKey) continue;
    const hour = brt.getUTCHours();
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  const points: IHourlyActivityPoint[] = [];
  for (let hour = startHour; hour <= currentHour; hour++) {
    points.push({ hour, label: `${hour}h`, count: counts.get(hour) ?? 0 });
  }
  return points;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/seller-dashboard/engine/hourlyActivity.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/seller-dashboard/engine/hourlyActivity.ts src/features/seller-dashboard/engine/hourlyActivity.test.ts
git commit -m "feat(seller-dashboard): add hourly activity bucketing engine"
```

---

### Task 4: Goal pace engine — `deriveGoalPace`

**Files:**
- Create: `src/features/seller-dashboard/engine/goalPace.ts`
- Test: `src/features/seller-dashboard/engine/goalPace.test.ts`

**Interfaces:**
- Consumes: `IGoal` from `@/shared/types` (`{ period: { start: ISO8601; end: ISO8601 }; targetValue: number; currentValue: number }`).
- Produces: `interface IGoalPaceResult { percent: number; remaining: number; paceLabel: string; projectedDate: string | null }`; `function deriveGoalPace(goal: IGoal, now?: Date): IGoalPaceResult`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/seller-dashboard/engine/goalPace.test.ts
import { describe, expect, it } from "vitest";
import { deriveGoalPace } from "./goalPace";
import type { IGoal } from "@/shared/types";

function goal(overrides: Partial<IGoal> = {}): IGoal {
  return {
    id: "goal-1",
    storeId: "store-1",
    level: "individual",
    targetId: "seller-1",
    sellerId: "seller-1",
    period: { type: "monthly", start: "2026-07-01T00:00:00.000Z", end: "2026-07-31T23:59:59.999Z" },
    metric: "revenue",
    targetValue: 180000,
    currentValue: 90000,
    progressPercent: 0.5,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveGoalPace", () => {
  it("projects on-track pace within the period", () => {
    const result = deriveGoalPace(goal(), new Date("2026-07-16T00:00:00.000Z"));
    expect(result.percent).toBe(50);
    expect(result.remaining).toBe(90000);
    expect(result.paceLabel).toBe("no ritmo para bater em 31/07");
    expect(result.projectedDate).toBe("2026-07-31T00:00:00.000Z");
  });

  it("flags behind-pace when the projection lands after the period end", () => {
    const result = deriveGoalPace(goal({ currentValue: 30000 }), new Date("2026-07-21T00:00:00.000Z"));
    expect(result.paceLabel).toMatch(/^abaixo do ritmo/);
  });

  it("returns 'meta batida' once currentValue reaches targetValue", () => {
    const result = deriveGoalPace(goal({ currentValue: 200000 }), new Date("2026-07-16T00:00:00.000Z"));
    expect(result.remaining).toBe(0);
    expect(result.paceLabel).toBe("meta batida");
    expect(result.projectedDate).toBeNull();
  });

  it("returns a waiting label before any progress has accumulated", () => {
    const result = deriveGoalPace(goal({ currentValue: 0 }), new Date("2026-07-01T00:00:00.000Z"));
    expect(result.paceLabel).toBe("aguardando dados do mês");
    expect(result.projectedDate).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/seller-dashboard/engine/goalPace.test.ts`
Expected: FAIL — `Cannot find module './goalPace'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/seller-dashboard/engine/goalPace.ts
import type { IGoal } from "@/shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface IGoalPaceResult {
  percent: number;
  remaining: number;
  paceLabel: string;
  projectedDate: string | null;
}

function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** Progress + projected pace for a monthly goal, from its raw values. */
export function deriveGoalPace(goal: IGoal, now: Date = new Date()): IGoalPaceResult {
  const percent = goal.targetValue > 0 ? Math.round((goal.currentValue / goal.targetValue) * 100) : 0;
  const remaining = Math.max(0, goal.targetValue - goal.currentValue);

  if (goal.currentValue >= goal.targetValue) {
    return { percent, remaining: 0, paceLabel: "meta batida", projectedDate: null };
  }

  const startMs = new Date(goal.period.start).getTime();
  const endMs = new Date(goal.period.end).getTime();
  const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
  const daysPassed = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - startMs) / DAY_MS)));

  if (daysPassed <= 0) {
    return { percent, remaining, paceLabel: "aguardando dados do mês", projectedDate: null };
  }

  const dailyRate = goal.currentValue / daysPassed;
  if (dailyRate <= 0) {
    return { percent, remaining, paceLabel: "sem ritmo suficiente para projetar", projectedDate: null };
  }

  const daysToTarget = Math.ceil(goal.targetValue / dailyRate);
  const projectedMs = startMs + daysToTarget * DAY_MS;
  const projectedDate = new Date(projectedMs).toISOString();

  const paceLabel =
    projectedMs <= endMs
      ? `no ritmo para bater em ${formatDayMonth(projectedDate)}`
      : `abaixo do ritmo — no ritmo atual bateria em ${formatDayMonth(projectedDate)}`;

  return { percent, remaining, paceLabel, projectedDate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/seller-dashboard/engine/goalPace.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/seller-dashboard/engine/goalPace.ts src/features/seller-dashboard/engine/goalPace.test.ts
git commit -m "feat(seller-dashboard): add goal pace projection engine"
```

---

### Task 5: i18n strings

**Files:**
- Create: `src/features/seller-dashboard/i18n/pt-BR.ts`

**Interfaces:**
- Produces: `const SELLER_DASHBOARD_STRINGS` (readonly object of pt-BR strings — full key list below, consumed by Tasks 8-14; Task 6/7 don't need it).

No test — this is static data. Verification is a TypeScript compile check.

- [ ] **Step 1: Write the file**

```ts
// src/features/seller-dashboard/i18n/pt-BR.ts

export const SELLER_DASHBOARD_STRINGS = {
  noSellerProfile: "Seu usuário não está vinculado a um vendedor — fale com o gestor da loja.",
  kpiConversations: "Atendimentos",
  kpiVsPeriod: "vs período anterior",
  kpiFirstResponse: "1ª resposta média",
  kpiFirstResponseHint: "da atribuição à resposta",
  kpiClosingTime: "Tempo de fechamento",
  kpiClosingTimeHint: "criação → última mensagem",
  kpiConversion: "Conversão",
  kpiSales: "Suas vendas",
  goalTitle: "Sua meta do mês",
  goalEmpty: "Nenhuma meta individual cadastrada para este mês.",
  goalOf: "de",
  goalMissing: "Faltam",
  chartTitleHourly: "Seus atendimentos por hora",
  chartTitleDaily: "Seus atendimentos por dia",
  chartInPeriod: "no período",
  chartTooltipLabel: "atendimentos",
  queueTitle: "Sua fila agora",
  queueWaiting: "aguardando",
  queueEmpty: "Nenhuma conversa aguardando sua resposta agora.",
  queueWaitingSince: "aguardando há",
  queueCta: "Ir para a Central",
  rankingTitle: "Ranking da loja",
  rankingEmpty: "Ranking ainda não disponível para este período.",
  rankingOf: "de",
  rankingSellers: "vendedores este mês",
  rankingMovedUp: "subiu",
  rankingMovedDown: "caiu",
  rankingCta: "Ver ranking →",
  recordsTitle: "Seus recordes & curiosidades",
  recordsComingSoon: "em breve",
} as const;
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/i18n"`
Expected: no output (no errors referencing this file — it has no imports and no logic to break).

- [ ] **Step 3: Commit**

```bash
git add src/features/seller-dashboard/i18n/pt-BR.ts
git commit -m "feat(seller-dashboard): add pt-BR strings"
```

---

### Task 6: `useSellerPeriod` hook + `SellerGreeting` component

**Files:**
- Create: `src/features/seller-dashboard/hooks/useSellerPeriod.ts`
- Create: `src/features/seller-dashboard/components/SellerGreeting.tsx`

**Interfaces:**
- Consumes: `resolveSellerPeriod`, `SellerPeriodKey`, `ISellerPeriodWindow` (Task 1); `greetingLabel` (Task 2).
- Produces: `interface IUseSellerPeriodResult { period: SellerPeriodKey; window: ISellerPeriodWindow; setPeriod: (period: SellerPeriodKey) => void }`; `function useSellerPeriod(initial?: SellerPeriodKey): IUseSellerPeriodResult`; `function SellerGreeting(props: { firstName: string; period: SellerPeriodKey; onPeriodChange: (period: SellerPeriodKey) => void; now?: Date }): JSX.Element` — both consumed by `SellerDashboardPage` (Task 14).

No isolated unit test for the hook (thin `useState` wrapper around an already-tested pure function) or the component (presentational, exercised end-to-end in Task 14/16). Verification: TypeScript compile.

- [ ] **Step 1: Write `useSellerPeriod`**

```ts
// src/features/seller-dashboard/hooks/useSellerPeriod.ts
import { useMemo, useState } from "react";
import { resolveSellerPeriod, type ISellerPeriodWindow, type SellerPeriodKey } from "../engine/period";

export interface IUseSellerPeriodResult {
  period: SellerPeriodKey;
  window: ISellerPeriodWindow;
  setPeriod: (period: SellerPeriodKey) => void;
}

/** Local (non-persisted) period selection for the seller dashboard. */
export function useSellerPeriod(initial: SellerPeriodKey = "hoje"): IUseSellerPeriodResult {
  const [period, setPeriod] = useState<SellerPeriodKey>(initial);
  const window = useMemo(() => resolveSellerPeriod(period, new Date().toISOString()), [period]);
  return { period, window, setPeriod };
}
```

- [ ] **Step 2: Write `SellerGreeting`**

```tsx
// src/features/seller-dashboard/components/SellerGreeting.tsx
import { cn } from "@/lib/utils";
import { greetingLabel } from "../engine/formatters";
import type { SellerPeriodKey } from "../engine/period";

interface ISellerGreetingProps {
  firstName: string;
  period: SellerPeriodKey;
  onPeriodChange: (period: SellerPeriodKey) => void;
  now?: Date;
}

const PERIOD_OPTIONS: { key: SellerPeriodKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

export function SellerGreeting({
  firstName,
  period,
  onPeriodChange,
  now = new Date(),
}: ISellerGreetingProps) {
  const dateLabel = now.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-xs capitalize text-muted-foreground">{dateLabel}</p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-tight text-foreground">
          {greetingLabel(now.getHours())}, {firstName}. <span className="text-primary">Seu painel.</span>
        </h1>
      </div>
      <div className="flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onPeriodChange(opt.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              period === opt.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/hooks/useSellerPeriod\|seller-dashboard/components/SellerGreeting"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/features/seller-dashboard/hooks/useSellerPeriod.ts src/features/seller-dashboard/components/SellerGreeting.tsx
git commit -m "feat(seller-dashboard): add period hook and greeting header"
```

---

### Task 7: `useSellerServiceMetrics` hook

**Files:**
- Create: `src/features/seller-dashboard/hooks/useSellerServiceMetrics.ts`

**Interfaces:**
- Consumes: `useConversationsProvider`, `useMessagesProvider`, `useOrdersProvider`, `useSdrEscalationsProvider`, `useSellersProvider` from `@/providers/data`; `calculateCustomerServiceMetrics` from `@/features/customer-service-analytics`; `ISellerPeriodWindow` (Task 1).
- Produces: `interface IUseSellerServiceMetricsResult { isLoading: boolean; isError: boolean; metrics: ICustomerServiceMetrics | null; conversationsCurrent: IConversation[]; salesCurrent: number; salesPrevious: number }`; `function useSellerServiceMetrics(params: { storeId: ID; sellerId: ID; window: ISellerPeriodWindow }): IUseSellerServiceMetricsResult` — consumed by `SellerKpiRow` (Task 8) and `SellerActivityChart` (Task 12) via `SellerDashboardPage` (Task 14).

This hook mirrors `src/features/customer-service-analytics/hooks/useCustomerServiceMetrics.ts` exactly in structure (already in production), scoped to one seller via `assignedSellerId`/`sellerId` filters instead of the whole store. No isolated test — React Query hooks in this codebase aren't unit-tested; the underlying engine (`calculateCustomerServiceMetrics`) is already tested in `customer-service-analytics`, and this hook is exercised end-to-end in Task 16.

- [ ] **Step 1: Write the hook**

```ts
// src/features/seller-dashboard/hooks/useSellerServiceMetrics.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  IConversation,
  ICustomerServiceMetrics,
  ID,
  IMessage,
  IOrder,
  ISdrEscalation,
} from "@/shared/types";
import {
  useConversationsProvider,
  useMessagesProvider,
  useOrdersProvider,
  useSdrEscalationsProvider,
  useSellersProvider,
} from "@/providers/data";
import { calculateCustomerServiceMetrics } from "@/features/customer-service-analytics";
import type { ISellerPeriodWindow } from "../engine/period";

const STALE_MS = 30_000;
const PAGE_SIZE = 1000;

export interface IUseSellerServiceMetricsParams {
  storeId: ID;
  sellerId: ID;
  window: ISellerPeriodWindow;
}

export interface IUseSellerServiceMetricsResult {
  isLoading: boolean;
  isError: boolean;
  metrics: ICustomerServiceMetrics | null;
  /** Conversations created inside the current window — used for hourly bucketing. */
  conversationsCurrent: IConversation[];
  salesCurrent: number;
  salesPrevious: number;
}

/**
 * Personal analogue of `useCustomerServiceMetrics` (PRD-051), scoped to one
 * seller's own conversations/orders instead of the whole store.
 */
export function useSellerServiceMetrics(
  params: IUseSellerServiceMetricsParams,
): IUseSellerServiceMetricsResult {
  const { storeId, sellerId, window } = params;

  const conversationsProvider = useConversationsProvider();
  const messagesProvider = useMessagesProvider();
  const ordersProvider = useOrdersProvider();
  const sdrEscalationsProvider = useSdrEscalationsProvider();
  const sellersProvider = useSellersProvider();

  const conversationsQuery = useQuery({
    queryKey: [
      "seller-dashboard",
      "conversations",
      storeId,
      sellerId,
      window.previousStartIso,
      window.endIso,
    ],
    queryFn: () =>
      conversationsProvider.list({
        storeId,
        assignedSellerId: sellerId,
        fromDate: window.previousStartIso,
        toDate: window.endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const ordersQuery = useQuery({
    queryKey: ["seller-dashboard", "orders", storeId, sellerId, window.previousStartIso, window.endIso],
    queryFn: () =>
      ordersProvider.list({
        storeId,
        sellerId,
        since: window.previousStartIso,
        until: window.endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const escalationsQuery = useQuery({
    queryKey: ["seller-dashboard", "escalations", storeId, window.startIso, window.endIso],
    queryFn: () =>
      sdrEscalationsProvider.list({ storeId, fromDate: window.startIso, toDate: window.endIso }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["seller-dashboard", "sellers", storeId],
    queryFn: () => sellersProvider.list({ storeId, active: true }),
    staleTime: STALE_MS,
  });

  const conversationsAll = useMemo<IConversation[]>(
    () => conversationsQuery.data?.data ?? [],
    [conversationsQuery.data],
  );

  const conversationsCurrent = useMemo<IConversation[]>(
    () =>
      conversationsAll.filter((c) => c.createdAt >= window.startIso && c.createdAt <= window.endIso),
    [conversationsAll, window.startIso, window.endIso],
  );

  const conversationsPrevious = useMemo<IConversation[]>(
    () =>
      conversationsAll.filter(
        (c) => c.createdAt >= window.previousStartIso && c.createdAt <= window.previousEndIso,
      ),
    [conversationsAll, window.previousStartIso, window.previousEndIso],
  );

  const messagesQuery = useQuery({
    queryKey: [
      "seller-dashboard",
      "messages",
      sellerId,
      window.startIso,
      window.endIso,
      conversationsCurrent.map((c) => c.id).join(","),
    ],
    queryFn: () =>
      messagesProvider.listForAnalytics({
        conversationIds: conversationsCurrent.map((c) => c.id),
        since: window.startIso,
        until: window.endIso,
      }),
    staleTime: STALE_MS,
    enabled: conversationsCurrent.length > 0,
  });

  const paidOrdersAll = useMemo<IOrder[]>(
    () => (ordersQuery.data?.data ?? []).filter((o) => o.paymentStatus === "pago"),
    [ordersQuery.data],
  );

  const salesCurrent = useMemo(
    () =>
      paidOrdersAll
        .filter((o) => o.createdAt >= window.startIso && o.createdAt <= window.endIso)
        .reduce((sum, o) => sum + o.total, 0),
    [paidOrdersAll, window.startIso, window.endIso],
  );

  const salesPrevious = useMemo(
    () =>
      paidOrdersAll
        .filter((o) => o.createdAt >= window.previousStartIso && o.createdAt <= window.previousEndIso)
        .reduce((sum, o) => sum + o.total, 0),
    [paidOrdersAll, window.previousStartIso, window.previousEndIso],
  );

  const metrics = useMemo<ICustomerServiceMetrics | null>(() => {
    if (!conversationsQuery.data || !ordersQuery.data || !sellersQuery.data) return null;
    const escalations: ISdrEscalation[] = escalationsQuery.data ?? [];
    const messages: IMessage[] = messagesQuery.data ?? [];
    return calculateCustomerServiceMetrics({
      conversations: conversationsCurrent,
      conversationsPrevious,
      messages,
      paidOrders: paidOrdersAll,
      escalations,
      sellers: sellersQuery.data,
      period: { start: window.startIso, end: window.endIso },
    });
  }, [
    conversationsCurrent,
    conversationsPrevious,
    conversationsQuery.data,
    ordersQuery.data,
    paidOrdersAll,
    escalationsQuery.data,
    messagesQuery.data,
    sellersQuery.data,
    window.startIso,
    window.endIso,
  ]);

  return {
    isLoading: conversationsQuery.isLoading || ordersQuery.isLoading || sellersQuery.isLoading,
    isError:
      conversationsQuery.isError ||
      ordersQuery.isError ||
      sellersQuery.isError ||
      escalationsQuery.isError,
    metrics,
    conversationsCurrent,
    salesCurrent,
    salesPrevious,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/hooks/useSellerServiceMetrics"`
Expected: no output. Note `ISellersProvider.list()` is the one provider here that returns a bare `Promise<ISeller[]>` (not `IPaginatedResult<ISeller>` like conversations/orders) — `sellersQuery.data` is already the array, don't unwrap it with `.data`.

- [ ] **Step 3: Commit**

```bash
git add src/features/seller-dashboard/hooks/useSellerServiceMetrics.ts
git commit -m "feat(seller-dashboard): add seller-scoped service metrics hook"
```

---

### Task 8: `SellerKpiRow` component

**Files:**
- Create: `src/features/seller-dashboard/components/SellerKpiRow.tsx`

**Interfaces:**
- Consumes: `IUseSellerServiceMetricsResult` shape (Task 7 — `metrics`, `salesCurrent`, `salesPrevious`, `isLoading`); `deltaPctOf` from `@/features/customer-service-analytics`; `formatBRL`, `formatPercent` from `@/shared/utils/format`; `formatMinutesLabel` (Task 2); `SELLER_DASHBOARD_STRINGS` (Task 5).
- Produces: `function SellerKpiRow(props: { metrics: ICustomerServiceMetrics | null; salesCurrent: number; salesPrevious: number; isLoading: boolean }): JSX.Element` — consumed by `SellerDashboardPage` (Task 14).

- [ ] **Step 1: Write the component**

```tsx
// src/features/seller-dashboard/components/SellerKpiRow.tsx
import type { ICustomerServiceMetrics } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { deltaPctOf } from "@/features/customer-service-analytics";
import { formatMinutesLabel } from "../engine/formatters";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerKpiRowProps {
  metrics: ICustomerServiceMetrics | null;
  salesCurrent: number;
  salesPrevious: number;
  isLoading: boolean;
}

export function SellerKpiRow({ metrics, salesCurrent, salesPrevious, isLoading }: ISellerKpiRowProps) {
  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-card sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4">
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const salesDeltaPct = deltaPctOf(salesCurrent, salesPrevious);
  const convDeltaPts =
    metrics.previous != null
      ? Math.round((metrics.totals.conversionRate - metrics.previous.conversionRate) * 100)
      : null;
  const atendDelta =
    metrics.previous != null
      ? metrics.totals.totalConversations - metrics.previous.totalConversations
      : null;

  const items: {
    icon: string;
    label: string;
    value: string;
    delta: string | null;
    good: boolean | null;
  }[] = [
    {
      icon: "mdi:forum-outline",
      label: S.kpiConversations,
      value: String(metrics.totals.totalConversations),
      delta: atendDelta == null ? null : `${atendDelta >= 0 ? "+" : ""}${atendDelta} ${S.kpiVsPeriod}`,
      good: atendDelta == null ? null : atendDelta >= 0,
    },
    {
      icon: "mdi:timer-outline",
      label: S.kpiFirstResponse,
      value: formatMinutesLabel(metrics.totals.averageResponseTime),
      delta: S.kpiFirstResponseHint,
      good: null,
    },
    {
      icon: "mdi:progress-clock",
      label: S.kpiClosingTime,
      value: formatMinutesLabel(metrics.totals.averageHandleTime),
      delta: S.kpiClosingTimeHint,
      good: null,
    },
    {
      icon: "mdi:percent-outline",
      label: S.kpiConversion,
      value: formatPercent(metrics.totals.conversionRate),
      delta: convDeltaPts == null ? null : `${convDeltaPts >= 0 ? "+" : ""}${convDeltaPts} pts`,
      good: convDeltaPts == null ? null : convDeltaPts >= 0,
    },
    {
      icon: "mdi:cash-multiple",
      label: S.kpiSales,
      value: formatBRL(salesCurrent),
      delta: salesDeltaPct == null ? null : formatPercent(salesDeltaPct),
      good: salesDeltaPct == null ? null : salesDeltaPct >= 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-card sm:grid-cols-5 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Icon icon={item.icon} size={13} />
            {item.label}
          </div>
          <div className="font-display text-2xl font-bold text-foreground">{item.value}</div>
          {item.delta && (
            <div
              className={cn(
                "mt-1 text-xs",
                item.good === true
                  ? "text-severity-success"
                  : item.good === false
                    ? "text-severity-critical"
                    : "text-muted-foreground",
              )}
            >
              {item.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/components/SellerKpiRow"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/features/seller-dashboard/components/SellerKpiRow.tsx
git commit -m "feat(seller-dashboard): add KPI row component"
```

---

### Task 9: `useSellerGoalProgress` hook + `SellerGoalCard` component

**Files:**
- Create: `src/features/seller-dashboard/hooks/useSellerGoalProgress.ts`
- Create: `src/features/seller-dashboard/components/SellerGoalCard.tsx`

**Interfaces:**
- Consumes: `useGoalsProvider` from `@/providers/data`; `deriveGoalPace`, `IGoalPaceResult` (Task 4); `SELLER_DASHBOARD_STRINGS` (Task 5).
- Produces: `interface IUseSellerGoalProgressResult { isLoading: boolean; goal: IGoal | null; pace: IGoalPaceResult | null }`; `function useSellerGoalProgress(storeId: ID, sellerId: ID): IUseSellerGoalProgressResult`; `function SellerGoalCard(props: { goal: IGoal | null; pace: IGoalPaceResult | null; isLoading: boolean }): JSX.Element` — consumed by `SellerDashboardPage` (Task 14).

- [ ] **Step 1: Write the hook**

```ts
// src/features/seller-dashboard/hooks/useSellerGoalProgress.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IGoal } from "@/shared/types";
import { useGoalsProvider } from "@/providers/data";
import { deriveGoalPace, type IGoalPaceResult } from "../engine/goalPace";

const STALE_MS = 30_000;

export interface IUseSellerGoalProgressResult {
  isLoading: boolean;
  goal: IGoal | null;
  pace: IGoalPaceResult | null;
}

/** The seller's individual `revenue` goal whose period covers today. */
export function useSellerGoalProgress(storeId: ID, sellerId: ID): IUseSellerGoalProgressResult {
  const goalsProvider = useGoalsProvider();

  const goalsQuery = useQuery({
    queryKey: ["seller-dashboard", "goals", storeId, sellerId],
    queryFn: () =>
      goalsProvider.list({ storeId, level: "individual", targetId: sellerId, metric: "revenue" }),
    staleTime: STALE_MS,
    enabled: Boolean(storeId) && Boolean(sellerId),
  });

  const goal = useMemo<IGoal | null>(() => {
    const goals = goalsQuery.data?.data ?? [];
    const nowIso = new Date().toISOString();
    return goals.find((g) => g.period.start <= nowIso && nowIso <= g.period.end) ?? null;
  }, [goalsQuery.data]);

  const pace = useMemo<IGoalPaceResult | null>(() => (goal ? deriveGoalPace(goal) : null), [goal]);

  return { isLoading: goalsQuery.isLoading, goal, pace };
}
```

- [ ] **Step 2: Write the component**

```tsx
// src/features/seller-dashboard/components/SellerGoalCard.tsx
import type { IGoal } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/shared/utils/format";
import type { IGoalPaceResult } from "../engine/goalPace";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerGoalCardProps {
  goal: IGoal | null;
  pace: IGoalPaceResult | null;
  isLoading: boolean;
}

export function SellerGoalCard({ goal, pace, isLoading }: ISellerGoalCardProps) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="mb-3 h-4 w-32" />
        <Skeleton className="h-8 w-full" />
      </Card>
    );
  }

  if (!goal || !pace) {
    return (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:target" size={16} className="text-primary" />
          {S.goalTitle}
        </div>
        <p className="text-sm text-muted-foreground">{S.goalEmpty}</p>
      </Card>
    );
  }

  const pct = Math.min(100, Math.max(0, pace.percent));

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:target" size={16} className="text-primary" />
          {S.goalTitle}
        </div>
        <span className="font-display text-lg font-bold text-primary">{pace.percent}%</span>
      </div>
      <div className="mb-2 flex items-end justify-between">
        <span className="font-display text-2xl font-bold text-foreground">
          {formatBRL(goal.currentValue)}
        </span>
        <span className="text-xs text-muted-foreground">
          {S.goalOf} {formatBRL(goal.targetValue)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {S.goalMissing} <b className="text-foreground">{formatBRL(pace.remaining)}</b> — {pace.paceLabel}
      </p>
    </Card>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/hooks/useSellerGoalProgress\|seller-dashboard/components/SellerGoalCard"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/features/seller-dashboard/hooks/useSellerGoalProgress.ts src/features/seller-dashboard/components/SellerGoalCard.tsx
git commit -m "feat(seller-dashboard): add goal progress hook and card"
```

---

### Task 10: `useSellerQueue` hook + `SellerQueueCard` component

**Files:**
- Create: `src/features/seller-dashboard/hooks/useSellerQueue.ts`
- Create: `src/features/seller-dashboard/components/SellerQueueCard.tsx`

**Interfaces:**
- Consumes: `useConversationsProvider().getIdleSummary()` from `@/providers/data` (returns `IIdleSummary` — `{ counts; entries: IIdleConversationEntry[] }`, already scoped to the signed-in seller); `formatWaitLabel` (Task 2); `SELLER_DASHBOARD_STRINGS` (Task 5).
- Produces: `interface IUseSellerQueueResult { isLoading: boolean; entries: IIdleConversationEntry[]; total: number }`; `function useSellerQueue(): IUseSellerQueueResult`; `function SellerQueueCard(props: { entries: IIdleConversationEntry[]; total: number; isLoading: boolean; now?: Date }): JSX.Element` — consumed by `SellerDashboardPage` (Task 14).

- [ ] **Step 1: Write the hook**

```ts
// src/features/seller-dashboard/hooks/useSellerQueue.ts
import { useQuery } from "@tanstack/react-query";
import type { IIdleConversationEntry } from "@/shared/types";
import { useConversationsProvider } from "@/providers/data";

const STALE_MS = 15_000;
const MAX_ENTRIES = 5;

export interface IUseSellerQueueResult {
  isLoading: boolean;
  entries: IIdleConversationEntry[];
  total: number;
}

/**
 * Conversations awaiting reply for the signed-in seller (contract:
 * `IConversationsProvider.getIdleSummary()` is scoped server-side to
 * whoever is calling — no sellerId param needed).
 */
export function useSellerQueue(): IUseSellerQueueResult {
  const conversationsProvider = useConversationsProvider();

  const idleQuery = useQuery({
    queryKey: ["seller-dashboard", "idle-summary"],
    queryFn: () => conversationsProvider.getIdleSummary(),
    staleTime: STALE_MS,
  });

  const entries = idleQuery.data?.entries ?? [];
  return {
    isLoading: idleQuery.isLoading,
    entries: entries.slice(0, MAX_ENTRIES),
    total: entries.length,
  };
}
```

- [ ] **Step 2: Write the component**

```tsx
// src/features/seller-dashboard/components/SellerQueueCard.tsx
import { Link } from "@tanstack/react-router";
import type { IIdleConversationEntry } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatWaitLabel } from "../engine/formatters";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerQueueCardProps {
  entries: IIdleConversationEntry[];
  total: number;
  isLoading: boolean;
  now?: Date;
}

export function SellerQueueCard({ entries, total, isLoading, now = new Date() }: ISellerQueueCardProps) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:format-list-checks" size={16} className="text-muted-foreground" />
          {S.queueTitle}
        </div>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
          {total} {S.queueWaiting}
        </span>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{S.queueEmpty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <Link
              key={entry.conversationId}
              to="/app/atendimento"
              className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{entry.contactName}</p>
                <p className="text-xs text-muted-foreground">
                  {S.queueWaitingSince} {formatWaitLabel(entry.awaitingReplySince, now)}
                </p>
              </div>
              <Icon icon="mdi:arrow-right" size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
      <Link
        to="/app/atendimento"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <Icon icon="mdi:forum-outline" size={15} />
        {S.queueCta}
      </Link>
    </Card>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/hooks/useSellerQueue\|seller-dashboard/components/SellerQueueCard"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/features/seller-dashboard/hooks/useSellerQueue.ts src/features/seller-dashboard/components/SellerQueueCard.tsx
git commit -m "feat(seller-dashboard): add queue hook and card"
```

---

### Task 11: `useSellerRanking` hook + `SellerRankingCard` component

**Files:**
- Create: `src/features/seller-dashboard/hooks/useSellerRanking.ts`
- Create: `src/features/seller-dashboard/components/SellerRankingCard.tsx`

**Interfaces:**
- Consumes: `useRanking`, `resolvePeriod` from `@/features/gamification` (barrel — `useRanking` already returns `IRankingEntry[]` with `position`/`positionDelta` fully computed, no new engine needed); `SELLER_DASHBOARD_STRINGS` (Task 5).
- Produces: `interface IUseSellerRankingResult { isLoading: boolean; entry: IRankingEntry | null; totalSellers: number }`; `function useSellerRanking(storeId: ID, sellerId: ID): IUseSellerRankingResult`; `function SellerRankingCard(props: { entry: IRankingEntry | null; totalSellers: number; isLoading: boolean }): JSX.Element` — consumed by `SellerDashboardPage` (Task 14).

- [ ] **Step 1: Write the hook**

```ts
// src/features/seller-dashboard/hooks/useSellerRanking.ts
import { useMemo } from "react";
import type { ID, IRankingEntry } from "@/shared/types";
import { useRanking, resolvePeriod } from "@/features/gamification";

export interface IUseSellerRankingResult {
  isLoading: boolean;
  entry: IRankingEntry | null;
  totalSellers: number;
}

/**
 * This seller's own entry in the current month's store ranking.
 * `useRanking` already computes `position`/`positionDelta` per entry
 * (via `calculateRanking`) — no extra engine work needed here.
 */
export function useSellerRanking(storeId: ID, sellerId: ID): IUseSellerRankingResult {
  const period = useMemo(() => resolvePeriod("mensal"), []);
  const ranking = useRanking({ period, scope: { storeId } });

  const entry = useMemo(
    () => ranking.ranking.find((e) => e.sellerId === sellerId) ?? null,
    [ranking.ranking, sellerId],
  );

  return { isLoading: ranking.isLoading, entry, totalSellers: ranking.sellers.length };
}
```

- [ ] **Step 2: Write the component**

```tsx
// src/features/seller-dashboard/components/SellerRankingCard.tsx
import { Link } from "@tanstack/react-router";
import type { IRankingEntry } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerRankingCardProps {
  entry: IRankingEntry | null;
  totalSellers: number;
  isLoading: boolean;
}

export function SellerRankingCard({ entry, totalSellers, isLoading }: ISellerRankingCardProps) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-14 w-full" />
      </Card>
    );
  }

  if (!entry) {
    return (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:trophy-outline" size={16} className="text-primary" />
          {S.rankingTitle}
        </div>
        <p className="text-sm text-muted-foreground">{S.rankingEmpty}</p>
      </Card>
    );
  }

  const delta = entry.positionDelta ?? 0;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon icon="mdi:trophy-outline" size={16} className="text-primary" />
        {S.rankingTitle}
      </div>
      <div className="flex items-center gap-4">
        <span className="font-display text-4xl font-bold text-primary">#{entry.position}</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">
            {S.rankingOf} {totalSellers} {S.rankingSellers}
          </p>
          {delta !== 0 && (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs",
                delta > 0 ? "text-severity-success" : "text-severity-critical",
              )}
            >
              <Icon icon={delta > 0 ? "mdi:arrow-up" : "mdi:arrow-down"} size={13} />
              {delta > 0 ? S.rankingMovedUp : S.rankingMovedDown} {Math.abs(delta)}{" "}
              {Math.abs(delta) === 1 ? "posição" : "posições"}
            </p>
          )}
        </div>
        <Link to="/app/gestao/ranking" className="text-xs font-semibold text-primary hover:underline">
          {S.rankingCta}
        </Link>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/hooks/useSellerRanking\|seller-dashboard/components/SellerRankingCard"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/features/seller-dashboard/hooks/useSellerRanking.ts src/features/seller-dashboard/components/SellerRankingCard.tsx
git commit -m "feat(seller-dashboard): add ranking hook and card"
```

---

### Task 12: `SellerActivityChart` component

**Files:**
- Create: `src/features/seller-dashboard/components/SellerActivityChart.tsx`

**Interfaces:**
- Consumes: `bucketConversationsByHour` (Task 3); `ICustomerServiceMetrics.trendDaily` (from `IUseSellerServiceMetricsResult.metrics`, Task 7); `SellerPeriodKey` (Task 1); `SELLER_DASHBOARD_STRINGS` (Task 5); `recharts` (`BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer`).
- Produces: `function SellerActivityChart(props: { period: SellerPeriodKey; metrics: ICustomerServiceMetrics | null; conversationsCurrent: IConversation[]; now?: Date }): JSX.Element` — consumed by `SellerDashboardPage` (Task 14).

- [ ] **Step 1: Write the component**

```tsx
// src/features/seller-dashboard/components/SellerActivityChart.tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IConversation, ICustomerServiceMetrics } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { bucketConversationsByHour } from "../engine/hourlyActivity";
import type { SellerPeriodKey } from "../engine/period";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerActivityChartProps {
  period: SellerPeriodKey;
  metrics: ICustomerServiceMetrics | null;
  conversationsCurrent: IConversation[];
  now?: Date;
}

export function SellerActivityChart({
  period,
  metrics,
  conversationsCurrent,
  now = new Date(),
}: ISellerActivityChartProps) {
  const data =
    period === "hoje"
      ? bucketConversationsByHour(conversationsCurrent, now.toISOString()).map((p) => ({
          label: p.label,
          value: p.count,
        }))
      : (metrics?.trendDaily ?? []).map((p) => ({
          label: p.dayKey.slice(5),
          value: p.totalConversations,
        }));

  const total = data.reduce((sum, p) => sum + p.value, 0);
  const title = period === "hoje" ? S.chartTitleHourly : S.chartTitleDaily;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:chart-bar" size={16} className="text-muted-foreground" />
          {title}
        </div>
        <span className="text-xs text-muted-foreground">
          {total} {S.chartInPeriod}
        </span>
      </div>
      <div className="h-32 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
              tickLine={false}
            />
            <YAxis hide allowDecimals={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
              formatter={(value: number) => [`${value}`, S.chartTooltipLabel]}
            />
            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 2, 2]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/components/SellerActivityChart"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/features/seller-dashboard/components/SellerActivityChart.tsx
git commit -m "feat(seller-dashboard): add activity chart component"
```

---

### Task 13: `SellerRecordsCard` component (static placeholder)

**Files:**
- Create: `src/features/seller-dashboard/components/SellerRecordsCard.tsx`

**Interfaces:**
- Consumes: `SELLER_DASHBOARD_STRINGS` (Task 5).
- Produces: `function SellerRecordsCard(): JSX.Element` — consumed by `SellerDashboardPage` (Task 14). No props — per spec, this block is a fixed layout with example data and an "em breve" badge until a follow-up spec wires real aggregations.

- [ ] **Step 1: Write the component**

```tsx
// src/features/seller-dashboard/components/SellerRecordsCard.tsx
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerRecordExample {
  icon: string;
  label: string;
  value: string;
  hint: string;
}

const RECORD_EXAMPLES: ISellerRecordExample[] = [
  {
    icon: "mdi:timer-sand",
    label: "Maior atendimento",
    value: "6d 14h",
    hint: "exemplo — atribuição até fechamento",
  },
  {
    icon: "mdi:lightning-bolt",
    label: "Mais rápido",
    value: "4 min",
    hint: "exemplo — do primeiro contato à resposta",
  },
  { icon: "mdi:fire", label: "Sequência", value: "9 dias", hint: "exemplo — batendo a meta diária" },
  { icon: "mdi:clock-outline", label: "Seu pico", value: "ter · 14–16h", hint: "exemplo — quando você mais fecha" },
  { icon: "mdi:cog-outline", label: "Peça mais vendida", value: "—", hint: "exemplo — no mês corrente" },
  { icon: "mdi:heart-outline", label: "Cliente mais frequente", value: "—", hint: "exemplo — nos últimos 12 meses" },
];

export function SellerRecordsCard() {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon="mdi:sparkles-outline" size={16} className="text-primary" />
          {S.recordsTitle}
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {S.recordsComingSoon}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {RECORD_EXAMPLES.map((r) => (
          <div key={r.label} className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Icon icon={r.icon} size={14} className="text-muted-foreground" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {r.label}
              </span>
            </div>
            <div className="font-display text-lg font-bold text-foreground">{r.value}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">{r.hint}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/components/SellerRecordsCard"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/features/seller-dashboard/components/SellerRecordsCard.tsx
git commit -m "feat(seller-dashboard): add records placeholder card"
```

---

### Task 14: `SellerDashboardPage` composition root + feature barrel

**Files:**
- Create: `src/features/seller-dashboard/pages/SellerDashboardPage.tsx`
- Create: `src/features/seller-dashboard/index.ts`

**Interfaces:**
- Consumes: `useAuth` from `@/features/auth/useAuth` (`currentUser.sellerId`, `currentUser.displayName`); `useCurrentStore` from `@/features/multistore` (`currentStoreId`); `DashboardLayout` from `@/features/shell/layouts`; every hook/component from Tasks 6-13.
- Produces: `function SellerDashboardPage(): JSX.Element`, exported from the feature barrel — consumed by `ManagerDashboardPage.tsx` (Task 15).

- [ ] **Step 1: Write the page**

```tsx
// src/features/seller-dashboard/pages/SellerDashboardPage.tsx
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { useSellerPeriod } from "../hooks/useSellerPeriod";
import { useSellerServiceMetrics } from "../hooks/useSellerServiceMetrics";
import { useSellerGoalProgress } from "../hooks/useSellerGoalProgress";
import { useSellerQueue } from "../hooks/useSellerQueue";
import { useSellerRanking } from "../hooks/useSellerRanking";
import { SellerGreeting } from "../components/SellerGreeting";
import { SellerKpiRow } from "../components/SellerKpiRow";
import { SellerGoalCard } from "../components/SellerGoalCard";
import { SellerActivityChart } from "../components/SellerActivityChart";
import { SellerQueueCard } from "../components/SellerQueueCard";
import { SellerRankingCard } from "../components/SellerRankingCard";
import { SellerRecordsCard } from "../components/SellerRecordsCard";
import { SELLER_DASHBOARD_STRINGS } from "../i18n/pt-BR";

/**
 * Personal home for the Vendedor role at `/app/inicio` — replaces the
 * blocked `EmptyState` that `ManagerDashboardPage` used to render for this
 * role. Design imported from Claude Design (`ui_kits/dashboard`).
 */
export function SellerDashboardPage() {
  const { currentUser } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const { period, window, setPeriod } = useSellerPeriod();

  const sellerId = currentUser?.sellerId;
  const storeId = currentStoreId;

  const service = useSellerServiceMetrics({
    storeId: storeId ?? "",
    sellerId: sellerId ?? "",
    window,
  });
  const goalProgress = useSellerGoalProgress(storeId ?? "", sellerId ?? "");
  const queue = useSellerQueue();
  const ranking = useSellerRanking(storeId ?? "", sellerId ?? "");

  if (!sellerId || !storeId) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground">{SELLER_DASHBOARD_STRINGS.noSellerProfile}</p>
      </DashboardLayout>
    );
  }

  const firstName = currentUser?.displayName?.split(" ")[0] ?? currentUser?.displayName ?? "";

  return (
    <DashboardLayout>
      <SellerGreeting firstName={firstName} period={period} onPeriodChange={setPeriod} />
      <SellerKpiRow
        metrics={service.metrics}
        salesCurrent={service.salesCurrent}
        salesPrevious={service.salesPrevious}
        isLoading={service.isLoading}
      />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <SellerGoalCard goal={goalProgress.goal} pace={goalProgress.pace} isLoading={goalProgress.isLoading} />
          <SellerActivityChart
            period={period}
            metrics={service.metrics}
            conversationsCurrent={service.conversationsCurrent}
          />
        </div>
        <div className="flex flex-col gap-4">
          <SellerQueueCard entries={queue.entries} total={queue.total} isLoading={queue.isLoading} />
          <SellerRankingCard
            entry={ranking.entry}
            totalSellers={ranking.totalSellers}
            isLoading={ranking.isLoading}
          />
        </div>
      </div>
      <div className="mt-4">
        <SellerRecordsCard />
      </div>
    </DashboardLayout>
  );
}
```

- [ ] **Step 2: Write the barrel**

```ts
// src/features/seller-dashboard/index.ts

export { SellerDashboardPage } from "./pages/SellerDashboardPage";
```

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "seller-dashboard/pages/SellerDashboardPage\|seller-dashboard/index"`
Expected: no output. If `currentUser?.displayName` errors, re-check `IMockUserProfile` in `src/features/auth/mock-users.ts` — the display field is `displayName`, not `fullName`.

- [ ] **Step 4: Commit**

```bash
git add src/features/seller-dashboard/pages/SellerDashboardPage.tsx src/features/seller-dashboard/index.ts
git commit -m "feat(seller-dashboard): add page composition and feature barrel"
```

---

### Task 15: Wire into `ManagerDashboardPage` and drop the dead placeholder strings

**Files:**
- Modify: `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx:1-78`
- Modify: `src/features/manager-dashboard/i18n/pt-BR.ts:86-90`

**Interfaces:**
- Consumes: `SellerDashboardPage` from `@/features/seller-dashboard` (Task 14).

- [ ] **Step 1: Replace the import**

In `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx`, replace:

```ts
import { EmptyState } from "@/features/shell/components/EmptyState";
```

with:

```ts
import { SellerDashboardPage } from "@/features/seller-dashboard";
```

(keep this import in the same position, line 6, alongside the other feature imports).

- [ ] **Step 2: Replace the Vendedor branch**

Replace:

```tsx
  if (userRole === "Vendedor") {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={MANAGER_DASHBOARD_STRINGS.noAccessTitle}
          description={MANAGER_DASHBOARD_STRINGS.noAccessDescription}
          actionLabel={MANAGER_DASHBOARD_STRINGS.noAccessCta}
          actionTo="/app/atendimento"
        />
      </DashboardLayout>
    );
  }
```

with:

```tsx
  if (userRole === "Vendedor") {
    return <SellerDashboardPage />;
  }
```

- [ ] **Step 3: Remove the now-unused i18n keys**

In `src/features/manager-dashboard/i18n/pt-BR.ts`, delete lines 86-90:

```ts
  // No access placeholder
  noAccessTitle: "Painel não disponível para o seu papel",
  noAccessDescription:
    "Vendedores acompanham o atendimento pela Central. Para ver métricas operacionais, peça acesso ao gestor da loja.",
  noAccessCta: "Ir para a Central de Atendimento",
```

- [ ] **Step 4: Verify no leftover references and the file compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep "manager-dashboard"`
Expected: no NEW errors referencing `EmptyState`, `noAccessTitle`, `noAccessDescription`, or `noAccessCta` in this file (pre-existing unrelated baseline errors, if any, are out of scope per `CLAUDE.md`).

Run: `grep -rn "noAccessTitle\|noAccessDescription\|noAccessCta" src/features/manager-dashboard/`
Expected: no output (both the usage and the definition are gone).

- [ ] **Step 5: Commit**

```bash
git add src/features/manager-dashboard/pages/ManagerDashboardPage.tsx src/features/manager-dashboard/i18n/pt-BR.ts
git commit -m "feat(seller-dashboard): render SellerDashboardPage for the Vendedor role at /app/inicio"
```

---

### Task 16: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: all tests pass, including the 15 new tests from Tasks 1-4 (`period.test.ts`, `formatters.test.ts`, `hourlyActivity.test.ts`, `goalPace.test.ts`) and every pre-existing test (no regression).

- [ ] **Step 2: Run the production build**

Run: `bun run build`
Expected: build succeeds (this project's build is Vite/esbuild — it transpiles without type-checking, per `CLAUDE.md`).

- [ ] **Step 3: Type-check the new/changed files by delta**

Run: `git diff --name-status main...HEAD --diff-filter=A` to list files created on this branch, then cross-reference against `bunx tsc --noEmit -p .` output — confirm zero errors on any path under `src/features/seller-dashboard/` or in the two modified `manager-dashboard` files. Pre-existing baseline `tsc` errors elsewhere in the repo are expected and out of scope (see `CLAUDE.md`, "O `bun run build`... NÃO faz type-check").

- [ ] **Step 4: Manual QA checklist (dev server)**

Run: `bun run dev`, then in the browser:
1. Log in as a Vendedor profile (e.g. `mock-vendedor-lucas` on the login screen) → land on `/app/inicio` → confirm the personal dashboard renders (greeting with the right time-of-day label, 5 KPI cards, goal card, chart, queue card, ranking card, records card with "em breve" badge) instead of the old blocked screen.
2. Toggle the period pills (Hoje / 7 dias / 30 dias) → confirm KPIs, deltas and the chart (hourly bars ↔ daily bars) update.
3. Click a queue entry (if any conversations are waiting) → confirm it navigates to `/app/atendimento`.
4. Click "Ver ranking →" → confirm it navigates to `/app/gestao/ranking`.
5. Log in as Owner or Gestor → confirm `/app/inicio` is unchanged (still the full `ManagerDashboardPage`, tabs and widgets intact).
6. Switch the app theme/mode (ThemeSwitcher) → confirm the new dashboard's colors follow the active theme (no fixed dark palette bleeding through).

- [ ] **Step 5: Final commit (if the QA pass required fixes)**

```bash
git add -A
git commit -m "fix(seller-dashboard): address manual QA findings"
```

(Skip this step if Step 4 found nothing to fix.)
