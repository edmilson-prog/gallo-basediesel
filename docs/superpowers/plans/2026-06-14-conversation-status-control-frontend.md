# Conversation Status Control & Visual (Frontend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give attendants a visible, three-mode control to change a conversation's status from the header, unify the status visual language onto semantic tokens, and make the inbox accessible (icon + shape + label, not color alone) — all frontend-only, no server changes.

**Architecture:** A single `STATUS_META` map (in `conversationDisplay.ts`) becomes the one source of status visuals, consumed by the header pill, the list border, and the new control. A `StatusControl` component renders one of three interaction modes (pill-selector / menu / segmented); the active mode is a per-device preference (`useStatusControlMode`, localStorage) flipped by a discreet `StatusControlModeSwitcher` in the header. Status writes reuse the existing `conversations.update(id, { status })` provider call through a small `useConversationStatusActions` hook (await + `detail.refresh`, mirroring `ConversationMenu`). Archiving stays in the kebab (separate axis).

**Tech Stack:** React 19, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind v4 + shadcn/ui, TanStack Router, Vitest (pure logic only), bun.

**Testing approach (read first):** This codebase unit-tests **pure functions** with Vitest (node env) and verifies React components / typed data via `bunx tsc --noEmit` (delta), `bun run build`, `bun run lint`, and manual UI check (the owner tests UI by hand). So: the pure mode-normalizer (Task 3) is TDD'd with a real Vitest test; typed maps and components are gated by tsc/build/lint. Do **not** invent jsdom component tests — they are not used here.

**Conventions to respect:**
- Commit trailer EXACTLY: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` (no "(1M context)").
- `git add` files BY NAME (never `-A`/`.`). Never commit `src/routeTree.gen.ts` or `vite.config.ts`.
- CRLF lint errors (`Delete ␍`) are false positives from `autocrlf=true` — ignore them; verify real lint errors by filtering out `prettier/prettier`.
- pt-BR with correct accents for all user-facing strings.
- Semantic tokens only (`severity-*`, `primary`, `muted`) — no raw colors.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/features/conversations/i18n/pt-BR.ts` (modify) | Status labels (rename "Em andamento" → "Em atendimento"), aria labels, control strings. |
| `src/features/conversations/utils/conversationDisplay.ts` (modify) | New `STATUS_META` (icon/classes/shape) replacing `STATUS_BORDER`. |
| `src/features/conversations/engine/statusControlMode.ts` (new) | Pure: mode type, list, normalizer, default. |
| `src/features/conversations/engine/statusControlMode.test.ts` (new) | Vitest for the normalizer. |
| `src/features/conversations/hooks/useStatusControlMode.ts` (new) | Per-device persisted preference (localStorage). |
| `src/features/conversations/hooks/useConversationStatusActions.ts` (new) | Status mutation (update + audit + toast + refresh). |
| `src/features/conversations/components/status/StatusControl.tsx` (new) | Three-mode control (pill / menu / segmented) + Resolver. |
| `src/features/conversations/components/status/StatusControlModeSwitcher.tsx` (new) | Discreet header switcher for the mode. |
| `src/features/conversations/components/ConversationHeader.tsx` (modify) | Drop static pill + `STATUS_TONE`; mount control + switcher; add `onConversationUpdated`. |
| `src/features/conversations/components/ConversationListItem.tsx` (modify) | Border via `STATUS_META`; status in `aria-label`. |
| `src/features/conversations/pages/ConversationPage.tsx` (modify) | Pass `onConversationUpdated={detail.refresh}`. |

---

### Task 1: i18n strings (labels + control)

**Files:**
- Modify: `src/features/conversations/i18n/pt-BR.ts`

- [ ] **Step 1: Rename the filter label for `em_andamento`**

In `INBOX_STRINGS.statusOptions` (around line 42), change:

```ts
    em_andamento: "Em andamento",
```
to:
```ts
    em_andamento: "Em atendimento",
```

- [ ] **Step 2: Extend `ariaListItem` to include status**

Replace `INBOX_STRINGS.ariaListItem` (around lines 145-148) with:

```ts
  ariaListItem: (params: { name: string; when: string; unread: number; status?: string }) =>
    `Conversa com ${params.name}, última mensagem ${params.when}${
      params.unread > 0 ? `, ${params.unread} não lida${params.unread === 1 ? "" : "s"}` : ""
    }${params.status ? `, status: ${params.status}` : ""}`,
```

- [ ] **Step 3: Update the singular status labels + add aria + control strings**

In `CONVERSATION_STRINGS`, replace the `statusLabel` block (lines 172-178) with the following (renames `em_andamento`, adds `statusAriaLabel` and a `statusControl` namespace right after):

```ts
  statusLabel: {
    aguardando: "Aguardando",
    em_andamento: "Em atendimento",
    aguardando_cliente: "Aguardando cliente",
    resolvida: "Resolvida",
    arquivada: "Arquivada",
  } as const,
  statusAriaLabel: {
    aguardando: "Aguardando atendimento",
    em_andamento: "Em atendimento",
    aguardando_cliente: "Aguardando resposta do cliente",
    resolvida: "Resolvida",
    arquivada: "Arquivada",
  } as const,
  statusControl: {
    triggerLabel: "Alterar status da conversa",
    resolve: "Resolver",
    reopen: "Reabrir",
    statusChanged: (label: string) => `Status alterado para "${label}"`,
    actionFailed: "Não foi possível alterar o status",
    modeSwitchLabel: "Modo de exibição do status",
    modes: {
      pill: "Pílula",
      menu: "Menu",
      segmented: "Segmentado",
    },
  },
```

- [ ] **Step 4: Verify it compiles**

Run: `bunx tsc --noEmit 2>&1 | grep -E "i18n/pt-BR" || echo "OK: no new tsc errors in i18n"`
Expected: `OK: no new tsc errors in i18n`

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/i18n/pt-BR.ts
git commit -m "$(cat <<'EOF'
feat(conversations): status i18n — rename label and add control strings

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `STATUS_META` visual map (replace `STATUS_BORDER`)

**Files:**
- Modify: `src/features/conversations/utils/conversationDisplay.ts:106-113`

- [ ] **Step 1: Replace the `STATUS_BORDER` map with `STATUS_META`**

Replace lines 106-113 (the `STATUS_BORDER` block):

```ts
/** Vertical status indicator (3px border) color per status. */
export const STATUS_BORDER: Record<ConversationStatus, string> = {
  aguardando: "bg-orange-500",
  em_andamento: "bg-emerald-500",
  aguardando_cliente: "bg-sky-400",
  resolvida: "bg-muted-foreground/40",
  arquivada: "bg-transparent",
};
```

with:

```ts
/** Indicator shape for a status dot: solid = "our turn", ring = "waiting on client". */
export type StatusShape = "filled" | "outline" | "check";

/**
 * Single source of truth for status visuals (icon, pill classes, list border,
 * dot shape). Text labels live in CONVERSATION_STRINGS.statusLabel /
 * statusAriaLabel — this map is visuals only. Colors come from semantic tokens
 * (severity-*, primary, muted); em_andamento uses `primary` (gold) to avoid
 * clashing with the WhatsApp channel green.
 */
export interface IStatusMeta {
  icon: string;
  /** Header pill (bg + text + border). */
  pillClass: string;
  /** 3px list border bar. */
  barClass: string;
  shape: StatusShape;
  /** Dot color/treatment used inside pills and segments. */
  dotClass: string;
}

export const STATUS_META: Record<ConversationStatus, IStatusMeta> = {
  aguardando: {
    icon: "mdi:account-clock-outline",
    pillClass: "bg-severity-warning/15 text-severity-warning border border-severity-warning/30",
    barClass: "bg-severity-warning",
    shape: "filled",
    dotClass: "bg-severity-warning",
  },
  em_andamento: {
    icon: "mdi:message-processing-outline",
    pillClass: "bg-primary/15 text-primary border border-primary/30",
    barClass: "bg-primary",
    shape: "filled",
    dotClass: "bg-primary",
  },
  aguardando_cliente: {
    icon: "mdi:account-arrow-left-outline",
    pillClass: "bg-severity-info/15 text-severity-info border border-severity-info/30",
    barClass: "bg-severity-info",
    shape: "outline",
    dotClass: "border-2 border-severity-info",
  },
  resolvida: {
    icon: "mdi:check-circle-outline",
    pillClass: "bg-severity-success/15 text-severity-success border border-severity-success/30",
    barClass: "bg-severity-success/50",
    shape: "check",
    dotClass: "bg-severity-success",
  },
  arquivada: {
    icon: "mdi:archive-outline",
    pillClass: "bg-muted text-muted-foreground border border-border",
    barClass: "bg-transparent",
    shape: "filled",
    dotClass: "bg-muted-foreground/40",
  },
};
```

> Note: `ConversationStatus` is already imported at the top of this file (line 3). The `Record<ConversationStatus, …>` type makes the map exhaustive at compile time.

- [ ] **Step 2: Verify it compiles (and find the now-broken `STATUS_BORDER` importer)**

Run: `bunx tsc --noEmit 2>&1 | grep -E "STATUS_BORDER|conversationDisplay|ConversationListItem"`
Expected: an error in `ConversationListItem.tsx` about `STATUS_BORDER` no longer exported (fixed in Task 8). No error inside `conversationDisplay.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/utils/conversationDisplay.ts
git commit -m "$(cat <<'EOF'
feat(conversations): unify status visuals into STATUS_META (semantic tokens)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Status control mode engine (pure) — TDD

**Files:**
- Create: `src/features/conversations/engine/statusControlMode.ts`
- Test: `src/features/conversations/engine/statusControlMode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/conversations/engine/statusControlMode.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  STATUS_CONTROL_MODES,
  DEFAULT_STATUS_CONTROL_MODE,
  normalizeStatusControlMode,
} from "./statusControlMode";

describe("statusControlMode", () => {
  it("lists exactly the three supported modes", () => {
    expect(STATUS_CONTROL_MODES).toEqual(["pill", "menu", "segmented"]);
  });

  it("defaults to pill", () => {
    expect(DEFAULT_STATUS_CONTROL_MODE).toBe("pill");
  });

  it("passes through valid modes", () => {
    expect(normalizeStatusControlMode("menu")).toBe("menu");
    expect(normalizeStatusControlMode("segmented")).toBe("segmented");
  });

  it("falls back to the default for unknown / null / undefined values", () => {
    expect(normalizeStatusControlMode("bogus")).toBe("pill");
    expect(normalizeStatusControlMode(null)).toBe("pill");
    expect(normalizeStatusControlMode(undefined)).toBe("pill");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `bunx vitest run src/features/conversations/engine/statusControlMode.test.ts`
Expected: FAIL — cannot find module `./statusControlMode`.

- [ ] **Step 3: Implement the engine**

Create `src/features/conversations/engine/statusControlMode.ts`:

```ts
/**
 * Status control display mode — which of the three header controls the
 * attendant sees. Pure module so the normalizer can be unit-tested and reused
 * by the persistence hook. Mirrors the project's "modes the user switches in
 * the UI" pattern (notes consult, scheduling center).
 */
export type StatusControlMode = "pill" | "menu" | "segmented";

export const STATUS_CONTROL_MODES: readonly StatusControlMode[] = [
  "pill",
  "menu",
  "segmented",
] as const;

export const DEFAULT_STATUS_CONTROL_MODE: StatusControlMode = "pill";

/** Coerce any persisted/unknown value into a valid mode (default = pill). */
export function normalizeStatusControlMode(value: unknown): StatusControlMode {
  return STATUS_CONTROL_MODES.includes(value as StatusControlMode)
    ? (value as StatusControlMode)
    : DEFAULT_STATUS_CONTROL_MODE;
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `bunx vitest run src/features/conversations/engine/statusControlMode.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/engine/statusControlMode.ts src/features/conversations/engine/statusControlMode.test.ts
git commit -m "$(cat <<'EOF'
feat(conversations): pure status control mode engine + tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `useStatusControlMode` hook (per-device persistence)

**Files:**
- Create: `src/features/conversations/hooks/useStatusControlMode.ts`

- [ ] **Step 1: Implement the hook**

Create `src/features/conversations/hooks/useStatusControlMode.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_STATUS_CONTROL_MODE,
  normalizeStatusControlMode,
  type StatusControlMode,
} from "../engine/statusControlMode";

/** Per-device preference, like the inbox column widths / environment override. */
const STORAGE_KEY = "gallo-conversation-status-control-mode";

function readStored(): StatusControlMode {
  if (typeof window === "undefined") return DEFAULT_STATUS_CONTROL_MODE;
  try {
    return normalizeStatusControlMode(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_STATUS_CONTROL_MODE;
  }
}

export function useStatusControlMode(): {
  mode: StatusControlMode;
  setMode: (mode: StatusControlMode) => void;
} {
  const [mode, setModeState] = useState<StatusControlMode>(readStored);

  // Re-read once on mount in case SSR/first paint used the default.
  useEffect(() => {
    setModeState(readStored());
  }, []);

  const setMode = useCallback((next: StatusControlMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage may be unavailable (private mode) — keep in-memory value */
    }
  }, []);

  return { mode, setMode };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit 2>&1 | grep -E "useStatusControlMode" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/hooks/useStatusControlMode.ts
git commit -m "$(cat <<'EOF'
feat(conversations): persist the status control mode per device

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `useConversationStatusActions` hook (status mutation)

**Files:**
- Create: `src/features/conversations/hooks/useConversationStatusActions.ts`

- [ ] **Step 1: Implement the hook**

Create `src/features/conversations/hooks/useConversationStatusActions.ts`. It mirrors `ConversationMenu`'s `updateAndAudit` (await → `onChanged` refresh → audit → toast); no optimistic UI, matching existing behavior.

```ts
import { useState } from "react";
import { toast } from "sonner";
import type { ConversationStatus, IConversation } from "@/shared/types";
import { recordAuditLog, useConversationsProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";

export function useConversationStatusActions(
  conversation: IConversation,
  onChanged?: () => void,
): {
  setStatus: (next: ConversationStatus, action?: string) => Promise<void>;
  isPending: boolean;
} {
  const conversationsProvider = useConversationsProvider();
  const { currentUser } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const setStatus = async (next: ConversationStatus, action = "conversation.status_change") => {
    const before = conversation.status;
    if (!currentUser || next === before || isPending) return;
    setIsPending(true);
    try {
      await conversationsProvider.update(conversation.id, { status: next });
      onChanged?.();
      void recordAuditLog({
        actorId: currentUser.id,
        storeId: conversation.storeId,
        action,
        resource: "conversation",
        resourceId: conversation.id,
        before: { status: before },
        after: { status: next },
      });
      toast.success(
        CONVERSATION_STRINGS.statusControl.statusChanged(CONVERSATION_STRINGS.statusLabel[next]),
      );
    } catch {
      toast.error(CONVERSATION_STRINGS.statusControl.actionFailed);
    } finally {
      setIsPending(false);
    }
  };

  return { setStatus, isPending };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit 2>&1 | grep -E "useConversationStatusActions" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/hooks/useConversationStatusActions.ts
git commit -m "$(cat <<'EOF'
feat(conversations): hook to change conversation status with audit + toast

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `StatusControl` component (three modes)

**Files:**
- Create: `src/features/conversations/components/status/StatusControl.tsx`

**Behavior:** lifecycle states offered by the control are `aguardando`, `em_andamento`, `aguardando_cliente`. `resolvida` is reached via the dedicated Resolver button (which becomes "Reabrir" → `em_andamento` when already resolved). `arquivada` is NOT offered here (kebab handles it). Edit is gated by `usePermission("conversation","edit","own")`; when the user can't edit, render a static pill.

- [ ] **Step 1: Implement the component**

Create `src/features/conversations/components/status/StatusControl.tsx`:

```tsx
import type { ConversationStatus, IConversation } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { STATUS_META } from "../../utils/conversationDisplay";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import { useConversationStatusActions } from "../../hooks/useConversationStatusActions";
import type { StatusControlMode } from "../../engine/statusControlMode";

const LIFECYCLE: ConversationStatus[] = ["aguardando", "em_andamento", "aguardando_cliente"];

/** A status dot honoring the shape (filled ● / outline ○ / check ✓). */
function StatusDot({ status }: { status: ConversationStatus }) {
  const meta = STATUS_META[status];
  if (meta.shape === "check") return <Icon icon="mdi:check" size={12} aria-hidden />;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        meta.shape === "outline" ? meta.dotClass : meta.dotClass,
      )}
    />
  );
}

function StatusPill({ status, withChevron }: { status: ConversationStatus; withChevron?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        meta.pillClass,
      )}
    >
      <StatusDot status={status} />
      {CONVERSATION_STRINGS.statusLabel[status]}
      {withChevron && <Icon icon="mdi:chevron-down" size={12} aria-hidden />}
    </span>
  );
}

export function StatusControl({
  conversation,
  mode,
  onChanged,
}: {
  conversation: IConversation;
  mode: StatusControlMode;
  onChanged?: () => void;
}) {
  const canEdit = usePermission("conversation", "edit", "own");
  const { setStatus, isPending } = useConversationStatusActions(conversation, onChanged);
  const status = conversation.status;
  const isResolved = status === "resolvida";

  // No permission → static pill only (no interaction).
  if (!canEdit) return <StatusPill status={status} />;

  const resolveButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 border-severity-success/40 text-severity-success"
      disabled={isPending}
      onClick={() => void setStatus(isResolved ? "em_andamento" : "resolvida", "conversation.resolve")}
    >
      <Icon icon={isResolved ? "mdi:restore" : "mdi:check"} size={14} />
      <span className="hidden md:inline">
        {isResolved ? CONVERSATION_STRINGS.statusControl.reopen : CONVERSATION_STRINGS.statusControl.resolve}
      </span>
    </Button>
  );

  if (mode === "segmented") {
    return (
      <div className="flex items-center gap-1.5">
        <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group">
          {LIFECYCLE.map((s) => {
            const active = s === status;
            return (
              <button
                key={s}
                type="button"
                disabled={isPending}
                aria-pressed={active}
                onClick={() => void setStatus(s)}
                className={cn(
                  "inline-flex items-center gap-1.5 border-r border-border px-2.5 py-1 text-[11px] font-medium last:border-r-0",
                  active ? STATUS_META[s].pillClass : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                <StatusDot status={s} />
                <span className="hidden lg:inline">{CONVERSATION_STRINGS.statusLabel[s]}</span>
              </button>
            );
          })}
        </div>
        {resolveButton}
      </div>
    );
  }

  // mode === "menu": single dropdown including Resolver/Reabrir.
  if (mode === "menu") {
    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                aria-label={CONVERSATION_STRINGS.statusControl.triggerLabel}
              >
                <StatusPill status={status} withChevron />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{CONVERSATION_STRINGS.statusControl.triggerLabel}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuRadioGroup
            value={LIFECYCLE.includes(status) ? status : ""}
            onValueChange={(v) => void setStatus(v as ConversationStatus)}
          >
            {LIFECYCLE.map((s) => (
              <DropdownMenuRadioItem key={s} value={s} className="gap-2">
                <Icon icon={STATUS_META[s].icon} size={14} />
                {CONVERSATION_STRINGS.statusLabel[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => void setStatus(isResolved ? "em_andamento" : "resolvida", "conversation.resolve")}
          >
            <Icon icon={isResolved ? "mdi:restore" : "mdi:check-circle-outline"} size={14} />
            {isResolved ? CONVERSATION_STRINGS.statusControl.reopen : CONVERSATION_STRINGS.statusControl.resolve}
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // mode === "pill" (default): pill-as-trigger (cycle states) + Resolver button.
  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                aria-label={CONVERSATION_STRINGS.statusControl.triggerLabel}
              >
                <StatusPill status={status} withChevron />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{CONVERSATION_STRINGS.statusControl.triggerLabel}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuRadioGroup
            value={LIFECYCLE.includes(status) ? status : ""}
            onValueChange={(v) => void setStatus(v as ConversationStatus)}
          >
            {LIFECYCLE.map((s) => (
              <DropdownMenuRadioItem key={s} value={s} className="gap-2">
                <Icon icon={STATUS_META[s].icon} size={14} />
                {CONVERSATION_STRINGS.statusLabel[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {resolveButton}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit 2>&1 | grep -E "StatusControl" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/status/StatusControl.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): three-mode status control (pill/menu/segmented)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `StatusControlModeSwitcher` component

**Files:**
- Create: `src/features/conversations/components/status/StatusControlModeSwitcher.tsx`

- [ ] **Step 1: Implement the component**

Create `src/features/conversations/components/status/StatusControlModeSwitcher.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CONVERSATION_STRINGS } from "../../i18n/pt-BR";
import {
  STATUS_CONTROL_MODES,
  type StatusControlMode,
} from "../../engine/statusControlMode";

export function StatusControlModeSwitcher({
  value,
  onChange,
}: {
  value: StatusControlMode;
  onChange: (mode: StatusControlMode) => void;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground"
              aria-label={CONVERSATION_STRINGS.statusControl.modeSwitchLabel}
            >
              <Icon icon="mdi:cog-outline" size={14} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{CONVERSATION_STRINGS.statusControl.modeSwitchLabel}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{CONVERSATION_STRINGS.statusControl.modeSwitchLabel}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as StatusControlMode)}>
          {STATUS_CONTROL_MODES.map((m) => (
            <DropdownMenuRadioItem key={m} value={m}>
              {CONVERSATION_STRINGS.statusControl.modes[m]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `bunx tsc --noEmit 2>&1 | grep -E "StatusControlModeSwitcher" || echo "OK"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add src/features/conversations/components/status/StatusControlModeSwitcher.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): discreet switcher for the status control mode

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: List item — border via `STATUS_META` + status in aria

**Files:**
- Modify: `src/features/conversations/components/ConversationListItem.tsx`

- [ ] **Step 1: Swap the `STATUS_BORDER` import for `STATUS_META` + add the status label import**

Replace the import block (lines 12-20):

```ts
import {
  CHANNEL_META,
  STATUS_BORDER,
  TEMPERATURE_META,
  getConversationDisplay,
  getMessagePreview,
} from "../utils/conversationDisplay";
import { statusVisual } from "../utils/messageDisplay";
import { INBOX_STRINGS } from "../i18n/pt-BR";
```

with:

```ts
import {
  CHANNEL_META,
  STATUS_META,
  TEMPERATURE_META,
  getConversationDisplay,
  getMessagePreview,
} from "../utils/conversationDisplay";
import { statusVisual } from "../utils/messageDisplay";
import { INBOX_STRINGS, CONVERSATION_STRINGS } from "../i18n/pt-BR";
```

- [ ] **Step 2: Derive the border bar from `STATUS_META`**

Replace line 82:

```ts
  const statusBar = STATUS_BORDER[conversation.status];
```
with:
```ts
  const statusBar = STATUS_META[conversation.status].barClass;
```

- [ ] **Step 3: Add the status to the item's `aria-label`**

Replace the `aria-label` (lines 102-106):

```tsx
      aria-label={INBOX_STRINGS.ariaListItem({
        name: display.name,
        when: relative,
        unread,
      })}
```
with:
```tsx
      aria-label={INBOX_STRINGS.ariaListItem({
        name: display.name,
        when: relative,
        unread,
        status: CONVERSATION_STRINGS.statusLabel[conversation.status],
      })}
```

- [ ] **Step 4: Verify it compiles**

Run: `bunx tsc --noEmit 2>&1 | grep -E "ConversationListItem" || echo "OK"`
Expected: `OK` (the Task 2 error here is now resolved).

- [ ] **Step 5: Commit**

```bash
git add src/features/conversations/components/ConversationListItem.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): list status bar via STATUS_META + status in aria-label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Header — mount the control + switcher, drop the static pill

**Files:**
- Modify: `src/features/conversations/components/ConversationHeader.tsx`

- [ ] **Step 1: Update imports**

Replace lines 17-19:

```ts
import { CHANNEL_META, getConversationDisplay } from "../utils/conversationDisplay";
import { ContactAvatar } from "./ContactAvatar";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
```
with:
```ts
import { CHANNEL_META, getConversationDisplay } from "../utils/conversationDisplay";
import { ContactAvatar } from "./ContactAvatar";
import { CONVERSATION_STRINGS } from "../i18n/pt-BR";
import { StatusControl } from "./status/StatusControl";
import { StatusControlModeSwitcher } from "./status/StatusControlModeSwitcher";
import { useStatusControlMode } from "../hooks/useStatusControlMode";
```

- [ ] **Step 2: Delete the `STATUS_TONE` map (lines 44-51)**

Remove the entire block:

```ts
const STATUS_TONE: Record<IConversation["status"], string> = {
  aguardando: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30",
  em_andamento:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30",
  aguardando_cliente: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30",
  resolvida: "bg-muted text-muted-foreground border border-border",
  arquivada: "bg-muted text-muted-foreground border border-border opacity-70",
};
```

- [ ] **Step 3: Add the `onConversationUpdated` prop**

In `IConversationHeaderProps` (after line 41, `onCustomerUpdated?: () => void;`), add:

```ts
  /** Called after the conversation status changes from the header control. */
  onConversationUpdated?: () => void;
```

And in the destructured params (after `onCustomerUpdated,` at line 64), add:

```ts
  onConversationUpdated,
```

- [ ] **Step 4: Read the persisted mode inside the component**

Right after `const { hasRole } = useAuth();` (line 70), add:

```ts
  const { mode: statusControlMode, setMode: setStatusControlMode } = useStatusControlMode();
```

- [ ] **Step 5: Remove the static status pill from the subtitle row**

Delete the status `<span>` block (lines 161-168):

```tsx
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                STATUS_TONE[conversation.status],
              )}
            >
              {CONVERSATION_STRINGS.statusLabel[conversation.status]}
            </span>
```

(The channel chip `<span>` directly above it stays.)

- [ ] **Step 6: Mount the control + switcher at the start of the action cluster**

In the action cluster `<div className="flex items-center gap-1">` (line 172), insert — as the FIRST children, before the "Criar orçamento" `<Button>` (line 173):

```tsx
          <StatusControl
            conversation={conversation}
            mode={statusControlMode}
            onChanged={onConversationUpdated}
          />
          <StatusControlModeSwitcher value={statusControlMode} onChange={setStatusControlMode} />
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />
```

- [ ] **Step 7: Verify it compiles (check `cn` still used)**

Run: `bunx tsc --noEmit 2>&1 | grep -E "ConversationHeader" || echo "OK"`
Expected: `OK`. (`cn` is still used by the channel chip className at line 152-156, so its import stays valid.)

- [ ] **Step 8: Commit**

```bash
git add src/features/conversations/components/ConversationHeader.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): mount status control + mode switcher in the header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Page wiring + full verification

**Files:**
- Modify: `src/features/conversations/pages/ConversationPage.tsx:157-176`

- [ ] **Step 1: Pass `onConversationUpdated` to the header**

In the `<ConversationHeader ...>` JSX, after `onCustomerUpdated={detail.refresh}` (line 175), add:

```tsx
                onConversationUpdated={detail.refresh}
```

- [ ] **Step 2: Type-check the whole delta**

Run: `bunx tsc --noEmit 2>&1 | grep -E "conversations/(components|hooks|engine|pages|utils|i18n)" || echo "OK: no tsc errors in touched files"`
Expected: `OK: no tsc errors in touched files`

- [ ] **Step 3: Run the full test suite**

Run: `bun run test`
Expected: all files pass, including the new `statusControlMode.test.ts` (4 tests).

- [ ] **Step 4: Production build**

Run: `bun run build`
Expected: `✓ built` with no errors.

- [ ] **Step 5: Lint the touched files (ignore CRLF false positives)**

Run:
```bash
bunx eslint src/features/conversations/utils/conversationDisplay.ts src/features/conversations/i18n/pt-BR.ts src/features/conversations/engine/statusControlMode.ts src/features/conversations/engine/statusControlMode.test.ts src/features/conversations/hooks/useStatusControlMode.ts src/features/conversations/hooks/useConversationStatusActions.ts src/features/conversations/components/status/StatusControl.tsx src/features/conversations/components/status/StatusControlModeSwitcher.tsx src/features/conversations/components/ConversationHeader.tsx src/features/conversations/components/ConversationListItem.tsx src/features/conversations/pages/ConversationPage.tsx 2>&1 | grep "error" | grep -v "prettier/prettier" || echo "OK: no real lint errors (only CRLF false-positives, if any)"
```
Expected: `OK: no real lint errors …`

- [ ] **Step 6: Manual UI check (owner)**

The owner verifies in the running dev server (points to production data): open a conversation, confirm the status pill/control appears in the header with the new colors (gold "Em atendimento", amber "Aguardando", blue outline "Aguardando cliente"), the gear switches modes (pill/menu/segmented) and the choice survives a reload, changing status persists and shows a toast, "Resolver"/"Reabrir" works, archiving still lives in the kebab, and the inbox list border colors match.

- [ ] **Step 7: Commit**

```bash
git add src/features/conversations/pages/ConversationPage.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): wire status-change refresh into the conversation page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage (frontend slice):**
- §2 visual identity (STATUS_META, semantic tokens, em_andamento=primary, shape+icon+label) → Tasks 1, 2, 8, 9. ✓
- §3 three modes + header switch + per-device default pill → Tasks 3, 4, 6, 7, 9. ✓
- Manual change via provider + RBAC + audit + refresh → Task 5 (+ usePermission in Task 6, wiring in 9/10). ✓
- Archive stays in kebab (separate axis) → unchanged `ConversationMenu`; control offers only the 3 lifecycle states. ✓
- Accessibility (icon+shape+label, status in aria) → Tasks 2, 6, 8. ✓
- Filter labels consistency → Task 1 (em_andamento rename). ✓
- **Out of this plan (deferred to Plan B):** automation (webhook/send), the `autoReopenResolvedOnInbound` setting, the auto-reopen system notice, SDR interplay. Stated explicitly.

**Placeholder scan:** none — every code step has complete code; every run step has a command + expected output.

**Type consistency:** `StatusControlMode` (`pill|menu|segmented`) consistent across Tasks 3/4/6/7/9. `STATUS_META`/`IStatusMeta`/`StatusShape` consistent across Tasks 2/6/8. `useConversationStatusActions(conversation, onChanged)` signature consistent (Task 5 def, Task 6 use). `onConversationUpdated` consistent (Task 9 prop, Task 10 wiring). `statusControl` i18n keys used in Tasks 6/7 all defined in Task 1.

**Risk notes:** Header layout gains width — on mobile the control labels are `hidden md:inline`/`hidden lg:inline`; verify the header doesn't overflow on small screens during the manual check. If `severity-*/opacity` ever renders flat, confirm the tokens are registered as colors in `src/styles.css` (they are: `--color-severity-*`).
