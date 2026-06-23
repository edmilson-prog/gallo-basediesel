# Assignment Filter Multi-Select — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every user multi-select / combine the Inbox "Atribuição" filter (OR semantics) instead of single-select.

**Architecture:** The filter state holds an array of assignment tokens (`me` | `unassigned` | `queue` | seller-id). The URL keeps a CSV string (sentinel `all` for the explicit empty/"Todas" set); only the in-memory state becomes an array. `filtersToListParams` resolves the tokens into a new `assignmentAny` provider param (OR across seller-ids / pool / queue). The mock provider ORs in memory; the supabase provider composes a PostgREST `.or()` for the table path and passes new array/flag params to the `search_conversations` RPC (extended additively for the text-search path). The role gate that hides "Por vendedor"/"Todas" from non-staff is unchanged.

**Tech Stack:** React 19, TanStack Router (URL state), shadcn DropdownMenu, Supabase (PostgREST + SQL RPC), Vitest.

## Global Constraints

- Comments in English; user-facing copy in pt-BR with correct accents.
- `camelCase` vars/functions, `PascalCase` types/components, `snake_case` DB columns.
- Provider Pattern: features consume data only via `@/providers/data` barrel; the supabase/mock impls live behind the contract.
- TypeScript `strict`; avoid `any`. Domain interfaces prefixed `I`.
- The practical CI gate is `bun run build` + `bun run test` (`bun run build` does NOT type-check; run `bunx tsc --noEmit` and judge NEW code by delta).
- No RLS change, no permission-gate change (`canSeeAllAssignments` stays).
- Migration: every `apply_migration` must be mirrored in `supabase/migrations/` (it already is — we author the file there).

---

### Task 1: Filter state as assignment tokens + params mapping

**Files:**
- Modify: `src/providers/data/contracts/conversations.ts` (add `assignmentAny` to `IListConversationsParams`)
- Modify: `src/features/conversations/hooks/useInboxFilters.ts`
- Test: `src/features/conversations/hooks/useInboxFilters.test.ts` (create)

**Interfaces:**
- Produces:
  - `IInboxFiltersState.assignment: string[]` (tokens)
  - `parseAssignmentTokens(raw: string | undefined, currentSellerId: ID | null): string[]`
  - `serializeAssignmentTokens(tokens: string[], currentSellerId: ID | null): string | undefined`
  - `filtersToListParams(filters, { currentSellerId }) → params.assignmentAny?: { sellerIds?: ID[]; unassigned?: boolean; queue?: boolean }`
  - `setAssignment(tokens: string[]): void`
- Consumes: existing `apply`/`navigate` URL plumbing.

- [ ] **Step 1: Add the contract param**

In `src/providers/data/contracts/conversations.ts`, inside `IListConversationsParams` (right after the `unassigned?: boolean;` field, before `orderBy`):

```ts
  /**
   * Combined assignment filter (Inbox multi-select). OR across the provided
   * criteria; when omitted/empty, NO assignment constraint is applied. Coexists
   * with the scalar `assignedSellerId`/`unassigned`/`isSdrActive` used by other
   * callers (customer detail, dashboards) — the Inbox uses this instead.
   */
  assignmentAny?: {
    /** Specific assigned sellers (already includes "me" resolved to an id). */
    sellerIds?: ID[];
    /** Pool: `assigned_seller_id IS NULL`. */
    unassigned?: boolean;
    /** Queue: pool + `is_sdr_active=false` + `status='aguardando'`. */
    queue?: boolean;
  };
```

- [ ] **Step 2: Write the failing test**

Create `src/features/conversations/hooks/useInboxFilters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseAssignmentTokens,
  serializeAssignmentTokens,
  filtersToListParams,
  type IInboxFiltersState,
} from "./useInboxFilters";

const SELLER = "seller-1";

function baseState(over: Partial<IInboxFiltersState> = {}): IInboxFiltersState {
  return {
    status: "all",
    channel: "all",
    assignment: ["me"],
    instance: "all",
    tags: [],
    period: "all",
    search: "",
    sort: "lastMessage",
    escalated: false,
    ...over,
  };
}

describe("parseAssignmentTokens", () => {
  it("defaults to ['me'] for a seller and [] without one", () => {
    expect(parseAssignmentTokens(undefined, SELLER)).toEqual(["me"]);
    expect(parseAssignmentTokens(undefined, null)).toEqual([]);
  });
  it("maps the `all` sentinel to the empty set", () => {
    expect(parseAssignmentTokens("all", SELLER)).toEqual([]);
  });
  it("splits CSV, trims, de-dups, preserves order", () => {
    expect(parseAssignmentTokens("me, unassigned ,me,queue", SELLER)).toEqual([
      "me",
      "unassigned",
      "queue",
    ]);
  });
  it("accepts a legacy single value", () => {
    expect(parseAssignmentTokens("queue", SELLER)).toEqual(["queue"]);
  });
});

describe("serializeAssignmentTokens", () => {
  it("omits the default (undefined → clean URL)", () => {
    expect(serializeAssignmentTokens(["me"], SELLER)).toBeUndefined();
    expect(serializeAssignmentTokens([], null)).toBeUndefined();
  });
  it("serializes the empty set to the `all` sentinel for a seller", () => {
    expect(serializeAssignmentTokens([], SELLER)).toBe("all");
  });
  it("joins multiple tokens as CSV", () => {
    expect(serializeAssignmentTokens(["me", "unassigned"], SELLER)).toBe("me,unassigned");
  });
});

describe("filtersToListParams — assignment", () => {
  it("resolves ['me'] to assignmentAny.sellerIds=[currentSellerId]", () => {
    const p = filtersToListParams(baseState({ assignment: ["me"] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER] });
  });
  it("ORs me + unassigned + a specific seller", () => {
    const p = filtersToListParams(baseState({ assignment: ["me", "unassigned", "seller-9"] }), {
      currentSellerId: SELLER,
    });
    expect(p.assignmentAny).toEqual({ sellerIds: [SELLER, "seller-9"], unassigned: true });
  });
  it("queue does NOT force the global status filter", () => {
    const p = filtersToListParams(baseState({ assignment: ["queue"] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toEqual({ queue: true });
    // status stays the default 'all' expansion, not pinned to 'aguardando'
    expect(p.status).toEqual(["aguardando", "em_andamento", "aguardando_cliente", "resolvida"]);
  });
  it("empty set (Todas) applies no assignment constraint", () => {
    const p = filtersToListParams(baseState({ assignment: [] }), { currentSellerId: SELLER });
    expect(p.assignmentAny).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bunx vitest run src/features/conversations/hooks/useInboxFilters.test.ts`
Expected: FAIL (exports `parseAssignmentTokens`/`serializeAssignmentTokens` missing; `assignment` is a string).

- [ ] **Step 4: Implement — change the state model + helpers**

In `src/features/conversations/hooks/useInboxFilters.ts`:

(a) Change the state type — replace `assignment: AssignmentFilter;` in `IInboxFiltersState` with:

```ts
  /** Assignment tokens (multi-select, OR). [] === "Todas" (no constraint). */
  assignment: string[];
```

(b) Below the `VALID_*` sets add the sentinel + helpers (keep `AssignmentFilter` export for back-compat of the token union):

```ts
/** URL sentinel for the explicit empty set ("Todas") so it is distinguishable
 *  from the default in the query string. */
const ASSIGNMENT_ALL = "all";

function defaultAssignmentTokens(currentSellerId: ID | null): string[] {
  return currentSellerId ? ["me"] : [];
}

export function parseAssignmentTokens(
  raw: string | undefined,
  currentSellerId: ID | null,
): string[] {
  if (raw === undefined) return defaultAssignmentTokens(currentSellerId);
  if (raw === ASSIGNMENT_ALL) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (token.length > 0 && !seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out;
}

export function serializeAssignmentTokens(
  tokens: string[],
  currentSellerId: ID | null,
): string | undefined {
  const uniq = Array.from(new Set(tokens));
  const def = defaultAssignmentTokens(currentSellerId);
  if (uniq.length === def.length && uniq.every((t, i) => t === def[i])) return undefined;
  if (uniq.length === 0) return ASSIGNMENT_ALL;
  return uniq.join(",");
}
```

(c) Update `DEFAULT_FILTERS.assignment` to `["me"]`.

(d) In `readState`, replace the `assignment:` line with:

```ts
    assignment: parseAssignmentTokens(search.assignment, currentSellerId),
```

(e) Replace the `setAssignment` setter in the returned object with:

```ts
    setAssignment: (tokens) =>
      apply({ assignment: serializeAssignmentTokens(tokens, currentSellerId) }),
```

and change the return-type annotation `setAssignment: (assignment: AssignmentFilter) => void;` to `setAssignment: (tokens: string[]) => void;`.

(f) Make `countActive` aware of the seller-relative default — change its signature and the call site:

```ts
function countActive(filters: IInboxFiltersState, currentSellerId: ID | null): number {
  let n = 0;
  if (filters.status !== DEFAULT_FILTERS.status) n += 1;
  if (filters.channel !== DEFAULT_FILTERS.channel) n += 1;
  if (serializeAssignmentTokens(filters.assignment, currentSellerId) !== undefined) n += 1;
  if (filters.instance !== DEFAULT_FILTERS.instance) n += 1;
  if (filters.tags.length > 0) n += 1;
  if (filters.period !== DEFAULT_FILTERS.period) n += 1;
  if (filters.search.length > 0) n += 1;
  if (filters.escalated) n += 1;
  return n;
}
```

and the call site: `activeCount: countActive(filters, currentSellerId),`.

(g) Replace the entire `// Assignment.` block in `filtersToListParams` (the `if (filters.assignment === "me" ...) ... else if (...assignment !== "all" && ...!== "me")` chain) with:

```ts
  // Assignment — multi-select OR. Resolve "me" → the current seller id; the
  // queue's status/SDR constraints ride INSIDE the OR term (assignmentAny.queue),
  // so they never pin the global status filter. Empty set === "Todas" (no
  // assignment constraint at all).
  if (filters.assignment.length > 0) {
    const sellerIds: ID[] = [];
    let unassigned = false;
    let queue = false;
    for (const token of filters.assignment) {
      if (token === "me") {
        if (ctx.currentSellerId) sellerIds.push(ctx.currentSellerId);
      } else if (token === "unassigned") {
        unassigned = true;
      } else if (token === "queue") {
        queue = true;
      } else {
        sellerIds.push(token);
      }
    }
    const assignmentAny: { sellerIds?: ID[]; unassigned?: boolean; queue?: boolean } = {};
    if (sellerIds.length > 0) assignmentAny.sellerIds = Array.from(new Set(sellerIds));
    if (unassigned) assignmentAny.unassigned = true;
    if (queue) assignmentAny.queue = true;
    if (Object.keys(assignmentAny).length > 0) params.assignmentAny = assignmentAny;
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bunx vitest run src/features/conversations/hooks/useInboxFilters.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/contracts/conversations.ts src/features/conversations/hooks/useInboxFilters.ts src/features/conversations/hooks/useInboxFilters.test.ts
git commit -m "feat(conversations): assignment filter state as multi-select tokens"
```

---

### Task 2: Mock provider — OR over assignmentAny

**Files:**
- Modify: `src/mocks/api/conversations.ts` (params type + `matchesAssignmentAny` + filter line)
- Test: `src/mocks/api/conversations.test.ts` (create)

**Interfaces:**
- Consumes: `assignmentAny` shape from the contract (Task 1).
- Produces: `matchesAssignmentAny(conv, assignmentAny): boolean` (exported, pure).

- [ ] **Step 1: Write the failing test**

Create `src/mocks/api/conversations.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { matchesAssignmentAny } from "./conversations";
import type { IConversation } from "@/shared/types";

function conv(over: Partial<IConversation>): IConversation {
  return {
    assignedSellerId: undefined,
    isSdrActive: false,
    status: "aguardando",
    ...(over as object),
  } as IConversation;
}

describe("matchesAssignmentAny", () => {
  it("matches a specific seller", () => {
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s1" }), { sellerIds: ["s1"] })).toBe(true);
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s2" }), { sellerIds: ["s1"] })).toBe(false);
  });
  it("matches the pool with unassigned", () => {
    expect(matchesAssignmentAny(conv({ assignedSellerId: undefined }), { unassigned: true })).toBe(true);
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s1" }), { unassigned: true })).toBe(false);
  });
  it("matches the queue (pool + sdr off + aguardando)", () => {
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, isSdrActive: false, status: "aguardando" }), {
        queue: true,
      }),
    ).toBe(true);
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, isSdrActive: true, status: "aguardando" }), {
        queue: true,
      }),
    ).toBe(false);
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, status: "em_andamento" }), { queue: true }),
    ).toBe(false);
  });
  it("ORs criteria together", () => {
    const c = conv({ assignedSellerId: "s9" });
    expect(matchesAssignmentAny(c, { sellerIds: ["s1"], unassigned: true })).toBe(false);
    expect(matchesAssignmentAny(c, { sellerIds: ["s9"], unassigned: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/mocks/api/conversations.test.ts`
Expected: FAIL ("matchesAssignmentAny is not a function").

- [ ] **Step 3: Implement**

In `src/mocks/api/conversations.ts`:

(a) Add `assignmentAny` to the local `IListConversationsParams` interface (after `unassigned?: boolean;`):

```ts
  assignmentAny?: {
    sellerIds?: ID[];
    unassigned?: boolean;
    queue?: boolean;
  };
```

(b) Add the exported predicate near the top of the file (after the imports / before `list`):

```ts
/**
 * OR predicate for the Inbox multi-select assignment filter. A conversation
 * matches when it satisfies ANY provided criterion (specific seller, pool, or
 * queue). An empty/criterion-less object matches nothing — callers must skip the
 * filter entirely in that case (no criteria === "Todas" === no constraint).
 */
export function matchesAssignmentAny(
  conversation: IConversation,
  assignmentAny: { sellerIds?: ID[]; unassigned?: boolean; queue?: boolean },
): boolean {
  const { sellerIds, unassigned, queue } = assignmentAny;
  if (sellerIds && conversation.assignedSellerId && sellerIds.includes(conversation.assignedSellerId))
    return true;
  if (unassigned && !conversation.assignedSellerId) return true;
  if (
    queue &&
    !conversation.assignedSellerId &&
    !conversation.isSdrActive &&
    conversation.status === "aguardando"
  )
    return true;
  return false;
}
```

(c) In the `list` filter chain, right after the `if (params.unassigned) ...` line, add:

```ts
        if (
          params.assignmentAny &&
          (params.assignmentAny.sellerIds?.length ||
            params.assignmentAny.unassigned ||
            params.assignmentAny.queue)
        )
          all = all.filter((c) => matchesAssignmentAny(c, params.assignmentAny!));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/mocks/api/conversations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mocks/api/conversations.ts src/mocks/api/conversations.test.ts
git commit -m "feat(conversations): mock OR filter for combined assignment"
```

---

### Task 3: Supabase provider — `.or()` builder + RPC params

**Files:**
- Create: `src/providers/data/impl/supabase/assignmentFilter.ts`
- Modify: `src/providers/data/impl/supabase/conversations.ts`
- Test: `src/providers/data/impl/supabase/assignmentFilter.test.ts` (create)

**Interfaces:**
- Produces: `buildAssignmentOrFilter(assignmentAny): string | null` — a PostgREST `.or()` argument, or `null` when there is no criterion.
- Consumes: `assignmentAny` shape (Task 1); the `search_conversations` RPC params `p_assigned_seller_ids` / `p_include_queue` (Task 4).

- [ ] **Step 1: Write the failing test**

Create `src/providers/data/impl/supabase/assignmentFilter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildAssignmentOrFilter } from "./assignmentFilter";

describe("buildAssignmentOrFilter", () => {
  it("returns null with no criteria", () => {
    expect(buildAssignmentOrFilter(undefined)).toBeNull();
    expect(buildAssignmentOrFilter({})).toBeNull();
    expect(buildAssignmentOrFilter({ sellerIds: [] })).toBeNull();
  });
  it("builds a seller IN term", () => {
    expect(buildAssignmentOrFilter({ sellerIds: ["a", "b"] })).toBe("assigned_seller_id.in.(a,b)");
  });
  it("builds the pool term", () => {
    expect(buildAssignmentOrFilter({ unassigned: true })).toBe("assigned_seller_id.is.null");
  });
  it("builds the queue term as a nested and()", () => {
    expect(buildAssignmentOrFilter({ queue: true })).toBe(
      "and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)",
    );
  });
  it("joins multiple criteria with commas (OR)", () => {
    expect(buildAssignmentOrFilter({ sellerIds: ["a"], unassigned: true, queue: true })).toBe(
      "assigned_seller_id.in.(a),assigned_seller_id.is.null,and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/providers/data/impl/supabase/assignmentFilter.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the builder**

Create `src/providers/data/impl/supabase/assignmentFilter.ts`:

```ts
import type { ID } from "@/shared/types";

export interface IAssignmentAny {
  sellerIds?: ID[];
  unassigned?: boolean;
  queue?: boolean;
}

/**
 * Compose a PostgREST `.or()` argument for the Inbox combined assignment filter.
 * Each selected criterion becomes one OR term; the queue is a nested `and(...)`
 * so its pool/SDR/status constraints stay scoped to that term (they must not
 * pin the global status filter). Returns `null` when no criterion is set, so the
 * caller skips `.or()` entirely ("Todas" === no assignment constraint).
 */
export function buildAssignmentOrFilter(assignmentAny: IAssignmentAny | undefined): string | null {
  if (!assignmentAny) return null;
  const terms: string[] = [];
  if (assignmentAny.sellerIds && assignmentAny.sellerIds.length > 0) {
    terms.push(`assigned_seller_id.in.(${assignmentAny.sellerIds.join(",")})`);
  }
  if (assignmentAny.unassigned) terms.push("assigned_seller_id.is.null");
  if (assignmentAny.queue) {
    terms.push("and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)");
  }
  return terms.length > 0 ? terms.join(",") : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/providers/data/impl/supabase/assignmentFilter.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the table query**

In `src/providers/data/impl/supabase/conversations.ts`:

(a) Add the import near the other local imports:

```ts
import { buildAssignmentOrFilter } from "./assignmentFilter";
```

(b) In `list`, right after the `if (params.unassigned) query = query.is("assigned_seller_id", null);` line, add:

```ts
    const assignmentOr = buildAssignmentOrFilter(params.assignmentAny);
    if (assignmentOr) query = query.or(assignmentOr);
```

- [ ] **Step 6: Wire the search RPC params**

In `searchConversations` (same file), add two params to the `.rpc("search_conversations", { ... })` object (after `p_unassigned`):

```ts
    p_assigned_seller_ids:
      params.assignmentAny?.sellerIds && params.assignmentAny.sellerIds.length > 0
        ? params.assignmentAny.sellerIds
        : null,
    p_include_queue: params.assignmentAny?.queue ?? false,
```

and change the existing `p_unassigned` line to also honor the combined pool flag:

```ts
    p_unassigned: params.unassigned ?? params.assignmentAny?.unassigned ?? false,
```

- [ ] **Step 7: Run the supabase test + full suite**

Run: `bunx vitest run src/providers/data/impl/supabase/assignmentFilter.test.ts && bun run test`
Expected: PASS (no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/providers/data/impl/supabase/assignmentFilter.ts src/providers/data/impl/supabase/assignmentFilter.test.ts src/providers/data/impl/supabase/conversations.ts
git commit -m "feat(conversations): supabase OR assignment filter (table + search RPC params)"
```

---

### Task 4: Migration — extend `search_conversations` for combined assignment

**Files:**
- Create: `supabase/migrations/<TIMESTAMP>_search_conversations_assignment_any.sql`

**Interfaces:**
- Produces: `search_conversations(...)` accepting `p_assigned_seller_ids uuid[]` + `p_include_queue boolean` (additive superset; old params kept).

- [ ] **Step 1: Pick a timestamp later than the latest migration**

Run: `ls supabase/migrations | sort | tail -3`
Use a 14-digit `YYYYMMDDHHMMSS` strictly greater than the last one (e.g. `20260623120000`).

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/<TIMESTAMP>_search_conversations_assignment_any.sql`:

```sql
-- Extend search_conversations for the Inbox combined (multi-select) assignment
-- filter. Additive + backward-compatible: the old scalar params are kept (so the
-- pre-deploy frontend keeps working), and two new params drive the OR:
--   p_assigned_seller_ids uuid[]  — any of these sellers
--   p_include_queue       boolean — pool + SDR off + status 'aguardando'
-- The assignment predicate is an OR group; when NO assignment criterion is set,
-- it imposes no constraint (the "Todas" case). SECURITY DEFINER, can_access gate
-- and all other filters are UNCHANGED.
--
-- Signature changes (new args) → DROP the old function then CREATE the superset.

drop function if exists public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer
);

create or replace function public.search_conversations(
  p_search text,
  p_store_id uuid default null,
  p_status text[] default null,
  p_channel text default null,
  p_whatsapp_account_id uuid default null,
  p_assigned_seller_id uuid default null,
  p_unassigned boolean default false,
  p_is_sdr_active boolean default null,
  p_tags text[] default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_order_dir text default 'desc',
  p_limit integer default 30,
  p_offset integer default 0,
  p_assigned_seller_ids uuid[] default null,
  p_include_queue boolean default false
)
returns table (
  id uuid,
  store_id uuid,
  customer_id uuid,
  lead_id text,
  assigned_seller_id uuid,
  channel text,
  whatsapp_account_id uuid,
  status text,
  is_sdr_active boolean,
  tags text[],
  linked_order_id text,
  last_message_at timestamptz,
  unread_count integer,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path to ''
as $$
  with q as (select '%' || coalesce(trim(p_search), '') || '%' as term)
  select
    c.id,
    c.store_id,
    c.customer_id,
    c.lead_id,
    c.assigned_seller_id,
    c.channel,
    c.whatsapp_account_id,
    c.status,
    c.is_sdr_active,
    c.tags,
    c.linked_order_id,
    c.last_message_at,
    c.unread_count,
    c.created_at,
    count(*) over () as total_count
  from public.conversations c, q
  where
    public.can_access_conversation(c.id)
    and (p_store_id is null or c.store_id = p_store_id)
    and (p_status is null or c.status = any (p_status))
    and (p_channel is null or c.channel = p_channel)
    and (p_whatsapp_account_id is null or c.whatsapp_account_id = p_whatsapp_account_id)
    and (
      -- no assignment criterion at all → no constraint
      ( p_assigned_seller_id is null
        and (p_assigned_seller_ids is null or cardinality(p_assigned_seller_ids) = 0)
        and not p_unassigned
        and not p_include_queue )
      or (p_assigned_seller_id is not null and c.assigned_seller_id = p_assigned_seller_id)
      or (p_assigned_seller_ids is not null and c.assigned_seller_id = any (p_assigned_seller_ids))
      or (p_unassigned and c.assigned_seller_id is null)
      or (p_include_queue and c.assigned_seller_id is null
            and c.is_sdr_active = false and c.status = 'aguardando')
    )
    and (p_is_sdr_active is null or c.is_sdr_active = p_is_sdr_active)
    and (p_tags is null or c.tags && p_tags)
    and (p_from_date is null or c.last_message_at >= p_from_date)
    and (p_to_date is null or c.last_message_at <= p_to_date)
    and (
      exists (
        select 1 from public.customers cu
        where cu.id = c.customer_id
          and (cu.full_name ilike q.term or cu.nome_fantasia ilike q.term or cu.phone ilike q.term)
      )
      or exists (
        select 1 from public.leads l
        where l.id::text = c.lead_id
          and (l.name ilike q.term or l.phone ilike q.term)
      )
      or exists (
        select 1 from public.messages m
        where m.conversation_id = c.id
          and m.text ilike q.term
      )
    )
  order by
    case when p_order_dir = 'asc' then c.last_message_at end asc,
    case when p_order_dir <> 'asc' then c.last_message_at end desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
) from public, anon;
grant execute on function public.search_conversations(
  text, uuid, text[], text, uuid, uuid, boolean, boolean, text[], timestamptz, timestamptz, text, integer, integer, uuid[], boolean
) to authenticated;
```

- [ ] **Step 3: Self-review the SQL**

Confirm: param order matches the DROP signature + the existing client call (named params, so order is non-binding for PostgREST but keep the old args first); the OR group's "no-criterion" branch yields all rows; `can_access_conversation` gate and grants intact.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<TIMESTAMP>_search_conversations_assignment_any.sql
git commit -m "feat(conversations): search_conversations RPC accepts combined assignment"
```

> ⚠️ **Prod apply is a separate, owner-authorized step** (the DB-deploy workflow is no-op): apply via MCP `execute_sql` (begin/commit), idempotent, register the version = file name, BEFORE the frontend merge/deploy. Not part of the code tasks.

---

### Task 5: Dropdown UI (checkboxes) + trigger label + i18n + page wiring

**Files:**
- Create: `src/features/conversations/utils/assignmentLabel.ts`
- Test: `src/features/conversations/utils/assignmentLabel.test.ts` (create)
- Modify: `src/features/conversations/i18n/pt-BR.ts`
- Modify: `src/features/conversations/components/InboxFilters.tsx`
- Modify: `src/features/conversations/pages/InboxPage.tsx`

**Interfaces:**
- Consumes: `state.assignment: string[]` + `onAssignment(tokens: string[])` (Task 1).
- Produces: `assignmentTriggerLabel(tokens, sellers, strings): string`.

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/utils/assignmentLabel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assignmentTriggerLabel } from "./assignmentLabel";
import type { ISeller } from "@/shared/types";

const STRINGS = {
  me: "Atribuídas a mim",
  unassigned: "Sem atribuição",
  queue: "Em fila",
  all: "Todas",
  seller: "Por vendedor",
  selectedCount: (n: number) => `${n} selecionados`,
};
const SELLERS = [{ id: "s1", fullName: "Lucas Costa" }] as ISeller[];

describe("assignmentTriggerLabel", () => {
  it("shows 'Todas' for the empty set", () => {
    expect(assignmentTriggerLabel([], SELLERS, STRINGS)).toBe("Todas");
  });
  it("shows the single token label", () => {
    expect(assignmentTriggerLabel(["me"], SELLERS, STRINGS)).toBe("Atribuídas a mim");
    expect(assignmentTriggerLabel(["queue"], SELLERS, STRINGS)).toBe("Em fila");
    expect(assignmentTriggerLabel(["s1"], SELLERS, STRINGS)).toBe("Lucas Costa");
  });
  it("falls back to the seller label when the id is unknown", () => {
    expect(assignmentTriggerLabel(["s9"], SELLERS, STRINGS)).toBe("Por vendedor");
  });
  it("shows the count for 2+", () => {
    expect(assignmentTriggerLabel(["me", "unassigned"], SELLERS, STRINGS)).toBe("2 selecionados");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run src/features/conversations/utils/assignmentLabel.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the label helper**

Create `src/features/conversations/utils/assignmentLabel.ts`:

```ts
import type { ISeller } from "@/shared/types";

export interface IAssignmentLabelStrings {
  me: string;
  unassigned: string;
  queue: string;
  all: string;
  seller: string;
  selectedCount: (n: number) => string;
}

/** Compose the Atribuição trigger label from the selected tokens. */
export function assignmentTriggerLabel(
  tokens: string[],
  sellers: ISeller[],
  strings: IAssignmentLabelStrings,
): string {
  if (tokens.length === 0) return strings.all;
  if (tokens.length === 1) {
    const token = tokens[0];
    if (token === "me") return strings.me;
    if (token === "unassigned") return strings.unassigned;
    if (token === "queue") return strings.queue;
    return sellers.find((s) => s.id === token)?.fullName ?? strings.seller;
  }
  return strings.selectedCount(tokens.length);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run src/features/conversations/utils/assignmentLabel.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the i18n count string**

In `src/features/conversations/i18n/pt-BR.ts`, inside `assignmentOptions`, add after `seller`:

```ts
    selectedCount: (n: number) => `${n} selecionados`,
```

- [ ] **Step 6: Rewrite the Assignment dropdown to checkboxes**

In `src/features/conversations/components/InboxFilters.tsx`:

(a) Replace the `assignmentLabel` `useMemo` block with a call to the helper:

```ts
  const assignmentLabel = useMemo(
    () => assignmentTriggerLabel(state.assignment, sellers, INBOX_STRINGS.assignmentOptions),
    [state.assignment, sellers],
  );
```

and add the import:

```ts
import { assignmentTriggerLabel } from "../utils/assignmentLabel";
```

(b) Add a toggle helper just before the `return (` of the component:

```ts
  const toggleAssignment = (token: string) => {
    const set = new Set(state.assignment);
    if (set.has(token)) set.delete(token);
    else set.add(token);
    onAssignment(Array.from(set));
  };
```

(c) Replace the whole Assignment `<DropdownMenu>...</DropdownMenu>` block (the `TriggerButton` with `active={state.assignment !== "me"}` and its `DropdownMenuRadioGroup`) with:

```tsx
          {/* Assignment — multi-select (OR). Combinable by every user; the
              per-seller list + "Todas" stay staff-only (canSeeAllAssignments). */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span>
                <TriggerButton
                  label={INBOX_STRINGS.assignmentLabel}
                  value={assignmentLabel}
                  active={
                    serializeAssignmentTokens(state.assignment, currentUser?.sellerId ?? null) !==
                    undefined
                  }
                />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
              {currentUser && (
                <DropdownMenuCheckboxItem
                  checked={state.assignment.includes("me")}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleAssignment("me")}
                >
                  {INBOX_STRINGS.assignmentOptions.me}
                </DropdownMenuCheckboxItem>
              )}
              {/* Pool — visible to any inbox user (rls_conversations_pool). */}
              <DropdownMenuCheckboxItem
                checked={state.assignment.includes("unassigned")}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleAssignment("unassigned")}
              >
                {INBOX_STRINGS.assignmentOptions.unassigned}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={state.assignment.includes("queue")}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggleAssignment("queue")}
              >
                {INBOX_STRINGS.assignmentOptions.queue}
              </DropdownMenuCheckboxItem>
              {/* Staff-only: "Todas" (clears the set) + filter by specific sellers. */}
              {canSeeAllAssignments && (
                <>
                  <DropdownMenuCheckboxItem
                    checked={state.assignment.length === 0}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={() => onAssignment([])}
                  >
                    {INBOX_STRINGS.assignmentOptions.all}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">
                    {INBOX_STRINGS.assignmentOptions.seller}
                  </DropdownMenuLabel>
                  {sellers.map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s.id}
                      checked={state.assignment.includes(s.id)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => toggleAssignment(s.id)}
                    >
                      {s.fullName}
                    </DropdownMenuCheckboxItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
```

(d) Add the `serializeAssignmentTokens` import:

```ts
import { serializeAssignmentTokens } from "../hooks/useInboxFilters";
```

(e) Change the `onAssignment` prop type in `IInboxFiltersProps` from `(assignment: AssignmentFilter) => void` to `(assignment: string[]) => void`. (The `AssignmentFilter` import may become unused — remove it if so.)

- [ ] **Step 7: Update the page wiring**

In `src/features/conversations/pages/InboxPage.tsx` the prop `onAssignment={setAssignment}` already matches the new `(tokens: string[]) => void` signature — no change needed unless a local type annotation references the old shape. Verify by build.

- [ ] **Step 8: Verify build + types + full suite**

Run: `bun run build && bunx vitest run && bunx tsc --noEmit`
Expected: build OK; all tests PASS; no NEW tsc errors in the touched files (baseline pre-existing errors ignored — judge by delta).

- [ ] **Step 9: Commit**

```bash
git add src/features/conversations/utils/assignmentLabel.ts src/features/conversations/utils/assignmentLabel.test.ts src/features/conversations/i18n/pt-BR.ts src/features/conversations/components/InboxFilters.tsx src/features/conversations/pages/InboxPage.tsx
git commit -m "feat(conversations): multi-select Atribuição dropdown (checkboxes + combined label)"
```

---

## Self-Review

**1. Spec coverage:**
- Universal multi-select, role-gated options unchanged → Task 5 (checkboxes for all; per-seller/"Todas" inside `canSeeAllAssignments`). ✓
- OR semantics + tokens → Task 1 (`filtersToListParams`), Task 2 (mock), Task 3 (supabase). ✓
- URL `all` sentinel + default omission + legacy single value → Task 1 (`parse/serializeAssignmentTokens`). ✓
- Queue does not pin global status → Task 1 (assignmentAny.queue) + Task 2/3 (term-scoped). ✓
- Search path consistency → Task 3 (RPC params) + Task 4 (RPC superset). ✓
- No RLS / no permission-gate change → preserved across tasks. ✓
- Scalar contract fields preserved for other callers → Task 1 (additive field). ✓

**2. Placeholder scan:** Migration filename `<TIMESTAMP>` is resolved in Task 4 Step 1 (explicit command). No other placeholders.

**3. Type consistency:** `assignment: string[]` (state), `assignmentAny: { sellerIds?: ID[]; unassigned?: boolean; queue?: boolean }` (contract/mock/supabase/`IAssignmentAny`), `setAssignment(tokens: string[])`, `onAssignment(tokens: string[])`, `buildAssignmentOrFilter`, `matchesAssignmentAny`, `assignmentTriggerLabel` — names/shapes consistent across tasks.
