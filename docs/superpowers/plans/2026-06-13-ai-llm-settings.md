# Área de Inteligência Artificial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a área Owner-only `Configurações → Inteligência artificial` (hub com abas) para gerenciar provedores LLM, rotear modelo por funcionalidade com fallback, e visualizar consumo/budget — tudo mock-first, sem chamada real de LLM.

**Architecture:** Provider novo `ai` (37º) no Provider Pattern (`contracts` + `impl/mock` + `impl/supabase` stub), chaves sensíveis no Vault (estende `integration-secrets`), e lógica de consumo/budget/roteamento em `engine/` puro testado com Vitest. UI em feature `ai-settings/` com rota `app.configuracoes.ia` e abas sincronizadas por query param `?aba=`.

**Tech Stack:** React 19, TanStack Router (file-based), Tailwind v4 + shadcn/ui, recharts, Zustand (mock store), Vitest. Spec de origem: `docs/superpowers/specs/2026-06-13-ai-llm-settings-design.md`.

---

## Pré-requisito de execução (git)

O brainstorming foi feito na branch `chore/release-v0.93.0` (release em andamento, working tree sujo). **Antes da Task 1**, isole o trabalho:

```bash
# a partir de main, criar a branch da feature (ou usar superpowers:using-git-worktrees)
git stash push -u -m "wip release v0.93.0" 2>/dev/null || true
git checkout main && git checkout -b feat/ai-llm-settings
git add docs/superpowers/specs/2026-06-13-ai-llm-settings-design.md docs/superpowers/plans/2026-06-13-ai-llm-settings.md
git commit -m "docs: spec and plan for AI/LLM settings area"
```

> Se preferir worktree isolado, invoque `superpowers:using-git-worktrees` em vez do `checkout -b`. NÃO trabalhar na branch de release.

---

## File Structure

**Criar:**
- `src/shared/types/ai.ts` — tipos de domínio da feature.
- `src/providers/data/contracts/ai.ts` — `IAiProvider`.
- `src/providers/data/impl/mock/ai.ts` — mock determinístico (usa engine + dados seed).
- `src/providers/data/impl/mock/_aiSeed.ts` — config inicial + geração determinística de `IAiUsageEvent[]`.
- `src/providers/data/impl/supabase/ai.ts` — stub `NotImplementedError`.
- `src/providers/data/hooks/useAiProvider.ts` — hook de acesso.
- `src/features/ai-settings/engine/aiPricing.ts` (+ `.test.ts`)
- `src/features/ai-settings/engine/aiUsage.ts` (+ `.test.ts`)
- `src/features/ai-settings/engine/aiBudget.ts` (+ `.test.ts`)
- `src/features/ai-settings/engine/aiRouting.ts` (+ `.test.ts`)
- `src/features/ai-settings/hooks/useAiSettings.ts`, `useAiUsage.ts`
- `src/features/ai-settings/components/{KpiCard,ConsumptionAreaChart,ProviderShareDonut,CostByFeatureBars,ProviderCard,FeatureRoutingRow,BudgetAlert,AiMasterSwitch}.tsx`
- `src/features/ai-settings/pages/{AiSettingsPage,AiOverviewTab,AiProvidersTab,AiFeaturesTab,AiPlaygroundTab}.tsx`
- `src/features/ai-settings/i18n/pt-BR.ts`
- `src/features/ai-settings/index.ts` — barrel.
- `src/routes/app.configuracoes.ia.tsx` — rota.

**Modificar:**
- `src/shared/types/index.ts` — re-exportar `./ai`.
- `src/providers/data/contracts/index.ts` — import + `export type` + agregar `ai` em `IDataProviders`.
- `src/providers/data/factory.ts` — imports + `ai` em `mockProviders` e `supabaseProviders`.
- `src/providers/data/index.ts` — `export type { IAiProvider }` + `export { useAiProvider }`.
- `src/features/admin-settings/engine/integrationKeys.ts` (+ `.test.ts`) — grupo "Provedores LLM".
- `src/features/shell/layouts/SettingsLayout.tsx` — item de menu em *Integrações*.

> Convenção: features importam dados só via `@/providers/data` e tipos via `@/shared/types`. Comentários em inglês; UI em pt-BR com acentos.

---

## Task 1: Tipos de domínio (`shared/types/ai.ts`)

**Files:**
- Create: `src/shared/types/ai.ts`
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Criar `src/shared/types/ai.ts`**

```ts
import type { ID, ISO8601 } from "./common";

export type AiProviderId = "anthropic" | "openai" | "openrouter" | "google";

export type AiFeatureKey =
  | "conversation_copilot"
  | "analytics_copilot"
  | "sdr"
  | "part_identification"
  | "insights";

export interface IAiModelOption {
  id: string;
  label: string;
  inputPricePer1kUsd: number;
  outputPricePer1kUsd: number;
}

export type AiProviderStatus = "configured" | "not_configured" | "error";

export interface IAiProviderConfig {
  provider: AiProviderId;
  enabled: boolean;
  defaultModel: string;
  models: IAiModelOption[];
  credentialsRef: string;
  status: AiProviderStatus;
  lastTestedAt?: ISO8601;
  lastTestResult?: "ok" | "error";
}

export interface IAiGenerationParams {
  temperature: number;
  maxTokens: number;
  topP?: number;
}

export interface IAiFeatureRouting {
  feature: AiFeatureKey;
  enabled: boolean;
  providerId: AiProviderId;
  model: string;
  fallbackProviderId?: AiProviderId;
  fallbackModel?: string;
  params: IAiGenerationParams;
  systemPrompt: string;
  monthlyBudgetCapBRL?: number;
}

export interface IAiBudget {
  monthlyCapBRL: number;
  alertThresholdPct: number;
  usdToBrl: number;
}

export interface IAiSettings {
  masterEnabled: boolean;
  defaultProviderId: AiProviderId;
  budget: IAiBudget;
  providers: IAiProviderConfig[];
  routing: IAiFeatureRouting[];
}

export type AiUsageStatus = "ok" | "error" | "fallback";

export interface IAiUsageEvent {
  id: ID;
  ts: ISO8601;
  feature: AiFeatureKey;
  providerId: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
  status: AiUsageStatus;
}

export type AiUsagePeriod = "current_month" | "last_7d" | "last_30d";

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

export interface IAiPlaygroundInput {
  providerId: AiProviderId;
  model: string;
  params: IAiGenerationParams;
  prompt: string;
}

export interface IAiPlaygroundResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
}

export interface IAiTestConnectionResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export const AI_FEATURE_LABELS: Record<AiFeatureKey, string> = {
  conversation_copilot: "Copiloto de conversa",
  analytics_copilot: "Copiloto analítico",
  sdr: "SDR (qualificação automática)",
  part_identification: "Identificação de peça",
  insights: "Insights",
};

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  google: "Google",
};
```

- [ ] **Step 2: Re-exportar no barrel**

Em `src/shared/types/index.ts`, adicionar (junto às demais linhas `export * from "./..."`):

```ts
export * from "./ai";
```

- [ ] **Step 3: Verificar build de tipos (delta)**

Run: `bunx tsc --noEmit 2>&1 | grep "shared/types/ai" || echo "sem erros novos em ai.ts"`
Expected: "sem erros novos em ai.ts"

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/ai.ts src/shared/types/index.ts
git commit -m "feat(ai-settings): add AI domain types"
```

---

## Task 2: Catálogo de modelos + config inicial + seed de consumo

**Files:**
- Create: `src/providers/data/impl/mock/_aiSeed.ts`

> Dados determinísticos do mock. Preços em USD/1k (aproximações para o mock). O seed de eventos usa `seedrandom` (já dependência do projeto, usado em `src/mocks`).

- [ ] **Step 1: Criar `src/providers/data/impl/mock/_aiSeed.ts`**

```ts
import seedrandom from "seedrandom";
import type {
  AiFeatureKey,
  AiProviderId,
  IAiModelOption,
  IAiProviderConfig,
  IAiSettings,
  IAiUsageEvent,
} from "@/shared/types";

const MODELS: Record<AiProviderId, IAiModelOption[]> = {
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", inputPricePer1kUsd: 0.015, outputPricePer1kUsd: 0.075 },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", inputPricePer1kUsd: 0.003, outputPricePer1kUsd: 0.015 },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", inputPricePer1kUsd: 0.0008, outputPricePer1kUsd: 0.004 },
  ],
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2", inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 },
    { id: "gpt-5-mini", label: "GPT-5 mini", inputPricePer1kUsd: 0.0006, outputPricePer1kUsd: 0.0024 },
  ],
  openrouter: [
    { id: "auto", label: "Auto (melhor custo)", inputPricePer1kUsd: 0.005, outputPricePer1kUsd: 0.02 },
    { id: "anthropic/claude-opus-4.8", label: "Anthropic: Claude Opus 4.8", inputPricePer1kUsd: 0.015, outputPricePer1kUsd: 0.075 },
    { id: "google/gemini-2.5-pro", label: "Google: Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
  ],
  google: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", inputPricePer1kUsd: 0.0003, outputPricePer1kUsd: 0.0012 },
  ],
};

export function modelsFor(provider: AiProviderId): IAiModelOption[] {
  return MODELS[provider];
}

function providerConfig(
  provider: AiProviderId,
  defaultModel: string,
  status: IAiProviderConfig["status"],
): IAiProviderConfig {
  return {
    provider,
    enabled: status === "configured",
    defaultModel,
    models: MODELS[provider],
    credentialsRef: `${provider.toUpperCase()}_API_KEY`,
    status,
    lastTestedAt: status === "configured" ? "2026-06-12T09:40:00.000Z" : undefined,
    lastTestResult: status === "configured" ? "ok" : undefined,
  };
}

export function defaultAiSettings(): IAiSettings {
  return {
    masterEnabled: true,
    defaultProviderId: "anthropic",
    budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 },
    providers: [
      providerConfig("anthropic", "claude-opus-4-8", "configured"),
      providerConfig("openai", "gpt-5.2", "configured"),
      providerConfig("openrouter", "auto", "configured"),
      providerConfig("google", "gemini-2.5-pro", "not_configured"),
    ],
    routing: [
      { feature: "conversation_copilot", enabled: true, providerId: "openai", model: "gpt-5.2", fallbackProviderId: "anthropic", fallbackModel: "claude-sonnet-4-6", params: { temperature: 0.4, maxTokens: 1024 }, systemPrompt: "Você é o copiloto de atendimento da GALLO. Sugira respostas claras e comerciais." },
      { feature: "analytics_copilot", enabled: true, providerId: "anthropic", model: "claude-haiku-4-5", fallbackProviderId: "openai", fallbackModel: "gpt-5-mini", params: { temperature: 0.2, maxTokens: 800 }, systemPrompt: "Responda perguntas sobre os indicadores comerciais com números e comparações verificáveis." },
      { feature: "sdr", enabled: true, providerId: "anthropic", model: "claude-opus-4-8", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.5, maxTokens: 1024 }, systemPrompt: "Você é o SDR da GALLO. Qualifique o lead e conduza para o orçamento." },
      { feature: "part_identification", enabled: true, providerId: "google", model: "gemini-2.5-flash", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.1, maxTokens: 512 }, systemPrompt: "Extraia a peça (código, aplicação, montadora) a partir do texto/imagem do cliente." },
      { feature: "insights", enabled: false, providerId: "openrouter", model: "auto", params: { temperature: 0.6, maxTokens: 1200 }, systemPrompt: "Gere insights comerciais acionáveis a partir dos dados do período." },
    ],
  };
}

const FEATURES: AiFeatureKey[] = [
  "conversation_copilot",
  "analytics_copilot",
  "sdr",
  "part_identification",
  "insights",
];

/**
 * Deterministic 60-day usage history (covers "current month" + comparison).
 * `referenceIso` is the "now" anchor so reloads produce the same dataset.
 */
export function seedUsageEvents(referenceIso: string): IAiUsageEvent[] {
  const rng = seedrandom("gallo-ai-usage-v1");
  const settings = defaultAiSettings();
  const routingByFeature = new Map(settings.routing.map((r) => [r.feature, r]));
  const now = new Date(referenceIso);
  const events: IAiUsageEvent[] = [];
  for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - dayOffset);
    const callsToday = 20 + Math.floor(rng() * 60);
    for (let i = 0; i < callsToday; i++) {
      const feature = FEATURES[Math.floor(rng() * FEATURES.length)];
      const route = routingByFeature.get(feature)!;
      if (!route.enabled) continue;
      const usedFallback = rng() < 0.05;
      const providerId = usedFallback && route.fallbackProviderId ? route.fallbackProviderId : route.providerId;
      const model = usedFallback && route.fallbackModel ? route.fallbackModel : route.model;
      const inputTokens = 200 + Math.floor(rng() * 800);
      const outputTokens = 80 + Math.floor(rng() * 400);
      const isError = rng() < 0.02;
      const ts = new Date(day);
      ts.setUTCHours(8 + Math.floor(rng() * 11), Math.floor(rng() * 60), 0, 0);
      events.push({
        id: `aiu-${dayOffset}-${i}`,
        ts: ts.toISOString(),
        feature,
        providerId,
        model,
        inputTokens,
        outputTokens,
        costBRL: 0, // preenchido pelo engine de pricing no mock provider
        latencyMs: 600 + Math.floor(rng() * 1800),
        status: isError ? "error" : usedFallback ? "fallback" : "ok",
      });
    }
  }
  return events;
}
```

- [ ] **Step 2: Sanity check de import**

Run: `bunx tsc --noEmit 2>&1 | grep "_aiSeed" || echo "ok"`
Expected: "ok"

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/mock/_aiSeed.ts
git commit -m "feat(ai-settings): deterministic mock catalog, default settings and usage seed"
```

---

## Task 3: Engine de pricing (`aiPricing.ts`) — TDD

**Files:**
- Create: `src/features/ai-settings/engine/aiPricing.ts`
- Test: `src/features/ai-settings/engine/aiPricing.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { costOfTokens } from "./aiPricing";

describe("costOfTokens", () => {
  const pricing = { inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 };

  it("calcula custo em BRL a partir de tokens e câmbio", () => {
    // (1000/1000*0.01 + 1000/1000*0.03) = 0.04 USD * 5 = 0.20 BRL
    expect(costOfTokens(1000, 1000, pricing, 5)).toBeCloseTo(0.2, 5);
  });

  it("retorna 0 quando não há tokens", () => {
    expect(costOfTokens(0, 0, pricing, 5)).toBe(0);
  });

  it("escala proporcionalmente com tokens", () => {
    expect(costOfTokens(500, 0, pricing, 10)).toBeCloseTo(0.05, 5);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/ai-settings/engine/aiPricing.test.ts`
Expected: FAIL ("costOfTokens is not a function" / módulo não encontrado).

- [ ] **Step 3: Implementar**

```ts
export interface IModelPricing {
  inputPricePer1kUsd: number;
  outputPricePer1kUsd: number;
}

/** Cost in BRL for a single call given token counts, model pricing and USD→BRL rate. */
export function costOfTokens(
  inputTokens: number,
  outputTokens: number,
  pricing: IModelPricing,
  usdToBrl: number,
): number {
  const usd =
    (inputTokens / 1000) * pricing.inputPricePer1kUsd +
    (outputTokens / 1000) * pricing.outputPricePer1kUsd;
  return usd * usdToBrl;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/features/ai-settings/engine/aiPricing.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-settings/engine/aiPricing.ts src/features/ai-settings/engine/aiPricing.test.ts
git commit -m "feat(ai-settings): pure pricing engine (USD→BRL) with tests"
```

---

## Task 4: Engine de consumo (`aiUsage.ts`) — TDD

**Files:**
- Create: `src/features/ai-settings/engine/aiUsage.ts`
- Test: `src/features/ai-settings/engine/aiUsage.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { IAiUsageEvent } from "@/shared/types";
import { summarizeUsage } from "./aiUsage";

function ev(partial: Partial<IAiUsageEvent>): IAiUsageEvent {
  return {
    id: "x", ts: "2026-06-10T10:00:00.000Z", feature: "sdr", providerId: "anthropic",
    model: "claude-opus-4-8", inputTokens: 1000, outputTokens: 500, costBRL: 1,
    latencyMs: 1000, status: "ok", ...partial,
  };
}

describe("summarizeUsage", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");

  it("agrega chamadas, tokens e custo do período", () => {
    const events = [ev({ costBRL: 2, inputTokens: 1000, outputTokens: 0 }), ev({ costBRL: 3, inputTokens: 500, outputTokens: 500 })];
    const s = summarizeUsage(events, "last_30d", { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 }, now);
    expect(s.calls).toBe(2);
    expect(s.tokens).toBe(2000);
    expect(s.costBRL).toBeCloseTo(5, 5);
    expect(s.budgetPct).toBeCloseTo(5, 1);
    expect(s.avgTokensPerCall).toBe(1000);
  });

  it("calcula taxa de erro e de fallback", () => {
    const events = [ev({ status: "ok" }), ev({ status: "error" }), ev({ status: "fallback" }), ev({ status: "ok" })];
    const s = summarizeUsage(events, "last_30d", { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 }, now);
    expect(s.errorRate).toBeCloseTo(0.25, 5);
    expect(s.fallbackRate).toBeCloseTo(0.25, 5);
  });

  it("ignora eventos fora do período (last_7d)", () => {
    const events = [ev({ ts: "2026-06-12T10:00:00.000Z" }), ev({ ts: "2026-05-01T10:00:00.000Z" })];
    const s = summarizeUsage(events, "last_7d", { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 }, now);
    expect(s.calls).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/ai-settings/engine/aiUsage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type {
  AiFeatureKey,
  AiProviderId,
  AiUsagePeriod,
  IAiBudget,
  IAiUsageEvent,
  IAiUsageSummary,
} from "@/shared/types";

function periodStart(period: AiUsagePeriod, now: Date): Date {
  const d = new Date(now);
  if (period === "last_7d") d.setUTCDate(d.getUTCDate() - 7);
  else if (period === "last_30d") d.setUTCDate(d.getUTCDate() - 30);
  else d.setUTCDate(1), d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function summarizeUsage(
  events: IAiUsageEvent[],
  period: AiUsagePeriod,
  budget: IAiBudget,
  now: Date,
): IAiUsageSummary {
  const start = periodStart(period, now);
  const inPeriod = events.filter((e) => new Date(e.ts) >= start && new Date(e.ts) <= now);

  const calls = inPeriod.length;
  const tokens = inPeriod.reduce((a, e) => a + e.inputTokens + e.outputTokens, 0);
  const costBRL = inPeriod.reduce((a, e) => a + e.costBRL, 0);
  const errors = inPeriod.filter((e) => e.status === "error").length;
  const fallbacks = inPeriod.filter((e) => e.status === "fallback").length;
  const latencySum = inPeriod.reduce((a, e) => a + e.latencyMs, 0);

  const byProviderMap = new Map<AiProviderId, { calls: number; tokens: number; costBRL: number }>();
  for (const e of inPeriod) {
    const cur = byProviderMap.get(e.providerId) ?? { calls: 0, tokens: 0, costBRL: 0 };
    cur.calls += 1;
    cur.tokens += e.inputTokens + e.outputTokens;
    cur.costBRL += e.costBRL;
    byProviderMap.set(e.providerId, cur);
  }

  // growth vs período anterior de mesmo tamanho
  const spanMs = now.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - spanMs);
  const prev = events.filter((e) => new Date(e.ts) >= prevStart && new Date(e.ts) < start);
  const prevCostByFeature = new Map<AiFeatureKey, number>();
  for (const e of prev) prevCostByFeature.set(e.feature, (prevCostByFeature.get(e.feature) ?? 0) + e.costBRL);

  const byFeatureMap = new Map<AiFeatureKey, { calls: number; costBRL: number }>();
  for (const e of inPeriod) {
    const cur = byFeatureMap.get(e.feature) ?? { calls: 0, costBRL: 0 };
    cur.calls += 1;
    cur.costBRL += e.costBRL;
    byFeatureMap.set(e.feature, cur);
  }

  const seriesMap = new Map<string, { calls: number; tokens: number; costBRL: number }>();
  for (const e of inPeriod) {
    const k = dayKey(e.ts);
    const cur = seriesMap.get(k) ?? { calls: 0, tokens: 0, costBRL: 0 };
    cur.calls += 1;
    cur.tokens += e.inputTokens + e.outputTokens;
    cur.costBRL += e.costBRL;
    seriesMap.set(k, cur);
  }

  return {
    period,
    calls,
    tokens,
    costBRL,
    budgetPct: budget.monthlyCapBRL > 0 ? (costBRL / budget.monthlyCapBRL) * 100 : 0,
    projectionBRL: costBRL, // refinado em aiBudget.projectMonthlySpend para "current_month"
    avgTokensPerCall: calls > 0 ? Math.round(tokens / calls) : 0,
    avgLatencyMs: calls > 0 ? Math.round(latencySum / calls) : 0,
    errorRate: calls > 0 ? errors / calls : 0,
    fallbackRate: calls > 0 ? fallbacks / calls : 0,
    byProvider: [...byProviderMap.entries()].map(([providerId, v]) => ({ providerId, ...v })),
    byFeature: [...byFeatureMap.entries()].map(([feature, v]) => {
      const prevCost = prevCostByFeature.get(feature) ?? 0;
      const growthPct = prevCost > 0 ? ((v.costBRL - prevCost) / prevCost) * 100 : 0;
      return { feature, calls: v.calls, costBRL: v.costBRL, growthPct };
    }),
    series: [...seriesMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/features/ai-settings/engine/aiUsage.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-settings/engine/aiUsage.ts src/features/ai-settings/engine/aiUsage.test.ts
git commit -m "feat(ai-settings): pure usage aggregation engine with tests"
```

---

## Task 5: Engine de budget (`aiBudget.ts`) — TDD

**Files:**
- Create: `src/features/ai-settings/engine/aiBudget.ts`
- Test: `src/features/ai-settings/engine/aiBudget.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import { projectMonthlySpend, budgetLevel } from "./aiBudget";

describe("projectMonthlySpend", () => {
  it("extrapola o gasto parcial até o fim do mês (run-rate)", () => {
    // metade do mês de 30 dias, R$ 150 gastos → projeção ~R$ 300
    const now = new Date("2026-06-15T12:00:00.000Z");
    const p = projectMonthlySpend(150, now);
    expect(p).toBeGreaterThan(280);
    expect(p).toBeLessThan(320);
  });
});

describe("budgetLevel", () => {
  it("classifica ok/warning/critical pelo threshold", () => {
    expect(budgetLevel(50, 80)).toBe("ok");
    expect(budgetLevel(85, 80)).toBe("warning");
    expect(budgetLevel(100, 80)).toBe("critical");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/ai-settings/engine/aiBudget.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
/** Run-rate projection of monthly spend from partial spend so far. */
export function projectMonthlySpend(spentSoFarBRL: number, now: Date): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  if (dayOfMonth <= 0) return spentSoFarBRL;
  return (spentSoFarBRL / dayOfMonth) * daysInMonth;
}

export type BudgetLevel = "ok" | "warning" | "critical";

export function budgetLevel(pct: number, alertThresholdPct: number): BudgetLevel {
  if (pct >= 100) return "critical";
  if (pct >= alertThresholdPct) return "warning";
  return "ok";
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/features/ai-settings/engine/aiBudget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-settings/engine/aiBudget.ts src/features/ai-settings/engine/aiBudget.test.ts
git commit -m "feat(ai-settings): budget projection and alert level engine with tests"
```

---

## Task 6: Engine de roteamento + fallback (`aiRouting.ts`) — TDD

**Files:**
- Create: `src/features/ai-settings/engine/aiRouting.ts`
- Test: `src/features/ai-settings/engine/aiRouting.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it } from "vitest";
import type { IAiSettings } from "@/shared/types";
import { resolveEffectiveModel } from "./aiRouting";

function settings(over: Partial<IAiSettings> = {}): IAiSettings {
  return {
    masterEnabled: true,
    defaultProviderId: "anthropic",
    budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5 },
    providers: [
      { provider: "anthropic", enabled: true, defaultModel: "claude-opus-4-8", models: [], credentialsRef: "ANTHROPIC_API_KEY", status: "configured" },
      { provider: "openai", enabled: true, defaultModel: "gpt-5.2", models: [], credentialsRef: "OPENAI_API_KEY", status: "configured" },
      { provider: "google", enabled: false, defaultModel: "gemini-2.5-pro", models: [], credentialsRef: "GOOGLE_AI_API_KEY", status: "not_configured" },
    ],
    routing: [
      { feature: "sdr", enabled: true, providerId: "anthropic", model: "claude-opus-4-8", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.5, maxTokens: 1024 }, systemPrompt: "p" },
      { feature: "part_identification", enabled: true, providerId: "google", model: "gemini-2.5-pro", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.1, maxTokens: 512 }, systemPrompt: "p" },
      { feature: "insights", enabled: false, providerId: "openai", model: "gpt-5.2", params: { temperature: 0.6, maxTokens: 800 }, systemPrompt: "p" },
    ],
    ...over,
  };
}

describe("resolveEffectiveModel", () => {
  it("resolve o provedor primário quando disponível", () => {
    const r = resolveEffectiveModel(settings(), "sdr");
    expect(r).toEqual({ providerId: "anthropic", model: "claude-opus-4-8", params: { temperature: 0.5, maxTokens: 1024 }, systemPrompt: "p", usedFallback: false });
  });

  it("cai para o fallback quando o primário está indisponível", () => {
    // part_identification → google (not_configured) → fallback openai
    const r = resolveEffectiveModel(settings(), "part_identification");
    expect(r?.providerId).toBe("openai");
    expect(r?.usedFallback).toBe(true);
  });

  it("retorna null quando o master switch está desligado", () => {
    expect(resolveEffectiveModel(settings({ masterEnabled: false }), "sdr")).toBeNull();
  });

  it("retorna null quando a funcionalidade está desabilitada", () => {
    expect(resolveEffectiveModel(settings(), "insights")).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/ai-settings/engine/aiRouting.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import type { AiFeatureKey, AiProviderId, IAiGenerationParams, IAiSettings } from "@/shared/types";

export interface IResolvedModel {
  providerId: AiProviderId;
  model: string;
  params: IAiGenerationParams;
  systemPrompt: string;
  usedFallback: boolean;
}

function providerAvailable(settings: IAiSettings, providerId: AiProviderId): boolean {
  const p = settings.providers.find((x) => x.provider === providerId);
  return Boolean(p && p.enabled && p.status === "configured");
}

/** Returns the effective {provider, model, params, prompt} for a feature, or null when AI is off. */
export function resolveEffectiveModel(settings: IAiSettings, feature: AiFeatureKey): IResolvedModel | null {
  if (!settings.masterEnabled) return null;
  const route = settings.routing.find((r) => r.feature === feature);
  if (!route || !route.enabled) return null;

  if (providerAvailable(settings, route.providerId)) {
    return { providerId: route.providerId, model: route.model, params: route.params, systemPrompt: route.systemPrompt, usedFallback: false };
  }
  if (route.fallbackProviderId && route.fallbackModel && providerAvailable(settings, route.fallbackProviderId)) {
    return { providerId: route.fallbackProviderId, model: route.fallbackModel, params: route.params, systemPrompt: route.systemPrompt, usedFallback: true };
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/features/ai-settings/engine/aiRouting.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-settings/engine/aiRouting.ts src/features/ai-settings/engine/aiRouting.test.ts
git commit -m "feat(ai-settings): feature routing + fallback engine with tests"
```

---

## Task 7: Contrato do provider (`IAiProvider`)

**Files:**
- Create: `src/providers/data/contracts/ai.ts`
- Modify: `src/providers/data/contracts/index.ts`

- [ ] **Step 1: Criar `src/providers/data/contracts/ai.ts`**

```ts
import type {
  AiFeatureKey,
  AiProviderId,
  AiUsagePeriod,
  IAiBudget,
  IAiFeatureRouting,
  IAiPlaygroundInput,
  IAiPlaygroundResult,
  IAiProviderConfig,
  IAiSettings,
  IAiTestConnectionResult,
  IAiUsageEvent,
  IAiUsageSummary,
} from "@/shared/types";

/**
 * AI configuration + usage provider (37th provider).
 * Fase 1: mock determinístico. Fase 2: Supabase + Edge proxy (deferido).
 * Chaves de API NÃO passam por aqui — vivem no Vault (integration-secrets).
 */
export interface IAiProvider {
  getSettings(): Promise<IAiSettings>;
  setMasterEnabled(enabled: boolean): Promise<void>;
  setDefaultProvider(providerId: AiProviderId): Promise<void>;
  updateBudget(patch: Partial<IAiBudget>): Promise<IAiBudget>;
  updateProviderConfig(providerId: AiProviderId, patch: Partial<IAiProviderConfig>): Promise<IAiProviderConfig>;
  testConnection(providerId: AiProviderId): Promise<IAiTestConnectionResult>;
  updateFeatureRouting(feature: AiFeatureKey, patch: Partial<IAiFeatureRouting>): Promise<IAiFeatureRouting>;
  getUsageSummary(period: AiUsagePeriod): Promise<IAiUsageSummary>;
  listUsageEvents(): Promise<IAiUsageEvent[]>;
  runPlayground(input: IAiPlaygroundInput): Promise<IAiPlaygroundResult>;
}
```

- [ ] **Step 2: Agregar em `IDataProviders`**

Em `src/providers/data/contracts/index.ts`:
1. Adicionar import junto aos demais: `import type { IAiProvider } from "./ai";`
2. Adicionar re-export junto aos demais: `export type { IAiProvider } from "./ai";`
3. Dentro da interface `IDataProviders`, adicionar a propriedade: `ai: IAiProvider;`

- [ ] **Step 3: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep "contracts/ai\|IDataProviders" || echo "ok"`
Expected: "ok" (pode haver erro em factory até a Task 9 — ignore se for só lá).

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/contracts/ai.ts src/providers/data/contracts/index.ts
git commit -m "feat(ai-settings): IAiProvider contract and IDataProviders wiring"
```

---

## Task 8: Mock provider (`impl/mock/ai.ts`)

**Files:**
- Create: `src/providers/data/impl/mock/ai.ts`

> Estado em memória durante a sessão; custo dos eventos calculado pelo engine de pricing; summary/projeção pelos engines de usage/budget.

- [ ] **Step 1: Criar `src/providers/data/impl/mock/ai.ts`**

```ts
import type {
  AiFeatureKey,
  AiProviderId,
  AiUsagePeriod,
  IAiBudget,
  IAiFeatureRouting,
  IAiProviderConfig,
  IAiSettings,
  IAiUsageEvent,
  IAiUsageSummary,
} from "@/shared/types";
import type { IAiPlaygroundInput, IAiPlaygroundResult, IAiTestConnectionResult } from "@/shared/types";
import type { IAiProvider } from "../../contracts/ai";
import { costOfTokens } from "@/features/ai-settings/engine/aiPricing";
import { summarizeUsage } from "@/features/ai-settings/engine/aiUsage";
import { projectMonthlySpend } from "@/features/ai-settings/engine/aiBudget";
import { defaultAiSettings, modelsFor, seedUsageEvents } from "./_aiSeed";

const LATENCY_MS = 140;
const delay = () => new Promise<void>((r) => setTimeout(r, LATENCY_MS));

// Fixed "now" anchor keeps the mock dataset deterministic across reloads.
const NOW_ISO = "2026-06-13T12:00:00.000Z";

let settings: IAiSettings = defaultAiSettings();
let events: IAiUsageEvent[] | null = null;

function pricingFor(providerId: AiProviderId, model: string) {
  const opt = modelsFor(providerId).find((m) => m.id === model) ?? modelsFor(providerId)[0];
  return { inputPricePer1kUsd: opt.inputPricePer1kUsd, outputPricePer1kUsd: opt.outputPricePer1kUsd };
}

function ensureEvents(): IAiUsageEvent[] {
  if (events) return events;
  const seeded = seedUsageEvents(NOW_ISO);
  for (const e of seeded) {
    e.costBRL = costOfTokens(e.inputTokens, e.outputTokens, pricingFor(e.providerId, e.model), settings.budget.usdToBrl);
  }
  events = seeded;
  return events;
}

export const mockAiProvider: IAiProvider = {
  async getSettings() {
    await delay();
    return structuredClone(settings);
  },

  async setMasterEnabled(enabled) {
    await delay();
    settings.masterEnabled = enabled;
  },

  async setDefaultProvider(providerId) {
    await delay();
    settings.defaultProviderId = providerId;
  },

  async updateBudget(patch) {
    await delay();
    settings.budget = { ...settings.budget, ...patch };
    return structuredClone(settings.budget) as IAiBudget;
  },

  async updateProviderConfig(providerId, patch) {
    await delay();
    const idx = settings.providers.findIndex((p) => p.provider === providerId);
    if (idx < 0) throw new Error(`provider ${providerId} não encontrado`);
    settings.providers[idx] = { ...settings.providers[idx], ...patch };
    return structuredClone(settings.providers[idx]) as IAiProviderConfig;
  },

  async testConnection(providerId): Promise<IAiTestConnectionResult> {
    await delay();
    const p = settings.providers.find((x) => x.provider === providerId);
    const ok = Boolean(p && p.status === "configured");
    const result: IAiTestConnectionResult = ok
      ? { ok: true, latencyMs: 320, message: "Conexão OK (simulada)." }
      : { ok: false, latencyMs: 0, message: "Configure a chave de API antes de testar." };
    if (p) {
      p.lastTestedAt = new Date().toISOString();
      p.lastTestResult = ok ? "ok" : "error";
    }
    return result;
  },

  async updateFeatureRouting(feature, patch) {
    await delay();
    const idx = settings.routing.findIndex((r) => r.feature === feature);
    if (idx < 0) throw new Error(`routing ${feature} não encontrado`);
    settings.routing[idx] = { ...settings.routing[idx], ...patch } as IAiFeatureRouting;
    return structuredClone(settings.routing[idx]) as IAiFeatureRouting;
  },

  async getUsageSummary(period: AiUsagePeriod): Promise<IAiUsageSummary> {
    await delay();
    const now = new Date(NOW_ISO);
    const summary = summarizeUsage(ensureEvents(), period, settings.budget, now);
    if (period === "current_month") {
      summary.projectionBRL = projectMonthlySpend(summary.costBRL, now);
    }
    return summary;
  },

  async listUsageEvents() {
    await delay();
    return structuredClone(ensureEvents());
  },

  async runPlayground(input: IAiPlaygroundInput): Promise<IAiPlaygroundResult> {
    await delay();
    const inputTokens = Math.max(20, Math.round(input.prompt.length / 4));
    const outputTokens = 120 + (input.prompt.length % 80);
    return {
      text:
        "• Resposta simulada do playground.\n• Provedor: " +
        input.providerId +
        " · modelo: " +
        input.model +
        ".\n• Integração real de LLM será habilitada na fase seguinte.",
      inputTokens,
      outputTokens,
      costBRL: costOfTokens(inputTokens, outputTokens, pricingFor(input.providerId, input.model), settings.budget.usdToBrl),
      latencyMs: 1400,
    };
  },
};
```

- [ ] **Step 2: Verificar tipos**

Run: `bunx tsc --noEmit 2>&1 | grep "impl/mock/ai" || echo "ok"`
Expected: "ok".

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/mock/ai.ts
git commit -m "feat(ai-settings): deterministic mock AI provider backed by the pure engines"
```

---

## Task 9: Supabase stub + factory + hook + barrel

**Files:**
- Create: `src/providers/data/impl/supabase/ai.ts`
- Create: `src/providers/data/hooks/useAiProvider.ts`
- Modify: `src/providers/data/factory.ts`, `src/providers/data/index.ts`

- [ ] **Step 1: Criar o stub Supabase**

```ts
// src/providers/data/impl/supabase/ai.ts
import type { IAiProvider } from "../../contracts/ai";
import { NotImplementedError } from "../../errors";

const NOT_YET = "Provider de IA no Supabase será implementado na fase de integração real (Edge proxy + tabelas).";

export const supabaseAiProvider: IAiProvider = {
  getSettings: () => { throw new NotImplementedError(NOT_YET); },
  setMasterEnabled: () => { throw new NotImplementedError(NOT_YET); },
  setDefaultProvider: () => { throw new NotImplementedError(NOT_YET); },
  updateBudget: () => { throw new NotImplementedError(NOT_YET); },
  updateProviderConfig: () => { throw new NotImplementedError(NOT_YET); },
  testConnection: () => { throw new NotImplementedError(NOT_YET); },
  updateFeatureRouting: () => { throw new NotImplementedError(NOT_YET); },
  getUsageSummary: () => { throw new NotImplementedError(NOT_YET); },
  listUsageEvents: () => { throw new NotImplementedError(NOT_YET); },
  runPlayground: () => { throw new NotImplementedError(NOT_YET); },
};
```

> Verifique a assinatura real de `NotImplementedError` em `src/providers/data/errors.ts` e ajuste se o construtor exigir outro formato.

- [ ] **Step 2: Criar o hook**

```ts
// src/providers/data/hooks/useAiProvider.ts
import type { IAiProvider } from "../contracts/ai";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useAiProvider(): IAiProvider {
  return useDataProviderSlice("ai", "useAiProvider");
}
```

> Confirme o nome real do helper (o explorador reportou `_useDataProviderSlice`). Se o padrão real for outro (ex.: ler de um context diretamente), siga o de um hook existente como `hooks/useCopilotProvider.ts`.

- [ ] **Step 3: Registrar no `factory.ts`**

Em `src/providers/data/factory.ts`:
1. `import { mockAiProvider } from "./impl/mock/ai";` (junto aos imports mock)
2. `import { supabaseAiProvider } from "./impl/supabase/ai";` (junto aos imports supabase)
3. Adicionar `ai: mockAiProvider,` ao objeto `mockProviders`.
4. Adicionar `ai: supabaseAiProvider,` ao objeto `supabaseProviders`.

- [ ] **Step 4: Exportar no barrel `index.ts`**

Em `src/providers/data/index.ts`:
1. `export type { IAiProvider } from "./contracts";`
2. `export { useAiProvider } from "./hooks/useAiProvider";`

- [ ] **Step 5: Build + tipos**

Run: `bun run build`
Expected: build conclui sem erro novo.
Run: `bunx tsc --noEmit 2>&1 | grep -E "providers/data" || echo "ok"`
Expected: "ok".

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/supabase/ai.ts src/providers/data/hooks/useAiProvider.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(ai-settings): register ai provider (mock + supabase stub + hook)"
```

---

## Task 10: Grupo "Provedores LLM" no Vault — TDD

**Files:**
- Modify: `src/features/admin-settings/engine/integrationKeys.ts`
- Test: `src/features/admin-settings/engine/integrationKeys.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `integrationKeys.test.ts`:

```ts
import { buildIntegrationKeyCatalog } from "./integrationKeys";

it("inclui o grupo de Provedores LLM com as 4 chaves", () => {
  const groups = buildIntegrationKeyCatalog([]);
  const llm = groups.find((g) => g.id === "llm-providers");
  expect(llm).toBeDefined();
  const names = llm!.keys.map((k) => k.name).sort();
  expect(names).toEqual(["ANTHROPIC_API_KEY", "GOOGLE_AI_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bunx vitest run src/features/admin-settings/engine/integrationKeys.test.ts`
Expected: FAIL (grupo não existe).

- [ ] **Step 3: Implementar**

Em `buildIntegrationKeyCatalog`, adicionar ao array `groups` inicial (antes do `for` que percorre `accounts`):

```ts
{
  id: "llm-providers",
  title: "Provedores LLM",
  description: "Chaves de API dos provedores de Inteligência Artificial.",
  icon: "mdi:robot-happy-outline",
  keys: [
    { name: "ANTHROPIC_API_KEY", label: "Anthropic — Chave da API", kind: "secret", help: "Criada em console.anthropic.com." },
    { name: "OPENAI_API_KEY", label: "OpenAI — Chave da API", kind: "secret", help: "Criada em platform.openai.com." },
    { name: "OPENROUTER_API_KEY", label: "OpenRouter — Chave da API", kind: "secret", help: "Uma chave para múltiplos provedores (openrouter.ai)." },
    { name: "GOOGLE_AI_API_KEY", label: "Google — Chave da API", kind: "secret", help: "Criada no Google AI Studio." },
  ],
},
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bunx vitest run src/features/admin-settings/engine/integrationKeys.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-settings/engine/integrationKeys.ts src/features/admin-settings/engine/integrationKeys.test.ts
git commit -m "feat(ai-settings): add LLM providers group to Vault key catalog"
```

---

## Task 11: i18n + hooks de leitura

**Files:**
- Create: `src/features/ai-settings/i18n/pt-BR.ts`
- Create: `src/features/ai-settings/hooks/useAiSettings.ts`
- Create: `src/features/ai-settings/hooks/useAiUsage.ts`

- [ ] **Step 1: Criar `i18n/pt-BR.ts`**

```ts
export const AI_STRINGS = {
  title: "Inteligência artificial",
  subtitle: "Provedores, modelos por funcionalidade e consumo · configuração global da plataforma",
  tabs: {
    overview: "Visão geral",
    providers: "Provedores & chaves",
    features: "Funcionalidades",
    playground: "Playground",
  },
  masterOn: "IA ativa",
  masterOff: "IA desativada",
  emptyUsage: "Nenhum consumo registrado ainda — configure um provedor para começar.",
  saved: "Alterações salvas.",
  saveError: "Não foi possível salvar as alterações.",
} as const;
```

- [ ] **Step 2: Criar `hooks/useAiSettings.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import { useAiProvider } from "@/providers/data";
import type { IAiSettings } from "@/shared/types";

export function useAiSettings() {
  const provider = useAiProvider();
  const [settings, setSettings] = useState<IAiSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSettings(await provider.getSettings());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar configurações de IA.");
    } finally {
      setLoading(false);
    }
  }, [provider]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { settings, setSettings, loading, error, reload, provider };
}
```

- [ ] **Step 3: Criar `hooks/useAiUsage.ts`**

```ts
import { useEffect, useState } from "react";
import { useAiProvider } from "@/providers/data";
import type { AiUsagePeriod, IAiUsageSummary } from "@/shared/types";

export function useAiUsage(period: AiUsagePeriod) {
  const provider = useAiProvider();
  const [summary, setSummary] = useState<IAiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    provider
      .getUsageSummary(period)
      .then((s) => { if (!cancelled) setSummary(s); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [provider, period]);

  return { summary, loading };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-settings/i18n/pt-BR.ts src/features/ai-settings/hooks/
git commit -m "feat(ai-settings): i18n strings and read hooks (settings + usage)"
```

---

## Task 12: Componentes de dashboard (KPI + charts)

**Files:**
- Create: `src/features/ai-settings/components/KpiCard.tsx`
- Create: `src/features/ai-settings/components/ConsumptionAreaChart.tsx`
- Create: `src/features/ai-settings/components/ProviderShareDonut.tsx`
- Create: `src/features/ai-settings/components/CostByFeatureBars.tsx`

> Referência visual fiel: o mockup aprovado `docs/superpowers/mockups/ia-area-hub-v1.html` (abrir no navegador). Cores via tokens (`var(--primary)`, `var(--muted-foreground)`, `var(--border)`); recharts com `ResponsiveContainer`.

- [ ] **Step 1: `KpiCard.tsx`**

```tsx
import { Icon } from "@/components/Icon";

interface KpiCardProps {
  icon: string;
  label: string;
  value: string;
  delta?: { text: string; positive: boolean };
  progressPct?: number;
}

export function KpiCard({ icon, label, value, delta, progressPct }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon={icon} className="size-4" aria-hidden /> {label}
      </p>
      <p className="mt-2 text-2xl font-semibold leading-none">{value}</p>
      {delta && (
        <p className={`mt-2 text-xs ${delta.positive ? "text-severity-success" : "text-severity-critical"}`}>
          {delta.text}
        </p>
      )}
      {typeof progressPct === "number" && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.round(progressPct))}%` }} />
        </div>
      )}
    </div>
  );
}
```

> Verifique se `text-severity-success`/`text-severity-critical` existem (CLAUDE.md cita utilitários `text-severity-{info|success|warning|critical}`). Caso não, use `text-emerald-600`/`text-red-600`.

- [ ] **Step 2: `ConsumptionAreaChart.tsx`**

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { IAiUsageSummary } from "@/shared/types";

interface Props { series: IAiUsageSummary["series"]; metric: "calls" | "tokens" | "costBRL"; }

export function ConsumptionAreaChart({ series, metric }: Props) {
  const data = series.map((p) => ({ date: p.date.slice(5), value: p[metric] }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" minTickGap={24} />
        <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} stroke="var(--border)" width={42} />
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 12 }} />
        <Area type="monotone" dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.16} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: `ProviderShareDonut.tsx`**

```tsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { AI_PROVIDER_LABELS, type IAiUsageSummary } from "@/shared/types";

const COLORS = ["var(--primary)", "#60a5fa", "#22c55e", "var(--muted-foreground)"];

export function ProviderShareDonut({ byProvider }: { byProvider: IAiUsageSummary["byProvider"] }) {
  const data = byProvider.map((p) => ({ name: AI_PROVIDER_LABELS[p.providerId], value: p.costBRL }));
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={78} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: `CostByFeatureBars.tsx`**

```tsx
import { AI_FEATURE_LABELS, type IAiUsageSummary } from "@/shared/types";

export function CostByFeatureBars({ byFeature }: { byFeature: IAiUsageSummary["byFeature"] }) {
  const max = Math.max(1, ...byFeature.map((f) => f.costBRL));
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="space-y-3">
      {byFeature.map((f) => (
        <div key={f.feature} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-foreground">{AI_FEATURE_LABELS[f.feature]}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full bg-primary" style={{ width: `${(f.costBRL / max) * 100}%` }} />
          </span>
          <span className="w-20 text-right text-muted-foreground">{fmt.format(f.costBRL)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-settings/components/
git commit -m "feat(ai-settings): dashboard KPI card and recharts components"
```

---

## Task 13: Aba Visão geral (`AiOverviewTab`)

**Files:**
- Create: `src/features/ai-settings/pages/AiOverviewTab.tsx`

- [ ] **Step 1: Criar `AiOverviewTab.tsx`**

```tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiUsage } from "../hooks/useAiUsage";
import { KpiCard } from "../components/KpiCard";
import { ConsumptionAreaChart } from "../components/ConsumptionAreaChart";
import { ProviderShareDonut } from "../components/ProviderShareDonut";
import { CostByFeatureBars } from "../components/CostByFeatureBars";
import { AI_STRINGS } from "../i18n/pt-BR";
import type { AiUsagePeriod } from "@/shared/types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const int = new Intl.NumberFormat("pt-BR");

export function AiOverviewTab() {
  const [period, setPeriod] = useState<AiUsagePeriod>("current_month");
  const { summary, loading } = useAiUsage(period);

  if (loading || !summary) return <Skeleton className="h-[520px] w-full" />;
  if (summary.calls === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">{AI_STRINGS.emptyUsage}</Card>;
  }

  return (
    <div className="space-y-4">
      <table className="sr-only">
        <caption>Consumo por provedor no período (alternativa acessível aos gráficos)</caption>
        <tbody>
          {summary.byProvider.map((p) => (
            <tr key={p.providerId}>
              <th scope="row">{p.providerId}</th>
              <td>{p.calls} chamadas</td>
              <td>{p.costBRL.toFixed(2)} reais</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end">
        <select
          aria-label="Período"
          value={period}
          onChange={(e) => setPeriod(e.target.value as AiUsagePeriod)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
        >
          <option value="current_month">Mês atual</option>
          <option value="last_7d">Últimos 7 dias</option>
          <option value="last_30d">Últimos 30 dias</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon="mdi:lightning-bolt" label="Chamadas" value={int.format(summary.calls)} />
        <KpiCard icon="mdi:circle-multiple" label="Tokens" value={int.format(summary.tokens)} />
        <KpiCard icon="mdi:cash" label="Custo est." value={brl.format(summary.costBRL)} />
        <KpiCard icon="mdi:gauge" label="Budget" value={`${Math.round(summary.budgetPct)}%`} progressPct={summary.budgetPct} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-sm font-semibold">Consumo no período</p>
          <ConsumptionAreaChart series={summary.series} metric="calls" />
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Por provedor</p>
          <ProviderShareDonut byProvider={summary.byProvider} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Custo por funcionalidade</p>
          <CostByFeatureBars byFeature={summary.byFeature} />
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-semibold">Confiabilidade & projeção</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Projeção do mês</dt><dd className="font-medium">{brl.format(summary.projectionBRL)}</dd></div>
            <div><dt className="text-muted-foreground">Tokens/chamada</dt><dd className="font-medium">{int.format(summary.avgTokensPerCall)}</dd></div>
            <div><dt className="text-muted-foreground">Taxa de erro</dt><dd className="font-medium">{(summary.errorRate * 100).toFixed(1)}%</dd></div>
            <div><dt className="text-muted-foreground">Taxa de fallback</dt><dd className="font-medium">{(summary.fallbackRate * 100).toFixed(1)}%</dd></div>
            <div><dt className="text-muted-foreground">Latência média</dt><dd className="font-medium">{(summary.avgLatencyMs / 1000).toFixed(1)}s</dd></div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: sem erro.

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-settings/pages/AiOverviewTab.tsx
git commit -m "feat(ai-settings): overview tab with KPIs, charts and reliability metrics"
```

---

## Task 14: Aba Provedores & chaves (`AiProvidersTab`)

**Files:**
- Create: `src/features/ai-settings/components/ProviderCard.tsx`
- Create: `src/features/ai-settings/pages/AiProvidersTab.tsx`

> A chave de API reusa o fluxo de Vault: importe `setIntegrationSecret` de `@/features/admin-settings` (api `integrationSecrets`) — confirme o export no barrel `src/features/admin-settings/index.ts`; se não exportado, importe do caminho `@/features/admin-settings/api/integrationSecrets`.

- [ ] **Step 1: `ProviderCard.tsx`**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setIntegrationSecret } from "@/features/admin-settings/api/integrationSecrets";
import { AI_PROVIDER_LABELS, type IAiProviderConfig } from "@/shared/types";
import { useAiProvider } from "@/providers/data";

const INITIALS: Record<string, string> = { anthropic: "AN", openai: "OA", openrouter: "OR", google: "GE" };

export function ProviderCard({ config, canEditKey, onChanged }: { config: IAiProviderConfig; canEditKey: boolean; onChanged: () => void }) {
  const provider = useAiProvider();
  const [editingKey, setEditingKey] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [busy, setBusy] = useState(false);

  const configured = config.status === "configured";

  const saveKey = async () => {
    if (!keyValue.trim()) { toast.error("Informe a chave."); return; }
    setBusy(true);
    try {
      await setIntegrationSecret(config.credentialsRef, keyValue.trim(), `${AI_PROVIDER_LABELS[config.provider]} — Chave da API`);
      await provider.updateProviderConfig(config.provider, { status: "configured", enabled: true });
      toast.success("Chave salva com segurança.");
      setEditingKey(false); setKeyValue(""); onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar a chave.");
    } finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await provider.testConnection(config.provider);
      r.ok ? toast.success(r.message) : toast.error(r.message);
      onChanged();
    } finally { setBusy(false); }
  };

  const setModel = async (model: string) => { await provider.updateProviderConfig(config.provider, { defaultModel: model }); onChanged(); };

  return (
    <section className={`rounded-xl border border-border bg-card p-4 ${configured ? "" : "opacity-80"}`}>
      <header className="mb-3 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-xs font-semibold text-primary">{INITIALS[config.provider]}</span>
        <div className="flex-1">
          <p className="text-sm font-semibold">{AI_PROVIDER_LABELS[config.provider]}</p>
          <p className="text-xs text-muted-foreground">{config.models.length} modelos</p>
        </div>
        {configured
          ? <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Icon icon="mdi:check-circle-outline" className="mr-1 size-3" />Configurado</Badge>
          : <Badge variant="outline" className="text-muted-foreground">Não configurado</Badge>}
      </header>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Chave de API ({config.credentialsRef})</label>
          {editingKey ? (
            <div className="flex gap-2">
              <Input type="password" autoComplete="off" value={keyValue} onChange={(e) => setKeyValue(e.target.value)} placeholder="Cole a chave" className="font-mono" disabled={busy} />
              <Button size="sm" onClick={saveKey} disabled={busy}>Salvar</Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingKey(false); setKeyValue(""); }} disabled={busy}>Cancelar</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={!canEditKey} onClick={() => setEditingKey(true)}>
              <Icon icon="mdi:key-plus" className="mr-1 size-4" />{configured ? "Substituir chave" : "Definir chave"}
            </Button>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Modelo padrão</label>
          <select value={config.defaultModel} onChange={(e) => setModel(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            {config.models.map((m) => <option key={m.id} value={m.id}>{m.label} — entrada ${m.inputPricePer1kUsd}/1k · saída ${m.outputPricePer1kUsd}/1k</option>)}
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={test} disabled={busy}><Icon icon="mdi:connection" className="mr-1 size-4" />Testar conexão</Button>
          <span className="text-xs text-muted-foreground">{config.lastTestedAt ? `Último teste: ${new Date(config.lastTestedAt).toLocaleString("pt-BR")}` : "Ainda não testado"}</span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `AiProvidersTab.tsx`**

```tsx
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveDataSource } from "@/providers/data";
import { useAiSettings } from "../hooks/useAiSettings";
import { ProviderCard } from "../components/ProviderCard";
import { AI_PROVIDER_LABELS } from "@/shared/types";

export function AiProvidersTab() {
  const { settings, loading, reload, provider } = useAiSettings();
  if (loading || !settings) return <Skeleton className="h-96 w-full" />;
  const canEditKey = getActiveDataSource() === "supabase";

  const setDefault = async (id: string) => {
    try { await provider.setDefaultProvider(id as never); await reload(); toast.success("Provedor padrão atualizado."); }
    catch { toast.error("Falha ao atualizar o provedor padrão."); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="text-sm font-semibold">Provedor padrão</p>
          <p className="text-xs text-muted-foreground">Usado quando a funcionalidade não especifica outro.</p>
        </div>
        <select value={settings.defaultProviderId} onChange={(e) => setDefault(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
          {settings.providers.filter((p) => p.status === "configured").map((p) => <option key={p.provider} value={p.provider}>{AI_PROVIDER_LABELS[p.provider]}</option>)}
        </select>
      </div>
      {!canEditKey && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          <Icon icon="mdi:information-outline" className="mt-0.5 size-4 shrink-0" />
          <p>Modo demonstração: a gravação de chaves fica disponível no modo Supabase.</p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {settings.providers.map((p) => <ProviderCard key={p.provider} config={p} canEditKey={canEditKey} onChanged={reload} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build + Commit**

Run: `bun run build` → sem erro.

```bash
git add src/features/ai-settings/components/ProviderCard.tsx src/features/ai-settings/pages/AiProvidersTab.tsx
git commit -m "feat(ai-settings): providers tab with Vault key flow, model and test connection"
```

---

## Task 15: Aba Funcionalidades (`AiFeaturesTab`) — roteamento + fallback + prompt

**Files:**
- Create: `src/features/ai-settings/components/FeatureRoutingRow.tsx`
- Create: `src/features/ai-settings/pages/AiFeaturesTab.tsx`

- [ ] **Step 1: `FeatureRoutingRow.tsx`**

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { AI_FEATURE_LABELS, AI_PROVIDER_LABELS, type IAiFeatureRouting, type IAiProviderConfig } from "@/shared/types";
import { useAiProvider } from "@/providers/data";

export function FeatureRoutingRow({ route, providers, onChanged }: { route: IAiFeatureRouting; providers: IAiProviderConfig[]; onChanged: () => void }) {
  const provider = useAiProvider();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(route.systemPrompt);
  const modelsOf = (id: string) => providers.find((p) => p.provider === id)?.models ?? [];

  const patch = async (p: Partial<IAiFeatureRouting>) => {
    try { await provider.updateFeatureRouting(route.feature, p); onChanged(); }
    catch { toast.error("Falha ao atualizar a funcionalidade."); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary"><Icon icon="mdi:robot-outline" className="size-5" /></span>
        <p className="flex-1 text-sm font-semibold">{AI_FEATURE_LABELS[route.feature]}</p>
        <select value={route.providerId} onChange={(e) => patch({ providerId: e.target.value as never })} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          {providers.map((p) => <option key={p.provider} value={p.provider}>{AI_PROVIDER_LABELS[p.provider]}</option>)}
        </select>
        <select value={route.model} onChange={(e) => patch({ model: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">
          {modelsOf(route.providerId).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <Switch checked={route.enabled} onCheckedChange={(v) => patch({ enabled: v })} aria-label={`Ativar ${AI_FEATURE_LABELS[route.feature]}`} />
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}><Icon icon={open ? "mdi:chevron-up" : "mdi:chevron-down"} className="size-4" /></Button>
      </div>

      {open && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground">Fallback — provedor
              <select value={route.fallbackProviderId ?? ""} onChange={(e) => patch({ fallbackProviderId: (e.target.value || undefined) as never })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="">Nenhum</option>
                {providers.map((p) => <option key={p.provider} value={p.provider}>{AI_PROVIDER_LABELS[p.provider]}</option>)}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">Temperatura
              <input type="number" step="0.1" min="0" max="2" defaultValue={route.params.temperature} onBlur={(e) => patch({ params: { ...route.params, temperature: Number(e.target.value) } })} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
            </label>
          </div>
          <label className="text-xs text-muted-foreground">Prompt de sistema
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} onBlur={() => patch({ systemPrompt: prompt })} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `AiFeaturesTab.tsx`**

```tsx
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiSettings } from "../hooks/useAiSettings";
import { FeatureRoutingRow } from "../components/FeatureRoutingRow";

export function AiFeaturesTab() {
  const { settings, loading, reload } = useAiSettings();
  if (loading || !settings) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <Icon icon="mdi:directions-fork" className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>Cada funcionalidade roteia para o provedor/modelo escolhido. Se ele estiver indisponível ou estourar o budget, cai para o fallback.</span>
      </div>
      {settings.routing.map((r) => <FeatureRoutingRow key={r.feature} route={r} providers={settings.providers} onChanged={reload} />)}
    </div>
  );
}
```

- [ ] **Step 3: Build + Commit**

Run: `bun run build` → sem erro.

```bash
git add src/features/ai-settings/components/FeatureRoutingRow.tsx src/features/ai-settings/pages/AiFeaturesTab.tsx
git commit -m "feat(ai-settings): features tab — per-feature routing, fallback, params and prompt"
```

---

## Task 16: Aba Playground (`AiPlaygroundTab`)

**Files:**
- Create: `src/features/ai-settings/pages/AiPlaygroundTab.tsx`

- [ ] **Step 1: Criar `AiPlaygroundTab.tsx`**

```tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiSettings } from "../hooks/useAiSettings";
import { useAiProvider } from "@/providers/data";
import type { IAiPlaygroundResult } from "@/shared/types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AiPlaygroundTab() {
  const { settings, loading } = useAiSettings();
  const provider = useAiProvider();
  const [providerId, setProviderId] = useState("anthropic");
  const [model, setModel] = useState("claude-opus-4-8");
  const [prompt, setPrompt] = useState("Resuma em 3 bullets as últimas conversas do cliente e sugira a próxima ação.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IAiPlaygroundResult | null>(null);

  if (loading || !settings) return <Skeleton className="h-96 w-full" />;
  const models = settings.providers.find((p) => p.provider === providerId)?.models ?? [];

  const run = async () => {
    setBusy(true);
    try {
      setResult(await provider.runPlayground({ providerId: providerId as never, model, params: { temperature: 0.4, maxTokens: 1024 }, prompt }));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Provedor
          <select value={providerId} onChange={(e) => { setProviderId(e.target.value); const ms = settings.providers.find((p) => p.provider === e.target.value)?.models ?? []; setModel(ms[0]?.id ?? ""); }} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            {settings.providers.map((p) => <option key={p.provider} value={p.provider}>{p.provider}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Modelo
          <select value={model} onChange={(e) => setModel(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">Prompt
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
      </label>
      <div className="flex justify-end">
        <Button onClick={run} disabled={busy}><Icon icon="mdi:play" className="mr-1 size-4" />{busy ? "Executando…" : "Executar"}</Button>
      </div>

      {result && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Resposta</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">{result.text}</pre>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>entrada <b className="text-foreground">{result.inputTokens}</b> tokens</span>
            <span>saída <b className="text-foreground">{result.outputTokens}</b> tokens</span>
            <span>custo <b className="text-foreground">{brl.format(result.costBRL)}</b></span>
            <span>latência <b className="text-foreground">{(result.latencyMs / 1000).toFixed(1)}s</b></span>
          </div>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build + Commit**

Run: `bun run build` → sem erro.

```bash
git add src/features/ai-settings/pages/AiPlaygroundTab.tsx
git commit -m "feat(ai-settings): playground tab (mock generation with token/cost metrics)"
```

---

## Task 17: Hub page + master switch + barrel

**Files:**
- Create: `src/features/ai-settings/components/AiMasterSwitch.tsx`
- Create: `src/features/ai-settings/pages/AiSettingsPage.tsx`
- Create: `src/features/ai-settings/index.ts`

- [ ] **Step 1: `AiMasterSwitch.tsx`**

```tsx
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useAiProvider } from "@/providers/data";
import { AI_STRINGS } from "../i18n/pt-BR";

export function AiMasterSwitch({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const provider = useAiProvider();
  const toggle = async (v: boolean) => {
    try { await provider.setMasterEnabled(v); onChanged(); toast.success(v ? "IA ativada." : "IA desativada."); }
    catch { toast.error("Falha ao alterar o estado da IA."); }
  };
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-300">
      {enabled ? AI_STRINGS.masterOn : AI_STRINGS.masterOff}
      <Switch checked={enabled} onCheckedChange={toggle} aria-label="Ativar IA globalmente" />
    </span>
  );
}
```

- [ ] **Step 2: `AiSettingsPage.tsx` (hub com abas sincronizadas com `?aba=`)**

```tsx
import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Route } from "@/routes/app.configuracoes.ia";
import { useAiSettings } from "../hooks/useAiSettings";
import { AiMasterSwitch } from "../components/AiMasterSwitch";
import { AiOverviewTab } from "./AiOverviewTab";
import { AiProvidersTab } from "./AiProvidersTab";
import { AiFeaturesTab } from "./AiFeaturesTab";
import { AiPlaygroundTab } from "./AiPlaygroundTab";
import { AI_STRINGS } from "../i18n/pt-BR";

export function AiSettingsPage() {
  const navigate = useNavigate();
  const { aba } = Route.useSearch();
  const { settings, loading, reload } = useAiSettings();

  const setAba = (v: string) => navigate({ to: "/app/configuracoes/ia", search: { aba: v as typeof aba } });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{AI_STRINGS.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{AI_STRINGS.subtitle}</p>
        </div>
        {loading || !settings ? <Skeleton className="h-8 w-28" /> : <AiMasterSwitch enabled={settings.masterEnabled} onChanged={reload} />}
      </div>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="visao-geral">{AI_STRINGS.tabs.overview}</TabsTrigger>
          <TabsTrigger value="provedores">{AI_STRINGS.tabs.providers}</TabsTrigger>
          <TabsTrigger value="funcionalidades">{AI_STRINGS.tabs.features}</TabsTrigger>
          <TabsTrigger value="playground">{AI_STRINGS.tabs.playground}</TabsTrigger>
        </TabsList>
        <TabsContent value="visao-geral" className="mt-4"><AiOverviewTab /></TabsContent>
        <TabsContent value="provedores" className="mt-4"><AiProvidersTab /></TabsContent>
        <TabsContent value="funcionalidades" className="mt-4"><AiFeaturesTab /></TabsContent>
        <TabsContent value="playground" className="mt-4"><AiPlaygroundTab /></TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 3: `index.ts` (barrel)**

```ts
export { AiSettingsPage } from "./pages/AiSettingsPage";
```

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-settings/components/AiMasterSwitch.tsx src/features/ai-settings/pages/AiSettingsPage.tsx src/features/ai-settings/index.ts
git commit -m "feat(ai-settings): hub page with tabs synced to ?aba and global master switch"
```

---

## Task 18: Rota + item na sidebar

**Files:**
- Create: `src/routes/app.configuracoes.ia.tsx`
- Modify: `src/features/shell/layouts/SettingsLayout.tsx`

- [ ] **Step 1: Criar a rota com `validateSearch` (Owner-only)**

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AiSettingsPage } from "@/features/ai-settings";

const ABAS = ["visao-geral", "provedores", "funcionalidades", "playground"] as const;
type Aba = (typeof ABAS)[number];

export interface IAiSearch { aba: Aba }

function validateAiSearch(raw: Record<string, unknown>): IAiSearch {
  const aba = typeof raw.aba === "string" && (ABAS as readonly string[]).includes(raw.aba) ? (raw.aba as Aba) : "visao-geral";
  return { aba };
}

export const Route = createFileRoute("/app/configuracoes/ia")({
  validateSearch: validateAiSearch,
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <AiSettingsPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 2: Regenerar a rota e checar**

Run: `bun run dev` por alguns segundos (o plugin do TanStack Router regenera `routeTree.gen.ts`) ou `bun run build`.
Expected: `routeTree.gen.ts` passa a conter `/app/configuracoes/ia`. Não editar o arquivo gerado à mão.

- [ ] **Step 3: Adicionar item na sidebar**

Em `src/features/shell/layouts/SettingsLayout.tsx`, no grupo cujo `label` é `"Integrações"`, adicionar como primeiro item do array `items`:

```ts
{
  label: "Inteligência artificial",
  icon: "mdi:robot-happy-outline",
  to: "/app/configuracoes/ia",
  roles: ["Owner"],
},
```

- [ ] **Step 4: Build**

Run: `bun run build`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/routes/app.configuracoes.ia.tsx src/routeTree.gen.ts src/features/shell/layouts/SettingsLayout.tsx
git commit -m "feat(ai-settings): route /app/configuracoes/ia (Owner-only) + sidebar entry"
```

---

## Task 19: Verificação manual no app + estados

**Files:** nenhum novo (validação).

- [ ] **Step 1: Subir o app e logar como Owner**

Run: `bun run dev`
Abrir `http://localhost:5173/app/configuracoes/ia` (precisa estar logado como Owner; em modo mock, o usuário mock padrão é Owner).

- [ ] **Step 2: Conferir cada aba**

- Visão geral: KPIs preenchidos, gráfico de área e donut renderizam, custo por funcionalidade e métricas de confiabilidade aparecem; trocar período recarrega.
- Provedores & chaves: 4 cards; Google "Não configurado"; "Testar conexão" mostra toast; trocar modelo persiste (recarregar a aba mantém).
- Funcionalidades: trocar provider/model/fallback e o toggle persiste; expandir edita prompt/temperatura.
- Playground: "Executar" retorna resposta simulada + métricas.
- Master switch no topo alterna e mostra toast.
- Deep-link: `?aba=funcionalidades` abre direto na aba certa.

- [ ] **Step 3: Conferir RBAC**

Abrir a rota como papel não-Owner (ex.: trocar usuário mock) → redireciona para `/sem-permissao`. O item não aparece na sidebar para não-Owner.

- [ ] **Step 4: Ajustes finos (se algo falhar)**

Corrigir conforme necessário e re-verificar. Sem commit se não houve mudança; senão:

```bash
git add -A && git commit -m "fix(ai-settings): adjustments from manual verification"
```

---

## Task 20: Gate final (build + testes + tipos)

**Files:** nenhum novo (gate).

- [ ] **Step 1: Suíte de testes**

Run: `bun run test`
Expected: todos passam, incluindo os 4 engines novos + `integrationKeys`.

- [ ] **Step 2: Build de produção**

Run: `bun run build`
Expected: conclui sem erro.

- [ ] **Step 3: Tipos por delta**

Run: `git diff --name-status main...HEAD --diff-filter=A` para listar arquivos novos; depois `bunx tsc --noEmit` e confirmar que nenhum erro novo vem dos arquivos da feature `ai-settings` / `providers/data/*ai*`.
Expected: sem erros novos atribuíveis à feature (baseline pré-existente é aceitável).

- [ ] **Step 4: Lint/format**

Run: `bun run lint` e `bun run format`
Expected: sem erros de lint nos arquivos novos.

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "chore(ai-settings): final verification (tests, build, types green)"
```

> Versionamento (bump MINOR + codinome + CHANGELOG) e atualização do contador de providers (36→37) no CLAUDE.md ficam para o momento do merge/release — fora do escopo deste plano de implementação. A integração real de LLM (Edge proxy + tabelas Supabase + plugar consumidores) é a próxima fase, deferida.

---

## Notas de coerência (para quem implementa)

- **Nomes de método** do provider são idênticos do contrato (Task 7) ao mock (Task 8), supabase (Task 9) e usos na UI: `getSettings`, `setMasterEnabled`, `setDefaultProvider`, `updateBudget`, `updateProviderConfig`, `testConnection`, `updateFeatureRouting`, `getUsageSummary`, `listUsageEvents`, `runPlayground`.
- **Engines** são importados pelo mock provider (`@/features/ai-settings/engine/*`). Não há ciclo: a feature não importa o provider mock diretamente (usa só `useAiProvider`).
- **Câmbio USD→BRL:** preços em `IAiModelOption` são USD/1k; `costOfTokens` converte por `IAiBudget.usdToBrl`.
- **Verificar antes de assumir:** o nome do helper de hook (`_useDataProviderSlice`) e a assinatura de `NotImplementedError` — ambos reportados por exploração; confirmar no código ao implementar a Task 9.
