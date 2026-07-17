# Alertas de Conversas Ociosas (Sub-projeto A) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar o atendente, em 3 níveis progressivos (badge/painel → notificação+toast → banner fixo + gestor), das conversas atribuídas a ele em que o cliente aguarda resposta, incluindo um "Briefing do dia" no login explícito.

**Architecture:** Coluna `conversations.awaiting_reply_since` mantida por triggers; classificação de nível em horas úteis da agenda do atendente via função SQL `idle_business_seconds` espelhada em engine TS (paridade SQL≡JS); regra nova `conversa.ociosa` dentro do reconciler pg_cron existente (`reconcile_derived_notifications`, roda 1×/min); leitura pela RPC gated-once `idle_conversations_summary()`; UI em feature nova `src/features/idle-alerts/`.

**Tech Stack:** React 19 + TanStack Router/Query, Tailwind v4 + shadcn/ui, Vitest, Supabase (Postgres/RLS/pg_cron), Provider Pattern.

**Spec:** `docs/superpowers/specs/2026-07-16-idle-conversation-alerts-design.md` (leia antes de começar).

## Global Constraints

- Worktree: `D:\claude\gallo-basediesel\.claude\worktrees\idle-conversation-alerts`, branch `worktree-idle-conversation-alerts`. TODO comando roda a partir desse diretório.
- Copy de UI em pt-BR com acentos corretos; comentários de código em inglês; componentes usam APENAS tokens semânticos (`bg-background`, `text-severity-critical`, …), nunca `--gallo-*`/hex.
- ESLint boundaries: fora de `src/mocks/**` e `src/providers/data/**` NUNCA importar `@/mocks` nem `@/providers/data/impl/*` — só o barrel `@/providers/data`.
- **Cache do Atendimento CONGELADO**: não alterar query keys, realtime, `useMessages`, signing de mídia, `list_conversations`/`count_conversations` nem `rowToConversation`. A feature nova só ADICIONA método/RPC próprios.
- `IConversation` (tipo TS) NÃO ganha campo novo — o dado flui exclusivamente pela RPC/summary (evita quebrar prod antes da migration: lição "coluna nova no SELECT quebra prod").
- Migration: arquivo versionado em `supabase/migrations/` no PR; **aplicar em prod SÓ com OK explícito do dono** (via MCP `apply_migration`), e **antes** do deploy do frontend.
- Sem merge sem OK do dono — integração via push + PR.
- Testes: Vitest (`bun run test`); gate de CI = `bun run build` + `bun run test`; tsc por delta (`bunx tsc --noEmit`, baseline ~315 erros pré-existentes).
- Defaults dos thresholds: `{ enabled: false, level1Hours: 2, level2Hours: 8, level3Hours: 24, notifyManagerOnLevel3: true }` (horas ÚTEIS).
- `scheduleOverrides` ficam FORA do cálculo de horas úteis na v1 (só a grade semanal) — nos DOIS lados do espelho SQL≡JS.
- Clamp de janela: o cálculo de horas úteis considera no máximo os últimos **90 dias** (`p_from` clampado a `p_to - 90 days`) — evita loops longos; 90 dias úteis excede qualquer threshold. Mesmo clamp nos dois lados.

---

### Task 1: Engine `idleBusinessTime` (TDD)

**Files:**
- Create: `src/features/idle-alerts/engine/idleBusinessTime.ts`
- Test: `src/features/idle-alerts/engine/idleBusinessTime.test.ts`

**Interfaces:**
- Consumes: `IWorkSchedule` de `@/shared/types` (janelas `{weekday: 0-6, openAt: "08:00", closeAt: "18:00", enabled}`; São Paulo = UTC−03:00 fixo, ver `src/features/access/engine/workSchedule.ts`).
- Produces: `businessSecondsBetween(schedule: IWorkSchedule | undefined, from: Date, to: Date): number` — segundos úteis entre dois instantes. Sem agenda/vazia ⇒ diferença corrida. Clamp de 90 dias.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/idle-alerts/engine/idleBusinessTime.test.ts
import { describe, expect, it } from "vitest";
import { businessSecondsBetween } from "./idleBusinessTime";
import type { IWorkSchedule } from "@/shared/types";

// Mon-Fri 08:00-18:00 São Paulo (weekday 1..5)
const WEEKDAYS: IWorkSchedule = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday: weekday as 1 | 2 | 3 | 4 | 5,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

/** Builds a UTC Date for the given São Paulo wall-clock time (UTC-03:00). */
function sp(iso: string): Date {
  return new Date(`${iso}-03:00`);
}

describe("businessSecondsBetween", () => {
  it("returns raw elapsed seconds when there is no schedule", () => {
    const from = sp("2026-07-13T10:00:00"); // Monday
    const to = sp("2026-07-13T12:30:00");
    expect(businessSecondsBetween(undefined, from, to)).toBe(2.5 * 3600);
    expect(businessSecondsBetween([], from, to)).toBe(2.5 * 3600);
  });

  it("counts only the in-window part of a single day", () => {
    // Monday 07:00 → 09:00: only 08:00-09:00 counts.
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-13T07:00:00"), sp("2026-07-13T09:00:00")),
    ).toBe(3600);
  });

  it("skips the weekend entirely", () => {
    // Saturday 10:00 → Monday 09:00: only Monday 08:00-09:00 counts.
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-11T10:00:00"), sp("2026-07-13T09:00:00")),
    ).toBe(3600);
  });

  it("sums full days across the week", () => {
    // Monday 08:00 → Wednesday 18:00 = 3 × 10h.
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-13T08:00:00"), sp("2026-07-15T18:00:00")),
    ).toBe(30 * 3600);
  });

  it("ignores disabled windows", () => {
    const onlyMonday: IWorkSchedule = [
      { weekday: 1, openAt: "08:00", closeAt: "12:00", enabled: true },
      { weekday: 2, openAt: "08:00", closeAt: "12:00", enabled: false },
    ];
    expect(
      businessSecondsBetween(onlyMonday, sp("2026-07-13T08:00:00"), sp("2026-07-14T12:00:00")),
    ).toBe(4 * 3600);
  });

  it("returns 0 when to <= from", () => {
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-13T12:00:00"), sp("2026-07-13T12:00:00")),
    ).toBe(0);
  });

  it("clamps the window to the last 90 days", () => {
    // 1 year ago with no schedule: raw diff clamped to 90 days.
    const to = sp("2026-07-13T00:00:00");
    const from = new Date(to.getTime() - 365 * 86400_000);
    expect(businessSecondsBetween(undefined, from, to)).toBe(90 * 86400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/idle-alerts/engine/idleBusinessTime.test.ts`
Expected: FAIL — `Cannot find module './idleBusinessTime'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/idle-alerts/engine/idleBusinessTime.ts
import type { IWorkSchedule } from "@/shared/types";

/**
 * Business-time elapsed between two instants, following the seller's weekly
 * attendance schedule (PRD-212). São Paulo is a fixed UTC-03:00 offset (no DST
 * since 2019) — same convention as src/features/access/engine/workSchedule.ts.
 *
 * MUST stay in exact parity with the SQL mirror `public.idle_business_seconds`
 * (supabase/migrations/20260716190000_idle_conversation_alerts.sql):
 * - absent/empty schedule ⇒ raw elapsed seconds;
 * - only `enabled` windows count; scheduleOverrides are OUT of scope (v1);
 * - the window is clamped to the last 90 days.
 */
const SAO_PAULO_OFFSET_MINUTES = 180;
const CLAMP_DAYS = 90;

function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

export function businessSecondsBetween(
  schedule: IWorkSchedule | undefined,
  from: Date,
  to: Date,
): number {
  if (!(to.getTime() > from.getTime())) return 0;
  const clampedFromMs = Math.max(from.getTime(), to.getTime() - CLAMP_DAYS * 86400_000);

  const windows = (schedule ?? []).filter((w) => w.enabled);
  if (windows.length === 0) return Math.floor((to.getTime() - clampedFromMs) / 1000);

  // Shift to São Paulo wall clock expressed as UTC, then walk day by day.
  const offsetMs = SAO_PAULO_OFFSET_MINUTES * 60_000;
  const fromSp = clampedFromMs - offsetMs;
  const toSp = to.getTime() - offsetMs;

  let total = 0;
  // Midnight (UTC) of the shifted `from` day.
  let dayStart = new Date(fromSp);
  dayStart = new Date(
    Date.UTC(dayStart.getUTCFullYear(), dayStart.getUTCMonth(), dayStart.getUTCDate()),
  );
  for (let cursor = dayStart.getTime(); cursor < toSp; cursor += 86400_000) {
    const weekday = new Date(cursor).getUTCDay();
    for (const win of windows) {
      if (win.weekday !== weekday) continue;
      const open = timeToMinutes(win.openAt);
      const close = timeToMinutes(win.closeAt);
      if (Number.isNaN(open) || Number.isNaN(close) || close <= open) continue;
      const winStart = cursor + open * 60_000;
      const winEnd = cursor + close * 60_000;
      const overlap = Math.min(winEnd, toSp) - Math.max(winStart, fromSp);
      if (overlap > 0) total += overlap;
    }
  }
  return Math.floor(total / 1000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/idle-alerts/engine/idleBusinessTime.test.ts`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add src/features/idle-alerts/engine/idleBusinessTime.ts src/features/idle-alerts/engine/idleBusinessTime.test.ts
git commit -m "feat(idle-alerts): add business-time engine (PRD-212 schedule, SQL parity)"
```

---

### Task 2: Settings type + engine `idleLevel` + `formatElapsed` (TDD)

**Files:**
- Modify: `src/shared/types/platform.ts` (após `IManagerDashboardSettings`, ~linha 161)
- Create: `src/features/idle-alerts/config/defaults.ts`
- Create: `src/features/idle-alerts/engine/idleLevel.ts`
- Test: `src/features/idle-alerts/engine/idleLevel.test.ts`
- Modify: `src/providers/data/engine/buildDefaultSettings.ts` (adicionar `idleAlerts`)

**Interfaces:**
- Produces: `IIdleAlertsSettings` (shared/types), `DEFAULT_IDLE_ALERTS_SETTINGS`, `computeIdleLevel(businessSeconds: number, settings: IIdleAlertsSettings): 0 | 1 | 2 | 3`, `formatElapsed(fromIso: string, now: Date): string` (ex.: `"4d 2h"`, `"3h"`, `"25min"`).

- [ ] **Step 1: Add the settings type**

Em `src/shared/types/platform.ts`, logo após `IManagerDashboardSettings` (linha ~161):

```ts
/**
 * Idle-conversation alert thresholds (spec 2026-07-16). Units are BUSINESS
 * hours of the assigned seller's work schedule (PRD-212); sellers without a
 * schedule accrue raw clock time. Stored at `stores.settings->'idleAlerts'`
 * and read by the server-side reconciler — keep keys in sync with the SQL.
 */
export interface IIdleAlertsSettings {
  enabled: boolean;
  /** Level 1 "Atenção" — business hours until the passive badge counts it. */
  level1Hours: number;
  /** Level 2 "Alerta" — business hours until the aggregated notification. */
  level2Hours: number;
  /** Level 3 "Crítica" — business hours until the fixed banner + manager. */
  level3Hours: number;
  notifyManagerOnLevel3: boolean;
}
```

E em `IPlatformSettings` (após o campo `managerDashboard` na ~linha 232):

```ts
  /** Idle-conversation alerts (spec 2026-07-16). Undefined → DEFAULT_IDLE_ALERTS_SETTINGS. */
  idleAlerts?: IIdleAlertsSettings;
```

Confirme que `IIdleAlertsSettings` é exportado pelo barrel `src/shared/types/index.ts` (o barrel reexporta `platform.ts` inteiro via `export *` — verifique com `rg "platform" src/shared/types/index.ts`).

- [ ] **Step 2: Create the defaults**

```ts
// src/features/idle-alerts/config/defaults.ts
import type { IIdleAlertsSettings } from "@/shared/types";

/**
 * Defaults for idle-conversation alerts. `enabled: false` by design — the
 * rollout turns each store on only after the owner reviews the backfilled
 * backlog (spec: Rollout). 2/8/24 business hours ≈ "2h / 1 working day /
 * 3 working days" on a typical ~8h schedule.
 */
export const DEFAULT_IDLE_ALERTS_SETTINGS: IIdleAlertsSettings = {
  enabled: false,
  level1Hours: 2,
  level2Hours: 8,
  level3Hours: 24,
  notifyManagerOnLevel3: true,
};
```

Em `src/providers/data/engine/buildDefaultSettings.ts`, junto ao clone do `managerDashboard` (~linha 52), adicione (import respeitando o padrão local do arquivo — se ele não puder importar de features, defina o literal inline com comentário de espelho):

```ts
    idleAlerts: clone(DEFAULT_IDLE_ALERTS_SETTINGS),
```

⚠️ Verifique os imports existentes de `buildDefaultSettings.ts`: se os demais defaults vêm de `@/features/...`, importe de lá; caso contrário replique o literal e anote `// mirror of src/features/idle-alerts/config/defaults.ts`.

- [ ] **Step 3: Write the failing test**

```ts
// src/features/idle-alerts/engine/idleLevel.test.ts
import { describe, expect, it } from "vitest";
import { computeIdleLevel, formatElapsed } from "./idleLevel";
import { DEFAULT_IDLE_ALERTS_SETTINGS } from "../config/defaults";

const S = { ...DEFAULT_IDLE_ALERTS_SETTINGS, enabled: true };

describe("computeIdleLevel", () => {
  it("maps business seconds onto the 0-3 ladder", () => {
    expect(computeIdleLevel(0, S)).toBe(0);
    expect(computeIdleLevel(2 * 3600 - 1, S)).toBe(0);
    expect(computeIdleLevel(2 * 3600, S)).toBe(1);
    expect(computeIdleLevel(8 * 3600, S)).toBe(2);
    expect(computeIdleLevel(24 * 3600, S)).toBe(3);
    expect(computeIdleLevel(999 * 3600, S)).toBe(3);
  });
});

describe("formatElapsed", () => {
  const now = new Date("2026-07-16T12:00:00-03:00");
  it("formats minutes, hours and days (pt-BR compact)", () => {
    expect(formatElapsed("2026-07-16T11:35:00-03:00", now)).toBe("25min");
    expect(formatElapsed("2026-07-16T09:00:00-03:00", now)).toBe("3h");
    expect(formatElapsed("2026-07-12T10:00:00-03:00", now)).toBe("4d 2h");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun run test -- src/features/idle-alerts/engine/idleLevel.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 5: Write minimal implementation**

```ts
// src/features/idle-alerts/engine/idleLevel.ts
import type { IIdleAlertsSettings } from "@/shared/types";

/** Ladder position for a conversation, from business seconds waited. */
export function computeIdleLevel(
  businessSeconds: number,
  settings: IIdleAlertsSettings,
): 0 | 1 | 2 | 3 {
  if (businessSeconds >= settings.level3Hours * 3600) return 3;
  if (businessSeconds >= settings.level2Hours * 3600) return 2;
  if (businessSeconds >= settings.level1Hours * 3600) return 1;
  return 0;
}

/** Compact pt-BR elapsed label from an ISO instant: "25min", "3h", "4d 2h". */
export function formatElapsed(fromIso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(fromIso).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun run test -- src/features/idle-alerts/engine/idleLevel.test.ts`
Expected: PASS. Rode também `bunx tsc --noEmit` e confira que NENHUM erro novo aparece nos arquivos criados/modificados (baseline pré-existente à parte).

- [ ] **Step 7: Commit**

```bash
git add src/shared/types/platform.ts src/features/idle-alerts/config/defaults.ts src/features/idle-alerts/engine/idleLevel.ts src/features/idle-alerts/engine/idleLevel.test.ts src/providers/data/engine/buildDefaultSettings.ts
git commit -m "feat(idle-alerts): settings type, defaults and level engine"
```

---

### Task 3: Tipos do summary + contrato `getIdleSummary` + impl mock

**Files:**
- Modify: `src/shared/types/conversation.ts` (fim do arquivo)
- Modify: `src/providers/data/contracts/conversations.ts`
- Modify: `src/mocks/api/conversations.ts` (novo endpoint)
- Modify: `src/providers/data/impl/mock/conversations.ts`
- Test: `src/features/idle-alerts/engine/groupByLevel.test.ts` + Create `src/features/idle-alerts/engine/groupByLevel.ts`

**Interfaces:**
- Produces:

```ts
export interface IIdleConversationEntry {
  conversationId: ID;
  contactName: string;
  lastInboundPreview: string | null;
  awaitingReplySince: ISO8601;
  businessSeconds: number;
  level: 1 | 2 | 3;
}
export interface IIdleSummary {
  /** Counts per level, computed over ALL entries (list capped at 500). */
  counts: { level1: number; level2: number; level3: number };
  /** Ordered worst-first: level desc, businessSeconds desc. */
  entries: IIdleConversationEntry[];
}
```
- `IConversationsProvider.getIdleSummary(): Promise<IIdleSummary>` — pendências do PRÓPRIO seller autenticado/logado. Retorna `{counts:{0,0,0}, entries:[]}` quando o toggle da loja está OFF.
- `groupByLevel(entries): { critical: IIdleConversationEntry[]; alert: ...; attention: ... }`.

- [ ] **Step 1: Add the shared types** — em `src/shared/types/conversation.ts` (final do arquivo), colar o bloco `IIdleConversationEntry`/`IIdleSummary` acima com este doc-comment: `/** Idle-conversation summary (spec 2026-07-16) — read model of idle_conversations_summary(). */`. Import `ID`/`ISO8601` já existem no arquivo.

- [ ] **Step 2: Extend the contract** — em `src/providers/data/contracts/conversations.ts`, adicionar ao `IConversationsProvider` (após `searchMessages`):

```ts
  /**
   * Idle-conversation summary for the SIGNED-IN seller (spec 2026-07-16):
   * conversations assigned to them where the customer awaits a reply, with
   * level (1-3) computed in business hours of their PRD-212 schedule.
   * Supabase: SECURITY DEFINER RPC `idle_conversations_summary` (gated-once).
   * Mock: deterministic computation over the mock store. Store toggle OFF ⇒
   * empty summary.
   */
  getIdleSummary(): Promise<IIdleSummary>;
```

Import `IIdleSummary` no topo junto aos demais tipos de `@/shared/types`.

- [ ] **Step 3: Write the failing engine test (groupByLevel)**

```ts
// src/features/idle-alerts/engine/groupByLevel.test.ts
import { describe, expect, it } from "vitest";
import { groupByLevel } from "./groupByLevel";
import type { IIdleConversationEntry } from "@/shared/types";

function entry(level: 1 | 2 | 3, id: string): IIdleConversationEntry {
  return {
    conversationId: id,
    contactName: `c-${id}`,
    lastInboundPreview: null,
    awaitingReplySince: "2026-07-16T10:00:00.000Z",
    businessSeconds: level * 10_000,
    level,
  };
}

describe("groupByLevel", () => {
  it("splits entries by level keeping order", () => {
    const groups = groupByLevel([entry(3, "a"), entry(1, "b"), entry(2, "c"), entry(3, "d")]);
    expect(groups.critical.map((e) => e.conversationId)).toEqual(["a", "d"]);
    expect(groups.alert.map((e) => e.conversationId)).toEqual(["c"]);
    expect(groups.attention.map((e) => e.conversationId)).toEqual(["b"]);
  });
});
```

Run: `bun run test -- src/features/idle-alerts/engine/groupByLevel.test.ts` → FAIL.

- [ ] **Step 4: Implement groupByLevel**

```ts
// src/features/idle-alerts/engine/groupByLevel.ts
import type { IIdleConversationEntry } from "@/shared/types";

export interface IIdleGroups {
  critical: IIdleConversationEntry[];
  alert: IIdleConversationEntry[];
  attention: IIdleConversationEntry[];
}

export function groupByLevel(entries: IIdleConversationEntry[]): IIdleGroups {
  const groups: IIdleGroups = { critical: [], alert: [], attention: [] };
  for (const e of entries) {
    if (e.level === 3) groups.critical.push(e);
    else if (e.level === 2) groups.alert.push(e);
    else groups.attention.push(e);
  }
  return groups;
}
```

Run: PASS.

- [ ] **Step 5: Mock endpoint (dados crus, SEM cálculo de nível)** — a camada `src/mocks/**` não importa de `features`, então o endpoint devolve dados crus e o cálculo (engine + settings) vive no provider (Step 6). Em `src/mocks/api/conversations.ts`, adicionar:

```ts
/**
 * Raw awaiting-reply rows for the idle summary (spec 2026-07-16). No level
 * computation here — the mock PROVIDER applies the engine + store settings.
 */
export interface IAwaitingReplyRaw {
  items: {
    conversationId: ID;
    contactName: string;
    lastInboundPreview: string | null;
    awaitingReplySince: ISO8601;
  }[];
  workSchedule: IWorkSchedule | undefined;
  settings: IPlatformSettings;
}

export async function listAwaitingReply(sellerId: ID): Promise<IAwaitingReplyRaw> {
  const state = mockStore.getState();
  const seller = state.sellers.find((s) => s.id === sellerId);
  const active = state.conversations.filter(
    (c) =>
      c.assignedSellerId === sellerId &&
      ["aguardando", "em_andamento", "aguardando_cliente"].includes(c.status),
  );
  const items: IAwaitingReplyRaw["items"] = [];
  for (const conv of active) {
    const msgs = state.messages
      .filter((m) => m.conversationId === conv.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lastOutboundAt = [...msgs].reverse().find((m) => m.direction === "outbound")?.createdAt;
    const firstUnanswered = msgs.find(
      (m) => m.direction === "inbound" && (!lastOutboundAt || m.createdAt > lastOutboundAt),
    );
    if (!firstUnanswered) continue;
    const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound");
    items.push({
      conversationId: conv.id,
      contactName: resolveContactName(conv, state),
      lastInboundPreview: lastInbound?.text ?? null,
      awaitingReplySince: firstUnanswered.createdAt,
    });
  }
  const platform = state.stores.find((s) => s.id === seller?.storeId)?.settings;
  return { items, workSchedule: seller?.workSchedule, settings: platform! };
}
```

⚠️ ANTES de colar: leia o topo de `src/mocks/api/conversations.ts` e adapte aos nomes REAIS — (a) como o arquivo acessa o estado (`mockStore.getState()` vs helper local), (b) shape do state (`conversations`/`messages`/`sellers`/`stores`), (c) campo de texto da mensagem (`text` vs `content`), (d) onde vive `IPlatformSettings` da loja no mock (pode ser `state.stores[].settings` ou um `platformSettings` separado — siga o que `seedStore.ts` popular), (e) o lookup de nome de contato: se o `listContacts`/`get` interno já resolver nome de customer/lead, extraia esse trecho para uma função local `resolveContactName(conv, state)`; senão implemente-a com o mesmo padrão do provider mock `listContacts` (customer B2B → `nomeFantasia`, senão `fullName`; lead → `name`; fallback `"Contato"`). Aplique o helper de latência/erro simulado se os endpoints vizinhos usarem um.

- [ ] **Step 6: Provider mock** — em `src/providers/data/impl/mock/conversations.ts`:

```ts
import { businessSecondsBetween } from "@/features/idle-alerts/engine/idleBusinessTime";
import { computeIdleLevel } from "@/features/idle-alerts/engine/idleLevel";
import { DEFAULT_IDLE_ALERTS_SETTINGS } from "@/features/idle-alerts/config/defaults";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
// ...
  getIdleSummary: async (): Promise<IIdleSummary> => {
    const { user } = getCurrentContext();
    if (!user) return { counts: { level1: 0, level2: 0, level3: 0 }, entries: [] };
    const raw = await conversationsApi.listAwaitingReply(user.id);
    const settings = raw.settings.idleAlerts ?? DEFAULT_IDLE_ALERTS_SETTINGS;
    if (!settings.enabled) return { counts: { level1: 0, level2: 0, level3: 0 }, entries: [] };
    const now = new Date();
    const entries = raw.items
      .map((item) => {
        const businessSeconds = businessSecondsBetween(
          raw.workSchedule,
          new Date(item.awaitingReplySince),
          now,
        );
        return { ...item, businessSeconds, level: computeIdleLevel(businessSeconds, settings) };
      })
      .filter((e): e is IIdleConversationEntry => e.level > 0)
      .sort((a, b) => b.level - a.level || b.businessSeconds - a.businessSeconds);
    return {
      counts: {
        level1: entries.filter((e) => e.level === 1).length,
        level2: entries.filter((e) => e.level === 2).length,
        level3: entries.filter((e) => e.level === 3).length,
      },
      entries: entries.slice(0, 500),
    };
  },
```

O endpoint mock `listAwaitingReply(sellerId)` retorna `{ items, workSchedule, settings }` (itens crus + agenda do seller + `IPlatformSettings` da loja) — assim TODO o cálculo fica no provider, um único lugar.

- [ ] **Step 7: Run gates**

Run: `bun run test` → tudo verde. `bunx tsc --noEmit` → sem erros novos (o supabase impl ainda não tem o método — o TypeScript VAI acusar `getIdleSummary` faltando em `supabaseConversationsProvider`; adicione lá um stub temporário `getIdleSummary: async () => { throw new Error("[supabase] idle summary: pending Task 5"); }` para manter o contrato íntegro até a Task 5).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types/conversation.ts src/providers/data/contracts/conversations.ts src/mocks/api/conversations.ts src/providers/data/impl/mock/conversations.ts src/providers/data/impl/supabase/conversations.ts src/features/idle-alerts/engine/groupByLevel.ts src/features/idle-alerts/engine/groupByLevel.test.ts
git commit -m "feat(idle-alerts): IIdleSummary contract, mock provider and grouping engine"
```

---

### Task 4: Migration SQL (arquivo versionado — NÃO aplicar sem OK do dono)

**Files:**
- Create: `supabase/migrations/20260716190000_idle_conversation_alerts.sql`

**Interfaces:**
- Produces: coluna `conversations.awaiting_reply_since`, triggers, backfill, índice parcial, `public.idle_business_seconds(jsonb, timestamptz, timestamptz)`, RPC `public.idle_conversations_summary()`, `reconcile_derived_notifications()` com a regra `conversa.ociosa`.

- [ ] **Step 1: Verify real column names** (não asuma o schema):

```bash
rg -n "direction|created_at|conversation_id" src/providers/data/impl/supabase/messages.ts | head -30
rg -n "rowToMessage|content|text" src/providers/data/impl/supabase/messages.ts | head -20
```

Confirme: nome da coluna de direção (`direction`, valores `'inbound'|'outbound'`), timestamp (`created_at`), texto (`content` ou `text`), FK (`conversation_id`). **Ajuste o SQL abaixo se divergirem.** Confirme também `leads.id` ser TEXT (memória do projeto) — o join abaixo já não faz cast.

- [ ] **Step 2: Write the migration file** (adapte apenas os nomes verificados no Step 1):

```sql
-- Idle-conversation alerts (spec docs/superpowers/specs/2026-07-16-idle-conversation-alerts-design.md).
-- 1) awaiting_reply_since column + triggers + backfill + partial index
-- 2) idle_business_seconds (SQL mirror of src/features/idle-alerts/engine/idleBusinessTime.ts)
-- 3) idle_conversations_summary() gated-once RPC
-- 4) conversa.ociosa rule inside reconcile_derived_notifications()

-- 1. Column ------------------------------------------------------------------
alter table public.conversations
  add column if not exists awaiting_reply_since timestamptz;

create index if not exists idx_conversations_awaiting_reply
  on public.conversations (store_id, assigned_seller_id)
  where awaiting_reply_since is not null
    and status in ('aguardando','em_andamento','aguardando_cliente');

-- Set on first unanswered inbound, clear on any outbound.
create or replace function public.tg_messages_awaiting_reply()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'inbound' then
    update public.conversations
       set awaiting_reply_since = coalesce(awaiting_reply_since, coalesce(new.created_at, now()))
     where id = new.conversation_id;
  elsif new.direction = 'outbound' then
    update public.conversations
       set awaiting_reply_since = null
     where id = new.conversation_id and awaiting_reply_since is not null;
  end if;
  return new;
end $$;

drop trigger if exists messages_awaiting_reply on public.messages;
create trigger messages_awaiting_reply
  after insert on public.messages
  for each row execute function public.tg_messages_awaiting_reply();

-- Closing the conversation clears the pending flag.
create or replace function public.tg_conversations_awaiting_clear()
returns trigger language plpgsql as $$
begin
  if new.status in ('resolvida','arquivada') then
    new.awaiting_reply_since := null;
  end if;
  return new;
end $$;

drop trigger if exists conversations_awaiting_clear on public.conversations;
create trigger conversations_awaiting_clear
  before update of status on public.conversations
  for each row execute function public.tg_conversations_awaiting_clear();

-- Backfill open conversations: first inbound after the last outbound.
update public.conversations cv
   set awaiting_reply_since = sub.first_unanswered
  from (
    select c.id,
      (select min(m.created_at) from public.messages m
        where m.conversation_id = c.id and m.direction = 'inbound'
          and m.created_at > coalesce(
            (select max(o.created_at) from public.messages o
              where o.conversation_id = c.id and o.direction = 'outbound'),
            'epoch'::timestamptz)
      ) as first_unanswered
    from public.conversations c
    where c.status in ('aguardando','em_andamento','aguardando_cliente')
  ) sub
 where cv.id = sub.id and sub.first_unanswered is not null;

-- 2. Business-time function (STRICT parity with idleBusinessTime.ts) ---------
create or replace function public.idle_business_seconds(
  p_schedule jsonb, p_from timestamptz, p_to timestamptz
) returns bigint language plpgsql immutable as $$
declare
  v_from timestamptz;
  v_total bigint := 0;
  v_day date;
  v_last_day date;
  v_weekday int;
  v_win record;
  v_open int; v_close int;
  v_start timestamptz; v_end timestamptz;
  v_overlap numeric;
begin
  if p_to is null or p_from is null or p_to <= p_from then return 0; end if;
  -- 90-day clamp (mirror of CLAMP_DAYS).
  v_from := greatest(p_from, p_to - interval '90 days');

  if p_schedule is null or jsonb_typeof(p_schedule) <> 'array'
     or not exists (select 1 from jsonb_array_elements(p_schedule) w
                    where coalesce((w->>'enabled')::bool, false)) then
    return floor(extract(epoch from (p_to - v_from)))::bigint;
  end if;

  -- Walk São Paulo calendar days (fixed UTC-03:00).
  v_day := ((v_from at time zone 'utc') - interval '3 hours')::date;
  v_last_day := ((p_to at time zone 'utc') - interval '3 hours')::date;
  while v_day <= v_last_day loop
    v_weekday := extract(dow from v_day)::int;
    for v_win in
      select w->>'openAt' open_at, w->>'closeAt' close_at
        from jsonb_array_elements(p_schedule) w
       where coalesce((w->>'enabled')::bool, false)
         and (w->>'weekday')::int = v_weekday
    loop
      v_open  := split_part(v_win.open_at,  ':', 1)::int * 60 + split_part(v_win.open_at,  ':', 2)::int;
      v_close := split_part(v_win.close_at, ':', 1)::int * 60 + split_part(v_win.close_at, ':', 2)::int;
      if v_close <= v_open then continue; end if;
      -- Window instants back in UTC (+3h).
      v_start := (v_day::timestamp + make_interval(mins => v_open))  at time zone 'utc' + interval '3 hours';
      v_end   := (v_day::timestamp + make_interval(mins => v_close)) at time zone 'utc' + interval '3 hours';
      v_overlap := extract(epoch from (least(v_end, p_to) - greatest(v_start, v_from)));
      if v_overlap > 0 then v_total := v_total + floor(v_overlap)::bigint; end if;
    end loop;
    v_day := v_day + 1;
  end loop;
  return v_total;
end $$;

-- 3. Summary RPC (gated-once: resolves the seller ONCE from the JWT) ---------
create or replace function public.idle_conversations_summary()
returns table (
  conversation_id uuid,
  contact_name text,
  last_inbound_preview text,
  awaiting_reply_since timestamptz,
  business_seconds bigint,
  idle_level int
) language sql stable security definer set search_path = public as $$
  with me as (
    select public.current_seller_id() sid, public.current_store_id() stid
  ),
  cfg as (
    select coalesce((s.settings->'idleAlerts'->>'enabled')::bool, false) idle_on,
           coalesce((s.settings->'idleAlerts'->>'level1Hours')::numeric, 2)  l1,
           coalesce((s.settings->'idleAlerts'->>'level2Hours')::numeric, 8)  l2,
           coalesce((s.settings->'idleAlerts'->>'level3Hours')::numeric, 24) l3
      from public.stores s join me on s.id = me.stid
  ),
  sched as (
    select sel.work_schedule ws from public.sellers sel join me on sel.id = me.sid
  ),
  base as (
    select c.id, c.awaiting_reply_since, c.customer_id, c.lead_id,
           public.idle_business_seconds((select ws from sched), c.awaiting_reply_since, now()) secs
      from public.conversations c
      join me on c.assigned_seller_id = me.sid
     where c.awaiting_reply_since is not null
       and c.status in ('aguardando','em_andamento','aguardando_cliente')
       and (select idle_on from cfg)
  )
  select b.id,
         coalesce(cu.nome_fantasia, cu.full_name, ld.name, 'Contato') contact_name,
         (select m.content from public.messages m
           where m.conversation_id = b.id and m.direction = 'inbound'
           order by m.created_at desc limit 1) last_inbound_preview,
         b.awaiting_reply_since, b.secs,
         case when b.secs >= (select l3 from cfg) * 3600 then 3
              when b.secs >= (select l2 from cfg) * 3600 then 2
              else 1 end idle_level
    from base b
    left join public.customers cu on cu.id = b.customer_id
    left join public.leads ld on ld.id = b.lead_id
   where b.secs >= (select l1 from cfg) * 3600
   order by 6 desc, 5 desc
   limit 500;
$$;

revoke all on function public.idle_conversations_summary() from public, anon;
grant execute on function public.idle_conversations_summary() to authenticated;

-- 4. Reconciler: add the conversa.ociosa rule ---------------------------------
-- FULL replacement of reconcile_derived_notifications(): the 3 existing rules
-- are preserved verbatim (source: 20260609232819) + severity/channels now come
-- from _cur (existing rules keep 'warning' / ['inApp']).
create or replace function public.reconcile_derived_notifications()
returns void language plpgsql security definer set search_path = public as $fn$
declare now_ts timestamptz := now();
begin
  create temp table _cur on commit drop as
  with cfg as (
    select s.id store_id, s.manager_id,
      coalesce((s.settings->'managerDashboard'->>'alertClienteADormenteEnabled')::bool,false) cli_on,
      coalesce((s.settings->'managerDashboard'->>'alertVendedorSobrecarregadoEnabled')::bool,false) ven_on,
      coalesce((s.settings->'managerDashboard'->>'alertConversaSemRespostaEnabled')::bool,false) con_on,
      coalesce((s.settings->'managerDashboard'->>'sellerOverloadThreshold')::int,15) over_n,
      coalesce(s.settings->'managerDashboard'->>'sellerOverloadThreshold','15') over_txt,
      coalesce((s.settings->'managerDashboard'->>'conversationWaitingHoursThreshold')::numeric,4) wait_h,
      coalesce(s.settings->'managerDashboard'->>'conversationWaitingHoursThreshold','4') wait_txt
    from public.stores s where s.settings ? 'managerDashboard'
  ),
  dormente as (
    select c.store_id, 'cliente-a-dormente-'||c.id hash, 'cliente.dormente' type,'commercial' cat, r.rid,
      'Cliente A dormente: '||case when c.type='B2B' then coalesce(c.nome_fantasia,c.full_name) else c.full_name end
      ||' — '||(case when c.last_purchase_at is null then 0
                else greatest(1,round(extract(epoch from (now_ts-c.last_purchase_at))/86400.0))::int end)
      ||' dia'||case when (case when c.last_purchase_at is null then 0
                else greatest(1,round(extract(epoch from (now_ts-c.last_purchase_at))/86400.0))::int end)=1 then '' else 's' end
      ||' sem compra' title,
      'warning' sev, array['inApp']::text[] chans
    from cfg join public.customers c on c.store_id=cfg.store_id
    cross join lateral (select distinct unnest(array_remove(array[c.seller_id,cfg.manager_id],null::uuid)) rid) r
    where cfg.cli_on and c.abc_class='A' and c.status='dormente'
  ),
  loads as (
    select cfg.store_id, sel.id sid, sel.full_name, cfg.manager_id, cfg.over_n, cfg.over_txt,
      count(cv.id) load from cfg
      join public.sellers sel on sel.store_id=cfg.store_id
      left join public.conversations cv on cv.assigned_seller_id=sel.id and cv.store_id=cfg.store_id
        and cv.status in ('aguardando','em_andamento','aguardando_cliente')
    where cfg.ven_on group by cfg.store_id,sel.id,sel.full_name,cfg.manager_id,cfg.over_n,cfg.over_txt
  ),
  vendedor as (
    select store_id,'vendedor-sobrecarregado-'||sid hash,'vendedor.sobrecarregado' type,'operational' cat,
      manager_id rid, full_name||' está sobrecarregado — '||load||' conversas ativas (limite '||over_txt||')' title,
      'warning' sev, array['inApp']::text[] chans
    from loads where load>over_n and manager_id is not null
  ),
  semresp as (
    select cfg.store_id,'conversa-sem-resposta' hash,'conversa.semResposta' type,'operational' cat,
      cfg.manager_id rid, n.c||' conversa'||case when n.c=1 then '' else 's' end
      ||' sem resposta há mais de '||cfg.wait_txt||'h' title,
      'warning' sev, array['inApp']::text[] chans
    from cfg cross join lateral (select count(*) c from public.conversations cv
      where cv.store_id=cfg.store_id and cv.status='aguardando'
        and cv.last_message_at < now_ts-(cfg.wait_h*interval '1 hour')) n
    where cfg.con_on and cfg.manager_id is not null and n.c>0
  ),
  u as (select store_id,hash,type,cat,rid,title,sev,chans from dormente
        union all select store_id,hash,type,cat,rid,title,sev,chans from vendedor
        union all select store_id,hash,type,cat,rid,title,sev,chans from semresp)
  select distinct 'derived:'||hash||':'||rid::text dedupe_key, type, cat category,
    rid::text recipient_id, store_id, title, sev severity, chans channels
    from u where rid is not null;

  -- conversa.ociosa (spec 2026-07-16) — ISOLATED exception-safe block: a
  -- failure here (e.g. malformed work_schedule jsonb) must never take down
  -- the 3 pre-existing derived rules above.
  begin
    insert into _cur (dedupe_key, type, category, recipient_id, store_id, title, severity, channels)
    with icfg as (
      select s.id store_id, s.manager_id,
        coalesce((s.settings->'idleAlerts'->>'enabled')::bool,false) idle_on,
        coalesce((s.settings->'idleAlerts'->>'level2Hours')::numeric,8)  l2_h,
        coalesce((s.settings->'idleAlerts'->>'level3Hours')::numeric,24) l3_h,
        coalesce((s.settings->'idleAlerts'->>'notifyManagerOnLevel3')::bool,true) mgr_on
      from public.stores s where s.settings ? 'idleAlerts'
    ),
    idle as (
      select cv.store_id, cv.assigned_seller_id sid, sel.full_name, icfg.manager_id,
        icfg.mgr_on, icfg.l2_h, icfg.l3_h,
        public.idle_business_seconds(sel.work_schedule, cv.awaiting_reply_since, now_ts) secs
      from icfg
      join public.conversations cv on cv.store_id=icfg.store_id
        and cv.awaiting_reply_since is not null
        and cv.assigned_seller_id is not null
        and cv.status in ('aguardando','em_andamento','aguardando_cliente')
      join public.sellers sel on sel.id=cv.assigned_seller_id
      where icfg.idle_on
    ),
    idle_lvl as (
      select store_id, sid, full_name, manager_id, mgr_on,
        case when secs >= l3_h*3600 then 3
             when secs >= l2_h*3600 then 2
             else 1 end lvl
      from idle
    ),
    ociosa_n2 as (
      select store_id,'conversa-ociosa-n2-'||sid hash,'conversa.ociosa' type,'operational' cat,
        sid rid,
        'Você tem '||count(*)||' conversa'||case when count(*)=1 then '' else 's' end
        ||' aguardando resposta há mais de um dia de trabalho' title,
        'warning' sev, array['inApp','toast']::text[] chans
      from idle_lvl where lvl=2 group by store_id,sid
    ),
    ociosa_n3 as (
      select store_id,'conversa-ociosa-n3-'||sid hash,'conversa.ociosa' type,'operational' cat,
        sid rid,
        'Você tem '||count(*)||' conversa'||case when count(*)=1 then '' else 's' end
        ||' crítica'||case when count(*)=1 then '' else 's' end
        ||' aguardando resposta há vários dias' title,
        'critical' sev, array['inApp','toast']::text[] chans
      from idle_lvl where lvl=3 group by store_id,sid
    ),
    ociosa_mgr as (
      select store_id,'conversa-ociosa-mgr-'||sid hash,'conversa.ociosa' type,'operational' cat,
        manager_id rid,
        full_name||' tem '||count(*)||' conversa'||case when count(*)=1 then '' else 's' end
        ||' crítica'||case when count(*)=1 then '' else 's' end
        ||' aguardando resposta' title,
        'critical' sev, array['inApp']::text[] chans
      from idle_lvl
      where lvl=3 and mgr_on and manager_id is not null and manager_id <> sid
      group by store_id,sid,full_name,manager_id
    ),
    iu as (select store_id,hash,type,cat,rid,title,sev,chans from ociosa_n2
           union all select store_id,hash,type,cat,rid,title,sev,chans from ociosa_n3
           union all select store_id,hash,type,cat,rid,title,sev,chans from ociosa_mgr)
    select distinct 'derived:'||hash||':'||rid::text, type, cat, rid::text, store_id, title, sev, chans
      from iu where rid is not null;
  exception when others then
    raise notice 'conversa.ociosa rule failed: %', sqlerrm;
  end;

  create temp table _scope on commit drop as
    select sel.id::text rid from public.sellers sel join public.stores s on s.id=sel.store_id
      where s.settings ? 'managerDashboard' or s.settings ? 'idleAlerts'
    union select s.manager_id::text from public.stores s
      where (s.settings ? 'managerDashboard' or s.settings ? 'idleAlerts')
        and s.manager_id is not null;

  update public.notifications n set status='archived', expires_at=now_ts
   where n.lifecycle='derived' and n.status<>'archived'
     and n.recipient_id in (select rid from _scope)
     and n.dedupe_key not in (select dedupe_key from _cur);

  insert into public.notifications
    (dedupe_key,lifecycle,type,category,severity,recipient_id,recipient_type,store_id,title,status,channels,source,created_at)
  select c.dedupe_key,'derived',c.type,c.category,c.severity,c.recipient_id,'seller',
         c.store_id,c.title,'unread',c.channels,'rule',now_ts
    from _cur c where not exists (select 1 from public.notifications n
      where n.lifecycle='derived' and n.dedupe_key=c.dedupe_key);

  update public.notifications n set status='unread', expires_at=null
   where n.lifecycle='derived' and n.status='archived'
     and n.dedupe_key in (select dedupe_key from _cur);
end $fn$;

revoke all on function public.reconcile_derived_notifications() from public, anon, authenticated;
```

⚠️ Notas obrigatórias: (a) troque `m.content` pelo nome real verificado no Step 1; (b) confirme que `notifications.severity` aceita `'critical'` (cheque o CHECK constraint/valores usados: `rg "severity" supabase/migrations/*notifications*` — se o domínio for outro, ex. `'error'`, use o valor válido e ajuste a rule/UI); (c) o `cron.schedule` NÃO é re-executado (o job existente já chama a função pelo nome).

- [ ] **Step 3: Syntax sanity check** — sem banco local, faça revisão estática: recite mentalmente cada bloco, e rode `rg -n "create or replace|create trigger|drop trigger" supabase/migrations/20260716190000_idle_conversation_alerts.sql` conferindo 6 CREATE/2 DROP esperados. (A validação real acontece no apply em prod com OK do dono + suíte RLS da Task 8.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260716190000_idle_conversation_alerts.sql
git commit -m "feat(idle-alerts): migration — awaiting_reply_since, business-time fn, summary RPC, reconciler rule"
```

---

### Task 5: Provider supabase + evento no vocabulário + hook `useIdleSummary`

**Files:**
- Modify: `src/providers/data/impl/supabase/conversations.ts` (substituir o stub da Task 3)
- Modify: `src/providers/notifications/events.ts`
- Modify: `src/providers/notifications/routing/rules.ts`
- Create: `src/features/idle-alerts/hooks/useIdleSummary.ts`

**Interfaces:**
- Consumes: RPC `idle_conversations_summary` (Task 4), `IIdleSummary` (Task 3).
- Produces: `useIdleSummary(): { summary: IIdleSummary | undefined, isLoading: boolean }` — polling 60s, silencioso em erro; `"conversa.ociosa"` no vocabulário.

- [ ] **Step 1: Supabase impl** — substituir o stub:

```ts
  async getIdleSummary(): Promise<IIdleSummary> {
    const { data, error } = await getSupabaseClient().rpc("idle_conversations_summary");
    if (error) throw new Error(`[supabase] conversations.getIdleSummary failed: ${error.message}`);
    const rows = (data ?? []) as unknown as {
      conversation_id: string;
      contact_name: string;
      last_inbound_preview: string | null;
      awaiting_reply_since: string;
      business_seconds: number;
      idle_level: number;
    }[];
    const entries = rows.map((r) => ({
      conversationId: r.conversation_id,
      contactName: r.contact_name,
      lastInboundPreview: r.last_inbound_preview,
      awaitingReplySince: r.awaiting_reply_since,
      businessSeconds: Number(r.business_seconds),
      level: (r.idle_level as 1 | 2 | 3) ?? 1,
    }));
    return {
      counts: {
        level1: entries.filter((e) => e.level === 1).length,
        level2: entries.filter((e) => e.level === 2).length,
        level3: entries.filter((e) => e.level === 3).length,
      },
      entries,
    };
  },
```

- [ ] **Step 2: Vocabulário** — em `src/providers/notifications/events.ts`: adicionar `| "conversa.ociosa"` no union (bloco Atendimento) e `"conversa.ociosa",` em `DERIVED_EVENTS`. Em `src/providers/notifications/routing/rules.ts`, junto a `conversa.semResposta` (linha ~121):

```ts
  "conversa.ociosa": {
    category: "operational",
    severity: "warning",
    channels: ["inApp", "toast"],
    resolveRecipients: (p) => sellerOf(p),
  },
```

(A severidade real por linha vem do reconciler server-side; esta entry existe para o router client-side tipar/rotear o evento. Se `rules.ts` exigir todos os eventos do union, o build acusa a falta — este passo resolve.)

- [ ] **Step 3: Hook**

```ts
// src/features/idle-alerts/hooks/useIdleSummary.ts
import { useQuery } from "@tanstack/react-query";
import { useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import type { IIdleSummary } from "@/shared/types";

const POLL_MS = 60_000;

/**
 * Signed-in seller's idle-conversation summary. Polls every 60s; fails
 * SILENT (chip/panel simply hide) — no error toasts (spec: degradação).
 * Own query key — deliberately outside the frozen Atendimento cache keys.
 */
export function useIdleSummary() {
  const provider = useConversationsProvider();
  const { currentUser } = useAuth();
  const enabled = Boolean(currentUser?.sellerId ?? currentUser?.id);
  const query = useQuery<IIdleSummary>({
    queryKey: ["idle-summary", currentUser?.sellerId ?? currentUser?.id ?? "anon"],
    queryFn: () => provider.getIdleSummary(),
    enabled,
    refetchInterval: POLL_MS,
    staleTime: 30_000,
    retry: 1,
  });
  return { summary: query.data, isLoading: query.isLoading };
}
```

⚠️ Verifique o shape real de `currentUser` (`rg -n "sellerId|interface.*User" src/features/auth/useAuth.ts src/features/auth/types.ts` se existir) e use o campo correto.

- [ ] **Step 4: Run gates** — `bun run test` verde; `bunx tsc --noEmit` sem erros novos; `bun run build` verde.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/conversations.ts src/providers/notifications/events.ts src/providers/notifications/routing/rules.ts src/features/idle-alerts/hooks/useIdleSummary.ts
git commit -m "feat(idle-alerts): supabase summary provider, conversa.ociosa event, useIdleSummary hook"
```

---

### Task 6: Chip do TopBar + Sheet "Minhas pendências"

**Files:**
- Create: `src/features/idle-alerts/components/IdlePendingChip.tsx`
- Create: `src/features/idle-alerts/components/IdlePendingSheet.tsx`
- Create: `src/features/idle-alerts/index.ts` (barrel)
- Modify: `src/features/shell/components/TopBar.tsx` (linha ~74, junto a `<InboxUnreadBadgeIcon />`)

**Interfaces:**
- Consumes: `useIdleSummary` (Task 5), `groupByLevel`/`formatElapsed` (Tasks 2-3).
- Produces: `<IdlePendingChip />` (montado no TopBar; abre o Sheet). Mockup aprovado: sheet lateral com resumo por nível (3 cards), cards por conversa (nome, última fala, tempo), "Abrir conversa" e rodapé "Revisar em sequência".

- [ ] **Step 1: Confirm the conversation route**

Run: `ls src/routes | rg -i "atendimento"`
Expected: algo como `app.atendimento.tsx` + `app.atendimento.$conversationId.tsx`. Use o `to` exato nos navigates abaixo (ajuste se o param tiver outro nome).

- [ ] **Step 2: Implement the chip**

```tsx
// src/features/idle-alerts/components/IdlePendingChip.tsx
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { IdlePendingSheet } from "./IdlePendingSheet";

/** TopBar chip — total pending count, colored by the WORST level present. */
export function IdlePendingChip() {
  const { summary } = useIdleSummary();
  const [open, setOpen] = useState(false);
  const total = summary
    ? summary.counts.level1 + summary.counts.level2 + summary.counts.level3
    : 0;
  if (!summary || total === 0) return null;
  const worst = summary.counts.level3 > 0 ? 3 : summary.counts.level2 > 0 ? 2 : 1;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Minhas pendências: ${total} conversas aguardando resposta`}
        className={cn(
          "gap-1.5 border",
          worst === 3 && "border-severity-critical/50 bg-severity-critical/10 text-severity-critical",
          worst === 2 && "border-severity-warning/50 bg-severity-warning/10 text-severity-warning",
          worst === 1 && "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        <Icon icon="mdi:timer-sand" size={16} />
        <span className="text-xs font-bold tabular-nums">{total}</span>
      </Button>
      <IdlePendingSheet open={open} onOpenChange={setOpen} summary={summary} />
    </>
  );
}
```

- [ ] **Step 3: Implement the sheet**

```tsx
// src/features/idle-alerts/components/IdlePendingSheet.tsx
import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IIdleSummary, IIdleConversationEntry } from "@/shared/types";
import { groupByLevel } from "../engine/groupByLevel";
import { formatElapsed } from "../engine/idleLevel";

interface IIdlePendingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: IIdleSummary;
}

/** Sheet lateral "Minhas pendências" — mockup B aprovado no brainstorm. */
export function IdlePendingSheet({ open, onOpenChange, summary }: IIdlePendingSheetProps) {
  const navigate = useNavigate();
  const groups = groupByLevel(summary.entries);
  const openConversation = (entry: IIdleConversationEntry) => {
    onOpenChange(false);
    void navigate({
      to: "/app/atendimento/$conversationId",
      params: { conversationId: entry.conversationId },
    });
  };
  const reviewInSequence = () => {
    const first = summary.entries[0];
    if (first) openConversation(first);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Icon icon="mdi:timer-sand" size={18} />
            Minhas pendências
          </SheetTitle>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <LevelStat label="críticas" count={summary.counts.level3} tone="critical" />
            <LevelStat label="em alerta" count={summary.counts.level2} tone="warning" />
            <LevelStat label="atenção" count={summary.counts.level1} tone="muted" />
          </div>
        </SheetHeader>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {[
            { entries: groups.critical, tone: "critical" as const },
            { entries: groups.alert, tone: "warning" as const },
            { entries: groups.attention, tone: "muted" as const },
          ].map(({ entries, tone }) =>
            entries.map((entry) => (
              <EntryCard key={entry.conversationId} entry={entry} tone={tone} onOpen={openConversation} />
            )),
          )}
          {summary.entries.length === 0 && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Nenhuma conversa aguardando sua resposta. 🎉
            </p>
          )}
        </div>
        <div className="border-t border-border p-3">
          <Button className="w-full" onClick={reviewInSequence} disabled={summary.entries.length === 0}>
            Revisar em sequência
            <Icon icon="mdi:arrow-right" size={16} className="ml-2" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LevelStat({ label, count, tone }: { label: string; count: number; tone: "critical" | "warning" | "muted" }) {
  return (
    <div
      className={cn(
        "rounded-md border p-2 text-center",
        tone === "critical" && "border-severity-critical/40 bg-severity-critical/5",
        tone === "warning" && "border-severity-warning/40 bg-severity-warning/5",
        tone === "muted" && "border-border bg-muted/30",
      )}
    >
      <div
        className={cn(
          "text-lg font-bold tabular-nums",
          tone === "critical" && "text-severity-critical",
          tone === "warning" && "text-severity-warning",
          tone === "muted" && "text-foreground",
        )}
      >
        {count}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function EntryCard({
  entry,
  tone,
  onOpen,
}: {
  entry: IIdleConversationEntry;
  tone: "critical" | "warning" | "muted";
  onOpen: (entry: IIdleConversationEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent",
        tone === "critical" && "border-severity-critical/35",
        tone === "warning" && "border-severity-warning/30",
        tone === "muted" && "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-foreground">{entry.contactName}</span>
        <span
          className={cn(
            "shrink-0 text-xs font-bold",
            tone === "critical" && "text-severity-critical",
            tone === "warning" && "text-severity-warning",
            tone === "muted" && "text-muted-foreground",
          )}
        >
          espera há {formatElapsed(entry.awaitingReplySince, new Date())}
        </span>
      </div>
      {entry.lastInboundPreview && (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          “{entry.lastInboundPreview}”
        </p>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Barrel + TopBar mount**

```ts
// src/features/idle-alerts/index.ts
export { IdlePendingChip } from "./components/IdlePendingChip";
export { IdlePendingSheet } from "./components/IdlePendingSheet";
```

Em `src/features/shell/components/TopBar.tsx`: `import { IdlePendingChip } from "@/features/idle-alerts";` e montar `<IdlePendingChip />` imediatamente após `<InboxUnreadBadgeIcon />` (linha ~74).

- [ ] **Step 5: Run gates + visual sanity** — `bun run build` + `bun run test` verdes. NÃO abrir browser para validar (o dono testa a UI manualmente).

- [ ] **Step 6: Commit**

```bash
git add src/features/idle-alerts/ src/features/shell/components/TopBar.tsx
git commit -m "feat(idle-alerts): TopBar pending chip + Minhas pendências sheet"
```

---

### Task 7: Banner fixo N3

**Files:**
- Create: `src/features/idle-alerts/components/IdleCriticalBanner.tsx`
- Modify: `src/features/idle-alerts/index.ts`
- Modify: `src/features/shell/layouts/AppLayout.tsx` (após `<OutsideHoursBanner />`, linha ~69)

**Interfaces:**
- Consumes: `useIdleSummary`. Produces: `<IdleCriticalBanner />` — visível somente quando `counts.level3 > 0`; sem botão de fechar; CTA abre o Sheet (reusar `IdlePendingSheet` com estado local).

- [ ] **Step 1: Implement**

```tsx
// src/features/idle-alerts/components/IdleCriticalBanner.tsx
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { IdlePendingSheet } from "./IdlePendingSheet";

/** Fixed critical strip under the TopBar while level-3 conversations exist. */
export function IdleCriticalBanner() {
  const { summary } = useIdleSummary();
  const [open, setOpen] = useState(false);
  const critical = summary?.counts.level3 ?? 0;
  if (!summary || critical === 0) return null;
  return (
    <>
      <div className="sticky top-16 z-20 flex items-center justify-between gap-3 border-b border-severity-critical/40 bg-severity-critical/10 px-4 py-2">
        <p className="text-xs font-semibold text-severity-critical">
          <Icon icon="mdi:alert-octagon" size={14} className="mr-1.5 inline-block" />
          Você tem {critical} conversa{critical === 1 ? "" : "s"} aguardando resposta há vários
          dias
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 text-xs font-bold text-primary underline-offset-4 hover:underline"
        >
          Revisar agora →
        </button>
      </div>
      <IdlePendingSheet open={open} onOpenChange={setOpen} summary={summary} />
    </>
  );
}
```

⚠️ Antes, leia `src/features/access/.../OutsideHoursBanner` (localize com `rg -n "OutsideHoursBanner" src/features/access`) e copie o padrão de posicionamento sticky que ele usa (classe/z-index), mantendo consistência.

- [ ] **Step 2: Mount** — export no barrel; em `AppLayout.tsx` importar `{ IdleCriticalBanner }` de `@/features/idle-alerts` e montar após `<OutsideHoursBanner />`.

- [ ] **Step 3: Gates + commit**

```bash
bun run build && bun run test
git add src/features/idle-alerts/ src/features/shell/layouts/AppLayout.tsx
git commit -m "feat(idle-alerts): fixed critical banner (level 3)"
```

---

### Task 8: Briefing do dia (flag de login explícito + gate + overlay) — TDD no gate

**Files:**
- Create: `src/features/idle-alerts/engine/briefingGate.ts` + Test: `briefingGate.test.ts`
- Create: `src/features/idle-alerts/hooks/useExplicitLoginFlag.ts`
- Create: `src/features/idle-alerts/components/DailyBriefing.tsx`
- Create: `src/features/idle-alerts/components/DailyBriefingGate.tsx`
- Modify: `src/routes/auth.login.tsx` (funções `enter` e `handleSubmit`)
- Modify: `src/features/idle-alerts/index.ts`, `src/features/shell/layouts/AppLayout.tsx`

**Interfaces:**
- Produces: `markExplicitLogin()` / `consumeExplicitLogin(): boolean` (sessionStorage key `gallo-explicit-login`); `shouldShowBriefing(flagConsumed: boolean, summary: IIdleSummary | undefined): boolean`; `<DailyBriefingGate />` montado no AppLayout.

- [ ] **Step 1: Failing test do gate**

```ts
// src/features/idle-alerts/engine/briefingGate.test.ts
import { describe, expect, it } from "vitest";
import { shouldShowBriefing } from "./briefingGate";
import type { IIdleSummary } from "@/shared/types";

const empty: IIdleSummary = { counts: { level1: 0, level2: 0, level3: 0 }, entries: [] };
const pending: IIdleSummary = {
  counts: { level1: 2, level2: 0, level3: 1 },
  entries: [],
};

describe("shouldShowBriefing", () => {
  it("shows only on explicit login AND with pending items", () => {
    expect(shouldShowBriefing(true, pending)).toBe(true);
    expect(shouldShowBriefing(true, empty)).toBe(false);
    expect(shouldShowBriefing(false, pending)).toBe(false);
    expect(shouldShowBriefing(true, undefined)).toBe(false); // summary failed → fail-open to the app
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement gate + flag**

```ts
// src/features/idle-alerts/engine/briefingGate.ts
import type { IIdleSummary } from "@/shared/types";

/** Briefing shows ONLY right after an explicit login and when something is pending. */
export function shouldShowBriefing(
  explicitLogin: boolean,
  summary: IIdleSummary | undefined,
): boolean {
  if (!explicitLogin || !summary) return false;
  return summary.counts.level1 + summary.counts.level2 + summary.counts.level3 > 0;
}
```

```ts
// src/features/idle-alerts/hooks/useExplicitLoginFlag.ts
const KEY = "gallo-explicit-login";

/** Set by the login route right before navigating into the app. */
export function markExplicitLogin(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    /* storage unavailable — briefing simply won't show */
  }
}

/** One-shot consumer: true exactly once per explicit login. */
export function consumeExplicitLogin(): boolean {
  try {
    const present = sessionStorage.getItem(KEY) === "1";
    if (present) sessionStorage.removeItem(KEY);
    return present;
  } catch {
    return false;
  }
}
```

Run test → PASS.

- [ ] **Step 3: Login route** — em `src/routes/auth.login.tsx`, importar `markExplicitLogin` de `@/features/idle-alerts` e chamar imediatamente ANTES de cada `void navigate({ to: target })` (2 pontos: `enter` linha ~65 e `handleSubmit` linha ~94).

- [ ] **Step 4: Overlay + gate components**

```tsx
// src/features/idle-alerts/components/DailyBriefingGate.tsx
import { useEffect, useState } from "react";
import { useIdleSummary } from "../hooks/useIdleSummary";
import { consumeExplicitLogin } from "../hooks/useExplicitLoginFlag";
import { shouldShowBriefing } from "../engine/briefingGate";
import { DailyBriefing } from "./DailyBriefing";

/**
 * Mounted once in AppLayout. Waits for the first summary result after an
 * explicit login; shows the full-screen briefing at most once per login.
 */
export function DailyBriefingGate() {
  const { summary, isLoading } = useIdleSummary();
  const [explicit, setExplicit] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Consume the one-shot flag on mount (post-login app boot).
    setExplicit(consumeExplicitLogin());
  }, []);

  if (dismissed || isLoading) return null;
  if (!shouldShowBriefing(explicit, summary)) return null;
  return <DailyBriefing summary={summary!} onDismiss={() => setDismissed(true)} />;
}
```

```tsx
// src/features/idle-alerts/components/DailyBriefing.tsx
import { useState } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { IIdleSummary } from "@/shared/types";
import { formatElapsed } from "../engine/idleLevel";
import { IdlePendingSheet } from "./IdlePendingSheet";

/** Full-screen post-login interstitial (mockup "Briefing do dia" aprovado). */
export function DailyBriefing({
  summary,
  onDismiss,
}: {
  summary: IIdleSummary;
  onDismiss: () => void;
}) {
  const { currentUser } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const total = summary.counts.level1 + summary.counts.level2 + summary.counts.level3;
  const top = summary.entries.slice(0, 4);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">
          Briefing do dia
        </p>
        <h2 className="mt-2 text-xl font-bold text-foreground">
          Antes de começar, {currentUser?.displayName?.split(" ")[0] ?? "atendente"}…
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <BriefStat count={summary.counts.level3} label="críticas" tone="critical" />
          <BriefStat count={summary.counts.level2} label="em alerta" tone="warning" />
          <BriefStat count={summary.counts.level1} label="atenção" tone="muted" />
        </div>
        {top.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Mais urgentes
            </p>
            {top.map((e) => (
              <div
                key={e.conversationId}
                className="flex items-center justify-between border-b border-border/50 py-1.5 text-xs last:border-0"
              >
                <span className="truncate text-foreground">{e.contactName}</span>
                <span className="shrink-0 font-semibold text-severity-critical">
                  {formatElapsed(e.awaitingReplySince, new Date())}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-5 flex gap-3">
          <Button className="flex-1" onClick={() => setSheetOpen(true)}>
            Revisar as {total} conversa{total === 1 ? "" : "s"}
            <Icon icon="mdi:arrow-right" size={16} className="ml-2" />
          </Button>
          <Button variant="outline" onClick={onDismiss}>
            Pular
          </Button>
        </div>
      </div>
      <IdlePendingSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) onDismiss();
        }}
        summary={summary}
      />
    </div>
  );
}

function BriefStat({
  count,
  label,
  tone,
}: {
  count: number;
  label: string;
  tone: "critical" | "warning" | "muted";
}) {
  const toneClass =
    tone === "critical"
      ? "border-severity-critical/40 text-severity-critical"
      : tone === "warning"
        ? "border-severity-warning/40 text-severity-warning"
        : "border-border text-foreground";
  return (
    <div className={`rounded-lg border bg-background p-3 text-center ${toneClass}`}>
      <div className="text-2xl font-extrabold tabular-nums">{count}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
```

- [ ] **Step 5: Mount + barrel** — exportar `DailyBriefingGate` e `markExplicitLogin` no barrel `index.ts`; montar `<DailyBriefingGate />` no `AppLayout.tsx` junto aos guards (após `<CollaboratorAddedPrompt />`).

- [ ] **Step 6: Gates + commit**

```bash
bun run build && bun run test
git add src/features/idle-alerts/ src/routes/auth.login.tsx src/features/shell/layouts/AppLayout.tsx
git commit -m "feat(idle-alerts): daily briefing interstitial on explicit login"
```

---

### Task 9: Configuração por loja (Owner/Gestor)

**Files:**
- Create: `src/features/idle-alerts/hooks/useIdleAlertsSettings.ts`
- Create: `src/features/idle-alerts/components/IdleAlertsSettingsSection.tsx`
- Modify: tela onde `AlertSettingsModal` é aberto (localizar no Step 1)

**Interfaces:**
- Consumes: `useSettingsProvider` (padrão de `src/features/manager-dashboard/hooks/useManagerDashboardSettings.ts`: `provider.update(storeId, { idleAlerts: next })`).
- Produces: seção "Alertas de ociosidade" com: Switch `enabled`, 3 inputs numéricos (horas úteis, min 1 / max 200), Switch `notifyManagerOnLevel3`.

- [ ] **Step 1: Locate the mount point**

Run: `rg -n "AlertSettingsModal" src/features --glob '!**/*.test.*'`
Abra o arquivo que o renderiza (tela de alertas do painel gerencial) e identifique onde fica o botão/trigger de configurações. A seção nova entra na MESMA tela, logo abaixo (card próprio), gated ao mesmo papel que já governa aquela tela.

- [ ] **Step 2: Hook** — antes de escrever, leia `src/features/manager-dashboard/hooks/useManagerDashboardSettings.ts` INTEIRO e replique exatamente o mesmo esqueleto (estados/efeitos/assinatura do provider) trocando o campo. Referência do resultado esperado (ajuste aos nomes reais do arquivo-modelo):

```ts
// src/features/idle-alerts/hooks/useIdleAlertsSettings.ts
import { useCallback, useEffect, useState } from "react";
import { useSettingsProvider } from "@/providers/data";
import type { IIdleAlertsSettings } from "@/shared/types";
import { DEFAULT_IDLE_ALERTS_SETTINGS } from "../config/defaults";

/**
 * Read + write helper for `IPlatformSettings.idleAlerts` (spec 2026-07-16).
 * Same skeleton as useManagerDashboardSettings (PRD-014).
 */
export function useIdleAlertsSettings(storeId: string) {
  const provider = useSettingsProvider();
  const [settings, setSettings] = useState<IIdleAlertsSettings>(DEFAULT_IDLE_ALERTS_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    provider
      .get(storeId)
      .then((platform) => {
        if (!cancelled) setSettings(platform.idleAlerts ?? DEFAULT_IDLE_ALERTS_SETTINGS);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [provider, storeId]);

  const save = useCallback(
    async (next: IIdleAlertsSettings) => {
      setSaving(true);
      try {
        await provider.update(storeId, { idleAlerts: next });
        setSettings(next);
      } finally {
        setSaving(false);
      }
    },
    [provider, storeId],
  );

  return { settings, loading, saving, save };
}
```

⚠️ Se o contrato do settings provider tiver outros nomes (`get` pode ser `getByStore`/`load` — verifique em `src/providers/data/contracts/settings.ts`), siga o que `useManagerDashboardSettings` usa.

- [ ] **Step 3: Section component**

```tsx
// src/features/idle-alerts/components/IdleAlertsSettingsSection.tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { IIdleAlertsSettings } from "@/shared/types";
import { useIdleAlertsSettings } from "../hooks/useIdleAlertsSettings";

const HOURS_MIN = 1;
const HOURS_MAX = 200;

function clampHours(value: number): number {
  if (!Number.isFinite(value)) return HOURS_MIN;
  return Math.min(HOURS_MAX, Math.max(HOURS_MIN, Math.round(value)));
}

/** Per-store idle-alert thresholds card (Owner/Gestor — same screen gate). */
export function IdleAlertsSettingsSection({ storeId }: { storeId: string }) {
  const { settings, loading, saving, save } = useIdleAlertsSettings(storeId);
  const [draft, setDraft] = useState<IIdleAlertsSettings>(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleSave = async () => {
    try {
      await save({
        ...draft,
        level1Hours: clampHours(draft.level1Hours),
        level2Hours: clampHours(draft.level2Hours),
        level3Hours: clampHours(draft.level3Hours),
      });
      toast.success("Configurações salvas.");
    } catch {
      toast.error("Não foi possível salvar.");
    }
  };

  if (loading) return null;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Alertas de ociosidade</h3>
          <p className="text-xs text-muted-foreground">
            Cobra o atendente quando o cliente aguarda resposta (horas úteis da agenda de cada
            um).
          </p>
        </div>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, enabled: v }))}
          aria-label="Ativar alertas de ociosidade"
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {(
          [
            ["level1Hours", "Atenção (h úteis)"],
            ["level2Hours", "Alerta (h úteis)"],
            ["level3Hours", "Crítica (h úteis)"],
          ] as const
        ).map(([field, label]) => (
          <div key={field} className="space-y-1.5">
            <Label htmlFor={`idle-${field}`} className="text-xs">
              {label}
            </Label>
            <Input
              id={`idle-${field}`}
              type="number"
              min={HOURS_MIN}
              max={HOURS_MAX}
              value={draft[field]}
              disabled={!draft.enabled}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [field]: clampHours(Number(e.target.value)) }))
              }
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            checked={draft.notifyManagerOnLevel3}
            disabled={!draft.enabled}
            onCheckedChange={(v) => setDraft((d) => ({ ...d, notifyManagerOnLevel3: v }))}
            aria-label="Notificar gestor no nível crítico"
          />
          <span className="text-xs text-muted-foreground">Notificar gestor no nível crítico</span>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          Salvar
        </Button>
      </div>
    </section>
  );
}
```

Monte `<IdleAlertsSettingsSection storeId={...} />` na tela localizada no Step 1, abaixo do trigger do `AlertSettingsModal`, usando o MESMO `storeId` que aquela tela já resolve.

- [ ] **Step 4: Gates + commit**

```bash
bun run build && bun run test
git add src/features/idle-alerts/ src/features/manager-dashboard/
git commit -m "feat(idle-alerts): per-store settings section (thresholds + toggles)"
```

---

### Task 10: Suíte RLS — cobertura da RPC e dos triggers

**Files:**
- Modify: `supabase/tests/rls-regression.sql` (append antes do bloco final de sucesso)

**Interfaces:**
- Consumes: fixtures da suíte (owner seller `57706ecc-…`, lucas seller `5a6400ed-…`, store `00000000-…-000000000001`; padrão `set_config('request.jwt.claims', …)` + `set local role authenticated`).

- [ ] **Step 1: Append tests** (dentro da transação existente, seguindo o padrão dos blocos `do $$`):

```sql
-- ---------------------------------------------------------------------------
-- Idle-conversation alerts (spec 2026-07-16): summary RPC + triggers.
-- ---------------------------------------------------------------------------
-- Trigger unit-check (as superuser, before impersonation): inbound sets, outbound clears.
do $$
declare
  v_conv uuid;
  v_since timestamptz;
begin
  select id into v_conv from public.conversations
   where status in ('aguardando','em_andamento','aguardando_cliente') limit 1;
  if v_conv is null then
    raise notice 'idle-alerts: no open conversation in fixtures — skipping trigger check';
    return;
  end if;
  update public.conversations set awaiting_reply_since = null where id = v_conv;
  insert into public.messages (conversation_id, direction, content, created_at)
    values (v_conv, 'inbound', 'rls-test inbound', now());
  select awaiting_reply_since into v_since from public.conversations where id = v_conv;
  if v_since is null then
    raise exception 'idle-alerts: inbound message should set awaiting_reply_since';
  end if;
  insert into public.messages (conversation_id, direction, content, created_at)
    values (v_conv, 'outbound', 'rls-test outbound', now());
  select awaiting_reply_since into v_since from public.conversations where id = v_conv;
  if v_since is not null then
    raise exception 'idle-alerts: outbound message should clear awaiting_reply_since';
  end if;
end $$;

-- business-time fn sanity: no schedule ⇒ raw diff.
do $$
begin
  if public.idle_business_seconds(null, now() - interval '2 hours', now()) not between 7100 and 7300 then
    raise exception 'idle_business_seconds: raw diff expected for null schedule';
  end if;
end $$;

-- SQL≡JS parity: SAME fixtures as idleBusinessTime.test.ts (Mon-Fri 08-18 SP).
-- Monday 07:00→09:00 SP = 3600s; Saturday 10:00 → Monday 09:00 SP = 3600s;
-- Monday 08:00 → Wednesday 18:00 SP = 108000s (3 × 10h).
do $$
declare
  sched jsonb := '[
    {"weekday":1,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":2,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":3,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":4,"openAt":"08:00","closeAt":"18:00","enabled":true},
    {"weekday":5,"openAt":"08:00","closeAt":"18:00","enabled":true}
  ]'::jsonb;
begin
  if public.idle_business_seconds(sched,
       '2026-07-13T07:00:00-03:00'::timestamptz, '2026-07-13T09:00:00-03:00'::timestamptz) <> 3600 then
    raise exception 'parity: Monday 07-09 should yield 3600s';
  end if;
  if public.idle_business_seconds(sched,
       '2026-07-11T10:00:00-03:00'::timestamptz, '2026-07-13T09:00:00-03:00'::timestamptz) <> 3600 then
    raise exception 'parity: weekend skip should yield 3600s';
  end if;
  if public.idle_business_seconds(sched,
       '2026-07-13T08:00:00-03:00'::timestamptz, '2026-07-15T18:00:00-03:00'::timestamptz) <> 108000 then
    raise exception 'parity: Mon 08 → Wed 18 should yield 108000s';
  end if;
end $$;

-- Summary RPC as LUCAS: must never return a conversation assigned to another seller.
select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;
do $$
begin
  if exists (
    select 1 from public.idle_conversations_summary() s
    join public.conversations c on c.id = s.conversation_id
    where c.assigned_seller_id is distinct from '5a6400ed-5aec-4bf1-b641-31635f15c887'::uuid
  ) then
    raise exception 'idle summary: leaked another seller''s conversation';
  end if;
end $$;
reset role;
```

⚠️ Ajuste os nomes de coluna de `messages` no INSERT aos verificados na Task 4 (o insert de teste precisa satisfazer NOT NULLs reais da tabela — confira `\d public.messages` mentalmente via `rg "create table.*messages" supabase/migrations` e complete colunas obrigatórias, ex. `store_id`, `sender`, `type`, com valores das fixtures).

- [ ] **Step 2: Commit**

```bash
git add supabase/tests/rls-regression.sql
git commit -m "test(idle-alerts): RLS coverage for summary RPC and awaiting-reply triggers"
```

---

### Task 11: Doc de dev + gates finais

**Files:**
- Create: `docs/dev/idle-conversation-alerts.md`

- [ ] **Step 1: Write the doc** — resumo (≤80 linhas): modelo (coluna+triggers), regra do reconciler, RPC, engines espelhados (com a nota da paridade e do clamp 90d), UI (chip/sheet/banner/briefing), settings, e o ROLLOUT em 5 passos do spec (migration antes do deploy; `enabled` OFF; higiene; ligar por loja). Referencie o spec e o plano.

- [ ] **Step 2: Full gates**

```bash
bun run build
bun run test
bunx tsc --noEmit   # comparar com baseline: nenhum erro nos arquivos novos
```

Expected: build verde, ~1946+ testes verdes (todos os novos incluídos).

- [ ] **Step 3: Commit**

```bash
git add docs/dev/idle-conversation-alerts.md
git commit -m "docs(idle-alerts): dev doc — model, reconciler rule, rollout"
```

---

## Fora do plano (gates do dono — NÃO executar sem OK explícito)

1. `apply_migration` em prod (MCP Supabase) — ANTES do deploy do frontend.
2. Push + abertura de PR (sem merge).
3. Ligar `enabled` por loja após avaliar o passivo do backfill.
4. Version bump (skill `versionamento`) quando o dono pedir.
