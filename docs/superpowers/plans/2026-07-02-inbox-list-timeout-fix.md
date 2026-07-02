# Inbox List Statement-Timeout Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the intermittent "Não foi possível carregar conversas" error by removing the `count: "exact"` full-set RLS evaluation from the Inbox list hot path (measured: 5.395ms → ~80ms) and hardening the list hook so a single transient failure can no longer hide an already-loaded list.

**Architecture:** The list page fetch stops requesting `count: "exact"` (the 5.3s component that flirts with the 8s `authenticated` statement_timeout). The header total moves to a new cheap SECURITY DEFINER RPC `count_conversations` that expresses the five `can_access_conversation` branches as SET predicates (accessible accounts materialized once — the "gated-once" pattern from `docs/dev/conversation-access-model.md`, applied to counting). The hook gains: foreground/background error split (background failures keep the stale list), one retry on first load, a generation token that discards orphan responses after filter changes, and Sentry capture. `hasMore` switches from `items.length < total` to page-fullness in list mode.

**Tech Stack:** React 19 hook (hand-rolled state — deliberately NOT migrated to TanStack Query to stay surgical), supabase-js PostgREST + RPC, Postgres SQL migration, Vitest for pure engines.

**Diagnostic reference (2026-07-02 session):** production `EXPLAIN ANALYZE` impersonating seller Tiago: full query 5.395ms (count CTE = 5.317ms, page = 78ms); ~16 `canceling statement due to statement timeout` in 8min of peak; paired API-gateway 500 on `GET /rest/v1/conversations` with Tiago's exact Inbox URL. Memory: `project_inbox_list_statement_timeout.md`.

## Global Constraints

- Code identifiers/comments in English; user-facing strings in pt-BR with correct accents (none added by this plan).
- **DO NOT touch** the frozen Atendimento cache layer: media signing batch (#137), realtime channel wiring (`src/shared/lib/realtime.ts`, `useRealtimeConversations.ts`), TanStack query keys, existing gated-once RPCs. This plan only touches the files listed per task.
- `src/routeTree.gen.ts` is generated — never edit.
- No new npm dependencies (bunfig 24h supply-chain guard).
- Migration file is **versioned in the PR but NEVER applied by the executor** — applying to prod happens later via MCP with the owner's explicit OK (project rule).
- CI gate: `bun run test` + `bun run build` (both from the worktree root). `bunx tsc --noEmit` has a pre-existing ~315-error baseline — judge new files by delta only.
- Conventional Commits in English. No version bump in this PR (bump happens on owner request per project rule).
- Working directory: `D:\claude\gallo-basediesel\.claude\worktrees\fix-inbox-list-timeout` (branch `fix/inbox-list-timeout`, baseline 1391 tests green).

---

### Task 1: Migration — `count_conversations` RPC (set-predicate count)

**Files:**
- Create: `supabase/migrations/20260702180000_count_conversations_rpc.sql`

**Interfaces:**
- Consumes: existing helpers `public.current_store_id()`, `public.current_seller_id()`, `public.is_staff()`, `public.current_seller_accessible_account_ids()`, `public.store_allows_participant_cross_instance(uuid)` (all live in prod; definitions verified 2026-07-02).
- Produces: `public.count_conversations(p_status text[], p_channel text, p_whatsapp_account_id uuid, p_is_sdr_active boolean, p_tags text[], p_from_date timestamptz, p_to_date timestamptz, p_assigned_seller_ids uuid[], p_unassigned boolean, p_include_queue boolean) returns bigint` — called by Task 3 via `supabase.rpc("count_conversations", …)`.

There is no local SQL test harness; this task is reviewed by reading and by the paired-count verification script documented in Task 8 (run via MCP only after the owner approves applying the migration). The count returns a number only — a semantic divergence can drift the header count but can never leak row data.

- [ ] **Step 1: Write the migration file**

```sql
-- Fast exact count for the Inbox conversations list (no-search path).
--
-- WHY: PostgREST `count: "exact"` on public.conversations evaluates the
-- per-row RLS gate can_access_conversation(id) over EVERY candidate row on
-- EVERY page fetch. Measured for a non-staff seller (2026-07-02 incident,
-- "Não foi possível carregar conversas"): 5.3s of a 5.4s request was the
-- count CTE alone — intermittently crossing the 8s authenticated
-- statement_timeout under load (Postgres 57014 → PostgREST 500).
--
-- This RPC computes the same total with the access model expressed as SET
-- predicates: the accessible-account set is materialized ONCE and the five
-- can_access_conversation branches (see 20260620120000_access_model_two_gates.sql)
-- become plain predicates over the filtered set — the "gated-once" pattern of
-- docs/dev/conversation-access-model.md applied to counting.
--
-- Scope: mirrors ONLY the Inbox no-search list filters
-- (supabaseConversationsProvider.list). Text search keeps using
-- search_conversations (which already returns total_count). The scalar
-- assignedSellerId/unassigned/customerId/leadId params used by other list
-- callers are NOT mirrored here — those callers keep count:"exact" (cheap on
-- their small, indexed slices).
--
-- SECURITY: SECURITY DEFINER bypasses the per-row policy; the function
-- returns a bare count, so worst-case divergence is a cosmetic header number,
-- never leaked rows. Store-gated via current_store_id() (NULL claims → 0,
-- fail-closed). EXECUTE revoked from public/anon.

create or replace function public.count_conversations(
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_assigned_seller_ids uuid[] default null,
  p_unassigned boolean default false,
  p_include_queue boolean default false
)
returns bigint
language sql
stable
security definer
set search_path to ''
as $$
  with acc as (
    select public.current_seller_accessible_account_ids() as id
  )
  select count(*)
  from public.conversations c
  where c.store_id = public.current_store_id()
    -- filters (mirror supabaseConversationsProvider.list, no-search path)
    and (p_status is null or c.status = any(p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    -- assignmentAny OR-combination (mirror buildAssignmentOrFilter):
    -- no criterion set = "Todas" (no assignment constraint at all)
    and (
      (p_assigned_seller_ids is null and not p_unassigned and not p_include_queue)
      or (p_assigned_seller_ids is not null
          and c.assigned_seller_id = any(p_assigned_seller_ids))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue
          and c.assigned_seller_id is null
          and c.is_sdr_active = false
          and c.status = 'aguardando')
    )
    -- access model: the five can_access_conversation branches as set
    -- predicates (keep in lockstep with 20260620120000 + 20260615130400)
    and (
      public.is_staff()
      or (
        c.assigned_seller_id = public.current_seller_id()
        and (c.whatsapp_account_id is null
             or c.whatsapp_account_id in (select id from acc))
      )
      or (
        exists (
          select 1 from public.conversation_participants p
          where p.conversation_id = c.id
            and p.seller_id = public.current_seller_id()
        )
        and (
          public.store_allows_participant_cross_instance(c.store_id)
          or c.whatsapp_account_id is null
          or c.whatsapp_account_id in (select id from acc)
        )
      )
      or (
        c.assigned_seller_id is null
        and c.whatsapp_account_id is not null
        and c.whatsapp_account_id in (select id from acc)
      )
      or (c.assigned_seller_id is null and c.whatsapp_account_id is null)
    );
$$;

revoke all on function public.count_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean
) from public, anon;

grant execute on function public.count_conversations(
  text[], text, uuid, boolean, text[], timestamptz, timestamptz, uuid[], boolean, boolean
) to authenticated, service_role;
```

- [ ] **Step 2: Sanity-read the file against the five branches of `can_access_conversation`**

Open `supabase/migrations/20260620120000_access_model_two_gates.sql` (function `can_access_conversation`, ~lines 72-118) side by side. Verify each OR branch above matches one branch there (staff / own-assignment+instance / participant / pool-with-accessible-instance / pool-without-instance). This is a read-only check; expected result: 1:1 branch parity.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260702180000_count_conversations_rpc.sql
git commit -m "feat(db): count_conversations RPC - set-predicate exact count for Inbox list"
```

---

### Task 2: Contract — `withTotal` param + `count()` method

**Files:**
- Modify: `src/providers/data/contracts/conversations.ts`

**Interfaces:**
- Produces: `IListConversationsParams.withTotal?: boolean` (consumed by Tasks 3 and 6) and `IConversationsProvider.count(params?: IListConversationsParams): Promise<number>` (implemented in Tasks 3 and 4, consumed in Task 6).

No dedicated test (types only). Note: neither `bun run build` (esbuild — no typecheck) nor Vitest enforces this interface; the type gate is `bunx tsc --noEmit` judged by delta on the touched files (Task 6 Step 2 runs it). Tasks 2, 3 and 4 land as consecutive commits; between them the contract is momentarily wider than the mock impl — harmless, nothing typechecks in CI until the delta check.

- [ ] **Step 1: Add `withTotal` to `IListConversationsParams`**

In `src/providers/data/contracts/conversations.ts`, after the `orderDir?: "asc" | "desc";` line (~line 50), add:

```ts
  /**
   * When `false`, skips the exact total computation and `total` comes back as
   * `-1` (Inbox hot path: PostgREST `count: "exact"` re-evaluates the per-row
   * RLS gate over the WHOLE candidate set on every page — the 2026-07-02
   * statement-timeout incident). Callers that need the real total use
   * `count()` instead. Defaults to `true` (all other callers keep today's
   * behavior).
   */
  withTotal?: boolean;
```

- [ ] **Step 2: Add `count()` to `IConversationsProvider`**

In the same file, inside `interface IConversationsProvider`, right after the `list(...)` line (~line 99), add:

```ts
  /**
   * Exact count of conversations matching the Inbox NO-SEARCH list filters
   * (status/channel/instance/isSdrActive/tags/period/assignmentAny). Cheap by
   * construction on supabase: a SECURITY DEFINER RPC with the access model as
   * set predicates ("gated-once"), instead of the per-row RLS count that
   * `list`'s `count: "exact"` implies. NOT supported with `search`,
   * `customerId`, `leadId`, or the scalar `assignedSellerId`/`unassigned`
   * params — those callers keep using `list`'s total.
   */
  count(params?: IListConversationsParams): Promise<number>;
```

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/contracts/conversations.ts
git commit -m "feat(providers): withTotal param + count() on conversations contract"
```

---

### Task 3: Supabase impl — `buildCountRpcParams` (TDD) + `count()` + conditional exact count

**Files:**
- Create: `src/providers/data/impl/supabase/countRpcParams.ts`
- Create: `src/providers/data/impl/supabase/countRpcParams.test.ts`
- Modify: `src/providers/data/impl/supabase/conversations.ts` (list `select` call ~line 274, return `total` ~line 320, new `count` method after `list`)

**Interfaces:**
- Consumes: `IListConversationsParams` + `withTotal` (Task 2), `sanitizeSellerIds` from `./assignmentFilter`.
- Produces: `buildCountRpcParams(params: IListConversationsParams): ICountConversationsRpcParams` (exact RPC arg shape of Task 1) and `supabaseConversationsProvider.count(params)`.

- [ ] **Step 1: Write the failing test**

Create `src/providers/data/impl/supabase/countRpcParams.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCountRpcParams } from "./countRpcParams";

describe("buildCountRpcParams", () => {
  it("maps the empty param set to all-null/false RPC args (Todas)", () => {
    expect(buildCountRpcParams({})).toEqual({
      p_status: null,
      p_channel: null,
      p_whatsapp_account_id: null,
      p_is_sdr_active: null,
      p_tags: null,
      p_from_date: null,
      p_to_date: null,
      p_assigned_seller_ids: null,
      p_unassigned: false,
      p_include_queue: false,
    });
  });

  it("normalizes a scalar status to a single-element array", () => {
    expect(buildCountRpcParams({ status: "aguardando" }).p_status).toEqual(["aguardando"]);
  });

  it("passes a status array through unchanged", () => {
    expect(
      buildCountRpcParams({
        status: ["aguardando", "em_andamento", "aguardando_cliente", "resolvida"],
      }).p_status,
    ).toEqual(["aguardando", "em_andamento", "aguardando_cliente", "resolvida"]);
  });

  it("maps the Inbox incident filter shape (me + unassigned + queue)", () => {
    const params = buildCountRpcParams({
      status: ["aguardando", "em_andamento", "aguardando_cliente", "resolvida"],
      assignmentAny: {
        sellerIds: ["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"],
        unassigned: true,
        queue: true,
      },
    });
    expect(params.p_assigned_seller_ids).toEqual(["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"]);
    expect(params.p_unassigned).toBe(true);
    expect(params.p_include_queue).toBe(true);
  });

  it("drops malformed seller ids (same sanitization as the .or() filter)", () => {
    const params = buildCountRpcParams({
      assignmentAny: { sellerIds: ["not-a-uuid", "97834e8d-e1b5-4bb7-9f25-2e58e641fdab"] },
    });
    expect(params.p_assigned_seller_ids).toEqual(["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"]);
  });

  it("maps channel/instance/sdr/tags/period filters", () => {
    expect(
      buildCountRpcParams({
        channel: "whatsapp",
        whatsappAccountId: "0f0e0d0c-0b0a-0908-0706-050403020100",
        isSdrActive: false,
        tags: ["vip"],
        fromDate: "2026-07-01T00:00:00.000Z",
        toDate: "2026-07-02T00:00:00.000Z",
      }),
    ).toEqual({
      p_status: null,
      p_channel: "whatsapp",
      p_whatsapp_account_id: "0f0e0d0c-0b0a-0908-0706-050403020100",
      p_is_sdr_active: false,
      p_tags: ["vip"],
      p_from_date: "2026-07-01T00:00:00.000Z",
      p_to_date: "2026-07-02T00:00:00.000Z",
      p_assigned_seller_ids: null,
      p_unassigned: false,
      p_include_queue: false,
    });
  });

  it("rejects params the RPC does not mirror (fail-fast, not silent drift)", () => {
    expect(() => buildCountRpcParams({ search: "volvo" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ customerId: "c1" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ leadId: "l1" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ assignedSellerId: "s1" })).toThrow(/no-search/);
    expect(() => buildCountRpcParams({ unassigned: true })).toThrow(/no-search/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test countRpcParams`
Expected: FAIL — `Cannot find module './countRpcParams'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `src/providers/data/impl/supabase/countRpcParams.ts`:

```ts
import type { IListConversationsParams } from "../../contracts/conversations";
import { sanitizeSellerIds } from "./assignmentFilter";

/** Exact argument shape of the `count_conversations` RPC (migration 20260702180000). */
export interface ICountConversationsRpcParams {
  p_status: string[] | null;
  p_channel: string | null;
  p_whatsapp_account_id: string | null;
  p_is_sdr_active: boolean | null;
  p_tags: string[] | null;
  p_from_date: string | null;
  p_to_date: string | null;
  p_assigned_seller_ids: string[] | null;
  p_unassigned: boolean;
  p_include_queue: boolean;
}

/**
 * Translate Inbox list params into `count_conversations` RPC args.
 *
 * The RPC mirrors ONLY the Inbox no-search list path. Params outside that
 * path (`search`, `customerId`, `leadId`, scalar `assignedSellerId`/
 * `unassigned`) would be silently ignored by the RPC and return a wrong
 * total — throw instead so a future caller fails loudly at dev time.
 */
export function buildCountRpcParams(
  params: IListConversationsParams,
): ICountConversationsRpcParams {
  if (
    params.search !== undefined ||
    params.customerId !== undefined ||
    params.leadId !== undefined ||
    params.assignedSellerId !== undefined ||
    params.unassigned !== undefined
  ) {
    throw new Error(
      "[supabase] conversations.count supports the Inbox no-search list path only " +
        "(got search/customerId/leadId/assignedSellerId/unassigned)",
    );
  }

  const sellerIds = sanitizeSellerIds(params.assignmentAny?.sellerIds);

  return {
    p_status:
      params.status === undefined
        ? null
        : Array.isArray(params.status)
          ? params.status
          : [params.status],
    p_channel: params.channel ?? null,
    p_whatsapp_account_id: params.whatsappAccountId ?? null,
    p_is_sdr_active: typeof params.isSdrActive === "boolean" ? params.isSdrActive : null,
    p_tags: params.tags && params.tags.length > 0 ? params.tags : null,
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? null,
    p_assigned_seller_ids: sellerIds.length > 0 ? sellerIds : null,
    p_unassigned: params.assignmentAny?.unassigned === true,
    p_include_queue: params.assignmentAny?.queue === true,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test countRpcParams`
Expected: PASS (7 tests).

- [ ] **Step 5: Make the exact count conditional in `list()` and add `count()`**

In `src/providers/data/impl/supabase/conversations.ts`:

(a) Add the import at the top of the file, next to the existing `./assignmentFilter` import:

```ts
import { buildCountRpcParams } from "./countRpcParams";
```

(b) Replace the current line ~274:

```ts
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
```

with:

```ts
    // `count: "exact"` re-runs the per-row RLS gate (can_access_conversation)
    // over the WHOLE candidate set on every page fetch — 5.3s of a 5.4s
    // request for a non-staff seller (2026-07-02 statement-timeout incident).
    // The Inbox opts out via `withTotal: false` and reads the total from
    // `count()` instead; every other caller keeps the exact count.
    const wantTotal = params.withTotal !== false;
    let query = wantTotal
      ? getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" })
      : getSupabaseClient().from(TABLE).select(COLUMNS);
```

(c) Replace the return's total line (~line 320) `total: count ?? 0,` with:

```ts
      total: wantTotal ? (count ?? 0) : -1,
```

(d) Add the `count` method to `supabaseConversationsProvider`, right after the `list` method's closing `},`:

```ts
  async count(params: IListConversationsParams = {}): Promise<number> {
    const { data, error } = await getSupabaseClient().rpc(
      "count_conversations",
      buildCountRpcParams(params),
    );
    if (error) throw new Error(`[supabase] conversations.count failed: ${error.message}`);
    return Number(data ?? 0);
  },
```

- [ ] **Step 6: Run the full test suite**

Run: `bun run test`
Expected: PASS (1391 + 7 new = 1398 tests). The build still fails typecheck-wise for the mock impl (misses `count`) — that is Task 4; Vitest does not typecheck, so the suite is green.

- [ ] **Step 7: Commit**

```bash
git add src/providers/data/impl/supabase/countRpcParams.ts src/providers/data/impl/supabase/countRpcParams.test.ts src/providers/data/impl/supabase/conversations.ts
git commit -m "feat(providers): supabase conversations.count via RPC + opt-out of exact count"
```

---

### Task 4: Mock impl — `count()`

**Files:**
- Modify: `src/providers/data/impl/mock/conversations.ts`

**Interfaces:**
- Consumes: contract `count()` (Task 2); reuses the provider's own `list` (which already applies store scoping + assignmentAny semantics).
- Produces: `mockConversationsProvider.count(params)` — behavioral parity with the supabase path for the Inbox caller.

Thin delegation (3 lines) — no dedicated test: importing `@/mocks` in a unit test drags the faker bootstrap + zustand store side effects; the wrapper is covered by `bun run build` typing and by the mock-mode smoke. The real behavior (filter → total) is already exercised by `conversationsApi.list`'s existing coverage.

- [ ] **Step 1: Add the `count` method**

In `src/providers/data/impl/mock/conversations.ts`, right after the `list:` entry (~line 24), add:

```ts
  count: async (params) => {
    // Mock data is in-memory and cheap — reuse list()'s scoping/filtering and
    // read its total instead of duplicating the filter logic here.
    const result = await mockConversationsProvider.list({
      ...(params ?? {}),
      page: 1,
      pageSize: 1,
    });
    return result.total;
  },
```

- [ ] **Step 2: Run build + tests**

Run: `bun run build && bun run test`
Expected: build PASS, tests PASS (1398). Type parity of both impls with the new contract is verified by the delta `tsc` check in Task 6 Step 2.

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/mock/conversations.ts
git commit -m "feat(providers): mock conversations.count delegating to list total"
```

---

### Task 5: Pure engine — list fetch policy (TDD)

**Files:**
- Create: `src/features/conversations/engine/listFetchPolicy.ts`
- Create: `src/features/conversations/engine/listFetchPolicy.test.ts`

**Interfaces:**
- Produces (consumed by Task 6):
  - `type ListFetchMode = "replace" | "append"`
  - `resolveListFetchFailure(input: { fetchMode: ListFetchMode; hasItems: boolean }): "surface" | "silent"`
  - `shouldRetryListFetch(input: { fetchMode: ListFetchMode; hasItems: boolean; attempt: number }): boolean`
  - `nextHasMore(rawPageLength: number, pageSize: number): boolean`
  - `INITIAL_LOAD_MAX_ATTEMPTS = 2`, `INITIAL_LOAD_RETRY_DELAY_MS = 400`

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/listFetchPolicy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  INITIAL_LOAD_MAX_ATTEMPTS,
  nextHasMore,
  resolveListFetchFailure,
  shouldRetryListFetch,
} from "./listFetchPolicy";

describe("resolveListFetchFailure", () => {
  it("surfaces the error panel only when a replace fails with nothing on screen", () => {
    expect(resolveListFetchFailure({ fetchMode: "replace", hasItems: false })).toBe("surface");
  });

  it("keeps the stale list when a background replace fails with items on screen", () => {
    // The 2026-07-02 incident: a realtime-tick refetch failed and hid 30 loaded
    // rows behind the error panel. Background failures must stay silent.
    expect(resolveListFetchFailure({ fetchMode: "replace", hasItems: true })).toBe("silent");
  });

  it("never surfaces append (infinite-scroll / re-hydration) failures", () => {
    expect(resolveListFetchFailure({ fetchMode: "append", hasItems: false })).toBe("silent");
    expect(resolveListFetchFailure({ fetchMode: "append", hasItems: true })).toBe("silent");
  });
});

describe("shouldRetryListFetch", () => {
  it("retries the first load once (attempt 1 of max 2)", () => {
    expect(shouldRetryListFetch({ fetchMode: "replace", hasItems: false, attempt: 1 })).toBe(true);
  });

  it("stops after the retry budget", () => {
    expect(
      shouldRetryListFetch({
        fetchMode: "replace",
        hasItems: false,
        attempt: INITIAL_LOAD_MAX_ATTEMPTS,
      }),
    ).toBe(false);
  });

  it("does not retry background refetches — the next realtime tick is the retry", () => {
    expect(shouldRetryListFetch({ fetchMode: "replace", hasItems: true, attempt: 1 })).toBe(false);
  });

  it("does not retry appends", () => {
    expect(shouldRetryListFetch({ fetchMode: "append", hasItems: false, attempt: 1 })).toBe(false);
  });
});

describe("nextHasMore", () => {
  it("a full page means there may be more", () => {
    expect(nextHasMore(30, 30)).toBe(true);
  });

  it("a short page means the end was reached", () => {
    expect(nextHasMore(12, 30)).toBe(false);
    expect(nextHasMore(0, 30)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test listFetchPolicy`
Expected: FAIL — cannot resolve `./listFetchPolicy`.

- [ ] **Step 3: Write the implementation**

Create `src/features/conversations/engine/listFetchPolicy.ts`:

```ts
/**
 * Pure decision rules for the Inbox conversations-list fetch lifecycle
 * (consumed by useConversationsList).
 *
 * Context (2026-07-02 incident): the hook had a single error state with no
 * retry — ANY failed fetch (including invisible realtime-tick re-hydrations)
 * replaced an already-loaded list with the full-panel error. These rules keep
 * the panel reserved for "we have nothing to show", make the first load retry
 * once, and derive pagination from page fullness instead of a server total.
 */

export type ListFetchMode = "replace" | "append";

export type ListFailureAction = "surface" | "silent";

/** First load (empty screen) gets 1 retry; everything else fails silently. */
export const INITIAL_LOAD_MAX_ATTEMPTS = 2;

/** Delay between first-load attempts — long enough to skip a transient blip. */
export const INITIAL_LOAD_RETRY_DELAY_MS = 400;

/**
 * Whether a failed fetch should surface the full error panel or keep the
 * current (stale) list on screen. Only a replace that leaves the user with
 * an empty screen deserves the panel.
 */
export function resolveListFetchFailure(input: {
  fetchMode: ListFetchMode;
  hasItems: boolean;
}): ListFailureAction {
  return input.fetchMode === "replace" && !input.hasItems ? "surface" : "silent";
}

/**
 * Retry only the visible first load. Background refetches self-heal on the
 * next realtime tick, and retrying them would amplify load storms — the very
 * condition that triggers the server-side timeout.
 */
export function shouldRetryListFetch(input: {
  fetchMode: ListFetchMode;
  hasItems: boolean;
  attempt: number;
}): boolean {
  return (
    input.fetchMode === "replace" &&
    !input.hasItems &&
    input.attempt < INITIAL_LOAD_MAX_ATTEMPTS
  );
}

/**
 * Cursor-style hasMore: a full raw page (before id-dedup) means there may be
 * another one. Replaces `items.length < total` so pagination no longer
 * depends on the exact server total.
 */
export function nextHasMore(rawPageLength: number, pageSize: number): boolean {
  return rawPageLength >= pageSize;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test listFetchPolicy`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/listFetchPolicy.ts src/features/conversations/engine/listFetchPolicy.test.ts
git commit -m "feat(conversations): pure fetch policy engine for the Inbox list"
```

---

### Task 6: Hook — integrate policy, count, generation token, Sentry

**Files:**
- Modify: `src/features/conversations/hooks/useConversationsList.ts` (full-file rewrite below)

**Interfaces:**
- Consumes: Task 5 engine, `provider.count` (Tasks 3-4), `withTotal` (Task 2), `captureObservabilityException(error, context?)` from `@/shared/lib/observability`.
- Produces: same public `IConversationsListState` shape — no consumer signature changes. Behavior changes only: (a) `error` is set exclusively by a failed replace with an empty list; (b) `total` in list mode comes from `provider.count` (async, cosmetic — header may show the previous value for ~100ms); (c) `hasMore` in list mode derives from page fullness; message-search mode keeps using the RPC's total.

- [ ] **Step 1: Rewrite the hook**

Replace the entire content of `src/features/conversations/hooks/useConversationsList.ts` with:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ID, IConversation } from "@/shared/types";
import { useConversationsProvider, type IListConversationsParams } from "@/providers/data";
import { captureObservabilityException } from "@/shared/lib/observability";
import {
  INITIAL_LOAD_RETRY_DELAY_MS,
  nextHasMore,
  resolveListFetchFailure,
  shouldRetryListFetch,
  type ListFetchMode,
} from "../engine/listFetchPolicy";

/** Conversations pulled per page from the provider. */
export const PAGE_SIZE = 30;

/** Debounce window collapsing a burst of realtime ticks into a single refetch. */
const REALTIME_REFETCH_DEBOUNCE_MS = 300;

export interface IConversationsListState {
  items: IConversation[];
  total: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => void;
  refetch: () => void;
  /**
   * Optimistically zero an item's unread counter (the red badge) in place,
   * without a refetch. Used when a conversation is opened so the badge clears
   * instantly; the authoritative reset is persisted by the caller via the
   * provider's `markRead`. No-ops if the item is absent or already at 0.
   */
  markItemRead: (id: ID) => void;
}

export interface IUseConversationsListOptions {
  /** Optional bump key — when it changes, page 1 is refetched in place. */
  refreshKey?: number;
  /**
   * "messages" routes every fetch through `provider.searchMessages` instead of
   * `provider.list` — the dedicated "search inside messages" action (Opção D).
   * Defaults to "list".
   */
  mode?: "list" | "messages";
}

/**
 * Fetch conversations with cursor-style pagination on top of `provider.list`.
 *
 * Re-fetches the first page whenever filters change or `refreshKey` bumps
 * (the latter is driven by `useRealtimeConversations` to keep the list in
 * sync with inbound traffic). On filter change, both pagination state and the
 * items array reset.
 *
 * Error/pagination policy lives in `../engine/listFetchPolicy` (2026-07-02
 * statement-timeout incident): the error panel is reserved for a failed
 * replace with an EMPTY list — background failures keep the stale rows and
 * are reported to Sentry; the first load retries once. In list mode the
 * fetch opts out of the exact count (`withTotal: false` — the expensive
 * per-row-RLS count) and the header total comes from `provider.count`
 * asynchronously; hasMore derives from page fullness. Message-search mode
 * keeps the RPC-provided total.
 *
 * A generation token (bumped on filter/mode change) discards responses from
 * superseded fetches, so a slow orphan can no longer overwrite the state of
 * the current view.
 *
 * Loaded pages are concatenated; duplicates are de-deduped by id so a slow
 * real-time refresh that races with `loadMore` cannot show the same row
 * twice.
 */
export function useConversationsList(
  filters: IListConversationsParams,
  options: IUseConversationsListOptions = {},
): IConversationsListState {
  const provider = useConversationsProvider();

  const [items, setItems] = useState<IConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [listHasMore, setListHasMore] = useState(false);

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);
  const refreshKey = options.refreshKey ?? 0;
  const mode = options.mode ?? "list";
  const pageRef = useRef(page);
  pageRef.current = page;

  // Mirrors `items` for reads inside async callbacks without re-creating them.
  const itemsRef = useRef<IConversation[]>([]);
  itemsRef.current = items;

  // Bumped on every filter/mode change; fetches launched under an older
  // generation discard their response instead of touching state.
  const generationRef = useRef(0);

  /**
   * Refresh the header total via the cheap gated-once count RPC. Fire-and-
   * forget: the total is cosmetic, so a failure must never surface — it is
   * logged and the previous value stays.
   */
  const refreshTotal = useCallback(
    (generation: number) => {
      provider
        .count(filters)
        .then((value) => {
          if (generation !== generationRef.current) return;
          setTotal(value);
        })
        .catch((err) => {
          captureObservabilityException(err, { source: "useConversationsList.count" });
        });
    },
    // We intentionally key on the JSON snapshot to avoid noisy re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, filtersKey],
  );

  const fetchPage = useCallback(
    async (pageToLoad: number, fetchMode: ListFetchMode) => {
      const generation = generationRef.current;
      if (fetchMode === "replace") setIsLoading(true);
      else setIsLoadingMore(true);
      try {
        for (let attempt = 1; ; attempt += 1) {
          try {
            const fetcher = mode === "messages" ? provider.searchMessages : provider.list;
            const result = await fetcher({
              ...filters,
              page: pageToLoad,
              pageSize: PAGE_SIZE,
              // List mode skips the exact count — the per-row-RLS total was
              // the 5.3s/8s statement-timeout component of the incident.
              ...(mode === "list" ? { withTotal: false } : {}),
            });
            if (generation !== generationRef.current) return;
            setError(null);
            if (mode === "messages") {
              setTotal(result.total);
            } else {
              setListHasMore(nextHasMore(result.data.length, PAGE_SIZE));
              if (fetchMode === "replace" && pageToLoad === 1) refreshTotal(generation);
            }
            if (fetchMode === "replace") {
              setItems(result.data);
            } else {
              setItems((prev) => {
                const seen = new Set(prev.map((c) => c.id));
                return [...prev, ...result.data.filter((c) => !seen.has(c.id))];
              });
            }
            return;
          } catch (err) {
            if (generation !== generationRef.current) return;
            const failure = err instanceof Error ? err : new Error(String(err));
            const hasItems = itemsRef.current.length > 0;
            captureObservabilityException(failure, {
              source: "useConversationsList",
              mode,
              fetchMode,
              page: pageToLoad,
              attempt,
            });
            if (shouldRetryListFetch({ fetchMode, hasItems, attempt })) {
              await new Promise((resolve) =>
                window.setTimeout(resolve, INITIAL_LOAD_RETRY_DELAY_MS),
              );
              continue;
            }
            if (resolveListFetchFailure({ fetchMode, hasItems }) === "surface") {
              setError(failure);
            }
            return;
          }
        }
      } finally {
        // A newer generation owns the loading flags now — don't clobber them.
        if (generation === generationRef.current) {
          if (fetchMode === "replace") setIsLoading(false);
          else setIsLoadingMore(false);
        }
      }
    },
    // We intentionally key on the JSON snapshot to avoid noisy re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [provider, filtersKey, mode, refreshTotal],
  );

  // Reset to page 1 whenever filters change OR the fetch mode flips
  // (list ↔ messages — see Opção D's "search inside messages" toggle).
  // Clearing `items` synchronously (not just waiting for the fetch to resolve)
  // matters specifically for the mode flip: list-mode and messages-mode rows
  // render differently (matchedMessage snippet vs. last-message preview), so
  // leaving the previous mode's rows on screen during the fetch window shows
  // them under the WRONG mode's chrome (e.g. plain rows under the "resultados
  // em mensagens" banner).
  useEffect(() => {
    generationRef.current += 1;
    setPage(1);
    setItems([]);
    itemsRef.current = [];
    setError(null);
    setListHasMore(false);
    void fetchPage(1, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, mode]);

  // External refresh signal — debounced so a burst of realtime events collapses
  // into a single refetch (~300ms after the last one) instead of N sequential
  // reloads. Fetches back up to the current page so the user doesn't lose
  // pagination progress while real-time pulls in new rows.
  useEffect(() => {
    if (refreshKey === 0) return;
    const handle = window.setTimeout(() => {
      const target = pageRef.current;
      void fetchPage(1, "replace").then(() => {
        // Re-hydrate higher pages sequentially.
        let chain: Promise<void> = Promise.resolve();
        for (let p = 2; p <= target; p += 1) {
          const captured = p;
          chain = chain.then(() => fetchPage(captured, "append"));
        }
        return chain;
      });
    }, REALTIME_REFETCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const hasMore = mode === "messages" ? items.length < total : listHasMore;

  const loadMore = useCallback(() => {
    if (isLoading || isLoadingMore) return;
    if (!hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    void fetchPage(nextPage, "append");
  }, [isLoading, isLoadingMore, hasMore, page, fetchPage]);

  const refetch = useCallback(() => {
    setPage(1);
    void fetchPage(1, "replace");
  }, [fetchPage]);

  const markItemRead = useCallback((id: ID) => {
    setItems((prev) =>
      prev.map((c) => (c.id === id && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  return {
    items,
    total,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refetch,
    markItemRead,
  };
}
```

- [ ] **Step 2: Run build + full suite**

Run: `bun run build && bun run test`
Expected: both PASS. Also run `bunx tsc --noEmit 2>&1 | grep -E "useConversationsList|listFetchPolicy|countRpcParams|conversations.ts"` — expected: no new errors from the touched files (baseline noise elsewhere is pre-existing).

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/hooks/useConversationsList.ts
git commit -m "fix(conversations): fg/bg error split, retry, generation token and async total on the Inbox list"
```

---

### Task 7: InboxPage — gate the pagination sentinel on `!error`

**Files:**
- Modify: `src/features/conversations/pages/InboxPage.tsx` (~line 466)

**Interfaces:**
- Consumes: `error`/`hasMore` from the hook (unchanged shape).

With Task 6, `error` only coexists with an empty list — but the sentinel block is still the only list-column block not gated on `!error` (the screenshot's "erro + Carregando mais…" hybrid). Gate it for belt-and-suspenders and to stop the IntersectionObserver from auto-firing `loadMore` under the error panel.

- [ ] **Step 1: Add the gate**

In `src/features/conversations/pages/InboxPage.tsx`, change line ~466 from:

```tsx
          {hasMore && (
```

to:

```tsx
          {!error && hasMore && (
```

- [ ] **Step 2: Run build + tests**

Run: `bun run build && bun run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/pages/InboxPage.tsx
git commit -m "fix(conversations): hide load-more sentinel while the list error panel is up"
```

---

### Task 8: Docs, verification script, push + PR

**Files:**
- Modify: `docs/dev/conversation-access-model.md` (append one section)
- Create: `docs/dev/sql/verify-count-conversations.sql` (paired-count verification, run-by-hand)

- [ ] **Step 1: Append the doc section**

At the end of `docs/dev/conversation-access-model.md`, add:

```markdown
## Listagem da Inbox (2026-07-02 — fix do statement timeout)

A query principal da lista era a última leitura escopada ainda em SELECT
direto com `count: "exact"` sob a RLS por-linha — o count reavaliava
`can_access_conversation(id)` sobre TODO o conjunto candidato a cada página
(medido: 5,3s dos 5,4s da request de um não-staff; teto de 8s do papel
`authenticated`). O caminho quente agora usa `withTotal: false` (sem count) e
o total do header vem da RPC `count_conversations` (migration
`20260702180000`), que expressa os 5 ramos do `can_access_conversation` como
predicados de conjunto — contas acessíveis materializadas 1x (padrão
gated-once aplicado à contagem). ⚠️ Se os ramos da função mudarem, a RPC de
count PRECISA acompanhar (paridade verificável com
`docs/dev/sql/verify-count-conversations.sql`).

No frontend (`useConversationsList` + `engine/listFetchPolicy.ts`): o painel
de erro ficou reservado para "replace falhou com lista vazia"; falhas de
background mantêm a lista stale e vão para o Sentry; primeira carga tem 1
retry; `hasMore` deriva de página cheia; um token de geração descarta
respostas órfãs de filtros antigos.
```

- [ ] **Step 2: Write the verification script**

Create `docs/dev/sql/verify-count-conversations.sql`:

```sql
-- Paired-count parity check for count_conversations (migration 20260702180000).
-- Run via MCP (postgres role) AFTER the migration is applied, once per persona.
-- For each persona: simulate the JWT claims, then compare the RLS-visible
-- count (per-row can_access_conversation — slow but authoritative) with the
-- RPC's set-predicate count. `match` must be true for every filter shape.
--
-- Replace the claims below per persona (owner / seller_internal e.g. tiago).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object(
  'sub', '5e38abb6-abcd-4e4d-838a-867078e99892',
  'role', 'authenticated',
  'app_metadata', json_build_object(
    'seller_id', '97834e8d-e1b5-4bb7-9f25-2e58e641fdab',
    'store_id', '00000000-0000-0000-0000-000000000001',
    'role', 'seller_internal'
  )
)::text, true);
set local statement_timeout = '120s';

with shapes as (
  select * from (values
    -- (label, status[], seller_ids uuid[], unassigned, queue)
    ('todas-exceto-arquivadas',
      array['aguardando','em_andamento','aguardando_cliente','resolvida'],
      null::uuid[], false, false),
    ('incidente: me+unassigned+queue',
      array['aguardando','em_andamento','aguardando_cliente','resolvida'],
      array['97834e8d-e1b5-4bb7-9f25-2e58e641fdab']::uuid[], true, true),
    ('so-fila', array['aguardando'], null::uuid[], false, true)
  ) as t(label, p_status, p_seller_ids, p_unassigned, p_queue)
)
select
  s.label,
  (select count(*) from public.conversations c
    where c.status = any(s.p_status)
      and (
        (s.p_seller_ids is null and not s.p_unassigned and not s.p_queue)
        or (s.p_seller_ids is not null and c.assigned_seller_id = any(s.p_seller_ids))
        or (s.p_unassigned and c.assigned_seller_id is null)
        or (s.p_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
      )
  ) as rls_count,
  public.count_conversations(
    p_status => s.p_status,
    p_assigned_seller_ids => s.p_seller_ids,
    p_unassigned => s.p_unassigned,
    p_include_queue => s.p_queue
  ) as rpc_count,
  (select count(*) from public.conversations c
    where c.status = any(s.p_status)
      and (
        (s.p_seller_ids is null and not s.p_unassigned and not s.p_queue)
        or (s.p_seller_ids is not null and c.assigned_seller_id = any(s.p_seller_ids))
        or (s.p_unassigned and c.assigned_seller_id is null)
        or (s.p_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
      )
  ) = public.count_conversations(
    p_status => s.p_status,
    p_assigned_seller_ids => s.p_seller_ids,
    p_unassigned => s.p_unassigned,
    p_include_queue => s.p_queue
  ) as match
from shapes s;
```

- [ ] **Step 3: Final gates**

Run: `bun run test` → expected 1407 tests PASS (1391 baseline + 7 countRpcParams + 9 listFetchPolicy).
Run: `bun run build` → expected PASS.

- [ ] **Step 4: Commit docs**

```bash
git add docs/dev/conversation-access-model.md docs/dev/sql/verify-count-conversations.sql
git commit -m "docs: Inbox list timeout fix - access-model note + count parity verification script"
```

- [ ] **Step 5: Push and open the PR (NO merge — owner reviews)**

```bash
git push -u origin fix/inbox-list-timeout
gh pr create --title "fix(conversations): eliminate Inbox list statement timeout (count exact + per-row RLS)" --body "$(cat <<'EOF'
## Problema
Erro intermitente "Não foi possível carregar conversas" para usuários não-staff (incidente tiago, 2026-07-02). Causa raiz medida em prod: a listagem usa `count: "exact"` sob RLS por-linha (`can_access_conversation` por conversa) — 5,3s dos 5,4s da request só no count, estourando o `statement_timeout` de 8s sob carga (57014 → PostgREST 500). No front, o hook sem retry escondia a lista carregada a cada falha de background (ticks do Realtime).

## Correção
- **DB:** RPC `count_conversations` (SECURITY DEFINER, gated-once): os 5 ramos do `can_access_conversation` como predicados de conjunto; migration `20260702180000` (⚠️ versionada — NÃO aplicada; aplicar via MCP com OK antes do smoke).
- **Provider:** `list({ withTotal: false })` no caminho quente da Inbox (sem count exact) + `conversations.count()` novo; mock com paridade.
- **Hook:** painel de erro só para "replace falhou com lista vazia"; falhas de background mantêm a lista stale + Sentry; 1 retry na primeira carga; token de geração descarta respostas órfãs; `hasMore` por página cheia; total assíncrono via count RPC.
- **UI:** sentinel "Carregando mais…" gated por `!error`.
- **Docs:** seção no `conversation-access-model.md` + script de paridade `verify-count-conversations.sql`.

## Validação
- `bun run test` (1407) e `bun run build` verdes.
- Pós-migration (gate do dono): rodar `docs/dev/sql/verify-count-conversations.sql` via MCP (paridade RLS × RPC por persona) e `EXPLAIN ANALYZE` comparativo como o tiago (esperado: ~5.400ms → <150ms).
- Smoke manual do dono: Inbox como vendedor não-staff com filtro "minhas + sem atribuição + fila" durante horário de pico.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Rollout order (owner gates — NOT executor steps)

1. PR review + merge (owner decides).
2. Apply migration `20260702180000` via MCP (owner OK required).
3. Run `docs/dev/sql/verify-count-conversations.sql` via MCP — all `match = true`.
4. `EXPLAIN ANALYZE` the old list query impersonating tiago (before/after comparison).
5. Deploy (Vercel picks up main) → owner smoke as non-staff seller.
6. Watch `get_logs(postgres)` for `canceling statement due to statement timeout` — expected to drop to ~zero for the list path.

## Explicit non-goals (follow-ups, own PRs)

- `search_conversations` / `search_conversation_messages` still evaluate `can_access_conversation` per row (same anti-pattern, lower frequency) — candidate for the same set-predicate treatment.
- Webhook audit rows silently dropped (`actor_id: "integration:whatsapp-webhook"` into a uuid FK column — `supabase/functions/whatsapp-webhook/index.ts:438`).
- Migrating `useConversationsList` to TanStack `useInfiniteQuery` (deliberately avoided here to stay surgical around the frozen cache layer).
- Realtime tick storm shaping (debounce is 300ms; each tick still re-hydrates pages 1..N — now cheap, but coalescing would reduce load further).
- Error-class-aware copy: the panel still says "Verifique sua conexão" for any failure class. With the fg/bg split it only shows on a failed empty first load, so the misleading copy loses most of its bite; differentiating timeout/5xx/offline copy is a UX follow-up.
