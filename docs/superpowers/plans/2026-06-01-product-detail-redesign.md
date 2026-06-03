# Product (SKU) Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enriquecer o modelo `IPart` com os dados do ERP DINTEC (GTIN+SEFAZ, código do fornecedor, referência/grupo/tipo, tabelas de preço, fiscal, logística, multi-fornecedor + custo médio) e redesenhar a página de detalhe `/app/catalogo/$id` com 3 layouts selecionáveis (Balcão/Painel/Ficha).

**Architecture:** Espelha o padrão já estabelecido do redesign de veículo (`src/features/vehicles/...`) e de `src/shared/detail-views/`: `config/layout.ts` + hook de persistência em `localStorage` + switcher segmentado no header + cards "mode-agnostic" arranjados por 3 composers de layout. Modelo estendido de forma **aditiva/opcional** (nada que já consome `unitPrice`/`unitCost`/`supplier` quebra). Mocks determinísticos via `ISeededContext`. Sem formulário, sem backend.

**Tech Stack:** React 19, TanStack Router (file-based), TanStack Query, Tailwind CSS v4, shadcn/ui (new-york), Iconify, TypeScript strict. Build/typecheck via `bun run build` (Vite + `tsc --noEmit`). **Não há test runner** — funções puras são verificadas com um scratch `bun run` temporário; componentes via build + eslint; UI por validação manual do usuário.

**Spec:** `docs/superpowers/specs/2026-06-01-product-detail-redesign-design.md`

---

## Convenções deste plano

- **Acentos pt-BR corretos** em todo conteúdo de usuário; identificadores em inglês.
- **Tokens semânticos apenas** (`bg-card`, `text-foreground`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-destructive`); **nunca** hex cru ou `--gallo-*`.
- Após editar qualquer arquivo, rode `bunx prettier --write <arquivo>` antes do commit (guard CRLF). Os exemplos de commit já assumem isso.
- Cada commit usa Conventional Commits em inglês e termina com a linha de co-autoria:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
  (omitida nos blocos abaixo por brevidade — **inclua sempre**).
- Trabalhe **apenas** no diretório principal; ignore `.claude/worktrees/`.

---

## File Structure

**Novos arquivos:**

| Arquivo                                                                | Responsabilidade                                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/features/catalog/config/layout.ts`                                | Tipo `PartDetailLayout`, lista, default, storage key                                                   |
| `src/features/catalog/hooks/usePartDetailLayout.ts`                    | Estado do layout persistido em localStorage                                                            |
| `src/features/catalog/utils/pricing.ts`                                | Canais, `computePrice`, `buildPriceTables`, `weightedAverageCost`, `tableMargin`, `resolvePriceTables` |
| `src/features/catalog/components/detail/PartLayoutSwitcher.tsx`        | Segmented control de layout                                                                            |
| `src/features/catalog/components/detail/PartSefazBadge.tsx`            | Badge de status SEFAZ (3 estados)                                                                      |
| `src/features/catalog/components/detail/PartIdentityCard.tsx`          | Identidade + GTIN + código fornecedor + ref/grupo/tipo                                                 |
| `src/features/catalog/components/detail/PartStatStrip.tsx`             | 5 KPIs                                                                                                 |
| `src/features/catalog/components/detail/PartPriceHistory.tsx`          | Histórico de preço (extraído de CommercialSection)                                                     |
| `src/features/catalog/components/detail/PartPricingTable.tsx`          | Tabela comparativa das 5 tabelas de preço                                                              |
| `src/features/catalog/components/detail/PartFiscalCard.tsx`            | NCM/ICMS/ST/origem                                                                                     |
| `src/features/catalog/components/detail/PartLogisticsCard.tsx`         | Peso/local/caixa/fraciona/unidade + estoque                                                            |
| `src/features/catalog/components/detail/PartSuppliersTable.tsx`        | Fornecedores + C.M.                                                                                    |
| `src/features/catalog/components/detail/layouts/types.ts`              | `IPartLayoutProps`                                                                                     |
| `src/features/catalog/components/detail/layouts/PartLayoutCounter.tsx` | Layout A (Balcão)                                                                                      |
| `src/features/catalog/components/detail/layouts/PartLayoutPanel.tsx`   | Layout B (Painel/bento)                                                                                |
| `src/features/catalog/components/detail/layouts/PartLayoutSheet.tsx`   | Layout C (Ficha)                                                                                       |

**Modificados:**

| Arquivo                                                       | Mudança                                                          |
| ------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/shared/types/catalog.ts`                                 | Novos tipos + campos opcionais em `IPart`                        |
| `src/shared/types/index.ts`                                   | Exportar novos tipos                                             |
| `src/features/catalog/i18n/pt-BR.ts`                          | Novas strings em `detail`                                        |
| `src/mocks/generators/part.ts`                                | Popular novos campos (determinístico)                            |
| `src/features/catalog/components/detail/PartDetailHeader.tsx` | Rail 1600 + props de layout + switcher; identidade migra p/ card |
| `src/features/catalog/pages/PartDetailPage.tsx`               | Rail 1600, wiring de layout, composição nova                     |

`CommercialSection.tsx` deixa de ser usada na composição (substituída por `PartPricingTable` + cards), mas **não é deletada** nesta rodada (segurança; pode ser referenciada em outro lugar — confirmar no Task 12).

---

### Task 1: Estender o modelo de domínio `IPart`

**Files:**

- Modify: `src/shared/types/catalog.ts`
- Modify: `src/shared/types/index.ts`

- [ ] **Step 1: Adicionar os novos tipos e campos em `catalog.ts`**

No topo do arquivo, logo após o `import` existente, e antes de `export interface IApplication`, adicione os tipos auxiliares. Depois adicione os campos novos ao final da interface `IPart` (antes de `createdAt`).

Adicione **após** a interface `IApplication` (antes de `IPart`):

```ts
/** Validation state of a part's GTIN against the SEFAZ registry. */
export type SefazStatus = "validated" | "not_checked" | "invalid";

/**
 * Named price table — final price is derived from the part's base cost by a
 * markup. Mirrors the DINTEC "Cadastro de Valores do Produto".
 */
export interface IPriceTable {
  /** Stable channel id (`padrao` | `ecommerce` | `oficina` | `varejo` | `atacado`). */
  id: string;
  label: string;
  /** Markup as a decimal over cost (1.20 = +120%). */
  markupPercent: number;
  /** Final price = unitCost * (1 + markupPercent). */
  price: Money;
}

/** A supplier stock-entry for a part (DINTEC "Entrada no Estoque" row). */
export interface IPartSupplier {
  id: ID;
  name: string;
  /** Supplier's internal code for this part. */
  supplierCode?: string;
  /** Inbound invoice (nota fiscal) number. */
  invoiceNumber?: string;
  invoiceDate?: ISO8601;
  cost: Money;
  quantity: number;
}

/** Tax attributes surfaced on the detail page. */
export interface IPartFiscal {
  /** Mercosul tax classification code (e.g. "8421.23.00"). */
  ncm?: string;
  /** ICMS rate in percent (e.g. 17). */
  icmsPercent?: number;
  /** Whether tax substitution (ST) applies. */
  taxSubstitution?: boolean;
  /** Goods origin label (e.g. "Nacional"). */
  origin?: string;
}
```

Dentro de `interface IPart`, **logo após a linha `marginPercent: number;`**, adicione:

```ts
  // --- DINTEC enrichment (PRD product-detail redesign) — all optional/additive ---
  /** Global trade item number (EAN-13 barcode), distinct from the supplier code. */
  gtin?: string;
  /** SEFAZ validation state of the GTIN. */
  sefazStatus?: SefazStatus;
  /** When the GTIN was last validated against SEFAZ. */
  sefazCheckedAt?: ISO8601;
  /** Supplier's internal code — historically misused as the barcode in the ERP. */
  supplierCode?: string;
  /** Manufacturer reference number. */
  reference?: string;
  /** ERP product group (e.g. "1-FILTRO"). */
  group?: string;
  /** Free-text product type. */
  partType?: string;
  /** Named price tables (Padrão, Ecommerce, Oficina, Varejo, Atacado). */
  priceTables?: IPriceTable[];
  /** Tax attributes. */
  fiscal?: IPartFiscal;
  /** Net weight in kilograms. */
  weightKg?: number;
  /** Physical warehouse location (e.g. "A-12"). */
  storageLocation?: string;
  /** Units per box. */
  boxQuantity?: number;
  /** Whether the part can be sold fractionally. */
  fractionable?: boolean;
  /** Unit of measure (e.g. "UN", "PC", "L"). */
  unitOfMeasure?: string;
  /** Supplier stock-entry history. */
  suppliers?: IPartSupplier[];
  /** Weighted average cost (C.M.) across supplier entries. */
  averageCost?: Money;
```

- [ ] **Step 2: Exportar os novos tipos no barrel**

Em `src/shared/types/index.ts`, substitua a linha do catálogo:

```ts
// Catalog
export type { IPart, IApplication } from "./catalog";
```

por:

```ts
// Catalog
export type {
  IPart,
  IApplication,
  IPriceTable,
  IPartSupplier,
  IPartFiscal,
  SefazStatus,
} from "./catalog";
```

- [ ] **Step 3: Type-check**

Run: `bun run build`
Expected: PASS (compila; nenhum consumidor existente quebra, pois os campos são opcionais).

- [ ] **Step 4: Commit**

```bash
git add src/shared/types/catalog.ts src/shared/types/index.ts
git commit -m "feat(catalog): extend IPart model with DINTEC fields (gtin, price tables, fiscal, logistics, suppliers)"
```

---

### Task 2: Utilitários de precificação (funções puras)

**Files:**

- Create: `src/features/catalog/utils/pricing.ts`
- Temp check: `src/features/catalog/utils/pricing.check.ts` (criado e removido)

- [ ] **Step 1: Criar `pricing.ts`**

```ts
import type { IPart, IPartSupplier, IPriceTable } from "@/shared/types";

export interface IPriceChannel {
  id: string;
  label: string;
  /** Offset added to the base (Padrão) markup, as a decimal. */
  offset: number;
}

/**
 * Price channels mirroring the DINTEC "Cadastro de Valores". The Padrão table
 * anchors to the part's own margin; the others are relative offsets. When the
 * Padrão markup is 1.20 these reproduce the ERP's 140/120/100/80/60 ladder.
 */
export const PRICE_CHANNELS: IPriceChannel[] = [
  { id: "padrao", label: "Padrão", offset: 0 },
  { id: "ecommerce", label: "Ecommerce", offset: 0.2 },
  { id: "oficina", label: "Oficina", offset: -0.2 },
  { id: "varejo", label: "Varejo", offset: -0.4 },
  { id: "atacado", label: "Atacado", offset: -0.6 },
];

/** Floor so deep-discount channels never go below a 5% markup. */
const MIN_MARKUP = 0.05;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Final price for a base cost and a markup (decimal). */
export function computePrice(baseCost: number, markupPercent: number): number {
  return round2(baseCost * (1 + markupPercent));
}

/**
 * Build the 5 price tables from a base cost and the part's base (Padrão) markup.
 * `padrao.price === computePrice(baseCost, baseMarkup)`.
 */
export function buildPriceTables(baseCost: number, baseMarkup: number): IPriceTable[] {
  return PRICE_CHANNELS.map((channel) => {
    const markup = Math.max(MIN_MARKUP, baseMarkup + channel.offset);
    return {
      id: channel.id,
      label: channel.label,
      markupPercent: Number(markup.toFixed(4)),
      price: computePrice(baseCost, markup),
    };
  });
}

/** Weighted average cost (C.M.) across supplier entries; null when no quantity. */
export function weightedAverageCost(suppliers: IPartSupplier[]): number | null {
  const totalQty = suppliers.reduce((sum, s) => sum + s.quantity, 0);
  if (totalQty <= 0) return null;
  const weighted = suppliers.reduce((sum, s) => sum + s.cost * s.quantity, 0);
  return round2(weighted / totalQty);
}

/** Absolute margin (R$) of a price over the base cost. */
export function tableMargin(baseCost: number, price: number): number {
  return round2(price - baseCost);
}

/**
 * Resolve the price tables to display: prefer stored `priceTables`, otherwise
 * derive from cost + margin. Returns [] when there is no cost to price from.
 */
export function resolvePriceTables(
  part: Pick<IPart, "priceTables" | "unitCost" | "marginPercent">,
): IPriceTable[] {
  if (part.priceTables && part.priceTables.length > 0) return part.priceTables;
  if (part.unitCost > 0) return buildPriceTables(part.unitCost, part.marginPercent);
  return [];
}
```

- [ ] **Step 2: Escrever o scratch de verificação**

Crie `src/features/catalog/utils/pricing.check.ts`:

```ts
import { buildPriceTables, computePrice, weightedAverageCost } from "./pricing";

// Padrão price must equal cost*(1+margin) rounded.
const tables = buildPriceTables(86, 1.2);
const padrao = tables.find((t) => t.id === "padrao")!;
console.assert(padrao.price === computePrice(86, 1.2), "padrao price mismatch");
console.assert(padrao.price === 189.2, `expected 189.2, got ${padrao.price}`);

// Ecommerce = +0.20 over 1.20 = 1.40 → 206.40
const ecommerce = tables.find((t) => t.id === "ecommerce")!;
console.assert(ecommerce.price === 206.4, `expected 206.4, got ${ecommerce.price}`);

// Atacado = -0.60 over 1.20 = 0.60 → 137.60
const atacado = tables.find((t) => t.id === "atacado")!;
console.assert(atacado.price === 137.6, `expected 137.6, got ${atacado.price}`);

// MIN_MARKUP floor: base 0.30 + (-0.60) → clamped to 0.05 → 86*1.05 = 90.30
const floored = buildPriceTables(86, 0.3).find((t) => t.id === "atacado")!;
console.assert(floored.markupPercent === 0.05, `expected 0.05, got ${floored.markupPercent}`);

// Weighted average cost: (10*1 + 20*3)/(1+3) = 70/4 = 17.5
console.assert(
  weightedAverageCost([
    { id: "a", name: "A", cost: 10, quantity: 1 },
    { id: "b", name: "B", cost: 20, quantity: 3 },
  ]) === 17.5,
  "weighted avg mismatch",
);

console.log("pricing.check OK");
```

- [ ] **Step 3: Rodar o scratch**

Run: `bun run src/features/catalog/utils/pricing.check.ts`
Expected: imprime `pricing.check OK` sem nenhuma mensagem de `Assertion failed`.

- [ ] **Step 4: Remover o scratch**

```bash
rm src/features/catalog/utils/pricing.check.ts
```

- [ ] **Step 5: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/utils/pricing.ts
git commit -m "feat(catalog): add pricing utils for price tables and weighted average cost"
```

---

### Task 3: Popular os mocks com os novos campos

**Files:**

- Modify: `src/mocks/generators/part.ts`
- Temp check: `src/mocks/generators/part.check.ts` (criado e removido)

- [ ] **Step 1: Adicionar imports e mapas no topo de `part.ts`**

No bloco de imports, adicione a importação dos utils de pricing (depois do import de `partCategories`):

```ts
import { buildPriceTables, weightedAverageCost } from "@/features/catalog/utils/pricing";
```

Adicione, logo após o mapa `SUBCATEGORIES_BY_CATEGORY` (antes de `ORIGINAL_BRAND_HINTS`):

```ts
/** ERP product group label per catalog category. */
const GROUP_BY_CATEGORY: Record<string, string> = {
  filtros: "1-FILTRO",
  freios: "2-FREIOS",
  transmissao: "3-TRANSMISSÃO",
  suspensao: "4-SUSPENSÃO",
  eletrica: "5-ELÉTRICA",
  motor: "6-MOTOR",
  arrefecimento: "7-ARREFECIMENTO",
  lubrificantes: "8-LUBRIFICANTES",
};

/** Representative NCM per catalog category (heavy-truck parts). */
const NCM_BY_CATEGORY: Record<string, string> = {
  filtros: "8421.23.00",
  freios: "8708.30.90",
  transmissao: "8708.93.00",
  suspensao: "8708.80.00",
  eletrica: "8511.40.00",
  motor: "8409.99.90",
  arrefecimento: "8708.91.00",
  lubrificantes: "2710.19.32",
};

const UNITS_OF_MEASURE = ["UN", "PC", "CJ", "L"] as const;
const ICMS_RATES = [7, 12, 17, 18] as const;
const ORIGINS = ["Nacional", "Importado"] as const;
const BOX_QUANTITIES = [1, 6, 12, 24] as const;
```

- [ ] **Step 2: Adicionar os helpers determinísticos no fim de `part.ts`**

Adicione, antes de `function clamp(` (ou junto aos demais helpers no fim do arquivo):

```ts
/** Deterministic EAN-13 with a valid mod-10 check digit (GS1 Brazil prefix). */
function generateEan13(ctx: ISeededContext): string {
  const digits: number[] = [];
  const prefix = ctx.pick(["789", "790"]);
  for (const ch of prefix) digits.push(Number(ch));
  while (digits.length < 12) digits.push(ctx.int(0, 9));
  const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
  const check = (10 - (sum % 10)) % 10;
  digits.push(check);
  return digits.join("");
}

/** Short alphanumeric supplier code derived from the supplier name. */
function generateSupplierCode(ctx: ISeededContext, supplier: string): string {
  const slug =
    supplier
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "FRN";
  return `${slug}-${ctx.int(1000, 9999)}`;
}

/** 1–3 supplier stock entries with costs around the part's base cost. */
function generatePartSuppliers(ctx: ISeededContext, partId: ID, baseCost: number): IPartSupplier[] {
  const count = ctx.int(1, 3);
  const out: IPartSupplier[] = [];
  for (let i = 0; i < count; i += 1) {
    const name = ctx.pick(SUPPLIER_NAMES);
    const variation = 1 + (ctx.rng() - 0.5) * 0.2; // ±10%
    out.push({
      id: `sup-${partId}-${i}`,
      name,
      supplierCode: generateSupplierCode(ctx, name),
      invoiceNumber: String(ctx.int(10000, 99999)),
      invoiceDate: randomISO(ctx, new Date(2025, 0, 1), new Date(2026, 5, 1)),
      cost: roundMoney(Math.max(1, baseCost * variation)),
      quantity: ctx.int(1, 60),
    });
  }
  return out;
}
```

Garanta que `IPartSupplier` esteja no import de tipos no topo. Substitua a linha:

```ts
import type { IApplication, IPart, ID, PartCategory } from "@/shared/types";
```

por:

```ts
import type { IApplication, IPart, IPartSupplier, ID, PartCategory } from "@/shared/types";
```

- [ ] **Step 3: Preencher os campos no objeto retornado por `generatePart`**

Dentro de `generatePart`, **logo antes do `return {`**, adicione o bloco de derivações:

```ts
// --- DINTEC enrichment ---
const hasGtin = ctx.bool(0.85);
const gtin = hasGtin ? generateEan13(ctx) : undefined;
let sefazStatus: IPart["sefazStatus"];
let sefazCheckedAt: string | undefined;
if (hasGtin) {
  const roll = ctx.rng();
  sefazStatus = roll < 0.7 ? "validated" : roll < 0.95 ? "not_checked" : "invalid";
  if (sefazStatus === "validated") {
    sefazCheckedAt = randomISO(ctx, new Date(2026, 0, 1), now);
  }
}
const suppliers = generatePartSuppliers(ctx, id, baseCost);
const averageCost = weightedAverageCost(suppliers) ?? undefined;
const priceTables = unitCost > 0 ? buildPriceTables(unitCost, margin) : undefined;
```

Depois, dentro do objeto literal retornado, **após a linha `marginPercent: Number(margin.toFixed(4)),`**, adicione:

```ts
    gtin,
    sefazStatus,
    sefazCheckedAt,
    supplierCode: suppliers[0]?.supplierCode,
    reference: String(ctx.int(100000, 9999999)),
    group: GROUP_BY_CATEGORY[category.id],
    partType: ctx.bool(0.5) ? capitalize(noun) : undefined,
    priceTables,
    fiscal: {
      ncm: NCM_BY_CATEGORY[category.id],
      icmsPercent: ctx.pick(ICMS_RATES),
      taxSubstitution: ctx.bool(0.3),
      origin: ctx.pick(ORIGINS),
    },
    weightKg: roundMoney(ctx.int(20, 4000) / 100), // 0.20–40.00 kg
    storageLocation: `${ctx.pick(["A", "B", "C", "D", "E", "F"])}-${ctx.int(1, 40)}`,
    boxQuantity: ctx.pick(BOX_QUANTITIES),
    fractionable: ctx.bool(0.4),
    unitOfMeasure: ctx.pick(UNITS_OF_MEASURE),
    suppliers,
    averageCost,
```

- [ ] **Step 4: Scratch de verificação determinística**

Crie `src/mocks/generators/part.check.ts`:

```ts
import { createSeededContext } from "./utils/seededRandom";
import { generatePart } from "./part";

const ctx = createSeededContext(12345);
const part = generatePart(ctx, { now: new Date(2026, 5, 1), sequence: 0 });

console.assert(part.suppliers !== undefined && part.suppliers.length >= 1, "no suppliers");
console.assert(part.fiscal?.ncm !== undefined, "no NCM");
console.assert(part.storageLocation !== undefined, "no location");

// When cost is known, the Padrão table must equal unitPrice.
if (part.unitCost > 0 && part.priceTables) {
  const padrao = part.priceTables.find((t) => t.id === "padrao")!;
  console.assert(
    padrao.price === part.unitPrice,
    `padrao ${padrao.price} != unitPrice ${part.unitPrice}`,
  );
}

// GTIN, when present, is 13 digits with a valid mod-10 check digit.
if (part.gtin) {
  console.assert(/^\d{13}$/.test(part.gtin), `bad gtin ${part.gtin}`);
  const d = part.gtin.split("").map(Number);
  const sum = d.slice(0, 12).reduce((a, n, i) => a + n * (i % 2 === 0 ? 1 : 3), 0);
  console.assert((10 - (sum % 10)) % 10 === d[12], "bad check digit");
}

// Determinism: same seed → same GTIN.
const again = generatePart(createSeededContext(12345), { now: new Date(2026, 5, 1), sequence: 0 });
console.assert(again.gtin === part.gtin, "non-deterministic gtin");

console.log("part.check OK", { gtin: part.gtin, sefaz: part.sefazStatus, cm: part.averageCost });
```

- [ ] **Step 5: Rodar e remover o scratch**

Run: `bun run src/mocks/generators/part.check.ts`
Expected: imprime `part.check OK …` sem `Assertion failed`.

```bash
rm src/mocks/generators/part.check.ts
```

- [ ] **Step 6: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/mocks/generators/part.ts
git commit -m "feat(catalog): populate mock parts with gtin, price tables, fiscal, logistics and suppliers"
```

---

### Task 4: Strings i18n do detalhe

**Files:**

- Modify: `src/features/catalog/i18n/pt-BR.ts`

- [ ] **Step 1: Adicionar os blocos de strings em `detail`**

Dentro de `CATALOG_STRINGS.detail`, **após o objeto `priceHistory: { … },`** (mantendo a vírgula), adicione:

```ts
    layout: {
      ariaLabel: "Escolher layout da ficha",
      counter: "Balcão",
      panel: "Painel",
      sheet: "Ficha",
      counterHint: "Resumo fixo à esquerda + abas",
      panelHint: "Painel de cards (visão panorâmica)",
      sheetHint: "Cabeçalho + abas em largura total",
    },
    statStrip: {
      standardPrice: "Preço Padrão",
      avgCost: "Custo médio",
      stock: "Estoque",
      location: "Localização",
      margin: "Margem",
      empty: "—",
      belowMin: "no mínimo",
    },
    identity: {
      gtinLabel: "GTIN (EAN)",
      supplierCode: "Cód. fornecedor",
      reference: "Referência",
      group: "Grupo",
      type: "Tipo",
      noGtin: "GTIN não cadastrado",
    },
    sefaz: {
      validated: "Validado no SEFAZ",
      validatedAt: (date: string) => `Validado em ${date}`,
      notChecked: "Não consultado no SEFAZ",
      invalid: "GTIN não encontrado no SEFAZ",
      check: "Consultar agora",
      checkSoon: "Consulta ao SEFAZ disponível na Fase 2.",
    },
    pricing: {
      title: "Tabelas de preço",
      baseCost: "Custo base",
      table: "Tabela",
      markup: "Markup",
      price: "Preço",
      margin: "Margem",
      empty: "Defina o custo da peça para calcular as tabelas de preço.",
    },
    fiscal: {
      title: "Fiscal",
      ncm: "NCM",
      icms: "ICMS",
      st: "Subst. tributária",
      origin: "Origem",
      yes: "Sim",
      no: "Não",
      empty: "Dados fiscais não cadastrados.",
    },
    logistics: {
      title: "Logística",
      weight: "Peso",
      location: "Localização",
      boxQty: "Qtd. por caixa",
      fractionable: "Fraciona",
      unit: "Unidade",
      empty: "Dados logísticos não cadastrados.",
    },
    suppliers: {
      title: "Fornecedores",
      name: "Fornecedor",
      code: "Código",
      invoice: "NF",
      date: "Data",
      cost: "Custo",
      qty: "Qtd",
      avgCost: "Custo médio (C.M.)",
      empty: "Nenhum fornecedor registrado.",
    },
    tabs: {
      commercial: "Comercial",
      fiscalLogistics: "Fiscal & Logística",
      suppliers: "Fornecedores",
      applications: "Aplicações",
      equivalents: "Equivalências",
    },
```

- [ ] **Step 2: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/i18n/pt-BR.ts
git commit -m "feat(catalog): add i18n strings for redesigned part detail"
```

---

### Task 5: Config de layout, hook de persistência e switcher

**Files:**

- Create: `src/features/catalog/config/layout.ts`
- Create: `src/features/catalog/hooks/usePartDetailLayout.ts`
- Create: `src/features/catalog/components/detail/PartLayoutSwitcher.tsx`

- [ ] **Step 1: Criar `config/layout.ts`**

```ts
export type PartDetailLayout = "counter" | "panel" | "sheet";

export const PART_DETAIL_LAYOUTS: PartDetailLayout[] = ["counter", "panel", "sheet"];

export const DEFAULT_PART_DETAIL_LAYOUT: PartDetailLayout = "counter";

export const PART_DETAIL_LAYOUT_STORAGE_KEY = "gallo-part-detail-layout";
```

- [ ] **Step 2: Criar `hooks/usePartDetailLayout.ts`**

```ts
import { useCallback, useState } from "react";
import {
  DEFAULT_PART_DETAIL_LAYOUT,
  PART_DETAIL_LAYOUTS,
  PART_DETAIL_LAYOUT_STORAGE_KEY,
  type PartDetailLayout,
} from "../config/layout";

function readLayout(): PartDetailLayout {
  if (typeof window === "undefined") return DEFAULT_PART_DETAIL_LAYOUT;
  try {
    const raw = window.localStorage.getItem(PART_DETAIL_LAYOUT_STORAGE_KEY);
    if (raw && (PART_DETAIL_LAYOUTS as string[]).includes(raw)) {
      return raw as PartDetailLayout;
    }
  } catch {
    // localStorage indisponível — usa o padrão.
  }
  return DEFAULT_PART_DETAIL_LAYOUT;
}

/** Selected part-detail layout persisted to localStorage (global, no FOUC). */
export function usePartDetailLayout(): [PartDetailLayout, (layout: PartDetailLayout) => void] {
  const [layout, setLayoutState] = useState<PartDetailLayout>(() => readLayout());

  const setLayout = useCallback((next: PartDetailLayout) => {
    setLayoutState(next);
    try {
      window.localStorage.setItem(PART_DETAIL_LAYOUT_STORAGE_KEY, next);
    } catch {
      // Preferência apenas em memória nesta sessão.
    }
  }, []);

  return [layout, setLayout];
}
```

- [ ] **Step 3: Criar `components/detail/PartLayoutSwitcher.tsx`**

```tsx
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Icon } from "@/components/Icon";
import { PART_DETAIL_LAYOUTS, type PartDetailLayout } from "../../config/layout";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.layout;

const ICONS: Record<PartDetailLayout, string> = {
  counter: "mdi:view-split-vertical",
  panel: "mdi:view-grid-outline",
  sheet: "mdi:file-document-outline",
};

const LABELS: Record<PartDetailLayout, string> = {
  counter: COPY.counter,
  panel: COPY.panel,
  sheet: COPY.sheet,
};

const HINTS: Record<PartDetailLayout, string> = {
  counter: COPY.counterHint,
  panel: COPY.panelHint,
  sheet: COPY.sheetHint,
};

export interface IPartLayoutSwitcherProps {
  value: PartDetailLayout;
  onChange: (layout: PartDetailLayout) => void;
}

export function PartLayoutSwitcher({ value, onChange }: IPartLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as PartDetailLayout);
      }}
      variant="outline"
      size="sm"
      aria-label={COPY.ariaLabel}
    >
      {PART_DETAIL_LAYOUTS.map((layout) => (
        <ToggleGroupItem
          key={layout}
          value={layout}
          aria-label={LABELS[layout]}
          title={HINTS[layout]}
          className="cursor-pointer"
        >
          <Icon icon={ICONS[layout]} size={16} />
          <span className="ml-1 hidden sm:inline">{LABELS[layout]}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

- [ ] **Step 4: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/config/layout.ts src/features/catalog/hooks/usePartDetailLayout.ts src/features/catalog/components/detail/PartLayoutSwitcher.tsx
git commit -m "feat(catalog): add part detail layout config, hook and switcher"
```

---

### Task 6: `PartSefazBadge` e `PartIdentityCard`

**Files:**

- Create: `src/features/catalog/components/detail/PartSefazBadge.tsx`
- Create: `src/features/catalog/components/detail/PartIdentityCard.tsx`

- [ ] **Step 1: Criar `PartSefazBadge.tsx`**

```tsx
import { toast } from "sonner";
import type { SefazStatus } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { formatDateBR } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.sefaz;

export interface IPartSefazBadgeProps {
  status?: SefazStatus;
  checkedAt?: string;
}

/** SEFAZ validation badge — colour + icon + text (never colour alone). */
export function PartSefazBadge({ status = "not_checked", checkedAt }: IPartSefazBadgeProps) {
  if (status === "validated") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Icon icon="mdi:check-decagram" size={12} />
        {checkedAt ? COPY.validatedAt(formatDateBR(checkedAt)) : COPY.validated}
      </span>
    );
  }

  if (status === "invalid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <Icon icon="mdi:alert-circle-outline" size={12} />
        {COPY.invalid}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
        <Icon icon="mdi:shield-alert-outline" size={12} />
        {COPY.notChecked}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 cursor-pointer px-2 text-[11px]"
        onClick={() => toast.info(COPY.checkSoon)}
      >
        {COPY.check}
      </Button>
    </span>
  );
}
```

- [ ] **Step 2: Criar `PartIdentityCard.tsx`**

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel } from "../../utils/categories";
import { PartImage } from "../PartImage";
import { PartSefazBadge } from "./PartSefazBadge";

const COPY = CATALOG_STRINGS.detail.identity;

export interface IPartIdentityCardProps {
  part: IPart;
  /** Compact omits the description and uses a smaller image (sheet header). */
  compact?: boolean;
}

export function PartIdentityCard({ part, compact = false }: IPartIdentityCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex gap-4">
        <PartImage part={part} size={compact ? "sm" : "lg"} />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <h1 className="text-lg font-semibold uppercase leading-tight tracking-tight text-foreground">
              {part.name}
            </h1>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              SKU {part.sku} · OEM {part.oemCodes[0] ?? "—"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {part.category && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground">
                {getCategoryLabel(part.category)}
              </span>
            )}
            {part.isOriginal ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <Icon icon="mdi:check-decagram" size={11} />
                {CATALOG_STRINGS.badges.original}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {CATALOG_STRINGS.badges.equivalent}
              </span>
            )}
            {!part.active && (
              <span className="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                {CATALOG_STRINGS.status.inactive}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* GTIN block — the official identity */}
      <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Icon icon="mdi:barcode" size={13} />
          {COPY.gtinLabel}
        </div>
        {part.gtin ? (
          <>
            <p className="mt-1 font-mono text-base font-semibold tracking-wide text-foreground">
              {part.gtin}
            </p>
            <div className="mt-1.5">
              <PartSefazBadge status={part.sefazStatus} checkedAt={part.sefazCheckedAt} />
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{COPY.noGtin}</p>
        )}
        {part.supplierCode && (
          <p className="mt-2 text-xs text-muted-foreground">
            {COPY.supplierCode}: <span className="font-mono">{part.supplierCode}</span>
          </p>
        )}
      </div>

      {/* Reference / group / type chips */}
      {(part.reference || part.group || part.partType) && (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
          {part.reference && <IdentityField label={COPY.reference} value={part.reference} mono />}
          {part.group && <IdentityField label={COPY.group} value={part.group} />}
          {part.partType && <IdentityField label={COPY.type} value={part.partType} />}
        </dl>
      )}

      {!compact && part.description && (
        <p className="mt-3 text-sm text-muted-foreground">{part.description}</p>
      )}
    </div>
  );
}

function IdentityField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/components/detail/PartSefazBadge.tsx src/features/catalog/components/detail/PartIdentityCard.tsx
git commit -m "feat(catalog): add SEFAZ badge and part identity card"
```

---

### Task 7: `PartStatStrip` (5 KPIs)

**Files:**

- Create: `src/features/catalog/components/detail/PartStatStrip.tsx`

- [ ] **Step 1: Criar `PartStatStrip.tsx`**

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { resolvePriceTables } from "../../utils/pricing";

const COPY = CATALOG_STRINGS.detail.statStrip;

interface IStatCell {
  icon: string;
  label: string;
  value: React.ReactNode;
  accent?: "warn" | "danger";
}

export interface IPartStatStripProps {
  part: IPart;
}

/** Full-width KPI strip mirroring the vehicle/customer detail pattern. */
export function PartStatStrip({ part }: IPartStatStripProps) {
  const tables = resolvePriceTables(part);
  const padrao = tables.find((t) => t.id === "padrao");
  const isZero = part.stockAvailable <= 0;
  const isLow = !isZero && part.stockAvailable <= part.stockMinimum;

  const cells: IStatCell[] = [
    {
      icon: "mdi:tag-outline",
      label: COPY.standardPrice,
      value: padrao ? formatBRL(padrao.price) : formatBRL(part.unitPrice),
    },
    {
      icon: "mdi:scale-balance",
      label: COPY.avgCost,
      value:
        part.averageCost != null ? formatBRL(part.averageCost) : formatBRL(part.unitCost || null),
    },
    {
      icon: "mdi:warehouse",
      label: COPY.stock,
      value:
        isLow || isZero ? `${part.stockAvailable} (${COPY.belowMin})` : String(part.stockAvailable),
      accent: isZero ? "danger" : isLow ? "warn" : undefined,
    },
    {
      icon: "mdi:map-marker-outline",
      label: COPY.location,
      value: part.storageLocation ?? COPY.empty,
    },
    {
      icon: "mdi:percent-outline",
      label: COPY.margin,
      value: formatPercent(part.marginPercent),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={11} />
            {cell.label}
          </dt>
          <dd
            className={cn(
              "mt-1 text-sm font-semibold tabular-nums text-foreground",
              cell.accent === "warn" && "text-amber-600 dark:text-amber-300",
              cell.accent === "danger" && "text-destructive",
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

- [ ] **Step 2: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/components/detail/PartStatStrip.tsx
git commit -m "feat(catalog): add part KPI stat strip"
```

---

### Task 8: `PartPriceHistory` (extração) e `PartPricingTable`

**Files:**

- Create: `src/features/catalog/components/detail/PartPriceHistory.tsx`
- Create: `src/features/catalog/components/detail/PartPricingTable.tsx`

- [ ] **Step 1: Criar `PartPriceHistory.tsx`** (lógica de histórico extraída de `CommercialSection`)

```tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IAuditLog, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateTimeBR } from "@/shared/utils/format";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

interface IPriceChangeBeforeAfter {
  before?: { unitPrice?: number };
  after?: { unitPrice?: number };
}

export interface IPartPriceHistoryProps {
  part: IPart;
}

/** Collapsible price-change history. Lazy-loads audits on first expand. */
export function PartPriceHistory({ part }: IPartPriceHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const auditsProvider = useAuditsProvider();
  const audits = useQuery({
    queryKey: ["part-price-history", part.id] as const,
    queryFn: () =>
      auditsProvider.list({
        resource: "part",
        resourceId: part.id,
        action: "part_price_change",
        pageSize: 10,
      }),
    staleTime: 60_000,
    enabled: expanded,
  });

  const priceChanges = (audits.data?.data ?? []) as IAuditLog[];

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"} size={14} />
        {CATALOG_STRINGS.detail.sections.priceHistory}
      </button>

      {expanded && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
          {audits.isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : priceChanges.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {CATALOG_STRINGS.detail.priceHistory.empty}
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {priceChanges.map((entry) => {
                const ba = entry as IAuditLog & IPriceChangeBeforeAfter;
                const before = ba.before?.unitPrice;
                const after = ba.after?.unitPrice;
                const diff =
                  before !== undefined && after !== undefined
                    ? ((after - before) / before) * 100
                    : undefined;
                return (
                  <li key={entry.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {formatDateTimeBR(entry.timestamp)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {before !== undefined ? formatBRL(before) : "?"} →{" "}
                      {after !== undefined ? formatBRL(after) : "?"}
                      {diff !== undefined && (
                        <span
                          className={
                            diff < 0
                              ? " ml-2 text-emerald-600 dark:text-emerald-400"
                              : " ml-2 text-amber-600 dark:text-amber-400"
                          }
                        >
                          {diff > 0 ? "+" : ""}
                          {diff.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Criar `PartPricingTable.tsx`**

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { resolvePriceTables, tableMargin } from "../../utils/pricing";
import { PartPriceHistory } from "./PartPriceHistory";

const COPY = CATALOG_STRINGS.detail.pricing;

export interface IPartPricingTableProps {
  part: IPart;
}

export function PartPricingTable({ part }: IPartPricingTableProps) {
  const tables = resolvePriceTables(part);
  const baseCost = part.unitCost;

  if (tables.length === 0) {
    return (
      <Card>
        <Header />
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      </Card>
    );
  }

  // Highest markup → most saturated bar; scale relative to the max in the set.
  const maxMarkup = Math.max(...tables.map((t) => t.markupPercent));

  return (
    <Card>
      <Header />
      <p className="mb-3 text-xs text-muted-foreground">
        {COPY.baseCost}:{" "}
        <span className="font-mono font-medium text-foreground">{formatBRL(baseCost)}</span>
      </p>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {COPY.table}
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {COPY.markup}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {COPY.price}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {COPY.margin}
              </th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table) => {
              const isPadrao = table.id === "padrao";
              const intensity = maxMarkup > 0 ? table.markupPercent / maxMarkup : 0;
              return (
                <tr
                  key={table.id}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    isPadrao && "bg-primary/5",
                  )}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {isPadrao && <Icon icon="mdi:star" size={12} className="text-primary" />}
                      {table.label}
                    </span>
                  </th>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${Math.round(intensity * 100)}%` }}
                        />
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatPercent(table.markupPercent)}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {formatBRL(table.price)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatBRL(tableMargin(baseCost, table.price))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3">
        <PartPriceHistory part={part} />
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-4">{children}</div>;
}

function Header() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon icon="mdi:cash-multiple" size={18} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/components/detail/PartPriceHistory.tsx src/features/catalog/components/detail/PartPricingTable.tsx
git commit -m "feat(catalog): add price tables card and extracted price history"
```

---

### Task 9: Cards Fiscal, Logística e Fornecedores

**Files:**

- Create: `src/features/catalog/components/detail/PartFiscalCard.tsx`
- Create: `src/features/catalog/components/detail/PartLogisticsCard.tsx`
- Create: `src/features/catalog/components/detail/PartSuppliersTable.tsx`

- [ ] **Step 1: Criar `PartFiscalCard.tsx`**

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.fiscal;

export interface IPartFiscalCardProps {
  part: IPart;
}

export function PartFiscalCard({ part }: IPartFiscalCardProps) {
  const f = part.fiscal;
  const hasData = f && (f.ncm || f.icmsPercent != null || f.taxSubstitution != null || f.origin);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon icon="mdi:file-percent-outline" size={18} className="text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
      </div>
      {hasData ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Field label={COPY.ncm} value={f?.ncm} mono />
          <Field
            label={COPY.icms}
            value={f?.icmsPercent != null ? `${f.icmsPercent}%` : undefined}
          />
          <Field
            label={COPY.st}
            value={
              f?.taxSubstitution != null ? (f.taxSubstitution ? COPY.yes : COPY.no) : undefined
            }
          />
          <Field label={COPY.origin} value={f?.origin} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value ?? "—"}</dd>
    </div>
  );
}
```

- [ ] **Step 2: Criar `PartLogisticsCard.tsx`**

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { StockBadge } from "../StockBadge";

const COPY = CATALOG_STRINGS.detail.logistics;

export interface IPartLogisticsCardProps {
  part: IPart;
}

export function PartLogisticsCard({ part }: IPartLogisticsCardProps) {
  const hasData =
    part.weightKg != null ||
    part.storageLocation ||
    part.boxQuantity != null ||
    part.fractionable != null ||
    part.unitOfMeasure;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:package-variant-closed" size={18} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
        </div>
        <StockBadge part={part} />
      </div>
      {hasData ? (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Field
            label={COPY.weight}
            value={
              part.weightKg != null ? `${part.weightKg.toLocaleString("pt-BR")} kg` : undefined
            }
          />
          <Field label={COPY.location} value={part.storageLocation} mono />
          <Field
            label={COPY.boxQty}
            value={part.boxQuantity != null ? String(part.boxQuantity) : undefined}
          />
          <Field
            label={COPY.fractionable}
            value={part.fractionable != null ? (part.fractionable ? "Sim" : "Não") : undefined}
          />
          <Field label={COPY.unit} value={part.unitOfMeasure} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value?: string; mono?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-foreground" : "text-foreground"}>{value ?? "—"}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Criar `PartSuppliersTable.tsx`**

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.suppliers;

export interface IPartSuppliersTableProps {
  part: IPart;
}

export function PartSuppliersTable({ part }: IPartSuppliersTableProps) {
  const suppliers = part.suppliers ?? [];

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon icon="mdi:truck-delivery-outline" size={18} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
        </div>
        {part.averageCost != null && (
          <span className="text-xs text-muted-foreground">
            {COPY.avgCost}:{" "}
            <span className="font-mono font-semibold text-foreground">
              {formatBRL(part.averageCost)}
            </span>
          </span>
        )}
      </div>

      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.name}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.code}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.invoice}
                </th>
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  {COPY.date}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {COPY.cost}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {COPY.qty}
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-foreground">{s.name}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {s.supplierCode ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {s.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {formatDateBR(s.invoiceDate)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {formatBRL(s.cost)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {s.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/components/detail/PartFiscalCard.tsx src/features/catalog/components/detail/PartLogisticsCard.tsx src/features/catalog/components/detail/PartSuppliersTable.tsx
git commit -m "feat(catalog): add fiscal, logistics and suppliers detail cards"
```

---

### Task 10: Composers de layout (Balcão / Painel / Ficha)

**Files:**

- Create: `src/features/catalog/components/detail/layouts/types.ts`
- Create: `src/features/catalog/components/detail/layouts/PartLayoutCounter.tsx`
- Create: `src/features/catalog/components/detail/layouts/PartLayoutPanel.tsx`
- Create: `src/features/catalog/components/detail/layouts/PartLayoutSheet.tsx`

- [ ] **Step 1: Criar `layouts/types.ts`**

```ts
import type { IPart } from "@/shared/types";

/** Shared contract for the three layout composers — they only arrange cards. */
export interface IPartLayoutProps {
  part: IPart;
}
```

- [ ] **Step 2: Criar `layouts/PartLayoutCounter.tsx`** (A — sidebar sticky + abas)

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationsSection } from "../ApplicationsSection";
import { EquivalentsSection } from "../EquivalentsSection";
import { PartFiscalCard } from "../PartFiscalCard";
import { PartIdentityCard } from "../PartIdentityCard";
import { PartLogisticsCard } from "../PartLogisticsCard";
import { PartPricingTable } from "../PartPricingTable";
import { PartSuppliersTable } from "../PartSuppliersTable";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import type { IPartLayoutProps } from "./types";

const TABS = CATALOG_STRINGS.detail.tabs;

export function PartLayoutCounter({ part }: IPartLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <aside className="lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
        <PartIdentityCard part={part} />
      </aside>

      <div className="lg:col-span-8">
        <Tabs defaultValue="commercial" className="w-full">
          <TabsList className="flex flex-wrap">
            <TabsTrigger value="commercial" className="cursor-pointer">
              {TABS.commercial}
            </TabsTrigger>
            <TabsTrigger value="fiscal" className="cursor-pointer">
              {TABS.fiscalLogistics}
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="cursor-pointer">
              {TABS.suppliers}
            </TabsTrigger>
            <TabsTrigger value="applications" className="cursor-pointer">
              {TABS.applications}
            </TabsTrigger>
            <TabsTrigger value="equivalents" className="cursor-pointer">
              {TABS.equivalents}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="commercial" className="mt-4">
            <PartPricingTable part={part} />
          </TabsContent>
          <TabsContent value="fiscal" className="mt-4 space-y-6">
            <PartFiscalCard part={part} />
            <PartLogisticsCard part={part} />
          </TabsContent>
          <TabsContent value="suppliers" className="mt-4">
            <PartSuppliersTable part={part} />
          </TabsContent>
          <TabsContent
            value="applications"
            className="mt-4 rounded-lg border border-border bg-card"
          >
            <ApplicationsSection part={part} />
          </TabsContent>
          <TabsContent value="equivalents" className="mt-4 rounded-lg border border-border bg-card">
            <EquivalentsSection part={part} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

> Nota: `ApplicationsSection`/`EquivalentsSection` já renderizam um `<section>` com padding (`Section`); o wrapper `rounded-lg border bg-card` aqui apenas os encaixa visualmente como card.

- [ ] **Step 3: Criar `layouts/PartLayoutPanel.tsx`** (B — bento)

```tsx
import { ApplicationsSection } from "../ApplicationsSection";
import { EquivalentsSection } from "../EquivalentsSection";
import { PartFiscalCard } from "../PartFiscalCard";
import { PartIdentityCard } from "../PartIdentityCard";
import { PartLogisticsCard } from "../PartLogisticsCard";
import { PartPricingTable } from "../PartPricingTable";
import { PartSuppliersTable } from "../PartSuppliersTable";
import type { IPartLayoutProps } from "./types";

export function PartLayoutPanel({ part }: IPartLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
        <PartIdentityCard part={part} />
      </div>
      <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
        <PartPricingTable part={part} />
      </div>

      <div className="lg:col-span-2">
        <PartLogisticsCard part={part} />
      </div>
      <div className="lg:col-span-2">
        <PartFiscalCard part={part} />
      </div>

      <div className="md:col-span-2 lg:col-span-4">
        <PartSuppliersTable part={part} />
      </div>

      <div className="md:col-span-2 lg:col-span-2 overflow-hidden rounded-lg border border-border bg-card">
        <EquivalentsSection part={part} />
      </div>
      <div className="md:col-span-2 lg:col-span-2 overflow-hidden rounded-lg border border-border bg-card">
        <ApplicationsSection part={part} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Criar `layouts/PartLayoutSheet.tsx`** (C — header denso + abas full-width)

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApplicationsSection } from "../ApplicationsSection";
import { EquivalentsSection } from "../EquivalentsSection";
import { PartFiscalCard } from "../PartFiscalCard";
import { PartIdentityCard } from "../PartIdentityCard";
import { PartLogisticsCard } from "../PartLogisticsCard";
import { PartPricingTable } from "../PartPricingTable";
import { PartSuppliersTable } from "../PartSuppliersTable";
import { CATALOG_STRINGS } from "../../../i18n/pt-BR";
import type { IPartLayoutProps } from "./types";

const TABS = CATALOG_STRINGS.detail.tabs;

export function PartLayoutSheet({ part }: IPartLayoutProps) {
  return (
    <div className="space-y-6">
      <PartIdentityCard part={part} compact />

      <Tabs defaultValue="commercial" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="commercial" className="cursor-pointer">
            {TABS.commercial}
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="cursor-pointer">
            {TABS.fiscalLogistics}
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="cursor-pointer">
            {TABS.suppliers}
          </TabsTrigger>
          <TabsTrigger value="applications" className="cursor-pointer">
            {TABS.applications}
          </TabsTrigger>
          <TabsTrigger value="equivalents" className="cursor-pointer">
            {TABS.equivalents}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="commercial" className="mt-4">
          <PartPricingTable part={part} />
        </TabsContent>
        <TabsContent value="fiscal" className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PartFiscalCard part={part} />
          <PartLogisticsCard part={part} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <PartSuppliersTable part={part} />
        </TabsContent>
        <TabsContent value="applications" className="mt-4 rounded-lg border border-border bg-card">
          <ApplicationsSection part={part} />
        </TabsContent>
        <TabsContent value="equivalents" className="mt-4 rounded-lg border border-border bg-card">
          <EquivalentsSection part={part} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Type-check + commit**

Run: `bun run build` → PASS

```bash
git add src/features/catalog/components/detail/layouts/
git commit -m "feat(catalog): add counter, panel and sheet layout composers"
```

---

### Task 11: Conectar o header e a página

**Files:**

- Modify: `src/features/catalog/components/detail/PartDetailHeader.tsx`
- Modify: `src/features/catalog/pages/PartDetailPage.tsx`

- [ ] **Step 1: Reescrever `PartDetailHeader.tsx`** (rail 1600, switcher, sem a ficha de identidade — que migrou para o card)

Substitua **todo** o conteúdo do arquivo por:

```tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import type { PartDetailLayout } from "../../config/layout";
import { PartLayoutSwitcher } from "./PartLayoutSwitcher";

export interface IPartDetailHeaderProps {
  part: IPart;
  canEdit: boolean;
  canToggle: boolean;
  layout: PartDetailLayout;
  onLayoutChange: (layout: PartDetailLayout) => void;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
}

export function PartDetailHeader({
  part,
  canEdit,
  canToggle,
  layout,
  onLayoutChange,
  onBack,
  onEdit,
  onDuplicate,
  onToggleActive,
}: IPartDetailHeaderProps) {
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="-ml-2 cursor-pointer text-xs"
          >
            <Icon icon="mdi:arrow-left" size={14} />
            {CATALOG_STRINGS.detail.backToList}
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <PartLayoutSwitcher value={layout} onChange={onLayoutChange} />
            {canEdit && (
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={onEdit}>
                <Icon icon="mdi:pencil-outline" size={14} />
                {CATALOG_STRINGS.detail.actions.edit}
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" className="cursor-pointer" onClick={onDuplicate}>
                <Icon icon="mdi:content-copy" size={14} />
                {CATALOG_STRINGS.detail.actions.duplicate}
              </Button>
            )}
            {canToggle && (
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={onToggleActive}
              >
                <Icon
                  icon={part.active ? "mdi:archive-outline" : "mdi:archive-arrow-up-outline"}
                  size={14}
                />
                {part.active
                  ? CATALOG_STRINGS.detail.actions.deactivate
                  : CATALOG_STRINGS.detail.actions.activate}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Reescrever a composição em `PartDetailPage.tsx`**

No bloco de imports, **remova** as quatro linhas de import das seções antigas:

```ts
import { ApplicationsSection } from "../components/detail/ApplicationsSection";
import { CommercialSection } from "../components/detail/CommercialSection";
import { EquivalentsSection } from "../components/detail/EquivalentsSection";
import { PartDetailHeader } from "../components/detail/PartDetailHeader";
import { StockSection } from "../components/detail/StockSection";
```

e **substitua** por:

```ts
import { PartDetailHeader } from "../components/detail/PartDetailHeader";
import { PartStatStrip } from "../components/detail/PartStatStrip";
import { PartLayoutCounter } from "../components/detail/layouts/PartLayoutCounter";
import { PartLayoutPanel } from "../components/detail/layouts/PartLayoutPanel";
import { PartLayoutSheet } from "../components/detail/layouts/PartLayoutSheet";
import { usePartDetailLayout } from "../hooks/usePartDetailLayout";
```

Adicione, logo após `const partsProvider = usePartsProvider();`:

```ts
const [layout, setLayout] = usePartDetailLayout();
```

Substitua o `return (` principal (o bloco que começa em `<div className="min-h-[calc(100vh-4rem)] bg-background pb-12">` e contém `<PartDetailHeader … />`, as 4 seções e o `AlertDialog`) por:

```tsx
return (
  <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
    <PartDetailHeader
      part={part}
      canEdit={canEdit}
      canToggle={canToggle}
      layout={layout}
      onLayoutChange={setLayout}
      onBack={handleBack}
      onEdit={handleEdit}
      onDuplicate={handleDuplicate}
      onToggleActive={() => setConfirmToggleOpen(true)}
    />

    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
      <PartStatStrip part={part} />
      {layout === "counter" && <PartLayoutCounter part={part} />}
      {layout === "panel" && <PartLayoutPanel part={part} />}
      {layout === "sheet" && <PartLayoutSheet part={part} />}
    </div>

    <AlertDialog open={confirmToggleOpen} onOpenChange={setConfirmToggleOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{part.active ? "Desativar peça?" : "Reativar peça?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {part.active
              ? "A peça deixará de aparecer em buscas, novos orçamentos e listagens padrão. O histórico permanece preservado."
              : "A peça voltará a aparecer no catálogo e ficará disponível para orçamentos."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleConfirmToggle()}>
            {part.active
              ? CATALOG_STRINGS.detail.actions.deactivate
              : CATALOG_STRINGS.detail.actions.activate}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
```

(Os handlers `handleBack`/`handleEdit`/`handleDuplicate`/`handleConfirmToggle`, `usePart`, permissões e a query permanecem inalterados.)

- [ ] **Step 3: Type-check + lint**

Run: `bun run build`
Expected: PASS. Se o `tsc` apontar `CommercialSection`/`ApplicationsSection`/`StockSection` como import não usado em `PartDetailPage.tsx`, confirme que foram removidos no Step 2.

Run: `bunx eslint src/features/catalog/pages/PartDetailPage.tsx src/features/catalog/components/detail/PartDetailHeader.tsx`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add src/features/catalog/pages/PartDetailPage.tsx src/features/catalog/components/detail/PartDetailHeader.tsx
git commit -m "feat(catalog): wire 3 selectable layouts into the part detail page"
```

---

### Task 12: Verificação final, lint e limpeza

**Files:**

- Verify only (sem novas mudanças além de eventuais correções de lint/prettier).

- [ ] **Step 1: Verificar se `CommercialSection`/`StockSection`/`ApplicationsSection`/`EquivalentsSection` ainda são referenciadas em outro lugar**

Run: `bunx grep -rn "CommercialSection\|StockSection" src/ || rg -n "CommercialSection|StockSection" src/`
Expected: `CommercialSection` e `StockSection` **não** devem ter mais nenhuma referência (foram substituídas). `ApplicationsSection`/`EquivalentsSection` continuam referenciadas pelos novos composers — OK.

- Se `CommercialSection.tsx`/`StockSection.tsx` ficaram órfãos, **não delete agora** (fora do escopo); apenas registre no resumo final que estão órfãos e podem ser removidos numa limpeza futura.

- [ ] **Step 2: Prettier em tudo que foi tocado**

Run: `bunx prettier --write "src/features/catalog/**/*.{ts,tsx}" "src/shared/types/catalog.ts" "src/shared/types/index.ts" "src/mocks/generators/part.ts"`
Expected: arquivos formatados (guard CRLF).

- [ ] **Step 3: Build + lint completos**

Run: `bun run build`
Expected: PASS (Vite + `tsc --noEmit`).

Run: `bun run lint`
Expected: sem erros nos arquivos novos/tocados.

- [ ] **Step 4: Garantir que não há scratch remanescente**

Run: `ls src/features/catalog/utils/pricing.check.ts src/mocks/generators/part.check.ts 2>&1`
Expected: ambos **não existem** (foram removidos nas Tasks 2 e 3).

- [ ] **Step 5: Commit de formatação (se o prettier alterou algo)**

```bash
git add -A src/features/catalog src/shared/types src/mocks/generators/part.ts
git commit -m "style(catalog): format redesigned part detail files"
```

(Se o prettier não alterou nada, pule o commit.)

- [ ] **Step 6: Validação manual (usuário)**

Checklist a passar para o usuário validar em `bun run dev` → `/app/catalogo` → abrir uma peça:

- Alternar **Balcão / Painel / Ficha** no switcher do header; recarregar a página e confirmar que o layout escolhido **persiste**.
- Abrir uma peça **com custo** (tabelas de preço com 5 linhas; Padrão destacado; markup em barra; valores alinhados) e uma peça **sem custo** (empty state "Defina o custo…").
- Conferir o bloco **GTIN** nos 3 estados SEFAZ (validado/não consultado/inválido) — o botão "Consultar agora" mostra toast de Fase 2.
- Conferir **Fornecedores** com C.M. e uma peça sem fornecedores (empty state).
- Editar / Duplicar / Ativar-Desativar continuam funcionando; histórico de preço expande.
- Testar **light/dark** e cada tema (parts/service/industrial/diesel); confirmar **scrollbar única** e ausência de hex cru.

---

## Self-Review (preenchido pelo autor do plano)

**1. Cobertura da spec:**

- §4 Modelo → Task 1. §9 Utils → Task 2. §8 Mocks → Task 3. §12 i18n → Task 4. §5 Layout state/switcher → Task 5. §7.2 cards (identity/sefaz) → Task 6; (stat strip) → Task 7; (pricing+history) → Task 8; (fiscal/logistics/suppliers) → Task 9. §7.3 composers → Task 10. §6 page + §7.5 header → Task 11. §14 verificação → Task 12. **Sem lacunas.**

**2. Placeholders:** Nenhum "TBD/TODO"; todo passo de código mostra o código real; comandos têm output esperado.

**3. Consistência de tipos/nomes:** `resolvePriceTables`/`buildPriceTables`/`weightedAverageCost`/`tableMargin`/`computePrice` usados de forma idêntica entre Task 2, 7 e 8. `IPartLayoutProps` (Task 10) consumido por `PartLayout{Counter,Panel,Sheet}`. `PartDetailLayout` ("counter"|"panel"|"sheet") consistente entre config (Task 5), header e página (Task 11). `IPartSupplier` usado no gerador (Task 3) e no card (Task 9). Strings referenciadas (`CATALOG_STRINGS.detail.{layout,statStrip,identity,sefaz,pricing,fiscal,logistics,suppliers,tabs}`) todas definidas no Task 4.

**4. Riscos conhecidos:** import cross-feature do gerador para `@/features/catalog/utils/pricing` segue precedente já existente (`@/features/part-identification/...`). `padrao.price === unitPrice` garantido pela mesma função de arredondamento (verificado no scratch do Task 3).
