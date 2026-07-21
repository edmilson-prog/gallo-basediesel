# SDR Backstop Eligibility Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a elegibilidade do `sdr-backstop-tick` (causa do disparo em massa de 2026-07-20) e adicionar gates de piloto ao `sdr-escalation-timeout-tick`.

**Architecture:** O filtro relacional pesado vai para uma RPC SQL nova (`sdr_backstop_candidates`: gates loja+instância, estado de fila, última-mensagem-é-do-cliente, marcos de ativação carimbados por trigger, janela de 24h). O tick fica fino: chama a RPC, aplica threshold por horário comercial via engine puro testado (`eligibility.ts`), cap de 10/tick e o claim idempotente existente. O tick de escalonamento ganha um filtro puro de gates (`gates.ts`) antes do loop de broadcast.

**Tech Stack:** Supabase Edge Functions (Deno), PostgreSQL (migration SQL), Vitest para os engines puros, TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md` (aprovado pelo dono em 2026-07-20).

## Global Constraints

- **Worktree:** todo o trabalho em `D:\claude\gallo-basediesel\.claude\worktrees\sdr-backstop-eligibility-fix`, branch `worktree-sdr-backstop-eligibility-fix`. Primeiro passo de qualquer sessão/subagente: `cd` absoluto + verificar `git branch --show-current`. **NUNCA usar `git stash`** (stack compartilhado entre worktrees).
- **Comentários de código em inglês**; docs de projeto em pt-BR com acentuação correta.
- **Conventional Commits** em inglês, atômicos.
- **TypeScript strict, sem `any`** (o idioma `as unknown[]`/`as string` já usado nos ticks é aceito).
- **Gate de CI prático:** `bun run test` + `bun run build` (o build NÃO type-checa; `bunx tsc --noEmit` tem baseline de erros pré-existentes — avaliar só o delta dos arquivos novos).
- **A migration NÃO é aplicada durante a implementação** — arquivo versionado no PR; aplicação em prod é passo de rollout owner-gated (regra do projeto: `apply_migration` via MCP só com OK do dono, exportado para o Git no mesmo PR — aqui o export vem primeiro).
- **Nenhum deploy de Edge Function durante a implementação** — rollout owner-gated.
- **Não tocar**: `sdr-respond/`, `whatsapp-webhook/`, pipeline de envio, `src/` do app (nada de UI neste pacote), mecanismo legado `useUrgentBroadcastTimer`.
- `rtk` não está no PATH do bash da worktree — usar `git` direto.
- Aviso `LF will be replaced by CRLF` do git é falso positivo conhecido — ignorar.

---

### Task 1: Migration — marcos de ativação + RPC de candidatas + índice

**Files:**
- Create: `supabase/migrations/20260720210000_sdr_backstop_eligibility.sql`

**Interfaces:**
- Consumes: tabelas existentes `sdr_settings` (colunas `store_id uuid pk`, `sdr_enabled boolean`), `whatsapp_accounts` (`id uuid pk`, `sdr_enabled boolean`), `conversations`, `messages` (colunas `conversation_id uuid`, `direction text` com valores `'in'`/`'out'`, `created_at timestamptz`).
- Produces: colunas `sdr_settings.sdr_activated_at` e `whatsapp_accounts.sdr_activated_at` (timestamptz null); função de trigger `public.stamp_sdr_activated_at()`; RPC `public.sdr_backstop_candidates()` retornando `table (conversation_id uuid, store_id uuid, whatsapp_account_id uuid, last_inbound_at timestamptz)` — **a Task 3 chama essa RPC por esse nome e essas colunas exatas**; índice `messages_conversation_created_at_idx`.

- [ ] **Step 1: Escrever o arquivo de migration completo**

```sql
-- SDR backstop eligibility fix — follow-up to the 2026-07-20 mass-dispatch
-- incident. Design: docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md
--
-- ⚠️ NOT applied during implementation. Applied at rollout (owner-gated),
-- BEFORE re-arming the crons — the new sdr-backstop-tick calls the RPC
-- created here.

-- 1. Activation stamps. Set by trigger whenever the respective sdr_enabled
--    flag flips on, regardless of write path (UI, SQL console, MCP).
--    Re-enabling after a pause renews the stamp, so backlog accumulated
--    while paused stays ineligible.
alter table public.sdr_settings
  add column if not exists sdr_activated_at timestamptz;
alter table public.whatsapp_accounts
  add column if not exists sdr_activated_at timestamptz;

-- Single shared trigger function — both tables use the same column/flag names.
create or replace function public.stamp_sdr_activated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.sdr_enabled then
      new.sdr_activated_at := now();
    end if;
  elsif new.sdr_enabled and not coalesce(old.sdr_enabled, false) then
    new.sdr_activated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_sdr_activated_at on public.sdr_settings;
create trigger trg_stamp_sdr_activated_at
  before insert or update on public.sdr_settings
  for each row execute function public.stamp_sdr_activated_at();

drop trigger if exists trg_stamp_sdr_activated_at on public.whatsapp_accounts;
create trigger trg_stamp_sdr_activated_at
  before insert or update on public.whatsapp_accounts
  for each row execute function public.stamp_sdr_activated_at();

-- 2. Index for the candidates RPC's lateral "last message of the
--    conversation" lookup. Existing indexes cover (conversation_id) and
--    (conversation_id, sent_at) only; the lateral orders by created_at.
create index if not exists messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at);

-- 3. Candidates RPC: the whole relational eligibility filter in one
--    round-trip. Worker-only — sdr-backstop-tick calls it with service_role.
--    NULL semantics: greatest() ignores NULLs; if BOTH stamps are null the
--    comparison yields NULL and the row is excluded — fails closed, never open.
create or replace function public.sdr_backstop_candidates()
returns table (
  conversation_id uuid,
  store_id uuid,
  whatsapp_account_id uuid,
  last_inbound_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select c.id, c.store_id, c.whatsapp_account_id, lm.created_at
  from public.conversations c
  join public.sdr_settings s
    on s.store_id = c.store_id and s.sdr_enabled
  join public.whatsapp_accounts w
    on w.id = c.whatsapp_account_id and w.sdr_enabled
  cross join lateral (
    select m.direction, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm
  where c.status = 'aguardando'
    and c.assigned_seller_id is null
    and c.is_sdr_active = false
    and c.queued_at is not null
    and lm.direction = 'in'
    and lm.created_at > greatest(s.sdr_activated_at, w.sdr_activated_at)
    and lm.created_at > now() - interval '24 hours'
  order by lm.created_at asc
$$;

revoke execute on function public.sdr_backstop_candidates() from public, anon, authenticated;
grant execute on function public.sdr_backstop_candidates() to service_role;
```

- [ ] **Step 2: Reler o arquivo e conferir contra o spec §§2–3**

Conferir: nomes de coluna idênticos nas duas tabelas (`sdr_activated_at`, `sdr_enabled`); `revoke`/`grant` presentes; `order by lm.created_at asc` (FIFO); os 3 filtros novos (direction, greatest, 24h) presentes.

- [ ] **Step 3: Commit**

```bash
cd "D:/claude/gallo-basediesel/.claude/worktrees/sdr-backstop-eligibility-fix"
git add supabase/migrations/20260720210000_sdr_backstop_eligibility.sql
git commit -m "feat(sdr): add activation stamps + backstop candidates RPC migration"
```

---

### Task 2: Engine puro `eligibility.ts` (TDD)

**Files:**
- Create: `supabase/functions/sdr-backstop-tick/eligibility.ts`
- Test: `supabase/functions/sdr-backstop-tick/eligibility.test.ts`

**Interfaces:**
- Consumes: `isWithinBusinessHours(date, windows)` de `../_shared/distribution/engine/businessHours.ts` (espelho auto-gerado — NÃO editar); tipo `IBusinessHoursWindow` de `@/shared/types` (campos: `weekday: 0|1|2|3|4|5|6`, `openAt: "HH:mm"`, `closeAt: "HH:mm"`, `enabled: boolean`) — import type-only, mesmo idioma do espelho.
- Produces (a Task 3 importa exatamente estes nomes): `MAX_ACTIVATIONS_PER_TICK = 10`, `DEFAULT_TIMEOUT_MINUTES = 2`, interfaces `IBackstopCandidate { conversationId: string; storeId: string; whatsappAccountId: string; lastInboundAt: string }`, `IStorePilotConfig { timeoutMinutes: number; businessHours: IBusinessHoursWindow[] }`, `IBackstopDecision { toActivate: IBackstopCandidate[]; eligibleCount: number; cappedCount: number }`, função `decideActivations(candidates, configByStore, now, cap?): IBackstopDecision`.

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// supabase/functions/sdr-backstop-tick/eligibility.test.ts
import { describe, expect, it } from "vitest";
import type { IBusinessHoursWindow } from "@/shared/types";
import {
  DEFAULT_TIMEOUT_MINUTES,
  MAX_ACTIVATIONS_PER_TICK,
  decideActivations,
  type IBackstopCandidate,
  type IStorePilotConfig,
} from "./eligibility";

const STORE = "store-1";
// Monday 2026-07-20 15:00 local — inside the 08:00–18:00 window below.
const NOW = new Date("2026-07-20T15:00:00");

function candidate(overrides: Partial<IBackstopCandidate> = {}): IBackstopCandidate {
  return {
    conversationId: "conv-1",
    storeId: STORE,
    whatsappAccountId: "acc-1",
    lastInboundAt: new Date(NOW.getTime() - 10 * 60_000).toISOString(),
    ...overrides,
  };
}

function windowFor(now: Date): IBusinessHoursWindow {
  return {
    weekday: now.getDay() as IBusinessHoursWindow["weekday"],
    openAt: "08:00",
    closeAt: "18:00",
    enabled: true,
  };
}

function config(overrides: Partial<IStorePilotConfig> = {}): IStorePilotConfig {
  return { timeoutMinutes: 5, businessHours: [windowFor(NOW)], ...overrides };
}

describe("decideActivations", () => {
  it("activates a candidate that waited past the threshold within business hours", () => {
    const result = decideActivations([candidate()], new Map([[STORE, config()]]), NOW);
    expect(result.toActivate.map((c) => c.conversationId)).toEqual(["conv-1"]);
    expect(result.eligibleCount).toBe(1);
    expect(result.cappedCount).toBe(0);
  });

  it("skips a candidate still inside the threshold within business hours", () => {
    const fresh = candidate({
      lastInboundAt: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
    });
    const result = decideActivations([fresh], new Map([[STORE, config()]]), NOW);
    expect(result.toActivate).toEqual([]);
    expect(result.eligibleCount).toBe(0);
  });

  it("uses threshold 0 outside configured business hours", () => {
    const night = new Date("2026-07-20T22:30:00");
    const justArrived = candidate({
      lastInboundAt: new Date(night.getTime() - 1_000).toISOString(),
    });
    const result = decideActivations(
      [justArrived],
      new Map([[STORE, config({ businessHours: [windowFor(night)] })]]),
      night,
    );
    expect(result.toActivate.map((c) => c.conversationId)).toEqual(["conv-1"]);
  });

  it("resolves missing/disabled business-hours windows to the CONSERVATIVE branch (threshold in minutes, never 0)", () => {
    const fresh = candidate({
      lastInboundAt: new Date(NOW.getTime() - 2 * 60_000).toISOString(),
    });
    const noWindows = decideActivations(
      [fresh],
      new Map([[STORE, config({ businessHours: [] })]]),
      NOW,
    );
    expect(noWindows.toActivate).toEqual([]);

    const disabledWindow = { ...windowFor(NOW), enabled: false };
    const allDisabled = decideActivations(
      [fresh],
      new Map([[STORE, config({ businessHours: [disabledWindow] })]]),
      NOW,
    );
    expect(allDisabled.toActivate).toEqual([]);
  });

  it("falls back to DEFAULT_TIMEOUT_MINUTES and the conservative branch when the store has no config", () => {
    const fresh = candidate({
      lastInboundAt: new Date(NOW.getTime() - (DEFAULT_TIMEOUT_MINUTES - 1) * 60_000).toISOString(),
    });
    const result = decideActivations([fresh], new Map(), NOW);
    expect(result.toActivate).toEqual([]);

    const waited = candidate({
      lastInboundAt: new Date(NOW.getTime() - (DEFAULT_TIMEOUT_MINUTES + 1) * 60_000).toISOString(),
    });
    expect(decideActivations([waited], new Map(), NOW).toActivate).toHaveLength(1);
  });

  it("caps activations per tick, FIFO by lastInboundAt, and reports the capped count", () => {
    const candidates = Array.from({ length: MAX_ACTIVATIONS_PER_TICK + 2 }, (_, i) =>
      candidate({
        conversationId: `conv-${i}`,
        // conv-0 waited the longest → must be first.
        lastInboundAt: new Date(NOW.getTime() - (60 - i) * 60_000).toISOString(),
      }),
    );
    const result = decideActivations(candidates, new Map([[STORE, config()]]), NOW);
    expect(result.toActivate).toHaveLength(MAX_ACTIVATIONS_PER_TICK);
    expect(result.toActivate[0].conversationId).toBe("conv-0");
    expect(result.eligibleCount).toBe(MAX_ACTIVATIONS_PER_TICK + 2);
    expect(result.cappedCount).toBe(2);
  });

  it("returns empty decision for no candidates", () => {
    expect(decideActivations([], new Map(), NOW)).toEqual({
      toActivate: [],
      eligibleCount: 0,
      cappedCount: 0,
    });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd "D:/claude/gallo-basediesel/.claude/worktrees/sdr-backstop-eligibility-fix"
bunx vitest run supabase/functions/sdr-backstop-tick/eligibility.test.ts
```

Expected: FAIL — `Cannot find module './eligibility'` (ou equivalente).

- [ ] **Step 3: Implementar o engine**

```typescript
// supabase/functions/sdr-backstop-tick/eligibility.ts
// Pure decision engine for sdr-backstop-tick — no I/O, fully unit-tested.
// The relational eligibility filter (pilot gates, queue state,
// last-message-is-inbound, activation stamps, 24h window) lives in the
// sdr_backstop_candidates RPC; this module only decides, per candidate,
// whether the wait threshold was crossed, and applies the hard per-tick cap.
import type { IBusinessHoursWindow } from "@/shared/types";
import { isWithinBusinessHours } from "../_shared/distribution/engine/businessHours.ts";

/** Hard safety cap — not a business knob, never exposed in the UI. */
export const MAX_ACTIVATIONS_PER_TICK = 10;
export const DEFAULT_TIMEOUT_MINUTES = 2;

export interface IBackstopCandidate {
  conversationId: string;
  storeId: string;
  whatsappAccountId: string;
  /** ISO timestamp of the conversation's last (inbound) message. */
  lastInboundAt: string;
}

export interface IStorePilotConfig {
  timeoutMinutes: number;
  businessHours: IBusinessHoursWindow[];
}

export interface IBackstopDecision {
  /** FIFO by lastInboundAt, capped at `cap`. */
  toActivate: IBackstopCandidate[];
  /** Candidates past their threshold, before the cap. */
  eligibleCount: number;
  /** eligibleCount − toActivate.length — logged by the tick, never silent. */
  cappedCount: number;
}

/**
 * Threshold semantics: inside business hours — or when the store has no
 * ENABLED windows (missing data resolves to the CONSERVATIVE branch) — the
 * customer must have waited `timeoutMinutes` since their last message.
 * Outside configured business hours the threshold is 0 (immediate night
 * coverage — safe now that the candidates RPC excludes backlog).
 */
export function decideActivations(
  candidates: IBackstopCandidate[],
  configByStore: Map<string, IStorePilotConfig>,
  now: Date,
  cap: number = MAX_ACTIVATIONS_PER_TICK,
): IBackstopDecision {
  const eligible = candidates.filter((candidateRow) => {
    const config = configByStore.get(candidateRow.storeId);
    const timeoutMinutes = config?.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES;
    const windows = config?.businessHours ?? [];
    const hasEnabledWindows = windows.some((win) => win.enabled);
    const within = hasEnabledWindows ? isWithinBusinessHours(now, windows) : true;
    const thresholdMinutes = within ? timeoutMinutes : 0;
    const elapsedMs = now.getTime() - new Date(candidateRow.lastInboundAt).getTime();
    return elapsedMs >= thresholdMinutes * 60_000;
  });
  const sorted = [...eligible].sort(
    (a, b) => new Date(a.lastInboundAt).getTime() - new Date(b.lastInboundAt).getTime(),
  );
  const toActivate = sorted.slice(0, cap);
  return {
    toActivate,
    eligibleCount: eligible.length,
    cappedCount: eligible.length - toActivate.length,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bunx vitest run supabase/functions/sdr-backstop-tick/eligibility.test.ts
```

Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sdr-backstop-tick/eligibility.ts supabase/functions/sdr-backstop-tick/eligibility.test.ts
git commit -m "feat(sdr): add pure backstop eligibility engine with per-tick cap"
```

---

### Task 3: Reescrever `sdr-backstop-tick/index.ts` (RPC + engine + cap)

**Files:**
- Modify: `supabase/functions/sdr-backstop-tick/index.ts` (substituição integral — conteúdo completo abaixo)

**Interfaces:**
- Consumes: RPC `sdr_backstop_candidates` (Task 1 — colunas `conversation_id, store_id, whatsapp_account_id, last_inbound_at`); `decideActivations`/`MAX_ACTIVATIONS_PER_TICK`/tipos da Task 2; `_shared/*` inalterados.
- Produces: resposta JSON do tick muda de `{ activated }` para `{ eligible, activated, capped }` (consumida só por logs/pg_cron — sem consumidor tipado).

- [ ] **Step 1: Substituir o arquivo inteiro pelo conteúdo abaixo**

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-backstop-tick — scheduled via pg_cron every minute. Activates the SDR
 * on queued conversations of pilot stores/instances whose customer crossed
 * the wait threshold.
 *
 * Eligibility redesign (2026-07-20, after the mass-dispatch incident — see
 * docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md):
 * the relational filter lives in the sdr_backstop_candidates RPC (pilot
 * gates, queue state, last-message-is-inbound, activation stamps, 24h
 * window). This tick applies the per-store business-hours threshold via the
 * pure eligibility engine, a hard per-tick cap (never silent), and the
 * idempotent claim before the fire-and-forget dispatch to sdr-respond.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import {
  MAX_ACTIVATIONS_PER_TICK,
  decideActivations,
  type IBackstopCandidate,
  type IStorePilotConfig,
} from "./eligibility.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";

interface ICandidateRow {
  conversation_id: string;
  store_id: string;
  whatsapp_account_id: string;
  last_inbound_at: string;
}

servePost(async (req, ctx) => {
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const expected = await createSecretResolver(admin)(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!verifyWorkerSecret(provided, expected)) throw new HttpError(401, "unauthorized");

  // 1. Candidates: single RPC round-trip with the whole relational filter,
  // FIFO by last_inbound_at. Fails loudly — a broken RPC must never be
  // mistaken for an empty queue.
  const { data: candidateRows, error: candidatesError } = await admin.rpc(
    "sdr_backstop_candidates",
  );
  if (candidatesError) {
    throw new HttpError(500, `sdr_backstop_candidates failed: ${candidatesError.message}`);
  }
  const rows = (candidateRows ?? []) as ICandidateRow[];
  if (rows.length === 0) return json({ eligible: 0, activated: 0, capped: 0 }, 200);

  const candidates: IBackstopCandidate[] = rows.map((row) => ({
    conversationId: row.conversation_id,
    storeId: row.store_id,
    whatsappAccountId: row.whatsapp_account_id,
    lastInboundAt: row.last_inbound_at,
  }));

  // 2. Per-store pilot config: timeout minutes + business-hours windows
  // (stores.settings.distribution.businessHours jsonb blob).
  const storeIds = [...new Set(candidates.map((candidate) => candidate.storeId))];
  const [{ data: settingsRows }, { data: storeRows }] = await Promise.all([
    admin.from("sdr_settings").select("store_id, backstop_timeout_minutes").in("store_id", storeIds),
    admin.from("stores").select("id, settings").in("id", storeIds),
  ]);
  const windowsByStore = new Map<string, IStorePilotConfig["businessHours"]>();
  for (const store of storeRows ?? []) {
    const settings = store.settings as { distribution?: { businessHours?: unknown } } | null;
    windowsByStore.set(
      store.id as string,
      (settings?.distribution?.businessHours ?? []) as IStorePilotConfig["businessHours"],
    );
  }
  const configByStore = new Map<string, IStorePilotConfig>();
  for (const row of settingsRows ?? []) {
    configByStore.set(row.store_id as string, {
      timeoutMinutes: row.backstop_timeout_minutes as number,
      businessHours: windowsByStore.get(row.store_id as string) ?? [],
    });
  }

  // 3. Pure decision: threshold per store + hard cap. Capping is never
  // silent (spec: no silent caps).
  const decision = decideActivations(candidates, configByStore, new Date());
  if (decision.cappedCount > 0) {
    ctx.log.warn("sdr-backstop-tick cap engaged", {
      eligible: decision.eligibleCount,
      capped: decision.cappedCount,
      cap: MAX_ACTIVATIONS_PER_TICK,
    });
  }

  // 4. Claim + fire — unchanged idiom: guarded UPDATE + affected-row check
  // so overlapping ticks never double-fire, then fire-and-forget dispatch.
  const sdrRespondUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/sdr-respond`;
  const workerSecret = expected!;
  let activated = 0;
  for (const candidate of decision.toActivate) {
    const { data: updated, error: updErr } = await admin
      .from("conversations")
      .update({ is_sdr_active: true })
      .eq("id", candidate.conversationId)
      .eq("is_sdr_active", false)
      .select("id");
    if (updErr) {
      ctx.log.error("sdr-backstop-tick activation failed", {
        conversationId: candidate.conversationId,
        error: updErr.message,
      });
      continue;
    }
    if (!updated || updated.length === 0) continue; // lost the race to a concurrent tick
    activated++;
    fetch(sdrRespondUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": workerSecret },
      body: JSON.stringify({ conversationId: candidate.conversationId }),
    }).catch((err) =>
      ctx.log.warn("sdr-respond dispatch failed", {
        conversationId: candidate.conversationId,
        error: String(err),
      }),
    );
  }

  ctx.log.info("sdr-backstop-tick summary", {
    eligible: decision.eligibleCount,
    activated,
    capped: decision.cappedCount,
  });
  return json({ eligible: decision.eligibleCount, activated, capped: decision.cappedCount }, 200);
});
```

- [ ] **Step 2: Rodar a suíte inteira + build**

```bash
cd "D:/claude/gallo-basediesel/.claude/worktrees/sdr-backstop-eligibility-fix"
bun run test
bun run build
```

Expected: todos os testes verdes (baseline ~1977+ + os 7 novos), build limpo.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/sdr-backstop-tick/index.ts
git commit -m "feat(sdr): rewire backstop tick to candidates RPC + eligibility engine"
```

---

### Task 4: Gates de piloto no `sdr-escalation-timeout-tick` (TDD)

**Files:**
- Create: `supabase/functions/sdr-escalation-timeout-tick/gates.ts`
- Test: `supabase/functions/sdr-escalation-timeout-tick/gates.test.ts`
- Modify: `supabase/functions/sdr-escalation-timeout-tick/index.ts` (edições pontuais — mostradas integralmente abaixo)

**Interfaces:**
- Consumes: no `index.ts` existente, o passo 3 já constrói `accountByConv: Map<string, string | null>` e `storeIdByConv: Map<string, string>` a partir de `convRows`, e `toProcess: IEscalationRow[]` (com campo `conversation_id: string`).
- Produces: `filterByPilotGates<T extends { conversation_id: string }>(escalations: T[], gates: IGateContext): { passed: T[]; skippedCount: number }` e `IGateContext { storeIdByConv: Map<string, string>; accountIdByConv: Map<string, string | null>; enabledStoreIds: Set<string>; enabledAccountIds: Set<string> }`.

- [ ] **Step 1: Escrever os testes que falham**

```typescript
// supabase/functions/sdr-escalation-timeout-tick/gates.test.ts
import { describe, expect, it } from "vitest";
import { filterByPilotGates, type IGateContext } from "./gates";

const esc = (conversationId: string) => ({ id: `esc-${conversationId}`, conversation_id: conversationId });

function gates(overrides: Partial<IGateContext> = {}): IGateContext {
  return {
    storeIdByConv: new Map([["conv-1", "store-on"]]),
    accountIdByConv: new Map([["conv-1", "acc-on"]]),
    enabledStoreIds: new Set(["store-on"]),
    enabledAccountIds: new Set(["acc-on"]),
    ...overrides,
  };
}

describe("filterByPilotGates", () => {
  it("passes an escalation whose store AND instance are in the pilot", () => {
    const result = filterByPilotGates([esc("conv-1")], gates());
    expect(result.passed.map((e) => e.conversation_id)).toEqual(["conv-1"]);
    expect(result.skippedCount).toBe(0);
  });

  it("skips when the store is not in the pilot", () => {
    const result = filterByPilotGates([esc("conv-1")], gates({ enabledStoreIds: new Set() }));
    expect(result.passed).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });

  it("skips when the instance is not in the pilot", () => {
    const result = filterByPilotGates([esc("conv-1")], gates({ enabledAccountIds: new Set() }));
    expect(result.passed).toEqual([]);
    expect(result.skippedCount).toBe(1);
  });

  it("skips when the conversation has no instance or is unknown", () => {
    const noAccount = filterByPilotGates(
      [esc("conv-1")],
      gates({ accountIdByConv: new Map([["conv-1", null]]) }),
    );
    expect(noAccount.skippedCount).toBe(1);

    const unknownConv = filterByPilotGates([esc("conv-ghost")], gates());
    expect(unknownConv.skippedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd "D:/claude/gallo-basediesel/.claude/worktrees/sdr-backstop-eligibility-fix"
bunx vitest run supabase/functions/sdr-escalation-timeout-tick/gates.test.ts
```

Expected: FAIL — `Cannot find module './gates'`.

- [ ] **Step 3: Implementar `gates.ts`**

```typescript
// supabase/functions/sdr-escalation-timeout-tick/gates.ts
// Pure pilot-gate filter — no I/O. 2026-07-20 incident follow-up: this tick
// used to process escalations from ANY store/instance; it now honors the
// same store+instance opt-in gates Parte C added to sdr-backstop-tick and
// sdr-respond. Unknown conversation, missing instance, or either gate off
// → skipped (fails closed).
export interface IGateContext {
  storeIdByConv: Map<string, string>;
  accountIdByConv: Map<string, string | null>;
  enabledStoreIds: Set<string>;
  enabledAccountIds: Set<string>;
}

export function filterByPilotGates<T extends { conversation_id: string }>(
  escalations: T[],
  gates: IGateContext,
): { passed: T[]; skippedCount: number } {
  const passed = escalations.filter((escalation) => {
    const storeId = gates.storeIdByConv.get(escalation.conversation_id);
    const accountId = gates.accountIdByConv.get(escalation.conversation_id);
    return (
      storeId !== undefined &&
      gates.enabledStoreIds.has(storeId) &&
      accountId !== null &&
      accountId !== undefined &&
      gates.enabledAccountIds.has(accountId)
    );
  });
  return { passed, skippedCount: escalations.length - passed.length };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
bunx vitest run supabase/functions/sdr-escalation-timeout-tick/gates.test.ts
```

Expected: PASS (4 testes).

- [ ] **Step 5: Ligar o filtro no `index.ts`**

Três edições pontuais em `supabase/functions/sdr-escalation-timeout-tick/index.ts`:

**(a)** Adicionar o import após o bloco de imports `_shared` existente:

```typescript
import { filterByPilotGates } from "./gates.ts";
```

**(b)** Logo APÓS o bloco do passo 3 que constrói `accountByConv` e `storeIdByConv` (procurar `const storeIdByConv = new Map(`; inserir depois do fechamento dessa expressão), adicionar:

```typescript
  // 3.5. Pilot gates (2026-07-20 incident follow-up): only escalations whose
  // store AND instance opted into the pilot are processed — same
  // defense-in-depth idiom Parte C added to sdr-backstop-tick/sdr-respond.
  // With the pilot fully off this tick is a complete no-op.
  const [{ data: pilotStores }, { data: pilotAccounts }] = await Promise.all([
    admin.from("sdr_settings").select("store_id").eq("sdr_enabled", true),
    admin.from("whatsapp_accounts").select("id").eq("sdr_enabled", true),
  ]);
  const gateResult = filterByPilotGates(toProcess, {
    storeIdByConv,
    accountIdByConv: accountByConv,
    enabledStoreIds: new Set((pilotStores ?? []).map((row) => row.store_id as string)),
    enabledAccountIds: new Set((pilotAccounts ?? []).map((row) => row.id as string)),
  });
  if (gateResult.skippedCount > 0) {
    ctx.log.info("sdr-escalation-timeout-tick skipped by pilot gates", {
      skipped: gateResult.skippedCount,
    });
  }
```

**(c)** Trocar o cabeçalho do loop de broadcast de:

```typescript
  for (const escalation of toProcess) {
```

para:

```typescript
  for (const escalation of gateResult.passed) {
```

Nota: `storeIdByConv` no arquivo existente é `Map<string, string>` construído de `convRows`; conversa ausente do map simplesmente não passa no gate (fails closed) — nenhum tratamento extra é necessário.

- [ ] **Step 6: Rodar a suíte inteira + build**

```bash
bun run test
bun run build
```

Expected: verde e limpo.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/sdr-escalation-timeout-tick/gates.ts supabase/functions/sdr-escalation-timeout-tick/gates.test.ts supabase/functions/sdr-escalation-timeout-tick/index.ts
git commit -m "feat(sdr): honor pilot gates in escalation timeout tick"
```

---

### Task 5: Atualizar o guia operacional

**Files:**
- Modify: `docs/dev/sdr-production-activation.md`

**Interfaces:** nenhuma (documentação).

- [ ] **Step 1: Editar o guia**

No documento existente:

1. Na seção de rollout/checklist de ativação, substituir a descrição da elegibilidade antiga do backstop pela nova regra (as 6 condições da tabela do spec §1 — gates loja+instância, estado de fila, última mensagem é do cliente, posterior ao marco de ativação, com menos de 24h) e registrar que o timer conta de `last_inbound_at`, não de `queued_at`.
2. Adicionar subseção "Incidente 2026-07-20 (disparo em massa)" com: resumo de 3-4 linhas (16 mensagens num tick, causa = threshold 0 fora do horário + sem corte de recência + sem cap), link para o spec `docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md`.
3. Adicionar ao checklist de (re)ativação os passos novos: aplicar migration `20260720210000` ANTES de re-armar os crons; conferir que os crons estão ativos (`select jobname, active from cron.job where jobname like 'sdr%'`); ligar toggles por último (o trigger carimba `sdr_activated_at`; esperado `activated=0` nos logs até chegar conversa nova).
4. Remover/ajustar qualquer trecho que afirme que conversas do backlog antigo serão atendidas pelo backstop (o achado de "fila legada sem `whatsapp_account_id`" da Parte C continua válido e pode ficar).

- [ ] **Step 2: Commit**

```bash
git add docs/dev/sdr-production-activation.md
git commit -m "docs(sdr): update activation guide for new backstop eligibility"
```

---

### Task 6: Verificação final da branch

**Files:** nenhum novo.

- [ ] **Step 1: Suíte completa + build + tsc por delta**

```bash
cd "D:/claude/gallo-basediesel/.claude/worktrees/sdr-backstop-eligibility-fix"
bun run test
bun run build
bunx tsc --noEmit 2>&1 | grep -E "eligibility|gates|sdr-backstop|sdr-escalation" || echo "OK: zero erros de tsc nos arquivos da branch"
```

Expected: testes verdes, build limpo, nenhum erro de `tsc` nos arquivos criados/modificados nesta branch (baseline pré-existente de ~315 erros em outros arquivos é conhecido e ignorado).

- [ ] **Step 2: Conferir escopo do diff**

```bash
git diff --name-only main...HEAD
```

Expected — SOMENTE estes arquivos:

```
docs/dev/sdr-production-activation.md
docs/superpowers/plans/2026-07-20-sdr-backstop-eligibility-fix.md
docs/superpowers/specs/2026-07-20-sdr-backstop-eligibility-fix-design.md
supabase/functions/sdr-backstop-tick/eligibility.test.ts
supabase/functions/sdr-backstop-tick/eligibility.ts
supabase/functions/sdr-backstop-tick/index.ts
supabase/functions/sdr-escalation-timeout-tick/gates.test.ts
supabase/functions/sdr-escalation-timeout-tick/gates.ts
supabase/functions/sdr-escalation-timeout-tick/index.ts
supabase/migrations/20260720210000_sdr_backstop_eligibility.sql
```

---

## Rollout (pós-merge, CADA passo com OK explícito do dono)

> Executado pelo agente na sessão principal via MCP — NÃO faz parte das tasks
> de implementação acima. Estado atual: toggles todos `false`, crons
> `sdr-backstop-tick` e `sdr-escalation-timeout-tick` PAUSADOS
> (`cron.alter_job active:=false`, sessão 2026-07-20).

1. **Merge do PR** (dono aprova; nunca mergear sem OK).
2. **Deploy das 2 Edge Functions:**
   `npx supabase functions deploy sdr-backstop-tick --project-ref njizaasajkdqptlxddqn` e
   `npx supabase functions deploy sdr-escalation-timeout-tick --project-ref njizaasajkdqptlxddqn`
   (com `verify_jwt=false` preservado, como nos deploys anteriores).
3. **Aplicar a migration** `20260720210000_sdr_backstop_eligibility` via MCP
   `apply_migration` (o arquivo já está versionado no PR). Sondas de verificação:

```sql
-- colunas + triggers + função + índice existem
select column_name from information_schema.columns
 where table_schema='public' and column_name='sdr_activated_at';
select tgname, tgrelid::regclass from pg_trigger where tgname='trg_stamp_sdr_activated_at';
select proname from pg_proc where proname in ('stamp_sdr_activated_at','sdr_backstop_candidates');
select indexname from pg_indexes where indexname='messages_conversation_created_at_idx';
-- RPC responde vazio (toggles off) e o plano usa índice
select * from public.sdr_backstop_candidates();
explain (analyze, buffers) select * from public.sdr_backstop_candidates();
```

4. **Higiene de dados** (inspecionar ANTES, agir com os ids reais):

```sql
-- 4a. As 2 escalações do incidente (esperado: status='assigned', criadas 2026-07-20)
select id, conversation_id, status, mode, assigned_seller_id,
       first_human_response_at, urgent_broadcast_at, created_at
  from public.sdr_escalations
 where status in ('pending','assigned') and urgent_broadcast_at is null;
-- Neutralizar (template — substituir pelos ids reais da consulta acima):
update public.sdr_escalations set status='abandoned' where id in ('<id1>','<id2>');

-- 4b. is_sdr_active preso do incidente
select id, status, assigned_seller_id from public.conversations where is_sdr_active = true;
update public.conversations set is_sdr_active=false where is_sdr_active=true;
```

5. **Re-armar os crons** (seguro antes dos toggles — gates off = no-op):

```sql
select cron.alter_job(jobid, active := true)
  from cron.job
 where jobname in ('sdr-backstop-tick','sdr-escalation-timeout-tick');
select jobname, active from cron.job where jobname like 'sdr%';
```

6. **Dono religa os toggles** em `/app/sdr` → Configurações: loja piloto +
   instância "GALLO Site — WAHA (55) 9900-3314". O trigger carimba
   `sdr_activated_at`; verificar:

```sql
select store_id, sdr_enabled, sdr_activated_at from public.sdr_settings;
select id, label, sdr_enabled, sdr_activated_at from public.whatsapp_accounts where sdr_enabled;
```

7. **Monitorar** os logs do primeiro tick pós-religada (esperado:
   `{ eligible: 0, activated: 0, capped: 0 }` até chegar mensagem nova de
   cliente) e o primeiro atendimento real do SDR.

## Fora de escopo (reafirmado do spec)

- Remediação das 16 mensagens enviadas; mutação das ~1.620 conversas do backlog; mecanismo legado `useUrgentBroadcastTimer`; ativação do SDR no webhook; version bump (processo normal pós-merge).
