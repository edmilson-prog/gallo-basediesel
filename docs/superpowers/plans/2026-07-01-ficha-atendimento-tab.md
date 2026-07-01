# Aba "Atendimento" na ficha do cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Atendimento" tab to the customer fiche (`ProfileTabs`) that becomes the default tab in both places the fiche renders (the Atendimento column/drawer and the full `/app/clientes/:id` page), and move the existing pending-contact banner into it alongside three read/edit context blocks (conversation status, assignee, WhatsApp origin) that only appear when the fiche is opened from within a conversation.

**Architecture:** Pure composition of existing components — no new business logic, no backend changes. One new file (`AtendimentoTab.tsx`) plus targeted edits to `ProfileTabs.tsx`, `ProfileHeader.tsx`, `CustomerProfile.tsx`, `CustomerProfileFiche.tsx`, `ConversationPage.tsx`, and `CustomerDetailPage.tsx`. The three context values (`assignedSeller`, `whatsappAccount`, a `refresh` callback) are already resolved by `useConversationDetail` inside `ConversationPage` — they are threaded down as props through the same chain that already threads `conversation`, instead of being re-fetched.

**Tech Stack:** React 19, TanStack Router/Query, Tailwind v4 + shadcn/ui, Iconify (`mdi:*`), Vitest (no jsdom — logic-only tests in this repo).

## Global Constraints

- 100% frontend. No Supabase migration, RLS policy, RPC, or Edge Function change — every field consumed (`customer.tags`, `conversation.status`/`assignedSellerId`/`whatsappAccountId`) already exists.
- Reuse existing components **verbatim** — `StatusControl`, `AssigneeChip`, `OriginChip`, `PendingContactBanner`. Do not fork or duplicate their internals.
- TypeScript `strict: true`. No `any`. Interfaces prefixed with `I`.
- User-facing copy in português do Brasil with correct accents (ã, ç, é, í, ó, ú, â, ê, ô).
- New tab component file uses **PascalCase** (`AtendimentoTab.tsx`), matching the existing sibling convention in `src/features/customers/components/tabs/` (`OverviewTab.tsx`, `OrdersTab.tsx`, …) — this locally overrides the project's default kebab-case file rule, per "follow existing patterns" (CLAUDE.md).
- No new npm dependency.
- This repo has no jsdom/testing-library — component-level "tests" are `bunx tsc --noEmit` (type-check, evaluated **by delta**: the project has a pre-existing baseline of `tsc` errors unrelated to this work — only new errors in files this plan touches count) + `bun run test` (the existing Vitest suite must stay fully green) + a manual QA pass (final task).

---

## Task 1: Baseline check

Establish the pre-existing `tsc`/test state so every later task can be judged by delta, not by the project's existing baseline noise.

**Files:** none (read-only verification)

- [ ] **Step 1: Run the full test suite and record the result**

Run: `bun run test`
Expected: all suites pass (record the pass count — this must not change through Task 8).

- [ ] **Step 2: Run the type checker and record the baseline error count**

Run: `bunx tsc --noEmit`
Expected: some pre-existing errors are normal (documented project-wide baseline). Record the count and the list of files — none of the files this plan touches (`ProfileTabs.tsx`, `ProfileHeader.tsx`, `CustomerProfile.tsx`, `CustomerProfileFiche.tsx`, `ConversationPage.tsx`, `CustomerDetailPage.tsx`, the new `AtendimentoTab.tsx`, `pt-BR.ts`) should be in the baseline list. If any of them already have baseline errors, note them so later deltas are computed correctly.

No commit for this task — it's a reference point, not a change.

---

## Task 2: i18n strings

**Files:**
- Modify: `src/features/customers/i18n/pt-BR.ts:47-56`

**Interfaces:**
- Produces: `CUSTOMER_STRINGS.tabs.atendimento: string`, `CUSTOMER_STRINGS.atendimento.status/assignee/origin/empty/pendingHint: string` — consumed by Task 3 and Task 4.

- [ ] **Step 1: Add the new tab label and the new `atendimento` copy block**

In `src/features/customers/i18n/pt-BR.ts`, change the `tabs` block:

```ts
  tabs: {
    overview: "Visão geral",
```

to:

```ts
  tabs: {
    atendimento: "Atendimento",
    overview: "Visão geral",
```

Then, right after the `tabs` block closes (before the `overview: {` block that starts at line 57), insert a new top-level block:

```ts
  atendimento: {
    status: "Status da conversa",
    assignee: "Atendente responsável",
    origin: "Respondendo por",
    empty: "Nenhuma pendência de atendimento no momento.",
    pendingHint: "pendência de revisão",
  },
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors (this is a pure additive object literal change; `CUSTOMER_STRINGS` is `as const`, so the new keys are immediately available as literal types).

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/i18n/pt-BR.ts
git commit -m "feat(customers): add i18n strings for the Atendimento tab"
```

---

## Task 3: New `AtendimentoTab` component

**Files:**
- Create: `src/features/customers/components/tabs/AtendimentoTab.tsx`

**Interfaces:**
- Consumes: `CUSTOMER_STRINGS.atendimento.*` (Task 2); `PendingContactBanner` from `@/features/contact-review` (props: `customer: ICustomer`, `conversation?: IConversation | null`); `AssigneeChip` from `@/features/conversations/components/AssigneeChip` (props: `seller: ISeller | null`, `variant?: "compact" | "full"`); `OriginChip` from `@/features/conversations/components/OriginChip` (props: `account: IWhatsAppAccount | null`, `variant?: "dot" | "label" | "full"`); `StatusControl` from `@/features/conversations/components/status/StatusControl` (props: `conversation: IConversation`, `mode: "pill" | "menu" | "segmented"`, `onChanged?: () => void`).
- Produces: `AtendimentoTab` component, props `{ customer: ICustomer; conversation?: IConversation | null; assignedSeller?: ISeller | null; whatsappAccount?: IWhatsAppAccount | null; onConversationChanged?: () => void }` — consumed by Task 4.

- [ ] **Step 1: Create the file**

```tsx
import type { ReactNode } from "react";
import type { IConversation, ICustomer, ISeller, IWhatsAppAccount } from "@/shared/types";
import { PendingContactBanner } from "@/features/contact-review";
import { AssigneeChip } from "@/features/conversations/components/AssigneeChip";
import { OriginChip } from "@/features/conversations/components/OriginChip";
import { StatusControl } from "@/features/conversations/components/status/StatusControl";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.atendimento;

export interface IAtendimentoTabProps {
  customer: ICustomer;
  /** Conversation currently open in the Atendimento screen — absent on the standalone /app/clientes/:id page. */
  conversation?: IConversation | null;
  /** Resolved from conversation.assignedSellerId by the caller (ConversationPage) — never re-fetched here. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — never re-fetched here. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Bubbles a StatusControl change up so the caller can refresh its own conversation cache. */
  onConversationChanged?: () => void;
}

function ContextRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">{children}</span>
    </div>
  );
}

export function AtendimentoTab({
  customer,
  conversation,
  assignedSeller,
  whatsappAccount,
  onConversationChanged,
}: IAtendimentoTabProps) {
  const showBanner =
    customer.tags.includes("pending_review") || customer.tags.includes("reviewed_not_customer");

  if (!showBanner && !conversation) {
    return <p className="p-3 text-xs text-muted-foreground">{COPY.empty}</p>;
  }

  return (
    <div className="space-y-3">
      {showBanner && <PendingContactBanner customer={customer} conversation={conversation} />}

      {conversation && (
        <section className="divide-y divide-border rounded-lg border border-border bg-background px-3">
          <ContextRow label={COPY.status}>
            <StatusControl
              conversation={conversation}
              mode="menu"
              onChanged={onConversationChanged}
            />
          </ContextRow>
          {assignedSeller && (
            <ContextRow label={COPY.assignee}>
              <AssigneeChip seller={assignedSeller} variant="compact" />
            </ContextRow>
          )}
          {whatsappAccount && (
            <ContextRow label={COPY.origin}>
              <OriginChip account={whatsappAccount} variant="label" />
            </ContextRow>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors involving `AtendimentoTab.tsx` (it isn't imported anywhere yet, so this only validates the file in isolation).

- [ ] **Step 3: Commit**

```bash
git add src/features/customers/components/tabs/AtendimentoTab.tsx
git commit -m "feat(customers): add AtendimentoTab component"
```

---

## Task 4: Wire `AtendimentoTab` into `ProfileTabs`

**Files:**
- Modify: `src/features/customers/components/ProfileTabs.tsx`

**Interfaces:**
- Consumes: `AtendimentoTab` (Task 3), `CUSTOMER_STRINGS.atendimento.pendingHint` (Task 2).
- Produces: `ProfileTabs` gains 3 new optional props — `assignedSeller?: ISeller | null`, `whatsappAccount?: IWhatsAppAccount | null`, `onConversationChanged?: () => void` — consumed by Task 6 (`CustomerProfile.tsx`). `TabKey` gains `"atendimento"`.

- [ ] **Step 1: Add the new type imports and the `AtendimentoTab` import**

Change line 2:

```ts
import type { IConversation, ICustomer } from "@/shared/types";
```

to:

```ts
import type { IConversation, ICustomer, ISeller, IWhatsAppAccount } from "@/shared/types";
```

Add this import right before the `OverviewTab` import (currently line 9):

```ts
import { AtendimentoTab } from "./tabs/AtendimentoTab";
```

- [ ] **Step 2: Extend `IProfileTabsProps`**

Change:

```ts
export interface IProfileTabsProps {
  customer: ICustomer;
  conversation?: IConversation | null;
  /** Controlled active tab (optional). Falls back to internal state. */
  activeTab?: TabKey;
  onActiveTabChange?: (tab: TabKey) => void;
  /** Layout density of the Overview tab. */
  overviewVariant?: "column" | "page";
  /**
   * Render the tab bar as icon-only triggers with tooltips, for the narrow
   * lateral fiche where the text labels overflow. Defaults to text labels.
   */
  iconOnlyTabs?: boolean;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}
```

to:

```ts
export interface IProfileTabsProps {
  customer: ICustomer;
  conversation?: IConversation | null;
  /** Resolved from conversation.assignedSellerId by the caller — feeds the Atendimento tab. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — feeds the Atendimento tab. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Bubbles a StatusControl change up to the caller's conversation refresh. */
  onConversationChanged?: () => void;
  /** Controlled active tab (optional). Falls back to internal state. */
  activeTab?: TabKey;
  onActiveTabChange?: (tab: TabKey) => void;
  /** Layout density of the Overview tab. */
  overviewVariant?: "column" | "page";
  /**
   * Render the tab bar as icon-only triggers with tooltips, for the narrow
   * lateral fiche where the text labels overflow. Defaults to text labels.
   */
  iconOnlyTabs?: boolean;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}
```

- [ ] **Step 3: Add `"atendimento"` to `TabKey`, `TAB_ORDER`, `TAB_ICONS`**

Change:

```ts
export type TabKey =
  | "overview"
  | "orders"
  | "quotes"
  | "vehicles"
  | "conversations"
  | "midias"
  | "notes"
  | "recommendations";

const TAB_ORDER: TabKey[] = [
  "overview",
  "orders",
  "quotes",
  "vehicles",
  "conversations",
  "midias",
  "notes",
  "recommendations",
];

/** Iconify glyph per tab — used by the icon-only lateral fiche. */
const TAB_ICONS: Record<TabKey, string> = {
  overview: "mdi:account-details-outline",
  orders: "mdi:package-variant-closed",
  quotes: "mdi:file-document-outline",
  vehicles: "mdi:truck-outline",
  conversations: "mdi:chat-outline",
  midias: "mdi:image-multiple-outline",
  notes: "mdi:note-text-outline",
  recommendations: "mdi:lightbulb-outline",
};
```

to:

```ts
export type TabKey =
  | "atendimento"
  | "overview"
  | "orders"
  | "quotes"
  | "vehicles"
  | "conversations"
  | "midias"
  | "notes"
  | "recommendations";

const TAB_ORDER: TabKey[] = [
  "atendimento",
  "overview",
  "orders",
  "quotes",
  "vehicles",
  "conversations",
  "midias",
  "notes",
  "recommendations",
];

/** Iconify glyph per tab — used by the icon-only lateral fiche. */
const TAB_ICONS: Record<TabKey, string> = {
  atendimento: "mdi:face-agent",
  overview: "mdi:account-details-outline",
  orders: "mdi:package-variant-closed",
  quotes: "mdi:file-document-outline",
  vehicles: "mdi:truck-outline",
  conversations: "mdi:chat-outline",
  midias: "mdi:image-multiple-outline",
  notes: "mdi:note-text-outline",
  recommendations: "mdi:lightbulb-outline",
};
```

- [ ] **Step 4: Add the pending-dot indicator to `ProfileTabTrigger`**

Change:

```tsx
function ProfileTabTrigger({
  value,
  label,
  icon,
  iconOnly,
}: {
  value: string;
  label: string;
  icon: string;
  iconOnly: boolean;
}) {
  if (!iconOnly) {
    return (
      <TabsTrigger value={value} className={cn(TRIGGER_BASE, "px-3")}>
        {label}
      </TabsTrigger>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTrigger
          value={value}
          aria-label={label}
          className={cn(TRIGGER_BASE, "flex flex-1 items-center justify-center px-0")}
        >
          <Icon icon={icon} size={17} />
        </TabsTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
```

to:

```tsx
function ProfileTabTrigger({
  value,
  label,
  icon,
  iconOnly,
  showPendingDot,
}: {
  value: string;
  label: string;
  icon: string;
  iconOnly: boolean;
  /** Renders a small warning dot over the icon — only ever passed for the Atendimento tab. */
  showPendingDot?: boolean;
}) {
  const accessibleLabel = showPendingDot
    ? `${label} — ${CUSTOMER_STRINGS.atendimento.pendingHint}`
    : label;
  const dot = showPendingDot ? (
    <span aria-hidden className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-warning" />
  ) : null;
  if (!iconOnly) {
    return (
      <TabsTrigger value={value} className={cn(TRIGGER_BASE, "relative px-3")}>
        {label}
        {dot}
      </TabsTrigger>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <TabsTrigger
          value={value}
          aria-label={accessibleLabel}
          className={cn(TRIGGER_BASE, "relative flex flex-1 items-center justify-center px-0")}
        >
          <Icon icon={icon} size={17} />
          {dot}
        </TabsTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom">{accessibleLabel}</TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 5: Destructure the new props, default the active tab to `"atendimento"`, pass `showPendingDot`, add the new `TabsContent`**

Change:

```tsx
export function ProfileTabs({
  customer,
  conversation,
  activeTab,
  onActiveTabChange,
  overviewVariant = "column",
  iconOnlyTabs = false,
  copilotTab,
}: IProfileTabsProps) {
  // `activeString` accepts any tab value including the dynamic "copilot" extra tab.
  const [internalString, setInternalString] = useState<string>("overview");
```

to:

```tsx
export function ProfileTabs({
  customer,
  conversation,
  assignedSeller,
  whatsappAccount,
  onConversationChanged,
  activeTab,
  onActiveTabChange,
  overviewVariant = "column",
  iconOnlyTabs = false,
  copilotTab,
}: IProfileTabsProps) {
  // `activeString` accepts any tab value including the dynamic "copilot" extra tab.
  const [internalString, setInternalString] = useState<string>("atendimento");
```

Change the trigger loop:

```tsx
            {TAB_ORDER.map((key) => (
              <ProfileTabTrigger
                key={key}
                value={key}
                label={CUSTOMER_STRINGS.tabs[key]}
                icon={TAB_ICONS[key]}
                iconOnly={iconOnlyTabs}
              />
            ))}
```

to:

```tsx
            {TAB_ORDER.map((key) => (
              <ProfileTabTrigger
                key={key}
                value={key}
                label={CUSTOMER_STRINGS.tabs[key]}
                icon={TAB_ICONS[key]}
                iconOnly={iconOnlyTabs}
                showPendingDot={key === "atendimento" && customer.tags.includes("pending_review")}
              />
            ))}
```

Add the new `TabsContent` right before the existing `<TabsContent value="overview" ...>` block:

```tsx
        <TabsContent value="atendimento" className="m-0 p-3 focus-visible:outline-none">
          {activeString === "atendimento" && (
            <AtendimentoTab
              customer={customer}
              conversation={conversation}
              assignedSeller={assignedSeller}
              whatsappAccount={whatsappAccount}
              onConversationChanged={onConversationChanged}
            />
          )}
        </TabsContent>
```

- [ ] **Step 6: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors. (`CustomerProfile.tsx`/`CustomerDetailPage.tsx` calling `<ProfileTabs>` without the 3 new props still compiles — they're optional.)

- [ ] **Step 7: Run the full test suite**

Run: `bun run test`
Expected: same pass count as Task 1's baseline (no logic under test here, but this catches accidental breakage).

- [ ] **Step 8: Commit**

```bash
git add src/features/customers/components/ProfileTabs.tsx
git commit -m "feat(customers): wire the Atendimento tab as the fiche's default tab"
```

---

## Task 5: Remove the pending-contact banner from `ProfileHeader`

**Files:**
- Modify: `src/features/customers/components/ProfileHeader.tsx:16` (import) and `:71-73` (render block)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this only removes now-duplicated UI (the banner already renders inside the Atendimento tab as of Task 4).

- [ ] **Step 1: Remove the import**

Delete this line:

```ts
import { PendingContactBanner } from "@/features/contact-review";
```

- [ ] **Step 2: Remove the conditional render block**

Delete:

```tsx
      {(customer.tags.includes("pending_review") || customer.tags.includes("reviewed_not_customer")) && (
        <PendingContactBanner customer={customer} conversation={conversation} />
      )}

```

(Leave the surrounding `<ProfileContactRow customer={customer} />` and `<CoverageBanner customer={customer} />` lines untouched — only the banner block and its blank line go.)

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full test suite**

Run: `bun run test`
Expected: same pass count as baseline.

- [ ] **Step 5: Commit**

```bash
git add src/features/customers/components/ProfileHeader.tsx
git commit -m "refactor(customers): remove pending-contact banner from ProfileHeader (moved to Atendimento tab)"
```

---

## Task 6: Thread `assignedSeller`/`whatsappAccount`/`onConversationChanged` end-to-end

**Files:**
- Modify: `src/features/customers/components/CustomerProfile.tsx`
- Modify: `src/features/customers/components/CustomerProfileFiche.tsx`
- Modify: `src/features/conversations/pages/ConversationPage.tsx:250-264`

**Interfaces:**
- Consumes: `ProfileTabs`'s new props (Task 4); `detail.assignedSeller: ISeller | null`, `detail.whatsappAccount: IWhatsAppAccount | null`, `detail.refresh: () => void` — all already returned by `useConversationDetail` (`src/features/conversations/hooks/useConversationDetail.ts:31-41`), already destructured at `ConversationPage.tsx:161`.
- Produces: `CustomerProfile` and `CustomerProfileFiche` gain the same 3 optional props, threaded straight through — no new state, no new query.

- [ ] **Step 1: `CustomerProfile.tsx` — extend props and pass them to `ProfileTabs`**

Change the type import (line 1):

```ts
import type { ID, IConversation } from "@/shared/types";
```

to:

```ts
import type { ID, IConversation, ISeller, IWhatsAppAccount } from "@/shared/types";
```

Change the props interface:

```ts
export interface ICustomerProfileProps {
  customerId: ID;
  /**
   * When the fiche is rendered inside a conversation viewer, this is the
   * conversation currently being read. Used to mark the "Conversa atual"
   * badge in the Conversations tab and to deep-link "Criar orçamento" with
   * `conversationId` query param.
   */
  conversation?: IConversation | null;
  /** Layout density — `column` is the lateral 360px panel; `page` is the full route. */
  variant?: "column" | "page";
  className?: string;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}
```

to:

```ts
export interface ICustomerProfileProps {
  customerId: ID;
  /**
   * When the fiche is rendered inside a conversation viewer, this is the
   * conversation currently being read. Used to mark the "Conversa atual"
   * badge in the Conversations tab and to deep-link "Criar orçamento" with
   * `conversationId` query param.
   */
  conversation?: IConversation | null;
  /** Resolved from conversation.assignedSellerId by the caller — feeds the Atendimento tab. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — feeds the Atendimento tab. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Bubbles a StatusControl change up to the caller's conversation refresh. */
  onConversationChanged?: () => void;
  /** Layout density — `column` is the lateral 360px panel; `page` is the full route. */
  variant?: "column" | "page";
  className?: string;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}
```

Change the function signature:

```tsx
export function CustomerProfile({
  customerId,
  conversation = null,
  variant = "column",
  className,
  copilotTab,
}: ICustomerProfileProps) {
```

to:

```tsx
export function CustomerProfile({
  customerId,
  conversation = null,
  assignedSeller = null,
  whatsappAccount = null,
  onConversationChanged,
  variant = "column",
  className,
  copilotTab,
}: ICustomerProfileProps) {
```

Change the `<ProfileTabs>` call:

```tsx
        <ProfileTabs
          customer={customer}
          conversation={conversation}
          iconOnlyTabs={variant === "column"}
          copilotTab={copilotTab}
        />
```

to:

```tsx
        <ProfileTabs
          customer={customer}
          conversation={conversation}
          assignedSeller={assignedSeller}
          whatsappAccount={whatsappAccount}
          onConversationChanged={onConversationChanged}
          iconOnlyTabs={variant === "column"}
          copilotTab={copilotTab}
        />
```

- [ ] **Step 2: `CustomerProfileFiche.tsx` — extend props and pass them to both `<CustomerProfile>` call sites**

Change the type import (line 1):

```ts
import type { IConversation, ID } from "@/shared/types";
```

to:

```ts
import type { IConversation, ID, ISeller, IWhatsAppAccount } from "@/shared/types";
```

Change the props interface:

```ts
export interface ICustomerProfileFicheProps {
  customerId: ID;
  conversation: IConversation;
  /** Drawer open state from `useConversationFiche()`. */
  open: boolean;
  /** Drawer close handler. */
  onOpenChange: (open: boolean) => void;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}
```

to:

```ts
export interface ICustomerProfileFicheProps {
  customerId: ID;
  conversation: IConversation;
  /** Resolved from conversation.assignedSellerId by the caller — feeds the Atendimento tab. */
  assignedSeller?: ISeller | null;
  /** Resolved from conversation.whatsappAccountId by the caller — feeds the Atendimento tab. */
  whatsappAccount?: IWhatsAppAccount | null;
  /** Bubbles a StatusControl change up to the caller's conversation refresh. */
  onConversationChanged?: () => void;
  /** Drawer open state from `useConversationFiche()`. */
  open: boolean;
  /** Drawer close handler. */
  onOpenChange: (open: boolean) => void;
  /** Optional "Copiloto" tab content injected by the conversation screen (PRD-025). */
  copilotTab?: React.ReactNode;
}
```

Change the function signature:

```tsx
export function CustomerProfileFiche({
  customerId,
  conversation,
  open,
  onOpenChange,
  copilotTab,
}: ICustomerProfileFicheProps) {
```

to:

```tsx
export function CustomerProfileFiche({
  customerId,
  conversation,
  assignedSeller,
  whatsappAccount,
  onConversationChanged,
  open,
  onOpenChange,
  copilotTab,
}: ICustomerProfileFicheProps) {
```

Change the drawer-mode `<CustomerProfile>` call:

```tsx
          <CustomerProfile
            customerId={customerId}
            conversation={conversation}
            variant="column"
            className="h-full border-l-0"
            copilotTab={copilotTab}
          />
```

to:

```tsx
          <CustomerProfile
            customerId={customerId}
            conversation={conversation}
            assignedSeller={assignedSeller}
            whatsappAccount={whatsappAccount}
            onConversationChanged={onConversationChanged}
            variant="column"
            className="h-full border-l-0"
            copilotTab={copilotTab}
          />
```

Change the column-mode `<CustomerProfile>` call:

```tsx
        <CustomerProfile
          customerId={customerId}
          conversation={conversation}
          variant="column"
          className="h-full"
          copilotTab={copilotTab}
        />
```

to:

```tsx
        <CustomerProfile
          customerId={customerId}
          conversation={conversation}
          assignedSeller={assignedSeller}
          whatsappAccount={whatsappAccount}
          onConversationChanged={onConversationChanged}
          variant="column"
          className="h-full"
          copilotTab={copilotTab}
        />
```

- [ ] **Step 3: `ConversationPage.tsx` — pass the already-resolved values down**

Change the `<CustomerProfileFiche>` call (currently lines 250–264):

```tsx
            {conversation.customerId && (
              <CustomerProfileFiche
                customerId={conversation.customerId}
                conversation={conversation}
                open={fiche.open}
                onOpenChange={fiche.setOpen}
                copilotTab={
```

to:

```tsx
            {conversation.customerId && (
              <CustomerProfileFiche
                customerId={conversation.customerId}
                conversation={conversation}
                assignedSeller={assignedSeller}
                whatsappAccount={whatsappAccount}
                onConversationChanged={detail.refresh}
                open={fiche.open}
                onOpenChange={fiche.setOpen}
                copilotTab={
```

(`assignedSeller` and `whatsappAccount` are already destructured from `detail` at `ConversationPage.tsx:161` — no new query, no new import needed.)

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Run the full test suite**

Run: `bun run test`
Expected: same pass count as baseline.

- [ ] **Step 6: Commit**

```bash
git add src/features/customers/components/CustomerProfile.tsx src/features/customers/components/CustomerProfileFiche.tsx src/features/conversations/pages/ConversationPage.tsx
git commit -m "feat(customers): thread assignee/origin/status-refresh into the fiche's Atendimento tab"
```

---

## Task 7: Default tab on the full customer page

**Files:**
- Modify: `src/features/customers/pages/CustomerDetailPage.tsx:27`

**Interfaces:**
- Consumes: `TabKey` (Task 4, now includes `"atendimento"`).
- Produces: nothing new — same page, new initial tab.

- [ ] **Step 1: Change the initial `activeTab` state**

Change:

```tsx
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
```

to:

```tsx
  const [activeTab, setActiveTab] = useState<TabKey>("atendimento");
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`
Expected: same pass count as baseline.

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/pages/CustomerDetailPage.tsx
git commit -m "feat(customers): default the full customer page to the Atendimento tab"
```

---

## Task 8: Final verification & manual QA

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `bun run build`
Expected: succeeds (this also copies the changelog via the `prebuild` hook — unrelated to this change, just confirm it doesn't fail).

- [ ] **Step 2: Full type-check delta**

Run: `bunx tsc --noEmit`
Expected: error count/file list identical to Task 1's baseline — zero new errors in any file this plan touched.

- [ ] **Step 3: Full test suite**

Run: `bun run test`
Expected: same pass count as Task 1's baseline.

- [ ] **Step 4: Manual QA checklist (performed by the project owner in the browser — this agent does not drive a browser for this repo)**

In both contexts — the Atendimento column/drawer (`/app/atendimento/:id`) and the full page (`/app/clientes/:id`) — verify:

- [ ] Opening any customer's fiche lands on the **"Atendimento"** tab (not "Visão geral").
- [ ] A customer tagged `pending_review` shows the banner with **Converter**/**Descartar** inside the Atendimento tab (not above the tabs anymore).
- [ ] A customer tagged `reviewed_not_customer` shows the neutral **Restaurar** card inside the tab.
- [ ] A customer with neither tag, opened **from a conversation**, shows the context card (status/atendente/origem) with no banner.
- [ ] A customer with neither tag, opened from the **full page directly** (no conversation), shows the empty-state message, not a blank pane.
- [ ] From the Atendimento column: navigate away to another tab (e.g. "Pedidos"), confirm the **orange dot** appears over the Atendimento tab icon (icon-only mode) when the customer is `pending_review` — and does **not** appear for `reviewed_not_customer`.
- [ ] Changing the conversation status via the `StatusControl` inside the tab updates the pill immediately, and the header's own `StatusControl` (same conversation) reflects the same status without a manual page refresh.
- [ ] A conversation with no assigned seller omits the "Atendente responsável" row entirely (no empty row).
- [ ] A conversation with no resolvable WhatsApp account omits the "Respondendo por" row entirely.
- [ ] "Visão geral" tab still renders all of its existing cards unchanged, just no longer the default.
- [ ] Screen reader / keyboard: tab through the tab bar, confirm the Atendimento trigger's accessible name mentions the pending state when applicable (icon-only mode — check via the browser's accessibility tree or the tooltip text).

No commit for this task (verification only). If any checklist item fails, fix forward with a new commit before considering the plan complete.
