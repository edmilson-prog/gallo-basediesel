# PRD-027 Plano C — Inteligência & Governança — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deliver PRD-027 Fases 4–5 (spec §8 Plano C): trackable links that feed lead temperature, sequential combo fan-out with partial-failure tolerance, simple per-conversation scheduling with edit/cancel/undo + a simulated runner, governance UI (publish/unpublish/version/permission per asset, shared-snippets manager, asset usage stats) under `app.configuracoes`, the Copilot RECEIVER bus only, and audit wiring for every sensitive action. Theme light+dark, responsive 360–1920, empty/error states throughout. **CONSUMES Plan A** (types, engines, providers, mocks, RBAC, i18n namespace, data hooks) and **Plan B** (AssetPicker, ComposerStagedAsset, marker plumbing). Reference Plan A/B by their CONTRACT names — never re-create their files.

**Architecture:** Feature-based under `src/features/quick-send/`. Pure engines (Plan A) drive all decisions; this plan only adds React hooks + components + conversation integration + a governance route. Provider Pattern data flows through the four Plan A slices (`useAssetLibraryProvider`, `useTrackableLinkProvider`, `useScheduledSendProvider`, plus `useLeadsProvider`/`useMessagesProvider` already in the repo). Both new bubble markers (`[produto]`, `[link]`) live in `IMessage.text` — the IMessage schema does NOT change. Runners (`useTrackableLinkSimulation`, `useScheduledSendRunner`) are mounted once in `ConversationPage`. Audit goes through `logMockMutation` from the mock providers (Plan A) and via a thin client-side `recordAuditLog` call for governance UI mutations.

**Tech Stack:** React 19 + TS strict, Vite, TanStack Router (file-based; `routeTree.gen.ts` GENERATED — never hand-edit), TanStack Query, Tailwind v4, shadcn/ui (new-york), `@iconify/react` (`mdi:*`), sonner toasts, bun, Vitest (node env, co-located `*.test.ts`).

---

## Conventions for this plan (read before starting)

- **Test gate:** `bun run build` (vite) GREEN is the hard gate for every task. `vitest run` GREEN for engine/hook tests where applicable. `tsc --noEmit` has ~315 PRE-EXISTING errors — judge new code by **delta only**; never claim to fix the baseline.
- **Pagination:** `IPaginatedResult<T>.data` (NEVER `.items`).
- **RBAC vocabulary:** `view`/`create`/`edit`/`delete`/`approve` ONLY. "Enviar um ativo" is NOT an RBAC action — it is `view` on a `published` allowed asset + `canSendSensitiveAsset` gate.
- **Markers:** `PRODUCT_CARD_MARKER = "[produto]"` is exported from `productCardPayload.ts` (Plan A). `TRACKABLE_LINK_MARKER = "[link]"` is exported from `trackableLink.ts` (Plan A). This plan IMPORTS them — do not redefine.
- **i18n:** All UI strings come from `QUICK_SEND_STRINGS` (Plan A created the namespace; this plan reads `link`/`temperature`/`combo`/`schedule`/`library`/`stats`/`errors` groups). Conversation menu strings come from `CONVERSATION_STRINGS` (this plan appends only schedule keys). pt-BR with correct accents.
- **Shared-file coordination:** `MessageInput.tsx`, `ConversationPage.tsx`, `MessageBubble.tsx`, `conversations/i18n/pt-BR.ts`, and `quick-send/index.ts` are touched by both B and C. This plan edits ONLY the regions allocated to C in CONTRACT §H.2 and §K (split Enviar; tray/list/runners mount; `[link]` branch; schedule keys; append-only barrel). If a region already differs because Plan B landed first, integrate next to B's edit — never overwrite it.
- **Commits:** Conventional Commits, atomic. End each commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **CRLF warnings on `git add` are a known false positive — do NOT run prettier to "fix" them.**
- **No React in engines** — engines are Plan A's; this plan only consumes them.
- For React components there is no jsdom/RTL: the "test" is `bun run build` green + a manual checklist. Every component shows the FULL code.

---

## Pre-flight (run once before Task 1)

- [ ] 1. Confirm Plan A landed: `bun run build` then confirm the type barrel exports exist.

```bash
bun run build
```
Expected: build completes (exit 0). Then verify Plan A symbols are importable:

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('src/shared/types/index.ts','utf8');['ITrackableLink','IScheduledSend','IAssetCombo','IAssetLibraryItem'].forEach(s=>{if(!t.includes(s))throw new Error('MISSING '+s)});console.log('types OK')"
node -e "const fs=require('fs');for(const f of ['temperatureEscalation','comboSend','scheduledSend','trackableLink','assetVersioning','assetSensitivity','productCardPayload']){if(!fs.existsSync('src/features/quick-send/engine/'+f+'.ts'))throw new Error('MISSING engine '+f)}console.log('engines OK')"
node -e "const fs=require('fs');['useTrackableLinkProvider','useScheduledSendProvider','useAssetLibraryProvider'].forEach(h=>{if(!fs.existsSync('src/providers/data/hooks/'+h+'.ts'))throw new Error('MISSING '+h)});console.log('provider hooks OK')"
node -e "const fs=require('fs');const i=fs.readFileSync('src/features/quick-send/i18n/pt-BR.ts','utf8');if(!i.includes('QUICK_SEND_STRINGS'))throw new Error('MISSING QUICK_SEND_STRINGS');console.log('i18n OK')"
```
Expected: prints `types OK`, `engines OK`, `provider hooks OK`, `i18n OK`. If any fails, STOP — Plan A is incomplete; do not proceed.

- [ ] 2. Confirm the i18n groups this plan reads exist in `QUICK_SEND_STRINGS`. Read `src/features/quick-send/i18n/pt-BR.ts` and verify the top-level keys `link`, `temperature`, `combo`, `schedule`, `library`, `stats`, `errors` are present. If a sub-key this plan references is missing, ADD it to the relevant group in that file in the FIRST task that needs it (append-only; never remove Plan A/B keys), then continue. Show the exact diff in that task.

---

## TASK 1 — `useConversationScheduled` hook (per-conversation scheduled list source)

**RF-024 (lista de agendados por conversa).** Foundation hook consumed by `ScheduledList` (Task 4) and `ConversationHeader` count (Task 12).

**Files:**
- Create: `src/features/quick-send/hooks/useConversationScheduled.ts`
- Test: none (thin TanStack Query wrapper; covered by `bun run build` + downstream component manual checks). The engine logic it relies on (`isDue`) is already tested in Plan A.

**Steps:**

- [ ] 1. Create the hook with the exact CONTRACT signature.

`src/features/quick-send/hooks/useConversationScheduled.ts`:
```ts
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IScheduledSend } from "@/shared/types";
import { useScheduledSendProvider } from "@/providers/data";

/** Query key factory so the runner (Task 5) and the list stay in sync. */
export function scheduledSendsQueryKey(conversationId: ID): readonly unknown[] {
  return ["quick-send", "scheduled", conversationId] as const;
}

export interface IUseConversationScheduledResult {
  items: IScheduledSend[];
  cancel: (id: ID) => void;
  update: (id: ID, patch: Partial<IScheduledSend>) => void;
  isLoading: boolean;
}

/**
 * Per-conversation scheduled-send list for `ScheduledList`. Reads via
 * `IScheduledSendProvider.list`; cancel/update mutate then invalidate so the
 * collapsible bar and the runner observe the same source of truth (D-11).
 */
export function useConversationScheduled(conversationId: ID): IUseConversationScheduledResult {
  const provider = useScheduledSendProvider();
  const queryClient = useQueryClient();
  const key = scheduledSendsQueryKey(conversationId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => provider.list(conversationId),
    // Pending sends rarely change outside our own mutations; keep it cheap.
    staleTime: 5_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  const cancelMutation = useMutation({
    mutationFn: (id: ID) => provider.cancel(id),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: ID; patch: Partial<IScheduledSend> }) =>
      provider.update(id, patch),
    onSuccess: invalidate,
  });

  const cancel = useCallback((id: ID) => cancelMutation.mutate(id), [cancelMutation]);
  const update = useCallback(
    (id: ID, patch: Partial<IScheduledSend>) => updateMutation.mutate({ id, patch }),
    [updateMutation],
  );

  return {
    items: query.data ?? [],
    cancel,
    update,
    isLoading: query.isLoading,
    // intentionally narrow surface (CONTRACT §C)
  };
}
```

- [ ] 2. Append the export to the feature barrel (append-only). Edit `src/features/quick-send/index.ts` — add, in the hooks section, next to the existing exports (do NOT remove any line):
```ts
export {
  useConversationScheduled,
  scheduledSendsQueryKey,
  type IUseConversationScheduledResult,
} from "./hooks/useConversationScheduled";
```
> If `src/features/quick-send/index.ts` does not yet exist (Plan A creates it), create it with just the block above plus `export {};` guard removed. Otherwise append.

- [ ] 3. Build gate.
```bash
bun run build
```
Expected: exit 0, no new errors referencing `useConversationScheduled`.

- [ ] 4. Commit.
```bash
git add src/features/quick-send/hooks/useConversationScheduled.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useConversationScheduled hook (PRD-027 RF-024)

Per-conversation scheduled-send list source backed by IScheduledSendProvider
with cancel/update + query invalidation. Consumed by ScheduledList and the
header Agendados(N) affordance.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 2 — `ScheduleSendMenu` component (split Enviar → presets + custom)

**RF-023 (agendamento simples), D-11.** A `▾` split button next to "Enviar" that offers presets and a custom date-time, calling `onSchedule(scheduledFor)` with an ISO8601 string validated as future via the Plan A engine `validateFuture`.

**Files:**
- Create: `src/features/quick-send/components/ScheduleSendMenu.tsx`
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Create the component with the exact CONTRACT props (`IScheduleSendMenuProps { onSchedule: (scheduledFor: ISO8601) => void }`).

`src/features/quick-send/components/ScheduleSendMenu.tsx`:
```ts
import { useState } from "react";
import type { ISO8601 } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/Icon";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { validateFuture } from "../engine/scheduledSend";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IScheduleSendMenuProps {
  onSchedule: (scheduledFor: ISO8601) => void;
  /** Disabled when there is nothing stageable to schedule. */
  disabled?: boolean;
}

/** Today at 18:00 (or tomorrow 18:00 if already past). */
function presetTodayEvening(now: Date): Date {
  const d = new Date(now);
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

/** Tomorrow at 09:00. */
function presetTomorrowMorning(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** Next Monday at 08:00. */
function presetNextMonday(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun..6=Sat
  const delta = ((8 - day) % 7) || 7; // strictly next Monday
  d.setDate(d.getDate() + delta);
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Format a Date for `<input type="datetime-local">` value (local, no seconds). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Split-button menu attached to "Enviar". Presets + custom datetime; every
 * choice is re-validated by `validateFuture` before bubbling `onSchedule`
 * with an ISO8601 string (D-11). Past datetimes are rejected with a toast.
 */
export function ScheduleSendMenu({ onSchedule, disabled = false }: IScheduleSendMenuProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState<string>(() =>
    toLocalInputValue(presetTomorrowMorning(new Date())),
  );

  const emit = (date: Date) => {
    const iso = date.toISOString();
    const check = validateFuture(iso, new Date().toISOString());
    if (!check.ok) {
      toast.error(s.pastRejected);
      return;
    }
    onSchedule(iso);
    toast.success(s.scheduledToast);
  };

  const handleCustom = () => {
    if (!customValue) return;
    const date = new Date(customValue);
    if (Number.isNaN(date.getTime())) {
      toast.error(s.pastRejected);
      return;
    }
    emit(date);
    setCustomOpen(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="default"
          className="h-9 w-7 shrink-0 rounded-l-none border-l border-primary-foreground/20 px-0"
          aria-label={s.scheduleSend}
          disabled={disabled}
        >
          <Icon icon="mdi:chevron-down" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{s.scheduleSend}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => emit(presetTodayEvening(new Date()))}>
          <Icon icon="mdi:weather-sunset" size={14} className="mr-2" />
          {s.presetTodayEvening}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => emit(presetTomorrowMorning(new Date()))}>
          <Icon icon="mdi:weather-sunny" size={14} className="mr-2" />
          {s.presetTomorrowMorning}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => emit(presetNextMonday(new Date()))}>
          <Icon icon="mdi:calendar-week-begin" size={14} className="mr-2" />
          {s.presetMonday}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <Popover open={customOpen} onOpenChange={setCustomOpen}>
          <PopoverTrigger asChild>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setCustomOpen(true);
              }}
            >
              <Icon icon="mdi:calendar-clock" size={14} className="mr-2" />
              {s.custom}
            </DropdownMenuItem>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 space-y-2">
            <label className="text-xs font-medium text-foreground" htmlFor="schedule-custom-dt">
              {s.custom}
            </label>
            <Input
              id="schedule-custom-dt"
              type="datetime-local"
              value={customValue}
              min={toLocalInputValue(new Date())}
              onChange={(e) => setCustomValue(e.target.value)}
            />
            <Button type="button" size="sm" className="w-full" onClick={handleCustom}>
              {s.scheduleSend}
            </Button>
          </PopoverContent>
        </Popover>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] 2. Ensure i18n keys exist. Open `src/features/quick-send/i18n/pt-BR.ts`. The `schedule` group must include these keys (append any missing, do not remove existing):
```ts
  schedule: {
    scheduleSend: "Agendar envio",
    presetTodayEvening: "Hoje, 18:00",
    presetTomorrowMorning: "Amanhã, 09:00",
    presetMonday: "Segunda, 08:00",
    custom: "Escolher data e hora…",
    scheduledToast: "Envio agendado.",
    pastRejected: "Escolha uma data e hora no futuro.",
    scheduledCount: (n: number) => (n === 1 ? "1 agendado" : `${n} agendados`),
    edit: "Editar",
    cancel: "Cancelar",
    undo: "Desfazer",
    cancelled: "Agendamento cancelado.",
    emptyList: "Nenhum envio agendado para esta conversa.",
    listTitle: "Agendados",
    failedBadge: "Falhou",
    pendingBadge: "Pendente",
    sentBadge: "Enviado",
    payloadAsset: "Ativo",
    payloadSnippet: "Resposta rápida",
    payloadCombo: "Pacote",
    payloadProduct: "Produto",
  },
```
> Show the exact diff (added keys only) in this step. If the group already has some, append only the missing ones.

- [ ] 3. Add the barrel export (append-only) to `src/features/quick-send/index.ts`:
```ts
export { ScheduleSendMenu, type IScheduleSendMenuProps } from "./components/ScheduleSendMenu";
```

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Manual checklist (record in commit body as verified): split `▾` renders attached to a primary button; presets compute future Date (today-evening rolls to tomorrow if past); custom datetime popover rejects past with toast; light + dark legible (uses tokens only); 360px width does not overflow.

- [ ] 6. Commit.
```bash
git add src/features/quick-send/components/ScheduleSendMenu.tsx src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add ScheduleSendMenu split button (PRD-027 RF-023)

Presets (hoje 18h / amanhã 9h / segunda 8h) + custom datetime, each
re-validated by validateFuture before emitting an ISO8601 onSchedule.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 3 — `useScheduleSend` helper hook (create a scheduled send from the composer)

**RF-023.** Thin write-side hook so `MessageInput` (Task 11) can persist an `IScheduledSend` from the current staged payload. Mirrors how `useSendAsset` (Plan B) writes through a provider.

**Files:**
- Create: `src/features/quick-send/hooks/useScheduleSend.ts`
- Test: `bun run build` green.

**Steps:**

- [ ] 1. Create the hook.

`src/features/quick-send/hooks/useScheduleSend.ts`:
```ts
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IConversation, ISO8601, IScheduledSend } from "@/shared/types";
import { useScheduledSendProvider } from "@/providers/data";
import { scheduledSendsQueryKey } from "./useConversationScheduled";

export interface IScheduleSendPayload {
  type: "asset" | "snippet" | "combo" | "product";
  assetIds?: ID[];
  quickReplyId?: ID;
  productId?: ID;
  contextMessage?: string;
}

export interface IUseScheduleSendResult {
  schedule: (scheduledFor: ISO8601, payload: IScheduleSendPayload) => Promise<IScheduledSend>;
}

/**
 * Persists a scheduled send for the current conversation, then invalidates the
 * per-conversation query so `ScheduledList` and the header count refresh. The
 * runner (Task 5) fires it at the simulated time, re-validating on dispatch.
 */
export function useScheduleSend(conversation: IConversation): IUseScheduleSendResult {
  const provider = useScheduledSendProvider();
  const queryClient = useQueryClient();

  const schedule = useCallback(
    async (scheduledFor: ISO8601, payload: IScheduleSendPayload) => {
      const created = await provider.create({
        conversationId: conversation.id,
        scheduledFor,
        payload,
        createdBy: conversation.assignedSellerId ?? "system",
      });
      void queryClient.invalidateQueries({
        queryKey: scheduledSendsQueryKey(conversation.id),
      });
      return created;
    },
    [provider, conversation.id, conversation.assignedSellerId, queryClient],
  );

  return { schedule };
}
```
> `IScheduledSendProvider.create` takes `Omit<IScheduledSend,"id"|"storeId"|"status"|"createdAt">` (CONTRACT §A); `storeId` is injected by the mock provider via `withCreateStoreId`. `IConversation` exposes `assignedSellerId?: ID` — if your repo names it differently, read `src/shared/types` for the conversation interface and use the assigned-seller field; fall back to `"system"`.

- [ ] 2. Verify the conversation field name. Confirm the seller field on `IConversation`:
```bash
node -e "const fs=require('fs');const f=require('child_process').execSync('rg -n \"assignedSellerId\" src/shared/types',{encoding:'utf8'});console.log(f)"
```
Expected: prints at least one line showing `assignedSellerId` on the conversation interface. If it prints nothing, open `src/shared/types/conversation*.ts`, find the seller-assignment field, and replace `conversation.assignedSellerId` with the real field name in the hook before continuing.

- [ ] 3. Barrel (append-only) in `src/features/quick-send/index.ts`:
```ts
export {
  useScheduleSend,
  type IUseScheduleSendResult,
  type IScheduleSendPayload,
} from "./hooks/useScheduleSend";
```

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Commit.
```bash
git add src/features/quick-send/hooks/useScheduleSend.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useScheduleSend write hook (PRD-027 RF-023)

Persists IScheduledSend for the conversation and invalidates the scheduled
query so the list/header refresh immediately.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 4 — `ScheduledList` component (collapsible per-conversation list with edit/cancel + 5s undo)

**RF-024, D-11.** Collapsible "Agendados (N)" bar above the composer; each row shows the scheduled time + payload type and offers edit (re-pick a time via `ScheduleSendMenu`) and cancel with a 5-second undo toast.

**Files:**
- Create: `src/features/quick-send/components/ScheduledList.tsx`
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Create the component (props `IScheduledListProps { conversationId: ID }`).

`src/features/quick-send/components/ScheduledList.tsx`:
```ts
import { useState } from "react";
import { toast } from "sonner";
import type { ID, ISO8601, IScheduledSend } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useConversationScheduled } from "../hooks/useConversationScheduled";
import { ScheduleSendMenu } from "./ScheduleSendMenu";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IScheduledListProps {
  conversationId: ID;
}

const PAYLOAD_LABEL: Record<IScheduledSend["payload"]["type"], keyof typeof QUICK_SEND_STRINGS.schedule> = {
  asset: "payloadAsset",
  snippet: "payloadSnippet",
  combo: "payloadCombo",
  product: "payloadProduct",
};

function formatWhen(iso: ISO8601): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Collapsible "Agendados (N)" bar above the composer (D-11). Only pending
 * items are actionable; edit re-schedules a new time, cancel offers a 5s undo
 * via sonner before committing the provider cancel.
 */
export function ScheduledList({ conversationId }: IScheduledListProps) {
  const s = QUICK_SEND_STRINGS.schedule;
  const { items, cancel, update, isLoading } = useConversationScheduled(conversationId);
  const [open, setOpen] = useState(false);

  const pending = items.filter((i) => i.status === "pending");
  const visible = items.filter((i) => i.status !== "cancelled");

  if (isLoading || visible.length === 0) return null;

  const handleCancel = (item: IScheduledSend) => {
    let undone = false;
    toast(s.cancelled, {
      action: {
        label: s.undo,
        onClick: () => {
          undone = true;
        },
      },
      duration: 5_000,
      onAutoClose: () => {
        if (!undone) cancel(item.id);
      },
      onDismiss: () => {
        if (!undone) cancel(item.id);
      },
    });
  };

  const handleReschedule = (item: IScheduledSend, scheduledFor: ISO8601) => {
    update(item.id, { scheduledFor });
    toast.success(s.scheduledToast);
  };

  return (
    <div className="border-b border-border bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted/50"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon icon="mdi:calendar-clock" size={14} />
        <span>{s.listTitle} · {s.scheduledCount(pending.length)}</span>
        <Icon
          icon="mdi:chevron-down"
          size={14}
          className={cn("ml-auto transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="divide-y divide-border/60 px-3 pb-2">
          {visible.map((item) => {
            const labelKey = PAYLOAD_LABEL[item.payload.type];
            const payloadLabel = s[labelKey] as string;
            return (
              <li key={item.id} className="flex items-center gap-2 py-2 text-xs">
                <Icon icon="mdi:clock-outline" size={14} className="text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">
                    {payloadLabel}
                    {item.payload.contextMessage ? ` — ${item.payload.contextMessage}` : ""}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{formatWhen(item.scheduledFor)}</p>
                </div>
                {item.status === "failed" && (
                  <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
                    {s.failedBadge}
                  </Badge>
                )}
                {item.status === "sent" && (
                  <Badge variant="secondary">{s.sentBadge}</Badge>
                )}
                {item.status === "pending" && (
                  <div className="flex items-center gap-0.5">
                    <ScheduleSendMenu onSchedule={(iso) => handleReschedule(item, iso)} />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      aria-label={s.cancel}
                      onClick={() => handleCancel(item)}
                    >
                      <Icon icon="mdi:close" size={14} />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
```

- [ ] 2. Barrel (append-only):
```ts
export { ScheduledList, type IScheduledListProps } from "./components/ScheduledList";
```

- [ ] 3. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 4. Manual checklist: collapsed bar shows pending count; expanding lists rows with formatted pt-BR time + payload label; cancel raises a 5s undo toast and only commits on auto-close when not undone; failed rows show a red badge; light/dark legible; 360px no overflow.

- [ ] 5. Commit.
```bash
git add src/features/quick-send/components/ScheduledList.tsx src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add ScheduledList collapsible bar (PRD-027 RF-024)

Per-conversation Agendados(N) list with edit (reschedule) and cancel + 5s
undo via sonner. Pending rows actionable; failed/sent shown as badges.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 5 — `useScheduledSendRunner` (simulated runner that fires due sends)

**RF-023, D-11.** A runner mounted once per conversation that polls `listDue(now)`, re-validates that the payload is still sendable (asset still `published` + permission), dispatches via the send hooks, and marks `sent`/`failed`. Failures NEVER throw to the UI.

**Files:**
- Create: `src/features/quick-send/hooks/useScheduledSendRunner.ts`
- Test: `bun run build` green + manual checklist (a due item flips to sent at the simulated time).

**Steps:**

- [ ] 1. Create the runner. It re-validates via Plan A engines `isDue`, `pickSendableVersion`, `canSendSensitiveAsset`, `isSensitiveAsset`, and dispatches each payload at fire time. To keep coupling minimal and avoid duplicating Plan B's upload logic, the runner dispatches **assets/combos via Plan B's `useSendAsset`** and **snippets via `useMessageSend().send`** (snippet body resolution already happened at schedule time — `contextMessage` carries the resolved text for snippet payloads). **Products are sent as DEGRADED TEXT** via `useMessageSend().send({ text: contextMessage })` — the runner does NOT use `useSendProductCard`, because rebuilding the full product card requires the live catalog `IPart`, a Plan B composer concern not available at fire time. This degraded-product behavior is the documented MVP choice (spec §11); the code and this prose agree on it.

`src/features/quick-send/hooks/useScheduledSendRunner.ts`:
```ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IConversation, IScheduledSend, IWhatsAppAccount } from "@/shared/types";
import { useScheduledSendProvider, useAssetLibraryProvider } from "@/providers/data";
import { useMessageSend } from "@/features/conversations/hooks/useMessageSend";
import { useAuth } from "@/features/auth/useAuth";
import { isDue } from "../engine/scheduledSend";
import { pickSendableVersion } from "../engine/assetVersioning";
import { isSensitiveAsset, canSendSensitiveAsset } from "../engine/assetSensitivity";
import { useSendAsset } from "./useSendAsset";
import { scheduledSendsQueryKey } from "./useConversationScheduled";

const POLL_INTERVAL_MS = 10_000;

/**
 * Simulated scheduled-send runner (D-11). Polls listDue(now), re-validates the
 * payload (published + sensitivity permission) AT DISPATCH TIME, sends via the
 * existing send hooks, and marks sent/failed. Never throws — a broken/forbidden
 * payload becomes status "failed" with a reason; nothing unsendable is sent.
 */
export function useScheduledSendRunner(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): void {
  const provider = useScheduledSendProvider();
  const assetProvider = useAssetLibraryProvider();
  const send = useMessageSend(conversation, whatsappAccount);
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  const { userRole } = useAuth();
  const queryClient = useQueryClient();
  // Guard against overlapping ticks and double-dispatch of the same row.
  const inFlightRef = useRef<Set<ID>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const viewer = userRole ? { role: userRole } : null;

    const dispatchOne = async (item: IScheduledSend) => {
      if (inFlightRef.current.has(item.id)) return;
      inFlightRef.current.add(item.id);
      try {
        const ctx = item.payload.contextMessage;
        if (item.payload.type === "snippet") {
          // Snippet body was resolved at schedule time → contextMessage carries it.
          if (!ctx || !ctx.trim()) throw new Error("snippet vazio");
          await send.send({ text: ctx });
        } else if (item.payload.type === "asset" || item.payload.type === "combo") {
          const ids = item.payload.assetIds ?? [];
          if (ids.length === 0) throw new Error("sem ativos");
          // Re-validate each asset at dispatch time; skip forbidden, fail if none sendable.
          let anySent = false;
          for (const assetId of ids) {
            const asset = await assetProvider.get(assetId);
            if (!asset) continue;
            if (!pickSendableVersion(asset)) continue; // not published anymore
            if (isSensitiveAsset(asset) && !canSendSensitiveAsset(viewer)) continue;
            await sendAsset(asset, ctx);
            anySent = true;
          }
          if (!anySent) throw new Error("nenhum ativo enviável");
        } else if (item.payload.type === "product") {
          // Product card snapshot is rebuilt by the composer flow; here we send
          // the stored context text as a fallback (full card requires the live
          // catalog part which is out of the runner's scope at fire time).
          if (ctx && ctx.trim()) await send.send({ text: ctx });
          else throw new Error("produto sem contexto");
        }
        await provider.markSent(item.id);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "falha no envio agendado";
        await provider.markFailed(item.id, reason);
      } finally {
        inFlightRef.current.delete(item.id);
        if (!cancelled) {
          void queryClient.invalidateQueries({
            queryKey: scheduledSendsQueryKey(conversation.id),
          });
        }
      }
    };

    const tick = async () => {
      if (cancelled) return;
      let due: IScheduledSend[] = [];
      try {
        due = await provider.listDue(new Date().toISOString());
      } catch {
        return; // provider hiccup; try again next tick
      }
      for (const item of due) {
        if (cancelled) break;
        if (item.conversationId !== conversation.id) continue;
        if (item.status !== "pending") continue;
        // Engine-level due re-check (defensive; provider already filtered).
        if (!isDue(item.scheduledFor, new Date().toISOString())) continue;
        void dispatchOne(item);
      }
    };

    // Fire once on mount, then poll.
    void tick();
    const handle = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [
    provider,
    assetProvider,
    send,
    sendAsset,
    userRole,
    queryClient,
    conversation.id,
  ]);
}
```
> The runner intentionally does NOT rebuild a full product card at fire time — that requires the live catalog `IPart`, which is a Plan B composer concern. For products it sends the stored `contextMessage` (degraded). Document this in the commit; full product re-hydration is a Fase-2 enhancement noted in spec §11.

- [ ] 2. Verify Plan B's `useSendAsset` exists and matches the consumed signature.
```bash
node -e "const fs=require('fs');if(!fs.existsSync('src/features/quick-send/hooks/useSendAsset.ts'))throw new Error('Plan B useSendAsset missing — coordinate merge order');console.log('useSendAsset OK')"
```
Expected: `useSendAsset OK`. If missing, STOP and coordinate: Plan B must land `useSendAsset` first (CONTRACT §K). Do not stub it here.

- [ ] 3. Barrel (append-only):
```ts
export { useScheduledSendRunner } from "./hooks/useScheduledSendRunner";
```

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Commit.
```bash
git add src/features/quick-send/hooks/useScheduledSendRunner.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useScheduledSendRunner simulated runner (PRD-027 RF-023)

Polls listDue, re-validates published + sensitivity permission at dispatch,
sends via existing hooks, marks sent/failed. Never throws; forbidden/unpublished
payloads become failed with a reason.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 6 — `TemperatureChip` component (header chip with cross-fade + 1 pulse)

**RF-017, D-9.** A chip that reads `lead.temperature` and pulses ONCE when it escalates, honoring `prefers-reduced-motion`.

**Files:**
- Create: `src/features/quick-send/components/TemperatureChip.tsx`
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Create the component (props `ITemperatureChipProps { temperature: LeadTemperature; pulse?: boolean }`), reusing `TEMPERATURE_META`.

`src/features/quick-send/components/TemperatureChip.tsx`:
```ts
import { useEffect, useRef, useState } from "react";
import type { LeadTemperature } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { TEMPERATURE_META } from "@/features/leads/utils/leadDisplay";

export interface ITemperatureChipProps {
  temperature: LeadTemperature;
  /** When true, plays a single attention pulse (escalation just happened). */
  pulse?: boolean;
}

/** True when the user asked the OS to reduce motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Temperature chip for the ConversationHeader (D-9). Cross-fades on change and
 * plays ONE pulse when the temperature escalates, unless reduced-motion is on.
 */
export function TemperatureChip({ temperature, pulse = false }: ITemperatureChipProps) {
  const meta = TEMPERATURE_META[temperature];
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef<LeadTemperature>(temperature);

  // Trigger a single pulse when temperature changes upward (or when `pulse` set).
  useEffect(() => {
    const changed = prevRef.current !== temperature;
    prevRef.current = temperature;
    if ((changed || pulse) && !prefersReducedMotion()) {
      setPulsing(true);
      const t = window.setTimeout(() => setPulsing(false), 900);
      return () => window.clearTimeout(t);
    }
  }, [temperature, pulse]);

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors duration-500",
        meta.tone,
        pulsing && "animate-pulse",
      )}
      title={meta.label}
    >
      <Icon icon={meta.icon} size={12} aria-hidden />
      <span>{meta.label}</span>
    </span>
  );
}
```

- [ ] 2. Barrel (append-only):
```ts
export { TemperatureChip, type ITemperatureChipProps } from "./components/TemperatureChip";
```

- [ ] 3. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 4. Manual checklist: chip shows frio/morno/quente with the right icon and tone; changing temperature plays one pulse; with reduced-motion enabled there is no pulse; `role="status"` announces change; light/dark legible.

- [ ] 5. Commit.
```bash
git add src/features/quick-send/components/TemperatureChip.tsx src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add TemperatureChip with single pulse (PRD-027 RF-017)

Header chip reading lead.temperature; one pulse on escalation, reduced-motion
aware; reuses TEMPERATURE_META + role=status.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 7 — `LinkOpenIndicator` component (ambient "👁 Aberto há …" line)

**RF-018, D-8/D-9.** A small ambient line rendered under a link bubble: "👁 Aberto há 10 min · N vezes", tone `severity-info` (sky). Pure presentational (props `ILinkOpenIndicatorProps { link: ITrackableLink }`).

**Files:**
- Create: `src/features/quick-send/components/LinkOpenIndicator.tsx`
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Create the component.

`src/features/quick-send/components/LinkOpenIndicator.tsx`:
```ts
import type { ITrackableLink } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface ILinkOpenIndicatorProps {
  link: ITrackableLink;
}

/** Human "há N min/h/d" from an ISO timestamp (pt-BR, coarse). */
function relativeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.max(0, Math.round((now.getTime() - then) / 60_000));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} d`;
}

/**
 * Ambient open-tracking line under a link bubble (D-8/D-9). Renders nothing
 * until the first simulated open. Never a toast — quiet, sky-toned info.
 */
export function LinkOpenIndicator({ link }: ILinkOpenIndicatorProps) {
  const s = QUICK_SEND_STRINGS.link;
  if (link.opens <= 0 || !link.lastOpenedAt) return null;
  return (
    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-sky-700 dark:text-sky-300">
      <Icon icon="mdi:eye-outline" size={12} aria-hidden />
      <span>
        {s.openedAgo(relativeAgo(link.lastOpenedAt))} · {s.openCount(link.opens)}
      </span>
    </p>
  );
}
```

- [ ] 2. Ensure i18n `link` group keys exist (append missing only) in `src/features/quick-send/i18n/pt-BR.ts`:
```ts
  link: {
    openedAgo: (label: string) => `Aberto há ${label}`,
    openCount: (n: number) => (n === 1 ? "1 vez" : `${n} vezes`),
    trackableNote: "Link rastreável",
  },
```
> Show the added-keys diff. Keep any existing `link` keys.

- [ ] 3. Barrel (append-only):
```ts
export { LinkOpenIndicator, type ILinkOpenIndicatorProps } from "./components/LinkOpenIndicator";
```

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Manual checklist: renders nothing when `opens === 0`; shows "Aberto há 10 min · 2 vezes" for a link with opens; sky tone in light + dark.

- [ ] 6. Commit.
```bash
git add src/features/quick-send/components/LinkOpenIndicator.tsx src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add LinkOpenIndicator ambient line (PRD-027 RF-018)

Quiet sky-toned "Aberto há … · N vezes" under link bubbles; hidden until the
first simulated open.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 8 — `useTrackableLinkSimulation` (mock open runner + temperature escalation + system bubble)

**RF-016/RF-017, D-8/D-9.** A runner that periodically registers a simulated open on this conversation's links; on each new open, if the link has a `leadId`, it escalates the lead temperature (monotonic via `nextTemperature`) through `useLeadsProvider().update` and emits a `SystemBubble` cause→effect line. Audits nothing destructive (opens are reads) but the escalation is observable.

> **CRITICAL — live-update mechanism (verified against the repo, NOT TanStack Query).** `useMessages` (`src/features/conversations/hooks/useMessages.ts`) and `useConversationDetail` (`src/features/conversations/hooks/useConversationDetail.ts`) keep their data in LOCAL `useState`, refreshed by an internal `refresh()` tick — there is **no** `['messages']`/`['leads']`/`['conversations']` TanStack Query to invalidate. So the runner must NOT rely on `queryClient.invalidateQueries` for the bubble or the chip. Instead it must:
> 1. **Render the system bubble live** through the conversation context — `useConversationContext().messages.appendOptimistic(systemMessage)` — exactly the path `useMessageSend` uses (`ConversationRunners` in Task 13 is mounted INSIDE `<ConversationProvider>`, so the context is available). It also persists the bubble via `messagesProvider.send(conversationId, { authorType: "system", text })` so it survives a remount; the optimistic append is what makes it appear immediately.
> 2. **Refresh the lead** so `TemperatureChip` (fed by `useConversationDetail().lead` → `ConversationHeader`) re-fetches — by calling a `refreshDetail` callback the page passes in (`detail.refresh`, the same callback already wired to `onSent`/`onMutated` in `ConversationPage`).
> The query invalidation on `['quick-send','links',…]` is still valid (that key IS a real query — `useConversationLinks`, Task 9). Only messages/leads/conversations invalidation is dropped.

**Files:**
- Create: `src/features/quick-send/hooks/useTrackableLinkSimulation.ts`
- Test: `bun run build` green + manual checklist (an open raises temperature and adds a system bubble exactly once per escalation).

**Steps:**

- [ ] 1. Confirm the live-update surfaces verified above (already read; this is a re-check, not discovery):
  - `src/features/conversations/hooks/useMessages.ts` exposes `appendOptimistic(message): { commit; fail; update }` and `refresh()` over LOCAL state (not a query).
  - `src/features/conversations/hooks/ConversationContext.tsx` exposes `useConversationContext(): { messages: IUseMessagesResult }`.
  - `src/features/conversations/hooks/useConversationDetail.ts` returns `{ lead, refresh, ... }` over LOCAL state; `lead` drives `TemperatureChip` via `ConversationHeader`.
  - `IMessage` (`src/shared/types/conversation.ts`) fields: `id, conversationId, direction ("in"|"out"), authorType ("customer"|"seller"|"sdr"|"system"), provider ("meta"|"evolution"|"mock"), text, status ("sent"|"delivered"|"read"|"failed"), sentAt`.
  - `MessageBubble` renders `authorType === "system"` via `SystemBubble` (first branch) — so an appended system message shows as a SystemBubble automatically.
```bash
node -e "const fs=require('fs');for(const f of ['src/features/conversations/hooks/useMessages.ts','src/features/conversations/hooks/ConversationContext.tsx','src/features/conversations/hooks/useConversationDetail.ts']){const c=fs.readFileSync(f,'utf8');if(!/appendOptimistic|useConversationContext|refresh/.test(c))throw new Error('shape changed: '+f)}console.log('live-update surfaces OK')"
```
Expected: prints `live-update surfaces OK`.

- [ ] 2. Create the runner.

`src/features/quick-send/hooks/useTrackableLinkSimulation.ts`:
```ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  ID,
  IConversation,
  IMessage,
  ITrackableLink,
  LeadTemperature,
} from "@/shared/types";
import {
  useTrackableLinkProvider,
  useLeadsProvider,
  useMessagesProvider,
} from "@/providers/data";
import { useConversationContext } from "@/features/conversations/hooks/ConversationContext";
import { nextTemperature } from "../engine/temperatureEscalation";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

// Trackable-links query key — MUST match `conversationLinksQueryKey` in
// useConversationLinks.ts (Task 9). Inlined here so this runner (Task 8) builds
// green before Task 9 lands; both produce ["quick-send","links",conversationId].
function linksQueryKey(conversationId: ID): readonly unknown[] {
  return ["quick-send", "links", conversationId] as const;
}

const OPEN_TICK_MS = 12_000;
/** Chance a tick produces an open for at least one not-yet-opened link. */
const OPEN_PROBABILITY = 0.5;

/**
 * Simulated trackable-link open runner (D-8/D-9). On each tick, with some
 * probability it registers an open on one of this conversation's links. A new
 * open whose link has a leadId escalates the lead temperature MONOTONICALLY
 * and drops a single SystemBubble cause→effect line. Idempotent per
 * (linkId,temperature) so re-opens at the same level never re-escalate.
 *
 * Live updates do NOT use TanStack invalidation for messages/leads (those are
 * LOCAL useState in useMessages/useConversationDetail). Instead:
 *  - the SystemBubble is appended via the conversation context's
 *    `messages.appendOptimistic(...)` (the same path useMessageSend uses) AND
 *    persisted through `messagesProvider.send({ authorType: "system" })`;
 *  - the lead chip refreshes by calling `refreshDetail()` (the page passes
 *    `detail.refresh`), which re-fetches the lead behind TemperatureChip.
 * Only the trackable-links query (a real query) is invalidated.
 */
export function useTrackableLinkSimulation(
  conversation: IConversation,
  refreshDetail: () => void,
): void {
  const linkProvider = useTrackableLinkProvider();
  const leadsProvider = useLeadsProvider();
  const messagesProvider = useMessagesProvider();
  const queryClient = useQueryClient();
  const { messages } = useConversationContext();
  // Records the temperature we last announced per leadId so we never repeat.
  const announcedRef = useRef<Map<ID, LeadTemperature>>(new Map());
  // The conversation-context `messages` object and `refreshDetail` are recreated
  // on every parent render; capture the bits we use in refs so the polling
  // effect's deps stay stable (otherwise the interval resets on every render).
  const appendOptimisticRef = useRef(messages.appendOptimistic);
  appendOptimisticRef.current = messages.appendOptimistic;
  const refreshDetailRef = useRef(refreshDetail);
  refreshDetailRef.current = refreshDetail;

  useEffect(() => {
    let cancelled = false;
    const leadId = conversation.leadId;

    const escalateAndAnnounce = async (link: ITrackableLink) => {
      if (!leadId) return;
      // Read current lead temperature, compute next (monotonic).
      const lead = await leadsProvider.get(leadId).catch(() => null);
      if (!lead) return;
      const current = lead.temperature as LeadTemperature;
      const next = nextTemperature(current);
      if (next === current) return; // already at top or no change
      if (announcedRef.current.get(leadId) === next) return; // already announced this level
      announcedRef.current.set(leadId, next);
      await leadsProvider.update(leadId, { temperature: next });
      // System bubble cause→effect (D-9).
      const note = QUICK_SEND_STRINGS.temperature.roseUpTo(next, link.utm?.campaign ?? "o link");
      // Append the bubble LIVE through the conversation context so it shows
      // immediately (useMessages is local state, not a query).
      const now = new Date().toISOString();
      const optimistic: IMessage = {
        id: `tmp-sys-${crypto.randomUUID()}`,
        conversationId: conversation.id,
        direction: "out",
        authorType: "system",
        provider: "mock",
        text: note,
        status: "sent",
        sentAt: now,
      };
      const handle = appendOptimisticRef.current(optimistic);
      try {
        // Persist so the note survives a remount; swap the optimistic row.
        const real = await messagesProvider.send(conversation.id, {
          authorType: "system",
          text: note,
        });
        handle.commit({ ...real, status: "sent" });
      } catch {
        // Non-fatal: keep the optimistic bubble; lead chip still refreshes.
      }
      // Re-fetch the lead so the header TemperatureChip updates + pulses.
      if (!cancelled) refreshDetailRef.current();
      toast(QUICK_SEND_STRINGS.temperature.toast(next));
    };

    const tick = async () => {
      if (cancelled) return;
      if (Math.random() > OPEN_PROBABILITY) return;
      let links: ITrackableLink[] = [];
      try {
        links = await linkProvider.listByConversation(conversation.id);
      } catch {
        return;
      }
      const candidates = links.filter((l) => l.leadId === leadId);
      if (candidates.length === 0) return;
      // Pick the link with the fewest opens to spread the simulation.
      const target = [...candidates].sort((a, b) => a.opens - b.opens)[0];
      try {
        const updated = await linkProvider.registerOpen(target.id);
        // Trackable-links IS a real query (useConversationLinks) — invalidate it
        // so the LinkOpenIndicator's opens count refreshes.
        void queryClient.invalidateQueries({
          queryKey: linksQueryKey(conversation.id),
        });
        await escalateAndAnnounce(updated);
      } catch {
        // ignore — simulation is best-effort
      }
    };

    const handle = window.setInterval(() => void tick(), OPEN_TICK_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [
    linkProvider,
    leadsProvider,
    messagesProvider,
    queryClient,
    conversation.id,
    conversation.leadId,
  ]);
}
```
> `nextTemperature(current)` is the Plan A engine (monotonic; CONTRACT §B #6). The guard `announcedRef` + the `next === current` check enforce "never rebaixa" and "one system bubble per escalation". The bubble appears LIVE because it is appended through `useConversationContext().messages.appendOptimistic(...)` (the same mechanism `useMessageSend` uses), then persisted via `messagesProvider.send({ authorType: "system" })`. `MessageBubble` already renders `authorType === "system"` as a `SystemBubble`. The chip updates because `refreshDetail()` (the page's `detail.refresh`) re-fetches the lead feeding `ConversationHeader` → `TemperatureChip`. `appendOptimistic` and `refreshDetail` are read through refs (`appendOptimisticRef`/`refreshDetailRef`, kept current each render) so the polling effect's deps stay stable and the 12s interval is NOT reset on every parent re-render — the `messages` context object and `refreshDetail` are recreated each render, so they are deliberately kept OUT of the dep array. The inlined `linksQueryKey` (mirroring Task 9's `conversationLinksQueryKey`) is the only real query invalidated; it is inlined so Task 8 builds green before Task 9 lands.

- [ ] 3. Ensure i18n `temperature` group has the two functions used (append missing only) in `src/features/quick-send/i18n/pt-BR.ts`:
```ts
  temperature: {
    // SystemBubble cause→effect line. `label` is the new temperature word.
    roseUpTo: (label: LeadTemperature, what: string) => {
      const word = label === "quente" ? "Quente" : label === "morno" ? "Morno" : "Frio";
      const emoji = label === "quente" ? "🔥" : "🌤️";
      return `${emoji} Temperatura subiu para ${word} — cliente abriu ${what}`;
    },
    toast: (label: LeadTemperature) => {
      const word = label === "quente" ? "Quente" : label === "morno" ? "Morno" : "Frio";
      return `Temperatura do lead subiu para ${word}.`;
    },
  },
```
> Import `LeadTemperature` type at the top of the i18n file if not already: `import type { LeadTemperature } from "@/shared/types";`. Show the added-keys diff.

- [ ] 4. Barrel (append-only):
```ts
export { useTrackableLinkSimulation } from "./hooks/useTrackableLinkSimulation";
```

- [ ] 5. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 6. Manual checklist (mounted in Task 13): with a conversation whose lead is `frio` and a link bound to that lead, within ~12–24s a simulated open raises temperature to `morno` exactly once, a system bubble "🔥/🌤️ Temperatura subiu para Morno — cliente abriu …" appears, the header chip pulses; re-opens at the same level do NOT re-escalate or re-announce; `quente` is stable.

- [ ] 7. Commit.
```bash
git add src/features/quick-send/hooks/useTrackableLinkSimulation.ts src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useTrackableLinkSimulation runner (PRD-027 RF-016/017)

Simulates link opens; a new open on a lead-bound link escalates temperature
monotonically via nextTemperature + useLeadsProvider().update and drops one
SystemBubble cause->effect line. Idempotent per escalation level.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 8.5 — PRODUCER wiring: real link sends emit `[link]<json>` (Modify Plan B's `useSendAsset`)

**RF-016, D-8, CONTRACT §A/§B/§H.1.** This task closes the producer half of the `[link]` flow. Today Plan B's `useSendAsset` (CONTRACT §H.2 — Plan-B-owned) deliberately sends an asset whose `kind === "link"` as **plain text** with the explicit note *"rich [link] tracking lands in Plan C"*. So nothing in a real send ever produces a `[link]<json>` message — the decode branch (Task 9), the open-simulation runner (Task 8) and the temperature rise (RF-016/017/018) only fire on **seeded** links, never on links a seller actually sends. This task makes a real link send (the staged-chip flow, the `AssetPicker` inline "send now" affordance, AND the combo fan-out — all funnel through `useSendAsset`) (1) create an `ITrackableLink` via `useTrackableLinkProvider().create(...)` bound to `conversation.id` + `conversation.leadId`, then (2) send an outbound `IMessage` whose `text` is `encodeLinkMarker({ linkId, label, shortRef })` (Plan A engine, §B). It **degrades gracefully**: if creation fails, it falls back to Plan B's exact plain-text behavior — never a broken message.

> **Why approach (A) — MODIFY `useSendAsset` — and not a new `useSendLink` hook (approach B).** Every link send in the feature already funnels through `useSendAsset`: the staged-chip confirm (Plan B), the `AssetPicker` inline send-now (Plan B, `handleSendNow` → `sendAsset`), and the combo fan-out (Task 11 `useComboSend` → `sendAsset`). Modifying the single `kind === "link"` branch closes the loop for ALL of them at once. A dedicated `useSendLink` (B) would STILL require `useSendAsset` to route links into it (otherwise staged-chip + combo keep sending plain text), so (B) is strictly the same call-site edit PLUS an extra file — no benefit, more surface. Plan C is allowed to Modify a Plan B file: it runs AFTER Plan B (CONTRACT §K), and Plan B itself pins this exact handoff in the branch comment ("rich [link] tracking lands in Plan C"). This task edits ONLY the `kind === "link"` branch of `useSendAsset` — the file/media branch, the version/sensitivity gates and `recordSend` are untouched. CONTRACT §K is updated (step 5) to record the shared ownership of this one branch.

**Files:**
- Modify: `src/features/quick-send/hooks/useSendAsset.ts` (the `kind === "link"` branch ONLY — a Plan B file; Plan C runs after B)
- Modify: `docs/superpowers/plans/2026-06-06-prd-027-CONTRACT.md` (§K — record that the `useSendAsset` link branch is co-owned: Plan B creates it as plain-text, Plan C upgrades it to the `[link]` producer)
- Test: `bun run build` green + manual checklist (a real link send renders as a `[link]` bubble and becomes eligible for the open-simulation → temperature rise).

**Steps:**

- [ ] 1. Confirm the prerequisites this task consumes already landed (Plan A engine + provider, Plan B file).
```bash
node -e "const fs=require('fs');const e=fs.readFileSync('src/features/quick-send/engine/trackableLink.ts','utf8');for(const s of ['encodeLinkMarker','buildShortRef','buildUtm']){if(!e.includes(s))throw new Error('MISSING engine export '+s+' — Plan A incomplete')}if(!fs.existsSync('src/providers/data/hooks/useTrackableLinkProvider.ts'))throw new Error('MISSING useTrackableLinkProvider — Plan A incomplete');if(!fs.existsSync('src/features/quick-send/hooks/useSendAsset.ts'))throw new Error('MISSING useSendAsset — Plan B must land first (CONTRACT §K)');console.log('producer prereqs OK')"
```
Expected: `producer prereqs OK`. If any throws, STOP and coordinate merge order — do NOT stub the engine, the provider or `useSendAsset` here.

- [ ] 2. Read the current `useSendAsset.ts` and locate the `kind === "link"` branch (Plan B shipped it as plain text). It currently reads exactly:
```ts
        if (sendable.kind === "link") {
          // Links are sent as plain text in Plan B; rich [link] tracking lands in Plan C.
          const linkText = [text, sendable.url].filter(Boolean).join("\n");
          await send({ text: linkText || (sendable.url ?? sendable.title) });
        } else {
```
> If Plan B's branch differs (e.g. a refactor), find the `sendable.kind === "link"` block and adapt — the only contract is: this branch must end up producing `[link]<json>` on success and the plain-text fallback on failure. Do NOT touch the `else` (file/media) branch.

- [ ] 3. Add the imports the producer needs. At the top of `src/features/quick-send/hooks/useSendAsset.ts`, alongside the existing imports, add:
```ts
import { useTrackableLinkProvider } from "@/providers/data";
import {
  buildShortRef,
  buildUtm,
  encodeLinkMarker,
} from "../engine/trackableLink";
```
> `useMediaStorageProvider`, `useAssetLibraryProvider`, `useMessageSend`, `useAuth`, `pickSendableVersion`, `isSensitiveAsset`, `canSendSensitiveAsset`, `QUICK_SEND_STRINGS` are already imported by Plan B — do NOT re-import them. Add the `useTrackableLinkProvider` slice hook next to the existing provider hooks inside the component body:
```ts
  const trackableLinks = useTrackableLinkProvider();
```
Place it right after the existing `const library = useAssetLibraryProvider();` line.

- [ ] 4. Replace ONLY the `kind === "link"` branch body with the producer (create trackable link → encode marker → send), keeping the plain-text path as the graceful fallback. Replace:
```ts
        if (sendable.kind === "link") {
          // Links are sent as plain text in Plan B; rich [link] tracking lands in Plan C.
          const linkText = [text, sendable.url].filter(Boolean).join("\n");
          await send({ text: linkText || (sendable.url ?? sendable.title) });
        } else {
```
with:
```ts
        if (sendable.kind === "link") {
          // PRODUCER (Plan C, Task 8.5): a real link send creates a trackable
          // link bound to this conversation + lead, then sends a `[link]<json>`
          // marker message. The created ITrackableLink (conversationId + leadId)
          // is what makes the open-simulation runner (useTrackableLinkSimulation)
          // pick it up and raise the lead temperature (RF-016/017/018, D-8/D-9).
          const targetUrl = sendable.url ?? "";
          const label = sendable.title;
          // Graceful degradation: if there is no URL or creation fails, fall back
          // to Plan B's exact plain-text behavior — never a broken message.
          let linkMarker: string | null = null;
          if (targetUrl) {
            try {
              const created = await trackableLinks.create({
                assetId: sendable.id,
                conversationId: conversation.id,
                leadId: conversation.leadId, // temperature target (undefined for customer-only convos)
                targetUrl,
                shortRef: buildShortRef(`${conversation.id}:${sendable.id}:${Date.now()}`),
                utm: buildUtm({
                  source: "whatsapp",
                  medium: "chat",
                  campaign: label,
                }),
                createdBy: currentUser?.id ?? "system",
              });
              linkMarker = encodeLinkMarker({
                linkId: created.id,
                label,
                shortRef: created.shortRef,
              });
            } catch {
              // Tracking creation failed — degrade to plain text below.
              linkMarker = null;
            }
          }

          if (linkMarker) {
            // Optional context note precedes the marker as a separate plain
            // message so the marker text stays parseable by decodeLinkMarker.
            if (text) await send({ text });
            await send({ text: linkMarker });
          } else {
            // Plan B fallback: plain-text link (no tracking).
            const linkText = [text, sendable.url].filter(Boolean).join("\n");
            await send({ text: linkText || (sendable.url ?? sendable.title) });
          }
        } else {
```
> Rationale for the separate context message: the `[link]` marker message must be `decodeLinkMarker`-parseable, i.e. its `text` starts with `[link]` and the rest is pure JSON (CONTRACT §H.1). So a context note can't share the same message; it is sent first as plain text (mirrors how `useSendProductCard` sends the context note before the `[produto]` marker, Plan B Task B3). `conversation.leadId` is `ID | undefined` (CONTRACT §I, verified in `src/shared/types/conversation.ts`) — passing `undefined` is valid for `ITrackableLink.leadId?` and simply means "no temperature target" (customer-only conversations); the simulation runner already skips links without a `leadId` (`if (!leadId) return;`). `buildShortRef`/`buildUtm`/`encodeLinkMarker` are the Plan A engine functions (CONTRACT §B #7); `trackableLinks.create(...)` takes `Omit<ITrackableLink,"id"|"storeId"|"createdAt"|"opens">` (CONTRACT §A) — `storeId` is injected by the mock provider via `withCreateStoreId`.

- [ ] 5. Update the dependency array of the `sendAsset` `useCallback` to include the new provider. Plan B's array is `[conversation.id, currentUser, library, media, send]`; it reads `conversation.leadId` too now, so change it to:
```ts
    [conversation.id, conversation.leadId, currentUser, library, media, send, trackableLinks],
```

- [ ] 6. Update CONTRACT §K (ownership) so the shared ownership of this one branch is recorded — do NOT diverge silently. In `docs/superpowers/plans/2026-06-06-prd-027-CONTRACT.md`, under **`### Plan C`**, the first bullet lists the Plan C hooks; append a dedicated ownership note right after that bullet (or extend the Plan C hooks bullet). Add:
```md
- **Modify (shared with Plan B):** `src/features/quick-send/hooks/useSendAsset.ts` — the `kind === "link"` branch ONLY. Plan B creates `useSendAsset` and ships the link branch as PLAIN TEXT (it explicitly punts tracking: "rich [link] tracking lands in Plan C"). Plan C (Task 8.5) UPGRADES that one branch into the `[link]<json>` PRODUCER: `useTrackableLinkProvider().create(...)` (bound to `conversation.id`/`conversation.leadId`) → `encodeLinkMarker(...)` → `useMessageSend().send(...)`, degrading to Plan B's plain-text path on failure. No other branch of `useSendAsset` is touched. This closes the producer→decode→simulate→temperature loop end-to-end (the open-simulation runner + `LinkBubble` only ever acted on seeded links before this).
```
Also extend §H.1 to record the producer is now wired (not just defined). In §H.1, after the line that ends with *"…the send-flow wiring stays Plan C)."* style note for `encodeLinkMarker`, the existing text already says the send-flow wiring is Plan C; append one clarifying sentence to the `[link]` bullet:
```md
  The send-flow PRODUCER is wired in Plan C Task 8.5 by modifying `useSendAsset`'s `kind === "link"` branch (create `ITrackableLink` → `encodeLinkMarker` → `send`); seeded links remain in the mocks, but newly-sent links are now also created at send time and are immediately eligible for the open-simulation/temperature runner.
```
> Show the exact diff of both CONTRACT edits in this step. These are append-only clarifications — do not remove or contradict any existing pinned text.

- [ ] 7. Confirm the open-simulation runner already covers provider-created links (no code change expected — verification only). `useTrackableLinkSimulation` (Task 8) fetches links each tick via `linkProvider.listByConversation(conversation.id)` and filters `candidates = links.filter((l) => l.leadId === leadId)`. Because Task 8.5 creates each link with `conversationId === conversation.id` and `leadId === conversation.leadId`, a newly-sent link appears in `listByConversation` and matches the lead filter on the very next tick — so it is escalation-eligible WITHOUT any change to Task 8. Verify the runner is not seed-only:
```bash
node -e "const fs=require('fs');const c=fs.readFileSync('src/features/quick-send/hooks/useTrackableLinkSimulation.ts','utf8');if(!/listByConversation/.test(c))throw new Error('runner is not provider-backed — investigate');if(/seed|SEED|fixture/.test(c))throw new Error('runner appears seed-scoped — adjust it to use listByConversation for ALL links of the conversation');console.log('simulation covers provider-created links OK')"
```
Expected: `simulation covers provider-created links OK`. If it throws because the runner is seed-scoped, adjust Task 8's runner to source links from `linkProvider.listByConversation(conversation.id)` (the CONTRACT §A method) so newly-sent links are eligible — but per the Task 8 code above it already does, so no change should be needed.

- [ ] 8. Build gate.
```bash
bun run build
```
Expected: exit 0. If the build flags `trackableLinks.create` argument types, re-check the `create` input against CONTRACT §A `Omit<ITrackableLink,"id"|"storeId"|"createdAt"|"opens">` — you must pass `targetUrl`, `shortRef`, `createdBy` and may pass `assetId`/`conversationId`/`leadId`/`utm`; do NOT pass `id`/`storeId`/`opens`/`createdAt`.

- [ ] 9. Manual checklist (record as verified in the commit body):
  - Send a `category: "link"` asset (one with a `url`) from the picker (staged-chip confirm) into a conversation whose `leadId` is set → an outbound `[link]` bubble renders (label + shortRef + "Link rastreável") via Task 9's `LinkBubble`, NOT plain text.
  - Within ~12–24s the open-simulation runner (Task 8) registers an open on the just-created link, the `LinkOpenIndicator` line appears, and the lead temperature escalates one step (one pulse + one SystemBubble) — proving produce→decode→simulate→temperature is closed end-to-end.
  - Send-now (inline picker affordance) and combo fan-out (a combo containing a link asset) ALSO produce `[link]` bubbles (they route through the same `useSendAsset`).
  - Degradation: a link asset with NO `url`, or with the trackable-link provider forced to throw, sends Plan B's plain-text link (never a broken/empty message); customer-only conversation (no `leadId`) still sends a `[link]` bubble but no temperature rise.
  - Non-regression: file/image/video/document asset sends are unchanged (still upload via PRD-026 → media message); `recordSend` still fires for every send.

- [ ] 10. Commit.
```bash
git add src/features/quick-send/hooks/useSendAsset.ts docs/superpowers/plans/2026-06-06-prd-027-CONTRACT.md
git commit -m "$(cat <<'EOF'
feat(quick-send): produce [link]<json> on real link sends (PRD-027 RF-016 D-8)

Upgrades useSendAsset's kind==="link" branch (Plan B plain-text placeholder)
into the trackable-link PRODUCER: create ITrackableLink bound to the conversation
+ lead, encode via encodeLinkMarker, then send the [link] marker message. Degrades
to plain text if there is no URL or creation fails. This closes the
produce->decode->simulate->temperature loop — newly-sent links are now eligible
for the open-simulation runner and the lead temperature rise (RF-017/018).
CONTRACT §K/§H.1 updated to record the shared useSendAsset link-branch ownership.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 9 — `MessageBubble` `[link]` branch + `useConversationLinks` lookup

**RF-018, CONTRACT §H.1/§H.2.** Add the `[link]` marker branch to `MessageBubble` (AFTER the `[template]` branch, BEFORE media-type checks), rendering a link bubble with `LinkOpenIndicator`. The bubble must resolve the live `ITrackableLink` (for `opens`) by `linkId` from the decoded marker.

**Files:**
- Create: `src/features/quick-send/components/LinkBubble.tsx`
- Create: `src/features/quick-send/hooks/useConversationLinks.ts`
- Modify: `src/features/conversations/components/bubbles/MessageBubble.tsx` (C-owned `[link]` branch only)
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Create a small read hook for links by conversation (so `LinkBubble` can show live `opens`).

`src/features/quick-send/hooks/useConversationLinks.ts`:
```ts
import { useQuery } from "@tanstack/react-query";
import type { ID, ITrackableLink } from "@/shared/types";
import { useTrackableLinkProvider } from "@/providers/data";

export function conversationLinksQueryKey(conversationId: ID): readonly unknown[] {
  return ["quick-send", "links", conversationId] as const;
}

/** Live trackable links of a conversation, keyed for the open-simulation runner. */
export function useConversationLinks(conversationId: ID): {
  links: ITrackableLink[];
  byId: Map<ID, ITrackableLink>;
  isLoading: boolean;
} {
  const provider = useTrackableLinkProvider();
  const query = useQuery({
    queryKey: conversationLinksQueryKey(conversationId),
    queryFn: () => provider.listByConversation(conversationId),
    staleTime: 5_000,
  });
  const links = query.data ?? [];
  const byId = new Map<ID, ITrackableLink>(links.map((l) => [l.id, l]));
  return { links, byId, isLoading: query.isLoading };
}
```

- [ ] 2. Create the `LinkBubble` reusing the existing bubble chrome look. Inspect `DocumentBubble`/`BubbleChrome` first to mirror styling:
```bash
node -e "const fs=require('fs');console.log(fs.readFileSync('src/features/conversations/components/bubbles/DocumentBubble.tsx','utf8'))"
```
Then create `src/features/quick-send/components/LinkBubble.tsx`:
```ts
import type { ID, IMessage, ITrackableLink } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { TRACKABLE_LINK_MARKER } from "../engine/trackableLink";
import { LinkOpenIndicator } from "./LinkOpenIndicator";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface ILinkPayload {
  linkId: ID;
  label: string;
  shortRef: string;
}

/** Parse `[link]<json>` from message text. Null on malformed → caller degrades. */
export function decodeLinkMarker(text: string): ILinkPayload | null {
  if (!text.startsWith(TRACKABLE_LINK_MARKER)) return null;
  const json = text.slice(TRACKABLE_LINK_MARKER.length);
  try {
    const parsed = JSON.parse(json) as ILinkPayload;
    if (!parsed || typeof parsed.linkId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface ILinkBubbleProps {
  message: IMessage;
  /** Live link record (for opens/lastOpenedAt); resolved by linkId. */
  link?: ITrackableLink | null;
  onRetry?: () => void;
}

/**
 * Trackable-link bubble (D-8). Renders the link label + shortRef and, when a
 * live ITrackableLink is available, the ambient LinkOpenIndicator. Degrades to
 * a plain link row when the marker can't be decoded.
 */
export function LinkBubble({ message, link, onRetry }: ILinkBubbleProps) {
  const s = QUICK_SEND_STRINGS.link;
  const isOut = message.direction === "out";
  const payload = decodeLinkMarker(message.text);

  return (
    <div className={cn("flex", isOut ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl border px-3 py-2 text-sm",
          isOut ? "bg-primary/10 border-primary/20" : "bg-card border-border",
        )}
      >
        <div className="flex items-start gap-2">
          <Icon icon="mdi:link-variant" size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">
              {payload?.label ?? message.text}
            </p>
            {payload?.shortRef && (
              <p className="truncate text-[11px] text-muted-foreground">{payload.shortRef}</p>
            )}
            <p className="mt-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Icon icon="mdi:radar" size={10} aria-hidden />
              {s.trackableNote}
            </p>
            {link && <LinkOpenIndicator link={link} />}
          </div>
        </div>
        {message.status === "failed" && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-[11px] font-medium text-destructive hover:underline"
          >
            Tentar novamente
          </button>
        )}
      </div>
    </div>
  );
}
```
> If `DocumentBubble` exposes a reusable `BubbleChrome` wrapper, prefer wrapping with it instead of the hand-rolled div (the spec says "irmão visual de DocumentBubble"). Keep the `LinkOpenIndicator` + trackable note regardless.

- [ ] 3. Wire the `[link]` branch into `MessageBubble`. Read the current file (it may already carry Plan B's `[produto]` branch). Add the `[link]` branch AFTER the `[template]` branch and AFTER/next to the `[produto]` branch, BEFORE the media-type checks.

In `src/features/conversations/components/bubbles/MessageBubble.tsx`, add imports near the top (next to existing imports):
```ts
import { LinkBubble, decodeLinkMarker } from "@/features/quick-send/components/LinkBubble";
import { useConversationLinks } from "@/features/quick-send/hooks/useConversationLinks";
import { TRACKABLE_LINK_MARKER } from "@/features/quick-send/engine/trackableLink";
```
Then, inside `MessageBubble`, BEFORE the `mediaType` checks (and after the `[template]` branch), add:
```ts
  if (message.text.startsWith(TRACKABLE_LINK_MARKER)) {
    return <LinkBubbleWithLiveData message={message} onRetry={onRetry} />;
  }
```
And add this co-located wrapper at the bottom of the file (so the hook only runs for link messages — hooks must not be conditional inside `MessageBubble` itself):
```ts
function LinkBubbleWithLiveData({
  message,
  onRetry,
}: {
  message: IMessage;
  onRetry?: () => void;
}) {
  const payload = decodeLinkMarker(message.text);
  const { byId } = useConversationLinks(message.conversationId);
  const link = payload ? (byId.get(payload.linkId) ?? null) : null;
  return <LinkBubble message={message} link={link} onRetry={onRetry} />;
}
```
> Do NOT modify the `[template]`, system, or media branches. If Plan B already added the `[produto]` branch + a similar wrapper, place the `[link]` branch immediately after it. The conditional `return` is the branch; the hook lives only in the dedicated wrapper component, preserving the Rules of Hooks.

- [ ] 4. Barrel (append-only):
```ts
export { LinkBubble, decodeLinkMarker, type ILinkBubbleProps, type ILinkPayload } from "./components/LinkBubble";
export { useConversationLinks, conversationLinksQueryKey } from "./hooks/useConversationLinks";
```

- [ ] 5. Build gate.
```bash
bun run build
```
Expected: exit 0. No regression to existing bubble branches.

- [ ] 6. Manual checklist: an outbound `[link]{...}` message renders as a link bubble (label + shortRef + "Link rastreável"); when its `ITrackableLink` has opens, the ambient indicator appears; a malformed `[link]` payload degrades to plain text (label = raw text); template/image/audio/document/system bubbles unchanged.

- [ ] 7. Commit.
```bash
git add src/features/quick-send/components/LinkBubble.tsx src/features/quick-send/hooks/useConversationLinks.ts src/features/conversations/components/bubbles/MessageBubble.tsx src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(conversations): render [link] bubble with open indicator (PRD-027 RF-018)

Adds the [link] marker branch to MessageBubble (after [template], before media)
via a LinkBubble that resolves the live ITrackableLink for opens; degrades to
text on malformed payload. Hook isolated in a dedicated wrapper (Rules of Hooks).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 10 — `ComboTray` component (reorderable tray + sequential fan-out + partial-failure)

**RF-021/RF-022, D-10.** A revisable tray above the composer showing staged combo items, reorderable by buttons AND keyboard (Alt+↑/↓), with a "Enviar todos" that triggers sequential fan-out (handled by the consumer via `onSendAll`) and a `progress` indicator "Enviando i/N". The component is presentational + reorder UX; the actual send loop lives in the consumer (Task 11) using the Plan A `planComboSend` engine.

**Files:**
- Create: `src/features/quick-send/components/ComboTray.tsx`
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Create the component (props exactly `IComboTrayProps { items: IAssetLibraryItem[]; onReorder: (assetIds: ID[]) => void; onRemove: (id: ID) => void; onSendAll: () => void; progress?: { sent: number; total: number } }`).

`src/features/quick-send/components/ComboTray.tsx`:
```ts
import type { ID, IAssetLibraryItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IComboTrayProps {
  items: IAssetLibraryItem[];
  onReorder: (assetIds: ID[]) => void;
  onRemove: (id: ID) => void;
  onSendAll: () => void;
  progress?: { sent: number; total: number };
}

const CATEGORY_ICON: Record<IAssetLibraryItem["category"], string> = {
  catalogo: "mdi:book-open-variant",
  ficha_tecnica: "mdi:file-document-outline",
  tabela_preco: "mdi:currency-usd",
  garantia: "mdi:shield-check-outline",
  video: "mdi:play-circle-outline",
  link: "mdi:link-variant",
};

/** Move item at `from` to `to`, returning the reordered id list. */
function reorder(items: IAssetLibraryItem[], from: number, to: number): ID[] {
  const ids = items.map((i) => i.id);
  if (to < 0 || to >= ids.length) return ids;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved);
  return ids;
}

/**
 * Revisable combo tray above the composer (D-10). Reorder via ▲▼ buttons and
 * keyboard Alt+↑/↓; remove per item; "Enviar todos" delegates the sequential
 * fan-out to the consumer (which uses planComboSend + tolerates partial fail).
 */
export function ComboTray({ items, onReorder, onRemove, onSendAll, progress }: IComboTrayProps) {
  const s = QUICK_SEND_STRINGS.combo;
  if (items.length === 0) return null;
  const sending = progress !== undefined && progress.sent < progress.total;

  const handleKey = (e: React.KeyboardEvent<HTMLLIElement>, index: number) => {
    if (!e.altKey) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onReorder(reorder(items, index, index - 1));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onReorder(reorder(items, index, index + 1));
    }
  };

  return (
    <div className="border-b border-border bg-muted/30 px-3 py-2" aria-label={s.tray}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Icon icon="mdi:package-variant-closed" size={14} />
          {s.tray} · {items.length}
        </span>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs"
          onClick={onSendAll}
          disabled={sending}
        >
          {sending ? (
            <>
              <Icon icon="mdi:loading" size={13} className="animate-spin" />
              {s.sending(progress!.sent + 1, progress!.total)}
            </>
          ) : (
            <>
              <Icon icon="mdi:send-outline" size={13} />
              {s.sendAll}
            </>
          )}
        </Button>
      </div>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            key={item.id}
            tabIndex={0}
            onKeyDown={(e) => handleKey(e, index)}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs",
              "focus:outline-none focus:ring-2 focus:ring-ring",
            )}
          >
            <span className="flex w-5 shrink-0 justify-center text-[10px] font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <Icon icon={CATEGORY_ICON[item.category]} size={14} className="shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-foreground">{item.title}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={s.moveUp}
                disabled={index === 0}
                onClick={() => onReorder(reorder(items, index, index - 1))}
              >
                <Icon icon="mdi:chevron-up" size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={s.moveDown}
                disabled={index === items.length - 1}
                onClick={() => onReorder(reorder(items, index, index + 1))}
              >
                <Icon icon="mdi:chevron-down" size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                aria-label={s.remove}
                onClick={() => onRemove(item.id)}
              >
                <Icon icon="mdi:close" size={14} />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] 2. Ensure i18n `combo` group keys (append missing only) in `src/features/quick-send/i18n/pt-BR.ts`:
```ts
  combo: {
    packageMode: "Modo pacote",
    tray: "Pacote",
    sendAll: "Enviar todos",
    sending: (i: number, n: number) => `Enviando ${i}/${n}`,
    itemSkipped: (title: string) => `Ignorado: ${title} (sem permissão ou não publicado)`,
    addToCombo: "Adicionar ao pacote",
    moveUp: "Mover para cima",
    moveDown: "Mover para baixo",
    remove: "Remover do pacote",
    partialDone: (sent: number, skipped: number) =>
      `Pacote enviado: ${sent} item(ns)${skipped > 0 ? `, ${skipped} ignorado(s)` : ""}.`,
  },
```
> Show added-keys diff. Keep existing combo keys (Plan B may have added `packageMode`/`addToCombo`).

- [ ] 3. Barrel (append-only):
```ts
export { ComboTray, type IComboTrayProps } from "./components/ComboTray";
```

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Manual checklist: tray hidden when empty; items numbered; ▲▼ reorder and disable at ends; Alt+↑/↓ reorders the focused row (and keeps focus order sane); remove drops a row; "Enviar todos" shows "Enviando i/N" while `progress` is active; light/dark; 360px no overflow.

- [ ] 6. Commit.
```bash
git add src/features/quick-send/components/ComboTray.tsx src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add reorderable ComboTray (PRD-027 RF-021)

Revisable tray with ▲▼ + Alt+↑/↓ keyboard reorder, per-item remove and a
"Enviar todos" delegating sequential fan-out with i/N progress to the consumer.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 11 — `useComboSend` (sequential fan-out with partial-failure tolerance)

**RF-022, D-10.** The send loop the `ComboTray` delegates to: plan with `planComboSend` (skip unpublished/no-permission/sensitive-blocked), send the `sendable` ids sequentially via Plan B's `useSendAsset`, never abort on a single failure, surface a partial-done summary.

**Files:**
- Create: `src/features/quick-send/hooks/useComboSend.ts`
- Test: `bun run build` green + manual checklist (combo sends multiple, one failure does not abort).

**Steps:**

- [ ] 1. Create the hook.

`src/features/quick-send/hooks/useComboSend.ts`:
```ts
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { IAssetLibraryItem, IConversation, IWhatsAppAccount } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { planComboSend } from "../engine/comboSend";
import { useSendAsset } from "./useSendAsset";
import { QUICK_SEND_STRINGS } from "../i18n/pt-BR";

export interface IUseComboSendResult {
  sendCombo: (items: IAssetLibraryItem[], contextMessage?: string) => Promise<void>;
  progress: { sent: number; total: number } | undefined;
  isSending: boolean;
}

/**
 * Sequential combo fan-out (D-10). Uses planComboSend to drop unpublished /
 * no-permission / sensitive-blocked items (with a toast), then sends the
 * sendable ids one by one. A single send failure is counted but never aborts
 * the rest (partial-failure tolerance, RF-022).
 */
export function useComboSend(
  conversation: IConversation,
  whatsappAccount: IWhatsAppAccount | null,
): IUseComboSendResult {
  const { userRole } = useAuth();
  const { sendAsset } = useSendAsset(conversation, whatsappAccount);
  const [progress, setProgress] = useState<{ sent: number; total: number } | undefined>(undefined);

  const sendCombo = useCallback(
    async (items: IAssetLibraryItem[], contextMessage?: string) => {
      const viewer = userRole ? { role: userRole } : null;
      const plan = planComboSend(items, viewer);
      const byId = new Map(items.map((i) => [i.id, i]));

      // Announce skipped items up front (each with its reason).
      for (const skip of plan.skipped) {
        const item = byId.get(skip.assetId);
        toast.warning(QUICK_SEND_STRINGS.combo.itemSkipped(item?.title ?? skip.assetId));
      }

      const total = plan.sendable.length;
      if (total === 0) {
        if (plan.skipped.length > 0) {
          toast.error(QUICK_SEND_STRINGS.combo.partialDone(0, plan.skipped.length));
        }
        return;
      }

      let sent = 0;
      let failed = 0;
      setProgress({ sent: 0, total });
      for (const assetId of plan.sendable) {
        const item = byId.get(assetId);
        if (!item) {
          failed += 1;
          continue;
        }
        try {
          // Only the first item carries the context message to avoid spamming it.
          await sendAsset(item, sent === 0 ? contextMessage : undefined);
          sent += 1;
        } catch {
          failed += 1;
        } finally {
          setProgress({ sent: sent + failed, total });
        }
      }
      setProgress(undefined);
      toast.success(QUICK_SEND_STRINGS.combo.partialDone(sent, plan.skipped.length + failed));
    },
    [userRole, sendAsset],
  );

  return { sendCombo, progress, isSending: progress !== undefined };
}
```
> `planComboSend(items, viewer)` returns `{ sendable: ID[]; skipped: IComboPlanItem[] }` (CONTRACT §B #9). The viewer is `{ role: RoleName } | null`. Partial-failure is enforced by the `try/catch` inside the loop that increments `failed` and continues.

- [ ] 2. Barrel (append-only):
```ts
export { useComboSend, type IUseComboSendResult } from "./hooks/useComboSend";
```

- [ ] 3. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 4. Commit.
```bash
git add src/features/quick-send/hooks/useComboSend.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add useComboSend sequential fan-out (PRD-027 RF-022)

planComboSend skips unpublished/no-permission/sensitive items with a toast;
sendable items go out one by one; a single failure is counted but never aborts
the rest. Exposes i/N progress for ComboTray.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 12 — Wire split Enviar (`ScheduleSendMenu`) into `MessageInput` (C-owned region only)

**RF-023, CONTRACT §H.2.** Add the `▾` split to the Enviar button. This is the ONLY C edit to `MessageInput.tsx`. Coordinate merge order with Plan B (which restructures the clip menu and adds slash/snippet). Edit ONLY the Enviar-button region.

**Files:**
- Modify: `src/features/conversations/components/MessageInput.tsx` (split Enviar only)
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Read the current `MessageInput.tsx` (Plan B may have changed it). Locate the Enviar `<Button>` block (currently lines ~336–345 in the pristine file). Add the import near the top:
```ts
import { ScheduleSendMenu } from "@/features/quick-send/components/ScheduleSendMenu";
import { useScheduleSend } from "@/features/quick-send/hooks/useScheduleSend";
```

- [ ] 2. Inside the component, after the existing `sendHook`/`handleSend` definitions, add a schedule handler that captures the current draft as a snippet-style payload (the simplest payload available at the composer level; staged-asset/combo scheduling is reachable from their own affordances). Add:
```ts
  const { schedule } = useScheduleSend(conversation);

  const handleSchedule = async (scheduledFor: string) => {
    const text = value.trim();
    if (!text) return;
    try {
      // Snippet payload carries the already-typed text as contextMessage so the
      // runner can re-send it verbatim at the simulated time (RF-023).
      await schedule(scheduledFor, { type: "snippet", contextMessage: text });
      setValue("");
    } catch {
      toast.error(CONVERSATION_STRINGS.actionFailed);
    }
  };
```

- [ ] 3. Replace the standalone Enviar `<Button>` with a grouped split (the primary send + the `▾` menu). Change:
```tsx
        {/* Enviar */}
        <Button
          type="button"
          size="sm"
          className="h-9 gap-1.5 px-3"
          onClick={handleSend}
          disabled={!value.trim() || !canSendFreeText}
        >
          <Icon icon="mdi:send" size={14} />
          <span className="hidden lg:inline">{CONVERSATION_STRINGS.send}</span>
        </Button>
```
to:
```tsx
        {/* Enviar (split: enviar agora + agendar) */}
        <div className="flex shrink-0">
          <Button
            type="button"
            size="sm"
            className="h-9 gap-1.5 rounded-r-none px-3"
            onClick={handleSend}
            disabled={!value.trim() || !canSendFreeText}
          >
            <Icon icon="mdi:send" size={14} />
            <span className="hidden lg:inline">{CONVERSATION_STRINGS.send}</span>
          </Button>
          <ScheduleSendMenu
            onSchedule={(iso) => void handleSchedule(iso)}
            disabled={!value.trim() || !canSendFreeText}
          />
        </div>
```
> Do NOT touch emoji/HSM/AI strip/24h (`canSendFreeText`)/copilot. The split respects `canSendFreeText` exactly like the original Enviar button (scheduling a message still requires the free-text window to be open at compose time; the runner re-checks at fire time too). If Plan B already wrapped Enviar, integrate the `ScheduleSendMenu` next to its primary button without removing B's work.

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Manual checklist: Enviar and the `▾` render as one visual unit; clicking a preset/custom schedules the typed text and clears the textarea; with empty text both are disabled; window-closed disables both; emoji/templates/slash/snippet/AI strip untouched; Enter still sends / Shift+Enter still breaks (no menu open).

- [ ] 6. Commit.
```bash
git add src/features/conversations/components/MessageInput.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): split Enviar with ScheduleSendMenu (PRD-027 RF-023)

Adds a ▾ schedule split to the send button; presets/custom persist the typed
text as a snippet payload via useScheduleSend. Respects the 24h free-text gate
exactly like Enviar; no other composer behavior touched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 13 — Mount runners + tray + list in `ConversationPage`; chip in `ConversationHeader` (C-owned regions)

**RF-017/RF-021/RF-022/RF-023/RF-024, CONTRACT §H.2.** Mount `useScheduledSendRunner` + `useTrackableLinkSimulation` (threading `detail.refresh`), render `ScheduledList` and the `ComboTray` (wired to `useComboSend`, fed by the bus combo channel) above the composer, render `TemperatureChip` + "Agendados (N)" in the header. Plan B mounts the picker + `QuickSendBusProvider` and wires the picker's "Modo pacote" → `addToCombo`; this plan adds the tray/list/runners/chip and the combo send wiring.

> **Dependency check (combo channel).** This task consumes `useQuickSendBus().comboItems/addToCombo/removeFromCombo/reorderCombo/clearCombo`, re-pinned in CONTRACT §C (combo channel) on 2026-06-06. Plan B OWNS `useQuickSendBus.tsx` and the picker's "Modo pacote" toggle that calls `addToCombo`. BEFORE wiring the tray, verify the bus exposes the combo channel:
> ```bash
> node -e "const fs=require('fs');const f='src/features/quick-send/hooks/useQuickSendBus.tsx';if(!fs.existsSync(f))throw new Error('bus missing — Plan B must land first');const c=fs.readFileSync(f,'utf8');if(!/comboItems/.test(c)||!/addToCombo/.test(c))throw new Error('combo channel missing on the bus — Plan B must add comboItems/addToCombo/removeFromCombo/reorderCombo/clearCombo per CONTRACT §C; coordinate merge order');console.log('bus combo channel OK')"
> ```
> Expected: `bus combo channel OK`. If it throws because the combo channel is missing, STOP and coordinate with Plan B (re-pinned CONTRACT §C) — do NOT prop-drill combo state through `MessageInput`; the bus is the contract.

**Files:**
- Modify: `src/features/conversations/pages/ConversationPage.tsx` (runners + `ScheduledList` mount + `ComboTray` + `useComboSend`)
- Modify: `src/features/conversations/components/ConversationHeader.tsx` (`TemperatureChip` + Agendados count)
- Test: `bun run build` green + manual checklist (end-to-end: open raises temperature; combo sends; scheduled item fires).

**Steps:**

- [ ] 1. In `ConversationPage.tsx`, add imports (next to existing media imports):
```ts
import {
  useScheduledSendRunner,
  useTrackableLinkSimulation,
  ScheduledList,
  ComboTray,
  useComboSend,
  useQuickSendBus,
} from "@/features/quick-send";
```
> If `@/features/quick-send` does not re-export these yet, the barrel tasks above added them (and Plan B added `useQuickSendBus`); otherwise import from the specific files. Do NOT import `useConversationScheduled` here — it is used only by `ConversationHeader` (step 4), and a dead import would fail lint.

- [ ] 2. Mount the runners + the combo send. They must run only when we have a real conversation, and the `useTrackableLinkSimulation` runner needs the conversation context (`useConversationContext`) which is only available INSIDE `<ConversationProvider>`. Hooks cannot be conditional, so mount them in a small child component rendered only when `conversation` exists, placed inside both `<QuickSendBusProvider>` and `<ConversationProvider>`. Add these children at the bottom of `ConversationPage.tsx`:
```tsx
function ConversationRunners({
  conversation,
  whatsappAccount,
  refreshDetail,
}: {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
  refreshDetail: () => void;
}) {
  useScheduledSendRunner(conversation, whatsappAccount);
  useTrackableLinkSimulation(conversation, refreshDetail);
  return null;
}

function ConversationComboTray({
  conversation,
  whatsappAccount,
}: {
  conversation: IConversation;
  whatsappAccount: IWhatsAppAccount | null;
}) {
  const { comboItems, reorderCombo, removeFromCombo, clearCombo } = useQuickSendBus();
  const { sendCombo, progress } = useComboSend(conversation, whatsappAccount);
  if (comboItems.length === 0) return null;
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
Add the needed type imports to the page:
```ts
import type { IConversation, IWhatsAppAccount } from "@/shared/types";
```
> `ID` is already imported. Add `IConversation`/`IWhatsAppAccount` to the existing `import type { ID } from "@/shared/types";` line. `ConversationComboTray` reads the bus combo channel (filled by Plan B's picker "Modo pacote") and delegates the sequential fan-out to `useComboSend` (`planComboSend` + partial-failure tolerance), then clears the tray. `useComboSend` internally reads `useSendAsset` (Plan B) and `useAuth` — no extra props needed.

- [ ] 3. Render `<ConversationRunners …>`, `<ConversationComboTray …>` and `<ScheduledList …>` inside the conversation column, ABOVE `<MessageInput …>` and INSIDE both the bus + conversation providers. In the returned JSX, just before `<MessageInput …>`, insert:
```tsx
            <ConversationRunners
              conversation={conversation}
              whatsappAccount={whatsappAccount}
              refreshDetail={detail.refresh}
            />
            <ConversationComboTray
              conversation={conversation}
              whatsappAccount={whatsappAccount}
            />
            <ScheduledList conversationId={conversationId} />
```
> Place `ComboTray` and `ScheduledList` directly above `MessageInput` so both collapsible bars sit over the composer (D-10/D-11). `ConversationRunners` renders null — position is irrelevant but keep it within the conversation column so it unmounts with the page AND inside `<ConversationProvider>` (it reads `useConversationContext` via `useTrackableLinkSimulation`). `detail.refresh` is the page's `useConversationDetail().refresh` (already destructured as `detail`); passing it lets the temperature runner re-fetch the lead so `TemperatureChip` updates live.

- [ ] 4. In `ConversationHeader.tsx`, render the `TemperatureChip` next to the name and an "Agendados (N)" affordance. Add imports:
```ts
import { TemperatureChip } from "@/features/quick-send/components/TemperatureChip";
import { useConversationScheduled } from "@/features/quick-send/hooks/useConversationScheduled";
import { QUICK_SEND_STRINGS } from "@/features/quick-send/i18n/pt-BR";
```

- [ ] 5. Add a scheduled-count read at the top of `ConversationHeader`:
```ts
  const scheduled = useConversationScheduled(conversation.id);
  const pendingScheduled = scheduled.items.filter((i) => i.status === "pending").length;
```

- [ ] 6. Render the chip in the name row. Inside the `<div className="flex items-center gap-2">` that holds `<h2>` and the SDR badge, after the SDR badge block, add:
```tsx
            {lead && <TemperatureChip temperature={lead.temperature} />}
```
> `lead` is already a prop of `ConversationHeader`. `lead.temperature` is `LeadTemperature`.

- [ ] 7. Render the "Agendados (N)" affordance in the action row (next to the media toggle button), shown only when there are pending items. Inside `<div className="flex items-center gap-1">`, before `{menuSlot}`, add:
```tsx
          {pendingScheduled > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              title={QUICK_SEND_STRINGS.schedule.listTitle}
            >
              <Icon icon="mdi:calendar-clock" size={12} aria-hidden />
              {QUICK_SEND_STRINGS.schedule.scheduledCount(pendingScheduled)}
            </span>
          )}
```

- [ ] 8. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 9. Manual checklist (end-to-end):
  - Temperature: open a conversation with a `frio` lead + a lead-bound trackable link; within ~12–24s the chip escalates to `morno` (one pulse) and a system bubble explains the cause LIVE (no remount needed); never downgrades; `quente` stable. (The bubble appears via the conversation-context optimistic append and the chip updates via `detail.refresh` — verify both happen without navigating away.)
  - Combo: open the picker, toggle "Modo pacote", select 2–3 assets → they appear in the `ComboTray` above the composer; reorder via ▲▼ / Alt+↑/↓; "Enviar todos" sends them in order (progress "Enviando i/N"), then the tray clears; an unpublished/forbidden item is skipped with a warning toast while the rest still send (partial-failure tolerated).
  - Schedule: type text, pick "Hoje 18:00" (or set a custom time ~30s out and temporarily lower the runner constants if validating live — revert after); the `ScheduledList` shows it pending; at the due time the runner sends it (a new outbound message appears) and the row flips to "Enviado"; an unpublished asset payload flips to "Falhou".
  - Header "Agendados (N)" shows while a pending item exists and disappears after it sends/cancels.
  - No regression: media gallery, copilot strip, templates, emoji all still work.

- [ ] 10. Commit.
```bash
git add src/features/conversations/pages/ConversationPage.tsx src/features/conversations/components/ConversationHeader.tsx
git commit -m "$(cat <<'EOF'
feat(conversations): mount QuickSend runners + combo tray + tempchip + scheduled list (PRD-027)

ConversationPage mounts useScheduledSendRunner + useTrackableLinkSimulation
(threading detail.refresh so the temperature chip updates live) and renders the
ComboTray (fed by the bus combo channel, sent via useComboSend) and ScheduledList
above the composer; ConversationHeader shows the TemperatureChip and an
Agendados(N) affordance. RF-017/021/022/023/024.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 14 — `useQuickSendBus` consumer wiring (Copilot RECEIVER only)

**RF-026, D-14.** Plan B owns the `QuickSendBusProvider` + `useQuickSendBus` creation and the picker's consumption of `pickerRequest`. This plan does the RECEIVER documentation/stub: confirm the bus exists, and add a deferred-Copilot extension point that calls `openAssetPicker(prefilter)` — wired but stubbed since PRD-025 is pending.

**Files:**
- Create: `src/features/quick-send/hooks/useCopilotAssetHandoff.ts` (receiver stub)
- Test: `bun run build` green.

**Steps:**

- [ ] 1. Confirm Plan B's bus exists (Plan B creates `useQuickSendBus.tsx` — `.tsx` because it exports a JSX provider).
```bash
node -e "const fs=require('fs');const ok=fs.existsSync('src/features/quick-send/hooks/useQuickSendBus.tsx')||fs.existsSync('src/features/quick-send/hooks/useQuickSendBus.ts');if(!ok)throw new Error('Plan B useQuickSendBus missing — coordinate merge order');console.log('bus OK')"
```
Expected: `bus OK`. If missing, STOP and coordinate with Plan B (CONTRACT §K) — do not re-create the bus.

- [ ] 2. Create the receiver stub that the Copilot chip will call once PRD-025 lands.

`src/features/quick-send/hooks/useCopilotAssetHandoff.ts`:
```ts
import { useCallback } from "react";
import type { AssetCategory } from "@/shared/types";
import { useQuickSendBus } from "./useQuickSendBus";

export interface ICopilotAssetSuggestion {
  category?: AssetCategory;
  query?: string;
  brand?: string;
}

export interface IUseCopilotAssetHandoffResult {
  /**
   * RECEIVER for the deferred Copilot chip (PRD-025). When the chip is wired,
   * it calls this with a suggestion and the AssetPicker opens pre-filtered.
   * Until then this is exercised only by tests / manual triggers (D-14).
   */
  handoff: (suggestion: ICopilotAssetSuggestion) => void;
}

/**
 * Copilot → QuickSend handoff receiver (D-14). Thin adapter over the QuickSend
 * bus so the Copilot integration (PRD-025, still ⏳) can open the AssetPicker
 * pre-filtered without knowing the picker internals. The SENDER (the Copilot
 * chip) is intentionally NOT built here — only the receiver extension point.
 */
export function useCopilotAssetHandoff(): IUseCopilotAssetHandoffResult {
  const { openAssetPicker } = useQuickSendBus();
  const handoff = useCallback(
    (suggestion: ICopilotAssetSuggestion) => {
      openAssetPicker({
        category: suggestion.category,
        query: suggestion.query,
        brand: suggestion.brand,
      });
    },
    [openAssetPicker],
  );
  return { handoff };
}
```
> `useQuickSendBus().openAssetPicker(filter?)` is Plan B's API (CONTRACT §C). This receiver only forwards a suggestion into it. The Copilot chip SENDER stays deferred per D-14/spec §11.

- [ ] 3. Barrel (append-only):
```ts
export {
  useCopilotAssetHandoff,
  type IUseCopilotAssetHandoffResult,
  type ICopilotAssetSuggestion,
} from "./hooks/useCopilotAssetHandoff";
```

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Commit.
```bash
git add src/features/quick-send/hooks/useCopilotAssetHandoff.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add Copilot asset-handoff receiver stub (PRD-027 RF-026)

Receiver-only adapter over useQuickSendBus.openAssetPicker so the deferred
PRD-025 Copilot chip can open the picker pre-filtered. Sender stays deferred.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 15 — `AssetUsageStatsPage` (governance stats) — CONSUMES Plan A's `useAssetUsageStats`

**RF-025, D-13.** Plan A is the SOLE owner of `useAssetUsageStats` (Plan A Task 22.4: created, barrel-exported, backed by `assetLibraryApi.getUsageStats()`; CONTRACT §C/§K re-pinned 2026-06-06). This plan does NOT create or re-export the hook — it only builds the consuming page. Plan A's hook signature, consumed verbatim, is:
```ts
useAssetUsageStats(params?: { from?: ISO8601; to?: ISO8601 }): {
  topAssets: { assetId: ID; title: string; count: number }[];
  bySeller: { sellerId: ID; count: number }[];
  isLoading: boolean;
}
```
Render most-sent assets + per-seller ranking, RBAC-gated at the route.

**Files:**
- Create: `src/features/quick-send/components/library-admin/AssetUsageStatsPage.tsx`
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Confirm Plan A's hook exists and is barrel-exported (do NOT create it here).
```bash
node -e "const fs=require('fs');const h='src/features/quick-send/hooks/useAssetUsageStats.ts';if(!fs.existsSync(h))throw new Error('Plan A useAssetUsageStats missing — coordinate merge order (CONTRACT §K: Plan A owns it)');const b=fs.readFileSync('src/features/quick-send/index.ts','utf8');if(!b.includes('useAssetUsageStats'))throw new Error('Plan A barrel export for useAssetUsageStats missing — coordinate with Plan A');console.log('Plan A useAssetUsageStats OK')"
```
Expected: `Plan A useAssetUsageStats OK`. If it throws, STOP and coordinate merge order with Plan A — do NOT create a duplicate hook (that would collide with Plan A's file and barrel export).

- [ ] 2. (No hook creation in this plan.) The page imports `useAssetUsageStats` from the feature barrel `@/features/quick-send` (Plan A's export). No `assetLibraryApi`/`@/mocks` import lives in this plan — the mock access is entirely Plan A's concern, behind the hook.

- [ ] 3. Create the page (imports the hook from the barrel — Plan A's export).

`src/features/quick-send/components/library-admin/AssetUsageStatsPage.tsx`:
```ts
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useAssetUsageStats } from "@/features/quick-send";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface IAssetUsageStatsPageProps {}

/**
 * Asset usage statistics (D-13, RF-025): most-sent assets and per-seller
 * ranking. RBAC is enforced at the route (Owner/Gestor); this page only reads.
 */
export function AssetUsageStatsPage(_: IAssetUsageStatsPageProps) {
  const s = QUICK_SEND_STRINGS.stats;
  const { topAssets, bySeller, isLoading } = useAssetUsageStats();
  const maxAsset = topAssets.reduce((m, a) => Math.max(m, a.count), 0) || 1;
  const maxSeller = bySeller.reduce((m, a) => Math.max(m, a.count), 0) || 1;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.subtitle}</p>
      </div>

      {/* Most-sent assets */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:trophy-outline" size={16} className="text-primary" />
            {s.topAssets}
          </p>
        </div>
        {topAssets.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{s.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {topAssets.map((a, idx) => (
              <li key={a.assetId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{a.title}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(a.count / maxAsset) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {s.sendCount(a.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Per-seller ranking */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Icon icon="mdi:account-group-outline" size={16} className="text-primary" />
            {s.perSeller}
          </p>
        </div>
        {bySeller.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{s.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {bySeller.map((row, idx) => (
              <li key={row.sellerId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{row.sellerId}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${(row.count / maxSeller) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                  {s.sendCount(row.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
```
> `row.sellerId` is shown raw; resolving to a display name needs the sellers provider — acceptable for the MVP stats page (note in commit). If a seller-name lookup is trivially available (`useSellersProvider`), prefer it; otherwise keep the id.

- [ ] 4. Ensure i18n `stats` group (append missing only) in `src/features/quick-send/i18n/pt-BR.ts`:
```ts
  stats: {
    title: "Estatística de uso da biblioteca",
    subtitle: "Ativos mais enviados e ranking por vendedor no período.",
    topAssets: "Ativos mais enviados",
    perSeller: "Ranking por vendedor",
    period: "Período",
    sendCount: (n: number) => (n === 1 ? "1 envio" : `${n} envios`),
    empty: "Nenhum envio registrado ainda.",
  },
```

- [ ] 5. Barrel (append-only) in `src/features/quick-send/index.ts` — export ONLY the page. `useAssetUsageStats` is exported by Plan A (CONTRACT §K); do NOT re-export it here (a duplicate `export { useAssetUsageStats }` would be a redeclared-export build error).
```ts
export { AssetUsageStatsPage, type IAssetUsageStatsPageProps } from "./components/library-admin/AssetUsageStatsPage";
```

- [ ] 6. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 7. Manual checklist: most-sent list renders ranked with bar widths; per-seller ranked; empty states when there are no sends; light/dark.

- [ ] 8. Commit.
```bash
git add src/features/quick-send/components/library-admin/AssetUsageStatsPage.tsx src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add AssetUsageStatsPage (PRD-027 RF-025)

Consumes Plan A's useAssetUsageStats (recorded-send ledger) to render most-sent
assets + per-seller ranking with ranked bars + empty states. RBAC enforced at
the route. No hook created here — Plan A owns useAssetUsageStats.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 16 — `SharedSnippetsManager` (governance of `shared` quick replies)

**RF-013/RF-019, D-12.** Owner/Gestor manage `shared` snippets: create/edit/delete with audit. Reuses `useQuickReplies` (Plan A) for reads and the `useQuickReplyProvider` for writes.

**Files:**
- Create: `src/features/quick-send/components/library-admin/SharedSnippetsManager.tsx`
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Confirm read hook + provider availability.
```bash
node -e "const fs=require('fs');console.log(['src/features/quick-send/hooks/useQuickReplies.ts','src/providers/data/hooks/useQuickReplyProvider.ts'].map(p=>p+': '+(fs.existsSync(p)?'OK':'MISSING')).join('\n'))"
```
Expected: both OK (Plan A). If `useQuickReplies` is missing, read its CONTRACT §C signature and use the provider directly via `useQuickReplyProvider().list({ scope: "shared" })` in a local `useQuery`.

- [ ] 2. Create the component.

`src/features/quick-send/components/library-admin/SharedSnippetsManager.tsx`:
```ts
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { IQuickReply } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useQuickReplyProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface ISharedSnippetsManagerProps {}

/**
 * Shared-snippet governance (D-12, RF-013/019). Owner/Gestor create/edit/delete
 * `scope: "shared"` quick replies. Every mutation goes through the provider
 * (which logMockMutation-audits) and refreshes the local list.
 */
export function SharedSnippetsManager(_: ISharedSnippetsManagerProps) {
  const s = QUICK_SEND_STRINGS.library;
  const provider = useQuickReplyProvider();
  const { currentUser } = useAuth();
  const [items, setItems] = useState<IQuickReply[] | null>(null);
  const [editing, setEditing] = useState<IQuickReply | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<IQuickReply | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () => {
    void provider.list({ scope: "shared" }).then(setItems);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const resetForm = () => {
    setEditing(null);
    setShortcut("");
    setTitle("");
    setBody("");
  };

  const startEdit = (item: IQuickReply) => {
    setEditing(item);
    setShortcut(item.shortcut);
    setTitle(item.title);
    setBody(item.body);
  };

  const handleSave = async () => {
    const sc = shortcut.trim();
    const tt = title.trim();
    const bd = body.trim();
    if (!sc || !tt || !bd) {
      toast.error(s.snippetMissingFields);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await provider.update(editing.id, { shortcut: sc, title: tt, body: bd });
        toast.success(s.snippetSaved);
      } else {
        await provider.create({
          shortcut: sc,
          title: tt,
          body: bd,
          scope: "shared",
          ownerId: currentUser?.id ?? "system",
        });
        toast.success(s.snippetCreated);
      }
      resetForm();
      refresh();
    } catch {
      toast.error(s.snippetSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: IQuickReply) => {
    try {
      await provider.delete(item.id);
      toast.success(s.snippetDeleted);
      setConfirmDelete(null);
      refresh();
    } catch {
      toast.error(s.snippetSaveFailed);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.manageSnippets}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.manageSnippetsDesc}</p>
      </div>

      {/* Editor */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">
          {editing ? s.snippetEditTitle : s.snippetNewTitle}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="/garantia"
            aria-label="Atalho"
          />
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={s.snippetTitlePlaceholder}
            aria-label="Título"
          />
        </div>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={s.snippetBodyPlaceholder}
          rows={3}
          className="mt-2 resize-none"
          aria-label="Conteúdo"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">{s.snippetVarsHint}</p>
        <div className="mt-3 flex gap-2">
          <Button onClick={handleSave} disabled={saving}>
            <Icon icon="mdi:content-save-outline" size={14} />
            {editing ? s.snippetSave : s.snippetCreate}
          </Button>
          {editing && (
            <Button variant="ghost" onClick={resetForm} disabled={saving}>
              {s.cancel}
            </Button>
          )}
        </div>
      </section>

      {/* List */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">{s.sharedSnippetsList}</p>
        </div>
        {items === null ? (
          <div className="p-4">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{s.snippetsEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {item.shortcut}
                    </Badge>
                    <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.body}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    aria-label={s.edit}
                    onClick={() => startEdit(item)}
                  >
                    <Icon icon="mdi:pencil-outline" size={15} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    aria-label="Excluir"
                    onClick={() => setConfirmDelete(item)}
                  >
                    <Icon icon="mdi:trash-can-outline" size={15} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{s.snippetDeleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && s.snippetDeleteDesc(confirmDelete.title)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{s.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {s.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] 3. Ensure i18n `library` group keys (append missing only) in `src/features/quick-send/i18n/pt-BR.ts`:
```ts
  library: {
    publish: "Publicar",
    unpublish: "Despublicar",
    version: "Versão",
    permission: "Permissão",
    draft: "Rascunho",
    archived: "Arquivado",
    sensitive: "Sensível",
    noPermission: "Sem permissão",
    manageSnippets: "Respostas rápidas compartilhadas",
    manageSnippetsDesc: "Crie e mantenha respostas rápidas visíveis para toda a equipe.",
    edit: "Editar",
    cancel: "Cancelar",
    confirmDelete: "Excluir",
    snippetNewTitle: "Nova resposta rápida",
    snippetEditTitle: "Editar resposta rápida",
    snippetTitlePlaceholder: "Ex.: Política de garantia",
    snippetBodyPlaceholder: "Use {{nome}}, {{peca}}, {{prazo}} para personalizar.",
    snippetVarsHint: "Variáveis: {{nome}}, {{peca}}, {{prazo}}. Lacunas viram pílulas no envio.",
    snippetCreate: "Criar",
    snippetSave: "Salvar",
    snippetCreated: "Resposta rápida criada.",
    snippetSaved: "Resposta rápida atualizada.",
    snippetDeleted: "Resposta rápida excluída.",
    snippetSaveFailed: "Não foi possível salvar.",
    snippetMissingFields: "Preencha atalho, título e conteúdo.",
    sharedSnippetsList: "Respostas compartilhadas",
    snippetsEmpty: "Nenhuma resposta compartilhada ainda.",
    snippetDeleteTitle: "Excluir resposta rápida?",
    snippetDeleteDesc: (title: string) => `A resposta "${title}" deixará de aparecer para a equipe.`,
  },
```
> Show added-keys diff; keep existing `library` keys (Plan B may have added `draft`/`sensitive`/`noPermission`).

- [ ] 4. Barrel (append-only):
```ts
export { SharedSnippetsManager, type ISharedSnippetsManagerProps } from "./components/library-admin/SharedSnippetsManager";
```

- [ ] 5. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 6. Manual checklist: list shows shared snippets; create adds one (toast + list refresh); edit pre-fills + saves; delete asks confirmation + removes; empty state; light/dark.

- [ ] 7. Commit.
```bash
git add src/features/quick-send/components/library-admin/SharedSnippetsManager.tsx src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add SharedSnippetsManager (PRD-027 RF-013/019)

Owner/Gestor CRUD for shared quick replies via useQuickReplyProvider (audited
in the mock layer). Create/edit/delete with confirmation + empty state.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 17 — `LibraryManagerPage` (publish/unpublish/version/permission per asset)

**RF-019/RF-020/RF-021, D-12/D-13.** The governance hub: lists assets; per-asset publish/unpublish, bump version, toggle sensitivity/permission. Mutations go through `useAssetLibraryProvider` (audited in the mock layer). Embeds `SharedSnippetsManager` and links to `AssetUsageStatsPage` via tabs.

**Files:**
- Create: `src/features/quick-send/components/library-admin/LibraryManagerPage.tsx`
- Create: `src/features/quick-send/components/library-admin/index.ts` (barrel for the three admin pages)
- Test: `bun run build` green + manual checklist.

**Steps:**

- [ ] 1. Confirm the provider + version engine.
```bash
node -e "const fs=require('fs');console.log(['src/providers/data/hooks/useAssetLibraryProvider.ts','src/features/quick-send/engine/assetVersioning.ts','src/features/quick-send/engine/assetSensitivity.ts'].map(p=>p+': '+(fs.existsSync(p)?'OK':'MISSING')).join('\n'))"
```
Expected: all OK (Plan A).

- [ ] 2. Create the page with tabs (Ativos / Snippets / Uso).

`src/features/quick-send/components/library-admin/LibraryManagerPage.tsx`:
```ts
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { IAssetLibraryItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssetLibraryProvider } from "@/providers/data";
import { isSensitiveAsset } from "../../engine/assetSensitivity";
import { SharedSnippetsManager } from "./SharedSnippetsManager";
import { AssetUsageStatsPage } from "./AssetUsageStatsPage";
import { QUICK_SEND_STRINGS } from "../../i18n/pt-BR";

export interface ILibraryManagerPageProps {}

const STATUS_TONE: Record<IAssetLibraryItem["status"], string> = {
  published: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  draft: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  archived: "border-border bg-muted text-muted-foreground",
};

/**
 * Library governance hub (D-12/D-13). Per-asset publish/unpublish, version bump
 * and sensitivity toggle; tabs to shared snippets + usage stats. All mutations
 * route through useAssetLibraryProvider which audits via logMockMutation.
 */
export function LibraryManagerPage(_: ILibraryManagerPageProps) {
  const s = QUICK_SEND_STRINGS.library;
  const provider = useAssetLibraryProvider();
  const [items, setItems] = useState<IAssetLibraryItem[] | null>(null);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = () => {
    void provider
      .list({ pageSize: 200 })
      .then((res) => setItems(res.data));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const filtered = (items ?? []).filter((i) =>
    search.trim() ? i.title.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  const run = async (id: string, op: () => Promise<unknown>, okMsg: string) => {
    setBusyId(id);
    try {
      await op();
      toast.success(okMsg);
      refresh();
    } catch {
      toast.error(s.actionFailed);
    } finally {
      setBusyId(null);
    }
  };

  const togglePublish = (item: IAssetLibraryItem) =>
    run(
      item.id,
      () => (item.status === "published" ? provider.unpublish(item.id) : provider.publish(item.id)),
      item.status === "published" ? s.unpublishedToast : s.publishedToast,
    );

  const bump = (item: IAssetLibraryItem) =>
    run(
      item.id,
      () => provider.bumpVersion(item.id, { storageRef: item.storageRef, url: item.url }),
      s.versionBumpedToast,
    );

  const toggleSensitive = (item: IAssetLibraryItem) =>
    run(
      item.id,
      () =>
        provider.update(item.id, {
          sensitivity: item.sensitivity === "sensitive" ? "normal" : "sensitive",
        }),
      s.permissionUpdatedToast,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{s.managerTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.managerDesc}</p>
      </div>

      <Tabs defaultValue="assets">
        <TabsList>
          <TabsTrigger value="assets">{s.tabAssets}</TabsTrigger>
          <TabsTrigger value="snippets">{s.tabSnippets}</TabsTrigger>
          <TabsTrigger value="usage">{s.tabUsage}</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={s.searchAssets}
            className="max-w-sm"
          />
          <div className="rounded-lg border border-border bg-card">
            {items === null ? (
              <div className="p-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                {s.assetsEmpty}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((item) => {
                  const sensitive = isSensitiveAsset(item);
                  const busy = busyId === item.id;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {item.title}
                          </span>
                          <Badge variant="outline" className={STATUS_TONE[item.status]}>
                            {item.status === "published"
                              ? s.statusPublished
                              : item.status === "draft"
                                ? s.draft
                                : s.archived}
                          </Badge>
                          <Badge variant="secondary" className="font-mono text-[11px]">
                            v{item.version}
                          </Badge>
                          {sensitive && (
                            <Badge
                              variant="outline"
                              className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            >
                              <Icon icon="mdi:lock-outline" size={11} />
                              {s.sensitive}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {item.brand ? `${item.brand} · ` : ""}
                          {item.category}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <Button
                          variant={item.status === "published" ? "outline" : "default"}
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => togglePublish(item)}
                        >
                          <Icon
                            icon={item.status === "published" ? "mdi:eye-off-outline" : "mdi:publish"}
                            size={14}
                          />
                          {item.status === "published" ? s.unpublish : s.publish}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => bump(item)}
                        >
                          <Icon icon="mdi:numeric-positive-1" size={14} />
                          {s.version}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={busy}
                          onClick={() => toggleSensitive(item)}
                        >
                          <Icon icon={sensitive ? "mdi:lock-open-outline" : "mdi:lock-outline"} size={14} />
                          {s.permission}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="snippets">
          <SharedSnippetsManager />
        </TabsContent>

        <TabsContent value="usage">
          <AssetUsageStatsPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```
> `bumpVersion` re-uses the current `storageRef`/`url` here (a no-content version bump for the MVP — the spec's `bumpVersion` engine moves current→previousVersion regardless). If you want a real new file, that needs the upload flow (Plan B/PRD-026) — out of scope for the governance MVP; note it in the commit. Confirm `Tabs` exists at `@/components/ui/tabs`:
```bash
node -e "const fs=require('fs');if(!fs.existsSync('src/components/ui/tabs.tsx'))throw new Error('tabs missing — use a manual button group instead');console.log('tabs OK')"
```
Expected: `tabs OK`. If MISSING, replace the `Tabs` block with a simple state-driven button group (three buttons toggling a `view` state) rendering the same three panels.

- [ ] 3. Ensure i18n `library` group has the manager keys (append missing only):
```ts
    managerTitle: "Biblioteca de ativos",
    managerDesc: "Publique, versione e defina a sensibilidade de cada ativo da equipe.",
    tabAssets: "Ativos",
    tabSnippets: "Respostas rápidas",
    tabUsage: "Uso",
    searchAssets: "Buscar ativo…",
    assetsEmpty: "Nenhum ativo encontrado.",
    statusPublished: "Publicado",
    actionFailed: "Não foi possível concluir a ação.",
    publishedToast: "Ativo publicado.",
    unpublishedToast: "Ativo despublicado.",
    versionBumpedToast: "Nova versão criada.",
    permissionUpdatedToast: "Permissão atualizada.",
```

- [ ] 4. Create the admin barrel `src/features/quick-send/components/library-admin/index.ts`:
```ts
export { LibraryManagerPage, type ILibraryManagerPageProps } from "./LibraryManagerPage";
export { SharedSnippetsManager, type ISharedSnippetsManagerProps } from "./SharedSnippetsManager";
export { AssetUsageStatsPage, type IAssetUsageStatsPageProps } from "./AssetUsageStatsPage";
```

- [ ] 5. Feature barrel (append-only) in `src/features/quick-send/index.ts`:
```ts
export { LibraryManagerPage, type ILibraryManagerPageProps } from "./components/library-admin/LibraryManagerPage";
```

- [ ] 6. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 7. Manual checklist: assets list with status/version/sensitive badges; publish↔unpublish toggles + toast + refresh; version bumps the `vN` badge; permission toggles the sensitive badge; search filters; Snippets/Uso tabs render their pages; empty state; light/dark; 360px wraps gracefully.

- [ ] 8. Commit.
```bash
git add src/features/quick-send/components/library-admin/LibraryManagerPage.tsx src/features/quick-send/components/library-admin/index.ts src/features/quick-send/i18n/pt-BR.ts src/features/quick-send/index.ts
git commit -m "$(cat <<'EOF'
feat(quick-send): add LibraryManagerPage governance hub (PRD-027 RF-019/020)

Per-asset publish/unpublish, version bump and sensitivity toggle via
useAssetLibraryProvider (audited in mock layer); tabs to shared snippets and
usage stats. Search + status/version/sensitive badges + empty states.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 18 — Governance route under `app.configuracoes`

**D-13, CONTRACT §K.** Add a file-based route `/app/configuracoes/biblioteca` rendering `LibraryManagerPage` inside `SettingsLayout`, guarded for Owner/Gestor. `routeTree.gen.ts` is GENERATED — never hand-edit; it regenerates on build.

**Files:**
- Create: `src/routes/app.configuracoes.biblioteca.tsx`
- Test: `bun run build` green (regenerates `routeTree.gen.ts`) + manual checklist.

**Steps:**

- [ ] 1. Create the route, mirroring `app.configuracoes.midias.tsx` exactly.

`src/routes/app.configuracoes.biblioteca.tsx`:
```ts
import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { LibraryManagerPage } from "@/features/quick-send";

export const Route = createFileRoute("/app/configuracoes/biblioteca")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <LibraryManagerPage />
    </SettingsLayout>
  ),
});
```
> Confirm `LibraryManagerPage` is exported from the feature barrel (Task 17 step 5). If the barrel export is not present, import from the path `@/features/quick-send/components/library-admin/LibraryManagerPage`.

- [ ] 2. (Optional, if a settings nav registry exists) Add a nav entry. Check:
```bash
node -e "const cp=require('child_process');try{console.log(cp.execSync('rg -n \"configuracoes/midias\" src/features/shell',{encoding:'utf8'}))}catch(e){console.log('no nav registry hit')}"
```
- If it prints a nav file referencing `configuracoes/midias`, open that file and add an analogous entry for `configuracoes/biblioteca` (label `Biblioteca de ativos`, icon `mdi:bookshelf`, roles Owner/Gestor) next to the Mídias entry. Show the diff.
- If it prints `no nav registry hit`, skip — the route is still reachable by URL; note it in the commit.

- [ ] 3. Build gate (regenerates the route tree).
```bash
bun run build
```
Expected: exit 0; `src/routeTree.gen.ts` now contains a `configuracoes/biblioteca` entry (generated — do not stage manual edits to it; staging the regenerated file is fine).

- [ ] 4. Manual checklist: navigating to `/app/configuracoes/biblioteca` as Owner/Gestor renders the LibraryManagerPage in the settings layout; a Vendedor is redirected by `requireAuth`.

- [ ] 5. Commit (include the regenerated route tree).
```bash
git add src/routes/app.configuracoes.biblioteca.tsx src/routeTree.gen.ts
git commit -m "$(cat <<'EOF'
feat(routes): add /app/configuracoes/biblioteca governance route (PRD-027)

Owner/Gestor-guarded settings route rendering LibraryManagerPage. routeTree.gen
regenerated by the build.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 19 — Governance UI audit wiring (client-side recordAuditLog for non-provider mutations)

**RF-019, D-12, spec §4.4.** Provider mutations (publish/unpublish/version/permission/snippet CRUD) are audited by `logMockMutation` inside the mock providers (Plan A §E.5). This task ensures the SENSITIVE-SEND denial path and any UI-only governance action are also audited, and verifies the chain end-to-end. Sensitive-send denial audit lives in the asset mock provider (Plan A); here we verify it fires and add a thin audit call for the Copilot-handoff receiver usage (observability), if not covered.

**Files:**
- Modify (verify only, edit if a gap exists): `src/providers/data/impl/mock/assetLibrary.ts` (Plan A file — only if the denial audit is missing)
- Test: `bun run build` green + audit-trail manual check.

**Steps:**

- [ ] 1. Verify the sensitive-send denial audit exists in Plan A's asset provider.
```bash
node -e "const fs=require('fs');const f='src/providers/data/impl/mock/assetLibrary.ts';if(!fs.existsSync(f)){console.log('PLAN A FILE MISSING');process.exit(0)}const c=fs.readFileSync(f,'utf8');console.log(/canSendSensitiveAsset|view_denied|logMockMutation/.test(c)?'AUDIT HOOKS PRESENT':'AUDIT HOOKS ABSENT')"
```
- If `AUDIT HOOKS PRESENT`: good — the recordSend/sensitive path already audits. Skip to step 3.
- If `AUDIT HOOKS ABSENT`: Plan A left a gap. Open the file and ensure `recordSend` (or the sensitive-gate path) calls `logMockMutation({ action: "view_denied", resource: "asset_library", resourceId: assetId, storeId })` when `canSendSensitiveAsset(viewer)` is false, and `logMockMutation({ action: "create", resource: "trackable_link", ... })`-style audits exist for the governance mutations. Show the exact added lines. (Keep edits minimal — this is a Plan A file; coordinate if it conflicts.)

- [ ] 2. Verify every governance mutation routes through an audited provider method (publish/unpublish/bumpVersion/update for sensitivity; quickReply create/update/delete). Grep the mock providers for `logMockMutation`:
```bash
node -e "const cp=require('child_process');console.log(cp.execSync('rg -n \"logMockMutation\" src/providers/data/impl/mock/assetLibrary.ts src/providers/data/impl/mock/quickReply.ts',{encoding:'utf8'}))"
```
Expected: at least one `logMockMutation` per mutating method (create/update/publish/unpublish/bumpVersion/delete). If a mutating method lacks it, add `logMockMutation({ action, resource, resourceId, before, after, storeId })` to that method (Plan A file; minimal edit; show diff).

- [ ] 3. Manual audit-trail check: as Owner, publish then unpublish an asset and edit a shared snippet; open `/app/configuracoes/auditoria` and confirm entries appear for `asset_library` (publish/unpublish) and `quick_reply` (update). As Vendedor, attempt a sensitive-send (via the picker / combo, blocked) and confirm a `view_denied` audit entry for `asset_library`.

- [ ] 4. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 5. Commit (only if you edited Plan A files; otherwise skip the commit and note "audit chain verified, no code change").
```bash
git add src/providers/data/impl/mock/assetLibrary.ts src/providers/data/impl/mock/quickReply.ts
git commit -m "$(cat <<'EOF'
fix(quick-send): ensure governance + sensitive-send audit coverage (PRD-027 RF-019)

Confirms/closes audit gaps so publish/unpublish/version/permission/snippet
mutations and sensitive-send denials all emit logMockMutation entries.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 20 — Empty/error states + responsive + theme polish pass (C-owned surfaces)

**RNF-004/005/006, spec §8 "polish".** A focused pass over every C component to guarantee empty + error states, 360–1920 responsiveness, light+dark with semantic tokens only, and WCAG basics (roles/labels/keyboard).

**Files:**
- Modify (as needed): the C components created above (`ComboTray`, `ScheduledList`, `LinkBubble`, `LibraryManagerPage`, `SharedSnippetsManager`, `AssetUsageStatsPage`, `TemperatureChip`, `LinkOpenIndicator`, `ScheduleSendMenu`)
- Test: `bun run build` green + manual responsive/theme checklist.

**Steps:**

- [ ] 1. Error states: ensure data-reading components handle the error path. For `useAssetUsageStats`, `useConversationScheduled`, `useConversationLinks`, render an inline error row when the underlying query errors. Example pattern to add where a list reads a query (only where missing):
```tsx
{isError && (
  <p className="px-4 py-6 text-center text-sm text-destructive">
    {QUICK_SEND_STRINGS.errors.loadAssetFailed}
  </p>
)}
```
> Add `isError` to the hooks' returns if not already exposed (e.g., `useConversationScheduled` can surface `isError: query.isError`). Keep changes additive.

- [ ] 2. Ensure i18n `errors` group exists (append missing only):
```ts
  errors: {
    loadAssetFailed: "Não foi possível carregar os dados.",
    sendFailed: "Falha ao enviar.",
  },
```

- [ ] 3. Responsive sweep: verify each C surface at 360px (no horizontal overflow; action button groups wrap), at 768px, and at 1920px (content max-widths sane). The library-admin pages should use `flex-wrap` on action rows (already done in `LibraryManagerPage`). Adjust any row that overflows.

- [ ] 4. Theme + a11y sweep: confirm ZERO raw hex / `--gallo-*` usages in C files — only semantic tokens (`bg-background`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-destructive`, plus the explicit severity colors `sky-*`/`amber-*`/`emerald-*`/`red-*` which mirror `TEMPERATURE_META` and existing badges and are allowed). Verify interactive elements have `aria-label`/`title`; the `TemperatureChip` and any status change region use `role="status"`. Run a grep guard:
```bash
node -e "const cp=require('child_process');const out=cp.execSync('rg -n \"#[0-9a-fA-F]{6}|--gallo-\" src/features/quick-send/components || true',{encoding:'utf8'});if(out.trim()){console.log('REVIEW these raw colors:\n'+out)}else{console.log('no raw hex/gallo tokens in quick-send components')}"
```
Expected: `no raw hex/gallo tokens in quick-send components` (or a reviewed, justified list). Fix any unjustified raw color.

- [ ] 5. Build gate.
```bash
bun run build
```
Expected: exit 0.

- [ ] 6. Manual checklist: every C component has a sensible empty AND error state; all are legible in light + dark; nothing overflows at 360px; keyboard reaches every action; reduced-motion suppresses the temp pulse.

- [ ] 7. Commit.
```bash
git add src/features/quick-send
git commit -m "$(cat <<'EOF'
polish(quick-send): empty/error states, responsive + theme + a11y pass (PRD-027)

Adds error rows to data-reading governance surfaces, ensures 360-1920 responsive
wrapping, semantic-token-only theming light+dark, and aria/role coverage.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## TASK 21 — Validation (final gate for Plan C)

Run the exact commands below and confirm the exact expected results. Do NOT claim completion until every check passes.

**Files:** none (verification only).

**Steps:**

- [ ] 1. Full build (hard gate).
```bash
bun run build
```
Expected: exit code 0, no errors. (`tsc` baseline ~315 errors are pre-existing — verify NO NEW error references any file this plan created/edited.)

- [ ] 2. Engine tests (Plan A engines this plan relies on must still pass).
```bash
bun run test --run src/features/quick-send/engine
```
Expected: all engine test files pass (RED→GREEN history is Plan A's; here we confirm GREEN). If `bun run test` is not a script, use:
```bash
bunx vitest run src/features/quick-send/engine
```
Expected: `Test Files  N passed`, `Tests  M passed`, exit 0.

- [ ] 3. Lint the new feature dir (delta only).
```bash
bunx eslint src/features/quick-send --max-warnings=0
```
Expected: no errors in C-created files. (If the repo's lint config flags pre-existing patterns in shared files, judge by delta — C files must be clean.)

- [ ] 4. Barrel integrity — every C export resolves.
```bash
node -e "const cp=require('child_process');cp.execSync('bunx tsc --noEmit -p tsconfig.json',{stdio:'ignore'})" 2>/dev/null; echo "tsc-delta-checked"
node -e "const fs=require('fs');const b=fs.readFileSync('src/features/quick-send/index.ts','utf8');['useConversationScheduled','useScheduleSend','ScheduleSendMenu','ScheduledList','useScheduledSendRunner','TemperatureChip','LinkOpenIndicator','useTrackableLinkSimulation','LinkBubble','useConversationLinks','ComboTray','useComboSend','useCopilotAssetHandoff','AssetUsageStatsPage','SharedSnippetsManager','LibraryManagerPage'].forEach(n=>{if(!b.includes(n))throw new Error('barrel missing export: '+n)});console.log('barrel OK')"
```
Expected: prints `barrel OK`.

- [ ] 5. Acceptance scenarios (manual, in the running app — `bun run dev`):
  - **Temperature (RF-017):** conversation with a `frio` lead + lead-bound link → within ~24s the chip escalates to `morno` (one pulse), a SystemBubble explains the cause; never downgrades; `quente` stable; reduced-motion = no pulse.
  - **Combo (RF-021/022):** open the picker, toggle "Modo pacote", multi-select 3 assets → they land in the `ComboTray` above the composer (bus combo channel → ConversationPage); reorder via ▲▼ / Alt+↑/↓; "Enviar todos" sends 3 messages in order via `useComboSend` then clears the tray; force one to be unpublished → it is skipped with a warning toast, the other two still send (partial-failure tolerated); progress shows "Enviando i/N". (Depends on Plan B wiring the picker's "Modo pacote" → `useQuickSendBus().addToCombo`, CONTRACT §C combo channel.)
  - **Schedule (RF-023/024):** schedule typed text for a near-future custom time → appears pending in `ScheduledList` and the header "Agendados (1)"; at the due time the runner sends it (new outbound message) and the row flips to "Enviado"; editing reschedules; cancel offers a 5s undo.
  - **Governance (RF-019/020):** `/app/configuracoes/biblioteca` (Owner/Gestor) → publish/unpublish toggles status; version bumps `vN`; permission toggles the sensitive badge; only `published` assets are sendable (re-validated by the runner and combo plan); a Vendedor is redirected from the route.
  - **Audit (RF-019/D-12):** publish/unpublish, snippet edit, and a Vendedor's blocked sensitive-send each produce an entry in `/app/configuracoes/auditoria`.
  - **Non-regression (RNF-002):** composer text/emoji/templates/24h gate, media gallery, copilot strip all still work; Enter sends / Shift+Enter breaks with no menu open.

- [ ] 6. Final commit if any polish fixes were needed during validation (otherwise none).
```bash
git add -A
git commit -m "$(cat <<'EOF'
test(quick-send): validate Plan C intelligence + governance (PRD-027)

Confirms build green, engines green, lint-clean delta, barrel integrity, and the
acceptance scenarios (temperature escalation, combo partial-failure, scheduled
fire, published-only sendable, audited sensitive actions).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Validation summary (expected end state):**
- `bun run build` → exit 0, no new errors.
- `bunx vitest run src/features/quick-send/engine` → all pass.
- `bunx eslint src/features/quick-send --max-warnings=0` → clean for C files.
- Barrel exports all resolve (`barrel OK`).
- All six acceptance scenarios pass manually.
- `routeTree.gen.ts` contains `configuracoes/biblioteca` (generated, not hand-edited).

---

**AILA Sistemas Inteligentes — PRD-027 Plano C Implementation Plan (2026-06-06).**
