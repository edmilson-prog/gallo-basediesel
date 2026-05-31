# Detail Views Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the narrow centered-column Quote-detail and Order-detail pages with a wide bento offering 3 user-selectable layouts (Cockpit default · Operacional · Documento), switched via a segmented header control and persisted per page — preserving 100% of existing behavior.

**Architecture:** A new domain-agnostic framework `src/shared/detail-views/` (parallel to the shipped `src/shared/list-views/`) provides the layout config, persistence hook, segmented switcher, KPI strip, status stepper, card primitive, and 3 layout shells, plus 3 domain-agnostic blocks reused by both pages (summary, customer, history). Each page computes its KPIs/stepper/blocks once and slots them into the active shell. All hooks, queries, handlers, dialogs and permission gates stay verbatim — only the render layer changes.

**Tech Stack:** React 19, TanStack Router, TanStack Query, Tailwind CSS v4, shadcn/ui (new-york), Iconify (`@iconify/react`), bun.

**Spec:** `docs/superpowers/specs/2026-05-30-detail-views-redesign-design.md`

---

## Conventions (read before any task)

**Verification gate (per task — there is NO test runner):**
1. `bunx prettier --write <touched files>`
2. `bunx eslint <touched files>` → must exit 0 (no errors)
3. `bunx tsc --noEmit 2>&1 | grep -F <each touched file>` → must print **nothing**. The baseline `tsc` has many *pre-existing* errors in unrelated files (about/, cashflow/, commissions/, orders/api/createOrderFromCart.ts) — only regressions in files **you touched** count.
4. At the **end of each phase**: `bun run build` → must print `✓ built`. (`vite build` does NOT type-check; that's why step 3 exists.)

**Token rules (hard):**
- Components consume **only semantic tokens**: `bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary`, `text-primary-foreground`, `text-destructive`. Never raw hex or `--gallo-*`.
- Status/tone colors use the established Tailwind palette already used by the badges: `emerald` (good), `amber` (warn), `rose` / `text-destructive` (bad). Always pair light+dark (`text-emerald-600 dark:text-emerald-400`).

**TypeScript:** `strict` + `noUncheckedIndexedAccess`. Array index access yields `T | undefined` (guard or `?? fallback`); `Record<Union, V>` keyed by the exact union yields `V`. Prefix domain interfaces with `I`. No `any`.

**Preserve-behavior rule:** The two page rewrites only **re-arrange** existing JSX into blocks/shells. Every hook, `useQuery`, state, handler (`handleSend`…, `wrap`, `notifyStatus`…), effect, dialog and the loading/error early-returns are kept **verbatim**. If a step says "preserve", copy the code exactly from the current file — do not rewrite it.

**Commit:** Conventional Commits in English, one per task. End each commit message with:
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

---

## Phase 1 — Shared framework (`src/shared/detail-views/`)

### Task 1: Layout config + persistence hook

**Files:**
- Create: `src/shared/detail-views/config.ts`
- Create: `src/shared/detail-views/useDetailLayout.ts`

- [ ] **Step 1: Write `config.ts`**

```ts
/** A selectable layout for the commercial detail pages (quote, order). */
export type DetailLayout = "cockpit" | "operational" | "document";

export const DETAIL_LAYOUTS: readonly DetailLayout[] = [
  "cockpit",
  "operational",
  "document",
] as const;

export const DEFAULT_DETAIL_LAYOUT: DetailLayout = "cockpit";

/** localStorage keys — one per detail page, so each remembers its own view. */
export const QUOTE_DETAIL_LAYOUT_KEY = "gallo-quote-detail-layout";
export const ORDER_DETAIL_LAYOUT_KEY = "gallo-order-detail-layout";

export const DETAIL_LAYOUT_LABELS: Record<DetailLayout, string> = {
  cockpit: "Cockpit",
  operational: "Operacional",
  document: "Documento",
};

export const DETAIL_LAYOUT_ICONS: Record<DetailLayout, string> = {
  cockpit: "mdi:view-dashboard-outline",
  operational: "mdi:cog-sync-outline",
  document: "mdi:file-document-outline",
};

export const DETAIL_LAYOUT_HINTS: Record<DetailLayout, string> = {
  cockpit: "Visão geral com KPIs e trilho lateral",
  operational: "Fluxo de status, ações e blocos operacionais",
  document: "Formato de documento para conferir e imprimir",
};
```

- [ ] **Step 2: Write `useDetailLayout.ts`**

```ts
import { useCallback, useState } from "react";
import { DEFAULT_DETAIL_LAYOUT, DETAIL_LAYOUTS, type DetailLayout } from "./config";

function readLayout(storageKey: string): DetailLayout {
  if (typeof window === "undefined") return DEFAULT_DETAIL_LAYOUT;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw && (DETAIL_LAYOUTS as readonly string[]).includes(raw)) {
      return raw as DetailLayout;
    }
  } catch {
    // localStorage indisponível — usa o padrão.
  }
  return DEFAULT_DETAIL_LAYOUT;
}

/**
 * Selected detail layout persisted to localStorage under `storageKey`.
 * Synchronous read in the lazy initializer avoids any flash of the default.
 */
export function useDetailLayout(
  storageKey: string,
): [DetailLayout, (layout: DetailLayout) => void] {
  const [layout, setLayoutState] = useState<DetailLayout>(() => readLayout(storageKey));

  const setLayout = useCallback(
    (next: DetailLayout) => {
      setLayoutState(next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // Preferência apenas em memória nesta sessão.
      }
    },
    [storageKey],
  );

  return [layout, setLayout];
}
```

- [ ] **Step 3: Gate** — `bunx prettier --write src/shared/detail-views/config.ts src/shared/detail-views/useDetailLayout.ts` → `bunx eslint` those two (exit 0) → `bunx tsc --noEmit 2>&1 | grep -F detail-views/config` and `…/useDetailLayout` (no output). Commit: `feat: add detail-views layout config + persistence hook`.

---

### Task 2: DetailLayoutSwitcher

**Files:**
- Create: `src/shared/detail-views/DetailLayoutSwitcher.tsx`

- [ ] **Step 1: Write the component** (mirrors the shipped `ListLayoutSwitcher`)

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import {
  DETAIL_LAYOUTS,
  DETAIL_LAYOUT_HINTS,
  DETAIL_LAYOUT_ICONS,
  DETAIL_LAYOUT_LABELS,
  type DetailLayout,
} from "./config";

export interface IDetailLayoutSwitcherProps {
  value: DetailLayout;
  onChange: (layout: DetailLayout) => void;
}

/** Segmented control to switch a detail page's layout. Mirrors ListLayoutSwitcher. */
export function DetailLayoutSwitcher({ value, onChange }: IDetailLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as DetailLayout);
      }}
      variant="outline"
      size="sm"
      aria-label="Escolher visualização da ficha"
    >
      {DETAIL_LAYOUTS.map((layout) => (
        <ToggleGroupItem
          key={layout}
          value={layout}
          aria-label={DETAIL_LAYOUT_LABELS[layout]}
          title={DETAIL_LAYOUT_HINTS[layout]}
        >
          <Icon icon={DETAIL_LAYOUT_ICONS[layout]} size={16} />
          <span className="ml-1 hidden sm:inline">{DETAIL_LAYOUT_LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 2: Gate + commit** `feat: add DetailLayoutSwitcher segmented control`.

---

### Task 3: DetailStatStrip

**Files:**
- Create: `src/shared/detail-views/DetailStatStrip.tsx`

- [ ] **Step 1: Write the component** (3-line cells: label / value / sub; mirrors `ListStatStrip`'s hairline grid)

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

export type StatTone = "default" | "good" | "warn" | "bad";

export interface IDetailStat {
  label: string;
  /** Pre-formatted value (status, R$, count). */
  value: ReactNode;
  /** Optional secondary line (date, "estimada", "% do subtotal"). */
  sub?: ReactNode;
  tone?: StatTone;
  /** Iconify name (mdi:*). */
  icon?: string;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

/** Column count per cell-count, kept static so Tailwind can see the classes. */
const COLS: Record<number, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

export interface IDetailStatStripProps {
  stats: IDetailStat[];
  className?: string;
}

/** Full-width KPI strip for detail pages. Hairline cells (gap-px on bg-border). */
export function DetailStatStrip({ stats, className }: IDetailStatStripProps) {
  const cols = COLS[stats.length] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-lg bg-border", cols, className)}>
      {stats.map((s) => (
        <div key={s.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {s.icon && <Icon icon={s.icon} size={11} />}
            {s.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-base font-semibold tabular-nums",
              TONE_CLASS[s.tone ?? "default"],
            )}
          >
            {s.value}
          </dd>
          {s.sub != null && (
            <dd className="text-[11px] tabular-nums text-muted-foreground">{s.sub}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Gate + commit** `feat: add DetailStatStrip KPI strip`.

---

### Task 4: StatusStepper

**Files:**
- Create: `src/shared/detail-views/StatusStepper.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

export interface IStepperStep {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
}

export interface IStepperTerminal {
  label: string;
  tone: "bad" | "warn";
}

export interface IStatusStepperProps {
  steps: IStepperStep[];
  /** Off-path terminal state (canceled/returned/rejected/expired) — replaces the track. */
  terminal?: IStepperTerminal | null;
  className?: string;
}

/** Horizontal status stepper. When `terminal` is set, shows a single off-path callout. */
export function StatusStepper({ steps, terminal, className }: IStatusStepperProps) {
  if (terminal) {
    const tone =
      terminal.tone === "bad"
        ? "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300"
        : "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300";
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border p-3 text-sm font-medium",
          tone,
          className,
        )}
      >
        <Icon icon="mdi:flag-checkered" size={18} />
        {terminal.label}
      </div>
    );
  }
  return (
    <ol className={cn("flex items-center", className)}>
      {steps.map((step, i) => (
        <li key={step.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                step.state === "done" && "border-primary bg-primary text-primary-foreground",
                step.state === "current" && "border-primary text-primary ring-2 ring-primary/30",
                step.state === "todo" && "border-border text-muted-foreground",
              )}
            >
              {step.state === "done" ? <Icon icon="mdi:check" size={13} /> : i + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-xs font-medium",
                step.state === "todo" ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <span
              className={cn("mx-2 h-px flex-1", step.state === "done" ? "bg-primary" : "bg-border")}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Gate + commit** `feat: add StatusStepper`.

---

### Task 5: DetailCard + shared blocks (summary, customer, history)

**Files:**
- Create: `src/shared/detail-views/DetailCard.tsx`
- Create: `src/shared/detail-views/DetailSummaryCard.tsx`
- Create: `src/shared/detail-views/DetailCustomerCard.tsx`
- Create: `src/shared/detail-views/DetailHistory.tsx`

- [ ] **Step 1: Write `DetailCard.tsx`** (Card + section header with optional right action)

```tsx
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export interface IDetailCardProps {
  icon: string;
  title: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function DetailCard({ icon, title, action, className, children }: IDetailCardProps) {
  return (
    <Card className={cn("p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon icon={icon} size={16} className="text-muted-foreground" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </Card>
  );
}
```

- [ ] **Step 2: Write `DetailSummaryCard.tsx`** (subtotal/desconto/frete/total — identical for quote & order)

```tsx
import { formatBRL } from "@/shared/utils/format";
import { DetailCard } from "./DetailCard";

export interface IDetailSummaryCardProps {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
}

export function DetailSummaryCard({ subtotal, discount, shipping, total }: IDetailSummaryCardProps) {
  return (
    <DetailCard icon="mdi:cash-multiple" title="Resumo">
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatBRL(subtotal)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Desconto</dt>
          <dd className="tabular-nums">-{formatBRL(discount)}</dd>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <dt>Frete</dt>
          <dd className="tabular-nums">+{formatBRL(shipping)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatBRL(total)}</dd>
        </div>
      </dl>
    </DetailCard>
  );
}
```

- [ ] **Step 3: Write `DetailCustomerCard.tsx`** (`name` resolved by the page; card stays domain-agnostic)

```tsx
import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { DetailCard } from "./DetailCard";

export interface IDetailCustomerCardProps {
  customer: ICustomer | undefined;
  /** Display name resolved by the caller (B2B fantasia/razão vs B2C fullName). */
  name: string;
  deliveryAddress?: ICustomerAddress;
  onOpenFicha: () => void;
}

export function DetailCustomerCard({
  customer,
  name,
  deliveryAddress,
  onOpenFicha,
}: IDetailCustomerCardProps) {
  if (!customer) {
    return (
      <DetailCard icon="mdi:account-outline" title="Cliente">
        <p className="text-xs text-muted-foreground">Cliente não encontrado.</p>
      </DetailCard>
    );
  }
  return (
    <DetailCard
      icon="mdi:account-outline"
      title="Cliente"
      action={
        <Button size="sm" variant="outline" onClick={onOpenFicha}>
          <Icon icon="mdi:account-eye-outline" size={14} /> Abrir ficha
        </Button>
      }
    >
      <p className="text-sm font-semibold text-foreground">{name}</p>
      <p className="text-xs text-muted-foreground">
        {customer.type === "B2B" ? `CNPJ ${customer.cnpj}` : `CPF ${customer.cpf}`}
        {" · "}
        {customer.phone}
        {customer.email && <> · {customer.email}</>}
      </p>
      {deliveryAddress && (
        <p className="mt-2 text-xs text-muted-foreground">
          <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
          {deliveryAddress.street}, {deliveryAddress.number} — {deliveryAddress.district},{" "}
          {deliveryAddress.city}/{deliveryAddress.state}
        </p>
      )}
    </DetailCard>
  );
}
```

- [ ] **Step 4: Write `DetailHistory.tsx`** (audit timeline; `describeAction` injected by the page)

```tsx
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { formatDateTimeBR } from "@/shared/utils/format";
import { DetailCard } from "./DetailCard";

/** Structural shape of an audit entry — avoids coupling to the exact audit type. */
export interface IDetailHistoryEntry {
  id: string;
  action: string;
  timestamp: string;
  actorId: string;
}

export interface IDetailHistoryProps {
  audits: IDetailHistoryEntry[];
  describeAction: (action: string) => string;
  footer?: ReactNode;
}

export function DetailHistory({ audits, describeAction, footer }: IDetailHistoryProps) {
  return (
    <DetailCard icon="mdi:history" title="Histórico">
      {audits.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem eventos registrados ainda.</p>
      ) : (
        <ol className="space-y-2">
          {audits.map((a) => (
            <li key={a.id} className="flex items-start gap-3 border-l-2 border-border pl-3 text-xs">
              <Icon icon="mdi:circle-medium" size={14} className="-ml-[18px] mt-0.5 text-primary" />
              <div className="flex-1">
                <p className="font-medium text-foreground">{describeAction(a.action)}</p>
                <p className="text-muted-foreground">
                  {formatDateTimeBR(a.timestamp)} · {a.actorId}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {footer}
    </DetailCard>
  );
}
```

- [ ] **Step 5: Gate + commit** `feat: add DetailCard + shared summary/customer/history blocks`.

---

### Task 6: Layout shells + barrel

**Files:**
- Create: `src/shared/detail-views/LayoutShells.tsx`
- Create: `src/shared/detail-views/index.ts`

- [ ] **Step 1: Write `LayoutShells.tsx`**

```tsx
import type { ReactNode } from "react";

/**
 * Cockpit: header row · hero · KPI strip · grid[ main (2/3) | sticky rail (1/3) ].
 * Wide container (max 1600px). On < lg the rail stacks under main.
 */
export function CockpitShell({
  header,
  hero,
  kpis,
  main,
  rail,
}: {
  header: ReactNode;
  hero: ReactNode;
  kpis: ReactNode;
  main: ReactNode;
  rail: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-6">
      {header}
      {hero}
      {kpis}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">{main}</div>
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">{rail}</aside>
      </div>
    </div>
  );
}

/**
 * Operacional: header · hero · [stepper + action zone] · responsive grid of
 * operational cards · main (items + history).
 */
export function OperationalShell({
  header,
  hero,
  stepper,
  actions,
  grid,
  main,
}: {
  header: ReactNode;
  hero: ReactNode;
  stepper: ReactNode;
  actions: ReactNode;
  grid: ReactNode;
  main: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4 md:p-6">
      {header}
      {hero}
      <div className="space-y-4 rounded-lg border border-border bg-card p-4">
        {stepper}
        {actions}
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{grid}</div>
      <div className="space-y-4">{main}</div>
    </div>
  );
}

/**
 * Documento: header (back + switcher, not "printed") · centered document
 * (header · parties · items · totals right · footer).
 */
export function DocumentShell({
  header,
  docHeader,
  parties,
  items,
  totals,
  footer,
}: {
  header: ReactNode;
  docHeader: ReactNode;
  parties: ReactNode;
  items: ReactNode;
  totals: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 md:p-8">
      {header}
      <div className="space-y-6 rounded-lg border border-border bg-card p-6 md:p-8">
        {docHeader}
        {parties}
        {items}
        <div className="flex justify-end">{totals}</div>
        {footer}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `index.ts` (barrel)**

```ts
export {
  type DetailLayout,
  DETAIL_LAYOUTS,
  DEFAULT_DETAIL_LAYOUT,
  QUOTE_DETAIL_LAYOUT_KEY,
  ORDER_DETAIL_LAYOUT_KEY,
  DETAIL_LAYOUT_LABELS,
  DETAIL_LAYOUT_ICONS,
  DETAIL_LAYOUT_HINTS,
} from "./config";
export { useDetailLayout } from "./useDetailLayout";
export { DetailLayoutSwitcher, type IDetailLayoutSwitcherProps } from "./DetailLayoutSwitcher";
export { DetailStatStrip, type IDetailStat, type IDetailStatStripProps, type StatTone } from "./DetailStatStrip";
export {
  StatusStepper,
  type IStepperStep,
  type IStepperTerminal,
  type IStatusStepperProps,
} from "./StatusStepper";
export { DetailCard, type IDetailCardProps } from "./DetailCard";
export { DetailSummaryCard, type IDetailSummaryCardProps } from "./DetailSummaryCard";
export { DetailCustomerCard, type IDetailCustomerCardProps } from "./DetailCustomerCard";
export {
  DetailHistory,
  type IDetailHistoryEntry,
  type IDetailHistoryProps,
} from "./DetailHistory";
export { CockpitShell, OperationalShell, DocumentShell } from "./LayoutShells";
```

- [ ] **Step 3: Gate** the two files, then **`bun run build`** (`✓ built`). Commit: `feat: add detail-views layout shells + barrel`.

---

## Phase 2 — Quote detail (`/app/orcamentos/$id`)

### Task 7: Quote KPI + stepper derivation

**Files:**
- Create: `src/features/quotes/utils/quoteDetailStats.ts`

- [ ] **Step 1: Write the file**

```ts
import type { IQuote } from "@/shared/types";
import type { IDetailStat, IStepperStep, IStepperTerminal, StatTone } from "@/shared/detail-views";
import { formatBRL, formatDateBR, formatPercent, formatRelativeTimeBR } from "@/shared/utils/format";
import { daysUntil, validityBucket } from "./quoteTotals";

const sumQty = (q: IQuote): number => q.items.reduce((acc, it) => acc + it.quantity, 0);

/** The 5 KPI cells for the quote detail page. `now` injected for deterministic validity. */
export function quoteDetailStats(quote: IQuote, now: Date): IDetailStat[] {
  const bucket = validityBucket(quote.validUntil, now);
  const days = daysUntil(quote.validUntil, now);
  const validityValue =
    bucket === "expired" ? "Vencido" : days <= 3 ? `Vence em ${days}d` : "Válido";
  const validityTone: StatTone =
    bucket === "expired" ? "bad" : bucket === "critical" || bucket === "warning" ? "warn" : "good";

  const discountShare = quote.subtotal > 0 ? quote.discount / quote.subtotal : null;

  const approvalValue = quote.requiresApproval
    ? "Pendente"
    : quote.approvedAt
      ? "Aprovado"
      : "Não requer";
  const approvalTone: StatTone = quote.requiresApproval
    ? "warn"
    : quote.approvedAt
      ? "good"
      : "default";

  const lineCount = quote.items.length;

  return [
    {
      icon: "mdi:clock-outline",
      label: "Validade",
      value: validityValue,
      sub: formatDateBR(quote.validUntil),
      tone: validityTone,
    },
    {
      icon: "mdi:format-list-numbered",
      label: "Itens",
      value: `${sumQty(quote)} peças`,
      sub: `${lineCount} ${lineCount === 1 ? "linha" : "linhas"}`,
    },
    {
      icon: "mdi:sale",
      label: "Desconto",
      value: formatBRL(quote.discount),
      sub: discountShare != null ? `${formatPercent(discountShare, 1)} do subtotal` : undefined,
      tone: quote.requiresApproval ? "warn" : "default",
    },
    {
      icon: "mdi:shield-check-outline",
      label: "Aprovação",
      value: approvalValue,
      tone: approvalTone,
    },
    {
      icon: "mdi:calendar-plus",
      label: "Criado",
      value: formatRelativeTimeBR(quote.createdAt, now),
      sub: formatDateBR(quote.createdAt),
    },
  ];
}

const QUOTE_STEP_LABELS: Record<"rascunho" | "enviado" | "aceito" | "convertido", string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aceito: "Aceito",
  convertido: "Convertido",
};

/** Stepper steps for the Operacional layout. Off-path terminal: recusado / expirado. */
export function quoteStepperSteps(quote: IQuote): {
  steps: IStepperStep[];
  terminal: IStepperTerminal | null;
} {
  if (quote.status === "recusado") {
    return { steps: [], terminal: { label: "Orçamento recusado", tone: "bad" } };
  }
  if (quote.status === "expirado") {
    return { steps: [], terminal: { label: "Orçamento expirado", tone: "warn" } };
  }
  const flow = ["rascunho", "enviado", "aceito", "convertido"] as const;
  const currentIdx = flow.indexOf(quote.status as (typeof flow)[number]);
  const steps: IStepperStep[] = flow.map((s, i) => ({
    key: s,
    label: QUOTE_STEP_LABELS[s],
    state: i < currentIdx ? "done" : i === currentIdx ? "current" : "todo",
  }));
  return { steps, terminal: null };
}
```

- [ ] **Step 2: Gate + commit** `feat: add quote detail KPI + stepper derivation`.

---

### Task 8: Quote detail blocks

**Files:**
- Create: `src/features/quotes/components/detail/QuoteDetailBlocks.tsx`

- [ ] **Step 1: Write the file** (presentational blocks lifted verbatim from the current page, re-skinned with `DetailCard` + `formatBRL`/`formatDateBR`)

```tsx
import type { IQuote, IQuoteItem, ISeller } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateBR, formatDateTimeBR } from "@/shared/utils/format";
import { DetailCard } from "@/shared/detail-views";
import { QuoteStatusBadge } from "../QuoteStatusBadge";
import { QuoteOriginBadge } from "../QuoteOriginBadge";
import { ValidityIndicator } from "../ValidityIndicator";

/** Hero card: number, badges, dates, total. No actions/banners (those are slotted by the page). */
export function QuoteHero({ quote }: { quote: IQuote }) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
            #{quote.number}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <QuoteStatusBadge status={quote.status} />
            <QuoteOriginBadge origin={quote.origin} />
            <ValidityIndicator validUntil={quote.validUntil} />
          </div>
          <p className="text-xs text-muted-foreground">
            Criado em {formatDateTimeBR(quote.createdAt)}
            {quote.updatedAt !== quote.createdAt && (
              <> · atualizado {formatDateTimeBR(quote.updatedAt)}</>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-3xl font-bold tabular-nums text-foreground">{formatBRL(quote.total)}</p>
        </div>
      </div>
    </Card>
  );
}

export interface IQuoteBannersProps {
  quote: IQuote;
  canApprove: boolean;
  onApprove: () => void;
  onRejectApproval: () => void;
  onViewConversation: () => void;
}

/** SDR + approval banners. Returns null when neither applies. */
export function QuoteBanners({
  quote,
  canApprove,
  onApprove,
  onRejectApproval,
  onViewConversation,
}: IQuoteBannersProps) {
  const showSdr = quote.origin === "sdr";
  const showApproval = Boolean(quote.requiresApproval);
  if (!showSdr && !showApproval) return null;
  return (
    <div className="space-y-3">
      {showSdr && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          <Icon
            icon="mdi:robot-outline"
            size={18}
            className="text-emerald-600 dark:text-emerald-300"
          />
          <span className="flex-1 text-emerald-700 dark:text-emerald-200">
            Criado pelo agente SDR durante a conversa do cliente.
          </span>
          {quote.conversationId && (
            <Button variant="ghost" size="sm" onClick={onViewConversation}>
              Ver conversa <Icon icon="mdi:open-in-new" size={14} />
            </Button>
          )}
        </div>
      )}
      {showApproval && (
        <div className="flex flex-col gap-3 rounded-md border border-orange-500/30 bg-orange-500/5 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <Icon
              icon="mdi:shield-alert-outline"
              size={18}
              className="text-orange-600 dark:text-orange-300"
            />
            <div>
              <p className="font-medium text-orange-700 dark:text-orange-200">
                Aguardando aprovação do gestor
              </p>
              {quote.discountReason && (
                <p className="text-xs text-orange-700/80 dark:text-orange-200/80">
                  Justificativa: {quote.discountReason}
                </p>
              )}
              {quote.rejectedReason && (
                <p className="text-xs text-rose-600 dark:text-rose-300">
                  Rejeitado anteriormente: {quote.rejectedReason}
                </p>
              )}
            </div>
          </div>
          {canApprove && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={onRejectApproval}>
                Rejeitar
              </Button>
              <Button size="sm" onClick={onApprove}>
                Aprovar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface IQuoteActionsProps {
  quote: IQuote;
  canEdit: boolean;
  onSend: () => void;
  onAccept: () => void;
  onReject: () => void;
  onCancelSend: () => void;
  onConvert: () => void;
  onViewPedido: () => void;
  onDuplicate: () => void;
  onWhatsapp: () => void;
  className?: string;
}

/** Contextual action buttons (status-driven). Used in the Cockpit rail and the Operacional zone. */
export function QuoteActions({
  quote,
  canEdit,
  onSend,
  onAccept,
  onReject,
  onCancelSend,
  onConvert,
  onViewPedido,
  onDuplicate,
  onWhatsapp,
  className,
}: IQuoteActionsProps) {
  const isRascunho = quote.status === "rascunho";
  const isEnviado = quote.status === "enviado";
  const isAceito = quote.status === "aceito";
  const isConvertido = quote.status === "convertido";
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {isRascunho && canEdit && (
        <Button size="sm" onClick={onSend} disabled={quote.requiresApproval}>
          <Icon icon="mdi:send-outline" size={14} /> Enviar
        </Button>
      )}
      {isEnviado && canEdit && (
        <>
          <Button size="sm" onClick={onAccept}>
            <Icon icon="mdi:check" size={14} /> Marcar aceito
          </Button>
          <Button size="sm" variant="outline" onClick={onReject}>
            <Icon icon="mdi:close" size={14} /> Marcar recusado
          </Button>
          <Button size="sm" variant="outline" onClick={onCancelSend}>
            <Icon icon="mdi:undo-variant" size={14} /> Cancelar envio
          </Button>
        </>
      )}
      {isAceito && canEdit && (
        <Button size="sm" onClick={onConvert}>
          <Icon icon="mdi:swap-horizontal-bold" size={14} /> Converter em pedido
        </Button>
      )}
      {isConvertido && (
        <Button size="sm" variant="outline" onClick={onViewPedido}>
          <Icon icon="mdi:open-in-new" size={14} /> Ver pedido
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={onDuplicate}>
        <Icon icon="mdi:content-duplicate" size={14} /> Duplicar
      </Button>
      <Button size="sm" variant="outline" onClick={onWhatsapp}>
        <Icon icon="mdi:whatsapp" size={14} /> Enviar via WhatsApp
      </Button>
    </div>
  );
}

/** Items table (Peça/Qtd/Unit./Desc./Subtotal). */
export function QuoteItemsBlock({ items }: { items: IQuoteItem[] }) {
  return (
    <DetailCard icon="mdi:format-list-bulleted" title="Itens">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Peça</th>
              <th className="w-20 px-3 py-2 text-right">Qtd.</th>
              <th className="w-28 px-3 py-2 text-right">Unit.</th>
              <th className="w-24 px-3 py-2 text-right">Desc.</th>
              <th className="w-28 px-3 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <p className="text-sm font-medium text-foreground">{it.partName}</p>
                  <p className="text-[10px] text-muted-foreground">SKU {it.partSku}</p>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatBRL(it.unitPrice)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {it.discount > 0 ? `-${formatBRL(it.discount)}` : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {formatBRL(it.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DetailCard>
  );
}

/** Conditions: payment method/terms, validity, seller, internal notes. */
export function QuoteConditionsBlock({ quote, seller }: { quote: IQuote; seller: ISeller | null }) {
  return (
    <DetailCard icon="mdi:credit-card-outline" title="Condições">
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Forma de pagamento</dt>
          <dd className="font-medium text-foreground">{quote.paymentMethod ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prazo</dt>
          <dd className="font-medium text-foreground">
            {quote.paymentTerms ?? quote.paymentCondition}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Validade</dt>
          <dd className="font-medium text-foreground">{formatDateBR(quote.validUntil)}</dd>
        </div>
        {seller && (
          <div>
            <dt className="text-xs text-muted-foreground">Vendedor</dt>
            <dd className="font-medium text-foreground">{seller.fullName}</dd>
          </div>
        )}
        {quote.notes && (
          <div className="md:col-span-3">
            <dt className="text-xs text-muted-foreground">Notas internas</dt>
            <dd className="text-foreground">{quote.notes}</dd>
          </div>
        )}
      </dl>
    </DetailCard>
  );
}
```

- [ ] **Step 2: Gate + commit** `feat: add quote detail blocks`.

---

### Task 9: Wire QuoteDetailPage (3 layouts)

**Files:**
- Modify: `src/features/quotes/pages/QuoteDetailPage.tsx`

This is a **render-only** rewrite. Keep every hook, `useQuery`, `useState`, handler (`handleSend`, `handleAccept`, `handleReject`, `handleCancel`, `handleApprove`, `handleRejectApproval`, `handleDuplicate`, `handleConvertToOrder`, `handleWhatsappShare`), the `refresh` helper, `buildWhatsappText`, `customerName`, `describeAction`, and the loading/error early-returns **exactly as they are**. Only imports, the post-`canEdit` derived block, and the final `return` change.

- [ ] **Step 1: Add imports** (top of file, alongside existing imports)

```tsx
import type { ReactNode } from "react";
import {
  CockpitShell,
  DetailCard,
  DetailCustomerCard,
  DetailHistory,
  DetailLayoutSwitcher,
  DetailStatStrip,
  DetailSummaryCard,
  DocumentShell,
  OperationalShell,
  QUOTE_DETAIL_LAYOUT_KEY,
  StatusStepper,
  useDetailLayout,
} from "@/shared/detail-views";
import { formatDateBR, formatDateTimeBR } from "@/shared/utils/format";
import { quoteDetailStats, quoteStepperSteps } from "../utils/quoteDetailStats";
import {
  QuoteActions,
  QuoteBanners,
  QuoteConditionsBlock,
  QuoteHero,
  QuoteItemsBlock,
} from "../components/detail/QuoteDetailBlocks";
```
(The existing `import { useMemo, useState } from "react"` already covers `useMemo`; add only the `ReactNode` type import and the new module imports. `QuoteStatusBadge` stays imported — it is reused by the Documento doc-header below.)

- [ ] **Step 2: Add the layout hooks with the OTHER hooks — BEFORE the early returns** (Rules of Hooks: never call a hook after a conditional `return`). Insert immediately after the existing `const [rejectReason, setRejectReason] = useState("");` line (which sits above `refresh`/the handlers/the loading+error early-returns). The `stats`/`stepper` memos **must guard against `quote` being undefined** at this point:

```tsx
  const [layout, setLayout] = useDetailLayout(QUOTE_DETAIL_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);
  const stats = useMemo(() => (quote ? quoteDetailStats(quote, now) : []), [quote, now]);
  const stepper = useMemo(
    () => (quote ? quoteStepperSteps(quote) : { steps: [], terminal: null }),
    [quote],
  );
```

(The node consts in Step 3 — which read `quote`, `customer`, `seller`, `audits`, `canEdit`, `canApprove` — live AFTER the early returns, where `quote` is guaranteed defined; that's fine because they are plain consts, not hooks.)

- [ ] **Step 3: Replace the entire `return (…)`** (the `<div className="mx-auto w-full max-w-5xl …">` … through its matching `</div>`, INCLUDING the 5 `<AlertDialog>` blocks) with the following. The dialogs are preserved verbatim inside the `dialogs` fragment — **copy the 5 existing `<AlertDialog …>…</AlertDialog>` blocks unchanged** into the marked spot.

```tsx
  const header = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => void navigate({ to: "/app/orcamentos" })}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} />
        Voltar à listagem
      </button>
      <DetailLayoutSwitcher value={layout} onChange={setLayout} />
    </div>
  );

  const banners = (
    <QuoteBanners
      quote={quote}
      canApprove={canApprove}
      onApprove={() => void handleApprove()}
      onRejectApproval={() => setConfirmOpen("reject")}
      onViewConversation={() => void navigate({ to: "/app/atendimento" })}
    />
  );

  const actions = (
    <QuoteActions
      quote={quote}
      canEdit={canEdit}
      onSend={() => setConfirmOpen("send")}
      onAccept={() => setConfirmOpen("accept")}
      onReject={() => setConfirmOpen("reject")}
      onCancelSend={() => setConfirmOpen("cancel")}
      onConvert={() => setConfirmOpen("convert")}
      onViewPedido={() => void navigate({ to: "/app/pedidos" })}
      onDuplicate={() => void handleDuplicate()}
      onWhatsapp={handleWhatsappShare}
    />
  );

  const items = <QuoteItemsBlock items={quote.items} />;
  const conditions = <QuoteConditionsBlock quote={quote} seller={seller} />;
  const summary = (
    <DetailSummaryCard
      subtotal={quote.subtotal}
      discount={quote.discount}
      shipping={quote.shipping}
      total={quote.total}
    />
  );
  const customerCard = (
    <DetailCustomerCard
      customer={customer}
      name={customerName(customer)}
      deliveryAddress={quote.deliveryAddress}
      onOpenFicha={() =>
        customer && void navigate({ to: "/app/clientes/$id", params: { id: customer.id } })
      }
    />
  );
  const history = <DetailHistory audits={audits} describeAction={describeAction} />;

  const dialogs = (
    <>
      {/* PASTE the 5 existing <AlertDialog …>…</AlertDialog> blocks here, unchanged */}
    </>
  );

  let body: ReactNode;
  if (layout === "operational") {
    body = (
      <OperationalShell
        header={header}
        hero={<QuoteHero quote={quote} />}
        stepper={
          <div className="space-y-3">
            <StatusStepper steps={stepper.steps} terminal={stepper.terminal} />
            {banners}
          </div>
        }
        actions={actions}
        grid={
          <>
            {summary}
            {customerCard}
            {conditions}
          </>
        }
        main={
          <>
            {items}
            {history}
          </>
        }
      />
    );
  } else if (layout === "document") {
    body = (
      <DocumentShell
        header={header}
        docHeader={
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                GALLO BASE DIESEL
              </p>
              <h1 className="font-mono text-xl font-bold text-foreground">#{quote.number}</h1>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Criado em {formatDateTimeBR(quote.createdAt)}</p>
              <div className="mt-1 flex justify-end">
                <QuoteStatusBadge status={quote.status} />
              </div>
            </div>
          </div>
        }
        parties={
          <div className="grid gap-4 md:grid-cols-2">
            {customerCard}
            {conditions}
          </div>
        }
        items={items}
        totals={<div className="w-full max-w-xs">{summary}</div>}
        footer={
          <div className="border-t border-border pt-4 text-xs text-muted-foreground">
            <p>Validade: {formatDateBR(quote.validUntil)}</p>
            {quote.notes && <p className="mt-1">Observações: {quote.notes}</p>}
          </div>
        }
      />
    );
  } else {
    body = (
      <CockpitShell
        header={header}
        hero={
          <div className="space-y-3">
            <QuoteHero quote={quote} />
            {banners}
          </div>
        }
        kpis={<DetailStatStrip stats={stats} />}
        main={
          <>
            {items}
            {conditions}
            {history}
          </>
        }
        rail={
          <>
            <DetailCard icon="mdi:lightning-bolt-outline" title="Ações">
              {actions}
            </DetailCard>
            {summary}
            {customerCard}
          </>
        }
      />
    );
  }

  return (
    <>
      {body}
      {dialogs}
    </>
  );
```

(Add `DetailCard` to the `@/shared/detail-views` import in Step 1 — it is used by the Cockpit rail "Ações" wrapper.)

- [ ] **Step 4: Remove the now-unused local `SectionHeader`** function (the page no longer calls it — the blocks use `DetailCard`). Keep `describeAction`, `customerName`, `buildWhatsappText`, and the `moneyFormatter`/`dateFormatter`/`dateTimeFormatter` locals **only if still referenced** (`buildWhatsappText` uses `moneyFormatter` + `dateFormatter`; `dateTimeFormatter` likely becomes unused → let eslint flag and remove it).

- [ ] **Step 5: Gate** `QuoteDetailPage.tsx` (`prettier` → `eslint` exit 0 → `tsc --noEmit | grep QuoteDetailPage` empty), then **`bun run build`** (`✓ built`). Commit: `feat: redesign quote detail with 3 selectable layouts`.

---

## Phase 3 — Order detail (`/app/pedidos/$id`)

### Task 10: Order KPI + stepper derivation

**Files:**
- Create: `src/features/orders/utils/orderDetailStats.ts`

- [ ] **Step 1: Write the file**

```ts
import type { IOrder } from "@/shared/types";
import type { IDetailStat, IStepperStep, IStepperTerminal, StatTone } from "@/shared/detail-views";
import { formatBRL, formatDateBR, formatRelativeTimeBR } from "@/shared/utils/format";
import { computeOrderStatus } from "./orderStatus";

const sumQty = (o: IOrder): number => o.items.reduce((acc, it) => acc + it.quantity, 0);

export const ORDER_PAYMENT_LABEL: Record<IOrder["paymentStatus"], string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  estornado: "Estornado",
  vencido: "Vencido",
};

export const ORDER_FULFILLMENT_LABEL: Record<IOrder["fulfillmentStatus"], string> = {
  pendente: "Pendente",
  separacao: "Em separação",
  expedido: "Expedido",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

/** Resolved commission for the KPI: calculated (from PRD-047) or estimated (preview). */
export interface IOrderCommissionStat {
  value: number;
  calculated: boolean;
}

/** The 5 KPI cells for the order detail page. `commission` is optional (calculated total). */
export function orderDetailStats(
  order: IOrder,
  now: Date,
  commission?: IOrderCommissionStat,
): IDetailStat[] {
  const paid = order.paymentStatus === "pago";
  const paymentTone: StatTone = paid
    ? "good"
    : order.paymentStatus === "vencido" || order.paymentStatus === "estornado"
      ? "bad"
      : "warn";

  const deliveryTone: StatTone =
    order.fulfillmentStatus === "entregue"
      ? "good"
      : order.fulfillmentStatus === "cancelado" || order.fulfillmentStatus === "devolvido"
        ? "bad"
        : order.fulfillmentStatus === "expedido"
          ? "default"
          : "warn";
  const deliverySub = order.deliveredAt
    ? formatRelativeTimeBR(order.deliveredAt, now)
    : order.shippedAt
      ? formatRelativeTimeBR(order.shippedAt, now)
      : "—";

  const lineCount = order.items.length;

  const commissionValue = commission
    ? formatBRL(commission.value)
    : order.commissionPreview
      ? formatBRL(order.commissionPreview.estimatedCommission)
      : "—";
  const commissionSub = commission
    ? commission.calculated
      ? "calculada"
      : "estimada"
    : order.commissionPreview
      ? "estimada"
      : "—";

  return [
    {
      icon: "mdi:cash-check",
      label: "Pagamento",
      value: ORDER_PAYMENT_LABEL[order.paymentStatus],
      sub: paid ? formatBRL(order.total) : `de ${formatBRL(order.total)}`,
      tone: paymentTone,
    },
    {
      icon: "mdi:truck-outline",
      label: "Entrega",
      value: ORDER_FULFILLMENT_LABEL[order.fulfillmentStatus],
      sub: deliverySub,
      tone: deliveryTone,
    },
    {
      icon: "mdi:format-list-numbered",
      label: "Itens",
      value: `${sumQty(order)} peças`,
      sub: `${lineCount} ${lineCount === 1 ? "linha" : "linhas"}`,
    },
    { icon: "mdi:percent-outline", label: "Comissão", value: commissionValue, sub: commissionSub },
    {
      icon: "mdi:calendar-plus",
      label: "Criado",
      value: formatRelativeTimeBR(order.createdAt, now),
      sub: formatDateBR(order.createdAt),
    },
  ];
}

const ORDER_STEP_LABELS: Record<
  | "aguardando_pagamento"
  | "pago_aguardando_envio"
  | "em_separacao"
  | "enviado"
  | "entregue"
  | "concluido",
  string
> = {
  aguardando_pagamento: "Pagamento",
  pago_aguardando_envio: "Pago",
  em_separacao: "Separação",
  enviado: "Enviado",
  entregue: "Entregue",
  concluido: "Concluído",
};

/** Stepper steps for the Operacional layout. Off-path terminal: cancelado / devolvido. */
export function orderStepperSteps(order: IOrder): {
  steps: IStepperStep[];
  terminal: IStepperTerminal | null;
} {
  const agg = computeOrderStatus(order);
  if (agg === "cancelado") {
    return { steps: [], terminal: { label: "Pedido cancelado", tone: "bad" } };
  }
  if (agg === "devolvido") {
    return { steps: [], terminal: { label: "Pedido devolvido", tone: "warn" } };
  }
  const flow = [
    "aguardando_pagamento",
    "pago_aguardando_envio",
    "em_separacao",
    "enviado",
    "entregue",
    "concluido",
  ] as const;
  const currentIdx = flow.indexOf(agg as (typeof flow)[number]);
  const steps: IStepperStep[] = flow.map((s, i) => ({
    key: s,
    label: ORDER_STEP_LABELS[s],
    state: i < currentIdx ? "done" : i === currentIdx ? "current" : "todo",
  }));
  return { steps, terminal: null };
}
```

- [ ] **Step 2: Gate + commit** `feat: add order detail KPI + stepper derivation`.

---

### Task 11: Order detail blocks

**Files:**
- Create: `src/features/orders/components/detail/OrderDetailBlocks.tsx`

- [ ] **Step 1: Write the file** (blocks lifted verbatim from the current page; payment/delivery actions gate on `canActOnOrder`, so passing `canActOnOrder={false}` in the Documento layout renders them read-only)

```tsx
import type { ICommission, ICommissionPreview, IOrder, OrderStatus } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateTimeBR } from "@/shared/utils/format";
import { DetailCard } from "@/shared/detail-views";
import { OrderStatusBadge } from "../OrderStatusBadge";
import { OrderOriginBadge } from "../OrderOriginBadge";
import { ORDER_FULFILLMENT_LABEL, ORDER_PAYMENT_LABEL } from "../../utils/orderDetailStats";

export interface IOrderHeroProps {
  order: IOrder;
  agg: OrderStatus;
  onViewQuote: () => void;
}

export function OrderHero({ order, agg, onViewQuote }: IOrderHeroProps) {
  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl font-bold tracking-tight text-foreground">
            #{order.number ?? order.id.replace(/^order-/, "PD-")}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={agg} />
            <OrderOriginBadge order={order} />
            {order.quoteId && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onViewQuote}
                className="h-6 gap-1 px-1.5 text-[11px]"
              >
                <Icon icon="mdi:file-document-outline" size={12} />
                Orçamento de origem
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Criado em {formatDateTimeBR(order.createdAt)}
            {order.updatedAt !== order.createdAt && (
              <> · atualizado {formatDateTimeBR(order.updatedAt)}</>
            )}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-3xl font-bold tabular-nums text-foreground">{formatBRL(order.total)}</p>
        </div>
      </div>
    </Card>
  );
}

/** Cancellation banner. Returns null unless the order is canceled. */
export function OrderBanners({ order }: { order: IOrder }) {
  if (!order.canceledAt) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
      <Icon icon="mdi:close-circle-outline" size={18} className="mt-0.5 text-rose-600" />
      <div className="flex-1 text-rose-700 dark:text-rose-200">
        <p className="font-medium">Pedido cancelado</p>
        {order.cancelReason && <p className="text-xs">Motivo: {order.cancelReason}</p>}
        <p className="text-[11px] opacity-80">{formatDateTimeBR(order.canceledAt)}</p>
      </div>
    </div>
  );
}

export interface IOrderActionsProps {
  order: IOrder;
  agg: OrderStatus;
  canActOnOrder: boolean;
  cancellable: boolean;
  isManagerOrOwner: boolean;
  onMarkPaid: () => void;
  onStartFulfillment: () => void;
  onShip: () => void;
  onDeliver: () => void;
  onReturn: () => void;
  onInvoice: () => void;
  onCancel: () => void;
  className?: string;
}

export function OrderActions({
  order,
  agg,
  canActOnOrder,
  cancellable,
  isManagerOrOwner,
  onMarkPaid,
  onStartFulfillment,
  onShip,
  onDeliver,
  onReturn,
  onInvoice,
  onCancel,
  className,
}: IOrderActionsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {canActOnOrder && agg === "aguardando_pagamento" && (
        <Button size="sm" onClick={onMarkPaid}>
          <Icon icon="mdi:cash-check" size={14} /> Marcar como pago
        </Button>
      )}
      {canActOnOrder && agg === "pago_aguardando_envio" && (
        <Button size="sm" onClick={onStartFulfillment}>
          <Icon icon="mdi:package-variant" size={14} /> Iniciar separação
        </Button>
      )}
      {canActOnOrder && agg === "em_separacao" && (
        <Button size="sm" onClick={onShip}>
          <Icon icon="mdi:truck-fast-outline" size={14} /> Marcar como enviado
        </Button>
      )}
      {canActOnOrder && agg === "enviado" && (
        <Button size="sm" onClick={onDeliver}>
          <Icon icon="mdi:package-variant-closed-check" size={14} /> Marcar entregue
        </Button>
      )}
      {canActOnOrder && (agg === "entregue" || agg === "concluido") && !order.canceledAt && (
        <Button size="sm" variant="outline" onClick={onReturn}>
          <Icon icon="mdi:keyboard-return" size={14} /> Registrar devolução
        </Button>
      )}
      {isManagerOrOwner &&
        order.paymentStatus === "pago" &&
        order.fulfillmentStatus !== "devolvido" &&
        !order.nfNumber && (
          <Button size="sm" variant="outline" onClick={onInvoice}>
            <Icon icon="mdi:receipt-text-outline" size={14} /> Gerar NF
          </Button>
        )}
      {canActOnOrder && cancellable && (
        <Button
          size="sm"
          variant="outline"
          className="text-rose-600 hover:bg-rose-500/10"
          onClick={onCancel}
        >
          <Icon icon="mdi:close-circle-outline" size={14} /> Cancelar pedido
        </Button>
      )}
      {!cancellable &&
        canActOnOrder &&
        !order.canceledAt &&
        (order.fulfillmentStatus === "expedido" || order.fulfillmentStatus === "entregue") && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Icon icon="mdi:lock-outline" size={12} />
            Pedido já enviado — use "Registrar devolução".
          </span>
        )}
    </div>
  );
}

export interface IOrderPaymentBlockProps {
  order: IOrder;
  canActOnOrder: boolean;
  isManagerOrOwner: boolean;
  onMarkPaid: () => void;
  onRefund: () => void;
}

export function OrderPaymentBlock({
  order,
  canActOnOrder,
  isManagerOrOwner,
  onMarkPaid,
  onRefund,
}: IOrderPaymentBlockProps) {
  return (
    <DetailCard icon="mdi:credit-card-outline" title="Pagamento">
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Método</dt>
          <dd className="font-medium text-foreground">{order.paymentMethod ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Prazo</dt>
          <dd className="font-medium text-foreground">
            {order.paymentTerms ?? order.paymentCondition}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="font-medium text-foreground">{ORDER_PAYMENT_LABEL[order.paymentStatus]}</dd>
        </div>
        {order.paidAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Pago em</dt>
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.paidAt)}</dd>
          </div>
        )}
        {order.nfNumber && (
          <div>
            <dt className="text-xs text-muted-foreground">NF</dt>
            <dd className="font-medium text-foreground">#{order.nfNumber}</dd>
          </div>
        )}
      </dl>
      {canActOnOrder && !order.canceledAt && (
        <div className="mt-3 flex flex-wrap gap-2">
          {order.paymentStatus === "pendente" && (
            <Button size="sm" onClick={onMarkPaid}>
              <Icon icon="mdi:cash-check" size={14} /> Marcar como pago
            </Button>
          )}
          {isManagerOrOwner &&
            (order.paymentStatus === "pago" || order.paymentStatus === "parcial") &&
            order.fulfillmentStatus !== "devolvido" && (
              <Button size="sm" variant="outline" onClick={onRefund}>
                <Icon icon="mdi:cash-refund" size={14} /> Refund (placeholder)
              </Button>
            )}
        </div>
      )}
    </DetailCard>
  );
}

export interface IOrderDeliveryBlockProps {
  order: IOrder;
  canActOnOrder: boolean;
  editable: boolean;
  onStartFulfillment: () => void;
  onShip: () => void;
  onDeliver: () => void;
}

export function OrderDeliveryBlock({
  order,
  canActOnOrder,
  editable,
  onStartFulfillment,
  onShip,
  onDeliver,
}: IOrderDeliveryBlockProps) {
  return (
    <DetailCard icon="mdi:truck-fast-outline" title="Entrega">
      <dl className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Status</dt>
          <dd className="font-medium text-foreground">
            {ORDER_FULFILLMENT_LABEL[order.fulfillmentStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Transportadora</dt>
          <dd className="font-medium text-foreground">{order.carrier ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Rastreamento</dt>
          <dd className="font-mono text-xs text-foreground">{order.trackingCode ?? "—"}</dd>
        </div>
        {order.shippedAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Enviado em</dt>
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.shippedAt)}</dd>
          </div>
        )}
        {order.deliveredAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Entregue em</dt>
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.deliveredAt)}</dd>
          </div>
        )}
        {order.returnedAt && (
          <div>
            <dt className="text-xs text-muted-foreground">Devolvido em</dt>
            <dd className="font-medium text-foreground">{formatDateTimeBR(order.returnedAt)}</dd>
          </div>
        )}
        {order.returnReason && (
          <div className="md:col-span-3">
            <dt className="text-xs text-muted-foreground">Motivo da devolução</dt>
            <dd className="text-foreground">{order.returnReason}</dd>
          </div>
        )}
      </dl>
      {canActOnOrder &&
        editable &&
        order.fulfillmentStatus === "pendente" &&
        order.paymentStatus === "pago" && (
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={onStartFulfillment}>
              <Icon icon="mdi:package-variant" size={14} /> Iniciar separação
            </Button>
          </div>
        )}
      {canActOnOrder && order.fulfillmentStatus === "separacao" && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={onShip}>
            <Icon icon="mdi:truck-fast-outline" size={14} /> Marcar como enviado
          </Button>
        </div>
      )}
      {canActOnOrder && order.fulfillmentStatus === "expedido" && (
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={onDeliver}>
            <Icon icon="mdi:package-variant-closed-check" size={14} /> Marcar como entregue
          </Button>
        </div>
      )}
    </DetailCard>
  );
}

export interface IOrderCommissionBlockProps {
  hasCommission: boolean;
  commissions: ICommission[];
  preview?: ICommissionPreview;
}

/** Commission block — verbatim from the current page Section 6, props instead of closures. */
export function OrderCommissionBlock({
  hasCommission,
  commissions,
  preview,
}: IOrderCommissionBlockProps) {
  return (
    <DetailCard
      icon="mdi:percent-outline"
      title={hasCommission ? "Comissão calculada" : "Comissão (Preview)"}
    >
      {hasCommission ? (
        <div className="space-y-3">
          {commissions.map((c) => (
            <div key={c.id} className="rounded-md border border-border bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {formatBRL(c.totalCommission)}
                  </span>
                  {c.isSplit && (
                    <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs text-warning-foreground">
                      Split
                    </span>
                  )}
                  {c.goalBonus > 0 && (
                    <span className="rounded bg-success/15 px-1.5 py-0.5 text-xs text-success-foreground">
                      +Bônus meta
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  Status: <span className="font-medium text-foreground">{c.status}</span>
                </span>
              </div>
              <dl className="mt-2 grid gap-2 text-xs md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Base</dt>
                  <dd className="font-medium text-foreground">{formatBRL(c.baseValue)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Taxa</dt>
                  <dd className="font-medium text-foreground">{(c.rate * 100).toFixed(2)}%</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Base × Taxa</dt>
                  <dd className="font-medium text-foreground">{formatBRL(c.baseCommission)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Bônus meta</dt>
                  <dd className="font-medium text-foreground">{formatBRL(c.goalBonus)}</dd>
                </div>
              </dl>
              {c.ruleSnapshot && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Regra: <span className="text-foreground">{c.ruleSnapshot.name}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      ) : preview ? (
        <>
          <dl className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Base</dt>
              <dd className="font-medium text-foreground">{formatBRL(preview.baseValue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Taxa</dt>
              <dd className="font-medium text-foreground">
                {(preview.commissionRate * 100).toFixed(1)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Estimativa</dt>
              <dd className="font-semibold text-foreground">
                {formatBRL(preview.estimatedCommission)}
              </dd>
            </div>
            {preview.rules.length > 0 && (
              <div className="md:col-span-3">
                <dt className="text-xs text-muted-foreground">Regras aplicadas</dt>
                <dd className="text-xs text-foreground">
                  <ul className="ml-4 list-disc space-y-0.5">
                    {preview.rules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-200">
            <Icon icon="mdi:alert-outline" size={14} className="mt-0.5" />
            <p>
              Pedido ainda não confirmado como pago — após pagamento, a comissão definitiva (PRD-047)
              é gerada automaticamente.
            </p>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Comissão será calculada quando o pedido for criado a partir de um orçamento.
        </p>
      )}
    </DetailCard>
  );
}
```

- [ ] **Step 2: Gate + commit** `feat: add order detail blocks`.

---

### Task 12: Wire OrderDetailPage (3 layouts)

**Files:**
- Modify: `src/features/orders/pages/OrderDetailPage.tsx`

Same render-only rewrite discipline as Task 9. Keep every hook, `useQuery`, `useCommissionForOrder`, `useState`, the `refresh`/`wrap`/`notifyStatus` helpers, all transition handlers, the apply-vehicle callback, and the loading/error early-returns **verbatim**.

- [ ] **Step 1: Add imports**

```tsx
import type { ReactNode } from "react";
import {
  CockpitShell,
  DetailCard,
  DetailCustomerCard,
  DetailHistory,
  DetailLayoutSwitcher,
  DetailStatStrip,
  DetailSummaryCard,
  DocumentShell,
  ORDER_DETAIL_LAYOUT_KEY,
  OperationalShell,
  StatusStepper,
  useDetailLayout,
} from "@/shared/detail-views";
import { formatDateTimeBR } from "@/shared/utils/format";
import {
  orderDetailStats,
  orderStepperSteps,
  type IOrderCommissionStat,
} from "../utils/orderDetailStats";
import {
  OrderActions,
  OrderBanners,
  OrderCommissionBlock,
  OrderDeliveryBlock,
  OrderHero,
  OrderPaymentBlock,
} from "../components/detail/OrderDetailBlocks";
```
(`useMemo` is already imported from `"react"`. `OrderStatusBadge` stays imported — reused by the Documento doc-header. `OrderItemsTable` stays — reused by the Items block.)

- [ ] **Step 2: Add the layout hooks — BEFORE the early returns** (Rules of Hooks). Insert immediately after the existing `const [dialog, setDialog] = useState<OrderDialogKind>(null);` line. Guard the memos against `order` being undefined:

```tsx
  const [layout, setLayout] = useDetailLayout(ORDER_DETAIL_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);
  const commissionStat = useMemo<IOrderCommissionStat | undefined>(() => {
    if (commissionsForOrder.hasCommission && commissionsForOrder.commissions.length > 0) {
      const total = commissionsForOrder.commissions.reduce((acc, c) => acc + c.totalCommission, 0);
      return { value: total, calculated: true };
    }
    return undefined;
  }, [commissionsForOrder]);
  const stats = useMemo(
    () => (order ? orderDetailStats(order, now, commissionStat) : []),
    [order, now, commissionStat],
  );
  const stepper = useMemo(
    () => (order ? orderStepperSteps(order) : { steps: [], terminal: null }),
    [order],
  );
```

- [ ] **Step 3: Replace the entire `return (…)`** (the `<div className="mx-auto w-full max-w-5xl …">` … its closing `</div>`, INCLUDING the 8 dialog components at the end) with the following. **Copy the 8 existing dialog elements** (`<MarkPaidDialog …/>` … `<InvoiceDialog …/>`) verbatim into the `dialogs` fragment. **Move the existing inline `onApplyVehicle` async callback** (currently passed to `<OrderItemsTable>`) into the `items` const unchanged.

```tsx
  const header = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => void navigate({ to: "/app/pedidos" })}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} />
        Voltar à listagem
      </button>
      <DetailLayoutSwitcher value={layout} onChange={setLayout} />
    </div>
  );

  const hero = (
    <OrderHero
      order={order}
      agg={agg}
      onViewQuote={() =>
        order.quoteId && void navigate({ to: "/app/orcamentos/$id", params: { id: order.quoteId } })
      }
    />
  );
  const banners = <OrderBanners order={order} />;
  const actions = (
    <OrderActions
      order={order}
      agg={agg}
      canActOnOrder={canActOnOrder}
      cancellable={cancellable}
      isManagerOrOwner={isManagerOrOwner}
      onMarkPaid={() => setDialog("markPaid")}
      onStartFulfillment={() => setDialog("startFulfillment")}
      onShip={() => setDialog("ship")}
      onDeliver={() => setDialog("deliver")}
      onReturn={() => setDialog("return")}
      onInvoice={() => setDialog("invoice")}
      onCancel={() => setDialog("cancel")}
    />
  );

  const items = (
    <DetailCard icon="mdi:format-list-bulleted" title="Itens">
      <OrderItemsTable
        order={order}
        readOnly={!canActOnOrder}
        onApplyVehicle={async (itemId, vehicleId) => {
          try {
            await applyOrderItemToVehicle({
              ordersProvider,
              vehiclesProvider,
              order,
              itemId,
              vehicleId,
            });
            toast.success(
              vehicleId
                ? "Aplicação registrada — histórico do veículo atualizado."
                : "Aplicação removida.",
            );
            await refresh();
          } catch (err) {
            console.error(err);
            toast.error(err instanceof Error ? err.message : "Falha ao aplicar item ao veículo.");
          }
        }}
      />
    </DetailCard>
  );

  const payment = (
    <OrderPaymentBlock
      order={order}
      canActOnOrder={canActOnOrder}
      isManagerOrOwner={isManagerOrOwner}
      onMarkPaid={() => setDialog("markPaid")}
      onRefund={() => setDialog("refund")}
    />
  );
  const delivery = (
    <OrderDeliveryBlock
      order={order}
      canActOnOrder={canActOnOrder}
      editable={editable}
      onStartFulfillment={() => setDialog("startFulfillment")}
      onShip={() => setDialog("ship")}
      onDeliver={() => setDialog("deliver")}
    />
  );
  const commission = (
    <OrderCommissionBlock
      hasCommission={commissionsForOrder.hasCommission}
      commissions={commissionsForOrder.commissions}
      preview={order.commissionPreview}
    />
  );
  const summary = (
    <DetailSummaryCard
      subtotal={order.subtotal}
      discount={order.discount}
      shipping={order.shipping}
      total={order.total}
    />
  );
  const customerCard = (
    <DetailCustomerCard
      customer={customer}
      name={customerName(customer)}
      deliveryAddress={order.deliveryAddress}
      onOpenFicha={() =>
        customer && void navigate({ to: "/app/clientes/$id", params: { id: customer.id } })
      }
    />
  );
  const history = (
    <DetailHistory
      audits={audits}
      describeAction={describeAction}
      footer={
        seller ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Vendedor responsável: <span className="text-foreground">{seller.fullName}</span>
          </p>
        ) : undefined
      }
    />
  );

  const dialogs = (
    <>
      {/* PASTE the 8 existing dialog elements here, unchanged:
          MarkPaidDialog, StartFulfillmentDialog, ShipDialog, DeliverDialog,
          ReturnDialog, CancelDialog, RefundDialog, InvoiceDialog */}
    </>
  );

  let body: ReactNode;
  if (layout === "operational") {
    body = (
      <OperationalShell
        header={header}
        hero={hero}
        stepper={
          <div className="space-y-3">
            <StatusStepper steps={stepper.steps} terminal={stepper.terminal} />
            {banners}
          </div>
        }
        actions={actions}
        grid={
          <>
            {payment}
            {delivery}
            {commission}
          </>
        }
        main={
          <>
            {items}
            {summary}
            {customerCard}
            {history}
          </>
        }
      />
    );
  } else if (layout === "document") {
    body = (
      <DocumentShell
        header={header}
        docHeader={
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                GALLO BASE DIESEL
              </p>
              <h1 className="font-mono text-xl font-bold text-foreground">
                #{order.number ?? order.id.replace(/^order-/, "PD-")}
              </h1>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Criado em {formatDateTimeBR(order.createdAt)}</p>
              <div className="mt-1 flex justify-end">
                <OrderStatusBadge status={agg} />
              </div>
            </div>
          </div>
        }
        parties={
          <div className="grid gap-4 md:grid-cols-2">
            {customerCard}
            <OrderPaymentBlock
              order={order}
              canActOnOrder={false}
              isManagerOrOwner={false}
              onMarkPaid={() => undefined}
              onRefund={() => undefined}
            />
          </div>
        }
        items={items}
        totals={<div className="w-full max-w-xs">{summary}</div>}
        footer={
          <OrderDeliveryBlock
            order={order}
            canActOnOrder={false}
            editable={false}
            onStartFulfillment={() => undefined}
            onShip={() => undefined}
            onDeliver={() => undefined}
          />
        }
      />
    );
  } else {
    body = (
      <CockpitShell
        header={header}
        hero={
          <div className="space-y-3">
            {hero}
            {banners}
          </div>
        }
        kpis={<DetailStatStrip stats={stats} />}
        main={
          <>
            {items}
            {payment}
            {delivery}
            {commission}
            {history}
          </>
        }
        rail={
          <>
            <DetailCard icon="mdi:lightning-bolt-outline" title="Ações">
              {actions}
            </DetailCard>
            {summary}
            {customerCard}
          </>
        }
      />
    );
  }

  return (
    <>
      {body}
      {dialogs}
    </>
  );
```

- [ ] **Step 4: Remove now-unused locals** flagged by eslint — the local `SectionHeader`, `ValueSummary`, `paymentLabel`, and `fulfillmentLabel` helpers are superseded (by `DetailCard`, `DetailSummaryCard`, and the `ORDER_*_LABEL` maps). Keep `describeAction`, `customerName`, and `getCustomerName` import only if still referenced. Run eslint and delete what it reports as unused; the local `moneyFormatter`/`dateTimeFormatter` are likely unused after the rewrite — remove them.

- [ ] **Step 5: Gate** `OrderDetailPage.tsx` (`prettier` → `eslint` exit 0 → `tsc --noEmit | grep OrderDetailPage` empty), then **`bun run build`** (`✓ built`). Commit: `feat: redesign order detail with 3 selectable layouts`.

---

## Phase 4 — Verify + version bump

### Task 13: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Type-check the whole feature**

Run:
```bash
bunx tsc --noEmit 2>&1 | grep -E "detail-views|quoteDetailStats|orderDetailStats|QuoteDetailBlocks|OrderDetailBlocks|QuoteDetailPage|OrderDetailPage"
```
Expected: **no output** (baseline `tsc` errors in unrelated files are ignored — we only fail on regressions in touched files).

- [ ] **Step 2: Lint the feature**

Run:
```bash
bunx eslint src/shared/detail-views src/features/quotes/utils/quoteDetailStats.ts src/features/quotes/components/detail src/features/quotes/pages/QuoteDetailPage.tsx src/features/orders/utils/orderDetailStats.ts src/features/orders/components/detail src/features/orders/pages/OrderDetailPage.tsx
```
Expected: exit 0, no errors. Fix any unused-import / unused-var warnings (the removed `SectionHeader`/`ValueSummary`/`paymentLabel`/`fulfillmentLabel`/`moneyFormatter`/`dateTimeFormatter` locals).

- [ ] **Step 3: Production build**

Run: `bun run build` → Expected: `✓ built in …`.

- [ ] **Step 4: Manual UI validation (user)**

The user validates the UI manually (do NOT open a browser/devtools preview). Provide a short checklist for them:
- Both pages default to **Cockpit**; switcher offers Cockpit / Operacional / Documento; choice persists per page across reloads.
- Quote: send / accept / reject / cancel / convert / duplicate / WhatsApp / approve still work; SDR + approval banners show; validity/discount KPIs correct.
- Order: markPaid / start / ship / deliver / return / NF / cancel / refund / apply-to-vehicle still work; cancellation banner; payment/delivery/commission blocks correct; stepper advances with status.
- Documento layout is read-only (no action buttons) and reads like a printable doc.

No commit (verification only). If issues found, fix in the relevant file and re-gate before proceeding.

---

### Task 14: Version bump → v0.53.0 "Dossier"

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump `package.json`** — `"version": "0.52.0"` → `"version": "0.53.0"`. (`__APP_VERSION__` is injected from here, so the footer/Sobre page update automatically.)

- [ ] **Step 2: Add the CHANGELOG entry.** Insert **directly above** the existing `## [0.52.0] — Ledger · 2026-05-30` line. The heading MUST match the parser format exactly (em dash `—`, middle dot `·`, ISO date **last**) — `src/features/about/parser/parseChangelog.ts` will not show the release otherwise:

```markdown
## [0.53.0] — Dossier · 2026-05-31

### Added
- Ficha de **Orçamento** e **Pedido** com 3 visualizações selecionáveis — **Cockpit** (padrão), **Operacional** e **Documento** — alternáveis por um seletor no cabeçalho, com preferência lembrada por página.
- Faixa de KPIs e trilho lateral fixo (resumo, cliente, ações) nas fichas de Orçamento e Pedido.
- Stepper de status no layout Operacional (rascunho→convertido / aguardando pagamento→concluído), com estados terminais para recusado/expirado/cancelado/devolvido.
- Framework compartilhado `src/shared/detail-views/` (config de layout, hook de persistência, seletor, faixa de KPIs, stepper, blocos de resumo/cliente/histórico e shells de layout).

### Changed
- Páginas de detalhe de Orçamento e Pedido passam a usar layout amplo (até 1600px) em vez da coluna central estreita, eliminando o desperdício de espaço lateral.
```

- [ ] **Step 3: Update `CLAUDE.md`** — the versioning line `(atual: \`Ledger\` — v0.52.0)` → `(atual: \`Dossier\` — v0.53.0)`.

- [ ] **Step 4:** `bun run build` (`✓ built`) to confirm the version injection compiles. Commit (stage `package.json`, `CHANGELOG.md`, `CLAUDE.md`): `chore: release v0.53.0 "Dossier" — detail views redesign`.

---

## Plan Self-Review

Cross-checked before handoff:

- **Spec coverage:** 3 layouts + header switcher (Tasks 1–2, 6, 9, 12) · per-page persistence keys (Task 1) · shared framework (Phase 1) · KPI strips (Tasks 7, 10) · steppers (Tasks 7, 10) · preserve-behavior (Tasks 9, 12 keep all handlers/dialogs) · version bump (Task 14). Every spec section maps to a task.
- **Type consistency:** `DetailStatStrip` consumes `stats: IDetailStat[]` (pages pass `stats`; utils return `IDetailStat[]`). `StatusStepper` consumes `{steps, terminal}` (utils return exactly that). Shell slot names match the page call-sites 1:1. Barrel exports every symbol the pages import (incl. `DetailCard`, `IOrderCommissionStat`). `Record<Union,string>` label maps are keyed by the exact status unions (safe under `noUncheckedIndexedAccess`).
- **Rules of Hooks:** `useDetailLayout` + `useMemo`s are placed with the other hooks **before** the early returns; `stats`/`stepper` memos guard `quote`/`order` undefined.
- **No raw tokens:** new components use semantic tokens; status colors reuse the badges' `emerald/amber/rose/orange` precedent; `warning`/`success` tokens kept only where they already existed (commission block).
- **No placeholders:** the only "paste" instructions move **existing verbatim** dialog blocks (precisely identified) — not vague stubs.

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review (spec compliance → code quality) between tasks, fast iteration in this session.
2. **Inline Execution** — execute tasks here in batches with checkpoints.

Phases are ordered so each ends green: Phase 1 (framework) compiles standalone; Phases 2/3 each batch their util+blocks+page so no half-rewritten page is left between commits; Phase 4 verifies + bumps.
