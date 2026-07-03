# Encerramento de atendimento + Histórico de atendimento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `resolvida`/`arquivada` um eixo "encerrado" (some da lista, sem dono, reabre na fila ao próximo contato do cliente) e entregar um Histórico de Atendimento por cliente (timeline auditável de status/atribuições/reaberturas).

**Architecture:** Um eixo terminal que estende a invariante do unify (engine puro); uma tabela append-only `conversation_activity` alimentada por um **trigger** `SECURITY DEFINER` em `conversations` (captura todos os caminhos com ator via `current_seller_id()`, `NULL`=Sistema); leitura por RPC gated `get_customer_activity`; encerramento atômico via RPC `close_conversation`; reabertura no webhook; painel híbrido (cards por conversa + trilho).

**Tech Stack:** React 19, TanStack Query/Router, Provider Pattern (`@/providers/data`), Supabase (Postgres + RLS + RPC/trigger SECURITY DEFINER + Edge Functions), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-attendance-close-and-history-design.md` (autoritativo).

## Global Constraints

- **Nenhum status novo** — os 5 de `ConversationStatus` continuam; muda comportamento, não vocabulário.
- Toda mudança de dado tem par **mock + supabase**. `apply_migration` via MCP é **espelhado** em `supabase/migrations/` no mesmo PR e é **owner-gated** (confirmar com o dono).
- Modelo "2 portões" intacto; leitura escopada por conversa via RPC `SECURITY DEFINER` gated-once. Nada de RLS por-linha em varredura.
- **Cache do atendimento CONGELADO** (signing lote #137, Realtime, query keys, RPCs gated-once) — não reescrever. O painel usa **query key nova e isolada**.
- UI consome `STATUS_META`/`CONVERSATION_STRINGS.statusLabel` (nunca hex/`--gallo-*`). UI em pt-BR acentuado; código em inglês.
- `webhook/core.ts` é runtime-agnostic (só imports relativos dentro de `src/providers/whatsapp/`); predicados puros ficam **locais** ao arquivo (não cross-import de `providers/data/engine`).
- Integração por push + PR; nunca merge sem OK. Gate prático: `bun run build` + `bun run test`; `bunx tsc --noEmit` por delta nos arquivos novos.

---

## Phase 1 — Engines puros

### Task 1: `assignmentStatusCoupling` — eixo terminal + reabertura + close

**Files:**
- Modify: `src/providers/data/engine/assignmentStatusCoupling.ts`
- Test: `src/providers/data/engine/assignmentStatusCoupling.test.ts`

**Interfaces:**
- Produces: `TERMINAL_STATUSES`, `isTerminalStatus(s)`, `reopenOnInbound(current): ConversationStatus | null`; `ManualStatusCoupling` gains `'close'`; `statusOnUnassign` treats all terminals as exempt.

- [ ] **Step 1: Failing tests** — append to `assignmentStatusCoupling.test.ts`:

```ts
import {
  TERMINAL_STATUSES,
  isTerminalStatus,
  reopenOnInbound,
  statusOnUnassign,
  coupleManualStatusChange,
} from "./assignmentStatusCoupling";

describe("terminal axis", () => {
  it("treats resolvida and arquivada as terminal", () => {
    expect(isTerminalStatus("resolvida")).toBe(true);
    expect(isTerminalStatus("arquivada")).toBe(true);
    expect(isTerminalStatus("aguardando")).toBe(false);
    expect(isTerminalStatus("em_andamento")).toBe(false);
    expect([...TERMINAL_STATUSES].sort()).toEqual(["arquivada", "resolvida"]);
  });

  it("statusOnUnassign leaves BOTH terminals untouched (no re-queue)", () => {
    expect(statusOnUnassign("resolvida")).toBeNull();
    expect(statusOnUnassign("arquivada")).toBeNull();
    expect(statusOnUnassign("aguardando")).toBeNull();
    expect(statusOnUnassign("em_andamento")).toBe("aguardando");
    expect(statusOnUnassign("aguardando_cliente")).toBe("aguardando");
  });

  it("coupleManualStatusChange returns 'close' when an owned conversation goes terminal", () => {
    expect(coupleManualStatusChange("resolvida", true)).toBe("close");
    expect(coupleManualStatusChange("arquivada", true)).toBe("close");
    // unowned terminal has no owner to strip — no coupling
    expect(coupleManualStatusChange("resolvida", false)).toBeNull();
    // existing rules preserved
    expect(coupleManualStatusChange("em_andamento", false)).toBe("assign-self");
    expect(coupleManualStatusChange("aguardando", true)).toBe("unassign");
  });

  it("reopenOnInbound re-queues only terminals", () => {
    expect(reopenOnInbound("resolvida")).toBe("aguardando");
    expect(reopenOnInbound("arquivada")).toBe("aguardando");
    expect(reopenOnInbound("aguardando")).toBeNull();
    expect(reopenOnInbound("em_andamento")).toBeNull();
    expect(reopenOnInbound("aguardando_cliente")).toBeNull();
  });
});
```

- [ ] **Step 2:** Run `bunx vitest run src/providers/data/engine/assignmentStatusCoupling.test.ts` → FAIL (undefined exports).

- [ ] **Step 3: Implement** — replace the body of `assignmentStatusCoupling.ts` with:

```ts
import type { ConversationStatus } from "@/shared/types";

/**
 * Status ⇄ assignment coupling (spec 2026-07-02-unify + 2026-07-03-attendance-close).
 * OPEN unowned ⇒ aguardando (queue); owned ⇒ being attended; TERMINAL (resolvida
 * ∪ arquivada) ⇒ always unowned and exempt from the queue invariant. A customer
 * inbound reopens a terminal conversation back to the queue.
 */

/** Closed axis — hidden by default, unowned, reopened on inbound. */
export const TERMINAL_STATUSES: ReadonlySet<ConversationStatus> = new Set([
  "resolvida",
  "arquivada",
]);

export function isTerminalStatus(s: ConversationStatus): boolean {
  return TERMINAL_STATUSES.has(s);
}

/** Assigning someone pulls a queued conversation into "being attended". */
export function statusOnAssign(current: ConversationStatus): ConversationStatus | null {
  return current === "aguardando" ? "em_andamento" : null;
}

/** Unassigning returns the conversation to the queue — except the terminal axis
 *  (already unowned/closed) and aguardando (already queued). */
export function statusOnUnassign(current: ConversationStatus): ConversationStatus | null {
  if (isTerminalStatus(current) || current === "aguardando") return null;
  return "aguardando";
}

export type ManualStatusCoupling = "assign-self" | "unassign" | "close" | null;

/**
 * Manual status change coupling: closing an owned conversation (→ terminal)
 * strips the owner atomically ('close'); picking an "owned" status on an unowned
 * conversation claims it ('assign-self'); picking "aguardando" on an owned one
 * returns it to the queue ('unassign').
 */
export function coupleManualStatusChange(
  next: ConversationStatus,
  hasAssignee: boolean,
): ManualStatusCoupling {
  if (hasAssignee && isTerminalStatus(next)) return "close";
  if (!hasAssignee && (next === "em_andamento" || next === "aguardando_cliente"))
    return "assign-self";
  if (hasAssignee && next === "aguardando") return "unassign";
  return null;
}

/** A customer inbound reopens a terminal conversation to the queue. */
export function reopenOnInbound(current: ConversationStatus): ConversationStatus | null {
  return isTerminalStatus(current) ? "aguardando" : null;
}
```

- [ ] **Step 4:** Run the test → PASS. Also run the existing coupling tests untouched.
- [ ] **Step 5: Commit** — `feat(conversations): terminal status axis + reopen-on-inbound engine`

---

### Task 2: `deriveActivityDelta` — derivação de evento (espelho do trigger SQL)

**Files:**
- Create: `src/providers/data/engine/conversationActivity.ts`
- Test: `src/providers/data/engine/conversationActivity.test.ts`

**Interfaces:**
- Consumes: `AttendanceActivityType`, `ConversationStatus`, `ID` from `@/shared/types` (define the type in Task 3 first).
- Produces: `IActivityDelta`, `deriveActivityDelta(before, after, actorId)`. Used by the mock emission layer (Task 8) and mirrored in SQL by the trigger (Task 4).

- [ ] **Step 1: Failing test** — `conversationActivity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveActivityDelta } from "./conversationActivity";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("deriveActivityDelta", () => {
  it("INSERT (before=null) is a 'created' event carrying the initial status/owner", () => {
    expect(deriveActivityDelta(null, { status: "aguardando", assignedSellerId: null }, null)).toEqual({
      type: "created", fromStatus: null, toStatus: "aguardando", fromSellerId: null, toSellerId: null,
    });
  });

  it("returns null when neither status nor owner changed", () => {
    expect(
      deriveActivityDelta(
        { status: "em_andamento", assignedSellerId: A },
        { status: "em_andamento", assignedSellerId: A },
        A,
      ),
    ).toBeNull();
  });

  it("close = one 'status' row carrying both the terminal status and the owner drop", () => {
    expect(
      deriveActivityDelta(
        { status: "em_andamento", assignedSellerId: A },
        { status: "resolvida", assignedSellerId: null },
        A,
      ),
    ).toEqual({
      type: "status", fromStatus: "em_andamento", toStatus: "resolvida", fromSellerId: A, toSellerId: null,
    });
  });

  it("system re-queue of a terminal is a 'reopen'", () => {
    expect(
      deriveActivityDelta(
        { status: "resolvida", assignedSellerId: null },
        { status: "aguardando", assignedSellerId: null },
        null,
      ),
    ).toMatchObject({ type: "reopen", fromStatus: "resolvida", toStatus: "aguardando" });
  });

  it("a seller manually reopening a terminal is NOT a system reopen (type 'status')", () => {
    expect(
      deriveActivityDelta(
        { status: "resolvida", assignedSellerId: null },
        { status: "aguardando", assignedSellerId: null },
        A,
      ),
    ).toMatchObject({ type: "status" });
  });

  it("owner-only change (transfer) is an 'assignment'", () => {
    expect(
      deriveActivityDelta(
        { status: "em_andamento", assignedSellerId: A },
        { status: "em_andamento", assignedSellerId: B },
        A,
      ),
    ).toEqual({
      type: "assignment", fromStatus: null, toStatus: null, fromSellerId: A, toSellerId: B,
    });
  });
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Implement** `conversationActivity.ts`:

```ts
import type { AttendanceActivityType, ConversationStatus, ID } from "@/shared/types";

export interface IActivityDelta {
  type: AttendanceActivityType;
  fromStatus: ConversationStatus | null;
  toStatus: ConversationStatus | null;
  fromSellerId: ID | null;
  toSellerId: ID | null;
}

interface ConvState {
  status: ConversationStatus;
  assignedSellerId: ID | null;
}

/**
 * Derive a single activity event from a conversation transition. Mirrors the SQL
 * trigger `conversation_activity_capture` (Task 4) — keep both in sync. `actorId`
 * null means the change came from the system (webhook / service role).
 */
export function deriveActivityDelta(
  before: ConvState | null,
  after: ConvState,
  actorId: ID | null,
): IActivityDelta | null {
  if (before === null) {
    return {
      type: "created",
      fromStatus: null,
      toStatus: after.status,
      fromSellerId: null,
      toSellerId: after.assignedSellerId,
    };
  }
  const statusChanged = before.status !== after.status;
  const sellerChanged = (before.assignedSellerId ?? null) !== (after.assignedSellerId ?? null);
  if (!statusChanged && !sellerChanged) return null;

  const type: AttendanceActivityType =
    statusChanged &&
    after.status === "aguardando" &&
    (before.status === "resolvida" || before.status === "arquivada") &&
    actorId === null
      ? "reopen"
      : statusChanged
        ? "status"
        : "assignment";

  return {
    type,
    fromStatus: statusChanged ? before.status : null,
    toStatus: statusChanged ? after.status : null,
    fromSellerId: sellerChanged ? (before.assignedSellerId ?? null) : null,
    toSellerId: sellerChanged ? (after.assignedSellerId ?? null) : null,
  };
}
```

- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** — `feat(conversations): activity-delta derivation engine`

---

## Phase 2 — Domain types

### Task 3: Tipos de domínio da atividade

**Files:**
- Modify: `src/shared/types/conversation.ts`
- Modify: `src/shared/types/index.ts` (barrel — only if `conversation.ts` types aren't already `export *`'d; verify first)

**Interfaces:**
- Produces: `IConversationActivityEvent` (+ re-uses `AttendanceActivityType` from the engine, re-exported here for the domain).

- [ ] **Step 1:** Add to `src/shared/types/conversation.ts` (near `IConversation`):

```ts
/** Kind of attendance-lifecycle event (mirrors the SQL trigger derivation). */
export type AttendanceActivityType = "created" | "status" | "assignment" | "reopen";

/**
 * One append-only entry in a conversation's attendance history
 * (`conversation_activity`). One row per transition, carrying both the status
 * and the owner delta; `actorId === null` (with `actorKind === 'system'`) means
 * the system caused it (e.g. reopen-on-inbound from the webhook).
 */
export interface IConversationActivityEvent {
  id: ID;
  conversationId: ID;
  customerId?: ID;
  leadId?: ID;
  storeId: ID;
  type: AttendanceActivityType;
  fromStatus?: ConversationStatus | null;
  toStatus?: ConversationStatus | null;
  fromSellerId?: ID | null;
  toSellerId?: ID | null;
  actorId?: ID | null;
  actorKind: "seller" | "system";
  createdAt: ISO8601;
  /** Denormalized conversation metadata for the timeline card header. */
  conversationChannel: ConversationChannel;
  conversationStatus: ConversationStatus;
  conversationCreatedAt: ISO8601;
}
```

> `AttendanceActivityType` is defined HERE (the domain owns it); the engine (Task 2) and both provider impls import it from `@/shared/types`. Ensure the domain barrel re-exports both new symbols.

- [ ] **Step 2:** Confirm `src/shared/types/index.ts` re-exports `conversation.ts` (grep for `export * from "./conversation"`). If it enumerates types explicitly, add `IConversationActivityEvent` + `AttendanceActivityType`.
- [ ] **Step 3:** `bunx tsc --noEmit` on the new type usages compiles (no consumers yet — just verify no syntax error).
- [ ] **Step 4: Commit** — `feat(types): IConversationActivityEvent domain type`

---

## Phase 3 — Migrations (owner-gated apply)

> Each migration is written as a file in `supabase/migrations/` AND applied to prod via `mcp__supabase__apply_migration` **after the dono confirms**. Version = the filename timestamp. Idempotent where noted.

### Task 4: Migration — tabela `conversation_activity` + trigger + `get_customer_activity`

**Files:**
- Create: `supabase/migrations/20260703170000_conversation_activity.sql`

**Interfaces:**
- Produces (DB): table `conversation_activity`, trigger `conversation_activity_capture` on `conversations`, RPC `get_customer_activity(uuid)`. Consumed by the supabase `activity` provider (Task 9) and the trigger fires for Tasks 5/8/12.

- [ ] **Step 1: Write the migration** (mirrors `transfer_conversation` DEFINER idiom + `rotation_queues` table idiom; RLS fail-closed, reads via RPC):

```sql
-- conversation_activity: append-only attendance-lifecycle timeline.
-- Writes ONLY via the trigger (SECURITY DEFINER, owner = postgres, bypasses RLS).
-- Reads ONLY via get_customer_activity (SECURITY DEFINER, gated once). No
-- permissive client policy — RLS is fail-closed.

create table if not exists public.conversation_activity (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id text,
  store_id uuid not null references public.stores(id) on delete cascade,
  type text not null check (type in ('created','status','assignment','reopen')),
  from_status text,
  to_status text,
  from_seller_id uuid references public.sellers(id),
  to_seller_id uuid references public.sellers(id),
  actor_id uuid references public.sellers(id),
  actor_kind text not null check (actor_kind in ('seller','system')),
  created_at timestamptz not null default now()
);

create index if not exists conversation_activity_customer_idx
  on public.conversation_activity (customer_id, created_at);
create index if not exists conversation_activity_conversation_idx
  on public.conversation_activity (conversation_id, created_at);

alter table public.conversation_activity enable row level security;
-- No policy on purpose: client SELECT/INSERT denied; all access is via functions.

-- Trigger: capture every status/owner change on conversations. Mirror of the
-- pure engine deriveActivityDelta() (src/providers/data/engine/conversationActivity.ts).
create or replace function public.conversation_activity_capture()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_actor uuid := public.current_seller_id();
  v_kind text := case when public.current_seller_id() is null then 'system' else 'seller' end;
  v_status_changed boolean;
  v_seller_changed boolean;
  v_type text;
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_activity(
      conversation_id, customer_id, lead_id, store_id, type,
      from_status, to_status, from_seller_id, to_seller_id, actor_id, actor_kind)
    values (new.id, new.customer_id, new.lead_id, new.store_id, 'created',
            null, new.status, null, new.assigned_seller_id, v_actor, v_kind);
    return new;
  end if;

  v_status_changed := new.status is distinct from old.status;
  v_seller_changed := new.assigned_seller_id is distinct from old.assigned_seller_id;
  if not v_status_changed and not v_seller_changed then
    return new;
  end if;

  v_type := case
    when v_status_changed and new.status = 'aguardando'
         and old.status in ('resolvida','arquivada') and v_actor is null then 'reopen'
    when v_status_changed then 'status'
    else 'assignment'
  end;

  insert into public.conversation_activity(
    conversation_id, customer_id, lead_id, store_id, type,
    from_status, to_status, from_seller_id, to_seller_id, actor_id, actor_kind)
  values (
    new.id, new.customer_id, new.lead_id, new.store_id, v_type,
    case when v_status_changed then old.status end,
    case when v_status_changed then new.status end,
    case when v_seller_changed then old.assigned_seller_id end,
    case when v_seller_changed then new.assigned_seller_id end,
    v_actor, v_kind);
  return new;
end;
$$;

drop trigger if exists conversation_activity_capture on public.conversations;
create trigger conversation_activity_capture
  after insert or update on public.conversations
  for each row execute function public.conversation_activity_capture();

-- Read RPC: whole-customer timeline, gated once (staff OR carteira owner OR can
-- access ANY of the customer's conversations). Ordered by conversation then time.
create or replace function public.get_customer_activity(p_customer_id uuid)
returns table (
  id uuid, conversation_id uuid, customer_id uuid, lead_id text, store_id uuid,
  type text, from_status text, to_status text,
  from_seller_id uuid, to_seller_id uuid, actor_id uuid, actor_kind text,
  created_at timestamptz,
  conversation_channel text, conversation_status text, conversation_created_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $$
  select a.id, a.conversation_id, a.customer_id, a.lead_id, a.store_id,
         a.type, a.from_status, a.to_status, a.from_seller_id, a.to_seller_id,
         a.actor_id, a.actor_kind, a.created_at,
         c.channel, c.status, c.created_at
  from public.conversation_activity a
  join public.conversations c on c.id = a.conversation_id
  join public.customers cu on cu.id = a.customer_id
  where a.customer_id = p_customer_id
    and (
      public.is_staff()
      or cu.seller_id = public.current_seller_id()
      or exists (
        select 1 from public.conversations cc
        where cc.customer_id = p_customer_id
          and public.can_access_conversation(cc.id)
      )
    )
  order by a.conversation_id, a.created_at asc;
$$;

revoke all on function public.get_customer_activity(uuid) from public, anon;
grant execute on function public.get_customer_activity(uuid) to authenticated;
```

- [ ] **Step 2:** Confirm helper signatures exist (they do): `public.current_seller_id()`, `public.is_staff()`, `public.can_access_conversation(uuid)`. Confirm `conversations` has `customer_id uuid`, `lead_id text`, `store_id uuid`, `assigned_seller_id uuid`, `status text`.
- [ ] **Step 3:** Apply (owner-gated) via `mcp__supabase__apply_migration` (name `conversation_activity`). Verify: `insert`/`update` a test conversation status in SQL editor → a `conversation_activity` row appears; `select public.get_customer_activity('<customer>')` returns rows as owner.
- [ ] **Step 4: Commit** the migration file — `feat(db): conversation_activity table, capture trigger, get_customer_activity RPC`

---

### Task 5: Migration — `close_conversation` RPC

**Files:**
- Create: `supabase/migrations/20260703171000_close_conversation_rpc.sql`

**Interfaces:**
- Produces (DB): `close_conversation(p_conversation_id uuid, p_status text) returns setof conversations`. The UPDATE fires the Task-4 trigger (emits the close event). Consumed by the supabase `close()` (Task 7).

- [ ] **Step 1: Write** (mirror of `transfer_conversation`):

```sql
create or replace function public.close_conversation(
  p_conversation_id uuid,
  p_status text
)
returns setof public.conversations
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_status not in ('resolvida', 'arquivada') then
    raise exception 'invalid close status %', p_status using errcode = '22023';
  end if;
  if not public.can_access_conversation(p_conversation_id) then
    raise exception 'not allowed to close conversation %', p_conversation_id
      using errcode = '42501';
  end if;
  return query
    update public.conversations
       set status = p_status,
           assigned_seller_id = null,
           is_sdr_active = false,
           updated_at = now()
     where id = p_conversation_id
    returning *;
end;
$$;

revoke all on function public.close_conversation(uuid, text) from public;
grant execute on function public.close_conversation(uuid, text) to authenticated;
```

- [ ] **Step 2:** Apply (owner-gated). Verify: `select public.close_conversation('<conv>','resolvida')` returns the row with `assigned_seller_id` null + a `conversation_activity` row of type `status`, `to_status='resolvida'`.
- [ ] **Step 3: Commit** — `feat(db): close_conversation RPC (atomic terminal + unassign)`

---

## Phase 4 — Data providers (contract + supabase + mock)

### Task 6: Mock — coleção `conversationActivity` + API

**Files:**
- Modify: `src/mocks/store/mutations.ts` (add `conversationActivity` to `CollectionKey`/`CollectionMap`)
- Modify: `src/mocks/generators/bootstrap.ts` (`IBootstrappedDataset.conversationActivity: IConversationActivityEvent[]`, seeded `[]`)
- Modify: `src/mocks/store/selectors.ts` (add `selectAllConversationActivity` mirroring `selectAllDistributionTraces`)
- Create: `src/mocks/api/conversationActivity.ts` (mirror `src/mocks/api/distributionTraces.ts`)

**Interfaces:**
- Produces: `conversationActivityApi.create(event)`, `conversationActivityApi.getByCustomer(customerId): Promise<IConversationActivityEvent[]>` (filter + sort `createdAt` asc, then group-stable by conversation). Consumed by the supabase-parity mock provider (Task 9) and the emission helper (Task 8).

- [ ] **Step 1:** In `mutations.ts` add `"conversationActivity"` to the `CollectionKey` union and `conversationActivity: IConversationActivityEvent` to `CollectionMap` (both near the `distributionTraces` entry).
- [ ] **Step 2:** In `bootstrap.ts` add the field to `IBootstrappedDataset` and initialize `const conversationActivity: IConversationActivityEvent[] = [];` in the bootstrap body (near `distributionTraces`), include it in the returned dataset.
- [ ] **Step 3:** In `selectors.ts` add `export const selectAllConversationActivity = (s: IMockStoreState) => s.conversationActivity;` (match the existing selector convention exactly).
- [ ] **Step 4:** Create `conversationActivity.ts` mirroring `distributionTraces.ts`:

```ts
import type { ID } from "@/shared/types";
import type { IConversationActivityEvent } from "@/shared/types";
import { getMockState } from "../store/mockStore";
import { upsert } from "../store/mutations";
import { runApi } from "./_runApi"; // match the import path distributionTraces.ts uses

export const conversationActivityApi = {
  async create(event: IConversationActivityEvent): Promise<IConversationActivityEvent> {
    return runApi("conversationActivityApi", "create", () => upsert("conversationActivity", event), {
      payload: { id: event.conversationId, type: event.type },
    });
  },
  async getByCustomer(customerId: ID): Promise<IConversationActivityEvent[]> {
    return runApi("conversationActivityApi", "getByCustomer", () =>
      getMockState()
        .conversationActivity.filter((e) => e.customerId === customerId)
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      { payload: { customerId } },
    );
  },
};
```

> Match the exact `runApi`/import shape of `distributionTraces.ts` in this repo (the wrapper signature may differ slightly — copy it verbatim, only swap names/logic).

- [ ] **Step 5:** Register in `src/mocks/index.ts` barrel if that file enumerates api modules (grep for `distributionTracesApi`).
- [ ] **Step 6:** Build + typecheck new files. **Commit** — `feat(mock): conversationActivity collection + api`

---

### Task 7: `close()` — contrato + supabase + mock (com emissão)

**Files:**
- Modify: `src/providers/data/contracts/conversations.ts` (add `close` to `IConversationsProvider`)
- Modify: `src/providers/data/impl/supabase/conversations.ts` (add `close`)
- Modify: `src/mocks/api/conversations.ts` (add `close` + emit via helper)

**Interfaces:**
- Consumes: `close_conversation` RPC (Task 5), `conversationActivityApi` (Task 6), `deriveActivityDelta` (Task 2).
- Produces: `IConversationsProvider.close(id: ID, status: 'resolvida' | 'arquivada'): Promise<IConversation>`.

- [ ] **Step 1:** Contract — add after `unassign` (contracts/conversations.ts ~L131):

```ts
/** Close a conversation atomically: set the terminal status AND unassign +
 *  clear SDR, in one server op (no transitional aguardando). */
close(id: ID, status: "resolvida" | "arquivada"): Promise<IConversation>;
```

- [ ] **Step 2:** Supabase impl — add sibling to `assignSeller` (RPC pattern, NOT the `unassign` direct-update):

```ts
async close(id: ID, status: "resolvida" | "arquivada"): Promise<IConversation> {
  const { data, error } = await getSupabaseClient()
    .rpc("close_conversation", { p_conversation_id: id, p_status: status })
    .single();
  if (error) throw new Error(`[supabase] conversations.close(${id}) failed: ${error.message}`);
  return rowToConversation(data as ConversationRow);
},
```

(The Task-4 trigger emits the activity row server-side — no client emission here.)

- [ ] **Step 3:** Mock impl — add after `archive` (conversations.ts ~L290), emitting via the Task-8 helper:

```ts
async close(id: ID, status: "resolvida" | "arquivada"): Promise<IConversation> {
  return runApi("conversationsApi", "close", () => {
    const before = getMockState().conversations.find((c) => c.id === id);
    if (!before) throw new MockNotFoundError("conversation", id);
    const updated = patchById("conversations", id, {
      status,
      assignedSellerId: undefined,
      isSdrActive: false,
    });
    if (!updated) throw new MockNotFoundError("conversation", id);
    emitConversationActivity(before, updated, getCurrentMockSellerId());
    return updated;
  });
},
```

> `emitConversationActivity` + `getCurrentMockSellerId` come from Task 8. If Task 8 isn't done yet, stub `emitConversationActivity` as a no-op import so this task compiles/tests, and Task 8 fills it in. (Sequence 8 before finalizing if executing strictly in order — or land the helper in this task.)

- [ ] **Step 4:** Test (mock) — new `src/mocks/api/conversations.close.test.ts`:

```ts
// close() sets terminal status, clears the assignee + SDR, and emits one event.
it("close resolves + unassigns + emits a status activity event", async () => {
  // arrange: seed a conversation owned by seller A, em_andamento (use the mock
  // bootstrap/reset helper the other conversations tests use)
  // act: await conversationsApi.close(convId, "resolvida")
  // assert: store conversation has status "resolvida", assignedSellerId undefined,
  //         isSdrActive false; conversationActivity has 1 new row type "status",
  //         toStatus "resolvida", toSellerId null.
});
```

(Model the arrange/reset on an existing `src/mocks/api/conversations.*.test.ts` if present; otherwise on the pattern in `conversationRpcFilters`/store tests.)

- [ ] **Step 5:** Run tests → PASS. **Commit** — `feat(conversations): close() provider op (mock + supabase)`

---

### Task 8: Mock — emissão centralizada + reabertura no inbound

**Files:**
- Create: `src/mocks/api/_emitConversationActivity.ts` (helper + `getCurrentMockSellerId`)
- Modify: `src/mocks/api/conversations.ts` (`assignSeller`, `unassign`, `create` emit; `close` already wired in Task 7)
- Modify: `src/mocks/api/messages.ts` (`simulateIncoming` reopen + emit)

**Interfaces:**
- Consumes: `deriveActivityDelta` (Task 2), `conversationActivityApi.create` (Task 6), `reopenOnInbound` (Task 1).
- Produces: `emitConversationActivity(before, after, actorId)`, `getCurrentMockSellerId()`.

- [ ] **Step 1:** Helper:

```ts
import type { ID, IConversation, IConversationActivityEvent } from "@/shared/types";
import { deriveActivityDelta } from "@/providers/data/engine/conversationActivity";
import { conversationActivityApi } from "./conversationActivity";
import { newId } from "../generators/utils"; // use the repo's id generator
import { nowIso } from "../..."; // use the repo's clock helper if any, else new Date().toISOString()

/** Resolve the acting seller for the mock layer. Reuse whatever source the mock
 *  audit uses to know the logged-in seller; if none is ambient, this returns
 *  null (⇒ actorKind 'system'). See src/providers/data/impl/mock/_audit.ts. */
export function getCurrentMockSellerId(): ID | null {
  // TODO(impl): wire to the mock auth session accessor. If unavailable, null.
  return null;
}

export function emitConversationActivity(
  before: IConversation | null,
  after: IConversation,
  actorId: ID | null,
): void {
  const delta = deriveActivityDelta(
    before ? { status: before.status, assignedSellerId: before.assignedSellerId ?? null } : null,
    { status: after.status, assignedSellerId: after.assignedSellerId ?? null },
    actorId,
  );
  if (!delta) return;
  const event: IConversationActivityEvent = {
    id: newId(),
    conversationId: after.id,
    customerId: after.customerId,
    leadId: after.leadId,
    storeId: after.storeId,
    type: delta.type,
    fromStatus: delta.fromStatus,
    toStatus: delta.toStatus,
    fromSellerId: delta.fromSellerId,
    toSellerId: delta.toSellerId,
    actorId,
    actorKind: actorId === null ? "system" : "seller",
    createdAt: nowIso(),
    conversationChannel: after.channel,
    conversationStatus: after.status,
    conversationCreatedAt: after.createdAt,
  };
  void conversationActivityApi.create(event);
}
```

> Resolve `newId`/`nowIso` to the exact helpers the mock uses (grep `distributionTraces` creation for the id + timestamp idiom). `getCurrentMockSellerId` is best-effort — the mock is demo-only; wiring it to the mock session is a nicety, `null` is acceptable.

- [ ] **Step 2:** In `conversations.ts` `assignSeller`/`unassign`/`create`, capture `before` (the pre-mutation conversation) and call `emitConversationActivity(before, updated, getCurrentMockSellerId())` after the `patchById`/insert. For `assignSeller`, the actor is the acting user (`getCurrentMockSellerId()`), the `toSellerId` is `sellerId`.
- [ ] **Step 3:** In `messages.ts` `simulateIncoming` (the inbound path, ~L158-161), replace the terminal-preserving ternary with the engine + reopen emission:

```ts
import { reopenOnInbound } from "@/providers/data/engine/assignmentStatusCoupling";
import { emitConversationActivity } from "./_emitConversationActivity";
// ...
const before = conversation; // pre-patch snapshot
const reopened = reopenOnInbound(conversation.status);
const nextStatus = reopened ?? (conversation.status === "aguardando" ? "aguardando" : conversation.status);
const updated = patchById("conversations", conversationId, {
  lastMessageAt: now,
  status: nextStatus,
  unreadCount: conversation.unreadCount + 1,
  ...(reopened ? { assignedSellerId: undefined } : {}),
});
if (reopened && updated) {
  emitConversationActivity(before, updated, null); // system reopen
}
```

> Keep the existing non-terminal behavior intact (inbound to an open conversation still goes to `aguardando` per the current logic — verify the exact current status rule and preserve it for non-terminal). Only the terminal→reopen branch + emission is new.

- [ ] **Step 4:** Test — `src/mocks/api/messages.simulateIncoming.test.ts`: inbound to a `resolvida` conversation → status `aguardando`, `assignedSellerId` undefined, `unreadCount+1`, and a `conversationActivity` row of type `reopen` (`actorKind:'system'`). Inbound to an `em_andamento` conversation → unchanged owner, no reopen event.
- [ ] **Step 5:** Run → PASS. **Commit** — `feat(mock): centralized activity emission + reopen-on-inbound`

---

### Task 9: Provider `activity` — wiring completo

**Files (8):**
- Create: `src/providers/data/contracts/activity.ts`
- Modify: `src/providers/data/contracts/index.ts` (type re-export + `IDataProviders.activity` field)
- Create: `src/providers/data/impl/mock/activity.ts`
- Create: `src/providers/data/impl/supabase/activity.ts`
- Create: `src/providers/data/hooks/useActivityProvider.ts`
- Modify: `src/providers/data/factory.ts` (2 imports + 2 set entries)
- Modify: `src/providers/data/index.ts` (type export + hook export)

**Interfaces:**
- Produces: `IActivityProvider.getCustomerActivity(customerId: ID): Promise<IConversationActivityEvent[]>`, hook `useActivityProvider()`.

- [ ] **Step 1:** Contract `activity.ts` (mirror `distributionTraces.ts`):

```ts
import type { ID, IConversationActivityEvent } from "@/shared/types";

export interface IActivityProvider {
  getCustomerActivity(customerId: ID): Promise<IConversationActivityEvent[]>;
}
```

- [ ] **Step 2:** `contracts/index.ts` — add `export type { IActivityProvider } from "./activity";` and `activity: IActivityProvider;` on `IDataProviders` (next to `distributionTraces`).
- [ ] **Step 3:** Mock impl `impl/mock/activity.ts`:

```ts
import type { IActivityProvider } from "../../contracts/activity";
import { conversationActivityApi } from "@/mocks"; // via the mock barrel, matching distributionTraces mock

export const mockActivityProvider: IActivityProvider = {
  getCustomerActivity: (customerId) => conversationActivityApi.getByCustomer(customerId),
};
```

> Match how `impl/mock/distributionTraces.ts` imports the mock api (barrel vs deep path) — this repo forbids deep `@/mocks/api/*` outside the mock layer, but impl/mock IS allowed; copy its exact import style.

- [ ] **Step 4:** Supabase impl `impl/supabase/activity.ts` (RPC → camelCase mapper):

```ts
import type { ID, IConversationActivityEvent } from "@/shared/types";
import type { IActivityProvider } from "../../contracts/activity";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface ActivityRow {
  id: string; conversation_id: string; customer_id: string | null; lead_id: string | null;
  store_id: string; type: IConversationActivityEvent["type"];
  from_status: string | null; to_status: string | null;
  from_seller_id: string | null; to_seller_id: string | null;
  actor_id: string | null; actor_kind: "seller" | "system"; created_at: string;
  conversation_channel: IConversationActivityEvent["conversationChannel"];
  conversation_status: IConversationActivityEvent["conversationStatus"];
  conversation_created_at: string;
}

function rowToEvent(r: ActivityRow): IConversationActivityEvent {
  return {
    id: r.id, conversationId: r.conversation_id,
    customerId: r.customer_id ?? undefined, leadId: r.lead_id ?? undefined,
    storeId: r.store_id, type: r.type,
    fromStatus: (r.from_status ?? undefined) as IConversationActivityEvent["fromStatus"],
    toStatus: (r.to_status ?? undefined) as IConversationActivityEvent["toStatus"],
    fromSellerId: r.from_seller_id ?? undefined, toSellerId: r.to_seller_id ?? undefined,
    actorId: r.actor_id ?? undefined, actorKind: r.actor_kind, createdAt: r.created_at,
    conversationChannel: r.conversation_channel, conversationStatus: r.conversation_status,
    conversationCreatedAt: r.conversation_created_at,
  };
}

export const supabaseActivityProvider: IActivityProvider = {
  async getCustomerActivity(customerId: ID) {
    const { data, error } = await getSupabaseClient()
      .rpc("get_customer_activity", { p_customer_id: customerId });
    if (error)
      throw new Error(`[supabase] activity.getCustomerActivity(${customerId}) failed: ${error.message}`);
    return (data as ActivityRow[]).map(rowToEvent);
  },
};
```

- [ ] **Step 5:** Hook `hooks/useActivityProvider.ts` (mirror `useDistributionTracesProvider.ts`):

```ts
import type { IActivityProvider } from "../contracts/activity";
import { useDataProviderSlice } from "./_useDataProviderSlice";
export function useActivityProvider(): IActivityProvider {
  return useDataProviderSlice("activity", "useActivityProvider");
}
```

- [ ] **Step 6:** `factory.ts` — 2 imports (mock + supabase, next to `distributionTraces`) and 2 set entries `activity: mockActivityProvider,` / `activity: supabaseActivityProvider,`.
- [ ] **Step 7:** `index.ts` barrel — `export type { IActivityProvider } from "./contracts/activity";` and `export { useActivityProvider } from "./hooks/useActivityProvider";`.
- [ ] **Step 8:** `bun run build` + typecheck. **Commit** — `feat(providers): activity provider (getCustomerActivity)`

---

## Phase 5 — Inbox filter + status action call-sites (Frente 1 frontend)

### Task 10: Esconder resolvida+arquivada do default da Inbox

**Files:**
- Modify: `src/features/conversations/hooks/useInboxFilters.ts` (L288)
- Test: `src/features/conversations/hooks/useInboxFilters.test.ts` (or the co-located filters test)

- [ ] **Step 1: Failing test** — assert `filtersToListParams({...status:"all"})` yields `status = ["aguardando","em_andamento","aguardando_cliente"]` (no `resolvida`); and `status:"resolvida"` passes through unchanged.
- [ ] **Step 2: Implement** — change L288 array to `["aguardando", "em_andamento", "aguardando_cliente"]`. Update the code comment (`defaulting to "all" excludes closed (resolvida + arquivada) conversations`).
- [ ] **Step 3:** Run → PASS. Confirm `VALID_STATUS` and `InboxFilters.tsx` dropdown still list all 5 (no change).
- [ ] **Step 4: Commit** — `feat(inbox): hide closed conversations from the default list`

---

### Task 11: Rotear resolver/arquivar/reabrir por `close()`

**Files:**
- Modify: `src/features/conversations/hooks/useConversationStatusActions.ts`
- Modify: `src/features/conversations/components/ConversationMenu.tsx`
- Modify: `src/features/conversations/components/QuickActions.tsx`

**Interfaces:**
- Consumes: `close()` (Task 7), `coupleManualStatusChange` `'close'` (Task 1).

- [ ] **Step 1:** `useConversationStatusActions.setStatus` — add the `'close'` branch alongside `'assign-self'`/`'unassign'`:

```ts
const decision = coupleManualStatusChange(next, beforeAssignee != null);
// ...
} else if (decision === "close") {
  await conversationsProvider.close(conversation.id, next as "resolvida" | "arquivada");
  afterAssignee = null;
  coupledToast = CONVERSATION_STRINGS.statusControl.closedAndRemoved; // new i18n string
} else if (decision === "unassign") {
  // ...unchanged...
```

Also handle **manual reopen** (unowned terminal → `em_andamento`): `coupleManualStatusChange("em_andamento", false)` already returns `'assign-self'`, which routes through `assignSeller` (assign-self) — no new code, it Just Works via the existing branch. Verify the StatusControl offers `em_andamento` as the reopen target for a terminal conversation.

- [ ] **Step 2:** `ConversationMenu.handleResolveToggle` / `handleArchiveToggle` — the **close direction** (open → `resolvida`/`arquivada`) calls `conversationsProvider.close(id, "resolvida"|"arquivada")` instead of `update`. The **reopen direction** (terminal → `em_andamento`, "Reabrir"/"Desarquivar") must land a valid owned state: call `conversationsProvider.assignSeller(id, currentSellerId)` (assign-self ⇒ `statusOnAssign` won't apply since current is terminal, so also `update({status:"em_andamento"})` — OR reuse `useSelfAssign`). Keep the audit action strings (`conversation.resolve`/`conversation.archive`).

> Simplify by routing both handlers through `useConversationStatusActions.setStatus(next)` instead of bespoke `updateAndAudit`, so the coupling engine drives close/reopen uniformly. Prefer this refactor unless it regresses the undo toast — if undo must be preserved verbatim, keep `updateAndAudit` for the reopen/undo path and only swap the close direction to `close()`.

- [ ] **Step 3:** `QuickActions.handleArchive` — swap `conversationsProvider.update(id, { status: "arquivada" })` → `conversationsProvider.close(id, "arquivada")`. Undo restores via `assignSeller` + prior status (the archive removed the owner; undo must re-own if it was owned — capture `beforeAssignee` and restore it).
- [ ] **Step 4:** Add i18n `CONVERSATION_STRINGS.statusControl.closedAndRemoved` = "Conversa encerrada e removida da lista." (pt-BR).
- [ ] **Step 5:** Update/extend the tests for these hooks/components (mock `close`); run → PASS. `bun run build`.
- [ ] **Step 6: Commit** — `feat(conversations): route resolve/archive through atomic close()`

---

## Phase 6 — Webhook (reabertura em prod)

### Task 12: Reabertura no `whatsapp-webhook`

**Files:**
- Modify: `src/providers/whatsapp/webhook/core.ts` (local `TERMINAL_STATUSES`/`reopenOnInbound`, `IWebhookDb.findOpenConversation` widened, `reopenConversation`, step-6 branch)
- Modify: `supabase/functions/whatsapp-webhook/index.ts` (adapter: `findOpenConversation` without the terminal filter, new `reopenConversation`)
- Modify: `src/providers/whatsapp/webhook/core.test.ts` (terminal fixture + reopen assertions)
- Then: `bun run scripts/sync-whatsapp-shared.ts` + deploy (owner-gated)

- [ ] **Step 1: Failing test** — in `core.test.ts`, add a fake conversation with `status: "resolvida"` returned by `findOpenConversation`; assert that after an inbound event the fake `reopenConversation` was called (status→`aguardando`, owner null, bump) instead of `bumpConversation`, and no new conversation was created.
- [ ] **Step 2:** In `core.ts` add the local predicate (do NOT import from `providers/data`):

```ts
const TERMINAL_STATUSES = new Set(["resolvida", "arquivada"]);
function reopenOnInbound(current: string): "aguardando" | null {
  return TERMINAL_STATUSES.has(current) ? "aguardando" : null;
}
```

- [ ] **Step 3:** Widen `IWebhookDb.findOpenConversation` to `Promise<{ id: string; status: string } | null>`; add `reopenConversation(conversationId: string, lastMessageAt: string): Promise<void>`.
- [ ] **Step 4:** Rewrite step-6 (core.ts ~L655-687) — reuse the latest conversation regardless of status; if terminal, reopen:

```ts
// 6. Conversation resolution — reuse the latest conversation; a closed one is
//    REOPENED on customer inbound (spec 2026-07-03 §1.5).
let conversation = await db.findOpenConversation(customer.id, account.id);
let didReopen = false;
if (!conversation) {
  conversation = await db.createConversation({ /* ...status: "aguardando"... */ });
} else if (reopenOnInbound(conversation.status)) {
  await db.reopenConversation(conversation.id, parsed.timestamp);
  didReopen = true;
}
// ...persist the message...
// step 7 bump: skip if we already reopened (reopenConversation folds the bump in)
if (!didReopen) {
  await db.bumpConversation(conversation.id, parsed.timestamp);
}
```

- [ ] **Step 5:** Edge adapter `index.ts`: (a) `findOpenConversation` — drop the `.not("status","in",...)` filter and `.select("id, status")`, return `{ id, status }`; (b) implement `reopenConversation` as one UPDATE `status='aguardando', assigned_seller_id=null, last_message_at=<ts>, unread_count=unread_count+1, updated_at=now()`. The Task-4 trigger emits the `reopen` activity row (service_role ⇒ `current_seller_id()` null ⇒ `actor_kind='system'`).
- [ ] **Step 6:** Run `core.test.ts` → PASS.
- [ ] **Step 7:** `bun run scripts/sync-whatsapp-shared.ts` (regenerates `supabase/functions/_shared/whatsapp/**`). Verify the mirror updated.
- [ ] **Step 8 (owner-gated):** Deploy `npx supabase functions deploy whatsapp-webhook --project-ref njizaasajkdqptlxddqn`. Confirm with the dono first. Smoke: send a message to a resolved conversation → it returns to the queue as "Em fila".
- [ ] **Step 9: Commit** — `feat(webhook): reopen closed conversations on customer inbound`

---

## Phase 7 — Painel de Histórico (Frente 2)

### Task 13: Engine `attendanceTimeline` (agrupar + fundir + duração + resumo)

**Files:**
- Create: `src/features/attendance-history/engine/attendanceTimeline.ts`
- Test: `src/features/attendance-history/engine/attendanceTimeline.test.ts`

**Interfaces:**
- Consumes: `IConversationActivityEvent`.
- Produces: `buildAttendanceTimeline(events): IConversationTimeline[]` where each conversation group has `{ conversationId, channel, currentStatus, createdAt, nodes: ITimelineNode[], summary: ITimelineSummary }`. `ITimelineNode` = `{ event, durationMs | null }` (duration to next node in the same conversation). `ITimelineSummary` = `{ eventCount, finalSellerId | null, totalDurationMs, transferCount }`.

- [ ] **Step 1: Failing tests** — cover: grouping by `conversationId` (conversations sorted by most-recent activity desc; nodes within a group sorted `createdAt` asc); duration = next node's `createdAt` − this node's (last node → null); summary counts (`transferCount` = events of type `assignment` with a non-null `toSellerId`); `finalSellerId` = the last `toSellerId` seen (or null if closed). Use fixed ISO timestamps (no `Date.now()` in the engine).
- [ ] **Step 2: Implement** the pure functions (no wall-clock; durations from event timestamps only).
- [ ] **Step 3:** Run → PASS. **Commit** — `feat(attendance-history): timeline engine`

---

### Task 14: `AttendanceHistoryPanel` + `useCustomerActivity` + i18n

**Files:**
- Create: `src/features/attendance-history/hooks/useCustomerActivity.ts`
- Create: `src/features/attendance-history/components/AttendanceHistoryPanel.tsx`
- Create: `src/features/attendance-history/i18n/pt-BR.ts`
- Create: `src/features/attendance-history/index.ts` (barrel)

**Interfaces:**
- Consumes: `useActivityProvider` (Task 9), `buildAttendanceTimeline` (Task 13), `STATUS_META` + `CONVERSATION_STRINGS.statusLabel` (from `conversations`), `useSellersProvider` (resolve actor names).
- Produces: `<AttendanceHistoryPanel customerId={ID} open?, onOpenChange? />`.

- [ ] **Step 1:** `useCustomerActivity(customerId)` — TanStack Query, **isolated key** `["customer-activity", customerId]` (never touches the frozen conversation-cache keys); `enabled: !!customerId`.
- [ ] **Step 2:** Panel — implement the approved hybrid (from the visual companion mockup `.superpowers/brainstorm/.../historico-hibrido.html`): collapsible card per conversation (most recent open), connected rail inside (dot colored by `STATUS_META[toStatus].dotClass`, pill via `STATUS_META`, label via `statusLabel`), actor = `actorKind==='system' ? "Sistema" : sellerName(actorId)` (green for Sistema), transfer/assignment lines ("assumiu da fila" / "transferida de X"), reopen tag "↻ reabriu no contato". Collapsed card shows the summary line. Duration rendered from `durationMs` via a `formatDuration` helper (pt-BR: "1d 3h", "2h 10min", "12min").
- [ ] **Step 3:** i18n strings (panel title "Histórico de atendimento", "Sistema", "assumiu da fila", "transferida de {name}", "reabriu no contato", "encerrada · sem dono", summary template).
- [ ] **Step 4:** Component test (render a fixed event set → asserts the grouped cards + one system reopen row). **Commit** — `feat(attendance-history): panel + hook + i18n`

---

### Task 15: Montar o painel (rail do atendimento + aba da ficha)

**Files:**
- Modify: `src/features/conversations/pages/ConversationPage.tsx` (4th exclusive panel `history` + toggles)
- Modify: `src/features/conversations/components/ConversationHeader.tsx` (icon button `mdi:history` + props)
- Modify: `src/features/conversations/i18n/pt-BR.ts` (`toggleHistory`)
- Modify: `src/features/customers/components/ProfileTabs.tsx` (tab `historico`)
- Modify: `src/features/customers/i18n/pt-BR.ts` (`tabs.historico`)

- [ ] **Step 1:** ConversationPage — add `history` panel-open state, `toggleHistoryExclusive` (null out fiche/media/consultor), extend the 3 existing toggles to also null `history`. Mount `{conversation.customerId && <AttendanceHistoryPanel customerId={conversation.customerId} open={history.open} onOpenChange={history.setOpen} />}` next to the other panels. Pass `historyOpen`/`onToggleHistory` to `<ConversationHeader>`.
- [ ] **Step 2:** ConversationHeader — add `historyOpen?`/`onToggleHistory?` props; clone the consultor `<Tooltip><Button…>` block (icon `mdi:history`, label `CONVERSATION_STRINGS.toggleHistory`), placed after it.
- [ ] **Step 3:** ProfileTabs — add `"historico"` to `TabKey`, `TAB_ORDER` (after `atendimento`), `TAB_ICONS` (`mdi:history`), `CUSTOMER_STRINGS.tabs.historico` ("Histórico"). Render `<TabsContent value="historico" className="m-0 p-0 …">{activeString === "historico" && <AttendanceHistoryPanel customerId={customer.id} />}</TabsContent>` cloning the `midias` pattern; import from `@/features/attendance-history`.
- [ ] **Step 4:** `bun run build` + manual smoke (dono testa a UI). **Commit** — `feat(attendance-history): mount panel in conversation rail + customer ficha`

---

## Phase 8 — Backfill

### Task 16: Backfill do histórico a partir do `audit_logs`

**Files:**
- Create: `supabase/migrations/20260703172000_backfill_conversation_activity.sql`

- [ ] **Step 1: Write** (idempotent; best-effort — status transitions only):

```sql
-- Best-effort backfill of past status transitions from audit_logs. Assignment/
-- transfer history and system reopens before this table existed are NOT
-- reconstructable — the timeline is complete only going forward.
insert into public.conversation_activity(
  conversation_id, customer_id, lead_id, store_id, type,
  from_status, to_status, actor_id, actor_kind, created_at)
select
  al.resource_id::uuid, c.customer_id, c.lead_id, c.store_id, 'status',
  (al.before->>'status'), (al.after->>'status'),
  al.actor_id::uuid, 'seller', al."timestamp"
from public.audit_logs al
join public.conversations c on c.id = al.resource_id::uuid
where al.resource = 'conversation'
  and al.action in ('conversation.status_change','conversation.resolve','conversation.archive')
  and (al.after ? 'status')
  and not exists (
    select 1 from public.conversation_activity ca
    where ca.conversation_id = al.resource_id::uuid
      and ca.created_at = al."timestamp"
      and ca.to_status is not distinct from (al.after->>'status')
  );
```

- [ ] **Step 2:** Validate the `audit_logs.actor_id`/`resource_id` casts (text→uuid) on a LIMIT 5 dry-run `select` first; guard against any non-uuid `actor_id` (filter `where al.actor_id ~ '^[0-9a-f-]{36}$'` if needed).
- [ ] **Step 3:** Apply (owner-gated). Spot-check a customer's `get_customer_activity` shows historical rows.
- [ ] **Step 4: Commit** — `feat(db): best-effort backfill of conversation_activity from audit_logs`

---

## Sequenciamento & notas de execução

- **Ordem de tarefas:** 1 (engine coupling) · 3 (tipos) · 2 (engine deriva — importa o tipo do 3) · 4→5 (migrations schema+RPC) · 6→9 (data layer; Task 8 antes de finalizar o `close` do Task 7 se executar estritamente em ordem) · 10→11 (frontend Frente 1) · 12 (webhook) · 13→15 (UI Frente 2) · 16 (backfill).
- **Gates de prod (owner-gated):** Tasks 4, 5, 12 (deploy) e 16 exigem OK do dono; migrations espelhadas em `supabase/migrations/`.
- **Investigar durante a execução (flags do plano):** (a) o accessor de "seller atual" do mock (Task 8 — `null` é aceitável); (b) o nome exato do wrapper `runApi` e dos helpers `newId`/`nowIso` do mock (copiar de `distributionTraces`); (c) se `useConversationStatusActions` já cobre o alvo `em_andamento` como reabertura manual no `StatusControl` (Task 11).
- **Fora de escopo (v1):** reabertura configurável por loja; timeline de leads na UI; métricas sobre a atividade; mensagem de sistema no thread.
