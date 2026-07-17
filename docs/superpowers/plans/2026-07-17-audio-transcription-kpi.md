# KPI "Áudios transcritos" na Visão geral de IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 5th KPI card ("Áudios transcritos") to `Configurações → Inteligência artificial → Visão geral`, showing the count of successfully transcribed audios (`ai_usage_events` with `feature: 'audio_transcription'` and `status: 'ok'`) for the selected period.

**Architecture:** Extend the existing pure aggregation engine `summarizeUsage()` (`src/features/ai-settings/engine/aiUsage.ts`) with one new derived field on `IAiUsageSummary`. Both the mock and Supabase `ai` providers already funnel through this single function over the same `IAiUsageEvent[]`, so the new field appears in both automatically — no provider code, RPC, or migration changes. The UI only adds one more `<KpiCard>` reading the new field.

**Tech Stack:** TypeScript (strict), Vitest, React 19, Tailwind CSS v4, Iconify (`mdi:` icon set).

## Global Constraints

- TypeScript `strict: true` — no `any`. Interfaces prefixed with `I` (`IAiUsageSummary` already exists — only add a field).
- UI-facing strings in Brazilian Portuguese with correct accents (this feature adds the label "Áudios transcritos" — note the accents on "Áudios").
- Test command: `bun run test` (Vitest, run once). New/changed logic must have co-located `*.test.ts` coverage in `engine/`.
- `bun run build` does not type-check; run `bunx tsc --noEmit` separately and evaluate only new/changed files against the pre-existing baseline (per `CLAUDE.md`).
- Commits follow Conventional Commits in English, atomic.
- Spec reference: `docs/superpowers/specs/2026-07-17-audio-transcription-kpi-design.md` (approved 2026-07-17).

---

### Task 1: `audioTranscriptions` field in the usage summary engine

**Files:**
- Modify: `src/shared/types/ai.ts:86-100` (`IAiUsageSummary` interface)
- Modify: `src/features/ai-settings/engine/aiUsage.ts:27-102` (`summarizeUsage`)
- Test: `src/features/ai-settings/engine/aiUsage.test.ts`

**Interfaces:**
- Consumes: existing `IAiUsageEvent` shape (`feature?: AiFeatureKey`, `status: AiUsageStatus`) — already defined, unchanged.
- Produces: `IAiUsageSummary.audioTranscriptions: number` — a plain count, consumed by Task 2's `AiOverviewTab.tsx` as `summary.audioTranscriptions`.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/ai-settings/engine/aiUsage.test.ts` (inside the existing `describe("summarizeUsage", ...)` block, using the file's existing `ev()` helper and `now` — do not redeclare them):

```ts
  it("conta só transcrições de áudio com sucesso (status ok)", () => {
    const events = [
      ev({ feature: "audio_transcription", status: "ok" }),
      ev({ feature: "audio_transcription", status: "error", costBRL: 0 }),
      ev({ feature: "audio_transcription", status: "ok" }),
      ev({ feature: "sdr", status: "ok" }),
    ];
    const s = summarizeUsage(
      events,
      "last_30d",
      { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 },
      now,
    );
    expect(s.audioTranscriptions).toBe(2);
  });

  it("audioTranscriptions é 0 quando não há eventos de transcrição no período", () => {
    const events = [ev({ feature: "sdr", status: "ok" }), ev({ feature: "insights", status: "error" })];
    const s = summarizeUsage(
      events,
      "last_30d",
      { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 },
      now,
    );
    expect(s.audioTranscriptions).toBe(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test aiUsage.test.ts`
Expected: FAIL — `Property 'audioTranscriptions' does not exist` (TS) or `expect(received).toBe(expected)` with `received: undefined`, since neither the type nor the computation exist yet.

- [ ] **Step 3: Add the field to `IAiUsageSummary`**

In `src/shared/types/ai.ts`, current interface (lines 86-100):

```ts
export interface IAiUsageSummary {
  period: AiUsagePeriod;
  calls: number;
  tokens: number;
  costBRL: number;
  budgetPct: number;
  projectionBRL: number;
  avgTokensPerCall: number;
  avgLatencyMs: number;
  errorRate: number;
  fallbackRate: number;
  byProvider: Array<{ providerId: AiProviderId; calls: number; tokens: number; costBRL: number }>;
  byFeature: Array<{ feature: AiFeatureKey; calls: number; costBRL: number; growthPct: number }>;
  series: Array<{ date: ISO8601; calls: number; tokens: number; costBRL: number }>;
}
```

Add `audioTranscriptions: number;` right after `fallbackRate: number;`:

```ts
export interface IAiUsageSummary {
  period: AiUsagePeriod;
  calls: number;
  tokens: number;
  costBRL: number;
  budgetPct: number;
  projectionBRL: number;
  avgTokensPerCall: number;
  avgLatencyMs: number;
  errorRate: number;
  fallbackRate: number;
  audioTranscriptions: number;
  byProvider: Array<{ providerId: AiProviderId; calls: number; tokens: number; costBRL: number }>;
  byFeature: Array<{ feature: AiFeatureKey; calls: number; costBRL: number; growthPct: number }>;
  series: Array<{ date: ISO8601; calls: number; tokens: number; costBRL: number }>;
}
```

- [ ] **Step 4: Compute the field in `summarizeUsage()`**

In `src/features/ai-settings/engine/aiUsage.ts`, current lines 36-41:

```ts
  const calls = inPeriod.length;
  const tokens = inPeriod.reduce((a, e) => a + e.inputTokens + e.outputTokens, 0);
  const costBRL = inPeriod.reduce((a, e) => a + e.costBRL, 0);
  const errors = inPeriod.filter((e) => e.status === "error").length;
  const fallbacks = inPeriod.filter((e) => e.status === "fallback").length;
  const latencySum = inPeriod.reduce((a, e) => a + e.latencyMs, 0);
```

Add one line after `latencySum`:

```ts
  const calls = inPeriod.length;
  const tokens = inPeriod.reduce((a, e) => a + e.inputTokens + e.outputTokens, 0);
  const costBRL = inPeriod.reduce((a, e) => a + e.costBRL, 0);
  const errors = inPeriod.filter((e) => e.status === "error").length;
  const fallbacks = inPeriod.filter((e) => e.status === "fallback").length;
  const latencySum = inPeriod.reduce((a, e) => a + e.latencyMs, 0);
  const audioTranscriptions = inPeriod.filter(
    (e) => e.feature === "audio_transcription" && e.status === "ok",
  ).length;
```

Then in the same file's return statement, current lines 81-92:

```ts
  return {
    period,
    calls,
    tokens,
    costBRL,
    budgetPct: budget.monthlyCapBRL > 0 ? (costBRL / budget.monthlyCapBRL) * 100 : 0,
    projectionBRL: costBRL, // refined by aiBudget.projectMonthlySpend for "current_month"
    avgTokensPerCall: calls > 0 ? Math.round(tokens / calls) : 0,
    avgLatencyMs: calls > 0 ? Math.round(latencySum / calls) : 0,
    errorRate: calls > 0 ? errors / calls : 0,
    fallbackRate: calls > 0 ? fallbacks / calls : 0,
    byProvider: [...byProviderMap.entries()].map(([providerId, v]) => ({ providerId, ...v })),
```

Add `audioTranscriptions,` after `fallbackRate`:

```ts
  return {
    period,
    calls,
    tokens,
    costBRL,
    budgetPct: budget.monthlyCapBRL > 0 ? (costBRL / budget.monthlyCapBRL) * 100 : 0,
    projectionBRL: costBRL, // refined by aiBudget.projectMonthlySpend for "current_month"
    avgTokensPerCall: calls > 0 ? Math.round(tokens / calls) : 0,
    avgLatencyMs: calls > 0 ? Math.round(latencySum / calls) : 0,
    errorRate: calls > 0 ? errors / calls : 0,
    fallbackRate: calls > 0 ? fallbacks / calls : 0,
    audioTranscriptions,
    byProvider: [...byProviderMap.entries()].map(([providerId, v]) => ({ providerId, ...v })),
```

(The rest of the return statement — `byFeature:` and `series:` — is unchanged.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun run test aiUsage.test.ts`
Expected: PASS — all tests in the file, including the 2 new ones (6 total).

- [ ] **Step 6: Type-check the changed files**

Run: `bunx tsc --noEmit`
Expected: no new errors attributable to `src/shared/types/ai.ts` or `src/features/ai-settings/engine/aiUsage.ts` (compare against the pre-existing baseline — these two files were not in the baseline error list before this change).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/ai.ts src/features/ai-settings/engine/aiUsage.ts src/features/ai-settings/engine/aiUsage.test.ts
git commit -m "feat(ai-settings): add audioTranscriptions field to usage summary"
```

---

### Task 2: 5th KPI card in `AiOverviewTab`

**Files:**
- Modify: `src/features/ai-settings/pages/AiOverviewTab.tsx:53-63`

**Interfaces:**
- Consumes: `summary.audioTranscriptions: number` from Task 1, and the file's existing `int` formatter (`new Intl.NumberFormat("pt-BR")`, already declared at the top of the file) and existing `KpiCard` component (`icon`, `label`, `value` props — no new props needed).
- Produces: nothing consumed by later tasks (this is the last task).

- [ ] **Step 1: Update the KPI grid**

Current `AiOverviewTab.tsx` lines 53-63:

```tsx
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon="mdi:lightning-bolt" label="Chamadas" value={int.format(summary.calls)} />
        <KpiCard icon="mdi:circle-multiple" label="Tokens" value={int.format(summary.tokens)} />
        <KpiCard icon="mdi:cash" label="Custo est." value={brl.format(summary.costBRL)} />
        <KpiCard
          icon="mdi:gauge"
          label="Budget"
          value={`${Math.round(summary.budgetPct)}%`}
          progressPct={summary.budgetPct}
        />
      </div>
```

Replace with (grid goes from 4 to 5 columns on desktop; new card added after "Budget"):

```tsx
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard icon="mdi:lightning-bolt" label="Chamadas" value={int.format(summary.calls)} />
        <KpiCard icon="mdi:circle-multiple" label="Tokens" value={int.format(summary.tokens)} />
        <KpiCard icon="mdi:cash" label="Custo est." value={brl.format(summary.costBRL)} />
        <KpiCard
          icon="mdi:gauge"
          label="Budget"
          value={`${Math.round(summary.budgetPct)}%`}
          progressPct={summary.budgetPct}
        />
        <KpiCard
          icon="mdi:microphone-message"
          label="Áudios transcritos"
          value={int.format(summary.audioTranscriptions)}
        />
      </div>
```

- [ ] **Step 2: Type-check and build**

Run: `bunx tsc --noEmit`
Expected: no new errors attributable to `src/features/ai-settings/pages/AiOverviewTab.tsx`.

Run: `bun run build`
Expected: build succeeds (exit code 0).

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`
Expected: all test files pass (255 files / 2003 tests — the 2001 baseline from the clean worktree check plus the 2 new tests from Task 1; no regressions).

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-settings/pages/AiOverviewTab.tsx
git commit -m "feat(ai-settings): show audio transcriptions KPI card in AI overview"
```

---

## Manual verification (not automatable — user does this)

Per project convention, UI verification in the browser is done by the user, not by the agent. After Task 2 is committed, the dev server (already running for this project) reflects the change on `Configurações → Inteligência artificial → Visão geral`: a 5th card "Áudios transcritos" should appear after "Budget", showing a count consistent with the "Transcrição de áudio" bar already shown in "Custo por funcionalidade" (same or lower — errors are excluded here).
