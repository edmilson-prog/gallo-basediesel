# Analytics `.range()` Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `listForAnalytics` from silently truncating each conversation-id batch at the PostgREST 1000-row cap by paginating every batch with `.range()` until exhausted.

**Architecture:** Add a pure, transport-agnostic `drainPaged()` helper (mirrors the existing `chunk()` util) that loops a caller-supplied `fetchPage(offset, limit)` until a short page signals exhaustion. Rewire the internal `fetchRows` of `listForAnalytics` to drain pages with a stable total `ORDER BY (sent_at, id)` (required so `.range()` boundaries can't dup/skip). Everything else in `listForAnalytics` — id dedup, cross-batch `sortBySentAt`, the empty-ids path, the `IMessage[]` contract, `rowToMessage`, and all KPI engines — is untouched.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`), Vitest, `@supabase/postgrest-js`, Bun.

## Global Constraints

- Code identifiers and comments in **English**; no user-facing strings change in this work.
- Commits: **Conventional Commits** in English, atomic.
- TypeScript `strict: true`; avoid `any`. `tsc --noEmit` has a ~315-error pre-existing baseline — judge **new code by delta** on touched files only.
- Practical CI gate is `bun run test` + `bun run build` (Vite/esbuild does NOT type-check; run `bunx tsc --noEmit` separately for the delta).
- **Never** stage/commit `src/routeTree.gen.ts` (generated; the dev server dirties it).
- No migration, no edge-function deploy in this plan — provider + util + tests only.
- Feature-folder/Provider-Pattern boundaries unchanged; `@/shared/utils/*` is import-allowed anywhere.

---

### Task 1: Pure `drainPaged` pagination helper

**Files:**
- Create: `src/shared/utils/paginate.ts`
- Test: `src/shared/utils/paginate.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no imports beyond standard JS).
- Produces: `export async function drainPaged<T>(fetchPage: (offset: number, limit: number) => Promise<T[]>, pageSize: number): Promise<T[]>` — calls `fetchPage(offset, pageSize)` with `offset = 0, pageSize, 2*pageSize, …`, concatenating each page's rows, stopping when a page returns fewer than `pageSize` rows. Throws if `pageSize` is not a positive integer. Throws if it runs more than `MAX_PAGES` (10000) iterations without a short page.

- [ ] **Step 1: Write the failing tests**

Create `src/shared/utils/paginate.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { drainPaged } from "./paginate";

describe("drainPaged", () => {
  it("returns a single short page in one call", async () => {
    const fetchPage = vi.fn(async () => [1, 2]); // 2 < pageSize 3 → stop
    const out = await drainPaged(fetchPage, 3);
    expect(out).toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0, 3);
  });

  it("returns empty for an empty first page", async () => {
    const fetchPage = vi.fn(async () => [] as number[]);
    const out = await drainPaged(fetchPage, 3);
    expect(out).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("stops after a full page followed by an empty page (exact multiple)", async () => {
    const pages: number[][] = [[1, 2], [3, 4], []];
    const fetchPage = vi.fn(async (offset: number) => pages[offset / 2] ?? []);
    const out = await drainPaged(fetchPage, 2);
    expect(out).toEqual([1, 2, 3, 4]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 2, 4]);
  });

  it("accumulates across pages and stops on the short page", async () => {
    const pages: number[][] = [[1, 2], [3, 4], [5]];
    const fetchPage = vi.fn(async (offset: number) => pages[offset / 2] ?? []);
    const out = await drainPaged(fetchPage, 2);
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 2, 4]);
  });

  it("propagates a fetchPage rejection", async () => {
    const fetchPage = vi.fn(async () => {
      throw new Error("boom");
    });
    await expect(drainPaged(fetchPage, 2)).rejects.toThrow("boom");
  });

  it("throws for any non-positive-integer pageSize", async () => {
    const fp = async () => [] as number[];
    await expect(drainPaged(fp, 0)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, -1)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, 1.5)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, NaN)).rejects.toThrow("pageSize must be a positive integer");
    await expect(drainPaged(fp, Infinity)).rejects.toThrow("pageSize must be a positive integer");
  });

  it("throws when the iteration cap is exceeded (fetchPage never short)", async () => {
    const fetchPage = vi.fn(async () => [1]); // length 1 == pageSize 1 → never short
    await expect(drainPaged(fetchPage, 1)).rejects.toThrow(/exceeded \d+ pages/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- src/shared/utils/paginate.test.ts`
Expected: FAIL — `drainPaged` is not exported / module `./paginate` not found.

- [ ] **Step 3: Write the minimal implementation**

Create `src/shared/utils/paginate.ts`:

```ts
/** Defensive backstop: stop a `fetchPage` that never returns a short page from
 *  looping forever (10000 pages × a 1000-row page = 10M rows — far beyond any
 *  real analytics read). */
const MAX_PAGES = 10_000;

/**
 * Drains a paginated read into a flat array by calling `fetchPage(offset, limit)`
 * repeatedly until a page returns fewer than `pageSize` rows (a short page = the
 * source is exhausted). Pure and transport-agnostic — it knows nothing about any
 * backend; the caller supplies `fetchPage`.
 *
 * @throws {Error} if `pageSize` is not a positive integer.
 * @throws {Error} if the iteration cap is exceeded (a `fetchPage` that never
 *   returns a short page).
 */
export async function drainPaged<T>(
  fetchPage: (offset: number, limit: number) => Promise<T[]>,
  pageSize: number,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error("drainPaged: pageSize must be a positive integer");
  }
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await fetchPage(page * pageSize, pageSize);
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
  throw new Error(`drainPaged: exceeded ${MAX_PAGES} pages — fetchPage never returned a short page`);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- src/shared/utils/paginate.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check the new file (delta)**

Run: `bunx tsc --noEmit 2>&1 | grep "shared/utils/paginate" || echo "DELTA-CLEAN"`
Expected: `DELTA-CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add src/shared/utils/paginate.ts src/shared/utils/paginate.test.ts
git commit -m "feat(shared): add drainPaged() util to drain a paginated read"
```

---

### Task 2: Paginate every batch in `listForAnalytics`

**Files:**
- Modify: `src/providers/data/impl/supabase/messages.ts` (import block near the existing `chunk` import; the `ANALYTICS_IN_CHUNK_SIZE` constant area; the `fetchRows` definition inside `listForAnalytics`).

**Interfaces:**
- Consumes: `drainPaged` from Task 1 (`import { drainPaged } from "@/shared/utils/paginate"`).
- Produces: no signature change — `listForAnalytics(params): Promise<IMessage[]>` keeps its contract; only its internal fetch is paginated.

- [ ] **Step 1: Add the import**

In `src/providers/data/impl/supabase/messages.ts`, immediately below the existing line `import { chunk } from "@/shared/utils/chunk";`, add:

```ts
import { drainPaged } from "@/shared/utils/paginate";
```

- [ ] **Step 2: Add the page-size constant**

Immediately below the existing `const ANALYTICS_IN_CHUNK_SIZE = 120;` (and its doc comment), add:

```ts
/** Rows per `.range()` page when draining a batch. Must stay ≤ the PostgREST
 *  `Max rows` cap (Supabase default 1000) — a page that comes back capped below
 *  this size would be mistaken for the last page and silently under-fetch. */
const ANALYTICS_PAGE_SIZE = 1000;
```

- [ ] **Step 3: Replace `fetchRows` with the paginating version**

In `listForAnalytics`, replace this block:

```ts
    // Run one windowed analytics query. `batch` scopes by conversation_id
    // (null = no conversation filter). Shared by both paths so a future filter
    // can't diverge between them; ordering is always applied in memory below.
    const fetchRows = async (batch: string[] | null): Promise<MessageRow[]> => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS);
      if (batch) query = query.in("conversation_id", batch);
      if (params.since) query = query.gte("sent_at", params.since);
      if (params.until) query = query.lte("sent_at", params.until);
      const { data, error } = await query;
      if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
      return (data ?? []) as unknown as MessageRow[];
    };
```

with:

```ts
    // Run a windowed analytics query, draining every page so a batch with more
    // than the PostgREST `Max rows` cap (default 1000) isn't silently truncated.
    // `batch` scopes by conversation_id (null = no conversation filter). A stable
    // TOTAL order `(sent_at, id)` is REQUIRED for `.range()` to page correctly —
    // without a unique tiebreak, row order across pages is undefined and the
    // boundaries could dup/skip. Shared by both paths so a future filter can't
    // diverge between them; the cross-batch merge order is re-applied in memory.
    const fetchRows = (batch: string[] | null): Promise<MessageRow[]> =>
      drainPaged<MessageRow>(async (offset, limit) => {
        let query = getSupabaseClient().from(TABLE).select(COLUMNS);
        if (batch) query = query.in("conversation_id", batch);
        if (params.since) query = query.gte("sent_at", params.since);
        if (params.until) query = query.lte("sent_at", params.until);
        const { data, error } = await query
          .order("sent_at", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + limit - 1);
        if (error) throw new Error(`[supabase] messages.listForAnalytics failed: ${error.message}`);
        return (data ?? []) as unknown as MessageRow[];
      }, ANALYTICS_PAGE_SIZE);
```

Leave the rest of `listForAnalytics` unchanged: `const ids = params.conversationIds ?? []`, `sortBySentAt`, the `ids.length === 0` path (`sortBySentAt(await fetchRows(null)).map(rowToMessage)`), `chunk([...new Set(ids)], ANALYTICS_IN_CHUNK_SIZE)`, `Promise.all(batches.map((batch) => fetchRows(batch)))`, and `sortBySentAt(results.flat()).map(rowToMessage)`.

- [ ] **Step 4: Type-check the touched file (delta)**

Run: `bunx tsc --noEmit 2>&1 | grep "supabase/messages.ts" || echo "DELTA-CLEAN"`
Expected: `DELTA-CLEAN` (the `.order().order().range()` chain is awaited inline — no `query` reassignment — so no builder-type divergence).

- [ ] **Step 5: Run the full test suite**

Run: `bun run test`
Expected: PASS — all files green (the existing suite plus Task 1's `paginate.test.ts`); no regressions. `listForAnalytics` itself has no unit test by repo convention (the supabase client isn't mocked); its correctness rides on the `drainPaged` helper tests and the type/build gate.

- [ ] **Step 6: Production build**

Run: `bun run build`
Expected: build succeeds (the pre-existing >500 kB chunk-size warning is fine).

- [ ] **Step 7: Commit**

```bash
git checkout -- src/routeTree.gen.ts 2>/dev/null || true
git add src/providers/data/impl/supabase/messages.ts
git commit -m "fix(analytics): paginate listForAnalytics batches to avoid silent 1000-row truncation"
```

---

## Self-Review

**Spec coverage:**
- §3.1 pure `drainPaged` helper → Task 1. ✓
- §3.2 `fetchRows` paginates with `(sent_at, id)` order + `ANALYTICS_PAGE_SIZE` → Task 2 Steps 2–3. ✓
- §3.3 unchanged dedup / `sortBySentAt` / empty-ids / contract → Task 2 Step 3 explicitly leaves them. ✓
- §4.1 stable total order → Task 2 Step 3 (`.order("sent_at").order("id")`). ✓
- §4.2 `PAGE_SIZE ≤ Max rows` invariant → Task 2 Step 2 constant + doc comment. ✓
- §4.3 termination on short page → Task 1 Step 3 (`rows.length < pageSize`). ✓
- §4.4 fail-fast → Task 2 Step 3 throws on `error`; Task 1 propagates rejection (tested). ✓
- §4.5 final order preserved by in-memory `sortBySentAt` → Task 2 Step 3 leaves it. ✓
- §5 TDD on the pure helper, no provider unit test → Task 1 tests; Task 2 Step 5 note. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `drainPaged<T>(fetchPage, pageSize)` signature identical in Task 1 (definition) and Task 2 (call with `MessageRow`, `ANALYTICS_PAGE_SIZE`). The `fetchPage` callback returns `Promise<MessageRow[]>` matching `T = MessageRow`. ✓
