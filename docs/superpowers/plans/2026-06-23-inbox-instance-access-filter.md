# Filtro de instâncias da Inbox por acesso do usuário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o filtro "Instância" da Inbox e a escolha de número outbound listarem apenas as instâncias de WhatsApp às quais o usuário atual tem acesso (não-staff: as com regra; staff: todas).

**Architecture:** Frontend consome o RPC `current_seller_accessible_account_ids()` (SECURITY DEFINER, já executável por `authenticated`) via novo método de provider `listAccessibleAccountIds()`. O `InboxPage` mantém `accounts` (todas, para resolver labels) e deriva `accessibleAccounts` por interseção com os IDs acessíveis, alimentando o filtro e o `NewConversationDialog`. Zero migration.

**Tech Stack:** React 19, TanStack Router, TypeScript strict, Vitest, Supabase JS, Provider Pattern (`@/providers/data`).

## Global Constraints

- TypeScript `strict: true`; evitar `any`; interfaces de domínio prefixadas com `I`.
- Features acessam dados **só** via `@/providers/data` (Provider Pattern). Contrato → mock → supabase.
- Comentários em inglês; UI/strings em pt-BR com acentos.
- Commits Conventional Commits em inglês; rodapé `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Gate de CI: `bun run build` + `bun run test` verdes. `bunx tsc --noEmit` sem **novos** erros (baseline pré-existente; avaliar por delta).
- **NÃO** alterar RLS, migrations, Edge Functions ou o webhook server-side. Mudança é 100% frontend.
- Helper puro testável em `engine/`/`utils/` co-localizado (`*.test.ts`).

---

### Task 1: Helper puro `selectAccessibleAccounts`

**Files:**
- Create: `src/features/conversations/utils/selectAccessibleAccounts.ts`
- Test: `src/features/conversations/utils/selectAccessibleAccounts.test.ts`

**Interfaces:**
- Consumes: `IWhatsAppAccount`, `ID` de `@/shared/types`.
- Produces: `selectAccessibleAccounts(accounts: IWhatsAppAccount[], accessibleIds: Set<ID> | null): IWhatsAppAccount[]` — interseção; `null` (carregando) → `[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/conversations/utils/selectAccessibleAccounts.test.ts
import { describe, expect, it } from "vitest";
import type { ID, IWhatsAppAccount } from "@/shared/types";
import { selectAccessibleAccounts } from "./selectAccessibleAccounts";

function acc(id: string): IWhatsAppAccount {
  // Only `id` matters for this pure intersection helper; the rest is filler
  // so the fixture satisfies the type without coupling the test to the shape.
  return {
    id,
    storeId: "s1",
    label: id,
    phoneNumber: "+550000000000",
    provider: "evolution",
    credentialsRef: "ref",
    status: "connected",
    capabilities: {} as IWhatsAppAccount["capabilities"],
    currentState: "healthy",
    failoverPolicy: "disabled",
    isFailoverActive: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    purpose: "atendimento",
  };
}

describe("selectAccessibleAccounts", () => {
  const all = [acc("a"), acc("b"), acc("c")];

  it("returns [] while access ids are still loading (null)", () => {
    expect(selectAccessibleAccounts(all, null)).toEqual([]);
  });

  it("returns only accounts whose id is accessible (non-staff subset)", () => {
    const result = selectAccessibleAccounts(all, new Set<ID>(["a", "c"]));
    expect(result.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("returns all accounts when every id is accessible (staff)", () => {
    const result = selectAccessibleAccounts(all, new Set<ID>(["a", "b", "c"]));
    expect(result.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("returns [] when the accessible set is empty", () => {
    expect(selectAccessibleAccounts(all, new Set<ID>())).toEqual([]);
  });

  it("ignores accessible ids that are not present in accounts", () => {
    const result = selectAccessibleAccounts(all, new Set<ID>(["a", "zzz"]));
    expect(result.map((a) => a.id)).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/conversations/utils/selectAccessibleAccounts.test.ts`
Expected: FAIL — `Failed to resolve import "./selectAccessibleAccounts"` / `selectAccessibleAccounts is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/conversations/utils/selectAccessibleAccounts.ts
import type { ID, IWhatsAppAccount } from "@/shared/types";

/**
 * Subset of `accounts` whose id is in `accessibleIds`.
 *
 * `accessibleIds === null` means the accessible set is still loading — return
 * `[]` so the instance filter never shows unauthorized instances, not even for
 * a frame. The caller keeps the full `accounts` list elsewhere (e.g. to resolve
 * the origin label/color of wallet conversations from instances the user cannot
 * staff). This is a UX gate, not a security boundary: conversation access itself
 * is enforced in the database (`can_access_conversation`).
 */
export function selectAccessibleAccounts(
  accounts: IWhatsAppAccount[],
  accessibleIds: Set<ID> | null,
): IWhatsAppAccount[] {
  if (accessibleIds === null) return [];
  return accounts.filter((a) => accessibleIds.has(a.id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/conversations/utils/selectAccessibleAccounts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/utils/selectAccessibleAccounts.ts src/features/conversations/utils/selectAccessibleAccounts.test.ts
git commit -m "feat(conversations): add selectAccessibleAccounts pure helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Método `listAccessibleAccountIds` no contrato + mock + supabase

**Files:**
- Modify: `src/providers/data/contracts/whatsappAccounts.ts` (interface `IWhatsAppAccountsProvider`)
- Modify: `src/mocks/api/whatsappAccounts.ts` (objeto `whatsappAccountsApi`)
- Modify: `src/providers/data/impl/mock/whatsappAccounts.ts` (objeto `mockWhatsAppAccountsProvider`)
- Modify: `src/providers/data/impl/supabase/whatsappAccounts.ts` (objeto `supabaseWhatsAppAccountsProvider`)

**Interfaces:**
- Produces: `IWhatsAppAccountsProvider.listAccessibleAccountIds(): Promise<ID[]>` (usado pela Task 3).
- Consumes: `getSupabaseClient()` (já importado no supabase impl); `selectAllWhatsAppAccounts` (já importado no mock api); `runApi` (já importado no mock api).

- [ ] **Step 1: Adicionar o método ao contrato**

Em `src/providers/data/contracts/whatsappAccounts.ts`, dentro de `interface IWhatsAppAccountsProvider`, logo após a linha `get(id: ID): Promise<IWhatsAppAccount>;`:

```ts
  /**
   * IDs das contas WhatsApp que o usuário atual pode OPERAR (atendimento).
   * - Supabase: resolvido pelo JWT via RPC `current_seller_accessible_account_ids`
   *   (mesma fonte de verdade de `can_access_conversation`). Staff → todas as
   *   contas da loja; não-staff → só as com regra em `whatsapp_account_access_rules`.
   * - Mock: o modo demonstração NÃO modela o gate → retorna todas (a interseção
   *   no consumidor preserva o comportamento atual).
   */
  listAccessibleAccountIds(): Promise<ID[]>;
```

- [ ] **Step 2: Implementar no mock api**

Em `src/mocks/api/whatsappAccounts.ts`, dentro de `whatsappAccountsApi`, após o método `list` (antes de `get`):

```ts
  listAccessibleAccountIds(): Promise<ID[]> {
    // Demo mode does not model per-instance access gating: every instance is
    // "accessible". The InboxPage intersects this with the store-scoped accounts
    // list, so the demo keeps showing exactly what it shows today.
    return runApi("whatsappAccountsApi", "listAccessibleAccountIds", () =>
      selectAllWhatsAppAccounts().map((a) => a.id),
    );
  },
```

- [ ] **Step 3: Delegar no provider mock**

Em `src/providers/data/impl/mock/whatsappAccounts.ts`, dentro de `mockWhatsAppAccountsProvider`, após `get: (id) => whatsappAccountsApi.get(id),`:

```ts
  listAccessibleAccountIds: () => whatsappAccountsApi.listAccessibleAccountIds(),
```

- [ ] **Step 4: Implementar no provider supabase**

Em `src/providers/data/impl/supabase/whatsappAccounts.ts`, dentro de `supabaseWhatsAppAccountsProvider`, após o método `list` (antes de `get`):

```ts
  async listAccessibleAccountIds(): Promise<ID[]> {
    // Reuse the existing SECURITY DEFINER helper (same source of truth as
    // can_access_conversation). It takes no args — the viewer comes from the JWT
    // (current_seller_id / current_app_role / current_store_id). EXECUTE is
    // already granted to `authenticated`, so no migration is needed.
    const { data, error } = await getSupabaseClient().rpc(
      "current_seller_accessible_account_ids",
    );
    if (error) {
      throw new Error(
        `[supabase] whatsappAccounts.listAccessibleAccountIds failed: ${error.message}`,
      );
    }
    // PostgREST may return a `setof uuid` either as a scalar array (string[]) or
    // as rows ([{ current_seller_accessible_account_ids: string }]). Tolerate both.
    return ((data ?? []) as unknown[]).map((row) =>
      typeof row === "string"
        ? row
        : (row as { current_seller_accessible_account_ids: string })
            .current_seller_accessible_account_ids,
    );
  },
```

- [ ] **Step 5: Type-check + build (gate do contrato)**

Run: `bunx tsc --noEmit 2>&1 | grep -E "whatsappAccounts|listAccessibleAccountIds" || echo "no new errors in touched files"`
Expected: `no new errors in touched files` (a interface ganhou o método e os 3 sites o implementam; se faltasse em algum impl, `tsc` apontaria aqui).

Run: `bun run build 2>&1 | tail -5`
Expected: build conclui sem erro.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/contracts/whatsappAccounts.ts src/mocks/api/whatsappAccounts.ts src/providers/data/impl/mock/whatsappAccounts.ts src/providers/data/impl/supabase/whatsappAccounts.ts
git commit -m "feat(providers): add listAccessibleAccountIds to whatsappAccounts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wiring no InboxPage (filtro + escolha de origem outbound)

**Files:**
- Modify: `src/features/conversations/pages/InboxPage.tsx`

**Interfaces:**
- Consumes: `selectAccessibleAccounts` (Task 1), `whatsappAccountsProvider.listAccessibleAccountIds()` (Task 2).
- Produces: nenhuma API nova (mudança de wiring interno da página).

- [ ] **Step 1: Importar o helper**

Em `src/features/conversations/pages/InboxPage.tsx`, junto aos imports relativos (após a linha que importa `NewConversationDialog`):

```ts
import { selectAccessibleAccounts } from "../utils/selectAccessibleAccounts";
```

- [ ] **Step 2: Carregar os IDs acessíveis e derivar `accessibleAccounts`**

Logo após o bloco `useMemo` que cria `accountsById` e as linhas `showOrigin`/`connectedAccounts` (atualmente linhas ~83–92), adicionar:

```tsx
  // Instances the current user may operate (PRD-011 multi-access). The instance
  // filter and the new-conversation origin picker must show only these — not the
  // full store-wide account list. `null` = still loading (no instances shown yet,
  // avoids flashing unauthorized instances). On error we fail closed (empty set).
  const [accessibleIds, setAccessibleIds] = useState<Set<ID> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void whatsappAccountsProvider
      .listAccessibleAccountIds()
      .then((ids) => {
        if (!cancelled) setAccessibleIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setAccessibleIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [whatsappAccountsProvider]);

  const accessibleAccounts = useMemo(
    () => selectAccessibleAccounts(accounts, accessibleIds),
    [accounts, accessibleIds],
  );
  const accessibleConnectedAccounts = useMemo(
    () => accessibleAccounts.filter((a) => a.status === "connected"),
    [accessibleAccounts],
  );
```

> Nota: manter o `connectedAccounts` existente (linha ~89) e `accountsById` (linha ~83) **inalterados** — `accountsById` precisa de TODAS as contas para resolver label/cor de conversas da carteira. `showOrigin` (baseado em `accounts`) também permanece.

- [ ] **Step 3: Apontar o filtro para `accessibleAccounts`**

Na renderização do `<InboxFilters ... />` (linha ~308), trocar:

```tsx
          instances={accounts}
```
por:
```tsx
          instances={accessibleAccounts}
```

- [ ] **Step 4: Apontar a origem outbound para as acessíveis**

Na renderização do `<NewConversationDialog ... />` (linha ~406–409), trocar:

```tsx
          accounts={connectedAccounts}
```
por:
```tsx
          accounts={accessibleConnectedAccounts}
```

- [ ] **Step 5: Verificar `connectedAccounts` órfão**

Run: `grep -n "connectedAccounts" src/features/conversations/pages/InboxPage.tsx`
Expected: se `connectedAccounts` (o original) não tiver mais nenhum uso além da definição, remover a definição (linhas ~89–92) para evitar variável não usada (o build/lint falharia com `no-unused-vars`). Se ainda houver outro uso, mantê-la.

- [ ] **Step 6: Build + testes**

Run: `bun run build 2>&1 | tail -5`
Expected: build conclui sem erro.

Run: `bun run test 2>&1 | tail -6`
Expected: todos os testes passam (1018 baseline + 5 novos do helper = 1023), 0 falhas.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/pages/InboxPage.tsx
git commit -m "fix(conversations): scope Inbox instance filter and outbound origin to accessible instances

Lucas (seller_internal) was seeing all 4 store instances in the 'Instância'
filter and could pick any as outbound origin. Now both are scoped to the
instances the user can operate, via listAccessibleAccountIds.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- Spec §3.1 (contrato) → Task 2 Step 1. ✓
- Spec §3.2 (supabase RPC) → Task 2 Step 4. ✓
- Spec §3.3 (mock) → Task 2 Steps 2–3. ✓
- Spec §3.4 (helper puro) → Task 1. ✓
- Spec §3.5 (InboxPage wiring: filtro + outbound + accountsById intacto) → Task 3. ✓
- Spec §6 (testes do helper, 5 casos) → Task 1 Step 1. ✓
- Spec "O que NÃO muda" (RLS/can_access/webhook/admin) → garantido por Global Constraints + Task 3 nota. ✓

**2. Placeholder scan:** Sem TBD/TODO; todo step de código tem o código completo. ✓

**3. Type consistency:** `listAccessibleAccountIds(): Promise<ID[]>` idêntico no contrato, mock api, mock provider e supabase provider. `selectAccessibleAccounts(IWhatsAppAccount[], Set<ID> | null)` idêntico entre Task 1 (def) e Task 3 (uso). `accessibleIds: Set<ID> | null`, `accessibleAccounts`, `accessibleConnectedAccounts` consistentes. ✓
