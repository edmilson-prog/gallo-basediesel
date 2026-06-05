# Fundação Forecast (PRD-056) + Copiloto Analítico (PRD-057) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, testable core of the closing-forecast engine (PRD-056) and the analytics-copilot text-to-metric core (PRD-057), with unit tests — no UI surfaces.

**Architecture:** All business logic lives in pure functions (`computeForecast`, `buildForecastInput`, `resolveQuery`, `scopeClamp`, `executeQuery`) under `src/features/sales-forecast/` and `src/features/analytics-copilot/`. The only React glue is the thin `useForecast` hook, which composes existing BI hooks and delegates all math to the pure functions. The copilot executor reads numbers exclusively through an injected `IAnalyticsDataAccess` port (the number never comes from the resolver — RNF-001). New domain types live in `src/shared/types/`.

**Tech Stack:** TypeScript (strict), React 19, TanStack Query, Vitest (added by this plan, node environment), Vite 7 + `vite-tsconfig-paths` for `@/` alias resolution in tests.

**Reference spec:** `docs/superpowers/specs/2026-06-04-forecast-copiloto-fundacao-design.md`

**Branch:** `feat/prd-056-057-foundation` (already checked out).

---

## Conventions for every task

- **Type-check command:** `bunx tsc --noEmit` (the repo's `tsconfig.json` has `noEmit: true`). Expected: no errors.
- **Run a single test file:** `bunx vitest run <path>`
- **Run all tests:** `bun run test` (added in Task 0 as `vitest run`).
- **No version bump / no CHANGELOG** in this foundation — those happen when the surface effort lands the PRDs as `_DONE` (per spec §9).
- **Imports:** use `@/` alias. For `@/providers/data` and `@/mocks`, import only from the package **barrel** (ESLint `no-restricted-imports` forbids deep paths there).

---

## File Structure

**Created by this plan:**

| File | Responsibility |
|------|----------------|
| `vitest.config.ts` | Vitest config (node env, `@/` alias via tsconfigPaths) |
| `src/shared/types/forecast.ts` | Forecast domain types (PRD-056) |
| `src/shared/types/analytics-copilot.ts` | Copilot domain types + `IAnalyticsDataAccess` port (PRD-057) |
| `src/features/sales-forecast/engine/defaults.ts` | `DEFAULT_FORECAST_CONFIG` |
| `src/features/sales-forecast/engine/computeForecast.ts` | Pure forecast engine (3 scenarios, residual rule) |
| `src/features/sales-forecast/engine/buildForecastInput.ts` | Pure assembler raw data → `IForecastInput` |
| `src/features/sales-forecast/engine/__tests__/computeForecast.test.ts` | Engine unit tests |
| `src/features/sales-forecast/engine/__tests__/buildForecastInput.test.ts` | Assembler unit tests |
| `src/features/sales-forecast/hooks/useForecast.ts` | Thin React hook (composes BI hooks → engine) |
| `src/features/sales-forecast/index.ts` | Barrel |
| `src/features/analytics-copilot/catalog/metricCatalog.ts` | Declarative metric catalog (8 metrics) |
| `src/features/analytics-copilot/catalog/__tests__/metricCatalog.test.ts` | Catalog invariants |
| `src/features/analytics-copilot/engine/resolveQuery.ts` | Pure intent resolver (keyword/brand/category) |
| `src/features/analytics-copilot/engine/scopeClamp.ts` | Pure RBAC scope clamp |
| `src/features/analytics-copilot/engine/executeQuery.ts` | Deterministic executor over the port |
| `src/features/analytics-copilot/engine/__tests__/resolveQuery.test.ts` | Resolver tests |
| `src/features/analytics-copilot/engine/__tests__/scopeClamp.test.ts` | Clamp tests |
| `src/features/analytics-copilot/engine/__tests__/executeQuery.test.ts` | Executor tests (stub port) |
| `src/features/analytics-copilot/index.ts` | Barrel |

**Modified:** `package.json` (devDependency `vitest` + `test` scripts). No other existing file is modified (the integration with cockpit/Metas is surface-phase).

---

## Task 0: Vitest test infrastructure

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create (temporary): `src/__sanity__.test.ts`

- [ ] **Step 1: Install Vitest as a dev dependency**

Run:
```bash
bun add -d vitest
```
Expected: vitest added to `devDependencies`. **If the command is blocked by the `bunfig.toml` 24h supply-chain guard (`minimumReleaseAge`), STOP and ask the user before adding `vitest` to `minimumReleaseAgeExcludes`** — per project policy, do not edit the excludes without confirmation.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block, add these three entries (keep all existing scripts):
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui",
```

- [ ] **Step 4: Create a temporary sanity test**

File `src/__sanity__.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("vitest setup", () => {
  it("runs arithmetic", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run the sanity test**

Run: `bunx vitest run src/__sanity__.test.ts`
Expected: PASS — `1 passed`.

- [ ] **Step 6: Delete the temporary sanity test**

Delete `src/__sanity__.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock vitest.config.ts
git commit -m "test: add Vitest runner (node env) with @/ alias support"
```

---

## Task 1: Forecast domain types (PRD-056)

**Files:**
- Create: `src/shared/types/forecast.ts`

- [ ] **Step 1: Create the types file**

```typescript
import type { ID, ISO8601, Money } from "./common";
import type { GoalLevel, GoalMetric, IGoalPeriod } from "./bi";
import type { GoalProgressStatus } from "./goals";
import type { ILead } from "./lead";

/** Three deterministic scenarios projected for the period close. */
export type ForecastScenarioType = "pessimista" | "provavel" | "otimista";

/** Metrics supported by the forecast MVP (D-5). */
export type ForecastMetric = Extract<GoalMetric, "revenue" | "tickets">;

/** How open pipeline is weighted into the forecast. */
export type PipelineWeightingMode = "temperature" | "stage" | "hybrid";

/** Composition of a projected value: already realized + weighted pipeline + residual run-rate. */
export interface IForecastBreakdown {
  realized: Money;
  weightedPipeline: Money;
  /** Run-rate contribution AFTER the residual rule (max(0, runRate - weightedPipeline)). */
  runRateRemainder: Money;
}

export interface IForecastScenario {
  type: ForecastScenarioType;
  projectedValue: Money;
  /** target - projected; negative means above target. Undefined when there is no goal. */
  gapToTarget?: Money;
  gapPercent?: number;
  /** Orders still needed to reach the target (when avgTicket is known and a gap exists). */
  ordersNeeded?: number;
  /** Traffic-light status reusing PRD-042 semantics. */
  status: GoalProgressStatus;
  breakdown: IForecastBreakdown;
}

export interface IForecastScope {
  level: GoalLevel;
  targetId: ID;
  storeId: ID;
  sellerId?: ID;
}

export interface IForecast {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: Money;
  targetValue?: Money;
  scenarios: IForecastScenario[];
  daysElapsed: number;
  daysRemaining: number;
  totalDays: number;
  lowConfidence: boolean;
  computedAt: ISO8601;
}

export interface ITemperatureWeights {
  frio: number;
  morno: number;
  quente: number;
}

export interface IScenarioFactors {
  pessimista: number;
  provavel: number;
  otimista: number;
}

export interface IForecastConfig {
  temperatureWeights: ITemperatureWeights;
  scenarioFactors: IScenarioFactors;
  pipelineWeightingMode: PipelineWeightingMode;
  /** Weight per lead-stage id; used when pipelineWeightingMode is "stage" or "hybrid". */
  stageWeights?: Record<ID, number>;
  /** Below this many elapsed days, the forecast is flagged low-confidence. */
  lowConfidenceMinDays: number;
}

export interface IForecastInput {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: Money;
  /** Average ticket for the period; enables ordersNeeded. */
  avgTicket?: Money;
  /** Open opportunities of the scope (already filtered to "open"). */
  openLeads: ILead[];
  /** Active goal target for the scope, if any. */
  target?: { value: Money };
  calendar: { daysElapsed: number; daysRemaining: number; totalDays: number };
  /** Injected "now" so the engine stays deterministic (RNF-002). */
  now: ISO8601;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/forecast.ts
git commit -m "feat(sales-forecast): add forecast domain types (PRD-056)"
```

---

## Task 2: Forecast engine — defaults + `computeForecast`

**Files:**
- Create: `src/features/sales-forecast/engine/defaults.ts`
- Create: `src/features/sales-forecast/engine/computeForecast.ts`
- Test: `src/features/sales-forecast/engine/__tests__/computeForecast.test.ts`

- [ ] **Step 1: Create the defaults file**

`src/features/sales-forecast/engine/defaults.ts`:
```typescript
import type { IForecastConfig } from "@/shared/types/forecast";

/** Ratified defaults (spec D-3/D-4). Tunable later via the config surface. */
export const DEFAULT_FORECAST_CONFIG: IForecastConfig = {
  temperatureWeights: { frio: 0.1, morno: 0.4, quente: 0.75 },
  scenarioFactors: { pessimista: 0.85, provavel: 1.0, otimista: 1.15 },
  pipelineWeightingMode: "temperature",
  lowConfidenceMinDays: 3,
};
```

- [ ] **Step 2: Write the failing engine test**

`src/features/sales-forecast/engine/__tests__/computeForecast.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

import { computeForecast } from "../computeForecast";
import { DEFAULT_FORECAST_CONFIG } from "../defaults";
import type { IForecastInput } from "@/shared/types/forecast";
import type { ILead } from "@/shared/types/lead";

function makeLead(over: Partial<ILead>): ILead {
  return {
    id: over.id ?? "lead-1",
    storeId: "store-1",
    sellerId: "seller-1",
    name: "Lead",
    phone: "x",
    stage: { id: "stage-1", name: "Novo", order: 1, color: "#000000" },
    temperature: over.temperature ?? "quente",
    origin: "whatsapp",
    estimatedValue: over.estimatedValue,
    conversations: [],
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function baseInput(over: Partial<IForecastInput> = {}): IForecastInput {
  return {
    scope: { level: "store", targetId: "store-1", storeId: "store-1" },
    metric: "revenue",
    period: { type: "monthly", start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" },
    realizedValue: 100_000,
    avgTicket: 4_000,
    openLeads: [],
    target: { value: 180_000 },
    calendar: { daysElapsed: 15, daysRemaining: 15, totalDays: 30 },
    now: "2026-06-15T12:00:00.000Z",
    ...over,
  };
}

const provavel = (input: IForecastInput, config = DEFAULT_FORECAST_CONFIG) =>
  computeForecast(input, config).scenarios.find((s) => s.type === "provavel")!;

describe("computeForecast", () => {
  it("temperature mode weights pipeline by lead temperature (default)", () => {
    const f = provavel(
      baseInput({
        realizedValue: 0,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 40_000, temperature: "quente" })],
        target: undefined,
      }),
    );
    expect(f.breakdown.weightedPipeline).toBe(30_000); // 40000 * 0.75
  });

  it("stage mode weights pipeline by stage id", () => {
    const config = { ...DEFAULT_FORECAST_CONFIG, pipelineWeightingMode: "stage" as const, stageWeights: { "stage-1": 0.5 } };
    const f = provavel(
      baseInput({
        realizedValue: 0,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 10_000, temperature: "frio" })],
        target: undefined,
      }),
      config,
    );
    expect(f.breakdown.weightedPipeline).toBe(5_000); // 10000 * 0.5
  });

  it("hybrid mode averages temperature and stage weights", () => {
    const config = { ...DEFAULT_FORECAST_CONFIG, pipelineWeightingMode: "hybrid" as const, stageWeights: { "stage-1": 0.5 } };
    const f = provavel(
      baseInput({
        realizedValue: 0,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 10_000, temperature: "quente" })],
        target: undefined,
      }),
      config,
    );
    expect(f.breakdown.weightedPipeline).toBe(6_250); // 10000 * (0.75 + 0.5)/2
  });

  it("residual rule: run-rate contributes 0 when weighted pipeline covers it", () => {
    const f = provavel(
      baseInput({
        realizedValue: 20_000,
        calendar: { daysElapsed: 25, daysRemaining: 5, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 40_000, temperature: "quente" })], // 30000
        target: { value: 60_000 },
      }),
    );
    // runRateRaw = (20000/25)*5 = 4000; contribution = max(0, 4000-30000) = 0
    expect(f.breakdown.realized).toBe(20_000);
    expect(f.breakdown.weightedPipeline).toBe(30_000);
    expect(f.breakdown.runRateRemainder).toBe(0);
    expect(f.projectedValue).toBe(50_000);
  });

  it("residual rule: run-rate fills the gap above weighted pipeline", () => {
    const f = provavel(
      baseInput({
        realizedValue: 100_000,
        calendar: { daysElapsed: 15, daysRemaining: 15, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 40_000, temperature: "quente" })], // 30000
        target: { value: 180_000 },
      }),
    );
    // runRateRaw = (100000/15)*15 = 100000; contribution = max(0, 100000-30000) = 70000
    expect(f.breakdown.weightedPipeline).toBe(30_000);
    expect(f.breakdown.runRateRemainder).toBe(70_000);
    expect(f.projectedValue).toBe(200_000);
  });

  it("applies scenario factors to pessimista and otimista", () => {
    const all = computeForecast(
      baseInput({
        realizedValue: 150_000,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
        target: undefined,
      }),
      DEFAULT_FORECAST_CONFIG,
    );
    const get = (t: string) => all.scenarios.find((s) => s.type === t)!.projectedValue;
    expect(get("provavel")).toBe(150_000);
    expect(get("pessimista")).toBeCloseTo(127_500); // * 0.85
    expect(get("otimista")).toBeCloseTo(172_500); // * 1.15
  });

  it("computes gap-to-target and ordersNeeded for a scenario", () => {
    const f = provavel(
      baseInput({
        realizedValue: 150_000,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
        target: { value: 180_000 },
        avgTicket: 3_000,
      }),
    );
    expect(f.gapToTarget).toBe(30_000);
    expect(f.gapPercent).toBeCloseTo(0.1667, 3);
    expect(f.ordersNeeded).toBe(10); // ceil(30000 / 3000)
  });

  it("omits gap fields when there is no target", () => {
    const all = computeForecast(
      baseInput({ target: undefined, calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 } }),
      DEFAULT_FORECAST_CONFIG,
    );
    const f = all.scenarios.find((s) => s.type === "provavel")!;
    expect(f.gapToTarget).toBeUndefined();
    expect(f.gapPercent).toBeUndefined();
    expect(all.targetValue).toBeUndefined();
  });

  it("flags lowConfidence below the threshold and not at/above it", () => {
    expect(
      computeForecast(baseInput({ calendar: { daysElapsed: 2, daysRemaining: 28, totalDays: 30 } }), DEFAULT_FORECAST_CONFIG)
        .lowConfidence,
    ).toBe(true);
    expect(
      computeForecast(baseInput({ calendar: { daysElapsed: 3, daysRemaining: 27, totalDays: 30 } }), DEFAULT_FORECAST_CONFIG)
        .lowConfidence,
    ).toBe(false);
  });

  it("marks scenario concluida when realized already hit target", () => {
    const f = provavel(
      baseInput({
        realizedValue: 200_000,
        target: { value: 180_000 },
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
      }),
    );
    expect(f.status).toBe("concluida");
  });

  it("marks scenario atrasada when projection is well below target", () => {
    const f = provavel(
      baseInput({
        realizedValue: 50_000,
        target: { value: 180_000 },
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
      }),
    );
    expect(f.status).toBe("atrasada");
  });

  it("uses the injected now for computedAt (deterministic)", () => {
    const out = computeForecast(baseInput({ now: "2026-06-15T12:00:00.000Z" }), DEFAULT_FORECAST_CONFIG);
    expect(out.computedAt).toBe("2026-06-15T12:00:00.000Z");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run src/features/sales-forecast/engine/__tests__/computeForecast.test.ts`
Expected: FAIL — cannot find module `../computeForecast`.

- [ ] **Step 4: Implement `computeForecast`**

`src/features/sales-forecast/engine/computeForecast.ts`:
```typescript
import type {
  ForecastScenarioType,
  IForecast,
  IForecastBreakdown,
  IForecastConfig,
  IForecastInput,
  IForecastScenario,
} from "@/shared/types/forecast";
import type { GoalProgressStatus } from "@/shared/types/goals";
import type { ILead } from "@/shared/types/lead";

/**
 * Probability weight for a single open lead, driven by config.pipelineWeightingMode:
 * - "temperature": temperatureWeights[lead.temperature]
 * - "stage": stageWeights[lead.stage.id] (0 when missing)
 * - "hybrid": average of both; falls back to temperature when the stage weight is missing
 */
function leadWeight(lead: ILead, config: IForecastConfig): number {
  const tempWeight = config.temperatureWeights[lead.temperature];
  if (config.pipelineWeightingMode === "temperature") return tempWeight;

  const stageWeight = config.stageWeights?.[lead.stage.id];
  if (config.pipelineWeightingMode === "stage") return stageWeight ?? 0;

  // hybrid
  if (stageWeight === undefined) return tempWeight;
  return (tempWeight + stageWeight) / 2;
}

function computeWeightedPipeline(openLeads: ILead[], config: IForecastConfig): number {
  return openLeads.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0) * leadWeight(lead, config), 0);
}

/**
 * Scenario traffic-light status. Distinguishes "concluida" (already realized >= target)
 * from "no_caminho" (projected to reach target). Reuses GoalProgressStatus (PRD-042).
 */
function scenarioStatus(realized: number, projected: number, target: number | undefined): GoalProgressStatus {
  if (target === undefined || target <= 0) return "no_caminho";
  if (realized >= target) return "concluida";
  if (projected >= target) return "no_caminho";
  if (projected >= target * 0.9) return "atencao";
  return "atrasada";
}

function scaleBreakdown(base: IForecastBreakdown, factor: number): IForecastBreakdown {
  return {
    realized: base.realized * factor,
    weightedPipeline: base.weightedPipeline * factor,
    runRateRemainder: base.runRateRemainder * factor,
  };
}

function buildScenario(
  type: ForecastScenarioType,
  factor: number,
  baseBreakdown: IForecastBreakdown,
  realizedValue: number,
  target: number | undefined,
  avgTicket: number | undefined,
): IForecastScenario {
  const breakdown = scaleBreakdown(baseBreakdown, factor);
  const projectedValue = breakdown.realized + breakdown.weightedPipeline + breakdown.runRateRemainder;
  const status = scenarioStatus(realizedValue, projectedValue, target);

  let gapToTarget: number | undefined;
  let gapPercent: number | undefined;
  let ordersNeeded: number | undefined;
  if (target !== undefined) {
    gapToTarget = target - projectedValue;
    gapPercent = target > 0 ? gapToTarget / target : 0;
    if (avgTicket && avgTicket > 0 && gapToTarget > 0) {
      ordersNeeded = Math.ceil(gapToTarget / avgTicket);
    }
  }

  return { type, projectedValue, gapToTarget, gapPercent, ordersNeeded, status, breakdown };
}

/**
 * Pure, deterministic closing forecast (PRD-056). No React, no fetch, no global clock.
 * Combination of provável (D-1, residual rule):
 *   runRateRaw   = (realized / max(daysElapsed,1)) * daysRemaining
 *   runRateRem   = max(0, runRateRaw - weightedPipeline)   // pipeline has priority, no double-count
 *   provávelBase = realized + weightedPipeline + runRateRem
 * pessimista/otimista scale provávelBase by config.scenarioFactors.
 */
export function computeForecast(input: IForecastInput, config: IForecastConfig): IForecast {
  const { realizedValue, openLeads, target, calendar, metric, period, scope, avgTicket } = input;
  const { daysElapsed, daysRemaining, totalDays } = calendar;

  const weightedPipeline = computeWeightedPipeline(openLeads, config);
  const runRateRaw = (realizedValue / Math.max(daysElapsed, 1)) * daysRemaining;
  const runRateRemainder = Math.max(0, runRateRaw - weightedPipeline);

  const baseBreakdown: IForecastBreakdown = {
    realized: realizedValue,
    weightedPipeline,
    runRateRemainder,
  };

  const targetValue = target?.value;
  const scenarios: IForecastScenario[] = [
    buildScenario("pessimista", config.scenarioFactors.pessimista, baseBreakdown, realizedValue, targetValue, avgTicket),
    buildScenario("provavel", config.scenarioFactors.provavel, baseBreakdown, realizedValue, targetValue, avgTicket),
    buildScenario("otimista", config.scenarioFactors.otimista, baseBreakdown, realizedValue, targetValue, avgTicket),
  ];

  return {
    scope,
    metric,
    period,
    realizedValue,
    targetValue,
    scenarios,
    daysElapsed,
    daysRemaining,
    totalDays,
    lowConfidence: daysElapsed < config.lowConfidenceMinDays,
    computedAt: input.now,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bunx vitest run src/features/sales-forecast/engine/__tests__/computeForecast.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/sales-forecast/engine/defaults.ts src/features/sales-forecast/engine/computeForecast.ts src/features/sales-forecast/engine/__tests__/computeForecast.test.ts
git commit -m "feat(sales-forecast): add deterministic computeForecast engine with residual rule (PRD-056)"
```

---

## Task 3: Forecast input assembler — `buildForecastInput`

**Files:**
- Create: `src/features/sales-forecast/engine/buildForecastInput.ts`
- Test: `src/features/sales-forecast/engine/__tests__/buildForecastInput.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/sales-forecast/engine/__tests__/buildForecastInput.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

import { buildForecastInput } from "../buildForecastInput";
import type { ILead } from "@/shared/types/lead";

function makeLead(over: Partial<ILead>): ILead {
  return {
    id: over.id ?? "lead-1",
    storeId: "store-1",
    sellerId: "seller-1",
    name: "Lead",
    phone: "x",
    stage: { id: "stage-1", name: "Novo", order: 1, color: "#000000" },
    temperature: "quente",
    origin: "whatsapp",
    estimatedValue: over.estimatedValue,
    conversations: [],
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

const period = { type: "monthly" as const, start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" };
const scope = { level: "store" as const, targetId: "store-1", storeId: "store-1" };

describe("buildForecastInput", () => {
  it("filters out converted and lost leads, keeping only open ones", () => {
    const leads = [
      makeLead({ id: "a", estimatedValue: 10_000 }),
      makeLead({ id: "b", estimatedValue: 20_000, convertedToCustomerId: "cust-1" }),
      makeLead({ id: "c", estimatedValue: 30_000, lossReason: "preço" }),
    ];
    const input = buildForecastInput({
      scope,
      metric: "revenue",
      period,
      realizedValue: 100_000,
      leads,
      now: new Date("2026-06-16T00:00:00.000Z"),
    });
    expect(input.openLeads).toHaveLength(1);
    expect(input.openLeads[0].id).toBe("a");
  });

  it("derives the calendar from the period and now, and stamps now as ISO", () => {
    const input = buildForecastInput({
      scope,
      metric: "revenue",
      period,
      realizedValue: 0,
      leads: [],
      now: new Date("2026-06-16T00:00:00.000Z"),
    });
    expect(input.calendar.totalDays).toBe(30);
    expect(input.calendar.daysElapsed).toBe(15);
    expect(input.calendar.daysRemaining).toBe(15);
    expect(input.now).toBe("2026-06-16T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/sales-forecast/engine/__tests__/buildForecastInput.test.ts`
Expected: FAIL — cannot find module `../buildForecastInput`.

- [ ] **Step 3: Implement `buildForecastInput`**

`src/features/sales-forecast/engine/buildForecastInput.ts`:
```typescript
import { describePeriodWindow } from "@/features/goals/engine/projection";
import type { IGoalPeriod } from "@/shared/types/bi";
import type { ForecastMetric, IForecastInput, IForecastScope } from "@/shared/types/forecast";
import type { ILead } from "@/shared/types/lead";

export interface IBuildForecastInputArgs {
  scope: IForecastScope;
  metric: ForecastMetric;
  period: IGoalPeriod;
  realizedValue: number;
  avgTicket?: number;
  /** Raw leads of the scope; open ones are filtered here. */
  leads: ILead[];
  target?: { value: number };
  now: Date;
}

/** A lead is "open" when it is neither converted nor lost (mirrors LeadsPage's activeCount). */
function isOpenLead(lead: ILead): boolean {
  return !lead.convertedToCustomerId && !lead.lossReason;
}

/** Pure assembler: turns raw provider data into the IForecastInput the engine consumes. */
export function buildForecastInput(args: IBuildForecastInputArgs): IForecastInput {
  const openLeads = args.leads.filter(isOpenLead);
  const window = describePeriodWindow(args.period, args.now);
  return {
    scope: args.scope,
    metric: args.metric,
    period: args.period,
    realizedValue: args.realizedValue,
    avgTicket: args.avgTicket,
    openLeads,
    target: args.target,
    calendar: {
      daysElapsed: window.daysPassed,
      daysRemaining: window.daysRemaining,
      totalDays: window.totalDays,
    },
    now: args.now.toISOString(),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/sales-forecast/engine/__tests__/buildForecastInput.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/sales-forecast/engine/buildForecastInput.ts src/features/sales-forecast/engine/__tests__/buildForecastInput.test.ts
git commit -m "feat(sales-forecast): add pure buildForecastInput assembler (PRD-056)"
```

---

## Task 4: `useForecast` hook + barrel

> The hook is thin React glue: it composes existing BI hooks and delegates ALL math to `buildForecastInput` + `computeForecast` (both already unit-tested). It is verified by `tsc` (full integration test deferred to the surface phase, where real providers exist) — the logic itself has no untested branch.

**Files:**
- Create: `src/features/sales-forecast/hooks/useForecast.ts`
- Create: `src/features/sales-forecast/index.ts`

- [ ] **Step 1: Implement the hook**

`src/features/sales-forecast/hooks/useForecast.ts`:
```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useSalesAnalytics, type ISalesFiltersState } from "@/features/sales-analytics";
import { useGoalsWithProgress } from "@/features/goals";
import { useLeadsProvider } from "@/providers/data";
import type { GoalLevel, IGoalPeriod } from "@/shared/types/bi";
import type { ID } from "@/shared/types/common";
import type { ForecastMetric, IForecast, IForecastConfig } from "@/shared/types/forecast";

import { buildForecastInput } from "../engine/buildForecastInput";
import { computeForecast } from "../engine/computeForecast";
import { DEFAULT_FORECAST_CONFIG } from "../engine/defaults";

export interface IUseForecastFilters {
  storeId: ID;
  sellerId?: ID;
  metric: ForecastMetric;
  config?: IForecastConfig;
}

export interface IUseForecastResult {
  forecast: IForecast | null;
  isLoading: boolean;
  hasError: boolean;
}

/** Calendar-month bounds as ISO strings (local time), no @/mocks dependency. */
function monthBounds(date: Date): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * Derives the closing forecast in runtime from existing BI providers (PRD-056, RF-015).
 * Aggregates inputs (not a sum of per-seller forecasts) and memoizes the result.
 */
export function useForecast(filters: IUseForecastFilters): IUseForecastResult {
  const { storeId, sellerId, metric, config = DEFAULT_FORECAST_CONFIG } = filters;

  const now = useMemo(() => new Date(), []);

  const windows = useMemo(() => {
    const cur = monthBounds(now);
    const prev = monthBounds(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const period: IGoalPeriod = { type: "monthly", start: cur.start, end: cur.end };
    return {
      current: { fromIso: cur.start, toIso: cur.end },
      previous: { fromIso: prev.start, toIso: prev.end },
      period,
    };
  }, [now]);

  const salesFilters: ISalesFiltersState = useMemo(
    () => ({
      period: "custom",
      fromIso: windows.current.fromIso,
      toIso: windows.current.toIso,
      store: "all",
      seller: "all",
      category: "all",
      vehicleBrand: "all",
      channel: "all",
    }),
    [windows],
  );

  const sales = useSalesAnalytics({
    filters: salesFilters,
    window: windows.current,
    previousWindow: windows.previous,
    scope: { storeId, sellerId },
  });

  const goals = useGoalsWithProgress({ storeId, sellerId, statuses: ["ativa"] });

  const leadsProvider = useLeadsProvider();
  const leadsQuery = useQuery({
    queryKey: ["forecast", "leads", storeId, sellerId ?? "all"],
    queryFn: () => leadsProvider.list({ storeId, sellerId, pageSize: 1000 }),
    staleTime: 30_000,
  });

  const isLoading = sales.isLoading || goals.isLoading || leadsQuery.isLoading;
  const hasError = sales.hasError || goals.hasError || leadsQuery.isError;

  const forecast = useMemo<IForecast | null>(() => {
    if (isLoading || hasError) return null;

    const realizedValue = metric === "revenue" ? sales.kpis.revenue.current : sales.kpis.orderCount.current;
    const avgTicket = sales.kpis.avgTicket.current;

    const nowMs = now.getTime();
    const matching = goals.items.find(
      (it) =>
        it.goal.metric === metric &&
        new Date(it.goal.period.start).getTime() <= nowMs &&
        new Date(it.goal.period.end).getTime() >= nowMs,
    );
    const target = matching ? { value: matching.goal.targetValue } : undefined;

    const leads = leadsQuery.data?.data ?? [];
    const level: GoalLevel = sellerId ? "individual" : "store";

    const input = buildForecastInput({
      scope: { level, targetId: sellerId ?? storeId, storeId, sellerId },
      metric,
      period: windows.period,
      realizedValue,
      avgTicket,
      leads,
      target,
      now,
    });

    return computeForecast(input, config);
  }, [isLoading, hasError, metric, sales, goals.items, leadsQuery.data, storeId, sellerId, windows, now, config]);

  return { forecast, isLoading, hasError };
}
```

- [ ] **Step 2: Create the barrel**

`src/features/sales-forecast/index.ts`:
```typescript
export { computeForecast } from "./engine/computeForecast";
export { buildForecastInput, type IBuildForecastInputArgs } from "./engine/buildForecastInput";
export { DEFAULT_FORECAST_CONFIG } from "./engine/defaults";
export { useForecast, type IUseForecastFilters, type IUseForecastResult } from "./hooks/useForecast";
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. (If `useLeadsProvider` is not re-exported from `@/providers/data`, the type-check fails here — in that case import it from `@/providers/data/hooks/useLeadsProvider` and re-run; do not deep-import other provider internals.)

- [ ] **Step 4: Lint the new feature (barrel-import rules)**

Run: `bunx eslint src/features/sales-forecast`
Expected: no errors (confirms no restricted deep imports).

- [ ] **Step 5: Commit**

```bash
git add src/features/sales-forecast/hooks/useForecast.ts src/features/sales-forecast/index.ts
git commit -m "feat(sales-forecast): add useForecast hook composing BI providers (PRD-056)"
```

---

## Task 5: Copilot domain types + data-access port (PRD-057)

**Files:**
- Create: `src/shared/types/analytics-copilot.ts`

- [ ] **Step 1: Create the types file**

```typescript
import type { ID, ISO8601 } from "./common";
import type { IGoalPeriod } from "./bi";
import type { RoleName } from "./people";

/** Dimensions a question can slice a metric by. */
export type MetricDimension = "vendedor" | "canal" | "categoria" | "marca" | "cliente" | "loja" | "tempo";

export type ComparisonMode = "previous_period" | "previous_year";

export interface IMetricSource {
  prd: string;
  panelRoute: string;
  label: string;
}

export interface IMetricQueryScope {
  storeId?: ID;
  sellerId?: ID;
  role: RoleName;
}

export interface IMetricQuery {
  metricId: string;
  dimensions: MetricDimension[];
  filters: Partial<Record<MetricDimension, string>>;
  period: IGoalPeriod;
  comparison?: ComparisonMode;
  /** Filled by scopeClamp before execution. */
  scope?: IMetricQueryScope;
}

/**
 * Deterministic data-access port — the ONLY dependency of executeQuery (RNF-001).
 * Each method returns a number already computed by the BI engines. In tests, a stub
 * provides canned values; in the app (surface phase), a thin adapter wires these to
 * useSalesAnalytics / useProfitabilityData / usePositivationMetrics / useABCClassification /
 * usePortfolioMetrics / useForecast.
 */
export interface IAnalyticsDataAccess {
  getSalesMetric(query: IMetricQuery): Promise<{ value: number; previousValue?: number; series?: number[] }>;
  getMargin(query: IMetricQuery): Promise<{ value: number; previousValue?: number }>;
  getPositivation(query: IMetricQuery): Promise<{ value: number; previousValue?: number }>;
  getABCClass(query: IMetricQuery): Promise<{ value: number; series?: number[] }>;
  getPortfolioStatus(query: IMetricQuery): Promise<{ value: number }>;
  getForecast(query: IMetricQuery): Promise<{ value: number }>;
}

export type AnalyticsDataAccessKey = keyof IAnalyticsDataAccess;

export interface IMetricDefinition {
  id: string;
  label: string;
  description: string;
  /** Aligned to the existing vocabulary (GoalMetric/IndicatorMetric where applicable). */
  metricKey: string;
  dimensions: MetricDimension[];
  supportedFilters: MetricDimension[];
  /** Synonyms used by the mock resolver. */
  keywords: string[];
  source: IMetricSource;
  requiredRole?: RoleName;
  /** Maps the metric to its executor method on the port. */
  dataAccessKey: AnalyticsDataAccessKey;
}

export interface IAnalyticsCitation {
  source: IMetricSource;
  drillDownUrl: string;
}

export interface IAnalyticsComparison {
  previousValue: number;
  delta: number;
  deltaPercent: number;
}

export type AnalyticsVisualType = "none" | "sparkline" | "number";

export interface IAnalyticsAnswer {
  query?: IMetricQuery;
  resolved: boolean;
  value?: number;
  series?: number[];
  formattedValue?: string;
  comparison?: IAnalyticsComparison;
  citation?: IAnalyticsCitation;
  visual?: AnalyticsVisualType;
  refusedByScope?: boolean;
  ambiguous?: boolean;
  suggestions?: string[];
}

export interface IAnalyticsMessage {
  id: ID;
  role: "user" | "assistant";
  text?: string;
  answer?: IAnalyticsAnswer;
  timestamp: ISO8601;
}

export interface IAnalyticsSession {
  id: ID;
  messages: IAnalyticsMessage[];
}

export interface IAnalyticsCopilotContext {
  storeId?: ID;
  sellerId?: ID;
  role: RoleName;
  now: ISO8601;
}

/** Provider contract (mock in Fase 1; LLM resolver swap in Fase 2). Implemented in the surface phase. */
export interface IAnalyticsCopilotProvider {
  ask(question: string, context: IAnalyticsCopilotContext): Promise<IAnalyticsAnswer>;
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. (Confirms `RoleName` is exported from `src/shared/types/people.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/analytics-copilot.ts
git commit -m "feat(analytics-copilot): add copilot domain types and data-access port (PRD-057)"
```

---

## Task 6: Metric catalog

**Files:**
- Create: `src/features/analytics-copilot/catalog/metricCatalog.ts`
- Test: `src/features/analytics-copilot/catalog/__tests__/metricCatalog.test.ts`

> **Content note:** confirm each `source.prd` against the index in `docs/prds/` before the surface phase. The values below are best-effort; the test only enforces the `PRD-\d+` format and a valid route, not the exact number. `positivacao` is set to `PRD-043` provisionally.

- [ ] **Step 1: Write the failing catalog test**

`src/features/analytics-copilot/catalog/__tests__/metricCatalog.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

import { metricCatalog, findMetricById } from "../metricCatalog";

describe("metricCatalog", () => {
  it("has at least the 8 MVP metrics", () => {
    expect(metricCatalog.length).toBeGreaterThanOrEqual(8);
  });

  it("every metric has a complete source (prd + /app route + label)", () => {
    for (const m of metricCatalog) {
      expect(m.source.prd).toMatch(/^PRD-\d+$/);
      expect(m.source.panelRoute.startsWith("/app/")).toBe(true);
      expect(m.source.label.length).toBeGreaterThan(0);
    }
  });

  it("every metric has at least one keyword", () => {
    for (const m of metricCatalog) {
      expect(m.keywords.length).toBeGreaterThan(0);
    }
  });

  it("metric ids are unique", () => {
    const ids = metricCatalog.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("findMetricById resolves a known metric to its metricKey", () => {
    expect(findMetricById("faturamento")?.metricKey).toBe("revenue");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/analytics-copilot/catalog/__tests__/metricCatalog.test.ts`
Expected: FAIL — cannot find module `../metricCatalog`.

- [ ] **Step 3: Implement the catalog**

`src/features/analytics-copilot/catalog/metricCatalog.ts`:
```typescript
import type { IMetricDefinition } from "@/shared/types/analytics-copilot";

/** The only consultable vocabulary (RF-008). Each metric declares its source + executor. */
export const metricCatalog: IMetricDefinition[] = [
  {
    id: "faturamento",
    label: "Faturamento",
    description: "Receita total de pedidos pagos no período.",
    metricKey: "revenue",
    dimensions: ["marca", "categoria", "canal", "vendedor", "tempo"],
    supportedFilters: ["marca", "categoria", "canal", "vendedor"],
    keywords: ["faturamento", "faturei", "faturou", "vendi", "vendas", "receita", "faturado"],
    source: { prd: "PRD-041", panelRoute: "/app/gestao/vendas", label: "Vendas" },
    dataAccessKey: "getSalesMetric",
  },
  {
    id: "margem",
    label: "Margem",
    description: "Margem de contribuição (receita − custo) no período.",
    metricKey: "margin",
    dimensions: ["categoria", "cliente", "vendedor", "tempo"],
    supportedFilters: ["categoria", "vendedor"],
    keywords: ["margem", "lucro", "rentabilidade", "lucratividade"],
    source: { prd: "PRD-049", panelRoute: "/app/gestao/rentabilidade", label: "Rentabilidade" },
    dataAccessKey: "getMargin",
  },
  {
    id: "pedidos",
    label: "Pedidos",
    description: "Quantidade de pedidos pagos no período.",
    metricKey: "tickets",
    dimensions: ["vendedor", "canal", "tempo"],
    supportedFilters: ["vendedor", "canal"],
    keywords: ["pedidos", "quantos pedidos", "numero de pedidos", "tickets", "vendas fechadas"],
    source: { prd: "PRD-041", panelRoute: "/app/gestao/vendas", label: "Vendas" },
    dataAccessKey: "getSalesMetric",
  },
  {
    id: "ticket_medio",
    label: "Ticket médio",
    description: "Valor médio por pedido no período.",
    metricKey: "ticket_medio",
    dimensions: ["vendedor", "tempo"],
    supportedFilters: ["vendedor"],
    keywords: ["ticket medio", "valor medio", "media por pedido"],
    source: { prd: "PRD-041", panelRoute: "/app/gestao/vendas", label: "Vendas" },
    dataAccessKey: "getSalesMetric",
  },
  {
    id: "positivacao",
    label: "Positivação",
    description: "Clientes ativos que compraram ao menos uma vez no período.",
    metricKey: "positivacao",
    dimensions: ["vendedor", "tempo"],
    supportedFilters: ["vendedor"],
    keywords: ["positivacao", "clientes que compraram", "positivados"],
    source: { prd: "PRD-043", panelRoute: "/app/gestao/positivacao", label: "Positivação" },
    dataAccessKey: "getPositivation",
  },
  {
    id: "curva_abc",
    label: "Curva ABC",
    description: "Classificação de clientes por participação na receita (A/B/C).",
    metricKey: "abc",
    dimensions: ["cliente", "tempo"],
    supportedFilters: ["cliente"],
    keywords: ["curva abc", "classe a", "classe b", "classe c", "melhores clientes"],
    source: { prd: "PRD-045", panelRoute: "/app/gestao/abc", label: "Curva ABC" },
    dataAccessKey: "getABCClass",
  },
  {
    id: "carteira",
    label: "Carteira",
    description: "Status da carteira de clientes (ativo, dormente, perdido, recuperação).",
    metricKey: "carteira",
    dimensions: ["vendedor", "cliente"],
    supportedFilters: ["vendedor"],
    keywords: ["carteira", "clientes em risco", "clientes dormentes", "churn", "clientes perdidos"],
    source: { prd: "PRD-046", panelRoute: "/app/gestao/carteira-analitica", label: "Carteira" },
    dataAccessKey: "getPortfolioStatus",
  },
  {
    id: "forecast",
    label: "Forecast de fechamento",
    description: "Projeção de fechamento do período (cenário provável).",
    metricKey: "forecast",
    dimensions: ["loja", "vendedor", "tempo"],
    supportedFilters: ["vendedor"],
    keywords: ["forecast", "projecao", "vou fechar", "previsao de fechamento", "onde vou fechar"],
    source: { prd: "PRD-056", panelRoute: "/app/gestao/forecast", label: "Forecast" },
    dataAccessKey: "getForecast",
  },
];

export function findMetricById(id: string): IMetricDefinition | undefined {
  return metricCatalog.find((m) => m.id === id);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/analytics-copilot/catalog/__tests__/metricCatalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/catalog/metricCatalog.ts src/features/analytics-copilot/catalog/__tests__/metricCatalog.test.ts
git commit -m "feat(analytics-copilot): add declarative metric catalog (PRD-057)"
```

---

## Task 7: Intent resolver — `resolveQuery`

**Files:**
- Create: `src/features/analytics-copilot/engine/resolveQuery.ts`
- Test: `src/features/analytics-copilot/engine/__tests__/resolveQuery.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/analytics-copilot/engine/__tests__/resolveQuery.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

import { resolveQuery } from "../resolveQuery";
import { metricCatalog } from "../../catalog/metricCatalog";
import type { IGoalPeriod } from "@/shared/types/bi";

const period: IGoalPeriod = { type: "monthly", start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" };
const ctx = { period };

describe("resolveQuery", () => {
  it("resolves 'quanto faturei de filtro Volvo esse mês?'", () => {
    const r = resolveQuery("quanto faturei de filtro Volvo esse mês?", ctx, metricCatalog);
    expect(r.query?.metricId).toBe("faturamento");
    expect(r.query?.filters.marca).toBe("Volvo");
    expect(r.query?.filters.categoria).toBe("filtro");
  });

  it("returns null for a question outside the catalog", () => {
    const r = resolveQuery("qual a previsão do tempo amanhã?", ctx, metricCatalog);
    expect(r.query).toBeNull();
    expect(r.ambiguous).toBe(false);
  });

  it("flags ambiguity when more than one metric matches", () => {
    const r = resolveQuery("me mostra vendas e margem", ctx, metricCatalog);
    expect(r.query).toBeNull();
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toContain("faturamento");
    expect(r.candidates).toContain("margem");
  });

  it("detects a previous-period comparison", () => {
    const r = resolveQuery("faturamento desse mês vs o mês passado", ctx, metricCatalog);
    expect(r.query?.metricId).toBe("faturamento");
    expect(r.query?.comparison).toBe("previous_period");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/resolveQuery.test.ts`
Expected: FAIL — cannot find module `../resolveQuery`.

- [ ] **Step 3: Implement `resolveQuery`**

`src/features/analytics-copilot/engine/resolveQuery.ts`:
```typescript
import { BRAND_ALIASES_FLAT } from "@/features/part-identification/data/brands";
import { PART_CATEGORY_ENTRIES } from "@/features/part-identification/data/partCategories";
import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  ComparisonMode,
  IMetricDefinition,
  IMetricQuery,
  MetricDimension,
} from "@/shared/types/analytics-copilot";

export interface IResolveContext {
  /** Current period used when the question implies "this period". */
  period: IGoalPeriod;
}

export interface IResolveResult {
  query: IMetricQuery | null;
  ambiguous: boolean;
  /** Metric ids that matched (for disambiguation chips). */
  candidates: string[];
}

/** Lowercase + strip diacritics so "Volvo"/"vólvo"/"VOLVO" all match. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function matchMetrics(normalized: string, catalog: IMetricDefinition[]): IMetricDefinition[] {
  return catalog.filter((m) => m.keywords.some((kw) => normalized.includes(normalize(kw))));
}

function extractBrand(normalized: string): string | undefined {
  for (const { alias, canonical } of BRAND_ALIASES_FLAT) {
    if (normalized.includes(normalize(alias))) return canonical;
  }
  return undefined;
}

function extractCategory(normalized: string): string | undefined {
  for (const entry of PART_CATEGORY_ENTRIES) {
    if (entry.keywords.some((kw) => normalized.includes(normalize(kw)))) return entry.canonical;
  }
  return undefined;
}

function extractComparison(normalized: string): ComparisonMode | undefined {
  if (
    normalized.includes("vs") ||
    normalized.includes("comparado") ||
    normalized.includes("mes passado") ||
    normalized.includes("mes anterior")
  ) {
    return "previous_period";
  }
  if (normalized.includes("ano passado") || normalized.includes("ano anterior")) {
    return "previous_year";
  }
  return undefined;
}

/**
 * Pure intent resolver (RF-009). Maps a natural-language question to a structured IMetricQuery,
 * or null when outside the catalog (RF-016) or ambiguous (RF-011). Never produces a number.
 */
export function resolveQuery(
  question: string,
  context: IResolveContext,
  catalog: IMetricDefinition[],
): IResolveResult {
  const normalized = normalize(question);
  const matched = matchMetrics(normalized, catalog);

  if (matched.length === 0) {
    return { query: null, ambiguous: false, candidates: [] };
  }
  if (matched.length > 1) {
    return { query: null, ambiguous: true, candidates: matched.map((m) => m.id) };
  }

  const metric = matched[0];
  const filters: Partial<Record<MetricDimension, string>> = {};

  const brand = extractBrand(normalized);
  if (brand && metric.supportedFilters.includes("marca")) filters.marca = brand;

  const category = extractCategory(normalized);
  if (category && metric.supportedFilters.includes("categoria")) filters.categoria = category;

  const query: IMetricQuery = {
    metricId: metric.id,
    dimensions: [],
    filters,
    period: context.period,
    comparison: extractComparison(normalized),
  };
  return { query, ambiguous: false, candidates: [metric.id] };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/resolveQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. (Confirms `BRAND_ALIASES_FLAT` and `PART_CATEGORY_ENTRIES` import paths.)

- [ ] **Step 6: Commit**

```bash
git add src/features/analytics-copilot/engine/resolveQuery.ts src/features/analytics-copilot/engine/__tests__/resolveQuery.test.ts
git commit -m "feat(analytics-copilot): add pure intent resolver (PRD-057)"
```

---

## Task 8: RBAC scope clamp — `scopeClamp`

**Files:**
- Create: `src/features/analytics-copilot/engine/scopeClamp.ts`
- Test: `src/features/analytics-copilot/engine/__tests__/scopeClamp.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/analytics-copilot/engine/__tests__/scopeClamp.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

import { scopeClamp } from "../scopeClamp";
import type { IMetricQuery } from "@/shared/types/analytics-copilot";

const baseQuery: IMetricQuery = {
  metricId: "faturamento",
  dimensions: [],
  filters: {},
  period: { type: "monthly", start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" },
};

describe("scopeClamp", () => {
  it("locks Vendedor to their own sellerId", () => {
    const r = scopeClamp(baseQuery, { role: "Vendedor", storeId: "store-1", sellerId: "seller-1" });
    expect(r.query.scope?.sellerId).toBe("seller-1");
    expect(r.refusedByScope).toBe(false);
  });

  it("refuses Vendedor querying another seller via filter", () => {
    const q: IMetricQuery = { ...baseQuery, filters: { vendedor: "seller-2" } };
    const r = scopeClamp(q, { role: "Vendedor", storeId: "store-1", sellerId: "seller-1" });
    expect(r.refusedByScope).toBe(true);
  });

  it("refuses Vendedor cross-seller dimension", () => {
    const q: IMetricQuery = { ...baseQuery, dimensions: ["vendedor"] };
    const r = scopeClamp(q, { role: "Vendedor", storeId: "store-1", sellerId: "seller-1" });
    expect(r.refusedByScope).toBe(true);
  });

  it("restricts Gestor to the store", () => {
    const r = scopeClamp(baseQuery, { role: "Gestor", storeId: "store-1" });
    expect(r.query.scope?.storeId).toBe("store-1");
    expect(r.refusedByScope).toBe(false);
  });

  it("leaves Owner cross-store", () => {
    const r = scopeClamp(baseQuery, { role: "Owner" });
    expect(r.refusedByScope).toBe(false);
    expect(r.query.scope?.role).toBe("Owner");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/scopeClamp.test.ts`
Expected: FAIL — cannot find module `../scopeClamp`.

- [ ] **Step 3: Implement `scopeClamp`**

`src/features/analytics-copilot/engine/scopeClamp.ts`:
```typescript
import type { ID } from "@/shared/types/common";
import type { RoleName } from "@/shared/types";
import type { IMetricQuery, IMetricQueryScope } from "@/shared/types/analytics-copilot";

export interface IClampContext {
  role: RoleName;
  storeId?: ID;
  sellerId?: ID;
}

export interface IClampResult {
  query: IMetricQuery;
  refusedByScope: boolean;
}

/**
 * Pure RBAC clamp (RF-012). Restricts a query to the user's scope BEFORE execution.
 * Vendedor → own seller only (cross-seller filters/dimensions are refused, RF-013).
 * Gestor → store. Owner → cross-store. Financeiro → as provided.
 */
export function scopeClamp(query: IMetricQuery, ctx: IClampContext): IClampResult {
  const scope: IMetricQueryScope = { role: ctx.role, storeId: ctx.storeId, sellerId: ctx.sellerId };
  let refusedByScope = false;

  if (ctx.role === "Vendedor") {
    scope.sellerId = ctx.sellerId;
    if (query.filters.vendedor && query.filters.vendedor !== ctx.sellerId) {
      refusedByScope = true;
    }
    if (query.dimensions.includes("vendedor")) {
      refusedByScope = true;
    }
  } else if (ctx.role === "Gestor") {
    scope.storeId = ctx.storeId;
  }
  // Owner / Financeiro / others: keep the provided scope (Owner is cross-store).

  return { query: { ...query, scope }, refusedByScope };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/scopeClamp.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/analytics-copilot/engine/scopeClamp.ts src/features/analytics-copilot/engine/__tests__/scopeClamp.test.ts
git commit -m "feat(analytics-copilot): add pure RBAC scope clamp (PRD-057)"
```

---

## Task 9: Deterministic executor — `executeQuery`

**Files:**
- Create: `src/features/analytics-copilot/engine/executeQuery.ts`
- Test: `src/features/analytics-copilot/engine/__tests__/executeQuery.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/analytics-copilot/engine/__tests__/executeQuery.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";

import { executeQuery, refusalAnswer, unresolvedAnswer } from "../executeQuery";
import { findMetricById } from "../../catalog/metricCatalog";
import type { IAnalyticsDataAccess, IMetricQuery } from "@/shared/types/analytics-copilot";

function makeStubPort(overrides: Partial<IAnalyticsDataAccess> = {}): IAnalyticsDataAccess {
  const notImpl = () => Promise.reject(new Error("not implemented"));
  return {
    getSalesMetric: vi.fn(() => Promise.resolve({ value: 84_320, previousValue: 75_200 })),
    getMargin: notImpl,
    getPositivation: notImpl,
    getABCClass: notImpl,
    getPortfolioStatus: notImpl,
    getForecast: notImpl,
    ...overrides,
  };
}

const scopedQuery: IMetricQuery = {
  metricId: "faturamento",
  dimensions: [],
  filters: { marca: "Volvo", categoria: "filtro" },
  period: { type: "monthly", start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" },
  comparison: "previous_period",
  scope: { role: "Owner", storeId: "store-1" },
};

describe("executeQuery", () => {
  it("returns the value from the port — never invents it", async () => {
    const port = makeStubPort();
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, port);
    expect(answer.resolved).toBe(true);
    expect(answer.value).toBe(84_320);
    expect(port.getSalesMetric).toHaveBeenCalledWith(scopedQuery);
  });

  it("formats currency in pt-BR", async () => {
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, makeStubPort());
    expect(answer.formattedValue).toContain("R$");
  });

  it("computes the comparison delta", async () => {
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, makeStubPort());
    expect(answer.comparison?.previousValue).toBe(75_200);
    expect(answer.comparison?.delta).toBe(84_320 - 75_200);
  });

  it("builds a citation with drill-down filters", async () => {
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, makeStubPort());
    expect(answer.citation?.source.label).toBe("Vendas");
    expect(answer.citation?.drillDownUrl).toContain("marca=Volvo");
  });

  it("throws when the query is not scoped (clamp must run first)", async () => {
    const unscoped: IMetricQuery = { ...scopedQuery, scope: undefined };
    await expect(executeQuery(findMetricById("faturamento")!, unscoped, makeStubPort())).rejects.toThrow();
  });

  it("unresolvedAnswer carries suggestions and no number", () => {
    const a = unresolvedAnswer(["faturamento do mês", "top vendedores"]);
    expect(a.resolved).toBe(false);
    expect(a.value).toBeUndefined();
    expect(a.suggestions).toHaveLength(2);
  });

  it("refusalAnswer never carries a value", () => {
    const a = refusalAnswer(scopedQuery);
    expect(a.refusedByScope).toBe(true);
    expect(a.value).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/executeQuery.test.ts`
Expected: FAIL — cannot find module `../executeQuery`.

- [ ] **Step 3: Implement `executeQuery`**

`src/features/analytics-copilot/engine/executeQuery.ts`:
```typescript
import { formatBRL } from "@/shared/utils/format";
import type {
  IAnalyticsAnswer,
  IAnalyticsDataAccess,
  IMetricDefinition,
  IMetricQuery,
} from "@/shared/types/analytics-copilot";

/** Count/percentage-style metrics are formatted as plain pt-BR numbers; the rest as BRL. */
const COUNT_METRIC_KEYS = new Set(["tickets", "abc", "positivacao", "carteira"]);

function buildDrillDownUrl(panelRoute: string, query: IMetricQuery): string {
  const params = new URLSearchParams();
  if (query.filters.marca) params.set("marca", query.filters.marca);
  if (query.filters.categoria) params.set("categoria", query.filters.categoria);
  if (query.filters.vendedor) params.set("vendedor", query.filters.vendedor);
  if (query.filters.canal) params.set("canal", query.filters.canal);
  const qs = params.toString();
  return qs ? `${panelRoute}?${qs}` : panelRoute;
}

function formatMetricValue(metricKey: string, value: number): string {
  if (COUNT_METRIC_KEYS.has(metricKey)) return value.toLocaleString("pt-BR");
  return formatBRL(value);
}

type PortResult = { value: number; previousValue?: number; series?: number[] };

/**
 * Deterministic executor (RF-014, RNF-001). The value comes EXCLUSIVELY from the injected port;
 * the resolver only chose the metric/filters. Requires a scoped query (run scopeClamp first).
 */
export async function executeQuery(
  definition: IMetricDefinition,
  query: IMetricQuery,
  dataAccess: IAnalyticsDataAccess,
): Promise<IAnalyticsAnswer> {
  if (query.scope === undefined) {
    throw new Error("executeQuery requires a scoped query (run scopeClamp first).");
  }

  // Unify the port method's call signature (union of methods → one signature).
  const accessor = dataAccess[definition.dataAccessKey] as (q: IMetricQuery) => Promise<PortResult>;
  const result = await accessor(query);

  let comparison: IAnalyticsAnswer["comparison"];
  if (query.comparison && result.previousValue !== undefined) {
    const delta = result.value - result.previousValue;
    const deltaPercent = result.previousValue !== 0 ? delta / result.previousValue : 0;
    comparison = { previousValue: result.previousValue, delta, deltaPercent };
  }

  return {
    query,
    resolved: true,
    value: result.value,
    series: result.series,
    formattedValue: formatMetricValue(definition.metricKey, result.value),
    comparison,
    citation: {
      source: definition.source,
      drillDownUrl: buildDrillDownUrl(definition.source.panelRoute, query),
    },
    visual: result.series && result.series.length > 0 ? "sparkline" : "number",
  };
}

/** Honest "I don't know" answer for questions outside the catalog (RF-016). */
export function unresolvedAnswer(suggestions: string[]): IAnalyticsAnswer {
  return { resolved: false, suggestions };
}

/** Transparent refusal for out-of-scope queries (RF-013). Never carries a number. */
export function refusalAnswer(query: IMetricQuery): IAnalyticsAnswer {
  return { query, resolved: false, refusedByScope: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/executeQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors. (Confirms `formatBRL` import path and the port-call cast compile.)

- [ ] **Step 6: Commit**

```bash
git add src/features/analytics-copilot/engine/executeQuery.ts src/features/analytics-copilot/engine/__tests__/executeQuery.test.ts
git commit -m "feat(analytics-copilot): add deterministic executor over data-access port (PRD-057)"
```

---

## Task 10: Copilot barrel + final verification

**Files:**
- Create: `src/features/analytics-copilot/index.ts`

- [ ] **Step 1: Create the barrel**

`src/features/analytics-copilot/index.ts`:
```typescript
export { metricCatalog, findMetricById } from "./catalog/metricCatalog";
export { resolveQuery, type IResolveContext, type IResolveResult } from "./engine/resolveQuery";
export { scopeClamp, type IClampContext, type IClampResult } from "./engine/scopeClamp";
export { executeQuery, refusalAnswer, unresolvedAnswer } from "./engine/executeQuery";
```

- [ ] **Step 2: Run the full test suite**

Run: `bun run test`
Expected: PASS — all forecast + copilot test files green (computeForecast, buildForecastInput, metricCatalog, resolveQuery, scopeClamp, executeQuery).

- [ ] **Step 3: Full type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Lint both new features**

Run: `bunx eslint src/features/sales-forecast src/features/analytics-copilot src/shared/types/forecast.ts src/shared/types/analytics-copilot.ts`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/index.ts
git commit -m "feat(analytics-copilot): add feature barrel (PRD-057)"
```

---

## Self-Review

**1. Spec coverage** (spec §4–§6 → tasks):
- 056 types (§4.1) → Task 1. ✓
- 056 engine + residual rule D-1 + 3 scenarios + gap + lowConfidence + weighting modes (§4.2) → Task 2. ✓
- 056 input assembler / open-lead filter / calendar (§4.3) → Task 3. ✓
- 056 hook composing providers (§4.3) → Task 4. ✓
- 057 types + port (§5.1) → Task 5. ✓
- 057 catalog 8 metrics + invariants (§5.2) → Task 6. ✓
- 057 resolver keyword/brand/category/comparison/null/ambiguous (§5.3) → Task 7. ✓
- 057 clamp by role (§5.4) → Task 8. ✓
- 057 executor over port + citation + comparison + RNF-001 (§5.5) → Task 9. ✓
- 057 provider contract documented (§5.6) → declared in Task 5 types (`IAnalyticsCopilotProvider`), implementation deferred to surface. ✓
- Test infrastructure (§6) → Task 0. ✓

**2. Placeholder scan:** No TBD/TODO. The only deferred item is verifying `source.prd` numbers against `docs/prds/` (a data-accuracy note in Task 6) — the catalog ships with concrete, plausible values and a format-enforcing test, not a placeholder. The `useForecast` hook is intentionally `tsc`-verified rather than unit-tested (its logic lives in the tested pure functions); stated explicitly, not a gap.

**3. Type consistency:** `IForecastInput.now` (ISO) set by `buildForecastInput` and consumed by `computeForecast` as `computedAt`. `dataAccessKey` (Task 5) ↔ catalog entries (Task 6) ↔ `executeQuery` dispatch (Task 9) all use the same `keyof IAnalyticsDataAccess` keys. `IResolveResult`/`IClampResult` shapes match their tests. `ForecastMetric` = `"revenue" | "tickets"` used consistently in hook (`revenue`→`kpis.revenue.current`, `tickets`→`kpis.orderCount.current`).

**Open follow-ups (surface phase, out of scope here):** wire the real `IAnalyticsDataAccess` adapter; build `IAnalyticsCopilotProvider` mock via `useDataProviderSlice`; pages/widget/chat/config + RBAC routes + audit; version bump + CHANGELOG + rename PRDs to `_DONE`.
