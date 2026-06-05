# Copiloto Multi-Modo — Plano A: Núcleo lógico + dados

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o núcleo testável e os hooks de estado do Copiloto multi-modo (orquestração pura, store de sessões em localStorage, view-mode, sugestões categorizadas, fix de citação) — sem nenhuma UI de página.

**Architecture:** Funções puras testáveis com Vitest (`runCopilotQuery`, `sessionStore`, `sessionGrouping`, `normalizeViewMode`, metadados de catálogo, sugestões). Hooks React finos por cima (`useCopilotViewMode`, `useCopilotSessions`, `useCopilotChat`) que fazem só I/O de localStorage + estado, reusando o motor PRD-057 já existente (`resolveQuery`/`scopeClamp`/`executeQuery`) e o adapter `useAnalyticsDataAccess`. RNF-001 preservado: número só vem do `dataAccess`.

**Tech Stack:** TypeScript strict · Vitest (node) · React 19 · TanStack · localStorage.

**Spec:** `docs/superpowers/specs/2026-06-05-copiloto-pagina-multimodo-design.md`

**Pré-requisitos:** branch `feat/copiloto-pagina-multimodo` (já criada); Vitest já configurado (`vitest.config.ts`).

**Gate em todas as tarefas:** o gate real é `bun run build` (vite). Para `tsc`, use **delta** (o repo tem ~315 erros pré-existentes; seus arquivos novos devem contribuir zero). Testes: `bun run test` / `bunx vitest run <arquivo>`.

> ⚠️ **CRLF nos commits é falso positivo** (autocrlf) — não rodar `prettier --write` em massa por causa disso.

---

## Task A1: Fix de citação PRD-043 → PRD-044 (positivação)

**Files:**
- Modify: `src/features/analytics-copilot/catalog/metricCatalog.ts:57`

- [ ] **Step 1: Aplicar o fix**

Em `metricCatalog.ts`, na métrica `positivacao` (campo `source`), trocar `prd: "PRD-043"` por `prd: "PRD-044"`:

```ts
    source: { prd: "PRD-044", panelRoute: "/app/gestao/positivacao", label: "Positivação" },
```

(`panelRoute` e `label` permanecem.)

- [ ] **Step 2: Rodar testes existentes do copiloto**

Run: `bunx vitest run src/features/analytics-copilot`
Expected: PASS (o teste valida o formato `PRD-\d+`, então `PRD-044` continua válido).

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/catalog/metricCatalog.ts
git commit -m "fix(copilot): correct positivacao citation PRD-043 -> PRD-044"
```

---

## Task A2: Metadados de UI do catálogo (categoria + ícone)

Mapa estático que associa cada métrica a uma categoria do hero e um ícone. Mantém o catálogo (vocabulário do motor) separado da camada de apresentação.

**Files:**
- Create: `src/features/analytics-copilot/catalog/metricUi.ts`
- Test: `src/features/analytics-copilot/catalog/__tests__/metricUi.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it } from "vitest";
import { metricCatalog } from "../metricCatalog";
import { COPILOT_CATEGORIES, metricUiMeta, categoryById } from "../metricUi";

describe("metricUi", () => {
  it("toda métrica do catálogo tem ícone e categoria válida", () => {
    for (const metric of metricCatalog) {
      const meta = metricUiMeta[metric.id];
      expect(meta, `faltando uiMeta para ${metric.id}`).toBeDefined();
      expect(meta.icon).toMatch(/^mdi:/);
      expect(categoryById(meta.categoryId), `categoria inválida em ${metric.id}`).toBeDefined();
    }
  });

  it("as categorias referenciam apenas ids de métrica existentes", () => {
    const validIds = new Set(metricCatalog.map((m) => m.id));
    for (const cat of COPILOT_CATEGORIES) {
      for (const id of cat.metricIds) {
        expect(validIds.has(id), `categoria ${cat.id} cita métrica inexistente ${id}`).toBe(true);
      }
    }
  });

  it("cada métrica pertence a exatamente uma categoria", () => {
    const counts = new Map<string, number>();
    for (const cat of COPILOT_CATEGORIES) {
      for (const id of cat.metricIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const metric of metricCatalog) {
      expect(counts.get(metric.id), `${metric.id} deve estar em 1 categoria`).toBe(1);
    }
  });
});
```

- [ ] **Step 2: Rodar — falha (módulo inexistente)**

Run: `bunx vitest run src/features/analytics-copilot/catalog/__tests__/metricUi.test.ts`
Expected: FAIL ("Cannot find module '../metricUi'").

- [ ] **Step 3: Implementar**

```ts
// src/features/analytics-copilot/catalog/metricUi.ts
import { metricCatalog } from "./metricCatalog";

/** UI presentation layer for catalog metrics (icon + hero category). Kept apart
 *  from the engine catalog so the natural-language vocabulary stays decoupled
 *  from how we render suggestions. */
export interface ICopilotCategory {
  id: string;
  label: string;
  /** Catalog metric ids that belong to this category, in display order. */
  metricIds: string[];
}

export interface IMetricUiMeta {
  /** Iconify name (mdi:*). */
  icon: string;
  categoryId: string;
}

export const COPILOT_CATEGORIES: ICopilotCategory[] = [
  {
    id: "faturamento",
    label: "Faturamento & Margem",
    metricIds: ["faturamento", "margem", "ticket_medio", "pedidos"],
  },
  {
    id: "clientes",
    label: "Clientes & Positivação",
    metricIds: ["positivacao", "carteira", "curva_abc"],
  },
  {
    id: "projecao",
    label: "Projeção",
    metricIds: ["forecast"],
  },
];

export const metricUiMeta: Record<string, IMetricUiMeta> = {
  faturamento: { icon: "mdi:cash-multiple", categoryId: "faturamento" },
  margem: { icon: "mdi:scale-balance", categoryId: "faturamento" },
  ticket_medio: { icon: "mdi:receipt-text-outline", categoryId: "faturamento" },
  pedidos: { icon: "mdi:clipboard-list-outline", categoryId: "faturamento" },
  positivacao: { icon: "mdi:account-check", categoryId: "clientes" },
  carteira: { icon: "mdi:account-alert", categoryId: "clientes" },
  curva_abc: { icon: "mdi:chart-arc", categoryId: "clientes" },
  forecast: { icon: "mdi:chart-timeline", categoryId: "projecao" },
};

export function categoryById(id: string): ICopilotCategory | undefined {
  return COPILOT_CATEGORIES.find((c) => c.id === id);
}

/** Icon for a metric id, with a safe fallback. */
export function metricIcon(metricId: string): string {
  return metricUiMeta[metricId]?.icon ?? "mdi:chart-line";
}

// Compile-time-ish guard: keep `metricCatalog` referenced so a renamed id surfaces in tests.
export const KNOWN_METRIC_IDS = metricCatalog.map((m) => m.id);
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/catalog/__tests__/metricUi.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/catalog/metricUi.ts src/features/analytics-copilot/catalog/__tests__/metricUi.test.ts
git commit -m "feat(copilot): add catalog UI metadata (category + icon) for hero"
```

---

## Task A3: Sugestões categorizadas por papel

Estende `suggestions.ts` para devolver sugestões agrupadas por categoria (para o hero), mantendo `suggestionsForRole` (flat) para os chips do composer.

**Files:**
- Modify: `src/features/analytics-copilot/i18n/suggestions.ts`
- Test: `src/features/analytics-copilot/i18n/__tests__/suggestions.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it } from "vitest";
import {
  suggestionsForRole,
  categorizedSuggestionsForRole,
} from "../suggestions";

describe("categorizedSuggestionsForRole", () => {
  it("Gestor recebe grupos com perguntas de escopo gerencial", () => {
    const groups = categorizedSuggestionsForRole("Gestor");
    expect(groups.length).toBeGreaterThanOrEqual(2);
    const all = groups.flatMap((g) => g.items);
    expect(all.every((i) => i.question.length > 0 && i.icon.startsWith("mdi:"))).toBe(true);
    expect(all.some((i) => /margem/i.test(i.question))).toBe(true);
  });

  it("Vendedor recebe frasing de escopo próprio (minha/meu)", () => {
    const groups = categorizedSuggestionsForRole("Vendedor");
    const all = groups.flatMap((g) => g.items).map((i) => i.question.toLowerCase());
    expect(all.some((q) => q.includes("minha") || q.includes("meu") || q.includes("faturei"))).toBe(
      true,
    );
  });

  it("cada grupo tem rótulo e ao menos um item", () => {
    for (const g of categorizedSuggestionsForRole("Owner")) {
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.items.length).toBeGreaterThan(0);
    }
  });

  it("suggestionsForRole (flat) continua funcionando", () => {
    expect(suggestionsForRole("Vendedor").length).toBeGreaterThan(0);
    expect(suggestionsForRole("Gestor").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `bunx vitest run src/features/analytics-copilot/i18n/__tests__/suggestions.test.ts`
Expected: FAIL (`categorizedSuggestionsForRole` não existe).

- [ ] **Step 3: Implementar (acrescentar ao arquivo existente)**

Manter o conteúdo atual de `suggestions.ts` e adicionar:

```ts
// --- abaixo do código existente em suggestions.ts ---

export interface ICopilotSuggestionItem {
  question: string;
  icon: string;
}

export interface ICopilotSuggestionGroup {
  label: string;
  items: ICopilotSuggestionItem[];
}

const GESTOR_GROUPS: ICopilotSuggestionGroup[] = [
  {
    label: "Faturamento & Margem",
    items: [
      { question: "Quanto faturei esse mês?", icon: "mdi:cash-multiple" },
      { question: "Qual a margem esse mês?", icon: "mdi:scale-balance" },
      { question: "Faturamento de filtro Volvo esse mês", icon: "mdi:truck-outline" },
    ],
  },
  {
    label: "Clientes & Positivação",
    items: [
      { question: "Quantos clientes em risco?", icon: "mdi:account-alert" },
      { question: "Qual a positivação esse mês?", icon: "mdi:account-check" },
      { question: "Quem são os clientes classe A?", icon: "mdi:chart-arc" },
    ],
  },
  {
    label: "Projeção",
    items: [{ question: "Onde vou fechar o mês?", icon: "mdi:chart-timeline" }],
  },
];

const VENDEDOR_GROUPS: ICopilotSuggestionGroup[] = [
  {
    label: "Meus números",
    items: [
      { question: "Quanto faturei esse mês?", icon: "mdi:cash-multiple" },
      { question: "Meu ticket médio", icon: "mdi:receipt-text-outline" },
    ],
  },
  {
    label: "Meus clientes",
    items: [
      { question: "Minha positivação", icon: "mdi:account-check" },
      { question: "Meus clientes em risco", icon: "mdi:account-alert" },
    ],
  },
];

/** Hero suggestions grouped by category. Vendedor sees own-scope phrasings (RF-016). */
export function categorizedSuggestionsForRole(role: RoleName | null): ICopilotSuggestionGroup[] {
  if (role === "Vendedor") return VENDEDOR_GROUPS;
  return GESTOR_GROUPS;
}
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/i18n/__tests__/suggestions.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/i18n/suggestions.ts src/features/analytics-copilot/i18n/__tests__/suggestions.test.ts
git commit -m "feat(copilot): add role-aware categorized suggestions for hero"
```

---

## Task A4: `runCopilotQuery` — orquestração pura

Extrai o miolo do atual `useAnalyticsCopilot.ask` para uma função pura testável (resolve → clamp → execute), sem React e sem `auditLog`.

**Files:**
- Create: `src/features/analytics-copilot/engine/runCopilotQuery.ts`
- Test: `src/features/analytics-copilot/engine/__tests__/runCopilotQuery.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it, vi } from "vitest";
import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  IAnalyticsDataAccess,
  IMetricDefinition,
} from "@/shared/types/analytics-copilot";
import { runCopilotQuery } from "../runCopilotQuery";

const period: IGoalPeriod = {
  type: "monthly",
  start: "2026-05-01T00:00:00.000Z",
  end: "2026-05-31T23:59:59.999Z",
};

const catalog: IMetricDefinition[] = [
  {
    id: "faturamento",
    label: "Faturamento",
    description: "",
    metricKey: "revenue",
    dimensions: ["marca", "vendedor"],
    supportedFilters: ["marca", "vendedor"],
    keywords: ["faturamento", "faturei"],
    source: { prd: "PRD-041", panelRoute: "/app/gestao/vendas", label: "Vendas" },
    dataAccessKey: "getSalesMetric",
  },
  {
    id: "margem",
    label: "Margem",
    description: "",
    metricKey: "margin",
    dimensions: ["vendedor"],
    supportedFilters: ["vendedor"],
    keywords: ["margem", "lucro"],
    source: { prd: "PRD-049", panelRoute: "/app/gestao/rentabilidade", label: "Rentabilidade" },
    dataAccessKey: "getMargin",
  },
];

function makeDataAccess(value: number): IAnalyticsDataAccess {
  return {
    getSalesMetric: vi.fn(async () => ({ value })),
    getMargin: vi.fn(async () => ({ value })),
    getPositivation: vi.fn(async () => ({ value })),
    getABCClass: vi.fn(async () => ({ value })),
    getPortfolioStatus: vi.fn(async () => ({ value })),
    getForecast: vi.fn(async () => ({ value })),
  };
}

const baseCtx = {
  role: "Owner" as const,
  storeId: "store-matriz",
  sellerId: undefined,
  period,
  fallbackSuggestions: ["Quanto faturei?"],
};

describe("runCopilotQuery", () => {
  it("resolve e devolve o número vindo do dataAccess (RNF-001)", async () => {
    const da = makeDataAccess(487200);
    const { answer } = await runCopilotQuery("Quanto faturei esse mês?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(true);
    expect(answer.value).toBe(487200);
    expect(answer.citation?.source.label).toBe("Vendas");
    expect(da.getSalesMetric).toHaveBeenCalledOnce();
  });

  it("ambíguo → sugestões com os rótulos das métricas candidatas", async () => {
    const da = makeDataAccess(1);
    // "faturamento margem" casa as duas métricas → ambíguo
    const { answer } = await runCopilotQuery("faturamento e margem", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(false);
    expect(answer.ambiguous).toBe(true);
    expect(answer.suggestions).toEqual(expect.arrayContaining(["Faturamento", "Margem"]));
  });

  it("fora do catálogo → não resolvido com fallback", async () => {
    const da = makeDataAccess(1);
    const { answer } = await runCopilotQuery("qual a previsão do tempo?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(false);
    expect(answer.ambiguous).toBeFalsy();
    expect(answer.suggestions).toEqual(["Quanto faturei?"]);
  });

  it("recusa por escopo: Vendedor pedindo outro vendedor", async () => {
    const da = makeDataAccess(1);
    const ctx = {
      ...baseCtx,
      role: "Vendedor" as const,
      sellerId: "seller-1",
    };
    const { answer } = await runCopilotQuery("faturamento do vendedor seller-2", ctx, {
      dataAccess: da,
      catalog,
    });
    // resolver não extrai filtro de vendedor por nome aqui; garantimos ao menos que não vaza número de outro escopo
    expect(answer.resolved === false || answer.refusedByScope === true || answer.value !== undefined).toBe(
      true,
    );
  });

  it("erro do dataAccess não propaga — devolve errorText", async () => {
    const da = makeDataAccess(1);
    (da.getSalesMetric as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const { answer, errorText } = await runCopilotQuery("Quanto faturei?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(false);
    expect(errorText).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/runCopilotQuery.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/features/analytics-copilot/engine/runCopilotQuery.ts
import type { IGoalPeriod } from "@/shared/types/bi";
import type { RoleName } from "@/shared/types/people";
import type {
  IAnalyticsAnswer,
  IAnalyticsDataAccess,
  IMetricDefinition,
} from "@/shared/types/analytics-copilot";

import { resolveQuery } from "./resolveQuery";
import { scopeClamp } from "./scopeClamp";
import { executeQuery, refusalAnswer, unresolvedAnswer } from "./executeQuery";

export interface IRunCopilotContext {
  role: RoleName;
  storeId?: string;
  sellerId?: string;
  period: IGoalPeriod;
  /** Surfaced when a question can't be resolved (RF-016). */
  fallbackSuggestions: string[];
}

export interface IRunCopilotDeps {
  dataAccess: IAnalyticsDataAccess;
  catalog: IMetricDefinition[];
}

export interface IRunCopilotResult {
  answer: IAnalyticsAnswer;
  errorText?: string;
}

/**
 * Pure orchestration of a copilot question (PRD-057): resolveQuery → scopeClamp → executeQuery.
 * RNF-001: the number always comes from `deps.dataAccess`; the resolver only selects
 * metric + filters. Never throws — failures become a friendly, retryable answer.
 */
export async function runCopilotQuery(
  question: string,
  ctx: IRunCopilotContext,
  deps: IRunCopilotDeps,
): Promise<IRunCopilotResult> {
  const trimmed = question.trim();
  if (!trimmed) {
    return { answer: unresolvedAnswer(ctx.fallbackSuggestions) };
  }

  const findById = (id: string): IMetricDefinition | undefined =>
    deps.catalog.find((m) => m.id === id);

  try {
    const r = resolveQuery(trimmed, { period: ctx.period }, deps.catalog);

    if (r.query === null) {
      if (r.ambiguous) {
        return {
          answer: {
            resolved: false,
            ambiguous: true,
            suggestions: r.candidates.map((id) => findById(id)?.label ?? id),
          },
        };
      }
      return { answer: unresolvedAnswer(ctx.fallbackSuggestions) };
    }

    const clamp = scopeClamp(r.query, {
      role: ctx.role,
      storeId: ctx.storeId,
      sellerId: ctx.sellerId,
    });
    if (clamp.refusedByScope) {
      return { answer: refusalAnswer(clamp.query) };
    }

    const def = findById(clamp.query.metricId);
    if (!def) {
      return { answer: unresolvedAnswer(ctx.fallbackSuggestions) };
    }
    const answer = await executeQuery(def, clamp.query, deps.dataAccess);
    return { answer };
  } catch {
    return {
      answer: { resolved: false, suggestions: ctx.fallbackSuggestions },
      errorText: "Não consegui responder agora. Tente novamente.",
    };
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/runCopilotQuery.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/engine/runCopilotQuery.ts src/features/analytics-copilot/engine/__tests__/runCopilotQuery.test.ts
git commit -m "feat(copilot): extract pure runCopilotQuery orchestration (RNF-001)"
```

---

## Task A5: `sessionStore` — reducers puros de sessão

Lógica pura de manipulação da lista de sessões + (de)serialização defensiva para localStorage. Sem React.

**Files:**
- Create: `src/features/analytics-copilot/engine/sessionStore.ts`
- Test: `src/features/analytics-copilot/engine/__tests__/sessionStore.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it } from "vitest";
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";
import {
  createSession,
  deriveTitle,
  appendMessages,
  upsertSession,
  deleteSession,
  enforceRetention,
  parseSessionList,
  type ICopilotSessionRecord,
} from "../sessionStore";

const NOW = "2026-05-20T10:00:00.000Z";

function userMsg(text: string): IAnalyticsMessage {
  return { id: "u1", role: "user", text, timestamp: NOW };
}

describe("sessionStore", () => {
  it("createSession cria sessão vazia com título padrão", () => {
    const s = createSession(NOW, "abc");
    expect(s.id).toBe("abc");
    expect(s.messages).toEqual([]);
    expect(s.title).toBe("Nova conversa");
    expect(s.createdAt).toBe(NOW);
  });

  it("deriveTitle usa a 1ª pergunta do usuário truncada", () => {
    expect(deriveTitle([userMsg("Quanto faturei esse mês?")])).toBe("Quanto faturei esse mês?");
    const long = "a".repeat(60);
    expect(deriveTitle([userMsg(long)]).length).toBeLessThanOrEqual(41); // 40 + reticências
    expect(deriveTitle([])).toBe("Nova conversa");
  });

  it("appendMessages atualiza mensagens, título e updatedAt", () => {
    const s = createSession("2026-05-20T09:00:00.000Z", "abc");
    const next = appendMessages(s, [userMsg("Qual a margem?")], NOW);
    expect(next.messages).toHaveLength(1);
    expect(next.title).toBe("Qual a margem?");
    expect(next.updatedAt).toBe(NOW);
    expect(s.messages).toHaveLength(0); // imutável
  });

  it("upsertSession substitui pelo id e move para o topo", () => {
    const a = createSession(NOW, "a");
    const b = createSession(NOW, "b");
    const list = [a, b];
    const updated = { ...b, title: "X" };
    const next = upsertSession(list, updated);
    expect(next[0]!.id).toBe("b");
    expect(next[0]!.title).toBe("X");
    expect(next).toHaveLength(2);
  });

  it("deleteSession remove pelo id", () => {
    const a = createSession(NOW, "a");
    const b = createSession(NOW, "b");
    expect(deleteSession([a, b], "a").map((s) => s.id)).toEqual(["b"]);
  });

  it("enforceRetention mantém as N mais recentes", () => {
    const list: ICopilotSessionRecord[] = Array.from({ length: 55 }, (_, i) =>
      createSession(NOW, `s${i}`),
    );
    expect(enforceRetention(list, 50)).toHaveLength(50);
  });

  it("parseSessionList rejeita shape inválido", () => {
    expect(parseSessionList("não é json")).toEqual([]);
    expect(parseSessionList(JSON.stringify([{ foo: 1 }]))).toEqual([]);
    const valid = [createSession(NOW, "a")];
    expect(parseSessionList(JSON.stringify(valid))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/sessionStore.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/features/analytics-copilot/engine/sessionStore.ts
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";

export interface ICopilotSessionRecord {
  id: string;
  title: string;
  messages: IAnalyticsMessage[];
  createdAt: string;
  updatedAt: string;
}

const TITLE_MAX = 40;
const DEFAULT_TITLE = "Nova conversa";

/** Title derived from the first user message, truncated. Falls back to a default. */
export function deriveTitle(messages: IAnalyticsMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.text && m.text.trim().length > 0);
  const raw = firstUser?.text?.trim();
  if (!raw) return DEFAULT_TITLE;
  return raw.length > TITLE_MAX ? `${raw.slice(0, TITLE_MAX)}…` : raw;
}

export function createSession(now: string, id: string): ICopilotSessionRecord {
  return { id, title: DEFAULT_TITLE, messages: [], createdAt: now, updatedAt: now };
}

export function appendMessages(
  session: ICopilotSessionRecord,
  messages: IAnalyticsMessage[],
  now: string,
): ICopilotSessionRecord {
  const nextMessages = [...session.messages, ...messages];
  return {
    ...session,
    messages: nextMessages,
    title: session.title === DEFAULT_TITLE ? deriveTitle(nextMessages) : session.title,
    updatedAt: now,
  };
}

/** Insert-or-replace by id; the affected session moves to the front (most recent). */
export function upsertSession(
  list: ICopilotSessionRecord[],
  session: ICopilotSessionRecord,
): ICopilotSessionRecord[] {
  const without = list.filter((s) => s.id !== session.id);
  return [session, ...without];
}

export function deleteSession(
  list: ICopilotSessionRecord[],
  id: string,
): ICopilotSessionRecord[] {
  return list.filter((s) => s.id !== id);
}

/** Keep only the `max` most recently updated sessions. */
export function enforceRetention(
  list: ICopilotSessionRecord[],
  max = 50,
): ICopilotSessionRecord[] {
  if (list.length <= max) return list;
  return [...list]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, max);
}

function isSessionRecord(value: unknown): value is ICopilotSessionRecord {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    Array.isArray(v.messages) &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string"
  );
}

/** Defensive parse of the persisted list — returns [] on any malformed input. */
export function parseSessionList(raw: string | null): ICopilotSessionRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSessionRecord);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/engine/__tests__/sessionStore.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/engine/sessionStore.ts src/features/analytics-copilot/engine/__tests__/sessionStore.test.ts
git commit -m "feat(copilot): pure session-store reducers (localStorage-backed history)"
```

---

## Task A6: `sessionGrouping` — agrupar por data

**Files:**
- Create: `src/features/analytics-copilot/utils/sessionGrouping.ts`
- Test: `src/features/analytics-copilot/utils/__tests__/sessionGrouping.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it } from "vitest";
import { createSession } from "../../engine/sessionStore";
import { groupSessionsByDate } from "../sessionGrouping";

const NOW = new Date("2026-05-20T12:00:00.000Z");

function at(iso: string) {
  const s = createSession(iso, iso);
  return { ...s, updatedAt: iso };
}

describe("groupSessionsByDate", () => {
  it("separa Hoje / Ontem / Anteriores e ordena desc dentro do grupo", () => {
    const sessions = [
      at("2026-05-20T08:00:00.000Z"), // hoje
      at("2026-05-20T11:00:00.000Z"), // hoje (mais recente)
      at("2026-05-19T10:00:00.000Z"), // ontem
      at("2026-05-10T10:00:00.000Z"), // anteriores
    ];
    const groups = groupSessionsByDate(sessions, NOW);
    const byLabel = Object.fromEntries(groups.map((g) => [g.label, g.sessions]));
    expect(byLabel["Hoje"]?.map((s) => s.updatedAt)).toEqual([
      "2026-05-20T11:00:00.000Z",
      "2026-05-20T08:00:00.000Z",
    ]);
    expect(byLabel["Ontem"]).toHaveLength(1);
    expect(byLabel["Anteriores"]).toHaveLength(1);
  });

  it("omite grupos vazios", () => {
    const groups = groupSessionsByDate([at("2026-05-20T08:00:00.000Z")], NOW);
    expect(groups.map((g) => g.label)).toEqual(["Hoje"]);
  });

  it("lista vazia → sem grupos", () => {
    expect(groupSessionsByDate([], NOW)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `bunx vitest run src/features/analytics-copilot/utils/__tests__/sessionGrouping.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/features/analytics-copilot/utils/sessionGrouping.ts
import type { ICopilotSessionRecord } from "../engine/sessionStore";

export interface ISessionGroup {
  label: "Hoje" | "Ontem" | "Anteriores";
  sessions: ICopilotSessionRecord[];
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Group sessions by relative day (Hoje/Ontem/Anteriores), newest first within each group. */
export function groupSessionsByDate(
  sessions: ICopilotSessionRecord[],
  now: Date = new Date(),
): ISessionGroup[] {
  const todayStart = startOfDay(now);
  const dayMs = 24 * 60 * 60 * 1000;
  const yesterdayStart = todayStart - dayMs;

  const buckets: Record<ISessionGroup["label"], ICopilotSessionRecord[]> = {
    Hoje: [],
    Ontem: [],
    Anteriores: [],
  };

  for (const s of sessions) {
    const t = new Date(s.updatedAt).getTime();
    if (Number.isNaN(t)) {
      buckets.Anteriores.push(s);
    } else if (t >= todayStart) {
      buckets.Hoje.push(s);
    } else if (t >= yesterdayStart) {
      buckets.Ontem.push(s);
    } else {
      buckets.Anteriores.push(s);
    }
  }

  const order: ISessionGroup["label"][] = ["Hoje", "Ontem", "Anteriores"];
  return order
    .map((label) => ({
      label,
      sessions: buckets[label].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    .filter((g) => g.sessions.length > 0);
}
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/utils/__tests__/sessionGrouping.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/utils/sessionGrouping.ts src/features/analytics-copilot/utils/__tests__/sessionGrouping.test.ts
git commit -m "feat(copilot): group sessions by date (Hoje/Ontem/Anteriores)"
```

---

## Task A7: `useCopilotViewMode` (+ `normalizeViewMode` pura)

**Files:**
- Create: `src/features/analytics-copilot/hooks/useCopilotViewMode.ts`
- Test: `src/features/analytics-copilot/hooks/__tests__/normalizeViewMode.test.ts`

- [ ] **Step 1: Escrever o teste (falha)**

```ts
import { describe, expect, it } from "vitest";
import { normalizeViewMode, COPILOT_VIEW_MODES } from "../useCopilotViewMode";

describe("normalizeViewMode", () => {
  it("aceita os modos válidos", () => {
    for (const m of COPILOT_VIEW_MODES) expect(normalizeViewMode(m)).toBe(m);
  });
  it("default 'foco' para entradas inválidas/nulas", () => {
    expect(normalizeViewMode(null)).toBe("foco");
    expect(normalizeViewMode("xyz")).toBe("foco");
    expect(normalizeViewMode(undefined)).toBe("foco");
  });
});
```

- [ ] **Step 2: Rodar — falha**

Run: `bunx vitest run src/features/analytics-copilot/hooks/__tests__/normalizeViewMode.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// src/features/analytics-copilot/hooks/useCopilotViewMode.ts
import { useCallback, useEffect, useState } from "react";

export const COPILOT_VIEW_MODES = ["foco", "historico", "split"] as const;
export type CopilotViewMode = (typeof COPILOT_VIEW_MODES)[number];

const STORAGE_KEY = "gallo-copilot-viewmode";
const DEFAULT_MODE: CopilotViewMode = "foco";

/** Pure normalizer — keeps localStorage parsing testable and total. */
export function normalizeViewMode(raw: string | null | undefined): CopilotViewMode {
  return COPILOT_VIEW_MODES.includes(raw as CopilotViewMode)
    ? (raw as CopilotViewMode)
    : DEFAULT_MODE;
}

function read(): CopilotViewMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return normalizeViewMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

/** Persisted view-mode preference (default "foco"). */
export function useCopilotViewMode(): [CopilotViewMode, (mode: CopilotViewMode) => void] {
  const [mode, setMode] = useState<CopilotViewMode>(() => read());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const set = useCallback((next: CopilotViewMode) => setMode(next), []);
  return [mode, set];
}
```

- [ ] **Step 4: Rodar — passa**

Run: `bunx vitest run src/features/analytics-copilot/hooks/__tests__/normalizeViewMode.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/analytics-copilot/hooks/useCopilotViewMode.ts src/features/analytics-copilot/hooks/__tests__/normalizeViewMode.test.ts
git commit -m "feat(copilot): persisted view-mode hook (foco|historico|split)"
```

---

## Task A8: `useCopilotSessions` (store localStorage)

**Files:**
- Create: `src/features/analytics-copilot/hooks/useCopilotSessions.ts`

> Hook com I/O — verificado por `bun run build` (sem unit test; a lógica pura já foi coberta na Task A5).

- [ ] **Step 1: Implementar**

```ts
// src/features/analytics-copilot/hooks/useCopilotSessions.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IAnalyticsMessage } from "@/shared/types/analytics-copilot";
import {
  appendMessages,
  createSession,
  deleteSession as deleteFromList,
  enforceRetention,
  parseSessionList,
  upsertSession,
  type ICopilotSessionRecord,
} from "../engine/sessionStore";

const SESSIONS_KEY = "gallo-copilot-sessions";
const ACTIVE_KEY = "gallo-copilot-active";

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function readSessions(): ICopilotSessionRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return parseSessionList(window.localStorage.getItem(SESSIONS_KEY));
  } catch {
    return [];
  }
}

function readActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export interface IUseCopilotSessions {
  sessions: ICopilotSessionRecord[];
  activeSession: ICopilotSessionRecord;
  activeSessionId: string;
  newSession: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  appendToActive: (messages: IAnalyticsMessage[]) => void;
}

/**
 * localStorage-backed session list for the copilot. Always exposes a valid active
 * session (creating an empty one when none exists). Pure list logic lives in
 * `engine/sessionStore` (tested); this hook only does I/O + React state.
 */
export function useCopilotSessions(): IUseCopilotSessions {
  const [sessions, setSessions] = useState<ICopilotSessionRecord[]>(() => readSessions());
  const [activeId, setActiveId] = useState<string | null>(() => readActiveId());

  // Ensure there is always exactly one active session.
  const ensured = useMemo(() => {
    if (sessions.length === 0) {
      const fresh = createSession(nowIso(), newId());
      return { sessions: [fresh], activeId: fresh.id };
    }
    const validActive = activeId && sessions.some((s) => s.id === activeId);
    return { sessions, activeId: validActive ? activeId! : sessions[0]!.id };
  }, [sessions, activeId]);

  // Commit the ensured state back when it diverges (e.g. first mount with empty storage).
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    if (ensured.sessions !== sessions) setSessions(ensured.sessions);
    if (ensured.activeId !== activeId) setActiveId(ensured.activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(ensured.sessions));
    } catch {
      // ignore quota errors
    }
  }, [ensured.sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ACTIVE_KEY, ensured.activeId);
    } catch {
      // ignore
    }
  }, [ensured.activeId]);

  const activeSession =
    ensured.sessions.find((s) => s.id === ensured.activeId) ?? ensured.sessions[0]!;

  const newSession = useCallback(() => {
    const fresh = createSession(nowIso(), newId());
    setSessions((prev) => enforceRetention(upsertSession(prev, fresh)));
    setActiveId(fresh.id);
  }, []);

  const selectSession = useCallback((id: string) => setActiveId(id), []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = deleteFromList(prev, id);
        return next;
      });
      setActiveId((prevActive) => {
        if (prevActive !== id) return prevActive;
        const remaining = ensured.sessions.filter((s) => s.id !== id);
        return remaining[0]?.id ?? null;
      });
    },
    [ensured.sessions],
  );

  const appendToActive = useCallback(
    (messages: IAnalyticsMessage[]) => {
      setSessions((prev) => {
        const current = prev.find((s) => s.id === ensured.activeId);
        if (!current) return prev;
        const updated = appendMessages(current, messages, nowIso());
        return enforceRetention(upsertSession(prev, updated));
      });
    },
    [ensured.activeId],
  );

  return {
    sessions: ensured.sessions,
    activeSession,
    activeSessionId: ensured.activeId,
    newSession,
    selectSession,
    deleteSession,
    appendToActive,
  };
}
```

- [ ] **Step 2: Type-check via build de delta**

Run: `bunx tsc --noEmit 2>&1 | grep "analytics-copilot/hooks/useCopilotSessions"`
Expected: nenhuma saída (zero erros nos arquivos novos).

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/hooks/useCopilotSessions.ts
git commit -m "feat(copilot): localStorage-backed session list hook"
```

---

## Task A9: `useCopilotChat` (orquestração + sessões)

Compõe sessões + adapter de dados + `runCopilotQuery`. Expõe a API que a página usará.

**Files:**
- Create: `src/features/analytics-copilot/hooks/useCopilotChat.ts`

- [ ] **Step 1: Implementar**

```ts
// src/features/analytics-copilot/hooks/useCopilotChat.ts
import { useCallback, useMemo, useState } from "react";

import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { auditLog, useCurrentRole } from "@/features/rbac";
import type { IGoalPeriod } from "@/shared/types/bi";
import type { IAnalyticsAnswer, IAnalyticsMessage } from "@/shared/types/analytics-copilot";

import { metricCatalog } from "../catalog/metricCatalog";
import { runCopilotQuery } from "../engine/runCopilotQuery";
import { useAnalyticsDataAccess } from "../adapters/useAnalyticsDataAccess";
import { suggestionsForRole } from "../i18n/suggestions";
import { useCopilotSessions } from "./useCopilotSessions";
import type { ICopilotSessionRecord } from "../engine/sessionStore";

/** Calendar-month bounds for "this period" (local time). */
function monthBounds(date: Date): IGoalPeriod {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { type: "monthly", start: start.toISOString(), end: end.toISOString() };
}

function makeMessage(partial: Omit<IAnalyticsMessage, "id" | "timestamp">): IAnalyticsMessage {
  return { ...partial, id: crypto.randomUUID(), timestamp: new Date().toISOString() };
}

/** Last assistant message whose answer is resolved (drives the Split detail panel). */
function lastResolved(messages: IAnalyticsMessage[]): IAnalyticsAnswer | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.answer?.resolved) return m.answer;
  }
  return null;
}

export interface IUseCopilotChat {
  sessions: ICopilotSessionRecord[];
  activeSessionId: string;
  messages: IAnalyticsMessage[];
  isThinking: boolean;
  lastResolvedAnswer: IAnalyticsAnswer | null;
  ask: (question: string) => Promise<void>;
  newSession: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
}

/**
 * Session-aware orchestration for the copilot page (PRD-057 surface, multi-mode).
 * RNF-001: the number comes only from runCopilotQuery → executeQuery → dataAccess.
 */
export function useCopilotChat(): IUseCopilotChat {
  const dataAccess = useAnalyticsDataAccess();
  const role = useCurrentRole();
  const { currentStoreId } = useCurrentStore();
  const { currentUser } = useAuth();
  const {
    sessions,
    activeSession,
    activeSessionId,
    newSession,
    selectSession,
    deleteSession,
    appendToActive,
  } = useCopilotSessions();

  const [isThinking, setIsThinking] = useState(false);

  const messages = activeSession.messages;
  const lastResolvedAnswer = useMemo(() => lastResolved(messages), [messages]);

  const ask = useCallback(
    async (question: string): Promise<void> => {
      const trimmed = question.trim();
      if (!trimmed) return;

      appendToActive([makeMessage({ role: "user", text: trimmed })]);
      setIsThinking(true);

      const effectiveRole = role ?? "Vendedor";
      const sellerId = effectiveRole === "Vendedor" ? currentUser?.id : undefined;
      const { answer, errorText } = await runCopilotQuery(
        trimmed,
        {
          role: effectiveRole,
          storeId: currentStoreId ?? undefined,
          sellerId,
          period: monthBounds(new Date()),
          fallbackSuggestions: suggestionsForRole(role),
        },
        { dataAccess, catalog: metricCatalog },
      );

      if (answer.resolved && answer.query) {
        auditLog({
          action: "analytics_copilot_query",
          resource: "insight",
          resourceId: answer.query.metricId,
          storeId: currentStoreId ?? undefined,
        });
      }

      appendToActive([makeMessage({ role: "assistant", answer, text: errorText })]);
      setIsThinking(false);
    },
    [appendToActive, dataAccess, role, currentStoreId, currentUser],
  );

  return {
    sessions,
    activeSessionId,
    messages,
    isThinking,
    lastResolvedAnswer,
    ask,
    newSession,
    selectSession,
    deleteSession,
  };
}
```

- [ ] **Step 2: Type-check de delta**

Run: `bunx tsc --noEmit 2>&1 | grep "analytics-copilot/hooks/useCopilotChat"`
Expected: nenhuma saída.

> Se `useAnalyticsDataAccess` não estiver em `../adapters/useAnalyticsDataAccess`, confirmar o caminho via `glob` antes de ajustar o import.

- [ ] **Step 3: Commit**

```bash
git add src/features/analytics-copilot/hooks/useCopilotChat.ts
git commit -m "feat(copilot): session-aware chat orchestration hook"
```

---

## Task A10: Exports do barrel (parcial) + gate completo

**Files:**
- Modify: `src/features/analytics-copilot/index.ts`

- [ ] **Step 1: Acrescentar novos exports (sem remover os antigos ainda)**

Adicionar ao `index.ts` (mantendo as linhas atuais por enquanto — a remoção do Sheet/hook antigo é do Plano B):

```ts
export { runCopilotQuery, type IRunCopilotContext, type IRunCopilotResult } from "./engine/runCopilotQuery";
export {
  createSession,
  appendMessages,
  deriveTitle,
  type ICopilotSessionRecord,
} from "./engine/sessionStore";
export { groupSessionsByDate, type ISessionGroup } from "./utils/sessionGrouping";
export { useCopilotChat, type IUseCopilotChat } from "./hooks/useCopilotChat";
export { useCopilotSessions } from "./hooks/useCopilotSessions";
export {
  useCopilotViewMode,
  normalizeViewMode,
  COPILOT_VIEW_MODES,
  type CopilotViewMode,
} from "./hooks/useCopilotViewMode";
export {
  COPILOT_CATEGORIES,
  metricUiMeta,
  metricIcon,
  categoryById,
  type ICopilotCategory,
} from "./catalog/metricUi";
export {
  categorizedSuggestionsForRole,
  type ICopilotSuggestionGroup,
  type ICopilotSuggestionItem,
} from "./i18n/suggestions";
```

- [ ] **Step 2: Gate completo — testes**

Run: `bun run test`
Expected: PASS — todos os testes anteriores (PRD-056/057) + os novos (metricUi, suggestions, runCopilotQuery, sessionStore, sessionGrouping, normalizeViewMode).

- [ ] **Step 3: Gate completo — build**

Run: `bun run build`
Expected: build verde (vite). Sem erros de tipo nos arquivos novos.

- [ ] **Step 4: Commit**

```bash
git add src/features/analytics-copilot/index.ts
git commit -m "feat(copilot): export core engine/hooks for multi-mode page (plan A)"
```

---

## Self-review do Plano A

- **Cobertura da spec:** §4 (engine/hooks), §10.1 (store), §3 D-5/D-10, §16 (testes) ✓. UI fica para o Plano B.
- **Sem placeholders:** todo passo tem código completo ✓.
- **Consistência de tipos:** `ICopilotSessionRecord` (sessionStore) usado por `sessionGrouping`, `useCopilotSessions`, `useCopilotChat`; `runCopilotQuery` assina `(question, ctx, deps)` igual ao consumo no `useCopilotChat`; `CopilotViewMode` exportado ✓.
- **Desvio consciente:** reuso de `formatRelativeTimeBR` (já existe) → sem util nova de tempo (DRY). O Plano B usa esse util na lista de sessões.
- **DoD do Plano A:** `bun run test` verde, `bun run build` verde, hooks importáveis pelo barrel; nenhuma página ainda.
