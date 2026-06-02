# Quote Editor — Fase 2 (Detalhamento de catálogo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer o editor de orçamento com dados de catálogo: linha de item rica (selo Original/Equivalente, OEM+marca, estoque em 3 estados, equivalentes inline com troca, margem por linha gated), cliente como chip inteligente (status, ABC, última compra, veículos) e resumo como painel de decisão (peso total, margem total gated, desconto vs. limite com medidor).

**Architecture:** Construído sobre a Fundação da Fase 1 (`src/features/quotes/components/new/`). O `IQuoteItem` guarda só snapshots (nome/SKU/preço), então o enriquecimento resolve o `IPart` correspondente por `partId` através de um índice `Map<ID, IPart>` (`usePartsIndex`, reusa a query `["parts-for-quote"]` já cacheada). Lógica de apresentação pura (badges de estoque, valor de margem, agregados de peso/margem) vive em `quoteItemDisplay.ts`, testável por script de asserção. Componentes consomem só tokens semânticos Tailwind e providers via barrel `@/providers/data`.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router/Query, Tailwind v4 + shadcn/ui (`badge`, `collapsible`, `tooltip`, `separator`), Iconify (`mdi:*`), sonner, Bun.

---

## Convenção de validação (LEIA ANTES DE COMEÇAR)

**Este projeto NÃO tem test runner** (ver `CLAUDE.md`: "Não há suite de testes configurada"). **NÃO instale Vitest/Jest/Testing-Library** — adicionar dependência fere o guard de supply-chain (`bunfig.toml`) e exige aprovação do usuário. A validação de cada task é:

1. **Lógica pura** (utils): escreva um **script de asserção descartável** em `scripts/_check_<topic>.ts`, rode com `bun run scripts/_check_<topic>.ts` (deve imprimir `ALL PASS` e sair 0), e **apague o script** antes do commit (`rm`/`git rm`). Padrão já usado neste repo.
2. **Type-check:** `bun run build` — deve completar sem erros de `tsc`.
3. **Lint POR-ARQUIVO:** `bun run lint` global é **inutilizável** neste repo (≈64k falsos-positivos `prettier/prettier Delete ␍` por `core.autocrlf=true` em arquivos pré-existentes). O gate correto é **por arquivo**: `bunx prettier --check <arquivos>` + `bunx eslint <arquivos>`. Arquivos novos escritos pelas ferramentas saem em LF e passam isolados. Respeite `no-restricted-imports`: importe providers via `@/providers/data/hooks/use*Provider`, nunca de `impl/`.
4. **UI:** verificação **manual** pelo usuário. **NÃO abra browser/preview automaticamente** (preferência registrada do usuário).

Onde "teste" aparece abaixo, significa **script de asserção descartável** (lógica) ou **build + lint por-arquivo** (componentes), não um test runner.

## Convenções de código do repo

- `camelCase` funções/vars, `PascalCase` componentes/tipos. Arquivos de componente em `PascalCase.tsx`; utils/hooks em `camelCase.ts`.
- Comentários em inglês; UI em português do Brasil com **acentos corretos** (UTF-8).
- Tipos de domínio com prefixo `I`.
- Componentes consomem só tokens semânticos Tailwind (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-muted-foreground`, `bg-muted`, `text-destructive`). Cores de status fora do espectro semântico (estoque âmbar/vermelho, status do cliente) seguem o padrão já existente em `customerDisplay.ts` — classes `*-500/15` + `dark:` para contraste. **Nunca** hex direto nem `--gallo-*`.
- Prettier do projeto: `printWidth: 100, semi: true, singleQuote: false, trailingComma: "all"`.

## Tipos e assinaturas existentes (NÃO redefinir — importar)

```ts
// @/shared/types
interface IQuoteItem { id: ID; partId: ID; partSku: string; partName: string; quantity: number; unitPrice: Money; discount: Money; total: Money; }
interface IPart {
  id: ID; sku: string; name: string; oemCodes: string[]; equivalentPartIds: ID[];
  crossReferences?: { brand: string; code: string }[]; applications: IApplication[];
  brand: string; category?: PartCategory; subcategory?: string; isOriginal?: boolean;
  imageUrl?: string; unitCost: Money; unitPrice: Money; marginPercent: number;
  averageCost?: Money; weightKg?: number; stockAvailable: number; stockMinimum: number;
  active: boolean; /* …more */
}
interface IVehicle { id: ID; customerId: ID; brand: string; model: string; year: number; engine: string; plate?: string; /* … */ }
type ICustomer = ICustomerB2B | ICustomerB2C;          // discriminated union over `type: "B2B" | "B2C"`
//   common: status: CustomerStatus; abcClass?: ABCClass; lastPurchaseAt?: ISO8601; address?: ICustomerAddress;
type CustomerStatus = "ativo" | "dormente" | "recuperacao" | "perdido";
type ABCClass = "A" | "B" | "C";
type ID = string; type Money = number; type ISO8601 = string;
```

```ts
// @/features/catalog  (barrel — já exporta tudo abaixo)
function getEquivalents(parts: IPart[], partId: ID): IPart[];           // resolve equivalentPartIds
function getCategoryIcon(category?: PartCategory): string;             // mdi:* fallback icon
function searchPartsByText(parts: IPart[], query: string): IPart[];
function searchPartsByApplication(parts: IPart[], input): IPart[];

// @/features/quotes/utils/quoteTotals
function round2(value: number): number;

// @/features/quotes/utils/quoteItemOps
const FREE_ITEM_PART_ID = "avulso";
function addOrIncrementItem(items: IQuoteItem[], part: IPart, quantity?): { items: IQuoteItem[]; affectedId: ID };

// @/features/customers/utils/customerDisplay  (reusar — NÃO duplicar)
function getCustomerName(customer: ICustomer): string;
const STATUS_BADGE_CLASSES: Record<CustomerStatus, string>;
const ABC_BADGE_CLASSES: Record<ABCClass, string>;
const TYPE_BADGE_CLASSES: Record<ICustomer["type"], string>;

// @/components/ui/badge
function Badge(props): JSX.Element;   // variant: default|secondary|destructive|outline
```

## Estrutura de arquivos (Fase 2)

**Novos:**
- `src/features/quotes/utils/quoteItemDisplay.ts` — apresentação pura: `stockBadge`, `lineMarginValue`, `quoteAggregates`.
- `src/features/quotes/hooks/usePartsIndex.ts` — `Map<ID, IPart>` + `allParts` da query `["parts-for-quote"]`.
- `src/features/quotes/components/new/items/EquivalentsPanel.tsx` — lista expansível de equivalentes com ação "Trocar".

**Modificados:**
- `src/features/quotes/utils/quoteItemOps.ts` — `+ swapItemPart`.
- `src/features/customers/utils/customerDisplay.ts` — `+ CUSTOMER_STATUS_LABELS` (export canônico).
- `src/features/quotes/components/new/items/ItemResultRow.tsx` — usa `stockBadge` compartilhado + selo Original/Equivalente.
- `src/features/quotes/components/new/items/QuoteItemsTable.tsx` — linha rica (selo, OEM+marca, estoque, margem gated, equivalentes inline).
- `src/features/quotes/components/new/customer/CustomerChip.tsx` — chip inteligente.
- `src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx` — painel de decisão (peso, margem gated, medidor de desconto).
- `src/features/quotes/components/new/QuoteEditor.tsx` — fiação (índice de peças, veículos → chip, `showMargin`, agregados, troca de equivalente).

---

## Task 1: Utilitários de apresentação (`quoteItemDisplay.ts`)

**Files:**
- Create: `src/features/quotes/utils/quoteItemDisplay.ts`
- Test (descartável): `scripts/_check_quote_item_display.ts`

- [ ] **Step 1: Escreva o utilitário puro**

Crie `src/features/quotes/utils/quoteItemDisplay.ts`:

```ts
// src/features/quotes/utils/quoteItemDisplay.ts
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { round2 } from "./quoteTotals";
import { FREE_ITEM_PART_ID } from "./quoteItemOps";

export type StockTone = "ok" | "low" | "out";

export interface IStockBadge {
  tone: StockTone;
  /** Short label, e.g. "12 em estoque", "3 (baixo)", "sem estoque". */
  label: string;
  /** Text color class for the label. */
  textClassName: string;
  /** Background+text classes for a small dot/pill. */
  dotClassName: string;
}

/**
 * Three-state stock badge for a part. Out-of-stock is a warning, not a block:
 * the part can still be sold on back-order ("sob encomenda").
 */
export function stockBadge(part: IPart): IStockBadge {
  if (part.stockAvailable <= 0) {
    return {
      tone: "out",
      label: "sem estoque",
      textClassName: "text-destructive",
      dotClassName: "bg-destructive",
    };
  }
  if (part.stockAvailable <= part.stockMinimum) {
    return {
      tone: "low",
      label: `${part.stockAvailable} (baixo)`,
      textClassName: "text-amber-600 dark:text-amber-400",
      dotClassName: "bg-amber-500",
    };
  }
  return {
    tone: "ok",
    label: `${part.stockAvailable} em estoque`,
    textClassName: "text-muted-foreground",
    dotClassName: "bg-emerald-500",
  };
}

/**
 * Monetary gross margin of a single quote line, using the part's cost.
 * Falls back to `unitCost` when `averageCost` is absent. Uses the item's
 * snapshot `unitPrice`/`discount` so it reflects what is actually quoted.
 * Returns 0 when the part is not resolvable (e.g. free items).
 */
export function lineMarginValue(item: IQuoteItem, part: IPart | undefined): number {
  if (!part || item.partId === FREE_ITEM_PART_ID) return 0;
  const cost = part.averageCost ?? part.unitCost;
  return round2((item.unitPrice - cost) * item.quantity - item.discount);
}

export interface IQuoteAggregates {
  /** Σ weightKg * quantity (kg). Parts without weight contribute 0. */
  totalWeightKg: number;
  /** Σ monetary line margin (BRL). */
  totalMargin: number;
  /** totalMargin / subtotal (0..1); 0 when subtotal <= 0. */
  marginPct: number;
}

/** Aggregate weight and margin across the quote, resolving parts by id. */
export function quoteAggregates(
  items: IQuoteItem[],
  partsById: Map<ID, IPart>,
  subtotal: number,
): IQuoteAggregates {
  let totalWeightKg = 0;
  let totalMargin = 0;
  for (const item of items) {
    const part = partsById.get(item.partId);
    if (part?.weightKg) totalWeightKg += part.weightKg * item.quantity;
    totalMargin += lineMarginValue(item, part);
  }
  totalWeightKg = round2(totalWeightKg);
  totalMargin = round2(totalMargin);
  return {
    totalWeightKg,
    totalMargin,
    marginPct: subtotal > 0 ? totalMargin / subtotal : 0,
  };
}
```

- [ ] **Step 2: Escreva o script de asserção e rode (deve passar)**

Crie `scripts/_check_quote_item_display.ts`:

```ts
import type { IPart, IQuoteItem } from "@/shared/types";
import { stockBadge, lineMarginValue, quoteAggregates } from "@/features/quotes/utils/quoteItemDisplay";

let pass = true;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    pass = false;
    console.error("FAIL:", msg);
  }
}

function makePart(over: Partial<IPart>): IPart {
  return {
    id: "p1", sku: "SKU1", name: "Filtro", oemCodes: ["OEM-1"], equivalentPartIds: [],
    applications: [], brand: "Mann", unitCost: 50, unitPrice: 100, marginPercent: 0.5,
    stockAvailable: 10, stockMinimum: 2, division: "parts", active: true,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}
function makeItem(over: Partial<IQuoteItem>): IQuoteItem {
  return { id: "i1", partId: "p1", partSku: "SKU1", partName: "Filtro", quantity: 1, unitPrice: 100, discount: 0, total: 100, ...over };
}

// stockBadge — three states
assert(stockBadge(makePart({ stockAvailable: 0 })).tone === "out", "stock 0 → out");
assert(stockBadge(makePart({ stockAvailable: 2, stockMinimum: 2 })).tone === "low", "available == minimum → low");
assert(stockBadge(makePart({ stockAvailable: 1, stockMinimum: 2 })).tone === "low", "below minimum → low");
assert(stockBadge(makePart({ stockAvailable: 10, stockMinimum: 2 })).tone === "ok", "above minimum → ok");

// lineMarginValue — uses averageCost when present, else unitCost
assert(lineMarginValue(makeItem({ quantity: 2 }), makePart({ unitCost: 60 })) === 80, "(100-60)*2 = 80");
assert(lineMarginValue(makeItem({ quantity: 2, discount: 10 }), makePart({ unitCost: 60 })) === 70, "minus line discount");
assert(lineMarginValue(makeItem({ averageCost: undefined } as never), makePart({ averageCost: 70, unitCost: 60 })) === 30, "prefers averageCost (100-70)");
assert(lineMarginValue(makeItem({ partId: "avulso" }), undefined) === 0, "free item → 0 margin");

// quoteAggregates
const partsById = new Map<string, IPart>([
  ["p1", makePart({ id: "p1", weightKg: 1.5, unitCost: 60 })],
  ["p2", makePart({ id: "p2", weightKg: undefined, unitCost: 40, unitPrice: 80 })],
]);
const items = [
  makeItem({ id: "i1", partId: "p1", quantity: 2, unitPrice: 100, total: 200 }),
  makeItem({ id: "i2", partId: "p2", quantity: 1, unitPrice: 80, total: 80 }),
];
const agg = quoteAggregates(items, partsById, 280);
assert(agg.totalWeightKg === 3, "weight = 1.5*2 + 0 = 3");
assert(agg.totalMargin === 120, "margin = (100-60)*2 + (80-40)*1 = 120");
assert(Math.abs(agg.marginPct - 120 / 280) < 1e-9, "marginPct = 120/280");
assert(quoteAggregates([], new Map(), 0).marginPct === 0, "empty → 0 pct, no div by zero");

console.log(pass ? "ALL PASS" : "SOME FAILED");
process.exit(pass ? 0 : 1);
```

Run: `bun run scripts/_check_quote_item_display.ts`
Expected: prints `ALL PASS`, exit 0.

- [ ] **Step 3: Apague o script e valide build/lint do arquivo novo**

```bash
rm scripts/_check_quote_item_display.ts
bunx prettier --check src/features/quotes/utils/quoteItemDisplay.ts
bunx eslint src/features/quotes/utils/quoteItemDisplay.ts
bun run build
```
Expected: prettier "All matched files use Prettier code style!", eslint sem saída, build sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/utils/quoteItemDisplay.ts
git commit -m "feat(quotes): add stock badge and margin/weight aggregates for rich item line"
```

---

## Task 2: Operação de troca por equivalente (`swapItemPart`)

**Files:**
- Modify: `src/features/quotes/utils/quoteItemOps.ts`
- Test (descartável): `scripts/_check_swap_item.ts`

- [ ] **Step 1: Adicione `swapItemPart` ao final de `quoteItemOps.ts`**

Acrescente (mantenha o restante do arquivo intacto):

```ts
/**
 * Replace the part of an existing line with another part (an equivalent),
 * keeping the quantity, resetting the line discount, and re-snapshotting the
 * SKU/name/unitPrice from the new part. No-op if the line is not found.
 * Returns a new array and the affected line id (for highlight).
 */
export function swapItemPart(
  items: IQuoteItem[],
  itemId: ID,
  part: IPart,
): { items: IQuoteItem[]; affectedId: ID } {
  const target = items.find((it) => it.id === itemId);
  if (!target) return { items, affectedId: itemId };
  const updated: IQuoteItem = {
    ...target,
    partId: part.id,
    partSku: part.sku,
    partName: part.name,
    unitPrice: part.unitPrice,
    discount: 0,
    total: round2(target.quantity * part.unitPrice),
  };
  return {
    items: items.map((it) => (it.id === itemId ? updated : it)),
    affectedId: itemId,
  };
}
```

- [ ] **Step 2: Escreva o script de asserção e rode (deve passar)**

Crie `scripts/_check_swap_item.ts`:

```ts
import type { IPart, IQuoteItem } from "@/shared/types";
import { swapItemPart } from "@/features/quotes/utils/quoteItemOps";

let pass = true;
function assert(c: boolean, m: string) { if (!c) { pass = false; console.error("FAIL:", m); } }

const part: IPart = {
  id: "p2", sku: "SKU2", name: "Filtro equivalente", oemCodes: [], equivalentPartIds: [],
  applications: [], brand: "Fleetguard", unitCost: 30, unitPrice: 90, marginPercent: 0.4,
  stockAvailable: 20, stockMinimum: 3, division: "parts", active: true,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};
const items: IQuoteItem[] = [
  { id: "i1", partId: "p1", partSku: "SKU1", partName: "Filtro orig.", quantity: 3, unitPrice: 100, discount: 15, total: 285 },
];

const r = swapItemPart(items, "i1", part);
assert(r.affectedId === "i1", "affectedId is the line");
const line = r.items[0];
assert(line.partId === "p2" && line.partSku === "SKU2" && line.partName === "Filtro equivalente", "re-snapshots part fields");
assert(line.quantity === 3, "keeps quantity");
assert(line.unitPrice === 90, "takes new unit price");
assert(line.discount === 0, "resets discount");
assert(line.total === 270, "total = 3 * 90");
assert(items[0].partId === "p1", "original array not mutated");

const miss = swapItemPart(items, "nope", part);
assert(miss.items === items, "unknown id → same array reference (no-op)");

console.log(pass ? "ALL PASS" : "SOME FAILED");
process.exit(pass ? 0 : 1);
```

Run: `bun run scripts/_check_swap_item.ts`
Expected: prints `ALL PASS`, exit 0.

- [ ] **Step 3: Apague o script e valide**

```bash
rm scripts/_check_swap_item.ts
bunx prettier --check src/features/quotes/utils/quoteItemOps.ts
bunx eslint src/features/quotes/utils/quoteItemOps.ts
bun run build
```
Expected: tudo limpo.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/utils/quoteItemOps.ts
git commit -m "feat(quotes): add swapItemPart to replace a line with an equivalent"
```

---

## Task 3: Índice de peças (`usePartsIndex`)

**Files:**
- Create: `src/features/quotes/hooks/usePartsIndex.ts`

Reusa a **mesma** query key `["parts-for-quote"]` de `useItemSearch` — TanStack Query deduplica, então não há fetch extra quando o adder já carregou as peças.

- [ ] **Step 1: Crie o hook**

```ts
// src/features/quotes/hooks/usePartsIndex.ts
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";

export interface IUsePartsIndex {
  /** Lookup by part id — resolves the IPart behind a quote item's partId. */
  partsById: Map<ID, IPart>;
  /** Flat list (needed to resolve equivalents via getEquivalents). */
  allParts: IPart[];
  isLoading: boolean;
}

/**
 * Provides the full active catalog indexed by id, for enriching quote item
 * lines. Shares the `["parts-for-quote"]` query with `useItemSearch`.
 */
export function usePartsIndex(enabled = true): IUsePartsIndex {
  const partsProvider = usePartsProvider();
  const partsQuery = useQuery({
    queryKey: ["parts-for-quote"] as const,
    queryFn: async () => (await partsProvider.list({ pageSize: 1000, active: true })).data,
    enabled,
    staleTime: 60_000,
  });

  const allParts = useMemo(() => partsQuery.data ?? [], [partsQuery.data]);
  const partsById = useMemo(() => {
    const map = new Map<ID, IPart>();
    for (const p of allParts) map.set(p.id, p);
    return map;
  }, [allParts]);

  return { partsById, allParts, isLoading: partsQuery.isLoading };
}
```

- [ ] **Step 2: Valide**

```bash
bunx prettier --check src/features/quotes/hooks/usePartsIndex.ts
bunx eslint src/features/quotes/hooks/usePartsIndex.ts
bun run build
```
Expected: tudo limpo (build cobre o type-check do hook mesmo sem consumidor ainda).

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/hooks/usePartsIndex.ts
git commit -m "feat(quotes): add usePartsIndex hook to resolve parts by id"
```

---

## Task 4: Selo Original/Equivalente + estoque compartilhado no `ItemResultRow`

Refatora a linha de resultado de busca para (a) usar o `stockBadge` compartilhado (remove a função local `stockTone`) e (b) exibir um selo **Original** (dourado) ou **Equivalente** (neutro).

**Files:**
- Modify: `src/features/quotes/components/new/items/ItemResultRow.tsx`

- [ ] **Step 1: Substitua o conteúdo do arquivo**

```tsx
// src/features/quotes/components/new/items/ItemResultRow.tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getCategoryIcon } from "@/features/catalog";
import { stockBadge } from "../../../utils/quoteItemDisplay";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IItemResultRowProps {
  part: IPart;
  /** Quantity already in the quote for this part (0 when absent). */
  inQuoteQty?: number;
  onAdd: (part: IPart) => void;
}

export function ItemResultRow({ part, inQuoteQty = 0, onAdd }: IItemResultRowProps) {
  const stock = stockBadge(part);
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
          <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
            <span className="truncate">{part.name}</span>
            {part.isOriginal ? (
              <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-0 text-[10px] font-semibold text-primary">
                Original
              </span>
            ) : (
              <span className="shrink-0 rounded border border-border bg-muted px-1 py-0 text-[10px] font-medium text-muted-foreground">
                Equivalente
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            OEM {part.oemCodes[0] ?? "—"} · SKU {part.sku} · {part.brand} ·{" "}
            <span className={stock.textClassName}>{stock.label}</span>
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-semibold tabular-nums">
            {moneyFormatter.format(part.unitPrice)}
          </p>
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

- [ ] **Step 2: Valide**

```bash
bunx prettier --check src/features/quotes/components/new/items/ItemResultRow.tsx
bunx eslint src/features/quotes/components/new/items/ItemResultRow.tsx
bun run build
```
Expected: tudo limpo.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/ItemResultRow.tsx
git commit -m "feat(quotes): show original/equivalent badge and shared stock badge in result rows"
```

---

## Task 5: Painel de equivalentes (`EquivalentsPanel`)

Lista os equivalentes de uma peça e permite **trocar** a linha por um deles. Renderizado dentro de uma linha expandida da tabela.

**Files:**
- Create: `src/features/quotes/components/new/items/EquivalentsPanel.tsx`

- [ ] **Step 1: Crie o componente**

```tsx
// src/features/quotes/components/new/items/EquivalentsPanel.tsx
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { getEquivalents } from "@/features/catalog";
import { stockBadge } from "../../../utils/quoteItemDisplay";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export interface IEquivalentsPanelProps {
  /** The part whose equivalents to show. */
  part: IPart;
  /** Full catalog, to resolve equivalent ids. */
  allParts: IPart[];
  /** Swap the current line for the chosen equivalent. */
  onSwap: (equivalent: IPart) => void;
}

export function EquivalentsPanel({ part, allParts, onSwap }: IEquivalentsPanelProps) {
  const equivalents = getEquivalents(allParts, part.id);

  if (equivalents.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Sem equivalentes cadastrados para esta peça.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {equivalents.map((eq) => {
        const stock = stockBadge(eq);
        return (
          <li key={eq.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">
                {eq.name}
                <span className="ml-1.5 text-[10px] text-muted-foreground">· {eq.brand}</span>
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                SKU {eq.sku} · <span className={stock.textClassName}>{stock.label}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold tabular-nums">
                {moneyFormatter.format(eq.unitPrice)}
              </span>
              <button
                type="button"
                onClick={() => onSwap(eq)}
                className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-foreground hover:bg-muted"
                aria-label={`Trocar por ${eq.name}`}
              >
                <Icon icon="mdi:swap-horizontal" size={13} />
                Trocar
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Re-export the swap id type alias for callers that thread item ids.
export type SwapTargetId = ID;
```

> Nota: o `SwapTargetId` é só um alias re-exportado por conveniência; quem chama `onSwap` já tem o `IPart` do equivalente. A linha-alvo é controlada pela tabela (Task 6).

- [ ] **Step 2: Valide**

```bash
bunx prettier --check src/features/quotes/components/new/items/EquivalentsPanel.tsx
bunx eslint src/features/quotes/components/new/items/EquivalentsPanel.tsx
bun run build
```
Expected: tudo limpo.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/EquivalentsPanel.tsx
git commit -m "feat(quotes): add EquivalentsPanel to swap a line for an equivalent part"
```

---

## Task 6: Linha de item rica na `QuoteItemsTable`

Enriquece cada linha da tabela do orçamento com: thumbnail, selo Original/Equivalente, OEM+marca, badge de estoque (3 estados), margem por linha (**só** `Owner`/`Gestor`) e link "ver equivalentes" que expande o `EquivalentsPanel`. Itens avulsos (`partId === "avulso"`, sem `IPart`) degradam graciosamente (sem badges/estoque/equivalentes).

**Files:**
- Modify: `src/features/quotes/components/new/items/QuoteItemsTable.tsx`

- [ ] **Step 1: Substitua o conteúdo do arquivo**

```tsx
// src/features/quotes/components/new/items/QuoteItemsTable.tsx
import { useEffect, useState } from "react";
import type { ID, IPart, IQuoteItem } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { getCategoryIcon } from "@/features/catalog";
import { stockBadge, lineMarginValue } from "../../../utils/quoteItemDisplay";
import { EquivalentsPanel } from "./EquivalentsPanel";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pctFormatter = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

export interface IQuoteItemsTableProps {
  items: IQuoteItem[];
  subtotal: number;
  onPatch: (id: ID, patch: Partial<IQuoteItem>) => void;
  onRemove: (id: ID) => void;
  /** Line to flash as recently added/updated. */
  highlightId?: ID | null;
  /** Resolves the IPart behind each item's partId (for the rich line). */
  partsById: Map<ID, IPart>;
  /** Full catalog, to resolve equivalents in the expand panel. */
  allParts: IPart[];
  /** Show per-line margin (Owner/Gestor only). */
  showMargin: boolean;
  /** Swap an existing line for one of its equivalents. */
  onSwapEquivalent: (itemId: ID, equivalent: IPart) => void;
}

export function QuoteItemsTable({
  items,
  subtotal,
  onPatch,
  onRemove,
  highlightId,
  partsById,
  allParts,
  showMargin,
  onSwapEquivalent,
}: IQuoteItemsTableProps) {
  const [flashId, setFlashId] = useState<ID | null>(null);
  const [expandedId, setExpandedId] = useState<ID | null>(null);
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

  // Column span for the full-width expand row: Peça, Qtd, Unit, Desc, Subtotal, action = 6.
  const COLSPAN = 6;

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
          {items.map((it) => {
            const part = partsById.get(it.partId);
            const stock = part ? stockBadge(part) : null;
            const hasEquivalents = (part?.equivalentPartIds.length ?? 0) > 0;
            const isExpanded = expandedId === it.id;
            const margin = showMargin ? lineMarginValue(it, part) : 0;
            return (
              <>
                <tr
                  key={it.id}
                  className={`border-t border-border transition-colors duration-300 motion-reduce:transition-none ${
                    flashId === it.id ? "bg-primary/15" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded bg-muted text-muted-foreground">
                        {part?.imageUrl ? (
                          <img src={part.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Icon icon={getCategoryIcon(part?.category)} size={16} />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <span className="truncate">{it.partName}</span>
                          {part &&
                            (part.isOriginal ? (
                              <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-semibold text-primary">
                                Original
                              </span>
                            ) : (
                              <span className="shrink-0 rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                                Equivalente
                              </span>
                            ))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {part ? (
                            <>
                              OEM {part.oemCodes[0] ?? "—"} · {part.brand} · SKU {it.partSku}
                            </>
                          ) : (
                            <>SKU {it.partSku}</>
                          )}
                        </p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          {stock && (
                            <span className={`inline-flex items-center gap-1 text-[10px] ${stock.textClassName}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${stock.dotClassName}`} />
                              {stock.label}
                            </span>
                          )}
                          {showMargin && part && (
                            <span className="text-[10px] text-muted-foreground">
                              margem {moneyFormatter.format(margin)} ({pctFormatter.format(part.marginPercent)})
                            </span>
                          )}
                          {hasEquivalents && (
                            <button
                              type="button"
                              onClick={() => setExpandedId(isExpanded ? null : it.id)}
                              className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline"
                              aria-expanded={isExpanded}
                            >
                              <Icon
                                icon={isExpanded ? "mdi:chevron-up" : "mdi:chevron-down"}
                                size={12}
                              />
                              {isExpanded ? "ocultar equivalentes" : "ver equivalentes"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Input
                      type="number"
                      min={1}
                      aria-label={`Quantidade de ${it.partName}`}
                      value={it.quantity}
                      onChange={(e) =>
                        onPatch(it.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
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
                      onChange={(e) =>
                        onPatch(it.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                      }
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
                      onChange={(e) =>
                        onPatch(it.id, { discount: Math.max(0, Number(e.target.value) || 0) })
                      }
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
                {isExpanded && part && (
                  <tr key={`${it.id}-equivalents`} className="border-t border-border bg-muted/20">
                    <td colSpan={COLSPAN} className="p-0">
                      <EquivalentsPanel
                        part={part}
                        allParts={allParts}
                        onSwap={(equivalent) => {
                          onSwapEquivalent(it.id, equivalent);
                          setExpandedId(null);
                        }}
                      />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
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

> Atenção: o `<>...</>` dentro do `.map` precisa de `key` na primeira filha quando o fragmento não aceita `key`. Como um `React.Fragment` curto (`<>`) não aceita `key`, as `key`s ficam nos elementos `<tr>` internos (já estão). Isso é válido em React 19 e o lint não reclama porque cada `<tr>` mapeado carrega sua própria `key` única.

- [ ] **Step 2: Valide**

```bash
bunx prettier --check src/features/quotes/components/new/items/QuoteItemsTable.tsx
bunx eslint src/features/quotes/components/new/items/QuoteItemsTable.tsx
bun run build
```
Expected: tudo limpo. Se o eslint reclamar de `key` no fragmento, troque `<>` por `<Fragment key={it.id}>` (importando `Fragment` de `react`) e remova a `key` do primeiro `<tr>`.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/QuoteItemsTable.tsx
git commit -m "feat(quotes): enrich quote items table with badges, stock, margin and inline equivalents"
```

---

## Task 7: Cliente chip inteligente (`CustomerChip`)

Enriquece o chip do cliente selecionado com: tipo (B2B/B2C), status, classe ABC, última compra e veículos (chips). Apenas **dados já existentes** — sem campos financeiros (Fase 3). Reusa os mapas de classe de `customerDisplay.ts` e adiciona lá o `CUSTOMER_STATUS_LABELS` canônico.

**Files:**
- Modify: `src/features/customers/utils/customerDisplay.ts`
- Modify: `src/features/quotes/components/new/customer/CustomerChip.tsx`

- [ ] **Step 1: Exporte `CUSTOMER_STATUS_LABELS` em `customerDisplay.ts`**

Acrescente ao final de `src/features/customers/utils/customerDisplay.ts`:

```ts
/** Human labels (pt-BR) for each customer lifecycle status. */
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  ativo: "Ativo",
  dormente: "Dormente",
  recuperacao: "Recuperação",
  perdido: "Perdido",
};
```

- [ ] **Step 2: Substitua o conteúdo do `CustomerChip.tsx`**

```tsx
// src/features/quotes/components/new/customer/CustomerChip.tsx
import type { ICustomer, ID, IVehicle } from "@/shared/types";
import { Icon } from "@/components/Icon";
import {
  getCustomerName,
  STATUS_BADGE_CLASSES,
  ABC_BADGE_CLASSES,
  TYPE_BADGE_CLASSES,
  CUSTOMER_STATUS_LABELS,
} from "@/features/customers/utils/customerDisplay";
import { CustomerAutocomplete } from "../CustomerAutocomplete";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function formatLastPurchase(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return dateFormatter.format(d);
}

export interface ICustomerChipProps {
  customer: ICustomer | null;
  onChange: (c: ICustomer | null) => void;
  sellerIdFilter?: ID | null;
  /** Customer fleet, shown as vehicle chips. */
  vehicles?: IVehicle[];
}

export function CustomerChip({
  customer,
  onChange,
  sellerIdFilter,
  vehicles = [],
}: ICustomerChipProps) {
  if (!customer) {
    return (
      <CustomerAutocomplete value={null} onChange={onChange} sellerIdFilter={sellerIdFilter} />
    );
  }

  const lastPurchase = formatLastPurchase(customer.lastPurchaseAt);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground">
              {getCustomerName(customer)}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${TYPE_BADGE_CLASSES[customer.type]}`}
            >
              {customer.type}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLASSES[customer.status]}`}
            >
              {CUSTOMER_STATUS_LABELS[customer.status]}
            </span>
            {customer.abcClass && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ABC_BADGE_CLASSES[customer.abcClass]}`}
                title="Classe ABC"
              >
                ABC {customer.abcClass}
              </span>
            )}
          </div>

          {customer.address && (
            <p className="truncate text-xs text-muted-foreground">
              <Icon icon="mdi:map-marker-outline" size={12} className="mr-1 inline" />
              {customer.address.street}, {customer.address.number} — {customer.address.city}/
              {customer.address.state}
            </p>
          )}

          {lastPurchase && (
            <p className="text-xs text-muted-foreground">
              <Icon icon="mdi:history" size={12} className="mr-1 inline" />
              Última compra em {lastPurchase}
            </p>
          )}

          {vehicles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <Icon
                icon="mdi:truck-outline"
                size={12}
                className="text-muted-foreground"
                aria-hidden
              />
              {vehicles.map((v) => (
                <span
                  key={v.id}
                  className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {v.brand} {v.model} {v.year}
                  {v.plate ? ` · ${v.plate}` : ""}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          Alterar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Valide**

```bash
bunx prettier --check src/features/customers/utils/customerDisplay.ts src/features/quotes/components/new/customer/CustomerChip.tsx
bunx eslint src/features/customers/utils/customerDisplay.ts src/features/quotes/components/new/customer/CustomerChip.tsx
bun run build
```
Expected: tudo limpo.

- [ ] **Step 4: Commit**

```bash
git add src/features/customers/utils/customerDisplay.ts src/features/quotes/components/new/customer/CustomerChip.tsx
git commit -m "feat(quotes): smart customer chip with status, ABC, last purchase and vehicles"
```

---

## Task 8: Resumo como painel de decisão (`QuoteSummaryPanel`)

Adiciona ao resumo: **peso total** (Σ `weightKg`·qtd), **margem total** + % (gated `Owner`/`Gestor`) e um **medidor visual** de desconto vs. limite. As novas props têm defaults seguros para não quebrar o modo `compact` (rodapé).

**Files:**
- Modify: `src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx`

- [ ] **Step 1: Adicione as props novas à interface**

Em `IQuoteSummaryPanelProps`, acrescente (após `compact?`):

```ts
  /** Total weight (kg) of the quote — Σ weightKg * quantity. */
  totalWeightKg: number;
  /** Total monetary margin — shown only when `showMargin`. */
  totalMargin: number;
  /** Margin as fraction of subtotal (0..1). */
  marginPct: number;
  /** Whether to surface margin figures (Owner/Gestor only). */
  showMargin: boolean;
```

- [ ] **Step 2: Adicione um sub-componente de medidor de desconto (acima de `export function QuoteSummaryPanel`)**

```tsx
function DiscountMeter({ discountPct, thresholdPct }: { discountPct: number; thresholdPct: number }) {
  const over = discountPct > thresholdPct + 1e-9;
  // Scale the bar against twice the threshold so the limit sits at the midpoint.
  const scaleMax = Math.max(thresholdPct * 2, discountPct, 0.0001);
  const fillPct = Math.min(100, (discountPct / scaleMax) * 100);
  const markerPct = Math.min(100, (thresholdPct / scaleMax) * 100);
  return (
    <div className="space-y-1">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${over ? "bg-orange-500" : "bg-primary"}`}
          style={{ width: `${fillPct}%` }}
        />
        <span
          className="absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 bg-foreground/60"
          style={{ left: `${markerPct}%` }}
          aria-hidden
        />
      </div>
      <p className={`text-xs ${over ? "text-orange-600 dark:text-orange-300" : "text-muted-foreground"}`}>
        {(discountPct * 100).toFixed(1)}% de desconto · limite {(thresholdPct * 100).toFixed(0)}%
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Troque o `discountHint` por `DiscountMeter` no modo cheio**

No corpo principal (modo não-`compact`), substitua o bloco:

```tsx
        <Input
          id="discount"
          ...
        />
        <p className="mt-1 text-xs text-muted-foreground">{discountHint}</p>
      </div>
```

por:

```tsx
        <Input
          id="discount"
          type="number"
          min={0}
          step={0.01}
          value={props.discountInput}
          onChange={(e) => props.onDiscountInput(e.target.value)}
        />
        <div className="mt-1.5">
          <DiscountMeter discountPct={props.discountPct} thresholdPct={props.thresholdPct} />
        </div>
      </div>
```

E **remova** a linha `const discountHint = ...` no topo da função `QuoteSummaryPanel` **apenas se** não houver mais nenhum uso dela. (O modo `compact` não usa `discountHint`; confira com `grep`. Se o `compact` ainda referenciar, mantenha.)

- [ ] **Step 4: Adicione as métricas (peso/margem) no rodapé de totais do modo cheio**

No bloco final de totais (modo cheio), logo **antes** do `<Row label="Subtotal" .../>`, insira a tira de métricas:

```tsx
      <div className="space-y-1 border-t border-border pt-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 pb-1 text-xs text-muted-foreground">
          <span>
            {props.itemCount} {props.itemCount === 1 ? "item" : "itens"} · {props.unitCount} un
          </span>
          {props.totalWeightKg > 0 && (
            <span>
              <Icon icon="mdi:weight-kilogram" size={12} className="mr-0.5 inline" />
              {props.totalWeightKg.toLocaleString("pt-BR")} kg
            </span>
          )}
          {props.showMargin && (
            <span title="Margem bruta estimada">
              <Icon icon="mdi:chart-line" size={12} className="mr-0.5 inline" />
              margem {moneyFormatter.format(props.totalMargin)} ({(props.marginPct * 100).toFixed(1)}%)
            </span>
          )}
        </div>
        <Row label="Subtotal" value={moneyFormatter.format(props.subtotal)} />
```

> Importante: o `<p>` de contagem que hoje abre o modo cheio (`{props.itemCount} … un`) passa a ser redundante com esta tira. **Remova** aquele `<p className="text-xs font-medium text-muted-foreground">…</p>` do topo do modo cheio para não duplicar a contagem. A tira nova já mostra itens/unidades + peso + margem juntos.

- [ ] **Step 5: Valide**

```bash
bunx prettier --check src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx
bunx eslint src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx
bun run build
```
Expected: tudo limpo. Se o build acusar `discountHint` não usado, remova a declaração.

- [ ] **Step 6: Commit**

```bash
git add src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx
git commit -m "feat(quotes): summary as decision panel — total weight, gated margin, discount meter"
```

---

## Task 9: Fiação no `QuoteEditor`

Conecta o índice de peças, a troca de equivalente, os agregados de peso/margem, o `showMargin` e os veículos ao chip. Preserva integralmente `handleSave`, cálculo de frete e aprovação de desconto.

**Files:**
- Modify: `src/features/quotes/components/new/QuoteEditor.tsx`

- [ ] **Step 1: Importe os novos utilitários/hook**

Após a linha `import { addOrIncrementItem } from "../../utils/quoteItemOps";`, acrescente:

```tsx
import { swapItemPart } from "../../utils/quoteItemOps";
import { quoteAggregates } from "../../utils/quoteItemDisplay";
import { usePartsIndex } from "../../hooks/usePartsIndex";
```

- [ ] **Step 2: Instancie o índice de peças e os agregados**

Logo após `const classes = quoteLayoutClasses(prefs.layout);`, adicione:

```tsx
  const { partsById, allParts } = usePartsIndex();
```

E logo após o cálculo de `discountPct` (perto de `const discountPct = ...`), adicione:

```tsx
  const aggregates = useMemo(
    () => quoteAggregates(items, partsById, totals.subtotal),
    [items, partsById, totals.subtotal],
  );
```

- [ ] **Step 3: Adicione o handler de troca de equivalente**

Logo após `handleAddFreeItem`, acrescente:

```tsx
  const handleSwapEquivalent = (itemId: ID, equivalent: IPart) => {
    const result = swapItemPart(items, itemId, equivalent);
    setItems(result.items);
    setHighlightId(result.affectedId);
  };
```

- [ ] **Step 4: Passe `vehicles` ao `CustomerChip`**

Troque:

```tsx
            <CustomerChip
              customer={customer}
              onChange={setCustomer}
              sellerIdFilter={isManagerOrOwner ? null : (currentUser?.sellerId ?? null)}
            />
```

por (adicione a prop `vehicles`):

```tsx
            <CustomerChip
              customer={customer}
              onChange={setCustomer}
              sellerIdFilter={isManagerOrOwner ? null : (currentUser?.sellerId ?? null)}
              vehicles={vehicles}
            />
```

- [ ] **Step 5: Passe as novas props à `QuoteItemsTable`**

Troque:

```tsx
              <QuoteItemsTable
                items={items}
                subtotal={totals.subtotal}
                onPatch={handleItemPatch}
                onRemove={handleRemoveItem}
                highlightId={highlightId}
              />
```

por:

```tsx
              <QuoteItemsTable
                items={items}
                subtotal={totals.subtotal}
                onPatch={handleItemPatch}
                onRemove={handleRemoveItem}
                highlightId={highlightId}
                partsById={partsById}
                allParts={allParts}
                showMargin={isManagerOrOwner}
                onSwapEquivalent={handleSwapEquivalent}
              />
```

- [ ] **Step 6: Passe as novas props ao `QuoteSummaryPanel`**

No `<QuoteSummaryPanel ... />`, acrescente (antes ou depois de `compact={...}`):

```tsx
            totalWeightKg={aggregates.totalWeightKg}
            totalMargin={aggregates.totalMargin}
            marginPct={aggregates.marginPct}
            showMargin={isManagerOrOwner}
```

- [ ] **Step 7: Valide**

```bash
bunx prettier --check src/features/quotes/components/new/QuoteEditor.tsx
bunx eslint src/features/quotes/components/new/QuoteEditor.tsx
bun run build
```
Expected: tudo limpo. O build cobre o type-check de toda a fiação (props batendo com as interfaces das Tasks 6 e 8).

- [ ] **Step 8: Commit**

```bash
git add src/features/quotes/components/new/QuoteEditor.tsx
git commit -m "feat(quotes): wire parts index, equivalents swap, weight/margin aggregates into editor"
```

---

## Task 10: Validação integrada e contraste

Verificação final de que tudo compila junto, o lint dos arquivos tocados está limpo e os pares de cor novos (estoque âmbar/vermelho, status do cliente) têm contraste aceitável.

**Files:** nenhum novo — validação.

- [ ] **Step 1: Build completo + lint por-arquivo de todos os arquivos da Fase 2**

```bash
bun run build
bunx prettier --check \
  src/features/quotes/utils/quoteItemDisplay.ts \
  src/features/quotes/utils/quoteItemOps.ts \
  src/features/quotes/hooks/usePartsIndex.ts \
  src/features/quotes/components/new/items/ItemResultRow.tsx \
  src/features/quotes/components/new/items/EquivalentsPanel.tsx \
  src/features/quotes/components/new/items/QuoteItemsTable.tsx \
  src/features/quotes/components/new/customer/CustomerChip.tsx \
  src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx \
  src/features/quotes/components/new/QuoteEditor.tsx \
  src/features/customers/utils/customerDisplay.ts
bunx eslint \
  src/features/quotes/utils/quoteItemDisplay.ts \
  src/features/quotes/utils/quoteItemOps.ts \
  src/features/quotes/hooks/usePartsIndex.ts \
  src/features/quotes/components/new/items/ItemResultRow.tsx \
  src/features/quotes/components/new/items/EquivalentsPanel.tsx \
  src/features/quotes/components/new/items/QuoteItemsTable.tsx \
  src/features/quotes/components/new/customer/CustomerChip.tsx \
  src/features/quotes/components/new/summary/QuoteSummaryPanel.tsx \
  src/features/quotes/components/new/QuoteEditor.tsx \
  src/features/customers/utils/customerDisplay.ts
```
Expected: build sem erros; prettier "All matched files use Prettier code style!"; eslint sem saída.

- [ ] **Step 2: Checklist de não-regressão (manual — reportar ao usuário, não abrir browser)**

Confirme por leitura de código que estes fluxos seguem intactos:
- `handleSave(false/true)` inalterado (gera número, audita `quote_create`, status `rascunho`/`enviado`, `requiresApproval`, `invalidateQueries(["quotes-list"])`, navega).
- `handleCalcShipping` inalterado.
- Incremento de duplicata (`addOrIncrementItem`) e item avulso (`FreeItemDialog`) seguem funcionando.
- Os 3 layouts (`2col`/`cheio`/`rodape`) e os 3 modos de adição continuam selecionáveis.
- Itens avulsos (`partId === "avulso"`) renderizam na tabela **sem** badges/estoque/equivalentes, sem erro.

- [ ] **Step 3: Nota de contraste**

Os pares de cor introduzidos reusam tons já validados na Fase 1 / em `customerDisplay.ts` (`amber-500/600`, `destructive`, `emerald-500`, `orange-500/600`) sobre `bg-muted`/`bg-card`. Registre no relatório ao usuário que a verificação visual de contraste (rota `/design-system`) e o teste manual da UI ficam a cargo dele (preferência registrada: não abrir browser automaticamente).

- [ ] **Step 4: Sem commit** (task de validação). Prossiga para `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**1. Cobertura do spec (seção "Detalhamento de catálogo (Fase 2)" + "Cliente chip" + "Resumo painel de decisão"):**
- Thumbnail / fallback ícone → Task 6 (`getCategoryIcon`). ✅
- Selo Original vs Equivalente → Tasks 4 e 6. ✅
- OEM + marca → Tasks 4 e 6. ✅
- Estoque 3 estados → Task 1 (`stockBadge`) consumido em 4 e 6. ✅
- "Ver equivalentes" inline + troca por equivalente → Tasks 2 (`swapItemPart`), 5 (`EquivalentsPanel`), 6 (expand), 9 (handler). ✅
- Margem por linha gated Owner/Gestor → Tasks 1 (`lineMarginValue`), 6 (render gated), 9 (`showMargin={isManagerOrOwner}`). ✅
- Cliente chip (tipo, status, abcClass, lastPurchaseAt, endereço, veículos) → Task 7 + 9 (vehicles). ✅
- Resumo painel: contadores, peso total Σ weightKg, % desconto vs limite, alerta+justificativa contíguos (já existia, preservado), margem total gated → Tasks 1 (`quoteAggregates`), 8, 9. ✅

**2. Placeholders:** nenhum "TBD/TODO"; todo passo traz código completo. ✅

**3. Consistência de tipos:** `stockBadge`/`lineMarginValue`/`quoteAggregates` (Task 1) usados com as mesmas assinaturas em 4/6/8/9; `swapItemPart` (Task 2) retorna `{items, affectedId}` igual a `addOrIncrementItem`, consumido em 9; `usePartsIndex` retorna `{partsById, allParts, isLoading}` consumido em 9; props de `QuoteItemsTable`/`QuoteSummaryPanel`/`CustomerChip` definidas nas Tasks 6/8/7 batem com a fiação da Task 9. ✅

**Fora de escopo (Fase 3, não fazer agora):** limite de crédito, título vencido, tabela de preço do cliente, `IServiceKit`/kits, atalhos de teclado, densidade, auto-save de rascunho.
