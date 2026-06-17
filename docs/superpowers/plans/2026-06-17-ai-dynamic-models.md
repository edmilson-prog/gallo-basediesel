# Lista dinâmica de modelos LLM — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a lista de modelos de cada provedor LLM dinâmica (buscada ao vivo na API do provedor), em vez dos 2 modelos estáticos hoje hardcoded.

**Architecture:** O Edge `ai-generate` ganha uma ação `list-models` (proxy fino: busca a lista crua na API do provedor com a chave do Vault). Toda a lógica de negócio (filtro de chat do OpenAI, conversão de preço por-token→por-1k do OpenRouter, merge com o mapa de preços do catálogo) vive em **engines puros no front** (`aiCatalog.ts`), testados com Vitest. O `supabaseAiProvider` invoca o Edge, normaliza e persiste em `ai_settings.providers[].models`; o `ProviderCard` ganha um botão "Atualizar modelos" + auto-busca única + seletor adaptativo (combobox quando a lista é grande).

**Tech Stack:** React 19, TypeScript strict, Tailwind v4 + shadcn/ui (Command/Popover via cmdk), Supabase Edge (Deno), Vitest.

## Global Constraints

- **Componentes consomem APENAS tokens semânticos** (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`…). Nunca `--gallo-*` nem hex.
- **Código em inglês** (variáveis camelCase, componentes/tipos PascalCase, arquivos kebab-case); **UI em português do Brasil com acentos corretos** (UTF-8).
- **`noUncheckedIndexedAccess` ON** — todo acesso por índice/`find` pode ser `undefined`; guarde com `?`/`??`/`!` justificado.
- **Edge é Deno** — `supabase/functions/**` usa só Web APIs + imports relativos/`https://esm.sh`. **Não** tem teste Vitest; valida-se por smoke.
- **Fronteiras ESLint** — features acessam dados só via `@/providers/data`. Importar `@/providers/data/engine/aiCatalog` é permitido (não é `impl`/`contracts`/`factory`). Proibido importar `@/mocks`, `@/providers/data/impl/*`, `@/providers/data/factory`.
- **Sem migration** — `ai_settings.providers[]` é `jsonb`; campos novos em `IAiProviderConfig` viajam dentro dele.
- **Gate de CI prático:** `bun run test` + `bun run build`. `tsc` tem baseline ~315 erros pré-existentes — avalie **código novo por delta**, não o total.
- **Commits:** Conventional Commits em inglês; trailer obrigatório `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Escopo:** os 3 provedores suportados (anthropic, openai, openrouter). **Google fica de fora** (sem adaptador de geração ainda).
- **Preço:** OpenRouter vem da API; OpenAI/Anthropic vêm do mapa do catálogo; sem match → preço 0 + selo "preço a definir". Um modelo é "preço a definir" quando **ambos** os preços são 0.

---

### Task 1: Engine — tipo, mapa de preços e helpers puros de modelos

**Files:**
- Modify: `src/shared/types/ai.ts` (adicionar `modelsRefreshedAt?` em `IAiProviderConfig`)
- Modify: `src/providers/data/engine/aiCatalog.ts` (expandir `MODELS`; adicionar `priceForModel`, `isOpenAiChatModel`, `RawProviderModel`, `normalizeProviderModels`, `isModelPriceUndefined`, `modelsAreStaticSeed`)
- Test: `src/providers/data/engine/aiCatalog.test.ts` (estender)

**Interfaces:**
- Consumes: `MODELS`, `modelsFor` (já existem em `aiCatalog.ts`); `AiProviderId`, `IAiModelOption`, `ISO8601` de `@/shared/types`.
- Produces:
  - `IAiProviderConfig.modelsRefreshedAt?: ISO8601`
  - `priceForModel(provider: AiProviderId, id: string): { inputPricePer1kUsd: number; outputPricePer1kUsd: number } | null`
  - `isOpenAiChatModel(id: string): boolean`
  - `interface RawProviderModel { id: string; label: string; pricePromptPerToken?: number; priceCompletionPerToken?: number }`
  - `normalizeProviderModels(provider: AiProviderId, raw: RawProviderModel[]): IAiModelOption[]`
  - `isModelPriceUndefined(m: IAiModelOption): boolean`
  - `modelsAreStaticSeed(provider: AiProviderId, models: IAiModelOption[]): boolean`

- [ ] **Step 1: Adicionar `modelsRefreshedAt` ao tipo**

Em `src/shared/types/ai.ts`, no `interface IAiProviderConfig` (logo após `lastTestResult?`):

```ts
export interface IAiProviderConfig {
  provider: AiProviderId;
  enabled: boolean;
  defaultModel: string;
  models: IAiModelOption[];
  credentialsRef: string;
  status: AiProviderStatus;
  lastTestedAt?: ISO8601;
  lastTestResult?: "ok" | "error";
  /** When the model list was last fetched live from the provider. */
  modelsRefreshedAt?: ISO8601;
}
```

(`ISO8601` já é importado em `ai.ts` — confirme no topo do arquivo; é usado por `lastTestedAt`.)

- [ ] **Step 2: Escrever os testes que falham** (estender `aiCatalog.test.ts`)

Acrescente ao final do arquivo, dentro de um novo `describe`:

```ts
import {
  FEATURES,
  MODELS,
  buildDefaultAiSettings,
  modelsFor,
  priceForModel,
  isOpenAiChatModel,
  normalizeProviderModels,
  isModelPriceUndefined,
  modelsAreStaticSeed,
} from "./aiCatalog";

describe("aiCatalog — modelos dinâmicos", () => {
  it("priceForModel acha no mapa e devolve null para desconhecido", () => {
    expect(priceForModel("openai", "gpt-5.2")).not.toBeNull();
    expect(priceForModel("openai", "modelo-inexistente-xyz")).toBeNull();
  });

  it("isOpenAiChatModel inclui modelos de chat e exclui não-chat", () => {
    expect(isOpenAiChatModel("gpt-5.2")).toBe(true);
    expect(isOpenAiChatModel("o1-preview")).toBe(true);
    expect(isOpenAiChatModel("chatgpt-4o-latest")).toBe(true);
    expect(isOpenAiChatModel("text-embedding-3-large")).toBe(false);
    expect(isOpenAiChatModel("whisper-1")).toBe(false);
    expect(isOpenAiChatModel("dall-e-3")).toBe(false);
    expect(isOpenAiChatModel("gpt-4o-audio-preview")).toBe(false);
    expect(isOpenAiChatModel("omni-moderation-latest")).toBe(false);
  });

  it("normalizeProviderModels converte preço por-token do OpenRouter para por-1k", () => {
    const out = normalizeProviderModels("openrouter", [
      { id: "x/y", label: "X Y", pricePromptPerToken: 0.000003, priceCompletionPerToken: 0.000015 },
    ]);
    expect(out[0]!.inputPricePer1kUsd).toBeCloseTo(0.003, 9);
    expect(out[0]!.outputPricePer1kUsd).toBeCloseTo(0.015, 9);
  });

  it("normalizeProviderModels filtra não-chat do OpenAI e herda preço do mapa", () => {
    const out = normalizeProviderModels("openai", [
      { id: "gpt-5.2", label: "gpt-5.2" },
      { id: "text-embedding-3-large", label: "emb" },
      { id: "modelo-novo-sem-preco", label: "novo" },
    ]);
    const ids = out.map((m) => m.id);
    expect(ids).toContain("gpt-5.2");
    expect(ids).not.toContain("text-embedding-3-large");
    expect(out.find((m) => m.id === "gpt-5.2")!.inputPricePer1kUsd).toBeGreaterThan(0);
    const novo = out.find((m) => m.id === "modelo-novo-sem-preco")!;
    expect(isModelPriceUndefined(novo)).toBe(true);
  });

  it("normalizeProviderModels deduplica por id e usa id como label fallback", () => {
    const out = normalizeProviderModels("anthropic", [
      { id: "claude-opus-4-8", label: "" },
      { id: "claude-opus-4-8", label: "dup" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("claude-opus-4-8");
  });

  it("normalizeProviderModels ignora preço não-numérico (sem NaN)", () => {
    const out = normalizeProviderModels("openrouter", [
      { id: "a/b", label: "A", pricePromptPerToken: Number.NaN, priceCompletionPerToken: 0.00001 },
    ]);
    expect(Number.isNaN(out[0]!.inputPricePer1kUsd)).toBe(false);
    expect(isModelPriceUndefined(out[0]!)).toBe(true);
  });

  it("modelsAreStaticSeed: true para a semente, false após mudar", () => {
    expect(modelsAreStaticSeed("openai", modelsFor("openai"))).toBe(true);
    expect(
      modelsAreStaticSeed("openai", [
        ...modelsFor("openai"),
        { id: "extra", label: "extra", inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
      ]),
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar os testes e ver falhar**

Run: `bun run test src/providers/data/engine/aiCatalog.test.ts`
Expected: FAIL — `priceForModel`/`isOpenAiChatModel`/`normalizeProviderModels`/`isModelPriceUndefined`/`modelsAreStaticSeed` não existem.

- [ ] **Step 4: Expandir `MODELS` (OpenAI) e implementar os helpers**

Em `src/providers/data/engine/aiCatalog.ts`, no record `MODELS`, **acrescente** ao array `openai` (mantendo os dois existentes; preços USD/1k, best-effort):

```ts
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2", inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 },
    { id: "gpt-5-mini", label: "GPT-5 mini", inputPricePer1kUsd: 0.0006, outputPricePer1kUsd: 0.0024 },
    { id: "gpt-4o", label: "GPT-4o", inputPricePer1kUsd: 0.0025, outputPricePer1kUsd: 0.01 },
    { id: "gpt-4o-mini", label: "GPT-4o mini", inputPricePer1kUsd: 0.00015, outputPricePer1kUsd: 0.0006 },
  ],
```

Em seguida, **após** a função `modelsFor` (que já existe), adicione:

```ts
export function priceForModel(
  provider: AiProviderId,
  id: string,
): { inputPricePer1kUsd: number; outputPricePer1kUsd: number } | null {
  const m = MODELS[provider]?.find((x) => x.id === id);
  return m
    ? { inputPricePer1kUsd: m.inputPricePer1kUsd, outputPricePer1kUsd: m.outputPricePer1kUsd }
    : null;
}

const OPENAI_CHAT_PREFIXES = ["gpt", "o1", "o3", "o4", "chatgpt"];
const OPENAI_NON_CHAT =
  /embedding|whisper|tts|audio|realtime|image|dall-e|moderation|transcribe|search|computer-use|codex/;

/** Heuristic: keep OpenAI text-chat models, drop embeddings/audio/image/etc. */
export function isOpenAiChatModel(id: string): boolean {
  const low = id.toLowerCase();
  if (OPENAI_NON_CHAT.test(low)) return false;
  return OPENAI_CHAT_PREFIXES.some((p) => low.startsWith(p));
}

/** Raw model entry as returned by the Edge "list-models" action (front-side mirror). */
export interface RawProviderModel {
  id: string;
  label: string;
  /** OpenRouter only — USD per single token; multiplied by 1000 for per-1k. */
  pricePromptPerToken?: number;
  priceCompletionPerToken?: number;
}

/**
 * Turn the raw provider list into priced IAiModelOption[]:
 * - OpenAI: drop non-chat ids.
 * - OpenRouter (per-token price present & numeric): convert to per-1k.
 * - Otherwise: inherit price from the catalog map; unknown → 0/0 ("preço a definir").
 * Dedupes by id and sorts by label.
 */
export function normalizeProviderModels(
  provider: AiProviderId,
  raw: RawProviderModel[],
): IAiModelOption[] {
  const seen = new Set<string>();
  const out: IAiModelOption[] = [];
  for (const r of raw) {
    if (!r.id || seen.has(r.id)) continue;
    if (provider === "openai" && !isOpenAiChatModel(r.id)) continue;
    seen.add(r.id);

    let inputPricePer1kUsd = 0;
    let outputPricePer1kUsd = 0;
    if (
      typeof r.pricePromptPerToken === "number" &&
      Number.isFinite(r.pricePromptPerToken) &&
      typeof r.priceCompletionPerToken === "number" &&
      Number.isFinite(r.priceCompletionPerToken)
    ) {
      inputPricePer1kUsd = r.pricePromptPerToken * 1000;
      outputPricePer1kUsd = r.priceCompletionPerToken * 1000;
    } else {
      const mapped = priceForModel(provider, r.id);
      if (mapped) {
        inputPricePer1kUsd = mapped.inputPricePer1kUsd;
        outputPricePer1kUsd = mapped.outputPricePer1kUsd;
      }
    }
    out.push({ id: r.id, label: r.label || r.id, inputPricePer1kUsd, outputPricePer1kUsd });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/** A model with both prices at 0 is "preço a definir" (no known pricing). */
export function isModelPriceUndefined(m: IAiModelOption): boolean {
  return m.inputPricePer1kUsd === 0 && m.outputPricePer1kUsd === 0;
}

/** True when `models` is still exactly the static catalog seed for `provider`. */
export function modelsAreStaticSeed(provider: AiProviderId, models: IAiModelOption[]): boolean {
  const seedIds = modelsFor(provider)
    .map((m) => m.id)
    .sort();
  const curIds = models.map((m) => m.id).sort();
  return seedIds.length === curIds.length && seedIds.every((id, i) => id === curIds[i]);
}
```

- [ ] **Step 5: Rodar os testes e ver passar**

Run: `bun run test src/providers/data/engine/aiCatalog.test.ts`
Expected: PASS (incluindo o teste pré-existente que itera `MODELS` e exige preço `>0` e `<1` — os 2 modelos OpenAI novos respeitam a faixa).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/ai.ts src/providers/data/engine/aiCatalog.ts src/providers/data/engine/aiCatalog.test.ts
git commit -m "feat(ai): model catalog engine — price map, OpenAI chat filter, normalize"
```

---

### Task 2: Edge — adaptadores de listagem + ação `list-models`

**Files:**
- Create: `supabase/functions/_shared/ai/modelList.ts`
- Modify: `supabase/functions/ai-generate/index.ts`

**Interfaces:**
- Consumes: `createSecretResolver` (`../_shared/secrets.ts`), `HttpError`/`json` (`../_shared/http.ts`), `SUPPORTED`/`KEY_BY_PROVIDER` (já no `index.ts`).
- Produces: resposta HTTP `{ models: RawModel[] }` para `{ mode: "list-models", providerId }`, onde `RawModel = { id, label, pricePromptPerToken?, priceCompletionPerToken? }`.

> Sem teste Vitest (runtime Deno). Validação por smoke. O revisor confere as formas de resposta de cada API.

- [ ] **Step 1: Criar `supabase/functions/_shared/ai/modelList.ts`**

```ts
/**
 * Provider model-list adapters for ai-generate's "list-models" action.
 * Runtime: Deno, Web APIs only. Returns a RAW list (un-priced except OpenRouter);
 * the front (aiCatalog.normalizeProviderModels) applies the chat filter, the
 * OpenRouter per-token→per-1k conversion, and the price-map merge — all Vitest-tested.
 */

export interface RawModel {
  id: string;
  label: string;
  pricePromptPerToken?: number;
  priceCompletionPerToken?: number;
}

const ANTHROPIC_VERSION = "2023-06-01";

export async function listAnthropicModels(apiKey: string, signal: AbortSignal): Promise<RawModel[]> {
  const out: RawModel[] = [];
  let afterId: string | undefined;
  // The endpoint is paginated; follow up to 5 pages defensively.
  for (let page = 0; page < 5; page++) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const res = await fetch(url, {
      signal,
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      data?: Array<{ id?: string; display_name?: string }>;
      has_more?: boolean;
      last_id?: string;
    };
    for (const m of data.data ?? []) {
      if (m.id) out.push({ id: m.id, label: m.display_name ?? m.id });
    }
    if (!data.has_more || !data.last_id) break;
    afterId = data.last_id;
  }
  return out;
}

export async function listOpenAIModels(apiKey: string, signal: AbortSignal): Promise<RawModel[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  // No filtering here — the front decides what counts as a chat model (testable).
  return (data.data ?? []).flatMap((m) => (m.id ? [{ id: m.id, label: m.id }] : []));
}

export async function listOpenRouterModels(apiKey: string, signal: AbortSignal): Promise<RawModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string } }>;
  };
  return (data.data ?? []).flatMap((m) => {
    if (!m.id) return [];
    const prompt = Number(m.pricing?.prompt);
    const completion = Number(m.pricing?.completion);
    const priced = Number.isFinite(prompt) && Number.isFinite(completion);
    const base: RawModel = { id: m.id, label: m.name ?? m.id };
    return [priced ? { ...base, pricePromptPerToken: prompt, priceCompletionPerToken: completion } : base];
  });
}

export async function listModels(
  providerId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<RawModel[]> {
  if (providerId === "anthropic") return listAnthropicModels(apiKey, signal);
  if (providerId === "openai") return listOpenAIModels(apiKey, signal);
  return listOpenRouterModels(apiKey, signal);
}
```

- [ ] **Step 2: Importar `listModels` e adicionar o timeout no `index.ts`**

No topo de `supabase/functions/ai-generate/index.ts`, junto do import de adapters:

```ts
import { listModels } from "../_shared/ai/modelList.ts";
```

E junto das constantes (após `LLM_TIMEOUT_MS`):

```ts
const LIST_TIMEOUT_MS = 15_000;
```

- [ ] **Step 3: Tratar `mode: "list-models"` no handler**

No `index.ts`, altere a linha do `mode` para reconhecer a nova ação:

```ts
  const mode =
    body.mode === "test" ? "test" : body.mode === "list-models" ? "list-models" : "generate";
```

Logo **após** o bloco que valida `SUPPORTED` (o `if (!SUPPORTED.has(providerId)) { throw new HttpError(400, ...) }`) e **antes** do carregamento de `ai_settings`, insira:

```ts
  // list-models: thin proxy — fetch the provider's model list with the Vault key.
  // No settings/budget needed; the front prices + persists the result.
  if (mode === "list-models") {
    const resolveSecret = createSecretResolver(admin);
    const apiKey = await resolveSecret(KEY_BY_PROVIDER[providerId]!);
    if (!apiKey) throw new HttpError(400, "chave de API do provedor não configurada");
    const controller = AbortSignal.timeout(LIST_TIMEOUT_MS);
    try {
      const models = await listModels(providerId, apiKey, controller);
      return json({ models });
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "TimeoutError";
      const detail = err instanceof Error ? err.message : "erro";
      throw new HttpError(
        aborted ? 504 : 502,
        aborted ? "tempo de resposta do provedor esgotado" : `falha ao listar modelos: ${detail}`,
      );
    }
  }
```

(O `resolveSecret`/`apiKey` declarados aqui são block-scoped; não conflitam com os usados mais abaixo no fluxo `test`/`generate`, que retorna antes de chegar lá.)

- [ ] **Step 4: Type-check do código novo**

Run: `bunx tsc --noEmit` (ignore o baseline; confirme que **nenhum erro novo** aponta para `ai-generate/index.ts` ou `_shared/ai/modelList.ts`).
Run: `bun run build`
Expected: build verde.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/ai/modelList.ts supabase/functions/ai-generate/index.ts
git commit -m "feat(ai): ai-generate list-models action + provider model-list adapters"
```

---

### Task 3: Contrato + providers (`listProviderModels`)

**Files:**
- Modify: `src/providers/data/contracts/ai.ts` (novo método na interface)
- Modify: `src/providers/data/impl/mock/ai.ts` (impl mock)
- Modify: `src/providers/data/impl/supabase/ai.ts` (impl real)
- Create: `src/providers/data/impl/mock/ai.test.ts` (teste do mock)
- Test: `src/providers/data/impl/supabase/ai.test.ts` (estender — round-trip do campo novo)

**Interfaces:**
- Consumes: `normalizeProviderModels`, `RawProviderModel` (`@/providers/data/engine/aiCatalog`, da Task 1); `modelsFor` (mock); `IAiModelOption`, `AiProviderId` (`@/shared/types`).
- Produces: `IAiProvider.listProviderModels(providerId: AiProviderId): Promise<IAiModelOption[]>`.

- [ ] **Step 1: Escrever os testes que falham**

Crie `src/providers/data/impl/mock/ai.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockAiProvider } from "./ai";
import { modelsFor } from "@/providers/data/engine/aiCatalog";

describe("mockAiProvider.listProviderModels", () => {
  it("devolve o catálogo estático do provedor", async () => {
    const out = await mockAiProvider.listProviderModels("openai");
    expect(out.map((m) => m.id).sort()).toEqual(modelsFor("openai").map((m) => m.id).sort());
  });
});
```

Em `src/providers/data/impl/supabase/ai.test.ts`, acrescente um teste de round-trip do campo novo (use o estilo já presente no arquivo — `settingsToRow`/`rowToSettings` exportados):

```ts
it("settingsToRow/rowToSettings preserva modelsRefreshedAt nos providers", () => {
  const base = rowToSettings({
    id: 1,
    master_enabled: false,
    default_provider_id: "openai",
    budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 },
    providers: [
      {
        provider: "openai",
        enabled: true,
        defaultModel: "gpt-5.2",
        models: [{ id: "gpt-5.2", label: "GPT-5.2", inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 }],
        credentialsRef: "OPENAI_API_KEY",
        status: "configured",
        modelsRefreshedAt: "2026-06-17T10:00:00.000Z",
      },
    ],
    routing: [],
    updated_at: "2026-06-17T10:00:00.000Z",
    updated_by: null,
  });
  const row = settingsToRow(base, null);
  expect(row.providers[0]!.modelsRefreshedAt).toBe("2026-06-17T10:00:00.000Z");
});
```

(Confirme no topo de `ai.test.ts` que `rowToSettings` e `settingsToRow` estão importados de `./ai`; se não, adicione-os ao import.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun run test src/providers/data/impl`
Expected: FAIL — `mockAiProvider.listProviderModels` não existe.

- [ ] **Step 3: Adicionar o método ao contrato**

Em `src/providers/data/contracts/ai.ts`, adicione `IAiModelOption` ao import de tipos e o método à interface (após `runPlayground`):

```ts
import type {
  AiFeatureKey,
  AiProviderId,
  AiUsagePeriod,
  IAiBudget,
  IAiFeatureRouting,
  IAiModelOption,
  IAiPlaygroundInput,
  IAiPlaygroundResult,
  IAiProviderConfig,
  IAiSettings,
  IAiTestConnectionResult,
  IAiUsageEvent,
  IAiUsageSummary,
} from "@/shared/types";
```

```ts
  runPlayground(input: IAiPlaygroundInput): Promise<IAiPlaygroundResult>;
  /** Fetch the provider's model list live (mock: static catalog). */
  listProviderModels(providerId: AiProviderId): Promise<IAiModelOption[]>;
```

- [ ] **Step 4: Implementar no mock**

Em `src/providers/data/impl/mock/ai.ts`, dentro de `mockAiProvider` (após `runPlayground`):

```ts
  async listProviderModels(providerId) {
    await delay();
    return structuredClone(modelsFor(providerId));
  },
```

(`modelsFor` já é importado no arquivo.)

- [ ] **Step 5: Implementar no supabase**

Em `src/providers/data/impl/supabase/ai.ts`, ajuste os imports:

```ts
import {
  buildDefaultAiSettings,
  normalizeProviderModels,
  type RawProviderModel,
} from "@/providers/data/engine/aiCatalog";
```

e adicione `IAiModelOption` ao import de tipos de `@/shared/types`. Então, dentro de `supabaseAiProvider` (após `runPlayground`):

```ts
  async listProviderModels(providerId): Promise<IAiModelOption[]> {
    const { data, error } = await getSupabaseClient().functions.invoke("ai-generate", {
      body: { mode: "list-models", providerId },
    });
    if (error) throw new Error(await extractFunctionError(error));
    const raw = (data as { models?: RawProviderModel[] }).models ?? [];
    const models = normalizeProviderModels(providerId, raw);
    if (models.length === 0) {
      // Empty result (e.g. provider hiccup): keep the current list rather than wiping it.
      const cur = rowToSettings(await loadSettingsRow()).providers.find(
        (p) => p.provider === providerId,
      );
      return cur?.models ?? [];
    }
    // Persist so the Edge cost path (price from ai_settings) keeps working.
    // updateProviderConfig only patches models + timestamp → defaultModel is preserved as-is.
    await supabaseAiProvider.updateProviderConfig(providerId, {
      models,
      modelsRefreshedAt: new Date().toISOString(),
    });
    return models;
  },
```

- [ ] **Step 6: Rodar e ver passar**

Run: `bun run test src/providers/data/impl`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/providers/data/contracts/ai.ts src/providers/data/impl/mock/ai.ts src/providers/data/impl/mock/ai.test.ts src/providers/data/impl/supabase/ai.ts src/providers/data/impl/supabase/ai.test.ts
git commit -m "feat(ai): listProviderModels on IAiProvider (mock=catalog, supabase=edge+merge+persist)"
```

---

### Task 4: UI — `ModelSelect` adaptativo + botão "Atualizar modelos" no `ProviderCard`

**Files:**
- Create: `src/features/ai-settings/components/ModelSelect.tsx`
- Modify: `src/features/ai-settings/components/ProviderCard.tsx`

**Interfaces:**
- Consumes: `IAiProvider.listProviderModels` (Task 3); `isModelPriceUndefined`, `modelsAreStaticSeed` (Task 1); shadcn `Command`/`Popover`; `IAiModelOption`.
- Produces: `ModelSelect` (componente); `ProviderCard` com refresh + auto-fetch.

> Verificação desta task: a lógica testável (`isModelPriceUndefined`, `modelsAreStaticSeed`) já tem teste na Task 1. O componente é validado por `bun run build` + `bunx tsc --noEmit` (sem erro novo) + smoke manual (o dono testa a UI). Sem novo teste Vitest de componente, em linha com a convenção do projeto.

- [ ] **Step 1: Criar `ModelSelect.tsx`**

```tsx
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { isModelPriceUndefined } from "@/providers/data/engine/aiCatalog";
import type { IAiModelOption } from "@/shared/types";

const COMBOBOX_THRESHOLD = 20;

function priceLabel(m: IAiModelOption): string {
  return isModelPriceUndefined(m)
    ? "preço a definir"
    : `entrada $${m.inputPricePer1kUsd}/1k · saída $${m.outputPricePer1kUsd}/1k`;
}

export function ModelSelect({
  models,
  value,
  onChange,
  disabled,
}: {
  models: IAiModelOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (models.length <= COMBOBOX_THRESHOLD) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {priceLabel(m)}
          </option>
        ))}
      </select>
    );
  }

  const current = models.find((m) => m.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{current ? current.label : value || "Selecione o modelo"}</span>
          <Icon icon="mdi:unfold-more-horizontal" className="size-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar modelo…" />
          <CommandList>
            <CommandEmpty>Nenhum modelo encontrado.</CommandEmpty>
            <CommandGroup>
              {models.map((m) => (
                <CommandItem
                  key={m.id}
                  value={`${m.id} ${m.label}`}
                  onSelect={() => {
                    onChange(m.id);
                    setOpen(false);
                  }}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{m.label}</span>
                    <span className="text-xs text-muted-foreground">{priceLabel(m)}</span>
                  </div>
                  {m.id === value && <Icon icon="mdi:check" className="ml-auto size-4 shrink-0" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Reescrever o bloco "Modelo padrão" do `ProviderCard`**

Em `src/features/ai-settings/components/ProviderCard.tsx`:

(a) Ajuste os imports do topo:

```ts
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setIntegrationSecret } from "@/features/admin-settings/api/integrationSecrets";
import { AI_PROVIDER_LABELS, AI_SUPPORTED_PROVIDERS, type IAiProviderConfig } from "@/shared/types";
import { modelsAreStaticSeed } from "@/providers/data/engine/aiCatalog";
import { useAiProvider } from "@/providers/data";
import { ModelSelect } from "./ModelSelect";
```

(b) Dentro do componente, junto dos outros `useState`, adicione o estado de refresh e o guard de auto-busca:

```ts
  const [refreshing, setRefreshing] = useState(false);
  const didAutoFetch = useRef(false);

  const refreshModels = async (silent = false) => {
    setRefreshing(true);
    try {
      const list = await provider.listProviderModels(config.provider);
      if (!silent) toast.success(`${list.length} modelos encontrados.`);
      onChanged();
    } catch (e) {
      if (!silent) {
        toast.error(e instanceof Error ? `Falha ao listar modelos: ${e.message}` : "Falha ao listar modelos.");
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (didAutoFetch.current) return;
    if (!supported || !configured) return;
    if (config.modelsRefreshedAt) return;
    if (!modelsAreStaticSeed(config.provider, config.models)) return;
    didAutoFetch.current = true;
    void refreshModels(true); // silent first-time fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, configured, config.provider, config.modelsRefreshedAt]);
```

(`supported` e `configured` já existem no componente; `provider`, `onChanged` também.)

(c) Substitua o bloco atual do "Modelo padrão" (o `<div>` com `<label>Modelo padrão</label>` e o `<select>`) por:

```tsx
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs text-muted-foreground">Modelo padrão</label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs"
              disabled={!supported || !configured || refreshing}
              onClick={() => refreshModels(false)}
            >
              <Icon
                icon="mdi:refresh"
                className={`mr-1 size-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Atualizar modelos
            </Button>
          </div>
          <ModelSelect
            models={config.models}
            value={config.defaultModel}
            onChange={setModel}
            disabled={!supported}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {config.models.length} modelos
            {config.modelsRefreshedAt
              ? ` · atualizado ${new Date(config.modelsRefreshedAt).toLocaleString("pt-BR")}`
              : ""}
          </p>
        </div>
```

(`setModel` já existe no componente e chama `updateProviderConfig(..., { defaultModel })` + `onChanged`.)

- [ ] **Step 3: Type-check + build**

Run: `bunx tsc --noEmit` (confirme **nenhum erro novo** em `ProviderCard.tsx`/`ModelSelect.tsx`).
Run: `bun run build`
Expected: build verde.

- [ ] **Step 4: Rodar a suíte completa (sem regressão)**

Run: `bun run test`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-settings/components/ModelSelect.tsx src/features/ai-settings/components/ProviderCard.tsx
git commit -m "feat(ai): dynamic model picker — refresh button, auto-fetch, adaptive combobox"
```

---

### Task 5: Docs + release

**Files:**
- Modify: `docs/dev/ai-llm-integration.md` (seção de modelos dinâmicos)
- Modify: `CHANGELOG.md` (nova seção MINOR)
- Modify: `package.json` (bump 0.103.0 → 0.104.0)
- Modify: `CLAUDE.md` (codinome atual + lista de tags)

> O codinome (MINOR/MAJOR) é definido com o dono na etapa de finalização; use um placeholder visível `<<CODENAME>>` no rascunho e troque antes do commit final.

- [ ] **Step 1: Documentar no dev doc**

Em `docs/dev/ai-llm-integration.md`, na seção "Como adicionar um novo adaptador (resta: Google)", acrescente um parágrafo curto indicando que a lista de modelos agora é dinâmica e como funciona (Edge `list-models` → `normalizeProviderModels` → persiste em `ai_settings.providers[].models`; OpenRouter traz preço, OpenAI/Anthropic herdam do mapa `priceForModel`, desconhecido → "preço a definir"; botão "Atualizar modelos" + auto-busca única; combobox quando > 20 modelos).

- [ ] **Step 2: CHANGELOG**

Adicione, logo abaixo de `## [Unreleased]`:

```markdown
## [0.104.0] — <<CODENAME>> · 2026-06-17

**A lista de modelos de cada provedor de IA agora é dinâmica.** Em vez de dois modelos fixos, o card do provedor busca os modelos disponíveis ao vivo (Anthropic, OpenAI e OpenRouter) com a chave do Vault, via uma nova ação no Edge `ai-generate`. O preço vem da API (OpenRouter) ou de um mapa no catálogo (OpenAI/Anthropic); modelos sem preço conhecido ficam selecionáveis, marcados "preço a definir".

### Added

- **Ação `list-models` no Edge `ai-generate`** + adaptadores de listagem por provedor (`_shared/ai/modelList.ts`).
- **Botão "Atualizar modelos"** no `ProviderCard`, com auto-busca única no primeiro acesso e seletor com busca (combobox) quando a lista é grande (> 20 modelos).
- **`listProviderModels`** em `IAiProvider` (mock = catálogo estático; supabase = Edge + merge de preço + persistência).

### Changed

- **Lista de modelos dinâmica** — `normalizeProviderModels`/`priceForModel`/`isOpenAiChatModel` no `aiCatalog`; `IAiProviderConfig.modelsRefreshedAt` registra a última busca. Sem migration (`providers` é jsonb).
```

- [ ] **Step 3: Bump de versão**

Em `package.json`: `"version": "0.103.0"` → `"version": "0.104.0"`.

- [ ] **Step 4: CLAUDE.md**

Atualize a linha "atual: `Polyglot` — v0.103.0" para o novo codinome/versão e acrescente `, v0.104.0 <<CODENAME>>)` ao final da lista de tags.

- [ ] **Step 5: Commit**

```bash
git add docs/dev/ai-llm-integration.md CHANGELOG.md package.json CLAUDE.md
git commit -m "chore(release): v0.104.0 <<CODENAME>> — dynamic LLM model lists"
```

---

## Deploy (na finalização, após aprovação do dono)

1. **Redeploy do Edge** `ai-generate` (ação `list-models` nova): `npx supabase functions deploy ai-generate --project-ref njizaasajkdqptlxddqn`.
2. **Merge do front** na `main` (Vercel auto-deploy). Sem migration.
3. Ordem: Edge **antes** do front (o botão só funciona com o Edge novo no ar).
4. Smoke do dono: abrir um provedor configurado → "Atualizar modelos" → ver a lista crescer; checar "preço a definir" em modelos sem preço; conferir o combobox no OpenRouter.

## Self-Review (planner)

**Cobertura da spec:**
- §5.1 ação `list-models` → Task 2 ✅
- §5.2 adaptadores (Anthropic paginado / OpenAI cru / OpenRouter com preço) → Task 2 ✅ (filtro do OpenAI movido para o front por testabilidade — refinamento documentado; §5.3/§11 da spec pediam `isOpenAiChatModel` testável em Vitest, o que só é possível no front)
- §5.3 `isOpenAiChatModel` → Task 1 ✅
- §6 mapa de preços + merge → Task 1 (`priceForModel`, `normalizeProviderModels`) ✅
- §7 `listProviderModels` (mock + supabase) → Task 3 ✅
- §8 UI (botão, auto-busca, combobox > 20, "preço a definir", timestamp) → Task 4 ✅
- §9 erros (mantém lista, botão desabilitado) → Task 3 (empty-result) + Task 4 (toast/disabled) ✅
- §10 `modelsRefreshedAt` jsonb sem migration → Task 1 (tipo) + Task 3 (round-trip) ✅
- §11 testes → Tasks 1/3 ✅
- §12 deploy → seção Deploy ✅

**Placeholders:** apenas `<<CODENAME>>` na Task 5, intencional (decidido com o dono na finalização).

**Consistência de tipos:** `RawProviderModel` (front, Task 1) ≅ `RawModel` (Edge, Task 2) — mesma forma estrutural; o front faz o cast no `invoke`. `normalizeProviderModels(provider, raw)`, `priceForModel(provider, id)`, `isModelPriceUndefined(m)`, `modelsAreStaticSeed(provider, models)` usados com as mesmas assinaturas nas Tasks 3 e 4. `listProviderModels(providerId)` idêntico em contrato/mock/supabase.
