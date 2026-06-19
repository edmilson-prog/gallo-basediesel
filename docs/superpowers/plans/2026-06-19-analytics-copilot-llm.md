# Copiloto analítico com LLM (NLU real) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o resolvedor de intenção do copiloto analítico (hoje por regras) por um resolvedor LLM que devolve 1+ métricas; os números continuam determinísticos (executeQuery) e há fallback para as regras.

**Architecture:** A LLM faz só NLU (pergunta + catálogo → `IMetricQuery[]`), via nova Edge `analytics-resolve` (gated por `ai_feature_enabled('analytics_copilot')`, consumível por qualquer atendente). O `runCopilotQuery` passa a aceitar um resolvedor injetável e a retornar `IAnalyticsAnswer[]`; o `useCopilotChat` anexa uma mensagem (card) por métrica. Fallback para regras quando a LLM está off/falha.

**Tech Stack:** Supabase Edge Functions (Deno), React 19 + TanStack, Vitest, provider pattern (mock + supabase), `_shared/ai/adapters.ts`.

**Spec:** `docs/superpowers/specs/2026-06-19-analytics-copilot-llm-design.md`

## Global Constraints

- **UI/conteúdo em português do Brasil com acentos corretos** (UTF-8). Código/comentários em inglês.
- **Commits Conventional Commits** em inglês, atômicos. Terminar com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Provider boundary (PRD-005):** features acessam dados só via `@/providers/data`.
- **RNF-001:** o número vem SEMPRE do `executeQuery`/`dataAccess`; a LLM só escolhe métrica/filtros. Nenhum número/PII é enviado ao provedor — só pergunta + digest do catálogo.
- **Segurança:** atendente envia `{ question, digest }`; provider/model/systemPrompt vêm do routing; a Edge revalida a saída contra o catálogo. Gate: `ai_feature_enabled('analytics_copilot')`.
- **Filtros da LLM (v1):** `marca`, `categoria`, `comparison`. Período = mês atual (do contexto).
- **Fallback:** LLM off/erro/vazio/JSON inválido → motor de regras (`resolveQuery`). O copiloto nunca para.
- **Sem migration** (RPC `ai_feature_enabled` e routing `analytics_copilot` já existem em prod).
- **Gate de CI:** `bun run build` + `bun run test` verdes. `vitest.config.ts` já inclui `supabase/functions/**` (entregue na v0.108.0).
- **Não tocar** `copilot-generate`/`ai-generate`/`executeQuery`/`scopeClamp`/`dataAccess`.
- **Base:** worktree `feat+analytics-copilot-llm`, branch `worktree-feat+analytics-copilot-llm`, base `origin/main` `bf8845e` (v0.108.0). Bump alvo **v0.109.0**. Supabase ref `njizaasajkdqptlxddqn`.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/types/analytics-copilot.ts` (modificar) | + `IResolvedQuery`, `IAnalyticsDigest`, `IResolvedIntent`, `IQueryResolver`. |
| `src/features/analytics-copilot/catalog/buildDigest.ts` (criar) | Pura: catálogo+marcas+categorias → `IAnalyticsDigest`. |
| `src/features/analytics-copilot/catalog/__tests__/buildDigest.test.ts` (criar) | Teste. |
| `supabase/functions/analytics-resolve/resolve.ts` (criar) | Puro: `buildResolvePrompt`, `extractJson`, `validateQueries`. Sem imports Deno. |
| `supabase/functions/analytics-resolve/resolve.test.ts` (criar) | Teste Vitest. |
| `supabase/functions/analytics-resolve/index.ts` (criar) | Edge gated: auth, gate IA, routing, LLM, validação, budget, usage. |
| `src/features/analytics-copilot/engine/toMetricQueries.ts` (criar) | Pura: `IResolvedQuery[]`+period+catálogo → `IMetricQuery[]` (revalidação front). |
| `src/features/analytics-copilot/engine/__tests__/toMetricQueries.test.ts` (criar) | Teste. |
| `src/features/analytics-copilot/engine/rulesResolver.ts` (criar) | Envelope de `resolveQuery` → `IResolvedIntent`. |
| `src/features/analytics-copilot/engine/runCopilotQuery.ts` (modificar) | Resolver injetável + retorno `IAnalyticsAnswer[]`. |
| `src/features/analytics-copilot/engine/__tests__/runCopilotQuery.test.ts` (modificar) | Atualizar p/ `answers[]` + casos multi. |
| `src/providers/data/contracts/ai.ts` (modificar) | + `isAiFeatureEnabled`, `resolveAnalyticsQueries`. |
| `src/providers/data/impl/mock/ai.ts` (modificar) | mock: `false` / `null`. |
| `src/providers/data/impl/mock/ai.test.ts` (modificar) | teste dos 2 métodos no mock. |
| `src/providers/data/impl/supabase/ai.ts` (modificar) | RPC + invoke da Edge. |
| `src/features/analytics-copilot/adapters/useAnalyticsResolver.ts` (criar) | Decide LLM vs regras + fallback + digest + map. |
| `src/features/analytics-copilot/hooks/useCopilotChat.ts` (modificar) | Injeta resolver; multi-mensagem; `aiActive` p/ badge. |
| `src/features/analytics-copilot/components/CopilotHeader.tsx` (modificar) | Badge `IA` vs `baseado em regras`. |
| `src/features/analytics-copilot/pages/AnalyticsCopilotPage.tsx` (modificar) | Passa `aiActive` ao header. |
| `src/features/analytics-copilot/pages/AnalyticsCopilotConfigPage.tsx` (modificar) | Atualizar aviso "Fase 2". |
| `CHANGELOG.md`, `package.json` (modificar) | Bump v0.109.0. |
| `docs/dev/analytics-copilot-llm.md` (criar) | Doc de dev. |

---

### Task 1: Tipos compartilhados

**Files:**
- Modify: `src/shared/types/analytics-copilot.ts`

**Interfaces:**
- Produces: `IResolvedQuery`, `IAnalyticsDigest`, `IResolvedIntent`, `IQueryResolver`.

- [ ] **Step 1: Adicionar os tipos** (ao final de `src/shared/types/analytics-copilot.ts`, antes de `IAnalyticsCopilotProvider` ou no fim)

```ts
/** A metric intent resolved from a question (period is added later by the caller). */
export interface IResolvedQuery {
  metricId: string;
  filters: Partial<Record<MetricDimension, string>>;
  comparison?: ComparisonMode;
}

/** Public catalog metadata sent to the LLM resolver (NO numbers / PII). */
export interface IAnalyticsDigest {
  catalog: Array<{
    id: string;
    label: string;
    description: string;
    supportedFilters: MetricDimension[];
  }>;
  brands: string[];
  categories: string[];
}

/** Output of a query resolver: 0+ executable queries, plus the rules-only ambiguous case. */
export interface IResolvedIntent {
  queries: IMetricQuery[];
  ambiguous?: boolean;
  candidates?: string[];
}

/** Pluggable resolver (rules or LLM). Sync (rules) or async (LLM). */
export type IQueryResolver = (
  question: string,
  ctx: { period: IGoalPeriod },
  catalog: IMetricDefinition[],
) => Promise<IResolvedIntent> | IResolvedIntent;
```

- [ ] **Step 2: Build check**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/analytics-copilot.ts
git commit -m "feat(analytics-copilot): resolver/digest types for LLM NLU

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pura — `buildDigest` (TDD)

**Files:**
- Create: `src/features/analytics-copilot/catalog/buildDigest.ts`
- Test: `src/features/analytics-copilot/catalog/__tests__/buildDigest.test.ts`

**Interfaces:**
- Consumes: `IMetricDefinition`, `IAnalyticsDigest` (Task 1).
- Produces: `buildDigest(catalog: IMetricDefinition[]): IAnalyticsDigest`.

- [ ] **Step 1: Teste (falhando)**

```ts
import { describe, expect, it } from "vitest";
import { buildDigest } from "../buildDigest";
import { metricCatalog } from "../metricCatalog";

describe("buildDigest", () => {
  it("inclui id/label/description/supportedFilters de cada métrica", () => {
    const d = buildDigest(metricCatalog);
    expect(d.catalog.length).toBe(metricCatalog.length);
    const fat = d.catalog.find((m) => m.id === "faturamento");
    expect(fat?.label).toBe("Faturamento");
    expect(fat?.supportedFilters).toContain("marca");
  });

  it("lista as marcas canônicas e categorias", () => {
    const d = buildDigest(metricCatalog);
    expect(d.brands).toContain("Volvo");
    expect(d.brands).toContain("Mercedes-Benz");
    expect(d.categories).toContain("filtro");
    expect(d.categories).toContain("freio");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- buildDigest`
Expected: FAIL — `Cannot find module '../buildDigest'`.

- [ ] **Step 3: Implementar**

```ts
import { BRANDS } from "@/features/part-identification/data/brands";
import { PART_CATEGORY_ENTRIES } from "@/features/part-identification/data/partCategories";
import type { IAnalyticsDigest, IMetricDefinition } from "@/shared/types/analytics-copilot";

/** Builds the public digest sent to the LLM resolver. Metadata only — no numbers/PII. */
export function buildDigest(catalog: IMetricDefinition[]): IAnalyticsDigest {
  return {
    catalog: catalog.map((m) => ({
      id: m.id,
      label: m.label,
      description: m.description,
      supportedFilters: m.supportedFilters,
    })),
    brands: BRANDS.map((b) => b.canonical),
    categories: PART_CATEGORY_ENTRIES.map((c) => c.canonical),
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- buildDigest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/catalog/buildDigest.ts src/features/analytics-copilot/catalog/__tests__/buildDigest.test.ts
git commit -m "feat(analytics-copilot): pure buildDigest (catalog → LLM digest)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pura — resolver da Edge (`resolve.ts`) (TDD)

Funções puras (sem imports Deno) compartilhadas pela Edge; testadas pelo Vitest (glob já cobre `supabase/functions/**`).

**Files:**
- Create: `supabase/functions/analytics-resolve/resolve.ts`
- Test: `supabase/functions/analytics-resolve/resolve.test.ts`

**Interfaces:**
- Produces:
  - `ResolveDigest = { catalog: Array<{id,label,description,supportedFilters:string[]}>, brands: string[], categories: string[] }`
  - `ResolvedQuery = { metricId: string; filters: Record<string,string>; comparison?: "previous_period"|"previous_year" }`
  - `buildResolvePrompt(question: string, digest: ResolveDigest): string`
  - `extractJson(text: string): unknown`
  - `validateQueries(parsed: unknown, digest: ResolveDigest): ResolvedQuery[]`

- [ ] **Step 1: Teste (falhando)**

```ts
import { describe, expect, it } from "vitest";
import { buildResolvePrompt, extractJson, validateQueries, type ResolveDigest } from "./resolve";

const digest: ResolveDigest = {
  catalog: [
    { id: "faturamento", label: "Faturamento", description: "Receita.", supportedFilters: ["marca", "categoria"] },
    { id: "margem", label: "Margem", description: "Margem.", supportedFilters: ["categoria"] },
  ],
  brands: ["Volvo", "Scania"],
  categories: ["filtro", "freio"],
};

describe("buildResolvePrompt", () => {
  it("inclui ids do catálogo e a pergunta", () => {
    const p = buildResolvePrompt("quanto faturei?", digest);
    expect(p).toContain("faturamento");
    expect(p).toContain("quanto faturei?");
    expect(p).toContain("Volvo");
  });
});

describe("extractJson", () => {
  it("extrai JSON puro", () => {
    expect(extractJson('{"queries":[]}')).toEqual({ queries: [] });
  });
  it("extrai JSON cercado por crase/prosa", () => {
    expect(extractJson('Claro:\n```json\n{"queries":[]}\n```')).toEqual({ queries: [] });
  });
  it("texto sem JSON → null", () => {
    expect(extractJson("sem json aqui")).toBeNull();
  });
});

describe("validateQueries", () => {
  it("mantém metricId válido e filtro de marca válido", () => {
    const out = validateQueries(
      { queries: [{ metricId: "faturamento", filters: { marca: "Volvo" }, comparison: "previous_period" }] },
      digest,
    );
    expect(out).toEqual([{ metricId: "faturamento", filters: { marca: "Volvo" }, comparison: "previous_period" }]);
  });
  it("descarta metricId desconhecido", () => {
    expect(validateQueries({ queries: [{ metricId: "inexistente", filters: {} }] }, digest)).toEqual([]);
  });
  it("descarta filtro não suportado pela métrica e marca inválida", () => {
    const out = validateQueries(
      { queries: [{ metricId: "margem", filters: { marca: "Volvo", categoria: "filtro" } }] },
      digest,
    );
    // margem não suporta marca → some; categoria válida fica
    expect(out).toEqual([{ metricId: "margem", filters: { categoria: "filtro" } }]);
  });
  it("dedupe e cap em 4", () => {
    const q = { metricId: "faturamento", filters: {} };
    const out = validateQueries({ queries: [q, q, q, q, q, q] }, digest);
    expect(out).toEqual([{ metricId: "faturamento", filters: {} }]);
  });
  it("entrada inválida → []", () => {
    expect(validateQueries({}, digest)).toEqual([]);
    expect(validateQueries(null, digest)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- analytics-resolve/resolve`
Expected: FAIL — `Cannot find module './resolve'`.

- [ ] **Step 3: Implementar `resolve.ts`**

```ts
/**
 * Pure helpers for the analytics-resolve Edge Function. Runtime-agnostic:
 * NO Deno imports — unit-testable under Vitest. Builds the LLM prompt and
 * validates the model's JSON output against the provided catalog digest.
 */

export interface ResolveDigest {
  catalog: Array<{ id: string; label: string; description: string; supportedFilters: string[] }>;
  brands: string[];
  categories: string[];
}

export interface ResolvedQuery {
  metricId: string;
  filters: Record<string, string>;
  comparison?: "previous_period" | "previous_year";
}

const MAX_QUERIES = 4;
const COMPARISONS = new Set(["previous_period", "previous_year"]);
const LLM_FILTER_KEYS = new Set(["marca", "categoria"]);

export function buildResolvePrompt(question: string, digest: ResolveDigest): string {
  const metrics = digest.catalog
    .map(
      (m) =>
        `- ${m.id}: ${m.label} — ${m.description} (filtros: ${m.supportedFilters.join(", ") || "nenhum"})`,
    )
    .join("\n");
  return [
    "Você classifica perguntas de gestão comercial em métricas de um catálogo fechado.",
    "Métricas disponíveis (use o id EXATO):",
    metrics,
    `Marcas reconhecidas: ${digest.brands.join(", ")}.`,
    `Categorias reconhecidas: ${digest.categories.join(", ")}.`,
    "",
    `Pergunta do usuário: "${question}"`,
    "",
    'Responda APENAS com JSON no formato {"queries":[{"metricId":"<id>","filters":{"marca":"<marca?>","categoria":"<categoria?>"},"comparison":"previous_period|previous_year (opcional)"}]}.',
    "Use só ids/marcas/categorias da lista. Inclua uma entrada por métrica pedida (pode haver mais de uma).",
    'Omita filtros que não se aplicam. Se nada casar, responda {"queries":[]}. Não escreva texto fora do JSON.',
  ].join("\n");
}

/** Extracts the first JSON object from a model response (tolerates code fences / prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1]! : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function validateQueries(parsed: unknown, digest: ResolveDigest): ResolvedQuery[] {
  const ids = new Set(digest.catalog.map((m) => m.id));
  const filtersByMetric = new Map(digest.catalog.map((m) => [m.id, new Set(m.supportedFilters)]));
  const brands = new Set(digest.brands);
  const categories = new Set(digest.categories);
  const arr = (parsed as { queries?: unknown } | null)?.queries;
  if (!Array.isArray(arr)) return [];

  const out: ResolvedQuery[] = [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (out.length >= MAX_QUERIES) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const metricId = String(rec.metricId ?? "");
    if (!ids.has(metricId)) continue;
    const supported = filtersByMetric.get(metricId)!;

    const filters: Record<string, string> = {};
    const rawFilters = rec.filters;
    if (rawFilters && typeof rawFilters === "object") {
      for (const [k, v] of Object.entries(rawFilters as Record<string, unknown>)) {
        if (!LLM_FILTER_KEYS.has(k) || !supported.has(k)) continue;
        const val = String(v ?? "").trim();
        if (!val) continue;
        if (k === "marca" && !brands.has(val)) continue;
        if (k === "categoria" && !categories.has(val)) continue;
        filters[k] = val;
      }
    }

    const cmpRaw = rec.comparison;
    const comparison =
      typeof cmpRaw === "string" && COMPARISONS.has(cmpRaw)
        ? (cmpRaw as ResolvedQuery["comparison"])
        : undefined;

    const key = `${metricId}|${JSON.stringify(filters)}|${comparison ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ metricId, filters, ...(comparison ? { comparison } : {}) });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- analytics-resolve/resolve`
Expected: PASS (todos os casos).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analytics-resolve/resolve.ts supabase/functions/analytics-resolve/resolve.test.ts
git commit -m "feat(analytics-copilot): pure resolve helpers (prompt + json + validation)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Edge `analytics-resolve/index.ts`

**Files:**
- Create: `supabase/functions/analytics-resolve/index.ts`

**Interfaces:**
- Consumes: `requireAnyCaller` (`_shared/auth.ts`), `createSecretResolver` (`_shared/secrets.ts`), `servePost/json/parseJsonBody/HttpError` (`_shared`), `callAnthropic/callOpenAI/callOpenRouter/computeCostBRL` (`_shared/ai/adapters.ts`), `buildResolvePrompt/extractJson/validateQueries` (Task 3).
- Produces: `POST { question, digest } → 200 { queries: ResolvedQuery[] }`.

- [ ] **Step 1: Escrever a Edge**

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * analytics-resolve — 13ª Edge Function. NLU do Copiloto analítico (PRD-057).
 *
 * Gated, consumível por qualquer atendente. Recebe { question, digest } (catálogo
 * público, sem números/PII), resolve provider/model/systemPrompt do routing
 * 'analytics_copilot', chama o LLM (JSON estrito), valida contra o digest e
 * devolve { queries }. O número é calculado no front (executeQuery). Grava uso.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requireAnyCaller } from "../_shared/auth.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import {
  callAnthropic,
  callOpenAI,
  callOpenRouter,
  computeCostBRL,
  type LlmRequest,
  type LlmResult,
  type ModelPricing,
} from "../_shared/ai/adapters.ts";
import { buildResolvePrompt, extractJson, validateQueries, type ResolveDigest } from "./resolve.ts";

const FEATURE = "analytics_copilot";
const LLM_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 500;
const SUPPORTED = new Set(["anthropic", "openai", "openrouter"]);
const KEY_BY_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

interface RoutingEntry {
  feature: string;
  enabled: boolean;
  providerId: string;
  model: string;
  params?: { temperature?: number; maxTokens?: number };
  systemPrompt?: string;
}
interface SettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; alertThresholdPct: number; usdToBrl: number };
  providers: Array<{
    provider: string;
    models: Array<{ id: string; inputPricePer1kUsd: number; outputPricePer1kUsd: number }>;
  }>;
  routing: RoutingEntry[];
}

function pricingFor(settings: SettingsRow, providerId: string, model: string): ModelPricing | null {
  const p = settings.providers.find((x) => x.provider === providerId);
  const m = p?.models.find((x) => x.id === model);
  if (!m) return null;
  return { inputPricePer1kUsd: m.inputPricePer1kUsd, outputPricePer1kUsd: m.outputPricePer1kUsd };
}

async function monthSpendBRL(admin: SupabaseClient): Promise<number> {
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

function dispatch(
  providerId: string,
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  if (providerId === "anthropic") return callAnthropic(apiKey, req, signal);
  if (providerId === "openai") return callOpenAI(apiKey, req, signal);
  return callOpenRouter(apiKey, req, signal);
}

function asDigest(raw: unknown): ResolveDigest | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.catalog) || !Array.isArray(d.brands) || !Array.isArray(d.categories)) {
    return null;
  }
  return d as unknown as ResolveDigest;
}

servePost(async (req, { log }) => {
  const { callerId, admin, profile } = await requireAnyCaller(req);
  const body = await parseJsonBody(req);
  const question = String(body.question ?? "").trim();
  const digest = asDigest(body.digest);
  if (!question) throw new HttpError(400, "question é obrigatória");
  if (!digest) throw new HttpError(400, "digest inválido");

  // Settings + gate (inline, como na copilot-generate).
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers, routing")
    .eq("id", 1)
    .maybeSingle<SettingsRow>();
  if (sErr) throw new HttpError(500, `settings read failed: ${sErr.message}`);
  if (!settings) throw new HttpError(409, "configuração de IA ainda não inicializada");
  if (!settings.master_enabled) throw new HttpError(409, "IA desligada");
  const route = settings.routing.find((r) => r.feature === FEATURE);
  if (!route || !route.enabled) throw new HttpError(409, "copiloto analítico (IA) desligado");
  const providerId = route.providerId;
  if (!SUPPORTED.has(providerId)) throw new HttpError(400, "provedor não suportado");
  const model = route.model;
  if (!model) throw new HttpError(400, "nenhum modelo configurado");

  // Budget cap (best-effort).
  const spent = await monthSpendBRL(admin);
  if (settings.budget.monthlyCapBRL > 0 && spent >= settings.budget.monthlyCapBRL) {
    throw new HttpError(402, "orçamento de IA do mês esgotado");
  }

  // Key (Vault-first).
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) throw new HttpError(400, "chave de API do provedor não configurada");

  const llmReq: LlmRequest = {
    model,
    prompt: buildResolvePrompt(question, digest),
    systemPrompt: typeof route.systemPrompt === "string" ? route.systemPrompt : undefined,
    maxTokens: MAX_TOKENS,
    temperature: 0,
  };
  const controller = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const started = Date.now();

  let result: LlmResult;
  try {
    result = await dispatch(providerId, apiKey, llmReq, controller);
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof DOMException && err.name === "TimeoutError";
    const { error: insErr } = await admin.from("ai_usage_events").insert({
      source: "routed",
      feature: FEATURE,
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
    if (insErr) log.error("analytics-resolve error-usage insert failed", { error: insErr.message });
    log.error("analytics-resolve llm call failed", { providerId, model, aborted });
    throw new HttpError(
      aborted ? 504 : 502,
      aborted ? "tempo de resposta do LLM esgotado" : "falha na chamada ao LLM",
    );
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

  const { error: insErr } = await admin.from("ai_usage_events").insert({
    source: "routed",
    feature: FEATURE,
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
  if (insErr) log.error("analytics-resolve usage insert failed", { error: insErr.message, costBRL });

  const queries = validateQueries(extractJson(result.text), digest);
  return json({ queries });
});
```

- [ ] **Step 2: Sanidade (front build não quebra; type-check Deno no deploy, Task 10)**

Run: `bun run build`
Expected: PASS (Vite ignora `supabase/functions`).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analytics-resolve/index.ts
git commit -m "feat(edge): analytics-resolve — gated LLM NLU proxy for the analytics copilot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Pura — `toMetricQueries` (TDD)

Revalida as intenções da LLM contra o catálogo real do front e injeta o período.

**Files:**
- Create: `src/features/analytics-copilot/engine/toMetricQueries.ts`
- Test: `src/features/analytics-copilot/engine/__tests__/toMetricQueries.test.ts`

**Interfaces:**
- Consumes: `IResolvedQuery`, `IMetricDefinition`, `IMetricQuery`, `MetricDimension` (types), `IGoalPeriod`.
- Produces: `toMetricQueries(resolved: IResolvedQuery[], period: IGoalPeriod, catalog: IMetricDefinition[]): IMetricQuery[]`.

- [ ] **Step 1: Teste (falhando)**

```ts
import { describe, expect, it } from "vitest";
import type { IGoalPeriod } from "@/shared/types/bi";
import { metricCatalog } from "../../catalog/metricCatalog";
import { toMetricQueries } from "../toMetricQueries";

const period: IGoalPeriod = {
  type: "monthly",
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-06-30T23:59:59.999Z",
};

describe("toMetricQueries", () => {
  it("mapeia métrica válida com período e comparação", () => {
    const out = toMetricQueries(
      [{ metricId: "faturamento", filters: { marca: "Volvo" }, comparison: "previous_period" }],
      period,
      metricCatalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.metricId).toBe("faturamento");
    expect(out[0]!.filters.marca).toBe("Volvo");
    expect(out[0]!.period).toBe(period);
    expect(out[0]!.comparison).toBe("previous_period");
    expect(out[0]!.dimensions).toEqual([]);
  });

  it("descarta metricId desconhecido", () => {
    expect(toMetricQueries([{ metricId: "xpto", filters: {} }], period, metricCatalog)).toEqual([]);
  });

  it("descarta filtro não suportado pela métrica", () => {
    // 'margem' não suporta 'marca'
    const out = toMetricQueries([{ metricId: "margem", filters: { marca: "Volvo" } }], period, metricCatalog);
    expect(out).toHaveLength(1);
    expect(out[0]!.filters.marca).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test -- toMetricQueries`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  IMetricDefinition,
  IMetricQuery,
  IResolvedQuery,
  MetricDimension,
} from "@/shared/types/analytics-copilot";

const ALLOWED_FILTERS: MetricDimension[] = ["marca", "categoria"];

/**
 * Maps LLM-resolved intents to executable IMetricQuery[] (front-side revalidation,
 * defence in depth over the Edge). Drops unknown metrics and unsupported filters;
 * injects the period from context. RNF-001: never produces a number.
 */
export function toMetricQueries(
  resolved: IResolvedQuery[],
  period: IGoalPeriod,
  catalog: IMetricDefinition[],
): IMetricQuery[] {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const out: IMetricQuery[] = [];
  for (const r of resolved) {
    const def = byId.get(r.metricId);
    if (!def) continue;
    const filters: Partial<Record<MetricDimension, string>> = {};
    for (const k of ALLOWED_FILTERS) {
      const v = r.filters[k];
      if (v && def.supportedFilters.includes(k)) filters[k] = v;
    }
    out.push({ metricId: def.id, dimensions: [], filters, period, comparison: r.comparison });
  }
  return out;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun run test -- toMetricQueries`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/engine/toMetricQueries.ts src/features/analytics-copilot/engine/__tests__/toMetricQueries.test.ts
git commit -m "feat(analytics-copilot): pure toMetricQueries (LLM intents → executable queries)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `rulesResolver` + `runCopilotQuery` multi-answer (TDD)

**Files:**
- Create: `src/features/analytics-copilot/engine/rulesResolver.ts`
- Modify: `src/features/analytics-copilot/engine/runCopilotQuery.ts`
- Modify: `src/features/analytics-copilot/engine/__tests__/runCopilotQuery.test.ts`

**Interfaces:**
- Consumes: `IQueryResolver`, `IResolvedIntent` (Task 1), `resolveQuery`, `scopeClamp`, `executeQuery`.
- Produces: `rulesResolver: IQueryResolver`; `runCopilotQuery(...)` agora retorna `{ answers: IAnalyticsAnswer[]; errorText?: string }`; `deps.resolver?: IQueryResolver` (default `rulesResolver`).

- [ ] **Step 1: Criar `rulesResolver.ts`**

```ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type { IMetricDefinition, IResolvedIntent } from "@/shared/types/analytics-copilot";
import { resolveQuery } from "./resolveQuery";

/** Wraps the rule-based resolveQuery into the IResolvedIntent contract (single query or ambiguous). */
export function rulesResolver(
  question: string,
  ctx: { period: IGoalPeriod },
  catalog: IMetricDefinition[],
): IResolvedIntent {
  const r = resolveQuery(question, { period: ctx.period }, catalog);
  return { queries: r.query ? [r.query] : [], ambiguous: r.ambiguous, candidates: r.candidates };
}
```

- [ ] **Step 2: Atualizar os testes existentes de `runCopilotQuery` p/ `answers[]` + casos multi**

Em `__tests__/runCopilotQuery.test.ts`, trocar as asserções de `answer` por `answers[0]` e adicionar casos com resolver injetado. Substituir o bloco `describe(...)` por:

```ts
describe("runCopilotQuery", () => {
  it("resolve e devolve o número vindo do dataAccess (RNF-001)", async () => {
    const da = makeDataAccess(487200);
    const { answers } = await runCopilotQuery("Quanto faturei esse mês?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers).toHaveLength(1);
    expect(answers[0]!.resolved).toBe(true);
    expect(answers[0]!.value).toBe(487200);
    expect(answers[0]!.citation?.source.label).toBe("Vendas");
    expect(da.getSalesMetric).toHaveBeenCalledOnce();
  });

  it("ambíguo (regras) → sugestões com os rótulos candidatos", async () => {
    const da = makeDataAccess(1);
    const { answers } = await runCopilotQuery("faturamento e margem", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers).toHaveLength(1);
    expect(answers[0]!.resolved).toBe(false);
    expect(answers[0]!.ambiguous).toBe(true);
    expect(answers[0]!.suggestions).toEqual(expect.arrayContaining(["Faturamento", "Margem"]));
  });

  it("fora do catálogo → não resolvido com fallback", async () => {
    const da = makeDataAccess(1);
    const { answers } = await runCopilotQuery("qual a previsão do tempo?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers[0]!.resolved).toBe(false);
    expect(answers[0]!.ambiguous).toBeFalsy();
    expect(answers[0]!.suggestions).toEqual(["Quanto faturei?"]);
  });

  it("Vendedor: resolve no próprio escopo (scopeClamp)", async () => {
    const da = makeDataAccess(1000);
    const ctx = { ...baseCtx, role: "Vendedor" as const, sellerId: "seller-1" };
    const { answers } = await runCopilotQuery("Quanto faturei esse mês?", ctx, {
      dataAccess: da,
      catalog,
    });
    expect(answers[0]!.resolved).toBe(true);
    expect(answers[0]!.query?.scope?.role).toBe("Vendedor");
    expect(answers[0]!.query?.scope?.sellerId).toBe("seller-1");
  });

  it("erro do dataAccess não propaga — devolve errorText", async () => {
    const da = makeDataAccess(1);
    (da.getSalesMetric as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const { answers, errorText } = await runCopilotQuery("Quanto faturei?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers[0]!.resolved).toBe(false);
    expect(errorText).toBeTruthy();
  });

  it("resolver injetado multi-métrica → vários answers", async () => {
    const da = makeDataAccess(500);
    const { answers } = await runCopilotQuery("faturamento e margem", baseCtx, {
      dataAccess: da,
      catalog,
      resolver: () => ({
        queries: [
          { metricId: "faturamento", dimensions: [], filters: {}, period },
          { metricId: "margem", dimensions: [], filters: {}, period },
        ],
      }),
    });
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.resolved)).toBe(true);
    expect(da.getSalesMetric).toHaveBeenCalledOnce();
    expect(da.getMargin).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun run test -- runCopilotQuery`
Expected: FAIL (`answers` undefined / `resolver` não suportado).

- [ ] **Step 4: Reescrever `runCopilotQuery.ts`**

```ts
// src/features/analytics-copilot/engine/runCopilotQuery.ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type { RoleName } from "@/shared/types/people";
import type {
  IAnalyticsAnswer,
  IAnalyticsDataAccess,
  IMetricDefinition,
  IQueryResolver,
} from "@/shared/types/analytics-copilot";

import { rulesResolver } from "./rulesResolver";
import { scopeClamp } from "./scopeClamp";
import { executeQuery, refusalAnswer, unresolvedAnswer } from "./executeQuery";

export interface IRunCopilotContext {
  role: RoleName;
  storeId?: string;
  sellerId?: string;
  period: IGoalPeriod;
  fallbackSuggestions: string[];
}

export interface IRunCopilotDeps {
  dataAccess: IAnalyticsDataAccess;
  catalog: IMetricDefinition[];
  /** Pluggable resolver (default: rule-based). The LLM path is injected by the hook. */
  resolver?: IQueryResolver;
}

export interface IRunCopilotResult {
  answers: IAnalyticsAnswer[];
  errorText?: string;
}

/**
 * Orchestrates a copilot question (PRD-057): resolver → scopeClamp → executeQuery, per metric.
 * RNF-001: the number always comes from dataAccess; the resolver only selects metric + filters.
 * Returns one answer per resolved metric (multi-card). Never throws.
 */
export async function runCopilotQuery(
  question: string,
  ctx: IRunCopilotContext,
  deps: IRunCopilotDeps,
): Promise<IRunCopilotResult> {
  const trimmed = question.trim();
  if (!trimmed) return { answers: [unresolvedAnswer(ctx.fallbackSuggestions)] };

  const findById = (id: string): IMetricDefinition | undefined =>
    deps.catalog.find((m) => m.id === id);
  const resolver = deps.resolver ?? rulesResolver;

  try {
    const intent = await resolver(trimmed, { period: ctx.period }, deps.catalog);

    if (intent.queries.length === 0) {
      if (intent.ambiguous) {
        return {
          answers: [
            {
              resolved: false,
              ambiguous: true,
              suggestions: (intent.candidates ?? []).map((id) => findById(id)?.label ?? id),
            },
          ],
        };
      }
      return { answers: [unresolvedAnswer(ctx.fallbackSuggestions)] };
    }

    const answers: IAnalyticsAnswer[] = [];
    for (const q of intent.queries) {
      const clamp = scopeClamp(q, { role: ctx.role, storeId: ctx.storeId, sellerId: ctx.sellerId });
      if (clamp.refusedByScope) {
        answers.push(refusalAnswer(clamp.query));
        continue;
      }
      const def = findById(clamp.query.metricId);
      if (!def) {
        answers.push(unresolvedAnswer(ctx.fallbackSuggestions));
        continue;
      }
      answers.push(await executeQuery(def, clamp.query, deps.dataAccess));
    }
    return { answers };
  } catch {
    return {
      answers: [{ resolved: false, suggestions: ctx.fallbackSuggestions }],
      errorText: "Não consegui responder agora. Tente novamente.",
    };
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `bun run test -- runCopilotQuery rulesResolver`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/analytics-copilot/engine/rulesResolver.ts src/features/analytics-copilot/engine/runCopilotQuery.ts src/features/analytics-copilot/engine/__tests__/runCopilotQuery.test.ts
git commit -m "feat(analytics-copilot): pluggable resolver + multi-answer runCopilotQuery

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Métodos no provider `ai`

**Files:**
- Modify: `src/providers/data/contracts/ai.ts`
- Modify: `src/providers/data/impl/mock/ai.ts`
- Modify: `src/providers/data/impl/mock/ai.test.ts`
- Modify: `src/providers/data/impl/supabase/ai.ts`

**Interfaces:**
- Produces: `IAiProvider.isAiFeatureEnabled(feature: AiFeatureKey): Promise<boolean>` e `resolveAnalyticsQueries(question: string, digest: IAnalyticsDigest): Promise<IResolvedQuery[] | null>`.

- [ ] **Step 1: Contrato** — em `src/providers/data/contracts/ai.ts`

Adicionar aos imports de tipos:
```ts
import type { AiFeatureKey } from "@/shared/types";
import type { IAnalyticsDigest, IResolvedQuery } from "@/shared/types/analytics-copilot";
```
(`AiFeatureKey` já é importado — garanta que está na lista.) E dentro de `interface IAiProvider`, adicionar:
```ts
  /** Whether a given AI feature is enabled (master + routing + provider configured). */
  isAiFeatureEnabled(feature: AiFeatureKey): Promise<boolean>;
  /** LLM NLU for the analytics copilot: question + digest → resolved intents (null = no LLM). */
  resolveAnalyticsQueries(
    question: string,
    digest: IAnalyticsDigest,
  ): Promise<IResolvedQuery[] | null>;
```

- [ ] **Step 2: Teste do mock (falhando)** — em `src/providers/data/impl/mock/ai.test.ts`, adicionar:

```ts
describe("mockAiProvider — analytics resolver", () => {
  it("isAiFeatureEnabled é false no mock (usa regras)", async () => {
    expect(await mockAiProvider.isAiFeatureEnabled("analytics_copilot")).toBe(false);
  });
  it("resolveAnalyticsQueries é null no mock (fallback p/ regras)", async () => {
    expect(
      await mockAiProvider.resolveAnalyticsQueries("quanto faturei?", {
        catalog: [],
        brands: [],
        categories: [],
      }),
    ).toBeNull();
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `bun run test -- mock/ai`
Expected: FAIL (métodos inexistentes).

- [ ] **Step 4: Implementar no mock** — em `src/providers/data/impl/mock/ai.ts`, adicionar dentro de `mockAiProvider`:

```ts
  async isAiFeatureEnabled() {
    // Demo não tem LLM: o copiloto analítico usa o motor de regras.
    return false;
  },

  async resolveAnalyticsQueries() {
    // null → o adapter cai no resolvedor de regras.
    return null;
  },
```

- [ ] **Step 5: Implementar no supabase** — em `src/providers/data/impl/supabase/ai.ts`, adicionar imports:

```ts
import type { AiFeatureKey } from "@/shared/types";
import type { IAnalyticsDigest, IResolvedQuery } from "@/shared/types/analytics-copilot";
```
E dentro de `supabaseAiProvider` (após `listProviderModels`):
```ts
  async isAiFeatureEnabled(feature: AiFeatureKey): Promise<boolean> {
    const { data, error } = await getSupabaseClient().rpc("ai_feature_enabled", {
      p_feature: feature,
    });
    if (error) return false; // fail-closed
    return data === true;
  },

  async resolveAnalyticsQueries(
    question: string,
    digest: IAnalyticsDigest,
  ): Promise<IResolvedQuery[] | null> {
    const { data, error } = await getSupabaseClient().functions.invoke("analytics-resolve", {
      body: { question, digest },
    });
    if (error) throw new Error(await extractFunctionError(error));
    return (data as { queries?: IResolvedQuery[] }).queries ?? [];
  },
```
(`extractFunctionError` já está importado em `ai.ts`.)

- [ ] **Step 6: Rodar e ver passar + build**

Run: `bun run test -- mock/ai && bun run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/providers/data/contracts/ai.ts src/providers/data/impl/mock/ai.ts src/providers/data/impl/mock/ai.test.ts src/providers/data/impl/supabase/ai.ts
git commit -m "feat(ai): isAiFeatureEnabled + resolveAnalyticsQueries (mock + supabase)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Adapter `useAnalyticsResolver`

**Files:**
- Create: `src/features/analytics-copilot/adapters/useAnalyticsResolver.ts`

**Interfaces:**
- Consumes: `useAiProvider` (`@/providers/data`), `buildDigest` (Task 2), `toMetricQueries` (Task 5), `rulesResolver` (Task 6).
- Produces: `useAnalyticsResolver(): IQueryResolver`.

- [ ] **Step 1: Implementar**

```ts
import { useMemo } from "react";
import { useAiProvider } from "@/providers/data";
import type { IQueryResolver } from "@/shared/types/analytics-copilot";
import { buildDigest } from "../catalog/buildDigest";
import { rulesResolver } from "../engine/rulesResolver";
import { toMetricQueries } from "../engine/toMetricQueries";

/**
 * Resolver that uses the LLM when 'analytics_copilot' is enabled, falling back to
 * the rule engine otherwise (off / error / empty). The number stays deterministic
 * downstream (executeQuery). Only the question + public digest reach the provider.
 */
export function useAnalyticsResolver(): IQueryResolver {
  const ai = useAiProvider();
  return useMemo<IQueryResolver>(() => {
    return async (question, ctx, catalog) => {
      let enabled = false;
      try {
        enabled = await ai.isAiFeatureEnabled("analytics_copilot");
      } catch {
        enabled = false;
      }
      if (!enabled) return rulesResolver(question, ctx, catalog);
      try {
        const resolved = await ai.resolveAnalyticsQueries(question, buildDigest(catalog));
        if (!resolved || resolved.length === 0) return rulesResolver(question, ctx, catalog);
        return { queries: toMetricQueries(resolved, ctx.period, catalog) };
      } catch {
        return rulesResolver(question, ctx, catalog);
      }
    };
  }, [ai]);
}
```

- [ ] **Step 2: Build check**

Run: `bun run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/adapters/useAnalyticsResolver.ts
git commit -m "feat(analytics-copilot): useAnalyticsResolver (LLM with rules fallback)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Fiação — `useCopilotChat` multi-mensagem + badge

**Files:**
- Modify: `src/features/analytics-copilot/hooks/useCopilotChat.ts`
- Modify: `src/features/analytics-copilot/components/CopilotHeader.tsx`
- Modify: `src/features/analytics-copilot/pages/AnalyticsCopilotPage.tsx`
- Modify: `src/features/analytics-copilot/pages/AnalyticsCopilotConfigPage.tsx`

**Interfaces:**
- Consumes: `useAnalyticsResolver` (Task 8), `runCopilotQuery` (Task 6, `{ answers, errorText }`).
- Produces: `useCopilotChat()` ganha `aiActive: boolean`.

- [ ] **Step 1: `useCopilotChat.ts`** — injetar resolver, multi-mensagem, `aiActive`

Adicionar imports:
```ts
import { useEffect, useState } from "react"; // (useState/useEffect já podem existir — garantir useEffect)
import { useAiProvider } from "@/providers/data";
import { useAnalyticsResolver } from "../adapters/useAnalyticsResolver";
```
No corpo do hook, após os hooks existentes:
```ts
  const resolver = useAnalyticsResolver();
  const ai = useAiProvider();
  const [aiActive, setAiActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ai.isAiFeatureEnabled("analytics_copilot")
      .then((v) => {
        if (!cancelled) setAiActive(v);
      })
      .catch(() => {
        if (!cancelled) setAiActive(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ai]);
```
Trocar a chamada e o append dentro de `ask`:
```ts
      const { answers, errorText } = await runCopilotQuery(
        trimmed,
        {
          role: effectiveRole,
          storeId: currentStoreId ?? undefined,
          sellerId,
          period: monthBounds(new Date()),
          fallbackSuggestions: suggestionsForRole(role),
        },
        { dataAccess, catalog: metricCatalog, resolver },
      );

      for (const a of answers) {
        if (a.resolved && a.query) {
          auditLog({
            action: "analytics_copilot_query",
            resource: "insight",
            resourceId: a.query.metricId,
            storeId: currentStoreId ?? undefined,
          });
        }
      }

      appendToActive(
        answers.map((a, i) =>
          makeMessage({ role: "assistant", answer: a, text: i === 0 ? errorText : undefined }),
        ),
      );
      setIsThinking(false);
```
Atualizar a lista de deps do `useCallback` de `ask` para incluir `resolver`. Expor `aiActive` no retorno e na interface `IUseCopilotChat`:
```ts
  aiActive: boolean;
```
```ts
  return { sessions, activeSessionId, messages, isThinking, lastResolvedAnswer, aiActive, ask, newSession, selectSession, deleteSession };
```

- [ ] **Step 2: `CopilotHeader.tsx`** — badge dinâmico

Adicionar `aiActive?: boolean` em `ICopilotHeaderProps`; receber no destructuring; trocar o texto do badge:
```tsx
              <span className="hidden rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                {aiActive ? "Beta · IA" : "Beta · baseado em regras"}
              </span>
```

- [ ] **Step 3: `AnalyticsCopilotPage.tsx`** — passar a prop

```tsx
      <CopilotHeader
        mode={mode}
        onModeChange={setMode}
        onNewSession={chat.newSession}
        aiActive={chat.aiActive}
        onOpenSessions={showSessions ? () => setSessionsSheetOpen(true) : undefined}
        onOpenDetail={showDetail ? () => setDetailSheetOpen(true) : undefined}
      />
```

- [ ] **Step 4: `AnalyticsCopilotConfigPage.tsx`** — atualizar o aviso

Trocar o texto do bloco informativo:
```tsx
          <span>
            NLU por IA real (LLM) disponível: quando a funcionalidade “Copiloto analítico” está
            habilitada em Configurações → Inteligência artificial, as perguntas são interpretadas
            por LLM (com retorno determinístico dos números). Sem a IA, o copiloto usa
            interpretação por regras sobre o catálogo de métricas.
          </span>
```

- [ ] **Step 5: Build + testes**

Run: `bun run build && bun run test`
Expected: build PASS; toda a suíte verde (incluindo os novos testes e os de `runCopilotQuery` atualizados).

- [ ] **Step 6: Commit**

```bash
git add src/features/analytics-copilot/hooks/useCopilotChat.ts src/features/analytics-copilot/components/CopilotHeader.tsx src/features/analytics-copilot/pages/AnalyticsCopilotPage.tsx src/features/analytics-copilot/pages/AnalyticsCopilotConfigPage.tsx
git commit -m "feat(analytics-copilot): wire LLM resolver, multi-card answers and IA badge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Deploy + verificação e2e

**Files:** nenhum (operacional). **Sob autorização do dono** (mutação de prod).

- [ ] **Step 1: Deploy da Edge** (CLI Supabase)

Run:
```bash
npx supabase functions deploy analytics-resolve --project-ref njizaasajkdqptlxddqn
```
Expected: deploy OK (type-check Deno do `index.ts` + `resolve.ts` + `_shared`).

- [ ] **Step 2: Confirmar ACTIVE** via MCP `list_edge_functions` → `analytics-resolve` `ACTIVE`.

- [ ] **Step 3: Smoke e2e (dono)**

No `/app/gestao/copiloto` (logado), perguntar algo em linguagem natural não-literal (ex.: *"como foi minha receita esse mês comparado ao mês passado?"* e *"faturamento e margem"*). Esperado: resolve a métrica certa, mostra o(s) card(s) com número real e comparação; multi-métrica → vários cards; o badge mostra **IA**. Verificar a telemetria:
```sql
select ts, feature, provider_id, model, input_tokens, output_tokens, cost_brl, status
from ai_usage_events
where source = 'routed' and feature = 'analytics_copilot'
order by ts desc limit 5;
```
Expected: ≥1 linha `status='ok'`.

- [ ] **Step 4: Confirmar fallback** — (opcional) com a feature desligada em *Configurações → IA*, o copiloto volta às regras sem erro.

---

### Task 11: Versionamento, CHANGELOG e doc

**Files:**
- Modify: `package.json`, `CHANGELOG.md`
- Create: `docs/dev/analytics-copilot-llm.md`

- [ ] **Step 1: Doc de dev** — `docs/dev/analytics-copilot-llm.md`: arquitetura (resolver pluggable, Edge `analytics-resolve`, fallback), RNF-001 (números determinísticos), privacidade (só pergunta+digest), gating (`analyticsCopilotEnabled` + `ai_feature_enabled`), pontos de extensão (narração/period livre/tool-calling deferidos). Referenciar a spec.

- [ ] **Step 2: Bump** — `package.json`: `"version": "0.109.0"`.

- [ ] **Step 3: CHANGELOG** — entrada (Keep a Changelog), codinome sugerido **`Lexicon`**:
```markdown
## [0.109.0] - 2026-06-19 - Lexicon

### Added
- Copiloto analítico com NLU por LLM: a pergunta é interpretada pela LLM
  (escolhe métrica + filtros, inclusive várias métricas → vários cards), e o
  número segue determinístico (executeQuery). Edge `analytics-resolve` (13ª),
  gated por `ai_feature_enabled('analytics_copilot')`; fallback para o motor de
  regras quando a IA está desligada/falha. Nenhum dado financeiro é enviado ao
  provedor (só a pergunta + o catálogo).
```

- [ ] **Step 4: Build** (copia o changelog p/ public/)

Run: `bun run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md docs/dev/analytics-copilot-llm.md
git commit -m "chore(release): v0.109.0 Lexicon — analytics copilot LLM NLU

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- **Tasks 1, 4, 8, 9** sem teste unitário próprio (tipos, edge Deno, hooks/UI). Verificação por `bun run build` + suíte + (Task 10) deploy/e2e. TDD real nas Tasks 2, 3, 5, 6, 7.
- **Não tocar** `copilot-generate`/`ai-generate`/`executeQuery`/`scopeClamp`/`useAnalyticsDataAccess`.
- **Ordem:** 1→2→3→4 (digest + edge) → 5→6→7→8→9 (front) → 10 (deploy/e2e) → 11 (release).
- O PR final precisa do `routeTree.gen.ts` limpo antes do merge (descartar o gerado se sujar o working tree).
- Integração só por **PR**, sem merge/deploy em prod sem autorização do dono.
