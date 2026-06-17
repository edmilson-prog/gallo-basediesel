# Integração LLM real (Sub-projeto 1: Fundação + Edge proxy) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a área *Configurações → Inteligência artificial* operar em produção (Supabase) — Playground/teste reais via um Edge proxy, consumo medido e protegido por teto — removendo o gate demo. Consumidores (copiloto/SDR/etc.) ficam deferidos.

**Architecture:** 2 tabelas Supabase (`ai_settings` singleton + `ai_usage_events` append-only, RLS owner-only); um Edge Function `ai-generate` que resolve a chave no Vault, chama Anthropic/OpenRouter com timeout, calcula custo, aplica o teto e grava o uso; o `supabaseAiProvider` real (CRUD via cliente direto; Playground/teste via `functions.invoke`); o catálogo de modelos/preços extraído para um módulo engine compartilhado; o front endurece o estado-zero do Playground e remove o gate.

**Tech Stack:** React 19 + TanStack Router/Query, TypeScript strict, Vitest, Supabase (Postgres + RLS + Edge Functions Deno, supabase-js@2.107.0), Tailwind v4 + shadcn, Iconify.

**Spec:** `docs/superpowers/specs/2026-06-17-ai-llm-real-integration-design.md`

## Global Constraints

- **TypeScript strict + `noUncheckedIndexedAccess` ON** — index access retorna `T | undefined`; trate. Evitar `any`. Interfaces de domínio prefixadas `I`.
- **Naming:** camelCase (vars/funcs), PascalCase (componentes/tipos), kebab-case (arquivos), **snake_case (colunas DB)**, UPPER_SNAKE (constantes).
- **Idioma:** UI/conteúdo em **português do Brasil com acentos corretos** (UTF-8); código e comentários em inglês.
- **Temas:** componentes consomem **apenas tokens semânticos** (`bg-background`, `text-foreground`, `text-severity-*`, `var(--chart-N)`); nunca hex/cores diretas.
- **Provider Pattern:** features acessam dados só via `@/providers/data`. Fora de `src/mocks/**` e `src/providers/data/**`, proibido importar `@/mocks*`. O catálogo compartilhado vai em `src/providers/data/engine/` (não em `mock/`).
- **Migrations:** versionadas em `supabase/migrations/` (formato `YYYYMMDDhhmmss_*.sql`), **aplicadas via MCP `apply_migration` E espelhadas no Git no mesmo PR**. Nunca editar migration já aplicada.
- **Edge:** runtime Deno, só Web APIs + imports relativos `../_shared/*`; supabase-js via `https://esm.sh/@supabase/supabase-js@2.107.0`. Deploy por CLI: `npx supabase functions deploy <fn> --project-ref njizaasajkdqptlxddqn`.
- **Vault key names (exatos):** `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`.
- **Unidade de preço:** `inputPricePer1kUsd` / `outputPricePer1kUsd` (por **1k tokens**). Fonte única do número = catálogo compartilhado; verdade em runtime = coluna persistida.
- **Gate de CI:** `bun run build` + `bun run test` verdes. `bunx tsc --noEmit` tem baseline pré-existente (~315 erros) — avaliar **código novo por delta**.
- **Commits:** Conventional Commits em inglês, atômicos. Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Ordem de deploy (não negociável):** migration aplicada+espelhada → Edge deployado → **só então** mergear o front (provider real + remoção do gate).

---

## File Structure

**Criar:**
- `src/providers/data/engine/aiCatalog.ts` — catálogo de modelos/preços + `buildDefaultAiSettings(env)` (extraído do mock).
- `src/providers/data/engine/aiCatalog.test.ts` — sanidade do catálogo.
- `supabase/migrations/20260617HHMMSS_ai_settings_and_usage_events.sql` — 2 tabelas + RLS + índices.
- `supabase/functions/_shared/ai/adapters.ts` — `LlmAdapter` (Anthropic + OpenRouter) + `computeCostBRL`.
- `supabase/functions/ai-generate/index.ts` — o Edge handler (a 11ª função).
- `src/providers/data/impl/supabase/ai.test.ts` — mappers do provider supabase.
- `docs/dev/ai-llm-integration.md` — doc dev.

**Modificar:**
- `src/shared/types/ai.ts` — `IAiUsageEvent`: `+source`, `feature?`.
- `src/providers/data/impl/mock/_aiSeed.ts` — usa o catálogo engine; `source:'routed'` nos eventos.
- `src/features/ai-settings/engine/aiUsage.ts` — filtra `feature` null.
- `src/features/ai-settings/engine/aiUsage.test.ts` — caso de evento sem feature.
- `src/features/ai-settings/engine/aiBudget.ts` — `isOverBudget` (+ teste em `aiBudget.test.ts`).
- `src/providers/data/impl/supabase/ai.ts` — reescrita do stub.
- `src/features/ai-settings/pages/AiPlaygroundTab.tsx` — estado-zero, default configurado, banner LGPD, sem `auto`.
- `src/features/shell/layouts/SettingsLayout.tsx` — remove `demoOnly` do item IA.
- `src/routes/app.configuracoes.ia.tsx` — remove o redirect supabase→/configuracoes.
- `CHANGELOG.md`, `package.json`, `CLAUDE.md` — release.

---

## Block A — Tipos & catálogo compartilhado

### Task A1: Extrair o catálogo de modelos/preços para o engine

**Files:**
- Create: `src/providers/data/engine/aiCatalog.ts`
- Create: `src/providers/data/engine/aiCatalog.test.ts`
- Modify: `src/providers/data/impl/mock/_aiSeed.ts:1-175`

**Interfaces:**
- Produces: `MODELS: Record<AiProviderId, IAiModelOption[]>`, `CREDENTIALS_REF: Record<AiProviderId, string>`, `FEATURES: AiFeatureKey[]`, `modelsFor(provider: AiProviderId): IAiModelOption[]`, `buildDefaultAiSettings(env: "mock" | "supabase"): IAiSettings`.
- Consumes (later): `supabaseAiProvider` importa `buildDefaultAiSettings("supabase")`; `_aiSeed.ts` importa tudo.

- [ ] **Step 1: Write the failing test**

Create `src/providers/data/engine/aiCatalog.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { AI_FEATURE_LABELS } from "@/shared/types";
import type { AiFeatureKey } from "@/shared/types";
import { FEATURES, MODELS, buildDefaultAiSettings, modelsFor } from "./aiCatalog";

describe("aiCatalog", () => {
  it("FEATURES cobre todas as AiFeatureKey", () => {
    const fromLabels = Object.keys(AI_FEATURE_LABELS) as AiFeatureKey[];
    expect([...FEATURES].sort()).toEqual([...fromLabels].sort());
  });

  it("preços estão na unidade por-1k (faixa plausível, guarda contra erro de 1000x)", () => {
    for (const list of Object.values(MODELS)) {
      for (const m of list) {
        expect(m.inputPricePer1kUsd).toBeGreaterThan(0);
        expect(m.inputPricePer1kUsd).toBeLessThan(1); // $/1k tokens; >$1/1k seria erro de unidade
        expect(m.outputPricePer1kUsd).toBeLessThan(1);
      }
    }
  });

  it("modelsFor devolve a lista do provedor", () => {
    expect(modelsFor("anthropic").some((m) => m.id === "claude-opus-4-8")).toBe(true);
  });

  it("buildDefaultAiSettings('supabase') nasce desligado e sem provedor configurado", () => {
    const s = buildDefaultAiSettings("supabase");
    expect(s.masterEnabled).toBe(false);
    expect(s.providers.every((p) => p.status === "not_configured")).toBe(true);
    expect(s.budget.monthlyCapBRL).toBe(1000);
  });

  it("buildDefaultAiSettings('mock') mantém o comportamento de demo (ligado)", () => {
    const s = buildDefaultAiSettings("mock");
    expect(s.masterEnabled).toBe(true);
    expect(s.providers.some((p) => p.status === "configured")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/providers/data/engine/aiCatalog.test.ts`
Expected: FAIL — `Failed to resolve import "./aiCatalog"`.

- [ ] **Step 3: Create the catalog module**

Create `src/providers/data/engine/aiCatalog.ts` (mover o conteúdo de `_aiSeed.ts`, generalizando `defaultAiSettings` para `buildDefaultAiSettings(env)`):
```ts
import type {
  AiFeatureKey,
  AiProviderId,
  IAiModelOption,
  IAiProviderConfig,
  IAiSettings,
} from "@/shared/types";

/**
 * Shared AI model/pricing catalog (lives in the engine layer, NOT in mock,
 * so both the mock provider and the real supabase provider can seed defaults
 * without crossing the PRD-005 data-layer boundary).
 *
 * Price unit: USD per 1k tokens. The persisted `ai_settings.providers[].models`
 * is the runtime source of truth; this module only seeds it.
 */
export const MODELS: Record<AiProviderId, IAiModelOption[]> = {
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
    { id: "anthropic/claude-opus-4.8", label: "Anthropic: Claude Opus 4.8", inputPricePer1kUsd: 0.015, outputPricePer1kUsd: 0.075 },
    { id: "google/gemini-2.5-pro", label: "Google: Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
  ],
  google: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", inputPricePer1kUsd: 0.0003, outputPricePer1kUsd: 0.0012 },
  ],
};

/**
 * Vault secret name per provider. MUST match the "Provedores LLM" group of
 * buildIntegrationKeyCatalog (src/features/admin-settings/engine/integrationKeys.ts).
 * Google's secret is GOOGLE_AI_API_KEY (not GOOGLE_API_KEY).
 */
export const CREDENTIALS_REF: Record<AiProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

export const FEATURES: AiFeatureKey[] = [
  "conversation_copilot",
  "analytics_copilot",
  "sdr",
  "part_identification",
  "insights",
];

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
    credentialsRef: CREDENTIALS_REF[provider],
    status,
    lastTestedAt: status === "configured" ? "2026-06-12T09:40:00.000Z" : undefined,
    lastTestResult: status === "configured" ? "ok" : undefined,
  };
}

/**
 * Default settings. In `supabase` everything starts OFF and not_configured
 * (no auto-spend); in `mock` it keeps the lively demo defaults.
 */
export function buildDefaultAiSettings(env: "mock" | "supabase"): IAiSettings {
  const status: IAiProviderConfig["status"] = env === "mock" ? "configured" : "not_configured";
  const googleStatus: IAiProviderConfig["status"] = "not_configured";
  return {
    masterEnabled: env === "mock",
    defaultProviderId: "anthropic",
    budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 },
    providers: [
      providerConfig("anthropic", "claude-opus-4-8", status),
      providerConfig("openai", "gpt-5.2", status),
      providerConfig("openrouter", "anthropic/claude-opus-4.8", status),
      providerConfig("google", "gemini-2.5-pro", googleStatus),
    ],
    routing: [
      { feature: "conversation_copilot", enabled: true, providerId: "openai", model: "gpt-5.2", fallbackProviderId: "anthropic", fallbackModel: "claude-sonnet-4-6", params: { temperature: 0.4, maxTokens: 1024 }, systemPrompt: "Você é o copiloto de atendimento da GALLO. Sugira respostas claras e comerciais." },
      { feature: "analytics_copilot", enabled: true, providerId: "anthropic", model: "claude-haiku-4-5", fallbackProviderId: "openai", fallbackModel: "gpt-5-mini", params: { temperature: 0.2, maxTokens: 800 }, systemPrompt: "Responda perguntas sobre os indicadores comerciais com números e comparações verificáveis." },
      { feature: "sdr", enabled: true, providerId: "anthropic", model: "claude-opus-4-8", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.5, maxTokens: 1024 }, systemPrompt: "Você é o SDR da GALLO. Qualifique o lead e conduza para o orçamento." },
      { feature: "part_identification", enabled: true, providerId: "google", model: "gemini-2.5-flash", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.1, maxTokens: 512 }, systemPrompt: "Extraia a peça (código, aplicação, montadora) a partir do texto/imagem do cliente." },
      { feature: "insights", enabled: false, providerId: "openrouter", model: "anthropic/claude-opus-4.8", params: { temperature: 0.6, maxTokens: 1200 }, systemPrompt: "Gere insights comerciais acionáveis a partir dos dados do período." },
    ],
  };
}
```

> Nota: o `openrouter` perde o item `auto` (preço indeterminado — proibido no Playground v1, ver Task E1). O default de modelo do OpenRouter vira `anthropic/claude-opus-4.8`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/providers/data/engine/aiCatalog.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Reapontar `_aiSeed.ts` para o catálogo**

Edit `src/providers/data/impl/mock/_aiSeed.ts` — remover `MODELS`, `CREDENTIALS_REF`, `modelsFor`, `providerConfig`, `defaultAiSettings` locais e re-exportar do engine. Manter só `seedUsageEvents` (dado fictício do mock). Topo do arquivo:
```ts
import seedrandom from "seedrandom";
import type { AiFeatureKey, IAiUsageEvent } from "@/shared/types";
import { FEATURES, buildDefaultAiSettings, modelsFor } from "@/providers/data/engine/aiCatalog";

// Re-export so existing mock imports keep working.
export { FEATURES, modelsFor } from "@/providers/data/engine/aiCatalog";
export function defaultAiSettings() {
  return buildDefaultAiSettings("mock");
}
```
Manter o corpo de `seedUsageEvents` exatamente como está (já usa `FEATURES`, `defaultAiSettings()`, etc.), exceto a mudança da Task A2 (campo `source`).

- [ ] **Step 6: Run the mock provider test + build**

Run: `bunx vitest run src/providers/data/engine/aiCatalog.test.ts && bun run build`
Expected: testes PASS; build OK.

- [ ] **Step 7: Commit**

```bash
git add src/providers/data/engine/aiCatalog.ts src/providers/data/engine/aiCatalog.test.ts src/providers/data/impl/mock/_aiSeed.ts
git commit -m "refactor(ai): extract model/pricing catalog to shared engine module"
```

---

### Task A2: `IAiUsageEvent` ganha `source`/`feature?` e `summarizeUsage` ignora eventos sem feature

**Files:**
- Modify: `src/shared/types/ai.ts:64-77`
- Modify: `src/providers/data/impl/mock/_aiSeed.ts` (corpo de `seedUsageEvents`)
- Modify: `src/features/ai-settings/engine/aiUsage.ts:55-67`
- Modify: `src/features/ai-settings/engine/aiUsage.test.ts`

**Interfaces:**
- Produces: `IAiUsageEvent` com `source: "playground" | "routed"` e `feature?: AiFeatureKey`. `summarizeUsage` exclui eventos sem `feature` de `byFeature`/`growthPct`, mas mantém nos totais.

- [ ] **Step 1: Write the failing test**

Em `src/features/ai-settings/engine/aiUsage.test.ts`, adicionar:
```ts
import type { IAiUsageEvent } from "@/shared/types";

it("eventos source='playground' (sem feature) entram nos totais mas não no byFeature", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");
  const events: IAiUsageEvent[] = [
    { id: "1", ts: "2026-06-10T10:00:00.000Z", source: "routed", feature: "sdr", providerId: "anthropic", model: "claude-opus-4-8", inputTokens: 100, outputTokens: 50, costBRL: 2, latencyMs: 500, status: "ok" },
    { id: "2", ts: "2026-06-11T10:00:00.000Z", source: "playground", providerId: "anthropic", model: "claude-opus-4-8", inputTokens: 200, outputTokens: 80, costBRL: 3, latencyMs: 600, status: "ok" },
  ];
  const s = summarizeUsage(events, "current_month", { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 }, now);
  expect(s.calls).toBe(2); // total inclui o playground
  expect(s.costBRL).toBe(5);
  expect(s.byFeature).toHaveLength(1); // só o routed/sdr
  expect(s.byFeature[0]?.feature).toBe("sdr");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/ai-settings/engine/aiUsage.test.ts`
Expected: FAIL — tipo `IAiUsageEvent` ainda exige `feature` (erro de tipo) e/ou `byFeature` tem 2 entradas (chave `undefined`).

- [ ] **Step 3: Atualizar o tipo**

Edit `src/shared/types/ai.ts` (bloco `IAiUsageEvent`):
```ts
export interface IAiUsageEvent {
  id: ID;
  ts: ISO8601;
  source: "playground" | "routed";
  feature?: AiFeatureKey;
  providerId: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
  status: AiUsageStatus;
}
```

- [ ] **Step 4: Filtrar feature null no engine**

Edit `src/features/ai-settings/engine/aiUsage.ts` — nos dois loops que usam `e.feature`, pular eventos sem feature.

Loop `prevCostByFeature` (linhas ~56-59):
```ts
  const prevCostByFeature = new Map<AiFeatureKey, number>();
  for (const e of prev) {
    if (!e.feature) continue;
    prevCostByFeature.set(e.feature, (prevCostByFeature.get(e.feature) ?? 0) + e.costBRL);
  }
```
Loop `byFeatureMap` (linhas ~61-67):
```ts
  const byFeatureMap = new Map<AiFeatureKey, { calls: number; costBRL: number }>();
  for (const e of inPeriod) {
    if (!e.feature) continue;
    const cur = byFeatureMap.get(e.feature) ?? { calls: 0, costBRL: 0 };
    cur.calls += 1;
    cur.costBRL += e.costBRL;
    byFeatureMap.set(e.feature, cur);
  }
```

- [ ] **Step 5: `seedUsageEvents` seta `source`**

Edit `src/providers/data/impl/mock/_aiSeed.ts` — no objeto `events.push({...})`, adicionar `source: "routed",` (o mock semeia só eventos roteados). O campo `feature` já está presente.

- [ ] **Step 6: Run tests + build**

Run: `bunx vitest run src/features/ai-settings/engine/aiUsage.test.ts && bun run build`
Expected: PASS; build OK.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/ai.ts src/features/ai-settings/engine/aiUsage.ts src/features/ai-settings/engine/aiUsage.test.ts src/providers/data/impl/mock/_aiSeed.ts
git commit -m "feat(ai): add usage event source + optional feature; exclude playground from byFeature"
```

---

### Task A3: `isOverBudget` no engine de orçamento (semântica do teto)

**Files:**
- Modify: `src/features/ai-settings/engine/aiBudget.ts`
- Modify: `src/features/ai-settings/engine/aiBudget.test.ts`

**Interfaces:**
- Produces: `isOverBudget(spentBRL: number, monthlyCapBRL: number): boolean`. O Edge espelha essa regra (Deno não importa `@/`).

- [ ] **Step 1: Write the failing test**

Em `src/features/ai-settings/engine/aiBudget.test.ts`, adicionar:
```ts
import { isOverBudget } from "./aiBudget";

describe("isOverBudget", () => {
  it("bloqueia quando gasto >= teto", () => {
    expect(isOverBudget(1000, 1000)).toBe(true);
    expect(isOverBudget(1200, 1000)).toBe(true);
  });
  it("libera quando gasto < teto", () => {
    expect(isOverBudget(999.99, 1000)).toBe(false);
  });
  it("teto <= 0 nunca bloqueia (sem teto configurado)", () => {
    expect(isOverBudget(50, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/ai-settings/engine/aiBudget.test.ts`
Expected: FAIL — `isOverBudget` não exportado.

- [ ] **Step 3: Implementar**

Edit `src/features/ai-settings/engine/aiBudget.ts` — adicionar:
```ts
/**
 * Hard-cap predicate. A cap of 0 (or less) means "no cap configured" → never blocks.
 * Mirrored in the ai-generate Edge Function (Deno cannot import @/).
 */
export function isOverBudget(spentBRL: number, monthlyCapBRL: number): boolean {
  if (monthlyCapBRL <= 0) return false;
  return spentBRL >= monthlyCapBRL;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/ai-settings/engine/aiBudget.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-settings/engine/aiBudget.ts src/features/ai-settings/engine/aiBudget.test.ts
git commit -m "feat(ai): add isOverBudget hard-cap predicate"
```

---

## Block B — Migration (dados)

### Task B1: Criar e aplicar a migration das 2 tabelas

**Files:**
- Create: `supabase/migrations/20260617HHMMSS_ai_settings_and_usage_events.sql` (substituir `HHMMSS` por timestamp real único, ex. `20260617143000`).

**Interfaces:**
- Produces: tabelas `public.ai_settings` (singleton id=1) e `public.ai_usage_events` (RLS owner-only; INSERT só service_role).

- [ ] **Step 1: Escrever o arquivo de migration**

Create `supabase/migrations/20260617143000_ai_settings_and_usage_events.sql`:
```sql
-- Sub-projeto 1 (integração LLM real): configuração global de IA + histórico de uso.
--
-- ai_settings é SINGLETON GLOBAL (id=1, garantido por check): a IA é o "cérebro"
-- da plataforma — orçamento, roteamento e status de provedor são únicos (as chaves
-- de API vivem no Vault, não aqui). ai_usage_events é append-only: uma linha por
-- chamada real ao LLM, gravada EXCLUSIVAMENTE pelo service_role (Edge ai-generate).
-- RLS owner-only no padrão canônico (select public.current_app_role()) = 'owner'.
-- Additive + idempotent DDL.

-- ---------------------------------------------------------------------------
-- ai_settings (singleton)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_settings (
  id                  smallint primary key default 1 check (id = 1),
  master_enabled      boolean     not null default false,
  default_provider_id text        not null default 'anthropic',
  budget              jsonb       not null,
  providers           jsonb       not null,
  routing             jsonb       not null,
  updated_at          timestamptz not null default now(),
  updated_by          uuid references auth.users(id)
);

comment on table public.ai_settings is
  'Configuração global de IA (singleton id=1). Owner-only. Chaves de API NÃO vivem aqui (Vault).';

alter table public.ai_settings enable row level security;

create policy "ai_settings_owner_read"
  on public.ai_settings for select to authenticated
  using ((select public.current_app_role()) = 'owner');

create policy "ai_settings_owner_write"
  on public.ai_settings for all to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');

-- ---------------------------------------------------------------------------
-- ai_usage_events (append-only; insert via service_role apenas)
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage_events (
  id            uuid primary key default gen_random_uuid(),
  ts            timestamptz not null default now(),
  source        text not null check (source in ('playground','routed')),
  feature       text,
  provider_id   text not null,
  model         text not null,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  cost_brl      numeric(12,4) not null default 0,
  latency_ms    integer not null default 0,
  status        text not null check (status in ('ok','error','fallback')),
  caller_id     uuid references auth.users(id),
  store_id      uuid references public.stores(id),
  created_at    timestamptz not null default now()
);

comment on table public.ai_usage_events is
  'Append-only. Uma linha por chamada real ao LLM. INSERT só pelo service_role (Edge ai-generate).';

alter table public.ai_usage_events enable row level security;

-- Owner lê tudo. Sem policy de INSERT/UPDATE/DELETE p/ authenticated → escrita
-- exclusiva do service_role (que faz bypass de RLS).
create policy "ai_usage_events_owner_read"
  on public.ai_usage_events for select to authenticated
  using ((select public.current_app_role()) = 'owner');

create index if not exists idx_ai_usage_events_ts
  on public.ai_usage_events (ts desc);
create index if not exists idx_ai_usage_events_feature
  on public.ai_usage_events (feature) where feature is not null;
```

- [ ] **Step 2: Aplicar a migration no Supabase (MCP)**

Usar a ferramenta MCP `apply_migration` com `name: "ai_settings_and_usage_events"` e o SQL acima (cole o conteúdo idêntico ao arquivo). O arquivo no Git é o espelho — devem bater byte a byte.

- [ ] **Step 3: Verificar que as tabelas existem com RLS**

Via MCP `list_tables` (schema `public`) — confirmar `ai_settings` e `ai_usage_events` presentes com `rls_enabled: true`. Alternativa: MCP `execute_sql` →
```sql
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('ai_settings','ai_usage_events');
```
Expected: 2 linhas, `rowsecurity = true`.

- [ ] **Step 4: Rodar o advisor de segurança**

Via MCP `get_advisors` (`type: "security"`) — confirmar que não há novo aviso de "RLS disabled" nas duas tabelas.

- [ ] **Step 5: Commit (espelho no Git)**

```bash
git add supabase/migrations/20260617143000_ai_settings_and_usage_events.sql
git commit -m "feat(ai): ai_settings + ai_usage_events tables with owner-only RLS"
```

---

## Block C — Edge Function `ai-generate`

### Task C1: Adaptadores LLM + cálculo de custo (módulo Deno)

**Files:**
- Create: `supabase/functions/_shared/ai/adapters.ts`

**Interfaces:**
- Produces: `interface LlmRequest { model: string; prompt: string; systemPrompt?: string; maxTokens: number; temperature: number; topP?: number; }`, `interface LlmResult { text: string; inputTokens: number; outputTokens: number; usdCost?: number; }`, `interface ModelPricing { inputPricePer1kUsd: number; outputPricePer1kUsd: number; }`, `computeCostBRL(inputTokens, outputTokens, pricing, usdToBrl, usdCostOverride?): number`, `callAnthropic(key, req, signal): Promise<LlmResult>`, `callOpenRouter(key, req, signal): Promise<LlmResult>`.
- Consumes (later): o handler `ai-generate/index.ts`.

> Este módulo roda em Deno e **não** tem teste Vitest (I/O HTTP); é verificado por smoke (Task C3). A função pura `computeCostBRL` espelha o `costOfTokens` testado em `aiPricing.test.ts` e a regra `isOverBudget` da Task A3.

- [ ] **Step 1: Criar o módulo de adaptadores**

Create `supabase/functions/_shared/ai/adapters.ts`:
```ts
/**
 * LLM adapters for the ai-generate Edge Function (Sub-projeto 1).
 * Only Anthropic + OpenRouter in v1. Runtime: Deno, Web APIs only.
 *
 * Pricing/cost mirrors the app engine (src/features/ai-settings/engine/aiPricing.ts);
 * the runtime source of truth for per-model price is the persisted ai_settings row.
 */

export interface LlmRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
}

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** OpenRouter returns the real cost in USD when usage accounting is enabled. */
  usdCost?: number;
}

export interface ModelPricing {
  inputPricePer1kUsd: number;
  outputPricePer1kUsd: number;
}

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * BRL cost. Prefers a provider-reported USD cost (usdCostOverride, e.g. OpenRouter
 * usage.cost) over token×price. NEVER silently returns 0 for an unknown model:
 * callers must pass a pricing fallback or the override.
 */
export function computeCostBRL(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
  usdToBrl: number,
  usdCostOverride?: number,
): number {
  if (typeof usdCostOverride === "number" && usdCostOverride > 0) {
    return usdCostOverride * usdToBrl;
  }
  const usd =
    (inputTokens / 1000) * pricing.inputPricePer1kUsd +
    (outputTokens / 1000) * pricing.outputPricePer1kUsd;
  return usd * usdToBrl;
}

export async function callAnthropic(
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      ...(req.topP !== undefined ? { top_p: req.topP } : {}),
      ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
      messages: [{ role: "user", content: req.prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

export async function callOpenRouter(
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
  messages.push({ role: "user", content: req.prompt });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": "https://crm.gallobasediesel.com.br",
      "X-Title": "GALLO BASE DIESEL",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      ...(req.topP !== undefined ? { top_p: req.topP } : {}),
      messages,
      usage: { include: true }, // ask OpenRouter to report real cost
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`openrouter ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    usdCost: data.usage?.cost,
  };
}
```

- [ ] **Step 2: Type-check do módulo (sanidade)**

Não há teste unitário (Deno/I/O). Validação de sintaxe acontece no deploy (Task C3). Seguir para o handler.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/ai/adapters.ts
git commit -m "feat(ai): edge LLM adapters (anthropic + openrouter) with cost helper"
```

---

### Task C2: Handler `ai-generate`

**Files:**
- Create: `supabase/functions/ai-generate/index.ts`

**Interfaces:**
- Consumes: `requireCaller`, `createSecretResolver`, `servePost`, `HttpError`/`json`/`parseJsonBody`, e os adaptadores da Task C1.
- Produces: o endpoint `POST /functions/v1/ai-generate` com os contratos `generate`/`test` da spec §5.

- [ ] **Step 1: Criar o handler**

Create `supabase/functions/ai-generate/index.ts`:
```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * ai-generate — 11ª Edge Function (Sub-projeto 1: integração LLM real).
 *
 * Owner-only proxy de LLM. Resolve a chave no Vault (Vault-first), aplica o teto
 * de orçamento mensal (best-effort), chama Anthropic/OpenRouter com timeout,
 * calcula custo e grava ai_usage_events. Modos: generate | test.
 *
 * Shared lifecycle/auth/error: supabase/functions/_shared (PRD-102).
 */

import { requireCaller } from "../_shared/auth.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import {
  callAnthropic,
  callOpenRouter,
  computeCostBRL,
  type LlmRequest,
  type LlmResult,
  type ModelPricing,
} from "../_shared/ai/adapters.ts";

const LLM_TIMEOUT_MS = 60_000;
const MAX_PROMPT_LENGTH = 50_000;
const MAX_TOKENS_CAP = 4096;
const SUPPORTED = new Set(["anthropic", "openrouter"]);
const KEY_BY_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

interface AiSettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; alertThresholdPct: number; usdToBrl: number };
  providers: Array<{
    provider: string;
    defaultModel: string;
    models: Array<{ id: string; inputPricePer1kUsd: number; outputPricePer1kUsd: number }>;
  }>;
}

function pricingFor(settings: AiSettingsRow, providerId: string, model: string): ModelPricing | null {
  const p = settings.providers.find((x) => x.provider === providerId);
  const m = p?.models.find((x) => x.id === model);
  if (!m) return null; // never fall back to models[0] — would mask wrong cost
  return { inputPricePer1kUsd: m.inputPricePer1kUsd, outputPricePer1kUsd: m.outputPricePer1kUsd };
}

async function monthSpendBRL(admin: ReturnType<typeof requireCaller> extends Promise<infer C> ? (C extends { admin: infer A } ? A : never) : never): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("cost_brl")
    .gte("ts", start.toISOString());
  if (error) throw new HttpError(500, `budget read failed: ${error.message}`);
  return (data ?? []).reduce((a: number, r: { cost_brl: number | string }) => a + Number(r.cost_brl), 0);
}

async function dispatch(
  providerId: string,
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  if (providerId === "anthropic") return callAnthropic(apiKey, req, signal);
  return callOpenRouter(apiKey, req, signal);
}

servePost(async (req, { log }) => {
  const { admin, callerId, profile } = await requireCaller(req, ["owner"]);
  const body = await parseJsonBody(req);

  const mode = body.mode === "test" ? "test" : "generate";
  const providerId = String(body.providerId ?? "");
  if (!SUPPORTED.has(providerId)) {
    throw new HttpError(400, "provider não suportado neste momento (adaptador em breve)");
  }

  // Settings (single row).
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers")
    .eq("id", 1)
    .maybeSingle<AiSettingsRow>();
  if (sErr) throw new HttpError(500, `settings read failed: ${sErr.message}`);
  if (!settings) throw new HttpError(409, "configuração de IA ainda não inicializada");

  // Budget hard cap (best-effort; see spec §9). Blocks both generate and test.
  const spent = await monthSpendBRL(admin);
  if (settings.budget.monthlyCapBRL > 0 && spent >= settings.budget.monthlyCapBRL) {
    throw new HttpError(402, "orçamento de IA do mês esgotado");
  }

  // Resolve key (Vault-first).
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) throw new HttpError(400, "chave de API do provedor não configurada");

  const controller = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const started = Date.now();

  if (mode === "test") {
    const model = String(body.model ?? settings.providers.find((p) => p.provider === providerId)?.defaultModel ?? "");
    try {
      await dispatch(providerId, apiKey, { model, prompt: "ping", maxTokens: 1, temperature: 0 }, controller);
      return json({ ok: true, latencyMs: Date.now() - started, message: "Conexão OK." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "falha de conexão";
      return json({ ok: false, latencyMs: Date.now() - started, message }, 200);
    }
  }

  // mode === "generate"
  const prompt = String(body.prompt ?? "");
  const model = String(body.model ?? "");
  if (!prompt || !model) throw new HttpError(400, "model e prompt são obrigatórios");
  if (prompt.length > MAX_PROMPT_LENGTH) throw new HttpError(400, "prompt muito longo");
  const params = (body.params ?? {}) as { temperature?: number; maxTokens?: number; topP?: number };
  const temperature = Math.min(2, Math.max(0, Number(params.temperature ?? 0.4)));
  const maxTokens = Math.min(MAX_TOKENS_CAP, Math.max(1, Number(params.maxTokens ?? 1024)));

  const llmReq: LlmRequest = {
    model,
    prompt,
    systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
    maxTokens,
    temperature,
    topP: typeof params.topP === "number" ? params.topP : undefined,
  };

  let result: LlmResult;
  try {
    result = await dispatch(providerId, apiKey, llmReq, controller);
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof DOMException && err.name === "TimeoutError";
    // Record the failed call so cost/latency analytics stay honest.
    await admin.from("ai_usage_events").insert({
      source: "playground",
      provider_id: providerId,
      model,
      input_tokens: 0,
      output_tokens: 0,
      cost_brl: 0,
      latency_ms: latencyMs,
      status: "error",
      caller_id: callerId,
      store_id: profile.store_id,
    });
    log.error("ai-generate llm call failed", { providerId, model, aborted });
    throw new HttpError(aborted ? 504 : 502, aborted ? "tempo de resposta do LLM esgotado" : "falha na chamada ao LLM");
  }

  const latencyMs = Date.now() - started;
  const pricing = pricingFor(settings, providerId, model);
  const costBRL = computeCostBRL(
    result.inputTokens,
    result.outputTokens,
    pricing ?? { inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
    settings.budget.usdToBrl,
    result.usdCost,
  );
  if (!pricing && result.usdCost === undefined) {
    log.error("ai-generate unknown model pricing", { providerId, model });
  }

  await admin.from("ai_usage_events").insert({
    source: "playground",
    provider_id: providerId,
    model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_brl: costBRL,
    latency_ms: latencyMs,
    status: "ok",
    caller_id: callerId,
    store_id: profile.store_id,
  });

  return json({
    text: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costBRL,
    latencyMs,
  });
});
```

> Nota de tipo: o helper `monthSpendBRL` tem uma assinatura verbosa só para herdar o tipo do `admin`. Se o executor preferir, declarar `admin: SupabaseClient` importando o tipo de `https://esm.sh/@supabase/supabase-js@2.107.0` (como em `_shared/auth.ts`) — equivalente e mais legível.

- [ ] **Step 2: Deploy do Edge (CLI)**

Run: `npx supabase functions deploy ai-generate --project-ref njizaasajkdqptlxddqn`
Expected: deploy OK; a função aparece em `npx supabase functions list --project-ref njizaasajkdqptlxddqn` (ou MCP `list_edge_functions`).

- [ ] **Step 3: Smoke do `test` (sem chave → erro claro)**

Antes de gravar a chave no Vault, invocar `mode:'test'` (via app na Task D2, ou `curl` autenticado como Owner) e confirmar `400 "chave de API do provedor não configurada"` — prova que a resolução de chave e o gate funcionam. Após o Owner gravar `ANTHROPIC_API_KEY` no Vault, repetir e esperar `{ ok: true }`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ai-generate/index.ts
git commit -m "feat(ai): ai-generate edge function (owner-only LLM proxy, budget cap, usage logging)"
```

---

## Block D — `supabaseAiProvider`

### Task D1: Mappers + getSettings (semeia default) + setters

**Files:**
- Modify: `src/providers/data/impl/supabase/ai.ts` (reescrever o stub inteiro)
- Create: `src/providers/data/impl/supabase/ai.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient`, `buildDefaultAiSettings` (engine), tipos `IAi*`.
- Produces: `supabaseAiProvider: IAiProvider` (objeto). Exporta `rowToSettings`/`settingsToRow` para teste.

- [ ] **Step 1: Write the failing test (mappers puros)**

Create `src/providers/data/impl/supabase/ai.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildDefaultAiSettings } from "@/providers/data/engine/aiCatalog";
import { rowToSettings, settingsToRow } from "./ai";

describe("supabase ai mappers", () => {
  it("settingsToRow → rowToSettings é round-trip", () => {
    const s = buildDefaultAiSettings("supabase");
    const row = settingsToRow(s, "user-123");
    expect(row.id).toBe(1);
    expect(row.master_enabled).toBe(false);
    expect(row.default_provider_id).toBe("anthropic");
    const back = rowToSettings({
      id: 1,
      master_enabled: row.master_enabled,
      default_provider_id: row.default_provider_id,
      budget: row.budget,
      providers: row.providers,
      routing: row.routing,
      updated_at: "2026-06-17T00:00:00.000Z",
      updated_by: "user-123",
    });
    expect(back).toEqual(s);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/providers/data/impl/supabase/ai.test.ts`
Expected: FAIL — `rowToSettings`/`settingsToRow` não existem (ainda é stub).

- [ ] **Step 3: Reescrever o provider**

Replace `src/providers/data/impl/supabase/ai.ts` inteiro:
```ts
import { getSupabaseClient } from "@/shared/lib/supabase";
import { buildDefaultAiSettings } from "@/providers/data/engine/aiCatalog";
import { summarizeUsage } from "@/features/ai-settings/engine/aiUsage";
import { projectMonthlySpend } from "@/features/ai-settings/engine/aiBudget";
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
import type { IAiProvider } from "../../contracts/ai";

const SETTINGS_COLUMNS =
  "id, master_enabled, default_provider_id, budget, providers, routing, updated_at, updated_by";

export interface AiSettingsRow {
  id: number;
  master_enabled: boolean;
  default_provider_id: string;
  budget: IAiBudget;
  providers: IAiProviderConfig[];
  routing: IAiFeatureRouting[];
  updated_at: string;
  updated_by: string | null;
}

export function rowToSettings(row: AiSettingsRow): IAiSettings {
  return {
    masterEnabled: row.master_enabled,
    defaultProviderId: row.default_provider_id as AiProviderId,
    budget: row.budget,
    providers: row.providers,
    routing: row.routing,
  };
}

export function settingsToRow(s: IAiSettings, updatedBy: string | null) {
  return {
    id: 1 as const,
    master_enabled: s.masterEnabled,
    default_provider_id: s.defaultProviderId,
    budget: s.budget,
    providers: s.providers,
    routing: s.routing,
    updated_by: updatedBy,
  };
}

interface AiUsageEventRow {
  id: string;
  ts: string;
  source: "playground" | "routed";
  feature: string | null;
  provider_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_brl: number | string;
  latency_ms: number;
  status: "ok" | "error" | "fallback";
}

function rowToUsageEvent(r: AiUsageEventRow): IAiUsageEvent {
  return {
    id: r.id,
    ts: r.ts,
    source: r.source,
    feature: r.feature ? (r.feature as AiFeatureKey) : undefined,
    providerId: r.provider_id as AiProviderId,
    model: r.model,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costBRL: Number(r.cost_brl),
    latencyMs: r.latency_ms,
    status: r.status,
  };
}

async function loadSettingsRow(): Promise<AiSettingsRow> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from("ai_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", 1)
    .maybeSingle<AiSettingsRow>();
  if (error) throw new Error(`[supabase] ai.getSettings failed: ${error.message}`);
  if (data) return data;

  // Seed the singleton default on first read (race-safe via ON CONFLICT DO NOTHING).
  const { data: auth } = await client.auth.getUser();
  await client
    .from("ai_settings")
    .upsert(settingsToRow(buildDefaultAiSettings("supabase"), auth.user?.id ?? null), {
      onConflict: "id",
      ignoreDuplicates: true,
    });
  const { data: seeded, error: reErr } = await client
    .from("ai_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", 1)
    .single<AiSettingsRow>();
  if (reErr) throw new Error(`[supabase] ai.getSettings (seed) failed: ${reErr.message}`);
  return seeded;
}

async function writeSettings(next: IAiSettings): Promise<void> {
  const client = getSupabaseClient();
  const { data: auth } = await client.auth.getUser();
  const { error } = await client
    .from("ai_settings")
    .update({ ...settingsToRow(next, auth.user?.id ?? null), updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(`[supabase] ai write failed: ${error.message}`);
}

async function extractFunctionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      /* fall through */
    }
  }
  return error instanceof Error ? error.message : "[supabase] ai operation failed";
}

export const supabaseAiProvider: IAiProvider = {
  async getSettings() {
    return rowToSettings(await loadSettingsRow());
  },

  async setMasterEnabled(enabled) {
    const s = rowToSettings(await loadSettingsRow());
    await writeSettings({ ...s, masterEnabled: enabled });
  },

  async setDefaultProvider(providerId) {
    const s = rowToSettings(await loadSettingsRow());
    await writeSettings({ ...s, defaultProviderId: providerId });
  },

  async updateBudget(patch) {
    const s = rowToSettings(await loadSettingsRow());
    const budget = { ...s.budget, ...patch };
    await writeSettings({ ...s, budget });
    return budget;
  },

  async updateProviderConfig(providerId, patch) {
    const s = rowToSettings(await loadSettingsRow());
    const providers = s.providers.map((p) => (p.provider === providerId ? { ...p, ...patch } : p));
    const updated = providers.find((p) => p.provider === providerId);
    if (!updated) throw new Error(`provider ${providerId} não encontrado`);
    await writeSettings({ ...s, providers });
    return updated;
  },

  async updateFeatureRouting(feature, patch) {
    const s = rowToSettings(await loadSettingsRow());
    const routing = s.routing.map((r) => (r.feature === feature ? { ...r, ...patch } : r));
    const updated = routing.find((r) => r.feature === feature);
    if (!updated) throw new Error(`routing ${feature} não encontrado`);
    await writeSettings({ ...s, routing });
    return updated;
  },

  async testConnection(providerId): Promise<IAiTestConnectionResult> {
    const settings = rowToSettings(await loadSettingsRow());
    const cfg = settings.providers.find((p) => p.provider === providerId);
    const { data, error } = await getSupabaseClient().functions.invoke("ai-generate", {
      body: { mode: "test", providerId, model: cfg?.defaultModel },
    });
    if (error) {
      return { ok: false, latencyMs: 0, message: await extractFunctionError(error) };
    }
    return data as IAiTestConnectionResult;
  },

  async getUsageSummary(period: AiUsagePeriod): Promise<IAiUsageSummary> {
    const settings = rowToSettings(await loadSettingsRow());
    const events = await this.listUsageEvents();
    const now = new Date();
    const summary = summarizeUsage(events, period, settings.budget, now);
    if (period === "current_month") {
      summary.projectionBRL = projectMonthlySpend(summary.costBRL, now);
    }
    return summary;
  },

  async listUsageEvents() {
    const { data, error } = await getSupabaseClient()
      .from("ai_usage_events")
      .select(
        "id, ts, source, feature, provider_id, model, input_tokens, output_tokens, cost_brl, latency_ms, status",
      )
      .order("ts", { ascending: false })
      .limit(5000);
    if (error) throw new Error(`[supabase] ai.listUsageEvents failed: ${error.message}`);
    return (data as AiUsageEventRow[]).map(rowToUsageEvent);
  },

  async runPlayground(input: IAiPlaygroundInput): Promise<IAiPlaygroundResult> {
    const { data, error } = await getSupabaseClient().functions.invoke("ai-generate", {
      body: { mode: "generate", ...input },
    });
    if (error) throw new Error(await extractFunctionError(error));
    return data as IAiPlaygroundResult;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/providers/data/impl/supabase/ai.test.ts`
Expected: PASS (round-trip).

- [ ] **Step 5: Build (confirma que o factory ainda resolve o provider)**

Run: `bun run build`
Expected: OK (o `supabaseAiProvider` já está registrado no `factory.ts` desde a v0.100.0; só trocamos a implementação).

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/supabase/ai.ts src/providers/data/impl/supabase/ai.test.ts
git commit -m "feat(ai): real supabaseAiProvider (settings CRUD + usage + playground/test via edge)"
```

---

## Block E — Frontend

### Task E1: Endurecer o Playground (estado-zero, default configurado, banner LGPD, sem `auto`)

**Files:**
- Modify: `src/features/ai-settings/pages/AiPlaygroundTab.tsx`

**Interfaces:**
- Consumes: `useAiSettings`, `useAiProvider`, `IAiProviderConfig.status`.

> Mudança de UI — sem teste unitário; verificada por `bun run build` + smoke manual.

- [ ] **Step 1: Reescrever a página com estado-zero + banner**

Replace `src/features/ai-settings/pages/AiPlaygroundTab.tsx`:
```tsx
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiProvider } from "@/providers/data";
import { AI_PROVIDER_LABELS, type AiProviderId, type IAiPlaygroundResult } from "@/shared/types";
import { useAiSettings } from "../hooks/useAiSettings";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function AiPlaygroundTab() {
  const { settings, loading } = useAiSettings();
  const provider = useAiProvider();
  const [providerId, setProviderId] = useState<AiProviderId | null>(null);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("Explique em 3 bullets como funciona um turbo de motor diesel.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IAiPlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only configured providers can actually be called.
  const configured = useMemo(
    () => (settings?.providers ?? []).filter((p) => p.status === "configured"),
    [settings],
  );

  if (loading || !settings) return <Skeleton className="h-96 w-full" />;

  if (configured.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <Icon icon="mdi:key-alert-outline" className="mx-auto mb-2 size-6" />
        Nenhum provedor configurado. Defina uma chave de API em <b>Provedores &amp; chaves</b> e
        teste a conexão para liberar o Playground.
      </Card>
    );
  }

  const effectiveProviderId = providerId ?? configured[0]!.provider;
  const providerModels = configured.find((p) => p.provider === effectiveProviderId)?.models ?? [];
  const effectiveModel = model || providerModels[0]?.id || "";

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await provider.runPlayground({
          providerId: effectiveProviderId,
          model: effectiveModel,
          params: { temperature: 0.4, maxTokens: 1024 },
          prompt,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao executar.");
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-severity-warning/40 bg-severity-warning/10 p-3 text-xs text-severity-warning">
        <Icon icon="mdi:shield-alert-outline" className="mt-0.5 size-4 shrink-0" />
        <p>
          O conteúdo enviado é processado pelo provedor externo selecionado. Não cole dados
          sensíveis de clientes (LGPD). Evite o OpenRouter para dados pessoais — ele repassa a
          terceiros.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">
          Provedor
          <select
            value={effectiveProviderId}
            onChange={(e) => {
              const next = e.target.value as AiProviderId;
              setProviderId(next);
              const ms = configured.find((p) => p.provider === next)?.models ?? [];
              setModel(ms[0]?.id ?? "");
            }}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {configured.map((p) => (
              <option key={p.provider} value={p.provider}>
                {AI_PROVIDER_LABELS[p.provider]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Modelo
          <select
            value={effectiveModel}
            onChange={(e) => setModel(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          >
            {providerModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-xs text-muted-foreground">
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
      </label>
      <div className="flex justify-end">
        <Button onClick={run} disabled={busy || !effectiveModel}>
          <Icon icon="mdi:play" className="mr-1 size-4" />
          {busy ? "Executando…" : "Executar"}
        </Button>
      </div>

      {error && <p className="text-sm text-severity-critical">{error}</p>}

      {result && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Resposta</p>
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm">
            {result.text}
          </pre>
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

> O `auto` do OpenRouter já saiu do catálogo (Task A1), então não aparece no select. O select de provedor lista só `configured` e o botão desabilita sem modelo.

- [ ] **Step 2: Build**

Run: `bun run build`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-settings/pages/AiPlaygroundTab.tsx
git commit -m "feat(ai): harden playground zero-state, configured-only providers, LGPD notice"
```

---

### Task E2: Remover o gate demo (sidebar + rota)

**Files:**
- Modify: `src/features/shell/layouts/SettingsLayout.tsx:175-181`
- Modify: `src/routes/app.configuracoes.ia.tsx:1-38`

> **⚠️ Ordem de deploy:** esta task só pode ser mergeada/deployada **depois** que a migration (Block B) está aplicada em prod e o Edge (Block C) está deployado. Ver "Rollout" no fim.

- [ ] **Step 1: Tirar `demoOnly` do item da sidebar**

Edit `src/features/shell/layouts/SettingsLayout.tsx` — no item "Inteligência artificial", remover a linha `demoOnly: true,`:
```ts
      {
        label: "Inteligência artificial",
        icon: "mdi:robot-happy-outline",
        to: "/app/configuracoes/ia",
        roles: ["Owner"],
      },
```
(Manter o tipo `demoOnly?` em `ISettingsItem` e o filtro `if (item.demoOnly && !isDemo) return false;` no `useVisibleGroups` — são genéricos e inertes sem nenhum item marcado.)

- [ ] **Step 2: Tirar o redirect da rota**

Edit `src/routes/app.configuracoes.ia.tsx` — remover o import de `getActiveDataSource` e o bloco de redirect, deixando o `beforeLoad` só com o `requireAuth`:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AiSettingsPage } from "@/features/ai-settings";

const ABAS = ["visao-geral", "provedores", "funcionalidades", "playground"] as const;
type Aba = (typeof ABAS)[number];

export interface IAiSearch {
  aba: Aba;
}

function validateAiSearch(raw: Record<string, unknown>): IAiSearch {
  const aba =
    typeof raw.aba === "string" && (ABAS as readonly string[]).includes(raw.aba)
      ? (raw.aba as Aba)
      : "visao-geral";
  return { aba };
}

export const Route = createFileRoute("/app/configuracoes/ia")({
  validateSearch: validateAiSearch,
  beforeLoad: ({ location }) => {
    requireAuth(location.pathname, ["Owner"]);
  },
  component: () => (
    <SettingsLayout>
      <AiSettingsPage />
    </SettingsLayout>
  ),
});
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: OK (sem `getActiveDataSource` não-usado).

- [ ] **Step 4: Commit**

```bash
git add src/features/shell/layouts/SettingsLayout.tsx src/routes/app.configuracoes.ia.tsx
git commit -m "feat(ai): remove demo-only gate now that supabase provider is real"
```

---

## Block F — Release & docs

### Task F1: Doc dev, version bump, changelog, CLAUDE.md

**Files:**
- Create: `docs/dev/ai-llm-integration.md`
- Modify: `package.json`, `CHANGELOG.md`, `CLAUDE.md`

- [ ] **Step 1: Doc dev**

Create `docs/dev/ai-llm-integration.md` com: visão geral; as 2 tabelas (schema + RLS); o Edge `ai-generate` (contratos generate/test, teto best-effort, timeout, custo por provedor); como adicionar um novo adaptador (OpenAI/Google); a ordem de deploy; e os riscos aceitos no v1 (teto não-atômico; LGPD; testConnection custa). Referenciar a spec.

- [ ] **Step 2: Version bump + changelog**

Edit `package.json` — bump MINOR (`0.101.0` → `0.102.0`).
Edit `CHANGELOG.md` — nova entrada `## [0.102.0] — <Codinome> · 2026-06-17` com:
- `Added`: integração LLM real (Sub-projeto 1) — Edge `ai-generate`, tabelas `ai_settings`/`ai_usage_events`, Playground/teste de conexão reais (Anthropic + OpenRouter).
- `Changed`: área de *Inteligência artificial* sai do modo Demonstração (gate removido); catálogo de modelos movido para o engine compartilhado.

(O codinome será definido no fechamento — pedir ao dono.)

- [ ] **Step 3: Atualizar CLAUDE.md**

Edit `CLAUDE.md` — atualizar o parágrafo da área de IA: de "gated para Demonstração / integração real deferida" para "integração real (Sub-projeto 1) em produção: Edge `ai-generate` + tabelas + `supabaseAiProvider` real; consumidores (copiloto/SDR/etc.) ainda deferidos". Adicionar `v0.102.0 <Codinome>` à lista de tags.

- [ ] **Step 4: Run gate completo**

Run: `bun run test && bun run build`
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add docs/dev/ai-llm-integration.md package.json CHANGELOG.md CLAUDE.md
git commit -m "docs(ai): release v0.102.0 — real LLM integration (sub-project 1)"
```

---

## Rollout (ordem obrigatória de deploy)

1. **Migration** (Block B) aplicada em prod via MCP + espelhada em `supabase/migrations/` no PR.
2. **Chaves no Vault**: o Owner grava `ANTHROPIC_API_KEY` (e opcionalmente `OPENROUTER_API_KEY`) em *Configurações → Chaves & API*.
3. **Edge** (Block C) deployado por CLI (`--project-ref njizaasajkdqptlxddqn`).
4. **Front** (Blocks A/D/E/F) — provider real + remoção do gate (E2) — mergeado **por último**.
5. `getSettings` defensivo (Task D1) cobre a janela entre (1) e (4): se a área for acessada antes do merge final via override de ambiente, ela semeia o default em vez de estourar.

## Smoke (pós-deploy, em produção, com chave real)
1. Owner acessa *Configurações → Inteligência artificial* — sem redirect; item visível na sidebar.
2. *Provedores & chaves* → "testar conexão" Anthropic → `OK`; provedor vira `configured`.
3. *Playground* → executar com Claude → retorna texto + tokens + custo + latência; evento aparece na *Visão geral*.
4. Forçar teto (ajustar `monthlyCapBRL` baixo na aba ou via SQL) → Playground recebe "orçamento esgotado".
5. Em modo mock (Demonstração), a área permanece idêntica ao comportamento atual.

---

## Self-Review (preenchido na escrita)

**1. Cobertura da spec:** §3 (tabelas)→B1; §4 (catálogo + tipo + summarize)→A1/A2; §5 (Edge)→C1/C2; §6 (provider)→D1 (+D2 dobrado em D1); §7 (front)→E1/E2; §8 (rollout)→seção Rollout; §9 (riscos) → documentados no doc dev (F1) e no comportamento (teto best-effort C2, banner LGPD E1, testConnection bloqueado por teto C2); §10 (testes)→A1/A2/A3/D1; §11 (versionamento)→F1. **Gap consciente:** rate-limit por caller e PII scrub ficam deferidos (spec §9 e §1 não-objetivos) — não viram task.

**2. Placeholders:** os únicos marcadores intencionais são `20260617HHMMSS`/`20260617143000` (timestamp da migration — instruído a usar valor real único) e `<Codinome>` (definido com o dono no fechamento). Nenhum "TODO/TBD" de implementação.

**3. Consistência de tipos:** `buildDefaultAiSettings(env)` (A1) usado em D1 e C-side via linha persistida; `IAiUsageEvent.source/feature?` (A2) consumido por `rowToUsageEvent` (D1) e `summarizeUsage` (A2); `computeCostBRL`/`LlmResult`/`ModelPricing` (C1) consumidos por C2; `rowToSettings`/`settingsToRow` (D1) testados em D1. Sem divergência de nomes detectada.
