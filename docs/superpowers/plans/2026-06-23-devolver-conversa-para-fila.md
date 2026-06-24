# "Devolver para a fila" (desatribuir conversa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que owner/gestor devolva uma conversa atribuída de volta para a fila (pool), a partir da barra flutuante `QuickActions` e do menu kebab `ConversationMenu`.

**Architecture:** Engine puro decide quando mostrar a ação (`canReturnToQueue`). Um novo método de provider `unassign(id)` faz a desatribuição (mock limpa com `undefined`; Supabase grava `null` direto na tabela, autorizado pela RLS `is_staff()`). Um hook `useReturnToQueue` orquestra ação + toast com Desfazer + auditoria, consumido pelos dois componentes (DRY).

**Tech Stack:** React 19, TypeScript strict, Vitest (node env), TanStack Query, shadcn/ui, Iconify, sonner, Supabase JS.

## Global Constraints

- **Frontend-only:** sem migration, sem RLS nova, sem RPC nova, sem redeploy de Edge.
- **Staff-only:** a ação aparece e funciona apenas para `usePermission("conversation", "edit", "store")`. NÃO reaproveitar `canTransferOrArchive`/`canManageThis` (mais amplos) — usar `canReturnToQueue`.
- **Não tocar** no cache de mensagens/mídias/realtime (signing em lote, query keys, RPC gated-once).
- **Sem novas dependências** (`bunfig.toml` impõe guard de 24h).
- **Comentários em inglês; UI/strings em pt-BR** com acentuação correta.
- **Tokens semânticos** apenas — usar `text-severity-warning` / `hover:bg-severity-warning/10` (reversível ⇒ warning, não critical). Nunca cor crua (`amber`, hex).
- **Vitest roda em `environment: "node"`** — sem jsdom/testing-library. NÃO criar testes de componente/hook. TDD só no engine puro.
- **Gate de CI prático:** `bun run build` + `bun run test`. Type-check por delta com `bunx tsc --noEmit` (há baseline de erros pré-existentes).

---

### Task 1: Engine — `canReturnToQueue`

**Files:**
- Modify: `src/features/conversations/engine/assignmentGate.ts`
- Test: `src/features/conversations/engine/assignmentGate.test.ts`

**Interfaces:**
- Consumes: `IConversation` (`@/shared/types`), já importado no arquivo.
- Produces: `canReturnToQueue(conversation: Pick<IConversation, "assignedSellerId">, ctx: { isStaff: boolean }): boolean`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/conversations/engine/assignmentGate.test.ts` (inside the file, after the existing `describe` block — add the import to the existing top import):

Change the top import line:
```ts
import { mustAssignToReply } from "./assignmentGate";
```
to:
```ts
import { mustAssignToReply, canReturnToQueue } from "./assignmentGate";
```

Then append this new describe block at the end of the file:
```ts
describe("canReturnToQueue", () => {
  it("allows staff to return an assigned conversation to the queue", () => {
    expect(canReturnToQueue({ assignedSellerId: "seller-1" }, { isStaff: true })).toBe(true);
  });

  it("does not offer it for staff when the conversation is already in the pool", () => {
    expect(canReturnToQueue({ assignedSellerId: undefined }, { isStaff: true })).toBe(false);
  });

  it("treats a null assignee as already in the pool", () => {
    expect(
      canReturnToQueue({ assignedSellerId: null as unknown as undefined }, { isStaff: true }),
    ).toBe(false);
  });

  it("never offers it to a non-staff user, even on an assigned conversation", () => {
    expect(canReturnToQueue({ assignedSellerId: "seller-1" }, { isStaff: false })).toBe(false);
  });

  it("never offers it to a non-staff user in the pool", () => {
    expect(canReturnToQueue({ assignedSellerId: undefined }, { isStaff: false })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun run test -- src/features/conversations/engine/assignmentGate.test.ts`
Expected: FAIL — `canReturnToQueue is not a function` / import has no exported member `canReturnToQueue`.

- [ ] **Step 3: Implement `canReturnToQueue`**

Append to `src/features/conversations/engine/assignmentGate.ts` (after `mustAssignToReply`):
```ts
/**
 * Whether staff may return an assigned conversation to the pool/queue
 * (unassign). Offered only when the user is staff AND the conversation currently
 * has an assignee. A pool conversation has nothing to return. Mirrors the RLS:
 * only staff (`is_staff()`) can null the `assigned_seller_id` column. Inverse of
 * the read side covered by {@link mustAssignToReply}.
 */
export function canReturnToQueue(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean },
): boolean {
  if (!ctx.isStaff) return false;
  return conversation.assignedSellerId != null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun run test -- src/features/conversations/engine/assignmentGate.test.ts`
Expected: PASS — all `mustAssignToReply` and `canReturnToQueue` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/assignmentGate.ts src/features/conversations/engine/assignmentGate.test.ts
git commit -m "feat(conversations): add canReturnToQueue gate engine"
```

---

### Task 2: Provider — `unassign(id)`

**Files:**
- Modify: `src/providers/data/contracts/conversations.ts` (interface `IConversationsProvider`)
- Modify: `src/mocks/api/conversations.ts` (mock API)
- Modify: `src/providers/data/impl/mock/conversations.ts` (mock provider)
- Modify: `src/providers/data/impl/supabase/conversations.ts` (supabase provider)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `IConversationsProvider.unassign(id: ID): Promise<IConversation>` — clears the assignee (returns the conversation to the pool). Used by Task 3.

> Note: only `mock` and `supabase` implement `IConversationsProvider`. Adding the
> method to the interface makes `tsc`/`bun run build` fail until both impls have
> it — that is the verification for this task (no unit test at the data layer).

- [ ] **Step 1: Add `unassign` to the contract**

In `src/providers/data/contracts/conversations.ts`, inside `interface IConversationsProvider`, immediately after the `assignSeller(id, sellerId)` line:
```ts
  assignSeller(id: ID, sellerId: ID): Promise<IConversation>;
  /**
   * Remove the assignee — return the conversation to the pool/queue
   * (`assigned_seller_id = null`). Allowed only to staff at the RLS layer
   * (`conversations_update` WITH CHECK requires `is_staff()` to null the
   * column); the UI hides the action for non-staff. Symmetric with assignSeller.
   */
  unassign(id: ID): Promise<IConversation>;
```

- [ ] **Step 2: Implement `unassign` in the mock API**

In `src/mocks/api/conversations.ts`, immediately after the `assignSeller` method (the block ending around line 227):
```ts
  async unassign(id: ID): Promise<IConversation> {
    return runApi("conversationsApi", "unassign", () => {
      // Spread-merge in patchById sets the field to `undefined`, which the store
      // reads back as "no assignee" (pool) — the mock equivalent of NULL.
      const updated = patchById("conversations", id, {
        assignedSellerId: undefined,
      });
      if (!updated) throw new MockNotFoundError("conversation", id);
      return updated;
    });
  },
```

- [ ] **Step 3: Wire the mock provider to the API**

In `src/providers/data/impl/mock/conversations.ts`, immediately after the `assignSeller` line (line 32):
```ts
  assignSeller: (id, sellerId) => conversationsApi.assignSeller(id, sellerId),
  unassign: (id) => conversationsApi.unassign(id),
```

- [ ] **Step 4: Implement `unassign` in the supabase provider**

In `src/providers/data/impl/supabase/conversations.ts`, immediately after the `assignSeller` method (the block ending at line 311, `},`) and before `async archive`:
```ts
  async unassign(id: ID): Promise<IConversation> {
    // Direct table UPDATE to null the assignee — returns the conversation to the
    // pool/queue. Unlike assignSeller (which must hand a row OUT of a seller's
    // read scope, hence the SECURITY DEFINER RPC), nulling the column is
    // authorized directly by the conversations_update policy whenever is_staff()
    // (USING + WITH CHECK). A non-staff caller is rejected by RLS; the UI gates
    // the action to staff, so this never runs for them.
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ assigned_seller_id: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] conversations.unassign(${id}) failed: ${error.message}`);
    return rowToConversation(data as ConversationRow);
  },
```

- [ ] **Step 5: Verify the build (type-check across all implementers)**

Run: `bun run build`
Expected: succeeds. (If an implementer is missing `unassign`, the build/tsc fails — add it.)

Optionally: `bunx tsc --noEmit 2>&1 | grep -i "conversations\|unassign"` — expect no NEW errors referencing these files.

- [ ] **Step 6: Commit**

```bash
git add src/providers/data/contracts/conversations.ts src/mocks/api/conversations.ts src/providers/data/impl/mock/conversations.ts src/providers/data/impl/supabase/conversations.ts
git commit -m "feat(conversations): add unassign() provider method (return to pool)"
```

---

### Task 3: i18n strings + `useReturnToQueue` hook

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts`
- Create: `src/features/conversations/hooks/useReturnToQueue.ts`

**Interfaces:**
- Consumes: `IConversationsProvider.unassign` (Task 2); `INBOX_STRINGS.returnedToQueue/undo/undone/actionFailed`.
- Produces: `useReturnToQueue(conversation: IConversation, opts?: { onDone?: () => void }): { returning: boolean; returnToQueue: () => Promise<void> }`

- [ ] **Step 1: Add the INBOX_STRINGS keys**

In `src/features/conversations/i18n/pt-BR.ts`, in the `// Quick actions` block, after the `transferredTo` line (around line 116):
```ts
  transferredTo: (name: string) => `Conversa transferida para ${name}`,
  returnToQueue: "Devolver para a fila",
  returnedToQueue: "Conversa devolvida à fila",
```

- [ ] **Step 2: Add the CONVERSATION_STRINGS keys**

In the same file, in the `menu:` object, after the `transfer: "Transferir",` line (around line 341):
```ts
    transfer: "Transferir",
    returnToQueue: "Devolver para a fila",
```

And in the top-level `CONVERSATION_STRINGS` (near `archived`/`undone`, around line 357), after `archived: "Conversa arquivada",`:
```ts
  archived: "Conversa arquivada",
  returnedToQueue: "Conversa devolvida à fila",
```

- [ ] **Step 3: Create the hook**

Create `src/features/conversations/hooks/useReturnToQueue.ts`:
```ts
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IUseReturnToQueueResult {
  /** True while the unassign request is in flight. */
  returning: boolean;
  /** Returns the conversation to the pool/queue (toast w/ undo + audit). */
  returnToQueue: () => Promise<void>;
}

/**
 * Return-to-queue orchestration shared by the QuickActions button and the
 * ConversationMenu item. Unassigns the conversation (staff-only at the RLS
 * layer), shows an undoable toast that restores the prior assignee, and writes a
 * `conversation.return_to_queue` audit entry. Symmetric with useSelfAssign.
 */
export function useReturnToQueue(
  conversation: IConversation,
  opts?: { onDone?: () => void },
): IUseReturnToQueueResult {
  const { currentUser } = useAuth();
  const conversationsProvider = useConversationsProvider();
  const [returning, setReturning] = useState(false);

  const returnToQueue = useCallback(async () => {
    if (!currentUser) return;
    const before = conversation.assignedSellerId;
    setReturning(true);
    try {
      await conversationsProvider.unassign(conversation.id);
      opts?.onDone?.();
      toast(INBOX_STRINGS.returnedToQueue, {
        action: {
          label: INBOX_STRINGS.undo,
          onClick: () => {
            // Nothing to restore if it was already in the pool.
            if (before == null) return;
            void Promise.resolve(
              conversationsProvider.update(conversation.id, { assignedSellerId: before }),
            )
              .then(() => {
                opts?.onDone?.();
                toast.success(INBOX_STRINGS.undone);
              })
              .catch(() => toast.error(INBOX_STRINGS.actionFailed));
          },
        },
        duration: 5_000,
      });
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action: "conversation.return_to_queue",
        resource: "conversation",
        resourceId: conversation.id,
        before: { assignedSellerId: before },
        after: { assignedSellerId: null },
      });
    } catch {
      toast.error(INBOX_STRINGS.actionFailed);
    } finally {
      setReturning(false);
    }
  }, [
    conversation.id,
    conversation.assignedSellerId,
    conversation.storeId,
    currentUser,
    conversationsProvider,
    opts,
  ]);

  return { returning, returnToQueue };
}
```

- [ ] **Step 4: Verify the build**

Run: `bun run build`
Expected: succeeds (strings + hook type-check; `unassign` resolves from Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/i18n/pt-BR.ts src/features/conversations/hooks/useReturnToQueue.ts
git commit -m "feat(conversations): add useReturnToQueue hook + pt-BR strings"
```

---

### Task 4: Wire into `QuickActions` and `ConversationMenu`

**Files:**
- Modify: `src/features/conversations/components/QuickActions.tsx`
- Modify: `src/features/conversations/components/ConversationMenu.tsx`

**Interfaces:**
- Consumes: `canReturnToQueue` (Task 1), `useReturnToQueue` (Task 3), `INBOX_STRINGS.returnToQueue` / `CONVERSATION_STRINGS.menu.returnToQueue` (Task 3).
- Produces: user-facing buttons (no downstream consumers).

- [ ] **Step 1: QuickActions — imports**

In `src/features/conversations/components/QuickActions.tsx`, update the two feature imports near the top:
```ts
import { INBOX_STRINGS } from "../i18n/pt-BR";
import { useSelfAssign } from "../hooks/useSelfAssign";
```
to:
```ts
import { INBOX_STRINGS } from "../i18n/pt-BR";
import { useSelfAssign } from "../hooks/useSelfAssign";
import { useReturnToQueue } from "../hooks/useReturnToQueue";
import { canReturnToQueue } from "../engine/assignmentGate";
```

- [ ] **Step 2: QuickActions — compute gate + hook**

Just after the existing `const { selfAssign, canSelfAssign } = useSelfAssign(...)` line (line 44), add:
```ts
  const { selfAssign, canSelfAssign } = useSelfAssign(conversation, { onDone: onMutated });
  const { returnToQueue, returning } = useReturnToQueue(conversation, { onDone: onMutated });
```

And just after the `canTransferOrArchive` definition (line 52), add:
```ts
  const canTransferOrArchive = canEditStore || (canEditOwn && isOwnConversation);
  // Return-to-queue is STAFF-ONLY (the RLS only lets is_staff() null the column)
  // and only when there is an assignee to remove — a tighter gate than transfer.
  const showReturnToQueue = canReturnToQueue(conversation, { isStaff: canEditStore });
```

- [ ] **Step 3: QuickActions — render the button**

Inside the `{canTransferOrArchive && (<>...</>)}` block, between the transfer `DropdownMenu` (closing `</DropdownMenu>`) and the archive `Tooltip`, insert:
```tsx
          {showReturnToQueue && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-severity-warning hover:bg-severity-warning/10 hover:text-severity-warning"
                  aria-label={INBOX_STRINGS.returnToQueue}
                  disabled={returning}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void returnToQueue();
                  }}
                >
                  <Icon icon="mdi:account-arrow-left-outline" size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{INBOX_STRINGS.returnToQueue}</TooltipContent>
            </Tooltip>
          )}
```

> Placement note: `canEditStore` ⇒ `canTransferOrArchive` is true, so when
> `showReturnToQueue` is true this block is rendered. The button is still gated
> independently by `showReturnToQueue` (covers the assigned-vs-pool condition).

- [ ] **Step 4: ConversationMenu — imports**

In `src/features/conversations/components/ConversationMenu.tsx`, after the existing import of `CONVERSATION_STRINGS`:
```ts
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
```
add:
```ts
import { useReturnToQueue } from "../hooks/useReturnToQueue";
import { canReturnToQueue } from "../engine/assignmentGate";
```

- [ ] **Step 5: ConversationMenu — compute gate + hook**

After the `canManageThis` definition (line 81), add:
```ts
  const canManageThis = canEditStore || (canEditOwn && isOwnConversation);
  // Staff-only return-to-queue (RLS), only when there is an assignee to remove.
  const showReturnToQueue = canReturnToQueue(conversation, { isStaff: canEditStore });
  const { returnToQueue } = useReturnToQueue(conversation, { onDone: onMutated });
```

- [ ] **Step 6: ConversationMenu — render the item**

Right after the `{canManageThis && (<>...transfer...</>)}` block (the one ending at line 334, after the transfer `DropdownMenuItem`'s closing `</>`/`)}`), insert:
```tsx
          {showReturnToQueue && (
            <DropdownMenuItem
              onSelect={() => void returnToQueue()}
              className="text-severity-warning focus:text-severity-warning"
            >
              <Icon icon="mdi:account-arrow-left-outline" size={14} className="mr-2" />
              {CONVERSATION_STRINGS.menu.returnToQueue}
            </DropdownMenuItem>
          )}
```

- [ ] **Step 7: Verify the build + full suite**

Run: `bun run build`
Expected: succeeds.

Run: `bun run test`
Expected: full suite green (engine tests from Task 1 included; no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/features/conversations/components/QuickActions.tsx src/features/conversations/components/ConversationMenu.tsx
git commit -m "feat(conversations): surface return-to-queue in QuickActions + kebab menu"
```

---

## Self-Review

**1. Spec coverage:**
- §3 gate `canReturnToQueue` → Task 1. ✅
- §4 ação (unassign + undo + audit) → `unassign` (Task 2) + `useReturnToQueue` (Task 3). ✅
- §5 UX nos dois lugares (QuickActions + kebab), ícone, tooltip, tom warning → Task 4. ✅
- §6.2 método dedicado `unassign` (mock undefined / supabase null) → Task 2. ✅
- §6.3 hook reutilizável → Task 3. ✅
- §6.6 i18n → Task 3. ✅
- §7 testes do engine → Task 1. ✅

**2. Placeholder scan:** nenhum TBD/TODO; todo passo tem código/comando completo. ✅

**3. Type consistency:** `unassign(id: ID): Promise<IConversation>` idêntico no contrato (T2) e no consumo do hook (T3). `useReturnToQueue(...) → { returning, returnToQueue }` idêntico entre T3 (definição) e T4 (consumo). `canReturnToQueue(conversation, { isStaff })` idêntico entre T1, T4 (QuickActions com `isStaff: canEditStore`) e T4 (ConversationMenu com `isStaff: canEditStore`). ✅
