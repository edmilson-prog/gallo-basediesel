# Painel de Atendimento (Volume / Fluxo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a UI do Painel de Atendimento (volume/fluxo) como aba "Atendimento" em `/app/inicio` + card-resumo na Caixa, alimentada por um provider mock determinístico (PRD-215 sobre mock; a fundação Supabase PRD-214 é entrega futura).

**Architecture:** Novo provider `atendimentoMetrics` (o 38º) no Provider Pattern — interface única que serve mock agora e Supabase depois. Lógica pura de agregação/formatação em `engine/` (TDD). UI feature-folder `src/features/service-volume/` consumindo `useAtendimentoMetricsProvider` via TanStack Query. `/app/inicio` vira shell de abas (DELTA-014, wrap não rewrite). Card-resumo na Caixa (DELTA-010). RBAC `service_volume.view` (DELTA-006). Taxonomia de status **mantida** (`snake_case`, sem migration destrutiva).

**Tech Stack:** React 19, TanStack Router (file-based, search params validados), TanStack Query, Tailwind v4 + shadcn/ui (`Tabs`, `Card`), recharts (cores via CSS vars), Iconify, Zustand (mockStore), Vitest.

## Global Constraints

- **Taxonomia de status:** mantida `'aguardando' | 'em_andamento' | 'aguardando_cliente' | 'resolvida' | 'arquivada'`. NÃO renomear, NÃO criar enum/CHECK, NÃO migrar `arquivada` para flag.
- **"Novo atendimento":** conta +1 na criação da conversa (1º contato) **e** quando uma conversa `resolvida`/`arquivada` reabre para `aguardando`/`em_andamento`. Transições entre estados ativos não contam.
- **Provider Pattern:** features consomem dados só via `@/providers/data` (hooks). Mock impl real; supabase impl = **placeholder vazio (sem `NotImplementedError`)**.
- **Tokens semânticos:** componentes usam apenas `bg-background`/`text-foreground`/`text-primary`/`var(--border)` etc. — nunca hex hardcoded fora dos fallbacks de chart já convencionados (`var(--gallo-parts-green, #337648)`).
- **Tema:** light + dark obrigatórios. WCAG 2.1 AA. `cursor-pointer` em clicáveis, focus rings, `prefers-reduced-motion`.
- **Zero `any`.** Interfaces de domínio prefixadas com `I`. Union literais (não `enum` TS).
- **Sem dependência nova** (recharts, react-day-picker, shadcn já presentes). Se precisar de pacote, confirmar com o dono (bunfig 24h guard).
- **Gate de CI:** `bun run build` + `bun run test`. Type-check do código novo por delta: `bunx tsc --noEmit` (há baseline de erros pré-existentes — avaliar só arquivos criados/alterados na branch).
- **UI/conteúdo em pt-BR** com acentos corretos; código/identificadores em inglês.
- **Commits:** Conventional Commits em inglês, atômicos. Não fazer push/merge sem autorização.

---

## File Structure

```
src/shared/types/
  service-volume.ts                      [CREATE] tipos de métrica (Granularity, MetricBucket, I*Result)
  index.ts                               [MODIFY] export do novo barrel

src/providers/data/
  contracts/atendimentoMetrics.ts        [CREATE] IAtendimentoMetricsProvider
  contracts/index.ts                     [MODIFY] import + export + chave em IDataProviders
  hooks/useAtendimentoMetricsProvider.ts [CREATE] hook via useDataProviderSlice
  index.ts                               [MODIFY] export do hook (+ type)
  impl/mock/atendimentoMetrics.ts        [CREATE] impl mock determinística
  impl/supabase/atendimentoMetrics.ts    [CREATE] impl placeholder vazia
  factory.ts                             [MODIFY] registra nos 2 objetos

src/features/rbac/permissions/
  resources.ts                           [MODIFY] + "service_volume"
  matrix.ts                              [MODIFY] Owner all / Gestor store

src/features/service-volume/
  engine/bucketing.ts                    [CREATE] + bucketing.test.ts
  engine/delta.ts                        [CREATE] + delta.test.ts
  engine/formatHandleTime.ts             [CREATE] + formatHandleTime.test.ts
  engine/synthesizeCycles.ts             [CREATE] + synthesizeCycles.test.ts (regra "novo atendimento")
  engine/index.ts                        [CREATE] barrel
  hooks/useServiceVolumeFilters.ts       [CREATE] URL sync (aba + filtros do volume)
  hooks/useServiceVolumeMetrics.ts       [CREATE] orquestra TanStack Query
  components/ServiceVolumeFilters.tsx     [CREATE]
  components/ServiceVolumeKpis.tsx        [CREATE]
  components/NovosAtendimentosChart.tsx   [CREATE] hero
  components/MessageVolumeChart.tsx       [CREATE]
  components/MessagesByUserChart.tsx      [CREATE] toggle humano/automação/ambos
  components/StatusDistributionDonut.tsx  [CREATE] donut + legenda; prop `compact`
  components/AccumulatedChatsChart.tsx    [CREATE]
  components/InboxStatusSummaryCard.tsx   [CREATE] card da Caixa
  pages/ServiceVolumePage.tsx             [CREATE]
  i18n/pt-BR.ts                          [CREATE]
  index.ts                               [CREATE] barrel

src/features/manager-dashboard/
  hooks/useDashboardFilters.ts           [MODIFY] aceitar `aba` + params do volume no validate
  pages/ManagerDashboardPage.tsx         [MODIFY] shell de abas (wrap)

src/features/conversations/pages/InboxPage.tsx  [MODIFY] inserir card no topo

supabase/migrations/
  20260624XXXXXX_rbac_service_volume.sql  [CREATE] seed RBAC aditivo (aplicação MANUAL — ver Task 13)
```

---

## Fase 0 — Engines puros (lógica testável)

### Task 1: `engine/bucketing.ts` — agrupar timestamps por bucket

**Files:**
- Create: `src/features/service-volume/engine/bucketing.ts`
- Test: `src/features/service-volume/engine/bucketing.test.ts`

**Interfaces:**
- Consumes: tipos `Granularity`, `MetricBucket` (definidos aqui inicialmente como import local; movidos a `shared/types` na Task 4 — para evitar dependência circular, defina-os PRIMEIRO em `shared/types/service-volume.ts` na Task 4 e importe; nesta task declare-os inline e ajuste o import na Task 4). Para simplificar: declare os tipos auxiliares no topo de `bucketing.ts` e re-exporte na Task 4.
- Produces: `bucketKey(iso: string, g: Granularity): string`, `bucketize(timestamps: string[], g: Granularity): MetricBucket[]`, `averagePerDay(timestamps: string[], fromIso: string, toIso: string): number`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { bucketKey, bucketize, averagePerDay } from "./bucketing";

describe("bucketKey", () => {
  it("dia → YYYY-MM-DD", () => {
    expect(bucketKey("2026-06-16T13:45:00Z", "day")).toBe("2026-06-16");
  });
  it("mês → YYYY-MM", () => {
    expect(bucketKey("2026-06-16T13:45:00Z", "month")).toBe("2026-06");
  });
  it("semana → segunda-feira ISO da semana (YYYY-MM-DD)", () => {
    // 2026-06-16 é uma terça; a segunda da semana é 2026-06-15
    expect(bucketKey("2026-06-16T13:45:00Z", "week")).toBe("2026-06-15");
  });
});

describe("bucketize", () => {
  it("conta ocorrências por bucket e ordena crescente", () => {
    const out = bucketize(
      ["2026-06-15T10:00:00Z", "2026-06-15T20:00:00Z", "2026-06-16T09:00:00Z"],
      "day",
    );
    expect(out).toEqual([
      { bucket: "2026-06-15", value: 2 },
      { bucket: "2026-06-16", value: 1 },
    ]);
  });
  it("array vazio → []", () => {
    expect(bucketize([], "day")).toEqual([]);
  });
});

describe("averagePerDay", () => {
  it("total / número de dias do intervalo (inclusivo)", () => {
    // 4 eventos em 2 dias → 2/dia
    const avg = averagePerDay(
      ["2026-06-15T10:00:00Z", "2026-06-15T11:00:00Z", "2026-06-16T10:00:00Z", "2026-06-16T11:00:00Z"],
      "2026-06-15T00:00:00Z",
      "2026-06-16T23:59:59Z",
    );
    expect(avg).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/service-volume/engine/bucketing.test.ts`
Expected: FAIL ("Cannot find module './bucketing'").

- [ ] **Step 3: Write minimal implementation**

```ts
export type Granularity = "day" | "week" | "month";
export interface MetricBucket {
  bucket: string;
  value: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Monday (ISO week start) of the week containing `d`, as YYYY-MM-DD (UTC). */
function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift back to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function bucketKey(iso: string, g: Granularity): string {
  const d = new Date(iso);
  if (g === "month") return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  if (g === "week") return isoWeekStart(d);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function bucketize(timestamps: string[], g: Granularity): MetricBucket[] {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const key = bucketKey(ts, g);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([bucket, value]) => ({ bucket, value }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

export function averagePerDay(timestamps: string[], fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const days = Math.max(1, Math.ceil((to - from) / 86_400_000));
  return Math.round((timestamps.length / days) * 10) / 10;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/service-volume/engine/bucketing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/service-volume/engine/bucketing.ts src/features/service-volume/engine/bucketing.test.ts
git commit -m "feat(service-volume): add bucketing engine (day/week/month aggregation)"
```

---

### Task 2: `engine/delta.ts` — variação percentual vs período anterior

**Files:**
- Create: `src/features/service-volume/engine/delta.ts`
- Test: `src/features/service-volume/engine/delta.test.ts`

**Interfaces:**
- Produces: `deltaPct(current: number, previous: number): number | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { deltaPct } from "./delta";

describe("deltaPct", () => {
  it("crescimento positivo arredondado", () => {
    expect(deltaPct(110, 100)).toBe(10);
  });
  it("queda negativa", () => {
    expect(deltaPct(90, 100)).toBe(-10);
  });
  it("previous=0 → null (sem base de comparação)", () => {
    expect(deltaPct(50, 0)).toBeNull();
  });
  it("arredonda para inteiro", () => {
    expect(deltaPct(133, 100)).toBe(33);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/service-volume/engine/delta.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/service-volume/engine/delta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/service-volume/engine/delta.ts src/features/service-volume/engine/delta.test.ts
git commit -m "feat(service-volume): add delta engine (period-over-period pct)"
```

---

### Task 3: `engine/formatHandleTime.ts` — ms → "3h 12m"

**Files:**
- Create: `src/features/service-volume/engine/formatHandleTime.ts`
- Test: `src/features/service-volume/engine/formatHandleTime.test.ts`

**Interfaces:**
- Produces: `formatHandleTime(ms: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { formatHandleTime } from "./formatHandleTime";

describe("formatHandleTime", () => {
  it("zero/negativo → travessão", () => {
    expect(formatHandleTime(0)).toBe("—");
    expect(formatHandleTime(-5)).toBe("—");
  });
  it("menos de 1 min → segundos", () => {
    expect(formatHandleTime(45_000)).toBe("45s");
  });
  it("minutos", () => {
    expect(formatHandleTime(12 * 60_000)).toBe("12m");
  });
  it("horas e minutos", () => {
    expect(formatHandleTime((3 * 60 + 12) * 60_000)).toBe("3h 12m");
  });
  it("horas exatas omitem minutos", () => {
    expect(formatHandleTime(2 * 3_600_000)).toBe("2h");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/features/service-volume/engine/formatHandleTime.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
export function formatHandleTime(ms: number): string {
  if (ms <= 0) return "—";
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return `${Math.round(ms / 1000)}s`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/features/service-volume/engine/formatHandleTime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/service-volume/engine/formatHandleTime.ts src/features/service-volume/engine/formatHandleTime.test.ts
git commit -m "feat(service-volume): add handle-time formatter (ms to h/m/s)"
```

---

### Task 4: tipos compartilhados + `engine/synthesizeCycles.ts` (regra "novo atendimento") + barrel

**Files:**
- Create: `src/shared/types/service-volume.ts`
- Modify: `src/shared/types/index.ts` (adicionar `export * from "./service-volume";` junto aos demais exports)
- Create: `src/features/service-volume/engine/synthesizeCycles.ts`
- Test: `src/features/service-volume/engine/synthesizeCycles.test.ts`
- Create: `src/features/service-volume/engine/index.ts`
- Modify: `src/features/service-volume/engine/bucketing.ts` (re-exportar `Granularity`/`MetricBucket` de shared/types — ver abaixo)

**Interfaces:**
- Consumes: `bucketize`, `bucketKey` (Task 1).
- Produces: tipos `ServiceMetricParams`, `INovosAtendimentosResult`, `IMessageVolumeResult`, `IMessagesByUserResult`, `IStatusDistributionResult`, `IAccumulatedChatsResult`, `IHandleTimeStatsResult`; função `synthesizeNovoAtendimentoTimestamps(conv: { id: string; createdAt: string; lastMessageAt: string; status: string }): string[]`.

- [ ] **Step 1: Criar os tipos compartilhados**

Create `src/shared/types/service-volume.ts`:

```ts
import type { ID, ISO8601 } from "./common";
import type { ConversationStatus } from "./conversation";

export type Granularity = "day" | "week" | "month";
export interface MetricBucket {
  bucket: string;
  value: number;
}

export interface ServiceMetricParams {
  storeId?: ID;
  sellerId?: ID;
  from: ISO8601;
  to: ISO8601;
  granularity: Granularity;
}

export interface INovosAtendimentosResult {
  series: MetricBucket[];
  total: number;
  averagePerDay: number;
  deltaPct: number | null;
  /** Reservado p/ o aviso forward-only do PRD-214; null no mock. */
  historyStartsAt: ISO8601 | null;
}

export interface IMessageVolumePoint {
  bucket: string;
  sent: number;
  received: number;
}
export interface IMessageVolumeResult {
  series: IMessageVolumePoint[];
  totalSent: number;
  totalReceived: number;
}

export type MetricAudience = "human" | "automation" | "all";
export interface IMessagesByUserRow {
  sellerId: ID | null;
  name: string;
  authorType: "seller" | "sdr" | "system";
  count: number;
}
export interface IMessagesByUserResult {
  rows: IMessagesByUserRow[];
  audience: MetricAudience;
}

export interface IStatusDistributionSlice {
  status: ConversationStatus;
  count: number;
}
export interface IStatusDistributionResult {
  slices: IStatusDistributionSlice[];
  total: number;
}

export interface IAccumulatedChatsResult {
  series: MetricBucket[];
  total: number;
}

export interface IHandleTimeStatsResult {
  averageMs: number;
  medianMs: number | null;
  cycleCount: number;
  deltaPct: number | null;
}
```

- [ ] **Step 2: Reapontar os tipos do bucketing para shared/types**

Modify `src/features/service-volume/engine/bucketing.ts`: substituir as declarações locais `export type Granularity` e `export interface MetricBucket` por:

```ts
import type { Granularity, MetricBucket } from "@/shared/types/service-volume";
export type { Granularity, MetricBucket };
```

(O resto do arquivo permanece. Rode `bun run test -- src/features/service-volume/engine/bucketing.test.ts` e confirme PASS após o ajuste.)

- [ ] **Step 3: Adicionar export no barrel de tipos**

Modify `src/shared/types/index.ts`: adicionar, junto aos demais `export * from`:

```ts
export * from "./service-volume";
```

- [ ] **Step 4: Write the failing test (synthesizeCycles)**

```ts
import { describe, expect, it } from "vitest";
import { synthesizeNovoAtendimentoTimestamps } from "./synthesizeCycles";

const base = { id: "conv-1", createdAt: "2026-06-01T12:00:00Z", lastMessageAt: "2026-06-10T12:00:00Z" };

describe("synthesizeNovoAtendimentoTimestamps", () => {
  it("inclui sempre o 1º contato (createdAt)", () => {
    const out = synthesizeNovoAtendimentoTimestamps({ ...base, status: "aguardando" });
    expect(out[0]).toBe("2026-06-01T12:00:00Z");
  });
  it("é determinístico (mesmo id → mesmo resultado)", () => {
    const a = synthesizeNovoAtendimentoTimestamps({ ...base, status: "resolvida" });
    const b = synthesizeNovoAtendimentoTimestamps({ ...base, status: "resolvida" });
    expect(a).toEqual(b);
  });
  it("reaberturas caem dentro de [createdAt, lastMessageAt]", () => {
    const out = synthesizeNovoAtendimentoTimestamps({ ...base, status: "resolvida" });
    const lo = new Date(base.createdAt).getTime();
    const hi = new Date(base.lastMessageAt).getTime();
    for (const ts of out) {
      const t = new Date(ts).getTime();
      expect(t).toBeGreaterThanOrEqual(lo);
      expect(t).toBeLessThanOrEqual(hi);
    }
  });
  it("createdAt === lastMessageAt → só o 1º contato (sem reabertura possível)", () => {
    const out = synthesizeNovoAtendimentoTimestamps({
      id: "x",
      createdAt: "2026-06-01T12:00:00Z",
      lastMessageAt: "2026-06-01T12:00:00Z",
      status: "resolvida",
    });
    expect(out).toEqual(["2026-06-01T12:00:00Z"]);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `bun run test -- src/features/service-volume/engine/synthesizeCycles.test.ts`
Expected: FAIL.

- [ ] **Step 6: Write minimal implementation**

```ts
/**
 * Deterministic synthesis of "novo atendimento" event timestamps for the mock.
 * Rule (Global Constraints): each conversation contributes 1 first-contact
 * event at createdAt, plus N synthetic reopen events when the conversation
 * looks like it cycled (terminal statuses are more likely to have reopened).
 * No Math.random — derived from a hash of the conversation id so reloads are
 * stable. The real PRD-214 derives these from conversation_status_events.
 */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff; // 0..1
}

export function synthesizeNovoAtendimentoTimestamps(conv: {
  id: string;
  createdAt: string;
  lastMessageAt: string;
  status: string;
}): string[] {
  const out = [conv.createdAt];
  const lo = new Date(conv.createdAt).getTime();
  const hi = new Date(conv.lastMessageAt).getTime();
  if (hi <= lo) return out;

  // Terminal/older conversations are more likely to have reopened.
  const propensity = conv.status === "resolvida" || conv.status === "arquivada" ? 0.7 : 0.25;
  const seed = hash(conv.id);
  if (seed > propensity) return out;

  const reopens = 1 + Math.floor(hash(conv.id + "r") * 2); // 1..2 extra cycles
  for (let i = 1; i <= reopens; i++) {
    const frac = hash(conv.id + `:${i}`);
    out.push(new Date(lo + frac * (hi - lo)).toISOString());
  }
  return out;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `bun run test -- src/features/service-volume/engine/synthesizeCycles.test.ts`
Expected: PASS.

- [ ] **Step 8: Criar o barrel do engine**

Create `src/features/service-volume/engine/index.ts`:

```ts
export * from "./bucketing";
export * from "./delta";
export * from "./formatHandleTime";
export * from "./synthesizeCycles";
```

- [ ] **Step 9: Commit**

```bash
git add src/shared/types/service-volume.ts src/shared/types/index.ts src/features/service-volume/engine
git commit -m "feat(service-volume): add metric types + cycle synthesis engine"
```

---

## Fase 1 — Provider (contrato + mock + placeholder + registro)

### Task 5: contrato + hook + registro + supabase placeholder

**Files:**
- Create: `src/providers/data/contracts/atendimentoMetrics.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/hooks/useAtendimentoMetricsProvider.ts`
- Modify: `src/providers/data/index.ts`
- Create: `src/providers/data/impl/supabase/atendimentoMetrics.ts`
- Create: `src/providers/data/impl/mock/atendimentoMetrics.ts` (stub que retorna vazio — preenchido na Task 6)
- Modify: `src/providers/data/factory.ts`

**Interfaces:**
- Consumes: tipos de `@/shared/types` (Task 4).
- Produces: `IAtendimentoMetricsProvider`; `useAtendimentoMetricsProvider()`; slice `atendimentoMetrics` em `IDataProviders`.

- [ ] **Step 1: Criar o contrato**

Create `src/providers/data/contracts/atendimentoMetrics.ts`:

```ts
import type {
  ServiceMetricParams,
  MetricAudience,
  INovosAtendimentosResult,
  IMessageVolumeResult,
  IMessagesByUserResult,
  IStatusDistributionResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
} from "@/shared/types";

export interface IAtendimentoMetricsProvider {
  getNovosAtendimentos(p: ServiceMetricParams): Promise<INovosAtendimentosResult>;
  getMessageVolume(p: ServiceMetricParams): Promise<IMessageVolumeResult>;
  getMessagesByUser(
    p: ServiceMetricParams & { audience: MetricAudience },
  ): Promise<IMessagesByUserResult>;
  getStatusDistribution(p: ServiceMetricParams): Promise<IStatusDistributionResult>;
  getAccumulatedChats(p: ServiceMetricParams): Promise<IAccumulatedChatsResult>;
  getHandleTimeStats(p: ServiceMetricParams): Promise<IHandleTimeStatsResult>;
}
```

- [ ] **Step 2: Registrar no barrel de contracts**

Modify `src/providers/data/contracts/index.ts`:
- adicionar com os demais imports: `import type { IAtendimentoMetricsProvider } from "./atendimentoMetrics";`
- adicionar com os demais re-exports: `export type { IAtendimentoMetricsProvider } from "./atendimentoMetrics";`
- adicionar a chave na interface `IDataProviders` (ao lado de `ai`): `atendimentoMetrics: IAtendimentoMetricsProvider;`

- [ ] **Step 3: Criar o hook**

Create `src/providers/data/hooks/useAtendimentoMetricsProvider.ts`:

```ts
import type { IAtendimentoMetricsProvider } from "../contracts/atendimentoMetrics";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useAtendimentoMetricsProvider(): IAtendimentoMetricsProvider {
  return useDataProviderSlice("atendimentoMetrics", "useAtendimentoMetricsProvider");
}
```

Modify `src/providers/data/index.ts`: exportar o hook junto aos demais (`export { useAtendimentoMetricsProvider } from "./hooks/useAtendimentoMetricsProvider";`) e o type se o barrel exporta types de contrato.

- [ ] **Step 4: Criar a impl supabase placeholder (vazia, sem erro)**

Create `src/providers/data/impl/supabase/atendimentoMetrics.ts`:

```ts
import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";

/**
 * Placeholder until PRD-214 (`Pulse`) lands the event log + aggregations.
 * Returns empty/zeroed results (NOT NotImplementedError) so the panel renders
 * graceful empty states in production instead of crashing. Swap for the real
 * impl in the 2nd delivery.
 */
export const supabaseAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
  async getNovosAtendimentos() {
    return { series: [], total: 0, averagePerDay: 0, deltaPct: null, historyStartsAt: null };
  },
  async getMessageVolume() {
    return { series: [], totalSent: 0, totalReceived: 0 };
  },
  async getMessagesByUser(p) {
    return { rows: [], audience: p.audience };
  },
  async getStatusDistribution() {
    return { slices: [], total: 0 };
  },
  async getAccumulatedChats() {
    return { series: [], total: 0 };
  },
  async getHandleTimeStats() {
    return { averageMs: 0, medianMs: null, cycleCount: 0, deltaPct: null };
  },
};
```

- [ ] **Step 5: Criar a impl mock stub (vazia por ora — preenchida na Task 6)**

Create `src/providers/data/impl/mock/atendimentoMetrics.ts`:

```ts
import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";

export const mockAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
  async getNovosAtendimentos() {
    return { series: [], total: 0, averagePerDay: 0, deltaPct: null, historyStartsAt: null };
  },
  async getMessageVolume() {
    return { series: [], totalSent: 0, totalReceived: 0 };
  },
  async getMessagesByUser(p) {
    return { rows: [], audience: p.audience };
  },
  async getStatusDistribution() {
    return { slices: [], total: 0 };
  },
  async getAccumulatedChats() {
    return { series: [], total: 0 };
  },
  async getHandleTimeStats() {
    return { averageMs: 0, medianMs: null, cycleCount: 0, deltaPct: null };
  },
};
```

- [ ] **Step 6: Registrar na factory**

Modify `src/providers/data/factory.ts`:
- import mock: `import { mockAtendimentoMetricsProvider } from "./impl/mock/atendimentoMetrics";`
- import supabase: `import { supabaseAtendimentoMetricsProvider } from "./impl/supabase/atendimentoMetrics";`
- em `mockProviders` (ao lado de `ai`): `atendimentoMetrics: mockAtendimentoMetricsProvider,`
- em `supabaseProviders`: `atendimentoMetrics: supabaseAtendimentoMetricsProvider,`

- [ ] **Step 7: Verify build/typecheck**

Run: `bun run build`
Expected: build OK (sem erro de tipo na montagem de `IDataProviders`).

- [ ] **Step 8: Commit**

```bash
git add src/providers/data src/shared/types
git commit -m "feat(service-volume): register atendimentoMetrics provider (mock stub + supabase placeholder)"
```

---

### Task 6: impl mock determinística (as 6 métricas)

**Files:**
- Modify: `src/providers/data/impl/mock/atendimentoMetrics.ts`
- Test: `src/providers/data/impl/mock/atendimentoMetrics.test.ts`

**Interfaces:**
- Consumes: `getMockState()` de `@/mocks/store/mockStore` (conversations, messages, sellers); engines de `@/features/service-volume/engine`.
- Produces: a impl real de `mockAtendimentoMetricsProvider`.

> Notas de domínio (do mapeamento):
> - `IConversation`: `id`, `storeId`, `status`, `assignedSellerId?`, `createdAt`, `lastMessageAt`.
> - `IMessage`: `conversationId`, `direction` (`MessageDirection`), `authorType` (`'customer'|'seller'|'sdr'|'system'`), `authorId?`, `sentAt`.
> - `ISeller`: `id`, `fullName`.
> - `direction` outbound = enviada; inbound = recebida (confirme os literais reais de `MessageDirection` em `src/shared/types/conversation.ts` ao implementar — usar os literais existentes, ex.: `"out"`/`"in"` ou `"outbound"`/`"inbound"`).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { mockAtendimentoMetricsProvider as p } from "./atendimentoMetrics";

const params = {
  from: "2000-01-01T00:00:00Z",
  to: "2100-01-01T00:00:00Z",
  granularity: "day" as const,
};

describe("mockAtendimentoMetricsProvider", () => {
  it("getStatusDistribution: soma das fatias = total e total > 0 (seed populado)", async () => {
    const r = await p.getStatusDistribution(params);
    const sum = r.slices.reduce((a, s) => a + s.count, 0);
    expect(sum).toBe(r.total);
    expect(r.total).toBeGreaterThan(0);
  });

  it("getNovosAtendimentos: total >= número de conversas (1º contato garante isso) e é determinístico", async () => {
    const a = await p.getNovosAtendimentos(params);
    const b = await p.getNovosAtendimentos(params);
    expect(a.total).toBe(b.total);
    expect(a.total).toBeGreaterThan(0);
    expect(a.series.length).toBeGreaterThan(0);
  });

  it("getMessageVolume: totais batem com a soma das séries", async () => {
    const r = await p.getMessageVolume(params);
    const sent = r.series.reduce((a, x) => a + x.sent, 0);
    const received = r.series.reduce((a, x) => a + x.received, 0);
    expect(sent).toBe(r.totalSent);
    expect(received).toBe(r.totalReceived);
  });

  it("getMessagesByUser: audience='automation' não inclui authorType seller", async () => {
    const r = await p.getMessagesByUser({ ...params, audience: "automation" });
    expect(r.rows.every((row) => row.authorType !== "seller")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/providers/data/impl/mock/atendimentoMetrics.test.ts`
Expected: FAIL (impl ainda retorna vazio).

- [ ] **Step 3: Write the implementation**

Substituir o conteúdo de `src/providers/data/impl/mock/atendimentoMetrics.ts` por (ajuste os literais de `direction` aos reais do projeto):

```ts
import type { IAtendimentoMetricsProvider } from "../../contracts/atendimentoMetrics";
import type { ConversationStatus, IMessagesByUserRow } from "@/shared/types";
import { getMockState } from "@/mocks/store/mockStore";
import {
  bucketize,
  averagePerDay,
  deltaPct,
  synthesizeNovoAtendimentoTimestamps,
} from "@/features/service-volume/engine";

function inRange(iso: string, from: string, to: string): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(from).getTime() && t <= new Date(to).getTime();
}

function scopedConversations(storeId?: string, sellerId?: string) {
  return getMockState().conversations.filter(
    (c) =>
      (!storeId || c.storeId === storeId) &&
      (!sellerId || c.assignedSellerId === sellerId),
  );
}

export const mockAtendimentoMetricsProvider: IAtendimentoMetricsProvider = {
  async getNovosAtendimentos({ storeId, sellerId, from, to, granularity }) {
    const convs = scopedConversations(storeId, sellerId);
    const all = convs.flatMap((c) =>
      synthesizeNovoAtendimentoTimestamps({
        id: c.id,
        createdAt: c.createdAt,
        lastMessageAt: c.lastMessageAt,
        status: c.status,
      }),
    );
    const within = all.filter((ts) => inRange(ts, from, to));
    const series = bucketize(within, granularity);
    // previous period of the same length, for delta
    const span = new Date(to).getTime() - new Date(from).getTime();
    const prevFrom = new Date(new Date(from).getTime() - span).toISOString();
    const prevWithin = all.filter((ts) => inRange(ts, prevFrom, from));
    return {
      series,
      total: within.length,
      averagePerDay: averagePerDay(within, from, to),
      deltaPct: deltaPct(within.length, prevWithin.length),
      historyStartsAt: null,
    };
  },

  async getMessageVolume({ storeId, sellerId, from, to, granularity }) {
    const convIds = new Set(scopedConversations(storeId, sellerId).map((c) => c.id));
    const msgs = getMockState().messages.filter(
      (m) => convIds.has(m.conversationId) && inRange(m.sentAt, from, to),
    );
    const sentTs = msgs.filter((m) => m.direction === "out").map((m) => m.sentAt);
    const recvTs = msgs.filter((m) => m.direction === "in").map((m) => m.sentAt);
    const sentB = bucketize(sentTs, granularity);
    const recvB = bucketize(recvTs, granularity);
    const buckets = [...new Set([...sentB, ...recvB].map((b) => b.bucket))].sort();
    const sentMap = new Map(sentB.map((b) => [b.bucket, b.value]));
    const recvMap = new Map(recvB.map((b) => [b.bucket, b.value]));
    return {
      series: buckets.map((bucket) => ({
        bucket,
        sent: sentMap.get(bucket) ?? 0,
        received: recvMap.get(bucket) ?? 0,
      })),
      totalSent: sentTs.length,
      totalReceived: recvTs.length,
    };
  },

  async getMessagesByUser({ storeId, sellerId, from, to, audience }) {
    const convIds = new Set(scopedConversations(storeId, sellerId).map((c) => c.id));
    const sellers = new Map(getMockState().sellers.map((s) => [s.id, s.fullName]));
    const isHuman = (t: string) => t === "seller";
    const isAuto = (t: string) => t === "sdr" || t === "system";
    const counts = new Map<string, IMessagesByUserRow>();
    for (const m of getMockState().messages) {
      if (!convIds.has(m.conversationId)) continue;
      if (m.authorType === "customer") continue; // recebidas não entram em "por usuário"
      if (!inRange(m.sentAt, from, to)) continue;
      if (audience === "human" && !isHuman(m.authorType)) continue;
      if (audience === "automation" && !isAuto(m.authorType)) continue;
      const key = m.authorId ?? `auto:${m.authorType}`;
      const row =
        counts.get(key) ??
        {
          sellerId: m.authorType === "seller" ? (m.authorId ?? null) : null,
          name:
            m.authorType === "seller"
              ? (sellers.get(m.authorId ?? "") ?? "Atendente")
              : m.authorType === "sdr"
                ? "SDR (automação)"
                : "Sistema",
          authorType: m.authorType as "seller" | "sdr" | "system",
          count: 0,
        };
      row.count += 1;
      counts.set(key, row);
    }
    return {
      rows: [...counts.values()].sort((a, b) => b.count - a.count),
      audience,
    };
  },

  async getStatusDistribution({ storeId, sellerId }) {
    const convs = scopedConversations(storeId, sellerId);
    const counts = new Map<ConversationStatus, number>();
    for (const c of convs) counts.set(c.status, (counts.get(c.status) ?? 0) + 1);
    const slices = [...counts.entries()].map(([status, count]) => ({ status, count }));
    return { slices, total: convs.length };
  },

  async getAccumulatedChats({ storeId, sellerId, from, to, granularity }) {
    const convs = scopedConversations(storeId, sellerId);
    const created = convs.map((c) => c.createdAt).filter((ts) => inRange(ts, from, to));
    const series = bucketize(created, granularity);
    let running = 0;
    const cumulative = series.map((b) => {
      running += b.value;
      return { bucket: b.bucket, value: running };
    });
    return { series: cumulative, total: convs.length };
  },

  async getHandleTimeStats({ storeId, sellerId, from, to }) {
    const convs = scopedConversations(storeId, sellerId).filter((c) =>
      inRange(c.createdAt, from, to),
    );
    const durations = convs
      .map((c) => new Date(c.lastMessageAt).getTime() - new Date(c.createdAt).getTime())
      .filter((d) => d > 0)
      .sort((a, b) => a - b);
    if (durations.length === 0) {
      return { averageMs: 0, medianMs: null, cycleCount: 0, deltaPct: null };
    }
    const sum = durations.reduce((a, d) => a + d, 0);
    const median = durations[Math.floor(durations.length / 2)];
    return {
      averageMs: Math.round(sum / durations.length),
      medianMs: median,
      cycleCount: durations.length,
      deltaPct: null,
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/providers/data/impl/mock/atendimentoMetrics.test.ts`
Expected: PASS. (Se falhar em `direction`, ajuste os literais `"out"`/`"in"` aos reais de `MessageDirection`.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/mock/atendimentoMetrics.ts src/providers/data/impl/mock/atendimentoMetrics.test.ts
git commit -m "feat(service-volume): implement deterministic mock metrics provider"
```

---

## Fase 2 — RBAC + shell de abas

### Task 7: permissão `service_volume` (matriz estática)

**Files:**
- Modify: `src/features/rbac/permissions/resources.ts`
- Modify: `src/features/rbac/permissions/matrix.ts`

- [ ] **Step 1: Adicionar o recurso**

Modify `src/features/rbac/permissions/resources.ts`: adicionar `"service_volume",` ao array `RESOURCES` (junto aos recursos analíticos, ex.: após `"customer_service_analytics"`).

- [ ] **Step 2: Conceder a Owner e Gestor**

Modify `src/features/rbac/permissions/matrix.ts`:
- em `OWNER_ENTRIES`: adicionar `p("service_volume", ["view"], "all"),`
- em `GESTOR_ENTRIES`: adicionar `p("service_volume", ["view"], "store"),`
- NÃO adicionar em `VENDEDOR_ENTRIES`, `SDR_ENTRIES`, `FINANCEIRO_ENTRIES`, `CLIENTE_ENTRIES`, `VENDEDOR_EXTERNO_ENTRIES` (PRD-215: só Owner/Gestor).

- [ ] **Step 3: Verify**

Run: `bun run build && bun run test`
Expected: PASS (a matriz é tipo-checada contra `ResourceName`).

- [ ] **Step 4: Commit**

```bash
git add src/features/rbac/permissions/resources.ts src/features/rbac/permissions/matrix.ts
git commit -m "feat(rbac): add service_volume.view permission (Owner/Gestor)"
```

---

### Task 8: shell de abas em `/app/inicio` + página vazia gated

**Files:**
- Modify: `src/features/manager-dashboard/hooks/useDashboardFilters.ts` (validate aceitar `aba` + params do volume)
- Create: `src/features/service-volume/hooks/useServiceVolumeFilters.ts`
- Create: `src/features/service-volume/pages/ServiceVolumePage.tsx` (placeholder)
- Create: `src/features/service-volume/i18n/pt-BR.ts`
- Create: `src/features/service-volume/index.ts`
- Modify: `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx` (wrap em Tabs)

**Interfaces:**
- Consumes: `Tabs/TabsList/TabsTrigger/TabsContent` de `@/components/ui/tabs`; `usePermission` de `@/features/rbac/hooks/usePermission`.
- Produces: aba "Atendimento" com `?aba=atendimento`; `ServiceVolumePage`.

- [ ] **Step 1: Estender o validate da rota `/app/inicio`**

Modify `src/features/manager-dashboard/hooks/useDashboardFilters.ts`:
- adicionar a `IDashboardFiltersSearch` os campos opcionais (prefixo `v` evita colisão com os filtros de operação):
```ts
  aba?: string;
  vg?: string;   // granularidade do volume: day|week|month
  vper?: string; // período do volume: 24h|7d|30d|custom
  vde?: string;  // custom from (ISO date)
  vate?: string; // custom to (ISO date)
  vloja?: string;
```
- em `validateDashboardSearch`, passar adiante quando presentes:
```ts
  if (typeof raw.aba === "string" && (raw.aba === "operacao" || raw.aba === "atendimento")) out.aba = raw.aba;
  if (typeof raw.vg === "string" && ["day", "week", "month"].includes(raw.vg)) out.vg = raw.vg;
  if (typeof raw.vper === "string" && ["24h", "7d", "30d", "custom"].includes(raw.vper)) out.vper = raw.vper;
  if (typeof raw.vde === "string" && raw.vde.length > 0) out.vde = raw.vde;
  if (typeof raw.vate === "string" && raw.vate.length > 0) out.vate = raw.vate;
  if (typeof raw.vloja === "string" && raw.vloja.length > 0) out.vloja = raw.vloja;
```

- [ ] **Step 2: Criar `useServiceVolumeFilters` (URL sync)**

Create `src/features/service-volume/hooks/useServiceVolumeFilters.ts`:

```ts
import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { Granularity, ID } from "@/shared/types";

export type VolumePeriod = "24h" | "7d" | "30d" | "custom";
export type DashboardTab = "operacao" | "atendimento";

export interface IServiceVolumeState {
  tab: DashboardTab;
  granularity: Granularity;
  period: VolumePeriod;
  fromIso: string;
  toIso: string;
  store: ID | "all";
}

const DAY = 86_400_000;

function rangeFor(period: VolumePeriod, vde?: string, vate?: string): { fromIso: string; toIso: string } {
  const now = Date.now();
  if (period === "custom" && vde && vate) {
    return { fromIso: new Date(vde).toISOString(), toIso: new Date(vate).toISOString() };
  }
  const days = period === "24h" ? 1 : period === "7d" ? 7 : 30;
  return { fromIso: new Date(now - days * DAY).toISOString(), toIso: new Date(now).toISOString() };
}

export function useServiceVolumeFilters() {
  const search = useSearch({ from: "/app/inicio" }) as Record<string, string | undefined>;
  const navigate = useNavigate({ from: "/app/inicio" });

  const state = useMemo<IServiceVolumeState>(() => {
    const period = (search.vper as VolumePeriod) ?? "30d";
    const { fromIso, toIso } = rangeFor(period, search.vde, search.vate);
    return {
      tab: (search.aba as DashboardTab) ?? "operacao",
      granularity: (search.vg as Granularity) ?? "day",
      period,
      fromIso,
      toIso,
      store: (search.vloja as ID | undefined) ?? "all",
    };
  }, [search]);

  const apply = useCallback(
    (patch: Record<string, string | undefined>) => {
      void navigate({
        search: (prev) => {
          const next = { ...(prev as Record<string, string | undefined>), ...patch };
          for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === "") delete next[k];
          return next;
        },
      });
    },
    [navigate],
  );

  return {
    state,
    setTab: (tab: DashboardTab) => apply({ aba: tab === "operacao" ? undefined : tab }),
    setGranularity: (g: Granularity) => apply({ vg: g === "day" ? undefined : g }),
    setPeriod: (p: VolumePeriod) => apply({ vper: p === "30d" ? undefined : p, vde: undefined, vate: undefined }),
    setCustomRange: (from: string, to: string) => apply({ vper: "custom", vde: from, vate: to }),
    setStore: (id: ID | "all") => apply({ vloja: id === "all" ? undefined : id }),
  };
}
```

- [ ] **Step 3: Criar i18n + página placeholder + barrel**

Create `src/features/service-volume/i18n/pt-BR.ts`:

```ts
export const SERVICE_VOLUME_STRINGS = {
  tabOperacao: "Operação",
  tabAtendimento: "Atendimento",
  kpiNovos: "Novos atendimentos",
  kpiNovosHelp: "1º contato + reaberturas no período",
  kpiAcumulados: "Chats acumulados",
  kpiTempo: "Tempo médio",
  kpiTempoHelp: "Duração média por ciclo de atendimento",
  kpiMensagens: "Mensagens",
  heroTitle: "Novos atendimentos por período",
  heroAvg: "média",
  heroTotal: "total",
  msgVolumeTitle: "Mensagens enviadas vs recebidas",
  byUserTitle: "Mensagens por usuário",
  audienceHuman: "Humano",
  audienceAuto: "Automação",
  audienceAll: "Ambos",
  statusTitle: "Distribuição de status",
  accumulatedTitle: "Chats acumulados",
  empty: "Sem dados no período.",
  prodPlaceholder: "Métricas em implantação — disponíveis em breve.",
  granularityDay: "Dia",
  granularityWeek: "Semana",
  granularityMonth: "Mês",
  retry: "Tentar novamente",
  errorLoading: "Erro ao carregar.",
} as const;
```

Create `src/features/service-volume/pages/ServiceVolumePage.tsx` (placeholder — preenchido nas Tasks 9-12):

```tsx
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

export function ServiceVolumePage() {
  return <div className="text-sm text-muted-foreground">{S.empty}</div>;
}
```

Create `src/features/service-volume/index.ts`:

```ts
export { ServiceVolumePage } from "./pages/ServiceVolumePage";
export { InboxStatusSummaryCard } from "./components/InboxStatusSummaryCard";
```

> NOTE: `InboxStatusSummaryCard` é criado na Task 12; até lá, deixe apenas o export de `ServiceVolumePage` no barrel e adicione o segundo export na Task 12.

- [ ] **Step 4: Embrulhar `/app/inicio` em abas**

Modify `src/features/manager-dashboard/pages/ManagerDashboardPage.tsx`:
- imports adicionais:
```ts
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { ServiceVolumePage } from "@/features/service-volume";
import { useServiceVolumeFilters } from "@/features/service-volume/hooks/useServiceVolumeFilters";
import { SERVICE_VOLUME_STRINGS as SV } from "@/features/service-volume/i18n/pt-BR";
```
- dentro do componente (após os hooks existentes):
```ts
const canViewVolume = usePermission("service_volume", "view");
const volume = useServiceVolumeFilters();
```
- envolver TODO o conteúdo de operação atual (tudo que hoje está dentro do `<DashboardLayout>` após `<header>`) num `<TabsContent value="operacao">`, e adicionar a aba "Atendimento". Estrutura final do return (preservando o `<header>` atual acima das abas, ou movendo-o para dentro de "operacao" se preferir — manter o header de operação dentro da aba operação):

```tsx
return (
  <DashboardLayout>
    <Tabs value={volume.state.tab} onValueChange={(v) => volume.setTab(v as "operacao" | "atendimento")}>
      <TabsList className="mb-4">
        <TabsTrigger value="operacao">{SV.tabOperacao}</TabsTrigger>
        {canViewVolume && <TabsTrigger value="atendimento">{SV.tabAtendimento}</TabsTrigger>}
      </TabsList>
      <TabsContent value="operacao">
        {/* TODO: todo o conteúdo atual de operação (header + sections) vem para cá, sem alteração */}
      </TabsContent>
      {canViewVolume && (
        <TabsContent value="atendimento">
          <ServiceVolumePage />
        </TabsContent>
      )}
    </Tabs>
  </DashboardLayout>
);
```

> O early-return de `userRole === "Vendedor"` (bloqueio total da página) permanece intacto acima do return das abas.

- [ ] **Step 5: Verify build + manual**

Run: `bun run build`
Expected: build OK.
Manual: rodar `bun run dev`, abrir `/app/inicio` como Owner/Gestor (demo) → ver as 2 abas; clicar "Atendimento" → URL vira `?aba=atendimento`, reload preserva; o conteúdo de operação continua idêntico na aba "Operação".

- [ ] **Step 6: Commit**

```bash
git add src/features/manager-dashboard src/features/service-volume
git commit -m "feat(service-volume): tab shell on /app/inicio with gated Atendimento tab"
```

---

## Fase 3 — Filtros + KPIs + hero

### Task 9: filtros do header + hook de métricas + KPIs + gráfico de novos atendimentos

**Files:**
- Create: `src/features/service-volume/hooks/useServiceVolumeMetrics.ts`
- Create: `src/features/service-volume/components/ServiceVolumeFilters.tsx`
- Create: `src/features/service-volume/components/ServiceVolumeKpis.tsx`
- Create: `src/features/service-volume/components/NovosAtendimentosChart.tsx`
- Modify: `src/features/service-volume/pages/ServiceVolumePage.tsx`

**Interfaces:**
- Consumes: `useAtendimentoMetricsProvider`, `useServiceVolumeFilters`, `KpiCard` de `@/features/manager-dashboard/components/KpiCard`, recharts.
- Produces: painel com filtros + 4 KPIs + hero.

- [ ] **Step 1: Hook de métricas (TanStack Query)**

Create `src/features/service-volume/hooks/useServiceVolumeMetrics.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useAtendimentoMetricsProvider } from "@/providers/data";
import type { MetricAudience } from "@/shared/types";
import type { IServiceVolumeState } from "./useServiceVolumeFilters";

export function useServiceVolumeMetrics(state: IServiceVolumeState, audience: MetricAudience) {
  const provider = useAtendimentoMetricsProvider();
  const storeId = state.store === "all" ? undefined : state.store;
  const baseKey = [storeId ?? "all", state.fromIso, state.toIso, state.granularity] as const;
  const params = { storeId, from: state.fromIso, to: state.toIso, granularity: state.granularity };

  const novos = useQuery({
    queryKey: ["sv", "novos", ...baseKey],
    queryFn: () => provider.getNovosAtendimentos(params),
  });
  const volume = useQuery({
    queryKey: ["sv", "volume", ...baseKey],
    queryFn: () => provider.getMessageVolume(params),
  });
  const byUser = useQuery({
    queryKey: ["sv", "byUser", ...baseKey, audience],
    queryFn: () => provider.getMessagesByUser({ ...params, audience }),
  });
  const status = useQuery({
    queryKey: ["sv", "status", ...baseKey],
    queryFn: () => provider.getStatusDistribution(params),
  });
  const accumulated = useQuery({
    queryKey: ["sv", "accumulated", ...baseKey],
    queryFn: () => provider.getAccumulatedChats(params),
  });
  const handleTime = useQuery({
    queryKey: ["sv", "handleTime", ...baseKey],
    queryFn: () => provider.getHandleTimeStats(params),
  });

  return { novos, volume, byUser, status, accumulated, handleTime };
}
```

- [ ] **Step 2: Filtros do header**

Create `src/features/service-volume/components/ServiceVolumeFilters.tsx` — segmented de granularidade + select de período (presets + custom via popover `react-day-picker`) + select de loja (Owner). Seguir o padrão visual de `Tabs`/segmented já no projeto. Estrutura mínima:

```tsx
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import type { Granularity } from "@/shared/types";
import type { VolumePeriod } from "../hooks/useServiceVolumeFilters";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

const GRANS: { value: Granularity; label: string }[] = [
  { value: "day", label: S.granularityDay },
  { value: "week", label: S.granularityWeek },
  { value: "month", label: S.granularityMonth },
];
const PERIODS: { value: VolumePeriod; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
];

export interface IServiceVolumeFiltersProps {
  granularity: Granularity;
  period: VolumePeriod;
  onGranularity: (g: Granularity) => void;
  onPeriod: (p: VolumePeriod) => void;
}

export function ServiceVolumeFilters({ granularity, period, onGranularity, onPeriod }: IServiceVolumeFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
        {GRANS.map((g) => (
          <button
            key={g.value}
            type="button"
            onClick={() => onGranularity(g.value)}
            className={cn(
              "cursor-pointer px-3 py-1.5 transition-colors",
              granularity === g.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div className="inline-flex overflow-hidden rounded-md border border-border text-xs">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onPeriod(p.value)}
            className={cn(
              "cursor-pointer px-3 py-1.5 transition-colors",
              period === p.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

> O intervalo "personalizado" (date-range via `react-day-picker` em `Popover`) pode ser adicionado como um botão extra que chama `setCustomRange` — seguir o padrão de `DashboardFilters` do manager-dashboard. O seletor de loja (Owner) reusa o `StoreSwitcher`/lista de `stores` provider; Gestor não vê o seletor.

- [ ] **Step 3: KPI cards (reuso do KpiCard)**

Create `src/features/service-volume/components/ServiceVolumeKpis.tsx`:

```tsx
import { KpiCard } from "@/features/manager-dashboard/components/KpiCard";
import { formatHandleTime } from "../engine";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";
import type {
  INovosAtendimentosResult,
  IAccumulatedChatsResult,
  IHandleTimeStatsResult,
  IMessageVolumeResult,
} from "@/shared/types";

export interface IServiceVolumeKpisProps {
  novos?: INovosAtendimentosResult;
  accumulated?: IAccumulatedChatsResult;
  handleTime?: IHandleTimeStatsResult;
  volume?: IMessageVolumeResult;
  isLoading: boolean;
}

export function ServiceVolumeKpis({ novos, accumulated, handleTime, volume, isLoading }: IServiceVolumeKpisProps) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores de volume">
      <KpiCard
        label={S.kpiNovosHelp}
        shortLabel={S.kpiNovos}
        icon="mdi:message-plus-outline"
        value={novos?.total ?? null}
        helpText={S.kpiNovosHelp}
        isLoading={isLoading}
        trend={novos && novos.deltaPct !== null ? { changePct: novos.deltaPct, direction: novos.deltaPct >= 0 ? "up" : "down" } : undefined}
      />
      <KpiCard
        label="Total na loja"
        shortLabel={S.kpiAcumulados}
        icon="mdi:message-text-outline"
        value={accumulated?.total ?? null}
        helpText="Total de conversas acumuladas no escopo"
        isLoading={isLoading}
      />
      <KpiCard
        label={S.kpiTempoHelp}
        shortLabel={S.kpiTempo}
        icon="mdi:clock-outline"
        value={handleTime?.averageMs ?? null}
        formatValue={(v) => formatHandleTime(v)}
        helpText={S.kpiTempoHelp}
        isLoading={isLoading}
      />
      <KpiCard
        label="Enviadas + recebidas"
        shortLabel={S.kpiMensagens}
        icon="mdi:swap-horizontal"
        value={volume ? volume.totalSent + volume.totalReceived : null}
        helpText="Mensagens trocadas no período"
        isLoading={isLoading}
      />
    </section>
  );
}
```

> Conferir o shape real de `ITrendInfo` em `KpiCard.tsx` ao implementar e ajustar o objeto `trend` (campos `changePct`/`direction`).

- [ ] **Step 4: Hero — NovosAtendimentosChart (BarChart + ReferenceLine de média)**

Create `src/features/service-volume/components/NovosAtendimentosChart.tsx` (seguir o padrão verbatim de `SdrTtfrBarChart`):

```tsx
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { INovosAtendimentosResult } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

export function NovosAtendimentosChart({ data }: { data?: INovosAtendimentosResult }) {
  const empty = !data || data.series.length === 0;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{S.heroTitle}</h2>
          {data && (
            <p className="text-xs text-muted-foreground">
              {S.heroTotal} {data.total} · {S.heroAvg} {data.averagePerDay}/dia
            </p>
          )}
        </div>
        <Icon icon="mdi:chart-bar" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} width={40} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }}
              />
              <ReferenceLine y={data.averagePerDay} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
              <Bar dataKey="value" fill="var(--gallo-parts-green, #337648)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: Montar a página (filtros + KPIs + hero)**

Modify `src/features/service-volume/pages/ServiceVolumePage.tsx`:

```tsx
import { useServiceVolumeFilters } from "../hooks/useServiceVolumeFilters";
import { useServiceVolumeMetrics } from "../hooks/useServiceVolumeMetrics";
import { ServiceVolumeFilters } from "../components/ServiceVolumeFilters";
import { ServiceVolumeKpis } from "../components/ServiceVolumeKpis";
import { NovosAtendimentosChart } from "../components/NovosAtendimentosChart";

export function ServiceVolumePage() {
  const filters = useServiceVolumeFilters();
  const m = useServiceVolumeMetrics(filters.state, "all");
  const isLoading = m.novos.isLoading || m.accumulated.isLoading || m.handleTime.isLoading || m.volume.isLoading;
  return (
    <div className="space-y-6">
      <ServiceVolumeFilters
        granularity={filters.state.granularity}
        period={filters.state.period}
        onGranularity={filters.setGranularity}
        onPeriod={filters.setPeriod}
      />
      <ServiceVolumeKpis
        novos={m.novos.data}
        accumulated={m.accumulated.data}
        handleTime={m.handleTime.data}
        volume={m.volume.data}
        isLoading={isLoading}
      />
      <NovosAtendimentosChart data={m.novos.data} />
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `bun run build`
Expected: OK.
Manual (demo): abrir aba "Atendimento" → ver 4 KPIs preenchidos + gráfico de barras com linha de média; trocar granularidade (dia/semana/mês) reagrupa; trocar período recalcula; valores estáveis entre reloads.

- [ ] **Step 7: Commit**

```bash
git add src/features/service-volume
git commit -m "feat(service-volume): filters, KPI cards and hero chart (novos atendimentos)"
```

---

## Fase 4 — Gráficos secundários + drill-down

### Task 10: mensagens (enviadas/recebidas + por usuário com toggle)

**Files:**
- Create: `src/features/service-volume/components/MessageVolumeChart.tsx`
- Create: `src/features/service-volume/components/MessagesByUserChart.tsx`
- Modify: `src/features/service-volume/pages/ServiceVolumePage.tsx`

- [ ] **Step 1: MessageVolumeChart (LineChart 2 séries)**

Create `src/features/service-volume/components/MessageVolumeChart.tsx` (padrão de `OverviewTab`):

```tsx
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { IMessageVolumeResult } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

export function MessageVolumeChart({ data }: { data?: IMessageVolumeResult }) {
  const empty = !data || data.series.length === 0;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.msgVolumeTitle}</h2>
        <Icon icon="mdi:swap-horizontal" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} iconSize={10} />
              <Line type="monotone" dataKey="received" name="Recebidas" stroke="var(--gallo-parts-green, #337648)" strokeWidth={2} dot={{ r: 2 }} />
              <Line type="monotone" dataKey="sent" name="Enviadas" stroke="var(--primary)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: MessagesByUserChart (barras horizontais + toggle)**

Create `src/features/service-volume/components/MessagesByUserChart.tsx`:

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IMessagesByUserResult, MetricAudience } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

const TABS: { value: MetricAudience; label: string }[] = [
  { value: "human", label: S.audienceHuman },
  { value: "automation", label: S.audienceAuto },
  { value: "all", label: S.audienceAll },
];

export interface IMessagesByUserChartProps {
  data?: IMessagesByUserResult;
  audience: MetricAudience;
  onAudience: (a: MetricAudience) => void;
}

export function MessagesByUserChart({ data, audience, onAudience }: IMessagesByUserChartProps) {
  const empty = !data || data.rows.length === 0;
  const chart = (data?.rows ?? []).map((r) => ({ name: r.name, count: r.count }));
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.byUserTitle}</h2>
        <div className="inline-flex overflow-hidden rounded-md border border-border text-[11px]">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => onAudience(t.value)}
              className={cn("cursor-pointer px-2.5 py-1 transition-colors", audience === t.value ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="w-full" style={{ height: Math.max(160, chart.length * 40 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
              <Bar dataKey="count" fill="var(--gallo-parts-green, #337648)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Ligar o toggle de audience na página**

Modify `src/features/service-volume/pages/ServiceVolumePage.tsx`: introduzir estado local de `audience` (`useState<MetricAudience>("all")`), passar ao `useServiceVolumeMetrics(filters.state, audience)` e ao `MessagesByUserChart`; adicionar os dois gráficos numa grade 2 colunas. (Trocar a chamada `useServiceVolumeMetrics(filters.state, "all")` por `useServiceVolumeMetrics(filters.state, audience)`.)

```tsx
// dentro do componente:
const [audience, setAudience] = useState<MetricAudience>("all");
// ...
<section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <MessageVolumeChart data={m.volume.data} />
  <MessagesByUserChart data={m.byUser.data} audience={audience} onAudience={setAudience} />
</section>
```

- [ ] **Step 4: Verify**

Run: `bun run build`
Expected: OK.
Manual: linha enviadas/recebidas aparece; toggle "Automação" remove atendentes humanos do gráfico por usuário.

- [ ] **Step 5: Commit**

```bash
git add src/features/service-volume
git commit -m "feat(service-volume): message volume and per-user charts with audience toggle"
```

---

### Task 11: donut de status (drill-down) + acumulado

**Files:**
- Create: `src/features/service-volume/components/StatusDistributionDonut.tsx`
- Create: `src/features/service-volume/components/AccumulatedChatsChart.tsx`
- Modify: `src/features/service-volume/pages/ServiceVolumePage.tsx`

**Interfaces:**
- Consumes: `useNavigate` para drill-down; `STATUS_META` de `@/features/conversations/utils/conversationDisplay` (cor/label por status); `IStatusDistributionResult`.
- Produces: `StatusDistributionDonut` (prop `compact` para reuso na Caixa).

- [ ] **Step 1: StatusDistributionDonut (PieChart donut + legenda textual + drill-down)**

Create `src/features/service-volume/components/StatusDistributionDonut.tsx`:

```tsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { ConversationStatus, IStatusDistributionResult } from "@/shared/types";
import { STATUS_META } from "@/features/conversations/utils/conversationDisplay";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

const STATUS_COLOR: Record<ConversationStatus, string> = {
  aguardando: "var(--gallo-industrial-yellow, #C79C2C)",
  em_andamento: "var(--gallo-parts-green, #337648)",
  aguardando_cliente: "#378ADD",
  resolvida: "#639922",
  arquivada: "#888780",
};

export interface IStatusDistributionDonutProps {
  data?: IStatusDistributionResult;
  compact?: boolean;
}

export function StatusDistributionDonut({ data, compact = false }: IStatusDistributionDonutProps) {
  const navigate = useNavigate();
  const empty = !data || data.total === 0;
  const slices = data?.slices ?? [];

  const onSlice = (status: ConversationStatus) => {
    void navigate({ to: "/app/atendimento", search: { status } as never });
  };

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={slices} dataKey="count" nameKey="status" innerRadius={compact ? 28 : 44} outerRadius={compact ? 44 : 70} paddingAngle={2}>
          {slices.map((s) => (
            <Cell
              key={s.status}
              fill={STATUS_COLOR[s.status]}
              className="cursor-pointer"
              onClick={() => onSlice(s.status)}
            />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );

  const legend = (
    <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
      {slices.map((s) => (
        <li key={s.status}>
          <button
            type="button"
            onClick={() => onSlice(s.status)}
            className="flex cursor-pointer items-center gap-2 hover:text-foreground"
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLOR[s.status] }} />
            {STATUS_META[s.status].label} · {s.count} · {data ? Math.round((s.count / data.total) * 100) : 0}%
          </button>
        </li>
      ))}
    </ul>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-24 w-24 shrink-0">{empty ? null : chart}</div>
        {empty ? <p className="text-xs text-muted-foreground">{S.empty}</p> : legend}
      </div>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.statusTitle}</h2>
        <Icon icon="mdi:chart-donut" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="flex items-center gap-5">
          <div className="h-40 w-40 shrink-0">{chart}</div>
          {legend}
        </div>
      )}
    </Card>
  );
}
```

> Confirme que `STATUS_META[status].label` existe (o mapeamento mostra `STATUS_META` com `icon`/`pillClass`; se não houver `label`, usar os rótulos de `INBOX_STRINGS.statusOptions` de `@/features/conversations/i18n/pt-BR`). Confirme também a assinatura de `navigate({ to: "/app/atendimento", search: { status } })` contra `validateInboxSearch` (o param `status` já é aceito).

- [ ] **Step 2: AccumulatedChatsChart (área cumulativa)**

Create `src/features/service-volume/components/AccumulatedChatsChart.tsx`:

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import type { IAccumulatedChatsResult } from "@/shared/types";
import { SERVICE_VOLUME_STRINGS as S } from "../i18n/pt-BR";

export function AccumulatedChatsChart({ data }: { data?: IAccumulatedChatsResult }) {
  const empty = !data || data.series.length === 0;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">{S.accumulatedTitle}</h2>
        <Icon icon="mdi:chart-areaspline" size={20} className="text-muted-foreground" />
      </header>
      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.empty}</p>
      ) : (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.series} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} stroke="var(--border)" tickLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)", fontSize: 12 }} />
              <Area type="monotone" dataKey="value" stroke="var(--gallo-parts-green, #337648)" fill="var(--gallo-parts-green, #337648)" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Completar a grade 2×2 na página**

Modify `src/features/service-volume/pages/ServiceVolumePage.tsx`: adicionar a segunda linha da grade com donut + acumulado:

```tsx
<section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <StatusDistributionDonut data={m.status.data} />
  <AccumulatedChatsChart data={m.accumulated.data} />
</section>
```

- [ ] **Step 4: Verify**

Run: `bun run build`
Expected: OK.
Manual: donut com legenda label·contagem·%; clicar numa fatia → navega para `/app/atendimento?status=<status>` e a inbox filtra; área cumulativa cresce.

- [ ] **Step 5: Commit**

```bash
git add src/features/service-volume
git commit -m "feat(service-volume): status donut with drill-down and accumulated chats"
```

---

## Fase 5 — Card na Caixa + estados + prod placeholder

### Task 12: card-resumo na Caixa (DELTA-010) + aviso de prod + polish

**Files:**
- Create: `src/features/service-volume/components/InboxStatusSummaryCard.tsx`
- Modify: `src/features/service-volume/index.ts` (exportar o card)
- Modify: `src/features/conversations/pages/InboxPage.tsx` (inserir o card no topo)
- Modify: `src/features/service-volume/pages/ServiceVolumePage.tsx` (aviso "em implantação" quando fonte vazia)

**Interfaces:**
- Consumes: `usePermission`, `useAtendimentoMetricsProvider`, `StatusDistributionDonut`.
- Produces: `InboxStatusSummaryCard`.

- [ ] **Step 1: Card-resumo (gated, clicável → aba Atendimento)**

Create `src/features/service-volume/components/InboxStatusSummaryCard.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useAtendimentoMetricsProvider } from "@/providers/data";
import { StatusDistributionDonut } from "./StatusDistributionDonut";

export function InboxStatusSummaryCard() {
  const canView = usePermission("service_volume", "view");
  const navigate = useNavigate();
  const provider = useAtendimentoMetricsProvider();
  const { data } = useQuery({
    queryKey: ["sv", "status", "inbox-card"],
    queryFn: () =>
      provider.getStatusDistribution({
        from: "2000-01-01T00:00:00Z",
        to: "2100-01-01T00:00:00Z",
        granularity: "day",
      }),
    enabled: canView,
  });

  if (!canView || !data || data.total === 0) return null;

  return (
    <button
      type="button"
      onClick={() => void navigate({ to: "/app/inicio", search: { aba: "atendimento" } as never })}
      className="block w-full cursor-pointer border-b border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
      aria-label="Abrir painel de atendimento"
    >
      <StatusDistributionDonut data={data} compact />
    </button>
  );
}
```

- [ ] **Step 2: Exportar o card no barrel + inserir na Caixa**

Modify `src/features/service-volume/index.ts`: adicionar `export { InboxStatusSummaryCard } from "./components/InboxStatusSummaryCard";`.

Modify `src/features/conversations/pages/InboxPage.tsx`: importar `import { InboxStatusSummaryCard } from "@/features/service-volume";` e inserir `<InboxStatusSummaryCard />` logo após `<InboxHeader ... />` e antes da `<div>` do `SearchInput` (o componente se auto-oculta para quem não tem permissão).

> Nota de fronteira: `conversations` importar de `service-volume` é aceitável (é uma feature consumindo o componente público exportado pelo barrel de outra feature — padrão já usado no projeto). Se preferir inverter a dependência, mover `InboxStatusSummaryCard` para `conversations`; manter em `service-volume` mantém o donut compartilhado num lugar só.

- [ ] **Step 3: Aviso "em implantação" (prod) + estados de erro**

Modify `src/features/service-volume/pages/ServiceVolumePage.tsx`: quando todas as queries resolveram e os resultados estão vazios (caso do provider supabase placeholder em prod), exibir uma faixa discreta com `SERVICE_VOLUME_STRINGS.prodPlaceholder` acima dos gráficos. Heurística simples:

```tsx
const isEmptyEverywhere =
  !isLoading &&
  (m.novos.data?.total ?? 0) === 0 &&
  (m.status.data?.total ?? 0) === 0 &&
  (m.volume.data ? m.volume.data.totalSent + m.volume.data.totalReceived : 0) === 0;
// ...
{isEmptyEverywhere && (
  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
    {SERVICE_VOLUME_STRINGS.prodPlaceholder}
  </div>
)}
```

- [ ] **Step 4: Verify**

Run: `bun run build && bun run test`
Expected: OK.
Manual (demo): card aparece no topo da Caixa para Owner/Gestor; clicar abre `/app/inicio?aba=atendimento`; logar como Vendedor → card some e a aba some. Forçar fonte supabase (override de ambiente) → painel mostra empty states + faixa "em implantação".

- [ ] **Step 5: Commit**

```bash
git add src/features/service-volume src/features/conversations/pages/InboxPage.tsx
git commit -m "feat(service-volume): inbox status summary card + prod empty-state notice"
```

---

## Fase 6 — RBAC em produção (rollout manual)

### Task 13: migration aditiva de RBAC para `service_volume` (aplicação MANUAL)

> **Por que:** em produção o RBAC é hidratado do banco (`roles`/`role_permissions`/`rbac_resources`), não da matriz estática. Para a aba/card aparecerem em prod (com empty state, conforme decidido), a permissão precisa existir no banco. Migration **aditiva e reversível** (não toca status/conversas). **NÃO aplicar sem confirmação explícita do dono** (auto-mode bloqueia; ver memória de migrations manuais via MCP). Espelhar no Git conforme a regra do projeto.

**Files:**
- Create: `supabase/migrations/20260624XXXXXX_rbac_service_volume.sql`

- [ ] **Step 1: Escrever a migration versionada**

Create `supabase/migrations/20260624XXXXXX_rbac_service_volume.sql` (ajustar nomes de tabela/coluna ao schema real de RBAC — inspecionar `rbac_resources`, `roles`, `role_permissions` antes):

```sql
-- Additive RBAC seed: service_volume.view for Owner/Gestor (PRD-215 DELTA-006).
-- Idempotent. Non-destructive. Does not touch conversations/status.
insert into public.rbac_resources (key, label, "group", sort_order)
values ('service_volume', 'Painel de atendimento (volume)', 'Análises', 100)
on conflict (key) do nothing;

-- Grant view to Owner (scope all) and Gestor (scope store), mirroring matrix.ts.
-- Adjust to the real role_permissions shape (resource/action/scope columns).
insert into public.role_permissions (role_id, resource, action, scope)
select r.id, 'service_volume', 'view',
       case when r.slug = 'Owner' then 'all' else 'store' end
from public.roles r
where r.slug in ('Owner', 'Gestor')
on conflict do nothing;
```

- [ ] **Step 2: Validar o shape real antes de aplicar**

Run (read-only, via MCP `execute_sql`): inspecionar colunas reais:
```sql
select column_name, data_type from information_schema.columns
where table_name in ('rbac_resources','roles','role_permissions') order by table_name, ordinal_position;
```
Ajustar a migration às colunas reais.

- [ ] **Step 3: Aplicar em produção — SOMENTE com confirmação do dono**

Aplicar manualmente via MCP `apply_migration` (ou `execute_sql` em transação `begin/commit`), registrar a `version` igual ao nome do arquivo. Confirmar com o dono antes (a política do projeto proíbe aplicar em prod sem autorização explícita).

- [ ] **Step 4: Verify em prod**

Logar como Owner/Gestor em produção → a aba "Atendimento" aparece com empty states + faixa "em implantação" (provider supabase placeholder). Vendedor não vê.

- [ ] **Step 5: Commit (apenas o arquivo versionado; aplicação é à parte)**

```bash
git add supabase/migrations/20260624XXXXXX_rbac_service_volume.sql
git commit -m "chore(rbac): versioned migration to seed service_volume.view (apply manually)"
```

---

## Self-Review (coverage do spec)

- [x] Contrato único mock/supabase → Tasks 4/5.
- [x] Taxonomia mantida (sem renomear) → Global Constraints; nenhuma task toca `ConversationStatus`.
- [x] "Novo atendimento" = 1º contato + reabertura → Task 4 (`synthesizeCycles`) + Task 6.
- [x] Mock determinístico lendo o mockStore → Task 6.
- [x] Supabase placeholder vazio (sem erro) → Task 5.
- [x] 4 KPIs + hero + msg enviadas/recebidas + por usuário (toggle) + donut + acumulado + tempo médio → Tasks 9/10/11.
- [x] Granularidade + período (presets+custom) + loja, URL sync → Tasks 8/9.
- [x] Drill-down donut → inbox `?status=` → Task 11 (deep-link já suportado).
- [x] Card na Caixa gated → Task 12.
- [x] RBAC `service_volume.view` (Owner/Gestor) → Task 7 (mock) + Task 13 (prod).
- [x] Shell de abas DELTA-014 → Task 8.
- [x] Empty states + aviso de prod → Tasks 9-12.
- [x] Light/dark, tokens, a11y → padrões nos componentes.
- [x] Tests: engines (Tasks 1-4) + provider mock (Task 6).

**Pontos a confirmar durante a execução (não bloqueantes):**
- Literais reais de `MessageDirection` (`"in"/"out"` vs outro) — Task 6.
- Existência de `STATUS_META[status].label` (senão usar `INBOX_STRINGS.statusOptions`) — Task 11.
- Shape de `ITrendInfo` no `KpiCard` — Task 9.
- Colunas reais das tabelas de RBAC — Task 13.

---

**AILA — Sistemas Inteligentes**
