# Copiloto de conversa — Fundação parametrizável (Sub-projeto A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os cinco defeitos auditados do painel Copiloto, blindar o teto de orçamento de IA contra concorrência, e transformar toda decisão de comportamento em parâmetro numa tela de controle.

**Architecture:** Os parâmetros vivem em `stores.settings->'copilotAssistant'`, seguindo o padrão já usado por `idleAlerts`/`conversationRescue`/`sound` — nenhuma tabela nova. Duas funções puras (`shouldMountCopilot`, `estimateAssistantCost`) concentram a lógica de decisão e são testadas isoladamente. O contrato `getPanelData` ganha um parâmetro de opções para que o provider nunca precise ler settings sozinho. A Edge `copilot-generate` passa a ler as mensagens **mais recentes** e a consultar uma RPC transacional para o teto de gasto.

**Tech Stack:** React 19, TypeScript strict, TanStack Router/Query, Tailwind v4 + shadcn/ui, Vitest, Supabase (Postgres + Edge Functions em Deno).

**Spec:** `docs/superpowers/specs/2026-07-22-copiloto-conversa-fundacao-design.md`
**Mockups:** `docs/superpowers/mockups/2026-07-22-copiloto-conversa-mockups.html`

## Global Constraints

- **Comentários em inglês. Texto de UI em português do Brasil com acentuação correta** (ã, ç, é, í, ó, ú, â, ê, ô). Nunca "nao"/"orcamento"/"sugestao".
- **Conventional Commits em inglês**, atômicos: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`.
- **TypeScript `strict: true`.** Evitar `any`. Interfaces de domínio prefixadas com `I`. `noUncheckedIndexedAccess` está ligado — acesso por índice exige guarda.
- **Provider Pattern:** features nunca importam `@/mocks` nem `@/providers/data/impl/*`. Tudo pelo barrel `@/providers/data`.
- **Componentes consomem apenas tokens semânticos** (`bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `text-primary`). Nunca `--gallo-*` nem hex direto.
- **Gate de CI:** `bun run build` + `bun run test`. O `build` **não** faz type-check; para tipos, `bunx tsc --noEmit` — há baseline de ~315 erros pré-existentes, avaliar só o delta.
- **Toda migration aplicada via MCP deve ser espelhada em `supabase/migrations/` no mesmo PR.**
- **Nunca aplicar migration nem deployar Edge Function em produção sem OK explícito do dono.**
- **O workflow "Edge Functions deploy" do repositório é no-op** (passa verde sem deployar). Deploy real só pela CLI.
- Testes Vitest co-localizados (`*.test.ts`) ao lado do código.

---

### Task 1: Tipo de settings, defaults e `shouldMountCopilot`

Cria o contrato de parâmetros e a função pura que decide se o painel monta. É a fundação de que as Tasks 5, 6 e 7 dependem.

**Files:**
- Modify: `src/shared/types/copilot.ts` (acrescentar `ICopilotAssistantSettings` ao fim)
- Modify: `src/shared/types/platform.ts:271` (acrescentar o campo em `IPlatformSettings`)
- Create: `src/features/copilot/config/defaults.ts`
- Create: `src/features/copilot/engine/shouldMountCopilot.ts`
- Test: `src/features/copilot/engine/shouldMountCopilot.test.ts`
- Modify: `src/features/copilot/index.ts` (barrel)

**Interfaces:**
- Consumes: `RoleName`, `ID`, `IConversation` de `@/shared/types`.
- Produces:
  - `ICopilotAssistantSettings` (shape completo abaixo)
  - `DEFAULT_COPILOT_ASSISTANT_SETTINGS: ICopilotAssistantSettings`
  - `shouldMountCopilot(input: { settings: ICopilotAssistantSettings; conversation: ICopilotMountConversation; role: RoleName }): boolean`
  - `ICopilotMountConversation = Pick<IConversation, "customerId" | "leadId" | "whatsappAccountId">`

- [ ] **Step 1: Write the failing test**

Create `src/features/copilot/engine/shouldMountCopilot.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "../config/defaults";
import { shouldMountCopilot, type ICopilotMountConversation } from "./shouldMountCopilot";

const CUSTOMER_CONV: ICopilotMountConversation = {
  customerId: "cus-1",
  leadId: null,
  whatsappAccountId: "acc-1",
};
const LEAD_CONV: ICopilotMountConversation = {
  customerId: null,
  leadId: "lead-1",
  whatsappAccountId: "acc-1",
};

describe("shouldMountCopilot", () => {
  it("monta na conversa de cliente com os defaults", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("monta na conversa de lead com os defaults — corrige o gap dos 85%", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: LEAD_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("não monta quando o assistente está desligado", () => {
    expect(
      shouldMountCopilot({
        settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, enabled: false },
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(false);
  });

  it("respeita reach='customer_only'", () => {
    const settings = { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, reach: "customer_only" as const };
    expect(shouldMountCopilot({ settings, conversation: CUSTOMER_CONV, role: "Vendedor" })).toBe(true);
    expect(shouldMountCopilot({ settings, conversation: LEAD_CONV, role: "Vendedor" })).toBe(false);
  });

  it("respeita reach='lead_only'", () => {
    const settings = { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, reach: "lead_only" as const };
    expect(shouldMountCopilot({ settings, conversation: CUSTOMER_CONV, role: "Vendedor" })).toBe(false);
    expect(shouldMountCopilot({ settings, conversation: LEAD_CONV, role: "Vendedor" })).toBe(true);
  });

  it("accountIds vazio significa todas as contas", () => {
    expect(
      shouldMountCopilot({
        settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, accountIds: [] },
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("filtra por conta quando accountIds está preenchido", () => {
    const settings = { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, accountIds: ["acc-outra"] };
    expect(shouldMountCopilot({ settings, conversation: CUSTOMER_CONV, role: "Vendedor" })).toBe(false);
    expect(
      shouldMountCopilot({
        settings: { ...settings, accountIds: ["acc-1"] },
        conversation: CUSTOMER_CONV,
        role: "Vendedor",
      }),
    ).toBe(true);
  });

  it("filtra por papel", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: CUSTOMER_CONV,
        role: "VendedorExterno",
      }),
    ).toBe(false);
  });

  it("não monta em conversa sem cliente e sem lead", () => {
    expect(
      shouldMountCopilot({
        settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        conversation: { customerId: null, leadId: null, whatsappAccountId: "acc-1" },
        role: "Vendedor",
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/features/copilot/engine/shouldMountCopilot.test.ts
```

Expected: FAIL — `Failed to resolve import "../config/defaults"`.

- [ ] **Step 3: Add the settings type**

Append to `src/shared/types/copilot.ts`:

```ts
/** Which conversations the assistant acts on. */
export type CopilotReach = "all" | "customer_only" | "lead_only";

/** When the analysis runs. Only meaningful once `engine === "ai"` (sub-project B). */
export type CopilotTrigger = "on_demand" | "on_open" | "on_new_message";

/** Which engine produces summary and suggestions. */
export type CopilotEngine = "rules" | "ai";

/**
 * Conversation-assistant behaviour (spec 2026-07-22). Stored at
 * `stores.settings->'copilotAssistant'`; absent → DEFAULT_COPILOT_ASSISTANT_SETTINGS.
 *
 * The panel PLACEMENT is deliberately NOT here: it stays a per-person
 * preference in localStorage (`gallo-copilot-placement`), because it is taste,
 * not operational policy.
 */
export interface ICopilotAssistantSettings {
  enabled: boolean;
  reach: CopilotReach;
  /** WhatsApp accounts the assistant acts on. Empty → every account. */
  accountIds: ID[];
  /** Roles that see the panel. */
  roles: RoleName[];

  trigger: CopilotTrigger;
  /** Minutes an analysis stays valid before being redone (sub-project B). */
  cacheMinutes: number;
  /** New inbound messages required before redoing an analysis (sub-project B). */
  minNewMessages: number;
  /** How many recent messages the assistant reads. */
  messageWindow: number;

  showSummary: boolean;
  showSuggestions: boolean;
  showReplyButton: boolean;
  /** Open the panel automatically when there is at least one suggestion. */
  autoExpandOnAlert: boolean;

  engine: CopilotEngine;
  /** Assistant's own monthly cap in BRL, inside the platform-wide cap. 0 = none. */
  monthlyCapBRL: number;
  /** Percentage of the own cap that notifies the Owner. */
  alertThresholdPct: number;
}
```

Confirme que o topo de `src/shared/types/copilot.ts` importa `ID` e `RoleName`. Se `RoleName` não estiver importado, acrescente ao import existente de `./people` (ou crie `import type { RoleName } from "./people";`).

- [ ] **Step 4: Wire the field into `IPlatformSettings`**

Em `src/shared/types/platform.ts`, logo após a linha do `sound?: ISoundSettings;` (linha ~273), acrescente:

```ts
  /** Conversation assistant behaviour (spec 2026-07-22). Undefined → DEFAULT_COPILOT_ASSISTANT_SETTINGS. */
  copilotAssistant?: ICopilotAssistantSettings;
```

E garanta que `ICopilotAssistantSettings` esteja importado no topo de `platform.ts`:

```ts
import type { ICopilotAssistantSettings } from "./copilot";
```

Se `platform.ts` já importar de `./copilot`, acrescente ao import existente. Confirme também que `src/shared/types/index.ts` reexporta os novos tipos — o barrel usa reexport explícito; acrescente `ICopilotAssistantSettings`, `CopilotReach`, `CopilotTrigger` e `CopilotEngine` à lista de tipos exportados de `./copilot`.

- [ ] **Step 5: Create the defaults**

Create `src/features/copilot/config/defaults.ts`:

```ts
import type { ICopilotAssistantSettings } from "@/shared/types";

/**
 * Defaults for the conversation assistant. Chosen to PRESERVE current behaviour
 * where it is not a defect, and to CORRECT it where it is:
 *
 * - `reach: "all"` fixes the gap that left 85% of conversations (lead-anchored)
 *   without a panel.
 * - `messageWindow: 40` replaces reading every message of a conversation.
 * - `autoExpandOnAlert: true` attacks the adoption problem: the panel used to
 *   start collapsed, hiding the AI button inside it.
 * - `engine: "rules"` keeps the deterministic engine: sub-project A turns on NO
 *   new AI cost. Sub-project B unlocks "ai".
 * - `trigger`/`cacheMinutes`/`minNewMessages` are persisted but inert until "ai".
 */
export const DEFAULT_COPILOT_ASSISTANT_SETTINGS: ICopilotAssistantSettings = {
  enabled: true,
  reach: "all",
  accountIds: [],
  roles: ["Owner", "Gestor", "Vendedor", "SDR"],
  trigger: "on_demand",
  cacheMinutes: 30,
  minNewMessages: 3,
  messageWindow: 40,
  showSummary: true,
  showSuggestions: true,
  showReplyButton: true,
  autoExpandOnAlert: true,
  engine: "rules",
  monthlyCapBRL: 0,
  alertThresholdPct: 80,
};
```

- [ ] **Step 6: Implement `shouldMountCopilot`**

Create `src/features/copilot/engine/shouldMountCopilot.ts`:

```ts
import type { ICopilotAssistantSettings, IConversation, RoleName } from "@/shared/types";

/** The conversation fields the mount decision depends on. */
export type ICopilotMountConversation = Pick<
  IConversation,
  "customerId" | "leadId" | "whatsappAccountId"
>;

export interface IShouldMountCopilotInput {
  settings: ICopilotAssistantSettings;
  conversation: ICopilotMountConversation;
  role: RoleName;
}

/**
 * Single source of truth for whether the copilot panel exists on a conversation.
 *
 * The page uses it BOTH to render and to decide whether to fetch panel data —
 * before this existed the fetch ran unconditionally, loading conversation,
 * every message and the SDR escalation on ~2.900 conversations that rendered
 * nothing.
 *
 * Pure: no I/O, no clock, no provider access.
 */
export function shouldMountCopilot({
  settings,
  conversation,
  role,
}: IShouldMountCopilotInput): boolean {
  if (!settings.enabled) return false;
  if (!settings.roles.includes(role)) return false;

  // An empty account list means "every account" — never "no account".
  if (settings.accountIds.length > 0) {
    if (!conversation.whatsappAccountId) return false;
    if (!settings.accountIds.includes(conversation.whatsappAccountId)) return false;
  }

  const hasCustomer = Boolean(conversation.customerId);
  const hasLead = Boolean(conversation.leadId);
  if (!hasCustomer && !hasLead) return false;

  if (settings.reach === "customer_only") return hasCustomer;
  if (settings.reach === "lead_only") return hasLead && !hasCustomer;
  return true;
}
```

> Nota sobre `lead_only`: uma conversa com cliente **e** lead conta como conversa de cliente. `reach: "lead_only"` significa "só as que ainda não viraram cliente".

- [ ] **Step 7: Run the test to verify it passes**

```bash
bunx vitest run src/features/copilot/engine/shouldMountCopilot.test.ts
```

Expected: PASS — 9 testes verdes.

- [ ] **Step 8: Export from the barrel**

Acrescente a `src/features/copilot/index.ts`:

```ts
export { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "./config/defaults";
export { shouldMountCopilot } from "./engine/shouldMountCopilot";
export type {
  ICopilotMountConversation,
  IShouldMountCopilotInput,
} from "./engine/shouldMountCopilot";
```

- [ ] **Step 9: Verify the build**

```bash
bun run build
```

Expected: build conclui sem erro.

- [ ] **Step 10: Commit**

```bash
git add src/shared/types/copilot.ts src/shared/types/platform.ts src/shared/types/index.ts src/features/copilot/config/defaults.ts src/features/copilot/engine/shouldMountCopilot.ts src/features/copilot/engine/shouldMountCopilot.test.ts src/features/copilot/index.ts
git commit -m "feat(copilot): add assistant settings type, defaults and mount engine"
```

---

### Task 2: `estimateAssistantCost`

A função pura que alimenta a estimativa viva do painel de controle. Sem ela, a decisão de custo continuaria sendo uma tabela num documento.

**Files:**
- Create: `src/features/copilot/engine/estimateAssistantCost.ts`
- Test: `src/features/copilot/engine/estimateAssistantCost.test.ts`
- Modify: `src/features/copilot/index.ts`

**Interfaces:**
- Consumes: `ICopilotAssistantSettings` (Task 1).
- Produces: `estimateAssistantCost(input: IEstimateAssistantCostInput): IAssistantCostEstimate` com `IAssistantCostEstimate = { callsPerDay: number; monthlyBRL: number; pctOfCap: number }`.

- [ ] **Step 1: Write the failing test**

Create `src/features/copilot/engine/estimateAssistantCost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "../config/defaults";
import { estimateAssistantCost } from "./estimateAssistantCost";

const BASE = {
  activeConversationsPerDay: 194,
  costPerCallBRL: 0.025,
  opensPerConversationPerDay: 5,
};

describe("estimateAssistantCost", () => {
  it("custa zero enquanto o motor for regras", () => {
    const r = estimateAssistantCost({ settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS, ...BASE });
    expect(r.callsPerDay).toBe(0);
    expect(r.monthlyBRL).toBe(0);
  });

  it("sob demanda gasta uma fração das conversas ativas", () => {
    const r = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_demand" },
      ...BASE,
    });
    expect(r.callsPerDay).toBeGreaterThan(0);
    expect(r.callsPerDay).toBeLessThan(BASE.activeConversationsPerDay);
  });

  it("ao abrir sem cache aproxima aberturas × conversas", () => {
    const r = estimateAssistantCost({
      settings: {
        ...DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        engine: "ai",
        trigger: "on_open",
        cacheMinutes: 0,
      },
      ...BASE,
    });
    expect(r.callsPerDay).toBe(194 * 5);
  });

  it("o cache reduz as chamadas do disparo ao abrir", () => {
    const semCache = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open", cacheMinutes: 0 },
      ...BASE,
    });
    const comCache = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open", cacheMinutes: 30 },
      ...BASE,
    });
    expect(comCache.callsPerDay).toBeLessThan(semCache.callsPerDay);
  });

  it("pctOfCap é zero quando não há teto próprio", () => {
    const r = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open", monthlyCapBRL: 0 },
      ...BASE,
    });
    expect(r.pctOfCap).toBe(0);
  });

  it("pctOfCap passa de 100 quando a projeção estoura o teto", () => {
    const r = estimateAssistantCost({
      settings: {
        ...DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        engine: "ai",
        trigger: "on_open",
        cacheMinutes: 0,
        monthlyCapBRL: 10,
      },
      ...BASE,
    });
    expect(r.pctOfCap).toBeGreaterThan(100);
  });

  it("não gera NaN com conversas zeradas", () => {
    const r = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open" },
      ...BASE,
      activeConversationsPerDay: 0,
    });
    expect(r.callsPerDay).toBe(0);
    expect(r.monthlyBRL).toBe(0);
    expect(Number.isNaN(r.pctOfCap)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/features/copilot/engine/estimateAssistantCost.test.ts
```

Expected: FAIL — `Failed to resolve import "./estimateAssistantCost"`.

- [ ] **Step 3: Implement the engine**

Create `src/features/copilot/engine/estimateAssistantCost.ts`:

```ts
import type { ICopilotAssistantSettings } from "@/shared/types";

/** Days used to turn a per-day figure into a monthly one. */
const DAYS_PER_MONTH = 30;

/** Share of active conversations whose seller presses "analisar" on a given day. */
const ON_DEMAND_RATE = 0.25;

/** Hours of a working day used to convert the cache window into a hit rate. */
const WORKING_HOURS_PER_DAY = 10;

export interface IEstimateAssistantCostInput {
  settings: ICopilotAssistantSettings;
  /** Conversations with activity on a typical day (measured: 194). */
  activeConversationsPerDay: number;
  /** BRL per LLM call (measured: 0,025 with claude-sonnet-5). */
  costPerCallBRL: number;
  /**
   * How many times a seller reopens the same conversation in a day. This is the
   * WEAKEST input of the projection — it is estimated, not measured, and the UI
   * must label it as an assumption.
   */
  opensPerConversationPerDay: number;
}

export interface IAssistantCostEstimate {
  callsPerDay: number;
  monthlyBRL: number;
  /** Percentage of the assistant's own cap. 0 when there is no own cap. */
  pctOfCap: number;
}

/**
 * Projects the assistant's monthly LLM spend from its parameters. Pure — the
 * settings screen calls it on every control change so the price of a decision
 * is visible before the decision costs anything.
 */
export function estimateAssistantCost({
  settings,
  activeConversationsPerDay,
  costPerCallBRL,
  opensPerConversationPerDay,
}: IEstimateAssistantCostInput): IAssistantCostEstimate {
  const conversations = Math.max(0, activeConversationsPerDay);

  let callsPerDay = 0;
  if (settings.engine === "ai" && conversations > 0) {
    if (settings.trigger === "on_demand") {
      callsPerDay = conversations * ON_DEMAND_RATE;
    } else if (settings.trigger === "on_open") {
      const opens = conversations * Math.max(1, opensPerConversationPerDay);
      // The cache collapses repeat opens inside its window into one call.
      const windowsPerDay =
        settings.cacheMinutes > 0
          ? Math.max(1, (WORKING_HOURS_PER_DAY * 60) / settings.cacheMinutes)
          : Number.POSITIVE_INFINITY;
      const cappedByCache = conversations * Math.min(windowsPerDay, opens / conversations);
      callsPerDay = settings.cacheMinutes > 0 ? cappedByCache : opens;
    } else {
      // on_new_message: one analysis per inbound burst, floored by minNewMessages.
      const burstsPerConversation = Math.max(1, 6 / Math.max(1, settings.minNewMessages));
      callsPerDay = conversations * burstsPerConversation;
    }
  }

  callsPerDay = Math.round(callsPerDay);
  const monthlyBRL = callsPerDay * costPerCallBRL * DAYS_PER_MONTH;
  const pctOfCap =
    settings.monthlyCapBRL > 0 ? (monthlyBRL / settings.monthlyCapBRL) * 100 : 0;

  return { callsPerDay, monthlyBRL, pctOfCap };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bunx vitest run src/features/copilot/engine/estimateAssistantCost.test.ts
```

Expected: PASS — 7 testes verdes.

- [ ] **Step 5: Export from the barrel**

Acrescente a `src/features/copilot/index.ts`:

```ts
export { estimateAssistantCost } from "./engine/estimateAssistantCost";
export type {
  IAssistantCostEstimate,
  IEstimateAssistantCostInput,
} from "./engine/estimateAssistantCost";
```

- [ ] **Step 6: Commit**

```bash
git add src/features/copilot/engine/estimateAssistantCost.ts src/features/copilot/engine/estimateAssistantCost.test.ts src/features/copilot/index.ts
git commit -m "feat(copilot): add pure cost projection for the assistant settings screen"
```

---

### Task 3: Briefing de lead (A2 — camada de dados)

Hoje o cabeçalho do painel só sabe descrever cliente. Para existir em conversa de lead ele precisa descrever lead.

**Files:**
- Modify: `src/shared/types/copilot.ts:48-59` (`ICopilotBriefing`)
- Modify: `src/features/copilot/components/CopilotHeader.tsx:25-49`
- Modify: `src/providers/data/impl/mock/copilot.ts` (`buildBriefing`, `getPanelData`)
- Modify: `src/providers/data/impl/supabase/copilot.ts:84-97, 291-310`
- Test: `src/providers/data/impl/mock/copilot.test.ts` (acrescentar casos)

**Interfaces:**
- Consumes: `ILead` (campo `stage: ILeadStage` com `stage.name: string`, `origin: LeadOrigin`), `ILeadsProvider.getViaConversation`.
- Produces: `ICopilotBriefing` com `kind`, `lifecycleStatus` opcional, `leadStage`, `leadOrigin`.

- [ ] **Step 1: Write the failing test**

Acrescente a `src/providers/data/impl/mock/copilot.test.ts` (o arquivo já importa `conversationsApi` de `@/mocks` e define `SEED_STORE_ID` — reutilize-os; **não** use `mockStore`, que não é acessível daqui):

```ts
describe("getPanelData — conversa de lead", () => {
  it("monta briefing de lead quando não há cliente", async () => {
    const conversation = (
      await conversationsApi.list({ pageSize: 500, storeId: SEED_STORE_ID })
    ).data.find((c) => !c.customerId && c.leadId);
    expect(conversation, "seed precisa ter ao menos uma conversa só de lead").toBeDefined();

    const panel = await mockCopilotProvider.getPanelData(conversation!.id);

    expect(panel.briefing).toBeDefined();
    expect(panel.briefing?.kind).toBe("lead");
    expect(panel.briefing?.leadStage).toBeTruthy();
    expect(panel.briefing?.lifecycleStatus).toBeUndefined();
  });

  it("mantém briefing de cliente quando há cliente", async () => {
    const conversation = (
      await conversationsApi.list({ pageSize: 500, storeId: SEED_STORE_ID })
    ).data.find((c) => c.customerId);
    expect(conversation).toBeDefined();

    const panel = await mockCopilotProvider.getPanelData(conversation!.id);

    expect(panel.briefing?.kind).toBe("customer");
    expect(panel.briefing?.lifecycleStatus).toBeDefined();
  });
});
```

> Se o seed não tiver nenhuma conversa **só de lead** (o mock pode ancorar todas em cliente), o primeiro teste falha no `toBeDefined`. Nesse caso, monte a asserção sobre uma conversa sintética: crie um lead e uma conversa via as APIs do mock (`leadsApi`/`conversationsApi`) no `beforeAll`, ou marque o teste como o caso Supabase-only e cubra a ramificação de lead por um teste de unidade direto sobre `buildLeadBriefing`. Verifique o seed antes de assumir.

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/providers/data/impl/mock/copilot.test.ts
```

Expected: FAIL — `briefing` é `undefined` na conversa de lead, e `kind` não existe no tipo.

- [ ] **Step 3: Extend `ICopilotBriefing`**

Substitua a interface em `src/shared/types/copilot.ts` (linhas 48-59) por:

```ts
/** Which anchor the briefing describes. Absent on legacy payloads → "customer". */
export type CopilotBriefingKind = "customer" | "lead";

export interface ICopilotBriefing {
  kind?: CopilotBriefingKind;
  /** Display name of the anchor — customer or lead. */
  customerName: string;
  /** Customer lifecycle. Absent when `kind === "lead"` (a lead has no purchase history). */
  lifecycleStatus?: CustomerStatus;
  abcClass?: ABCClass;
  averageTicket?: Money;
  ltv?: Money;
  recencyDays?: number;
  /** Texto curto de frequência, ex.: "4 pedidos · 12m". */
  frequency?: string;
  primaryVehicle?: { brand: string; model?: string };
  isPositivado?: boolean;
  /** Pipeline stage name. Present only when `kind === "lead"`. */
  leadStage?: string;
  /** Origin channel label. Present only when `kind === "lead"`. */
  leadOrigin?: string;
}
```

Exporte `CopilotBriefingKind` no barrel `src/shared/types/index.ts`.

- [ ] **Step 4: Update `CopilotHeader` for the optional lifecycle**

Em `src/features/copilot/components/CopilotHeader.tsx`, substitua o bloco `{briefing && (...)}` (linhas 25-49) por:

```tsx
      {briefing && (
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          {briefing.kind === "lead" ? (
            <span className="font-semibold uppercase text-info">
              Lead{briefing.leadStage ? ` · ${briefing.leadStage}` : ""}
            </span>
          ) : (
            briefing.lifecycleStatus && (
              <span className="font-semibold uppercase text-warning">
                {briefing.lifecycleStatus}
              </span>
            )
          )}
          {briefing.abcClass && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>
                ABC <span className="font-semibold text-primary">{briefing.abcClass}</span>
              </span>
            </>
          )}
          {ticket && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>ticket {ticket}</span>
            </>
          )}
          {briefing.recencyDays != null && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>recência {briefing.recencyDays}d</span>
            </>
          )}
          {briefing.kind === "lead" && briefing.leadOrigin && (
            <>
              <span className="text-muted-foreground/60">·</span>
              <span>{briefing.leadOrigin}</span>
            </>
          )}
        </span>
      )}
```

> `text-info` é token semântico já existente e é exatamente o que o `CopilotHeader` atual usa para o status. Confirmado em `src/styles.css` (`--color-info`). Não use o prefixo `severity-` para texto/fundo aqui — só os utilitários `text-info`/`text-warning` existem.

- [ ] **Step 5: Add the lead briefing to the mock impl**

Em `src/providers/data/impl/mock/copilot.ts`:

1. Acrescente `kind: "customer",` como primeiro campo do retorno de `buildBriefing`.
2. Acrescente a função nova, logo após `buildBriefing`:

```ts
const LEAD_ORIGIN_LABELS: Record<LeadOrigin, string> = {
  whatsapp: "WhatsApp",
  ecommerce: "E-commerce",
  indicacao: "Indicação",
  google: "Google",
  outro: "Outro",
  import: "Importação",
};

/** Briefing for a lead-anchored conversation: no purchase history exists, so
 *  the header shows pipeline stage and origin instead of lifecycle/ABC/ticket. */
function buildLeadBriefing(lead: ILead): ICopilotBriefing {
  return {
    kind: "lead",
    customerName: lead.name,
    leadStage: lead.stage.name,
    leadOrigin: LEAD_ORIGIN_LABELS[lead.origin],
  };
}
```

3. Importe `ILead` e `LeadOrigin` de `@/shared/types` e `mockLeadsProvider` de `./leads`.
4. Em `getPanelData`, substitua a linha `const briefing = customer ? buildBriefing(customer, now) : undefined;` por:

```ts
    const lead =
      !customer && conversation.leadId
        ? await mockLeadsProvider.get(conversation.leadId).catch(() => null)
        : null;
    const briefing = customer
      ? buildBriefing(customer, now)
      : lead
        ? buildLeadBriefing(lead)
        : undefined;
```

- [ ] **Step 6: Mirror it in the Supabase impl**

Em `src/providers/data/impl/supabase/copilot.ts`, aplique as mesmas três mudanças:

1. `kind: "customer",` como primeiro campo de `buildBriefing` (linha ~85).
2. As mesmas `LEAD_ORIGIN_LABELS` e `buildLeadBriefing` (código idêntico ao Step 5 — a duplicação é intencional nesta camada, como já ocorre com o rules engine).
3. Em `getPanelData`, após a resolução do `customer`, acrescente:

```ts
    // Same gated-once pattern as the customer read: the per-owner leads RLS
    // hides an ownerless lead from non-staff, so a direct `get` would 406.
    const lead =
      !customer && conversation.leadId
        ? await supabaseLeadsProvider.getViaConversation(conversationId).catch(() => null)
        : null;
```

e troque a linha do briefing por:

```ts
    const briefing = customer
      ? buildBriefing(customer, now)
      : lead
        ? buildLeadBriefing(lead)
        : undefined;
```

Importe `supabaseLeadsProvider` de `./leads` e `ILead`/`LeadOrigin` de `@/shared/types`.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
bunx vitest run src/providers/data/impl/mock/copilot.test.ts
```

Expected: PASS, incluindo os dois casos novos.

- [ ] **Step 8: Verify the build**

```bash
bun run build && bun run test
```

Expected: build ok, suíte inteira verde.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/copilot.ts src/shared/types/index.ts src/features/copilot/components/CopilotHeader.tsx src/providers/data/impl/mock/copilot.ts src/providers/data/impl/supabase/copilot.ts src/providers/data/impl/mock/copilot.test.ts
git commit -m "feat(copilot): describe lead-anchored conversations in the briefing"
```

---

### Task 4: Resumo ancorado no fim da conversa (A5)

O resumo abre com a primeira mensagem que entrou na conversa inteira. Num WhatsApp perene isso é uma frase de meses atrás.

**Files:**
- Modify: `src/providers/data/impl/mock/copilot.ts` (`mockSummaryFromMessages`)
- Modify: `src/providers/data/impl/supabase/copilot.ts:118-132` (`summaryFromMessages`)
- Test: `src/providers/data/impl/mock/copilot.test.ts`

**Interfaces:**
- Consumes: `IMessage[]` já limitado à janela (Task 5 estreita a entrada; esta task só muda o texto).
- Produces: `ICopilotSummary` cujo texto nunca afirma um começo de conversa.

- [ ] **Step 1: Write the failing test**

Acrescente a `src/providers/data/impl/mock/copilot.test.ts`:

```ts
describe("resumo da conversa", () => {
  it("não afirma um começo que a janela não conhece", async () => {
    const conversation = (
      await conversationsApi.list({ pageSize: 500, storeId: SEED_STORE_ID })
    ).data.find((c) => c.customerId);
    const panel = await mockCopilotProvider.getPanelData(conversation!.id);
    if (panel.summary && panel.summary.source !== "sdr") {
      expect(panel.summary.text).not.toContain("Cliente iniciou com");
      expect(panel.summary.text).toContain("Pendência atual");
    }
  });
});
```

> Este teste é condicional (`if`): passa vacuamente quando o resumo vem do SDR ou tem uma só mensagem. É intencional — a garantia forte está no texto do helper. Se quiser uma asserção incondicional, teste `mockSummaryFromMessages` diretamente com um array de duas mensagens inbound.

- [ ] **Step 2: Run the test to verify it fails**

```bash
bunx vitest run src/providers/data/impl/mock/copilot.test.ts
```

Expected: FAIL — o texto atual contém "Cliente iniciou com".

- [ ] **Step 3: Change the wording in the mock impl**

Em `src/providers/data/impl/mock/copilot.ts`, dentro de `mockSummaryFromMessages`, substitua a construção do `text` por:

```ts
  const text =
    first.id === last.id
      ? `Cliente: "${truncate(last.text)}".`
      : `Últimas mensagens: "${truncate(first.text, 48)}". Pendência atual: "${truncate(last.text, 48)}".`;
```

- [ ] **Step 4: Mirror it in the Supabase impl**

Em `src/providers/data/impl/supabase/copilot.ts`, dentro de `summaryFromMessages` (linhas 127-131), aplique exatamente a mesma substituição.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
bunx vitest run src/providers/data/impl/mock/copilot.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/impl/mock/copilot.ts src/providers/data/impl/supabase/copilot.ts src/providers/data/impl/mock/copilot.test.ts
git commit -m "fix(copilot): stop anchoring the summary on the first message ever sent"
```

---

### Task 5: Janela limitada de mensagens (A4)

`listAllMessages` pagina todas as mensagens de 200 em 200 — até 15 idas sequenciais ao servidor — para alimentar três regras que olham o fim da conversa.

**Files:**
- Modify: `src/providers/data/contracts/copilot.ts` (assinatura de `getPanelData`)
- Modify: `src/providers/data/impl/supabase/copilot.ts:42-64, 292-294`
- Modify: `src/providers/data/impl/mock/copilot.ts:84-88`

**Interfaces:**
- Consumes: `IMessagesProvider.list({ conversationId, page, pageSize, orderDir })` → `IPaginatedResult<IMessage>`.
- Produces: `getPanelData(conversationId: ID, options?: ICopilotPanelOptions): Promise<ICopilotPanelData>` com `ICopilotPanelOptions = { messageWindow?: number }`.

- [ ] **Step 1: Change the contract**

Em `src/providers/data/contracts/copilot.ts`, acrescente o tipo de opções e mude a assinatura:

```ts
/** Options resolved by the caller from the store's assistant settings. Passing
 *  them keeps the provider free of settings I/O. */
export interface ICopilotPanelOptions {
  /** How many recent messages to read. Falls back to the provider's own floor. */
  messageWindow?: number;
}
```

e:

```ts
  getPanelData(conversationId: ID, options?: ICopilotPanelOptions): Promise<ICopilotPanelData>;
```

Exporte `ICopilotPanelOptions` pelo barrel `@/providers/data` (`src/providers/data/index.ts`), junto com os demais tipos de contrato do copiloto.

- [ ] **Step 2: Replace the full pagination in the Supabase impl**

Em `src/providers/data/impl/supabase/copilot.ts`, remova a função `listAllMessages` inteira (linhas 42-64) e a constante `MESSAGES_PAGE_SIZE`, colocando no lugar:

```ts
/** Fallback window when the caller passes none. Mirrors
 *  DEFAULT_COPILOT_ASSISTANT_SETTINGS.messageWindow — kept as a literal because
 *  this layer must not import from `src/features`. */
const DEFAULT_MESSAGE_WINDOW = 40;
const MAX_MESSAGE_WINDOW = 200;

/**
 * The most recent `window` messages, ascending by `sentAt`.
 *
 * Replaces the previous full pagination (up to 15 sequential round-trips on the
 * longest conversations) — the three keyword rules and the summary only ever
 * looked at the tail.
 */
async function listRecentMessages(conversationId: ID, window: number): Promise<IMessage[]> {
  const pageSize = Math.min(MAX_MESSAGE_WINDOW, Math.max(1, Math.floor(window)));
  const result = await supabaseMessagesProvider.list({
    conversationId,
    page: 1,
    pageSize,
    orderDir: "desc",
  });
  return [...result.data].reverse();
}
```

E em `getPanelData`, mude a assinatura e a chamada:

```ts
  async getPanelData(
    conversationId: ID,
    options?: ICopilotPanelOptions,
  ): Promise<ICopilotPanelData> {
    const conversation = await supabaseConversationsProvider.get(conversationId);
    const messages = await listRecentMessages(
      conversationId,
      options?.messageWindow ?? DEFAULT_MESSAGE_WINDOW,
    );
```

Importe `ICopilotPanelOptions` de `../../contracts/copilot`.

- [ ] **Step 3: Mirror it in the mock impl**

Em `src/providers/data/impl/mock/copilot.ts`, substitua a leitura de mensagens em `getPanelData`:

```ts
  async getPanelData(
    conversationId: ID,
    options?: ICopilotPanelOptions,
  ): Promise<ICopilotPanelData> {
    const conversation = await mockConversationsProvider.get(conversationId);
    const window = Math.min(200, Math.max(1, Math.floor(options?.messageWindow ?? 40)));
    const messages = (
      await mockMessagesProvider.list({
        conversationId,
        page: 1,
        pageSize: window,
        orderDir: "desc",
      })
    ).data
      .slice()
      .reverse();
```

- [ ] **Step 4: Run the suite**

```bash
bun run test
```

Expected: suíte verde. Se algum teste do copiloto assumia a conversa inteira, ajuste o teste para a janela — a mudança de semântica está documentada na spec §A4.

- [ ] **Step 5: Verify the build**

```bash
bun run build
```

Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/contracts/copilot.ts src/providers/data/index.ts src/providers/data/impl/supabase/copilot.ts src/providers/data/impl/mock/copilot.ts
git commit -m "perf(copilot): read only the recent message window instead of paginating everything"
```

---

### Task 6: Montagem gated e parâmetros de exibição (A2 frontend + A3)

Liga tudo: o painel passa a existir nas conversas de lead, a busca deixa de rodar onde nada será renderizado, e os interruptores de exibição passam a valer.

**Files:**
- Create: `src/features/copilot/hooks/useCopilotAssistantSettings.ts`
- Modify: `src/features/copilot/hooks/useCopilotPanel.ts`
- Modify: `src/features/conversations/pages/ConversationPage.tsx:104, 277, 295`
- Modify: `src/features/copilot/components/CopilotStrip.tsx:31-33, 103-117`
- Modify: `src/features/copilot/components/CopilotCard.tsx:18-20, 52-63`
- Modify: `src/features/copilot/components/CopilotFicheTab.tsx:18, 34-48`
- Modify: `src/features/copilot/components/CopilotReply.tsx:11-13`
- Modify: `src/features/copilot/index.ts`

**Interfaces:**
- Consumes: `shouldMountCopilot`, `DEFAULT_COPILOT_ASSISTANT_SETTINGS` (Task 1); `ICopilotPanelOptions` (Task 5); `useSettingsProvider` de `@/providers/data`; `useCurrentStore` de `@/features/multistore`; `useAuth` para o papel do usuário.
- Produces:
  - `useCopilotAssistantSettings(storeId: ID | null): { settings: ICopilotAssistantSettings; loading: boolean; saving: boolean; error: string | null; reload: () => Promise<void>; update: (patch: Partial<ICopilotAssistantSettings>) => Promise<void> }`
  - `useCopilotPanel(conversationId: ID | null, options?: { enabled?: boolean; messageWindow?: number }): ICopilotPanelState` — `ICopilotPanelState` ganha o campo `settings: ICopilotAssistantSettings`.

- [ ] **Step 1: Create the settings hook**

Create `src/features/copilot/hooks/useCopilotAssistantSettings.ts` — espelha `useIdleAlertsSettings` (`src/features/idle-alerts/hooks/useIdleAlertsSettings.ts`), trocando a chave e a ação de auditoria:

```ts
import { useCallback, useEffect, useState } from "react";
import type { ICopilotAssistantSettings, ID } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "../config/defaults";

export interface IUseCopilotAssistantSettingsResult {
  settings: ICopilotAssistantSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
  update: (patch: Partial<ICopilotAssistantSettings>) => Promise<void>;
}

/**
 * Read + write helper for `IPlatformSettings.copilotAssistant` (spec 2026-07-22).
 * Same skeleton as `useIdleAlertsSettings`. Reads default to
 * {@link DEFAULT_COPILOT_ASSISTANT_SETTINGS} while loading, so the conversation
 * screen can mount the panel without an extra guard.
 */
export function useCopilotAssistantSettings(
  storeId: ID | null,
): IUseCopilotAssistantSettingsResult {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<ICopilotAssistantSettings>(
    DEFAULT_COPILOT_ASSISTANT_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const platform = await provider.get(storeId);
      setSettings(platform.copilotAssistant ?? DEFAULT_COPILOT_ASSISTANT_SETTINGS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, [provider, storeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback(
    async (patch: Partial<ICopilotAssistantSettings>) => {
      if (!storeId) return;
      setSaving(true);
      const before = settings;
      const next: ICopilotAssistantSettings = { ...settings, ...patch };
      try {
        await provider.update(storeId, { copilotAssistant: next });
        setSettings(next);
        auditLog({
          action: "copilot_assistant_settings.update",
          resource: "settings",
          resourceId: storeId,
          before,
          after: next,
          storeId,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [provider, settings, storeId],
  );

  return { settings, loading, saving, error, reload, update };
}
```

- [ ] **Step 2: Gate the fetch in `useCopilotPanel`**

Em `src/features/copilot/hooks/useCopilotPanel.ts`, mude a assinatura e o efeito:

```ts
export interface IUseCopilotPanelOptions {
  /** When false the hook fetches nothing — the panel will not be rendered. */
  enabled?: boolean;
  /** How many recent messages the provider should read. */
  messageWindow?: number;
}

export function useCopilotPanel(
  conversationId: ID | null,
  options?: IUseCopilotPanelOptions,
): ICopilotPanelState {
```

e, dentro do `useEffect`, troque a guarda de entrada:

```ts
  const enabled = options?.enabled ?? true;
  const messageWindow = options?.messageWindow;

  useEffect(() => {
    if (!conversationId || !enabled) {
      setBriefing(undefined);
      setSummary(undefined);
      setAllSuggestions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setDismissed(new Set());
    provider
      .getPanelData(conversationId, messageWindow ? { messageWindow } : undefined)
      .then((data) => {
        // …unchanged…
      })
      // …unchanged…
    return () => {
      cancelled = true;
    };
  }, [provider, conversationId, enabled, messageWindow]);
```

> Atenção: o `return` antecipado agora também zera `loading`. Sem isso o `CopilotStrip` renderizaria o esqueleto "Analisando a conversa…" para sempre em conversa sem painel.

- [ ] **Step 3: Wire the decision into `ConversationPage`**

Em `src/features/conversations/pages/ConversationPage.tsx`:

1. Acrescente aos imports:

```tsx
import { shouldMountCopilot, useCopilotAssistantSettings } from "@/features/copilot";
import { useCurrentStore } from "@/features/multistore";
```

2. Substitua a linha 104 (`const copilot = useCopilotPanel(conversationId);`) por:

```tsx
  const { currentStoreId } = useCurrentStore();
  const { settings: assistantSettings } = useCopilotAssistantSettings(currentStoreId ?? null);
  const copilotMounts =
    !!conversation &&
    shouldMountCopilot({
      settings: assistantSettings,
      conversation: {
        customerId: conversation.customerId,
        leadId: conversation.leadId,
        whatsappAccountId: conversation.whatsappAccountId,
      },
      role: currentUser.role,
    });
  const copilot = useCopilotPanel(conversationId, {
    enabled: copilotMounts,
    messageWindow: assistantSettings.messageWindow,
  });
```

> `conversation` e `currentUser` já existem no escopo do componente (linha 227 desestrutura `conversation`; o usuário atual vem do contexto de auth já usado na página). Se `conversation` só existir depois de um early-return, mova o bloco acima para logo após esse ponto, mantendo a ordem dos hooks estável — `useCopilotPanel` deve continuar sendo chamado incondicionalmente, com `enabled: false` quando não houver conversa.

3. Substitua as duas condições de montagem (linhas 277 e 295), trocando `conversation.customerId &&` por `copilotMounts &&`:

```tsx
              {copilot.placement === "card" && copilotMounts && !copilot.error && (
```

```tsx
              {copilot.placement === "strip" && copilotMounts && !copilot.error && (
```

- [ ] **Step 4: Expose the settings on the panel state**

Em `useCopilotPanel`, acrescente `settings` ao retorno para que os três componentes leiam os interruptores de exibição sem buscar de novo:

```ts
export interface ICopilotPanelState {
  placement: CopilotPlacement;
  briefing?: ICopilotBriefing;
  summary?: ICopilotSummary;
  suggestions: ICopilotSuggestion[];
  loading: boolean;
  error: boolean;
  /** Assistant behaviour parameters, so surfaces don't refetch them. */
  settings: ICopilotAssistantSettings;
  dismiss: (id: ID) => void;
}
```

Acrescente `settings` a `IUseCopilotPanelOptions` e repasse-o no retorno:

```ts
export interface IUseCopilotPanelOptions {
  enabled?: boolean;
  messageWindow?: number;
  settings?: ICopilotAssistantSettings;
}
```

```ts
  return {
    placement,
    briefing,
    summary,
    suggestions,
    loading,
    error,
    settings: options?.settings ?? DEFAULT_COPILOT_ASSISTANT_SETTINGS,
    dismiss,
  };
```

E em `ConversationPage`, passe `settings: assistantSettings` junto das demais opções.

- [ ] **Step 5: Honour the display switches in the three surfaces**

Em `CopilotStrip.tsx`:

```tsx
  const { briefing, summary, suggestions, loading, dismiss, settings } = panel;
  // Opens by itself only when there is something worth reading — the panel used
  // to always start collapsed, which hid the AI button inside it.
  const [expanded, setExpanded] = useState(
    () => settings.autoExpandOnAlert && suggestions.length > 0,
  );
```

e, no corpo expandido, envolva as seções:

```tsx
          {settings.showSummary && summary && (
            <div className="mt-3">
              <CopilotSummary summary={summary} />
            </div>
          )}
          {settings.showSuggestions ? (
            suggestions.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-2.5">
                {suggestions.map((s) => (
                  <CopilotSuggestionItem key={s.id} suggestion={s} onDismiss={dismiss} />
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">{COPILOT_STRINGS.empty}</p>
            )
          ) : null}
          {settings.showReplyButton && (
            <CopilotReply conversationId={conversationId} onInsert={onInsertReply} />
          )}
```

> O estado inicial é calculado uma vez. Como `suggestions` chega depois da busca, acrescente um efeito que abre o painel quando a primeira sugestão aparecer, sem reabrir depois que o usuário fechar:

```tsx
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (autoExpandedRef.current) return;
    if (settings.autoExpandOnAlert && suggestions.length > 0) {
      autoExpandedRef.current = true;
      setExpanded(true);
    }
  }, [settings.autoExpandOnAlert, suggestions.length]);
```

Em `CopilotCard.tsx`, aplique o mesmo padrão: `const { suggestions, dismiss, loading, settings } = panel;`, o mesmo `useState`/`useEffect` de auto-expansão, e envolva a lista com `settings.showSuggestions` e o `CopilotReply` com `settings.showReplyButton`.

Em `CopilotFicheTab.tsx`, envolva `{summary && …}` com `settings.showSummary`, a lista com `settings.showSuggestions` e o `CopilotReply` com `settings.showReplyButton` (a aba não colapsa, então não há auto-expansão).

- [ ] **Step 6: Export the hook from the barrel**

Acrescente a `src/features/copilot/index.ts`:

```ts
export { useCopilotAssistantSettings } from "./hooks/useCopilotAssistantSettings";
export type { IUseCopilotAssistantSettingsResult } from "./hooks/useCopilotAssistantSettings";
```

- [ ] **Step 7: Verify build and suite**

```bash
bun run build && bun run test
```

Expected: build ok, suíte verde.

- [ ] **Step 8: Commit**

```bash
git add src/features/copilot src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(copilot): mount the panel on lead conversations and gate its data fetch"
```

---

### Task 7: Painel de controle do assistente (A7)

`Configurações → Copiloto` deixa de ter um campo e passa a ser a tela do assistente.

**Files:**
- Create: `src/features/copilot/components/CopilotAssistantSettingsSection.tsx`
- Modify: `src/routes/app.configuracoes.copiloto.tsx`
- Modify: `src/features/copilot/i18n/pt-BR.ts`
- Modify: `src/features/copilot/index.ts`

**Interfaces:**
- Consumes: `useCopilotAssistantSettings` (Task 6), `estimateAssistantCost` (Task 2), `DEFAULT_COPILOT_ASSISTANT_SETTINGS` (Task 1), `CopilotPlacementField` (existente), `useCurrentStore`, `useWhatsAppAccountsProvider` para a lista de contas.
- Produces: `CopilotAssistantSettingsSection({ storeId }: { storeId: ID | null })`.

- [ ] **Step 1: Extend the i18n strings**

Em `src/features/copilot/i18n/pt-BR.ts`, dentro de `settings`, substitua `title`/`description` e acrescente o bloco novo:

```ts
  settings: {
    title: "Assistente de conversa",
    description:
      "Controla o que o Copiloto faz no Atendimento, em quais conversas e a que custo.",
    placementLabel: "Posição na tela",
    placementPersonal: "pessoal",
    placementPersonalHint: "Preferência de cada pessoa, salva neste navegador.",
    saved: "Configurações do assistente salvas.",
    saveFailed: "Não foi possível salvar.",
    save: "Salvar alterações",
    groups: {
      reach: "Ativação e alcance",
      timing: "Quando analisar",
      display: "O que o painel mostra",
      engine: "Motor",
    },
    enabled: "Assistente ligado",
    enabledHint: "Desligar remove o painel de todas as conversas.",
    reachLabel: "Em quais conversas",
    reachOptions: { all: "Todas", customer_only: "Só cliente", lead_only: "Só lead" },
    accountsLabel: "Números atendidos",
    accountsHint: "Nenhum marcado significa todos. Permite testar numa instância antes de abrir para todas.",
    rolesLabel: "Quem enxerga",
    rolesHint: "O painel é sempre privado do atendente — ninguém mais vê.",
    triggerLabel: "Disparo",
    triggerOptions: { on_demand: "Sob demanda", on_open: "Ao abrir", on_new_message: "Mensagem nova" },
    cacheMinutesLabel: "Reaproveitar a análise por (minutos)",
    minNewMessagesLabel: "Só reanalisar a partir de (mensagens novas)",
    messageWindowLabel: "Mensagens consideradas",
    messageWindowHint: "Sempre as mais recentes. Conversas longas não são lidas inteiras.",
    showSummary: "Resumo da conversa",
    showSuggestions: "Alertas e sugestões",
    showReplyButton: 'Botão "Gerar resposta com IA"',
    autoExpandOnAlert: "Abrir sozinho quando houver alerta",
    engineLabel: "Resumo e sugestões",
    engineOptions: { rules: "Regras", ai: "Inteligência artificial" },
    engineAiLocked: "Disponível quando a análise por IA for entregue.",
    monthlyCapLabel: "Teto de gasto do assistente (R$/mês)",
    monthlyCapHint: "Sub-teto próprio, dentro do orçamento geral da plataforma. Zero = sem teto próprio.",
    alertThresholdLabel: "Avisar o Dono ao atingir (%)",
    estimateTitle: "Estimativa com os parâmetros atuais",
    estimateAssumption:
      "Premissa: cada conversa é reaberta cerca de 5 vezes por dia. Esse número é estimado, não medido — é o que mais muda o resultado.",
    estimateFree: "Sem custo: o motor está em Regras.",
    estimateOfCap: (pct: number) => `${Math.round(pct)}% do teto do assistente`,
  },
```

Mantenha o bloco `placements` existente logo abaixo.

- [ ] **Step 2: Build the settings section**

Create `src/features/copilot/components/CopilotAssistantSettingsSection.tsx`. Use `Switch`, `Input`, `Label` e `Button` de `@/components/ui/*` (mesmos componentes de `IdleAlertsSettingsSection`), tokens semânticos, e o padrão rascunho→salvar:

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type {
  CopilotReach,
  CopilotTrigger,
  ICopilotAssistantSettings,
  ID,
  RoleName,
} from "@/shared/types";
import { useWhatsAppAccountsProvider } from "@/providers/data";
import { useCopilotAssistantSettings } from "../hooks/useCopilotAssistantSettings";
import { estimateAssistantCost } from "../engine/estimateAssistantCost";
import { COPILOT_STRINGS } from "../i18n/pt-BR";
import { CopilotPlacementField } from "./CopilotPlacementField";

/** Measured in production on 2026-07-22 — see the audit in the spec. */
const ACTIVE_CONVERSATIONS_PER_DAY = 194;
const COST_PER_CALL_BRL = 0.025;
const OPENS_PER_CONVERSATION_PER_DAY = 5;

const REACHES: CopilotReach[] = ["all", "customer_only", "lead_only"];
const TRIGGERS: CopilotTrigger[] = ["on_demand", "on_open", "on_new_message"];
const SELECTABLE_ROLES: RoleName[] = ["Owner", "Gestor", "Vendedor", "SDR", "VendedorExterno"];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function CopilotAssistantSettingsSection({ storeId }: { storeId: ID | null }) {
  const S = COPILOT_STRINGS.settings;
  const { settings, loading, saving, update } = useCopilotAssistantSettings(storeId);
  const accountsProvider = useWhatsAppAccountsProvider();
  const [draft, setDraft] = useState<ICopilotAssistantSettings>(settings);
  const [accounts, setAccounts] = useState<Array<{ id: ID; label: string }>>([]);

  useEffect(() => setDraft(settings), [settings]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    // `list()` returns `IWhatsAppAccount[]` directly (not a paginated result),
    // and excludes WAHA on purpose. If the store uses WAHA numbers, list them
    // too via `listWaha` and merge — see the provider contract. Here we keep it
    // to `list()`; extend if a WAHA account must be selectable.
    void accountsProvider
      .list({ storeId })
      .then((rows) => {
        if (!cancelled) setAccounts(rows.map((a) => ({ id: a.id, label: a.label })));
      })
      .catch(() => {
        /* the account filter degrades to "todos" when the list fails */
      });
    return () => {
      cancelled = true;
    };
  }, [accountsProvider, storeId]);

  const estimate = estimateAssistantCost({
    settings: draft,
    activeConversationsPerDay: ACTIVE_CONVERSATIONS_PER_DAY,
    costPerCallBRL: COST_PER_CALL_BRL,
    opensPerConversationPerDay: OPENS_PER_CONVERSATION_PER_DAY,
  });

  const toggleIn = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value];

  const handleSave = async () => {
    try {
      await update({
        ...draft,
        cacheMinutes: clampInt(draft.cacheMinutes, 0, 1440),
        minNewMessages: clampInt(draft.minNewMessages, 1, 50),
        messageWindow: clampInt(draft.messageWindow, 5, 200),
        monthlyCapBRL: Math.max(0, draft.monthlyCapBRL),
        alertThresholdPct: clampInt(draft.alertThresholdPct, 1, 100),
      });
      toast.success(S.saved);
    } catch {
      toast.error(S.saveFailed);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      {/* Ativação e alcance */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.reach}
        </h3>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-foreground">{S.enabled}</p>
            <p className="text-xs text-muted-foreground">{S.enabledHint}</p>
          </div>
          <Switch
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
            aria-label={S.enabled}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.reachLabel}</Label>
          <div className="flex flex-wrap gap-2">
            {REACHES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, reach: r }))}
                aria-pressed={draft.reach === r}
                className={
                  draft.reach === r
                    ? "cursor-pointer rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-foreground"
                    : "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {S.reachOptions[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.accountsLabel}</Label>
          <p className="text-xs text-muted-foreground">{S.accountsHint}</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, accountIds: toggleIn(d.accountIds, a.id) }))}
                aria-pressed={draft.accountIds.includes(a.id)}
                className={
                  draft.accountIds.includes(a.id)
                    ? "cursor-pointer rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs text-foreground"
                    : "cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.rolesLabel}</Label>
          <p className="text-xs text-muted-foreground">{S.rolesHint}</p>
          <div className="flex flex-wrap gap-2">
            {SELECTABLE_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDraft((d) => ({ ...d, roles: toggleIn(d.roles, r) }))}
                aria-pressed={draft.roles.includes(r)}
                className={
                  draft.roles.includes(r)
                    ? "cursor-pointer rounded-full border border-primary/50 bg-primary/15 px-3 py-1 text-xs text-foreground"
                    : "cursor-pointer rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Quando analisar */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.timing}
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.triggerLabel}</Label>
          <div className="flex flex-wrap gap-2">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                type="button"
                disabled={draft.engine !== "ai"}
                onClick={() => setDraft((d) => ({ ...d, trigger: t }))}
                aria-pressed={draft.trigger === t}
                className={
                  draft.trigger === t
                    ? "cursor-pointer rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                    : "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                }
              >
                {S.triggerOptions[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="copilot-cache" className="text-xs">{S.cacheMinutesLabel}</Label>
            <Input
              id="copilot-cache"
              type="number"
              min={0}
              max={1440}
              disabled={draft.engine !== "ai"}
              value={draft.cacheMinutes}
              onChange={(e) => setDraft((d) => ({ ...d, cacheMinutes: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-minnew" className="text-xs">{S.minNewMessagesLabel}</Label>
            <Input
              id="copilot-minnew"
              type="number"
              min={1}
              max={50}
              disabled={draft.engine !== "ai"}
              value={draft.minNewMessages}
              onChange={(e) => setDraft((d) => ({ ...d, minNewMessages: Number(e.target.value) }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-window" className="text-xs">{S.messageWindowLabel}</Label>
            <Input
              id="copilot-window"
              type="number"
              min={5}
              max={200}
              value={draft.messageWindow}
              onChange={(e) => setDraft((d) => ({ ...d, messageWindow: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">{S.messageWindowHint}</p>
          </div>
        </div>
      </section>

      {/* O que o painel mostra */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.display}
        </h3>
        {(
          [
            ["showSummary", S.showSummary],
            ["showSuggestions", S.showSuggestions],
            ["showReplyButton", S.showReplyButton],
            ["autoExpandOnAlert", S.autoExpandOnAlert],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="flex items-center justify-between gap-4">
            <p className="text-sm text-foreground">{label}</p>
            <Switch
              checked={draft[field]}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, [field]: v }))}
              aria-label={label}
            />
          </div>
        ))}
        <div className="border-t border-border pt-3">
          <div className="mb-1.5 flex items-center gap-2">
            <Label className="text-xs">{S.placementLabel}</Label>
            <span className="rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {S.placementPersonal}
            </span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">{S.placementPersonalHint}</p>
          <CopilotPlacementField />
        </div>
      </section>

      {/* Motor */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.groups.engine}
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs">{S.engineLabel}</Label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, engine: "rules" }))}
              aria-pressed={draft.engine === "rules"}
              className={
                draft.engine === "rules"
                  ? "cursor-pointer rounded-md border border-primary/50 bg-primary/15 px-3 py-1.5 text-xs font-semibold text-foreground"
                  : "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {S.engineOptions.rules}
            </button>
            <button
              type="button"
              disabled
              title={S.engineAiLocked}
              className="cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-60"
            >
              {S.engineOptions.ai}
            </button>
            <span className="text-xs text-muted-foreground">{S.engineAiLocked}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="copilot-cap" className="text-xs">{S.monthlyCapLabel}</Label>
            <Input
              id="copilot-cap"
              type="number"
              min={0}
              step="10"
              value={draft.monthlyCapBRL}
              onChange={(e) => setDraft((d) => ({ ...d, monthlyCapBRL: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">{S.monthlyCapHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="copilot-threshold" className="text-xs">{S.alertThresholdLabel}</Label>
            <Input
              id="copilot-threshold"
              type="number"
              min={1}
              max={100}
              value={draft.alertThresholdPct}
              onChange={(e) =>
                setDraft((d) => ({ ...d, alertThresholdPct: Number(e.target.value) }))
              }
            />
          </div>
        </div>
      </section>

      {/* Estimativa viva */}
      <section className="rounded-lg border border-warning/40 bg-warning/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {S.estimateTitle}
        </p>
        {draft.engine === "rules" ? (
          <p className="mt-2 text-sm text-foreground">{S.estimateFree}</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-warning">
              ~R$ {estimate.monthlyBRL.toFixed(2).replace(".", ",")}/mês
            </p>
            {draft.monthlyCapBRL > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {S.estimateOfCap(estimate.pctOfCap)}
              </p>
            )}
          </>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{S.estimateAssumption}</p>
      </section>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {S.save}
        </Button>
      </div>
    </div>
  );
}
```

> Se os utilitários de severidade do projeto usarem outro prefixo (confira `src/styles.css`: pode ser `text-severity-warning` ou `text-warning`), use o que existir. Não invente token.

- [ ] **Step 3: Rewrite the route with the gate**

Substitua `src/routes/app.configuracoes.copiloto.tsx` inteiro por:

```tsx
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { useCurrentStore } from "@/features/multistore";
import { CopilotAssistantSettingsSection } from "@/features/copilot";
import { COPILOT_STRINGS } from "@/features/copilot/i18n/pt-BR";

export const Route = createFileRoute("/app/configuracoes/copiloto")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor"], { resource: "settings", action: "edit" }),
  component: CopilotSettingsPage,
});

function CopilotSettingsPage() {
  const strings = COPILOT_STRINGS.settings;
  const { currentStoreId } = useCurrentStore();

  return (
    <SettingsLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{strings.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{strings.description}</p>
        </div>
        <CopilotAssistantSettingsSection storeId={currentStoreId ?? null} />
      </div>
    </SettingsLayout>
  );
}
```

- [ ] **Step 4: Export from the barrel**

```ts
export { CopilotAssistantSettingsSection } from "./components/CopilotAssistantSettingsSection";
```

- [ ] **Step 5: Verify build and suite**

```bash
bun run build && bun run test
```

Expected: build ok, suíte verde.

- [ ] **Step 6: Manual check**

Suba o dev server (`bun run dev`), entre em `Configurações → Copiloto` como Dono e confirme: os cinco blocos aparecem, mexer no motor não é possível (IA travada), o botão salva com toast, e recarregar a página mantém os valores.

- [ ] **Step 7: Commit**

```bash
git add src/features/copilot src/routes/app.configuracoes.copiloto.tsx
git commit -m "feat(copilot): turn Configurações → Copiloto into the assistant control panel"
```

---

### Task 8: Ordenação e janela na Edge Function (A1)

O defeito mais grave: em produção a Edge lê as 200 mensagens **mais antigas**. 157 conversas passam desse limite; a maior tem 5.076 mensagens.

**Files:**
- Modify: `supabase/functions/copilot-generate/index.ts:32, 121-127`
- Test: `supabase/functions/copilot-generate/prompt.test.ts` (acrescentar caso)

**Interfaces:**
- Consumes: `buildReplyPrompt({ messages, customer })` — inalterado.
- Produces: nenhum símbolo novo; muda o conjunto de mensagens entregue ao prompt.

- [ ] **Step 1: Write the failing test**

Acrescente a `supabase/functions/copilot-generate/prompt.test.ts`:

```ts
it("usa as mensagens MAIS RECENTES quando há mais que a janela", () => {
  const messages = Array.from({ length: 60 }, (_, i) => ({
    direction: (i % 2 === 0 ? "in" : "out") as "in" | "out",
    authorType: i % 2 === 0 ? "customer" : "seller",
    text: `mensagem ${i}`,
    sentAt: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
  }));

  const prompt = buildReplyPrompt({ messages, maxMessages: 30 });

  expect(prompt).toContain("mensagem 59");
  expect(prompt).not.toContain("mensagem 0");
});
```

- [ ] **Step 2: Run the test**

```bash
bunx vitest run supabase/functions/copilot-generate/prompt.test.ts
```

Expected: PASS. `buildReplyPrompt` **já está correto** — ele corta as últimas N do que recebe. O defeito está em *quais* mensagens a Edge entrega. Este teste é a rede de segurança que trava o comportamento correto do builder; a correção real vem no passo seguinte.

- [ ] **Step 3: Fix the query in the Edge**

Em `supabase/functions/copilot-generate/index.ts`, substitua a constante (linha 32) e o bloco de leitura (linhas 121-127):

```ts
const DEFAULT_MESSAGE_WINDOW = 40;
const MAX_MESSAGE_WINDOW = 200;
```

```ts
  // 3. Messages (RLS via caller). Read the MOST RECENT window, then flip to
  // ascending for the prompt. Reading ascending with a plain limit — as this
  // did — returns the OLDEST messages, so on a long conversation the model
  // was answering a discussion from months ago.
  const windowSize = Math.min(
    MAX_MESSAGE_WINDOW,
    Math.max(5, Number(settings.copilotMessageWindow ?? DEFAULT_MESSAGE_WINDOW)),
  );
  const { data: msgsDesc, error: mErr } = await callerClient
    .from("messages")
    .select("direction, author_type, text, sent_at, id")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    // Stable tiebreak: `sent_at` has second granularity on imported messages and
    // ties are common in bursts — without it the window cut is non-deterministic.
    .order("id", { ascending: false })
    .limit(windowSize);
  if (mErr) throw new HttpError(500, `messages read failed: ${mErr.message}`);
  const msgs = (msgsDesc ?? []).slice().reverse();
```

O `settings.copilotMessageWindow` vem de uma leitura nova. Logo após o bloco que carrega `ai_settings` (passo 2 do handler), acrescente:

```ts
  // Assistant message window lives with the store settings, not with ai_settings.
  const { data: storeRow } = await admin
    .from("stores")
    .select("settings")
    .eq("id", conv.store_id)
    .maybeSingle<{ settings: { copilotAssistant?: { messageWindow?: number } } | null }>();
  const copilotMessageWindow = storeRow?.settings?.copilotAssistant?.messageWindow;
```

e troque `settings.copilotMessageWindow` por `copilotMessageWindow` na expressão do `windowSize`.

Isso exige que a query da conversa (passo 1) também traga `store_id`:

```ts
    .select("id, customer_id, store_id")
```

e o tipo do `maybeSingle`:

```ts
    .maybeSingle<{ id: string; customer_id: string | null; store_id: string }>();
```

- [ ] **Step 4: Run the prompt suite**

```bash
bunx vitest run supabase/functions/copilot-generate/prompt.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/copilot-generate/index.ts supabase/functions/copilot-generate/prompt.test.ts
git commit -m "fix(copilot): read the most recent messages instead of the oldest 200"
```

> **Sem deploy este commit não tem efeito em produção.** Ver a ordem de rollout no fim do plano.

---

### Task 9: Teto de orçamento à prova de concorrência (A6)

Hoje a checagem soma e compara em JavaScript, entre duas viagens ao banco. Com uma pessoa clicando isso nunca falhou; com o disparo automático do Sub-projeto B, chamadas simultâneas leem o mesmo total antigo e passam juntas.

**Files:**
- Create: `supabase/migrations/20260722120000_ai_budget_try_consume.sql`
- Modify: `supabase/functions/copilot-generate/index.ts` (`monthSpendBRL` → RPC)

**Interfaces:**
- Consumes: tabelas `ai_usage_events`, `ai_settings`, `stores`.
- Produces: `public.ai_budget_try_consume(p_feature text, p_estimated_brl numeric) returns boolean` — `true` quando há espaço no teto.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260722120000_ai_budget_try_consume.sql`:

```sql
-- AI budget check that survives concurrency (spec 2026-07-22, A6).
--
-- The previous check summed `ai_usage_events` in the Edge Function and compared
-- in JavaScript, across two round-trips. With a human pressing a button that
-- never failed; with the automatic analysis of sub-project B, concurrent calls
-- read the same stale total and all pass the cap together.
--
-- This takes a transaction-level advisory lock keyed on the current month, so
-- concurrent callers serialise on the check. Returns TRUE when there is room.

create or replace function public.ai_budget_try_consume(
  p_feature text,
  p_estimated_brl numeric default 0
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc');
  v_lock_key bigint := hashtext('ai_budget:' || to_char(v_month_start, 'YYYY-MM'));
  v_spent numeric;
  v_platform_cap numeric;
  v_feature_spent numeric;
  v_feature_cap numeric;
begin
  -- Serialise concurrent budget checks for the current month.
  perform pg_advisory_xact_lock(v_lock_key);

  select coalesce((budget->>'monthlyCapBRL')::numeric, 0)
    into v_platform_cap
    from public.ai_settings
   where id = 1;

  select coalesce(sum(cost_brl), 0)
    into v_spent
    from public.ai_usage_events
   where ts >= v_month_start;

  if coalesce(v_platform_cap, 0) > 0
     and v_spent + coalesce(p_estimated_brl, 0) >= v_platform_cap then
    return false;
  end if;

  -- The assistant keeps its own sub-cap inside the platform-wide one.
  if p_feature = 'conversation_copilot' then
    select coalesce(
             max((settings->'copilotAssistant'->>'monthlyCapBRL')::numeric),
             0
           )
      into v_feature_cap
      from public.stores;

    if coalesce(v_feature_cap, 0) > 0 then
      select coalesce(sum(cost_brl), 0)
        into v_feature_spent
        from public.ai_usage_events
       where ts >= v_month_start
         and feature = p_feature;

      if v_feature_spent + coalesce(p_estimated_brl, 0) >= v_feature_cap then
        return false;
      end if;
    end if;
  end if;

  return true;
end;
$$;

revoke all on function public.ai_budget_try_consume(text, numeric) from public;
revoke all on function public.ai_budget_try_consume(text, numeric) from anon, authenticated;
grant execute on function public.ai_budget_try_consume(text, numeric) to service_role;

comment on function public.ai_budget_try_consume(text, numeric) is
  'Concurrency-safe AI budget gate (spec 2026-07-22). service_role only — called from Edge Functions.';
```

- [ ] **Step 2: Use the RPC in the Edge Function**

Em `supabase/functions/copilot-generate/index.ts`, remova a função `monthSpendBRL` inteira e substitua o passo 6 do handler por:

```ts
  // 6. Budget gate — concurrency-safe (advisory lock inside the RPC).
  const { data: hasRoom, error: budgetErr } = await admin.rpc("ai_budget_try_consume", {
    p_feature: FEATURE,
    p_estimated_brl: 0,
  });
  if (budgetErr) throw new HttpError(500, `budget check failed: ${budgetErr.message}`);
  if (hasRoom !== true) throw new HttpError(402, "orçamento de IA do mês esgotado");
```

Remova o import de `SupabaseClient` se ele só era usado por `monthSpendBRL`.

- [ ] **Step 3: Verify the SQL parses**

Nenhum teste automatizado cobre SQL neste repositório. Valide a sintaxe rodando a migration num branch do Supabase **ou** revisando-a com atenção — ela **não** deve ser aplicada em produção neste passo. A aplicação em produção é o passo 1 do rollout, e exige OK do dono.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260722120000_ai_budget_try_consume.sql supabase/functions/copilot-generate/index.ts
git commit -m "feat(ai): make the monthly budget cap safe under concurrency"
```

---

### Task 10: Documentação e PR

**Files:**
- Create: `docs/dev/copilot-assistant-settings.md`
- Modify: `docs/dev/copilot-ai-reply.md` (nota sobre a correção da janela)

- [ ] **Step 1: Write the feature doc**

Create `docs/dev/copilot-assistant-settings.md` cobrindo: onde vivem os parâmetros (`stores.settings->'copilotAssistant'`), a tabela de "qual parâmetro é respeitado onde" (copie de §6 da spec), a fronteira com `Configurações → IA`, e a ordem de rollout.

- [ ] **Step 2: Note the fix in the existing doc**

Em `docs/dev/copilot-ai-reply.md`, na seção "Arquitetura", acrescente após o passo 5:

```markdown
> **Correção 2026-07-22:** a leitura de mensagens era `sent_at ascending` com
> `limit(200)` — as 200 mensagens MAIS ANTIGAS. Passou a ler a janela mais
> recente (`descending` + desempate por `id`, revertida antes do prompt), com o
> tamanho vindo de `stores.settings->'copilotAssistant'->>'messageWindow'`.
```

- [ ] **Step 3: Run the full gate**

```bash
bun run build && bun run test && bun run lint
```

Expected: os três verdes.

- [ ] **Step 4: Commit and open the draft PR**

```bash
git add docs/dev/copilot-assistant-settings.md docs/dev/copilot-ai-reply.md
git commit -m "docs(copilot): document the assistant control panel and the window fix"
git push -u origin worktree-copilot-conversa-gaps
gh pr create --draft --title "feat(copilot): parameterisable foundation for the conversation assistant" --body "$(cat <<'EOF'
## O que muda

Fecha os cinco defeitos auditados do painel Copiloto, blinda o teto de orçamento de IA contra concorrência, e transforma toda decisão de comportamento em parâmetro numa tela de controle.

Spec: `docs/superpowers/specs/2026-07-22-copiloto-conversa-fundacao-design.md`
Mockups: `docs/superpowers/mockups/2026-07-22-copiloto-conversa-mockups.html`

### Defeitos corrigidos

- A Edge lia as **200 mensagens mais antigas** (157 conversas em produção passam desse limite; a maior tem 5.076).
- O painel **não existia** em conversa de lead — 2.919 de 3.444 conversas, 85% da base.
- A busca de dados do painel rodava **em toda conversa aberta**, inclusive nas que nada renderizavam.
- A leitura paginava **todas** as mensagens para alimentar três regras de palavra-chave.
- O resumo abria com a **primeira mensagem da conversa inteira**.

### Nenhum custo novo de IA é ligado

O motor permanece em "Regras". A opção "Inteligência artificial" aparece travada na tela — ela é destravada pelo Sub-projeto B.

## Rollout — a ordem importa

1. Aplicar a migration `20260722120000_ai_budget_try_consume.sql` em produção.
2. Deployar a Edge: `npx supabase functions deploy copilot-generate --project-ref njizaasajkdqptlxddqn`
3. Mergear este PR.
4. Smoke: abrir uma conversa de lead e confirmar o painel; abrir uma conversa com mais de 200 mensagens, gerar resposta com IA e conferir que o rascunho fala do assunto atual.

⚠️ O workflow "Edge Functions deploy" do repositório é no-op — passa verde sem deployar. O deploy tem de ser pela CLI.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollout

A ordem não é negociável:

1. **Migration** `20260722120000_ai_budget_try_consume.sql` aplicada em produção (com OK do dono).
2. **Deploy da Edge** `copilot-generate` pela CLI. Sem ele, a correção do bug das 200 mensagens não existe em produção.
3. **Merge do PR.**
4. **Smoke:** conversa de lead mostra painel; conversa longa gera resposta sobre o assunto atual; `ai_usage_events` registra o evento.

## Self-Review

**Cobertura da spec:**

| Requisito da spec | Task |
|---|---|
| §A1 ordenação das mensagens na Edge | Task 8 |
| §A2 painel nas conversas de lead | Task 3 (dados) + Task 6 (frontend) |
| §A3 buscar só quando o painel aparece | Task 1 (engine) + Task 6 (uso) |
| §A4 janela limitada de mensagens | Task 5 |
| §A5 resumo ancorado no fim | Task 4 |
| §A6 teto de orçamento atômico | Task 9 |
| §A7 painel de controle | Task 2 (estimativa) + Task 6 (hook) + Task 7 (tela) |
| §3.4 gate da rota Owner+Gestor | Task 7 |
| §4 tipo e defaults | Task 1 |
| §6 tabela "parâmetro respeitado onde" | Task 10 (doc) |
| §8 rollout | Task 10 (PR) + seção Rollout |

Sem lacunas.

**Consistência de tipos:** `ICopilotAssistantSettings` (Task 1) é consumido por `shouldMountCopilot` (1), `estimateAssistantCost` (2), `useCopilotAssistantSettings` (6), `ICopilotPanelState` (6) e a tela (7) — mesmo nome em todos. `ICopilotPanelOptions` (Task 5) é o tipo do contrato; `IUseCopilotPanelOptions` (Task 6) é o do hook — nomes distintos de propósito, porque o hook aceita `enabled` e `settings` que o provider não conhece. `getPanelData` muda de aridade uma única vez, na Task 5, e ambas as implementações são atualizadas no mesmo commit.

**Risco de ordem:** a Task 6 depende das Tasks 1, 3, 4 e 5; a Task 7 depende de 1, 2 e 6. As Tasks 8 e 9 são backend e independem das demais — podem ser feitas em paralelo, mas o PR só fecha com todas.

**Correções aplicadas na auto-revisão (contra o código, não contra a memória):**

1. Testes do copiloto usavam `mockStore.getState()`, que **não é acessível** do arquivo de teste — trocado pelo padrão real do arquivo (`conversationsApi.list({ storeId: SEED_STORE_ID }).data.find(...)`), com nota sobre o caso de o seed não ter conversa só de lead.
2. `whatsappAccounts.list()` retorna `IWhatsAppAccount[]` **direto**, não `{ data }` — a desestruturação foi corrigida, com nota de que WAHA fica fora do `list()` (usa `listWaha`).
3. Tokens `text-severity-warning`/`bg-severity-warning` **não existem** para texto/fundo — trocados por `text-warning`/`bg-warning`, que é o que o `CopilotHeader` já usa.
4. `text-info` confirmado como token existente (não `text-severity-info`).
5. `conversations.store_id` confirmado existente (`text`, migration `20260608151350`) — a leitura da janela por loja na Edge (Task 8) é válida.
