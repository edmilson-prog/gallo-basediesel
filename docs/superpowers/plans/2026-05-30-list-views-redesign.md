# List Views Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar as listas de Orçamentos (`/app/orcamentos`) e Pedidos (`/app/pedidos`) com tabela fluida, faixa de KPIs, abas de status e 3 visualizações selecionáveis (Cockpit/Console/Linhas), sobre um framework compartilhado.

**Architecture:** Um módulo genérico `src/shared/list-views/` (tipo+config, hook de persistência, seletor segmentado, faixa de KPIs, abas de status, 3 shells de arranjo) consumido por duas páginas que fornecem as "ligações" de domínio (cálculo de KPIs, contagens, tabelas e composição). KPIs e contagens são calculados no cliente sobre o conjunto já carregado (`pageSize: 1000`), exposto pelos hooks como `allFiltered` (pós-filtros-comuns, pré-status).

**Tech Stack:** React 19, TanStack Router/Query, Tailwind v4, shadcn/ui (new-york), Iconify (`@iconify/react`), recharts (não usado aqui). Gerenciador: **bun**.

---

## Convenções deste plano (LEIA antes de começar)

- **Não há test runner** no projeto, e **`vite build` (= `bun run build`) NÃO faz type-check** — só empacota. Além disso, a árvore **já tem erros de `tsc` pré-existentes** em arquivos não relacionados (a equipe nunca rodou `tsc`; `noUncheckedIndexedAccess` está ligado). Portanto o **portão de verificação de cada task**, nesta ordem, sobre os arquivos tocados:
  1. `bunx prettier --write <arquivos>` (normaliza, inclusive CRLF→LF)
  2. `bunx eslint <arquivos>` → **exit 0**
  3. `bunx tsc --noEmit 2>&1 | grep -F <cada-arquivo-tocado>` → **sem saída** (nenhum erro de tipo nos SEUS arquivos; ignore os erros pré-existentes em outros arquivos)
  - Ao final de cada FASE (Tasks 8 e 14) rodar também `bun run build` → `✓ built` (garante que o bundle/imports compilam).
  - ⚠️ **Onde as tasks abaixo dizem `bun run build` na verificação por-task, leia: use o portão acima (`tsc --noEmit` filtrado nos seus arquivos).**
- ⚠️ **`noUncheckedIndexedAccess` está ligado:** acesso por índice de array vira `T | undefined`. Ex.: `filters.statuses[0]` é `QuoteStatus | undefined` — use `?? "all"` quando alimentar um `string`. (Acesso a `Record<UnionExata, V>` por chave da união continua `V`, sem `undefined`.)
- **Só tokens semânticos** para estrutura/superfície (`bg-background`, `bg-card`, `bg-card/60`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, `text-primary`, `text-destructive`). Cores de status/tone usam a paleta `emerald/amber/rose/blue/violet/orange` **idêntica aos badges existentes** (precedente). Nunca hex direto nem `--gallo-*`.
- **UI em pt-BR** com acentos corretos. **Código/identificadores em inglês.** Componentes `PascalCase`, arquivos `kebab-case`? → **Atenção:** este repo usa **PascalCase nos arquivos de componente** (ex.: `QuotesTable.tsx`, `CustomerStatStrip.tsx`) e camelCase em utils/hooks (`quoteTotals.ts`, `useQuotesList.ts`). Siga o padrão do diretório vizinho.
- **Commits** Conventional Commits em inglês, atômicos (um por task). Trailer obrigatório:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- O plano tem 14 tasks em 2 fases. **Fase 1** (Tasks 1–8) = framework + Orçamentos. **Fase 2** (Tasks 9–14) = Pedidos + bump de versão.

---

## Estrutura de arquivos

**Compartilhado — `src/shared/list-views/`** (Fase 1)
| Arquivo | Responsabilidade |
|---|---|
| `config.ts` | `ListLayout`, `LIST_LAYOUTS`, `DEFAULT_LIST_LAYOUT`, chaves localStorage, labels/ícones/dicas |
| `useListLayout.ts` | hook `[layout, setLayout]` com leitura síncrona do localStorage |
| `ListStatStrip.tsx` | faixa de KPIs (`IStatCell[]`, `orientation`) |
| `ListStatusTabs.tsx` | abas de status (`IStatusTab[]`, `activeKey`, `onSelect`, `orientation`) |
| `ListLayoutSwitcher.tsx` | `ToggleGroup` segmentado |
| `LayoutShells.tsx` | `CockpitShell`, `ConsoleShell`, `RowsShell` |
| `index.ts` | barrel |

**Orçamentos — `src/features/quotes/`** (Fase 1): `utils/quoteListStats.ts` (novo), `hooks/useQuotesList.ts` (mod), `components/list/QuotesTable.tsx` (mod), `components/list/QuotesTableRows.tsx` (novo), `components/list/QuotesFiltersBar.tsx` (mod), `components/list/QuotesHeader.tsx` (mod), `pages/QuotesListPage.tsx` (mod).

**Pedidos — `src/features/orders/`** (Fase 2): análogos. Bump em `package.json` + `CHANGELOG.md` + `CLAUDE.md`.

---

# FASE 1 — Framework compartilhado + Orçamentos

### Task 1: Config compartilhada + hook de persistência

**Files:**
- Create: `src/shared/list-views/config.ts`
- Create: `src/shared/list-views/useListLayout.ts`

- [ ] **Step 1: Criar `src/shared/list-views/config.ts`**

```ts
/** A selectable layout for the commercial list pages (quotes, orders). */
export type ListLayout = "cockpit" | "console" | "rows";

export const LIST_LAYOUTS: readonly ListLayout[] = ["cockpit", "console", "rows"] as const;

export const DEFAULT_LIST_LAYOUT: ListLayout = "cockpit";

/** localStorage keys — one per list, so each list remembers its own view. */
export const QUOTES_LIST_LAYOUT_KEY = "gallo-quotes-list-layout";
export const ORDERS_LIST_LAYOUT_KEY = "gallo-orders-list-layout";

export const LIST_LAYOUT_LABELS: Record<ListLayout, string> = {
  cockpit: "Cockpit",
  console: "Console",
  rows: "Linhas",
};

export const LIST_LAYOUT_ICONS: Record<ListLayout, string> = {
  cockpit: "mdi:view-dashboard-outline",
  console: "mdi:view-split-vertical",
  rows: "mdi:view-sequential-outline",
};

export const LIST_LAYOUT_HINTS: Record<ListLayout, string> = {
  cockpit: "Indicadores e abas no topo, tabela ampla",
  console: "Indicadores e filtros num trilho à esquerda",
  rows: "Linhas com mais detalhe por item",
};
```

- [ ] **Step 2: Criar `src/shared/list-views/useListLayout.ts`**

```ts
import { useCallback, useState } from "react";
import { DEFAULT_LIST_LAYOUT, LIST_LAYOUTS, type ListLayout } from "./config";

function readLayout(storageKey: string): ListLayout {
  if (typeof window === "undefined") return DEFAULT_LIST_LAYOUT;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw && (LIST_LAYOUTS as readonly string[]).includes(raw)) {
      return raw as ListLayout;
    }
  } catch {
    // localStorage indisponível — usa o padrão.
  }
  return DEFAULT_LIST_LAYOUT;
}

/**
 * Selected list layout persisted to localStorage under `storageKey`.
 * Synchronous read in the lazy initializer avoids any flash of the default.
 */
export function useListLayout(storageKey: string): [ListLayout, (layout: ListLayout) => void] {
  const [layout, setLayoutState] = useState<ListLayout>(() => readLayout(storageKey));

  const setLayout = useCallback(
    (next: ListLayout) => {
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

- [ ] **Step 3: Verificar**

```bash
bunx prettier --write src/shared/list-views/config.ts src/shared/list-views/useListLayout.ts
bunx eslint src/shared/list-views/config.ts src/shared/list-views/useListLayout.ts
bun run build
```
Esperado: prettier ok, eslint exit 0, build `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/list-views/config.ts src/shared/list-views/useListLayout.ts
git commit -m "feat: add shared list-view config and layout persistence hook" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Faixa de KPIs + abas de status (compartilhados)

**Files:**
- Create: `src/shared/list-views/ListStatStrip.tsx`
- Create: `src/shared/list-views/ListStatusTabs.tsx`

- [ ] **Step 1: Criar `src/shared/list-views/ListStatStrip.tsx`**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";

export type StatTone = "default" | "good" | "warn" | "bad";

export interface IStatCell {
  /** Iconify name (mdi:*). */
  icon: string;
  label: string;
  /** Pre-formatted value (R$, %, count). */
  value: ReactNode;
  tone?: StatTone;
}

const TONE_CLASS: Record<StatTone, string> = {
  default: "text-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

/** Column count per cell-count, kept static so Tailwind can see the classes. */
const HORIZONTAL_COLS: Record<number, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

export interface IListStatStripProps {
  cells: IStatCell[];
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Full-width KPI strip for list pages. Mirrors CustomerStatStrip: hairline cells
 * via gap-px on a bg-border parent with bg-card cells; semantic tokens only.
 * `vertical` stacks the cells in a single column (used by the Console rail).
 */
export function ListStatStrip({
  cells,
  orientation = "horizontal",
  className,
}: IListStatStripProps) {
  const cols =
    orientation === "vertical"
      ? "grid-cols-1"
      : (HORIZONTAL_COLS[cells.length] ?? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5");
  return (
    <dl className={cn("grid gap-px overflow-hidden rounded-lg bg-border", cols, className)}>
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={11} />
            {cell.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-sm font-semibold tabular-nums",
              TONE_CLASS[cell.tone ?? "default"],
            )}
          >
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 2: Criar `src/shared/list-views/ListStatusTabs.tsx`**

```tsx
import { cn } from "@/lib/utils";

export interface IStatusTab {
  /** Status value, or "all" for the "Todos" tab. */
  key: string;
  label: string;
  count: number;
  /** Optional solid color dot (e.g. "bg-blue-500"). */
  dotClassName?: string;
}

export interface IListStatusTabsProps {
  tabs: IStatusTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/** Status quick-filter as a row (or column) of pill tabs with counts. */
export function ListStatusTabs({
  tabs,
  activeKey,
  onSelect,
  orientation = "horizontal",
  className,
}: IListStatusTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Filtrar por status"
      className={cn(
        "flex gap-1.5",
        orientation === "vertical" ? "flex-col" : "flex-wrap items-center",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(tab.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {tab.dotClassName && (
              <span className={cn("h-1.5 w-1.5 rounded-full", tab.dotClassName)} />
            )}
            <span>{tab.label}</span>
            <span className={cn("tabular-nums", active ? "text-primary" : "text-muted-foreground/70")}>
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verificar**

```bash
bunx prettier --write src/shared/list-views/ListStatStrip.tsx src/shared/list-views/ListStatusTabs.tsx
bunx eslint src/shared/list-views/ListStatStrip.tsx src/shared/list-views/ListStatusTabs.tsx
bun run build
```
Esperado: eslint exit 0, build `✓ built`.

- [ ] **Step 4: Commit**

```bash
git add src/shared/list-views/ListStatStrip.tsx src/shared/list-views/ListStatusTabs.tsx
git commit -m "feat: add shared list KPI strip and status tabs" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Seletor segmentado + shells + barrel

**Files:**
- Create: `src/shared/list-views/ListLayoutSwitcher.tsx`
- Create: `src/shared/list-views/LayoutShells.tsx`
- Create: `src/shared/list-views/index.ts`

- [ ] **Step 1: Criar `src/shared/list-views/ListLayoutSwitcher.tsx`**

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import {
  LIST_LAYOUTS,
  LIST_LAYOUT_HINTS,
  LIST_LAYOUT_ICONS,
  LIST_LAYOUT_LABELS,
  type ListLayout,
} from "./config";

export interface IListLayoutSwitcherProps {
  value: ListLayout;
  onChange: (layout: ListLayout) => void;
}

/** Segmented control to switch a list page's layout. Mirrors VehicleLayoutSwitcher. */
export function ListLayoutSwitcher({ value, onChange }: IListLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as ListLayout);
      }}
      variant="outline"
      size="sm"
      aria-label="Escolher visualização da lista"
    >
      {LIST_LAYOUTS.map((layout) => (
        <ToggleGroupItem
          key={layout}
          value={layout}
          aria-label={LIST_LAYOUT_LABELS[layout]}
          title={LIST_LAYOUT_HINTS[layout]}
        >
          <Icon icon={LIST_LAYOUT_ICONS[layout]} size={16} />
          <span className="ml-1 hidden lg:inline">{LIST_LAYOUT_LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 2: Criar `src/shared/list-views/LayoutShells.tsx`**

```tsx
import type { ReactNode } from "react";

/**
 * Cockpit: pinned strip + tabs (padded) above a full-bleed filters bar; only the
 * table scrolls. The filters slot brings its own bar chrome (border-b/px).
 */
export function CockpitShell({
  strip,
  tabs,
  filters,
  table,
}: {
  strip: ReactNode;
  tabs: ReactNode;
  filters: ReactNode;
  table: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 space-y-3 px-4 pb-3 pt-4 md:px-6">
        {strip}
        {tabs}
      </div>
      {filters}
      <div className="min-h-0 flex-1 overflow-auto">{table}</div>
    </div>
  );
}

/**
 * Console: left rail (vertical strip + status + stacked filters) beside a
 * scrolling table. On < md the rail stacks above the table.
 */
export function ConsoleShell({ rail, table }: { rail: ReactNode; table: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="shrink-0 space-y-3 overflow-y-auto border-b border-border p-4 md:w-72 md:border-b-0 md:border-r">
        {rail}
      </aside>
      <div className="min-h-0 flex-1 overflow-auto">{table}</div>
    </div>
  );
}

/** Rows: compact strip (padded) + full-bleed filters bar; the enriched table scrolls. */
export function RowsShell({
  strip,
  filters,
  table,
}: {
  strip: ReactNode;
  filters: ReactNode;
  table: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-4 md:px-6">{strip}</div>
      {filters}
      <div className="min-h-0 flex-1 overflow-auto">{table}</div>
    </div>
  );
}
```

- [ ] **Step 3: Criar `src/shared/list-views/index.ts`**

```ts
export * from "./config";
export { useListLayout } from "./useListLayout";
export { ListLayoutSwitcher } from "./ListLayoutSwitcher";
export type { IListLayoutSwitcherProps } from "./ListLayoutSwitcher";
export { ListStatStrip } from "./ListStatStrip";
export type { IStatCell, StatTone, IListStatStripProps } from "./ListStatStrip";
export { ListStatusTabs } from "./ListStatusTabs";
export type { IStatusTab, IListStatusTabsProps } from "./ListStatusTabs";
export { CockpitShell, ConsoleShell, RowsShell } from "./LayoutShells";
```

- [ ] **Step 4: Verificar**

```bash
bunx prettier --write src/shared/list-views/ListLayoutSwitcher.tsx src/shared/list-views/LayoutShells.tsx src/shared/list-views/index.ts
bunx eslint src/shared/list-views/ListLayoutSwitcher.tsx src/shared/list-views/LayoutShells.tsx src/shared/list-views/index.ts
bun run build
```
Esperado: build `✓ built`. (Confirma que `@/components/ui/toggle-group` existe — já é usado por `VehicleLayoutSwitcher`.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/list-views/ListLayoutSwitcher.tsx src/shared/list-views/LayoutShells.tsx src/shared/list-views/index.ts
git commit -m "feat: add shared list layout switcher and arrangement shells" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: KPIs e contagens de Orçamentos

**Files:**
- Create: `src/features/quotes/utils/quoteListStats.ts`

- [ ] **Step 1: Criar `src/features/quotes/utils/quoteListStats.ts`**

```ts
import type { IQuote, QuoteStatus } from "@/shared/types";
import type { IStatCell } from "@/shared/list-views";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { validityBucket } from "./quoteTotals";

/** Statuses that count as "presented to the customer" (left draft). */
const PRESENTED: readonly QuoteStatus[] = [
  "enviado",
  "aceito",
  "recusado",
  "expirado",
  "convertido",
];

const sumTotal = (list: IQuote[]): number => list.reduce((acc, q) => acc + q.total, 0);

/**
 * The 5 KPI cells for the quotes list, computed over `quotes` (the pre-status
 * filtered set). `now` is injected for deterministic validity math.
 */
export function quoteStatCells(quotes: IQuote[], now: Date): IStatCell[] {
  const open = quotes.filter((q) => q.status === "rascunho" || q.status === "enviado");
  const converted = quotes.filter((q) => q.status === "convertido");
  const presented = quotes.filter((q) => PRESENTED.includes(q.status));

  const conversion = presented.length > 0 ? converted.length / presented.length : null;
  const ticket = quotes.length > 0 ? sumTotal(quotes) / quotes.length : null;
  const expiring = quotes.filter((q) => {
    if (q.status !== "enviado") return false;
    const bucket = validityBucket(q.validUntil, now);
    return bucket === "critical" || bucket === "warning";
  }).length;

  return [
    { icon: "mdi:cash-clock", label: "Em aberto", value: formatBRL(sumTotal(open)) },
    {
      icon: "mdi:swap-horizontal-bold",
      label: "Convertido",
      value: formatBRL(sumTotal(converted)),
      tone: "good",
    },
    { icon: "mdi:trending-up", label: "Conversão", value: formatPercent(conversion, 0) },
    { icon: "mdi:cash-multiple", label: "Ticket médio", value: formatBRL(ticket) },
    {
      icon: "mdi:clock-alert-outline",
      label: "Expirando ≤3d",
      value: expiring,
      tone: expiring > 0 ? "warn" : "default",
    },
  ];
}

/** Count of quotes per status, over the pre-status filtered set (for the tabs). */
export function quoteStatusCounts(quotes: IQuote[]): Record<QuoteStatus, number> {
  const counts: Record<QuoteStatus, number> = {
    rascunho: 0,
    enviado: 0,
    aceito: 0,
    recusado: 0,
    expirado: 0,
    convertido: 0,
  };
  for (const q of quotes) counts[q.status] += 1;
  return counts;
}
```

- [ ] **Step 2: Verificar**

```bash
bunx prettier --write src/features/quotes/utils/quoteListStats.ts
bunx eslint src/features/quotes/utils/quoteListStats.ts
bun run build
```
Esperado: build `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/utils/quoteListStats.ts
git commit -m "feat: add quote list KPI and status-count derivations" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Expor `allFiltered` em `useQuotesList` (status no cliente)

**Files:**
- Modify: `src/features/quotes/hooks/useQuotesList.ts`

Contexto: hoje o `status` é enviado ao provider (`params.status`) e a paginação é client-side. Para alimentar abas/KPIs com contagens por status, movemos o filtro de status para o cliente e expomos `allFiltered` (conjunto pós-filtros-comuns, **pré-status**, pré-paginação).

- [ ] **Step 1: Adicionar `allFiltered` à interface de retorno**

Em `src/features/quotes/hooks/useQuotesList.ts`, na interface `IQuotesListQuery`, adicionar o campo logo após `data`:

```ts
export interface IQuotesListQuery {
  data: IQuote[];
  /** Full filtered set BEFORE the status filter and pagination — feeds KPIs/tabs. */
  allFiltered: IQuote[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}
```

- [ ] **Step 2: Remover `status` dos params do provider**

No `useMemo` de `params`, **apagar** a linha:

```ts
      status: filters.statuses.length > 0 ? filters.statuses : undefined,
```

(As demais linhas — `storeId`, `sellerId`, `origin`, `customerId`, datas, `search`, `orderBy`, `orderDir`, `page`, `pageSize` — permanecem inalteradas.)

- [ ] **Step 3: Aplicar status no cliente e expor `allFiltered`**

Substituir o bloco `const result = useMemo(...)` inteiro por:

```ts
  const result = useMemo(() => {
    const fetched = query.data?.data ?? [];
    // allFiltered = todos os filtros comuns + vendedor, MAS sem status nem paginação.
    let allFiltered = applyClientFilters(fetched, filters);
    if (options.sellerIdLock && filters.sellerIds.length === 0) {
      allFiltered = allFiltered.filter((q) => q.sellerId === options.sellerIdLock);
    } else if (filters.sellerIds.length > 0) {
      const set = new Set(filters.sellerIds);
      allFiltered = allFiltered.filter((q) => set.has(q.sellerId));
    }
    // afterStatus aplica o filtro de status (agora client-side) sobre allFiltered.
    const statusSet = new Set(filters.statuses);
    const afterStatus =
      statusSet.size > 0 ? allFiltered.filter((q) => statusSet.has(q.status)) : allFiltered;
    const sorted = sortQuotes(afterStatus, sort, options.customersById, options.sellersById);
    const start = (page - 1) * pageSize;
    return {
      paged: sorted.slice(start, start + pageSize),
      total: sorted.length,
      allFiltered,
    };
  }, [
    query.data,
    filters,
    sort,
    page,
    pageSize,
    options.sellerIdLock,
    options.customersById,
    options.sellersById,
  ]);
```

- [ ] **Step 4: Retornar `allFiltered`**

No `return` final do hook, adicionar o campo:

```ts
  return {
    data: result.paged,
    allFiltered: result.allFiltered,
    total: result.total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["quotes-list"] }),
  };
```

- [ ] **Step 5: Verificar**

```bash
bunx prettier --write src/features/quotes/hooks/useQuotesList.ts
bunx eslint src/features/quotes/hooks/useQuotesList.ts
bun run build
```
Esperado: build `✓ built`. (Se o build acusar `allFiltered` não usado, é esperado até a Task 8 — mas como é só adição de campo retornado, compila.)

- [ ] **Step 6: Commit**

```bash
git add src/features/quotes/hooks/useQuotesList.ts
git commit -m "feat: expose pre-status filtered quote set for KPIs and tabs" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tabela de Orçamentos fluida + variante de linhas duplas

**Files:**
- Modify: `src/features/quotes/components/list/QuotesTable.tsx` (1 linha)
- Create: `src/features/quotes/components/list/QuotesTableRows.tsx`

- [ ] **Step 1: Tornar a `QuotesTable` fluida**

Em `src/features/quotes/components/list/QuotesTable.tsx`, trocar a abertura da `<Table>` (atualmente `<Table className="table-fixed" style={{ width: totalWidth }}>`) por:

```tsx
    <Table className="w-full table-fixed" style={{ minWidth: totalWidth }}>
```

Com `w-full` + `min-width`, a tabela preenche o container (some o vazio lateral) e só rola na horizontal quando a janela é menor que `minWidth`. O `overflow-auto` do shell cuida da rolagem; o redimensionamento de colunas (`useResizableColumns`) segue funcionando.

- [ ] **Step 2: Criar `src/features/quotes/components/list/QuotesTableRows.tsx`**

```tsx
import type { ICustomer, ID, IQuote, ISeller } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QuoteStatusBadge } from "../QuoteStatusBadge";
import { QuoteOriginBadge } from "../QuoteOriginBadge";
import { daysUntil, validityBucket } from "../../utils/quoteTotals";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

function validityLabel(validUntil: string, now: Date): { text: string; className: string } {
  const bucket = validityBucket(validUntil, now);
  const days = daysUntil(validUntil, now);
  if (bucket === "expired") return { text: "vencido", className: "text-destructive" };
  if (bucket === "critical" || bucket === "warning") {
    return { text: `vence em ${days}d`, className: "text-amber-600 dark:text-amber-400" };
  }
  return { text: `válido · ${days}d`, className: "text-muted-foreground" };
}

export interface IQuotesTableRowsProps {
  quotes: IQuote[];
  isLoading: boolean;
  now: Date;
  onRowClick: (id: ID) => void;
  sellers: Map<ID, ISeller>;
  customers: Map<ID, ICustomer>;
}

/** Two-line ("comfortable") quote rows for the Rows layout — more context per row. */
export function QuotesTableRows({
  quotes,
  isLoading,
  now,
  onRowClick,
  sellers,
  customers,
}: IQuotesTableRowsProps) {
  if (isLoading && quotes.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table className="w-full">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Orçamento / Cliente</TableHead>
          <TableHead className="w-40">Origem / Vendedor</TableHead>
          <TableHead className="w-32 text-right">Total / Itens</TableHead>
          <TableHead className="w-44">Status / Validade</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map((q) => {
          const customer = q.customerId ? customers.get(q.customerId) : undefined;
          const seller = sellers.get(q.sellerId);
          const sellerName = seller?.fullName ?? (q.sellerId === "sdr-agent" ? "Agente SDR" : "—");
          const city = customer?.address?.city;
          const validity = validityLabel(q.validUntil, now);
          return (
            <TableRow
              key={q.id}
              className="cursor-pointer transition-colors hover:bg-muted/60"
              onClick={() => onRowClick(q.id)}
            >
              <TableCell className="py-2.5">
                <div className="font-medium text-foreground">
                  <span className="font-mono text-xs text-muted-foreground">#{q.number}</span>{" "}
                  <span className="uppercase">{customerName(customer)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{city ?? "—"}</div>
              </TableCell>
              <TableCell className="py-2.5">
                <QuoteOriginBadge origin={q.origin} size="sm" />
                <div className="mt-0.5 text-xs text-muted-foreground">{sellerName}</div>
              </TableCell>
              <TableCell className="py-2.5 text-right">
                <div className="font-semibold tabular-nums text-foreground">
                  {moneyFormatter.format(q.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {q.items.length} {q.items.length === 1 ? "item" : "itens"}
                </div>
              </TableCell>
              <TableCell className="py-2.5">
                <QuoteStatusBadge status={q.status} size="sm" />
                <div className={cn("mt-0.5 text-xs", validity.className)}>{validity.text}</div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 3: Verificar**

```bash
bunx prettier --write src/features/quotes/components/list/QuotesTable.tsx src/features/quotes/components/list/QuotesTableRows.tsx
bunx eslint src/features/quotes/components/list/QuotesTable.tsx src/features/quotes/components/list/QuotesTableRows.tsx
bun run build
```
Esperado: build `✓ built`. (Confirma que `QuoteOriginBadge` aceita `origin={q.origin}` — é como `QuotesTable` o usa.)

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/components/list/QuotesTable.tsx src/features/quotes/components/list/QuotesTableRows.tsx
git commit -m "feat: make quotes table fluid and add two-line rows variant" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Barra de filtros (remover Status, add `stacked`) + header com seletor

**Files:**
- Modify: `src/features/quotes/components/list/QuotesFiltersBar.tsx`
- Modify: `src/features/quotes/components/list/QuotesHeader.tsx`

- [ ] **Step 1: Reescrever `QuotesFiltersBar.tsx`** (remove o popover "Status"; remove imports/consts órfãos `QUOTE_STATUS_META` e `STATUS_OPTIONS`; adiciona prop `stacked` e `cn`)

```tsx
import { useMemo } from "react";
import type { ISeller, IStore, QuoteOrigin } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activeFilterCount,
  type DateRangeBucket,
  type IQuotesListFilters,
  type ValidityBucket,
} from "../../utils/listFilters";
import { QUOTE_ORIGIN_META } from "../QuoteOriginBadge";

const ORIGIN_OPTIONS: QuoteOrigin[] = ["sdr", "vendedor", "cliente_portal", "ecommerce"];

const DATE_LABELS: Record<DateRangeBucket, string> = {
  any: "Qualquer período",
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  custom: "Personalizado",
};

const VALIDITY_LABELS: Record<ValidityBucket, string> = {
  any: "Qualquer validade",
  expiring_soon: "Expirando em 3 dias",
  expired: "Expirado",
  valid: "Válido",
};

export function QuotesFiltersBar({
  filters,
  patch,
  onClear,
  sellers,
  stores,
  canFilterStore,
  canFilterSeller,
  stacked = false,
}: {
  filters: IQuotesListFilters;
  patch: (p: Partial<IQuotesListFilters>) => void;
  onClear: () => void;
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
  /** Vertical, chrome-less layout for the Console rail. */
  stacked?: boolean;
}) {
  const filterCount = useMemo(() => activeFilterCount(filters), [filters]);

  const toggleArray = <T extends string>(arr: T[], value: T): T[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  return (
    <div
      className={cn(
        stacked
          ? "flex flex-col gap-2"
          : "flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-4 py-2 md:px-6",
      )}
    >
      {/* Origin */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:source-branch" size={14} />
            Origem
            {filters.origins.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.origins.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {ORIGIN_OPTIONS.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.origins.includes(o)}
                onCheckedChange={() => patch({ origins: toggleArray(filters.origins, o) })}
              />
              <span>{QUOTE_ORIGIN_META[o].label}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Sellers */}
      {canFilterSeller && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Icon icon="mdi:account-tie-outline" size={14} />
              Vendedor
              {filters.sellerIds.length > 0 && (
                <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {filters.sellerIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-64 space-y-1 overflow-y-auto">
            {sellers.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={filters.sellerIds.includes(s.id)}
                  onCheckedChange={() => patch({ sellerIds: toggleArray(filters.sellerIds, s.id) })}
                />
                <span className="truncate">{s.fullName}</span>
              </label>
            ))}
            {sellers.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum vendedor.</p>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Date range */}
      <Select
        value={filters.dateRange}
        onValueChange={(v) => patch({ dateRange: v as DateRangeBucket })}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(DATE_LABELS) as DateRangeBucket[]).map((k) => (
            <SelectItem key={k} value={k}>
              {DATE_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.dateRange === "custom" && (
        <>
          <Input
            type="date"
            className="h-9 w-36"
            value={filters.dateFrom ?? ""}
            onChange={(e) => patch({ dateFrom: e.target.value || undefined })}
          />
          <Input
            type="date"
            className="h-9 w-36"
            value={filters.dateTo ?? ""}
            onChange={(e) => patch({ dateTo: e.target.value || undefined })}
          />
        </>
      )}

      {/* Total */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:currency-brl" size={14} />
            Valor
            {(filters.totalMin !== undefined || filters.totalMax !== undefined) && (
              <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Mínimo (R$)</label>
            <Input
              type="number"
              value={filters.totalMin ?? ""}
              onChange={(e) =>
                patch({ totalMin: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Máximo (R$)</label>
            <Input
              type="number"
              value={filters.totalMax ?? ""}
              onChange={(e) =>
                patch({ totalMax: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Validity */}
      <Select
        value={filters.validity}
        onValueChange={(v) => patch({ validity: v as ValidityBucket })}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(VALIDITY_LABELS) as ValidityBucket[]).map((k) => (
            <SelectItem key={k} value={k}>
              {VALIDITY_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Store (Owner) */}
      {canFilterStore && stores.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Icon icon="mdi:store-outline" size={14} />
              Loja
              {filters.storeIds.length > 0 && (
                <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {filters.storeIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 space-y-1">
            {stores.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={filters.storeIds.includes(s.id)}
                  onCheckedChange={() => patch({ storeIds: toggleArray(filters.storeIds, s.id) })}
                />
                <span className="truncate">{s.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {filterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
          <Icon icon="mdi:close" size={14} />
          Limpar ({filterCount})
        </Button>
      )}
    </div>
  );
}
```

> ⚠️ **Atenção (`activeFilterCount`)**: essa função (em `../../utils/listFilters`) provavelmente conta `statuses` como filtro ativo. Como o status agora é controlado pelas abas (não pelo popover), abrir o arquivo `src/features/quotes/utils/listFilters.ts` e **manter `statuses` no cálculo** é aceitável (o "Limpar" geral ainda zera tudo, incluindo status). Não alterar `activeFilterCount` nesta task — apenas confirmar que compila. O botão "Limpar" chama `onClear` (limpa tudo, inclusive `statuses`), o que é o comportamento desejado.

- [ ] **Step 2: Atualizar `QuotesHeader.tsx`** (adicionar o seletor de layout)

Reescrever `src/features/quotes/components/list/QuotesHeader.tsx`:

```tsx
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListLayoutSwitcher, type ListLayout } from "@/shared/list-views";

export function QuotesHeader({
  total,
  searchValue,
  onSearchChange,
  canCreate,
  onCreate,
  layout,
  onLayoutChange,
}: {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  canCreate: boolean;
  onCreate: () => void;
  layout: ListLayout;
  onLayoutChange: (layout: ListLayout) => void;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border bg-card px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Orçamentos</h1>
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString("pt-BR")} {total === 1 ? "orçamento" : "orçamentos"} encontrado
          {total === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-full md:w-72">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            className="pl-8"
            placeholder="Buscar por número, cliente ou OEM…"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        {canCreate && (
          <Button onClick={onCreate} size="sm">
            <Icon icon="mdi:plus" size={16} />
            Orçamento
          </Button>
        )}
        <ListLayoutSwitcher value={layout} onChange={onLayoutChange} />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verificar**

```bash
bunx prettier --write src/features/quotes/components/list/QuotesFiltersBar.tsx src/features/quotes/components/list/QuotesHeader.tsx
bunx eslint src/features/quotes/components/list/QuotesFiltersBar.tsx src/features/quotes/components/list/QuotesHeader.tsx
bun run build
```
Esperado: build `✓ built`, sem `no-unused-vars` (os imports `QUOTE_STATUS_META`/`STATUS_OPTIONS` foram removidos).

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/components/list/QuotesFiltersBar.tsx src/features/quotes/components/list/QuotesHeader.tsx
git commit -m "feat: status tabs replace status popover; add layout switcher to quotes header" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Compor a `QuotesListPage` com as 3 visualizações

**Files:**
- Modify: `src/features/quotes/pages/QuotesListPage.tsx`

- [ ] **Step 1: Reescrever `QuotesListPage.tsx`**

```tsx
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller, QuoteStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  CockpitShell,
  ConsoleShell,
  ListStatStrip,
  ListStatusTabs,
  RowsShell,
  useListLayout,
  QUOTES_LIST_LAYOUT_KEY,
  type IStatusTab,
} from "@/shared/list-views";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { QuotesHeader } from "../components/list/QuotesHeader";
import { QuotesFiltersBar } from "../components/list/QuotesFiltersBar";
import { QuotesTable } from "../components/list/QuotesTable";
import { QuotesTableRows } from "../components/list/QuotesTableRows";
import { QuotesPagination } from "../components/list/QuotesPagination";
import { QUOTE_STATUS_META } from "../components/QuoteStatusBadge";
import { quoteStatCells, quoteStatusCounts } from "../utils/quoteListStats";
import { useQuotesList } from "../hooks/useQuotesList";
import { useQuotesUrlState } from "../hooks/useQuotesUrlState";

/** Status tab order + solid dot color (matches the badge palette). */
const STATUS_TAB_ORDER: QuoteStatus[] = [
  "rascunho",
  "enviado",
  "aceito",
  "recusado",
  "expirado",
  "convertido",
];
const STATUS_DOT: Record<QuoteStatus, string> = {
  rascunho: "bg-muted-foreground",
  enviado: "bg-blue-500",
  aceito: "bg-emerald-500",
  recusado: "bg-rose-500",
  expirado: "bg-orange-500",
  convertido: "bg-violet-500",
};

export function QuotesListPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const canCreate = usePermission("quote", "create");
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const { accessibleStores } = useCurrentStore();

  const [layout, setLayout] = useListLayout(QUOTES_LIST_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);

  const url = useQuotesUrlState();
  const { filters, sort, page, pageSize } = url;

  const sellerIdLock = !isManagerOrOwner && currentUser?.sellerId ? currentUser.sellerId : null;

  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();

  const sellersQuery = useQuery({
    queryKey: ["sellers-for-quotes"] as const,
    queryFn: () => sellersProvider.list({ active: true }),
    staleTime: 60_000,
  });
  const sellersMap = useMemo<Map<ID, ISeller>>(() => {
    const m = new Map<ID, ISeller>();
    (sellersQuery.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [sellersQuery.data]);
  const selectableSellers = useMemo<ISeller[]>(() => {
    const all = sellersQuery.data ?? [];
    if (!isManagerOrOwner && currentUser?.sellerId) {
      return all.filter((s) => s.id === currentUser.sellerId);
    }
    return all;
  }, [sellersQuery.data, isManagerOrOwner, currentUser?.sellerId]);

  const customersQuery = useQuery({
    queryKey: ["customers-for-quotes"] as const,
    queryFn: () => customersProvider.list({ pageSize: 500 }),
    staleTime: 60_000,
  });
  const customersMap = useMemo<Map<ID, ICustomer>>(() => {
    const m = new Map<ID, ICustomer>();
    (customersQuery.data?.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  const list = useQuotesList(filters, sort, page, pageSize, {
    sellerIdLock,
    customersById: customersMap,
    sellersById: sellersMap,
  });

  // KPIs + contagens de abas, sobre o conjunto pré-status (allFiltered).
  const statCells = useMemo(() => quoteStatCells(list.allFiltered, now), [list.allFiltered, now]);
  const statusTabs = useMemo<IStatusTab[]>(() => {
    const counts = quoteStatusCounts(list.allFiltered);
    return [
      { key: "all", label: "Todos", count: list.allFiltered.length },
      ...STATUS_TAB_ORDER.map((s) => ({
        key: s,
        label: QUOTE_STATUS_META[s].label,
        count: counts[s],
        dotClassName: STATUS_DOT[s],
      })),
    ];
  }, [list.allFiltered]);

  const activeStatusKey =
    filters.statuses.length === 1
      ? (filters.statuses[0] ?? "all")
      : filters.statuses.length === 0
        ? "all"
        : "";

  const onSelectStatus = (key: string) => {
    url.patchFilters({ statuses: key === "all" ? [] : [key as QuoteStatus] });
  };

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/orcamentos/$id", params: { id } });
  };
  const handleCreate = () => {
    void navigate({ to: "/app/orcamentos/novo" });
  };

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  const tableNode = list.isError ? (
    <ErrorState onRetry={list.refetch} />
  ) : showEmpty ? (
    <EmptyState canCreate={canCreate} onCreate={handleCreate} onClear={url.clearAll} />
  ) : layout === "rows" ? (
    <QuotesTableRows
      quotes={list.data}
      isLoading={list.isLoading}
      now={now}
      onRowClick={handleRowClick}
      sellers={sellersMap}
      customers={customersMap}
    />
  ) : (
    <QuotesTable
      quotes={list.data}
      isLoading={list.isLoading}
      sort={sort}
      onSortChange={url.setSort}
      onRowClick={handleRowClick}
      sellers={sellersMap}
      customers={customersMap}
    />
  );

  const filtersProps = {
    filters,
    patch: url.patchFilters,
    onClear: url.clearAll,
    sellers: selectableSellers,
    stores: accessibleStores,
    canFilterStore: isOwner,
    canFilterSeller: isManagerOrOwner,
  };

  let body: React.ReactNode;
  if (layout === "console") {
    body = (
      <ConsoleShell
        rail={
          <>
            <ListStatStrip cells={statCells} orientation="vertical" />
            <ListStatusTabs
              tabs={statusTabs}
              activeKey={activeStatusKey}
              onSelect={onSelectStatus}
              orientation="vertical"
            />
            <QuotesFiltersBar {...filtersProps} stacked />
          </>
        }
        table={tableNode}
      />
    );
  } else if (layout === "rows") {
    body = (
      <RowsShell
        strip={<ListStatStrip cells={statCells.slice(0, 3)} />}
        filters={<QuotesFiltersBar {...filtersProps} />}
        table={tableNode}
      />
    );
  } else {
    body = (
      <CockpitShell
        strip={<ListStatStrip cells={statCells} />}
        tabs={
          <ListStatusTabs tabs={statusTabs} activeKey={activeStatusKey} onSelect={onSelectStatus} />
        }
        filters={<QuotesFiltersBar {...filtersProps} />}
        table={tableNode}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem)]">
      <QuotesHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        canCreate={canCreate}
        onCreate={handleCreate}
        layout={layout}
        onLayoutChange={setLayout}
      />
      {body}
      <QuotesPagination
        page={page}
        pageSize={pageSize}
        total={list.total}
        onPageChange={url.setPage}
        onPageSizeChange={url.setPageSize}
      />
    </div>
  );
}

function EmptyState({
  canCreate,
  onCreate,
  onClear,
}: {
  canCreate: boolean;
  onCreate: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:file-document-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Nenhum orçamento encontrado</p>
        <p className="text-xs text-muted-foreground">
          Ajuste os filtros ou crie um orçamento manualmente.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onClear}>
          Limpar filtros
        </Button>
        {canCreate && (
          <Button size="sm" onClick={onCreate}>
            <Icon icon="mdi:plus" size={16} />
            Orçamento
          </Button>
        )}
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <Icon icon="mdi:alert-circle-outline" size={24} />
      </div>
      <p className="text-sm font-semibold text-foreground">Erro ao carregar</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
```

> Nota: o `EmptyState`/`ErrorState` ocupam `h-full`; dentro do `overflow-auto flex-1` do shell, centralizam corretamente.

- [ ] **Step 2: Verificar (gate da Fase 1)**

```bash
bunx prettier --write src/features/quotes/pages/QuotesListPage.tsx
bunx eslint src/features/quotes/pages/QuotesListPage.tsx
bun run build
```
Esperado: build `✓ built`. Confirmar que `QUOTE_STATUS_META` é exportado por `../components/QuoteStatusBadge` (é) e que `url.patchFilters`/`url.setSearch`/`url.setSort`/`url.setPage`/`url.setPageSize`/`url.clearAll` existem (já usados na versão anterior).

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/pages/QuotesListPage.tsx
git commit -m "feat: redesign quotes list with selectable cockpit/console/rows layouts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# FASE 2 — Pedidos + bump de versão

### Task 9: KPIs e contagens de Pedidos

**Files:**
- Create: `src/features/orders/utils/orderListStats.ts`

- [ ] **Step 1: Criar `src/features/orders/utils/orderListStats.ts`**

```ts
import type { IOrder, OrderStatus } from "@/shared/types";
import type { IStatCell } from "@/shared/list-views";
import { formatBRL } from "@/shared/utils/format";
import { computeOrderStatus, isPaymentOverdue } from "./orderStatus";

const sumTotal = (list: IOrder[]): number => list.reduce((acc, o) => acc + o.total, 0);

/**
 * The 5 KPI cells for the orders list, computed over `orders` (the pre-status
 * filtered set). `now` is injected for deterministic overdue math.
 */
export function orderStatCells(orders: IOrder[], now: Date): IStatCell[] {
  const active = orders.filter((o) => {
    const s = computeOrderStatus(o);
    return s !== "cancelado" && s !== "devolvido";
  });
  const received = orders.filter((o) => o.paymentStatus === "pago");
  const receivable = orders.filter(
    (o) =>
      o.paymentStatus === "pendente" ||
      o.paymentStatus === "parcial" ||
      o.paymentStatus === "vencido",
  );
  const toShip = orders.filter(
    (o) => !o.canceledAt && (o.fulfillmentStatus === "pendente" || o.fulfillmentStatus === "separacao"),
  ).length;
  const overdue = orders.filter(
    (o) => o.paymentStatus === "vencido" || isPaymentOverdue(o, now),
  ).length;

  return [
    { icon: "mdi:cash-multiple", label: "Valor total", value: formatBRL(sumTotal(active)) },
    {
      icon: "mdi:cash-check",
      label: "Recebido",
      value: formatBRL(sumTotal(received)),
      tone: "good",
    },
    { icon: "mdi:cash-clock", label: "A receber", value: formatBRL(sumTotal(receivable)) },
    {
      icon: "mdi:package-variant",
      label: "A expedir",
      value: toShip,
      tone: toShip > 0 ? "warn" : "default",
    },
    {
      icon: "mdi:alert-circle-outline",
      label: "Vencidos",
      value: overdue,
      tone: overdue > 0 ? "bad" : "default",
    },
  ];
}

/** Count of orders per aggregate status, over the pre-status filtered set (for the tabs). */
export function orderStatusCounts(orders: IOrder[]): Record<OrderStatus, number> {
  const counts: Record<OrderStatus, number> = {
    aguardando_pagamento: 0,
    pago_aguardando_envio: 0,
    em_separacao: 0,
    enviado: 0,
    entregue: 0,
    concluido: 0,
    cancelado: 0,
    devolvido: 0,
  };
  for (const o of orders) counts[computeOrderStatus(o)] += 1;
  return counts;
}
```

- [ ] **Step 2: Verificar**

```bash
bunx prettier --write src/features/orders/utils/orderListStats.ts
bunx eslint src/features/orders/utils/orderListStats.ts
bun run build
```
Esperado: build `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/features/orders/utils/orderListStats.ts
git commit -m "feat: add order list KPI and status-count derivations" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Expor `allFiltered` em `useOrdersList` (status separado)

**Files:**
- Modify: `src/features/orders/hooks/useOrdersList.ts`

- [ ] **Step 1: Adicionar `allFiltered` à interface**

Em `IOrdersListQuery`, adicionar após `data`:

```ts
export interface IOrdersListQuery {
  data: IOrder[];
  /** Full filtered set BEFORE the aggregate-status filter and pagination — feeds KPIs/tabs. */
  allFiltered: IOrder[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}
```

- [ ] **Step 2: Remover o bloco de status de `applyClientFilters`**

Dentro de `applyClientFilters`, **apagar** este bloco (o filtro de status agregado passa a ser aplicado depois, sobre `allFiltered`):

```ts
    if (filters.statuses.length > 0) {
      const agg = computeOrderStatus(o);
      if (!filters.statuses.includes(agg)) return false;
    }
```

(Os blocos de `totalMin/Max`, `storeIds`, `paymentStatuses`, `fulfillmentStatuses`, `origins` e `search` permanecem. `computeOrderStatus` continua importado — passa a ser usado no `useMemo` abaixo.)

- [ ] **Step 3: Reestruturar o `useMemo` de `result`**

Substituir o bloco `const result = useMemo(...)` inteiro por:

```ts
  const result = useMemo(() => {
    const fetched = query.data?.data ?? [];
    // allFiltered = filtros comuns + vendedor, MAS sem o status agregado nem paginação.
    let allFiltered = applyClientFilters(fetched, filters);
    if (options.sellerIdLock && filters.sellerIds.length === 0) {
      allFiltered = allFiltered.filter((o) => o.sellerId === options.sellerIdLock);
    } else if (filters.sellerIds.length > 0) {
      const set = new Set(filters.sellerIds);
      allFiltered = allFiltered.filter((o) => set.has(o.sellerId));
    }
    const statusSet = new Set(filters.statuses);
    const afterStatus =
      statusSet.size > 0
        ? allFiltered.filter((o) => statusSet.has(computeOrderStatus(o)))
        : allFiltered;
    const sorted = sortOrders(afterStatus, sort);
    const start = (page - 1) * pageSize;
    return {
      paged: sorted.slice(start, start + pageSize),
      total: sorted.length,
      allFiltered,
    };
  }, [query.data, filters, sort, page, pageSize, options.sellerIdLock]);
```

- [ ] **Step 4: Retornar `allFiltered`**

```ts
  return {
    data: result.paged,
    allFiltered: result.allFiltered,
    total: result.total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["orders-list"] }),
  };
```

- [ ] **Step 5: Verificar**

```bash
bunx prettier --write src/features/orders/hooks/useOrdersList.ts
bunx eslint src/features/orders/hooks/useOrdersList.ts
bun run build
```
Esperado: build `✓ built`.

- [ ] **Step 6: Commit**

```bash
git add src/features/orders/hooks/useOrdersList.ts
git commit -m "feat: expose pre-status filtered order set for KPIs and tabs" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Variante de linhas duplas de Pedidos

**Files:**
- Create: `src/features/orders/components/list/OrdersTableRows.tsx`

> A `OrdersTable` já usa o `<Table>` do shadcn (`w-full` + wrapper `overflow-auto`), então **já preenche a largura** — não precisa de alteração. Esta task só cria a variante de linhas.

- [ ] **Step 1: Criar `src/features/orders/components/list/OrdersTableRows.tsx`**

```tsx
import type {
  ICustomer,
  ID,
  IOrder,
  ISeller,
  OrderFulfillmentStatus,
  OrderPaymentStatus,
} from "@/shared/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "../OrderStatusBadge";
import { OrderOriginBadge } from "../OrderOriginBadge";
import { computeOrderStatus } from "../../utils/orderStatus";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_SHORT: Record<OrderPaymentStatus, string> = {
  pendente: "Pgto pendente",
  parcial: "Pgto parcial",
  pago: "Pago",
  estornado: "Estornado",
  vencido: "Pgto vencido",
};
const FULFILL_SHORT: Record<OrderFulfillmentStatus, string> = {
  pendente: "a separar",
  separacao: "em separação",
  expedido: "expedido",
  entregue: "entregue",
  cancelado: "cancelado",
  devolvido: "devolvido",
};

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

export interface IOrdersTableRowsProps {
  orders: IOrder[];
  isLoading: boolean;
  onRowClick: (id: ID) => void;
  sellers: Map<ID, ISeller>;
  customers: Map<ID, ICustomer>;
}

/** Two-line ("comfortable") order rows for the Rows layout — more context per row. */
export function OrdersTableRows({
  orders,
  isLoading,
  onRowClick,
  sellers,
  customers,
}: IOrdersTableRowsProps) {
  if (isLoading && orders.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table className="w-full">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Pedido / Cliente</TableHead>
          <TableHead className="w-40">Origem / Vendedor</TableHead>
          <TableHead className="w-32 text-right">Total / Itens</TableHead>
          <TableHead className="w-52">Status / Pagamento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const customer = customers.get(o.customerId);
          const seller = sellers.get(o.sellerId);
          const sellerName = seller?.fullName ?? (o.sellerId === "sdr-agent" ? "Agente SDR" : "—");
          const city = customer?.address?.city;
          const aggregate = computeOrderStatus(o);
          const number = o.number ?? o.id.replace(/^order-/, "PD-");
          return (
            <TableRow
              key={o.id}
              className="cursor-pointer transition-colors hover:bg-muted/60"
              onClick={() => onRowClick(o.id)}
            >
              <TableCell className="py-2.5">
                <div className="font-medium text-foreground">
                  <span className="font-mono text-xs text-muted-foreground">#{number}</span>{" "}
                  <span className="uppercase">{customerName(customer)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{city ?? "—"}</div>
              </TableCell>
              <TableCell className="py-2.5">
                <OrderOriginBadge order={o} size="sm" />
                <div className="mt-0.5 text-xs text-muted-foreground">{sellerName}</div>
              </TableCell>
              <TableCell className="py-2.5 text-right">
                <div className="font-semibold tabular-nums text-foreground">
                  {moneyFormatter.format(o.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {o.items.length} {o.items.length === 1 ? "item" : "itens"}
                </div>
              </TableCell>
              <TableCell className="py-2.5">
                <OrderStatusBadge status={aggregate} size="sm" />
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {PAYMENT_SHORT[o.paymentStatus]} · {FULFILL_SHORT[o.fulfillmentStatus]}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Verificar**

```bash
bunx prettier --write src/features/orders/components/list/OrdersTableRows.tsx
bunx eslint src/features/orders/components/list/OrdersTableRows.tsx
bun run build
```
Esperado: build `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/features/orders/components/list/OrdersTableRows.tsx
git commit -m "feat: add two-line rows variant for the orders table" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Barra de filtros de Pedidos (remover Status, add `stacked`) + header com seletor

**Files:**
- Modify: `src/features/orders/components/list/OrdersFiltersBar.tsx`
- Modify: `src/features/orders/components/list/OrdersHeader.tsx`

- [ ] **Step 1: Reescrever `OrdersFiltersBar.tsx`** (remove o popover "Status" agregado e a "pill" de status no fim; remove imports órfãos `ORDER_STATUS_META`, `orderStatusLabel`, `OrderStatus`, `STATUS_OPTIONS`; adiciona `cn` + prop `stacked`. Mantém Pagamento, Entrega, Origem, Vendedor, Período, Valor, Loja.)

```tsx
import { useMemo } from "react";
import type { ISeller, IStore, OrderFulfillmentStatus, OrderPaymentStatus } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  activeOrderFilterCount,
  type IOrdersListFilters,
  type OrderDateRangeBucket,
  type OrderOriginFilterKind,
} from "../../utils/listFilters";
import { ORDER_ORIGIN_META } from "../OrderOriginBadge";

const PAYMENT_OPTIONS: OrderPaymentStatus[] = [
  "pendente",
  "parcial",
  "pago",
  "estornado",
  "vencido",
];

const FULFILL_OPTIONS: OrderFulfillmentStatus[] = [
  "pendente",
  "separacao",
  "expedido",
  "entregue",
  "devolvido",
  "cancelado",
];

const ORIGIN_OPTIONS: OrderOriginFilterKind[] = ["sdr", "quote", "manual", "ecommerce", "portal"];

const DATE_LABELS: Record<OrderDateRangeBucket, string> = {
  any: "Qualquer período",
  "24h": "Últimas 24h",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  custom: "Personalizado",
};

const PAYMENT_LABELS: Record<OrderPaymentStatus, string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  estornado: "Estornado",
  vencido: "Vencido",
};

const FULFILL_LABELS: Record<OrderFulfillmentStatus, string> = {
  pendente: "Pendente",
  separacao: "Em separação",
  expedido: "Expedido",
  entregue: "Entregue",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

export function OrdersFiltersBar({
  filters,
  patch,
  onClear,
  sellers,
  stores,
  canFilterStore,
  canFilterSeller,
  stacked = false,
}: {
  filters: IOrdersListFilters;
  patch: (p: Partial<IOrdersListFilters>) => void;
  onClear: () => void;
  sellers: ISeller[];
  stores: IStore[];
  canFilterStore: boolean;
  canFilterSeller: boolean;
  /** Vertical, chrome-less layout for the Console rail. */
  stacked?: boolean;
}) {
  const filterCount = useMemo(() => activeOrderFilterCount(filters), [filters]);

  const toggleArray = <T extends string>(arr: T[], value: T): T[] =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  return (
    <div
      className={cn(
        stacked
          ? "flex flex-col gap-2"
          : "flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-4 py-2 md:px-6",
      )}
    >
      {/* Payment status */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:cash" size={14} />
            Pagamento
            {filters.paymentStatuses.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.paymentStatuses.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {PAYMENT_OPTIONS.map((p) => (
            <label
              key={p}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.paymentStatuses.includes(p)}
                onCheckedChange={() =>
                  patch({ paymentStatuses: toggleArray(filters.paymentStatuses, p) })
                }
              />
              <span>{PAYMENT_LABELS[p]}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Fulfillment status */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:truck-fast-outline" size={14} />
            Entrega
            {filters.fulfillmentStatuses.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.fulfillmentStatuses.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {FULFILL_OPTIONS.map((f) => (
            <label
              key={f}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.fulfillmentStatuses.includes(f)}
                onCheckedChange={() =>
                  patch({ fulfillmentStatuses: toggleArray(filters.fulfillmentStatuses, f) })
                }
              />
              <span>{FULFILL_LABELS[f]}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Origin */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:source-branch" size={14} />
            Origem
            {filters.origins.length > 0 && (
              <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                {filters.origins.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 space-y-1.5">
          {ORIGIN_OPTIONS.map((o) => (
            <label
              key={o}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={filters.origins.includes(o)}
                onCheckedChange={() => patch({ origins: toggleArray(filters.origins, o) })}
              />
              <span>{ORDER_ORIGIN_META[o].label}</span>
            </label>
          ))}
        </PopoverContent>
      </Popover>

      {/* Sellers */}
      {canFilterSeller && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Icon icon="mdi:account-tie-outline" size={14} />
              Vendedor
              {filters.sellerIds.length > 0 && (
                <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {filters.sellerIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-64 space-y-1 overflow-y-auto">
            {sellers.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={filters.sellerIds.includes(s.id)}
                  onCheckedChange={() => patch({ sellerIds: toggleArray(filters.sellerIds, s.id) })}
                />
                <span className="truncate">{s.fullName}</span>
              </label>
            ))}
            {sellers.length === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">Nenhum vendedor.</p>
            )}
          </PopoverContent>
        </Popover>
      )}

      {/* Date range */}
      <Select
        value={filters.dateRange}
        onValueChange={(v) => patch({ dateRange: v as OrderDateRangeBucket })}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(DATE_LABELS) as OrderDateRangeBucket[]).map((k) => (
            <SelectItem key={k} value={k}>
              {DATE_LABELS[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.dateRange === "custom" && (
        <>
          <Input
            type="date"
            className="h-9 w-36"
            value={filters.dateFrom ?? ""}
            onChange={(e) => patch({ dateFrom: e.target.value || undefined })}
          />
          <Input
            type="date"
            className="h-9 w-36"
            value={filters.dateTo ?? ""}
            onChange={(e) => patch({ dateTo: e.target.value || undefined })}
          />
        </>
      )}

      {/* Total range */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1">
            <Icon icon="mdi:currency-brl" size={14} />
            Valor
            {(filters.totalMin !== undefined || filters.totalMax !== undefined) && (
              <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground">Mínimo (R$)</label>
            <Input
              type="number"
              value={filters.totalMin ?? ""}
              onChange={(e) =>
                patch({ totalMin: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Máximo (R$)</label>
            <Input
              type="number"
              value={filters.totalMax ?? ""}
              onChange={(e) =>
                patch({ totalMax: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
        </PopoverContent>
      </Popover>

      {/* Store (Owner) */}
      {canFilterStore && stores.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Icon icon="mdi:store-outline" size={14} />
              Loja
              {filters.storeIds.length > 0 && (
                <span className="ml-1 rounded-md bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
                  {filters.storeIds.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 space-y-1">
            {stores.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={filters.storeIds.includes(s.id)}
                  onCheckedChange={() => patch({ storeIds: toggleArray(filters.storeIds, s.id) })}
                />
                <span className="truncate">{s.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {filterCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
          <Icon icon="mdi:close" size={14} />
          Limpar ({filterCount})
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Reescrever `OrdersHeader.tsx`** (adicionar o seletor)

```tsx
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { ListLayoutSwitcher, type ListLayout } from "@/shared/list-views";

export function OrdersHeader({
  total,
  searchValue,
  onSearchChange,
  layout,
  onLayoutChange,
}: {
  total: number;
  searchValue: string;
  onSearchChange: (q: string) => void;
  layout: ListLayout;
  onLayoutChange: (layout: ListLayout) => void;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-border bg-card px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Pedidos</h1>
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString("pt-BR")} {total === 1 ? "pedido" : "pedidos"} encontrado
          {total === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-full md:w-72">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            className="pl-8"
            placeholder="Buscar por número, NF ou rastreio…"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <ListLayoutSwitcher value={layout} onChange={onLayoutChange} />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verificar**

```bash
bunx prettier --write src/features/orders/components/list/OrdersFiltersBar.tsx src/features/orders/components/list/OrdersHeader.tsx
bunx eslint src/features/orders/components/list/OrdersFiltersBar.tsx src/features/orders/components/list/OrdersHeader.tsx
bun run build
```
Esperado: build `✓ built`, sem `no-unused-vars`.

- [ ] **Step 4: Commit**

```bash
git add src/features/orders/components/list/OrdersFiltersBar.tsx src/features/orders/components/list/OrdersHeader.tsx
git commit -m "feat: status tabs replace status popover; add layout switcher to orders header" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Compor a `OrdersListPage` com as 3 visualizações

**Files:**
- Modify: `src/features/orders/pages/OrdersListPage.tsx`

- [ ] **Step 1: Reescrever `OrdersListPage.tsx`**

```tsx
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, ISeller, OrderStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  CockpitShell,
  ConsoleShell,
  ListStatStrip,
  ListStatusTabs,
  RowsShell,
  useListLayout,
  ORDERS_LIST_LAYOUT_KEY,
  type IStatusTab,
} from "@/shared/list-views";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";
import { useCustomersProvider } from "@/providers/data/hooks/useCustomersProvider";
import { OrdersHeader } from "../components/list/OrdersHeader";
import { OrdersFiltersBar } from "../components/list/OrdersFiltersBar";
import { OrdersTable } from "../components/list/OrdersTable";
import { OrdersTableRows } from "../components/list/OrdersTableRows";
import { OrdersPagination } from "../components/list/OrdersPagination";
import { ORDER_STATUS_META } from "../components/OrderStatusBadge";
import { orderStatCells, orderStatusCounts } from "../utils/orderListStats";
import { useOrdersList } from "../hooks/useOrdersList";
import { useOrdersUrlState } from "../hooks/useOrdersUrlState";

const STATUS_TAB_ORDER: OrderStatus[] = [
  "aguardando_pagamento",
  "pago_aguardando_envio",
  "em_separacao",
  "enviado",
  "entregue",
  "concluido",
  "cancelado",
  "devolvido",
];
const STATUS_DOT: Record<OrderStatus, string> = {
  aguardando_pagamento: "bg-amber-500",
  pago_aguardando_envio: "bg-blue-500",
  em_separacao: "bg-violet-500",
  enviado: "bg-sky-500",
  entregue: "bg-teal-500",
  concluido: "bg-emerald-500",
  cancelado: "bg-rose-500",
  devolvido: "bg-orange-500",
};

export function OrdersListPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const role = useCurrentRole();
  const isManagerOrOwner = role === "Owner" || role === "Gestor";
  const isOwner = role === "Owner";
  const { accessibleStores } = useCurrentStore();

  const [layout, setLayout] = useListLayout(ORDERS_LIST_LAYOUT_KEY);
  const now = useMemo(() => new Date(), []);

  const url = useOrdersUrlState();
  const { filters, sort, page, pageSize } = url;

  const sellerIdLock = !isManagerOrOwner && currentUser?.sellerId ? currentUser.sellerId : null;

  const list = useOrdersList(filters, sort, page, pageSize, { sellerIdLock });

  const sellersProvider = useSellersProvider();
  const customersProvider = useCustomersProvider();

  const sellersQuery = useQuery({
    queryKey: ["sellers-for-orders"] as const,
    queryFn: () => sellersProvider.list({ active: true }),
    staleTime: 60_000,
  });
  const sellersMap = useMemo<Map<ID, ISeller>>(() => {
    const m = new Map<ID, ISeller>();
    (sellersQuery.data ?? []).forEach((s) => m.set(s.id, s));
    return m;
  }, [sellersQuery.data]);
  const selectableSellers = useMemo<ISeller[]>(() => {
    const all = sellersQuery.data ?? [];
    if (!isManagerOrOwner && currentUser?.sellerId) {
      return all.filter((s) => s.id === currentUser.sellerId);
    }
    return all;
  }, [sellersQuery.data, isManagerOrOwner, currentUser?.sellerId]);

  const customersQuery = useQuery({
    queryKey: ["customers-for-orders"] as const,
    queryFn: () => customersProvider.list({ pageSize: 500 }),
    staleTime: 60_000,
  });
  const customersMap = useMemo<Map<ID, ICustomer>>(() => {
    const m = new Map<ID, ICustomer>();
    (customersQuery.data?.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [customersQuery.data]);

  const statCells = useMemo(() => orderStatCells(list.allFiltered, now), [list.allFiltered, now]);
  const statusTabs = useMemo<IStatusTab[]>(() => {
    const counts = orderStatusCounts(list.allFiltered);
    return [
      { key: "all", label: "Todos", count: list.allFiltered.length },
      ...STATUS_TAB_ORDER.map((s) => ({
        key: s,
        label: ORDER_STATUS_META[s].label,
        count: counts[s],
        dotClassName: STATUS_DOT[s],
      })),
    ];
  }, [list.allFiltered]);

  const activeStatusKey =
    filters.statuses.length === 1
      ? (filters.statuses[0] ?? "all")
      : filters.statuses.length === 0
        ? "all"
        : "";

  const onSelectStatus = (key: string) => {
    url.patchFilters({ statuses: key === "all" ? [] : [key as OrderStatus] });
  };

  const handleRowClick = (id: ID) => {
    void navigate({ to: "/app/pedidos/$id", params: { id } });
  };

  const hasResults = list.data.length > 0;
  const isFirstLoad = list.isLoading && !hasResults;
  const showEmpty = !isFirstLoad && !hasResults;

  const tableNode = list.isError ? (
    <ErrorState onRetry={list.refetch} />
  ) : showEmpty ? (
    <EmptyState onClear={url.clearAll} />
  ) : layout === "rows" ? (
    <OrdersTableRows
      orders={list.data}
      isLoading={list.isLoading}
      onRowClick={handleRowClick}
      sellers={sellersMap}
      customers={customersMap}
    />
  ) : (
    <OrdersTable
      orders={list.data}
      isLoading={list.isLoading}
      sort={sort}
      onSortChange={url.setSort}
      onRowClick={handleRowClick}
      sellers={sellersMap}
      customers={customersMap}
    />
  );

  const filtersProps = {
    filters,
    patch: url.patchFilters,
    onClear: url.clearAll,
    sellers: selectableSellers,
    stores: accessibleStores,
    canFilterStore: isOwner,
    canFilterSeller: isManagerOrOwner,
  };

  let body: React.ReactNode;
  if (layout === "console") {
    body = (
      <ConsoleShell
        rail={
          <>
            <ListStatStrip cells={statCells} orientation="vertical" />
            <ListStatusTabs
              tabs={statusTabs}
              activeKey={activeStatusKey}
              onSelect={onSelectStatus}
              orientation="vertical"
            />
            <OrdersFiltersBar {...filtersProps} stacked />
          </>
        }
        table={tableNode}
      />
    );
  } else if (layout === "rows") {
    body = (
      <RowsShell
        strip={<ListStatStrip cells={statCells.slice(0, 3)} />}
        filters={<OrdersFiltersBar {...filtersProps} />}
        table={tableNode}
      />
    );
  } else {
    body = (
      <CockpitShell
        strip={<ListStatStrip cells={statCells} />}
        tabs={
          <ListStatusTabs tabs={statusTabs} activeKey={activeStatusKey} onSelect={onSelectStatus} />
        }
        filters={<OrdersFiltersBar {...filtersProps} />}
        table={tableNode}
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-background md:h-[calc(100vh-6rem)]">
      <OrdersHeader
        total={list.total}
        searchValue={filters.search}
        onSearchChange={(q) => url.setSearch(q)}
        layout={layout}
        onLayoutChange={setLayout}
      />
      {body}
      <OrdersPagination
        page={page}
        pageSize={pageSize}
        total={list.total}
        onPageChange={url.setPage}
        onPageSizeChange={url.setPageSize}
      />
    </div>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon icon="mdi:clipboard-list-outline" size={24} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">Nenhum pedido encontrado</p>
        <p className="text-xs text-muted-foreground">
          Pedidos surgem automaticamente quando você converte um orçamento ou o SDR aceita um.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onClear}>
        Limpar filtros
      </Button>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <Icon icon="mdi:alert-circle-outline" size={24} />
      </div>
      <p className="text-sm font-semibold text-foreground">Erro ao carregar</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}
```

> **Atenção:** o `OrdersListPage` original busca clientes com query keyed/enabled por `customerIds` da página. Aqui simplificamos para uma query única (`["customers-for-orders"]`, `pageSize: 500`) igual à de Orçamentos — basta para os mapas de nome/cidade. Confirmar que `customersProvider.list` aceita `{ pageSize }` (aceita; é como Orçamentos faz).

- [ ] **Step 2: Verificar (gate da Fase 2)**

```bash
bunx prettier --write src/features/orders/pages/OrdersListPage.tsx
bunx eslint src/features/orders/pages/OrdersListPage.tsx
bun run build
```
Esperado: build `✓ built`.

- [ ] **Step 3: Commit**

```bash
git add src/features/orders/pages/OrdersListPage.tsx
git commit -m "feat: redesign orders list with selectable cockpit/console/rows layouts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Verificação final + bump de versão 0.52.0 "Ledger"

**Files:**
- Modify: `package.json` (linha `"version"`)
- Modify: `CHANGELOG.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Build completo + lint geral**

```bash
bun run build
bunx eslint src/shared/list-views src/features/quotes src/features/orders
```
Esperado: `✓ built`, eslint exit 0.

- [ ] **Step 2: Bump em `package.json`**

Trocar `"version": "0.51.0",` por `"version": "0.52.0",`.

- [ ] **Step 3: Nova seção no topo do `CHANGELOG.md`**

Inserir como a seção de versão **mais recente** (logo abaixo do cabeçalho/intro do arquivo e **acima** de `## [0.51.0]`):

```markdown
## [0.52.0] - 2026-05-30 - Ledger

### Added
- Listas de Orçamentos e Pedidos com **3 visualizações selecionáveis** (Cockpit, Console, Linhas), seletor segmentado no cabeçalho e preferência lembrada por lista.
- Faixa de **KPIs** nas listas — Orçamentos (em aberto, convertido, conversão, ticket médio, expirando ≤3d) e Pedidos (valor total, recebido, a receber, a expedir, vencidos).
- **Abas de status** com contagem em ambas as listas.

### Changed
- A tabela de orçamentos agora é **fluida** (ocupa a largura disponível) em vez de largura fixa.
- O filtro de status passou de popover para **abas**; os demais filtros foram mantidos.
```

- [ ] **Step 4: Atualizar o codinome no `CLAUDE.md`**

Trocar a linha:

```
- **SemVer.** MINOR/MAJOR recebem **codinome em inglês** (atual: `Cockpit` — v0.51.0).
```

por:

```
- **SemVer.** MINOR/MAJOR recebem **codinome em inglês** (atual: `Ledger` — v0.52.0).
```

- [ ] **Step 5: Verificar e commitar**

```bash
bun run build
git add package.json CHANGELOG.md CLAUDE.md
git commit -m "chore: bump version to 0.52.0 Ledger" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Cobertura da spec (auto-revisão)

| Requisito da spec | Task(s) |
|---|---|
| Framework `src/shared/list-views/` (config, hook, switcher, strip, tabs, shells, barrel) | 1, 2, 3 |
| KPIs Orçamentos (fórmulas §9.1) | 4 |
| `allFiltered` + status client-side (Orçamentos) | 5 |
| Tabela fluida + linhas duplas (Orçamentos) | 6 |
| Abas substituem popover de status + seletor no header (Orçamentos) | 7 |
| Composição das 3 visualizações (Orçamentos) | 8 |
| KPIs Pedidos (fórmulas §9.2) | 9 |
| `allFiltered` + status separado (Pedidos) | 10 |
| Linhas duplas (Pedidos) — tabela já fluida | 11 |
| Abas + seletor (Pedidos) | 12 |
| Composição das 3 visualizações (Pedidos) | 13 |
| Persistência por lista (chaves separadas) | 1 (config) + 8/13 (uso) |
| Bump 0.52.0 + codinome + changelog | 14 |

**Notas:**
- `activeFilterCount`/`activeOrderFilterCount` ainda contam `statuses`. Como o status agora é controlado pelas abas, o contador de "Limpar (N)" pode incluir a seleção de status — comportamento aceitável (o "Limpar" zera tudo, inclusive o status, voltando para "Todos"). **Não** alterar essas funções neste plano.
- Teto de 1000 linhas em KPIs/contagens é a limitação pré-existente da paginação client-side (fora de escopo).

