# PRD-008 — Fundação de Notificações (`Herald`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the invisible notifications foundation — domain model, event bus, rule-based routing, preference matrix, persistence Provider Pattern (mock active / supabase stub), multi-channel delivery (in-app + toast active; email/whatsapp/sms/push stubs) and the derived-condition reconciler — so PRD-009 (UI) and the Onda 8 real channels plug in without rework.

**Architecture:** Two perpendicular axes mirroring `src/providers/data/` (PRD-005): **persistence** (`INotificationStore` + `INotificationPreferenceStore`, selected by `VITE_DATA_SOURCE`) and **delivery** (`INotificationChannel` registry). An in-app `notificationBus` decouples domain events from routing; routing fans out write-time into one `INotification` per recipient, crossing preferences and dedupe; a reconciler produces/expires `lifecycle:'derived'` notifications reading the shared condition logic extracted from PRD-014.

**Tech Stack:** React 19, TanStack Router, Vite, TypeScript strict, Tailwind v4, mocks via Faker + seeded PRNG. No test runner in this project — **validation per task = `bun run build` (tsc noEmit) + `bun run lint`**, plus the dev-only harness on `/design-system`.

---

## Validation Convention (read once)

This project has **no test suite** (Fase 1, frontend-first). Every task ends with:

```bash
bun run build   # tsc --noEmit type-check (must pass clean)
bun run lint    # ESLint (must pass clean)
```

Then a commit. There is **no red/green test cycle**. Where behavior must be observed, the **harness on `/design-system`** (Task 5.4) emits test events and logs routing/delivery to the console. Commits use Conventional Commits in English.

## File Structure

```
src/shared/types/
  notification.ts                 # CREATE — INotification + auxiliary unions + INotificationAction + INotificationPreference
  index.ts                        # MODIFY — re-export notification types

src/providers/notifications/
  index.ts                        # CREATE — public barrel (hooks + types + provider component)
  errors.ts                       # CREATE — NotImplementedError (local copy, isolation)
  factory.ts                      # CREATE — getNotificationStores(): singleton by VITE_DATA_SOURCE
  context.tsx                     # CREATE — NotificationProvidersProvider + reconciler boot
  bus.ts                          # CREATE — notificationBus (emit/subscribe, non-blocking)
  events.ts                       # CREATE — NotificationEventType union + payload map (Anexo A)
  contracts/
    _shared.ts                    # CREATE — IPaginationParams/IPaginatedResult (own copy)
    notifications.ts              # CREATE — INotificationStore + filter params
    preferences.ts                # CREATE — INotificationPreferenceStore
    index.ts                      # CREATE — INotificationStores aggregate
  routing/
    rules.ts                      # CREATE — event → {category, severity, resolveRecipients, channels}
    dedupe.ts                     # CREATE — deterministic dedupeKey
    router.ts                     # CREATE — subscribe bus → fan-out → preferences → channels → persist
  preferences/
    defaults.ts                   # CREATE — channel×category defaults per role (Anexo B)
  conditions/
    derivedConditions.ts          # CREATE — the 3 build* fns moved from PRD-014 (shared source of truth)
  reconciler.ts                   # CREATE — derived create/expire loop reading settings
  channels/
    contract.ts                   # CREATE — INotificationChannel.send()
    registry.ts                   # CREATE — active channels for current phase
    inApp.ts · toast.ts           # CREATE — active channels
    email.ts · whatsapp.ts · sms.ts · push.ts  # CREATE — deferred stubs
  hooks/
    _useNotificationSlice.ts      # CREATE — context slice helper
    useNotifications.ts · useUnreadCount.ts · useNotificationPreferences.ts  # CREATE
  impl/
    mock/notifications.ts · mock/preferences.ts · mock/_scope.ts   # CREATE
    supabase/notifications.ts · supabase/preferences.ts            # CREATE — stubs

src/mocks/
  generators/notification.ts      # CREATE — seeded notification generator
  generators/bootstrap.ts         # MODIFY — add notifications to IBootstrappedDataset
  api/notifications.ts            # CREATE — mock store-backed CRUD (mirror api/* pattern)

src/features/manager-dashboard/hooks/useActiveAlerts.ts  # MODIFY — import build* from conditions module
src/routes/__root.tsx             # MODIFY — mount NotificationProvidersProvider
src/routes/design-system.tsx      # MODIFY — add notifications harness section
eslint.config.js                  # MODIFY — no-restricted-imports for providers/notifications
src/vite-env.d.ts                 # already types VITE_DATA_SOURCE (PRD-005) — verify only
docs/glossario.md                 # MODIFY — notification glossary entries
docs/prds/PRD-002-modelo-conceitual-glossario_DONE.md  # MODIFY — delta note
```

---

## Phase 1 — Domain Model

### Task 1.1: Notification domain types

**Files:**
- Create: `src/shared/types/notification.ts`
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Write `src/shared/types/notification.ts`**

```typescript
/**
 * Notification domain model (PRD-008). Single source of truth — PRD-009 (UI)
 * and the Onda 8 real channels consume these types, never redefine them.
 *
 * Conventions (match the rest of the domain): IDs are strings, timestamps are
 * ISO 8601 strings (never `Date`), optional fields use `?` (never `| null`),
 * and enums are string-literal unions (never TS `enum`).
 *
 * @see ../../../docs/glossario.md
 */
import type { ID, ISO8601 } from "./common";
import type { NotificationEventType } from "@/providers/notifications/events";

export type NotificationLifecycle = "event" | "derived";

export type NotificationCategory =
  | "transactional"
  | "commercial"
  | "operational"
  | "gamification"
  | "system"
  | "marketing";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type NotificationStatus = "unread" | "read" | "archived";

export type NotificationChannel = "inApp" | "toast" | "email" | "whatsapp" | "sms" | "push";

export type NotificationRecipientType = "seller" | "customer";

export type ChannelDeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "skipped"
  | "deferred";

/** Inline action a notification can offer (rendered as a button by PRD-009). */
export interface INotificationAction {
  /** Stable id, unique within the notification. */
  id: string;
  /** Button label (pt-BR). */
  label: string;
  /** Navigate to a route, or run a named mutation handled by the UI. */
  type: "navigate" | "mutation";
  /** For `navigate`: TanStack route path. For `mutation`: handler name. */
  target: string;
  /** Optional search params for `navigate`. */
  params?: Record<string, string>;
}

/** Reference to the domain entity that originated the notification. */
export interface INotificationEntityRef {
  type: string;
  id: ID;
}

/** Per-channel delivery outcome (optional; filled by the router). */
export interface IChannelDelivery {
  channel: NotificationChannel;
  status: ChannelDeliveryStatus;
  detail?: string;
}

export interface INotification {
  id: ID;
  /** Deterministic key collapsing the same fact emitted twice in a window. */
  dedupeKey: string;
  lifecycle: NotificationLifecycle;
  type: NotificationEventType;
  category: NotificationCategory;
  severity: NotificationSeverity;
  recipientId: ID;
  recipientType: NotificationRecipientType;
  storeId?: ID;
  /** Snapshot text, copied at creation (survives changes to the source record). */
  title: string;
  body?: string;
  entityRef?: INotificationEntityRef;
  actions?: INotificationAction[];
  status: NotificationStatus;
  /** Resolved target channels for this recipient. */
  channels: NotificationChannel[];
  deliveryStatus?: IChannelDelivery[];
  /** Collapses notifications of the same nature in the UI. */
  groupKey?: string;
  source: "system" | "rule" | "user";
  createdAt: ISO8601;
  readAt?: ISO8601;
  expiresAt?: ISO8601;
  metadata?: Record<string, unknown>;
}

/** Per-recipient channel×category preference matrix. */
export interface INotificationPreference {
  recipientId: ID;
  recipientType: NotificationRecipientType;
  /** channel enabled? indexed by category then channel. */
  matrix: Record<NotificationCategory, Partial<Record<NotificationChannel, boolean>>>;
  /** Modelled but dormant in the MVP (quiet hours). */
  quietHours?: { start: string; end: string };
  updatedAt: ISO8601;
}
```

- [ ] **Step 2: Re-export from the barrel** — add to `src/shared/types/index.ts` (near the other domain exports):

```typescript
export type {
  INotification,
  INotificationAction,
  INotificationEntityRef,
  IChannelDelivery,
  INotificationPreference,
  NotificationLifecycle,
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  NotificationChannel,
  NotificationRecipientType,
  ChannelDeliveryStatus,
} from "./notification";
```

- [ ] **Step 3: Validate** — `bun run build` will FAIL until `events.ts` exists (Task 3.2 defines `NotificationEventType`). To keep this task self-contained, also create the minimal `events.ts` stub now:

Create `src/providers/notifications/events.ts` with a placeholder union (expanded in Task 3.2):

```typescript
/** Domain event catalogue (Anexo A). Expanded in Phase 3. */
export type NotificationEventType = "conversa.atribuida"; // placeholder — full union in routing phase
```

- [ ] **Step 4: Validate** — `bun run build` and `bun run lint` must pass.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types/notification.ts src/shared/types/index.ts src/providers/notifications/events.ts
git commit -m "feat(notifications): add INotification domain model and aux unions"
```

### Task 1.2: Glossary + PRD-002 delta

**Files:**
- Modify: `docs/glossario.md`
- Modify: `docs/prds/PRD-002-modelo-conceitual-glossario_DONE.md`

- [ ] **Step 1:** Append to `docs/glossario.md` definitions for: **notificação**, **notificação de evento** (`lifecycle:'event'` — fato imutável), **notificação derivada** (`lifecycle:'derived'` — estado calculado, criado/expirado por reconciliação), **categoria**, **canal**, **reconciliação**. Each entry one short paragraph in pt-BR.

- [ ] **Step 2:** Append a delta note to PRD-002's "Histórico" table: row `30/05/2026 | delta | PRD-008 estende o modelo com INotification e tipos auxiliares (não redefine entidades existentes)`.

- [ ] **Step 3: Commit**

```bash
git add docs/glossario.md docs/prds/PRD-002-modelo-conceitual-glossario_DONE.md
git commit -m "docs(notifications): glossary entries and PRD-002 model delta"
```

---

## Phase 2 — Persistence (Provider Pattern)

> Mirror `src/providers/data/` exactly. Read these model files before implementing: `factory.ts`, `context.tsx`, `hooks/_useDataProviderSlice.ts`, `impl/mock/_storeScope.ts`, `impl/mock/customers.ts`, `impl/supabase/customers.ts`.

### Task 2.1: Contracts

**Files:**
- Create: `src/providers/notifications/contracts/_shared.ts`, `contracts/notifications.ts`, `contracts/preferences.ts`, `contracts/index.ts`
- Create: `src/providers/notifications/errors.ts`

- [ ] **Step 1: `errors.ts`** (local copy for isolation — do not import from `@/providers/data`):

```typescript
/** @see src/providers/data/errors.ts — identical shape, kept local for isolation. */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}
```

- [ ] **Step 2: `contracts/_shared.ts`** — own copy of pagination (do not depend on `@/providers/data/contracts`):

```typescript
export interface IPaginationParams {
  page?: number;
  pageSize?: number;
}
export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
```

- [ ] **Step 3: `contracts/notifications.ts`**:

```typescript
import type {
  INotification,
  NotificationCategory,
  NotificationSeverity,
  NotificationStatus,
  ID,
} from "@/shared/types";
import type { IPaginationParams, IPaginatedResult } from "./_shared";

export interface IListNotificationsParams extends IPaginationParams {
  /** Resolved server-side from the authenticated actor; never trusted from the client. */
  recipientId?: ID;
  categories?: NotificationCategory[];
  statuses?: NotificationStatus[];
  severities?: NotificationSeverity[];
  /** Only notifications not expired at query time. */
  activeOnly?: boolean;
}

/** A derived reconcile pass: upsert these, expire derived ones absent from `keepKeys`. */
export interface IReconcileDerivedInput {
  recipientScope: ID[];
  upsert: INotification[];
  /** dedupeKeys that remain valid this pass; others (derived) get expired. */
  keepKeys: string[];
}

export interface INotificationStore {
  list(params?: IListNotificationsParams): Promise<IPaginatedResult<INotification>>;
  get(id: ID): Promise<INotification>;
  create(input: Omit<INotification, "id" | "createdAt" | "status"> & { status?: NotificationStatus }): Promise<INotification>;
  unreadCount(recipientId?: ID): Promise<number>;
  markRead(id: ID): Promise<INotification>;
  markAllRead(recipientId?: ID): Promise<number>;
  archive(id: ID): Promise<void>;
  reconcileDerived(input: IReconcileDerivedInput): Promise<void>;
}
```

- [ ] **Step 4: `contracts/preferences.ts`**:

```typescript
import type { INotificationPreference, NotificationRecipientType, ID } from "@/shared/types";

export interface INotificationPreferenceStore {
  /** Returns saved prefs or sensible defaults (never throws on missing). */
  get(recipientId: ID, recipientType: NotificationRecipientType): Promise<INotificationPreference>;
  update(pref: INotificationPreference): Promise<INotificationPreference>;
}
```

- [ ] **Step 5: `contracts/index.ts`**:

```typescript
import type { INotificationStore } from "./notifications";
import type { INotificationPreferenceStore } from "./preferences";

export interface INotificationStores {
  notifications: INotificationStore;
  preferences: INotificationPreferenceStore;
}
export type { INotificationStore } from "./notifications";
export type { INotificationPreferenceStore } from "./preferences";
export type {
  IListNotificationsParams,
  IReconcileDerivedInput,
} from "./notifications";
```

- [ ] **Step 6: Validate** (`bun run build` + `bun run lint`) and **commit**:

```bash
git add src/providers/notifications/errors.ts src/providers/notifications/contracts
git commit -m "feat(notifications): persistence contracts (store + preferences)"
```

### Task 2.2: Mock API + generator + bootstrap wiring

**Files:**
- Create: `src/mocks/generators/notification.ts`, `src/mocks/api/notifications.ts`
- Modify: `src/mocks/generators/bootstrap.ts`

> Read `src/mocks/generators/conversation.ts` (generator pattern) and an existing `src/mocks/api/*.ts` (Zustand-backed CRUD) before writing.

- [ ] **Step 1: `generators/notification.ts`** — seeded, pt-BR, plausible mix for `seller` + `customer`. Use the project's `ISeededContext`. Produce `lifecycle:'event'` notifications across categories with realistic `status`/`severity` distribution. Title/body are snapshots. (Mirror the field-by-field structure of `generateConversation`; key fields: `id: notif-XXXX`, `dedupeKey`, `type`, `category`, `severity`, `recipientId`, `recipientType`, `status`, `channels: ["inApp"]`, `createdAt`, optional `groupKey`/`entityRef`/`actions`.)

- [ ] **Step 2: `api/notifications.ts`** — Zustand-backed list/get/create/markRead/markAllRead/archive/unreadCount/reconcileDerived over the bootstrapped array (mirror the existing `api/*` files; they read/write `useMockStore`). Pagination via the same `paginate` util the other apis use.

- [ ] **Step 3: `bootstrap.ts`** — add `notifications: INotification[]` to `IBootstrappedDataset`; generate ~40 per seller + ~12 per a sample customer in the `bootstrap()` body; include it in the returned object.

- [ ] **Step 4: Validate + commit**

```bash
git add src/mocks/generators/notification.ts src/mocks/api/notifications.ts src/mocks/generators/bootstrap.ts
git commit -m "feat(mocks): seed notifications generator and mock api"
```

### Task 2.3: Mock + Supabase store impls with RBAC scope

**Files:**
- Create: `src/providers/notifications/impl/mock/_scope.ts`, `impl/mock/notifications.ts`, `impl/mock/preferences.ts`
- Create: `src/providers/notifications/impl/supabase/notifications.ts`, `impl/supabase/preferences.ts`

- [ ] **Step 1: `impl/mock/_scope.ts`** — resolve the recipient scope from the authenticated actor, mirroring `data/impl/mock/_storeScope.ts`'s use of `getCurrentContext()`. Export `resolveRecipientScope(): { recipientId: ID; recipientType: NotificationRecipientType; storeScope: "own" | "store" | "all"; storeId?: ID }` and `enforceListScope(params, ctx)` that overrides any client-supplied `recipientId`/`storeId` per role (Owner all; Gestor store; Vendedor/Cliente own).

- [ ] **Step 2: `impl/mock/notifications.ts`** — implements `INotificationStore` delegating to `@/mocks` `notificationsApi`, applying `enforceListScope` on `list`/`unreadCount`/`markAllRead`, and `logMockMutation` (reuse `data/impl/mock/_audit.ts` pattern — see note) on `markRead`/`archive`/preference writes. `reconcileDerived` upserts and expires within the recipient scope only.

> Audit: import the existing non-React `recordAuditLog` from `@/providers/data` (it is the public surface) rather than re-implementing — `import { recordAuditLog } from "@/providers/data"`. Verify it is exported by the data barrel; if not, add a local thin `_audit.ts` mirroring `data/impl/mock/_audit.ts`.

- [ ] **Step 3: `impl/mock/preferences.ts`** — `get` returns saved pref or `defaultPreferenceFor(recipientType, role)` (Task 3.4); `update` persists + audits.

- [ ] **Step 4: `impl/supabase/notifications.ts` and `preferences.ts`** — stubs. Pattern:

```typescript
import { NotImplementedError } from "../../errors";
import type { INotificationStore } from "../../contracts/notifications";

const stub = (m: string) => () => {
  throw new NotImplementedError(`SupabaseNotificationStore.${m} — implementar no PRD-104+ (notificações via Supabase).`);
};
export const supabaseNotificationStore: INotificationStore = {
  list: stub("list"), get: stub("get"), create: stub("create"),
  unreadCount: stub("unreadCount"), markRead: stub("markRead"),
  markAllRead: stub("markAllRead"), archive: stub("archive"),
  reconcileDerived: stub("reconcileDerived"),
};
```

- [ ] **Step 5: Validate + commit**

```bash
git add src/providers/notifications/impl
git commit -m "feat(notifications): mock and supabase store implementations with RBAC scope"
```

### Task 2.4: Factory, context, hooks, ESLint, mount

**Files:**
- Create: `factory.ts`, `context.tsx`, `hooks/_useNotificationSlice.ts`, `hooks/useNotifications.ts`, `hooks/useUnreadCount.ts`, `hooks/useNotificationPreferences.ts`, `index.ts`
- Modify: `eslint.config.js`, `src/routes/__root.tsx`

- [ ] **Step 1: `factory.ts`** — mirror `data/factory.ts`: resolve `VITE_DATA_SOURCE`, return a stable singleton `INotificationStores` (`mockNotificationStores` vs `supabaseNotificationStores`).

- [ ] **Step 2: `context.tsx`** — `NotificationProvidersProvider` mirroring `data/context.tsx` (Context + `useMemo(() => providers ?? getNotificationStores())`). It also boots the reconciler via `useEffect` (Task 5.1 fills `startReconciler`); for now `useEffect(() => startReconciler(value), [value])` with a no-op `startReconciler` placeholder exported from `reconciler.ts`.

- [ ] **Step 3: hooks** — `_useNotificationSlice.ts` mirrors `data/hooks/_useDataProviderSlice.ts`. Then:

```typescript
// useUnreadCount.ts
export function useUnreadCount(): { count: number; isLoading: boolean } { /* react-query over store.unreadCount() */ }
// useNotifications.ts — react-query list with filters
// useNotificationPreferences.ts — read+update preferences
```

Implement with TanStack Query (the project already uses it). Keep query keys stable: `["notifications", filters]`, `["notifications","unread"]`, `["notification-prefs", recipientId]`.

- [ ] **Step 4: `index.ts` barrel** — export `NotificationProvidersProvider`, the three hooks, and re-export the public types. **Do not** export `factory`, `impl/*`, `contracts/*`.

- [ ] **Step 5: `eslint.config.js`** — add a `no-restricted-imports` block mirroring the data one, for `@/providers/notifications/impl/*`, `/contracts/*`, `/factory` (ignore inside `src/providers/notifications/**`).

- [ ] **Step 6: `__root.tsx`** — mount the provider after `DataProvidersProvider`:

```tsx
<DataProvidersProvider>
  <NotificationProvidersProvider>
    <AuthProvider>
      <MultistoreProvider>
        <Outlet />
      </MultistoreProvider>
    </AuthProvider>
  </NotificationProvidersProvider>
</DataProvidersProvider>
```

- [ ] **Step 7: Validate + commit**

```bash
git add src/providers/notifications eslint.config.js src/routes/__root.tsx
git commit -m "feat(notifications): factory, context, hooks, ESLint isolation and provider mount"
```

---

## Phase 3 — Bus, Routing, Preferences

### Task 3.1: notificationBus

**Files:** Create `src/providers/notifications/bus.ts`

- [ ] **Step 1:** Implement a tiny synchronous pub/sub that never throws to the emitter:

```typescript
import type { NotificationEventType } from "./events";

export interface INotificationEvent<T = unknown> {
  type: NotificationEventType;
  payload: T;
  /** ISO string supplied by the emitter (router uses it for dedupe window). */
  occurredAt: string;
}
type Handler = (e: INotificationEvent) => void;

const handlers = new Set<Handler>();

export const notificationBus = {
  subscribe(h: Handler): () => void {
    handlers.add(h);
    return () => handlers.delete(h);
  },
  emit(type: NotificationEventType, payload: unknown, occurredAt: string): void {
    const event: INotificationEvent = { type, payload, occurredAt };
    for (const h of handlers) {
      try {
        h(event);
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[notificationBus] handler failed (non-fatal)", err);
      }
    }
  },
};
```

- [ ] **Step 2: Validate + commit** (`feat(notifications): in-app event bus`).

### Task 3.2: Event catalogue (Anexo A)

**Files:** Modify `src/providers/notifications/events.ts`

- [ ] **Step 1:** Replace the placeholder with the full union from PRD-008 Anexo A (30 events), grouped by module with comments. Include every `type` string verbatim (e.g. `conversa.atribuida`, `conversa.semResposta`, `carteira.transferenciaRecebida`, `lead.novo`, `meta.batida`, `cliente.dormente`, `pedido.criado`, `ecom.pedidoRecebido`, `portal.faturaDisponivel`, `sistema.manutencao`, …). Also export `DERIVED_EVENTS: readonly NotificationEventType[]` listing the 6 derived ones (`conversa.semResposta`, `lead.esfriando`, `cliente.dormente`, `vendedor.sobrecarregado`, `positivacao.emRisco`, `portal.creditoProximoLimite`).

- [ ] **Step 2: Validate + commit** (`feat(notifications): domain event catalogue (Anexo A)`).

### Task 3.3: dedupe + rules

**Files:** Create `routing/dedupe.ts`, `routing/rules.ts`

- [ ] **Step 1: `dedupe.ts`** — deterministic key from `type` + entityRef + time window (floor to N seconds):

```typescript
import type { NotificationEventType } from "../events";
const WINDOW_MS = 60_000;
export function dedupeKey(type: NotificationEventType, entityId: string | undefined, occurredAtIso: string, recipientId: string): string {
  const bucket = Math.floor(new Date(occurredAtIso).getTime() / WINDOW_MS);
  return `${type}:${entityId ?? "-"}:${recipientId}:${bucket}`;
}
```

- [ ] **Step 2: `rules.ts`** — a `Record<NotificationEventType, IRoutingRule>` where each rule declares `category`, `severity`, `resolveRecipients(payload, ctx) => {recipientId, recipientType, storeId?}[]`, and `channels: NotificationChannel[]` (phase-1 targets). Define the `IRoutingRule` interface and fill all 30 events per the Anexo A table (category/severity/recipients/channels columns). Mark external channels (email/whatsapp/sms/push) in `channels` where the table lists them — the router will mark them `deferred`.

- [ ] **Step 3: Validate + commit** (`feat(notifications): dedupe key and routing rules`).

### Task 3.4: preference defaults (Anexo B)

**Files:** Create `preferences/defaults.ts`

- [ ] **Step 1:** Export `defaultPreferenceFor(recipientType, role?) : INotificationPreference` building the channel×category matrix from PRD-008 Anexo B (per role: Vendedor/Gestor/Owner/Cliente). Encode the lock rule data here too: export `isChannelLocked(category, channel)` → `true` for `inApp` on `transactional`/`system` (non-silenceable), and `isCategoryFullyOptional(category)` → `true` for `marketing`/`gamification`.

- [ ] **Step 2: Validate + commit** (`feat(notifications): preference defaults and lock rules (Anexo B)`).

### Task 3.5: router (fan-out + preferences + dedupe)

**Files:** Create `routing/router.ts`; wire subscription in `context.tsx`

- [ ] **Step 1: `router.ts`** — export `startRouter(stores: INotificationStores)` that subscribes to `notificationBus` and for each event:
  1. look up the rule; if none, `console.warn` in DEV and return (RF: unknown type ignored, no throw).
  2. `resolveRecipients` → for each, compute target channels from the rule, **cross with preferences** (`stores.preferences.get`), removing disabled channels (record them `skipped`); enforce non-silenceable `inApp` (Task 3.4 lock).
  3. compute `dedupeKey`; build the `INotification` (snapshot title/body from payload); set external channels' delivery to `deferred`.
  4. dispatch to active channels via the registry (Task 4.x) — the channel persists/show.
  5. In DEV, `console.info` the routing summary (recipients, target channels, skipped, deferred, `VITE_DATA_SOURCE`).

- [ ] **Step 2:** In `context.tsx`, call `startRouter(value)` inside the boot `useEffect` (alongside `startReconciler`). Return the unsubscribe in cleanup.

- [ ] **Step 3: Validate + commit** (`feat(notifications): event router with fan-out, preferences and dedupe`).

---

## Phase 4 — Multi-channel Delivery

### Task 4.1: channel contract + registry

**Files:** Create `channels/contract.ts`, `channels/registry.ts`

- [ ] **Step 1: `contract.ts`**:

```typescript
import type { INotification, ChannelDeliveryStatus, NotificationChannel } from "@/shared/types";
export interface IChannelResult { status: ChannelDeliveryStatus; detail?: string; }
export interface INotificationChannel {
  readonly channel: NotificationChannel;
  send(notification: INotification): Promise<IChannelResult>;
}
```

- [ ] **Step 2: `registry.ts`** — `ACTIVE_CHANNELS: NotificationChannel[] = ["inApp", "toast"]`; `getChannel(name)` returns the impl; `isActive(name)` checks membership. Inactive channels resolve `deferred` without dispatch.

- [ ] **Step 3: Validate + commit** (`feat(notifications): channel contract and registry`).

### Task 4.2: active channels (inApp, toast)

**Files:** Create `channels/inApp.ts`, `channels/toast.ts`

- [ ] **Step 1: `inApp.ts`** — persists the notification via `stores.notifications.create` (inject the store; export a factory `makeInAppChannel(stores)`), returns `{status:"sent"}`.

- [ ] **Step 2: `toast.ts`** — signals an ephemeral toast via `sonner`'s `toast()` mapping severity→variant; returns `{status:"sent"}`. Do not change existing toast call-sites yet (Task 4.4).

- [ ] **Step 3: Validate + commit** (`feat(notifications): active in-app and toast channels`).

### Task 4.3: deferred channel stubs

**Files:** Create `channels/email.ts`, `whatsapp.ts`, `sms.ts`, `push.ts`

- [ ] **Step 1:** Each exports an `INotificationChannel` whose `send` returns `{status:"deferred"}` for registry-driven dispatch, but a **direct** call throws a descriptive error. Pattern:

```typescript
import { NotImplementedError } from "../errors";
import type { INotificationChannel } from "./contract";
export const emailChannel: INotificationChannel = {
  channel: "email",
  async send() {
    throw new NotImplementedError("EmailChannel.send — implementar no PRD-141 (Onda 8 / e-mail transacional).");
  },
};
```

(whatsapp→PRD-143, sms→PRD-144, push→PRD-145.)

- [ ] **Step 2:** Wire the registry's `getChannel` to return these; ensure the router only *dispatches* to `ACTIVE_CHANNELS` and records the rest as `deferred` (never calls `send` on inactive channels).

- [ ] **Step 3: Validate + commit** (`feat(notifications): deferred channel stubs for Onda 8`).

### Task 4.4: re-route existing toasts through ToastChannel

**Files:** Modify the 2-3 highest-traffic toast call-sites identified during exploration (e.g. `src/features/conversations/**` "Resolvido/Desfazer").

- [ ] **Step 1:** For reversible toasts already in the app (PRD-011 "Desfazer" 5s), keep the existing UX but route them through the bus/`ToastChannel` where trivial. If a call-site is risky to change, leave a `// TODO(PRD-009): consolidate via ToastChannel` and do not alter UX. **No visible behavior change.**

- [ ] **Step 2: Validate + commit** (`refactor(notifications): begin routing toasts through ToastChannel`).

---

## Phase 5 — Reconciler, Grouping, Seeds, Harness

### Task 5.1: extract shared derived-condition logic from PRD-014

**Files:**
- Create: `src/providers/notifications/conditions/derivedConditions.ts`
- Modify: `src/features/manager-dashboard/hooks/useActiveAlerts.ts`

- [ ] **Step 1:** Move `IActiveAlert`, `AlertSeverity`, `AlertKind`, `buildClienteADormenteAlerts`, `buildVendedorSobrecarregadoAlerts`, `buildConversaSemRespostaAlerts` (verbatim from `useActiveAlerts.ts:11-116`) into `conditions/derivedConditions.ts`. Export them.

- [ ] **Step 2:** In `useActiveAlerts.ts`, delete those definitions and import them: `import { type IActiveAlert, type AlertSeverity, buildClienteADormenteAlerts, buildVendedorSobrecarregadoAlerts, buildConversaSemRespostaAlerts } from "@/providers/notifications";` (re-export from the barrel). Keep the hook, `persistDismissal`, `alertCustomerId` in place. Verify the manager dashboard still renders identically.

- [ ] **Step 3: Validate** — `bun run build` + `bun run lint`. Manually verify `/app` manager dashboard alerts still appear (visual). **Commit** (`refactor(notifications): extract derived-condition logic shared with PRD-014`).

### Task 5.2: reconciler

**Files:** Create `src/providers/notifications/reconciler.ts`

- [ ] **Step 1:** Export `startReconciler(stores)` that, on an interval driven by `settings.alertPollingSeconds` (read via the data provider's settings store for the active store), and immediately on boot:
  1. builds the current derived conditions using the shared `build*` functions over the data snapshot;
  2. maps each `IActiveAlert` → a derived `INotification` (`lifecycle:"derived"`, `category`/`severity` per the event catalogue, `dedupeKey` stable from the alert `hash`, recipients = owner seller + gestor);
  3. calls `stores.notifications.reconcileDerived({ recipientScope, upsert, keepKeys })` so conditions that left get expired/archived automatically (no localStorage dismissals).

  Must run off the render path (interval, not inside a component body). Return a stop function.

- [ ] **Step 2:** Replace the no-op placeholder so `context.tsx`'s boot effect actually starts/stops it.

- [ ] **Step 3: Validate + commit** (`feat(notifications): derived reconciler replacing PRD-014 alert side-effects`).

### Task 5.3: grouping (groupKey)

**Files:** Modify `routing/router.ts` (+ generator)

- [ ] **Step 1:** Set `groupKey` when building notifications of collapsible nature (e.g. `conversa.atribuida` → `group:conversa-atribuida:<sellerId>:<dayBucket>`). Structural only; no scheduled digest. Ensure seeds (Task 2.1) also stamp `groupKey` on a couple of clusters so PRD-009 can show grouping.

- [ ] **Step 2: Validate + commit** (`feat(notifications): structural grouping via groupKey`).

### Task 5.4: validation harness on /design-system

**Files:** Modify `src/routes/design-system.tsx`

- [ ] **Step 1:** Add a dev-only "Notifications harness" section: buttons that call `notificationBus.emit(type, samplePayload, new Date().toISOString())` for a few representative events, and a live log panel listening to a DEV-only console/event mirror, showing resolved recipients / target channels / skipped / deferred. (The route is already `beforeLoad`-guarded to DEV.)

- [ ] **Step 2: Validate** — `bun run build` + `bun run lint`; open `/design-system`, fire an event, confirm console shows routing summary and the notification appears via `useNotifications`. **Commit** (`feat(notifications): dev harness for routing/delivery validation`).

### Task 5.5: PRD-014 migration note + finalize

**Files:** Modify `docs/prds/PRD-014-painel-gestor_DONE.md`

- [ ] **Step 1:** Add a migration note: the three alert families now delegate condition logic to `@/providers/notifications/conditions`; the `<ActiveAlertsList>` UI migration to consume the Notification Center is **PRD-009 (RF-029)**.

- [ ] **Step 2: Commit** (`docs(notifications): note PRD-014 condition-logic delegation`).

---

## Release (PRD-008)

- [ ] Bump version **MINOR** → codename **Herald**; update `CHANGELOG.md` (Keep a Changelog: Added — notifications foundation).
- [ ] Update `docs/prds/INDEX-PRDs-Gallo-Base-Diesel.md` status row for PRD-008 → ✅, version, date.
- [ ] Rename `docs/prds/PRD-008-fundacao-notificacoes.md` → `..._DONE.md`; fill its "Status de Implementação".
- [ ] Final `bun run build` + `bun run lint` clean. Commit (`chore(release): vX.Y.0 Herald — notifications foundation`).

---

## Self-Review (PRD-008 plan)

- **Spec coverage:** model (1.1) ✓ · glossary/PRD-002 delta (1.2) ✓ · persistence contracts+impl+factory+hooks+ESLint (2.x) ✓ · bus/events/dedupe/rules/preferences/router (3.x) ✓ · channels active+deferred+registry+toast reroute (4.x) ✓ · reconciler with extracted shared logic (5.1-5.2) ✓ · grouping (5.3) ✓ · seeds (2.2) ✓ · harness (5.4) ✓ · RBAC scope (2.3) ✓.
- **Decisions honored:** limiares/cadence from `IManagerDashboardSettings` (5.2) ✓ · shared condition extraction (5.1) ✓ · two perpendicular axes ✓ · coexistence: `<ActiveAlertsList>` untouched except import (5.1) ✓.
- **Type consistency:** `INotificationStore`/`INotificationStores`/`INotificationPreferenceStore` names consistent across 2.1/2.3/2.4; `NotificationEventType` placeholder (1.1) → full (3.2); `startRouter`/`startReconciler` referenced in 2.4 context and defined in 3.5/5.2.
- **Open follow-up for implementer:** confirm `recordAuditLog` is exported by the `@/providers/data` barrel (Task 2.3 note); if not, add local `_audit.ts`.
