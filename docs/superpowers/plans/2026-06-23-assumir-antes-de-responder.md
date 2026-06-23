# "Assumir antes de responder" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear o envio de mensagem ao cliente em conversas do **pool** (sem responsável) para usuários **não-staff**, até que assumam a conversa — mantendo toda a leitura inalterada.

**Architecture:** Entrega 100% frontend em `src/features/conversations`. Um engine puro decide o gate; o `MessageInput` troca a barra de digitação por um banner "Assumir e responder" quando o gate dispara; um hook reutilizável encapsula o self-assign (extraído do `QuickActions`); o `ConversationPage` calcula o gate e propaga ao composer e à bandeja de combos.

**Tech Stack:** React 19, TypeScript (strict), Vitest (environment `node`), TanStack Router/Query, shadcn/ui, Tailwind v4, Iconify.

## Global Constraints

- **Sem** migration, RLS, provider de dados novo ou redeploy de Edge — frontend only.
- **Não tocar** no cache de mensagens/mídias/realtime do atendimento (signing em lote, query keys, RPC gated-once).
- **Não introduzir** infra de teste de componente (jsdom/testing-library) nem novas dependências — o projeto roda Vitest em `environment: "node"` e só testa engines puros. TDD aplica-se ao engine; UI/glue é verificada por `bun run build` + suíte de regressão + smoke manual.
- **Comentários em inglês; UI em pt-BR** com acentuação correta (UTF-8).
- **Commits** Conventional Commits em inglês, atômicos. Trailer obrigatório: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Critério de **staff isento** = `usePermission("conversation", "view", "store")` (já existe como `showAssignee` no `ConversationPage`).
- Gate cobre **apenas o pool**: `conversation.assignedSellerId == null` **e** não-staff.

---

### Task 1: Engine do gate (`mustAssignToReply`)

**Files:**
- Create: `src/features/conversations/engine/assignmentGate.ts`
- Test: `src/features/conversations/engine/assignmentGate.test.ts`

**Interfaces:**
- Consumes: `IConversation` de `@/shared/types` (campo `assignedSellerId?: ID`).
- Produces: `mustAssignToReply(conversation: Pick<IConversation, "assignedSellerId">, ctx: { isStaff: boolean }): boolean` — usado nas Tasks 4 e 5.

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/assignmentGate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mustAssignToReply } from "./assignmentGate";

describe("mustAssignToReply", () => {
  it("gates a pool conversation for a non-staff user", () => {
    expect(mustAssignToReply({ assignedSellerId: undefined }, { isStaff: false })).toBe(true);
  });

  it("gates a pool conversation (null assignee) for a non-staff user", () => {
    expect(mustAssignToReply({ assignedSellerId: null as unknown as undefined }, { isStaff: false })).toBe(true);
  });

  it("never gates staff, even in the pool", () => {
    expect(mustAssignToReply({ assignedSellerId: undefined }, { isStaff: true })).toBe(false);
  });

  it("does not gate an assigned conversation for a non-staff user", () => {
    expect(mustAssignToReply({ assignedSellerId: "seller-1" }, { isStaff: false })).toBe(false);
  });

  it("does not gate an assigned conversation for staff", () => {
    expect(mustAssignToReply({ assignedSellerId: "seller-1" }, { isStaff: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run src/features/conversations/engine/assignmentGate.test.ts`
Expected: FAIL — `Failed to resolve import "./assignmentGate"` / `mustAssignToReply is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/conversations/engine/assignmentGate.ts`:

```ts
import type { IConversation } from "@/shared/types";

/**
 * Whether the current user must self-assign a pool conversation before they can
 * send a message to the customer. Reading is never gated.
 *
 * Gated when the conversation has no assignee AND the user is not staff. Staff
 * (Owner/Gestor — those who view store-wide conversations) are exempt. A
 * conversation already assigned (to the user, or to someone else where the user
 * is a co-responsible participant) is never gated, so the gate covers exactly
 * the pool.
 */
export function mustAssignToReply(
  conversation: Pick<IConversation, "assignedSellerId">,
  ctx: { isStaff: boolean },
): boolean {
  if (ctx.isStaff) return false;
  return conversation.assignedSellerId == null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bunx vitest run src/features/conversations/engine/assignmentGate.test.ts`
Expected: PASS — 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/assignmentGate.ts src/features/conversations/engine/assignmentGate.test.ts
git commit -m "feat(conversations): add mustAssignToReply gate engine

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Hook reutilizável `useSelfAssign` + refactor do `QuickActions`

Extrai a lógica de auto-atribuição hoje embutida em `QuickActions.handleAssignToMe` para um hook reutilizável (assign + toast com "desfazer" + auditoria), e faz o `QuickActions` consumi-lo **sem mudança de comportamento**.

**Files:**
- Create: `src/features/conversations/hooks/useSelfAssign.ts`
- Modify: `src/features/conversations/components/QuickActions.tsx`

**Interfaces:**
- Consumes: `useConversationsProvider`, `recordAuditLog` de `@/providers/data`; `useAuth` de `@/features/auth/useAuth`; `IConversation`; `INBOX_STRINGS` de `../i18n/pt-BR`; provider `assignSeller(id, sellerId): Promise<IConversation>` e `update(id, patch): Promise<IConversation>`.
- Produces: `useSelfAssign(conversation: IConversation, opts?: { onDone?: () => void }): { assigning: boolean; canSelfAssign: boolean; selfAssign: () => Promise<void> }` — usado nas Tasks 3/4 (via `MessageInput`) e por `QuickActions`.

- [ ] **Step 1: Create the hook**

Create `src/features/conversations/hooks/useSelfAssign.ts`:

```ts
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { INBOX_STRINGS } from "../i18n/pt-BR";

export interface IUseSelfAssignResult {
  /** True while the assign request is in flight. */
  assigning: boolean;
  /** Whether the user can self-assign: has a seller identity AND the conversation is in the pool. */
  canSelfAssign: boolean;
  /** Assigns the conversation to the current user (toast w/ undo + audit). */
  selfAssign: () => Promise<void>;
}

/**
 * Self-assign orchestration shared by the QuickActions button and the
 * MessageInput "assumir e responder" banner. Mirrors the previous inline
 * QuickActions behaviour: assignSeller, an undoable toast that restores the
 * prior assignee, and a `conversation.self_assign` audit entry.
 */
export function useSelfAssign(
  conversation: IConversation,
  opts?: { onDone?: () => void },
): IUseSelfAssignResult {
  const { currentUser } = useAuth();
  const conversationsProvider = useConversationsProvider();
  const [assigning, setAssigning] = useState(false);

  const canSelfAssign =
    currentUser?.sellerId != null && conversation.assignedSellerId == null;

  const selfAssign = useCallback(async () => {
    if (!currentUser?.sellerId) return;
    const sellerId = currentUser.sellerId;
    const before = conversation.assignedSellerId;
    setAssigning(true);
    try {
      await conversationsProvider.assignSeller(conversation.id, sellerId);
      opts?.onDone?.();
      toast(INBOX_STRINGS.assignedToYou, {
        action: {
          label: INBOX_STRINGS.undo,
          onClick: () => {
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
        action: "conversation.self_assign",
        resource: "conversation",
        resourceId: conversation.id,
        before: { assignedSellerId: before },
        after: { assignedSellerId: sellerId },
      });
    } catch {
      toast.error(INBOX_STRINGS.actionFailed);
    } finally {
      setAssigning(false);
    }
  }, [
    conversation.id,
    conversation.assignedSellerId,
    conversation.storeId,
    currentUser,
    conversationsProvider,
    opts,
  ]);

  return { assigning, canSelfAssign, selfAssign };
}
```

- [ ] **Step 2: Refactor `QuickActions` to use the hook**

In `src/features/conversations/components/QuickActions.tsx`:

Add the import (next to the other `../` imports):

```ts
import { useSelfAssign } from "../hooks/useSelfAssign";
```

Inside the component, add the hook call (e.g. right after `const sellersProvider = useSellersProvider();`):

```ts
  const { selfAssign, canSelfAssign } = useSelfAssign(conversation, { onDone: onMutated });
```

Delete the now-duplicated local `canSelfAssign` declaration:

```ts
  // REMOVE this line:
  const canSelfAssign = currentUser?.sellerId != null && !conversation.assignedSellerId;
```

Delete the entire local `handleAssignToMe` function (the `const handleAssignToMe = async () => { ... };` block).

Update the assign button's `onClick` to call the hook's `selfAssign`:

```tsx
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void selfAssign();
              }}
```

(Leave `handleTransferTo`, `handleArchive`, `showUndoableToast`, and everything else untouched.)

- [ ] **Step 3: Build + full regression suite**

Run: `bun run build`
Expected: build completes with no errors.

Run: `bun run test`
Expected: full suite green (no regressions). The QuickActions assign button must still: assign, show the undoable toast, and audit `conversation.self_assign`.

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/hooks/useSelfAssign.ts src/features/conversations/components/QuickActions.tsx
git commit -m "refactor(conversations): extract useSelfAssign from QuickActions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Strings pt-BR + componente `AssignToReplyBanner`

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts` (add `assignGate` to `CONVERSATION_STRINGS`, declared at line 168; place near `readOnlyAssign`, ~line 222)
- Create: `src/features/conversations/components/AssignToReplyBanner.tsx`

**Interfaces:**
- Consumes: `CONVERSATION_STRINGS.assignGate` (added here); `Button` de `@/components/ui/button`; `Icon` de `@/components/Icon`.
- Produces: `AssignToReplyBanner(props: { canAssign: boolean; assigning?: boolean; onAssign: () => void; onToggleNote: () => void })` — usado na Task 4.

- [ ] **Step 1: Add the pt-BR strings**

In `src/features/conversations/i18n/pt-BR.ts`, inside the `CONVERSATION_STRINGS` object, right after the `readOnlyAssign: "Esta conversa não está atribuída a você.",` line, add:

```ts
  assignGate: {
    title: "Conversa na fila, sem responsável",
    description: "Assuma a conversa para responder ao cliente.",
    assignCta: "Assumir e responder",
    note: "Nota interna",
    noSellerHint: "Peça a um gestor para atribuir esta conversa a você.",
  },
```

- [ ] **Step 2: Create the banner component**

Create `src/features/conversations/components/AssignToReplyBanner.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export interface IAssignToReplyBannerProps {
  /** Whether the user can self-assign (has a seller identity). */
  canAssign: boolean;
  /** In-flight state — disables the assign button. */
  assigning?: boolean;
  /** Assign the conversation to the current user and unlock sending. */
  onAssign: () => void;
  /** Toggle the internal-note composer (notes stay allowed in the pool). */
  onToggleNote: () => void;
}

/**
 * Pool gate (assign-before-reply): replaces the composer for non-staff users on
 * an unassigned conversation. Sending to the customer is blocked; internal notes
 * remain available. Pure presentation — assign orchestration lives in
 * useSelfAssign (wired by MessageInput).
 */
export function AssignToReplyBanner({
  canAssign,
  assigning = false,
  onAssign,
  onToggleNote,
}: IAssignToReplyBannerProps) {
  const t = CONVERSATION_STRINGS.assignGate;
  return (
    <div className="border-t border-border bg-muted/40 px-4 py-3">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Icon icon="mdi:lock-outline" size={16} />
          {t.title}
        </div>
        <p className="text-xs text-muted-foreground">
          {canAssign ? t.description : t.noSellerHint}
        </p>
        <div className="flex items-center gap-2">
          {canAssign && (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={onAssign}
              disabled={assigning}
            >
              <Icon icon="mdi:account-plus" size={14} />
              {t.assignCta}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={onToggleNote}
          >
            <Icon icon="mdi:note-edit-outline" size={14} />
            {t.note}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `bun run build`
Expected: build completes with no errors (component compiles; strings resolve).

- [ ] **Step 4: Commit**

```bash
git add src/features/conversations/i18n/pt-BR.ts src/features/conversations/components/AssignToReplyBanner.tsx
git commit -m "feat(conversations): add AssignToReplyBanner + pt-BR strings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Integrar o gate no `MessageInput`

Quando o gate dispara, o `MessageInput` renderiza o `AssignToReplyBanner` (mantendo o compositor de nota interna) **no lugar** de toda a barra de digitação — nenhum caminho de envio fica acionável.

**Files:**
- Modify: `src/features/conversations/components/MessageInput.tsx`

**Interfaces:**
- Consumes: `AssignToReplyBanner` (Task 3); `useSelfAssign` (Task 2).
- Produces: novas props opcionais em `IMessageInputProps`: `mustAssignToReply?: boolean` e `onAssigned?: () => void` — passadas pela Task 5.

- [ ] **Step 1: Add the imports**

In `src/features/conversations/components/MessageInput.tsx`, add (next to the other `./` imports, e.g. after the `OriginChip` import):

```ts
import { AssignToReplyBanner } from "./AssignToReplyBanner";
import { useSelfAssign } from "../hooks/useSelfAssign";
```

- [ ] **Step 2: Add the two props to the interface**

In `IMessageInputProps`, add:

```ts
  /** Pool gate (assign-before-reply): block sending until the user self-assigns. */
  mustAssignToReply?: boolean;
  /** Called after a successful self-assign so the parent can refresh the conversation. */
  onAssigned?: () => void;
```

- [ ] **Step 3: Destructure the new props**

In the `MessageInput` function's props destructuring block, add (with a default for the flag):

```ts
    mustAssignToReply = false,
    onAssigned,
```

- [ ] **Step 4: Call the self-assign hook (unconditionally, with the other hooks)**

After `const sendHook = useMessageSend(conversation, whatsappAccount);` add:

```ts
  const selfAssign = useSelfAssign(conversation, { onDone: onAssigned });
```

- [ ] **Step 5: Render the gate banner (after the readOnly/archived early-return)**

Immediately after the existing early-return block:

```tsx
  if (readOnly || archived) {
    return (
      <footer className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
        {readOnlyMessage ?? CONVERSATION_STRINGS.readOnlyAssign}
      </footer>
    );
  }
```

add a second early-return:

```tsx
  // Pool gate (assign-before-reply): non-staff on an unassigned conversation.
  // Reading stays intact upstream; here we block every send path but keep the
  // internal-note composer reachable.
  if (mustAssignToReply) {
    return (
      <footer data-tour="composer" className="border-t border-border bg-card">
        {notesOpen && (
          <InlineNoteComposer
            conversationId={conversation.id}
            storeId={conversation.storeId}
            onClose={() => setNotesOpen(false)}
          />
        )}
        <AssignToReplyBanner
          canAssign={selfAssign.canSelfAssign}
          assigning={selfAssign.assigning}
          onAssign={() => void selfAssign.selfAssign()}
          onToggleNote={() => setNotesOpen((v) => !v)}
        />
      </footer>
    );
  }
```

- [ ] **Step 6: Build + regression suite**

Run: `bun run build`
Expected: no errors.

Run: `bun run test`
Expected: full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/components/MessageInput.tsx
git commit -m "feat(conversations): block sending in MessageInput when assign required

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Calcular o gate no `ConversationPage` e suprimir o `ComboTray`

**Files:**
- Modify: `src/features/conversations/pages/ConversationPage.tsx`

**Interfaces:**
- Consumes: `mustAssignToReply` (Task 1); `showAssignee` (já existe, linha 78); `detail.refresh`; `conversation` (linha 153). Novas props do `MessageInput` (Task 4).
- Produces: comportamento final integrado (nada consumido por tarefas posteriores).

- [ ] **Step 1: Import the engine**

In `src/features/conversations/pages/ConversationPage.tsx`, add (next to the other `../` imports):

```ts
import { mustAssignToReply } from "../engine/assignmentGate";
```

- [ ] **Step 2: Add a `disabled` guard to the local `ConversationComboTray`**

Update the local `ConversationComboTray` component so it can be suppressed by the gate. Change its signature and early-return:

```tsx
function ConversationComboTray({
  conversation,
  whatsappAccount,
  disabled = false,
}: {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  disabled?: boolean;
}) {
  const { comboItems, reorderCombo, removeFromCombo, clearCombo } = useQuickSendBus();
  const { sendCombo, progress } = useComboSend(conversation, whatsappAccount);
  if (disabled || comboItems.length === 0) return null;
  return (
    <ComboTray
      items={comboItems}
      onReorder={reorderCombo}
      onRemove={removeFromCombo}
      onSendAll={async () => {
        await sendCombo(comboItems);
        clearCombo();
      }}
      progress={progress}
    />
  );
}
```

- [ ] **Step 3: Compute the gate after the conversation is destructured**

Right after `const { conversation, customer, lead, contact, whatsappAccount, assignedSeller } = detail;` (line 153) add:

```tsx
  // Pool gate: non-staff must self-assign before replying. Staff (store-wide
  // viewers) are exempt — same predicate as showAssignee.
  const mustAssign = mustAssignToReply(conversation, { isStaff: showAssignee });
```

- [ ] **Step 4: Pass the gate to `MessageInput`**

Update the `<MessageInput .../>` props (currently lines ~223-231):

```tsx
              <MessageInput
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                onSent={detail.refresh}
                draft={draft}
                onDraftChange={setDraft}
                hideAiSuggestions={copilot.placement === "strip"}
                openTemplateSignal={templateSignal}
                mustAssignToReply={mustAssign}
                onAssigned={detail.refresh}
              />
```

- [ ] **Step 5: Pass the gate to `ConversationComboTray`**

Update the `<ConversationComboTray .../>` usage (currently lines ~219-222):

```tsx
              <ConversationComboTray
                conversation={conversation}
                whatsappAccount={whatsappAccount}
                disabled={mustAssign}
              />
```

- [ ] **Step 6: Build + regression suite**

Run: `bun run build`
Expected: no errors.

Run: `bun run test`
Expected: full suite green.

- [ ] **Step 7: Lint**

Run: `bun run lint`
Expected: no new lint errors in the touched files.

- [ ] **Step 8: Commit**

```bash
git add src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(conversations): wire assign-before-reply gate in ConversationPage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Smoke manual (dono / após implementação)

Em `supabase` (produção), como **vendedor não-staff** com acesso a uma instância:
1. Abrir uma conversa **do pool** (sem responsável) → o composer mostra o banner "Conversa na fila, sem responsável" com **[ Assumir e responder ]** e **📝 Nota interna**; nenhum caminho de envio aparece.
2. Verificar que a **leitura** (mensagens, mídias, ficha, copilot) continua normal.
3. Clicar em **📝 Nota interna** → o compositor de nota abre e permite anotar (sem assumir).
4. Clicar em **Assumir e responder** → toast "Conversa atribuída a você" (com **Desfazer**); o composer normal reaparece e permite digitar/enviar.
5. Como **Owner/Gestor**, abrir a mesma conversa do pool → composer normal desde o início (sem banner).
6. Numa conversa **já atribuída a você** → composer normal (sem banner).

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec:** §3 gate → Task 1; §4 UX/banner + self-assign → Tasks 2/3; §5 caminhos de envio bloqueados (early-return cobre texto/anexo/voz/agendar/template/asset/produto/slash/IA) + ComboTray → Tasks 4/5; §6 estrutura (engine/hook/banner/props) → Tasks 1-5; §6.6 i18n → Task 3. Não-objetivos (§8) respeitados pelas Global Constraints.
- **Placeholders:** nenhum — todo passo tem código/comando real.
- **Consistência de tipos:** `mustAssignToReply(conversation, { isStaff })` idêntico nas Tasks 1/4/5; `useSelfAssign(...)` retorna `{ assigning, canSelfAssign, selfAssign }` consumido igual no banner/MessageInput; `IAssignToReplyBannerProps` casa com o uso na Task 4.
- **Desvio consciente do TDD:** sem teste de componente (projeto roda Vitest em `node`, sem jsdom/testing-library e sem testes `.tsx`); introduzir essa infra está fora de escopo. TDD aplicado ao engine (Task 1); UI/glue coberta por build + regressão + smoke manual.
