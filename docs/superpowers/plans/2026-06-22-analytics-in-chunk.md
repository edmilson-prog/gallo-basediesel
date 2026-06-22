# Analytics `.in()` chunk + realtime debounce (messages-400) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the `400 Bad Request` storm on `/rest/v1/messages?...conversation_id=in.(…)` by chunking the unbounded `.in()` in `listForAnalytics`, and stop the realtime amplification by trailing-debouncing the dashboard's refetch.

**Architecture:** Add a generic pure `chunk<T>` util (TDD). Rewrite `listForAnalytics` to split the `conversation_id` id set into ≤120-id batches, run them in parallel (`Promise.all`, fail-fast), then concat + re-sort by `sent_at` ascending (chunks are disjoint by `conversation_id` ⇒ exactly-once). Add a 1500 ms trailing debounce to the `refreshKey` effect in `useDashboardSnapshot`, calling an always-fresh `fetchRef` to avoid stale-param refetches.

**Tech Stack:** TypeScript (strict), React 19, TanStack Query, `@supabase/supabase-js` (postgrest-js), Vitest, bun.

**Spec:** `docs/superpowers/specs/2026-06-22-analytics-in-chunk-design.md`

## Global Constraints

- Comments/identifiers in **English**; no user-facing strings touched (no pt-BR copy in scope).
- TypeScript `strict`; avoid `any` — match the file's existing `as unknown as MessageRow[]` cast style.
- **Conventional Commits** in English, atomic, one per task.
- **Do NOT** touch `can_access_conversation` / `messages_select` / any Turnstile RPC. **No** migration, **no** RLS, **no** webhook change.
- **Do NOT** `git add -A`. The working tree carries a generated `src/routeTree.gen.ts` modification — never stage it. Stage only the exact files each task names.
- Touch **only** these 4 files: `src/shared/utils/chunk.ts`, `src/shared/utils/chunk.test.ts`, `src/providers/data/impl/supabase/messages.ts`, `src/features/manager-dashboard/hooks/useDashboardSnapshot.ts`.
- Gate per task: the named command(s) pass. Final gate: `bun run build` + `bun run test` green; `bunx tsc --noEmit` shows **no new** errors in the 4 files (baseline of pre-existing `tsc` errors exists — judge by delta).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/utils/chunk.ts` (A) | Generic pure `chunk<T>(items, size): T[][]`. Transport-agnostic, zero deps. |
| `src/shared/utils/chunk.test.ts` (A) | Vitest unit tests for `chunk` (mirrors `avatar.test.ts`/`format.test.ts`/`mediaRef.test.ts`). |
| `src/providers/data/impl/supabase/messages.ts` (M) | `listForAnalytics` uses `chunk` to batch `.in("conversation_id", …)`; concat + sort by `sent_at` asc. |
| `src/features/manager-dashboard/hooks/useDashboardSnapshot.ts` (M) | Trailing-debounce the `refreshKey` refetch effect via `fetchRef` + `clearTimeout`. |

---

## Task 1: Generic `chunk` util (TDD)

**Files:**
- Create: `src/shared/utils/chunk.ts`
- Test: `src/shared/utils/chunk.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function chunk<T>(items: readonly T[], size: number): T[][]` — splits `items` into consecutive sub-arrays of at most `size`; `[]` → `[]`; `size >= items.length` → one chunk; throws `Error("chunk: size must be > 0")` for `size <= 0`. Preserves order and element identity (slices, no copies of elements).

- [ ] **Step 1: Write the failing test**

Create `src/shared/utils/chunk.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { chunk } from "./chunk";

describe("chunk", () => {
  it("splits into consecutive batches of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("splits evenly when length is a multiple of size", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]]);
  });

  it("returns an empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it("returns a single chunk when size >= length", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("handles size of 1", () => {
    expect(chunk(["a", "b", "c"], 1)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("throws when size <= 0", () => {
    expect(() => chunk([1, 2], 0)).toThrow("chunk: size must be > 0");
    expect(() => chunk([1, 2], -1)).toThrow("chunk: size must be > 0");
  });

  it("preserves element identity (no element copies)", () => {
    const a = { id: 1 };
    const b = { id: 2 };
    const out = chunk([a, b], 1);
    expect(out[0][0]).toBe(a);
    expect(out[1][0]).toBe(b);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/shared/utils/chunk.test.ts`
Expected: FAIL — cannot resolve `./chunk` (module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/shared/utils/chunk.ts`:

```ts
/**
 * Splits `items` into consecutive sub-arrays of at most `size` elements.
 *
 * Pure and transport-agnostic. Used to keep Supabase/PostgREST `.in(col, …)`
 * filters under the request-line length limit when an id set is store-wide
 * (a single oversized `.in()` is rejected at the edge with 400 before RLS).
 *
 * @throws if `size <= 0`.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk: size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/shared/utils/chunk.test.ts`
Expected: PASS — 7 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/utils/chunk.ts src/shared/utils/chunk.test.ts
git commit -m "feat(shared): add generic chunk() util for batching"
```

---

## Task 2: Chunk the `.in()` in `listForAnalytics`

**Files:**
- Modify: `src/providers/data/impl/supabase/messages.ts` (import block ~lines 1-14; constants ~lines 54-57; `listForAnalytics` lines 185-197)

**Interfaces:**
- Consumes: `chunk` from Task 1 (`import { chunk } from "@/shared/utils/chunk"`).
- Produces: same public signature `listForAnalytics(params?: IListMessagesForAnalyticsParams): Promise<IMessage[]>` (unchanged) — now safe for store-wide id sets; result is still ascending by `sentAt`.

> **Note on testing:** this codebase does **not** mock the Supabase client; provider impls test only their pure exported helpers (e.g. `customers.search.test.ts` tests `buildCustomerSearchOr`, not the query wiring). The pure, error-prone part here — partitioning — lives in `chunk` and is covered by Task 1. The query-per-batch wiring is I/O, verified by the build + full suite (no regression) + the dono's manual smoke. Do **not** invent a Supabase mock.

- [ ] **Step 1: Add the import**

In `src/providers/data/impl/supabase/messages.ts`, add the import alongside the existing `@/shared/...` imports (right after the `mediaRef` import block that ends at line 14):

```ts
import { chunk } from "@/shared/utils/chunk";
```

- [ ] **Step 2: Add the chunk-size constant**

Right after the `COLUMNS` constant (line 57), add:

```ts
/** Cap on ids per `.in("conversation_id", …)` so the request-line length stays
 *  well under the edge's URL limit (~39 chars/id encoded → 120 ids ≈ 4.7 KB). */
const ANALYTICS_IN_CHUNK_SIZE = 120;
```

- [ ] **Step 3: Rewrite `listForAnalytics`**

Replace the entire current method (lines 185-197):

```ts
  async listForAnalytics(params: IListMessagesForAnalyticsParams = {}): Promise<IMessage[]> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS);

    if (params.conversationIds && params.conversationIds.length > 0) {
      query = query.in("conversation_id", params.conversationIds);
    }
    if (params.since) query = query.gte("sent_at", params.since);
    if (params.until) query = query.lte("sent_at", params.until);

    const { data, error } = await query.order("sent_at", { ascending: true });
    if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
    return (data as unknown as MessageRow[]).map(rowToMessage);
  },
```

with:

```ts
  async listForAnalytics(params: IListMessagesForAnalyticsParams = {}): Promise<IMessage[]> {
    const ids = params.conversationIds ?? [];

    // No conversation filter → single windowed query (preserves prior behavior:
    // an empty id set scans all messages in the window, not zero rows).
    if (ids.length === 0) {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS);
      if (params.since) query = query.gte("sent_at", params.since);
      if (params.until) query = query.lte("sent_at", params.until);
      const { data, error } = await query.order("sent_at", { ascending: true });
      if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
      return (data as unknown as MessageRow[]).map(rowToMessage);
    }

    // Chunk the `.in("conversation_id", …)` so a store-wide id set never overflows
    // the request-line length (a single oversized `.in()` is rejected at the edge
    // with 400 before RLS). Chunks are disjoint by conversation_id ⇒ no dup / no
    // loss; we re-sort the union to restore the ascending-by-sent_at contract.
    const batches = chunk(ids, ANALYTICS_IN_CHUNK_SIZE);
    const results = await Promise.all(
      batches.map(async (batch) => {
        let query = getSupabaseClient().from(TABLE).select(COLUMNS).in("conversation_id", batch);
        if (params.since) query = query.gte("sent_at", params.since);
        if (params.until) query = query.lte("sent_at", params.until);
        const { data, error } = await query.order("sent_at", { ascending: true });
        if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
        return data as unknown as MessageRow[];
      }),
    );

    return results
      .flat()
      .sort((a, b) => a.sent_at.localeCompare(b.sent_at))
      .map(rowToMessage);
  },
```

- [ ] **Step 4: Type-check the changed file (delta)**

Run: `bunx tsc --noEmit`
Expected: **no new** errors mentioning `src/providers/data/impl/supabase/messages.ts` (pre-existing baseline errors elsewhere are acceptable — compare against the baseline; the diff for this file should be clean).

- [ ] **Step 5: Run the full test suite (no regression)**

Run: `bun run test`
Expected: PASS — existing suite green, including `chunk.test.ts` from Task 1. (No new test is added in this task per the note above.)

- [ ] **Step 6: Build (no regression)**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/providers/data/impl/supabase/messages.ts
git commit -m "fix(analytics): chunk listForAnalytics .in() to avoid 400 on store-wide id sets"
```

---

## Task 3: Trailing-debounce the dashboard realtime refetch

**Files:**
- Modify: `src/features/manager-dashboard/hooks/useDashboardSnapshot.ts` (import line 1; add constant near line 10; add refs after `fetchSnapshot` ~line 104; rewrite refresh effect lines 113-119)

**Interfaces:**
- Consumes: nothing new.
- Produces: same `useDashboardSnapshot(...)` public shape (`{ snapshot, isLoading, isRefreshing, error, refetch }`) — unchanged. Behavior change: realtime-tick-driven refetches now coalesce on a 1500 ms trailing window and always run with current params.

> **Note on testing:** there is **no** React-hook test infrastructure in this repo (no `@testing-library/react`/`renderHook`/jsdom). Do **not** add one. This task is verified by `bunx tsc --noEmit` (delta) + `bun run build` + `bun run test` (no regression) + the dono's manual smoke (burst of realtime events ⇒ a single refetch; changing a filter mid-window shows correct-filter data, never stale).

- [ ] **Step 1: Add `useRef` to the React import**

In `src/features/manager-dashboard/hooks/useDashboardSnapshot.ts`, change line 1 from:

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
```

to:

```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

- [ ] **Step 2: Add the debounce constant**

Right after the import block, above `const EMPTY_SNAPSHOT` (line 10), add:

```ts
/** Trailing-debounce window for realtime-tick refetches — coalesces bursts of
 *  Realtime events (each bumps `refreshKey`) into a single dashboard refetch. */
const REFRESH_DEBOUNCE_MS = 1500;
```

- [ ] **Step 3: Add the fresh-ref + timeout-ref**

Immediately after the `fetchSnapshot` `useCallback` block (it ends at line 104, `[provider, paramsKey],` then `);`), and before the `// Reset to initial fetch...` comment (line 106), add:

```ts
  // Always-fresh handle to fetchSnapshot so a debounced refresh that fires after
  // a filter change still runs with the current params (no stale-closure refetch).
  const fetchRef = useRef(fetchSnapshot);
  fetchRef.current = fetchSnapshot;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

- [ ] **Step 4: Rewrite the refresh effect**

Replace the current "Background refresh" effect (lines 113-119):

```ts
  // Background refresh on refreshKey bump.
  useEffect(() => {
    if (!enabled) return;
    if (refreshKey === 0) return;
    void fetchSnapshot("refresh");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
```

with:

```ts
  // Background refresh on refreshKey bump — trailing-debounced so a burst of
  // realtime ticks coalesces into a single refetch, and always with fresh params.
  useEffect(() => {
    if (!enabled) return;
    if (refreshKey === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchRef.current("refresh");
    }, REFRESH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, enabled]);
```

(Leave the manual `refetch` callback at lines 121-123 untouched — manual refresh is intentionally immediate.)

- [ ] **Step 5: Type-check the changed file (delta)**

Run: `bunx tsc --noEmit`
Expected: **no new** errors mentioning `src/features/manager-dashboard/hooks/useDashboardSnapshot.ts`.

- [ ] **Step 6: Run the full test suite + build (no regression)**

Run: `bun run test`
Expected: PASS.
Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/features/manager-dashboard/hooks/useDashboardSnapshot.ts
git commit -m "perf(manager-dashboard): debounce realtime refetch to coalesce tick bursts"
```

---

## Final Verification Gate

- [ ] `bun run test` green (includes `chunk.test.ts`).
- [ ] `bun run build` green.
- [ ] `bunx tsc --noEmit` shows no **new** errors in the 4 touched files (delta vs baseline).
- [ ] `git status --porcelain` shows only intended files staged across the 3 commits; `src/routeTree.gen.ts` was **never** committed.
- [ ] Manual smoke by the dono (UI tested manually per preference): open **Dashboard do Gestor** as Owner → **no** `messages 400` in the console; KPIs render with correct numbers; a burst of realtime activity triggers a **single** refetch after ~1.5 s; changing a dashboard filter shows that filter's data (never a stale flash). Repeat on **Análise de Atendimento** (no 400).
- [ ] Confirm out-of-scope siblings (`scheduledSend.ts:201/216`, `vehicles.ts:132`) were **not** touched.

## Self-Review (done while writing this plan)

- **Spec coverage:** §3.1 → Task 1; §3.2 → Task 2; §4 (incl. §4.1 fetchRef + clearTimeout) → Task 3; §5 ordering (concat+sort, disjoint exactly-once) → Task 2 Step 3 code + comment; §7 testing → Task 1 (chunk.test.ts) + verification gates; §6 siblings → explicitly out-of-scope, asserted in the Final Gate. No gaps.
- **Placeholder scan:** no TBD/TODO/"handle edge cases"; all code shown in full.
- **Type consistency:** `chunk<T>(items, size): T[][]` defined in Task 1 and consumed identically in Task 2; `ANALYTICS_IN_CHUNK_SIZE`, `REFRESH_DEBOUNCE_MS`, `fetchRef`, `debounceRef` names consistent across steps; `fetchRef.current("refresh")` matches `fetchSnapshot(mode: "initial" | "refresh")`.
