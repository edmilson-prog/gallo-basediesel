# Quote Editor — Fase 1 (Fundação) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a página `Novo orçamento` num editor de documento comercial com layout aproveitando a tela toda (3 layouts selecionáveis), resumo sticky, e adição de itens rápida em 3 modos selecionáveis (contínuo/catálogo/rápido), com sugestões por veículo, recompra e item avulso.

**Architecture:** Decompor `NewQuotePage.tsx` (~550 linhas) em componentes focados sob `src/features/quotes/components/new/`. Dois eixos de configuração (`layout`, `addMode`) persistidos por vendedor em localStorage via `useQuoteEditorPrefs`. A lógica pura (operações de item, montagem de sugestões, classes de layout) vive em utilitários testáveis por script de asserção; os componentes consomem providers via barrel `@/providers/data`.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router/Query, Tailwind v4 + shadcn/ui (`toggle-group`, `sheet`, `command`, `badge`, `scroll-area`, `tooltip`), Iconify (`mdi:*`), sonner, Bun.

---

## Convenção de validação (LEIA ANTES DE COMEÇAR)

**Este projeto NÃO tem test runner** (ver `CLAUDE.md`: "Não há suite de testes configurada"). **NÃO instale Vitest/Jest/Testing-Library** — adicionar dependência fere o guard de supply-chain (`bunfig.toml`) e exige aprovação do usuário. A validação de cada task é:

1. **Lógica pura** (utils/hooks reducers): escreva um **script de asserção descartável** em `scripts/_check_<topic>.ts`, rode com `bun run scripts/_check_<topic>.ts` (deve imprimir `ALL PASS` e sair 0), e **apague o script** antes do commit (`git rm`/`rm`). Este é o padrão usado na feature de Indicadores deste repo.
2. **Type-check:** `bun run build` — deve completar sem erros de `tsc`.
3. **Lint:** `bun run lint` — sem erros. Respeite `no-restricted-imports`: importe providers via `@/providers/data/hooks/use*Provider`, nunca de `impl/`.
4. **UI:** verificação **manual** pelo usuário. **NÃO abra browser/preview automaticamente** (preferência registrada do usuário).

Onde o passo de "teste" aparece abaixo, ele significa **script de asserção descartável** (lógica) ou **build+lint** (componentes), não um test runner.

## Convenções de código do repo

- `camelCase` funções/vars, `PascalCase` componentes/tipos, `kebab-case`? **não** — este repo usa arquivos `PascalCase.tsx` para componentes (ex.: `AddItemModal.tsx`) e `camelCase.ts` para utils/hooks (ex.: `quoteTotals.ts`, `useResizableColumns.ts`). **Siga o existente.**
- Comentários em inglês; UI em português do Brasil com acentos corretos.
- Tipos de domínio com prefixo `I`.
- Componentes consomem só tokens semânticos Tailwind (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-muted-foreground`, `bg-muted`). Nunca hex direto nem `--gallo-*`.
- Persistência localStorage: padrão de `useResizableColumns.ts` (guard `typeof window`, `try/catch`).

## Tipos e assinaturas existentes (NÃO redefinir — importar)

```ts
// @/shared/types
interface IQuoteItem { id: ID; partId: ID; partSku: string; partName: string; quantity: number; unitPrice: Money; discount: Money; total: Money; }
interface IPart { id: ID; sku: string; name: string; oemCodes: string[]; equivalentPartIds: ID[]; crossReferences?: {brand:string;code:string}[]; applications: IApplication[]; brand: string; category?: PartCategory; subcategory?: string; isOriginal?: boolean; imageUrl?: string; unitPrice: Money; marginPercent: number; stockAvailable: number; stockMinimum: number; weightKg?: number; active: boolean; /* …more */ }
interface IApplication { id: ID; vehicleBrand: string; vehicleModel: string; yearStart: number; yearEnd: number; engine?: string; }
interface IVehicle { id: ID; customerId: ID; brand: string; model: string; year: number; engine: string; plate?: string; /* … */ }
interface IOrderItem { id: ID; partId: ID; partSku: string; partName: string; quantity: number; unitPrice: Money; discount: Money; total: Money; /* …marginValue, etc */ }
interface IOrder { id: ID; customerId: ID; items: IOrderItem[]; createdAt: ISO8601; /* … */ }
type ICustomer = ICustomerB2B | ICustomerB2C; // type:'B2B' → nomeFantasia/razaoSocial/cnpj; type:'B2C' → fullName/cpf

// @/features/quotes/utils/quoteTotals
function round2(value:number):number
function recalculateQuote(items:IQuoteItem[], discount:number, shipping:number): Pick<IQuote,"subtotal"|"discount"|"shipping"|"total">
function requiresDiscountApproval(subtotal:number, discount:number, thresholdPct:number): boolean

// @/features/catalog (barrel)
function searchPartsByText(parts:IPart[], query:string): IPart[]
function searchPartsByApplication(parts:IPart[], input:{brand?:string;model?:string;year?:number;engine?:string;category?:PartCategory;subcategory?:string;oemCode?:string}): IPart[]
function getEquivalents(parts:IPart[], partId:ID): IPart[]
function getCategoryIcon(category?:PartCategory): string  // returns an mdi icon name

// Providers (via @/providers/data/hooks/*)
useQuotesProvider().list({pageSize}) / .create(...)
usePartsProvider().list({pageSize, active}): Promise<IPaginatedResult<IPart>>  // .data is the array
useVehiclesProvider().listByCustomer(customerId): Promise<IVehicle[]>
useOrdersProvider().listByCustomer(customerId): Promise<IOrder[]>
useCustomersProvider().list({pageSize, sellerId})
useSettingsProvider().get(storeId)  // → { discountApprovalThresholdPct, quoteDefaultValidityDays, shipping }
```

---

## File Structure (alvo da Fase 1)

```
src/features/quotes/
  types/
    editor.ts                    # (novo) QuoteLayout, QuoteAddMode, IQuoteEditorPrefs
  utils/
    quoteItemOps.ts              # (novo) buildItemFromPart, buildFreeItem, addOrIncrementItem
    suggestions.ts               # (novo) buildVehicleSuggestions, buildRepurchaseItems
    layoutClasses.ts             # (novo) classes Tailwind por QuoteLayout
  hooks/
    useQuoteEditorPrefs.ts       # (novo) persiste layout + addMode (localStorage)
    useItemSearch.ts             # (novo) busca compartilhada pelos 3 modos
  components/new/
    QuoteEditor.tsx              # (novo) orquestra estado + layout; vira o corpo da página
    layout/QuoteActionBar.tsx    # (novo) barra sticky: voltar, número, status, seletor de layout, CTAs
    layout/LayoutSwitcher.tsx    # (novo) toggle-group dos 3 layouts
    customer/CustomerChip.tsx    # (novo) cliente colapsado + alterar
    summary/QuoteSummaryPanel.tsx# (novo) totais + desconto + frete + aprovação
    items/QuoteItemsTable.tsx    # (novo) tabela editável (extraída)
    items/ItemAdder.tsx          # (novo) despacha sub-modo + seletor de modo
    items/ModeSwitcher.tsx       # (novo) toggle-group dos 3 modos de adição
    items/ContinuousAdder.tsx    # (novo) busca que não fecha + quick-add
    items/QuickAddBar.tsx        # (novo) command palette (cmdk)
    items/CatalogDrawer.tsx      # (novo) Sheet com checkboxes multi-seleção
    items/ItemResultRow.tsx      # (novo) linha de resultado (badges básicos)
    items/SuggestionRails.tsx    # (novo) estado-zero: veículos (chips) + recompra
    items/FreeItemDialog.tsx     # (novo) item avulso
  pages/NewQuotePage.tsx         # (modificar) passa a renderizar <QuoteEditor/>
```

`AddItemModal.tsx` permanece no disco até a Task final, quando é removido após `QuoteEditor` assumir.

---

## Task 1: Tipos do editor

**Files:**
- Create: `src/features/quotes/types/editor.ts`

- [ ] **Step 1: Criar os tipos**

```ts
// src/features/quotes/types/editor.ts
/** Layout composition of the quote editor page. */
export type QuoteLayout = "twoCol" | "full" | "footerBar";

/** Item-adding interaction mode. */
export type QuoteAddMode = "continuous" | "catalog" | "quick";

/** Persisted per-seller editor preferences. */
export interface IQuoteEditorPrefs {
  layout: QuoteLayout;
  addMode: QuoteAddMode;
}

export const DEFAULT_QUOTE_EDITOR_PREFS: IQuoteEditorPrefs = {
  layout: "twoCol",
  addMode: "continuous",
};

export const QUOTE_LAYOUT_OPTIONS: ReadonlyArray<{ value: QuoteLayout; label: string; icon: string }> = [
  { value: "twoCol", label: "2 colunas", icon: "mdi:view-split-vertical" },
  { value: "full", label: "Largura cheia", icon: "mdi:view-sequential" },
  { value: "footerBar", label: "Barra no rodapé", icon: "mdi:dock-bottom" },
];

export const QUOTE_ADD_MODE_OPTIONS: ReadonlyArray<{ value: QuoteAddMode; label: string; icon: string }> = [
  { value: "continuous", label: "Contínuo", icon: "mdi:playlist-plus" },
  { value: "catalog", label: "Catálogo", icon: "mdi:view-grid-plus-outline" },
  { value: "quick", label: "Rápido", icon: "mdi:keyboard-outline" },
];
```

- [ ] **Step 2: Type-check**

Run: `bun run build`
Expected: completa sem erros de `tsc`.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/types/editor.ts
git commit -m "feat(quotes): add quote editor pref types"
```

---

## Task 2: Hook de preferências do editor (`useQuoteEditorPrefs`)

**Files:**
- Create: `src/features/quotes/hooks/useQuoteEditorPrefs.ts`

- [ ] **Step 1: Implementar o hook** (segue o padrão localStorage de `useResizableColumns.ts`)

```ts
// src/features/quotes/hooks/useQuoteEditorPrefs.ts
import { useCallback, useState } from "react";
import {
  DEFAULT_QUOTE_EDITOR_PREFS,
  type IQuoteEditorPrefs,
  type QuoteAddMode,
  type QuoteLayout,
} from "../types/editor";

const STORAGE_KEY = "gallo-quote-editor-prefs";
const LAYOUTS: QuoteLayout[] = ["twoCol", "full", "footerBar"];
const ADD_MODES: QuoteAddMode[] = ["continuous", "catalog", "quick"];

function readPrefs(): IQuoteEditorPrefs {
  if (typeof window === "undefined") return DEFAULT_QUOTE_EDITOR_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUOTE_EDITOR_PREFS;
    const parsed = JSON.parse(raw) as Partial<IQuoteEditorPrefs>;
    return {
      layout: LAYOUTS.includes(parsed.layout as QuoteLayout)
        ? (parsed.layout as QuoteLayout)
        : DEFAULT_QUOTE_EDITOR_PREFS.layout,
      addMode: ADD_MODES.includes(parsed.addMode as QuoteAddMode)
        ? (parsed.addMode as QuoteAddMode)
        : DEFAULT_QUOTE_EDITOR_PREFS.addMode,
    };
  } catch {
    return DEFAULT_QUOTE_EDITOR_PREFS;
  }
}

export interface IUseQuoteEditorPrefs extends IQuoteEditorPrefs {
  setLayout: (layout: QuoteLayout) => void;
  setAddMode: (addMode: QuoteAddMode) => void;
}

/** Persisted quote-editor preferences (layout + add mode) for the current seller. */
export function useQuoteEditorPrefs(): IUseQuoteEditorPrefs {
  const [prefs, setPrefs] = useState<IQuoteEditorPrefs>(readPrefs);

  const persist = useCallback((next: IQuoteEditorPrefs) => {
    setPrefs(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage indisponível — preferência só em memória nesta sessão.
    }
  }, []);

  const setLayout = useCallback(
    (layout: QuoteLayout) => persist({ ...readPrefs(), layout }),
    [persist],
  );
  const setAddMode = useCallback(
    (addMode: QuoteAddMode) => persist({ ...readPrefs(), addMode }),
    [persist],
  );

  return { ...prefs, setLayout, setAddMode };
}
```

- [ ] **Step 2: Script de asserção da leitura/validação**

```ts
// scripts/_check_prefs.ts  (descartável)
import { DEFAULT_QUOTE_EDITOR_PREFS } from "../src/features/quotes/types/editor";

// Reimplementa readPrefs puro para validar a lógica de saneamento (sem window).
function sanitize(parsed: Record<string, unknown>) {
  const LAYOUTS = ["twoCol", "full", "footerBar"];
  const ADD_MODES = ["continuous", "catalog", "quick"];
  return {
    layout: LAYOUTS.includes(parsed.layout as string) ? parsed.layout : DEFAULT_QUOTE_EDITOR_PREFS.layout,
    addMode: ADD_MODES.includes(parsed.addMode as string) ? parsed.addMode : DEFAULT_QUOTE_EDITOR_PREFS.addMode,
  };
}

const a = sanitize({ layout: "full", addMode: "quick" });
if (a.layout !== "full" || a.addMode !== "quick") throw new Error("valid prefs not preserved");
const b = sanitize({ layout: "bogus", addMode: undefined as unknown as string });
if (b.layout !== "twoCol" || b.addMode !== "continuous") throw new Error("invalid prefs not defaulted");
console.log("ALL PASS");
```

- [ ] **Step 3: Rodar o script**

Run: `bun run scripts/_check_prefs.ts`
Expected: imprime `ALL PASS`, sai 0.

- [ ] **Step 4: Apagar o script + type-check + lint**

Run: `rm scripts/_check_prefs.ts && bun run build && bun run lint`
Expected: build e lint sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/features/quotes/hooks/useQuoteEditorPrefs.ts
git commit -m "feat(quotes): persist quote editor preferences per seller"
```

---

## Task 3: Operações de item (`quoteItemOps.ts`)

**Files:**
- Create: `src/features/quotes/utils/quoteItemOps.ts`

- [ ] **Step 1: Implementar as operações puras**

```ts
// src/features/quotes/utils/quoteItemOps.ts
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { round2 } from "./quoteTotals";

/** Sentinel partId used for free (off-catalog) items. */
export const FREE_ITEM_PART_ID = "avulso";

/** Build a quote item from a catalog part. */
export function buildItemFromPart(part: IPart, quantity = 1): IQuoteItem {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  return {
    id: `qi-${crypto.randomUUID()}`,
    partId: part.id,
    partSku: part.sku,
    partName: part.name,
    quantity: qty,
    unitPrice: part.unitPrice,
    discount: 0,
    total: round2(qty * part.unitPrice),
  };
}

/** Build a free (off-catalog) quote item. */
export function buildFreeItem(input: { name: string; unitPrice: number; quantity?: number }): IQuoteItem {
  const qty = Math.max(1, Math.floor(input.quantity ?? 1) || 1);
  const price = Math.max(0, input.unitPrice || 0);
  return {
    id: `qi-${crypto.randomUUID()}`,
    partId: FREE_ITEM_PART_ID,
    partSku: "—",
    partName: input.name.trim() || "Item avulso",
    quantity: qty,
    unitPrice: price,
    discount: 0,
    total: round2(qty * price),
  };
}

/**
 * Add a part to the list, or increment quantity if a line for the same partId
 * already exists (free items, partId="avulso", are always appended).
 * Returns a new array and the id of the affected line (for highlight).
 */
export function addOrIncrementItem(
  items: IQuoteItem[],
  part: IPart,
  quantity = 1,
): { items: IQuoteItem[]; affectedId: ID } {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const existing = items.find((it) => it.partId === part.id && part.id !== FREE_ITEM_PART_ID);
  if (existing) {
    const nextQty = existing.quantity + qty;
    const updated: IQuoteItem = {
      ...existing,
      quantity: nextQty,
      total: round2(nextQty * existing.unitPrice - existing.discount),
    };
    return {
      items: items.map((it) => (it.id === existing.id ? updated : it)),
      affectedId: existing.id,
    };
  }
  const created = buildItemFromPart(part, qty);
  return { items: [...items, created], affectedId: created.id };
}
```

- [ ] **Step 2: Script de asserção**

```ts
// scripts/_check_itemops.ts (descartável)
import { addOrIncrementItem, buildFreeItem } from "../src/features/quotes/utils/quoteItemOps";

const part = { id: "p1", sku: "S1", name: "Filtro", unitPrice: 100 } as never;

// 1) primeira adição cria linha
const r1 = addOrIncrementItem([], part, 2);
if (r1.items.length !== 1 || r1.items[0].quantity !== 2 || r1.items[0].total !== 200) throw new Error("create failed");

// 2) re-adicionar mesma peça incrementa (não duplica)
const r2 = addOrIncrementItem(r1.items, part, 3);
if (r2.items.length !== 1 || r2.items[0].quantity !== 5 || r2.items[0].total !== 500) throw new Error("increment failed");
if (r2.affectedId !== r1.items[0].id) throw new Error("affectedId should point to existing line");

// 3) item avulso sempre acrescenta
const free = buildFreeItem({ name: "Mão de obra", unitPrice: 50, quantity: 1 });
if (free.partId !== "avulso" || free.total !== 50) throw new Error("free item failed");

console.log("ALL PASS");
```

- [ ] **Step 3: Rodar, apagar, validar**

Run: `bun run scripts/_check_itemops.ts && rm scripts/_check_itemops.ts && bun run build && bun run lint`
Expected: `ALL PASS` e build/lint limpos.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/utils/quoteItemOps.ts
git commit -m "feat(quotes): add quote item ops with duplicate increment"
```

---

## Task 4: Montagem de sugestões (`suggestions.ts`)

**Files:**
- Create: `src/features/quotes/utils/suggestions.ts`

- [ ] **Step 1: Implementar funções puras**

```ts
// src/features/quotes/utils/suggestions.ts
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { searchPartsByApplication } from "@/features/catalog";

/** Parts compatible with a given vehicle, capped. */
export function buildVehicleSuggestions(parts: IPart[], vehicle: IVehicle, limit = 12): IPart[] {
  return searchPartsByApplication(parts, {
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
  }).slice(0, limit);
}

export interface IRepurchaseSuggestion {
  part: IPart;
  /** How many distinct past orders contained this part. */
  orderCount: number;
  /** Most recent order date that contained it (ISO). */
  lastOrderedAt: string;
}

/**
 * Parts the customer bought before, resolved against the live catalog and
 * ranked by recency then frequency. Parts no longer in `parts` are dropped.
 */
export function buildRepurchaseItems(parts: IPart[], orders: IOrder[], limit = 12): IRepurchaseSuggestion[] {
  const byPart = new Map<string, IPart>(parts.map((p) => [p.id, p]));
  const agg = new Map<string, { orderIds: Set<string>; lastOrderedAt: string }>();
  for (const order of orders) {
    for (const item of order.items) {
      if (!byPart.has(item.partId)) continue;
      const entry = agg.get(item.partId) ?? { orderIds: new Set<string>(), lastOrderedAt: order.createdAt };
      entry.orderIds.add(order.id);
      if (order.createdAt > entry.lastOrderedAt) entry.lastOrderedAt = order.createdAt;
      agg.set(item.partId, entry);
    }
  }
  return [...agg.entries()]
    .map(([partId, e]) => ({
      part: byPart.get(partId)!,
      orderCount: e.orderIds.size,
      lastOrderedAt: e.lastOrderedAt,
    }))
    .sort((a, b) =>
      a.lastOrderedAt === b.lastOrderedAt
        ? b.orderCount - a.orderCount
        : a.lastOrderedAt < b.lastOrderedAt
          ? 1
          : -1,
    )
    .slice(0, limit);
}
```

- [ ] **Step 2: Script de asserção** (recompra: dedup por pedido, ordena por recência)

```ts
// scripts/_check_suggestions.ts (descartável)
import { buildRepurchaseItems } from "../src/features/quotes/utils/suggestions";

const parts = [{ id: "p1" }, { id: "p2" }, { id: "p3" }] as never[];
const orders = [
  { id: "o1", createdAt: "2026-01-01", items: [{ partId: "p1" }, { partId: "p2" }] },
  { id: "o2", createdAt: "2026-03-01", items: [{ partId: "p1" }] },
  { id: "o3", createdAt: "2026-02-01", items: [{ partId: "pX-removed" }] }, // dropped: not in catalog
] as never[];

const r = buildRepurchaseItems(parts, orders);
if (r.length !== 2) throw new Error(`expected 2 surviving parts, got ${r.length}`);
if (r[0].part.id !== "p1") throw new Error("p1 should rank first (most recent, most frequent)");
if (r[0].orderCount !== 2) throw new Error("p1 should count 2 distinct orders");
if (r[0].lastOrderedAt !== "2026-03-01") throw new Error("p1 lastOrderedAt wrong");
console.log("ALL PASS");
```

- [ ] **Step 3: Rodar, apagar, validar**

Run: `bun run scripts/_check_suggestions.ts && rm scripts/_check_suggestions.ts && bun run build && bun run lint`
Expected: `ALL PASS` e build/lint limpos.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/utils/suggestions.ts
git commit -m "feat(quotes): add vehicle + repurchase suggestion builders"
```

---

## Task 5: Classes de layout (`layoutClasses.ts`)

**Files:**
- Create: `src/features/quotes/utils/layoutClasses.ts`

- [ ] **Step 1: Implementar o mapa de classes**

```ts
// src/features/quotes/utils/layoutClasses.ts
import type { QuoteLayout } from "../types/editor";

export interface IQuoteLayoutClasses {
  /** Outer container. */
  root: string;
  /** Wrapper holding body + summary. */
  grid: string;
  /** Main body column. */
  body: string;
  /** Summary container. */
  summary: string;
  /** When true, the summary should render as a sticky bottom bar (footerBar / mobile). */
  summaryAsFooterBar: boolean;
}

/**
 * Tailwind classes per layout. All use full available width (no max-w-5xl).
 * - twoCol: body (2fr) + sticky summary rail (1fr) on lg+; stacks below lg.
 * - full: single column, summary inline at the end.
 * - footerBar: single column body, summary rendered as sticky footer bar.
 */
export function quoteLayoutClasses(layout: QuoteLayout): IQuoteLayoutClasses {
  switch (layout) {
    case "twoCol":
      return {
        root: "w-full p-4 md:p-6",
        grid: "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]",
        body: "min-w-0 space-y-6",
        summary: "lg:sticky lg:top-20 lg:self-start",
        summaryAsFooterBar: false,
      };
    case "full":
      return {
        root: "w-full p-4 md:p-6",
        grid: "grid grid-cols-1 gap-6",
        body: "min-w-0 space-y-6",
        summary: "",
        summaryAsFooterBar: false,
      };
    case "footerBar":
      return {
        root: "w-full p-4 pb-24 md:p-6 md:pb-24",
        grid: "grid grid-cols-1 gap-6",
        body: "min-w-0 space-y-6",
        summary: "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 backdrop-blur",
        summaryAsFooterBar: true,
      };
    default:
      return quoteLayoutClasses("twoCol");
  }
}
```

- [ ] **Step 2: Script de asserção** (cada layout retorna shape válido; footerBar marca a flag)

```ts
// scripts/_check_layout.ts (descartável)
import { quoteLayoutClasses } from "../src/features/quotes/utils/layoutClasses";

for (const l of ["twoCol", "full", "footerBar"] as const) {
  const c = quoteLayoutClasses(l);
  if (!c.root || !c.grid || !c.body) throw new Error(`${l}: missing classes`);
  if (c.root.includes("max-w-5xl")) throw new Error(`${l}: must not constrain width`);
}
if (quoteLayoutClasses("footerBar").summaryAsFooterBar !== true) throw new Error("footerBar flag");
if (quoteLayoutClasses("twoCol").summaryAsFooterBar !== false) throw new Error("twoCol flag");
console.log("ALL PASS");
```

- [ ] **Step 3: Rodar, apagar, validar**

Run: `bun run scripts/_check_layout.ts && rm scripts/_check_layout.ts && bun run build && bun run lint`
Expected: `ALL PASS` e build/lint limpos.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/utils/layoutClasses.ts
git commit -m "feat(quotes): add layout class map for quote editor"
```

---

## Task 6: Hook de busca compartilhada (`useItemSearch`)

**Files:**
- Create: `src/features/quotes/hooks/useItemSearch.ts`

**Contexto:** os 3 modos de adição buscam peças da mesma forma. Centralizar evita 3 cópias. Carrega o catálogo via provider (cacheado por TanStack Query) e filtra em memória por texto e/ou veículo.

- [ ] **Step 1: Implementar o hook**

```ts
// src/features/quotes/hooks/useItemSearch.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPart, IVehicle } from "@/shared/types";
import { searchPartsByApplication, searchPartsByText } from "@/features/catalog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";

export interface IUseItemSearchArgs {
  enabled: boolean;
  query: string;
  /** When set, pre-filter by this vehicle's application before text search. */
  vehicle?: IVehicle | null;
  limit?: number;
}

export interface IUseItemSearch {
  results: IPart[];
  allParts: IPart[];
  isLoading: boolean;
}

/** Shared catalog search for the quote item adders. */
export function useItemSearch({ enabled, query, vehicle, limit = 20 }: IUseItemSearchArgs): IUseItemSearch {
  const partsProvider = usePartsProvider();
  const partsQuery = useQuery({
    queryKey: ["parts-for-quote"] as const,
    queryFn: async () => (await partsProvider.list({ pageSize: 1000, active: true })).data,
    enabled,
    staleTime: 60_000,
  });

  const allParts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);

  const results = useMemo(() => {
    let candidates = allParts;
    if (vehicle) {
      candidates = searchPartsByApplication(candidates, {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year,
      });
    }
    if (query.trim()) candidates = searchPartsByText(candidates, query);
    return candidates.slice(0, limit);
  }, [allParts, vehicle, query, limit]);

  return { results, allParts, isLoading: partsQuery.isLoading };
}
```

- [ ] **Step 2: Type-check + lint** (sem lógica nova testável isolada além do já coberto pelos search utils)

Run: `bun run build && bun run lint`
Expected: limpos. Confirme que `usePartsProvider` é importado de `@/providers/data/hooks/usePartsProvider` (regra `no-restricted-imports`).

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/hooks/useItemSearch.ts
git commit -m "feat(quotes): add shared item search hook"
```

---

## Task 7: `QuoteItemsTable` (extrair tabela editável)

**Files:**
- Create: `src/features/quotes/components/new/items/QuoteItemsTable.tsx`

**Contexto:** extrai a `<table>` de itens hoje embutida em `NewQuotePage.tsx:237-328`, sem mudar comportamento (qtd/unit/desc editáveis, subtotal, remover). Recebe um `highlightId` opcional para o flash de "recém-adicionado".

- [ ] **Step 1: Implementar o componente**

```tsx
// src/features/quotes/components/new/items/QuoteItemsTable.tsx
import { useEffect, useState } from "react";
import type { ID, IQuoteItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IQuoteItemsTableProps {
  items: IQuoteItem[];
  subtotal: number;
  onPatch: (id: ID, patch: Partial<IQuoteItem>) => void;
  onRemove: (id: ID) => void;
  /** Line to flash as recently added/updated. */
  highlightId?: ID | null;
}

export function QuoteItemsTable({ items, subtotal, onPatch, onRemove, highlightId }: IQuoteItemsTableProps) {
  const [flashId, setFlashId] = useState<ID | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    setFlashId(highlightId);
    const t = setTimeout(() => setFlashId(null), 450);
    return () => clearTimeout(t);
  }, [highlightId]);

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-4 text-center">
        <p className="text-xs text-muted-foreground">Nenhum item adicionado ainda.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Peça</th>
            <th className="w-20 px-3 py-2 text-right">Qtd.</th>
            <th className="w-28 px-3 py-2 text-right">Unit.</th>
            <th className="w-24 px-3 py-2 text-right">Desc.</th>
            <th className="w-28 px-3 py-2 text-right">Subtotal</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr
              key={it.id}
              className={`border-t border-border transition-colors duration-300 motion-reduce:transition-none ${
                flashId === it.id ? "bg-primary/15" : ""
              }`}
            >
              <td className="px-3 py-2">
                <p className="text-sm font-medium text-foreground">{it.partName}</p>
                <p className="text-[10px] text-muted-foreground">SKU {it.partSku}</p>
              </td>
              <td className="px-3 py-2 text-right">
                <Input
                  type="number"
                  min={1}
                  aria-label={`Quantidade de ${it.partName}`}
                  value={it.quantity}
                  onChange={(e) => onPatch(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-8 text-right tabular-nums"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  aria-label={`Preço unitário de ${it.partName}`}
                  value={it.unitPrice}
                  onChange={(e) => onPatch(it.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 text-right tabular-nums"
                />
              </td>
              <td className="px-3 py-2 text-right">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  aria-label={`Desconto de ${it.partName}`}
                  value={it.discount}
                  onChange={(e) => onPatch(it.id, { discount: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 text-right tabular-nums"
                />
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                {moneyFormatter.format(it.total)}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onRemove(it.id)}
                  className="grid h-7 w-7 place-items-center text-muted-foreground hover:text-destructive"
                  aria-label={`Remover ${it.partName}`}
                >
                  <Icon icon="mdi:trash-can-outline" size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-muted/30 text-xs">
          <tr>
            <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">
              Subtotal
            </td>
            <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
              {moneyFormatter.format(subtotal)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/QuoteItemsTable.tsx
git commit -m "feat(quotes): extract editable quote items table"
```

---

## Task 8: `ItemResultRow` (linha de resultado da busca)

**Files:**
- Create: `src/features/quotes/components/new/items/ItemResultRow.tsx`

**Contexto:** linha reutilizável de um resultado de peça (usada pelo Contínuo e pelo Catálogo). Na Fase 1 mostra: ícone/foto, nome, OEM·SKU·marca, badge de estoque (ok/baixo/zerado), preço, indicador "já no orçamento (qtd N)", e ação de adicionar. Badges ricos (Original/Equivalente, margem, equivalentes inline) ficam para a Fase 2 — não implementar agora.

- [ ] **Step 1: Implementar o componente**

```tsx
// src/features/quotes/components/new/items/ItemResultRow.tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getCategoryIcon } from "@/features/catalog";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function stockTone(part: IPart): { label: string; className: string } {
  if (part.stockAvailable <= 0) return { label: "sem estoque", className: "text-destructive" };
  if (part.stockAvailable <= part.stockMinimum)
    return { label: `estoque ${part.stockAvailable} (baixo)`, className: "text-amber-500" };
  return { label: `estoque ${part.stockAvailable}`, className: "text-muted-foreground" };
}

export interface IItemResultRowProps {
  part: IPart;
  /** Quantity already in the quote for this part (0 when absent). */
  inQuoteQty?: number;
  onAdd: (part: IPart) => void;
}

export function ItemResultRow({ part, inQuoteQty = 0, onAdd }: IItemResultRowProps) {
  const stock = stockTone(part);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded bg-muted text-muted-foreground">
          {part.imageUrl ? (
            <img src={part.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon icon={getCategoryIcon(part.category)} size={18} />
          )}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{part.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            OEM {part.oemCodes[0] ?? "—"} · SKU {part.sku} · {part.brand} ·{" "}
            <span className={stock.className}>{stock.label}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">{moneyFormatter.format(part.unitPrice)}</p>
          {inQuoteQty > 0 && (
            <p className="text-[10px] text-primary">
              <Icon icon="mdi:check" size={11} className="mr-0.5 inline" />
              no orçamento ({inQuoteQty})
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onAdd(part)}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-primary hover:bg-primary/10"
          aria-label={`Adicionar ${part.name}`}
        >
          <Icon icon="mdi:plus" size={18} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos. (O token `text-amber-500` é aceito; é a cor de aviso de estoque baixo do spec — não é hex direto.)

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/ItemResultRow.tsx
git commit -m "feat(quotes): add catalog result row with stock badge"
```

---

## Task 9: `SuggestionRails` (estado-zero: veículos + recompra)

**Files:**
- Create: `src/features/quotes/components/new/items/SuggestionRails.tsx`

**Contexto:** mostrado quando a busca está vazia. Recebe os veículos do cliente (chips para alternar) e o catálogo já carregado; computa sugestões por veículo selecionado e recompra. Sem cliente/veículos, renderiza uma dica neutra.

- [ ] **Step 1: Implementar o componente**

```tsx
// src/features/quotes/components/new/items/SuggestionRails.tsx
import { useMemo, useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { buildRepurchaseItems, buildVehicleSuggestions } from "../../../utils/suggestions";
import { ItemResultRow } from "./ItemResultRow";

export interface ISuggestionRailsProps {
  allParts: IPart[];
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAdd: (part: IPart) => void;
}

export function SuggestionRails({ allParts, vehicles, orders, inQuoteQtyByPart, onAdd }: ISuggestionRailsProps) {
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(vehicles[0]?.id ?? null);
  const activeVehicle = vehicles.find((v) => v.id === activeVehicleId) ?? null;

  const vehicleParts = useMemo(
    () => (activeVehicle ? buildVehicleSuggestions(allParts, activeVehicle) : []),
    [allParts, activeVehicle],
  );
  const repurchase = useMemo(() => buildRepurchaseItems(allParts, orders), [allParts, orders]);

  if (vehicles.length === 0 && repurchase.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground">
        Comece a digitar para buscar peças por nome, OEM ou SKU.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {vehicles.length > 0 && (
        <section>
          <div className="mb-1 flex flex-wrap items-center gap-1 px-1">
            <span className="text-xs font-medium text-muted-foreground">Sugestões por veículo:</span>
            {vehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveVehicleId(v.id)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  v.id === activeVehicleId
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.brand} {v.model} '{String(v.year).slice(-2)}
              </button>
            ))}
          </div>
          {vehicleParts.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Nenhuma peça catalogada para este veículo.
            </p>
          ) : (
            <div className="rounded-md border border-border">
              {vehicleParts.map((p) => (
                <ItemResultRow key={p.id} part={p} inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0} onAdd={onAdd} />
              ))}
            </div>
          )}
        </section>
      )}

      {repurchase.length > 0 && (
        <section>
          <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">Já comprou antes:</p>
          <div className="rounded-md border border-border">
            {repurchase.map((r) => (
              <ItemResultRow
                key={r.part.id}
                part={r.part}
                inQuoteQty={inQuoteQtyByPart.get(r.part.id) ?? 0}
                onAdd={onAdd}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/SuggestionRails.tsx
git commit -m "feat(quotes): add suggestion rails (vehicle + repurchase)"
```

---

## Task 10: `FreeItemDialog` (item avulso)

**Files:**
- Create: `src/features/quotes/components/new/items/FreeItemDialog.tsx`

- [ ] **Step 1: Implementar o componente**

```tsx
// src/features/quotes/components/new/items/FreeItemDialog.tsx
import { useState } from "react";
import type { IQuoteItem } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildFreeItem } from "../../../utils/quoteItemOps";

export interface IFreeItemDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (item: IQuoteItem) => void;
}

export function FreeItemDialog({ open, onClose, onAdd }: IFreeItemDialogProps) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [quantity, setQuantity] = useState(1);

  const canAdd = name.trim().length > 0 && Number(price) > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    onAdd(buildFreeItem({ name, unitPrice: Number(price), quantity }));
    setName("");
    setPrice("0");
    setQuantity(1);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Item avulso (sem cadastro)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="free-name">Descrição</Label>
            <Input id="free-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Mão de obra, taxa, peça sob encomenda" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="free-price">Preço unitário (R$)</Label>
              <Input id="free-price" type="number" min={0} step={0.01} value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="free-qty">Quantidade</Label>
              <Input id="free-qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!canAdd} onClick={handleAdd}>Adicionar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/FreeItemDialog.tsx
git commit -m "feat(quotes): add free (off-catalog) item dialog"
```

---

## Task 11: Sub-modos de adição — `ContinuousAdder`, `QuickAddBar`, `CatalogDrawer`

**Files:**
- Create: `src/features/quotes/components/new/items/ContinuousAdder.tsx`
- Create: `src/features/quotes/components/new/items/QuickAddBar.tsx`
- Create: `src/features/quotes/components/new/items/CatalogDrawer.tsx`

**Contexto comum (props compartilhadas):** cada sub-modo recebe a mesma interface, definida abaixo. `inQuoteQtyByPart` permite mostrar "já no orçamento (N)". `vehicles`/`orders` alimentam o estado-zero. `onAddPart` recebe a peça e o consumidor (Task 12) faz `addOrIncrementItem`.

```ts
// interface compartilhada (declarada inline em cada arquivo OU num index — repita para clareza)
import type { IOrder, IPart, IVehicle } from "@/shared/types";
export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}
```

- [ ] **Step 1: `ContinuousAdder` — busca que NÃO fecha + estado-zero**

```tsx
// src/features/quotes/components/new/items/ContinuousAdder.tsx
import { useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useItemSearch } from "../../../hooks/useItemSearch";
import { ItemResultRow } from "./ItemResultRow";
import { SuggestionRails } from "./SuggestionRails";

export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function ContinuousAdder({ vehicles, orders, inQuoteQtyByPart, onAddPart, onAddFreeItemClick }: IAdderProps) {
  const [query, setQuery] = useState("");
  const { results, allParts, isLoading } = useItemSearch({ enabled: true, query });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon icon="mdi:magnify" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            className="pl-8"
            placeholder="Buscar peça, OEM ou SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddFreeItemClick}>
          <Icon icon="mdi:plus-box-outline" size={16} />
          Item avulso
        </Button>
      </div>

      {query.trim() ? (
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {isLoading ? "Carregando catálogo…" : "Nenhuma peça encontrada."}
            </p>
          ) : (
            results.map((p) => (
              <ItemResultRow key={p.id} part={p} inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0} onAdd={onAddPart} />
            ))
          )}
        </div>
      ) : (
        <SuggestionRails
          allParts={allParts}
          vehicles={vehicles}
          orders={orders}
          inQuoteQtyByPart={inQuoteQtyByPart}
          onAdd={onAddPart}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: `QuickAddBar` — command palette (cmdk), teclado-first**

```tsx
// src/features/quotes/components/new/items/QuickAddBar.tsx
import { useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Icon } from "@/components/Icon";
import { useItemSearch } from "../../../hooks/useItemSearch";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function QuickAddBar({ inQuoteQtyByPart, onAddPart }: IAdderProps) {
  const [query, setQuery] = useState("");
  const { results } = useItemSearch({ enabled: true, query });

  return (
    <Command shouldFilter={false} className="rounded-md border border-border">
      <CommandInput value={query} onValueChange={setQuery} placeholder="Digite e pressione Enter para adicionar (OEM, SKU, nome)…" />
      <CommandList>
        <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
        <CommandGroup>
          {results.map((p) => (
            <CommandItem key={p.id} value={p.id} onSelect={() => onAddPart(p)} className="flex justify-between gap-2">
              <span className="truncate">
                {p.name} <span className="text-xs text-muted-foreground">· {p.sku}</span>
                {(inQuoteQtyByPart.get(p.id) ?? 0) > 0 && (
                  <Icon icon="mdi:check" size={12} className="ml-1 inline text-primary" />
                )}
              </span>
              <span className="tabular-nums text-muted-foreground">{moneyFormatter.format(p.unitPrice)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
```

- [ ] **Step 3: `CatalogDrawer` — Sheet com multi-seleção por checkbox**

```tsx
// src/features/quotes/components/new/items/CatalogDrawer.tsx
import { useMemo, useState } from "react";
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useItemSearch } from "../../../hooks/useItemSearch";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IAdderProps {
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function CatalogDrawer({ inQuoteQtyByPart, onAddPart, onAddFreeItemClick }: IAdderProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { results } = useItemSearch({ enabled: open, query, limit: 100 });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = useMemo(() => results.filter((p) => selected.has(p.id)), [results, selected]);

  const addAll = () => {
    chosen.forEach((p) => onAddPart(p));
    setSelected(new Set());
    setOpen(false);
  };

  return (
    <div className="flex gap-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Icon icon="mdi:view-grid-plus-outline" size={16} />
            Abrir catálogo
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full max-w-md flex-col">
          <SheetHeader>
            <SheetTitle>Catálogo — selecione as peças</SheetTitle>
          </SheetHeader>
          <div className="relative mt-2">
            <Icon icon="mdi:magnify" size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" className="pl-8" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="mt-2 flex-1 overflow-y-auto rounded-md border border-border">
            {results.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-muted">
                <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} aria-label={`Selecionar ${p.name}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    SKU {p.sku} · {p.brand}
                    {(inQuoteQtyByPart.get(p.id) ?? 0) > 0 && <span className="text-primary"> · no orçamento</span>}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{moneyFormatter.format(p.unitPrice)}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={onAddFreeItemClick}>
              <Icon icon="mdi:plus-box-outline" size={16} />
              Item avulso
            </Button>
            <Button type="button" disabled={chosen.length === 0} onClick={addAll}>
              Adicionar {chosen.length > 0 ? `${chosen.length} ` : ""}itens
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 4: Confirmar que `checkbox` existe**

Run: `ls src/components/ui/checkbox.tsx`
Expected: o arquivo existe (o projeto usa `@radix-ui/react-checkbox`). Se não existir, gere com shadcn ou crie um wrapper Radix mínimo antes de prosseguir.

- [ ] **Step 5: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos.

- [ ] **Step 6: Commit**

```bash
git add src/features/quotes/components/new/items/ContinuousAdder.tsx src/features/quotes/components/new/items/QuickAddBar.tsx src/features/quotes/components/new/items/CatalogDrawer.tsx
git commit -m "feat(quotes): add continuous, quick-add and catalog drawer modes"
```

---

## Task 12: `ItemAdder` + `ModeSwitcher` (despacho dos 3 modos)

**Files:**
- Create: `src/features/quotes/components/new/items/ModeSwitcher.tsx`
- Create: `src/features/quotes/components/new/items/ItemAdder.tsx`

- [ ] **Step 1: `ModeSwitcher` (toggle-group dos 3 modos)**

```tsx
// src/features/quotes/components/new/items/ModeSwitcher.tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { QUOTE_ADD_MODE_OPTIONS, type QuoteAddMode } from "../../../types/editor";

export function ModeSwitcher({ value, onChange }: { value: QuoteAddMode; onChange: (v: QuoteAddMode) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as QuoteAddMode)}
      aria-label="Modo de adição de itens"
      size="sm"
    >
      {QUOTE_ADD_MODE_OPTIONS.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label} className="gap-1 text-xs">
          <Icon icon={opt.icon} size={14} />
          <span className="hidden sm:inline">{opt.label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 2: `ItemAdder` (despacha o sub-modo conforme a preferência)**

```tsx
// src/features/quotes/components/new/items/ItemAdder.tsx
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import type { QuoteAddMode } from "../../../types/editor";
import { ContinuousAdder } from "./ContinuousAdder";
import { QuickAddBar } from "./QuickAddBar";
import { CatalogDrawer } from "./CatalogDrawer";
import { ModeSwitcher } from "./ModeSwitcher";

export interface IItemAdderProps {
  mode: QuoteAddMode;
  onModeChange: (mode: QuoteAddMode) => void;
  vehicles: IVehicle[];
  orders: IOrder[];
  inQuoteQtyByPart: Map<string, number>;
  onAddPart: (part: IPart) => void;
  onAddFreeItemClick: () => void;
}

export function ItemAdder({ mode, onModeChange, ...adder }: IItemAdderProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <ModeSwitcher value={mode} onChange={onModeChange} />
      </div>
      {mode === "continuous" && <ContinuousAdder {...adder} />}
      {mode === "quick" && <QuickAddBar {...adder} />}
      {mode === "catalog" && <CatalogDrawer {...adder} />}
    </div>
  );
}
```

- [ ] **Step 3: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos. Confirme que `ToggleGroupItem` aceita `size` (senão remova a prop `size` do `ToggleGroup` e use classes).

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/components/new/items/ModeSwitcher.tsx src/features/quotes/components/new/items/ItemAdder.tsx
git commit -m "feat(quotes): add item adder dispatcher with mode switcher"
```

---

## Task 13: `LayoutSwitcher`, `QuoteActionBar`, `CustomerChip`, `QuoteSummaryPanel`

**Files:**
- Create: `src/features/quotes/components/new/layout/LayoutSwitcher.tsx`
- Create: `src/features/quotes/components/new/layout/QuoteActionBar.tsx`
- Create: `src/features/quotes/components/new/customer/CustomerChip.tsx`
- Create: `src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx`

- [ ] **Step 1: `LayoutSwitcher`**

```tsx
// src/features/quotes/components/new/layout/LayoutSwitcher.tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { QUOTE_LAYOUT_OPTIONS, type QuoteLayout } from "../../../types/editor";

export function LayoutSwitcher({ value, onChange }: { value: QuoteLayout; onChange: (v: QuoteLayout) => void }) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as QuoteLayout)}
      aria-label="Layout do editor"
    >
      {QUOTE_LAYOUT_OPTIONS.map((opt) => (
        <ToggleGroupItem key={opt.value} value={opt.value} aria-label={opt.label} title={opt.label}>
          <Icon icon={opt.icon} size={16} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 2: `QuoteActionBar` (barra sticky no topo)**

```tsx
// src/features/quotes/components/new/layout/QuoteActionBar.tsx
import type { QuoteLayout } from "../../../types/editor";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { LayoutSwitcher } from "./LayoutSwitcher";

export interface IQuoteActionBarProps {
  layout: QuoteLayout;
  onLayoutChange: (l: QuoteLayout) => void;
  onBack: () => void;
  canSubmit: boolean;
  submitting: boolean;
  needsApproval: boolean;
  onSaveDraft: () => void;
  onSaveSend: () => void;
}

export function QuoteActionBar({
  layout,
  onLayoutChange,
  onBack,
  canSubmit,
  submitting,
  needsApproval,
  onSaveDraft,
  onSaveSend,
}: IQuoteActionBarProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Icon icon="mdi:chevron-left" size={14} />
          Voltar
        </button>
        <h1 className="text-lg font-semibold text-foreground">Novo orçamento</h1>
      </div>
      <div className="flex items-center gap-2">
        <LayoutSwitcher value={layout} onChange={onLayoutChange} />
        <Button variant="outline" size="sm" disabled={!canSubmit || submitting} onClick={onSaveDraft}>
          <Icon icon="mdi:content-save-outline" size={16} />
          Salvar rascunho
        </Button>
        <Button size="sm" disabled={!canSubmit || submitting} onClick={onSaveSend}>
          <Icon icon="mdi:send-outline" size={16} />
          {needsApproval ? "Salvar e solicitar aprovação" : "Salvar e enviar"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `CustomerChip` (cliente colapsado; usa `CustomerAutocomplete` quando vazio)**

```tsx
// src/features/quotes/components/new/customer/CustomerChip.tsx
import type { ICustomer, ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CustomerAutocomplete } from "../CustomerAutocomplete";

function nameOf(c: ICustomer): string {
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

export interface ICustomerChipProps {
  customer: ICustomer | null;
  onChange: (c: ICustomer | null) => void;
  sellerIdFilter?: ID | null;
}

export function CustomerChip({ customer, onChange, sellerIdFilter }: ICustomerChipProps) {
  if (!customer) {
    return <CustomerAutocomplete value={null} onChange={onChange} sellerIdFilter={sellerIdFilter} />;
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">
          {nameOf(customer)}
          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">{customer.type}</span>
        </p>
        {customer.address && (
          <p className="truncate text-xs text-muted-foreground">
            <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
            {customer.address.street}, {customer.address.number} — {customer.address.city}/{customer.address.state}
          </p>
        )}
      </div>
      <button type="button" onClick={() => onChange(null)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
        Alterar
      </button>
    </div>
  );
}
```

- [ ] **Step 4: `QuoteSummaryPanel`** (totais + desconto + frete + aprovação; extrai a Seção 3 + card de totais do `NewQuotePage` atual)

```tsx
// src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx
import type { QuotePaymentMethod } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IQuoteSummaryPanelProps {
  itemCount: number;
  unitCount: number;
  subtotal: number;
  discountInput: string;
  onDiscountInput: (v: string) => void;
  discountPct: number;
  thresholdPct: number;
  shipping: number;
  onShipping: (v: number) => void;
  onCalcShipping: () => void;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  needsJustification: boolean;
  discountReason: string;
  onDiscountReason: (v: string) => void;
  compact?: boolean;
}

export function QuoteSummaryPanel(props: IQuoteSummaryPanelProps) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">
        {props.itemCount} {props.itemCount === 1 ? "item" : "itens"} · {props.unitCount} un
      </p>

      <div>
        <Label htmlFor="discount">Desconto global (R$)</Label>
        <Input id="discount" type="number" min={0} step={0.01} value={props.discountInput} onChange={(e) => props.onDiscountInput(e.target.value)} />
        <p className="mt-1 text-xs text-muted-foreground">
          {(props.discountPct * 100).toFixed(1)}% do subtotal · limite {(props.thresholdPct * 100).toFixed(0)}%
        </p>
      </div>

      <div>
        <Label htmlFor="shipping">Frete (R$)</Label>
        <div className="flex gap-2">
          <Input id="shipping" type="number" min={0} step={0.01} value={props.shipping} onChange={(e) => props.onShipping(Math.max(0, Number(e.target.value) || 0))} />
          <Button type="button" variant="outline" size="sm" onClick={props.onCalcShipping} className="shrink-0 gap-1">
            <Icon icon="mdi:truck-fast-outline" size={14} />
            Calcular
          </Button>
        </div>
      </div>

      {props.needsJustification && (
        <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-3" role="alert">
          <p className="text-xs font-medium text-orange-600 dark:text-orange-300">
            <Icon icon="mdi:shield-alert-outline" size={14} className="mr-1 inline" />
            Desconto acima do limite — requer aprovação do gestor
          </p>
          <Textarea className="mt-2" placeholder="Justifique o desconto (obrigatório)" value={props.discountReason} onChange={(e) => props.onDiscountReason(e.target.value)} />
        </div>
      )}

      <div className="space-y-1 border-t border-border pt-3">
        <Row label="Subtotal" value={moneyFormatter.format(props.subtotal)} />
        <Row label="Desconto" value={`-${moneyFormatter.format(props.discountTotal)}`} />
        <Row label="Frete" value={`+${moneyFormatter.format(props.shippingTotal)}`} />
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums text-primary">{moneyFormatter.format(props.total)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos.

- [ ] **Step 6: Commit**

```bash
git add src/features/quotes/components/new/layout/ src/features/quotes/components/new/customer/ src/features/quotes/components/new/summary/
git commit -m "feat(quotes): add action bar, layout switcher, customer chip and summary panel"
```

---

## Task 14: `QuoteEditor` (orquestrador) + fiação na página

**Files:**
- Create: `src/features/quotes/components/new/QuoteEditor.tsx`
- Modify: `src/features/quotes/pages/NewQuotePage.tsx` (passa a renderizar `<QuoteEditor/>`)

**Contexto:** `QuoteEditor` assume todo o estado hoje em `NewQuotePage` (customer, items, discount, shipping, payment, notes, submit) e compõe os componentes novos conforme o layout. **Mantém intacta** a lógica de `handleSave` (geração de número, `auditLog`, `provider.create`, toasts, navegação) — copie-a do `NewQuotePage` atual sem alterar comportamento. Adiciona: carregamento de veículos e pedidos do cliente para sugestões; `addOrIncrementItem` com `highlightId`.

- [ ] **Step 1: Implementar `QuoteEditor`** (estado + composição por layout)

Pontos obrigatórios (replicar a lógica existente de `NewQuotePage.tsx`, ajustando a composição):

1. Hooks de dados idênticos aos atuais: `useAuth`, `useCurrentStore`, `useCurrentRole`, `useQuotesProvider`, `useVehiclesProvider`, `useSettingsProvider`, `useQuery(settings)`. **Adicionar** `useOrdersProvider` e uma query `["orders-by-customer", customer?.id]` habilitada quando há cliente (`ordersProvider.listByCustomer`). A query de veículos passa a expor **todos** os veículos (não só `firstVehicle`).
2. `const prefs = useQuoteEditorPrefs();` e `const layout = quoteLayoutClasses(prefs.layout);`
3. Estado de itens via `addOrIncrementItem`:

```tsx
const [highlightId, setHighlightId] = useState<ID | null>(null);
const handleAddPart = (part: IPart) => {
  setItems((prev) => {
    const { items: next, affectedId } = addOrIncrementItem(prev, part);
    setHighlightId(affectedId);
    return next;
  });
};
const handleAddFreeItem = (item: IQuoteItem) => {
  setItems((prev) => [...prev, item]);
  setHighlightId(item.id);
};
const inQuoteQtyByPart = useMemo(() => {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.partId, (m.get(it.partId) ?? 0) + it.quantity);
  return m;
}, [items]);
```

4. `handleItemPatch` e `handleRemoveItem`: **idênticos** aos de `NewQuotePage.tsx:128-137` / `125-127`.
5. `recalculateQuote` / `requiresDiscountApproval` / `canSubmit` / `handleSave`: **idênticos** aos atuais.
6. Composição:

```tsx
const body = (
  <div className={layout.body}>
    <Card className="p-4">
      <SectionTitle icon="mdi:account-outline" title="Cliente" />
      <CustomerChip customer={customer} onChange={setCustomer} sellerIdFilter={isManagerOrOwner ? null : (currentUser?.sellerId ?? null)} />
    </Card>
    <Card className="p-4">
      <SectionTitle icon="mdi:format-list-bulleted" title="Itens" />
      <ItemAdder
        mode={prefs.addMode}
        onModeChange={prefs.setAddMode}
        vehicles={vehicles}
        orders={orders}
        inQuoteQtyByPart={inQuoteQtyByPart}
        onAddPart={handleAddPart}
        onAddFreeItemClick={() => setFreeOpen(true)}
      />
      <div className="mt-3">
        <QuoteItemsTable items={items} subtotal={totals.subtotal} onPatch={handleItemPatch} onRemove={handleRemoveItem} highlightId={highlightId} />
      </div>
    </Card>
    <Card className="p-4">
      <SectionTitle icon="mdi:credit-card-outline" title="Condições de pagamento" />
      {/* mover o grid de pagamento atual (forma/prazo/válido até) para cá, inalterado */}
    </Card>
    <Card className="p-4">
      <SectionTitle icon="mdi:note-text-outline" title="Notas internas" />
      {/* textarea de notas, inalterada */}
    </Card>
  </div>
);

const summary = (
  <QuoteSummaryPanel
    itemCount={items.length}
    unitCount={items.reduce((a, it) => a + it.quantity, 0)}
    subtotal={totals.subtotal}
    discountInput={discountInput}
    onDiscountInput={setDiscountInput}
    discountPct={discountPct}
    thresholdPct={thresholdPct}
    shipping={shipping}
    onShipping={setShipping}
    onCalcShipping={handleCalcShipping}
    discountTotal={totals.discount}
    shippingTotal={totals.shipping}
    total={totals.total}
    needsJustification={needsJustification}
    discountReason={discountReason}
    onDiscountReason={setDiscountReason}
  />
);

return (
  <div className={layout.root}>
    <QuoteActionBar
      layout={prefs.layout}
      onLayoutChange={prefs.setLayout}
      onBack={() => void navigate({ to: "/app/orcamentos" })}
      canSubmit={canSubmit}
      submitting={submitting}
      needsApproval={needsJustification}
      onSaveDraft={() => void handleSave(false)}
      onSaveSend={() => void handleSave(true)}
    />
    <div className={layout.grid}>
      {body}
      <div className={layout.summary}>{summary}</div>
    </div>
    <FreeItemDialog open={freeOpen} onClose={() => setFreeOpen(false)} onAdd={handleAddFreeItem} />
  </div>
);
```

`SectionTitle` é um pequeno helper local (ícone + `<h2>`), substituindo o `Section` numerado atual. `handleCalcShipping` é a função de cálculo de frete extraída do `onClick` do botão "Calcular" em `NewQuotePage.tsx:368-396`, inalterada.

- [ ] **Step 2: Reescrever `NewQuotePage.tsx` para delegar**

```tsx
// src/features/quotes/pages/NewQuotePage.tsx
import { QuoteEditor } from "../components/new/QuoteEditor";

export function NewQuotePage() {
  return <QuoteEditor />;
}
```

- [ ] **Step 3: Type-check + lint**

Run: `bun run build && bun run lint`
Expected: limpos. Resolva qualquer import não usado remanescente do `NewQuotePage` antigo.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/components/new/QuoteEditor.tsx src/features/quotes/pages/NewQuotePage.tsx
git commit -m "feat(quotes): wire quote editor with layouts and multi-mode item adding"
```

---

## Task 15: Remover `AddItemModal` e verificar regressões

**Files:**
- Delete: `src/features/quotes/components/new/AddItemModal.tsx`

- [ ] **Step 1: Confirmar que nada mais importa o modal**

Run: `grep -rn "AddItemModal" src/` (use a ferramenta Grep)
Expected: nenhum resultado fora do próprio arquivo. Se o PWA (`PWAQuickQuotePage`) usar, **não delete ainda** — em vez disso, deixe o arquivo e registre no relatório que o PWA migra na Fase 2.

- [ ] **Step 2: Remover o arquivo (se órfão)**

```bash
git rm src/features/quotes/components/new/AddItemModal.tsx
```

- [ ] **Step 3: Build + lint finais**

Run: `bun run build && bun run lint`
Expected: limpos.

- [ ] **Step 4: Checklist de não-regressão (manual — você executa, não o usuário)**

Confirme por leitura de código que o `QuoteEditor` preserva:
- geração de número via `generateQuoteNumber(all.data, storeId)`;
- `composePaymentCondition(paymentMethod, paymentTerms)`;
- `auditLog({ action: "quote_create", ... })`;
- status `enviado` vs `rascunho` conforme `sendNow && !needsJustification`;
- `requiresApproval: needsJustification`;
- `invalidateQueries(["quotes-list"])` e navegação para `/app/orcamentos/$id`.

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(quotes): remove legacy AddItemModal"
```

---

## Self-Review (preenchido)

**1. Cobertura do spec (Fase 1):**
- Layout 3 opções + seletor + remoção do `max-w-5xl` → Tasks 1, 5, 13 (LayoutSwitcher/ActionBar), 14 (composição). ✅
- Resumo sticky (twoCol) / rodapé (footerBar) → Task 5 (`layout.summary`/`summaryAsFooterBar`), 13 (`QuoteSummaryPanel`), 14 (composição). ✅
- Adição contínua que não fecha + 3 modos + seletor → Tasks 11, 12. ✅
- Incremento de duplicata → Task 3 (`addOrIncrementItem`) + Task 14 (fiação). ✅
- Sugestões por veículo (multi, chips) → Task 4 + Task 9. ✅
- Recompra → Task 4 + Task 9. ✅
- Item avulso → Tasks 3 (`buildFreeItem`) + 10. ✅
- Persistência por vendedor → Tasks 1 + 2. ✅
- A11y básica (aria-labels, alvos ≥24px nos botões 9x9=36px, role=alert no desconto) → Tasks 7, 8, 13. ✅
- `summaryAsFooterBar` mobile/footerBar → Task 5; **nota:** a renderização condicional do resumo como barra de rodapé em `footerBar` é tratada na composição da Task 14 via `layout.summary` (classes fixed). ✅

**2. Placeholders:** nenhum "TBD/etc". A Task 14 referencia "mover o grid de pagamento/notas inalterado" — isso é extração literal de código existente já mostrado no spec/página, não um placeholder de lógica nova.

**3. Consistência de tipos:** `QuoteLayout`/`QuoteAddMode` (Task 1) usados igualmente em 2, 5, 12, 13. `IAdderProps` repetida em 11/12 com a mesma forma (proposital — evita um index extra). `addOrIncrementItem` retorna `{items, affectedId}` consumido na Task 14. `getCategoryIcon` confirmado no barrel do catálogo. `Checkbox` validado por passo explícito (Task 11 Step 4).
