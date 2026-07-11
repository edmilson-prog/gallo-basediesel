# Integração WAHA (WhatsApp HTTP API) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WAHA as a 4th WhatsApp engine — fully isolated code and Edge Functions, sharing only `conversations`/`messages`/`whatsapp-media` (so it lands in the same Inbox) and the frozen access-control RPCs (consumed, never edited).

**Architecture:** `whatsapp_accounts` gains a pointer row (`provider='waha'`) so conversations inherit the existing "2 portões" access model for free; everything WAHA-specific (endpoint, global API key, webhook HMAC secret) lives in a new satellite table `waha_servers` (same shape as the already-shipped `whatsapp_go_servers`). Three brand-new Edge Functions (`waha-connect`, `waha-webhook`, `waha-send`) never import from `_shared/whatsapp/{webhook,send}/core.ts`, `build.ts`, or `factory.ts` — a self-contained engine module `src/providers/whatsapp/waha/` (tested with Vitest, auto-mirrored into `supabase/functions/_shared/whatsapp/waha/` by the existing sync script) provides everything they need.

**Tech Stack:** Bun + Vitest (TDD), TypeScript strict, Supabase (Postgres + Edge Functions/Deno), React 19 + TanStack Router, shadcn/ui, Provider Pattern (`@/providers/data`).

## Global Constraints

- Never edit `supabase/functions/_shared/whatsapp/webhook/core.ts`, `supabase/functions/_shared/whatsapp/send/core.ts`, `src/providers/whatsapp/build.ts`, `src/providers/whatsapp/factory.ts`, or any of `can_access_conversation` / `count_conversations` / `search_conversations` / `search_conversation_messages` / `current_seller_accessible_account_ids` / `whatsapp_health_tick` (SQL). Consuming them (RPC calls, type imports) is fine; editing them is not.
- `src/providers/whatsapp/waha/**` uses ONLY relative imports and Web APIs (no `@/` alias, no Node/Deno-specific APIs) — it must byte-mirror into `supabase/functions/_shared/whatsapp/waha/**` via `bun run scripts/sync-whatsapp-shared.ts` with zero changes to that script (it already recurses into subdirectories).
- Every migration is idempotent (`if not exists` / `drop ... if exists` then `create`) and applied to production **manually via MCP**, then mirrored into `supabase/migrations/` in the same PR (project rule).
- Money is not involved. Secrets (API key, HMAC key, dashboard/Swagger basic-auth passwords) never enter any file, migration, or log — only the Vault via `integration-secrets`/`integration_secret_set`.
- Domain interfaces are prefixed `I`; DB columns are `snake_case`; TS is `camelCase`; files are `kebab-case` where new; comments in English, UI copy in Portuguese with full accents.
- Run `bun run test` after every task; run `bunx tsc --noEmit` and diff new files against `git diff --name-status main...HEAD --diff-filter=A` before the final task (baseline `tsc` errors pre-exist — only new files must be clean).

---

### Task 1: Migration — `waha_servers` registry table

**Files:**
- Create: `supabase/migrations/20260710150000_waha_servers.sql`

**Interfaces:**
- Produces: table `public.waha_servers(id uuid pk, name text unique, base_url text, api_key_ref text unique, webhook_hmac_ref text, created_at, updated_at)`, Owner-only RLS.

- [ ] **Step 1: Write the migration**

```sql
-- WAHA (devlikeapro/waha) — server registry.
-- Platform-level (no store scope): one row per WAHA server. Holds the
-- friendly name, endpoint and Vault POINTERS to the global X-Api-Key
-- (api_key_ref) and the webhook HMAC secret (webhook_hmac_ref) — the secrets
-- themselves never live here. Sessions link via
-- whatsapp_accounts.waha_server_id (ON DELETE RESTRICT = delete guard).
-- Mirrors whatsapp_go_servers (20260626190000) byte-for-byte in shape.
--
-- Owner-only RLS mirrors ai_settings / whatsapp_go_servers: predicate
-- "(select public.current_app_role()) = 'owner'" (initplan, evaluated once
-- per statement). Edge Functions use service_role (bypasses RLS).
-- Additive + idempotent DDL.

create table if not exists public.waha_servers (
  id                uuid        primary key default gen_random_uuid(),
  name              text        not null unique,
  base_url          text        not null,
  api_key_ref       text        not null unique,
  webhook_hmac_ref  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint waha_servers_api_key_ref_pattern
    check (api_key_ref ~ '^[A-Z][A-Z0-9_]{2,64}$'),
  constraint waha_servers_webhook_hmac_ref_pattern
    check (webhook_hmac_ref is null or webhook_hmac_ref ~ '^[A-Z][A-Z0-9_]{2,64}$')
);

comment on table public.waha_servers is
  'Registry of WAHA (devlikeapro/waha) servers. Platform-level, Owner-only. '
  'api_key_ref / webhook_hmac_ref are Vault secret name pointers — the '
  'secrets themselves never live here.';

alter table public.waha_servers enable row level security;

drop policy if exists waha_servers_owner_all on public.waha_servers;
create policy waha_servers_owner_all
  on public.waha_servers
  for all
  to authenticated
  using ((select public.current_app_role()) = 'owner')
  with check ((select public.current_app_role()) = 'owner');
```

- [ ] **Step 2: Apply via MCP to the project's Supabase, then verify**

Use `mcp__supabase__apply_migration` with `name: "waha_servers"` and the SQL above (`version` = the filename's timestamp). Then verify:

```sql
select table_name from information_schema.tables where table_name = 'waha_servers';
```

Expected: 1 row.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260710150000_waha_servers.sql
git commit -m "feat: add waha_servers registry table"
```

---

### Task 2: Migration — `whatsapp_accounts` WAHA pointer + `integration_logs` widening

**Files:**
- Create: `supabase/migrations/20260710150100_whatsapp_accounts_waha_provider.sql`

**Interfaces:**
- Consumes: `waha_servers(id)` from Task 1.
- Produces: `whatsapp_accounts.waha_server_id`, widened `provider_config` shape CHECK (adds `waha` branch requiring `sessionName`), unique partial index on `provider_config->>'sessionName' where provider='waha'`, widened `integration_logs.integration_name` CHECK (adds `'whatsapp_waha'`).

- [ ] **Step 1: Write the migration**

```sql
-- WAHA provider — additive, non-breaking (mirrors 20260625120000, the
-- evolution-go precedent). whatsapp_accounts.provider is free text (no value
-- CHECK), so 'waha' is already accepted; only the provider_config shape CHECK
-- and the FK to the new server registry need widening.

-- 1) FK to the server registry (nullable — only WAHA accounts fill it).
alter table public.whatsapp_accounts
  add column if not exists waha_server_id uuid
  references public.waha_servers (id) on delete restrict;

comment on column public.whatsapp_accounts.waha_server_id is
  'WAHA accounts only: FK to waha_servers. NULL for Meta/Evolution/Evolution Go. '
  'ON DELETE RESTRICT prevents removing a server while sessions are linked.';

create index if not exists idx_whatsapp_accounts_waha_server_id
  on public.whatsapp_accounts (waha_server_id);

-- 2) provider_config shape CHECK — add the 'waha' branch (sessionName only;
--    baseUrl/apiKey live on the server registry, not on the account).
alter table public.whatsapp_accounts
  drop constraint if exists whatsapp_accounts_provider_config_shape;

alter table public.whatsapp_accounts
  add constraint whatsapp_accounts_provider_config_shape
  check (
    provider_config is null
    or (provider = 'meta' and provider_config ? 'phoneNumberId' and provider_config ? 'businessAccountId')
    or (provider = 'evolution' and provider_config ? 'baseUrl' and provider_config ? 'instanceName')
    or (provider = 'evolution-go' and provider_config ? 'baseUrl' and provider_config ? 'instanceId')
    or (provider = 'waha' and provider_config ? 'sessionName')
  );

-- 3) Deterministic webhook resolution by session name (mirrors instanceName/
--    phoneNumberId unique partial indexes from 20260615130500).
create unique index if not exists idx_whatsapp_accounts_waha_session_name
  on public.whatsapp_accounts ((provider_config ->> 'sessionName'))
  where provider = 'waha';

-- 4) integration_logs: allow 'whatsapp_waha' (mirrors 20260626031541, the
--    lesson from the evolution-go rollout — without this, every WAHA log
--    entry is silently dropped by the fail-open sink).
alter table public.integration_logs
  drop constraint if exists integration_logs_integration_name_check;

alter table public.integration_logs
  add constraint integration_logs_integration_name_check
  check (integration_name in (
    'whatsapp_meta', 'whatsapp_evolution', 'whatsapp_evolution_go', 'whatsapp_waha', 'melhor_envio'
  ));
```

- [ ] **Step 2: Apply via MCP, then verify**

```sql
select conname from pg_constraint where conname = 'whatsapp_accounts_provider_config_shape';
select conname from pg_constraint where conname = 'integration_logs_integration_name_check';
select indexname from pg_indexes where indexname = 'idx_whatsapp_accounts_waha_session_name';
```

Expected: all 3 present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260710150100_whatsapp_accounts_waha_provider.sql
git commit -m "feat: extend whatsapp_accounts and integration_logs for WAHA"
```

---

### Task 3: Domain types

**Files:**
- Modify: `src/shared/types/conversation.ts`

**Interfaces:**
- Produces: `IWahaServer`, `IWhatsAppAccount.wahaServerId?`, `WhatsAppProviderName` widened to include `"waha"`, `MessageProvider` widened to include `"waha"`.

- [ ] **Step 1: Widen `WhatsAppProviderName` and `MessageProvider`**

Find and edit:
```ts
export type WhatsAppProviderName = "meta" | "evolution" | "evolution-go";
```
→
```ts
export type WhatsAppProviderName = "meta" | "evolution" | "evolution-go" | "waha";
```

Find and edit:
```ts
export type MessageProvider = "meta" | "evolution" | "evolution-go" | "mock";
```
→
```ts
export type MessageProvider = "meta" | "evolution" | "evolution-go" | "waha" | "mock";
```

- [ ] **Step 2: Add `wahaServerId` to `IWhatsAppAccount`**

Add next to the existing `goServerId?: ID;` field:
```ts
  /** Evolution Go — server this instance belongs to (registry). Null for v2/Meta. */
  goServerId?: ID;
  /** WAHA — server this session belongs to (registry). Null for other engines. */
  wahaServerId?: ID;
```

- [ ] **Step 3: Add `IWahaServer` interface**

Add right after `IWhatsAppGoServer`:
```ts
/**
 * WAHA (devlikeapro/waha) server. Platform-level infra registered once by the
 * Owner. Holds the friendly name, endpoint and Vault POINTERS to the global
 * `X-Api-Key` (apiKeyRef) and the webhook HMAC secret (webhookHmacRef) — never
 * the secrets themselves. WAHA sessions reference it via
 * `IWhatsAppAccount.wahaServerId`.
 */
export interface IWahaServer {
  id: ID;
  /** Friendly name (unique). */
  name: string;
  /** Endpoint, normalized (no trailing slash). */
  baseUrl: string;
  /** Vault secret name holding the server-wide X-Api-Key. Matches `^[A-Z][A-Z0-9_]{2,64}$`. */
  apiKeyRef: string;
  /** Vault secret name holding the webhook HMAC-SHA512 key. Undefined until configured. */
  webhookHmacRef?: string;
  createdAt: ISO8601;
  updatedAt?: ISO8601;
}
```

- [ ] **Step 4: Verify the file compiles**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -i "conversation.ts"`
Expected: no new errors referencing these edits (pre-existing baseline errors elsewhere are fine).

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/conversation.ts
git commit -m "feat: add IWahaServer and widen WhatsApp provider unions"
```

---

### Task 4: Provider contract + mock/supabase impl for `wahaServers`

**Files:**
- Create: `src/providers/data/contracts/wahaServers.ts`
- Create: `src/providers/data/impl/mock/wahaServers.ts`
- Create: `src/providers/data/impl/mock/wahaServers.test.ts`
- Create: `src/providers/data/impl/supabase/wahaServers.ts`
- Create: `src/providers/data/hooks/useWahaServersProvider.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Modify: `src/providers/data/factory.ts`
- Modify: `src/providers/data/index.ts`

**Interfaces:**
- Produces: `IWahaServersProvider` (contract), registered as `wahaServers` on `IDataProviders`, `useWahaServersProvider()` hook.

- [ ] **Step 1: Write the contract**

`src/providers/data/contracts/wahaServers.ts`:
```ts
import type { ID, IWahaServer } from "@/shared/types";

export interface ICreateWahaServerInput {
  name: string;
  baseUrl: string;
  /** Vault secret name (pointer) for the global X-Api-Key. */
  apiKeyRef: string;
}

export interface IWahaServerPatch {
  name?: string;
  baseUrl?: string;
}

/**
 * Registry of WAHA servers (platform-level, Owner-only at the RLS layer).
 * Table-only: the API key and webhook HMAC secret live in the Vault and are
 * written/rotated by the Chaves screen through the `integration-secrets` Edge
 * Function, never here. `remove` is guarded by the FK
 * `whatsapp_accounts.waha_server_id` (ON DELETE RESTRICT) — deleting a
 * server with linked sessions fails.
 */
export interface IWahaServersProvider {
  list(): Promise<IWahaServer[]>;
  create(input: ICreateWahaServerInput): Promise<IWahaServer>;
  update(id: ID, patch: IWahaServerPatch): Promise<IWahaServer>;
  /** Sets or clears (pass null) the webhook HMAC secret pointer. */
  setWebhookHmacRef(id: ID, hmacRef: string | null): Promise<IWahaServer>;
  remove(id: ID): Promise<void>;
}
```

- [ ] **Step 2: Write the mock impl + test**

`src/providers/data/impl/mock/wahaServers.ts`:
```ts
import type { ID, IWahaServer } from "@/shared/types";
import type {
  ICreateWahaServerInput,
  IWahaServerPatch,
  IWahaServersProvider,
} from "../../contracts/wahaServers";

function seed(): IWahaServer[] {
  return [
    {
      id: "00000000-0000-0000-0000-000000wahad",
      name: "Servidor WAHA (demonstração)",
      baseUrl: "https://waha.demo.local",
      apiKeyRef: "WAHA_SERVER_DEMO_AB",
      webhookHmacRef: "WAHA_SERVER_DEMO_HMAC",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

let servers: IWahaServer[] = seed();

/** Test-only: restore the deterministic seed between cases. */
export function __resetMockWahaServers(): void {
  servers = seed();
}

export const mockWahaServersProvider: IWahaServersProvider = {
  async list(): Promise<IWahaServer[]> {
    return servers.map((s) => ({ ...s }));
  },
  async create(input: ICreateWahaServerInput): Promise<IWahaServer> {
    const server: IWahaServer = {
      id: crypto.randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      apiKeyRef: input.apiKeyRef,
      createdAt: new Date().toISOString(),
    };
    servers = [...servers, server];
    return { ...server };
  },
  async update(id: ID, patch: IWahaServerPatch): Promise<IWahaServer> {
    const idx = servers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[mock] waha server ${id} not found`);
    const next = {
      ...servers[idx],
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl } : {}),
      updatedAt: new Date().toISOString(),
    };
    servers = servers.map((s) => (s.id === id ? next : s));
    return { ...next };
  },
  async setWebhookHmacRef(id: ID, hmacRef: string | null): Promise<IWahaServer> {
    const idx = servers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[mock] waha server ${id} not found`);
    const next: IWahaServer = {
      ...servers[idx],
      webhookHmacRef: hmacRef ?? undefined,
      updatedAt: new Date().toISOString(),
    };
    servers = servers.map((s) => (s.id === id ? next : s));
    return { ...next };
  },
  async remove(id: ID): Promise<void> {
    servers = servers.filter((s) => s.id !== id);
  },
};
```

`src/providers/data/impl/mock/wahaServers.test.ts`:
```ts
import { beforeEach, describe, expect, it } from "vitest";
import { __resetMockWahaServers, mockWahaServersProvider } from "./wahaServers";

describe("mockWahaServersProvider", () => {
  beforeEach(() => {
    __resetMockWahaServers();
  });

  it("lists the seeded server", async () => {
    const servers = await mockWahaServersProvider.list();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe("Servidor WAHA (demonstração)");
  });

  it("creates a new server", async () => {
    const created = await mockWahaServersProvider.create({
      name: "Servidor real",
      baseUrl: "https://waha.ailainteligente.com.br",
      apiKeyRef: "WAHA_PROD_API_KEY",
    });
    expect(created.id).toBeTruthy();
    const servers = await mockWahaServersProvider.list();
    expect(servers).toHaveLength(2);
  });

  it("updates name and baseUrl", async () => {
    const updated = await mockWahaServersProvider.update(
      "00000000-0000-0000-0000-000000wahad",
      { name: "Renomeado" },
    );
    expect(updated.name).toBe("Renomeado");
    expect(updated.updatedAt).toBeTruthy();
  });

  it("sets and clears the webhook HMAC ref", async () => {
    const withHmac = await mockWahaServersProvider.setWebhookHmacRef(
      "00000000-0000-0000-0000-000000wahad",
      "WAHA_SERVER_DEMO_HMAC_2",
    );
    expect(withHmac.webhookHmacRef).toBe("WAHA_SERVER_DEMO_HMAC_2");
    const cleared = await mockWahaServersProvider.setWebhookHmacRef(
      "00000000-0000-0000-0000-000000wahad",
      null,
    );
    expect(cleared.webhookHmacRef).toBeUndefined();
  });

  it("removes a server", async () => {
    await mockWahaServersProvider.remove("00000000-0000-0000-0000-000000wahad");
    const servers = await mockWahaServersProvider.list();
    expect(servers).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test**

Run: `bun run test src/providers/data/impl/mock/wahaServers.test.ts`
Expected: 5 passed.

- [ ] **Step 4: Write the supabase impl**

`src/providers/data/impl/supabase/wahaServers.ts`:
```ts
import type { ID, IWahaServer } from "@/shared/types";
import type {
  ICreateWahaServerInput,
  IWahaServerPatch,
  IWahaServersProvider,
} from "../../contracts/wahaServers";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase impl of {@link IWahaServersProvider}. RLS keeps the table
 * Owner-only. Table-only: the API key and webhook HMAC secret live in the
 * Vault (written by the screen via the integration-secrets Edge Function).
 * `remove` relies on the FK `whatsapp_accounts.waha_server_id`
 * (ON DELETE RESTRICT) — Postgres rejects the delete when sessions are
 * linked; we translate that into a friendly message.
 */

interface WahaServerRow {
  id: string;
  name: string;
  base_url: string;
  api_key_ref: string;
  webhook_hmac_ref: string | null;
  created_at: string;
  updated_at: string | null;
}

const TABLE = "waha_servers";
const COLUMNS = "id, name, base_url, api_key_ref, webhook_hmac_ref, created_at, updated_at";

function rowToServer(row: WahaServerRow): IWahaServer {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKeyRef: row.api_key_ref,
    webhookHmacRef: row.webhook_hmac_ref ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export const supabaseWahaServersProvider: IWahaServersProvider = {
  async list(): Promise<IWahaServer[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] wahaServers.list failed: ${error.message}`);
    return (data as unknown as WahaServerRow[]).map(rowToServer);
  },

  async create(input: ICreateWahaServerInput): Promise<IWahaServer> {
    const row = {
      id: crypto.randomUUID(),
      name: input.name,
      base_url: input.baseUrl,
      api_key_ref: input.apiKeyRef,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] wahaServers.create failed: ${error.message}`);
    return rowToServer(data as unknown as WahaServerRow);
  },

  async update(id: ID, patch: IWahaServerPatch): Promise<IWahaServer> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.baseUrl !== undefined) row.base_url = patch.baseUrl;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(row)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] wahaServers.update(${id}) failed: ${error.message}`);
    return rowToServer(data as unknown as WahaServerRow);
  },

  async setWebhookHmacRef(id: ID, hmacRef: string | null): Promise<IWahaServer> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ webhook_hmac_ref: hmacRef, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) {
      throw new Error(`[supabase] wahaServers.setWebhookHmacRef(${id}) failed: ${error.message}`);
    }
    return rowToServer(data as unknown as WahaServerRow);
  },

  async remove(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) {
      if (error.code === "23503") {
        throw new Error("Há sessões usando este servidor. Remova-as antes de excluí-lo.");
      }
      throw new Error(`[supabase] wahaServers.remove(${id}) failed: ${error.message}`);
    }
  },
};
```

- [ ] **Step 5: Register the provider (contracts barrel, factory, hook, data barrel)**

In `src/providers/data/contracts/index.ts`, next to the `whatsappGoServers` import/re-export/field, add:
```ts
import type { IWahaServersProvider } from "./wahaServers";
```
```ts
export type {
  IWahaServersProvider,
  ICreateWahaServerInput,
  IWahaServerPatch,
} from "./wahaServers";
```
Inside `IDataProviders`:
```ts
  whatsappGoServers: IWhatsAppGoServersProvider;
  wahaServers: IWahaServersProvider;
```

In `src/providers/data/factory.ts`, next to the `whatsappGoServers` imports/registrations:
```ts
import { mockWahaServersProvider } from "./impl/mock/wahaServers";
// ...
import { supabaseWahaServersProvider } from "./impl/supabase/wahaServers";
```
Inside `mockProviders`:
```ts
  whatsappGoServers: mockWhatsAppGoServersProvider,
  wahaServers: mockWahaServersProvider,
```
Inside `supabaseProviders`:
```ts
  whatsappGoServers: supabaseWhatsAppGoServersProvider,
  wahaServers: supabaseWahaServersProvider,
```

`src/providers/data/hooks/useWahaServersProvider.ts`:
```ts
import type { IWahaServersProvider } from "../contracts/wahaServers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWahaServersProvider(): IWahaServersProvider {
  return useDataProviderSlice("wahaServers", "useWahaServersProvider");
}
```

In `src/providers/data/index.ts`, add the export next to `useWhatsAppGoServersProvider`:
```ts
export { useWahaServersProvider } from "./hooks/useWahaServersProvider";
```

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `bun run test`
Expected: all previous tests + the 5 new ones pass, 0 failures.

Run: `bunx tsc --noEmit -p . 2>&1 | grep -iE "wahaServers|contracts/index|factory\.ts"`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/providers/data
git commit -m "feat: add wahaServers provider (mock + supabase)"
```

---

### Task 5: WAHA engine — constants, errors, HMAC (pure, TDD)

**Files:**
- Create: `src/providers/whatsapp/waha/constants.ts`
- Create: `src/providers/whatsapp/waha/errors.ts`
- Create: `src/providers/whatsapp/waha/errors.test.ts`
- Create: `src/providers/whatsapp/waha/hmac.ts`
- Create: `src/providers/whatsapp/waha/hmac.test.ts`

**Interfaces:**
- Consumes: `WhatsAppProviderError` from `../errors`, `timingSafeEqualStrings` from `../crypto` (read-only imports — neither file is modified).
- Produces: `WAHA_INTEGRATION_NAME`, `WAHA_DEFAULT_EVENTS`, `WahaSessionState`, `mapWahaError()`, `computeWahaHmac()`, `verifyWahaHmac()`.

- [ ] **Step 1: Write `constants.ts`**

```ts
/**
 * WAHA (devlikeapro/waha) constants. Self-hosted server (GOWS/whatsmeow
 * engine). Fully isolated from the Meta/Evolution/Evolution Go engines —
 * this module never imports from ../build.ts, ../factory.ts, or
 * ../IWhatsAppProvider.ts. It reuses only pure, read-only utilities
 * (WhatsAppProviderError, timingSafeEqualStrings) and normalized types.
 */

export const WAHA_INTEGRATION_NAME = "whatsapp_waha" as const;

/** Webhook events subscribed on session create — message.ack deferred to phase 2. */
export const WAHA_DEFAULT_EVENTS = ["message", "session.status"] as const;

export const WAHA_SESSION_STATES = [
  "STOPPED",
  "STARTING",
  "SCAN_QR_CODE",
  "WORKING",
  "FAILED",
] as const;

export type WahaSessionState = (typeof WAHA_SESSION_STATES)[number];

/** Maps a raw WAHA session state to the platform's IWhatsAppAccount status. */
export function wahaStateToAccountStatus(
  state: string,
): "connected" | "disconnected" | "pending" {
  if (state === "WORKING") return "connected";
  if (state === "STOPPED" || state === "FAILED") return "disconnected";
  return "pending"; // STARTING | SCAN_QR_CODE | unknown
}
```

- [ ] **Step 2: Write the failing test for `errors.ts`**

`src/providers/whatsapp/waha/errors.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { WhatsAppProviderError } from "../errors";
import { mapWahaError } from "./errors";

describe("mapWahaError", () => {
  it("maps 401 to UNAUTHORIZED", () => {
    const err = mapWahaError(401, { error: "invalid api key" }, "/api/sessions");
    expect(err).toBeInstanceOf(WhatsAppProviderError);
    expect(err.code).toBe("UNAUTHORIZED");
    expect(err.httpStatus).toBe(401);
  });

  it("maps 404 to NOT_FOUND", () => {
    const err = mapWahaError(404, { message: "session not found" }, "/api/sessions/foo");
    expect(err.code).toBe("NOT_FOUND");
  });

  it("maps 429 to RATE_LIMITED", () => {
    const err = mapWahaError(429, {}, "/api/sendText");
    expect(err.code).toBe("RATE_LIMITED");
  });

  it("falls back to INTEGRATION_ERROR with the raw message for unmapped statuses", () => {
    const err = mapWahaError(500, { message: "boom" }, "/api/sessions");
    expect(err.code).toBe("INTEGRATION_ERROR");
    expect(err.message).toContain("boom");
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/errors.test.ts`
Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 4: Implement `errors.ts`**

```ts
/** WAHA error mapping. The server answers `{ message }` or `{ error }` with HTTP-status semantics. */

import { WhatsAppProviderError } from "../errors";

function extractMessage(body: unknown): string {
  const c = body as { message?: string | string[]; error?: string } | null;
  const raw = c?.message ?? c?.error ?? "";
  return Array.isArray(raw) ? raw.join("; ") : String(raw);
}

export function mapWahaError(httpStatus: number, body: unknown, endpoint: string): WhatsAppProviderError {
  const message = extractMessage(body);
  const details: Record<string, unknown> = { endpoint, wahaMessage: message };

  if (httpStatus === 401 || httpStatus === 403) {
    return new WhatsAppProviderError("UNAUTHORIZED", 401, "Chave da API WAHA inválida ou ausente", details);
  }
  if (httpStatus === 429) {
    return new WhatsAppProviderError(
      "RATE_LIMITED",
      429,
      "Limite de requisições do WAHA atingido — tente novamente em instantes",
      details,
    );
  }
  if (httpStatus === 404) {
    return new WhatsAppProviderError("NOT_FOUND", 404, "Sessão WAHA não encontrada", details);
  }
  return new WhatsAppProviderError(
    "INTEGRATION_ERROR",
    502,
    `Erro WAHA não mapeado (HTTP ${httpStatus}): ${message || "sem corpo de erro"}`,
    details,
  );
}
```

- [ ] **Step 5: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/errors.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 6: Write the failing test for `hmac.ts`**

`src/providers/whatsapp/waha/hmac.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { computeWahaHmac, verifyWahaHmac } from "./hmac";

describe("computeWahaHmac / verifyWahaHmac", () => {
  it("computes a stable lowercase hex HMAC-SHA512 digest", async () => {
    const digest = await computeWahaHmac('{"event":"message"}', "secret123");
    expect(digest).toMatch(/^[0-9a-f]{128}$/);
    // Same input → same digest (deterministic).
    expect(await computeWahaHmac('{"event":"message"}', "secret123")).toBe(digest);
  });

  it("verifies a matching signature", async () => {
    const body = '{"event":"session.status"}';
    const digest = await computeWahaHmac(body, "topsecret");
    expect(await verifyWahaHmac(body, "topsecret", digest)).toBe(true);
  });

  it("rejects a wrong signature", async () => {
    const body = '{"event":"message"}';
    await computeWahaHmac(body, "topsecret");
    expect(await verifyWahaHmac(body, "topsecret", "0".repeat(128))).toBe(false);
  });

  it("rejects a missing header value", async () => {
    expect(await verifyWahaHmac("{}", "topsecret", null)).toBe(false);
  });

  it("never throws on a malformed header value", async () => {
    await expect(verifyWahaHmac("{}", "topsecret", "not-hex")).resolves.toBe(false);
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/hmac.test.ts`
Expected: FAIL — `Cannot find module './hmac'`.

- [ ] **Step 8: Implement `hmac.ts`**

```ts
/**
 * WAHA webhook HMAC-SHA512 (header `X-Webhook-Hmac`, algorithm advertised via
 * `X-Webhook-Hmac-Algorithm: sha512`). Web Crypto only — runs identically in
 * the browser test runner and in Deno Edge Functions.
 */

import { timingSafeEqualStrings } from "../crypto";

export async function computeWahaHmac(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Never throws — an unverifiable header (missing/malformed) resolves to false. */
export async function verifyWahaHmac(
  rawBody: string,
  secret: string,
  headerValue: string | null,
): Promise<boolean> {
  if (!headerValue) return false;
  try {
    const expected = await computeWahaHmac(rawBody, secret);
    return timingSafeEqualStrings(expected, headerValue);
  } catch {
    return false;
  }
}
```

- [ ] **Step 9: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/hmac.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 10: Commit**

```bash
git add src/providers/whatsapp/waha/constants.ts src/providers/whatsapp/waha/errors.ts src/providers/whatsapp/waha/errors.test.ts src/providers/whatsapp/waha/hmac.ts src/providers/whatsapp/waha/hmac.test.ts
git commit -m "feat: add WAHA engine constants, error mapping and HMAC helpers"
```

---

### Task 6: WAHA engine — HTTP client

**Files:**
- Create: `src/providers/whatsapp/waha/client.ts`
- Create: `src/providers/whatsapp/waha/client.test.ts`

**Interfaces:**
- Consumes: `mapWahaError` from `./errors` (Task 5).
- Produces: `wahaRequest(apiKey, fetchFn, options): Promise<IWahaResponse>`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { wahaRequest } from "./client";
import { WhatsAppProviderError } from "../errors";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("wahaRequest", () => {
  it("sends X-Api-Key and JSON body, returns parsed JSON on 2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await wahaRequest("my-key", fetchFn, {
      baseUrl: "https://waha.example.com",
      path: "/api/sessions",
      json: { name: "s1" },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://waha.example.com/api/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Api-Key"]).toBe("my-key");
    expect(JSON.parse(init.body)).toEqual({ name: "s1" });
  });

  it("defaults to GET when no json body and method omitted is still POST unless specified", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await wahaRequest("k", fetchFn, {
      baseUrl: "https://waha.example.com",
      path: "/api/sessions/s1",
      method: "GET",
    });
    expect(fetchFn.mock.calls[0][1].method).toBe("GET");
  });

  it("returns raw bytes when expectBinary is set", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const result = await wahaRequest("k", fetchFn, {
      baseUrl: "https://waha.example.com",
      path: "/api/s1/auth/qr",
      method: "GET",
      expectBinary: true,
    });
    expect(result.bytes).toEqual(bytes);
    expect(result.contentType).toBe("image/png");
  });

  it("throws WhatsAppProviderError on non-2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(401, { error: "bad key" }));
    await expect(
      wahaRequest("bad", fetchFn, { baseUrl: "https://waha.example.com", path: "/api/sessions" }),
    ).rejects.toBeInstanceOf(WhatsAppProviderError);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/client.test.ts`
Expected: FAIL — `Cannot find module './client'`.

- [ ] **Step 3: Implement `client.ts`**

```ts
/**
 * Self-contained HTTP client for the WAHA REST API. Auth = a single
 * `X-Api-Key` header, server-wide (unlike Evolution Go, WAHA has no
 * per-session token — the same key authorizes every endpoint, admin and
 * messaging alike). Deliberately does NOT reuse ../http.ts's `engineFetch` —
 * WAHA is isolated by design, and this ~40-line helper is simpler than
 * depending on that shared plumbing's exact contract.
 */

import { mapWahaError } from "./errors";

export interface IWahaRequestOptions {
  baseUrl: string;
  path: string;
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  timeoutMs?: number;
  /** Set for binary responses (e.g. the QR PNG). */
  expectBinary?: boolean;
}

export interface IWahaResponse {
  status: number;
  body: unknown;
  bytes?: Uint8Array;
  contentType?: string;
}

export async function wahaRequest(
  apiKey: string,
  fetchFn: typeof fetch,
  options: IWahaRequestOptions,
): Promise<IWahaResponse> {
  const headers: Record<string, string> = { "X-Api-Key": apiKey };
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetchFn(`${options.baseUrl}${options.path}`, {
      method: options.method ?? "POST",
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  let result: IWahaResponse;
  if (options.expectBinary) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    result = { status: response.status, body: null, bytes, contentType: response.headers.get("content-type") ?? undefined };
  } else {
    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    result = { status: response.status, body: parsed };
  }

  if (result.status < 200 || result.status >= 300) {
    throw mapWahaError(result.status, result.body, options.path);
  }
  return result;
}
```

- [ ] **Step 4: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/client.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/providers/whatsapp/waha/client.ts src/providers/whatsapp/waha/client.test.ts
git commit -m "feat: add WAHA HTTP client"
```

---

### Task 7: WAHA engine — session name generator + session lifecycle

**Files:**
- Create: `src/providers/whatsapp/waha/sessionName.ts`
- Create: `src/providers/whatsapp/waha/sessionName.test.ts`
- Create: `src/providers/whatsapp/waha/session.ts`
- Create: `src/providers/whatsapp/waha/session.test.ts`

**Interfaces:**
- Consumes: `wahaRequest` (Task 6).
- Produces: `generateWahaSessionName(label, existingNames)`, `createWahaSession`, `getWahaSessionStatus`, `getWahaSessionQrPng`, `stopWahaSession`, `logoutWahaSession`, `restartWahaSession`, `deleteWahaSession`.

- [ ] **Step 1: Write the failing test for the session-name generator**

```ts
import { describe, expect, it } from "vitest";
import { generateWahaSessionName } from "./sessionName";

describe("generateWahaSessionName", () => {
  it("slugifies the label and appends a short suffix", () => {
    const name = generateWahaSessionName("Loja Centro — Vendas", []);
    expect(name).toMatch(/^loja-centro-vendas-[a-f0-9]{6}$/);
  });

  it("avoids collisions with existing names", () => {
    const first = generateWahaSessionName("Vendas", []);
    const second = generateWahaSessionName("Vendas", [first]);
    expect(second).not.toBe(first);
  });

  it("strips accents and non-alphanumeric characters", () => {
    const name = generateWahaSessionName("Depósito São José!", []);
    expect(name).toMatch(/^deposito-sao-jose-[a-f0-9]{6}$/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/sessionName.test.ts`
Expected: FAIL — `Cannot find module './sessionName'`.

- [ ] **Step 3: Implement `sessionName.ts`**

```ts
/** Pure, deterministic-modulo-randomness WAHA session name generator. */

function slugify(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `<slug(label)>-<6 hex chars>`, retried until it avoids `existingNames`. */
export function generateWahaSessionName(label: string, existingNames: string[]): string {
  const slug = slugify(label) || "waha";
  const taken = new Set(existingNames);
  let candidate = `${slug}-${randomSuffix()}`;
  while (taken.has(candidate)) {
    candidate = `${slug}-${randomSuffix()}`;
  }
  return candidate;
}
```

- [ ] **Step 4: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/sessionName.test.ts`
Expected: PASS — 3 passed.

- [ ] **Step 5: Write the failing test for session lifecycle**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createWahaSession,
  deleteWahaSession,
  getWahaSessionQrPng,
  getWahaSessionStatus,
  logoutWahaSession,
  restartWahaSession,
  stopWahaSession,
} from "./session";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("WAHA session lifecycle", () => {
  it("createWahaSession POSTs /api/sessions with webhook config", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(201, { name: "loja-abc123", status: "STARTING" }));
    await createWahaSession("key", fetchFn, {
      baseUrl: target.baseUrl,
      sessionName: target.sessionName,
      webhookUrl: "https://edge.example.com/waha-webhook",
      hmacKey: "secret",
    });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://waha.example.com/api/sessions");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("loja-abc123");
    expect(body.start).toBe(true);
    expect(body.config.webhooks[0].url).toBe("https://edge.example.com/waha-webhook");
    expect(body.config.webhooks[0].hmac.key).toBe("secret");
    expect(body.config.webhooks[0].events).toContain("message");
  });

  it("getWahaSessionStatus GETs /api/sessions/{name} and returns state + me", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { name: "loja-abc123", status: "WORKING", me: { id: "5511999999999@c.us" } }));
    const status = await getWahaSessionStatus("key", fetchFn, target);
    expect(status.state).toBe("WORKING");
    expect(status.phoneNumber).toBe("+5511999999999");
  });

  it("getWahaSessionStatus tolerates a missing me field", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { name: "loja-abc123", status: "STARTING" }));
    const status = await getWahaSessionStatus("key", fetchFn, target);
    expect(status.state).toBe("STARTING");
    expect(status.phoneNumber).toBeUndefined();
  });

  it("getWahaSessionQrPng GETs the binary QR endpoint and base64-encodes it", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(bytes, { status: 200, headers: { "content-type": "image/png" } }));
    const qr = await getWahaSessionQrPng("key", fetchFn, target);
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/loja-abc123/auth/qr");
    expect(qr.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("stopWahaSession/logoutWahaSession/restartWahaSession/deleteWahaSession hit the right endpoints", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await stopWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sessions/loja-abc123/stop");

    await logoutWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[1][0]).toBe("https://waha.example.com/api/sessions/loja-abc123/logout");

    await restartWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[2][0]).toBe("https://waha.example.com/api/sessions/loja-abc123/restart");

    await deleteWahaSession("key", fetchFn, target);
    expect(fetchFn.mock.calls[3][0]).toBe("https://waha.example.com/api/sessions/loja-abc123");
    expect(fetchFn.mock.calls[3][1].method).toBe("DELETE");
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/session.test.ts`
Expected: FAIL — `Cannot find module './session'`.

- [ ] **Step 7: Implement `session.ts`**

```ts
/**
 * WAHA session lifecycle (QR pairing flow). Consumed server-side by the
 * `waha-connect` Edge Function. Runtime-agnostic: relative imports, Web APIs
 * only.
 */

import { WAHA_DEFAULT_EVENTS, wahaStateToAccountStatus } from "./constants";
import { wahaRequest } from "./client";

export interface IWahaSessionTarget {
  baseUrl: string;
  sessionName: string;
}

export interface IWahaStatusResult {
  state: string;
  phoneNumber?: string;
}

/** WAHA `me.id` is `<digits>@c.us` — convert to E.164. */
function meIdToE164(meId: string | undefined): string | undefined {
  if (!meId) return undefined;
  const digits = meId.split("@")[0]?.replace(/\D/g, "");
  return digits && digits.length > 0 ? `+${digits}` : undefined;
}

export async function createWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  input: { baseUrl: string; sessionName: string; webhookUrl: string; hmacKey: string },
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: input.baseUrl,
    path: "/api/sessions",
    json: {
      name: input.sessionName,
      start: true,
      config: {
        webhooks: [
          {
            url: input.webhookUrl,
            events: [...WAHA_DEFAULT_EVENTS],
            hmac: { key: input.hmacKey },
          },
        ],
      },
    },
  });
}

export async function getWahaSessionStatus(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<IWahaStatusResult> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}`,
    method: "GET",
    timeoutMs: 10_000,
  });
  const body = response.body as { status?: string; me?: { id?: string } } | null;
  return {
    state: body?.status ?? "FAILED",
    phoneNumber: meIdToE164(body?.me?.id),
  };
}

/** Maps the raw status straight to the account status the UI/DB expect. */
export async function getWahaAccountStatus(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<{ accountStatus: "connected" | "disconnected" | "pending"; phoneNumber?: string }> {
  const { state, phoneNumber } = await getWahaSessionStatus(apiKey, fetchFn, target);
  return { accountStatus: wahaStateToAccountStatus(state), phoneNumber };
}

/** `GET /api/{session}/auth/qr` returns the PNG binary — base64-encode as a data URI. */
export async function getWahaSessionQrPng(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<string> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/${target.sessionName}/auth/qr`,
    method: "GET",
    expectBinary: true,
    timeoutMs: 10_000,
  });
  const bytes = response.bytes ?? new Uint8Array();
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return `data:${response.contentType ?? "image/png"};base64,${base64}`;
}

export async function stopWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}/stop`,
  });
}

export async function logoutWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}/logout`,
  });
}

export async function restartWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}/restart`,
  });
}

export async function deleteWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}`,
    method: "DELETE",
  });
}
```

- [ ] **Step 8: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/session.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 9: Commit**

```bash
git add src/providers/whatsapp/waha/sessionName.ts src/providers/whatsapp/waha/sessionName.test.ts src/providers/whatsapp/waha/session.ts src/providers/whatsapp/waha/session.test.ts
git commit -m "feat: add WAHA session name generator and lifecycle calls"
```

---

### Task 8: WAHA engine — webhook payload parser + media download (pure, TDD)

**Files:**
- Create: `src/providers/whatsapp/waha/parser.ts`
- Create: `src/providers/whatsapp/waha/parser.test.ts`
- Create: `src/providers/whatsapp/waha/media.ts`
- Create: `src/providers/whatsapp/waha/media.test.ts`

**Interfaces:**
- Consumes: `IInboundMessage`, `IOutboundEcho`, `InboundContentType` (type-only, from `../types`); `wahaRequest` (Task 6).
- Produces: `parseWahaMessageEvent(payload, accountId)`, `downloadWahaMedia(apiKey, fetchFn, mediaUrl)`.

- [ ] **Step 1: Write the failing test for the parser**

```ts
import { describe, expect, it } from "vitest";
import { parseWahaMessageEvent } from "./parser";

const accountId = "acct-1";

describe("parseWahaMessageEvent", () => {
  it("parses an inbound text message", () => {
    const result = parseWahaMessageEvent(
      {
        id: "true_5511988887777@c.us_ABC123",
        timestamp: 1720000000,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "Olá, tudo bem?",
        hasMedia: false,
      },
      accountId,
    );
    expect(result.type).toBe("message");
    if (result.type !== "message") throw new Error("expected message");
    expect(result.fromPhone).toBe("+5511988887777");
    expect(result.contentType).toBe("text");
    expect(result.text).toBe("Olá, tudo bem?");
    expect(result.providerMessageId).toBe("true_5511988887777@c.us_ABC123");
    expect(result.accountId).toBe(accountId);
  });

  it("parses an inbound image message with media", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id2",
        timestamp: 1720000001,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "",
        hasMedia: true,
        media: { url: "https://waha.example.com/api/files/id2.jpg", mimetype: "image/jpeg", filename: null },
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("image");
    expect(result.mediaId).toBe("https://waha.example.com/api/files/id2.jpg");
  });

  it("parses an inbound document with filename", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id3",
        timestamp: 1720000002,
        from: "5511988887777@c.us",
        fromMe: false,
        to: "5511999998888@c.us",
        body: "",
        hasMedia: true,
        media: { url: "https://waha.example.com/api/files/id3.pdf", mimetype: "application/pdf", filename: "nota.pdf" },
      },
      accountId,
    );
    if (result.type !== "message") throw new Error("expected message");
    expect(result.contentType).toBe("document");
    expect(result.mediaFilename).toBe("nota.pdf");
  });

  it("parses fromMe=true as an outbound echo", () => {
    const result = parseWahaMessageEvent(
      {
        id: "id4",
        timestamp: 1720000003,
        from: "5511999998888@c.us",
        fromMe: true,
        to: "5511988887777@c.us",
        body: "Retorno já já",
        hasMedia: false,
      },
      accountId,
    );
    expect(result.type).toBe("outbound-echo");
    if (result.type !== "outbound-echo") throw new Error("expected outbound-echo");
    expect(result.toPhone).toBe("+5511988887777");
    expect(result.text).toBe("Retorno já já");
  });

  it("throws on a group chat (@g.us)", () => {
    expect(() =>
      parseWahaMessageEvent(
        {
          id: "id5",
          timestamp: 1720000004,
          from: "120363000000000000@g.us",
          fromMe: false,
          to: "5511999998888@c.us",
          body: "oi grupo",
          hasMedia: false,
        },
        accountId,
      ),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/parser.test.ts`
Expected: FAIL — `Cannot find module './parser'`.

- [ ] **Step 3: Implement `parser.ts`**

```ts
/**
 * WAHA webhook `message` event parser. Payload shape (WAHA docs, "Receive
 * messages"/"Events"):
 *   { id, timestamp, from, fromMe, to, body, hasMedia, media?: {url, mimetype, filename, error}, ack }
 * `from`/`to` are `<digits>@c.us` for 1:1 chats; groups (`@g.us`), broadcasts
 * and newsletters are rejected (no 1:1 customer to attach the message to).
 * `session.status` events are handled directly by the Edge Function, not by
 * this parser (they update `whatsapp_accounts.status`, not a message row).
 */

import type { IInboundMessage, InboundContentType, IOutboundEcho } from "../types";

const NON_INDIVIDUAL_JID = /@(g\.us|broadcast|newsletter)$/;

function jidToE164(jid: string | undefined): string {
  const digits = (jid ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? `+${digits}` : "";
}

interface IWahaMedia {
  url?: string;
  mimetype?: string;
  filename?: string | null;
  error?: string | null;
}

export interface IWahaMessagePayload {
  id?: string;
  timestamp?: number;
  from?: string;
  fromMe?: boolean;
  to?: string;
  body?: string;
  hasMedia?: boolean;
  media?: IWahaMedia | null;
}

function tsToIso(value: number | undefined): string {
  return typeof value === "number" && value > 0 ? new Date(value * 1000).toISOString() : new Date().toISOString();
}

function contentTypeFromMimetype(mimetype: string | undefined): InboundContentType {
  if (!mimetype) return "unknown";
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  return "document";
}

interface IParsedContent {
  contentType: InboundContentType;
  text?: string;
  mediaId?: string;
  mediaFilename?: string;
}

function extractContent(payload: IWahaMessagePayload): IParsedContent {
  if (payload.hasMedia && payload.media?.url) {
    return {
      contentType: contentTypeFromMimetype(payload.media.mimetype),
      text: payload.body || undefined,
      mediaId: payload.media.url,
      mediaFilename: payload.media.filename ?? undefined,
    };
  }
  return { contentType: "text", text: payload.body ?? "" };
}

export function parseWahaMessageEvent(
  rawPayload: unknown,
  accountId: string,
): IInboundMessage | IOutboundEcho {
  const payload = rawPayload as IWahaMessagePayload | null;
  if (!payload?.id) {
    throw new Error("WahaProvider: payload de mensagem irreconhecível (sem 'id')");
  }
  const chat = payload.fromMe ? payload.to : payload.from;
  if (NON_INDIVIDUAL_JID.test(chat ?? "")) {
    throw new Error("WahaProvider: mensagem de grupo/broadcast/newsletter — ignorar");
  }

  const content = extractContent(payload);
  const timestamp = tsToIso(payload.timestamp);

  if (payload.fromMe) {
    return {
      type: "outbound-echo",
      providerMessageId: payload.id,
      toPhone: jidToE164(payload.to),
      contentType: content.contentType,
      text: content.text,
      mediaId: content.mediaId,
      mediaFilename: content.mediaFilename,
      timestamp,
      rawPayload,
    };
  }

  return {
    type: "message",
    providerMessageId: payload.id,
    fromPhone: jidToE164(payload.from),
    // WAHA resolves the account by sessionName (webhook envelope), not by phone.
    toAccountPhone: "",
    accountId,
    contentType: content.contentType,
    text: content.text,
    mediaId: content.mediaId,
    mediaFilename: content.mediaFilename,
    timestamp,
    rawPayload,
  };
}
```

- [ ] **Step 4: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/parser.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Write the failing test for media download**

```ts
import { describe, expect, it, vi } from "vitest";
import { downloadWahaMedia } from "./media";

describe("downloadWahaMedia", () => {
  it("GETs the media URL with X-Api-Key and returns bytes + mimetype", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(bytes, { status: 200, headers: { "content-type": "image/jpeg" } }));
    const result = await downloadWahaMedia("api-key", fetchFn, "https://waha.example.com/api/files/x.jpg");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://waha.example.com/api/files/x.jpg",
      expect.objectContaining({ headers: { "X-Api-Key": "api-key" } }),
    );
    expect(result.data).toEqual(bytes);
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.sizeBytes).toBe(4);
  });

  it("throws on a non-2xx response", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    await expect(
      downloadWahaMedia("api-key", fetchFn, "https://waha.example.com/api/files/missing.jpg"),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/media.test.ts`
Expected: FAIL — `Cannot find module './media'`.

- [ ] **Step 7: Implement `media.ts`**

```ts
/**
 * Downloads inbound media from a WAHA `payload.media.url` — same X-Api-Key
 * auth as every other WAHA endpoint (docs: "Receiving files").
 */

import { WhatsAppProviderError } from "../errors";

export interface IWahaMediaDownload {
  data: Uint8Array;
  mimeType: string;
  sizeBytes: number;
}

export async function downloadWahaMedia(
  apiKey: string,
  fetchFn: typeof fetch,
  mediaUrl: string,
): Promise<IWahaMediaDownload> {
  const response = await fetchFn(mediaUrl, { headers: { "X-Api-Key": apiKey } });
  if (!response.ok) {
    throw new WhatsAppProviderError(
      "INTEGRATION_ERROR",
      502,
      `Falha ao baixar mídia do WAHA (HTTP ${response.status})`,
      { mediaUrl },
    );
  }
  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  return {
    data,
    mimeType: response.headers.get("content-type") ?? "application/octet-stream",
    sizeBytes: data.byteLength,
  };
}
```

- [ ] **Step 8: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/media.test.ts`
Expected: PASS — 2 passed.

- [ ] **Step 9: Commit**

```bash
git add src/providers/whatsapp/waha/parser.ts src/providers/whatsapp/waha/parser.test.ts src/providers/whatsapp/waha/media.ts src/providers/whatsapp/waha/media.test.ts
git commit -m "feat: add WAHA webhook parser and media download"
```

---

### Task 9: WAHA engine — outbound send

**Files:**
- Create: `src/providers/whatsapp/waha/send.ts`
- Create: `src/providers/whatsapp/waha/send.test.ts`

**Interfaces:**
- Consumes: `wahaRequest` (Task 6).
- Produces: `sendWahaText`, `sendWahaMedia`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";
import { sendWahaMedia, sendWahaText } from "./send";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const target = { baseUrl: "https://waha.example.com", sessionName: "loja-abc123" };

describe("sendWahaText", () => {
  it("POSTs /api/sendText with session, chatId, text", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_123@c.us_ABC" }));
    const result = await sendWahaText("key", fetchFn, target, { toPhone: "+5511988887777", text: "Olá!" });
    expect(result.providerMessageId).toBe("true_123@c.us_ABC");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://waha.example.com/api/sendText");
    const body = JSON.parse(init.body);
    expect(body).toEqual({ session: "loja-abc123", chatId: "5511988887777@c.us", text: "Olá!" });
  });

  it("throws when the response has no id", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    await expect(
      sendWahaText("key", fetchFn, target, { toPhone: "+5511988887777", text: "oi" }),
    ).rejects.toThrow();
  });
});

describe("sendWahaMedia", () => {
  it("POSTs /api/sendImage for image mediaType", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_456@c.us_DEF" }));
    const result = await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "image",
      mediaUrl: "https://storage.example.com/signed.jpg",
      caption: "Peça em anexo",
      filename: "peca.jpg",
    });
    expect(result.providerMessageId).toBe("true_456@c.us_DEF");
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendImage");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.file).toEqual({
      mimetype: undefined,
      url: "https://storage.example.com/signed.jpg",
      filename: "peca.jpg",
    });
    expect(body.caption).toBe("Peça em anexo");
  });

  it("POSTs /api/sendFile for document mediaType", async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(200, { id: "true_789@c.us_GHI" }));
    await sendWahaMedia("key", fetchFn, target, {
      toPhone: "+5511988887777",
      mediaType: "document",
      mediaUrl: "https://storage.example.com/orcamento.pdf",
      filename: "orcamento.pdf",
    });
    expect(fetchFn.mock.calls[0][0]).toBe("https://waha.example.com/api/sendFile");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun run test src/providers/whatsapp/waha/send.test.ts`
Expected: FAIL — `Cannot find module './send'`.

- [ ] **Step 3: Implement `send.ts`**

```ts
/** WAHA outbound send — text (`/api/sendText`) and media (`/api/sendImage`/`/api/sendFile`). */

import { WhatsAppProviderError } from "../errors";
import { wahaRequest } from "./client";
import type { IWahaSessionTarget } from "./session";

export interface IWahaSendResult {
  providerMessageId: string;
}

function toChatId(phone: string): string {
  return `${phone.replace(/\D/g, "")}@c.us`;
}

function extractMessageId(body: unknown): string {
  const b = body as { id?: string } | null;
  if (!b?.id) {
    throw new WhatsAppProviderError("INTEGRATION_ERROR", 502, "Resposta do WAHA sem id de mensagem");
  }
  return b.id;
}

export async function sendWahaText(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  input: { toPhone: string; text: string },
): Promise<IWahaSendResult> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: "/api/sendText",
    json: { session: target.sessionName, chatId: toChatId(input.toPhone), text: input.text },
  });
  return { providerMessageId: extractMessageId(response.body) };
}

export interface IWahaSendMediaInput {
  toPhone: string;
  mediaType: "image" | "audio" | "video" | "document";
  /** Publicly fetchable URL (e.g. a short-lived signed URL from whatsapp-media). */
  mediaUrl: string;
  mimetype?: string;
  caption?: string;
  filename?: string;
}

export async function sendWahaMedia(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  input: IWahaSendMediaInput,
): Promise<IWahaSendResult> {
  const endpoint = input.mediaType === "image" ? "/api/sendImage" : "/api/sendFile";
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: endpoint,
    json: {
      session: target.sessionName,
      chatId: toChatId(input.toPhone),
      file: { mimetype: input.mimetype, url: input.mediaUrl, filename: input.filename },
      ...(input.caption ? { caption: input.caption } : {}),
    },
  });
  return { providerMessageId: extractMessageId(response.body) };
}
```

- [ ] **Step 4: Run tests again**

Run: `bun run test src/providers/whatsapp/waha/send.test.ts`
Expected: PASS — 4 passed.

- [ ] **Step 5: Run the full test suite, sync the shared mirror, commit**

Run: `bun run test`
Expected: all tests pass (baseline 213 files + new WAHA tests).

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected output: `synced N files → supabase/functions/_shared/whatsapp/` where N now includes every file under `waha/` (verify with `ls supabase/functions/_shared/whatsapp/waha/` — should list the same files as `src/providers/whatsapp/waha/`, minus `*.test.ts`).

```bash
git add src/providers/whatsapp/waha/send.ts src/providers/whatsapp/waha/send.test.ts supabase/functions/_shared/whatsapp/waha
git commit -m "feat: add WAHA outbound send; sync shared mirror"
```

---

### Task 10: Edge Function — `waha-connect` (session lifecycle, owner-only)

**Files:**
- Create: `supabase/functions/waha-connect/wahaServer.ts`
- Create: `supabase/functions/waha-connect/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `_shared/auth.ts::requireCaller`, `_shared/http.ts::{HttpError,json,parseJsonBody}`, `_shared/serve.ts::servePost`, `_shared/secrets.ts::createSecretResolver`, `_shared/audit.ts::bestEffortAudit` (generic platform infra, not WhatsApp-specific), `_shared/whatsapp/waha/*` (the mirrored engine from Tasks 5–9), `_shared/whatsapp/errors.ts::WhatsAppProviderError` (type/class only).
- Produces: HTTP endpoint `POST /functions/v1/waha-connect` with `{ accountId?, action, ... }` for `state`/`qr`/`logout`/`restart`/`delete`, and `{ storeId, label, purpose?, wahaServerId? }` for `action: "create"`.

- [ ] **Step 1: Write the `resolveWahaServer` helper**

`supabase/functions/waha-connect/wahaServer.ts`:
```ts
import { HttpError } from "../_shared/http.ts";

interface AccountLike {
  id: string;
  waha_server_id: string | null;
}

// deno-lint-ignore no-explicit-any
type Admin = { from: (t: string) => any };
type ResolveSecret = (name: string) => Promise<string | null>;

export interface IResolvedWahaServer {
  baseUrl: string;
  apiKey: string;
  hmacKey: string;
}

/**
 * Resolves a WAHA account's server endpoint + secrets. base_url/api_key_ref/
 * webhook_hmac_ref live on `waha_servers` (registry), NOT on the account.
 * Service_role bypasses RLS. Requires the webhook HMAC secret to be
 * configured (fail-closed webhooks for every session created going forward).
 */
export async function resolveWahaServer(
  admin: Admin,
  resolveSecret: ResolveSecret,
  account: AccountLike,
): Promise<IResolvedWahaServer> {
  if (!account.waha_server_id) {
    throw new HttpError(422, "Conta WAHA sem servidor configurado (waha_server_id ausente).");
  }
  const { data: server, error } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref, webhook_hmac_ref")
    .eq("id", account.waha_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor WAHA não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor WAHA sem endpoint.");
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida.");
  if (!server.webhook_hmac_ref) {
    throw new HttpError(422, "Segredo HMAC do webhook WAHA não configurado — defina-o em Configurações → Chaves antes de criar uma sessão.");
  }
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
  if (!hmacKey) throw new HttpError(422, "Segredo HMAC do webhook WAHA não definido no Vault.");
  return { baseUrl, apiKey, hmacKey };
}

/** Resolves just the server row (no secrets) — used when picking the default server on create. */
export async function findSoleWahaServer(admin: Admin): Promise<{ id: string } | null> {
  const { data } = await admin.from("waha_servers").select("id").limit(2);
  const rows = data ?? [];
  return rows.length === 1 ? { id: rows[0].id as string } : null;
}
```

- [ ] **Step 2: Write `index.ts`**

```ts
/**
 * waha-connect — WAHA session management (QR pairing flow). Owner-only POST.
 *
 * FULLY ISOLATED from the shared Meta/Evolution/Evolution Go pipeline: does
 * NOT import `_shared/whatsapp/build.ts`, `_shared/whatsapp/webhook/core.ts`
 * or `_shared/whatsapp/send/core.ts`. Only generic platform primitives
 * (_shared/auth.ts, _shared/http.ts, _shared/serve.ts, _shared/secrets.ts,
 * _shared/audit.ts) and the self-contained `_shared/whatsapp/waha/*` engine
 * (mirrored from src/providers/whatsapp/waha/) are used.
 *
 * Input (JSON body):
 *   { storeId, label, purpose?, wahaServerId?, action: 'create' }
 *   { accountId, action: 'qr'|'state'|'logout'|'restart'|'delete' }
 *
 * Spec: docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md
 */

import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { generateWahaSessionName } from "../_shared/whatsapp/waha/sessionName.ts";
import {
  createWahaSession,
  deleteWahaSession,
  getWahaAccountStatus,
  getWahaSessionQrPng,
  logoutWahaSession,
  restartWahaSession,
} from "../_shared/whatsapp/waha/session.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";
import { findSoleWahaServer, resolveWahaServer } from "./wahaServer.ts";

const ACTIONS = ["create", "qr", "state", "logout", "restart", "delete"] as const;
type ConnectAction = (typeof ACTIONS)[number];

const DEFAULT_CAPABILITIES = {
  supportsTemplatesHsm: false,
  supportsInteractiveButtons: false,
  supportsLists: false,
  supportsReactions: false,
  supportsProactiveMessaging: true,
  supportsReadStatusInGroups: false,
};

interface IAccountRow {
  id: string;
  store_id: string;
  label: string;
  status: string;
  phone_number: string | null;
  provider_config: Record<string, unknown> | null;
  waha_server_id: string | null;
}

async function resolveActorSellerId(admin: ReturnType<typeof requireCaller> extends Promise<infer T> ? T extends { admin: infer A } ? A : never : never, callerId: string) {
  const { data } = await admin
    .from("profiles")
    .select("seller_id")
    .eq("auth_user_id", callerId)
    .maybeSingle();
  return (data?.seller_id as string | null) ?? null;
}

servePost(async (req, ctx) => {
  const { callerId, admin, profile: caller } = await requireCaller(req, ["owner"]);
  const body = (await parseJsonBody(req)) as {
    accountId?: string;
    storeId?: string;
    label?: string;
    purpose?: string;
    wahaServerId?: string;
    action?: string;
  };

  const action = body.action as ConnectAction;
  if (!action || !ACTIONS.includes(action)) {
    throw new HttpError(422, "action (create|qr|state|logout|restart|delete) é obrigatório");
  }

  const fetchFn = globalThis.fetch;
  const resolveSecret = createSecretResolver(admin);
  const actorId = await resolveActorSellerId(admin, callerId);

  if (action === "create") {
    if (!body.storeId || !body.label) {
      throw new HttpError(422, "storeId e label são obrigatórios");
    }
    let serverId = body.wahaServerId;
    if (!serverId) {
      const sole = await findSoleWahaServer(admin);
      if (!sole) {
        throw new HttpError(422, "Cadastre (ou escolha) um servidor WAHA em Configurações → Chaves antes de criar uma sessão.");
      }
      serverId = sole.id;
    }
    const { data: existingRows } = await admin
      .from("whatsapp_accounts")
      .select("provider_config")
      .eq("provider", "waha");
    const existingNames = (existingRows ?? [])
      .map((r) => (r.provider_config as Record<string, unknown> | null)?.sessionName as string | undefined)
      .filter((n): n is string => Boolean(n));
    const sessionName = generateWahaSessionName(body.label, existingNames);

    const { data: server, error: serverErr } = await admin
      .from("waha_servers")
      .select("base_url, api_key_ref, webhook_hmac_ref")
      .eq("id", serverId)
      .maybeSingle();
    if (serverErr || !server) throw new HttpError(422, "Servidor WAHA não encontrado.");
    const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
    const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
    if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida.");
    if (!server.webhook_hmac_ref) {
      throw new HttpError(422, "Configure o segredo HMAC do webhook deste servidor antes de criar uma sessão.");
    }
    const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
    if (!hmacKey) throw new HttpError(422, "Segredo HMAC do webhook WAHA não definido no Vault.");

    const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/waha-webhook`;
    try {
      await createWahaSession(apiKey, fetchFn, { baseUrl, sessionName, webhookUrl, hmacKey });
    } catch (err) {
      if (err instanceof WhatsAppProviderError) {
        return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
      }
      throw err;
    }

    const { data: inserted, error: insertErr } = await admin
      .from("whatsapp_accounts")
      .insert({
        id: crypto.randomUUID(),
        store_id: body.storeId,
        label: body.label,
        phone_number: "",
        provider: "waha",
        credentials_ref: String(server.api_key_ref ?? ""),
        status: "pending",
        capabilities: DEFAULT_CAPABILITIES,
        provider_config: { sessionName },
        purpose: body.purpose ?? "atendimento",
        current_state: "healthy",
        failover_policy: "disabled",
        is_failover_active: false,
        alerts_muted: false,
        waha_server_id: serverId,
      })
      .select("id")
      .single();
    if (insertErr) throw new HttpError(500, `Falha ao salvar a sessão WAHA: ${insertErr.message}`);

    if (actorId) {
      await bestEffortAudit(admin, {
        store_id: body.storeId,
        actor_id: actorId,
        action: "whatsapp_instance_created",
        resource: "whatsapp_account",
        resource_id: inserted.id as string,
        after: { provider: "waha", sessionName },
      });
    }
    return json({ id: inserted.id, sessionName, traceId: ctx.traceId }, 200);
  }

  if (!body.accountId) throw new HttpError(422, "accountId é obrigatório");
  const { data: row } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, label, status, phone_number, provider_config, waha_server_id")
    .eq("id", body.accountId)
    .eq("provider", "waha")
    .maybeSingle();
  if (!row) throw new HttpError(404, "Sessão WAHA não encontrada");
  const account = row as IAccountRow;
  const sessionName = String(account.provider_config?.sessionName ?? "");
  if (!sessionName) throw new HttpError(422, "Sessão WAHA sem sessionName configurado");

  try {
    const { baseUrl, apiKey } = await resolveWahaServer(admin, resolveSecret, account);
    const target = { baseUrl, sessionName };

    switch (action) {
      case "qr": {
        const qrBase64 = await getWahaSessionQrPng(apiKey, fetchFn, target);
        return json({ state: "qr", qrBase64, traceId: ctx.traceId }, 200);
      }
      case "state": {
        const { accountStatus, phoneNumber } = await getWahaAccountStatus(apiKey, fetchFn, target);
        const patch: Record<string, unknown> = { status: accountStatus };
        if (phoneNumber && !account.phone_number) patch.phone_number = phoneNumber;
        const wasConnected = account.status === "connected";
        await admin.from("whatsapp_accounts").update(patch).eq("id", account.id);
        if (accountStatus === "connected" && !wasConnected && actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_connected",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { provider: "waha" },
          });
        }
        return json({ state: accountStatus, phoneNumber, traceId: ctx.traceId }, 200);
      }
      case "logout": {
        await logoutWahaSession(apiKey, fetchFn, target);
        await admin.from("whatsapp_accounts").update({ status: "disconnected" }).eq("id", account.id);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_disconnected",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { provider: "waha" },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
      case "restart": {
        await restartWahaSession(apiKey, fetchFn, target);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_restarted",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: {},
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
      case "delete": {
        const { data: deleted, error: rpcError } = await admin.rpc("delete_whatsapp_account", {
          p_account_id: account.id,
        });
        if (rpcError) {
          if ((rpcError.message ?? "").includes("WHATSAPP_ACCOUNT_HAS_LINKED_DATA")) {
            return json(
              { error: "Esta sessão tem conversas vinculadas e não pode ser excluída.", code: "HAS_LINKED_DATA", traceId: ctx.traceId },
              422,
            );
          }
          throw new HttpError(500, `Falha ao excluir a sessão: ${rpcError.message}`);
        }
        try {
          await deleteWahaSession(apiKey, fetchFn, target);
        } catch (err) {
          ctx.log.warn("waha session teardown failed (row already deleted; session may be orphaned)", {
            sessionName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (deleted === true && actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_account_deleted",
            resource: "whatsapp_account",
            resource_id: account.id,
            before: { label: account.label, provider: "waha", sessionName },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
      default:
        throw new HttpError(422, "ação inválida");
    }
  } catch (err) {
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("waha-connect action rejected", { action, code: err.code, message: err.message });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
});
```

- [ ] **Step 3: Register the function in `supabase/config.toml`**

Find the `[functions.whatsapp-connect]` block and add an analogous block right after it:
```toml
[functions.waha-connect]
verify_jwt = true
```

(WAHA's admin actions require a valid user JWT — `requireCaller` does the owner-role gate on top; this mirrors `whatsapp-connect`'s own `verify_jwt` setting, verify the exact value there and match it.)

- [ ] **Step 4: Typecheck the function (Deno-side, best effort via tsc skip)**

Edge Functions are Deno — `bunx tsc --noEmit` does not type-check them. Verify manually: re-read `index.ts` and confirm every import path resolves to a real file (`../_shared/audit.ts`, `../_shared/auth.ts`, `../_shared/env.ts`, `../_shared/http.ts`, `../_shared/secrets.ts`, `../_shared/serve.ts`, `../_shared/whatsapp/waha/{sessionName,session,errors}.ts`, `./wahaServer.ts`).

Run: `ls supabase/functions/_shared/whatsapp/waha/` — confirm `sessionName.ts`, `session.ts`, `errors.ts`, `client.ts`, `hmac.ts`, `parser.ts`, `media.ts`, `send.ts`, `constants.ts` are all present (from Task 9's sync).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/waha-connect supabase/config.toml
git commit -m "feat: add waha-connect Edge Function"
```

---

### Task 11: Edge Function — `waha-webhook` (public, inbound)

**Files:**
- Create: `supabase/functions/waha-webhook/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `_shared/http.ts::{json}`, `_shared/secrets.ts::createSecretResolver`, `_shared/whatsapp/waha/{hmac,parser,media}.ts`.
- Produces: public HTTP endpoint `POST /functions/v1/waha-webhook`.

- [ ] **Step 1: Write `index.ts`**

```ts
/**
 * waha-webhook — public inbound endpoint for WAHA session events.
 *
 * FULLY ISOLATED: does not import `_shared/whatsapp/webhook/core.ts`. Only
 * generic platform primitives (_shared/http.ts, _shared/secrets.ts) and the
 * self-contained `_shared/whatsapp/waha/*` engine are used. Fail-closed on a
 * bad/missing HMAC signature — no processing happens before it's verified.
 *
 * Handles two event kinds:
 *   - "message": persisted into conversations/messages (same tables the rest
 *     of the Inbox reads — this is what puts WAHA sessions in the same
 *     Atendimento screen).
 *   - "session.status": updates whatsapp_accounts.status.
 * Any other event is acknowledged (200) and ignored.
 *
 * Spec: docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { json } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { downloadWahaMedia } from "../_shared/whatsapp/waha/media.ts";
import { parseWahaMessageEvent } from "../_shared/whatsapp/waha/parser.ts";
import { verifyWahaHmac } from "../_shared/whatsapp/waha/hmac.ts";
import { wahaStateToAccountStatus } from "../_shared/whatsapp/waha/constants.ts";

interface IWahaEnvelope {
  id?: string;
  event?: string;
  session?: string;
  payload?: unknown;
}

function extForMimetype(mimetype: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/ogg": "ogg",
    "audio/mpeg": "mp3",
    "video/mp4": "mp4",
    "application/pdf": "pdf",
  };
  return map[mimetype] ?? "bin";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const resolveSecret = createSecretResolver(admin);

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

  const { data: accountRow } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider_config, waha_server_id, phone_number")
    .eq("provider", "waha")
    .eq("provider_config->>sessionName", envelope.session)
    .maybeSingle();
  if (!accountRow) {
    console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: unknown session", session: envelope.session }));
    return json({ error: "unknown session" }, 401);
  }

  const { data: server } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref, webhook_hmac_ref")
    .eq("id", accountRow.waha_server_id as string)
    .maybeSingle();
  if (!server?.webhook_hmac_ref) {
    console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: server missing hmac ref", session: envelope.session }));
    return json({ error: "server not configured" }, 401);
  }
  const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
  if (!hmacKey) return json({ error: "server not configured" }, 401);

  const signature = req.headers.get("X-Webhook-Hmac");
  const valid = await verifyWahaHmac(rawBody, hmacKey, signature);
  if (!valid) {
    console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: invalid HMAC", session: envelope.session }));
    return json({ error: "invalid signature" }, 401);
  }

  const eventKey = `whatsapp:waha:${accountRow.id}:${envelope.id ?? crypto.randomUUID()}`;
  const { error: dedupeError } = await admin
    .from("processed_events")
    .insert({ event_key: eventKey, trace_id: null });
  if (dedupeError) {
    // 23505 = already processed (duplicate delivery) — ack without reprocessing.
    if (dedupeError.code === "23505") return json({ ok: true, duplicate: true }, 200);
    console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: dedupe insert failed", error: dedupeError.message }));
  }

  if (envelope.event === "session.status") {
    const payload = envelope.payload as { status?: string } | null;
    const accountStatus = wahaStateToAccountStatus(String(payload?.status ?? ""));
    await admin.from("whatsapp_accounts").update({ status: accountStatus }).eq("id", accountRow.id);
    return json({ ok: true }, 200);
  }

  if (envelope.event !== "message") {
    return json({ ok: true, ignored: envelope.event }, 200);
  }

  let parsed;
  try {
    parsed = parseWahaMessageEvent(envelope.payload, accountRow.id as string);
  } catch (err) {
    console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: unparseable message", error: err instanceof Error ? err.message : String(err) }));
    return json({ ok: true, ignored: "unparseable" }, 200);
  }

  const fromPhone = parsed.type === "message" ? parsed.fromPhone : "";
  if (parsed.type === "outbound-echo") {
    // Phase 1: echoes from the phone/companion app are acknowledged but not
    // mirrored — mirroring is deferred (matches the design doc's phase-2 list).
    return json({ ok: true, ignored: "outbound-echo" }, 200);
  }
  if (!fromPhone) return json({ ok: true, ignored: "no-phone" }, 200);

  const { data: existingCustomer } = await admin
    .from("customers")
    .select("id")
    .eq("store_id", accountRow.store_id as string)
    .eq("phone", fromPhone)
    .maybeSingle();
  let customerId = existingCustomer?.id as string | undefined;
  if (!customerId) {
    const { data: createdCustomer, error: customerErr } = await admin
      .from("customers")
      .insert({ store_id: accountRow.store_id, name: fromPhone, phone: fromPhone, type: "B2C" })
      .select("id")
      .single();
    if (customerErr) {
      console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: customer insert failed", error: customerErr.message }));
      return json({ ok: true, ignored: "customer-insert-failed" }, 200);
    }
    customerId = createdCustomer.id as string;
  }

  const { data: existingConversation } = await admin
    .from("conversations")
    .select("id, unread_count")
    .eq("whatsapp_account_id", accountRow.id as string)
    .eq("customer_id", customerId)
    .maybeSingle();

  let conversationId = existingConversation?.id as string | undefined;
  if (!conversationId) {
    const { data: createdConversation, error: convErr } = await admin
      .from("conversations")
      .insert({
        store_id: accountRow.store_id,
        customer_id: customerId,
        whatsapp_account_id: accountRow.id,
        assigned_seller_id: null,
        channel: "whatsapp",
        status: "novo",
        last_message_at: parsed.timestamp,
        unread_count: 0,
      })
      .select("id")
      .single();
    if (convErr) {
      console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: conversation insert failed", error: convErr.message }));
      return json({ ok: true, ignored: "conversation-insert-failed" }, 200);
    }
    conversationId = createdConversation.id as string;
  } else {
    await admin
      .from("conversations")
      .update({ last_message_at: parsed.timestamp, unread_count: (existingConversation?.unread_count ?? 0) + 1 })
      .eq("id", conversationId);
  }

  const messageId = crypto.randomUUID();
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaDownloadStatus: string | null = null;

  if (parsed.mediaId) {
    try {
      const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
      if (!apiKey) throw new Error("missing server api key");
      const media = await downloadWahaMedia(apiKey, globalThis.fetch, parsed.mediaId);
      const ext = extForMimetype(media.mimeType);
      const path = `conversations/${conversationId}/${messageId}/media.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("whatsapp-media")
        .upload(path, media.data, { contentType: media.mimeType, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      mediaType = parsed.contentType;
      mediaUrl = path;
      mediaDownloadStatus = "ok";
    } catch (err) {
      console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: media download failed", error: err instanceof Error ? err.message : String(err) }));
      mediaDownloadStatus = "failed";
    }
  }

  const { error: messageErr } = await admin.from("messages").insert({
    id: messageId,
    conversation_id: conversationId,
    direction: "in",
    author_type: "customer",
    author_id: customerId,
    provider: "waha",
    text: parsed.text ?? "",
    media_type: mediaType,
    media_url: mediaUrl,
    media_filename: parsed.mediaFilename ?? null,
    media_download_status: mediaDownloadStatus,
    status: "delivered",
    sent_at: parsed.timestamp,
    provider_message_id: parsed.providerMessageId,
    webhook_event_ids: [eventKey],
  });
  if (messageErr) {
    console.warn(JSON.stringify({ level: "warn", msg: "waha webhook: message insert failed", error: messageErr.message }));
  }

  await admin.from("integration_logs").insert({
    integration_name: "whatsapp_waha",
    direction: "inbound",
    endpoint: "/waha-webhook",
    http_status: 200,
    trace_id: null,
    request_payload: { event: envelope.event, session: envelope.session },
  });

  return json({ ok: true }, 200);
});
```

- [ ] **Step 2: Register the function as public in `supabase/config.toml`**

```toml
[functions.waha-webhook]
verify_jwt = false
```

(Matches `whatsapp-webhook`'s own setting — public endpoint, auth is the HMAC check inside the function, fail-closed.)

- [ ] **Step 3: Verify imports resolve**

Run: `ls supabase/functions/_shared/whatsapp/waha/` — confirm `hmac.ts`, `parser.ts`, `media.ts`, `constants.ts` present (from the Task 9 sync).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/waha-webhook supabase/config.toml
git commit -m "feat: add waha-webhook Edge Function"
```

---

### Task 12: Edge Function — `waha-send` (outbound dispatch)

**Files:**
- Create: `supabase/functions/waha-send/index.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `_shared/env.ts::requiredEnv`, `_shared/http.ts::{HttpError,json,parseJsonBody}`, `_shared/serve.ts::servePost`, `_shared/secrets.ts::createSecretResolver`, `_shared/audit.ts::bestEffortAudit`, `_shared/whatsapp/waha/{session,send}.ts`; **consumes** (calls, never edits) the RPC `public.can_access_conversation(conv uuid)`.
- Produces: authenticated HTTP endpoint `POST /functions/v1/waha-send`.

- [ ] **Step 1: Write `index.ts`**

```ts
/**
 * waha-send — outbound dispatch for WAHA sessions.
 *
 * FULLY ISOLATED: does not import `_shared/whatsapp/send/core.ts`. Permission
 * is enforced by CALLING (never editing) the canonical `can_access_conversation`
 * RPC with the CALLER's own JWT (so `auth.uid()` resolves correctly inside the
 * SECURITY DEFINER function) — this reuses the frozen "2 portões" gate instead
 * of re-deriving a parallel copy of its logic.
 *
 * Input (JSON body):
 *   { conversationId, kind: 'text'|'media', text?, mediaUrl?, mediaType?, filename? }
 *
 * v1 simplification vs the shared pipeline: no 24h-window check (Meta-only
 * rule), no auto conversation-status transition on send — just persists the
 * message and touches last_message_at. Both are documented deferrals in the
 * design spec.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { sendWahaMedia, sendWahaText } from "../_shared/whatsapp/waha/send.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";

interface ISendBody {
  conversationId?: string;
  kind?: "text" | "media";
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  filename?: string;
}

async function resolveSender(req: Request): Promise<{
  sellerId: string | null;
  storeId: string;
  authHeader: string;
  admin: SupabaseClient;
}> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "missing authorization");

  const callerClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, "invalid session");

  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("store_id, seller_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!profile) throw new HttpError(403, "forbidden: no profile");

  return {
    sellerId: (profile.seller_id as string | null) ?? null,
    storeId: profile.store_id as string,
    authHeader,
    admin,
  };
}

/** Calls the frozen RPC with the CALLER's own JWT so auth.uid() resolves correctly. */
async function callerCanAccessConversation(authHeader: string, conversationId: string): Promise<boolean> {
  const callerClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await callerClient.rpc("can_access_conversation", { conv: conversationId });
  if (error) return false;
  return data === true;
}

servePost(async (req, ctx) => {
  const { sellerId, storeId, authHeader, admin } = await resolveSender(req);
  const body = (await parseJsonBody(req)) as ISendBody;
  if (!body.conversationId || !body.kind) {
    throw new HttpError(422, "conversationId e kind (text|media) são obrigatórios");
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, store_id, whatsapp_account_id, status")
    .eq("id", body.conversationId)
    .maybeSingle();
  if (!conversation || conversation.store_id !== storeId) {
    throw new HttpError(404, "Conversa não encontrada");
  }
  if (!conversation.whatsapp_account_id) {
    throw new HttpError(422, "Conversa sem conta WhatsApp associada");
  }

  const allowed = await callerCanAccessConversation(authHeader, body.conversationId);
  if (!allowed) throw new HttpError(403, "Sem permissão para enviar nesta conversa");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, provider, provider_config, waha_server_id, credentials_ref")
    .eq("id", conversation.whatsapp_account_id as string)
    .maybeSingle();
  if (!account || account.provider !== "waha") {
    throw new HttpError(422, "Conta associada não é uma sessão WAHA");
  }
  const sessionName = String((account.provider_config as Record<string, unknown> | null)?.sessionName ?? "");
  if (!sessionName) throw new HttpError(422, "Sessão WAHA sem sessionName configurado");

  const { data: server } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id as string)
    .maybeSingle();
  if (!server) throw new HttpError(422, "Servidor WAHA não encontrado");
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida");

  const { data: customer } = await admin
    .from("conversations")
    .select("customers(phone)")
    .eq("id", body.conversationId)
    .maybeSingle();
  const toPhone = (customer as unknown as { customers?: { phone?: string } } | null)?.customers?.phone;
  if (!toPhone) throw new HttpError(422, "Cliente sem telefone cadastrado");

  const messageId = crypto.randomUUID();
  const { error: insertErr } = await admin.from("messages").insert({
    id: messageId,
    conversation_id: body.conversationId,
    direction: "out",
    author_type: "seller",
    author_id: sellerId,
    provider: "waha",
    text: body.text ?? "",
    media_type: body.mediaType ?? null,
    media_url: body.mediaUrl ?? null,
    media_filename: body.filename ?? null,
    status: "queued",
    sent_at: new Date().toISOString(),
  });
  if (insertErr) throw new HttpError(500, `Falha ao registrar a mensagem: ${insertErr.message}`);

  const target = { baseUrl, sessionName };
  try {
    const result =
      body.kind === "text"
        ? await sendWahaText(apiKey, globalThis.fetch, target, { toPhone, text: body.text ?? "" })
        : await sendWahaMedia(apiKey, globalThis.fetch, target, {
            toPhone,
            mediaType: body.mediaType ?? "document",
            mediaUrl: body.mediaUrl ?? "",
            filename: body.filename,
            caption: body.text,
          });

    await admin
      .from("messages")
      .update({ status: "sent", provider_message_id: result.providerMessageId })
      .eq("id", messageId);
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", body.conversationId);

    if (sellerId) {
      await bestEffortAudit(admin, {
        store_id: storeId,
        actor_id: sellerId,
        action: "whatsapp_message_sent",
        resource: "conversation",
        resource_id: body.conversationId,
        after: { provider: "waha", messageId, providerMessageId: result.providerMessageId },
      });
    }
    return json({ messageId, providerMessageId: result.providerMessageId, dispatchStatus: "sent", traceId: ctx.traceId }, 200);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await admin.from("messages").update({ status: "failed", failure_reason: reason }).eq("id", messageId);
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("waha-send rejected", { code: err.code, message: err.message });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
});
```

- [ ] **Step 2: Register the function in `supabase/config.toml`**

```toml
[functions.waha-send]
verify_jwt = true
```

- [ ] **Step 3: Verify the RPC signature matches**

Run: `grep -n "create or replace function public.can_access_conversation" supabase/migrations/20260620120000_access_model_two_gates.sql`
Expected: `create or replace function public.can_access_conversation(conv uuid)` — confirms the `{ conv: conversationId }` parameter name used above is correct.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/waha-send supabase/config.toml
git commit -m "feat: add waha-send Edge Function"
```

---

### Task 13: Deploy the 3 Edge Functions

**Files:** none (deployment step)

- [ ] **Step 1: Deploy via MCP**

Use `mcp__supabase__deploy_edge_function` for `waha-connect`, `waha-webhook`, `waha-send` (paths under `supabase/functions/`).

- [ ] **Step 2: Verify deployment**

Use `mcp__supabase__list_edge_functions` and confirm all three appear with status `ACTIVE`.

- [ ] **Step 3: No commit needed (deployment only, code already committed in Tasks 10–12).**

---

### Task 14: Chaves screen — WAHA server group

**Files:**
- Modify: `src/features/admin-settings/engine/integrationKeys.ts`
- Modify: `src/features/admin-settings/engine/integrationKeys.test.ts` (create if it doesn't exist yet — check first)

**Interfaces:**
- Modifies: `buildIntegrationKeyCatalog` to skip per-account key groups for `provider === "waha"` (the key lives on the server, not the account — same rule as `evolution-go`).

- [ ] **Step 1: Check for an existing test file**

Run: `ls src/features/admin-settings/engine/integrationKeys.test.ts`

- [ ] **Step 2: Add/extend the test**

Add this case (create the file with a minimal `describe` wrapper if it doesn't exist, importing `buildIntegrationKeyCatalog` from `./integrationKeys`):
```ts
it("skips per-account key groups for waha accounts (key lives on the server)", () => {
  const groups = buildIntegrationKeyCatalog([
    { id: "acc-1", label: "Loja Centro", provider: "waha", credentialsRef: "WAHA_SERVER_1_API_KEY" },
  ]);
  expect(groups.find((g) => g.id === "account-acc-1")).toBeUndefined();
});
```

- [ ] **Step 3: Run it to see it fail (or pass trivially — verify by reading current behavior)**

Run: `bun run test src/features/admin-settings/engine/integrationKeys.test.ts`
Expected: FAIL if `provider === "waha"` isn't skipped yet (the fallback `EVOLUTION_ACCOUNT_KEYS` branch would fire since it's neither meta nor evolution-go — check current code first).

- [ ] **Step 4: Update `integrationKeys.ts`**

Find:
```ts
    if (account.provider === "evolution-go") continue; // key lives on the Go server, not the account
```
Change to:
```ts
    if (account.provider === "evolution-go" || account.provider === "waha") continue; // key lives on the server registry, not the account
```

- [ ] **Step 5: Run tests again**

Run: `bun run test src/features/admin-settings/engine/integrationKeys.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin-settings/engine/integrationKeys.ts src/features/admin-settings/engine/integrationKeys.test.ts
git commit -m "feat: exclude WAHA accounts from per-account key groups"
```

---

### Task 15: Chaves screen — WAHA server registry UI

**Files:**
- Create: `src/features/admin-settings/components/WahaServersSection.tsx`
- Modify: `src/features/admin-settings/pages/IntegrationKeysPage.tsx`

**Interfaces:**
- Consumes: `useWahaServersProvider()` (Task 4), `integration-secrets` Edge Function (existing, unmodified).
- Produces: a new section on the existing Chaves page.

- [ ] **Step 1: Read the existing `GoServersSection.tsx` as the template**

Run: `Read src/features/admin-settings/components/GoServersSection.tsx` — reuse its exact structure (list + add/edit/rotate-key/delete dialogs, `sonner` toasts, shadcn `Card`/`Table`/`Dialog` components) as the template for the new component.

- [ ] **Step 2: Write `WahaServersSection.tsx`**

Mirror `GoServersSection.tsx` field-for-field, with these WAHA-specific deltas:
- Title: "Servidor WAHA" (singular framing is fine even though the table supports N).
- Add a 4th column/action for **"Rotacionar HMAC do webhook"** calling `wahaServersProvider.setWebhookHmacRef(id, newValue)` (in addition to the name/endpoint/rotate-API-key actions the Go template already has) — the create dialog asks for name + endpoint + API key + (optional, can be added later) HMAC key; if left blank, a helper microcopy warns "sessões não poderão ser criadas até o HMAC ser definido" (matches the `waha-connect` `create` action's hard requirement from Task 10).
- Delete guard message: "Há sessões usando este servidor. Remova-as antes de excluí-lo." (already the exact string thrown by `supabaseWahaServersProvider.remove`, Task 4 — just surface `error.message` in the toast, same as the Go section does).

Write the component now, following that structure exactly (import `useWahaServersProvider` instead of `useWhatsAppGoServersProvider`, `IWahaServer`/`ICreateWahaServerInput`/`IWahaServerPatch` instead of the Go equivalents).

- [ ] **Step 3: Mount it in `IntegrationKeysPage.tsx`**

Find where `<GoServersSection />` (or equivalent) is rendered and add `<WahaServersSection />` immediately after it, inside the same Owner-only gated area.

- [ ] **Step 4: Manual verification (per project convention — UI changes are tested by the user, not by opening a browser)**

Run: `bun run build` and `bunx tsc --noEmit -p . 2>&1 | grep -i "WahaServersSection\|IntegrationKeysPage"` — confirm no new type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/admin-settings/components/WahaServersSection.tsx src/features/admin-settings/pages/IntegrationKeysPage.tsx
git commit -m "feat: add WAHA server registry UI to the Chaves screen"
```

---

### Task 16: Configurações → WhatsApp — dedicated "WAHA" tab

**Files:**
- Create: `src/features/admin-settings/components/WahaSection.tsx`
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` (add the tab; exclude `provider='waha'` rows from the existing "Contas" list query)

**Interfaces:**
- Consumes: `useWahaServersProvider()` (list, for the server picker), Supabase client directly for `whatsapp_accounts` reads/writes scoped to `provider='waha'`, the 3 Edge Functions from Tasks 10–12 (via `supabase.functions.invoke`).

- [ ] **Step 1: Read the existing page and `AddInstanceWizard.tsx`**

Run: `Read src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` and `Read src/features/admin-settings/components/AddInstanceWizard.tsx` to match the page's tab/list layout conventions (per `docs/dev/ux-guidelines.md`: resizable columns, header glassmorphism, etc.) and its existing data-fetch pattern for `whatsapp_accounts`.

- [ ] **Step 2: Exclude WAHA rows from the existing "Contas" list**

In the query that lists accounts for the "Contas" tab (Meta/Evolution/Evolution Go), add a `.neq("provider", "waha")` filter — WAHA sessions are managed exclusively from the new dedicated tab (per the approved design: own tab, not the shared wizard), so they must not show up with a broken "Editar"/QR button that doesn't know about `waha_server_id`.

- [ ] **Step 3: Write `WahaSection.tsx`**

Build a self-contained tab component:
- **Wizard** ("Nova sessão WAHA"): form fields `storeId` (store picker, reuse the existing store-selection component from `AddInstanceWizard.tsx`), `label` (text input), `purpose` (select: atendimento/campanha/ambos), and a server picker (`useWahaServersProvider().list()` — auto-select when exactly one, show a CTA linking to Configurações → Chaves when zero, matching Task 15's guard). On submit, `supabase.functions.invoke("waha-connect", { body: { action: "create", storeId, label, purpose, wahaServerId } })`.
- After creation, show the QR: poll `supabase.functions.invoke("waha-connect", { body: { accountId, action: "qr" } })` every ~3s (matching the Evolution wizard's polling cadence) and render `qrBase64` as an `<img>`; in parallel, poll `action: "state"` every ~3s — on `state === "connected"`, close the QR dialog and show a success toast with the captured phone number.
- **Listing**: table of `whatsapp_accounts` rows where `provider='waha'` for the current store scope (label, sessionName, phone number, status badge, purpose) with row actions **Reiniciar** (`action: "restart"`), **Logout** (`action: "logout"`), **Excluir** (`action: "delete"`, confirm dialog, surface the `HAS_LINKED_DATA` error code as a friendly message).

- [ ] **Step 4: Mount the tab in `WhatsAppAccountsPage.tsx`**

Add a `TabsTrigger`/`TabsContent` pair labeled "WAHA" alongside the existing tabs, rendering `<WahaSection />`.

- [ ] **Step 5: Manual verification**

Run: `bun run build` and `bunx tsc --noEmit -p . 2>&1 | grep -i "WahaSection\|WhatsAppAccountsPage"` — confirm no new type errors. Per project convention, the user tests the UI manually in the browser — do not attempt to drive it yourself.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin-settings/components/WahaSection.tsx src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "feat: add dedicated WAHA tab to Configurações → WhatsApp"
```

---

### Task 17: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: 0 failures (baseline 213 files/1634 tests + every new WAHA test from Tasks 4–9 and 14).

- [ ] **Step 2: Run the build**

Run: `bun run build`
Expected: exits 0 (Vite/esbuild — no type-check, but catches syntax/bundling errors).

- [ ] **Step 3: Typecheck new files only**

```bash
git diff --name-status main...HEAD --diff-filter=A | grep '\.ts$\|\.tsx$' > /tmp/new-files.txt
bunx tsc --noEmit -p . 2>&1 | grep -F -f /tmp/new-files.txt
```
Expected: empty output (pre-existing baseline `tsc` errors elsewhere are fine — only files created in this branch must be clean).

- [ ] **Step 4: Confirm the sync script is up to date**

Run: `bun run scripts/sync-whatsapp-shared.ts && git status --short supabase/functions/_shared/whatsapp/waha`
Expected: no diff (already committed in Task 9; re-running must be a no-op).

- [ ] **Step 5: Lint**

Run: `bun run lint`
Expected: 0 errors on new files.

---

### Task 18: Docs + cutover checklist

**Files:**
- Create: `docs/dev/waha-integration.md`

- [ ] **Step 1: Write the doc**

Mirror the structure of `docs/dev/whatsapp-go-server-registry.md` (Task references above): sections **1. O problema/objetivo** (link to the design spec), **2. O modelo** (`waha_servers` table + `whatsapp_accounts.waha_server_id` pointer, why it's a pointer and not a separate accounts table — the RLS-reuse rationale from the design spec's section 3), **3. Fluxo de cadastro** (Chaves → server → wizard → session), **4. Resolução em runtime** (`waha-connect`/`waha-webhook`/`waha-send`, all isolated — no shared-core imports), **5. Formato da API WAHA** (session states, `sendText`/`sendImage`/`sendFile`, HMAC SHA-512), **6. Cutover** (checklist below), **7. Fora de escopo** (copy the design spec's non-goals list verbatim: failover automático, health tick via pg_cron, `message.ack`, janela de 24h, MCP).

- [ ] **Step 2: Cutover checklist (manual, requires the Owner)**

```markdown
## Cutover

1. Migrations 1–2 já aplicadas em produção via MCP (Tasks 1–2).
2. Deploy das 3 Edge Functions confirmado (Task 13).
3. Cadastrar o servidor WAHA real na tela de Chaves:
   - Nome: (ex.: "WAHA — VPS AILA")
   - Endpoint: `https://waha.ailainteligente.com.br`
   - API key: valor de `WAHA_API_KEY` do `/opt/stacks/waha/.env` (a chave REST,
     header `X-Api-Key` — NÃO as senhas de dashboard/Swagger, que ficam fora
     da plataforma).
   - HMAC do webhook: gerar um novo segredo aleatório (ex. `openssl rand -hex 32`)
     e cadastrá-lo — é um segredo NOSSO, não algo que já existe no WAHA.
4. Criar 1 sessão de teste pela aba WAHA → parear via QR → confirmar `status='WORKING'`.
5. Enviar 1 mensagem de teste (via `waha-send`, chamado pela conversa no Inbox)
   e confirmar entrega no celular pareado.
6. Enviar 1 mensagem do celular pareado para o número de teste e confirmar que
   ela aparece no Inbox (mesma tela de Atendimento).
7. Confirmar em `integration_logs` (Owner, tela de saúde ou SQL direto) que
   `integration_name='whatsapp_waha'` está sendo gravado sem erro de CHECK.
```

- [ ] **Step 3: Commit**

```bash
git add docs/dev/waha-integration.md
git commit -m "docs: add WAHA integration guide and cutover checklist"
```

---

## Self-Review Notes (completed during planning)

- **Spec coverage:** all 14 design-doc sections map to tasks — data model (Tasks 1–4), secrets (Tasks 4/15, reuses `integration-secrets` unmodified), provider layer (Task 4), engine (Tasks 5–9), Edge Functions (Tasks 10–13), UI (Tasks 14–16), docs/cutover (Task 18), regression gate (Task 17).
- **Deliberate refinement vs. the approved spec:** the spec's §6 said WAHA would implement `IWhatsAppProvider` and get a `case 'waha'` in `build.ts`/`factory.ts`. During planning this turned out to be unnecessary — WAHA's Edge Functions never call `buildWhatsAppEngine` (they're fully separate), so plugging into that dispatcher would touch shared files for zero functional benefit. This plan instead keeps `WhatsAppProviderEngine` (types.ts), `build.ts` and `factory.ts` **completely untouched** — strictly more isolated than originally specified. The only shared TS files touched are pure type unions (`WhatsAppProviderName`, `MessageProvider`, `IntegrationLogEntry` is NOT touched — a local literal `"whatsapp_waha"` string is used directly in the two Edge Functions instead), which carry zero runtime/RLS risk.
- **Type consistency check:** `sessionName` is the single key used consistently across the migration's CHECK/unique-index (Task 2), `generateWahaSessionName`'s output (Task 7), `waha-connect`'s insert (Task 10) and `waha-webhook`'s lookup (Task 11). `IWahaSessionTarget{baseUrl, sessionName}` is the one shape threaded through `session.ts`/`send.ts`/both Edge Functions. `waha_server_id` (DB) ↔ `wahaServerId` (TS) is consistent with the existing `go_server_id`/`goServerId` convention.
- **No placeholders:** every step has real, complete code; the two spots requiring UI-template mirroring (Tasks 15–16) explicitly say "mirror field-for-field" and name every delta rather than leaving a TODO, because the template files must be read fresh at implementation time (they may have shifted since this plan was written) — this is a deliberate "read-then-mirror" instruction, not a placeholder.
