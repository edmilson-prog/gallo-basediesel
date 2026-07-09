# Qualificar conversa como lead — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an attendant qualify a WhatsApp conversation as a lead from the conversation menu, pre-filled from the conversation's contact and linked both ways (`conversation.leadId` ↔ `lead.conversations`).

**Architecture:** Pure decision helper (`getLeadMenuAction`) decides which menu item to show; `NewLeadModal` gains optional conversation-context props so it can be reused from both the Leads page (unchanged behavior) and the conversation menu (new); `ConversationMenu` wires the new menu items, fetches the pipeline stages/sellers it needs, and renders the modal.

**Tech Stack:** React 19, TypeScript strict, TanStack Query, TanStack Router, shadcn/ui, Vitest, sonner (toasts). Provider Pattern (`@/providers/data` barrel only).

## Global Constraints

- No migration, no new Edge Function, no new route — frontend-only change. `conversations.lead_id` and `IConversationsProvider.update`/`ILeadsProvider.update` already support what this feature needs.
- TypeScript `strict: true` — no `any`.
- Code comments in English. User-facing strings (labels, toasts) in Brazilian Portuguese with correct accents (UTF-8 — never `nao`/`lider` for `não`/`líder`, etc.).
- Business logic that can be expressed as a pure function is tested with Vitest (TDD) — co-located `*.test.ts`.
- Data access only via `@/providers/data` hooks (barrel) — never `@/providers/data/impl/*`.
- Domain invariant: exactly one of `conversation.customerId` / `conversation.leadId` is set (see `src/shared/types/conversation.ts:18`).
- Conventional Commits (English), atomic commits.
- Working tree: `D:\claude\gallo-basediesel\.claude\worktrees\leads-production` (branch `feat/leads-production`). All paths below are relative to this worktree root.

---

### Task 1: Pure helper — which lead action does the conversation menu show

**Files:**
- Create: `src/features/conversations/utils/leadMenuAction.ts`
- Test: `src/features/conversations/utils/leadMenuAction.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no external deps).
- Produces: `export type LeadMenuAction = "qualify" | "view" | null;` and `export function getLeadMenuAction(conversation: Pick<IConversation, "customerId" | "leadId">, permissions: { canCreate: boolean; canView: boolean }): LeadMenuAction` — consumed by Task 3 (`ConversationMenu.tsx`).

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/utils/leadMenuAction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getLeadMenuAction } from "./leadMenuAction";

describe("getLeadMenuAction", () => {
  it("returns null when the conversation already has a customer (already a client, not a lead prospect)", () => {
    const result = getLeadMenuAction(
      { customerId: "cust-1", leadId: undefined },
      { canCreate: true, canView: true },
    );
    expect(result).toBeNull();
  });

  it("returns null when the conversation has a customer even if leadId is also present", () => {
    const result = getLeadMenuAction(
      { customerId: "cust-1", leadId: "lead-1" },
      { canCreate: true, canView: true },
    );
    expect(result).toBeNull();
  });

  it("returns 'view' when a lead is already linked and the user can view leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: "lead-1" },
      { canCreate: true, canView: true },
    );
    expect(result).toBe("view");
  });

  it("returns null when a lead is already linked but the user cannot view leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: "lead-1" },
      { canCreate: true, canView: false },
    );
    expect(result).toBeNull();
  });

  it("returns 'qualify' when there is no customer/lead yet and the user can create leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: undefined },
      { canCreate: true, canView: true },
    );
    expect(result).toBe("qualify");
  });

  it("returns null when there is no customer/lead yet and the user cannot create leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: undefined },
      { canCreate: false, canView: true },
    );
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test leadMenuAction`
Expected: FAIL — `Cannot find module './leadMenuAction'` (the module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/features/conversations/utils/leadMenuAction.ts`:

```ts
import type { IConversation } from "@/shared/types";

/**
 * Which lead-related action the conversation menu offers, if any.
 * `null` when the conversation is already a customer (no longer a lead
 * prospect) or the acting user lacks the relevant permission.
 */
export type LeadMenuAction = "qualify" | "view" | null;

export interface ILeadMenuPermissions {
  /** Whether the acting user can create a lead ("lead"/"create"). */
  canCreate: boolean;
  /** Whether the acting user can view leads ("lead"/"view"). */
  canView: boolean;
}

/**
 * Decides which lead action, if any, the conversation's "⋮" menu should
 * offer. Mirrors the domain invariant that exactly one of `customerId` /
 * `leadId` is set on a conversation (`src/shared/types/conversation.ts`).
 */
export function getLeadMenuAction(
  conversation: Pick<IConversation, "customerId" | "leadId">,
  permissions: ILeadMenuPermissions,
): LeadMenuAction {
  if (conversation.customerId) return null;
  if (conversation.leadId) return permissions.canView ? "view" : null;
  return permissions.canCreate ? "qualify" : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test leadMenuAction`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/utils/leadMenuAction.ts src/features/conversations/utils/leadMenuAction.test.ts
git commit -m "feat: add pure helper deciding the conversation's lead menu action"
```

---

### Task 2: Extend `NewLeadModal` to qualify a conversation as a lead

**Files:**
- Modify: `src/features/leads/components/NewLeadModal.tsx`
- Modify: `src/features/leads/i18n/pt-BR.ts:175` (add `linkError` string)

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `INewLeadModalProps` gains `conversationId?: ID`, `initialName?: string`, `initialPhone?: string` — consumed by Task 3 (`ConversationMenu.tsx` renders `<NewLeadModal conversationId={...} initialName={...} initialPhone={...} .../>`). `onCreated?.(lead)` still fires with the freshly created `ILead` (unchanged signature) — Task 3 relies on this to build the "Ver lead" toast action with the new lead's id.

- [ ] **Step 1: Add the new optional props to the interface**

In `src/features/leads/components/NewLeadModal.tsx`, replace:

```ts
export interface INewLeadModalProps {
  open: boolean;
  onClose: () => void;
  stages: IPipelineStage[];
  sellers: ISeller[];
  onCreated?: (lead: ILead) => void;
}
```

with:

```ts
export interface INewLeadModalProps {
  open: boolean;
  onClose: () => void;
  stages: IPipelineStage[];
  sellers: ISeller[];
  onCreated?: (lead: ILead) => void;
  /**
   * Set when the lead is being qualified FROM a conversation (conversation
   * menu → "Qualificar como lead"). On save, links `conversation.leadId` and
   * `lead.conversations` both ways instead of just creating a standalone lead.
   */
  conversationId?: ID;
  /** Pre-fills `name` from the conversation's resolved contact, if any. */
  initialName?: string;
  /** Pre-fills `phone` from the conversation's resolved contact, if any. */
  initialPhone?: string;
}
```

- [ ] **Step 2: Accept the new props and add the conversations provider**

Replace:

```ts
export function NewLeadModal({ open, onClose, stages, sellers, onCreated }: INewLeadModalProps) {
  const provider = useLeadsProvider();
  const { currentUser } = useAuth();
```

with:

```ts
export function NewLeadModal({
  open,
  onClose,
  stages,
  sellers,
  onCreated,
  conversationId,
  initialName,
  initialPhone,
}: INewLeadModalProps) {
  const provider = useLeadsProvider();
  const conversationsProvider = useConversationsProvider();
  const { currentUser } = useAuth();
```

Add `useConversationsProvider` to the existing provider import:

```ts
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
```

becomes:

```ts
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { useConversationsProvider } from "@/providers/data";
```

- [ ] **Step 3: Pre-fill name/phone from the conversation contact on open**

Replace the reset effect:

```ts
  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
```

with:

```ts
  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setPhone(initialPhone ?? "");
    setEmail("");
```

and update its dependency array — replace:

```ts
  }, [open, initialSeller, initialStage]);
```

with:

```ts
  }, [open, initialSeller, initialStage, initialName, initialPhone]);
```

- [ ] **Step 4: Link the conversation both ways after creating the lead**

Replace:

```ts
      const lead = await provider.create({
        storeId: currentStoreId,
        sellerId,
        name: name.trim(),
        phone: phoneDigits,
        email: email.trim() ? email.trim() : undefined,
        stage,
        temperature,
        origin,
        estimatedValue: Number.isFinite(value) ? value : undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
        tags: [],
      });
      auditLog({
        action: "lead.created",
        resource: "lead",
        resourceId: lead.id,
        after: {
          sellerId,
          stageId: stage.id,
          origin,
          temperature,
        },
      });
      toast.success(COPY.createdToast);
      onCreated?.(lead);
```

with:

```ts
      const lead = await provider.create({
        storeId: currentStoreId,
        sellerId,
        name: name.trim(),
        phone: phoneDigits,
        email: email.trim() ? email.trim() : undefined,
        stage,
        temperature,
        origin,
        estimatedValue: Number.isFinite(value) ? value : undefined,
        nextActionAt: nextActionAt ? new Date(nextActionAt).toISOString() : undefined,
        tags: [],
      });

      if (conversationId) {
        try {
          await provider.update(lead.id, { conversations: [conversationId] });
          await conversationsProvider.update(conversationId, { leadId: lead.id });
          auditLog({
            action: "lead.qualified_from_conversation",
            resource: "lead",
            resourceId: lead.id,
            after: { conversationId, sellerId, stageId: stage.id, origin, temperature },
          });
        } catch {
          // The lead itself was created successfully — surface the link
          // failure separately rather than rolling back the lead.
          toast.error(COPY.linkError);
        }
      } else {
        auditLog({
          action: "lead.created",
          resource: "lead",
          resourceId: lead.id,
          after: { sellerId, stageId: stage.id, origin, temperature },
        });
      }

      toast.success(COPY.createdToast);
      onCreated?.(lead);
```

- [ ] **Step 5: Add the `linkError` copy**

In `src/features/leads/i18n/pt-BR.ts`, inside `newModal`, replace:

```ts
    createdToast: "Lead criado.",
    createError: "Não foi possível criar o lead.",
  },
```

with:

```ts
    createdToast: "Lead criado.",
    createError: "Não foi possível criar o lead.",
    linkError: "Lead criado, mas não foi possível vinculá-lo à conversa.",
  },
```

- [ ] **Step 6: Verify no regressions in the existing NewLeadModal caller**

`src/features/leads/pages/LeadsPage.tsx` calls `<NewLeadModal open={...} onClose={...} stages={...} sellers={...} onCreated={...} />` without `conversationId`/`initialName`/`initialPhone` — all three are optional, so this caller needs no changes. Confirm by running:

Run: `bun run test`
Expected: PASS (no existing test currently covers `NewLeadModal` directly — this step is a smoke check that nothing else broke).

- [ ] **Step 7: Commit**

```bash
git add src/features/leads/components/NewLeadModal.tsx src/features/leads/i18n/pt-BR.ts
git commit -m "feat: let NewLeadModal qualify a conversation as a lead"
```

---

### Task 3: Wire the conversation menu — "Qualificar como lead" / "Ver lead"

**Files:**
- Modify: `src/features/conversations/components/ConversationMenu.tsx`
- Modify: `src/features/conversations/i18n/pt-BR.ts:144` (add `leadQualified` toast) and `:409` (add `menu.qualifyAsLead`/`menu.viewLead`)
- Modify: `src/features/conversations/pages/ConversationPage.tsx:235-242` (pass `contact` through to `ConversationMenu`)

**Interfaces:**
- Consumes: `getLeadMenuAction`/`LeadMenuAction` from Task 1 (`../utils/leadMenuAction`); `INewLeadModalProps` (`conversationId`/`initialName`/`initialPhone`) from Task 2 (`@/features/leads/components/NewLeadModal`).
- Produces: `IConversationMenuProps` gains `contact: IConversationContact | null` — this task also updates the one existing caller (`ConversationPage.tsx`), so no other task needs to react to this change.

- [ ] **Step 1: Add the i18n strings**

In `src/features/conversations/i18n/pt-BR.ts`, replace:

```ts
  undo: "Desfazer",
  undone: "Ação desfeita",
  actionFailed: "Não foi possível concluir a ação",
```

with:

```ts
  undo: "Desfazer",
  undone: "Ação desfeita",
  actionFailed: "Não foi possível concluir a ação",
  leadQualified: "Lead qualificado a partir da conversa.",
```

Then, inside the `menu` object, replace:

```ts
    syncPhoto: "Atualizar foto do contato",
    renameContact: "Renomear contato",
  },
```

with:

```ts
    syncPhoto: "Atualizar foto do contato",
    renameContact: "Renomear contato",
    qualifyAsLead: "Qualificar como lead",
    viewLead: "Ver lead",
  },
```

- [ ] **Step 2: Import what `ConversationMenu.tsx` needs**

Replace the type import:

```ts
import type { ICustomer, ID, IConversation, ILead, ISeller } from "@/shared/types";
```

with:

```ts
import type { ICustomer, ID, IConversation, IConversationContact, ILead, ISeller } from "@/shared/types";
```

Add `useNavigate` and `useQuery` (new deps for this file):

```ts
import { useState } from "react";
```

becomes:

```ts
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
```

Add the leads-feature imports (new cross-feature imports — mirrors the existing direct-path pattern already used for `@/features/rbac/hooks/usePermission` and `@/features/multistore/hooks/useCurrentStore` elsewhere in this codebase):

```ts
import { usePermission } from "@/features/rbac/hooks/usePermission";
```

becomes:

```ts
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { usePipelineSettings } from "@/features/leads/hooks/usePipelineSettings";
import { NewLeadModal } from "@/features/leads/components/NewLeadModal";
```

Add the new helper import:

```ts
import { useReturnToQueue } from "../hooks/useReturnToQueue";
```

becomes:

```ts
import { useReturnToQueue } from "../hooks/useReturnToQueue";
import { getLeadMenuAction } from "../utils/leadMenuAction";
```

- [ ] **Step 3: Accept `lead` and add `contact` to the props**

Replace:

```ts
export interface IConversationMenuProps {
  conversation: IConversation;
  customer: ICustomer | null;
  lead: ILead | null;
  onMutated?: () => void;
  /** Status-control display mode (lifted to the page; shared with the header). */
  statusControlMode: StatusControlMode;
  onStatusControlModeChange: (mode: StatusControlMode) => void;
}
```

with:

```ts
export interface IConversationMenuProps {
  conversation: IConversation;
  customer: ICustomer | null;
  lead: ILead | null;
  /** Pool-safe display contact — used to pre-fill name/phone when qualifying as lead. */
  contact: IConversationContact | null;
  onMutated?: () => void;
  /** Status-control display mode (lifted to the page; shared with the kebab). */
  statusControlMode: StatusControlMode;
  onStatusControlModeChange: (mode: StatusControlMode) => void;
}
```

- [ ] **Step 4: Destructure the new props and compute the lead menu state**

Replace:

```ts
export function ConversationMenu({
  conversation,
  customer,
  onMutated,
  statusControlMode,
  onStatusControlModeChange,
}: IConversationMenuProps) {
  const { currentUser } = useAuth();
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const sdrSessionsProvider = useSdrSessionsProvider();

  const canEditStore = usePermission("conversation", "edit", "store");
  const canEditOwn = usePermission("conversation", "edit", "own");
  const canAddNote = usePermission("customer", "edit", "own");
```

with:

```ts
export function ConversationMenu({
  conversation,
  customer,
  lead,
  contact,
  onMutated,
  statusControlMode,
  onStatusControlModeChange,
}: IConversationMenuProps) {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const conversationsProvider = useConversationsProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();
  const sdrSessionsProvider = useSdrSessionsProvider();

  const canEditStore = usePermission("conversation", "edit", "store");
  const canEditOwn = usePermission("conversation", "edit", "own");
  const canAddNote = usePermission("customer", "edit", "own");
  const canCreateLead = usePermission("lead", "create");
  const canViewLead = usePermission("lead", "view");
  const leadMenuAction = getLeadMenuAction(conversation, {
    canCreate: canCreateLead,
    canView: canViewLead,
  });

  // Only fetched (and only matters) when the qualify dialog can actually be
  // opened — but a `useQuery` call must run unconditionally per the rules of
  // hooks, so this stays cheap via `enabled` + the same cache key LeadsPage
  // already uses (react-query dedupes across both call sites).
  const { stages } = usePipelineSettings(conversation.storeId);
  const sellersQuery = useQuery({
    queryKey: ["sellers-list", conversation.storeId, "all"] as const,
    queryFn: () => sellersProvider.list({ storeId: conversation.storeId }),
    staleTime: 60_000,
    enabled: leadMenuAction === "qualify",
  });
  const sellers = sellersQuery.data ?? [];
```

- [ ] **Step 5: Add the `qualifyOpen` dialog state**

Replace:

```ts
  const [transferOpen, setTransferOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [syncingPhoto, setSyncingPhoto] = useState(false);
```

with:

```ts
  const [transferOpen, setTransferOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [qualifyOpen, setQualifyOpen] = useState(false);
  const [syncingPhoto, setSyncingPhoto] = useState(false);
```

- [ ] **Step 6: Render the menu items**

Replace:

```ts
          {canAddNote && customer && (
            <>
              <DropdownMenuSeparator />
              {/* Renaming the contact edits the customer — same own-scope permission. */}
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <Icon icon="mdi:rename-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.renameContact}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
                <Icon icon="mdi:note-plus-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.addNote}
              </DropdownMenuItem>
            </>
          )}
```

with:

```ts
          {canAddNote && customer && (
            <>
              <DropdownMenuSeparator />
              {/* Renaming the contact edits the customer — same own-scope permission. */}
              <DropdownMenuItem onSelect={() => setRenameOpen(true)}>
                <Icon icon="mdi:rename-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.renameContact}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setNoteOpen(true)}>
                <Icon icon="mdi:note-plus-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.addNote}
              </DropdownMenuItem>
            </>
          )}
          {leadMenuAction === "qualify" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setQualifyOpen(true)}>
                <Icon icon="mdi:account-convert-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.qualifyAsLead}
              </DropdownMenuItem>
            </>
          )}
          {leadMenuAction === "view" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() =>
                  void navigate({
                    to: "/app/leads/$id",
                    params: { id: conversation.leadId as ID },
                  })
                }
              >
                <Icon icon="mdi:account-arrow-right-outline" size={14} className="mr-2" />
                {CONVERSATION_STRINGS.menu.viewLead}
              </DropdownMenuItem>
            </>
          )}
```

- [ ] **Step 7: Render the modal alongside the other dialogs**

Replace:

```ts
      {customer && (
        <RenameContactDialog
          customer={customer}
          open={renameOpen}
          onOpenChange={setRenameOpen}
          onRenamed={() => onMutated?.()}
        />
      )}
    </>
  );
}
```

with:

```ts
      {customer && (
        <RenameContactDialog
          customer={customer}
          open={renameOpen}
          onOpenChange={setRenameOpen}
          onRenamed={() => onMutated?.()}
        />
      )}

      <NewLeadModal
        open={qualifyOpen}
        onClose={() => setQualifyOpen(false)}
        stages={stages}
        sellers={sellers}
        conversationId={conversation.id}
        initialName={contact?.name}
        initialPhone={contact?.phone}
        onCreated={(createdLead) => {
          setQualifyOpen(false);
          onMutated?.();
          toast.success(CONVERSATION_STRINGS.leadQualified, {
            action: {
              label: CONVERSATION_STRINGS.menu.viewLead,
              onClick: () =>
                void navigate({ to: "/app/leads/$id", params: { id: createdLead.id } }),
            },
          });
        }}
      />
    </>
  );
}
```

Note: `lead` (destructured in Step 4) is intentionally unused by this task's JSX — Step 6 reads `conversation.leadId` directly and never needs `lead`'s fields. This is safe here: `tsconfig.json` has `noUnusedLocals`/`noUnusedParameters` set to `false` and `eslint.config.js` has `@typescript-eslint/no-unused-vars` set to `"off"`, so an unused destructured prop raises neither a type error nor a lint error. It stays in the props so `ConversationPage.tsx` doesn't need a second, unrelated prop-shape change, and so a future task can render richer "already a lead" details without touching the prop contract again.

- [ ] **Step 8: Update `ConversationPage.tsx` to pass `contact`**

In `src/features/conversations/pages/ConversationPage.tsx`, replace:

```tsx
                menuSlot={
                  <ConversationMenu
                    conversation={conversation}
                    customer={customer}
                    lead={lead}
                    onMutated={detail.refresh}
                    statusControlMode={statusControlMode}
                    onStatusControlModeChange={setStatusControlMode}
                  />
                }
```

with:

```tsx
                menuSlot={
                  <ConversationMenu
                    conversation={conversation}
                    customer={customer}
                    lead={lead}
                    contact={contact}
                    onMutated={detail.refresh}
                    statusControlMode={statusControlMode}
                    onStatusControlModeChange={setStatusControlMode}
                  />
                }
```

`contact` is already destructured from `detail` earlier in this file (`const { conversation, customer, lead, contact, whatsappAccount, assignedSeller, collaborators } = detail;`) — no new data fetch needed.

- [ ] **Step 9: Type-check the new/changed files**

Run: `bunx tsc --noEmit`
Expected: no NEW errors in `src/features/conversations/components/ConversationMenu.tsx`, `src/features/conversations/pages/ConversationPage.tsx`, `src/features/leads/components/NewLeadModal.tsx`, or `src/features/conversations/utils/leadMenuAction.ts`. The repo has a pre-existing `tsc` baseline unrelated to this change — diff the error file list against `git diff --name-status main...HEAD --diff-filter=AM` to confirm nothing new leaks in from these four files specifically.

- [ ] **Step 10: Run the full test suite and lint**

Run: `bun run test`
Expected: PASS, including the 6 new `leadMenuAction` tests from Task 1.

Run: `bun run lint`
Expected: no new errors in the files touched by this task.

- [ ] **Step 11: Commit**

```bash
git add src/features/conversations/components/ConversationMenu.tsx src/features/conversations/i18n/pt-BR.ts src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat: add \"Qualificar como lead\" / \"Ver lead\" to the conversation menu"
```

---

### Task 4: Manual verification

**Files:** none (no code changes — this task only runs and observes).

**Interfaces:** none.

- [ ] **Step 1: Full automated gate**

Run, in order:

```bash
bun run test
bun run lint
bun run build
```

Expected: all three succeed. `bun run build` does not type-check (Vite/esbuild transpiles without checking types — see `CLAUDE.md`); the type-check already ran in Task 3 Step 9.

- [ ] **Step 2: Manual smoke test (dev server, `mock` data source)**

Run: `bun run dev`

In the browser:
1. Open any conversation in the Inbox whose contact is neither a customer nor a lead yet (a fresh WhatsApp conversation in the mock seed). Open the "⋮" menu — confirm **"Qualificar como lead"** appears.
2. Click it — confirm the "Novo lead" dialog opens with name/phone already filled from the conversation's contact, origin locked to WhatsApp.
3. Fill in the remaining required fields (temperature is pre-selected; stage defaults to the first pipeline stage) and save.
4. Confirm: a success toast appears with a "Ver lead" action; the dialog closes; opening the "⋮" menu again now shows **"Ver lead"** instead of "Qualificar como lead"; clicking it navigates to `/app/leads/$id` for the lead just created.
5. Open that lead's detail page — confirm the "Conversas" tab lists the conversation just qualified (exercises `lead.conversations`).
6. Open a conversation that already has a linked customer — confirm neither "Qualificar como lead" nor "Ver lead" appears in the menu.

- [ ] **Step 3: Report results**

Summarize pass/fail for each of the 6 manual checks above, plus the automated gate, before considering this plan complete. Do not claim success without having actually run the dev server and clicked through this flow (per `superpowers:verification-before-completion`).
