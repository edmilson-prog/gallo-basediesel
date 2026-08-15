# Provider list() Pagination Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop every Supabase `list()` provider from silently truncating results at 1000 rows when a caller requests a larger `pageSize`, by making the provider itself loop internally — fixing every current and future caller in one place instead of patching ~68 call sites.

**Architecture:** Extract a shared `fetchLargePage()` helper (`src/providers/data/impl/supabase/_pagination.ts`) that issues multiple sequential `.range()` queries (≤1000 rows each — PostgREST's per-request ceiling) and concatenates them. Each affected provider's `list()` method is restructured so its query-building logic (currently `let query = ...` reassigned through a chain of `if` filters) becomes a factory function `buildQuery()` called fresh on every chunk — Supabase query builders are not safely re-executable, so each chunk needs its own freshly-built query (same idiom already proven in `scripts/dintec-import/run-parts-dintec-import.ts` and in the two independent ad-hoc reinventions of this exact pattern already living in the codebase: `drainPages` in `managerDashboard.ts` and `drainPaged` in `messages.ts`'s `listForAnalytics`). The per-call clamp changes from `Math.min(1000, ...)` to `Math.min(50_000, ...)` — a generous but bounded ceiling — with `fetchLargePage` transparently chunking anything above 1000 into multiple ≤1000-row requests.

**Tech Stack:** TypeScript, Supabase JS client (`@supabase/supabase-js`), Vitest, Bun.

## Global Constraints

- Never touch `src/providers/data/impl/supabase/conversations.ts`. Its own code comments document a real production incident (statement_timeout from `count: "exact"` re-running the per-row `can_access_conversation` RLS check on every page fetch — see `resolvePagination`/`list()`/`listConversationsViaRpc` comments). No current caller requests `pageSize` above 1000 for conversations; raising its effective ceiling risks reintroducing that incident for zero present benefit. This exclusion is deliberate, not an oversight.
- Never touch `src/providers/data/impl/supabase/managerDashboard.ts`. It already solves this exact problem correctly via its own `drainPages` helper — nothing to fix.
- Never touch `messages.ts`'s `listForAnalytics()` method or its `drainPaged`/`ANALYTICS_PAGE_SIZE` — already correct, already draining properly. Only `messages.ts`'s plain `list()` method (RPC-backed, used for a single conversation's message thread) needs the fix.
- Every provider file keeps its existing per-file error message prefix (e.g. `[supabase] parts.list failed:`) — do not change error message text.
- `bun run test` and `bunx tsc --noEmit` must stay clean for every file touched (pre-existing `tsc` errors elsewhere are out of scope — see CLAUDE.md's baseline-errors note).
- Do not change any provider's public contract (`IListXParams`, `IPaginatedResult<T>`) — only the internal `pageSize` ceiling and execution strategy change.

---

## Task 1: Shared `fetchLargePage` helper

**Files:**
- Create: `src/providers/data/impl/supabase/_pagination.ts`
- Test: `src/providers/data/impl/supabase/_pagination.test.ts`

**Interfaces:**
- Produces: `fetchLargePage<T>(fetchChunk: (from: number, to: number) => Promise<{data: T[]; count: number}>, from: number, pageSize: number): Promise<{data: T[]; total: number}>` — every later task imports this from `./_pagination`.

- [ ] **Step 1: Write the failing tests**

Create `src/providers/data/impl/supabase/_pagination.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { fetchLargePage } from "./_pagination";

function makeChunkFetcher(items: number[]) {
  return vi.fn(async (from: number, to: number) => ({
    data: items.slice(from, to + 1),
    count: items.length,
  }));
}

describe("fetchLargePage", () => {
  it("returns everything in one call when pageSize covers the whole set", async () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    const result = await fetchLargePage(fetchChunk, 0, 1000);
    expect(result).toEqual({ data: items, total: 30 });
    expect(fetchChunk).toHaveBeenCalledTimes(1);
    expect(fetchChunk).toHaveBeenCalledWith(0, 999);
  });

  it("loops across multiple 1000-row chunks until pageSize is satisfied", async () => {
    const items = Array.from({ length: 2500 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    const result = await fetchLargePage(fetchChunk, 0, 2500);
    expect(result.data).toEqual(items);
    expect(result.total).toBe(2500);
    expect(fetchChunk).toHaveBeenCalledTimes(3);
    expect(fetchChunk).toHaveBeenNthCalledWith(1, 0, 999);
    expect(fetchChunk).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(fetchChunk).toHaveBeenNthCalledWith(3, 2000, 2499);
  });

  it("stops once the reported total is reached, without an extra request", async () => {
    const items = Array.from({ length: 2000 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    await fetchLargePage(fetchChunk, 0, 2000);
    expect(fetchChunk).toHaveBeenCalledTimes(2);
  });

  it("respects a non-zero starting offset (page > 1)", async () => {
    const items = Array.from({ length: 2500 }, (_, i) => i);
    const fetchChunk = makeChunkFetcher(items);
    const result = await fetchLargePage(fetchChunk, 1500, 1000);
    expect(result.data).toEqual(items.slice(1500, 2500));
    expect(fetchChunk).toHaveBeenCalledTimes(1);
    expect(fetchChunk).toHaveBeenCalledWith(1500, 2499);
  });

  it("stops defensively if a chunk returns fewer rows than the reported total (avoids infinite loop)", async () => {
    const fetchChunk = vi.fn(async (from: number) => ({
      data: from === 0 ? [1, 2, 3] : [],
      count: 100,
    }));
    const result = await fetchLargePage(fetchChunk, 0, 5000);
    expect(result.data).toEqual([1, 2, 3]);
    expect(fetchChunk).toHaveBeenCalledTimes(2);
  });

  it("returns an empty result when there is nothing to fetch", async () => {
    const fetchChunk = makeChunkFetcher([]);
    const result = await fetchLargePage(fetchChunk, 0, 1000);
    expect(result).toEqual({ data: [], total: 0 });
    expect(fetchChunk).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test _pagination.test.ts`
Expected: FAIL — `Cannot find module './_pagination'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/providers/data/impl/supabase/_pagination.ts`:

```ts
/**
 * Hard per-request row ceiling PostgREST enforces (Supabase's `db-max-rows`).
 * Every `.range()` call must ask for at most this many rows; `fetchLargePage`
 * transparently issues multiple sequential requests to satisfy any larger
 * `pageSize`.
 */
const RANGE_CHUNK_SIZE = 1000;

export interface IRangeChunkResult<T> {
  data: T[];
  count: number;
}

/**
 * Fulfills a `pageSize` larger than PostgREST's per-request row ceiling by
 * issuing multiple sequential `.range()` queries and concatenating them.
 *
 * `fetchChunk` must build the fully-filtered, fully-ordered query fresh on
 * every call and apply `.range(from, to)` itself before awaiting — Supabase
 * query builders are not safely reusable across independent executions, so
 * each chunk needs its own freshly-built query (same idiom already used by
 * `scripts/dintec-import/run-parts-dintec-import.ts`'s idempotency anchor and
 * `managerDashboard.ts`'s `drainPages`).
 */
export async function fetchLargePage<T>(
  fetchChunk: (from: number, to: number) => Promise<IRangeChunkResult<T>>,
  from: number,
  pageSize: number,
): Promise<{ data: T[]; total: number }> {
  const data: T[] = [];
  let total = 0;
  let offset = from;
  const end = from + pageSize;
  while (offset < end) {
    const chunkTo = Math.min(offset + RANGE_CHUNK_SIZE, end) - 1;
    const chunk = await fetchChunk(offset, chunkTo);
    total = chunk.count;
    data.push(...chunk.data);
    if (chunk.data.length === 0 || offset + chunk.data.length >= total) break;
    offset += chunk.data.length;
  }
  return { data, total };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test _pagination.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/_pagination.ts src/providers/data/impl/supabase/_pagination.test.ts
git commit -m "feat(providers): add fetchLargePage helper for multi-chunk list() pagination"
```

---

## Task 2: Fix `parts.ts` and `customers.ts` (URGENT — currently returning wrong data)

`parts` has 2,778 rows and `customers` has 3,168 rows in production — both already exceed the 1000-row clamp, so every caller requesting `pageSize` above 1000 (catalog filter options, quote item search, indicator auto-status-update, sales/profitability/inventory analytics — ~15 call sites total) is silently working with an incomplete set today.

**Files:**
- Modify: `src/providers/data/impl/supabase/parts.ts:198-230`
- Modify: `src/providers/data/impl/supabase/customers.ts:290-349` (exact end line may vary slightly — locate the `list()` method by its `async list(params: IListCustomersParams = {})` signature)

**Interfaces:**
- Consumes: `fetchLargePage` from `./_pagination` (Task 1).

- [ ] **Step 1: Update `parts.ts`**

Current code (`src/providers/data/impl/supabase/parts.ts:198-230`):

```ts
export const supabasePartsProvider: IPartsProvider = {
  async list(params: IListPartsParams = {}): Promise<IPaginatedResult<IPart>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (typeof params.active === "boolean") query = query.eq("active", params.active);
    if (params.brand) query = query.eq("brand", params.brand);
    if (params.inStock) query = query.gt("stock_available", 0);
    if (params.oem) query = query.ilike("oem_codes_text", `%${params.oem}%`);
    if (params.search) {
      const q = params.search;
      query = query.or(
        `name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,oem_codes_text.ilike.%${q}%`,
      );
    }

    const column = ORDER_BY_COLUMN[params.orderBy ?? "name"];
    const ascending = params.orderDir !== "desc";
    query = query.order(column, { ascending }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(`[supabase] parts.list failed: ${error.message}`);
    return {
      data: (data as PartRow[]).map(rowToPart),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
export const supabasePartsProvider: IPartsProvider = {
  async list(params: IListPartsParams = {}): Promise<IPaginatedResult<IPart>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (typeof params.active === "boolean") query = query.eq("active", params.active);
      if (params.brand) query = query.eq("brand", params.brand);
      if (params.inStock) query = query.gt("stock_available", 0);
      if (params.oem) query = query.ilike("oem_codes_text", `%${params.oem}%`);
      if (params.search) {
        const q = params.search;
        query = query.or(
          `name.ilike.%${q}%,sku.ilike.%${q}%,brand.ilike.%${q}%,oem_codes_text.ilike.%${q}%`,
        );
      }
      return query;
    };

    const column = ORDER_BY_COLUMN[params.orderBy ?? "name"];
    const ascending = params.orderDir !== "desc";

    const { data, total } = await fetchLargePage<PartRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order(column, { ascending })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] parts.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as PartRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToPart),
      total,
      page,
      pageSize,
    };
  },
```

Add the import at the top of the file (alongside the existing imports):

```ts
import { fetchLargePage } from "./_pagination";
```

- [ ] **Step 2: Update `customers.ts`**

Current code (`src/providers/data/impl/supabase/customers.ts`, inside `async list(params: IListCustomersParams = {})`):

```ts
  async list(params: IListCustomersParams = {}): Promise<IPaginatedResult<ICustomer>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeIds && params.storeIds.length > 0) {
      query = query.in("store_id", params.storeIds);
    } else if (params.storeId !== undefined) {
      query = query.eq("store_id", params.storeId);
    }

    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    } else if (params.status !== undefined) {
      query = query.eq("status", params.status);
    }

    if (params.type !== undefined) query = query.eq("type", params.type);

    if (params.sellerIds && params.sellerIds.length > 0) {
      query = query.in("seller_id", params.sellerIds);
    } else if (params.sellerId !== undefined) {
      query = query.eq("seller_id", params.sellerId);
    }

    if (params.hasB2BPortal) query = query.eq("has_b2b_portal", true);

    // Hide imported `pending_review` contacts (array overlap, negated): drop any
    // row whose tags intersect excludeTags. Server-side so count/pagination match.
    if (params.excludeTags && params.excludeTags.length > 0) {
      query = query.not("tags", "ov", `{${params.excludeTags.join(",")}}`);
    }

    // Include filters: OR semantics — customer must carry ANY of the selected tags.
    if (params.tag) {
      query = query.overlaps("tags", [params.tag]);
    }
    if (params.tags && params.tags.length > 0) {
      query = query.overlaps("tags", params.tags);
    }

    const searchOr = params.search ? buildCustomerSearchOr(params.search) : null;
    if (searchOr) query = query.or(searchOr);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(`[supabase] customers.list failed: ${error.message}`);

    return {
      data: (data as unknown as CustomerRow[]).map((row) => rowToCustomer(row)),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListCustomersParams = {}): Promise<IPaginatedResult<ICustomer>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

      if (params.storeIds && params.storeIds.length > 0) {
        query = query.in("store_id", params.storeIds);
      } else if (params.storeId !== undefined) {
        query = query.eq("store_id", params.storeId);
      }

      if (params.statuses && params.statuses.length > 0) {
        query = query.in("status", params.statuses);
      } else if (params.status !== undefined) {
        query = query.eq("status", params.status);
      }

      if (params.type !== undefined) query = query.eq("type", params.type);

      if (params.sellerIds && params.sellerIds.length > 0) {
        query = query.in("seller_id", params.sellerIds);
      } else if (params.sellerId !== undefined) {
        query = query.eq("seller_id", params.sellerId);
      }

      if (params.hasB2BPortal) query = query.eq("has_b2b_portal", true);

      // Hide imported `pending_review` contacts (array overlap, negated): drop any
      // row whose tags intersect excludeTags. Server-side so count/pagination match.
      if (params.excludeTags && params.excludeTags.length > 0) {
        query = query.not("tags", "ov", `{${params.excludeTags.join(",")}}`);
      }

      // Include filters: OR semantics — customer must carry ANY of the selected tags.
      if (params.tag) {
        query = query.overlaps("tags", [params.tag]);
      }
      if (params.tags && params.tags.length > 0) {
        query = query.overlaps("tags", params.tags);
      }

      const searchOr = params.search ? buildCustomerSearchOr(params.search) : null;
      if (searchOr) query = query.or(searchOr);

      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<CustomerRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("created_at", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] customers.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as CustomerRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map((row) => rowToCustomer(row)),
      total,
      page,
      pageSize,
    };
  },
```

Add the import at the top of the file:

```ts
import { fetchLargePage } from "./_pagination";
```

- [ ] **Step 3: Type-check and run the full test suite**

Run: `bunx tsc --noEmit`
Expected: no new errors introduced by these two files (compare against `git stash` baseline if unsure).

Run: `bun run test`
Expected: all existing tests still pass (289+ files, including any `parts.test.ts`/`customers.test.ts` if present).

- [ ] **Step 4: Manual verification against production data**

Using the Supabase MCP `execute_sql` tool (read-only), confirm the fix works end-to-end by simulating what the provider now does — e.g. verify `select count(*) from parts` (2,778) and `select count(*) from customers` (3,168) match what a `pageSize: 5000` request would now return, instead of being clamped at 1000. (This is a sanity check, not an automated test — Vitest cannot hit the live database.)

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/parts.ts src/providers/data/impl/supabase/customers.ts
git commit -m "fix(providers): stop parts/customers list() from truncating at 1000 rows

Both tables now exceed the old per-call clamp (parts=2778, customers=3168),
silently truncating every caller that requested a larger pageSize (catalog
filter options, quote item search, indicator auto-status-update, sales and
inventory analytics). list() now loops internally via fetchLargePage."
```

---

## Task 3: Fix `assetLibrary.ts`, `audits.ts`, `commissions.ts` (uniform pattern, currently safe but fragile)

None of these three tables currently exceed 1000 rows, so this task hardens against future growth rather than fixing a live bug. Same mechanical transform as Task 2.

**Files:**
- Modify: `src/providers/data/impl/supabase/assetLibrary.ts:196-223`
- Modify: `src/providers/data/impl/supabase/audits.ts:54-99`
- Modify: `src/providers/data/impl/supabase/commissions.ts:184-222`

**Interfaces:**
- Consumes: `fetchLargePage` from `./_pagination` (Task 1).

- [ ] **Step 1: Update `assetLibrary.ts`**

Current (`src/providers/data/impl/supabase/assetLibrary.ts:196-223`):

```ts
  async list(filter: IAssetLibraryListParams): Promise<IPaginatedResult<IAssetLibraryItem>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (filter.storeId !== undefined) query = query.eq("store_id", filter.storeId);
    if (filter.category !== undefined) query = query.eq("category", filter.category);
    if (filter.brand !== undefined) query = query.eq("brand", filter.brand);
    if (filter.productLine !== undefined) query = query.eq("product_line", filter.productLine);
    if (filter.status !== undefined) query = query.eq("status", filter.status);
    if (filter.search) query = query.ilike("title", `%${filter.search}%`);

    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(filter.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] assetLibrary.list failed: ${error.message}`);

    return {
      data: (data as unknown as AssetRow[]).map(rowToAsset),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(filter: IAssetLibraryListParams): Promise<IPaginatedResult<IAssetLibraryItem>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (filter.storeId !== undefined) query = query.eq("store_id", filter.storeId);
      if (filter.category !== undefined) query = query.eq("category", filter.category);
      if (filter.brand !== undefined) query = query.eq("brand", filter.brand);
      if (filter.productLine !== undefined) query = query.eq("product_line", filter.productLine);
      if (filter.status !== undefined) query = query.eq("status", filter.status);
      if (filter.search) query = query.ilike("title", `%${filter.search}%`);
      return query;
    };

    const page = Math.max(1, Math.floor(filter.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(filter.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<AssetRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("updated_at", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] assetLibrary.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as AssetRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToAsset),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 2: Update `audits.ts`**

Current (`src/providers/data/impl/supabase/audits.ts:54-99`):

```ts
  async list(params: IListAuditsParams = {}): Promise<IPaginatedResult<IAuditLog>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);

    if (params.actorIds && params.actorIds.length > 0) {
      query = query.in("actor_id", params.actorIds);
    } else if (params.actorId !== undefined) {
      query = query.eq("actor_id", params.actorId);
    }

    if (params.resources && params.resources.length > 0) {
      query = query.in("resource", params.resources);
    } else if (params.resource !== undefined) {
      query = query.eq("resource", params.resource);
    }

    if (params.resourceId !== undefined) query = query.eq("resource_id", params.resourceId);

    if (params.actions && params.actions.length > 0) {
      query = query.in("action", params.actions);
    } else if (params.action !== undefined) {
      query = query.eq("action", params.action);
    }

    if (params.since !== undefined) query = query.gte("timestamp", params.since);
    if (params.until !== undefined) query = query.lte("timestamp", params.until);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("timestamp", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] audits.list failed: ${error.message}`);

    return {
      data: (data as unknown as AuditLogRow[]).map(rowToAudit),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListAuditsParams = {}): Promise<IPaginatedResult<IAuditLog>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);

      if (params.actorIds && params.actorIds.length > 0) {
        query = query.in("actor_id", params.actorIds);
      } else if (params.actorId !== undefined) {
        query = query.eq("actor_id", params.actorId);
      }

      if (params.resources && params.resources.length > 0) {
        query = query.in("resource", params.resources);
      } else if (params.resource !== undefined) {
        query = query.eq("resource", params.resource);
      }

      if (params.resourceId !== undefined) query = query.eq("resource_id", params.resourceId);

      if (params.actions && params.actions.length > 0) {
        query = query.in("action", params.actions);
      } else if (params.action !== undefined) {
        query = query.eq("action", params.action);
      }

      if (params.since !== undefined) query = query.gte("timestamp", params.since);
      if (params.until !== undefined) query = query.lte("timestamp", params.until);

      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<AuditLogRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("timestamp", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] audits.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as AuditLogRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToAudit),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 3: Update `commissions.ts`**

Current (`src/providers/data/impl/supabase/commissions.ts:184-222`):

```ts
  async list(params: IListCommissionsParams = {}): Promise<IPaginatedResult<ICommission>> {
    let query = getSupabaseClient()
      .from(TABLE)
      .select(`${COLUMNS}, order:orders(number)`, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);

    if (params.sellerIds && params.sellerIds.length > 0) {
      query = query.in("seller_id", params.sellerIds);
    } else if (params.sellerId !== undefined) {
      query = query.eq("seller_id", params.sellerId);
    }

    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    } else if (params.status !== undefined) {
      query = query.eq("status", params.status);
    }

    if (params.period !== undefined) query = query.eq("period", params.period);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] commissions.list failed: ${error.message}`);

    return {
      data: (data as unknown as CommissionRow[]).map(rowToCommission),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListCommissionsParams = {}): Promise<IPaginatedResult<ICommission>> {
    const buildQuery = () => {
      let query = getSupabaseClient()
        .from(TABLE)
        .select(`${COLUMNS}, order:orders(number)`, { count: "exact" });

      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);

      if (params.sellerIds && params.sellerIds.length > 0) {
        query = query.in("seller_id", params.sellerIds);
      } else if (params.sellerId !== undefined) {
        query = query.eq("seller_id", params.sellerId);
      }

      if (params.statuses && params.statuses.length > 0) {
        query = query.in("status", params.statuses);
      } else if (params.status !== undefined) {
        query = query.eq("status", params.status);
      }

      if (params.period !== undefined) query = query.eq("period", params.period);

      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<CommissionRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("created_at", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] commissions.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as CommissionRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToCommission),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 4: Type-check and test**

Run: `bunx tsc --noEmit` — expect no new errors.
Run: `bun run test` — expect all green.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/assetLibrary.ts src/providers/data/impl/supabase/audits.ts src/providers/data/impl/supabase/commissions.ts
git commit -m "fix(providers): remove 1000-row list() ceiling in assetLibrary/audits/commissions"
```

---

## Task 4: Fix `distributionTraces.ts`, `expenses.ts`, `goals.ts` (uniform pattern)

**Files:**
- Modify: `src/providers/data/impl/supabase/distributionTraces.ts:81-111`
- Modify: `src/providers/data/impl/supabase/expenses.ts:209-243`
- Modify: `src/providers/data/impl/supabase/goals.ts:119-146`

**Interfaces:**
- Consumes: `fetchLargePage` from `./_pagination` (Task 1).

- [ ] **Step 1: Update `distributionTraces.ts`**

Current (`src/providers/data/impl/supabase/distributionTraces.ts:81-111`):

```ts
  async list(
    params: IListDistributionTracesParams = {},
  ): Promise<IPaginatedResult<IDistributionTrace>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.selectedSellerId !== undefined)
      query = query.eq("selected_seller_id", params.selectedSellerId);
    if (params.criterionMatched !== undefined)
      query = query.eq("criterion_matched", params.criterionMatched);
    if (params.since !== undefined) query = query.gte("timestamp", params.since);
    if (params.until !== undefined) query = query.lte("timestamp", params.until);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("timestamp", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] distributionTraces.list failed: ${error.message}`);

    return {
      data: (data as unknown as DistributionTraceRow[]).map(rowToTrace),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(
    params: IListDistributionTracesParams = {},
  ): Promise<IPaginatedResult<IDistributionTrace>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.selectedSellerId !== undefined)
        query = query.eq("selected_seller_id", params.selectedSellerId);
      if (params.criterionMatched !== undefined)
        query = query.eq("criterion_matched", params.criterionMatched);
      if (params.since !== undefined) query = query.gte("timestamp", params.since);
      if (params.until !== undefined) query = query.lte("timestamp", params.until);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<DistributionTraceRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("timestamp", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] distributionTraces.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as DistributionTraceRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToTrace),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 2: Update `expenses.ts`**

Current (`src/providers/data/impl/supabase/expenses.ts:209-243`):

```ts
  async list(params: IListExpensesParams = {}): Promise<IPaginatedResult<IExpense>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.categories && params.categories.length > 0) {
      query = query.in("category", params.categories);
    }
    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    }
    if (params.supplier) query = query.ilike("supplier", `%${params.supplier}%`);
    if (params.paymentMethod) query = query.eq("payment_method", params.paymentMethod);
    if (params.competenceStart) query = query.gte("competence_date", params.competenceStart);
    if (params.competenceEnd) query = query.lte("competence_date", params.competenceEnd);
    if (params.paymentStart) query = query.gte("payment_date", params.paymentStart);
    if (params.paymentEnd) query = query.lte("payment_date", params.paymentEnd);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("competence_date", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] expenses.list failed: ${error.message}`);

    return {
      data: (data as unknown as ExpenseRow[]).map(rowToExpense),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListExpensesParams = {}): Promise<IPaginatedResult<IExpense>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.categories && params.categories.length > 0) {
        query = query.in("category", params.categories);
      }
      if (params.statuses && params.statuses.length > 0) {
        query = query.in("status", params.statuses);
      }
      if (params.supplier) query = query.ilike("supplier", `%${params.supplier}%`);
      if (params.paymentMethod) query = query.eq("payment_method", params.paymentMethod);
      if (params.competenceStart) query = query.gte("competence_date", params.competenceStart);
      if (params.competenceEnd) query = query.lte("competence_date", params.competenceEnd);
      if (params.paymentStart) query = query.gte("payment_date", params.paymentStart);
      if (params.paymentEnd) query = query.lte("payment_date", params.paymentEnd);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<ExpenseRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("competence_date", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] expenses.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as ExpenseRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToExpense),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 3: Update `goals.ts`**

Current (`src/providers/data/impl/supabase/goals.ts:119-146`):

```ts
  async list(params: IListGoalsParams = {}): Promise<IPaginatedResult<IGoal>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.level !== undefined) query = query.eq("level", params.level);
    if (params.targetId !== undefined) query = query.eq("target_id", params.targetId);
    if (params.metric !== undefined) query = query.eq("metric", params.metric);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Mirror the mock's sort: most recent period.end first. `period` is jsonb,
    // so order on the extracted `end` text key.
    const { data, error, count } = await query
      .order("period->>end", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] goals.list failed: ${error.message}`);

    return {
      data: (data as unknown as GoalRow[]).map(rowToGoal),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListGoalsParams = {}): Promise<IPaginatedResult<IGoal>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.level !== undefined) query = query.eq("level", params.level);
      if (params.targetId !== undefined) query = query.eq("target_id", params.targetId);
      if (params.metric !== undefined) query = query.eq("metric", params.metric);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    // Mirror the mock's sort: most recent period.end first. `period` is jsonb,
    // so order on the extracted `end` text key.
    const { data, total } = await fetchLargePage<GoalRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("period->>end", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] goals.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as GoalRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToGoal),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 4: Type-check and test**

Run: `bunx tsc --noEmit` — expect no new errors.
Run: `bun run test` — expect all green.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/distributionTraces.ts src/providers/data/impl/supabase/expenses.ts src/providers/data/impl/supabase/goals.ts
git commit -m "fix(providers): remove 1000-row list() ceiling in distributionTraces/expenses/goals"
```

---

## Task 5: Fix `indicators.ts`, `leads.ts`, `orders.ts` (uniform pattern)

**Files:**
- Modify: `src/providers/data/impl/supabase/indicators.ts:116-143`
- Modify: `src/providers/data/impl/supabase/leads.ts:169-199`
- Modify: `src/providers/data/impl/supabase/orders.ts:276-306`

**Interfaces:**
- Consumes: `fetchLargePage` from `./_pagination` (Task 1).

- [ ] **Step 1: Update `indicators.ts`**

Current (`src/providers/data/impl/supabase/indicators.ts:116-143`):

```ts
  async list(params: IListIndicatorsParams = {}): Promise<IPaginatedResult<IProductIndicator>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.scopeLevel !== undefined) query = query.eq("scope_level", params.scopeLevel);
    if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
    if (params.metric !== undefined) query = query.eq("metric", params.metric);
    if (params.status !== undefined) query = query.eq("status", params.status);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // The mock sorts desc by `period.end`; mirror it on the jsonb path.
    const { data, error, count } = await query
      .order("period->>end", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] indicators.list failed: ${error.message}`);

    return {
      data: (data as unknown as IndicatorRow[]).map(rowToIndicator),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListIndicatorsParams = {}): Promise<IPaginatedResult<IProductIndicator>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.scopeLevel !== undefined) query = query.eq("scope_level", params.scopeLevel);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.metric !== undefined) query = query.eq("metric", params.metric);
      if (params.status !== undefined) query = query.eq("status", params.status);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    // The mock sorts desc by `period.end`; mirror it on the jsonb path.
    const { data, total } = await fetchLargePage<IndicatorRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("period->>end", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] indicators.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as IndicatorRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToIndicator),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 2: Update `leads.ts`**

Current (`src/providers/data/impl/supabase/leads.ts:169-199`):

```ts
  async list(params: IListLeadsParams = {}): Promise<IPaginatedResult<ILead>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
    if (params.stageId !== undefined) query = query.eq("stage->>id", params.stageId);
    if (params.temperature !== undefined) query = query.eq("temperature", params.temperature);
    if (params.excludeLost) query = query.is("loss_reason", null);
    if (params.search) {
      const orExpr = buildLeadSearchOr(params.search);
      if (orExpr) query = query.or(orExpr);
    }

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] leads.list failed: ${error.message}`);

    return {
      data: (data as unknown as LeadRow[]).map(rowToLead),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListLeadsParams = {}): Promise<IPaginatedResult<ILead>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.stageId !== undefined) query = query.eq("stage->>id", params.stageId);
      if (params.temperature !== undefined) query = query.eq("temperature", params.temperature);
      if (params.excludeLost) query = query.is("loss_reason", null);
      if (params.search) {
        const orExpr = buildLeadSearchOr(params.search);
        if (orExpr) query = query.or(orExpr);
      }
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<LeadRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("updated_at", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] leads.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as LeadRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToLead),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 3: Update `orders.ts`**

Current (`src/providers/data/impl/supabase/orders.ts:276-306`):

```ts
  async list(params: IListOrdersParams = {}): Promise<IPaginatedResult<IOrder>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
    if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
    if (params.paymentStatus !== undefined)
      query = query.eq("payment_status", params.paymentStatus);
    if (params.fulfillmentStatus !== undefined)
      query = query.eq("fulfillment_status", params.fulfillmentStatus);
    if (params.since !== undefined) query = query.gte("created_at", params.since);
    if (params.until !== undefined) query = query.lte("created_at", params.until);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] orders.list failed: ${error.message}`);

    return {
      data: (data as unknown as OrderRow[]).map(rowToOrder),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListOrdersParams = {}): Promise<IPaginatedResult<IOrder>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
      if (params.paymentStatus !== undefined)
        query = query.eq("payment_status", params.paymentStatus);
      if (params.fulfillmentStatus !== undefined)
        query = query.eq("fulfillment_status", params.fulfillmentStatus);
      if (params.since !== undefined) query = query.gte("created_at", params.since);
      if (params.until !== undefined) query = query.lte("created_at", params.until);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<OrderRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("created_at", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] orders.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as OrderRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToOrder),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 4: Type-check and test**

Run: `bunx tsc --noEmit` — expect no new errors.
Run: `bun run test` — expect all green.

- [ ] **Step 5: Commit**

```bash
git add src/providers/data/impl/supabase/indicators.ts src/providers/data/impl/supabase/leads.ts src/providers/data/impl/supabase/orders.ts
git commit -m "fix(providers): remove 1000-row list() ceiling in indicators/leads/orders"
```

---

## Task 6: Fix `segments.ts`, `transfers.ts` (uniform pattern)

**Files:**
- Modify: `src/providers/data/impl/supabase/segments.ts:62-85`
- Modify: `src/providers/data/impl/supabase/transfers.ts:62-96`

**Interfaces:**
- Consumes: `fetchLargePage` from `./_pagination` (Task 1).

- [ ] **Step 1: Update `segments.ts`**

Current (`src/providers/data/impl/supabase/segments.ts:62-85`):

```ts
  async list(params: IListSegmentsParams = {}): Promise<IPaginatedResult<ICustomerSegment>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.scope !== undefined) query = query.eq("scope", params.scope);
    if (params.ownerId !== undefined) query = query.eq("owner_id", params.ownerId);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw new Error(`[supabase] segments.list failed: ${error.message}`);

    return {
      data: (data as unknown as SegmentRow[]).map(rowToSegment),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListSegmentsParams = {}): Promise<IPaginatedResult<ICustomerSegment>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.scope !== undefined) query = query.eq("scope", params.scope);
      if (params.ownerId !== undefined) query = query.eq("owner_id", params.ownerId);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<SegmentRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("created_at", { ascending: true })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] segments.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as SegmentRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToSegment),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 2: Update `transfers.ts`**

Current (`src/providers/data/impl/supabase/transfers.ts:62-96`):

```ts
  async list(params: IListTransfersParams = {}): Promise<IPaginatedResult<ICarteiraTransfer>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.fromSellerId !== undefined) query = query.eq("from_seller_id", params.fromSellerId);
    if (params.toSellerId !== undefined) query = query.eq("to_seller_id", params.toSellerId);

    if (params.statuses && params.statuses.length > 0) {
      query = query.in("status", params.statuses);
    } else if (params.status !== undefined) {
      query = query.eq("status", params.status);
    }

    if (params.types && params.types.length > 0) query = query.in("type", params.types);
    if (params.since !== undefined) query = query.gte("start_date", params.since);
    if (params.until !== undefined) query = query.lte("start_date", params.until);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("start_date", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] transfers.list failed: ${error.message}`);

    return {
      data: (data as unknown as TransferRow[]).map(rowToTransfer),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListTransfersParams = {}): Promise<IPaginatedResult<ICarteiraTransfer>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.fromSellerId !== undefined)
        query = query.eq("from_seller_id", params.fromSellerId);
      if (params.toSellerId !== undefined) query = query.eq("to_seller_id", params.toSellerId);

      if (params.statuses && params.statuses.length > 0) {
        query = query.in("status", params.statuses);
      } else if (params.status !== undefined) {
        query = query.eq("status", params.status);
      }

      if (params.types && params.types.length > 0) query = query.in("type", params.types);
      if (params.since !== undefined) query = query.gte("start_date", params.since);
      if (params.until !== undefined) query = query.lte("start_date", params.until);
      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<TransferRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order("start_date", { ascending: false })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] transfers.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as TransferRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    return {
      data: data.map(rowToTransfer),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 3: Type-check and test**

Run: `bunx tsc --noEmit` — expect no new errors.
Run: `bun run test` — expect all green.

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/impl/supabase/segments.ts src/providers/data/impl/supabase/transfers.ts
git commit -m "fix(providers): remove 1000-row list() ceiling in segments/transfers"
```

---

## Task 7: Fix `quotes.ts` (special: dynamic order column + post-fetch item enrichment)

`quotes.ts` differs from the uniform pattern in two ways: the `.order()` column is resolved dynamically from `params.orderBy`, and each row is enriched with its line items via `listItems(row.id)` AFTER the range query — that enrichment must run once against the full concatenated result, not once per internal chunk.

**Files:**
- Modify: `src/providers/data/impl/supabase/quotes.ts:243-303`

**Interfaces:**
- Consumes: `fetchLargePage` from `./_pagination` (Task 1).

- [ ] **Step 1: Update `quotes.ts`**

Current (`src/providers/data/impl/supabase/quotes.ts:243-303`):

```ts
  async list(params: IListQuotesParams = {}): Promise<IPaginatedResult<IQuote>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
    if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
    if (params.leadId !== undefined) query = query.eq("lead_id", params.leadId);
    if (params.conversationId !== undefined)
      query = query.eq("conversation_id", params.conversationId);

    if (Array.isArray(params.status)) {
      if (params.status.length > 0) query = query.in("status", params.status);
    } else if (params.status !== undefined) {
      query = query.eq("status", params.status);
    }

    if (Array.isArray(params.origin)) {
      if (params.origin.length > 0) query = query.in("origin", params.origin);
    } else if (params.origin !== undefined) {
      query = query.eq("origin", params.origin);
    }

    if (params.createdAfter !== undefined) query = query.gte("created_at", params.createdAfter);
    if (params.createdBefore !== undefined) query = query.lte("created_at", params.createdBefore);
    if (typeof params.totalMin === "number") query = query.gte("total", params.totalMin);
    if (typeof params.totalMax === "number") query = query.lte("total", params.totalMax);
    if (params.search) {
      const term = `%${params.search}%`;
      query = query.or(`number.ilike.${term},customer_id.ilike.${term}`);
    }

    const orderColumnMap: Record<NonNullable<IListQuotesParams["orderBy"]>, string> = {
      createdAt: "created_at",
      updatedAt: "updated_at",
      total: "total",
      validUntil: "valid_until",
    };
    const orderColumn = orderColumnMap[params.orderBy ?? "updatedAt"];
    const ascending = params.orderDir === "asc";

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.order(orderColumn, { ascending }).range(from, to);

    if (error) throw new Error(`[supabase] quotes.list failed: ${error.message}`);

    const rows = data as unknown as QuoteRow[];
    const quotes = await Promise.all(
      rows.map(async (row) => rowToQuote(row, await listItems(row.id))),
    );

    return {
      data: quotes,
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListQuotesParams = {}): Promise<IPaginatedResult<IQuote>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
      if (params.leadId !== undefined) query = query.eq("lead_id", params.leadId);
      if (params.conversationId !== undefined)
        query = query.eq("conversation_id", params.conversationId);

      if (Array.isArray(params.status)) {
        if (params.status.length > 0) query = query.in("status", params.status);
      } else if (params.status !== undefined) {
        query = query.eq("status", params.status);
      }

      if (Array.isArray(params.origin)) {
        if (params.origin.length > 0) query = query.in("origin", params.origin);
      } else if (params.origin !== undefined) {
        query = query.eq("origin", params.origin);
      }

      if (params.createdAfter !== undefined) query = query.gte("created_at", params.createdAfter);
      if (params.createdBefore !== undefined)
        query = query.lte("created_at", params.createdBefore);
      if (typeof params.totalMin === "number") query = query.gte("total", params.totalMin);
      if (typeof params.totalMax === "number") query = query.lte("total", params.totalMax);
      if (params.search) {
        const term = `%${params.search}%`;
        query = query.or(`number.ilike.${term},customer_id.ilike.${term}`);
      }

      return query;
    };

    const orderColumnMap: Record<NonNullable<IListQuotesParams["orderBy"]>, string> = {
      createdAt: "created_at",
      updatedAt: "updated_at",
      total: "total",
      validUntil: "valid_until",
    };
    const orderColumn = orderColumnMap[params.orderBy ?? "updatedAt"];
    const ascending = params.orderDir === "asc";

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<QuoteRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order(orderColumn, { ascending })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] quotes.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as QuoteRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    // Item enrichment runs once against the FULL concatenated set, not per
    // internal 1000-row chunk — moving it here (vs. inside fetchChunk) keeps
    // one listItems() call per quote regardless of how many chunks it took.
    const quotes = await Promise.all(
      data.map(async (row) => rowToQuote(row, await listItems(row.id))),
    );

    return {
      data: quotes,
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 2: Type-check and test**

Run: `bunx tsc --noEmit` — expect no new errors.
Run: `bun run test` — expect all green.

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/supabase/quotes.ts
git commit -m "fix(providers): remove 1000-row list() ceiling in quotes.list()

Item enrichment (listItems per row) now runs once against the full
concatenated result instead of relying on a single-chunk assumption."
```

---

## Task 8: Fix `recommendations.ts` (special: no `.order()`, client-side sort must run on the full set)

`recommendations.ts` has no `.order()` clause at all — priority ordering is done in memory AFTER the range query, sorting only whatever came back in that one page. With multi-chunk fetches, sorting must happen once on the full concatenated result, not per chunk (otherwise only each 1000-row slice would be internally sorted, not the whole requested page).

**Files:**
- Modify: `src/providers/data/impl/supabase/recommendations.ts:77-112`

**Interfaces:**
- Consumes: `fetchLargePage` from `./_pagination` (Task 1).

- [ ] **Step 1: Update `recommendations.ts`**

Current (`src/providers/data/impl/supabase/recommendations.ts:77-112`):

```ts
  async list(params: IListRecommendationsParams = {}): Promise<IPaginatedResult<IRecommendation>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
    if (params.subjectId !== undefined) query = query.eq("subject_id", params.subjectId);
    if (typeof params.resolved === "boolean") query = query.eq("resolved", params.resolved);

    if (params.type) {
      const allowed = Array.isArray(params.type) ? params.type : [params.type];
      query = query.in("type", allowed);
    }

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) throw new Error(`[supabase] recommendations.list failed: ${error.message}`);

    // The mock sorts the full set by priority descending before paginating.
    // PostgREST cannot order by a CASE-derived rank, so the slice is sorted in
    // memory; deterministic among the page for matching the mock's surfacing.
    const sorted = (data as unknown as RecommendationRow[])
      .slice()
      .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);

    return {
      data: sorted.map(rowToRecommendation),
      total: count ?? 0,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListRecommendationsParams = {}): Promise<IPaginatedResult<IRecommendation>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });
      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.subjectId !== undefined) query = query.eq("subject_id", params.subjectId);
      if (typeof params.resolved === "boolean") query = query.eq("resolved", params.resolved);

      if (params.type) {
        const allowed = Array.isArray(params.type) ? params.type : [params.type];
        query = query.in("type", allowed);
      }

      return query;
    };

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<RecommendationRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery().range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] recommendations.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as RecommendationRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    // The mock sorts the full set by priority descending before paginating.
    // PostgREST cannot order by a CASE-derived rank, so the concatenated set is
    // sorted in memory ONCE here — sorting must happen after all chunks are
    // gathered (not inside fetchChunk), otherwise each 1000-row chunk would
    // only be internally sorted, not the full requested page.
    const sorted = data
      .slice()
      .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);

    return {
      data: sorted.map(rowToRecommendation),
      total,
      page,
      pageSize,
    };
  },
```

Add near the top: `import { fetchLargePage } from "./_pagination";`

- [ ] **Step 2: Type-check and test**

Run: `bunx tsc --noEmit` — expect no new errors.
Run: `bun run test` — expect all green.

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/supabase/recommendations.ts
git commit -m "fix(providers): remove 1000-row list() ceiling in recommendations.list()

Priority sort now runs once on the full concatenated result instead of
per-chunk, so a multi-chunk fetch is globally sorted, not just per 1000-row
slice."
```

---

## Task 9: Fix `messages.ts` plain `list()` (RPC-backed — precautionary, not a live bug)

`messages.ts`'s `list()` reads a single conversation's thread via the `conversation_messages` RPC (`p_limit`/`p_offset`), not a raw table query — no `buildQuery()` factory is needed here, just loop the RPC call itself. `listForAnalytics()` in the same file already has its own correct `drainPaged` solution — do not touch it.

**Files:**
- Modify: `src/providers/data/impl/supabase/messages.ts:106-135`

**Interfaces:**
- Consumes: nothing from Task 1 — this method loops the RPC call directly (see rationale in Step 1) rather than going through `fetchLargePage`, which assumes a real row count the RPC doesn't provide.

- [ ] **Step 1: Update `messages.ts`**

Current (`src/providers/data/impl/supabase/messages.ts:106-135`):

```ts
  async list(params: IListMessagesParams): Promise<IPaginatedResult<IMessage>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));

    // Read the page via the SECURITY DEFINER `conversation_messages` RPC, which
    // checks `can_access_conversation` ONCE (constant arg) instead of the
    // `messages_select` RLS evaluating it PER ROW. The per-row evaluation cost
    // ~3ms × up to 200 rows ≈ 640ms for a large conversation (EXPLAIN: SubPlan
    // loops=200), and under rapid conversation switching it piled up past the 8s
    // statement_timeout → 500 on /messages. Gating once + the
    // (conversation_id, sent_at) index brings a page to ~8ms. Same rows, order
    // and pagination as the old table query; no caller depends on an exact
    // `total` (pagination drives off full-vs-short page — see useMessages).
    const { data, error } = await getSupabaseClient().rpc("conversation_messages", {
      p_conversation_id: params.conversationId,
      p_limit: pageSize,
      p_offset: (page - 1) * pageSize,
      p_order_dir: params.orderDir === "desc" ? "desc" : "asc",
    });

    if (error) throw new Error(`[supabase] messages.list failed: ${error.message}`);

    const rows = (data ?? []) as unknown as MessageRow[];
    return {
      data: rows.map(rowToMessage),
      total: (page - 1) * pageSize + rows.length,
      page,
      pageSize,
    };
  },
```

Replace with:

```ts
  async list(params: IListMessagesParams): Promise<IPaginatedResult<IMessage>> {
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const orderDir = params.orderDir === "desc" ? "desc" : "asc";

    // Read via the SECURITY DEFINER `conversation_messages` RPC, which checks
    // can_access_conversation ONCE instead of per-row RLS (see historical
    // comment in git blame — statement_timeout incident on /messages). No
    // caller depends on an exact `total` (pagination drives off full-vs-short
    // page — see useMessages), so this loops the RPC directly in ≤1000-row
    // chunks instead of going through fetchLargePage, which assumes a real
    // row count the RPC doesn't provide.
    const rows: MessageRow[] = [];
    let offset = from;
    const end = from + pageSize;
    while (offset < end) {
      const limit = Math.min(1000, end - offset);
      const { data, error } = await getSupabaseClient().rpc("conversation_messages", {
        p_conversation_id: params.conversationId,
        p_limit: limit,
        p_offset: offset,
        p_order_dir: orderDir,
      });
      if (error) throw new Error(`[supabase] messages.list failed: ${error.message}`);
      const chunk = (data ?? []) as unknown as MessageRow[];
      rows.push(...chunk);
      offset += chunk.length;
      if (chunk.length < limit) break;
    }

    return {
      data: rows.map(rowToMessage),
      total: from + rows.length,
      page,
      pageSize,
    };
  },
```

No new import needed — this method no longer needs `fetchLargePage`.

- [ ] **Step 2: Type-check and test**

Run: `bunx tsc --noEmit` — expect no new errors.
Run: `bun run test` — expect all green.

- [ ] **Step 3: Commit**

```bash
git add src/providers/data/impl/supabase/messages.ts
git commit -m "fix(providers): remove 1000-row list() ceiling in messages.list()

listForAnalytics() and its drainPaged helper are untouched — already correct."
```

---

## Self-Review Notes

- **Spec coverage:** all 17 providers with the `Math.min(1000, ...)` clamp identified during planning are covered by Tasks 2–9 (parts, customers, assetLibrary, audits, commissions, distributionTraces, expenses, goals, indicators, leads, orders, segments, transfers, quotes, recommendations, messages) except `conversations.ts` (deliberately excluded, documented in Global Constraints) and `managerDashboard.ts` (already correct, no fix needed).
- **Placeholder scan:** every task shows complete current code and complete replacement code — no "apply similar pattern" references.
- **Type consistency:** Tasks 2–8 all import the same `fetchLargePage<T>(fetchChunk, from, pageSize): Promise<{data: T[], total: number}>` signature from Task 1; every provider's row type (`PartRow`, `CustomerRow`, `AssetRow`, `AuditLogRow`, `CommissionRow`, `DistributionTraceRow`, `ExpenseRow`, `GoalRow`, `IndicatorRow`, `LeadRow`, `OrderRow`, `SegmentRow`, `TransferRow`, `QuoteRow`, `RecommendationRow`) matches what that file already declares and maps via its existing `rowToX` function. Task 9 (`messages.ts`) deliberately does NOT use `fetchLargePage` — its RPC has no real row count, so it loops directly (see Task 9 rationale).
- **Not in scope:** the ~68 consumer call sites (`useIndicatorAutoStatusUpdate.ts`, `usePartsIndex.ts`, catalog filter-options fetch, etc.) need NO changes — once these providers stop clamping at 1000, every existing `pageSize: 2000/5000` request already in those files starts returning the real full set automatically. A follow-up plan (catalog server-side filtering/pagination redesign) is still needed separately for `CatalogListPage.tsx` / `useCatalogList.ts` — that is a genuine UI-facing pagination/filter-pushdown redesign, not a truncation bug, and depends on this plan landing first.
