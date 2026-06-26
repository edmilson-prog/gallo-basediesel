# WhatsApp Evolution Go — Server Registry · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register an Evolution Go server once (friendly name + endpoint + global key in the Vault), so creating an instance only picks a server and rotation happens in one place — killing the per-account global-key duplication.

**Architecture:** New platform-level table `whatsapp_go_servers` (Owner-only RLS) holding `name`, `base_url`, and a Vault pointer `api_key_ref`. A nullable FK `whatsapp_accounts.go_server_id` (`ON DELETE RESTRICT`) links Go accounts to their server. A new `whatsappGoServers` data provider (mock + supabase) does CRUD; the Chaves screen orchestrates secret writes via the `integration-secrets` Edge Function. The `whatsapp-connect` Edge resolves `base_url` + global key from the server (not the account). The per-instance token stays per-account.

**Tech Stack:** React 19 + TanStack Router, Tailwind v4 + shadcn/ui, Zustand (mock store), Vitest, Supabase (Postgres + RLS + Vault + Edge Functions/Deno), Provider Pattern.

## Global Constraints

- **Camada de dados:** features acessam dados **só** via `@/providers/data` (hooks). Nada de `@/mocks` nem `impl/*` fora das suas pastas (ESLint `no-restricted-imports`).
- **Provider Pattern:** o `factory.ts` monta `mockProviders`/`supabaseProviders`; ambos os sets DEVEM ter as mesmas chaves de `IDataProviders`.
- **Migrations:** versionadas em `supabase/migrations/`; aplicadas em prod **manualmente via MCP** (idempotente; `version` = nome do arquivo). Espelhar todo `apply_migration` no Git no mesmo PR.
- **Naming:** `camelCase` (vars/fns), `PascalCase` (componentes/tipos), `kebab-case` (arquivos), `snake_case` (colunas DB), `UPPER_SNAKE_CASE` (constantes). Interfaces de domínio prefixadas com `I`.
- **UI/conteúdo:** português do Brasil com acentos corretos. Comentários em inglês.
- **Secret name pattern:** `^[A-Z][A-Z0-9_]{2,64}$` (igual ao `SECRET_NAME_PATTERN` em `integrationKeys.ts` e ao wrapper SQL).
- **Gate prático:** `bun run build` + `bun run test`. `bun run build` NÃO faz type-check — rode `bunx tsc --noEmit` e avalie **código novo por delta** (há baseline de erros pré-existentes).
- **Edge engine mirror:** `src/providers/whatsapp/` é espelhado em `supabase/functions/_shared/whatsapp/` por `scripts/sync-whatsapp-shared.ts`. **NÃO** colocar o helper de servidor (que acessa o banco) na pasta espelhada — ele vive no próprio `whatsapp-connect/`.
- **Sem fronteira de segurança nova:** RLS Owner-only governa; o edge usa `service_role`.

---

## File Structure

**Criados:**
- `supabase/migrations/20260626190000_whatsapp_go_servers.sql` — tabela + FK + RLS.
- `src/features/admin-settings/engine/goServerKeyRef.ts` (+ `.test.ts`) — gera `api_key_ref`.
- `src/providers/data/contracts/whatsappGoServers.ts` — contrato + tipos de input.
- `src/providers/data/impl/mock/whatsappGoServers.ts` (+ `.test.ts`) — mock in-memory.
- `src/providers/data/impl/supabase/whatsappGoServers.ts` — CRUD na tabela.
- `src/providers/data/hooks/useWhatsAppGoServersProvider.ts` — hook.
- `src/features/admin-settings/components/GoServersSection.tsx` — UI de CRUD na tela de Chaves.
- `supabase/functions/whatsapp-connect/goServer.ts` — `resolveGoServer` (edge-side, NÃO espelhado).
- `docs/dev/whatsapp-go-server-registry.md` — doc da regra.

**Modificados:**
- `src/shared/types/conversation.ts` — `IWhatsAppGoServer` + `IWhatsAppAccount.goServerId?`.
- `src/providers/data/contracts/index.ts` — registra contrato em `IDataProviders` + re-export.
- `src/providers/data/factory.ts` — registra mock + supabase.
- `src/providers/data/index.ts` — exporta o hook + tipos.
- `src/features/admin-settings/components/AddInstanceWizard.tsx` — seletor de servidor.
- `src/features/admin-settings/pages/IntegrationKeysPage.tsx` — monta a `GoServersSection`.
- `src/features/admin-settings/engine/integrationKeys.ts` (+ `.test.ts`) — remove grupo `_API_KEY` de contas Go.
- `src/features/admin-settings/api/integrationSecrets.ts` — `deleteIntegrationSecret`.
- `supabase/functions/integration-secrets/index.ts` — ação `delete`.
- `supabase/functions/whatsapp-connect/index.ts` — `go_server_id` no SELECT + resolução via servidor (ramos qr/delete/state/logout/restart).

---

## Task 1: Domain types + `generateGoServerKeyRef` engine

**Files:**
- Modify: `src/shared/types/conversation.ts` (após `IWhatsAppAccount`, ~linha 228)
- Create: `src/features/admin-settings/engine/goServerKeyRef.ts`
- Test: `src/features/admin-settings/engine/goServerKeyRef.test.ts`

**Interfaces:**
- Produces: `IWhatsAppGoServer { id: ID; name: string; baseUrl: string; apiKeyRef: string; createdAt: ISO8601; updatedAt?: ISO8601 }`; `IWhatsAppAccount.goServerId?: ID`; `generateGoServerKeyRef(name: string, existingRefs: string[], suffix: string): string`.

- [ ] **Step 1: Add the domain types**

Em `src/shared/types/conversation.ts`, adicione **após** o fechamento de `IWhatsAppAccount` (linha 228):

```ts
/**
 * Evolution Go server (whatsmeow). Platform-level infra registered once by the
 * Owner. Holds the friendly name, endpoint and a Vault POINTER to the global
 * key (`apiKeyRef`) — never the key itself. Go accounts reference it via
 * `IWhatsAppAccount.goServerId`.
 */
export interface IWhatsAppGoServer {
  id: ID;
  /** Friendly name (unique). */
  name: string;
  /** Endpoint, normalized (no trailing slash). */
  baseUrl: string;
  /** Vault secret name holding the server-wide global key. Matches `^[A-Z][A-Z0-9_]{2,64}$`. */
  apiKeyRef: string;
  createdAt: ISO8601;
  updatedAt?: ISO8601;
}
```

E adicione o campo opcional dentro de `IWhatsAppAccount` (logo após `purpose`, linha 227):

```ts
  /** Evolution Go — server this instance belongs to (registry). Null for v2/Meta. */
  goServerId?: ID;
```

- [ ] **Step 2: Write the failing test**

Crie `src/features/admin-settings/engine/goServerKeyRef.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateGoServerKeyRef } from "./goServerKeyRef";

describe("generateGoServerKeyRef", () => {
  it("builds an env-style ref from the name + suffix", () => {
    expect(generateGoServerKeyRef("AILA Go Principal", [], "x7q")).toBe(
      "WA_GO_SERVER_AILA_GO_PRINCIPAL_X7Q",
    );
  });

  it("strips accents and non-alphanumerics", () => {
    expect(generateGoServerKeyRef("São Paulo — Go", [], "ab")).toBe(
      "WA_GO_SERVER_SAO_PAULO_GO_AB",
    );
  });

  it("falls back to SERVIDOR when the name has no usable chars", () => {
    expect(generateGoServerKeyRef("!!!", [], "z")).toBe("WA_GO_SERVER_SERVIDOR_Z");
  });

  it("disambiguates against existing refs", () => {
    const taken = "WA_GO_SERVER_GO_AB";
    expect(generateGoServerKeyRef("Go", [taken], "ab")).toBe("WA_GO_SERVER_GO_AB_1");
  });

  it("always matches the secret-name pattern", () => {
    const ref = generateGoServerKeyRef("Qualquer Coisa", [], "9z");
    expect(ref).toMatch(/^[A-Z][A-Z0-9_]{2,64}$/);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `bun run test -- goServerKeyRef`
Expected: FAIL — `Cannot find module './goServerKeyRef'`.

- [ ] **Step 4: Implement the engine**

Crie `src/features/admin-settings/engine/goServerKeyRef.ts` (espelha o `utils/goCredentials.ts`):

```ts
/**
 * Generates a unique, env-style `apiKeyRef` for an Evolution Go server. The ref
 * names the server's single Vault secret (`{ref}` holds the global key), so it
 * must match `^[A-Z][A-Z0-9_]{2,64}$`. Pure: the random suffix is injected by
 * the caller so the result is testable.
 */

function slugUpper(name: string): string {
  const slug = name
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return slug || "SERVIDOR";
}

export function generateGoServerKeyRef(
  name: string,
  existingRefs: string[],
  suffix: string,
): string {
  const suf = suffix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "X";
  const base = `WA_GO_SERVER_${slugUpper(name)}_${suf}`;
  let candidate = base;
  let n = 1;
  while (existingRefs.includes(candidate)) {
    candidate = `${base}_${n++}`;
  }
  return candidate;
}
```

> Nota: o regex de acentos usa `̀-ͯ` (combining marks) em vez de literais para evitar problemas de encoding no arquivo.

- [ ] **Step 5: Run the test and the build**

Run: `bun run test -- goServerKeyRef`
Expected: PASS (5 testes).
Run: `bunx tsc --noEmit` — confirme que os **arquivos novos/alterados** não introduzem erros (ignore o baseline).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types/conversation.ts src/features/admin-settings/engine/goServerKeyRef.ts src/features/admin-settings/engine/goServerKeyRef.test.ts
git commit -m "feat(whatsapp): add Go server domain types + key-ref engine"
```

---

## Task 2: Provider contract + mock impl + wiring (hook/factory/barrels)

**Files:**
- Create: `src/providers/data/contracts/whatsappGoServers.ts`
- Create: `src/providers/data/impl/mock/whatsappGoServers.ts`
- Test: `src/providers/data/impl/mock/whatsappGoServers.test.ts`
- Create: `src/providers/data/hooks/useWhatsAppGoServersProvider.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Modify: `src/providers/data/factory.ts:42` (mock import) + `:166` (mock set) — and supabase set in Task 3
- Modify: `src/providers/data/index.ts`

**Interfaces:**
- Consumes: `IWhatsAppGoServer` (Task 1).
- Produces: `IWhatsAppGoServersProvider { list(): Promise<IWhatsAppGoServer[]>; create(input: ICreateGoServerInput): Promise<IWhatsAppGoServer>; update(id: ID, patch: IGoServerPatch): Promise<IWhatsAppGoServer>; remove(id: ID): Promise<void> }`; `ICreateGoServerInput { name: string; baseUrl: string; apiKeyRef: string }`; `IGoServerPatch { name?: string; baseUrl?: string }`; hook `useWhatsAppGoServersProvider()`. The provider is **table-only** — writing/rotating the Vault secret is the screen's job (Task 6).

- [ ] **Step 1: Write the contract**

Crie `src/providers/data/contracts/whatsappGoServers.ts`:

```ts
import type { ID, IWhatsAppGoServer } from "@/shared/types";

export interface ICreateGoServerInput {
  name: string;
  baseUrl: string;
  /** Vault secret name (pointer) — generated by the screen via generateGoServerKeyRef. */
  apiKeyRef: string;
}

export interface IGoServerPatch {
  name?: string;
  baseUrl?: string;
}

/**
 * Registry of Evolution Go servers (platform-level, Owner-only at the RLS
 * layer). Table-only: the global key lives in the Vault and is written/rotated
 * by the Chaves screen through the `integration-secrets` Edge Function, never
 * here. `remove` is guarded by the FK `whatsapp_accounts.go_server_id`
 * (ON DELETE RESTRICT) — deleting a server with linked accounts fails.
 */
export interface IWhatsAppGoServersProvider {
  list(): Promise<IWhatsAppGoServer[]>;
  create(input: ICreateGoServerInput): Promise<IWhatsAppGoServer>;
  update(id: ID, patch: IGoServerPatch): Promise<IWhatsAppGoServer>;
  remove(id: ID): Promise<void>;
}
```

- [ ] **Step 2: Write the failing mock test**

Crie `src/providers/data/impl/mock/whatsappGoServers.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { mockWhatsAppGoServersProvider, __resetMockGoServers } from "./whatsappGoServers";

describe("mockWhatsAppGoServersProvider", () => {
  beforeEach(() => __resetMockGoServers());

  it("seeds one demo server", async () => {
    const list = await mockWhatsAppGoServersProvider.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBeTruthy();
    expect(list[0].apiKeyRef).toMatch(/^[A-Z][A-Z0-9_]{2,64}$/);
  });

  it("creates, updates and removes", async () => {
    const created = await mockWhatsAppGoServersProvider.create({
      name: "Segundo",
      baseUrl: "https://go2.test",
      apiKeyRef: "WA_GO_SERVER_SEGUNDO_AB",
    });
    expect(created.id).toBeTruthy();
    expect((await mockWhatsAppGoServersProvider.list())).toHaveLength(2);

    const updated = await mockWhatsAppGoServersProvider.update(created.id, {
      baseUrl: "https://go2b.test",
    });
    expect(updated.baseUrl).toBe("https://go2b.test");

    await mockWhatsAppGoServersProvider.remove(created.id);
    expect((await mockWhatsAppGoServersProvider.list())).toHaveLength(1);
  });

  it("throws when updating a missing server", async () => {
    await expect(
      mockWhatsAppGoServersProvider.update("nope", { name: "x" }),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `bun run test -- whatsappGoServers`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the mock provider**

Crie `src/providers/data/impl/mock/whatsappGoServers.ts` (self-contained — não importa `@/mocks`):

```ts
import type { ID, IWhatsAppGoServer } from "@/shared/types";
import type {
  ICreateGoServerInput,
  IGoServerPatch,
  IWhatsAppGoServersProvider,
} from "../../contracts/whatsappGoServers";

/** Stable demo seed so the wizard's server selector has one option in mock mode. */
function seed(): IWhatsAppGoServer[] {
  return [
    {
      id: "00000000-0000-0000-0000-0000000000go",
      name: "Servidor Go (demonstração)",
      baseUrl: "https://evogo.demo.local",
      apiKeyRef: "WA_GO_SERVER_DEMO_AB",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
}

let servers: IWhatsAppGoServer[] = seed();

/** Test-only: restore the deterministic seed between cases. */
export function __resetMockGoServers(): void {
  servers = seed();
}

export const mockWhatsAppGoServersProvider: IWhatsAppGoServersProvider = {
  async list(): Promise<IWhatsAppGoServer[]> {
    return servers.map((s) => ({ ...s }));
  },
  async create(input: ICreateGoServerInput): Promise<IWhatsAppGoServer> {
    const server: IWhatsAppGoServer = {
      id: crypto.randomUUID(),
      name: input.name,
      baseUrl: input.baseUrl,
      apiKeyRef: input.apiKeyRef,
      createdAt: new Date().toISOString(),
    };
    servers = [...servers, server];
    return { ...server };
  },
  async update(id: ID, patch: IGoServerPatch): Promise<IWhatsAppGoServer> {
    const idx = servers.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error(`[mock] go server ${id} not found`);
    const next = {
      ...servers[idx],
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl } : {}),
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

- [ ] **Step 5: Create the hook**

Crie `src/providers/data/hooks/useWhatsAppGoServersProvider.ts`:

```ts
import type { IWhatsAppGoServersProvider } from "../contracts/whatsappGoServers";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWhatsAppGoServersProvider(): IWhatsAppGoServersProvider {
  return useDataProviderSlice("whatsappGoServers", "useWhatsAppGoServersProvider");
}
```

- [ ] **Step 6: Register the contract in `IDataProviders`**

Em `src/providers/data/contracts/index.ts`:
1. Após a linha 27 (`import type { IWhatsAppAccountsProvider } ...`), adicione:
```ts
import type { IWhatsAppGoServersProvider } from "./whatsappGoServers";
```
2. Após o bloco de re-export de `whatsappAccounts` (linha 106), adicione:
```ts
export type {
  IWhatsAppGoServersProvider,
  ICreateGoServerInput,
  IGoServerPatch,
} from "./whatsappGoServers";
```
3. Dentro de `interface IDataProviders`, após `whatsappAccounts: IWhatsAppAccountsProvider;` (linha 181), adicione:
```ts
  whatsappGoServers: IWhatsAppGoServersProvider;
```

- [ ] **Step 7: Register the mock provider in the factory**

Em `src/providers/data/factory.ts`:
1. Após a linha 22 (`import { mockWhatsAppAccountsProvider } ...`), adicione:
```ts
import { mockWhatsAppGoServersProvider } from "./impl/mock/whatsappGoServers";
```
2. No objeto `mockProviders`, após `whatsappAccounts: mockWhatsAppAccountsProvider,` (linha 143), adicione:
```ts
  whatsappGoServers: mockWhatsAppGoServersProvider,
```

> O `supabaseProviders` recebe a sua entrada na Task 3 (até lá o build do supabase set falha o type-check de `IDataProviders` — por isso Task 3 segue imediatamente).

- [ ] **Step 8: Export the hook from the barrel**

Em `src/providers/data/index.ts`:
1. No bloco `export type { ... } from "./contracts";`, após `IWhatsAppAccountMetrics,` (linha 75), adicione:
```ts
  IWhatsAppGoServersProvider,
  ICreateGoServerInput,
  IGoServerPatch,
```
2. Após a linha 141 (`export { useWhatsAppAccountsProvider } ...`), adicione:
```ts
export { useWhatsAppGoServersProvider } from "./hooks/useWhatsAppGoServersProvider";
```

- [ ] **Step 9: Run the mock test**

Run: `bun run test -- whatsappGoServers`
Expected: PASS (4 testes).

- [ ] **Step 10: Commit**

```bash
git add src/providers/data/contracts/whatsappGoServers.ts src/providers/data/impl/mock/whatsappGoServers.ts src/providers/data/impl/mock/whatsappGoServers.test.ts src/providers/data/hooks/useWhatsAppGoServersProvider.ts src/providers/data/contracts/index.ts src/providers/data/factory.ts src/providers/data/index.ts
git commit -m "feat(whatsapp): add whatsappGoServers provider (contract + mock + wiring)"
```

---

## Task 3: Supabase provider impl

**Files:**
- Create: `src/providers/data/impl/supabase/whatsappGoServers.ts`
- Modify: `src/providers/data/factory.ts:89` (supabase import) + `:212` (supabase set)

**Interfaces:**
- Consumes: `IWhatsAppGoServersProvider`, `ICreateGoServerInput`, `IGoServerPatch` (Task 2).
- Produces: `supabaseWhatsAppGoServersProvider`.

- [ ] **Step 1: Implement the supabase provider**

Crie `src/providers/data/impl/supabase/whatsappGoServers.ts`:

```ts
import type { ID, IWhatsAppGoServer } from "@/shared/types";
import type {
  ICreateGoServerInput,
  IGoServerPatch,
  IWhatsAppGoServersProvider,
} from "../../contracts/whatsappGoServers";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase impl of {@link IWhatsAppGoServersProvider}. RLS keeps the table
 * Owner-only. Table-only: the global key lives in the Vault (written by the
 * screen via the integration-secrets Edge Function). `remove` relies on the FK
 * `whatsapp_accounts.go_server_id` (ON DELETE RESTRICT) — Postgres rejects the
 * delete when accounts are linked; we translate that into a friendly message.
 */

interface GoServerRow {
  id: string;
  name: string;
  base_url: string;
  api_key_ref: string;
  created_at: string;
  updated_at: string | null;
}

const TABLE = "whatsapp_go_servers";
const COLUMNS = "id, name, base_url, api_key_ref, created_at, updated_at";

function rowToGoServer(row: GoServerRow): IWhatsAppGoServer {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKeyRef: row.api_key_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export const supabaseWhatsAppGoServersProvider: IWhatsAppGoServersProvider = {
  async list(): Promise<IWhatsAppGoServer[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`[supabase] goServers.list failed: ${error.message}`);
    return (data as unknown as GoServerRow[]).map(rowToGoServer);
  },

  async create(input: ICreateGoServerInput): Promise<IWhatsAppGoServer> {
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
    if (error) throw new Error(`[supabase] goServers.create failed: ${error.message}`);
    return rowToGoServer(data as unknown as GoServerRow);
  },

  async update(id: ID, patch: IGoServerPatch): Promise<IWhatsAppGoServer> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.baseUrl !== undefined) row.base_url = patch.baseUrl;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(row)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] goServers.update(${id}) failed: ${error.message}`);
    return rowToGoServer(data as unknown as GoServerRow);
  },

  async remove(id: ID): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) {
      // FK violation (23503) → a Go account still points at this server.
      if (error.code === "23503") {
        throw new Error("Há números usando este servidor. Remova-os antes de excluí-lo.");
      }
      throw new Error(`[supabase] goServers.remove(${id}) failed: ${error.message}`);
    }
  },
};
```

- [ ] **Step 2: Register in the factory**

Em `src/providers/data/factory.ts`:
1. Após a linha 66 (`import { supabaseWhatsAppAccountsProvider } ...`), adicione:
```ts
import { supabaseWhatsAppGoServersProvider } from "./impl/supabase/whatsappGoServers";
```
2. No objeto `supabaseProviders`, após `whatsappAccounts: supabaseWhatsAppAccountsProvider,` (linha 189), adicione:
```ts
  whatsappGoServers: supabaseWhatsAppGoServersProvider,
```

- [ ] **Step 3: Build (both provider sets now satisfy `IDataProviders`)**

Run: `bunx tsc --noEmit`
Expected: nenhum erro novo em `factory.ts`/`whatsappGoServers.ts` (o set supabase agora tem a chave). Ignore o baseline.
Run: `bun run build`
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/providers/data/impl/supabase/whatsappGoServers.ts src/providers/data/factory.ts
git commit -m "feat(whatsapp): add supabase whatsappGoServers provider"
```

---

## Task 4: Migration — table + FK + RLS

**Files:**
- Create: `supabase/migrations/20260626190000_whatsapp_go_servers.sql`

> Não aplicar em prod ainda — a aplicação manual via MCP é a Task 9 (cutover), com OK do dono.

- [ ] **Step 1: Write the migration**

Crie `supabase/migrations/20260626190000_whatsapp_go_servers.sql`:

```sql
-- WhatsApp Evolution Go — server registry.
-- Platform-level (no store scope): one row per evo-go server. Holds the
-- friendly name, endpoint and a Vault POINTER to the server-wide global key
-- (api_key_ref); the key itself lives in the Vault. Go accounts link via
-- whatsapp_accounts.go_server_id (ON DELETE RESTRICT = delete guard).
-- Owner-only RLS (mirrors ai_settings); Edge Functions use service_role.

create table if not exists public.whatsapp_go_servers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text not null,
  api_key_ref text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_go_servers_api_key_ref_pattern
    check (api_key_ref ~ '^[A-Z][A-Z0-9_]{2,64}$')
);

alter table public.whatsapp_accounts
  add column if not exists go_server_id uuid
  references public.whatsapp_go_servers (id) on delete restrict;

create index if not exists idx_whatsapp_accounts_go_server_id
  on public.whatsapp_accounts (go_server_id);

alter table public.whatsapp_go_servers enable row level security;

-- Owner-only. Uses the same predicate style as other Owner-only tables: the
-- base role on the JWT must be the platform owner.
drop policy if exists whatsapp_go_servers_owner_all on public.whatsapp_go_servers;
create policy whatsapp_go_servers_owner_all
  on public.whatsapp_go_servers
  for all
  to authenticated
  using (public.current_app_role() = 'owner')
  with check (public.current_app_role() = 'owner');
```

> **Verificação do predicado de Owner:** antes de aplicar, confirme o helper de papel usado por outras policies Owner-only (ex.: `current_app_role()`, `is_owner()`, ou `auth.jwt() ->> 'app_role'`). Use **o mesmo** das policies de `ai_settings`. Ajuste o `using/with check` conforme o real. (Grep: `rg "for all" supabase/migrations | rg -i owner`.)

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260626190000_whatsapp_go_servers.sql
git commit -m "feat(whatsapp): migration for whatsapp_go_servers registry"
```

---

## Task 5: Wizard — server selector replaces URL + key

**Files:**
- Modify: `src/features/admin-settings/components/AddInstanceWizard.tsx`

**Interfaces:**
- Consumes: `useWhatsAppGoServersProvider` (Task 2), `IWhatsAppGoServer` (Task 1).
- Produces: a conta criada grava `goServerId` e **não** grava `providerConfig.baseUrl` nem a chave.

- [ ] **Step 1: Load the servers list**

No topo de `AddInstanceWizard.tsx`, adicione o import do hook ao bloco de `@/providers/data` (linha 13) e o tipo:
```ts
import { getActiveDataSource, useWhatsAppAccountsProvider, useWhatsAppGoServersProvider } from "@/providers/data";
import type { IWhatsAppAccount, IWhatsAppGoServer, WhatsAppAccountPurpose } from "@/shared/types";
```

Dentro do componente, após `const provider = useWhatsAppAccountsProvider();` (linha 67):
```ts
  const goServersProvider = useWhatsAppGoServersProvider();
  const [goServers, setGoServers] = useState<IWhatsAppGoServer[]>([]);
  const [goServerId, setGoServerId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    goServersProvider
      .list()
      .then((list) => {
        if (cancelled) return;
        setGoServers(list);
        if (list.length === 1) setGoServerId(list[0].id); // auto-select the only one
      })
      .catch(() => {
        if (!cancelled) setGoServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [goServersProvider]);
```

- [ ] **Step 2: Remove the URL/key state and prefill effect**

Remova as linhas:
- `const [goBaseUrl, setGoBaseUrl] = useState("");` (linha 81)
- `const [goApiKey, setGoApiKey] = useState("");` (linha 82)
- o `useEffect` "Pre-fill Go URL from existing Go template" (linhas 110-113)
- o `goTemplate` memo (linhas 89-92) se ficar sem uso após esta task.

- [ ] **Step 3: Rewrite the Go branch of `handleCreate`**

Substitua o bloco `if (wizardProvider === "evolution-go") { ... }` (linhas 117-161) por:

```ts
    if (wizardProvider === "evolution-go") {
      if (!goServerId) {
        setError("Selecione o servidor Evolution Go.");
        return;
      }
      if (!isMock && !isValidCredentialsRef(goCredentialsRef)) {
        setError(INVALID_CREDENTIALS_REF_MESSAGE);
        return;
      }
      setPhase("creating");
      try {
        const created = await provider.create({
          storeId,
          label: label.trim(),
          phoneNumber: "",
          provider: "evolution-go",
          credentialsRef: goCredentialsRef,
          status: "pending",
          capabilities: EVOLUTION_FAMILY_CAPS,
          providerConfig: { instanceId: "" },
          goServerId,
          currentState: "healthy",
          failoverPolicy: "disabled",
          isFailoverActive: false,
          purpose,
        });
        setAccountId(created.id);
        setPhase("qr");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao criar a instância Evolution Go.");
        setPhase("form");
      }
      return;
    }
```

> `setIntegrationSecret(`${goCredentialsRef}_API_KEY`, ...)` é **removido** — a chave agora vem do servidor. A chamada `setIntegrationSecret` e o import permanecem usados? Verifique: se `setIntegrationSecret` ficar sem uso no arquivo, remova o import (linha 16).

- [ ] **Step 4: Replace the form fields (URL + key) with the server selector**

Substitua o bloco `{wizardProvider === "evolution-go" && ( <> ...url...key... </> )}` (linhas 268-300) por:

```tsx
            {wizardProvider === "evolution-go" && (
              <div className="space-y-1.5">
                <Label htmlFor="add-go-server">Servidor Evolution Go</Label>
                {goServers.length === 0 ? (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    Nenhum servidor cadastrado. Cadastre um em{" "}
                    <strong>Configurações → Integrações &amp; Chaves</strong> antes de adicionar um
                    número.
                  </div>
                ) : (
                  <select
                    id="add-go-server"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={goServerId}
                    onChange={(e) => setGoServerId(e.target.value)}
                  >
                    <option value="" disabled>
                      Selecione o servidor…
                    </option>
                    {goServers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
```

- [ ] **Step 5: Disable submit when no Go server is chosen**

No botão "Criar e conectar" (linha 314), troque a condição `disabled`:
```tsx
              <Button
                disabled={
                  !label.trim() ||
                  (wizardProvider === "evolution-go" && (goServers.length === 0 || !goServerId))
                }
                onClick={() => void handleCreate()}
              >
                Criar e conectar
              </Button>
```

- [ ] **Step 6: Build**

Run: `bunx tsc --noEmit` — sem erros novos no `AddInstanceWizard.tsx`.
Run: `bun run build`
Expected: sucesso.

- [ ] **Step 7: Commit**

```bash
git add src/features/admin-settings/components/AddInstanceWizard.tsx
git commit -m "feat(whatsapp): wizard picks a Go server instead of typing URL+key"
```

---

## Task 6: Chaves screen — Go servers section + drop per-account Go key group + secret delete

**Files:**
- Create: `src/features/admin-settings/components/GoServersSection.tsx`
- Modify: `src/features/admin-settings/pages/IntegrationKeysPage.tsx`
- Modify: `src/features/admin-settings/engine/integrationKeys.ts`
- Modify: `src/features/admin-settings/engine/integrationKeys.test.ts`
- Modify: `src/features/admin-settings/api/integrationSecrets.ts`
- Modify: `supabase/functions/integration-secrets/index.ts`

**Interfaces:**
- Consumes: `useWhatsAppGoServersProvider`, `generateGoServerKeyRef`, `setIntegrationSecret`, `deleteIntegrationSecret`.

- [ ] **Step 1: Drop the per-account `_API_KEY` group for Go accounts (engine)**

Em `src/features/admin-settings/engine/integrationKeys.ts`, dentro do `for (const account of accounts)` (linha 217), pule contas Go (a chave agora é do servidor):

```ts
  for (const account of accounts) {
    const ref = account.credentialsRef?.trim();
    if (!ref || !isValidSecretName(ref)) continue;
    if (account.provider === "evolution-go") continue; // key lives on the Go server, not the account
    const defs = account.provider === "meta" ? META_ACCOUNT_KEYS : EVOLUTION_ACCOUNT_KEYS;
```

- [ ] **Step 2: Update the engine test**

Em `src/features/admin-settings/engine/integrationKeys.test.ts`, adicione um caso (ajuste os imports/fixtures ao estilo do arquivo existente):

```ts
it("does not emit a key group for evolution-go accounts (key is on the server)", () => {
  const groups = buildIntegrationKeyCatalog([
    {
      id: "acc-go",
      label: "Comercial Volvo",
      provider: "evolution-go",
      credentialsRef: "WA_EVO_GO_COMERCIAL_VOLVO_AB",
    },
  ]);
  expect(groups.some((g) => g.id === "account-acc-go")).toBe(false);
});
```

Run: `bun run test -- integrationKeys`
Expected: PASS.

- [ ] **Step 3: Add a `delete` action to the integration-secrets Edge**

Em `supabase/functions/integration-secrets/index.ts`, localize o switch de `action` (`list`/`set`) e adicione o ramo `delete` (Owner-only + auditado, espelhando o `set`):

```ts
    if (action === "delete") {
      const name = String(body.name ?? "");
      if (!SECRET_NAME_PATTERN.test(name)) {
        throw new HttpError(422, "Nome de segredo inválido");
      }
      await admin.rpc("integration_secret_delete", { p_name: name });
      await recordAudit(admin, {
        actor_id: actorId,
        action: "integration_secret_deleted",
        resource: "integration_secret",
        after: { name },
      });
      return json({ ok: true }, 200);
    }
```

> **Pré-requisito SQL:** confirme se já existe o wrapper `integration_secret_delete(p_name text)` (SECURITY DEFINER, service_role-only) espelhando o `integration_secret_set`. Se **não** existir, adicione-o numa migração irmã `supabase/migrations/20260626191000_integration_secret_delete.sql`:

```sql
-- Owner-ops: delete a Vault secret by name (service_role only), mirroring
-- integration_secret_set. Used when a Go server is removed from the registry.
create or replace function public.integration_secret_delete(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
     and auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;
  delete from vault.secrets where name = p_name;
end;
$$;

revoke all on function public.integration_secret_delete(text) from public, anon, authenticated;
```

> Ajuste o guard de role ao **mesmo** padrão do `integration_secret_set` existente (leia-o primeiro: `rg "integration_secret_set" supabase/migrations`).

- [ ] **Step 4: Add `deleteIntegrationSecret` to the api**

Em `src/features/admin-settings/api/integrationSecrets.ts`, após `setIntegrationSecret` (linha 38):

```ts
/** Removes a secret from the Vault (used when a Go server is deleted). */
export async function deleteIntegrationSecret(name: string): Promise<void> {
  const { error } = await getSupabaseClient().functions.invoke("integration-secrets", {
    body: { action: "delete", name },
  });
  if (error)
    throw new Error(await extractFunctionError(error, "Não foi possível remover a chave."));
}
```

- [ ] **Step 5: Build the `GoServersSection` component**

Crie `src/features/admin-settings/components/GoServersSection.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWhatsAppGoServersProvider } from "@/providers/data";
import type { IWhatsAppGoServer } from "@/shared/types";
import { generateGoServerKeyRef } from "../engine/goServerKeyRef";
import { setIntegrationSecret, deleteIntegrationSecret } from "../api/integrationSecrets";

/**
 * Owner-only CRUD of Evolution Go servers (Integrações & Chaves). The global key
 * is written ONCE to the Vault here (via integration-secrets); the table stores
 * only the pointer. Rotating re-saves the same api_key_ref — instant, no
 * redeploy. Deleting is guarded by the FK (a server with linked numbers fails).
 */
export function GoServersSection({ canEdit }: { canEdit: boolean }) {
  const provider = useWhatsAppGoServersProvider();
  const [servers, setServers] = useState<IWhatsAppGoServer[]>([]);
  const [adding, setAdding] = useState(false);
  const reload = () => provider.list().then(setServers).catch(() => setServers([]));

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const existingRefs = useMemo(() => servers.map((s) => s.apiKeyRef), [servers]);

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <Icon icon="mdi:server-network" className="size-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold">Servidores Evolution Go</h2>
            <p className="text-xs text-muted-foreground">
              Cadastre o servidor uma vez (nome · endpoint · chave global). Os números escolhem o
              servidor — sem digitar a chave de novo.
            </p>
          </div>
        </div>
        {canEdit && !adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Icon icon="mdi:plus" className="mr-1 size-4" />
            Adicionar
          </Button>
        )}
      </header>

      <div className="divide-y divide-border">
        {adding && (
          <GoServerForm
            canEdit={canEdit}
            existingRefs={existingRefs}
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await reload();
            }}
          />
        )}
        {servers.length === 0 && !adding && (
          <p className="px-4 py-6 text-sm text-muted-foreground">Nenhum servidor cadastrado.</p>
        )}
        {servers.map((s) => (
          <GoServerRow key={s.id} server={s} canEdit={canEdit} onChanged={reload} />
        ))}
      </div>
    </section>
  );
}

function GoServerForm({
  canEdit,
  existingRefs,
  onCancel,
  onSaved,
}: {
  canEdit: boolean;
  existingRefs: string[];
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const provider = useWhatsAppGoServersProvider();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const n = name.trim();
    const url = baseUrl.trim().replace(/\/+$/, "");
    const key = apiKey.trim();
    if (!n || !url || !key) {
      toast.error("Preencha nome, endpoint e chave global.");
      return;
    }
    setSaving(true);
    try {
      const suffix = crypto.randomUUID().slice(0, 3);
      const apiKeyRef = generateGoServerKeyRef(n, existingRefs, suffix);
      await setIntegrationSecret(apiKeyRef, key, `Chave global Evolution Go — ${n}`);
      await provider.create({ name: n, baseUrl: url, apiKeyRef });
      toast.success("Servidor cadastrado com segurança.");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o servidor.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="go-server-name">Nome amigável</Label>
          <Input
            id="go-server-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: AILA Go Principal"
            disabled={!canEdit || saving}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="go-server-url">Endpoint</Label>
          <Input
            id="go-server-url"
            className="font-mono"
            inputMode="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://evogo.seudominio.com"
            disabled={!canEdit || saving}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="go-server-key">Chave global da API</Label>
        <Input
          id="go-server-key"
          type="password"
          autoComplete="new-password"
          className="max-w-md font-mono"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Chave global do servidor (admin)"
          disabled={!canEdit || saving}
        />
        <p className="text-[11px] text-muted-foreground">
          Gravada criptografada no cofre — nunca exibida de volta. Vale para todos os números deste
          servidor.
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={!canEdit || saving}>
          {saving ? "Salvando…" : "Salvar servidor"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function GoServerRow({
  server,
  canEdit,
  onChanged,
}: {
  server: IWhatsAppGoServer;
  canEdit: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const provider = useWhatsAppGoServersProvider();
  const [rotating, setRotating] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [busy, setBusy] = useState(false);

  const handleRotate = async () => {
    const key = newKey.trim();
    if (!key) {
      toast.error("Informe a nova chave.");
      return;
    }
    setBusy(true);
    try {
      await setIntegrationSecret(server.apiKeyRef, key, `Chave global Evolution Go — ${server.name}`);
      toast.success("Chave rotacionada. Vale imediatamente, sem redeploy.");
      setRotating(false);
      setNewKey("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível rotacionar a chave.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await provider.remove(server.id); // FK guard throws a friendly message if linked
      await deleteIntegrationSecret(server.apiKeyRef).catch(() => {
        /* secret cleanup is best-effort; the row is already gone */
      });
      toast.success("Servidor removido.");
      await onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível remover o servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{server.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{server.baseUrl}</p>
          <p className="font-mono text-[11px] text-muted-foreground">••••{server.apiKeyRef.slice(-6)}</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setRotating((v) => !v)} disabled={busy}>
              <Icon icon="mdi:key-change" className="mr-1 size-4" />
              Rotacionar chave
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={busy}
              className="text-severity-critical"
            >
              <Icon icon="mdi:trash-can-outline" className="size-4" />
            </Button>
          </div>
        )}
      </div>
      {rotating && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            autoComplete="new-password"
            placeholder="Nova chave global"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="max-w-md font-mono"
            disabled={busy}
          />
          <Button size="sm" onClick={handleRotate} disabled={busy}>
            {busy ? "Salvando…" : "Salvar nova chave"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Mount the section in the Chaves page**

Em `src/features/admin-settings/pages/IntegrationKeysPage.tsx`:
1. Importe o componente após os imports existentes:
```ts
import { GoServersSection } from "../components/GoServersSection";
```
2. Renderize-a logo após o `SectionHeader` (após a linha 108), passando `canEdit={isSupabase}`:
```tsx
      <GoServersSection canEdit={isSupabase} />
```

- [ ] **Step 7: Build + test**

Run: `bun run test -- integrationKeys`
Expected: PASS.
Run: `bunx tsc --noEmit` — sem erros novos.
Run: `bun run build`
Expected: sucesso.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin-settings/components/GoServersSection.tsx src/features/admin-settings/pages/IntegrationKeysPage.tsx src/features/admin-settings/engine/integrationKeys.ts src/features/admin-settings/engine/integrationKeys.test.ts src/features/admin-settings/api/integrationSecrets.ts supabase/functions/integration-secrets/index.ts
# se criada a migração do delete:
git add supabase/migrations/20260626191000_integration_secret_delete.sql 2>/dev/null || true
git commit -m "feat(whatsapp): Go servers CRUD in Chaves + drop per-account Go key group"
```

---

## Task 7: Edge — resolve base_url + global key from the server

**Files:**
- Create: `supabase/functions/whatsapp-connect/goServer.ts`
- Modify: `supabase/functions/whatsapp-connect/index.ts`

**Interfaces:**
- Produces: `resolveGoServer(admin, resolveSecret, account): Promise<{ baseUrl: string; globalKey: string }>` (throws `HttpError` on missing server/secret).

- [ ] **Step 1: Write the resolver helper**

Crie `supabase/functions/whatsapp-connect/goServer.ts`:

```ts
import { HttpError } from "../_shared/http.ts";

interface AccountLike {
  id: string;
  go_server_id: string | null;
  provider_config: Record<string, unknown> | null;
}

type Admin = { from: (t: string) => any };
type ResolveSecret = (name: string) => Promise<string | null>;

/**
 * Resolves the Evolution Go server's endpoint + global key for an account.
 * The base_url and the Vault api_key_ref live on `whatsapp_go_servers`
 * (registry), NOT on the account. The per-instance token stays per-account and
 * is resolved by the caller. Service_role bypasses RLS.
 */
export async function resolveGoServer(
  admin: Admin,
  resolveSecret: ResolveSecret,
  account: AccountLike,
): Promise<{ baseUrl: string; globalKey: string }> {
  if (!account.go_server_id) {
    throw new HttpError(422, "Conta Evolution Go sem servidor configurado (go_server_id ausente).");
  }
  const { data: server, error } = await admin
    .from("whatsapp_go_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.go_server_id)
    .maybeSingle();
  if (error || !server) {
    throw new HttpError(422, "Servidor Evolution Go não encontrado para esta conta.");
  }
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  if (!baseUrl) throw new HttpError(422, "Servidor Evolution Go sem endpoint.");
  const globalKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!globalKey) throw new HttpError(422, "Chave global do servidor Evolution Go não definida.");
  return { baseUrl, globalKey };
}
```

> Confirme o caminho do `HttpError` (`../_shared/http.ts`) — ajuste ao import já usado no `index.ts` (linha ~323 usa `HttpError`).

- [ ] **Step 2: Select `go_server_id` and type it**

Em `supabase/functions/whatsapp-connect/index.ts`:
1. No `interface IAccountRow` (~linha 67), adicione:
```ts
  go_server_id: string | null;
```
2. No SELECT da linha 331, acrescente a coluna:
```ts
    .select("id, store_id, label, provider, status, phone_number, credentials_ref, provider_config, go_server_id")
```
3. Importe o resolver no topo:
```ts
import { resolveGoServer } from "./goServer.ts";
```

- [ ] **Step 3: Use the server in the QR branch**

No ramo `if (account.provider === "evolution-go")` da ação `qr` (a partir da linha 480), substitua a resolução de `goBaseUrl` e do `globalKey`:

- Onde hoje está `const goBaseUrl = String(goConfig.baseUrl ?? "");` (linha 482) e o `globalKey = await deps.resolveSecret(`${credsRef}${EVOLUTION_GO_SECRET_SUFFIXES.apiKey}`)` (linhas 501-502), passe a resolver pelo servidor **uma vez** no início do ramo:

```ts
  if (account.provider === "evolution-go") {
    const goConfig = account.provider_config ?? {};
    const { baseUrl: goBaseUrl, globalKey } = await resolveGoServer(
      admin,
      deps.resolveSecret,
      account,
    );
    // ...resto do ramo: remova a antiga linha `const goBaseUrl = ...` e o
    // bloco que resolvia `globalKey` via `${credsRef}_API_KEY`.
```

Mantenha a resolução do **token por instância** (`instanceTokenSecretName` / `${credsRef}_INSTANCE_TOKEN`) exatamente como está. `createGoInstance(globalKey, ...)` continua recebendo `globalKey`, agora vindo do servidor.

- [ ] **Step 4: Use the server in the delete/teardown branch**

No ramo `else if (account.provider === "evolution-go")` do teardown (linha 423), troque a leitura do `provider_config.baseUrl` + token por:

```ts
    } else if (account.provider === "evolution-go") {
      try {
        const { baseUrl, globalKey } = await resolveGoServer(admin, deps.resolveSecret, account);
        const instanceId = String((account.provider_config ?? {}).instanceId ?? "");
        if (baseUrl && instanceId) {
          const goTarget = { baseUrl, instanceId };
          const token = await deps.resolveSecret(
            `${account.credentials_ref}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`,
          );
          // logout is instance-scoped (token); delete is an ADMIN endpoint (global key).
          if (token) await logoutGoInstance(token, deps, goTarget, ctx.traceId).catch(() => {});
          await deleteGoInstance(globalKey, deps, goTarget, ctx.traceId);
        }
      } catch (err) {
        ctx.log.warn("evolution-go teardown skipped/failed (instance may be orphaned)", {
          accountId: account.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
```

> **Conflito com PR #177:** o PR #177 já corrige este ramo para usar a chave global por-conta. Se #177 entrar antes, esta task **substitui** aquela resolução pela do servidor (semântica idêntica: `delete` usa a chave global, agora do registro). Garanta que `logoutGoInstance`/`deleteGoInstance` continuam importados (linhas 45-52).

- [ ] **Step 5: Update the remaining Go branches (state/logout/restart)**

Nos ramos `state` (~604), `logout` (~636) e `restart` (~659), cada um lê `goBaseUrl` de `provider_config`. Substitua a obtenção de `goBaseUrl` por `resolveGoServer` no início de cada ramo (apenas `baseUrl` é necessário; o token por-instância segue resolvido por `instanceTokenSecretName`):

```ts
const { baseUrl: goBaseUrl } = await resolveGoServer(admin, deps.resolveSecret, account);
```

Remova as linhas locais `const goBaseUrl = String(goConfig.baseUrl ?? "");` desses ramos. (Confirme via `rg "goConfig.baseUrl|goBaseUrl" supabase/functions/whatsapp-connect/index.ts` que nenhuma referência órfã sobrou.)

- [ ] **Step 6: Type-check the Edge (Deno) by deploy dry-run at cutover**

> Edge Functions são Deno — não entram no `bun run build`/`tsc` do app. A verificação real é o **deploy** (Task 9). Aqui, revise manualmente que não há referência a `provider_config.baseUrl` no caminho Go e que `resolveGoServer` é chamado em todos os ramos Go.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/whatsapp-connect/goServer.ts supabase/functions/whatsapp-connect/index.ts
git commit -m "feat(whatsapp): whatsapp-connect resolves Go base_url+key from the server registry"
```

---

## Task 8: whatsapp-send touchpoint + docs

**Files:**
- Verify/Modify: `supabase/functions/whatsapp-send/` (only if it sends via evolution-go using `provider_config.baseUrl`)
- Create: `docs/dev/whatsapp-go-server-registry.md`

- [ ] **Step 1: Check whether whatsapp-send reads the Go base_url/key from the account**

Run: `rg -n "evolution-go|EVOLUTION_GO|provider_config|baseUrl|api_key|_API_KEY" supabase/functions/whatsapp-send`
- **Se** o envio Go resolve `baseUrl` de `provider_config.baseUrl` e a chave global de `{ref}_API_KEY`: aplique o mesmo `resolveGoServer` (copie `goServer.ts` para `whatsapp-send/` — Edge helpers não são compartilhados via `_shared` espelhado; duplicar é aceitável e pequeno) e troque a resolução. O **token por instância** continua por-conta.
- **Se** o envio Go usa apenas `base_url` + token de instância (sem a chave global): só o `base_url` precisa vir do servidor — aplique `resolveGoServer` e use `baseUrl`.
- **Se** o envio Go ainda não está plugado: registre no doc que o envio deverá usar `resolveGoServer` quando for ativado, e **não** mude nada.

- [ ] **Step 2: Write the dev doc**

Crie `docs/dev/whatsapp-go-server-registry.md` com: o problema (duplicação da chave global por-conta), o modelo (tabela `whatsapp_go_servers` + FK `go_server_id`), o fluxo (cadastro único na tela de Chaves → wizard escolhe servidor → edge resolve via `resolveGoServer`), rotação (re-grava o mesmo `api_key_ref`, sem redeploy), e o cutover. Referencie `docs/superpowers/specs/2026-06-26-whatsapp-go-server-registry-design.md`.

- [ ] **Step 3: Commit**

```bash
git add docs/dev/whatsapp-go-server-registry.md supabase/functions/whatsapp-send 2>/dev/null || git add docs/dev/whatsapp-go-server-registry.md
git commit -m "docs(whatsapp): Go server registry dev doc + whatsapp-send touchpoint"
```

---

## Task 9: Cutover (Owner-gated — confirmar antes de cada passo de prod)

> **NÃO executar sem OK explícito do dono** (regra do projeto: confirmar antes de `apply_migration`/deploy de edge em prod).

- [ ] **Step 1: Apply the migration(s) to prod via MCP**

`apply_migration` com `version` = nome do arquivo (idempotente): `20260626190000_whatsapp_go_servers` (e `20260626191000_integration_secret_delete` se criada). Confirme o predicado de Owner antes (Task 4 Step 1 nota).

- [ ] **Step 2: Deploy the Edge Functions**

```bash
npx supabase functions deploy whatsapp-connect --project-ref njizaasajkdqptlxddqn
npx supabase functions deploy integration-secrets --project-ref njizaasajkdqptlxddqn
# whatsapp-send apenas se tocado na Task 8
```

- [ ] **Step 3: Register the real Go server**

Na tela **Configurações → Integrações & Chaves → Servidores Evolution Go**: Adicionar → nome + endpoint real + chave global. (A chave entra no Vault uma vez.)

- [ ] **Step 4: Smoke (dono)**

Adicionar um número Go pela wizard (escolhendo o servidor, sem digitar chave/URL) → parear por QR → confirmar `LoggedIn: true` em `integration_logs`. Excluir o número → confirmar que a instância sai do servidor Go (sem órfã). Rotacionar a chave do servidor → confirmar que o número segue funcionando.

- [ ] **Step 5: Open the PR (não mergear)**

```bash
git push -u origin feat/whatsapp-go-server-registry
gh pr create --title "feat(whatsapp): Evolution Go server registry" --body-file <(printf '...')
```

---

## Self-Review (preenchido)

**1. Spec coverage:**
- §4 modelo de dados → Task 4 (migração) + Task 1 (tipos).
- §5 segredos → Task 1 (key-ref engine) + Task 6 (escrita no Vault).
- §6 provider → Tasks 2/3.
- §7 wizard → Task 5.
- §8 edges → Task 7 (+ Task 8 touchpoint).
- §9 tela de Chaves → Task 6.
- §10 erros → Task 3 (FK 23503), Task 5 (sem servidor), Task 7 (resolver).
- §11 testes → Tasks 1/2/6.
- §12 cutover → Task 9.
- §13 arquivos → File Structure.
- §14 riscos → Task 7 Step 4 (conflito #177), Task 8 (touchpoint), Global Constraints (espelho de migração).

**2. Placeholder scan:** nenhum "TBD/TODO". Os pontos "confirme o predicado/caminho" são verificações pontuais contra o código real (não placeholders de implementação), com o comando de verificação ao lado.

**3. Type consistency:** `IWhatsAppGoServer`/`goServerId` (Task 1) usados consistentemente em contrato (Task 2), impls (Tasks 2/3), wizard (Task 5) e edge row (Task 7). `apiKeyRef` (camelCase) ↔ `api_key_ref` (coluna) mapeado em `rowToGoServer`. `ICreateGoServerInput`/`IGoServerPatch` idênticos entre contrato e impls.

**Decisões herdadas que o implementador deve respeitar:**
- Provider é **table-only**; a escrita/rotação de segredo é da **tela** (Task 6).
- `resolveGoServer` vive no `whatsapp-connect/` (NÃO em `_shared/` espelhado).
- Corte seco: contas Go não emitem mais grupo `_API_KEY` (Task 6 Step 1).
