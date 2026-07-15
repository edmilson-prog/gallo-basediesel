# Webhook Delivery History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Owner a queryable, raw-payload history of every inbound
webhook call the platform receives (`whatsapp-webhook` + `waha-webhook`),
regardless of outcome, so an investigation like "why did this message arrive
empty" never again dead-ends on "the payload was never kept anywhere."

**Architecture:** A new, dedicated `webhook_deliveries` table (RLS
owner-read-only, service_role write-only, 30-day rotating retention via
`pg_cron`) is populated by a small fire-and-forget helper
(`logWebhookDelivery`) called from every exit point of the two inbound
webhook Edge Functions. A new Provider Pattern slice (`webhookDeliveries`,
mock + supabase) feeds a new "Webhooks" card on the existing Owner-only
System Health page (`/app/gestao/saude`), listing deliveries with filters
and a raw-JSON detail view.

**Tech Stack:** PostgreSQL/Supabase (migration, RLS, pg_cron), Deno Edge
Functions (TypeScript), React + TanStack Query + shadcn/ui (frontend),
Vitest (tests for both the Deno-shared helper and the frontend provider —
this repo's `vitest.config.ts` already includes
`supabase/functions/**/*.{test,spec}.ts` alongside `src/**`).

## Global Constraints

- **Never apply the migration or deploy the two Edge Functions without the
  project owner's explicit confirmation** — this plan only writes files;
  applying `supabase/migrations/*.sql` and deploying
  `whatsapp-webhook`/`waha-webhook` are separate, owner-gated steps after
  the branch is reviewed.
- **Retention: 30 days, automatic**, via a daily `pg_cron` job — no manual
  cleanup step.
- **`webhook_deliveries` is a NEW, separate table from `integration_logs`**
  — never insert into `integration_logs` for this feature, never add an
  expiry to `integration_logs`.
- **RLS: owner-only read** (`current_app_role() = 'owner'`, the exact
  policy expression already used by `integration_logs`), **no INSERT/UPDATE
  policy for `authenticated`/`anon`** — only `service_role` (the Edge
  Functions' admin client) writes.
- **Logging must never break the webhook it observes** — every call to
  `logWebhookDelivery` is fire-and-forget (internal `try/catch`, never
  throws, never awaited in a way that blocks the response).
- **Scope is inbound only**: `whatsapp-webhook` (Meta / Evolution v2 /
  Evolution-Go / OpenWA, multiplexed by route) and `waha-webhook`. Outbound
  sends (`whatsapp-send`, `waha-send`) are explicitly out of scope — they
  already have their own trail in `integration_logs`.
- **Provider Pattern**: features never import `@/providers/data/impl/*`
  directly — everything goes through the `@/providers/data` barrel
  (`src/providers/data/index.ts`), per this repo's ESLint
  `no-restricted-imports` rule.
- **Working directory**: this plan is executed inside the isolated worktree
  `D:\claude\gallo-basediesel\.claude\worktrees\webhook-delivery-history`
  on branch `feat/webhook-delivery-history`. Every file path below is
  relative to that worktree's root.

---

### Task 1: `webhook_deliveries` table, RLS, retention job, RLS regression test

**Files:**
- Create: `supabase/migrations/20260714160000_webhook_deliveries.sql`
- Modify: `supabase/tests/rls-regression.sql` (append a new section, before
  the final `select 'ALL RLS REGRESSION TESTS PASSED' as result;` line)

**Interfaces:**
- Produces: table `public.webhook_deliveries` with columns `id`,
  `integration_name`, `account_id`, `event_type`, `endpoint`,
  `http_status`, `outcome` (check-constrained to
  `'processed' | 'ignored' | 'duplicate' | 'error' | 'rejected'`),
  `error_message`, `latency_ms`, `request_payload` (jsonb), `trace_id`,
  `created_at`. RLS policy `webhook_deliveries_owner_read`. Function
  `public.webhook_deliveries_retention_tick()`. `pg_cron` job named
  `webhook-deliveries-retention`.

- [ ] **Step 1: Write the migration**

```sql
-- Webhook Delivery History: raw-payload audit trail for every inbound
-- webhook call the platform receives (whatsapp-webhook + waha-webhook),
-- independent of processing outcome. Separate from `integration_logs`
-- (which stays as the curated audit trail with no expiry) — logging
-- literally everything received would force integration_logs to either
-- start expiring records that today don't, or grow unbounded with
-- customer PII. Rotates on its own 30-day window (retention job below).
create table public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  integration_name text not null,
  account_id uuid references public.whatsapp_accounts(id) on delete set null,
  event_type text,
  endpoint text not null,
  http_status integer not null,
  outcome text not null check (outcome in ('processed', 'ignored', 'duplicate', 'error', 'rejected')),
  error_message text,
  latency_ms integer,
  request_payload jsonb,
  trace_id text,
  created_at timestamptz not null default now()
);

comment on table public.webhook_deliveries is
  'Raw-payload history of every inbound webhook call (whatsapp-webhook + waha-webhook), any outcome. 30-day rolling retention via pg_cron. Owner-only read.';

create index webhook_deliveries_created_at_idx on public.webhook_deliveries (created_at desc);
create index webhook_deliveries_account_id_idx on public.webhook_deliveries (account_id);

alter table public.webhook_deliveries enable row level security;

create policy webhook_deliveries_owner_read
  on public.webhook_deliveries for select
  using (current_app_role() = 'owner');

-- No INSERT/UPDATE/DELETE policy for authenticated/anon — only
-- service_role (the Edge Functions' admin client) writes here, exactly
-- like integration_logs.

create or replace function public.webhook_deliveries_retention_tick()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.webhook_deliveries
  where created_at < now() - interval '30 days';
$$;

comment on function public.webhook_deliveries_retention_tick() is
  'Daily rotation for webhook_deliveries — deletes rows older than 30 days. Runs from pg_cron only.';

revoke all on function public.webhook_deliveries_retention_tick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'webhook-deliveries-retention';

select cron.schedule(
  'webhook-deliveries-retention',
  '0 4 * * *',
  $cmd$ select public.webhook_deliveries_retention_tick(); $cmd$
);
```

- [ ] **Step 2: Append the RLS regression block**

Open `supabase/tests/rls-regression.sql`, find the final two lines:

```sql
select 'ALL RLS REGRESSION TESTS PASSED' as result;

rollback;
```

Insert the following block **immediately before** `select 'ALL RLS
REGRESSION TESTS PASSED' as result;` (mirrors the existing
`integration_logs` section verbatim in structure — same JWT claim shapes,
same owner UUID `9a418578-2671-4141-a15a-d39b2fd13af7`, same
non-owner-seller UUID `154c3c64-15c0-41ec-824c-9fbfc3cc9ac4`):

```sql
-- ============================================================================
-- webhook_deliveries: owner-only read; writes are service_role only (no
-- insert policies — Edge Functions bypass RLS).
-- ============================================================================

insert into public.webhook_deliveries (integration_name, endpoint, http_status, outcome, trace_id)
values ('whatsapp_waha', '/waha-webhook', 200, 'processed', 'rls-regression');

select set_config(
  'request.jwt.claims',
  '{"sub":"9a418578-2671-4141-a15a-d39b2fd13af7","role":"authenticated","app_metadata":{"role":"owner","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.webhook_deliveries where trace_id = 'rls-regression') <> 1 then
    raise exception '#webhook_deliveries: owner should read webhook_deliveries';
  end if;
end $$;

reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"154c3c64-15c0-41ec-824c-9fbfc3cc9ac4","role":"authenticated","app_metadata":{"role":"seller_internal","seller_id":"5a6400ed-5aec-4bf1-b641-31635f15c887","store_id":"00000000-0000-0000-0000-000000000001"}}',
  true
);
set local role authenticated;

do $$
declare
  blocked boolean := false;
begin
  if (select count(*) from public.webhook_deliveries) <> 0 then
    raise exception '#webhook_deliveries: non-owner must not read webhook_deliveries';
  end if;
  begin
    insert into public.webhook_deliveries (integration_name, endpoint, http_status, outcome)
    values ('whatsapp_waha', '/rls-regression/deny', 200, 'processed');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#webhook_deliveries: authenticated must not insert into webhook_deliveries';
  end if;
end $$;

reset role;

set local role anon;

do $$
declare
  blocked boolean := false;
begin
  begin
    insert into public.webhook_deliveries (integration_name, endpoint, http_status, outcome)
    values ('whatsapp_waha', '/rls-regression/deny-anon', 200, 'processed');
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception '#webhook_deliveries: anon must not insert into webhook_deliveries';
  end if;
end $$;

reset role;
```

- [ ] **Step 3: Commit**

This migration is **NOT applied automatically** — it requires the project
owner's explicit confirmation (Global Constraints). Commit the files only.

```bash
git add supabase/migrations/20260714160000_webhook_deliveries.sql supabase/tests/rls-regression.sql
git commit -m "feat(db): add webhook_deliveries table, RLS and 30-day retention"
```

---

### Task 2: Domain types

**Files:**
- Modify: `src/shared/types/system-health.ts` (append after
  `IWhatsAppProviderHealthAccount`, the last interface in the file)
- Modify: `src/shared/types/index.ts` (add to the existing
  `system-health` re-export block)

**Interfaces:**
- Produces: `WebhookDeliveryOutcome`, `IWebhookDelivery`,
  `IWebhookDeliveryFilters` — consumed by Tasks 3 and 4.

- [ ] **Step 1: Add the types**

Append to the end of `src/shared/types/system-health.ts` (after the
closing `}` of `IWhatsAppProviderHealthAccount`):

```ts
/** One row of the raw-payload webhook delivery history (any outcome). */
export type WebhookDeliveryOutcome = "processed" | "ignored" | "duplicate" | "error" | "rejected";

/** A single inbound webhook call, as received by whatsapp-webhook or waha-webhook. */
export interface IWebhookDelivery {
  id: string;
  /** e.g. 'whatsapp_meta' | 'whatsapp_evolution' | 'whatsapp_evolution_go' | 'whatsapp_openwa' | 'whatsapp_waha'. */
  integrationName: string;
  accountId: string | null;
  /** Raw event name from the payload (e.g. 'messages.upsert', 'Message', 'message.any'). */
  eventType: string | null;
  endpoint: string;
  httpStatus: number;
  outcome: WebhookDeliveryOutcome;
  errorMessage: string | null;
  latencyMs: number | null;
  /** The raw webhook body, verbatim. */
  requestPayload: unknown;
  traceId: string | null;
  createdAt: ISO8601;
}

/** Filters for `IWebhookDeliveriesProvider.list`. */
export interface IWebhookDeliveryFilters {
  accountId?: string;
  outcome?: WebhookDeliveryOutcome;
  fromDate?: ISO8601;
  toDate?: ISO8601;
  limit?: number;
  offset?: number;
}
```

- [ ] **Step 2: Re-export from the barrel**

Find this block in `src/shared/types/index.ts` (the `system-health`
re-export — search for `ISystemHealthcheck`):

```ts
export type {
  SystemHealthStatus,
  SystemCheckResult,
  ISystemHealthcheck,
  ISystemCronJob,
  ISystemDbStats,
  IWhatsAppAccountDelivery,
  IWhatsAppFailureBucket,
  IWhatsAppDeliveryHealth,
  IWhatsAppProviderHealthAccount,
} from "./system-health";
```

Replace it with:

```ts
export type {
  SystemHealthStatus,
  SystemCheckResult,
  ISystemHealthcheck,
  ISystemCronJob,
  ISystemDbStats,
  IWhatsAppAccountDelivery,
  IWhatsAppFailureBucket,
  IWhatsAppDeliveryHealth,
  IWhatsAppProviderHealthAccount,
  WebhookDeliveryOutcome,
  IWebhookDelivery,
  IWebhookDeliveryFilters,
} from "./system-health";
```

(If the existing block's exact member list differs slightly from the
above at implementation time, keep every existing member and only ADD the
three new ones at the end — do not remove anything.)

- [ ] **Step 3: Verify it compiles**

Run: `bunx tsc --noEmit 2>&1 | grep -i "system-health\|webhook"`
Expected: no new errors mentioning these files (pre-existing unrelated
baseline errors are expected and out of scope — see `CLAUDE.md`'s tsc
baseline note).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/system-health.ts src/shared/types/index.ts
git commit -m "feat(types): add IWebhookDelivery domain type"
```

---

### Task 3: Mock provider (`webhookDeliveries`)

**Files:**
- Create: `src/providers/data/contracts/webhookDeliveries.ts`
- Create: `src/providers/data/impl/mock/webhookDeliveries.ts`
- Test: `src/providers/data/impl/mock/webhookDeliveries.test.ts`

**Interfaces:**
- Consumes: `IWebhookDelivery`, `IWebhookDeliveryFilters`,
  `WebhookDeliveryOutcome` from `@/shared/types` (Task 2).
- Produces: `IWebhookDeliveriesProvider` interface, and
  `mockWebhookDeliveriesProvider: IWebhookDeliveriesProvider` — both
  consumed by Task 4 (registration) and Task 8 (UI, via the provider
  barrel).

- [ ] **Step 1: Write the contract**

Create `src/providers/data/contracts/webhookDeliveries.ts`:

```ts
import type { IWebhookDelivery, IWebhookDeliveryFilters } from "@/shared/types";

/**
 * Read-only provider behind the Owner-only "Webhooks" card on the system
 * health dashboard (`/app/gestao/saude`).
 *
 * - `mock` source: a fixed, deterministic set of deliveries spanning every
 *   `outcome` value, so the card renders meaningfully without a backend.
 * - `supabase` source: reads `webhook_deliveries` directly (RLS is the
 *   gate — non-owners get an empty list, not an error).
 */
export interface IWebhookDeliveriesProvider {
  list(filters?: IWebhookDeliveryFilters): Promise<IWebhookDelivery[]>;
}
```

- [ ] **Step 2: Write the failing test**

Create `src/providers/data/impl/mock/webhookDeliveries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockWebhookDeliveriesProvider } from "./webhookDeliveries";

describe("mockWebhookDeliveriesProvider", () => {
  it("returns deliveries covering every outcome", async () => {
    const list = await mockWebhookDeliveriesProvider.list();
    const outcomes = new Set(list.map((d) => d.outcome));
    expect(outcomes).toEqual(new Set(["processed", "ignored", "duplicate", "error", "rejected"]));
  });

  it("filters by accountId", async () => {
    const all = await mockWebhookDeliveriesProvider.list();
    const target = all.find((d) => d.accountId !== null);
    expect(target).toBeDefined();
    const filtered = await mockWebhookDeliveriesProvider.list({ accountId: target!.accountId! });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((d) => d.accountId === target!.accountId)).toBe(true);
  });

  it("filters by outcome", async () => {
    const filtered = await mockWebhookDeliveriesProvider.list({ outcome: "rejected" });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((d) => d.outcome === "rejected")).toBe(true);
  });

  it("respects limit", async () => {
    const limited = await mockWebhookDeliveriesProvider.list({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test -- webhookDeliveries.test.ts`
Expected: FAIL — `Cannot find module './webhookDeliveries'` (the impl
file doesn't exist yet).

- [ ] **Step 4: Write the mock implementation**

Create `src/providers/data/impl/mock/webhookDeliveries.ts`:

```ts
import type { IWebhookDelivery, IWebhookDeliveryFilters } from "@/shared/types";
import type { IWebhookDeliveriesProvider } from "../../contracts/webhookDeliveries";

/**
 * Mock implementation of {@link IWebhookDeliveriesProvider}.
 *
 * Self-contained synthetic data (no mock-store state), same rationale as
 * `impl/mock/systemHealth.ts`: this is infrastructure telemetry with no
 * domain entity behind it. Reuses the same fake account ids as
 * `systemHealth.ts` ("wa-mock-matriz" / "wa-mock-filial") so the health
 * page's cards feel coherent together in mock mode.
 */

const MOCK_LATENCY_MS = 150;

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

const now = Date.now();

const MOCK_DELIVERIES: IWebhookDelivery[] = [
  {
    id: "whd-mock-1",
    integrationName: "whatsapp_meta",
    accountId: "wa-mock-matriz",
    eventType: "messages",
    endpoint: "/whatsapp-webhook/meta",
    httpStatus: 200,
    outcome: "processed",
    errorMessage: null,
    latencyMs: 210,
    requestPayload: { entry: [{ changes: [{ value: { messages: [{ type: "text" }] } }] }] },
    traceId: "trace-mock-1",
    createdAt: new Date(now - 2 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-2",
    integrationName: "whatsapp_evolution",
    accountId: "wa-mock-filial",
    eventType: "messages.upsert",
    endpoint: "/whatsapp-webhook/evolution",
    httpStatus: 200,
    outcome: "duplicate",
    errorMessage: null,
    latencyMs: 45,
    requestPayload: { event: "messages.upsert", data: { key: { id: "3EB0MOCK" } } },
    traceId: "trace-mock-2",
    createdAt: new Date(now - 8 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-3",
    integrationName: "whatsapp_waha",
    accountId: "wa-mock-filial",
    eventType: "message",
    endpoint: "/waha-webhook",
    httpStatus: 200,
    outcome: "ignored",
    errorMessage: null,
    latencyMs: 30,
    requestPayload: { event: "message", session: "mock-session", body: "" },
    traceId: null,
    createdAt: new Date(now - 20 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-4",
    integrationName: "whatsapp_evolution_go",
    accountId: "wa-mock-matriz",
    eventType: "Message",
    endpoint: "/whatsapp-webhook/evolution-go",
    httpStatus: 200,
    outcome: "error",
    errorMessage: "customer insert failed: constraint violation",
    latencyMs: 512,
    requestPayload: { event: "Message", data: { Info: { IsFromMe: false } } },
    traceId: "trace-mock-4",
    createdAt: new Date(now - 45 * 60_000).toISOString(),
  },
  {
    id: "whd-mock-5",
    integrationName: "whatsapp_waha",
    accountId: null,
    eventType: null,
    endpoint: "/waha-webhook",
    httpStatus: 401,
    outcome: "rejected",
    errorMessage: "invalid signature",
    latencyMs: 12,
    requestPayload: { session: "unknown-session", event: "message" },
    traceId: null,
    createdAt: new Date(now - 90 * 60_000).toISOString(),
  },
];

export const mockWebhookDeliveriesProvider: IWebhookDeliveriesProvider = {
  async list(filters: IWebhookDeliveryFilters = {}): Promise<IWebhookDelivery[]> {
    await delay();
    let rows = MOCK_DELIVERIES.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (filters.accountId) rows = rows.filter((d) => d.accountId === filters.accountId);
    if (filters.outcome) rows = rows.filter((d) => d.outcome === filters.outcome);
    if (filters.fromDate) rows = rows.filter((d) => d.createdAt >= filters.fromDate!);
    if (filters.toDate) rows = rows.filter((d) => d.createdAt <= filters.toDate!);
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? rows.length;
    return rows.slice(offset, offset + limit);
  },
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test -- webhookDeliveries.test.ts`
Expected: PASS (4/4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/contracts/webhookDeliveries.ts src/providers/data/impl/mock/webhookDeliveries.ts src/providers/data/impl/mock/webhookDeliveries.test.ts
git commit -m "feat(providers): add mock webhookDeliveries provider"
```

---

### Task 4: Supabase provider + registration in the Provider Pattern

**Files:**
- Create: `src/providers/data/impl/supabase/webhookDeliveries.ts`
- Test: `src/providers/data/impl/supabase/webhookDeliveries.test.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/hooks/useWebhookDeliveriesProvider.ts`
- Modify: `src/providers/data/index.ts`

**Interfaces:**
- Consumes: `IWebhookDeliveriesProvider` (Task 3),
  `mockWebhookDeliveriesProvider` (Task 3), `getSupabaseClient` from
  `@/shared/lib/supabase`.
- Produces: `supabaseWebhookDeliveriesProvider`,
  `useWebhookDeliveriesProvider()` hook — the latter is what Task 8's UI
  hook calls.

- [ ] **Step 1: Write the failing test**

Create `src/providers/data/impl/supabase/webhookDeliveries.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { supabaseWebhookDeliveriesProvider } from "./webhookDeliveries";
import * as supabaseLib from "@/shared/lib/supabase";

function mockClient(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "order", "limit", "eq", "gte", "lte", "range"];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  // Supabase query builders are thenable — resolve with the fixture rows.
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
    resolve({ data: rows, error: null });
  return { from: vi.fn(() => builder) };
}

describe("supabaseWebhookDeliveriesProvider.list", () => {
  it("maps snake_case rows to IWebhookDelivery", async () => {
    const rows = [
      {
        id: "id-1",
        integration_name: "whatsapp_waha",
        account_id: "acc-1",
        event_type: "message",
        endpoint: "/waha-webhook",
        http_status: 200,
        outcome: "processed",
        error_message: null,
        latency_ms: 30,
        request_payload: { hello: "world" },
        trace_id: "trace-1",
        created_at: "2026-07-14T12:00:00.000Z",
      },
    ];
    vi.spyOn(supabaseLib, "getSupabaseClient").mockReturnValue(
      mockClient(rows) as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>,
    );

    const result = await supabaseWebhookDeliveriesProvider.list();

    expect(result).toEqual([
      {
        id: "id-1",
        integrationName: "whatsapp_waha",
        accountId: "acc-1",
        eventType: "message",
        endpoint: "/waha-webhook",
        httpStatus: 200,
        outcome: "processed",
        errorMessage: null,
        latencyMs: 30,
        requestPayload: { hello: "world" },
        traceId: "trace-1",
        createdAt: "2026-07-14T12:00:00.000Z",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- src/providers/data/impl/supabase/webhookDeliveries.test.ts`
Expected: FAIL — `Cannot find module './webhookDeliveries'`.

- [ ] **Step 3: Write the Supabase implementation**

Create `src/providers/data/impl/supabase/webhookDeliveries.ts`:

```ts
import type {
  IWebhookDelivery,
  IWebhookDeliveryFilters,
  WebhookDeliveryOutcome,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { IWebhookDeliveriesProvider } from "../../contracts/webhookDeliveries";

/**
 * Supabase implementation of {@link IWebhookDeliveriesProvider}.
 *
 * Reads `webhook_deliveries` directly — no RPC needed, RLS
 * (`webhook_deliveries_owner_read`) already restricts rows to the Owner;
 * non-owners simply get an empty array back, never an error.
 */

const DEFAULT_LIMIT = 100;

interface IWebhookDeliveryRow {
  id: string;
  integration_name: string;
  account_id: string | null;
  event_type: string | null;
  endpoint: string;
  http_status: number;
  outcome: string;
  error_message: string | null;
  latency_ms: number | null;
  request_payload: unknown;
  trace_id: string | null;
  created_at: string;
}

function rowToWebhookDelivery(row: IWebhookDeliveryRow): IWebhookDelivery {
  return {
    id: row.id,
    integrationName: row.integration_name,
    accountId: row.account_id,
    eventType: row.event_type,
    endpoint: row.endpoint,
    httpStatus: row.http_status,
    outcome: row.outcome as WebhookDeliveryOutcome,
    errorMessage: row.error_message,
    latencyMs: row.latency_ms,
    requestPayload: row.request_payload,
    traceId: row.trace_id,
    createdAt: row.created_at,
  };
}

export const supabaseWebhookDeliveriesProvider: IWebhookDeliveriesProvider = {
  async list(filters: IWebhookDeliveryFilters = {}): Promise<IWebhookDelivery[]> {
    const limit = filters.limit ?? DEFAULT_LIMIT;
    let query = getSupabaseClient()
      .from("webhook_deliveries")
      .select(
        "id, integration_name, account_id, event_type, endpoint, http_status, outcome, error_message, latency_ms, request_payload, trace_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (filters.accountId) query = query.eq("account_id", filters.accountId);
    if (filters.outcome) query = query.eq("outcome", filters.outcome);
    if (filters.fromDate) query = query.gte("created_at", filters.fromDate);
    if (filters.toDate) query = query.lte("created_at", filters.toDate);
    if (filters.offset) query = query.range(filters.offset, filters.offset + limit - 1);

    const { data, error } = await query;
    if (error) throw new Error(`webhook_deliveries: ${error.message}`);
    return ((data ?? []) as IWebhookDeliveryRow[]).map(rowToWebhookDelivery);
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- src/providers/data/impl/supabase/webhookDeliveries.test.ts`
Expected: PASS.

- [ ] **Step 5: Register in the factory**

In `src/providers/data/factory.ts`, add the two imports next to the
existing `systemHealth` ones (line numbers are approximate — search for
the exact text):

```ts
import { mockSystemHealthProvider } from "./impl/mock/systemHealth";
import { mockWebhookDeliveriesProvider } from "./impl/mock/webhookDeliveries";
```

```ts
import { supabaseSystemHealthProvider } from "./impl/supabase/systemHealth";
import { supabaseWebhookDeliveriesProvider } from "./impl/supabase/webhookDeliveries";
```

Then add one line to each provider map (search for `systemHealth:` inside
`mockProviders` and `supabaseProviders`):

```ts
  systemHealth: mockSystemHealthProvider,
  webhookDeliveries: mockWebhookDeliveriesProvider,
```

```ts
  systemHealth: supabaseSystemHealthProvider,
  webhookDeliveries: supabaseWebhookDeliveriesProvider,
```

- [ ] **Step 6: Register the type in the contracts barrel**

In `src/providers/data/contracts/index.ts`, next to the existing
`ISystemHealthProvider` import (search for it):

```ts
import type { ISystemHealthProvider } from "./systemHealth";
import type { IWebhookDeliveriesProvider } from "./webhookDeliveries";
```

Next to the existing `export type { ISystemHealthProvider }` line:

```ts
export type { ISystemHealthProvider } from "./systemHealth";
export type { IWebhookDeliveriesProvider } from "./webhookDeliveries";
```

Inside the `IDataProviders` interface, next to the existing `systemHealth`
member:

```ts
  systemHealth: ISystemHealthProvider;
  webhookDeliveries: IWebhookDeliveriesProvider;
```

- [ ] **Step 7: Add the hook**

Create `src/providers/data/hooks/useWebhookDeliveriesProvider.ts`:

```ts
import type { IWebhookDeliveriesProvider } from "../contracts/webhookDeliveries";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWebhookDeliveriesProvider(): IWebhookDeliveriesProvider {
  return useDataProviderSlice("webhookDeliveries", "useWebhookDeliveriesProvider");
}
```

- [ ] **Step 8: Export from the main provider barrel**

In `src/providers/data/index.ts`, next to the existing
`ISystemHealthProvider` type re-export (search for it in the big `export
type { ... }` block):

```ts
  ISystemHealthProvider,
  IWebhookDeliveriesProvider,
```

Next to the existing `useSystemHealthProvider` hook export:

```ts
export { useSystemHealthProvider } from "./hooks/useSystemHealthProvider";
export { useWebhookDeliveriesProvider } from "./hooks/useWebhookDeliveriesProvider";
```

- [ ] **Step 9: Full suite + type-check**

Run: `bun run test`
Expected: all test files pass, including the two new ones.

Run: `bunx tsc --noEmit 2>&1 | grep -i webhookDeliveries`
Expected: no output (no new errors touching these files).

- [ ] **Step 10: Commit**

```bash
git add src/providers/data/impl/supabase/webhookDeliveries.ts src/providers/data/impl/supabase/webhookDeliveries.test.ts src/providers/data/factory.ts src/providers/data/contracts/index.ts src/providers/data/hooks/useWebhookDeliveriesProvider.ts src/providers/data/index.ts
git commit -m "feat(providers): add supabase webhookDeliveries provider and register it"
```

---

### Task 5: Shared `logWebhookDelivery` helper (Deno Edge Functions)

**Files:**
- Create: `supabase/functions/_shared/webhookDeliveryLog.ts`
- Test: `supabase/functions/_shared/webhookDeliveryLog.test.ts`

**Interfaces:**
- Produces: `logWebhookDelivery(admin, entry): Promise<void>` and
  `type WebhookDeliveryOutcome` (the Deno-side mirror of the same literal
  union as Task 2's frontend type — kept as a small local type here since
  this file is NOT part of `_shared/whatsapp/**` and is never synced from
  `src/`, matching `_shared/secrets.ts`/`_shared/env.ts`'s pattern of
  small, hand-written, generic Deno utilities). Consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/webhookDeliveryLog.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { logWebhookDelivery } from "./webhookDeliveryLog";

function fakeAdmin(insertImpl: (row: unknown) => Promise<{ error: unknown }>) {
  return {
    from: () => ({
      insert: insertImpl,
    }),
  } as unknown as Parameters<typeof logWebhookDelivery>[0];
}

describe("logWebhookDelivery", () => {
  it("inserts a row with the exact column names", async () => {
    let inserted: Record<string, unknown> | null = null;
    const admin = fakeAdmin(async (row) => {
      inserted = row as Record<string, unknown>;
      return { error: null };
    });

    await logWebhookDelivery(admin, {
      integrationName: "whatsapp_waha",
      accountId: "acc-1",
      eventType: "message",
      endpoint: "/waha-webhook",
      httpStatus: 200,
      outcome: "processed",
      requestPayload: { a: 1 },
      traceId: "trace-1",
      latencyMs: 42,
    });

    expect(inserted).toEqual({
      integration_name: "whatsapp_waha",
      account_id: "acc-1",
      event_type: "message",
      endpoint: "/waha-webhook",
      http_status: 200,
      outcome: "processed",
      error_message: null,
      latency_ms: 42,
      request_payload: { a: 1 },
      trace_id: "trace-1",
    });
  });

  it("never throws when the insert fails", async () => {
    const admin = fakeAdmin(async () => ({ error: new Error("boom") }));
    await expect(
      logWebhookDelivery(admin, {
        integrationName: "whatsapp_waha",
        endpoint: "/waha-webhook",
        httpStatus: 500,
        outcome: "error",
        requestPayload: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("never throws when the client itself throws", async () => {
    const admin = {
      from: () => {
        throw new Error("client exploded");
      },
    } as unknown as Parameters<typeof logWebhookDelivery>[0];
    await expect(
      logWebhookDelivery(admin, {
        integrationName: "whatsapp_waha",
        endpoint: "/waha-webhook",
        httpStatus: 500,
        outcome: "error",
        requestPayload: null,
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test -- webhookDeliveryLog.test.ts`
Expected: FAIL — `Cannot find module './webhookDeliveryLog'`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/webhookDeliveryLog.ts`:

```ts
/**
 * Raw-payload delivery history for the two inbound webhooks
 * (whatsapp-webhook, waha-webhook) — every call, any outcome. Generic
 * utility (like `_shared/secrets.ts`/`_shared/env.ts`), NOT part of
 * `_shared/whatsapp/**` and never synced from `src/providers/whatsapp/`.
 *
 * Fail-open by design: logging a delivery must never break the delivery
 * itself. Every failure (client throw, insert error) is swallowed here.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

export type WebhookDeliveryOutcome = "processed" | "ignored" | "duplicate" | "error" | "rejected";

export interface IWebhookDeliveryEntry {
  integrationName: string;
  accountId?: string | null;
  eventType?: string | null;
  endpoint: string;
  httpStatus: number;
  outcome: WebhookDeliveryOutcome;
  errorMessage?: string | null;
  latencyMs?: number | null;
  requestPayload: unknown;
  traceId?: string | null;
}

export async function logWebhookDelivery(
  admin: SupabaseClient,
  entry: IWebhookDeliveryEntry,
): Promise<void> {
  try {
    const { error } = await admin.from("webhook_deliveries").insert({
      integration_name: entry.integrationName,
      account_id: entry.accountId ?? null,
      event_type: entry.eventType ?? null,
      endpoint: entry.endpoint,
      http_status: entry.httpStatus,
      outcome: entry.outcome,
      error_message: entry.errorMessage ?? null,
      latency_ms: entry.latencyMs ?? null,
      request_payload: entry.requestPayload,
      trace_id: entry.traceId ?? null,
    });
    if (error) {
      console.warn(
        JSON.stringify({ level: "warn", msg: "logWebhookDelivery: insert failed", error: error.message }),
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "logWebhookDelivery: unexpected failure",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test -- webhookDeliveryLog.test.ts`
Expected: PASS (3/3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/webhookDeliveryLog.ts supabase/functions/_shared/webhookDeliveryLog.test.ts
git commit -m "feat(edge): add logWebhookDelivery shared helper"
```

---

### Task 6: Wire logging into `whatsapp-webhook`

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

**Interfaces:**
- Consumes: `logWebhookDelivery` from `../_shared/webhookDeliveryLog.ts`
  (Task 5).

This function already funnels **every** response through a single
`respond()` helper (defined at the top of `Deno.serve`). The plan is to
extend `respond()` to also log, and to move the `admin` client's creation
above the "unknown provider" check so logging works even for that very
first exit.

- [ ] **Step 1: Add the import**

At the top of `supabase/functions/whatsapp-webhook/index.ts`, next to the
existing `_shared` imports (after `import { createLogger, type Logger }
from "../_shared/logger.ts";`):

```ts
import { logWebhookDelivery } from "../_shared/webhookDeliveryLog.ts";
```

- [ ] **Step 2: Move `admin`'s creation earlier and extend `respond()`**

Find this exact block (currently lines ~760-781):

```ts
Deno.serve(async (req) => {
  const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
  const log = createLogger(traceId);
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const provider = segments[segments.indexOf("whatsapp-webhook") + 1] ?? "";

  const respond = (res: Response) => {
    res.headers.set("x-trace-id", traceId);
    return res;
  };

  if (
    provider !== "meta" &&
    provider !== "evolution" &&
    provider !== "evolution-go" &&
    provider !== "openwa"
  ) {
    return respond(json({ error: "unknown provider" }, 400));
  }

  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
```

Replace it with:

```ts
Deno.serve(async (req) => {
  const startedAt = Date.now();
  const traceId = req.headers.get("x-trace-id") ?? crypto.randomUUID();
  const log = createLogger(traceId);
  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const provider = segments[segments.indexOf("whatsapp-webhook") + 1] ?? "";

  // Moved above the provider check (was originally created just below it)
  // so every exit — including "unknown provider" — can log a delivery.
  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const respond = (
    res: Response,
    meta?: {
      outcome?: import("../_shared/webhookDeliveryLog.ts").WebhookDeliveryOutcome;
      accountId?: string | null;
      eventType?: string | null;
      requestPayload?: unknown;
    },
  ) => {
    res.headers.set("x-trace-id", traceId);
    void logWebhookDelivery(admin, {
      integrationName: `whatsapp_${provider || "unknown"}`,
      accountId: meta?.accountId ?? null,
      eventType: meta?.eventType ?? null,
      endpoint: `/whatsapp-webhook/${provider}`,
      httpStatus: res.status,
      outcome: meta?.outcome ?? (res.status >= 400 ? "rejected" : "processed"),
      errorMessage: meta?.outcome === "error" ? meta.eventType ?? null : null,
      latencyMs: Date.now() - startedAt,
      requestPayload: meta?.requestPayload ?? null,
      traceId,
    });
    return res;
  };

  if (
    provider !== "meta" &&
    provider !== "evolution" &&
    provider !== "evolution-go" &&
    provider !== "openwa"
  ) {
    return respond(json({ error: "unknown provider" }, 400));
  }
```

(The dynamic `import("../_shared/webhookDeliveryLog.ts").WebhookDeliveryOutcome`
type-only reference avoids adding a second named import purely for a
type — equivalent to `import type { WebhookDeliveryOutcome } from
"../_shared/webhookDeliveryLog.ts";` at the top; either is acceptable, but
if the implementer adds the top-level `import type` instead, use the
plain type name `WebhookDeliveryOutcome` in the `meta` shape and drop the
inline `import(...)`.)

- [ ] **Step 3: Capture the raw payload for the two payload-bearing exits**

The `errorMessage` line above is a placeholder shape only for the 4 lines
changed in Step 2 — this step fixes it up now that `payload`/`rawBody`
exist. Find the invalid-JSON exit (currently ~line 792-798):

```ts
  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return respond(json({ error: "invalid json body" }, 400));
  }
```

Replace the `catch` line with one that attaches the raw (unparsed) body:

```ts
  const rawBody = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return respond(json({ error: "invalid json body" }, 400), { requestPayload: rawBody });
  }
```

- [ ] **Step 4: Attach the real outcome + payload at the success/error exits**

Find the final block (currently ~lines 1004-1030, right after the
`isDroppedMessageEvent` diagnostic block):

```ts
    log.info("webhook processed", { provider, outcome: result.outcome });
    return respond(json({ status: "ok", outcome: result.outcome, traceId }, 200));
  } catch (err) {
    log.error("webhook processing failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { traceId, functionName: "whatsapp-webhook" });
    return respond(json({ status: "error-logged", traceId }, 200));
  }
```

Replace it with:

```ts
    log.info("webhook processed", { provider, outcome: result.outcome });
    return respond(json({ status: "ok", outcome: result.outcome, traceId }, 200), {
      outcome:
        result.outcome === "duplicate"
          ? "duplicate"
          : result.outcome === "ignored"
            ? "ignored"
            : "processed",
      eventType: result.outcome,
      requestPayload: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("webhook processing failed", { error: message });
    captureException(err, { traceId, functionName: "whatsapp-webhook" });
    return respond(json({ status: "error-logged", traceId }, 200), {
      outcome: "error",
      eventType: message,
      requestPayload: payload,
    });
  }
```

- [ ] **Step 5: Add a Vitest regression test for the outcome-mapping logic**

`Deno.serve`'s request handler itself is not unit-testable (no Deno HTTP
runtime under Vitest) — this repo has no precedent of testing a
`Deno.serve` callback directly (confirmed: no existing `*.test.ts` under
`supabase/functions/**` imports an `index.ts`). Skip a direct test of
`index.ts` and rely on Task 5's `logWebhookDelivery` unit tests plus the
manual verification in Step 6 below.

- [ ] **Step 6: Manual verification (post-deploy, owner-gated)**

Do NOT deploy as part of this task. Record in the PR description: "After
this branch is deployed (owner's call), send one real webhook of each
kind (a text message, a duplicate retry, an intentionally-bad-signature
request) and confirm 3 new rows appear in `webhook_deliveries` with
`outcome` = `processed`/`duplicate`/`rejected` respectively."

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(edge): log every whatsapp-webhook delivery to webhook_deliveries"
```

---

### Task 7: Wire logging into `waha-webhook`

**Files:**
- Modify: `supabase/functions/waha-webhook/index.ts`

**Interfaces:**
- Consumes: `logWebhookDelivery` from `../_shared/webhookDeliveryLog.ts`
  (Task 5).

Unlike `whatsapp-webhook`, this file has **no single response wrapper**
and **no top-level try/catch** (confirmed: every exit is a direct `return
json(...)`, and an unhandled throw today surfaces as a bare Deno 500,
uncaught by application code). This task introduces a `respond()` wrapper
mirroring `whatsapp-webhook`'s (Task 6) — the same pattern already
validated in this codebase — plus a top-level try/catch, which also closes
a real (if minor) existing gap: today an unhandled exception here is
invisible; after this task it becomes an `outcome: 'error'` row.

- [ ] **Step 1: Add the import and the `respond()` wrapper**

At the top of `supabase/functions/waha-webhook/index.ts`, next to the
existing imports (after `import { getWahaContactName, resolveWahaLid }
from "../_shared/whatsapp/waha/contacts.ts";`):

```ts
import { logWebhookDelivery } from "../_shared/webhookDeliveryLog.ts";
```

Find the handler's opening (currently lines 63-73):

```ts
Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );
  const resolveSecret = createSecretResolver(admin);
```

Replace it with:

```ts
Deno.serve(async (req) => {
  const startedAt = Date.now();
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );

  // Every exit funnels through here (mirrors whatsapp-webhook's respond()).
  // `sessionForLog`/`accountIdForLog` are set as soon as they're known —
  // early exits (before the session is resolved) simply log without them.
  let sessionForLog: string | undefined;
  let accountIdForLog: string | null = null;
  const respond = (
    res: Response,
    meta?: {
      outcome?: import("../_shared/webhookDeliveryLog.ts").WebhookDeliveryOutcome;
      eventType?: string | null;
      requestPayload?: unknown;
      errorMessage?: string | null;
    },
  ) => {
    void logWebhookDelivery(admin, {
      integrationName: "whatsapp_waha",
      accountId: accountIdForLog,
      eventType: meta?.eventType ?? sessionForLog ?? null,
      endpoint: "/waha-webhook",
      httpStatus: res.status,
      outcome: meta?.outcome ?? (res.status >= 400 ? "rejected" : "processed"),
      errorMessage: meta?.errorMessage ?? null,
      latencyMs: Date.now() - startedAt,
      requestPayload: meta?.requestPayload ?? null,
      traceId: null,
    });
    return res;
  };

  if (req.method !== "POST") return respond(json({ error: "method not allowed" }, 405));

  const resolveSecret = createSecretResolver(admin);
```

- [ ] **Step 2: Replace every remaining `return json(...)` with `return respond(json(...), meta)`**

Apply this exact transformation at every one of the following call sites
(quoted with enough surrounding context to locate each one; only the
`return` line changes in each):

**(a) Invalid JSON / missing session-event** (currently ~lines 76-84):

```ts
  const rawBody = await req.text();
  let envelope: IWahaEnvelope;
  try {
    envelope = JSON.parse(rawBody) as IWahaEnvelope;
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }
  if (!envelope.session || !envelope.event) {
    return json({ error: "missing session/event" }, 400);
  }
```

becomes:

```ts
  const rawBody = await req.text();
  let envelope: IWahaEnvelope;
  try {
    envelope = JSON.parse(rawBody) as IWahaEnvelope;
  } catch {
    return respond(json({ error: "invalid JSON" }, 400), { requestPayload: rawBody });
  }
  if (!envelope.session || !envelope.event) {
    return respond(json({ error: "missing session/event" }, 400), { requestPayload: envelope });
  }
  sessionForLog = envelope.event;
```

**(b) Unknown session** (currently ~lines 93-102):

```ts
  if (!accountRow) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: unknown session",
        session: envelope.session,
      }),
    );
    return json({ error: "unknown session" }, 401);
  }
```

becomes (add `accountIdForLog` assignment right after `accountRow` is
confirmed non-null, i.e. as the first line of the `else` implied by this
early-return — insert it directly after this whole `if` block, before the
next statement):

```ts
  if (!accountRow) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: unknown session",
        session: envelope.session,
      }),
    );
    return respond(json({ error: "unknown session" }, 401), { requestPayload: envelope });
  }
  accountIdForLog = accountRow.id as string;
```

**(c) Server missing HMAC ref** (currently ~lines 109-118):

```ts
  if (!server?.webhook_hmac_ref) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: server missing hmac ref",
        session: envelope.session,
      }),
    );
    return json({ error: "server not configured" }, 401);
  }
```

becomes:

```ts
  if (!server?.webhook_hmac_ref) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: server missing hmac ref",
        session: envelope.session,
      }),
    );
    return respond(json({ error: "server not configured" }, 401), { requestPayload: envelope });
  }
```

**(d) HMAC key unresolvable** (currently ~line 135):

```ts
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
  if (!hmacKey) return json({ error: "server not configured" }, 401);
```

becomes:

```ts
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
  if (!hmacKey) return respond(json({ error: "server not configured" }, 401), { requestPayload: envelope });
```

**(e) Invalid HMAC signature** (currently ~lines 139-148) — this is the
"rejected" outcome the spec explicitly asked to keep:

```ts
  const signature = req.headers.get("X-Webhook-Hmac");
  const valid = await verifyWahaHmac(rawBody, hmacKey, signature);
  if (!valid) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: invalid HMAC",
        session: envelope.session,
      }),
    );
    return json({ error: "invalid signature" }, 401);
  }
```

becomes:

```ts
  const signature = req.headers.get("X-Webhook-Hmac");
  const valid = await verifyWahaHmac(rawBody, hmacKey, signature);
  if (!valid) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: invalid HMAC",
        session: envelope.session,
      }),
    );
    return respond(json({ error: "invalid signature" }, 401), {
      outcome: "rejected",
      requestPayload: envelope,
    });
  }
```

**(f) Duplicate via `processed_events`** (currently ~line 171):

```ts
  if (alreadyProcessed) return json({ ok: true, duplicate: true }, 200);
```

becomes:

```ts
  if (alreadyProcessed) {
    return respond(json({ ok: true, duplicate: true }, 200), {
      outcome: "duplicate",
      requestPayload: envelope,
    });
  }
```

**(g) `session.status` handled** (currently ~lines 262-271):

```ts
  if (envelope.event === "session.status") {
    const payload = envelope.payload as { status?: string } | null;
    const accountStatus = wahaStateToAccountStatus(String(payload?.status ?? ""));
    const { error: statusErr } = await admin.from("whatsapp_accounts").update({ status: accountStatus }).eq("id", accountRow.id);
    if (!statusErr) await markProcessed();
    return json({ ok: true }, 200);
  }
```

becomes:

```ts
  if (envelope.event === "session.status") {
    const payload = envelope.payload as { status?: string } | null;
    const accountStatus = wahaStateToAccountStatus(String(payload?.status ?? ""));
    const { error: statusErr } = await admin.from("whatsapp_accounts").update({ status: accountStatus }).eq("id", accountRow.id);
    if (!statusErr) await markProcessed();
    return respond(json({ ok: true }, 200), {
      outcome: "processed",
      eventType: "session.status",
      requestPayload: envelope,
    });
  }
```

**(h) Unknown/unhandled event type — ignored** (currently ~lines 273-278):

```ts
  if (envelope.event !== "message" && envelope.event !== "message.any") {
    await markProcessed();
    return json({ ok: true, ignored: envelope.event }, 200);
  }
```

becomes:

```ts
  if (envelope.event !== "message" && envelope.event !== "message.any") {
    await markProcessed();
    return respond(json({ ok: true, ignored: envelope.event }, 200), {
      outcome: "ignored",
      requestPayload: envelope,
    });
  }
```

**(i) Unparseable message — ignored** (currently ~lines 280-293, inside a
`catch`):

```ts
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "waha webhook: unparseable message",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    await markProcessed();
    return json({ ok: true, ignored: "unparseable" }, 200);
  }
```

becomes:

```ts
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({ level: "warn", msg: "waha webhook: unparseable message", error: detail }),
    );
    await markProcessed();
    return respond(json({ ok: true, ignored: "unparseable" }, 200), {
      outcome: "ignored",
      errorMessage: detail,
      requestPayload: envelope,
    });
  }
```

**(j) `message.any` duplicate-of-inbound guard — ignored** (currently
lines 299-302):

```ts
  if (envelope.event === "message.any" && parsed.type !== "outbound-echo") {
    await markProcessed();
    return json({ ok: true, ignored: "message.any-inbound-dup" }, 200);
  }
```

becomes:

```ts
  if (envelope.event === "message.any" && parsed.type !== "outbound-echo") {
    await markProcessed();
    return respond(json({ ok: true, ignored: "message.any-inbound-dup" }, 200), {
      outcome: "ignored",
      requestPayload: envelope,
    });
  }
```

**(k) Outbound-echo: duplicate of an app-sent message** (currently lines
317-320, inside the `if (parsed.type === "outbound-echo") {` block):

```ts
    if (existingOutbound) {
      await markProcessed();
      return json({ ok: true, duplicate: "app-send echo" }, 200);
    }
```

becomes:

```ts
    if (existingOutbound) {
      await markProcessed();
      return respond(json({ ok: true, duplicate: "app-send echo" }, 200), {
        outcome: "duplicate",
        requestPayload: envelope,
      });
    }
```

**(l) Outbound-echo: `to` is an unresolvable `@lid` with no digits**
(currently lines 349-357, inside the `if (!toPhone && parsed.toLid) {`
block):

```ts
      if (!toPhone) {
        const lidDigits = parsed.toLid.split("@")[0]?.replace(/\D/g, "") ?? "";
        if (!lidDigits) {
          await markProcessed();
          return json({ ok: true, ignored: "no-phone" }, 200);
        }
        toPhone = `+${lidDigits}`;
        toLidUnresolved = true;
      }
```

becomes:

```ts
      if (!toPhone) {
        const lidDigits = parsed.toLid.split("@")[0]?.replace(/\D/g, "") ?? "";
        if (!lidDigits) {
          await markProcessed();
          return respond(json({ ok: true, ignored: "no-phone" }, 200), {
            outcome: "ignored",
            requestPayload: envelope,
          });
        }
        toPhone = `+${lidDigits}`;
        toLidUnresolved = true;
      }
```

**(m) Outbound-echo: no `toPhone` at all** (currently lines 359-362):

```ts
    if (!toPhone) {
      await markProcessed();
      return json({ ok: true, ignored: "no-phone" }, 200);
    }
```

becomes:

```ts
    if (!toPhone) {
      await markProcessed();
      return respond(json({ ok: true, ignored: "no-phone" }, 200), {
        outcome: "ignored",
        requestPayload: envelope,
      });
    }
```

**(n) Outbound-echo: customer insert failed** (currently lines 383-391):

```ts
      if (echoCustomerErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: echo customer insert failed",
            error: echoCustomerErr.message,
          }),
        );
        return json({ ok: true, ignored: "echo-customer-insert-failed" }, 200);
      }
```

becomes:

```ts
      if (echoCustomerErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: echo customer insert failed",
            error: echoCustomerErr.message,
          }),
        );
        return respond(json({ ok: true, ignored: "echo-customer-insert-failed" }, 200), {
          outcome: "ignored",
          errorMessage: echoCustomerErr.message,
          requestPayload: envelope,
        });
      }
```

**(o) Outbound-echo: conversation insert failed** (currently lines
429-437):

```ts
      if (echoConvErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: echo conversation insert failed",
            error: echoConvErr.message,
          }),
        );
        return json({ ok: true, ignored: "echo-conversation-insert-failed" }, 200);
      }
```

becomes:

```ts
      if (echoConvErr) {
        console.warn(
          JSON.stringify({
            level: "warn",
            msg: "waha webhook: echo conversation insert failed",
            error: echoConvErr.message,
          }),
        );
        return respond(json({ ok: true, ignored: "echo-conversation-insert-failed" }, 200), {
          outcome: "ignored",
          errorMessage: echoConvErr.message,
          requestPayload: envelope,
        });
      }
```

**(p) Outbound-echo: message insert failed** (currently lines 460-468):

```ts
    if (echoMessageErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: echo message insert failed",
          error: echoMessageErr.message,
        }),
      );
      return json({ ok: true, ignored: "echo-message-insert-failed" }, 200);
    }
```

becomes:

```ts
    if (echoMessageErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: echo message insert failed",
          error: echoMessageErr.message,
        }),
      );
      return respond(json({ ok: true, ignored: "echo-message-insert-failed" }, 200), {
        outcome: "ignored",
        errorMessage: echoMessageErr.message,
        requestPayload: envelope,
      });
    }
```

**(q) Outbound-echo: final success** (currently lines 482-484):

```ts
    if (parsed.mediaId) await attachMedia(parsed.mediaId, echoConversationId, echoMessageId);
    await logWebhookSuccess();
    return json({ ok: true }, 200);
  }
```

becomes:

```ts
    if (parsed.mediaId) await attachMedia(parsed.mediaId, echoConversationId, echoMessageId);
    await logWebhookSuccess();
    return respond(json({ ok: true }, 200), {
      outcome: "processed",
      eventType: "message.any",
      requestPayload: envelope,
    });
  }
```

**(r) Inbound: `@lid` unresolvable with no digits** (currently lines
517-529, inside the `if (!fromPhone && parsed.fromLid) {` block):

```ts
    if (!fromPhone) {
      // Unresolved lid: keep a stable placeholder derived from the lid digits
      // so the conversation still threads (same digits ⇒ same customer), but
      // tag the customer for triage — the digits are NEVER a validated phone
      // and are NEVER shown as the display name (see the insert below).
      const lidDigits = parsed.fromLid.split("@")[0]?.replace(/\D/g, "") ?? "";
      if (!lidDigits) {
        await markProcessed();
        return json({ ok: true, ignored: "no-phone" }, 200);
      }
      fromPhone = `+${lidDigits}`;
      lidUnresolved = true;
    }
```

becomes:

```ts
    if (!fromPhone) {
      // Unresolved lid: keep a stable placeholder derived from the lid digits
      // so the conversation still threads (same digits ⇒ same customer), but
      // tag the customer for triage — the digits are NEVER a validated phone
      // and are NEVER shown as the display name (see the insert below).
      const lidDigits = parsed.fromLid.split("@")[0]?.replace(/\D/g, "") ?? "";
      if (!lidDigits) {
        await markProcessed();
        return respond(json({ ok: true, ignored: "no-phone" }, 200), {
          outcome: "ignored",
          requestPayload: envelope,
        });
      }
      fromPhone = `+${lidDigits}`;
      lidUnresolved = true;
    }
```

**(s) Inbound: no `fromPhone` at all** (currently lines 531-534):

```ts
  if (!fromPhone) {
    await markProcessed();
    return json({ ok: true, ignored: "no-phone" }, 200);
  }
```

becomes:

```ts
  if (!fromPhone) {
    await markProcessed();
    return respond(json({ ok: true, ignored: "no-phone" }, 200), {
      outcome: "ignored",
      requestPayload: envelope,
    });
  }
```

**(t) Inbound: customer insert failed** (currently lines 577-586):

```ts
    if (customerErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: customer insert failed",
          error: customerErr.message,
        }),
      );
      return json({ ok: true, ignored: "customer-insert-failed" }, 200);
    }
```

becomes:

```ts
    if (customerErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: customer insert failed",
          error: customerErr.message,
        }),
      );
      return respond(json({ ok: true, ignored: "customer-insert-failed" }, 200), {
        outcome: "ignored",
        errorMessage: customerErr.message,
        requestPayload: envelope,
      });
    }
```

**(u) Inbound: conversation insert failed** (currently lines 618-626):

```ts
    if (convErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: conversation insert failed",
          error: convErr.message,
        }),
      );
      return json({ ok: true, ignored: "conversation-insert-failed" }, 200);
    }
```

becomes:

```ts
    if (convErr) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "waha webhook: conversation insert failed",
          error: convErr.message,
        }),
      );
      return respond(json({ ok: true, ignored: "conversation-insert-failed" }, 200), {
        outcome: "ignored",
        errorMessage: convErr.message,
        requestPayload: envelope,
      });
    }
```

**(v) Inbound: final success** (currently the very last two lines of the
file, 693-694 — note `messageErr` above this point, if set, already
skipped `markProcessed()` but does NOT return early; this is genuinely
the single terminal line for the whole inbound-message path):

```ts
  await logWebhookSuccess();
  return json({ ok: true }, 200);
});
```

becomes:

```ts
  await logWebhookSuccess();
  return respond(json({ ok: true }, 200), {
    outcome: "processed",
    eventType: "message",
    requestPayload: envelope,
  });
```

(the closing `});` of `Deno.serve` moves to after the new `catch` block —
see Step 3 immediately below.)

- [ ] **Step 3: Add a top-level try/catch around the idempotency-check-onward body**

Every branch from (f) [the `processed_events` duplicate check] through
(v) [the final inbound success] currently runs with no enclosing
try/catch — an unhandled throw anywhere in that range today surfaces as a
bare, uncaught Deno 500 with no delivery logged at all. This step closes
that gap.

Find the line immediately after the HMAC gate (e) — the start of the
idempotency check:

```ts
  // ===== Idempotency — CHECK is early (read-only), MARK is deferred =========
```

Insert `try {` as a new line immediately before that comment (i.e., right
after the closing `}` of the HMAC gate's `if (!valid) { ... }` block).

Find the very end of the file — after Step 2(v)'s edit, the file now ends
with:

```ts
  await logWebhookSuccess();
  return respond(json({ ok: true }, 200), {
    outcome: "processed",
    eventType: "message",
    requestPayload: envelope,
  });
});
```

Replace those final two lines (`});`) with:

```ts
  await logWebhookSuccess();
  return respond(json({ ok: true }, 200), {
    outcome: "processed",
    eventType: "message",
    requestPayload: envelope,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({ level: "error", msg: "waha webhook processing failed", error: message }),
    );
    return respond(json({ status: "error-logged" }, 200), {
      outcome: "error",
      errorMessage: message,
      requestPayload: envelope,
    });
  }
});
```

This is intentionally a **minimal, unindented** insertion — inserting a
bare `try {` and a matching `} catch (err) { ... }` around existing code
is syntactically valid TypeScript without re-indenting every line in
between; no existing statement moves, is removed, or is reordered. After
this step, run the formatter to fix indentation cosmetically:

Run: `npx prettier --write supabase/functions/waha-webhook/index.ts`
Expected: only whitespace/indentation changes in the diff (confirm with
`git diff --ignore-space-change supabase/functions/waha-webhook/index.ts`
— it should show no remaining hunks).

- [ ] **Step 4: Manual verification (post-deploy, owner-gated)**

Same as Task 6 Step 6 — do NOT deploy as part of this task. Record in the
PR description the same 3-case verification (real message, duplicate
retry, bad-signature request), plus: "confirm the reaction/empty-message
investigation can now be resumed by inspecting `webhook_deliveries` for
the account's `event_type`/`request_payload` next time an empty message
arrives."

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/waha-webhook/index.ts
git commit -m "feat(edge): log every waha-webhook delivery to webhook_deliveries"
```

---

### Task 8: "Webhooks" card on the System Health page

**Files:**
- Create: `src/features/system-health/hooks/useWebhookDeliveries.ts`
- Create: `src/features/system-health/components/WebhookDeliveriesCard.tsx`
- Create: `src/features/system-health/components/WebhookDeliveryDetailDialog.tsx`
- Modify: `src/features/system-health/pages/SystemHealthPage.tsx`
- Modify: `src/features/system-health/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `useWebhookDeliveriesProvider` (Task 4), `IWebhookDelivery`,
  `IWebhookDeliveryFilters`, `WebhookDeliveryOutcome` (Task 2).

- [ ] **Step 1: Add i18n strings**

In `src/features/system-health/i18n/pt-BR.ts`, add a new top-level key
(mirroring the existing flat-key style used by `providersCardTitle` /
`providersCardSubtitle` etc. — search for `providersCardSubtitle` to find
the right spot and add these as siblings):

```ts
  webhooksCardTitle: "Webhooks",
  webhooksCardSubtitle: "Histórico bruto de todo webhook recebido (WhatsApp), qualquer resultado",
  webhooksEmpty: "Nenhuma entrega registrada ainda.",
  webhooksFilterAccount: "Conta",
  webhooksFilterOutcome: "Resultado",
  webhooksFilterPeriod: "Período",
  webhooksFilterAll: "Todas",
  webhooksFilterAllAccounts: "Todas as contas",
  webhooksPeriod24h: "Últimas 24h",
  webhooksPeriod7d: "Últimos 7 dias",
  webhooksPeriod30d: "Últimos 30 dias",
  webhooksColumnTime: "Quando",
  webhooksColumnEvent: "Evento",
  webhooksColumnOutcome: "Resultado",
  webhooksColumnStatus: "Status HTTP",
  webhooksColumnLatency: "Latência",
  webhooksOutcomeProcessed: "Processado",
  webhooksOutcomeIgnored: "Ignorado",
  webhooksOutcomeDuplicate: "Duplicado",
  webhooksOutcomeError: "Erro",
  webhooksOutcomeRejected: "Rejeitado",
  webhooksDetailTitle: "Payload bruto",
  webhooksDetailError: "Erro registrado",
  webhooksClose: "Fechar",
```

- [ ] **Step 2: Write the data hook**

Create `src/features/system-health/hooks/useWebhookDeliveries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { useWebhookDeliveriesProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import type { IWebhookDeliveryFilters } from "@/shared/types";

/** Data plumbing for the "Webhooks" card (raw delivery history). */
export function useWebhookDeliveries(filters: IWebhookDeliveryFilters) {
  const provider = useWebhookDeliveriesProvider();
  return useQuery({
    queryKey: ["system-health", "webhook-deliveries", filters],
    queryFn: () => provider.list(filters),
    staleTime: 15_000,
  });
}

/** Account roster for the card's "Conta" filter dropdown. */
export function useWebhookDeliveryAccountOptions() {
  const accountsProvider = useWhatsAppAccountsProvider();
  return useQuery({
    queryKey: ["system-health", "webhook-deliveries", "accounts"],
    queryFn: () => accountsProvider.list(),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 3: Write the detail dialog**

Create `src/features/system-health/components/WebhookDeliveryDetailDialog.tsx`:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { IWebhookDelivery } from "@/shared/types";
import { S } from "../i18n/pt-BR";

export function WebhookDeliveryDetailDialog({
  delivery,
  onClose,
}: {
  delivery: IWebhookDelivery | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={delivery !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="flex-row items-center justify-between space-y-0 border-b border-border px-4 py-3">
          <DialogTitle className="text-sm">{S.webhooksDetailTitle}</DialogTitle>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label={S.webhooksClose}>
            <Icon icon="mdi:close" size={18} />
          </Button>
        </DialogHeader>
        {delivery && (
          <div className="min-h-0 flex-1 overflow-auto p-4 text-xs">
            {delivery.errorMessage && (
              <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                <strong>{S.webhooksDetailError}:</strong> {delivery.errorMessage}
              </p>
            )}
            <pre className="whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono">
              {JSON.stringify(delivery.requestPayload, null, 2)}
            </pre>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write the card**

Create `src/features/system-health/components/WebhookDeliveriesCard.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IWebhookDelivery, IWebhookDeliveryFilters, WebhookDeliveryOutcome } from "@/shared/types";
import { useWebhookDeliveries, useWebhookDeliveryAccountOptions } from "../hooks/useWebhookDeliveries";
import { WebhookDeliveryDetailDialog } from "./WebhookDeliveryDetailDialog";
import { S } from "../i18n/pt-BR";

const OUTCOME_LABEL: Record<WebhookDeliveryOutcome, string> = {
  processed: S.webhooksOutcomeProcessed,
  ignored: S.webhooksOutcomeIgnored,
  duplicate: S.webhooksOutcomeDuplicate,
  error: S.webhooksOutcomeError,
  rejected: S.webhooksOutcomeRejected,
};

const OUTCOME_VARIANT: Record<WebhookDeliveryOutcome, "default" | "secondary" | "destructive" | "outline"> = {
  processed: "default",
  ignored: "secondary",
  duplicate: "secondary",
  error: "destructive",
  rejected: "destructive",
};

type PeriodOption = "24h" | "7d" | "30d";

const PERIOD_HOURS: Record<PeriodOption, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30 };

export function WebhookDeliveriesCard() {
  const [outcome, setOutcome] = useState<WebhookDeliveryOutcome | "all">("all");
  const [accountId, setAccountId] = useState<string | "all">("all");
  const [period, setPeriod] = useState<PeriodOption>("24h");
  const [selected, setSelected] = useState<IWebhookDelivery | null>(null);
  const accountsQuery = useWebhookDeliveryAccountOptions();

  const filters = useMemo<IWebhookDeliveryFilters>(() => {
    const f: IWebhookDeliveryFilters = {
      fromDate: new Date(Date.now() - PERIOD_HOURS[period] * 60 * 60_000).toISOString(),
    };
    if (outcome !== "all") f.outcome = outcome;
    if (accountId !== "all") f.accountId = accountId;
    return f;
  }, [outcome, accountId, period]);

  const query = useWebhookDeliveries(filters);
  const deliveries = query.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{S.webhooksCardTitle}</CardTitle>
          <CardDescription>{S.webhooksCardSubtitle}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={accountId} onValueChange={(v) => setAccountId(v)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder={S.webhooksFilterAccount} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.webhooksFilterAllAccounts}</SelectItem>
              {(accountsQuery.data ?? []).map((acc) => (
                <SelectItem key={acc.id} value={acc.id}>
                  {acc.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(v) => setPeriod(v as PeriodOption)}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder={S.webhooksFilterPeriod} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">{S.webhooksPeriod24h}</SelectItem>
              <SelectItem value="7d">{S.webhooksPeriod7d}</SelectItem>
              <SelectItem value="30d">{S.webhooksPeriod30d}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outcome} onValueChange={(v) => setOutcome(v as WebhookDeliveryOutcome | "all")}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder={S.webhooksFilterOutcome} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{S.webhooksFilterAll}</SelectItem>
              <SelectItem value="processed">{S.webhooksOutcomeProcessed}</SelectItem>
              <SelectItem value="ignored">{S.webhooksOutcomeIgnored}</SelectItem>
              <SelectItem value="duplicate">{S.webhooksOutcomeDuplicate}</SelectItem>
              <SelectItem value="error">{S.webhooksOutcomeError}</SelectItem>
              <SelectItem value="rejected">{S.webhooksOutcomeRejected}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{S.webhooksEmpty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnTime}</th>
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnEvent}</th>
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnOutcome}</th>
                  <th className="py-1.5 pr-3 font-medium">{S.webhooksColumnStatus}</th>
                  <th className="py-1.5 font-medium">{S.webhooksColumnLatency}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr
                    key={d.id}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/40"
                    onClick={() => setSelected(d)}
                  >
                    <td className="py-1.5 pr-3 text-xs text-muted-foreground">
                      {new Date(d.createdAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-1.5 pr-3 text-xs">
                      {d.integrationName}
                      {d.eventType ? ` · ${d.eventType}` : ""}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={OUTCOME_VARIANT[d.outcome]}>{OUTCOME_LABEL[d.outcome]}</Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-xs">{d.httpStatus}</td>
                    <td className="py-1.5 text-xs text-muted-foreground">
                      {d.latencyMs !== null ? `${d.latencyMs}ms` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <WebhookDeliveryDetailDialog delivery={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}
```

- [ ] **Step 5: Wire it into the page**

In `src/features/system-health/pages/SystemHealthPage.tsx`, add the
import next to the other feature-local imports:

```tsx
import { WebhookDeliveriesCard } from "../components/WebhookDeliveriesCard";
```

Add `<WebhookDeliveriesCard />` as a new sibling `Card`, right after the
existing `<WhatsAppProvidersCard ... />` usage:

```tsx
      <WhatsAppProvidersCard
        accounts={whatsappProviders.data}
        isLoading={whatsappProviders.isLoading}
      />

      <WebhookDeliveriesCard />

      <WhatsAppDeliveryCard
```

- [ ] **Step 6: Verify the mock path renders**

Run: `bun run dev` (if not already running) and navigate to
`/app/gestao/saude` as an Owner-role mock user (`VITE_DATA_SOURCE=mock`
default). Confirm the "Webhooks" card renders 5 rows (matching Task 3's
fixture), the outcome filter narrows the list, and clicking a row opens
the detail dialog with the raw JSON payload. **Known mock-mode limitation
(accepted, not a bug to fix):** the Conta dropdown lists REAL accounts
from `mockWhatsAppAccountsProvider` (the actual seeded mock store), while
Task 3's `webhookDeliveries` fixture uses self-contained fake ids
(`"wa-mock-matriz"`/`"wa-mock-filial"`, matching `systemHealth.ts`'s own
convention) that never match a real seeded account id — so selecting an
account in mock mode always yields an empty list. This only affects the
mock demo; the Supabase source has no such mismatch (both the account
dropdown and the deliveries come from the same real `whatsapp_accounts`
table). Confirming the account filter narrows results is therefore a
**post-deploy, real-data verification**, not a mock-mode one. **Per this project's
convention, you (the user) verify this manually in the browser — do not
ask an agent to open a browser for validation.**

- [ ] **Step 7: Full suite + type-check**

Run: `bun run test`
Expected: all test files pass (including every file from Tasks 3-5).

Run: `bun run build`
Expected: clean build.

- [ ] **Step 8: Commit**

```bash
git add src/features/system-health/hooks/useWebhookDeliveries.ts src/features/system-health/components/WebhookDeliveriesCard.tsx src/features/system-health/components/WebhookDeliveryDetailDialog.tsx src/features/system-health/pages/SystemHealthPage.tsx src/features/system-health/i18n/pt-BR.ts
git commit -m "feat(system-health): add Webhooks card with raw payload detail view"
```
