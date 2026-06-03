# Quote Editor — Fase 3 (Dados novos + Kits) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o editor de orçamento com o modelo de **Kits de revisão** (insere vários itens de uma vez), **enriquecimento financeiro** do cliente (limite de crédito, títulos vencidos via mock, contrato/tabela) com degradação graciosa, e **aceleradores** (atalhos de teclado, densidade da tabela, auto-save de rascunho).

**Architecture:** Kits entram como entidade read-only seguindo o Provider Pattern do repo (seed estático → mock api → contract → impl mock/supabase-stub → factory → hook), consumidos no editor via `useServiceKitsProvider`. O enriquecimento financeiro adiciona um campo opcional de mock (`overdueTitlesCount`) ao modelo de cliente e exibe dados já existentes (`portalContract`, `portal.creditLimit`) com ocultação quando ausentes. Aceleradores estendem `useQuoteEditorPrefs` (densidade) e adicionam um hook `useQuoteDraft` (localStorage) + navegação por teclado no `ContinuousAdder`.

**Tech Stack:** React 19 + TypeScript strict, TanStack Router/Query, Tailwind v4 + shadcn/ui (`popover`, `badge`, `toggle-group`), Iconify (`mdi:*`), sonner, Bun.

---

## Convenção de validação (LEIA ANTES DE COMEÇAR)

**Este projeto NÃO tem test runner.** NÃO instale Vitest/Jest (fere o guard de supply-chain do `bunfig.toml`). Validação de cada task:

1. **Lógica pura** (utils/api filters): **script de asserção descartável** em `scripts/_check_<topic>.ts`, rode com `bun run scripts/_check_<topic>.ts` (deve imprimir `ALL PASS`, sair 0), e **apague o script** antes do commit.
2. **TYPE-CHECK — atenção, ponto crítico deste repo:** `bun run build` (vite) **NÃO faz type-check** — só faz type-stripping via esbuild. E o repo tem **muitos erros de tsc pré-existentes** em outras áreas, então `bunx tsc --noEmit` global é ruidoso. **O gate de tipos é `tsc --noEmit` FILTRADO pelos arquivos tocados**, que deve sair **vazio**:
   ```
   bunx tsc --noEmit 2>&1 | grep -iE "features/quotes|features/customers|shared/types/service-kit|providers/data|mocks/(api|data)/(serviceKits|seedServiceKits)|shared/types/customer"
   ```
   (Ignore erros em arquivos fora do escopo da fase — são pré-existentes.)
3. **Lint POR-ARQUIVO** (o `bun run lint` global é inutilizável: ≈64k falsos-positivos `prettier/prettier Delete ␍` por `core.autocrlf=true`): `bunx prettier --check <arquivos>` + `bunx eslint <arquivos>`. Respeite `no-restricted-imports`: providers via `@/providers/data/hooks/use*Provider`; **NÃO** importe `@/providers/data/impl/*` de features. Features consomem mocks via providers, não direto de `@/mocks`.
4. **Build bundling:** rode `bun run build` ao final (Task 13) só para garantir que o bundle compila (não conta como type-check).
5. **UI:** verificação **manual** pelo usuário. **NÃO abra browser/preview automaticamente.**

## Convenções de código

- `camelCase` funções/vars, `PascalCase` componentes/tipos. Componentes `PascalCase.tsx`; utils/hooks/api/seed `camelCase.ts`.
- Comentários em inglês; UI em português do Brasil com **acentos corretos** (UTF-8).
- Tipos de domínio com prefixo `I`.
- Só tokens semânticos Tailwind (`bg-background`, `text-foreground`, `border-border`, `bg-primary`, `text-muted-foreground`, `bg-muted`, `bg-card`, `text-destructive`). Tons de status fora do espectro seguem o padrão de `customerDisplay.ts` (`*-500/15` + `dark:`).
- Prettier: `printWidth 100, semi true, singleQuote false, trailingComma all`.

## Tipos e assinaturas existentes (NÃO redefinir — importar)

```ts
// @/shared/types
type ID = string;
type Money = number;
type ISO8601 = string;
type PartCategory = /* enum em ./part-identification */ string; // import type { PartCategory } from "...";
interface IQuoteItem {
  id: ID;
  partId: ID;
  partSku: string;
  partName: string;
  quantity: number;
  unitPrice: Money;
  discount: Money;
  total: Money;
}
interface IPart {
  id: ID;
  sku: string;
  name: string;
  unitPrice: Money;
  storeId?: ID; /* …Fase 2 fields */
}
// ICustomer union (B2B|B2C) — base tem: status, abcClass?, lastPurchaseAt?, address?, portal?: IPortalSettings, portalContract?: IPortalContract
interface IPortalSettings {
  creditLimit?: Money; /* … */
}
interface IPortalContract {
  discountPct?: number;
  categoryDiscounts?: Partial<Record<PartCategory, number>>;
  paymentTermsExtended?: string;
  creditLimit?: Money;
}

// @/features/quotes/utils/quoteItemOps
function buildItemFromPart(part: IPart, quantity?: number): IQuoteItem;
function addOrIncrementItem(
  items: IQuoteItem[],
  part: IPart,
  quantity?: number,
): { items: IQuoteItem[]; affectedId: ID };

// @/features/quotes/hooks/usePartsIndex (Fase 2)
function usePartsIndex(enabled?: boolean): {
  partsById: Map<ID, IPart>;
  allParts: IPart[];
  isLoading: boolean;
};

// @/features/quotes/types/editor
type QuoteLayout = "twoCol" | "full" | "footerBar";
type QuoteAddMode = "continuous" | "catalog" | "quick";
interface IQuoteEditorPrefs {
  layout: QuoteLayout;
  addMode: QuoteAddMode;
}
```

## Estrutura de arquivos (Fase 3)

**Grupo A — Kits**

- Create `src/shared/types/service-kit.ts` — `IServiceKit`.
- Modify `src/shared/types/index.ts` — re-export.
- Create `src/mocks/data/seedServiceKits.ts` — seed estático.
- Create `src/mocks/api/serviceKits.ts` — `serviceKitsApi.list`.
- Modify `src/mocks/api/index.ts` — export `serviceKitsApi`.
- Create `src/providers/data/contracts/serviceKits.ts` — `IServiceKitsProvider`.
- Modify `src/providers/data/contracts/index.ts` — import + re-export + add to `IDataProviders`.
- Create `src/providers/data/impl/mock/serviceKits.ts` — `mockServiceKitsProvider`.
- Create `src/providers/data/impl/supabase/serviceKits.ts` — `supabaseServiceKitsProvider` (stub).
- Modify `src/providers/data/factory.ts` — import + register (mock & supabase).
- Create `src/providers/data/hooks/useServiceKitsProvider.ts` — hook.
- Create `src/features/quotes/utils/kitExpansion.ts` — `expandKitToItems`.
- Create `src/features/quotes/components/new/items/KitPicker.tsx` — botão "＋ Kit de revisão".
- Modify `src/features/quotes/components/new/QuoteEditor.tsx` — `handleAddKit` + render `KitPicker`.

**Grupo B — Enriquecimento financeiro**

- Modify `src/shared/types/customer.ts` — `overdueTitlesCount?` em `ICustomerBase`.
- Modify `src/mocks/generators/customer.ts` — popular `overdueTitlesCount`.
- Create `src/features/quotes/utils/customerFinance.ts` — `customerFinanceSummary`.
- Modify `src/features/quotes/components/new/customer/CustomerChip.tsx` — bloco financeiro.

**Grupo C — Aceleradores**

- Modify `src/features/quotes/types/editor.ts` — `QuoteDensity` + `density` em prefs + options.
- Modify `src/features/quotes/hooks/useQuoteEditorPrefs.ts` — `setDensity` + sanitização.
- Modify `src/features/quotes/components/new/layout/QuoteActionBar.tsx` — toggle de densidade.
- Modify `src/features/quotes/components/new/items/QuoteItemsTable.tsx` — `density` nas linhas.
- Modify `src/features/quotes/components/new/items/ContinuousAdder.tsx` — atalhos de teclado.
- Create `src/features/quotes/hooks/useQuoteDraft.ts` — auto-save localStorage.
- Modify `src/features/quotes/components/new/QuoteEditor.tsx` — fiação de densidade + draft.

---

## Task 1: Tipo `IServiceKit`

**Files:**

- Create: `src/shared/types/service-kit.ts`
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Crie `src/shared/types/service-kit.ts`**

```ts
import type { ID } from "./common";
import type { PartCategory } from "./part-identification";

/** One line of a service kit — a part and how many of it the kit includes. */
export interface IServiceKitItem {
  partId: ID;
  quantity: number;
}

/**
 * Service kit (kit de revisão) — a named bundle of parts a seller can insert
 * into a quote in one action (e.g. "Revisão 40.000 km — Volvo FH").
 * Read-only in the MVP; full CRUD is deferred (tracked as a git issue).
 */
export interface IServiceKit {
  id: ID;
  storeId: ID;
  name: string;
  description?: string;
  /** When set, the kit targets a specific vehicle brand/model. */
  vehicleApplication?: { brand: string; model: string };
  /** Optional taxonomy tag for filtering/grouping. */
  category?: PartCategory;
  items: IServiceKitItem[];
}
```

- [ ] **Step 2: Re-exporte em `src/shared/types/index.ts`**

Primeiro READ `src/shared/types/index.ts` para ver o padrão de re-export (ex.: `export type { ... } from "./customer";`). Acrescente uma linha consistente com o padrão existente:

```ts
export type { IServiceKit, IServiceKitItem } from "./service-kit";
```

- [ ] **Step 3: Validar**

```
bunx prettier --check src/shared/types/service-kit.ts
bunx eslint src/shared/types/service-kit.ts
bunx tsc --noEmit 2>&1 | grep -iE "shared/types/service-kit|shared/types/index"
```

Expected: prettier/eslint limpos; grep do tsc **vazio**.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/service-kit.ts src/shared/types/index.ts
git commit -m "feat(types): add IServiceKit model for revision kits"
```

---

## Task 2: Seed + mock API de kits

**Files:**

- Create: `src/mocks/data/seedServiceKits.ts`
- Create: `src/mocks/api/serviceKits.ts`
- Modify: `src/mocks/api/index.ts`
- Test (descartável): `scripts/_check_service_kits_api.ts`

> Os `partId` do seed referenciam peças reais do catálogo mock. Como o catálogo é gerado/semeado, use `partId`s que **podem não existir** — a expansão (Task 7) ignora peças não resolvidas graciosamente. Para o seed, use ids plausíveis no formato do projeto. READ um item de `src/mocks/data/partsCatalog.ts` (ou rode um check) para descobrir o formato real de `part.id` e use 2–3 ids reais por kit quando possível; se não encontrar, use o formato `"part-001"` etc. (a degradação cobre o resto). Reporte quais ids usou.

- [ ] **Step 1: Descubra ids de peças reais**

Rode: `bun -e "import('./src/mocks/generators/bootstrap.ts').then(m=>{})" 2>/dev/null` — se complexo, em vez disso READ `src/mocks/data/partsCatalog.ts` e pegue 4–6 `id`/`sku` reais de filtros/peças. Anote-os para o seed.

- [ ] **Step 2: Crie `src/mocks/data/seedServiceKits.ts`**

Use `SEED_STORE_ID` de `../data` (confirme o export lendo `src/mocks/data/index.ts`). Substitua os `partId` pelos ids reais descobertos no Step 1 (mantendo a forma):

```ts
import type { IServiceKit } from "@/shared/types";
import { SEED_STORE_ID } from ".";

/**
 * Static, read-only revision kits for the MVP demo. partIds reference catalog
 * parts; unresolved ids are ignored gracefully at insert time (see
 * src/features/quotes/utils/kitExpansion.ts).
 */
export const SEED_SERVICE_KITS: IServiceKit[] = [
  {
    id: "kit-revisao-volvo-fh-40k",
    storeId: SEED_STORE_ID,
    name: "Revisão 40.000 km — Volvo FH",
    description: "Filtros e óleo para revisão programada.",
    vehicleApplication: { brand: "Volvo", model: "FH" },
    category: "filtro",
    items: [
      { partId: "REPLACE_WITH_REAL_ID_1", quantity: 1 },
      { partId: "REPLACE_WITH_REAL_ID_2", quantity: 1 },
      { partId: "REPLACE_WITH_REAL_ID_3", quantity: 2 },
    ],
  },
  {
    id: "kit-revisao-scania-r-filtros",
    storeId: SEED_STORE_ID,
    name: "Kit de filtros — Scania R",
    description: "Conjunto de filtros para troca preventiva.",
    vehicleApplication: { brand: "Scania", model: "R" },
    category: "filtro",
    items: [
      { partId: "REPLACE_WITH_REAL_ID_4", quantity: 1 },
      { partId: "REPLACE_WITH_REAL_ID_5", quantity: 1 },
    ],
  },
  {
    id: "kit-consumiveis-gerais",
    storeId: SEED_STORE_ID,
    name: "Consumíveis gerais",
    description: "Itens de giro rápido para qualquer frota.",
    items: [
      { partId: "REPLACE_WITH_REAL_ID_6", quantity: 4 },
      { partId: "REPLACE_WITH_REAL_ID_1", quantity: 2 },
    ],
  },
];
```

- [ ] **Step 3: Crie `src/mocks/api/serviceKits.ts`**

READ `src/mocks/api/utils.ts` para confirmar o helper `runApi` (usado por todas as apis). Mantenha read-only, retornando array (sem paginação — conjunto pequeno):

```ts
import type { ID, IServiceKit } from "@/shared/types";
import { SEED_SERVICE_KITS } from "../data/seedServiceKits";
import { runApi } from "./utils";

export interface IListServiceKitsParams {
  storeId?: ID;
}

export const serviceKitsApi = {
  list(params: IListServiceKitsParams = {}): Promise<IServiceKit[]> {
    return runApi(
      "serviceKitsApi",
      "list",
      () => {
        let all = SEED_SERVICE_KITS;
        if (params.storeId) all = all.filter((k) => k.storeId === params.storeId);
        return all;
      },
      { payload: params },
    );
  },
};
```

> Se `runApi` exigir uma assinatura diferente (confira no utils real), adapte para a forma usada por `recommendationsApi`/`segmentsApi`. O importante: `list` é assíncrono e respeita `storeId`.

- [ ] **Step 4: Exporte em `src/mocks/api/index.ts`**

Acrescente, na vizinhança dos outros exports:

```ts
export { serviceKitsApi, type IListServiceKitsParams } from "./serviceKits";
```

- [ ] **Step 5: Script de asserção**

Crie `scripts/_check_service_kits_api.ts`:

```ts
import { serviceKitsApi } from "@/mocks/api/serviceKits";
import { SEED_SERVICE_KITS } from "@/mocks/data/seedServiceKits";

let pass = true;
function assert(c: boolean, m: string) {
  if (!c) {
    pass = false;
    console.error("FAIL:", m);
  }
}

const all = await serviceKitsApi.list();
assert(
  Array.isArray(all) && all.length === SEED_SERVICE_KITS.length,
  "returns all kits when no filter",
);
assert(
  all.every((k) => k.items.length > 0),
  "every kit has at least one item",
);

const storeId = SEED_SERVICE_KITS[0].storeId;
const scoped = await serviceKitsApi.list({ storeId });
assert(
  scoped.every((k) => k.storeId === storeId),
  "filters by storeId",
);

const none = await serviceKitsApi.list({ storeId: "store-inexistente" });
assert(none.length === 0, "unknown store → empty");

console.log(pass ? "ALL PASS" : "SOME FAILED");
process.exit(pass ? 0 : 1);
```

Run: `bun run scripts/_check_service_kits_api.ts` → `ALL PASS`.

- [ ] **Step 6: Apague o script e valide**

```
rm scripts/_check_service_kits_api.ts
bunx prettier --check src/mocks/data/seedServiceKits.ts src/mocks/api/serviceKits.ts src/mocks/api/index.ts
bunx eslint src/mocks/data/seedServiceKits.ts src/mocks/api/serviceKits.ts src/mocks/api/index.ts
bunx tsc --noEmit 2>&1 | grep -iE "mocks/(api|data)/(serviceKits|seedServiceKits)|mocks/api/index"
```

Expected: limpos; grep tsc **vazio**.

- [ ] **Step 7: Commit**

```bash
git add src/mocks/data/seedServiceKits.ts src/mocks/api/serviceKits.ts src/mocks/api/index.ts
git commit -m "feat(mocks): seed revision kits and serviceKitsApi.list"
```

---

## Task 3: Provider de kits (contract → impl → factory → hook)

**Files:**

- Create: `src/providers/data/contracts/serviceKits.ts`
- Modify: `src/providers/data/contracts/index.ts`
- Create: `src/providers/data/impl/mock/serviceKits.ts`
- Create: `src/providers/data/impl/supabase/serviceKits.ts`
- Modify: `src/providers/data/factory.ts`
- Create: `src/providers/data/hooks/useServiceKitsProvider.ts`

- [ ] **Step 1: Contract — `src/providers/data/contracts/serviceKits.ts`**

```ts
import type { ID, IServiceKit } from "@/shared/types";

export interface IListServiceKitsParams {
  storeId?: ID;
}

/**
 * Contract for revision kits (read-only in the MVP).
 *
 * @see ../../../mocks/api/serviceKits.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IServiceKitsProvider {
  list(params?: IListServiceKitsParams): Promise<IServiceKit[]>;
}
```

- [ ] **Step 2: Registre no contracts/index.ts**

Em `src/providers/data/contracts/index.ts`:
(a) adicione o import de tipo junto aos outros: `import type { IServiceKitsProvider } from "./serviceKits";`
(b) adicione o re-export: `export type { IServiceKitsProvider, IListServiceKitsParams } from "./serviceKits";`
(c) adicione a chave em `IDataProviders`: `serviceKits: IServiceKitsProvider;`

- [ ] **Step 3: Mock impl — `src/providers/data/impl/mock/serviceKits.ts`**

```ts
import { serviceKitsApi } from "@/mocks";
import type { IServiceKitsProvider } from "../../contracts/serviceKits";

export const mockServiceKitsProvider: IServiceKitsProvider = {
  list: (params) => serviceKitsApi.list(params),
};
```

> Confirme que `serviceKitsApi` é re-exportado por `@/mocks` (Task 2 Step 4 adicionou ao `src/mocks/api/index.ts`; verifique que `src/mocks/index.ts` reexporta o barrel de api — leia-o; se ele reexporta `./api`, está coberto).

- [ ] **Step 4: Supabase stub — `src/providers/data/impl/supabase/serviceKits.ts`**

```ts
import { NotImplementedError } from "../../errors";
import type { IServiceKitsProvider } from "../../contracts/serviceKits";

const stub = (method: string) => () => {
  throw new NotImplementedError(
    `SupabaseServiceKitsProvider.${method} — implementar quando kits forem persistidos no Supabase (CRUD deferido).`,
  );
};

export const supabaseServiceKitsProvider: IServiceKitsProvider = {
  list: stub("list"),
};
```

- [ ] **Step 5: Factory wiring — `src/providers/data/factory.ts`**

(a) Importe junto aos mock providers: `import { mockServiceKitsProvider } from "./impl/mock/serviceKits";`
(b) Importe junto aos supabase providers: `import { supabaseServiceKitsProvider } from "./impl/supabase/serviceKits";`
(c) Em `mockProviders`: adicione `serviceKits: mockServiceKitsProvider,`
(d) Em `supabaseProviders`: adicione `serviceKits: supabaseServiceKitsProvider,`

- [ ] **Step 6: Hook — `src/providers/data/hooks/useServiceKitsProvider.ts`**

```ts
import type { IServiceKitsProvider } from "../contracts/serviceKits";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useServiceKitsProvider(): IServiceKitsProvider {
  return useDataProviderSlice("serviceKits", "useServiceKitsProvider");
}
```

- [ ] **Step 7: Validar**

```
bunx prettier --check src/providers/data/contracts/serviceKits.ts src/providers/data/contracts/index.ts src/providers/data/impl/mock/serviceKits.ts src/providers/data/impl/supabase/serviceKits.ts src/providers/data/factory.ts src/providers/data/hooks/useServiceKitsProvider.ts
bunx eslint src/providers/data/contracts/serviceKits.ts src/providers/data/contracts/index.ts src/providers/data/impl/mock/serviceKits.ts src/providers/data/impl/supabase/serviceKits.ts src/providers/data/factory.ts src/providers/data/hooks/useServiceKitsProvider.ts
bunx tsc --noEmit 2>&1 | grep -iE "providers/data"
```

Expected: limpos; grep tsc **vazio** (a chave `serviceKits` no `IDataProviders` agora está satisfeita em ambos os bundles — se faltar em um, o tsc acusa aqui).

- [ ] **Step 8: Commit**

```bash
git add src/providers/data/contracts/serviceKits.ts src/providers/data/contracts/index.ts src/providers/data/impl/mock/serviceKits.ts src/providers/data/impl/supabase/serviceKits.ts src/providers/data/factory.ts src/providers/data/hooks/useServiceKitsProvider.ts
git commit -m "feat(providers): add read-only serviceKits provider"
```

---

## Task 4: Expansão de kit em itens (`expandKitToItems`)

**Files:**

- Create: `src/features/quotes/utils/kitExpansion.ts`
- Test (descartável): `scripts/_check_kit_expansion.ts`

- [ ] **Step 1: Crie `src/features/quotes/utils/kitExpansion.ts`**

```ts
import type { ID, IPart, IServiceKit } from "@/shared/types";

export interface IKitExpansion {
  /** Resolved (part, quantity) pairs ready to add to the quote. */
  resolved: Array<{ part: IPart; quantity: number }>;
  /** How many kit lines referenced a part not present in the catalog. */
  missing: number;
}

/**
 * Resolve a kit's partIds against the catalog index. Lines whose part is not
 * found (e.g. removed from the catalog) are skipped and counted in `missing`,
 * so insertion degrades gracefully instead of failing.
 */
export function expandKitToItems(kit: IServiceKit, partsById: Map<ID, IPart>): IKitExpansion {
  const resolved: Array<{ part: IPart; quantity: number }> = [];
  let missing = 0;
  for (const line of kit.items) {
    const part = partsById.get(line.partId);
    if (!part) {
      missing += 1;
      continue;
    }
    resolved.push({ part, quantity: Math.max(1, Math.floor(line.quantity) || 1) });
  }
  return { resolved, missing };
}
```

- [ ] **Step 2: Script de asserção**

Crie `scripts/_check_kit_expansion.ts`:

```ts
import type { IPart, IServiceKit } from "@/shared/types";
import { expandKitToItems } from "@/features/quotes/utils/kitExpansion";

let pass = true;
function assert(c: boolean, m: string) {
  if (!c) {
    pass = false;
    console.error("FAIL:", m);
  }
}

function part(id: string): IPart {
  return {
    id,
    sku: id.toUpperCase(),
    name: `Peça ${id}`,
    oemCodes: [],
    equivalentPartIds: [],
    applications: [],
    brand: "X",
    supplier: "S",
    unitCost: 10,
    unitPrice: 20,
    marginPercent: 0.5,
    stockAvailable: 5,
    stockMinimum: 1,
    division: "parts",
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}
const partsById = new Map<string, IPart>([
  ["p1", part("p1")],
  ["p2", part("p2")],
]);
const kit: IServiceKit = {
  id: "k1",
  storeId: "s1",
  name: "Kit",
  items: [
    { partId: "p1", quantity: 2 },
    { partId: "p2", quantity: 1 },
    { partId: "ghost", quantity: 3 },
  ],
};

const r = expandKitToItems(kit, partsById);
assert(r.resolved.length === 2, "resolves only known parts");
assert(r.missing === 1, "counts 1 missing (ghost)");
assert(r.resolved[0].quantity === 2 && r.resolved[1].quantity === 1, "keeps quantities");

const r2 = expandKitToItems({ ...kit, items: [{ partId: "p1", quantity: 0 }] }, partsById);
assert(r2.resolved[0].quantity === 1, "clamps quantity to >= 1");

console.log(pass ? "ALL PASS" : "SOME FAILED");
process.exit(pass ? 0 : 1);
```

Run: `bun run scripts/_check_kit_expansion.ts` → `ALL PASS`.

- [ ] **Step 3: Apague e valide**

```
rm scripts/_check_kit_expansion.ts
bunx prettier --check src/features/quotes/utils/kitExpansion.ts
bunx eslint src/features/quotes/utils/kitExpansion.ts
bunx tsc --noEmit 2>&1 | grep -iE "features/quotes/utils/kitExpansion"
```

Expected: limpos; grep vazio.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/utils/kitExpansion.ts
git commit -m "feat(quotes): add expandKitToItems with graceful missing-part handling"
```

---

## Task 5: `KitPicker` + fiação no editor

**Files:**

- Create: `src/features/quotes/components/new/items/KitPicker.tsx`
- Modify: `src/features/quotes/components/new/QuoteEditor.tsx`

- [ ] **Step 1: Crie `src/features/quotes/components/new/items/KitPicker.tsx`**

Usa shadcn `Popover` (existe em `@/components/ui/popover`).

```tsx
// src/features/quotes/components/new/items/KitPicker.tsx
import { useState } from "react";
import type { IServiceKit } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface IKitPickerProps {
  kits: IServiceKit[];
  onAddKit: (kit: IServiceKit) => void;
}

export function KitPicker({ kits, onAddKit }: IKitPickerProps) {
  const [open, setOpen] = useState(false);
  if (kits.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Icon icon="mdi:toolbox-outline" size={16} />
          Kit de revisão
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
          Inserir um kit adiciona todas as peças dele de uma vez
        </p>
        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {kits.map((kit) => (
            <li key={kit.id}>
              <button
                type="button"
                onClick={() => {
                  onAddKit(kit);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {kit.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {kit.items.length} {kit.items.length === 1 ? "peça" : "peças"}
                    {kit.vehicleApplication
                      ? ` · ${kit.vehicleApplication.brand} ${kit.vehicleApplication.model}`
                      : ""}
                  </span>
                </span>
                <Icon icon="mdi:plus" size={16} className="shrink-0 text-primary" />
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Fiação no `QuoteEditor.tsx`**

READ o arquivo. Então:

(a) Imports — após os imports de hooks/utils de quotes, adicione:

```tsx
import { useServiceKitsProvider } from "@/providers/data/hooks/useServiceKitsProvider";
import { expandKitToItems } from "../../utils/kitExpansion";
import { KitPicker } from "./items/KitPicker";
```

E garanta que `IServiceKit` esteja no import de tipos `@/shared/types` (adicione se faltar).

(b) Dados — perto de `const { partsById, allParts } = usePartsIndex();`, adicione a query de kits:

```tsx
const serviceKitsProvider = useServiceKitsProvider();
const kitsQuery = useQuery({
  queryKey: ["service-kits", storeId] as const,
  queryFn: () => serviceKitsProvider.list({ storeId }),
  staleTime: 60_000,
});
const kits = kitsQuery.data ?? [];
```

(`useQuery` já está importado; `storeId` já existe na função.)

(c) Handler — após `handleSwapEquivalent`, adicione:

```tsx
const handleAddKit = (kit: IServiceKit) => {
  const { resolved, missing } = expandKitToItems(kit, partsById);
  if (resolved.length === 0) {
    toast.error(`Nenhuma peça do kit "${kit.name}" está disponível no catálogo.`);
    return;
  }
  let next = items;
  let lastId: ID | null = null;
  for (const { part, quantity } of resolved) {
    const result = addOrIncrementItem(next, part, quantity);
    next = result.items;
    lastId = result.affectedId;
  }
  setItems(next);
  setHighlightId(lastId);
  toast.success(
    missing > 0
      ? `Kit "${kit.name}" inserido (${resolved.length} peças; ${missing} indisponível${missing > 1 ? "is" : ""}).`
      : `Kit "${kit.name}" inserido (${resolved.length} peças).`,
  );
};
```

(`toast` já é importado de sonner; `addOrIncrementItem` já está importado.)

(d) Render — na seção "Itens", coloque o `KitPicker` ao lado do `ItemAdder`. Encontre o bloco que renderiza `<ItemAdder ... />` dentro do Card de Itens e adicione, logo acima dele, uma barra de ações:

```tsx
<div className="mb-2 flex items-center justify-end">
  <KitPicker kits={kits} onAddKit={handleAddKit} />
</div>
```

(Inserir imediatamente antes de `<ItemAdder ... />`.)

- [ ] **Step 3: Validar**

```
bunx prettier --check src/features/quotes/components/new/items/KitPicker.tsx src/features/quotes/components/new/QuoteEditor.tsx
bunx eslint src/features/quotes/components/new/items/KitPicker.tsx src/features/quotes/components/new/QuoteEditor.tsx
bunx tsc --noEmit 2>&1 | grep -iE "features/quotes/components/new/(items/KitPicker|QuoteEditor)"
```

Expected: limpos; grep vazio.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/components/new/items/KitPicker.tsx src/features/quotes/components/new/QuoteEditor.tsx
git commit -m "feat(quotes): insert a whole revision kit at once via KitPicker"
```

---

## Task 6: Campo de mock `overdueTitlesCount`

**Files:**

- Modify: `src/shared/types/customer.ts`
- Modify: `src/mocks/generators/customer.ts`

- [ ] **Step 1: Adicione o campo opcional em `ICustomerBase`**

Em `src/shared/types/customer.ts`, dentro de `interface ICustomerBase`, logo após `abcShare?: number;` (ou junto dos campos opcionais de BI), adicione:

```ts
  /**
   * Demo-only count of overdue receivable titles (contas a receber vencidas).
   * No real billing module exists yet (Fase 2 do produto). Absent on most
   * customers; surfaced read-only on the quote editor when present.
   */
  overdueTitlesCount?: number;
```

- [ ] **Step 2: Popule no gerador**

READ `src/mocks/generators/customer.ts`. Os geradores B2B (≈linha 84) e B2C (≈linha 118) retornam o objeto do cliente. Use o contexto seedado determinístico (`ctx`) já presente no gerador — procure como ele gera números aleatórios determinísticos (ex.: `pickWeighted`, `randomDate`, ou um `ctx.rng`/`ctx.next`). Adicione ao objeto retornado de **ambos** os geradores um campo `overdueTitlesCount` que é definido apenas para uma fração dos clientes (≈25%) e, quando definido, vale 1–4.

Implemente um helper determinístico no topo do arquivo (após os imports), usando o mesmo `ctx` dos outros helpers do arquivo (verifique a assinatura real de `ISeededContext` em `./utils` e use o mesmo mecanismo que `pickWeighted`/`randomDate` usam internamente; se `ctx` expõe um gerador `ctx.rng()` que retorna 0..1, use-o):

```ts
/** Demo-only: ~25% of customers carry 1–4 overdue titles. */
function pickOverdueTitlesCount(ctx: ISeededContext): number | undefined {
  const r = ctx.rng();
  if (r > 0.25) return undefined;
  return 1 + Math.floor(ctx.rng() * 4); // 1..4
}
```

> Se `ISeededContext` NÃO expõe `rng()` mas sim outro método (ex.: `ctx.float()`, `ctx.int(min,max)`), adapte o helper para a API real — leia `src/mocks/generators/utils.ts` e use o mesmo método que os geradores vizinhos usam. NÃO use `Math.random()` (quebra o determinismo do seed).

No objeto retornado pelo gerador B2B e pelo B2C, adicione a linha:

```ts
    overdueTitlesCount: pickOverdueTitlesCount(ctx),
```

- [ ] **Step 3: Validar**

```
bunx prettier --check src/shared/types/customer.ts src/mocks/generators/customer.ts
bunx eslint src/shared/types/customer.ts src/mocks/generators/customer.ts
bunx tsc --noEmit 2>&1 | grep -iE "shared/types/customer|mocks/generators/customer"
```

Expected: limpos; grep vazio.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/customer.ts src/mocks/generators/customer.ts
git commit -m "feat(mocks): add demo overdueTitlesCount to customers"
```

---

## Task 7: Resumo financeiro do cliente (`customerFinance.ts`)

**Files:**

- Create: `src/features/quotes/utils/customerFinance.ts`
- Test (descartável): `scripts/_check_customer_finance.ts`

- [ ] **Step 1: Crie `src/features/quotes/utils/customerFinance.ts`**

```ts
import type { ICustomer } from "@/shared/types";

export interface ICustomerFinance {
  /** Negotiated credit limit (BRL), when provisioned. */
  creditLimit?: number;
  /** Count of overdue receivable titles (demo data), when present and > 0. */
  overdueTitlesCount?: number;
  /** Flat catalog discount from the B2B contract (fraction 0..1), when present. */
  contractDiscountPct?: number;
  /** Extended payment terms from the B2B contract, when present. */
  contractPaymentTerms?: string;
  /** True when at least one financial fact is available to show. */
  hasAny: boolean;
}

/**
 * Collapse a customer's already-existing financial facts into a display model.
 * Everything is optional — the chip hides each element when absent (graceful
 * degradation). No new sources are introduced beyond the customer record.
 */
export function customerFinanceSummary(customer: ICustomer): ICustomerFinance {
  const creditLimit = customer.portalContract?.creditLimit ?? customer.portal?.creditLimit;
  const overdue =
    typeof customer.overdueTitlesCount === "number" && customer.overdueTitlesCount > 0
      ? customer.overdueTitlesCount
      : undefined;
  const contractDiscountPct = customer.portalContract?.discountPct;
  const contractPaymentTerms = customer.portalContract?.paymentTermsExtended;
  const hasAny =
    creditLimit !== undefined ||
    overdue !== undefined ||
    contractDiscountPct !== undefined ||
    Boolean(contractPaymentTerms);
  return {
    creditLimit,
    overdueTitlesCount: overdue,
    contractDiscountPct,
    contractPaymentTerms,
    hasAny,
  };
}
```

- [ ] **Step 2: Script de asserção**

Crie `scripts/_check_customer_finance.ts`:

```ts
import type { ICustomer } from "@/shared/types";
import { customerFinanceSummary } from "@/features/quotes/utils/customerFinance";

let pass = true;
function assert(c: boolean, m: string) {
  if (!c) {
    pass = false;
    console.error("FAIL:", m);
  }
}

function base(over: Partial<ICustomer>): ICustomer {
  return {
    id: "c1",
    storeId: "s1",
    type: "B2B",
    cnpj: "1",
    razaoSocial: "R",
    nomeFantasia: "N",
    contactName: "C",
    phone: "1",
    sellerId: "v1",
    status: "ativo",
    tags: [],
    notes: [],
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  } as ICustomer;
}

assert(customerFinanceSummary(base({})).hasAny === false, "no data → hasAny false");
assert(
  customerFinanceSummary(base({ overdueTitlesCount: 0 })).overdueTitlesCount === undefined,
  "0 overdue → undefined",
);
assert(
  customerFinanceSummary(base({ overdueTitlesCount: 3 })).overdueTitlesCount === 3,
  "3 overdue surfaced",
);
const withContract = customerFinanceSummary(
  base({ portalContract: { discountPct: 0.1, creditLimit: 5000 } }),
);
assert(
  withContract.creditLimit === 5000 &&
    withContract.contractDiscountPct === 0.1 &&
    withContract.hasAny,
  "contract fields surfaced",
);
const portalCredit = customerFinanceSummary(
  base({
    portal: {
      customerId: "c1",
      enabled: true,
      canViewOrderHistory: false,
      canCreateQuote: false,
      canApproveQuote: false,
      canSeePriceTable: false,
      canDownloadNF: false,
      canSeeCreditLimit: true,
      creditLimit: 800,
    },
  }),
);
assert(portalCredit.creditLimit === 800, "falls back to portal.creditLimit");

console.log(pass ? "ALL PASS" : "SOME FAILED");
process.exit(pass ? 0 : 1);
```

Run: `bun run scripts/_check_customer_finance.ts` → `ALL PASS`. (Se o type do `portal` exigir mais campos, ajuste o fixture; não mude a implementação.)

- [ ] **Step 3: Apague e valide**

```
rm scripts/_check_customer_finance.ts
bunx prettier --check src/features/quotes/utils/customerFinance.ts
bunx eslint src/features/quotes/utils/customerFinance.ts
bunx tsc --noEmit 2>&1 | grep -iE "features/quotes/utils/customerFinance"
```

Expected: limpos; grep vazio.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/utils/customerFinance.ts
git commit -m "feat(quotes): add customerFinanceSummary for graceful financial display"
```

---

## Task 8: Bloco financeiro no `CustomerChip`

**Files:**

- Modify: `src/features/quotes/components/new/customer/CustomerChip.tsx`

- [ ] **Step 1: Adicione o resumo financeiro ao chip**

READ o arquivo (entregue na Fase 2). Adicione o import:

```tsx
import { customerFinanceSummary } from "../../../utils/customerFinance";
```

Logo após `const lastPurchase = formatLastPurchase(customer.lastPurchaseAt);`, adicione:

```tsx
const finance = customerFinanceSummary(customer);
```

E um formatador de moeda no topo do arquivo (junto ao `dateFormatter`):

```tsx
const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
```

Dentro do bloco de detalhes do cliente (na coluna `min-w-0 space-y-1.5`), **após** o parágrafo de "Última compra", insira o bloco financeiro (renderiza só quando há algo):

```tsx
{
  finance.hasAny && (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {finance.creditLimit !== undefined && (
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Icon icon="mdi:credit-card-outline" size={11} className="mr-1 inline" />
          Limite {moneyFormatter.format(finance.creditLimit)}
        </span>
      )}
      {finance.overdueTitlesCount !== undefined && (
        <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-700 dark:text-rose-300">
          <Icon icon="mdi:alert-circle-outline" size={11} className="mr-1 inline" />
          {finance.overdueTitlesCount} título{finance.overdueTitlesCount > 1 ? "s" : ""} vencido
          {finance.overdueTitlesCount > 1 ? "s" : ""}
        </span>
      )}
      {finance.contractDiscountPct !== undefined && (
        <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
          <Icon icon="mdi:file-document-outline" size={11} className="mr-1 inline" />
          Contrato −{(finance.contractDiscountPct * 100).toFixed(0)}%
        </span>
      )}
      {finance.contractPaymentTerms && (
        <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <Icon icon="mdi:calendar-clock-outline" size={11} className="mr-1 inline" />
          {finance.contractPaymentTerms}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Validar**

```
bunx prettier --check src/features/quotes/components/new/customer/CustomerChip.tsx
bunx eslint src/features/quotes/components/new/customer/CustomerChip.tsx
bunx tsc --noEmit 2>&1 | grep -iE "customer/CustomerChip"
```

Expected: limpos; grep vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/customer/CustomerChip.tsx
git commit -m "feat(quotes): show credit limit, overdue titles and contract on customer chip"
```

---

## Task 9: Densidade da tabela (prefs + toggle + linhas)

**Files:**

- Modify: `src/features/quotes/types/editor.ts`
- Modify: `src/features/quotes/hooks/useQuoteEditorPrefs.ts`
- Modify: `src/features/quotes/components/new/layout/QuoteActionBar.tsx`
- Modify: `src/features/quotes/components/new/items/QuoteItemsTable.tsx`
- Modify: `src/features/quotes/components/new/QuoteEditor.tsx`

- [ ] **Step 1: Tipos — `editor.ts`**

Adicione o tipo e estenda os prefs:

```ts
/** Table row density of the quote editor. */
export type QuoteDensity = "comfortable" | "compact";
```

Em `IQuoteEditorPrefs` adicione `density: QuoteDensity;`. Em `DEFAULT_QUOTE_EDITOR_PREFS` adicione `density: "comfortable",`. E adicione as opções:

```ts
export const QUOTE_DENSITY_OPTIONS: ReadonlyArray<{
  value: QuoteDensity;
  label: string;
  icon: string;
}> = [
  { value: "comfortable", label: "Conforto", icon: "mdi:format-line-spacing" },
  { value: "compact", label: "Compacto", icon: "mdi:view-headline" },
];
```

- [ ] **Step 2: Hook — `useQuoteEditorPrefs.ts`**

Importe `QuoteDensity` no import de tipos. Adicione a whitelist:

```ts
const DENSITIES: QuoteDensity[] = ["comfortable", "compact"];
```

No `readPrefs`, adicione a sanitização de `density` (espelhando `layout`/`addMode`):

```ts
      density: DENSITIES.includes(parsed.density as QuoteDensity)
        ? (parsed.density as QuoteDensity)
        : DEFAULT_QUOTE_EDITOR_PREFS.density,
```

Em `IUseQuoteEditorPrefs` adicione `setDensity: (density: QuoteDensity) => void;`. Adicione o setter:

```ts
const setDensity = useCallback(
  (density: QuoteDensity) => persist({ ...readPrefs(), density }),
  [persist],
);
```

E inclua `setDensity` no objeto retornado.

- [ ] **Step 3: Toggle na `QuoteActionBar`**

Adicione props `density: QuoteDensity` e `onDensityChange: (d: QuoteDensity) => void` à `IQuoteActionBarProps` (importe `QuoteDensity` e `QUOTE_DENSITY_OPTIONS` de `../../../types/editor`). Renderize um toggle compacto ao lado do `LayoutSwitcher` (botão que alterna entre os dois valores):

```tsx
<button
  type="button"
  onClick={() => onDensityChange(density === "comfortable" ? "compact" : "comfortable")}
  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground hover:text-foreground"
  aria-label="Alternar densidade da tabela"
  title={density === "comfortable" ? "Densidade: conforto" : "Densidade: compacto"}
>
  <Icon
    icon={density === "comfortable" ? "mdi:format-line-spacing" : "mdi:view-headline"}
    size={16}
  />
</button>
```

(Coloque imediatamente antes do `<LayoutSwitcher ... />`.)

- [ ] **Step 4: Linhas densas na `QuoteItemsTable`**

Adicione a prop `density: QuoteDensity` à `IQuoteItemsTableProps` (importe `QuoteDensity` de `../../../types/editor`). Derive uma classe de padding e aplique nas células da linha de item (a `<td>` principal e as de inputs). No topo do componente:

```tsx
const cellPadY = density === "compact" ? "py-1" : "py-2";
```

Troque os `className="px-3 py-2 ..."` das `<td>` da **linha de item** (não do header/footer) por `className={\`px-3 ${cellPadY} ...\`}`. Para os inputs, quando compacto use `h-7`no lugar de`h-8`:

```tsx
const inputH = density === "compact" ? "h-7" : "h-8";
```

e aplique `className={\`${inputH} text-right tabular-nums\`}`nos três`<Input>`.

- [ ] **Step 5: Fiação no `QuoteEditor`**

Passe `density={prefs.density}` ao `<QuoteItemsTable>`, e `density={prefs.density} onDensityChange={prefs.setDensity}` ao `<QuoteActionBar>`.

- [ ] **Step 6: Validar**

```
bunx prettier --check src/features/quotes/types/editor.ts src/features/quotes/hooks/useQuoteEditorPrefs.ts src/features/quotes/components/new/layout/QuoteActionBar.tsx src/features/quotes/components/new/items/QuoteItemsTable.tsx src/features/quotes/components/new/QuoteEditor.tsx
bunx eslint src/features/quotes/types/editor.ts src/features/quotes/hooks/useQuoteEditorPrefs.ts src/features/quotes/components/new/layout/QuoteActionBar.tsx src/features/quotes/components/new/items/QuoteItemsTable.tsx src/features/quotes/components/new/QuoteEditor.tsx
bunx tsc --noEmit 2>&1 | grep -iE "features/quotes/(types/editor|hooks/useQuoteEditorPrefs|components/new)"
```

Expected: limpos; grep vazio.

- [ ] **Step 7: Commit**

```bash
git add src/features/quotes/types/editor.ts src/features/quotes/hooks/useQuoteEditorPrefs.ts src/features/quotes/components/new/layout/QuoteActionBar.tsx src/features/quotes/components/new/items/QuoteItemsTable.tsx src/features/quotes/components/new/QuoteEditor.tsx
git commit -m "feat(quotes): table density preference (comfortable/compact)"
```

---

## Task 10: Atalhos de teclado no `ContinuousAdder`

**Files:**

- Modify: `src/features/quotes/components/new/items/ContinuousAdder.tsx`

Comportamento: `↑/↓` navegam os resultados; `Enter` adiciona o resultado ativo; `Esc` limpa a busca. Foco automático global: `/` (quando o foco não está num input/textarea) foca a busca. Mantém a semântica acessível (resultados como listbox simples — sem regressão visual).

- [ ] **Step 1: Reescreva o `ContinuousAdder.tsx`**

```tsx
// src/features/quotes/components/new/items/ContinuousAdder.tsx
import { useEffect, useRef, useState } from "react";
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

export function ContinuousAdder({
  vehicles,
  orders,
  inQuoteQtyByPart,
  onAddPart,
  onAddFreeItemClick,
}: IAdderProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, allParts, isLoading } = useItemSearch({ enabled: true, query });

  const hasQuery = query.trim().length > 0;

  // Reset the active row whenever the result set changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Global "/" focuses the search unless the user is already typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement)?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!hasQuery || results.length === 0) {
      if (e.key === "Escape") setQuery("");
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const part = results[activeIndex];
      if (part) onAddPart(part);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon
            icon="mdi:magnify"
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            type="search"
            className="pl-8"
            placeholder="Buscar peça, OEM ou SKU…  ( / para focar )"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            role="combobox"
            aria-expanded={hasQuery && results.length > 0}
            aria-controls="continuous-adder-results"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAddFreeItemClick}>
          <Icon icon="mdi:plus-box-outline" size={16} />
          Item avulso
        </Button>
      </div>

      {hasQuery ? (
        <div
          id="continuous-adder-results"
          role="listbox"
          className="max-h-80 overflow-y-auto rounded-md border border-border"
        >
          {results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">
              {isLoading ? "Carregando catálogo…" : "Nenhuma peça encontrada."}
            </p>
          ) : (
            results.map((p, i) => (
              <div
                key={p.id}
                role="option"
                aria-selected={i === activeIndex}
                className={i === activeIndex ? "bg-muted/60" : ""}
              >
                <ItemResultRow
                  part={p}
                  inQuoteQty={inQuoteQtyByPart.get(p.id) ?? 0}
                  onAdd={onAddPart}
                />
              </div>
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

- [ ] **Step 2: Validar**

```
bunx prettier --check src/features/quotes/components/new/items/ContinuousAdder.tsx
bunx eslint src/features/quotes/components/new/items/ContinuousAdder.tsx
bunx tsc --noEmit 2>&1 | grep -iE "items/ContinuousAdder"
```

Expected: limpos; grep vazio.

- [ ] **Step 3: Commit**

```bash
git add src/features/quotes/components/new/items/ContinuousAdder.tsx
git commit -m "feat(quotes): keyboard navigation in continuous item adder"
```

---

## Task 11: Auto-save de rascunho (`useQuoteDraft`)

**Files:**

- Create: `src/features/quotes/hooks/useQuoteDraft.ts`
- Test (descartável): `scripts/_check_quote_draft.ts`

O hook serializa um snapshot do rascunho em `localStorage` (debounced) e expõe `savedAt`, `loadDraft()` e `clearDraft()`. O editor (Task 12) decide quando restaurar.

- [ ] **Step 1: Crie `src/features/quotes/hooks/useQuoteDraft.ts`**

```ts
// src/features/quotes/hooks/useQuoteDraft.ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { IQuoteItem } from "@/shared/types";

const STORAGE_KEY = "gallo-quote-draft";
const DEBOUNCE_MS = 800;

/** Serializable snapshot of an in-progress quote (single draft slot). */
export interface IQuoteDraft {
  customerId?: string;
  items: IQuoteItem[];
  discountInput: string;
  shipping: number;
  paymentMethod: string;
  paymentTerms: string;
  notes: string;
  /** ISO timestamp of when the snapshot was written. */
  savedAt: string;
}

/** What the editor feeds in to be persisted (everything except savedAt). */
export type QuoteDraftInput = Omit<IQuoteDraft, "savedAt">;

function readDraft(): IQuoteDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IQuoteDraft;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface IUseQuoteDraft {
  /** ISO timestamp of the last persisted snapshot, or null. */
  savedAt: string | null;
  /** Read the persisted draft (e.g. to offer restore on mount). */
  loadDraft: () => IQuoteDraft | null;
  /** Remove the persisted draft (after save or explicit discard). */
  clearDraft: () => void;
}

/**
 * Debounced localStorage auto-save for the quote editor. Persists `input`
 * whenever it changes (after DEBOUNCE_MS) while `enabled` is true. Does NOT
 * restore on its own — the editor calls `loadDraft()` and decides.
 */
export function useQuoteDraft(input: QuoteDraftInput, enabled: boolean): IUseQuoteDraft {
  const [savedAt, setSavedAt] = useState<string | null>(() => readDraft()?.savedAt ?? null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const now = new Date().toISOString();
      const draft: IQuoteDraft = { ...input, savedAt: now };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
        setSavedAt(now);
      } catch {
        // localStorage indisponível — rascunho só em memória.
      }
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [input, enabled]);

  const loadDraft = useCallback(() => readDraft(), []);
  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSavedAt(null);
  }, []);

  return { savedAt, loadDraft, clearDraft };
}
```

- [ ] **Step 2: Script de asserção (lógica de (de)serialização)**

`useQuoteDraft` é um hook (não roda fora do React), então teste só a forma do `IQuoteDraft` round-trip via JSON num script mínimo, garantindo que o shape sobrevive:

```ts
import type { IQuoteDraft } from "@/features/quotes/hooks/useQuoteDraft";

let pass = true;
function assert(c: boolean, m: string) {
  if (!c) {
    pass = false;
    console.error("FAIL:", m);
  }
}

const draft: IQuoteDraft = {
  customerId: "c1",
  items: [
    {
      id: "i1",
      partId: "p1",
      partSku: "S",
      partName: "N",
      quantity: 2,
      unitPrice: 10,
      discount: 0,
      total: 20,
    },
  ],
  discountInput: "5",
  shipping: 0,
  paymentMethod: "pix",
  paymentTerms: "à vista",
  notes: "obs",
  savedAt: "2026-06-02T12:00:00.000Z",
};
const round = JSON.parse(JSON.stringify(draft)) as IQuoteDraft;
assert(round.items.length === 1 && round.items[0].total === 20, "items survive round-trip");
assert(round.savedAt === draft.savedAt, "savedAt preserved");
assert(round.discountInput === "5", "discountInput is a string");

console.log(pass ? "ALL PASS" : "SOME FAILED");
process.exit(pass ? 0 : 1);
```

Salve como `scripts/_check_quote_draft.ts`, rode `bun run scripts/_check_quote_draft.ts` → `ALL PASS`.

- [ ] **Step 3: Apague e valide**

```
rm scripts/_check_quote_draft.ts
bunx prettier --check src/features/quotes/hooks/useQuoteDraft.ts
bunx eslint src/features/quotes/hooks/useQuoteDraft.ts
bunx tsc --noEmit 2>&1 | grep -iE "hooks/useQuoteDraft"
```

Expected: limpos; grep vazio.

- [ ] **Step 4: Commit**

```bash
git add src/features/quotes/hooks/useQuoteDraft.ts
git commit -m "feat(quotes): add useQuoteDraft localStorage auto-save hook"
```

---

## Task 12: Fiação do auto-save no `QuoteEditor`

**Files:**

- Modify: `src/features/quotes/components/new/QuoteEditor.tsx`

Persiste o rascunho enquanto há cliente OU itens; oferece restaurar na montagem se houver rascunho; limpa após salvar com sucesso. Mostra "salvo às hh:mm" perto do resumo.

- [ ] **Step 1: Importe e instancie o hook**

Import:

```tsx
import { useQuoteDraft } from "../../hooks/useQuoteDraft";
```

Após os estados existentes (perto de `const [notes, setNotes] = useState("");`), monte o input do draft e o hook:

```tsx
const draftInput = useMemo(
  () => ({
    customerId: customer?.id,
    items,
    discountInput,
    shipping,
    paymentMethod,
    paymentTerms,
    notes,
  }),
  [customer?.id, items, discountInput, shipping, paymentMethod, paymentTerms, notes],
);
const draftEnabled = items.length > 0 || customer !== null;
const { savedAt, loadDraft, clearDraft } = useQuoteDraft(draftInput, draftEnabled);
const [draftOffer, setDraftOffer] = useState(() => loadDraft());
```

(`useMemo`/`useState` já importados.)

- [ ] **Step 2: Banner de restauração**

Logo abaixo da `<QuoteActionBar .../>` (dentro do `classes.root`, antes do `classes.grid`), renderize o banner quando houver oferta e o editor ainda estiver vazio:

```tsx
{
  draftOffer && items.length === 0 && (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <p className="text-xs text-foreground">
        <Icon icon="mdi:history" size={14} className="mr-1 inline" />
        Há um rascunho não salvo de {new Date(draftOffer.savedAt).toLocaleString("pt-BR")}.
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setItems(draftOffer.items);
            setDiscountInput(draftOffer.discountInput);
            setShipping(draftOffer.shipping);
            setPaymentMethod(draftOffer.paymentMethod as QuotePaymentMethod);
            setPaymentTerms(draftOffer.paymentTerms);
            setNotes(draftOffer.notes);
            setDraftOffer(null);
            toast.success("Rascunho restaurado.");
          }}
        >
          Restaurar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            clearDraft();
            setDraftOffer(null);
          }}
        >
          Descartar
        </Button>
      </div>
    </div>
  );
}
```

> Nota: o rascunho **não** restaura o cliente automaticamente (o objeto `ICustomer` não é serializado — só `customerId`). Restauramos itens e campos comerciais; o vendedor reseleciona o cliente se necessário. Mantém o escopo seguro e evita buscar o cliente por id aqui.

- [ ] **Step 3: Limpe o rascunho ao salvar**

Dentro de `handleSave`, no bloco de sucesso (logo após `toast.success(...)` e antes do `navigate`), adicione:

```tsx
clearDraft();
```

- [ ] **Step 4: Indicador "salvo às hh:mm"**

Na barra de ações ou perto do resumo, exiba o horário do último auto-save. Adicione na `QuoteActionBar`? Para manter o escopo, renderize um pequeno texto logo abaixo do banner/junto ao grid — insira antes do `<div className={classes.grid}>`:

```tsx
{
  savedAt && (
    <p className="mb-2 text-right text-[11px] text-muted-foreground">
      <Icon icon="mdi:content-save-check-outline" size={12} className="mr-1 inline" />
      Rascunho salvo às{" "}
      {new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
    </p>
  );
}
```

- [ ] **Step 5: Validar**

```
bunx prettier --check src/features/quotes/components/new/QuoteEditor.tsx
bunx eslint src/features/quotes/components/new/QuoteEditor.tsx
bunx tsc --noEmit 2>&1 | grep -iE "components/new/QuoteEditor"
```

Expected: limpos; grep vazio.

- [ ] **Step 6: Commit**

```bash
git add src/features/quotes/components/new/QuoteEditor.tsx
git commit -m "feat(quotes): wire draft auto-save with restore banner and saved indicator"
```

---

## Task 13: Validação integrada e não-regressão

**Files:** nenhum — validação.

- [ ] **Step 1: Type gate completo da Fase 3 (deve sair vazio)**

```
bunx tsc --noEmit 2>&1 | grep -iE "features/quotes|features/customers|shared/types/service-kit|shared/types/customer|providers/data|mocks/(api|data|generators)/(serviceKits|seedServiceKits|customer)|mocks/api/index|providers/data/contracts/index|providers/data/factory"
```

Expected: **vazio**.

- [ ] **Step 2: Lint de todos os arquivos da Fase 3**

Rode `bunx prettier --check` e `bunx eslint` na lista completa dos arquivos criados/modificados (Grupos A/B/C). Tudo limpo.

- [ ] **Step 3: Build de bundling**

```
bun run build
```

Expected: `✓ built` (só o aviso de chunk-size pré-existente).

- [ ] **Step 4: Checklist de não-regressão (leitura de código + teste manual do usuário)**

- `handleSave`/`handleCalcShipping` intactos; auto-save só **limpa** o rascunho no sucesso, não altera o payload salvo.
- Os 3 layouts × 3 modos × densidade combinam sem quebra.
- Incremento de duplicata, item avulso, sugestões por veículo, recompra, equivalentes/troca, margem gated (Fase 1/2) seguem funcionando.
- Kit com peças ausentes insere as disponíveis e avisa; kit 100% ausente mostra erro sem inserir.
- Cliente sem dados financeiros: bloco financeiro não aparece (degradação).
- Atalhos de teclado não capturam `/` enquanto se digita em inputs/textarea.

- [ ] **Step 5: Sem commit** (validação). Prossiga para `superpowers:finishing-a-development-branch`.

---

## Self-Review (preenchido)

**1. Cobertura do spec (Fase 3 — "Enriquecimento dependente de dados novos" + kits + aceleradores):**

- Limite de crédito (exibir quando presente) → Tasks 7/8. ✅
- Título vencido / contas a receber (campo de mock `overdueTitlesCount?`, ocultar ausente) → Tasks 6/7/8. ✅
- Tabela de preço do cliente (`portalContract` quando presente) → Tasks 7/8 (contrato −X% + termos). ✅
- `IServiceKit` + mock + config simples + botão "＋ Kit de revisão" insere todos os itens → Tasks 1–5. ✅
- Aceleradores: atalhos de teclado (`/`, `↑↓`, `Enter`, `Esc`) → Task 10; densidade → Task 9; auto-save de rascunho ("salvo às hh:mm") → Tasks 11/12. ✅
- Tela de gestão de kits (CRUD) → **fora de escopo** (deferido como issue no git, conforme spec). ✅

**2. Placeholders:** os trechos `REPLACE_WITH_REAL_ID_*` no seed (Task 2) são **intencionais** e o Step 1 instrui a substituí-los por ids reais do catálogo; não são placeholders de plano (há instrução explícita de descoberta). Demais passos trazem código completo.

**3. Consistência de tipos:** `IServiceKit`/`IServiceKitItem` (Task 1) usados em 2/3/4/5; `IServiceKitsProvider.list(params?)` (Task 3) consumido pelo hook (3) e pela query do editor (5); `expandKitToItems → {resolved, missing}` (4) consumido por `handleAddKit` (5); `customerFinanceSummary → ICustomerFinance` (7) consumido pelo chip (8); `QuoteDensity` + `density` em prefs (9) fluem para ActionBar/Table/Editor; `IQuoteDraft`/`QuoteDraftInput` (11) consumidos pela fiação (12). ✅

**Riscos sinalizados:** (a) `ISeededContext` pode expor RNG por método diferente de `rng()` — Task 6 instrui a confirmar e adaptar; (b) `runApi` pode ter assinatura distinta — Task 2 instrui a espelhar `recommendationsApi`; (c) ids de peças do seed precisam ser reais — Task 2 Step 1 cobre a descoberta. Nenhum altera as assinaturas públicas acima.
