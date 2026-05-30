# Vehicle Detail Page Redesign — Design Doc

- **Date:** 2026-05-30
- **Topic:** Redesign da página de detalhamento do veículo (`/app/veiculos/$id`)
- **Status:** Approved (brainstorming) — pending spec review
- **Related:** mirrors the customer detail redesign (v0.49.0 `Spotlight`); same anatomy, vehicle-specific identity.

---

## 1. Context & Problem

The vehicle detail page (`src/features/vehicles/pages/VehicleDetailPage.tsx`) has the same problems the customer detail page had before its redesign:

- **Too much side margin** — content is capped at `max-w-7xl` (1280px); on wide screens it wastes lateral space.
- **Flat organization** — a single technical stat row (engine/VIN/plate/km/created) + an 8/4 two-column body. No actionable KPI strip, no visual hierarchy that surfaces what matters commercially.
- **Information-thin** — the page under-uses the data already available (service history, km, maintenance rules) and offers no fleet context or consumption insight.

GALLO positions itself as the **commercial brain above the ERP**. Each vehicle is an opportunity generator (parts + service). The redesign reframes the page from a static record into an **actionable, insight-rich** view — while keeping the established visual language of the customer page so the product feels coherent.

## 2. Goals / Non-Goals

**Goals**

1. Widen to the established **1600px** rail (header full-bleed, inner content centered).
2. Add a **5-cell KPI strip** of actionable indicators at the top.
3. **Enrich** with four new blocks: KM-evolution chart, vehicle-health score, owner's fleet, most-replaced-parts ranking.
4. Offer **three layout modes** the user switches between — **Saúde (A, default)**, **Trilhos (B)**, **Bento (C)** — via a segmented control in the header, persisted globally.
5. **Hybrid structure**: insight-focused bento on top + a tabbed area below for long content (full service history).
6. Reuse existing components/providers; **no backend changes** (all derivations from current `IVehicle` data).
7. Preserve all current behavior: edit, add service, approve/reject, km inline edit, status banner, audit logging.

**Non-Goals**

- No new data model fields, no provider/API changes.
- No real "compatible parts" data — `CompatiblePartsPlaceholder` stays a PRD-030 placeholder.
- No changes to the vehicles **list** page.
- The "Criar orçamento" shortcut on recommendations stays a PRD-031 placeholder (toast), unchanged.

## 3. Requirements (decisions captured in brainstorming)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Visual consistency with customer page | **Same base, own identity** (focus on maintenance/health/fleet) |
| 2 | KPI strip cells | **KM atual · Próxima manutenção · Manutenções vencidas · Última visita · Uso (km/ano)** |
| 3 | New enrichment blocks | **KM-evolution chart · Vehicle-health score · Owner fleet · Most-replaced parts** (all four) |
| 4 | Content structure | **Hybrid** — main bento + tabs only for long content |
| 5 | Layout choice | **Keep all 3 as user-selectable view modes; A is default** |
| 6 | Switcher form/placement | **Segmented control in the header** (always visible, 1-click) |
| 7 | Preference persistence | **Global** (localStorage, applies to all vehicles), default A |

## 4. Architecture

### 4.1 Layout-mode state & persistence

A small, theme-style localStorage-backed preference.

- **`src/features/vehicles/config/layout.ts`** (new)
  - `export type VehicleDetailLayout = "health" | "rails" | "bento";`
  - `export const VEHICLE_DETAIL_LAYOUTS: VehicleDetailLayout[] = ["health", "rails", "bento"];`
  - `export const DEFAULT_VEHICLE_DETAIL_LAYOUT: VehicleDetailLayout = "health";`
  - `export const VEHICLE_LAYOUT_STORAGE_KEY = "gallo-vehicle-detail-layout";`
- **`src/features/vehicles/hooks/useVehicleDetailLayout.ts`** (new)
  - Returns `[layout, setLayout]`. Reads localStorage on init (SSR-safe `typeof window` guard; invalid/missing → default `health`). Writes on change. Same lightweight pattern as `useTheme`/theme persistence. No React context needed — single consumer (the page).

### 4.2 Page composition

**`VehicleDetailPage.tsx`** (modified) keeps its root `flex min-h-full flex-col bg-background` (the double-scrollbar fix from v0.49.1 stays). New structure:

```
<div flex min-h-full flex-col bg-background>
  <VehicleDetailHeader … layout onLayoutChange />        // full-bleed, 1600 inner rail, switcher
  <div mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6>
    <VehicleStatusBanner … />                             // unchanged, only when pendente/rejeitado
    <VehicleStatStrip vehicle now />                      // 5 KPI cells (always)
    {layout === "health" && <VehicleLayoutHealth … />}
    {layout === "rails"  && <VehicleLayoutRails … />}
    {layout === "bento"  && <VehicleLayoutBento … />}
    <VehicleHistorySection ref … />                       // tabbed long-content area (full history)
  </div>
  {/* modals unchanged: EditVehicleModal, AddServiceEntryModal, reject AlertDialog */}
</div>
```

- All handlers (`handleApprove`, `handleReject`, edit/service modal open state, `detail.invalidate`) stay on the page exactly as today.
- The three layout components receive `vehicle`, `now`, and `onSeeFullHistory` (scrolls to + focuses the history section). They only **arrange** cards; they hold no business logic.
- `now` is computed once per render (`new Date()`) and threaded down so all time-based derivations are consistent.

### 4.3 Loading / error / not-found

Unchanged behavior. Loading skeleton becomes layout-agnostic (a header skeleton + KPI strip skeleton + generic card blocks). Not-found and the missing-vehicle states stay as today.

## 5. Component Inventory

### 5.1 New — switcher
- **`components/detail/VehicleLayoutSwitcher.tsx`**
  - Props: `{ value: VehicleDetailLayout; onChange: (l: VehicleDetailLayout) => void }`.
  - Segmented control (shadcn `ToggleGroup type="single"`, or styled buttons) with 3 items: Saúde / Trilhos / Bento, each with an Iconify icon (`mdi:heart-pulse`, `mdi:view-split-vertical`, `mdi:view-grid-outline`) + label.
  - a11y: `role="group"` with `aria-label`, each button `aria-pressed`, visible focus ring, `cursor-pointer`. Labels are text (not icon-only) — but icons aid scanning.
  - Responsive: on narrow widths, collapse labels to icons (tooltips carry the name).

### 5.2 New — shared building blocks (mode-agnostic, composed differently per layout)
- **`components/detail/VehicleStatStrip.tsx`** — 5 KPI cells. Mirrors `CustomerStatStrip` (`grid grid-cols-2 gap-px bg-border … lg:grid-cols-5`, semantic tokens). Cells: KM atual, Próxima manutenção (km restantes + rule label), Manutenções vencidas (count; amber/destructive accent when > 0), Última visita (date + "há Xd"), Uso (km/ano). Props `{ vehicle; now }`.
- **`components/detail/VehicleHealthCard.tsx`** — SVG ring/gauge showing `score%`, colored by status token (ok=emerald, attention=amber, overdue=destructive). Center: score + status label; below: "X vencidas · Y a vencer". Props `{ vehicle }`. Static (no animation, or `prefers-reduced-motion`-respecting CSS only).
- **`components/detail/VehicleKmEvolutionCard.tsx`** — recharts `AreaChart` of km over time. Mirrors `CustomerPurchaseEvolutionCard` exactly: `isAnimationActive={false}`, stroke/fill via `var(--primary)`, fill ~20% opacity, typed tooltip formatter. Empty state when < 2 data points. Props `{ vehicle; now; className }`.
- **`components/detail/MostReplacedPartsCard.tsx`** — horizontal bar ranking (top 6) with count labels, descending. Uses semantic `bg-primary` bars over `bg-muted` track; pure CSS bars (no chart lib needed). Empty state when no parts. Props `{ vehicle }`.
- **`components/detail/OwnerFleetCard.tsx`** — `useQuery(["vehicle-owner-fleet", customerId], () => provider.listByCustomer(customerId))`, excludes the current vehicle id, lists up to N with plate/model/status + link to each `/app/veiculos/$id`. Empty state ("única unidade"). Props `{ customerId; currentVehicleId }`.

### 5.3 New — layout composers
- **`components/detail/layouts/VehicleLayoutHealth.tsx`** (A, default)
  - Hero `grid lg:grid-cols-12`: Health (col-3) · KmEvolution (col-6) · MaintenanceRecommendations (col-3).
  - Row 2 `grid lg:grid-cols-12`: ServiceHistory **summary** (col-8) · Owner + OwnerFleet (col-4).
  - Row 3 `grid lg:grid-cols-12`: MostReplacedParts (col-6) · TechSpecs + CompatibleParts (col-6).
- **`components/detail/layouts/VehicleLayoutRails.tsx`** (B, classic CRM)
  - Row 1: KmEvolution (col-8) · Health (col-4).
  - Main `grid lg:grid-cols-12`: left col-8 = ServiceHistory summary + MaintenanceRecommendations; right col-4 sticky aside = Owner + OwnerFleet + CompatibleParts.
  - Row 3: MostReplacedParts (col-6) · TechSpecs (col-6).
- **`components/detail/layouts/VehicleLayoutBento.tsx`** (C, modular)
  - A `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4` with `auto-rows` and varied `col-span`/`row-span`: Health (1×2) · KmEvolution (2×2) · Recommendations (1×2) · ServiceHistory summary (2×1) · Owner (1×1) · OwnerFleet (1×1) · MostReplacedParts (2×1) · TechSpecs (1×1) · CompatibleParts (1×1).
  - Responsive: collapses to single column on mobile (every tile `col-span-full`).
- Each composer accepts `{ vehicle; now; onSeeFullHistory }` and forwards `canEdit`/`onAddService` to the summary timeline where relevant.

### 5.4 New — long-content tabbed area
- **`components/detail/VehicleHistorySection.tsx`** — shadcn `Tabs`, default tab **"Histórico completo"** = full `ServiceHistoryTimeline` (all entries). Scaffolded to accept future tabs. `forwardRef` so the page/layouts can `scrollIntoView` when "ver tudo" is clicked. Props `{ vehicle; canEdit; onAddService }`.
  - **Note (refinement of approved mockup):** the bento tiles show a **summary** timeline (latest 3); the full chronological list lives here. The "ver tudo" affordance in the summary scrolls to this section. This is the only "long content", consistent with the hybrid decision.

### 5.5 Reused as-is (no edits)
`ServiceHistoryTimeline` (gains a `limit?` prop — see §8), `MaintenanceRecommendations`, `VehicleOwnerCard`, `VehicleTechSpecs`, `CompatiblePartsPlaceholder`, `VehicleStatusBanner`, `EditVehicleModal`, `AddServiceEntryModal`.

### 5.6 Modified
- **`VehicleDetailPage.tsx`** — width 1600, layout state wiring, new composition (see §4.2).
- **`VehicleDetailHeader.tsx`** — inner rail `max-w-[1600px]`; add `layout`/`onLayoutChange` props; render `VehicleLayoutSwitcher` in the actions cluster.
- **`ServiceHistoryTimeline.tsx`** — add optional `limit?: number` (summary mode shows `limit` latest entries + a "ver tudo" button when truncated). Full mode passes no limit. Backward compatible.
- **`i18n/pt-BR.ts`** — new strings (see §9).

## 6. Data Derivations (new utils — pure functions, unit-testable by reading)

- **`utils/kmSeries.ts`**
  - `buildKmSeries(vehicle, now)` → `{ label: string; km: number }[]` from service entries that have `km`, sorted ascending by date, plus a trailing "atual" point when `currentKm` is set. Returns `[]` when < 2 usable points.
  - `usagePerYear(vehicle, now)` → number | null. Prefer `(currentKm − earliestServiceKm) / yearsBetween(earliestServiceDate, now)`; fallback `currentKm / max(1, now.year − vehicle.year)`. `null` when not derivable.
- **`utils/vehicleHealth.ts`**
  - `computeHealth(vehicle)` → `{ score: number; status: "ok" | "attention" | "overdue"; overdueCount: number; upcomingCount: number }`.
  - Built on top of existing `computeRecommendations(vehicle)` (which returns rules due-soon or overdue). `overdueCount` = recs with `remainingKm <= 0`; `upcomingCount` = recs with `0 < remainingKm`. `score = clamp(100 − 20·overdueCount − 8·upcomingCount, 0, 100)`. `status` = `overdue` if `overdueCount > 0`, else `attention` if `upcomingCount > 0`, else `ok`. Constants centralized in the file.
- **`utils/partsRanking.ts`**
  - `rankParts(vehicle, topN = 6)` → `{ name: string; count: number }[]`, normalized (trim), counted, sorted desc, sliced. `[]` when none.
- **KPI helpers** (in `utils/vehicleKpis.ts` or co-located):
  - `lastServiceAt(vehicle)` / `daysSince(date, now)`; `nextMaintenance(vehicle)` → smallest positive `remainingKm` + rule label (or "vencida" when only overdue exist); `overdueCount` reused from `computeHealth`.

## 7. Visual / Token Guidelines (from ui-ux-pro-max review + project rules)

- **Semantic tokens only** — `bg-background`, `bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-destructive`. **Never** raw hex or `--gallo-*`.
- **Health states** — emerald (ok), amber (attention), destructive (overdue). Reuse the existing amber/destructive treatment already used in `MaintenanceRecommendations` and `VehicleStatusBanner` for consistency. **Color is never the only signal** — always pair with an icon + text label (a11y).
- **Charts in dark mode** — line/area uses `var(--primary)`; fill ~20% opacity; grid lines low-contrast (`var(--border)`); tooltip on `bg-popover`. No glow beyond a subtle one; `isAnimationActive={false}` to match the customer chart and avoid the "excessive animation" anti-pattern.
- **Ranking bars** — descending, value labels visible, `bg-primary` fill over `bg-muted` track.
- **Density** — generous `gap`/padding to avoid clutter (the main dense-detail-page pitfall). Each tile has a clear label header. Bento mode collapses to one column on mobile.
- **Interaction** — `cursor-pointer` on all clickable cards/links; hover via color/border transitions (150–300ms), never scale that shifts layout; visible focus rings.

## 8. Backward Compatibility & Risk

- `ServiceHistoryTimeline` change is **additive** (optional `limit`), default behavior unchanged.
- No provider/contract/type changes. `listByCustomer` already exists.
- Existing audit-logged mutations (km update, approve, reject, add service) are untouched.
- Risk: layout-mode flicker before localStorage read. Mitigation: the hook reads synchronously on first render (lazy `useState` initializer), so the correct layout paints first — no FOUC.
- Risk: empty data (no service history / no km). Every new block has an explicit empty state; KPIs degrade to "—".

## 9. i18n (pt-BR, correct accents)

Add under `VEHICLE_STRINGS.detail`:
- `layout`: `{ ariaLabel: "Escolher layout", health: "Saúde", rails: "Trilhos", bento: "Bento", healthHint, railsHint, bentoHint }`
- `statStrip`: `{ currentKm: "KM atual", nextMaintenance: "Próxima manutenção", overdue: "Manutenções vencidas", lastVisit: "Última visita", usage: "Uso", usageUnit: "km/ano", daysAgo: (n) => …, noVisit: "Sem visitas" }`
- `health`: `{ title: "Saúde do veículo", ok: "Em dia", attention: "Atenção", overdue: "Vencido", summary: (o, u) => `${o} vencidas · ${u} a vencer` }`
- `kmEvolution`: `{ title: "Evolução de KM", empty: "Sem dados suficientes de quilometragem." }`
- `parts`: `{ title: "Peças mais trocadas", empty: "Nenhuma peça registrada ainda." }`
- `fleet`: `{ title: "Frota do proprietário", empty: "Única unidade deste cliente.", seeVehicle: "Ver veículo" }`
- `history`: add `seeAll: "Ver histórico completo"`, `fullTab: "Histórico completo"`.

All user-facing; English only in code identifiers.

## 10. Accessibility

- Switcher: keyboard-operable, `aria-pressed`, focus rings, labels.
- Health ring: `role="img"` with `aria-label` summarizing score + status; numeric text always present.
- Charts: provide an accessible summary (aria-label) since canvas/SVG charts aren't readable; KPI strip already conveys the headline numbers as text.
- Tap targets ≥ 40px; `prefers-reduced-motion` respected (panel slide/transitions gated).

## 11. Verification Plan (no test runner in project)

- `bun run build` (Vite + `tsc --noEmit`) must pass.
- `bunx eslint` on all touched/new files clean; `bunx prettier --write` before commit (CRLF guard).
- Manual UI validation by the user (per their workflow): switch A/B/C, reload to confirm persistence, check a vehicle with rich history vs. an empty one, confirm single scrollbar (the v0.49.1 fix holds), light/dark + each theme.
- Self-check: no raw hex / `--gallo-*` in new components; all clickable elements have `cursor-pointer`; every new block has an empty state.

## 12. Out of Scope / Future

- Real compatible-parts data (PRD-030) and quote creation (PRD-031).
- Additional history-area tabs (e.g., documents, costs) — the tabbed section is scaffolded for them.
- Per-vehicle layout memory (explicitly rejected in favor of global).

## 13. File-Change Summary

**New (16):** `config/layout.ts`, `hooks/useVehicleDetailLayout.ts`, `components/detail/VehicleLayoutSwitcher.tsx`, `VehicleStatStrip.tsx`, `VehicleHealthCard.tsx`, `VehicleKmEvolutionCard.tsx`, `MostReplacedPartsCard.tsx`, `OwnerFleetCard.tsx`, `VehicleHistorySection.tsx`, `layouts/VehicleLayoutHealth.tsx`, `layouts/VehicleLayoutRails.tsx`, `layouts/VehicleLayoutBento.tsx`, plus utils `kmSeries.ts` / `vehicleHealth.ts` / `partsRanking.ts` / `vehicleKpis.ts`.

**Modified (4):** `pages/VehicleDetailPage.tsx`, `components/detail/VehicleDetailHeader.tsx`, `components/detail/ServiceHistoryTimeline.tsx` (additive `limit`), `i18n/pt-BR.ts`.

**Unchanged behavior preserved:** all mutations, modals, status banner, km inline edit, route, list page.
