# WhatsApp Delete-Instance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir excluir uma instância/conta de WhatsApp (teardown no Evolution + remoção da linha), guardada para só excluir instâncias vazias (0 conversas e 0 templates).

**Architecture:** Segue a família das operações Evolution já existentes — client API `whatsappConnect.ts` + Edge Function `whatsapp-connect` (não o provider de dados). A camada runtime-agnostic `src/providers/whatsapp/evolution/instance.ts` ganha `deleteInstance`; a Edge ganha a ação `delete` (com `dryRun` para preflight); a UI ganha um kebab `⋮` + `DeleteInstanceDialog`. Sem migration (a policy RLS de DELETE já existe; o DELETE da linha é feito pelo `service_role` após o gate `requireCaller` + checagem de loja).

**Tech Stack:** React 19, TypeScript strict, Tailwind v4 + shadcn/ui (AlertDialog, DropdownMenu), Vitest, Supabase Edge (Deno), Evolution API v2.

## Global Constraints

- **Comentários em inglês; UI/conteúdo em pt-BR com acentos corretos** (UTF-8). (CLAUDE.md)
- **Apenas tokens semânticos** no estilo (`bg-background`, `text-foreground`, `text-destructive`, `border-severity-*/40 bg-severity-*/10 text-severity-*`). Nunca hex/`--gallo-*`. (docs/dev/ux-guidelines.md)
- **Mudou `src/providers/whatsapp/` ⇒ rodar `bun run scripts/sync-whatsapp-shared.ts`** (atualiza o espelho `_shared/whatsapp/`) + redeploy. (CLAUDE.md)
- Gates: `bun run test` + `bun run build`. `tsc` tem baseline — avaliar só o delta.
- Conventional Commits em inglês, atômicos.
- **Escopo A:** bloquear exclusão se houver histórico; sem soft-delete; sem exclusão forçada.

---

## File Structure

- `src/providers/whatsapp/evolution/instance.ts` — **modify**: add `deleteInstance`.
- `src/providers/whatsapp/evolution/instance.test.ts` — **modify**: add `deleteInstance` test.
- `supabase/functions/_shared/whatsapp/evolution/instance.ts` — **generated** by sync (do not hand-edit).
- `supabase/functions/whatsapp-connect/index.ts` — **modify**: `delete` action (preflight + execute).
- `src/features/admin-settings/api/whatsappConnect.ts` — **modify**: `IDeletePreflight`, `preflightDeleteEvolution`, `deleteEvolutionInstance`, `HAS_LINKED_DATA` code+copy.
- `src/features/admin-settings/api/whatsappConnect.test.ts` — **create**: error-copy mapping test (co-located).
- `src/features/admin-settings/components/DeleteInstanceDialog.tsx` — **create**: page-level dialog (preflight → deletable/blocked branch).
- `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx` — **modify**: kebab `⋮` in the card header, `deleteTarget` state, render `<DeleteInstanceDialog>`.

---

## Task 1: Evolution `deleteInstance` (runtime-agnostic layer)

**Files:**
- Modify: `src/providers/whatsapp/evolution/instance.ts` (after `logoutInstance`, ~line 157)
- Test: `src/providers/whatsapp/evolution/instance.test.ts` (in the `describe("logout / restart / webhook")` block, ~line 195)

**Interfaces:**
- Consumes: `evolutionRequest`, `IEngineDeps`, `IEvolutionInstanceTarget` (already in the file).
- Produces: `deleteInstance(apiKey: string, deps: IEngineDeps, target: IEvolutionInstanceTarget, traceId?: string): Promise<void>` — issues `DELETE /instance/delete/{instanceName}`.

- [ ] **Step 1: Write the failing test** — add inside `describe("logout / restart / webhook", ...)`:

```ts
it("deleteInstance issues DELETE on the delete path", async () => {
  const { deps, calls } = makeDeps(200, { status: "SUCCESS" });
  await deleteInstance("key", deps, TARGET);
  expect(calls[0]!.url).toBe("https://evo.test/instance/delete/inst1");
  expect(calls[0]!.init.method).toBe("DELETE");
});
```

Also add `deleteInstance` to the import list at the top of the test file (the `from "./instance"` block).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/providers/whatsapp/evolution/instance.test.ts`
Expected: FAIL — `deleteInstance is not a function` / import error.

- [ ] **Step 3: Write minimal implementation** — in `instance.ts`, right after `logoutInstance` (after line 157):

```ts
/** DELETE /instance/delete — removes the instance from the Evolution server. */
export async function deleteInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/delete/${target.instanceName}`,
    method: "DELETE",
    traceId,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/providers/whatsapp/evolution/instance.test.ts`
Expected: PASS (all existing + the new test).

- [ ] **Step 5: Sync the shared mirror**

Run: `bun run scripts/sync-whatsapp-shared.ts`
Expected: `synced N files → supabase/functions/_shared/whatsapp/` — confirm `supabase/functions/_shared/whatsapp/evolution/instance.ts` now contains `deleteInstance`.

- [ ] **Step 6: Commit**

```bash
git add src/providers/whatsapp/evolution/instance.ts src/providers/whatsapp/evolution/instance.test.ts supabase/functions/_shared/whatsapp/
git commit -m "feat(whatsapp): add Evolution deleteInstance + sync shared mirror"
```

---

## Task 2: Edge `whatsapp-connect` — `delete` action (preflight + execute)

**Files:**
- Modify: `supabase/functions/whatsapp-connect/index.ts`

**Interfaces:**
- Consumes: `deleteInstance`, `logoutInstance` (from `_shared/whatsapp/evolution/instance.ts`), `EVOLUTION_SECRET_SUFFIXES`, `WhatsAppProviderError`, `bestEffortAudit`, `requireCaller`, `STAFF_ROLES`, `makeEngineDeps`, `resolveActorSellerId` (all already imported/defined).
- Produces: HTTP action `delete`:
  - `{ accountId, action: "delete", dryRun: true }` → `200 { deletable, conversationCount, templateCount, failoverDependents: [{id,label}], traceId }`.
  - `{ accountId, action: "delete" }` → on success `200 { ok: true, traceId }`; if not deletable `422 { error, code: "HAS_LINKED_DATA", conversationCount, templateCount, traceId }`.

- [ ] **Step 1: Verify the linking column types (read-only)** — confirm the `.eq(...)` filters won't hit a type mismatch.

Use the supabase MCP `execute_sql` (read-only, no confirmation needed):

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'conversations' and column_name = 'whatsapp_account_id')
    or (table_name = 'message_templates' and column_name = 'whatsapp_account_id')
    or (table_name = 'whatsapp_accounts' and column_name = 'id'));
```

Expected: note the types. `whatsapp_accounts.id` is `text`. If a referencing column is `uuid`, the `.eq("whatsapp_account_id", account.id)` still works because prod account ids are uuid-shaped strings; if it is `text`, also fine. (No code change — this step de-risks the count queries.)

- [ ] **Step 2: Add `delete` to the action surface** — edit the header/types.

Update the doc comment input (lines 8-10) to mention `delete`. Then:

```ts
const ACTIONS = ["test", "qr", "state", "logout", "restart", "test-message", "delete"] as const;
```

Add `label` to the row interface (needed for the audit snapshot) — `IAccountRow`:

```ts
interface IAccountRow {
  id: string;
  store_id: string;
  label: string;
  provider: string;
  status: string;
  phone_number: string | null;
  credentials_ref: string;
  provider_config: Record<string, unknown> | null;
}
```

And import `deleteInstance` alongside the other instance imports (add to the `from "../_shared/whatsapp/evolution/instance.ts"` block):

```ts
  deleteInstance,
```

- [ ] **Step 3: Add the preflight helpers** — define above `servePost` (after `markDisconnected`, ~line 158):

```ts
interface IFailoverDependent {
  id: string;
  label: string;
}

/** Counts the rows that would FK-block a hard delete (the escopo-A guard). */
async function countLinkedData(
  admin: SupabaseClient,
  accountId: string,
): Promise<{ conversationCount: number; templateCount: number }> {
  const [conv, tpl] = await Promise.all([
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_account_id", accountId),
    admin
      .from("message_templates")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_account_id", accountId),
  ]);
  return { conversationCount: conv.count ?? 0, templateCount: tpl.count ?? 0 };
}

/** Other accounts that fail over TO this one (their failover breaks on delete). */
async function findFailoverDependents(
  admin: SupabaseClient,
  accountId: string,
): Promise<IFailoverDependent[]> {
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("id, label")
    .eq("failover_account_id", accountId);
  return (data ?? []).map((r) => ({ id: r.id as string, label: r.label as string }));
}
```

- [ ] **Step 4: Add `label` to the row select** — at line 173, change the select string to include `label`:

```ts
    .select("id, store_id, label, provider, status, phone_number, credentials_ref, provider_config")
```

- [ ] **Step 5: Reorder so `delete` runs before the Evolution-only guards** — the existing guards (provider!==evolution, config, apikey) must NOT block delete (a misconfigured Evolution account, or a Meta account, must still be deletable). 

Move the store-ownership check, `makeEngineDeps`, and `resolveActorSellerId` up so they run for `delete` too, then insert the delete handler BEFORE the `if (account.provider !== "evolution")` guard.

Replace the block from line 180 (`if (account.provider !== "evolution") {`) down to line 219 (`const actorId = await resolveActorSellerId(admin, callerId);`) with this order:

```ts
  // Owner is cross-store; managers only manage their own store's accounts.
  if (caller.role !== "owner" && caller.store_id !== account.store_id) {
    throw new HttpError(403, "forbidden: account belongs to another store");
  }

  const deps = makeEngineDeps(admin, ctx.traceId);
  const actorId = await resolveActorSellerId(admin, callerId);

  // DELETE — runs before the Evolution-specific guards so a misconfigured
  // Evolution account (or a Meta account, which has no Evolution side) is still
  // deletable. Guarded (escopo A): only empty instances (0 conversas/templates).
  if (action === "delete") {
    const { conversationCount, templateCount } = await countLinkedData(admin, account.id);
    const failoverDependents = await findFailoverDependents(admin, account.id);
    const deletable = conversationCount === 0 && templateCount === 0;

    if (body.dryRun === true) {
      return json(
        { deletable, conversationCount, templateCount, failoverDependents, traceId: ctx.traceId },
        200,
      );
    }
    if (!deletable) {
      // Race-safe re-check: something linked arrived after the UI preflight.
      return json(
        {
          error: "Esta instância tem dados vinculados e não pode ser excluída.",
          code: "HAS_LINKED_DATA",
          conversationCount,
          templateCount,
          traceId: ctx.traceId,
        },
        422,
      );
    }

    // 1. Disable failover on dependents FIRST — the CHECK
    // whatsapp_accounts_failover_policy_requires_target would otherwise reject
    // the ON DELETE SET NULL that fires on their failover_account_id.
    if (failoverDependents.length > 0) {
      await admin
        .from("whatsapp_accounts")
        .update({ failover_policy: "disabled", failover_account_id: null, is_failover_active: false })
        .eq("failover_account_id", account.id);
    }

    // 2. Evolution teardown (best-effort; Evolution accounts with config+apikey).
    if (account.provider === "evolution") {
      const cfg = account.provider_config ?? {};
      const teardownTarget: IEvolutionInstanceTarget = {
        baseUrl: String(cfg.baseUrl ?? ""),
        instanceName: String(cfg.instanceName ?? ""),
      };
      if (teardownTarget.baseUrl && teardownTarget.instanceName) {
        const apiKey = await deps.resolveSecret(
          `${account.credentials_ref}${EVOLUTION_SECRET_SUFFIXES.apiKey}`,
        );
        if (apiKey) {
          try {
            await logoutInstance(apiKey, deps, teardownTarget, ctx.traceId);
          } catch (_err) {
            // Logout is best-effort: an already-unpaired instance errors here.
          }
          try {
            await deleteInstance(apiKey, deps, teardownTarget, ctx.traceId);
          } catch (err) {
            // Already gone (404/not-found) → proceed to drop the row. Any other
            // server error → abort, so we never orphan a live Evolution instance.
            const msg = err instanceof Error ? err.message.toLowerCase() : "";
            const isGone =
              (err instanceof WhatsAppProviderError && err.httpStatus === 404) ||
              msg.includes("does not exist") ||
              msg.includes("not found");
            if (!isGone) throw err;
          }
        }
      }
    }

    // 3. Delete the row (service_role: access_rules cascade; self failover SET NULL).
    const { error: delError } = await admin
      .from("whatsapp_accounts")
      .delete()
      .eq("id", account.id);
    if (delError) throw new HttpError(500, `Falha ao excluir a conta: ${delError.message}`);

    // 4. Audit (snapshot in `before` — most audit-worthy action on this screen).
    if (actorId) {
      await bestEffortAudit(admin, {
        store_id: account.store_id,
        actor_id: actorId,
        action: "whatsapp_account_deleted",
        resource: "whatsapp_account",
        resource_id: account.id,
        before: {
          label: account.label,
          provider: account.provider,
          instanceName: (account.provider_config ?? {}).instanceName ?? null,
          phoneNumber: account.phone_number,
        },
      });
    }
    return json({ ok: true, traceId: ctx.traceId }, 200);
  }

  if (account.provider !== "evolution") {
    throw new HttpError(422, "Conexão por QR é exclusiva de contas Evolution");
  }
```

Then, below this, KEEP the existing config check (lines 188-202) and apikey resolution (lines 205-217), but **delete the now-duplicated** `const deps = makeEngineDeps(...)` (line 204) and `const actorId = await resolveActorSellerId(...)` (line 219) — they were moved up. The `const apiKey = await deps.resolveSecret(...)` block stays for the other actions.

- [ ] **Step 6: Add `dryRun` to the body type** — at line 162:

```ts
  const body = (await parseJsonBody(req)) as {
    accountId?: string;
    action?: string;
    to?: string;
    dryRun?: boolean;
  };
```

- [ ] **Step 7: Type-check the edge file mentally + the app build**

Run: `bun run build`
Expected: build OK (Vite doesn't compile the Deno edge, but ensures the app still builds). Visually re-read the edge `switch` to confirm `delete` is handled before the guard and `deps`/`actorId` are declared exactly once.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/whatsapp-connect/index.ts
git commit -m "feat(whatsapp-connect): add guarded delete action (preflight + teardown)"
```

---

## Task 3: Client API — preflight + delete + error copy

**Files:**
- Modify: `src/features/admin-settings/api/whatsappConnect.ts`
- Test: `src/features/admin-settings/api/whatsappConnect.test.ts` (create)

**Interfaces:**
- Consumes: `invokeConnect`, `isMock`, `EvolutionConnectError`, `connectErrorMessage` (already in file).
- Produces:
  - `interface IDeletePreflight { deletable: boolean; conversationCount: number; templateCount: number; failoverDependents: Array<{ id: string; label: string }> }`
  - `preflightDeleteEvolution(accountId: string): Promise<IDeletePreflight>`
  - `deleteEvolutionInstance(accountId: string): Promise<void>` (throws `EvolutionConnectError` with code `HAS_LINKED_DATA` on the race path).

- [ ] **Step 1: Write the failing test** — create `src/features/admin-settings/api/whatsappConnect.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CONNECT_ERROR_MESSAGES,
  EvolutionConnectError,
  connectErrorMessage,
} from "./whatsappConnect";

describe("connectErrorMessage — HAS_LINKED_DATA", () => {
  it("maps HAS_LINKED_DATA to its pt-BR copy", () => {
    const err = new EvolutionConnectError("x", "HAS_LINKED_DATA");
    expect(connectErrorMessage(err)).toBe(CONNECT_ERROR_MESSAGES.HAS_LINKED_DATA);
  });

  it("HAS_LINKED_DATA copy mentions histórico/conversas", () => {
    expect(CONNECT_ERROR_MESSAGES.HAS_LINKED_DATA).toMatch(/vinculad|conversa|hist/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/features/admin-settings/api/whatsappConnect.test.ts`
Expected: FAIL — `HAS_LINKED_DATA` is not assignable / `CONNECT_ERROR_MESSAGES.HAS_LINKED_DATA` is undefined.

- [ ] **Step 3: Extend the error code union + copy** — in `whatsappConnect.ts`:

Add `"HAS_LINKED_DATA"` to `EvolutionConnectErrorCode` (line 33-40):

```ts
export type EvolutionConnectErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "MISSING_API_KEY"
  | "CONFIG_MISSING"
  | "PROVIDER_DISCONNECTED"
  | "VALIDATION_ERROR"
  | "INTEGRATION_ERROR"
  | "HAS_LINKED_DATA";
```

Add to `CONNECT_ERROR_MESSAGES` (inside the object, after `VALIDATION_ERROR`):

```ts
  HAS_LINKED_DATA:
    "A instância recebeu novos dados e não pode mais ser excluída. Atualizamos a lista.",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/features/admin-settings/api/whatsappConnect.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the preflight + delete functions** — append to the Public API section (after `sendEvolutionTestMessage`, ~line 229):

```ts
export interface IDeletePreflight {
  deletable: boolean;
  conversationCount: number;
  templateCount: number;
  failoverDependents: Array<{ id: string; label: string }>;
}

/** Server preflight: can this instance be deleted, and what links/deps exist. */
export async function preflightDeleteEvolution(accountId: string): Promise<IDeletePreflight> {
  if (isMock()) {
    return { deletable: true, conversationCount: 0, templateCount: 0, failoverDependents: [] };
  }
  return invokeConnect<IDeletePreflight>({ accountId, action: "delete", dryRun: true });
}

/** Deletes the instance (Evolution teardown + account row). Guarded server-side. */
export async function deleteEvolutionInstance(accountId: string): Promise<void> {
  if (isMock()) return;
  await invokeConnect<{ ok: boolean }>({ accountId, action: "delete" });
}
```

- [ ] **Step 6: Allow `dryRun` in the invoke body type** — update `invokeConnect`'s body param (line 164-168):

```ts
async function invokeConnect<T>(body: {
  accountId: string;
  action: string;
  to?: string;
  dryRun?: boolean;
}): Promise<T> {
```

- [ ] **Step 7: Run the full suite + build**

Run: `bun run test src/features/admin-settings/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/features/admin-settings/api/whatsappConnect.ts src/features/admin-settings/api/whatsappConnect.test.ts
git commit -m "feat(whatsapp): client API for delete preflight + delete"
```

---

## Task 4: UI — kebab menu + `DeleteInstanceDialog`

**Files:**
- Create: `src/features/admin-settings/components/DeleteInstanceDialog.tsx`
- Modify: `src/features/admin-settings/pages/WhatsAppAccountsPage.tsx`

**Interfaces:**
- Consumes: `preflightDeleteEvolution`, `deleteEvolutionInstance`, `connectErrorMessage`, `IDeletePreflight` (Task 3); `IWhatsAppAccount`; shadcn `AlertDialog`, `DropdownMenu`; `toast`; `Icon`.
- Produces: `<DeleteInstanceDialog account onClose onDeleted onDisconnect />` and a kebab trigger in the card header.

- [ ] **Step 1: Create the dialog component** — `src/features/admin-settings/components/DeleteInstanceDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/Icon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { IWhatsAppAccount } from "@/shared/types";
import {
  connectErrorMessage,
  deleteEvolutionInstance,
  preflightDeleteEvolution,
  type IDeletePreflight,
} from "../api/whatsappConnect";

const PROVIDER_LABEL: Record<IWhatsAppAccount["provider"], string> = {
  evolution: "Evolution API",
  meta: "Meta Cloud API",
};

interface IDeleteInstanceDialogProps {
  account: IWhatsAppAccount | null;
  onClose: () => void;
  onDeleted: () => void;
  /** Opens the connection/disconnect flow for a blocked instance. */
  onDisconnect: (account: IWhatsAppAccount) => void;
}

export function DeleteInstanceDialog({
  account,
  onClose,
  onDeleted,
  onDisconnect,
}: IDeleteInstanceDialogProps) {
  const [preflight, setPreflight] = useState<IDeletePreflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!account) {
      setPreflight(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPreflight(null);
    preflightDeleteEvolution(account.id)
      .then((result) => {
        if (!cancelled) setPreflight(result);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(connectErrorMessage(err));
        onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [account, onClose]);

  if (!account) return null;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteEvolutionInstance(account.id);
      toast.success(`Instância "${account.label}" excluída.`);
      onDeleted();
      onClose();
    } catch (err) {
      // Race: linked data arrived after preflight → refresh + close (retry is futile).
      const code = (err as { code?: string }).code;
      if (code === "HAS_LINKED_DATA") {
        toast.error(connectErrorMessage(err));
        onDeleted();
        onClose();
      } else {
        toast.error("Não foi possível excluir a instância. Tente novamente.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const blocked = preflight !== null && !preflight.deletable;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !deleting) onClose();
      }}
    >
      <AlertDialogContent>
        {loading || !preflight ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ) : blocked ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Esta instância não pode ser excluída</AlertDialogTitle>
              <AlertDialogDescription>
                A instância "{account.label}" tem dados vinculados. A exclusão só é permitida em
                instâncias vazias (de teste). Para parar de enviar e receber por este número sem
                perder o histórico, use Desconectar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-1.5 rounded-md border border-severity-warning/40 bg-severity-warning/10 p-3 text-sm text-severity-warning">
              {preflight.conversationCount > 0 && (
                <p className="flex items-center gap-2">
                  <Icon icon="mdi:message-text-outline" size={15} />
                  {preflight.conversationCount}{" "}
                  {preflight.conversationCount === 1 ? "conversa vinculada" : "conversas vinculadas"}
                </p>
              )}
              {preflight.templateCount > 0 && (
                <p className="flex items-center gap-2">
                  <Icon icon="mdi:file-document-outline" size={15} />
                  {preflight.templateCount}{" "}
                  {preflight.templateCount === 1 ? "template de mensagem" : "templates de mensagem"}
                </p>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Fechar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const target = account;
                  onClose();
                  onDisconnect(target);
                }}
              >
                <Icon icon="mdi:logout-variant" size={15} className="mr-1.5" />
                Desconectar
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a instância "{account.label}"?</AlertDialogTitle>
              <AlertDialogDescription>
                {account.phoneNumber} · {PROVIDER_LABEL[account.provider]}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 text-sm">
              <ul className="space-y-1.5 text-muted-foreground">
                {account.provider === "evolution" && (
                  <li className="flex items-start gap-2">
                    <Icon icon="mdi:server-off" size={15} className="mt-0.5 shrink-0" />
                    <span>
                      A instância no servidor Evolution
                      {account.providerConfig?.instanceName
                        ? ` (${account.providerConfig.instanceName})`
                        : ""}{" "}
                      será desconectada e apagada.
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <Icon icon="mdi:card-account-details-outline" size={15} className="mt-0.5 shrink-0" />
                  <span>O cadastro da conta nesta tela será excluído.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Icon icon="mdi:cog-outline" size={15} className="mt-0.5 shrink-0" />
                  <span>As configurações de acesso, cor e failover desta instância.</span>
                </li>
              </ul>

              <p className="text-xs text-muted-foreground">
                Conversas vinculadas: {preflight.conversationCount} · Templates:{" "}
                {preflight.templateCount}
              </p>

              {preflight.failoverDependents.length > 0 && (
                <div className="rounded-md border border-severity-warning/40 bg-severity-warning/10 p-3 text-severity-warning">
                  <p className="flex items-center gap-2 font-medium">
                    <Icon icon="mdi:swap-horizontal" size={15} />
                    Outra(s) conta(s) usam esta como reserva de failover:
                  </p>
                  <ul className="mt-1 list-disc pl-6">
                    {preflight.failoverDependents.map((d) => (
                      <li key={d.id}>{d.label}</li>
                    ))}
                  </ul>
                  <p className="mt-1">Ao excluir, o failover será desativado nessas contas.</p>
                </div>
              )}

              <p className="font-medium text-destructive">
                Esta ação é permanente e não pode ser desfeita.
              </p>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault(); // keep the dialog open while deleting / on error
                  void handleDelete();
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                <Icon
                  icon={deleting ? "mdi:loading" : "mdi:trash-can-outline"}
                  size={15}
                  className={`mr-1.5 ${deleting ? "animate-spin" : ""}`}
                />
                {deleting ? "Excluindo…" : "Excluir instância"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 2: Verify `AlertDialog` exports** — confirm `src/components/ui/alert-dialog.tsx` exports `AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle`. If any name differs, adjust the import. (shadcn new-york exports these by default.)

Run: `bun run build`
Expected: build resolves the new component's imports.

- [ ] **Step 3: Wire the page — imports** — in `WhatsAppAccountsPage.tsx`, add to the imports:

```ts
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteInstanceDialog } from "../components/DeleteInstanceDialog";
```

- [ ] **Step 4: Wire the page — state** — add next to the other target states (~line 207):

```ts
  const [deleteTarget, setDeleteTarget] = useState<IWhatsAppAccount | null>(null);
```

- [ ] **Step 5: Wire the page — kebab in the card header** — inside the badges flex container (the `<div className="flex flex-wrap items-center gap-2">` at line 505), append the kebab AFTER the failover badge block (after line 535, still inside that div), gated to `!isMock`:

```tsx
                    {!isMock && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            aria-label="Mais ações"
                            title="Mais ações"
                          >
                            <Icon icon="mdi:dots-vertical" size={18} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => setDeleteTarget(account)}
                            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                          >
                            <Icon icon="mdi:trash-can-outline" size={15} className="mr-2" />
                            Excluir instância
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
```

- [ ] **Step 6: Wire the page — render the dialog** — next to the other page-level dialogs (after `<SyncAvatarsDialog ... />` at line 990):

```tsx
      <DeleteInstanceDialog
        account={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => void refresh()}
        onDisconnect={(account) => openConnect(account)}
      />
```

- [ ] **Step 7: Build + lint**

Run: `bun run build && bun run lint`
Expected: build OK; lint clean for the touched files (no `no-restricted-imports` violations — the component imports only from `../api/whatsappConnect`, `@/components/ui/*`, `@/shared/types`).

- [ ] **Step 8: Commit**

```bash
git add src/features/admin-settings/components/DeleteInstanceDialog.tsx src/features/admin-settings/pages/WhatsAppAccountsPage.tsx
git commit -m "feat(whatsapp): delete-instance kebab + confirmation dialog"
```

---

## Task 5: Full gate + push

- [ ] **Step 1: Run the whole suite**

Run: `bun run test`
Expected: all green (new tests included).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: success.

- [ ] **Step 3: Delta type-check (new files only)**

Run: `bunx tsc --noEmit` and confirm NO NEW errors in `DeleteInstanceDialog.tsx` / `whatsappConnect.ts` / `instance.ts` (baseline pre-existing errors elsewhere are expected).

- [ ] **Step 4: Push the branch + open the PR (no merge)**

```bash
git push -u origin feat/whatsapp-delete-instance
```
Then open a PR with `gh pr create` summarizing the feature, the no-migration note, and the **pending owner step: redeploy the `whatsapp-connect` Edge Function in prod**.

---

## Self-Review

- **Spec coverage:** kebab placement ✓ (Task 4 S5); simple AlertDialog ✓ (Task 4 S1); blocked dialog + Desconectar CTA ✓; failover warning ✓; server-side guard + race re-check ✓ (Task 2 S5); failover-dependent reconcile before delete ✓ (Task 2 S5 step 1); Evolution teardown ordered logout→delete, 404-tolerant ✓; audit ✓; no migration ✓; tests ✓ (Tasks 1, 3); gates ✓ (Task 5).
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `IDeletePreflight` shape identical in edge response (Task 2), client (Task 3), dialog (Task 4); `HAS_LINKED_DATA` code consistent across edge/client/dialog; `deleteInstance` signature consistent (Task 1 → Task 2 import).
- **Deploy gate:** Edge redeploy to prod is a SEPARATE owner-approved step (not in this plan's commands).
