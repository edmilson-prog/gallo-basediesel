# PRD-009 — Notification Center & Preferências (`Chime`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Prerequisite: PRD-008 (`Herald`) merged** — this plan consumes its hooks (`useNotifications`, `useUnreadCount`, `useNotificationPreferences`) and never touches the foundation.

**Goal:** Ship the visible notifications layer — real bell + badge, preview dropdown, `/app/notificacoes` page with two switchable layouts, channel×category preference matrix, and the customer portal pages — consuming only the PRD-008 hooks, and migrating the PRD-014 alert list onto the center.

**Architecture:** Feature module `src/features/notifications/` with presentational components shared between internal (`AppLayout`) and customer (`LojaLayout`) surfaces. Severity colour is a **dedicated token scale** constant across the 4 themes (tonal treatment). The page renders one `<NotificationItem>`/`<NotificationGroup>` set under two interchangeable chromes (sidebar "Painel" vs horizontal "Lista"), selected by a `localStorage`-persisted switcher. UI consumes PRD-008 hooks only (ESLint-isolated).

**Tech Stack:** React 19, TanStack Router (file-based), TanStack Query, Tailwind v4, shadcn/ui (`Popover`, `Tabs`, `DropdownMenu`, `Dialog`, `Switch`), Iconify `mdi`. **Validation per task = `bun run build` + `bun run lint` + manual visual check** (no test runner).

---

## Validation Convention

Same as PRD-008: each task ends with `bun run build` (tsc noEmit) + `bun run lint`, then a commit. Visual checks are manual (the user tests UI manually — do not spin up preview/devtools to "validate"). Reference mockups live in `.superpowers/brainstorm/2780-1780186128/content/*.html` and the spec at `docs/superpowers/specs/2026-05-30-notificacoes-008-009-design.md`.

## File Structure

```
src/styles.css                                   # MODIFY — add --severity-* tokens (primitive + semantic, constant across themes)

src/features/notifications/
  lib/severity.ts                                # severity/category → icon + token class map (Anexo A of PRD-009)
  lib/useNotificationLayout.ts                   # localStorage "gallo-notif-layout" ('painel'|'lista')
  lib/relativeTime.ts                            # date-fns pt-BR relative timestamps (or reuse existing util)
  components/NotificationBell.tsx                # bell + badge (useUnreadCount) — replaces placeholder
  components/NotificationDropdown.tsx            # preview (Popover) — Direção B
  components/NotificationItem.tsx                # edge-by-severity item (Direção B)
  components/NotificationGroup.tsx               # collapsible groupKey cluster
  components/NotificationFilters.tsx             # category/status/severity controls (URL-synced)
  components/NotificationLayoutSwitcher.tsx      # segmented "Painel | Lista"
  components/NotificationListView.tsx            # shared list + grouping (used by both layouts)
  components/NotificationPreferences.tsx         # matrix channel×category (Abordagem A)
  components/states/{Skeleton,Empty,ErrorState}.tsx

src/routes/                                       # follow the existing file-based convention (inspect src/routes/app/* and the PRD-019 /app/configuracoes structure first)
  app/notificacoes.tsx                           # CREATE — Notification Center (internal)
  app/configuracoes/notificacoes.tsx             # CREATE — preferences sub-route (mirror PRD-019 sub-sidebar)
  loja/conta/notificacoes.tsx                    # CREATE — customer center (LojaLayout)
  loja/conta/preferencias.tsx                    # CREATE — customer preferences (own page — decision)

src/features/shell/components/TopBar.tsx         # MODIFY — replace placeholder bell with <NotificationBell/>
src/features/manager-dashboard/components/ActiveAlertsList.tsx  # MODIFY — consume center filtered by category=operational
```

---

## Phase 1 — Severity tokens, Bell, Badge, Dropdown

### Task 1.1: Dedicated severity token scale

**Files:** Modify `src/styles.css`

- [ ] **Step 1:** Add **primitive** severity colours in `:root` (constant — NOT overridden per `[data-theme]`), with a light and a dark value, then map **semantic** tokens. These are decoupled from `--primary` so they never collide with the diesel/parts/service/industrial brand colour.

```css
/* ── Severity scale (constant across all 4 themes; tonal treatment in components) ── */
:root {
  --gallo-sev-info: #2563EB;
  --gallo-sev-success: #16A34A;
  --gallo-sev-warning: #D97706;
  --gallo-sev-critical: #DC2626;
}
.dark {
  --gallo-sev-info: #60A5FA;
  --gallo-sev-success: #22C55E;
  --gallo-sev-warning: #F59E0B;
  --gallo-sev-critical: #F87171;
}
@theme inline {
  --color-severity-info: var(--gallo-sev-info);
  --color-severity-success: var(--gallo-sev-success);
  --color-severity-warning: var(--gallo-sev-warning);
  --color-severity-critical: var(--gallo-sev-critical);
}
```

This yields Tailwind utilities `text-severity-warning`, `bg-severity-warning/15`, `border-severity-warning`, etc. Verify contrast AA in light and dark (the `/design-system` contrast checker can confirm).

- [ ] **Step 2:** `lib/severity.ts` — export `SEVERITY_TONE: Record<NotificationSeverity, {text,bg,border}>` mapping to those utility classes, and `CATEGORY_ICON: Record<NotificationCategory, string>` (mdi icons per PRD-009 Anexo A: transactional→`mdi:receipt-text`, commercial→`mdi:account-clock`, operational→`mdi:alert-circle`, gamification→`mdi:trophy`, system→`mdi:cog`, marketing→`mdi:bullhorn`).

- [ ] **Step 3: Validate + commit** (`feat(notifications): dedicated severity colour tokens`).

### Task 1.2: NotificationItem (Direção B)

**Files:** Create `components/NotificationItem.tsx`

- [ ] **Step 1:** Presentational item per approved Direção B: left severity border, tonal category icon, title (Inter semibold), one-line body (muted), relative time (JetBrains Mono), unread dot, inline actions from `notification.actions`. Props: `{ notification: INotification; onAction(action): void; onMarkRead(id): void; dense?: boolean }`. Use `SEVERITY_TONE`/`CATEGORY_ICON`. Icons `aria-hidden`; the row is a semantic element with `focus-visible:ring-2`.

```tsx
// skeleton — fill per mockup dropdown-direction.html / page-com-alternador.html
export function NotificationItem({ notification, onAction, onMarkRead, dense }: Props) {
  const tone = SEVERITY_TONE[notification.severity];
  return (
    <article
      className={cn(
        "flex gap-3 rounded-xl border-l-[3px] p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary",
        tone.border,
        notification.status === "unread" && "bg-primary/[0.045]",
      )}
      tabIndex={0}
    >
      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone.bg)} aria-hidden>
        <Icon icon={CATEGORY_ICON[notification.category]} className={tone.text} />
      </span>
      {/* title row: unread dot + title + relative time; body; actions */}
    </article>
  );
}
```

- [ ] **Step 2: Validate + commit** (`feat(notifications): NotificationItem (edge-by-severity)`).

### Task 1.3: NotificationBell + badge

**Files:** Create `components/NotificationBell.tsx`; Modify `src/features/shell/components/TopBar.tsx`

- [ ] **Step 1:** `NotificationBell` consumes `useUnreadCount()`. Renders `mdi:bell-badge-outline` when count>0 else `mdi:bell-outline`; badge uses `bg-primary text-primary-foreground`, shows `99+` over 99, hidden at 0. `aria-label="Notificações"`; the count node has `aria-live="polite"`. Wrap with the dropdown (Task 1.4).

- [ ] **Step 2:** In `TopBar.tsx`, replace the placeholder Popover/badge block (the static `notificationCount`/`MOCK_NOTIFICATIONS`) with `<NotificationBell/>`. Remove now-dead `MOCK_NOTIFICATIONS`. Keep position (between search and avatar) and responsive behavior.

- [ ] **Step 3: Validate + commit** (`feat(notifications): real bell and badge replacing placeholder`).

### Task 1.4: NotificationDropdown

**Files:** Create `components/NotificationDropdown.tsx`

- [ ] **Step 1:** `Popover` preview (shadcn) showing latest ~8 from `useNotifications({ pageSize: 8 })`, unread-first, grouped by `groupKey`. Header "Notificações" + "Marcar todas lidas" (`markAllRead`); footer "Ver todas" → `/app/notificacoes`. Opening an item: `markRead` + run primary action + close. Manage focus (move into panel on open, return to bell on close/Esc); keyboard navigable; empty state "Nada novo por aqui ✅".

- [ ] **Step 2: Validate + commit** (`feat(notifications): preview dropdown`).

---

## Phase 2 — Center page + layouts + filters + states

### Task 2.1: shared list view + group + states

**Files:** Create `components/NotificationListView.tsx`, `components/NotificationGroup.tsx`, `components/states/{Skeleton,Empty,ErrorState}.tsx`

- [ ] **Step 1:** `NotificationListView` takes the `useNotifications(filters)` result and renders groups (`NotificationGroup`, collapsible) + items, pagination, and the three states (skeleton on initial fetch, contextual empty: neutral vs "Nenhuma notificação corresponde aos filtros" + "Limpar filtros", and error with "Tentar novamente"). **Virtualise/paginate** — never render >50 rows unbounded. This component is layout-agnostic (used by both chromes).

- [ ] **Step 2: Validate + commit** (`feat(notifications): shared list view, grouping and states`).

### Task 2.2: filters (URL-synced)

**Files:** Create `components/NotificationFilters.tsx`

- [ ] **Step 1:** Two presentations sharing one filter state: `variant="sidebar"` (segments Todas/Não-lidas/Arquivadas + categories with counts + severity chips) and `variant="bar"` (dropdowns + removable active chips). Filter state lives in the route search params (TanStack `useSearch`/`navigate`) so it survives refresh: `{ category?: NotificationCategory[]; status?; severity?; unreadOnly?: boolean }`.

- [ ] **Step 2: Validate + commit** (`feat(notifications): URL-synced filters (sidebar + bar)`).

### Task 2.3: layout switcher + page

**Files:** Create `lib/useNotificationLayout.ts`, `components/NotificationLayoutSwitcher.tsx`, route `src/routes/app/notificacoes.tsx`

- [ ] **Step 1:** `useNotificationLayout()` → `['painel'|'lista', setLayout]` persisted in `localStorage('gallo-notif-layout')` (default `'painel'`), SSR-safe guard.

- [ ] **Step 2:** `NotificationLayoutSwitcher` — segmented control (`mdi:view-split-vertical` Painel / `mdi:view-agenda-outline` Lista), active = `bg-primary text-primary-foreground`, `role="group"`, keyboard operable.

- [ ] **Step 3:** Route `/app/notificacoes` on `AppLayout`: header (title Saira + unread count + "Marcar todas como lidas" + switcher). When `painel`: `NotificationFilters variant="sidebar"` + `NotificationListView`. When `lista`: `NotificationFilters variant="bar"` above full-width `NotificationListView`. Both read the same `useNotifications(search)`. (Inspect an existing `src/routes/app/*.tsx` for the route boilerplate.)

- [ ] **Step 4: Validate + commit** (`feat(notifications): /app/notificacoes page with Painel/Lista switcher`).

---

## Phase 3 — Preferences (Abordagem A)

### Task 3.1: NotificationPreferences matrix

**Files:** Create `components/NotificationPreferences.tsx`

- [ ] **Step 1:** Full channel×category grid (Abordagem A) from `useNotificationPreferences()`. Columns: In-app, Toast (editable `Switch`); E-mail/WhatsApp/SMS/Push (disabled, dimmed, **"Fase 2"** badge + tooltip). Rows: the 6 categories. Cells: editable toggle, **locked** (in-app on transactional/system — `Switch` checked+disabled with `mdi:lock`, tooltip "Sempre ativo (crítico)"), or Fase-2 disabled. Persist via the hook's update (audited by PRD-008). On mobile, render as per-category cards. Legend decoding the states.

- [ ] **Step 2:** Enforce rules from PRD-008: never allow turning a locked in-app off; `marketing`/`gamification` fully optional. Read `isChannelLocked`/`isCategoryFullyOptional` from `@/providers/notifications`.

- [ ] **Step 3: Validate + commit** (`feat(notifications): channel×category preference matrix`).

### Task 3.2: internal preferences sub-route

**Files:** Create `src/routes/app/configuracoes/notificacoes.tsx`

- [ ] **Step 1:** Mount `NotificationPreferences` as a sub-route of `/app/configuracoes` following the PRD-019 sub-sidebar pattern (inspect the existing configuracoes routes and replicate the sidebar item + permission guard).

- [ ] **Step 2: Validate + commit** (`feat(notifications): preferences settings sub-route`).

---

## Phase 4 — Migrate ActiveAlertsList + toasts

### Task 4.1: migrate ActiveAlertsList onto the center

**Files:** Modify `src/features/manager-dashboard/components/ActiveAlertsList.tsx`

- [ ] **Step 1:** Replace its bespoke `useActiveAlerts` consumption + `localStorage` dismissals with `useNotifications({ category: ['operational'] })`. Keep the visual (severity badge, "Ver"/"Dispensar"); "Dispensar" now calls `markRead`/`archive` (PRD-008) — no localStorage. Preserve the manager-dashboard layout. (The condition logic already moved to `@/providers/notifications/conditions` in PRD-008 Task 5.1; the reconciler now produces these as derived notifications.)

- [ ] **Step 2: Validate** + manual check the manager dashboard still shows operational alerts and "Dispensar" reflects in the center. **Commit** (`refactor(notifications): ActiveAlertsList consumes Notification Center`).

### Task 4.2: consolidate toasts

**Files:** the toast call-sites flagged in PRD-008 Task 4.4

- [ ] **Step 1:** Finish routing reversible toasts (PRD-011 "Desfazer" 5s) through the `ToastChannel` presentation consistently. No UX regression.

- [ ] **Step 2: Validate + commit** (`refactor(notifications): consolidate toast presentation`).

---

## Phase 5 — Customer portal

### Task 5.1: customer center page

**Files:** Create `src/routes/loja/conta/notificacoes.tsx`

- [ ] **Step 1:** On `LojaLayout` (parts/green theme), commercial tone, reusing `NotificationItem`/`NotificationListView` with `recipientType:'customer'` resolved by the mock "Cliente" session. Content limited to transactional/portal events; no internal jargon. Works by direct route now; structured to plug into PRD-065 account nav later (leave a `// TODO(PRD-065): add account menu item`).

- [ ] **Step 2: Validate + commit** (`feat(notifications): customer notification center`).

### Task 5.2: customer preferences page

**Files:** Create `src/routes/loja/conta/preferencias.tsx`

- [ ] **Step 1:** Own page (decision: `/loja/conta/preferencias`). Simplified `NotificationPreferences` for the customer: relevant categories only, `marketing` as explicit opt-in, Fase-2 channels disabled with badge. Reuse the matrix component with a `audience="customer"` prop trimming rows/columns.

- [ ] **Step 2: Validate + commit** (`feat(notifications): customer preferences page`).

### Task 5.3: seed visibility check

- [ ] **Step 1:** Confirm the customer seed from PRD-008 Task 2.2 surfaces on `/loja/conta/notificacoes` under the mock customer session. Adjust the generator volume if empty. **Commit** if changed.

---

## Release (PRD-009)

- [ ] Bump version **MINOR** → codename **Chime**; update `CHANGELOG.md` (Added — notification center, preferences, customer portal; Changed — TopBar bell, ActiveAlertsList).
- [ ] Update `docs/prds/INDEX-PRDs-Gallo-Base-Diesel.md` row for PRD-009 → ✅, version, date; add to version history table.
- [ ] In PRD-014, note `<ActiveAlertsList>` now consumes the center; in PRD-065, note the account menu items to add.
- [ ] Rename `docs/prds/PRD-009-notification-center-preferencias.md` → `..._DONE.md`; fill "Status de Implementação".
- [ ] Final `bun run build` + `bun run lint` clean; commit (`chore(release): vX.Y.0 Chime — notification center`).

---

## Self-Review (PRD-009 plan)

- **Spec coverage:** severity tokens (1.1) ✓ · bell+badge replacing placeholder (1.3) ✓ · dropdown (1.4) ✓ · item Direção B (1.2) ✓ · page + two layouts + switcher (2.3) ✓ · URL filters (2.2) ✓ · grouping + states (2.1) ✓ · matrix Abordagem A with locked/Fase-2 (3.1) ✓ · settings sub-route (3.2) ✓ · ActiveAlertsList migration (4.1) ✓ · toast consolidation (4.2) ✓ · customer center + preferences own page (5.1/5.2) ✓.
- **Decisions honored:** Direção B ✓ · both layouts + localStorage switcher ✓ · matrix Abordagem A ✓ · customer pages via direct LojaLayout route ✓ · preferences own page ✓ · severity scale dedicated/tonal ✓.
- **Type consistency:** consumes PRD-008's `useNotifications`/`useUnreadCount`/`useNotificationPreferences`, `INotification`, `isChannelLocked`/`isCategoryFullyOptional` — all defined in the 008 plan. `useNotificationLayout` returns `'painel'|'lista'` consistently in 2.3.
- **Isolation:** UI imports only `@/providers/notifications` barrel (ESLint from PRD-008). No foundation files modified here.
- **Implementer note:** confirm the file-based route convention (`app/configuracoes/notificacoes.tsx` vs flat `app/configuracoes.notificacoes.tsx`) against existing routes before creating Task 3.2 / 2.3 files.
```
