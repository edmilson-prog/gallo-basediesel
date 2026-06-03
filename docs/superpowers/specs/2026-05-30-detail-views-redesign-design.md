# Detail Views Redesign — Design Spec

> Quote detail (`/app/orcamentos/$id`) and Order detail (`/app/pedidos/$id`) redesign.
> Follows the same philosophy already shipped for the **vehicle detail** (v0.51.0 "Cockpit") and the **list pages** (v0.52.0 "Ledger").

**Status:** Approved (brainstorming) — pending plan.
**Date:** 2026-05-30
**Branch:** `feat/detail-views-redesign`

---

## 1. Context & Problem

`QuoteDetailPage.tsx` and `OrderDetailPage.tsx` both render a single **centered `max-w-5xl` column** of vertically-stacked `Card`s (`space-y-4`). On wide screens this produces:

- **Wasted lateral space** — large empty margins left/right (the exact complaint that motivated the vehicle and list redesigns).
- **Weak hierarchy** — status, total, actions and key facts compete in a long top-to-bottom scroll; nothing is "always visible".
- **Missing at-a-glance information** — derived facts (days to expiry, payment/fulfillment recency, item counts, commission, key dates) require reading deep into the page.

The rest of the app already solved this with a **wide bento + user-selectable layouts + segmented header switcher**. These two pages are the remaining holdouts.

## 2. Goals & Non-Goals

**Goals**

- Replace the narrow centered column with a **wide layout** that uses horizontal space.
- Surface more information via a **KPI strip** and a **summary/actions rail**.
- Ship **3 user-selectable layouts** (Cockpit default, Operacional, Documento), switched via a **segmented control in the page header**, **persisted per page**.
- **Preserve 100% of existing behavior** — every action, dialog, permission gate, audit log, banner, notification, and navigation must keep working.

**Non-Goals**

- No new data sources, providers, or backend changes. All new values are derived client-side from already-loaded records.
- No real PDF/print engine — "Documento" is an on-screen layout (printing via the browser is a bonus, not a deliverable).
- No changes to the list pages (already shipped) or to the action/transition logic itself.
- No test runner introduced (project has none; gate is `tsc --noEmit` + `bun run build`).

## 3. Locked Decisions

- **D1 — Three layouts.** `cockpit` (default), `operational`, `document`. Selected via a segmented `ToggleGroup` in the page header. Mirrors the list/vehicle pattern.
- **D2 — Per-page persistence.** Separate `localStorage` keys for quote vs order (`gallo-quote-detail-layout`, `gallo-order-detail-layout`).
- **D3 — New shared, domain-agnostic framework** `src/shared/detail-views/`, parallel to `src/shared/list-views/`. **Do not refactor `list-views`**; mirror its proven patterns (slight, isolated duplication is acceptable per YAGNI).
- **D4 — Client-side derivation.** KPIs, steppers and relative dates are computed from the already-fetched record + customer + seller + audits. No new queries.
- **D5 — Shared blocks, different arrangement.** The same content blocks (items, payment, delivery, conditions, commission, summary, customer, actions, history) are composed differently by each layout. Blocks are prepared once per page and slotted into the active shell.
- **D6 — Semantic tokens only.** Components consume `bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, etc. Status/tone colors use the established `emerald / amber / rose / blue / violet` Tailwind palette (matching existing badges). Never raw hex or `--gallo-*`.
- **D7 — Stepper is Operacional-only.** The status stepper is the hero of the Operacional layout; in Cockpit/Documento, status lives in the hero badge + KPIs.

## 4. Reuse Boundary

```
src/shared/detail-views/        ← domain-agnostic FRAMEWORK
  config.ts                     DetailLayout union, constants, persistence keys, labels/icons/hints
  useDetailLayout.ts            [layout, setLayout] with synchronous localStorage read
  DetailLayoutSwitcher.tsx      segmented ToggleGroup (mirrors ListLayoutSwitcher)
  DetailStatStrip.tsx           KPI strip: IDetailStat[] → responsive grid of label/value/sub cells
  StatusStepper.tsx             horizontal stepper + off-path terminal callout
  DetailCard.tsx                Card + section header (promotes the per-page SectionHeader)
  LayoutShells.tsx              CockpitShell / OperationalShell / DocumentShell (slot containers)
  index.ts                      barrel

src/features/quotes/…           ← DOMAIN BINDINGS (quote)
  utils/quoteDetailStats.ts     quoteDetailStats(quote, now) → IDetailStat[]; quoteStepperSteps(quote) → IStepperStep[]
  components/detail/*.tsx        quote blocks (items, conditions, summary, customer, actions, history, approval banner)
  pages/QuoteDetailPage.tsx     MODIFIED: compute + slot into active shell; all handlers preserved

src/features/orders/…           ← DOMAIN BINDINGS (order)
  utils/orderDetailStats.ts     orderDetailStats(order, …) → IDetailStat[]; orderStepperSteps(order) → IStepperStep[]
  components/detail/*.tsx        order blocks (payment, delivery, commission, summary, customer, actions, history)
  pages/OrderDetailPage.tsx     MODIFIED: compute + slot into active shell; all handlers preserved
```

Rule: the framework knows nothing about quotes/orders; the pages own all domain logic.

## 5. Data Flow

No change to data acquisition. Both pages already fetch:

- the record — `useQuote(id)` / `useOrder(id)`
- `customer` (by `customerId`), `seller` (by `sellerId`), `audits` (resource/resourceId)
- order also: `useCommissionForOrder`, `settingsProvider`

All KPIs/steppers/relative-time labels are pure functions of this in-memory data, computed in `useMemo` with a single frozen `now = new Date()` (same approach as the list pages).

## 6. Shared Framework — Contracts

### config.ts

```ts
export type DetailLayout = "cockpit" | "operational" | "document";
export const DETAIL_LAYOUTS: DetailLayout[] = ["cockpit", "operational", "document"];
export const DEFAULT_DETAIL_LAYOUT: DetailLayout = "cockpit";
export const QUOTE_DETAIL_LAYOUT_KEY = "gallo-quote-detail-layout";
export const ORDER_DETAIL_LAYOUT_KEY = "gallo-order-detail-layout";
export const DETAIL_LAYOUT_LABELS: Record<DetailLayout, string>; // Cockpit / Operacional / Documento
export const DETAIL_LAYOUT_ICONS: Record<DetailLayout, string>; // iconify ids
export const DETAIL_LAYOUT_HINTS: Record<DetailLayout, string>; // tooltip text (pt-BR)
```

### useDetailLayout.ts

```ts
function useDetailLayout(storageKey: string): [DetailLayout, (l: DetailLayout) => void];
```

Lazy initializer reads `localStorage[storageKey]`, validates against `DETAIL_LAYOUTS`, falls back to `DEFAULT_DETAIL_LAYOUT`. Setter writes through.

### DetailStatStrip.tsx

```ts
type StatTone = "default" | "good" | "warn" | "bad";
interface IDetailStat {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
  icon?: string;
}
function DetailStatStrip({ stats }: { stats: IDetailStat[] }): JSX.Element;
```

Renders a responsive grid (2 cols on mobile → 5 cols on desktop). Each cell: uppercase `label`, prominent `value` (tabular-nums), muted `sub`. `tone` maps to text color: `good→emerald`, `warn→amber`, `bad→text-destructive`, `default→text-foreground`. Card surface (`bg-card`), `border-border`.

### StatusStepper.tsx

```ts
interface IStepperStep {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
}
interface IStatusStepperProps {
  steps: IStepperStep[];
  terminal?: { label: string; tone: "bad" | "warn" } | null; // canceled/returned/rejected/expired
}
```

Horizontal connected dots/labels; `done→primary`, `current→primary ring`, `todo→muted`. When `terminal` is set, render a distinct callout (rose/amber) instead of/above the normal track.

### DetailCard.tsx

```ts
function DetailCard({
  icon,
  title,
  action,
  children,
}: {
  icon: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}): JSX.Element;
```

`Card` + the existing section-header pattern (icon + title, optional right-aligned `action`).

### LayoutShells.tsx

```ts
function CockpitShell({ header, hero, kpis, main, rail }): JSX.Element;
//   header row (back + switcher) · hero · KPI strip · grid[ main (2fr) | rail (1fr, lg:sticky) ]
function OperationalShell({ header, hero, stepper, actions, grid, main }): JSX.Element;
//   header · hero · big stepper · action zone · responsive grid of operational cards · main (items + history)
function DocumentShell({ header, docHeader, parties, items, totals, footer }): JSX.Element;
//   header (back + switcher) · centered max-w-3xl document: docHeader · parties grid · items table · totals (right) · footer
```

All slots are `React.ReactNode`. Shells own only layout/spacing; pages own content. The `header` slot (back link + `DetailLayoutSwitcher`) is shared across all three.

## 7. Layout Compositions

### Cockpit (default) — both

- **Hero:** `#número`, status badge(s), origin badge, contextual links (e.g. "Orçamento de origem"), `Total` (large, right). Banners (SDR / approval / cancellation) render inside the hero region.
- **KPI strip:** 5 cells (§8).
- **Main (2fr):** Items → (order: Pagamento, Entrega, Comissão | quote: Condições) → Histórico.
- **Rail (1fr, sticky on `lg`):** Resumo de valores → Cliente (+ Abrir ficha) → ⚡ Ações contextuais → Datas-chave.

### Operacional — both

- **Hero** (compact) + **Status stepper** (large, §9) + **action zone** (the same contextual buttons, prominent).
- **Operational grid:** order → Pagamento | Entrega | Comissão; quote → Condições | Aprovação | Resumo.
- **Main:** Items + Histórico. Cliente shown compactly in the grid or beside the stepper.

### Documento — both

- **Doc header:** GALLO BASE DIESEL · `#número` · datas (criado/atualizado) · status.
- **Parties grid:** Cliente (nome/doc/contato/endereço) | (order: Loja + Vendedor + condições | quote: Condições + Validade).
- **Items table:** full width (Peça/SKU, Qtd, Unit., Desc., Subtotal).
- **Totals:** right-aligned (Subtotal/Desconto/Frete/Total).
- **Footer:** validade/observações/notas internas; print-friendly. Switcher + back stay at top (not "printed").

## 8. KPI Definitions

All over the single loaded record; tone drives color.

**Order — 5 cells**
| Cell | value | sub | tone |
|---|---|---|---|
| Pagamento | `paymentStatus` label | `R$ total` (or "a receber" when pendente/parcial/vencido) | pago→good · vencido→bad · pendente/parcial→warn |
| Entrega | `fulfillmentStatus` label | relative time of latest event (enviado/entregue) or "—" | entregue→good · devolvido/cancelado→bad · separacao/pendente→warn |
| Itens | `Σ quantity` + " peças" | `items.length` + " linhas" | default |
| Comissão | calculated total if `hasCommission`, else preview `estimatedCommission`, else "—" | "calculada" / "estimada" / "—" | default |
| Criado | "há N dias" from `createdAt` | formatted `createdAt` | default |

**Quote — 5 cells**
| Cell | value | sub | tone |
|---|---|---|---|
| Validade | "Vence em Nd" / "Vencido" / "Válido" (reuse validity-bucket logic from list filters) | formatted `validUntil` | expired→bad · critical/warning→warn · else good |
| Itens | `Σ quantity` + " peças" | `items.length` + " linhas" | default |
| Desconto | `R$ discount` | "% do subtotal" | requiresApproval→warn · else default |
| Aprovação | "Pendente" / "Aprovado" / "Não requer" | approver/date when available | pendente→warn · aprovado→good · else default |
| Criado | "há N dias" from `createdAt` | formatted `createdAt` | default |

(Exact labels/edge cases finalized in the plan; user may tweak the KPI set during spec review.)

## 9. Status Steppers (Operacional)

**Quote:** `rascunho → enviado → aceito → convertido`. Map `quote.status` to the current step. Off-path terminal states render via `terminal`: `recusado` (rose), `expirado` (amber).

**Order:** `aguardando_pagamento → pago_aguardando_envio → em_separacao → enviado → entregue → concluido`. Map `computeOrderStatus(order)` (the `agg`) to the current step. Off-path terminal: `cancelado` (rose, from `canceledAt`), `devolvido` (amber).

## 10. Header & Switcher

Every layout begins with a header row:

- **Left:** "‹ Voltar à listagem" (existing back navigation).
- **Right:** `DetailLayoutSwitcher` (segmented; icon + label hidden under `sm`).

Placement mirrors the vehicle detail header and the list pages.

## 11. Styling

- Semantic tokens only (D6). Tone palette: `emerald` (good), `amber` (warn), `rose`/`text-destructive` (bad), `blue`/`violet` for informational badges — matching existing `QuoteStatusBadge`/`OrderStatusBadge`/origin badges.
- Wide container: `mx-auto w-full max-w-[1600px] p-4 md:p-6` for Cockpit/Operacional; Documento centers to `max-w-3xl`.
- Rail sticky: `lg:sticky lg:top-4 lg:self-start`. On `< lg`, rail stacks under main.
- KPI grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, `gap-px bg-border` cell pattern (mirrors `ListStatStrip`).
- Respect `prefers-reduced-motion`; transitions 150–300ms; focus-visible rings on switcher/actions.

## 12. Preserve-Behavior Checklist (regression gate)

**Quote:** send / accept / reject / cancel-send / convert-to-order / duplicate / WhatsApp share / approve / reject-approval; permission gates (`canApprove`, `canEdit`, owner check); SDR banner (+ "Ver conversa"); approval banner; all `AlertDialog` confirmations; reject reason textarea; audit logging on every action; navigation (Abrir ficha, Ver pedido, duplicate→navigate); loading skeleton + not-found error states.

**Order:** markPaid / startFulfillment / ship / deliver / return / generate-NF / cancel / refund / apply-item-to-vehicle; permission gates (`canActOnOrder`, `cancellable`, `isManagerOrOwner`); cancellation banner; "Orçamento de origem" link; e-commerce status notifications (`notifyStatus`); commission (calculated vs preview); all `OrderActionDialogs`; loading + not-found states.

The page rewrites only **re-arrange** existing JSX into blocks/shells — handlers, queries, dialogs and effects are moved verbatim, not rewritten.

## 13. Component Inventory

**New — shared (8):** `config.ts`, `useDetailLayout.ts`, `DetailLayoutSwitcher.tsx`, `DetailStatStrip.tsx`, `StatusStepper.tsx`, `DetailCard.tsx`, `LayoutShells.tsx`, `index.ts`.
**New — quote:** `utils/quoteDetailStats.ts` + `components/detail/` blocks.
**New — order:** `utils/orderDetailStats.ts` + `components/detail/` blocks.
**Modified:** `QuoteDetailPage.tsx`, `OrderDetailPage.tsx`.

## 14. Phasing

1. **Shared framework** — config, hook, switcher, stat strip, stepper, card, shells, barrel.
2. **Quote detail** — stats/stepper utils → blocks → page rewrite (3 layouts).
3. **Order detail** — stats/stepper utils → blocks → page rewrite (3 layouts).
4. **Verify + version bump** — `tsc --noEmit` (touched files clean) + `bun run build`; bump MINOR to **v0.53.0** with a new codename (suggestion: **"Dossier"**), update CHANGELOG.md + CLAUDE.md.

## 15. Out of Scope

Real PDF generation; new metrics needing new data/queries; list-page changes; backend/provider changes; introducing a test runner.

## 16. Per-task Verification Gate (carried from list-views)

For each touched file set: `bunx prettier --write <files>` → `bunx eslint <files>` (exit 0) → `bunx tsc --noEmit 2>&1 | grep -F <touched-files>` (expect **no output** — baseline `tsc` has unrelated pre-existing errors). `bun run build` (✓ built) at phase ends only. `vite build` does **not** type-check.
