# Edição inline da ficha de produto (catálogo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn "Editar" on the part-detail page (`/app/catalogo/$id`) from a navigation to a separate form page into inline, field-by-field editing inside the same cards already rendering the data — covering every field the ficha displays, including the DINTEC-enrichment fields that have no editor today.

**Architecture:** `PartDetailPage` owns `editing: boolean` + `draft: IPartDraft` (a superset of the read model). While `editing`, each affected card renders inputs sourced from `draft` instead of `part`; when not editing, cards render exactly as they do today from `part`. No new React Context — state flows down as explicit props through the 3 layout composers, matching the codebase's existing controlled-form convention (e.g. `WorkScheduleTab`). Saving builds one `Partial<IPart>` patch from the whole draft and calls `partsProvider.update` once.

**Tech Stack:** React 19 + TypeScript (strict), TanStack Query, shadcn/ui (`Input`/`Select`/`Switch`/`Textarea`/`Button`), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-catalog-inline-edit-design.md`

## Global Constraints

- **No `@testing-library/react` in this repo** (confirmed: not in `package.json`, not in `node_modules`; the 4 existing files that reference it are hook tests using plain `vitest` + exported pure functions, not DOM rendering — see `src/features/rbac/components/role-editor/usePermissionDraft.test.ts`). Every new task below tests **pure functions only**. JSX-only wiring tasks have no new automated test — their acceptance is `bunx tsc --noEmit` on the touched files + the full suite staying green + manual verification by the user in the running app (do not use browser automation tools to "validate" this feature).
- Comments in code: English. User-facing strings: Portuguese (Brasil), correct accents — add every new string to `src/features/catalog/i18n/pt-BR.ts`, never inline.
- TypeScript strict, no `any`. Domain types prefixed `I` (already the convention followed by `IPartDraft`, etc.).
- Business logic lives in pure functions under `utils/`, imported by thin components — mirrors the existing `utils/pricing.ts` / `utils/restock.ts` pattern from this same feature.
- Every task's commit message follows Conventional Commits (`feat:`, `test:`, `refactor:`, `chore:`) per the project's global CLAUDE.md.
- Run `bun run test` (not just the touched file) before each commit that changes shared code (`draft.ts`, `pricing.ts`) — regressions there ripple across every card.

---

### Task 1: `IPartDraft` type + `toPartDraft()` mapper

**Files:**
- Create: `src/features/catalog/utils/draft.ts`
- Test: `src/features/catalog/utils/draft.test.ts`

**Interfaces:**
- Produces: `IPartDraft`, `INewSupplierEntryDraft`, `toPartDraft(part: IPart): IPartDraft`, `parseOemCodes(primary: string, alternatives: string): string[]` — all consumed by Task 2 and every card-editing task (7–14).

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/catalog/utils/draft.test.ts
import { describe, expect, it } from "vitest";
import type { IPart } from "@/shared/types";
import { parseOemCodes, toPartDraft } from "./draft";

function makePart(overrides: Partial<IPart> = {}): IPart {
  return {
    id: "part-1",
    sku: "6256",
    name: "Filtro de óleo",
    oemCodes: ["VOL-123456", "ALT-1", "ALT-2"],
    equivalentPartIds: ["part-2"],
    applications: [],
    brand: "Volvo",
    supplier: "Scherer",
    unitCost: 92.5,
    unitPrice: 166.5,
    marginPercent: 0.8,
    stockAvailable: 12,
    stockMinimum: 5,
    division: "parts",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("parseOemCodes", () => {
  it("joins the primary code with trimmed alternatives", () => {
    expect(parseOemCodes("VOL-1", " ALT-1 , ALT-2,,ALT-3 ")).toEqual([
      "VOL-1",
      "ALT-1",
      "ALT-2",
      "ALT-3",
    ]);
  });

  it("drops empty entries", () => {
    expect(parseOemCodes("", "")).toEqual([]);
  });
});

describe("toPartDraft", () => {
  it("maps identification fields with the same fallbacks as the old PartForm", () => {
    const draft = toPartDraft(makePart());
    expect(draft.name).toBe("Filtro de óleo");
    expect(draft.oemPrimary).toBe("VOL-123456");
    expect(draft.oemAlternatives).toBe("ALT-1, ALT-2");
    expect(draft.brand).toBe("Volvo");
    expect(draft.supplier).toBe("Scherer");
    expect(draft.isOriginal).toBe(false);
    expect(draft.category).toBeUndefined();
    expect(draft.gtin).toBe("");
    expect(draft.reference).toBe("");
  });

  it("always materializes 5 price tables via resolvePriceTables", () => {
    const draft = toPartDraft(makePart());
    expect(draft.priceTables).toHaveLength(5);
    expect(draft.priceTables.find((t) => t.id === "padrao")?.price).toBeCloseTo(166.5, 2);
  });

  it("preserves explicit stored price tables instead of recomputing them", () => {
    const draft = toPartDraft(
      makePart({
        priceTables: [{ id: "padrao", label: "Padrão", markupPercent: 0.5, price: 138.75 }],
      }),
    );
    expect(draft.priceTables).toEqual([
      { id: "padrao", label: "Padrão", markupPercent: 0.5, price: 138.75 },
    ]);
  });

  it("defaults fiscal fields to empty/false when absent", () => {
    const draft = toPartDraft(makePart());
    expect(draft.fiscal).toEqual({
      ncm: "",
      icmsPercent: undefined,
      taxSubstitution: false,
      origin: "",
    });
  });

  it("maps existing fiscal data as-is", () => {
    const draft = toPartDraft(
      makePart({ fiscal: { ncm: "8421.23.00", icmsPercent: 17, taxSubstitution: true, origin: "Nacional" } }),
    );
    expect(draft.fiscal).toEqual({
      ncm: "8421.23.00",
      icmsPercent: 17,
      taxSubstitution: true,
      origin: "Nacional",
    });
  });

  it("maps logistics and stock fields", () => {
    const draft = toPartDraft(
      makePart({ weightKg: 1.2, storageLocation: "A-12", boxQuantity: 10, fractionable: true, unitOfMeasure: "PC" }),
    );
    expect(draft.weightKg).toBe(1.2);
    expect(draft.storageLocation).toBe("A-12");
    expect(draft.boxQuantity).toBe(10);
    expect(draft.fractionable).toBe(true);
    expect(draft.unitOfMeasure).toBe("PC");
    expect(draft.stockAvailable).toBe(12);
    expect(draft.stockMinimum).toBe(5);
  });

  it("carries over collections and starts the new-supplier-entry as null", () => {
    const draft = toPartDraft(makePart({ crossReferences: [{ brand: "Mann", code: "C123" }] }));
    expect(draft.equivalentPartIds).toEqual(["part-2"]);
    expect(draft.crossReferences).toEqual([{ brand: "Mann", code: "C123" }]);
    expect(draft.newSupplierEntry).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/catalog/utils/draft.test.ts`
Expected: FAIL — `Cannot find module './draft'` (file doesn't exist yet).

- [ ] **Step 3: Implement `draft.ts`**

```ts
// src/features/catalog/utils/draft.ts
import type { ID, IPart, IPartCrossReference, PartCategory } from "@/shared/types";
import { applicationsToDrafts, type IApplicationDraft } from "../components/form/ApplicationsEditor";
import { resolvePriceTables } from "./pricing";

export interface INewSupplierEntryDraft {
  name: string;
  supplierCode: string;
  invoiceNumber: string;
  invoiceDate: string;
  cost: number | undefined;
  quantity: number | undefined;
}

export interface IPartDraft {
  name: string;
  description: string;
  oemPrimary: string;
  oemAlternatives: string;
  brand: string;
  supplier: string;
  isOriginal: boolean;
  category: PartCategory | undefined;
  subcategory: string | undefined;
  gtin: string;
  reference: string;
  group: string;
  partType: string;

  unitCost: number;
  priceTables: ReturnType<typeof resolvePriceTables>;

  fiscal: {
    ncm: string;
    icmsPercent: number | undefined;
    taxSubstitution: boolean;
    origin: string;
  };

  weightKg: number | undefined;
  storageLocation: string;
  boxQuantity: number | undefined;
  fractionable: boolean;
  unitOfMeasure: string;

  stockAvailable: number;
  stockMinimum: number;

  applications: IApplicationDraft[];
  equivalentPartIds: ID[];
  crossReferences: IPartCrossReference[];

  newSupplierEntry: INewSupplierEntryDraft | null;
}

/** Same parsing the old `PartEditPage` used: primary code + comma-separated alternatives. */
export function parseOemCodes(primary: string, alternatives: string): string[] {
  const alts = alternatives
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary.trim(), ...alts].filter(Boolean);
}

export function toPartDraft(part: IPart): IPartDraft {
  return {
    name: part.name,
    description: part.description ?? "",
    oemPrimary: part.oemCodes[0] ?? "",
    oemAlternatives: part.oemCodes.slice(1).join(", "),
    brand: part.brand,
    supplier: part.supplier,
    isOriginal: part.isOriginal ?? false,
    category: part.category,
    subcategory: part.subcategory,
    gtin: part.gtin ?? "",
    reference: part.reference ?? "",
    group: part.group ?? "",
    partType: part.partType ?? "",

    unitCost: part.unitCost,
    priceTables: resolvePriceTables(part),

    fiscal: {
      ncm: part.fiscal?.ncm ?? "",
      icmsPercent: part.fiscal?.icmsPercent,
      taxSubstitution: part.fiscal?.taxSubstitution ?? false,
      origin: part.fiscal?.origin ?? "",
    },

    weightKg: part.weightKg,
    storageLocation: part.storageLocation ?? "",
    boxQuantity: part.boxQuantity,
    fractionable: part.fractionable ?? false,
    unitOfMeasure: part.unitOfMeasure ?? "",

    stockAvailable: part.stockAvailable,
    stockMinimum: part.stockMinimum,

    applications: applicationsToDrafts(part.applications),
    equivalentPartIds: part.equivalentPartIds,
    crossReferences: part.crossReferences ?? [],

    newSupplierEntry: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/catalog/utils/draft.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/utils/draft.ts src/features/catalog/utils/draft.test.ts
git commit -m "feat(catalog): add IPartDraft mapper for inline editing"
```

---

### Task 2: `buildPartPatch()` + `validatePartDraft()` + `isSupplierEntryFillable()`

**Files:**
- Modify: `src/features/catalog/utils/draft.ts`
- Modify: `src/features/catalog/utils/draft.test.ts`

**Interfaces:**
- Consumes: `IPartDraft`, `INewSupplierEntryDraft`, `parseOemCodes` (Task 1); `draftsToApplications` from `../components/form/ApplicationsEditor` (existing); `CATALOG_STRINGS` from `../i18n/pt-BR` (existing).
- Produces: `IPartDraftErrors`, `validatePartDraft(draft: IPartDraft): IPartDraftErrors`, `isSupplierEntryFillable(entry: INewSupplierEntryDraft | null): boolean`, `buildPartPatch(part: IPart, draft: IPartDraft, priceLocked: boolean): Partial<IPart>` — consumed by Task 18 (`PartDetailPage`) and Tasks 7/8 (inline field errors).

- [ ] **Step 1: Write the failing tests**

Append to `src/features/catalog/utils/draft.test.ts`:

```ts
import {
  buildPartPatch,
  isSupplierEntryFillable,
  validatePartDraft,
} from "./draft";

describe("validatePartDraft", () => {
  it("requires name, OEM primary, brand and category", () => {
    const draft = toPartDraft(makePart({ name: "", oemCodes: [], brand: "", category: undefined }));
    const errors = validatePartDraft(draft);
    expect(errors.name).toBeDefined();
    expect(errors.oemPrimary).toBeDefined();
    expect(errors.brand).toBeDefined();
    expect(errors.category).toBeDefined();
  });

  it("requires a positive Padrão price", () => {
    const draft = toPartDraft(makePart({ unitCost: 0 }));
    // unitCost=0 makes resolvePriceTables return [] (no cost to price from)
    const errors = validatePartDraft(draft);
    expect(errors.standardPrice).toBeDefined();
  });

  it("passes with a complete, valid draft", () => {
    const draft = toPartDraft(makePart({ category: "filtro" }));
    expect(validatePartDraft(draft)).toEqual({});
  });
});

describe("isSupplierEntryFillable", () => {
  it("is false for null or partially filled entries", () => {
    expect(isSupplierEntryFillable(null)).toBe(false);
    expect(
      isSupplierEntryFillable({
        name: "",
        supplierCode: "",
        invoiceNumber: "",
        invoiceDate: "",
        cost: 10,
        quantity: 5,
      }),
    ).toBe(false);
    expect(
      isSupplierEntryFillable({
        name: "Scherer",
        supplierCode: "",
        invoiceNumber: "",
        invoiceDate: "",
        cost: undefined,
        quantity: 5,
      }),
    ).toBe(false);
  });

  it("is true once name, cost and quantity are present", () => {
    expect(
      isSupplierEntryFillable({
        name: "Scherer",
        supplierCode: "",
        invoiceNumber: "",
        invoiceDate: "",
        cost: 92.5,
        quantity: 10,
      }),
    ).toBe(true);
  });
});

describe("buildPartPatch", () => {
  it("mirrors the Padrão channel into unitPrice and marginPercent", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    draft.priceTables = draft.priceTables.map((t) =>
      t.id === "padrao" ? { ...t, price: 200, markupPercent: 1.16 } : t,
    );
    const patch = buildPartPatch(part, draft, false);
    expect(patch.unitPrice).toBe(200);
    expect(patch.marginPercent).toBeCloseTo(1.16, 4);
    expect(patch.priceTables).toEqual(draft.priceTables);
  });

  it("omits price/cost fields entirely when priceLocked", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    const patch = buildPartPatch(part, draft, true);
    expect(patch.unitCost).toBeUndefined();
    expect(patch.unitPrice).toBeUndefined();
    expect(patch.priceTables).toBeUndefined();
    expect(patch.marginPercent).toBeUndefined();
  });

  it("parses OEM codes and trims optional text fields to undefined when empty", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    draft.oemAlternatives = " ALT-9 ";
    draft.description = "   ";
    draft.gtin = "  7890  ";
    const patch = buildPartPatch(part, draft, false);
    expect(patch.oemCodes).toEqual(["VOL-123456", "ALT-9"]);
    expect(patch.description).toBeUndefined();
    expect(patch.gtin).toBe("7890");
  });

  it("appends a new supplier entry only when fillable, keeping past entries untouched", () => {
    const part = makePart({
      category: "filtro",
      suppliers: [{ id: "sup-1", name: "Old Co", cost: 80, quantity: 3 }],
    });
    const draft = toPartDraft(part);
    draft.newSupplierEntry = {
      name: "New Co",
      supplierCode: "",
      invoiceNumber: "NF-1",
      invoiceDate: "2026-07-18",
      cost: 95,
      quantity: 4,
    };
    const patch = buildPartPatch(part, draft, false);
    expect(patch.suppliers).toHaveLength(2);
    expect(patch.suppliers?.[0]).toEqual(part.suppliers![0]);
    expect(patch.suppliers?.[1]).toMatchObject({ name: "New Co", cost: 95, quantity: 4 });
  });

  it("does not append when the new supplier entry is null", () => {
    const part = makePart({
      category: "filtro",
      suppliers: [{ id: "sup-1", name: "Old Co", cost: 80, quantity: 3 }],
    });
    const draft = toPartDraft(part);
    const patch = buildPartPatch(part, draft, false);
    expect(patch.suppliers).toEqual(part.suppliers);
  });

  it("drops cross-references with an empty brand or code", () => {
    const part = makePart({ category: "filtro" });
    const draft = toPartDraft(part);
    draft.crossReferences = [
      { brand: "Mann", code: "C123" },
      { brand: "", code: "X" },
      { brand: "Fleetguard", code: "" },
    ];
    const patch = buildPartPatch(part, draft, false);
    expect(patch.crossReferences).toEqual([{ brand: "Mann", code: "C123" }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/catalog/utils/draft.test.ts`
Expected: FAIL — `validatePartDraft`/`isSupplierEntryFillable`/`buildPartPatch` are not exported yet.

- [ ] **Step 3: Implement in `draft.ts`**

Add to `src/features/catalog/utils/draft.ts` (imports to add at the top: `import type { IPartSupplier } from "@/shared/types";` and `import { draftsToApplications } from "../components/form/ApplicationsEditor";` and `import { CATALOG_STRINGS } from "../i18n/pt-BR";`):

```ts
export interface IPartDraftErrors {
  name?: string;
  oemPrimary?: string;
  brand?: string;
  category?: string;
  standardPrice?: string;
}

export function validatePartDraft(draft: IPartDraft): IPartDraftErrors {
  const errors: IPartDraftErrors = {};
  if (!draft.name.trim()) errors.name = CATALOG_STRINGS.form.requiredField;
  if (!draft.oemPrimary.trim()) errors.oemPrimary = CATALOG_STRINGS.form.requiredField;
  if (!draft.brand.trim()) errors.brand = CATALOG_STRINGS.form.requiredField;
  if (!draft.category) errors.category = CATALOG_STRINGS.form.requiredField;
  const padrao = draft.priceTables.find((t) => t.id === "padrao");
  if (!padrao || padrao.price <= 0) errors.standardPrice = CATALOG_STRINGS.form.invalidPrice;
  return errors;
}

export function isSupplierEntryFillable(entry: INewSupplierEntryDraft | null): boolean {
  if (!entry) return false;
  return Boolean(entry.name.trim() && entry.cost != null && entry.cost > 0 && entry.quantity != null && entry.quantity > 0);
}

function nextSupplierId(partId: string): string {
  return `supplier-${partId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function appendSupplierEntry(
  partId: string,
  existing: IPartSupplier[] | undefined,
  entry: INewSupplierEntryDraft | null,
): IPartSupplier[] {
  const base = existing ?? [];
  if (!isSupplierEntryFillable(entry)) return base;
  const filled = entry as INewSupplierEntryDraft;
  return [
    ...base,
    {
      id: nextSupplierId(partId),
      name: filled.name.trim(),
      supplierCode: filled.supplierCode.trim() || undefined,
      invoiceNumber: filled.invoiceNumber.trim() || undefined,
      invoiceDate: filled.invoiceDate.trim() || undefined,
      cost: filled.cost as number,
      quantity: filled.quantity as number,
    },
  ];
}

/**
 * Build the single patch sent to `partsProvider.update` when saving inline
 * edits. `unitPrice`/`marginPercent` are mirrored from the "Padrão" channel so
 * `PartPriceHistory` (reads `before/after.unitPrice`) and other consumers of
 * `marginPercent` (quotes, part-lookup) stay correct without touching their code.
 */
export function buildPartPatch(part: IPart, draft: IPartDraft, priceLocked: boolean): Partial<IPart> {
  const oemCodes = parseOemCodes(draft.oemPrimary, draft.oemAlternatives);
  const padrao = draft.priceTables.find((t) => t.id === "padrao");

  const patch: Partial<IPart> = {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    oemCodes,
    brand: draft.brand.trim(),
    supplier: draft.supplier.trim(),
    isOriginal: draft.isOriginal,
    category: draft.category,
    subcategory: draft.subcategory,
    gtin: draft.gtin.trim() || undefined,
    reference: draft.reference.trim() || undefined,
    group: draft.group.trim() || undefined,
    partType: draft.partType.trim() || undefined,

    fiscal: {
      ncm: draft.fiscal.ncm.trim() || undefined,
      icmsPercent: draft.fiscal.icmsPercent,
      taxSubstitution: draft.fiscal.taxSubstitution,
      origin: draft.fiscal.origin.trim() || undefined,
    },

    weightKg: draft.weightKg,
    storageLocation: draft.storageLocation.trim() || undefined,
    boxQuantity: draft.boxQuantity,
    fractionable: draft.fractionable,
    unitOfMeasure: draft.unitOfMeasure.trim() || undefined,

    stockAvailable: Math.max(0, draft.stockAvailable),
    stockMinimum: Math.max(0, draft.stockMinimum),

    applications: draftsToApplications(draft.applications, part.id),
    equivalentPartIds: draft.equivalentPartIds,
    crossReferences: draft.crossReferences.filter((r) => r.brand.trim() && r.code.trim()),
    suppliers: appendSupplierEntry(part.id, part.suppliers, draft.newSupplierEntry),
  };

  if (!priceLocked) {
    patch.unitCost = draft.unitCost;
    patch.priceTables = draft.priceTables;
    if (padrao) {
      patch.unitPrice = padrao.price;
      patch.marginPercent = padrao.markupPercent;
    }
  }

  return patch;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/catalog/utils/draft.test.ts`
Expected: PASS (all tests, ~20 total in the file)

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/utils/draft.ts src/features/catalog/utils/draft.test.ts
git commit -m "feat(catalog): add patch builder and validation for inline part editing"
```

---

### Task 3: Price-table row recompute helpers

**Files:**
- Modify: `src/features/catalog/utils/pricing.ts`
- Modify: `src/features/catalog/utils/pricing.test.ts`

**Interfaces:**
- Produces: `updateTableMarkup(table: IPriceTable, markupPercent: number, baseCost: number): IPriceTable`, `updateTablePrice(table: IPriceTable, price: number, baseCost: number): IPriceTable` — consumed by Task 8 (`PartPricingTable` edit mode).

- [ ] **Step 1: Write the failing tests**

Append to `src/features/catalog/utils/pricing.test.ts`:

```ts
import { updateTableMarkup, updateTablePrice } from "./pricing";

describe("updateTableMarkup", () => {
  it("recomputes the price from the new markup", () => {
    const table = { id: "padrao", label: "Padrão", markupPercent: 0.8, price: 166.5 };
    const updated = updateTableMarkup(table, 1.0, 92.5);
    expect(updated.markupPercent).toBe(1.0);
    expect(updated.price).toBeCloseTo(185, 2);
    expect(updated.id).toBe("padrao");
    expect(updated.label).toBe("Padrão");
  });
});

describe("updateTablePrice", () => {
  it("recomputes the markup from the new price", () => {
    const table = { id: "padrao", label: "Padrão", markupPercent: 0.8, price: 166.5 };
    const updated = updateTablePrice(table, 185, 92.5);
    expect(updated.price).toBe(185);
    expect(updated.markupPercent).toBeCloseTo(1.0, 3);
  });

  it("does not divide by zero when the base cost is zero", () => {
    const table = { id: "padrao", label: "Padrão", markupPercent: 0, price: 0 };
    const updated = updateTablePrice(table, 50, 0);
    expect(updated.price).toBe(50);
    expect(updated.markupPercent).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/catalog/utils/pricing.test.ts`
Expected: FAIL — `updateTableMarkup`/`updateTablePrice` not exported.

- [ ] **Step 3: Implement in `pricing.ts`**

Add after the existing `marginHealth` function in `src/features/catalog/utils/pricing.ts`:

```ts
/** Recompute a table row's price after the user edits its markup directly. */
export function updateTableMarkup(table: IPriceTable, markupPercent: number, baseCost: number): IPriceTable {
  return { ...table, markupPercent, price: computePrice(baseCost, markupPercent) };
}

/** Recompute a table row's markup after the user edits its price directly. */
export function updateTablePrice(table: IPriceTable, price: number, baseCost: number): IPriceTable {
  const markupPercent = baseCost > 0 ? Number(((price - baseCost) / baseCost).toFixed(4)) : 0;
  return { ...table, price: round2(price), markupPercent };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/catalog/utils/pricing.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/utils/pricing.ts src/features/catalog/utils/pricing.test.ts
git commit -m "feat(catalog): add per-row price-table recompute helpers"
```

---

### Task 4: Fiscal origin list

**Files:**
- Create: `src/features/catalog/utils/fiscalOrigins.ts`
- Test: `src/features/catalog/utils/fiscalOrigins.test.ts`

**Interfaces:**
- Produces: `IFiscalOrigin`, `FISCAL_ORIGINS: IFiscalOrigin[]`, `getFiscalOriginLabel(code: string | undefined): string` — consumed by Task 9 (`PartFiscalCard` edit mode).

**Note:** legacy `part.fiscal.origin` values from earlier imports are free text (e.g. `"Nacional"`), not one of these 9 codes. The edit `Select` will show its placeholder (not a pre-selected option) for those parts until the user explicitly picks one — the stored value is not altered unless the user touches the field, so there is no silent data loss, only a cosmetic gap for legacy data.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/catalog/utils/fiscalOrigins.test.ts
import { describe, expect, it } from "vitest";
import { FISCAL_ORIGINS, getFiscalOriginLabel } from "./fiscalOrigins";

describe("FISCAL_ORIGINS", () => {
  it("has the 9 NF-e origin codes (0-8)", () => {
    expect(FISCAL_ORIGINS).toHaveLength(9);
    expect(FISCAL_ORIGINS.map((o) => o.code)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8"]);
  });
});

describe("getFiscalOriginLabel", () => {
  it("resolves a known code to its label", () => {
    expect(getFiscalOriginLabel("0")).toBe("0 — Nacional");
  });

  it("falls back to the raw value for unknown/legacy codes", () => {
    expect(getFiscalOriginLabel("Nacional")).toBe("Nacional");
  });

  it("returns a dash for undefined", () => {
    expect(getFiscalOriginLabel(undefined)).toBe("—");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run src/features/catalog/utils/fiscalOrigins.test.ts`
Expected: FAIL — `Cannot find module './fiscalOrigins'`

- [ ] **Step 3: Implement**

```ts
// src/features/catalog/utils/fiscalOrigins.ts
export interface IFiscalOrigin {
  code: string;
  label: string;
}

/** Origin codes from the NF-e "Origem da Mercadoria" table (Convênio ICMS 38/2013). */
export const FISCAL_ORIGINS: IFiscalOrigin[] = [
  { code: "0", label: "0 — Nacional" },
  { code: "1", label: "1 — Estrangeira, importação direta" },
  { code: "2", label: "2 — Estrangeira, adquirida no mercado interno" },
  { code: "3", label: "3 — Nacional, conteúdo importado > 40%" },
  { code: "4", label: "4 — Nacional, produção conforme processos produtivos básicos" },
  { code: "5", label: "5 — Nacional, conteúdo importado ≤ 40%" },
  { code: "6", label: "6 — Estrangeira, importação direta, sem similar nacional" },
  { code: "7", label: "7 — Estrangeira, mercado interno, sem similar nacional" },
  { code: "8", label: "8 — Nacional, conteúdo importado > 70%" },
];

export function getFiscalOriginLabel(code: string | undefined): string {
  if (!code) return "—";
  return FISCAL_ORIGINS.find((o) => o.code === code)?.label ?? code;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run src/features/catalog/utils/fiscalOrigins.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/utils/fiscalOrigins.ts src/features/catalog/utils/fiscalOrigins.test.ts
git commit -m "feat(catalog): add NF-e fiscal origin list"
```

---

### Task 5: `PartCrossReferenceEditor` (new)

**Files:**
- Create: `src/features/catalog/components/form/PartCrossReferenceEditor.tsx`
- Modify: `src/features/catalog/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `IPartCrossReference` (`@/shared/types`).
- Produces: `PartCrossReferenceEditor({ value, onChange }: { value: IPartCrossReference[]; onChange: (next: IPartCrossReference[]) => void })` — consumed by Task 14.

No automated test for this file (trivial array add/remove handlers, same as the untested handlers in the existing `ApplicationsEditor`/`EquivalentsEditor`) — `bunx tsc --noEmit` is this task's check.

- [ ] **Step 1: Add strings**

In `src/features/catalog/i18n/pt-BR.ts`, inside `form.fields` (after `equivalentsHint`):

```ts
      crossReferencesHint: "Códigos de concorrentes (ex.: Mann, Fleetguard) — texto livre",
```

And a new top-level entry under `form` (after `addEquivalent`):

```ts
    addCrossReference: "+ Adicionar referência",
```

- [ ] **Step 2: Implement the component**

```tsx
// src/features/catalog/components/form/PartCrossReferenceEditor.tsx
import { useState } from "react";
import type { IPartCrossReference } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

export interface IPartCrossReferenceEditorProps {
  value: IPartCrossReference[];
  onChange: (next: IPartCrossReference[]) => void;
}

export function PartCrossReferenceEditor({ value, onChange }: IPartCrossReferenceEditorProps) {
  const [draftBrand, setDraftBrand] = useState("");
  const [draftCode, setDraftCode] = useState("");

  const addRow = () => {
    if (!draftBrand.trim() || !draftCode.trim()) return;
    onChange([...value, { brand: draftBrand.trim(), code: draftCode.trim() }]);
    setDraftBrand("");
    setDraftCode("");
  };

  const removeRow = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {CATALOG_STRINGS.form.fields.crossReferencesHint}
      </p>

      <div className="space-y-2">
        {value.map((ref, index) => (
          <div
            key={`${ref.brand}-${ref.code}-${index}`}
            className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
          >
            <span className="flex-1 text-sm">
              <span className="font-medium">{ref.brand}</span>{" "}
              <span className="font-mono text-muted-foreground">{ref.code}</span>
            </span>
            <button
              type="button"
              onClick={() => removeRow(index)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label="Remover referência"
            >
              <Icon icon="mdi:close" size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div>
          <Label className="text-[10px] uppercase">Marca</Label>
          <Input value={draftBrand} onChange={(e) => setDraftBrand(e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Código</Label>
          <Input
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            className="h-8 font-mono"
          />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Icon icon="mdi:plus" size={14} />
            {CATALOG_STRINGS.form.addCrossReference}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartCrossReferenceEditor.tsx` (pre-existing baseline errors unrelated to this file are fine — see `docs/dev` baseline note in `CLAUDE.md`).

- [ ] **Step 4: Commit**

```bash
git add src/features/catalog/components/form/PartCrossReferenceEditor.tsx src/features/catalog/i18n/pt-BR.ts
git commit -m "feat(catalog): add cross-reference add/remove editor"
```

---

### Task 6: `PartSupplierEntryForm` (new)

**Files:**
- Create: `src/features/catalog/components/form/PartSupplierEntryForm.tsx`
- Modify: `src/features/catalog/i18n/pt-BR.ts`

**Interfaces:**
- Consumes: `INewSupplierEntryDraft` (Task 1).
- Produces: `PartSupplierEntryForm({ value, onChange }: { value: INewSupplierEntryDraft | null; onChange: (next: INewSupplierEntryDraft | null) => void })` — consumed by Task 11.

- [ ] **Step 1: Add strings**

In `src/features/catalog/i18n/pt-BR.ts`, inside `detail.suppliers` (after `empty`):

```ts
      addTitle: "Adicionar nova entrada",
      hint: "Preencha fornecedor, custo e quantidade para registrar uma nova compra",
    },
```

(Note: this closes the `suppliers` object — adjust the trailing comma/brace to match the existing object structure shown in the file.)

- [ ] **Step 2: Implement the component**

```tsx
// src/features/catalog/components/form/PartSupplierEntryForm.tsx
import type { INewSupplierEntryDraft } from "../../utils/draft";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.suppliers;

const EMPTY_ENTRY: INewSupplierEntryDraft = {
  name: "",
  supplierCode: "",
  invoiceNumber: "",
  invoiceDate: "",
  cost: undefined,
  quantity: undefined,
};

export interface IPartSupplierEntryFormProps {
  value: INewSupplierEntryDraft | null;
  onChange: (next: INewSupplierEntryDraft | null) => void;
}

export function PartSupplierEntryForm({ value, onChange }: IPartSupplierEntryFormProps) {
  const entry = value ?? EMPTY_ENTRY;

  const set = <K extends keyof INewSupplierEntryDraft>(key: K, v: INewSupplierEntryDraft[K]) => {
    onChange({ ...entry, [key]: v });
  };

  return (
    <div className="mt-3 rounded-md border border-dashed border-border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {COPY.addTitle}
      </p>
      <p className="mb-2 text-xs text-muted-foreground">{COPY.hint}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-[10px] uppercase">{COPY.name}</Label>
          <Input value={entry.name} onChange={(e) => set("name", e.target.value)} className="h-8" />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.code}</Label>
          <Input
            value={entry.supplierCode}
            onChange={(e) => set("supplierCode", e.target.value)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.invoice}</Label>
          <Input
            value={entry.invoiceNumber}
            onChange={(e) => set("invoiceNumber", e.target.value)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.date}</Label>
          <Input
            type="date"
            value={entry.invoiceDate}
            onChange={(e) => set("invoiceDate", e.target.value)}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.cost}</Label>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={entry.cost ?? ""}
            onChange={(e) => set("cost", e.target.value === "" ? undefined : Number(e.target.value))}
            className="h-8"
          />
        </div>
        <div>
          <Label className="text-[10px] uppercase">{COPY.qty}</Label>
          <Input
            type="number"
            inputMode="numeric"
            value={entry.quantity ?? ""}
            onChange={(e) => set("quantity", e.target.value === "" ? undefined : Number(e.target.value))}
            className="h-8"
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartSupplierEntryForm.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/features/catalog/components/form/PartSupplierEntryForm.tsx src/features/catalog/i18n/pt-BR.ts
git commit -m "feat(catalog): add single-row new-supplier-entry form"
```

---

### Task 7: `PartIdentityCard` gains editing mode

**Files:**
- Modify: `src/features/catalog/components/detail/PartIdentityCard.tsx`

**Interfaces:**
- Consumes: `IPartDraft`, `IPartDraftErrors` (Tasks 1–2); `PART_CATEGORY_DESCRIPTORS`, `getSubcategoriesFor` from `../../utils/categories` (existing).
- Produces: extended `IPartIdentityCardProps` — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`, `errors?: IPartDraftErrors` — consumed by Task 17 (layout composers) and Task 18.

No automated test (JSX-only) — `bunx tsc --noEmit` is the check.

- [ ] **Step 1: Replace the file**

```tsx
// src/features/catalog/components/detail/PartIdentityCard.tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel, getSubcategoriesFor, PART_CATEGORY_DESCRIPTORS } from "../../utils/categories";
import type { IPartDraft, IPartDraftErrors } from "../../utils/draft";
import { PartImage } from "../PartImage";
import { PartSefazBadge } from "./PartSefazBadge";

const COPY = CATALOG_STRINGS.detail.identity;
const FORM_COPY = CATALOG_STRINGS.form.fields;

export interface IPartIdentityCardProps {
  part: IPart;
  /** Compact omits the description and uses a smaller image (sheet header). */
  compact?: boolean;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
  errors?: IPartDraftErrors;
}

export function PartIdentityCard({
  part,
  compact = false,
  editing = false,
  draft,
  onDraftChange,
  errors,
}: IPartIdentityCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <PartIdentityEditor
        draft={draft}
        onChange={onDraftChange}
        errors={errors}
        gtin={part.gtin}
        sefazStatus={part.sefazStatus}
        sefazCheckedAt={part.sefazCheckedAt}
        category={part.category}
      />
    );
  }

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
            {part.segment && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {part.segment}
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

interface IPartIdentityEditorProps {
  draft: IPartDraft;
  onChange: (patch: Partial<IPartDraft>) => void;
  errors?: IPartDraftErrors;
  gtin: string | undefined;
  sefazStatus: IPart["sefazStatus"];
  sefazCheckedAt: string | undefined;
  category: IPart["category"];
}

function PartIdentityEditor({ draft, onChange, errors, sefazStatus, sefazCheckedAt }: IPartIdentityEditorProps) {
  const subOptions = getSubcategoriesFor(draft.category);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <EditField label={FORM_COPY.name} required error={errors?.name}>
          <Input value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
        </EditField>
        <EditField label={FORM_COPY.oemPrimary} required error={errors?.oemPrimary}>
          <Input
            value={draft.oemPrimary}
            onChange={(e) => onChange({ oemPrimary: e.target.value })}
            className="font-mono"
          />
        </EditField>
        <EditField label={FORM_COPY.oemAlternatives} hint="Separados por vírgula">
          <Input
            value={draft.oemAlternatives}
            onChange={(e) => onChange({ oemAlternatives: e.target.value })}
            className="font-mono"
          />
        </EditField>
        <EditField label={FORM_COPY.manufacturer} required error={errors?.brand}>
          <Input value={draft.brand} onChange={(e) => onChange({ brand: e.target.value })} />
        </EditField>
        <EditField label={FORM_COPY.supplier}>
          <Input value={draft.supplier} onChange={(e) => onChange({ supplier: e.target.value })} />
        </EditField>
        <EditField label={FORM_COPY.isOriginal}>
          <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
            <Switch
              checked={draft.isOriginal}
              onCheckedChange={(v) => onChange({ isOriginal: v })}
              id="edit-is-original"
            />
            <Label htmlFor="edit-is-original" className="cursor-pointer text-xs">
              {draft.isOriginal ? "Peça original" : "Peça equivalente"}
            </Label>
          </div>
        </EditField>
        <EditField label={FORM_COPY.category} required error={errors?.category}>
          <Select
            value={draft.category ?? ""}
            onValueChange={(v) => onChange({ category: v === "" ? undefined : (v as IPartDraft["category"]) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione…" />
            </SelectTrigger>
            <SelectContent>
              {PART_CATEGORY_DESCRIPTORS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </EditField>
        <EditField label={FORM_COPY.subcategory}>
          <Select
            value={draft.subcategory ?? ""}
            onValueChange={(v) => onChange({ subcategory: v === "" ? undefined : v })}
            disabled={subOptions.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={subOptions.length === 0 ? "—" : "Selecione…"} />
            </SelectTrigger>
            <SelectContent>
              {subOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </EditField>
        <EditField label={COPY.gtinLabel}>
          <Input
            value={draft.gtin}
            onChange={(e) => onChange({ gtin: e.target.value })}
            className="font-mono"
          />
        </EditField>
        <EditField label={COPY.reference}>
          <Input value={draft.reference} onChange={(e) => onChange({ reference: e.target.value })} className="font-mono" />
        </EditField>
        <EditField label={COPY.group}>
          <Input value={draft.group} onChange={(e) => onChange({ group: e.target.value })} />
        </EditField>
        <EditField label={COPY.type}>
          <Input value={draft.partType} onChange={(e) => onChange({ partType: e.target.value })} />
        </EditField>
        <div className="md:col-span-2">
          <EditField label={FORM_COPY.description}>
            <Textarea
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
              rows={2}
            />
          </EditField>
        </div>
      </div>

      {draft.gtin && (
        <div className="mt-3">
          <PartSefazBadge status={sefazStatus} checkedAt={sefazCheckedAt} />
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-[10px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
```

**Note:** `sefazStatus`/`sefazCheckedAt` stay read-only in edit mode (the SEFAZ consult is a Fase 2 placeholder, not user-editable) — they render from `part`, passed through as plain values, not from the draft.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartIdentityCard.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/detail/PartIdentityCard.tsx
git commit -m "feat(catalog): add inline editing mode to PartIdentityCard"
```

---

### Task 8: `PartPricingTable` gains editing mode

**Files:**
- Modify: `src/features/catalog/components/detail/PartPricingTable.tsx`

**Interfaces:**
- Consumes: `updateTableMarkup`/`updateTablePrice` (Task 3); `IPartDraft`, `IPartDraftErrors` (Tasks 1–2).
- Produces: extended `IPartPricingTableProps` — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`, `priceLocked?: boolean`, `errors?: IPartDraftErrors`.

- [ ] **Step 1: Replace the file**

```tsx
// src/features/catalog/components/detail/PartPricingTable.tsx
import type { IPart, IPriceTable } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import {
  marginHealth,
  marginOnPrice,
  resolvePriceTables,
  tableMargin,
  updateTableMarkup,
  updateTablePrice,
} from "../../utils/pricing";
import type { IPartDraft, IPartDraftErrors } from "../../utils/draft";
import { PartPriceHistory } from "./PartPriceHistory";

const COPY = CATALOG_STRINGS.detail.pricing;

const HEALTH_TEXT: Record<ReturnType<typeof marginHealth>, string> = {
  success: "text-severity-success",
  warning: "text-severity-warning",
  critical: "text-severity-critical",
};

export interface IPartPricingTableProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
  priceLocked?: boolean;
  errors?: IPartDraftErrors;
}

export function PartPricingTable({
  part,
  editing = false,
  draft,
  onDraftChange,
  priceLocked = false,
  errors,
}: IPartPricingTableProps) {
  const tables = editing && draft ? draft.priceTables : resolvePriceTables(part);
  const baseCost = editing && draft ? draft.unitCost : part.unitCost;

  if (tables.length === 0) {
    return (
      <Card>
        <Header />
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      </Card>
    );
  }

  const maxMarkup = Math.max(...tables.map((t) => t.markupPercent));
  const disabled = editing && priceLocked;

  const updateRow = (index: number, updated: IPriceTable) => {
    if (!draft || !onDraftChange) return;
    const next = draft.priceTables.slice();
    next[index] = updated;
    onDraftChange({ priceTables: next });
  };

  return (
    <Card>
      <Header />
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {COPY.baseCost}:{" "}
          {editing ? (
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={draft?.unitCost || ""}
              disabled={disabled}
              onChange={(e) => onDraftChange?.({ unitCost: Number(e.target.value) || 0 })}
              className="mt-1 h-7 w-28 font-mono"
            />
          ) : (
            <span className="font-mono font-medium text-foreground">{formatBRL(baseCost)}</span>
          )}
        </span>
      </div>
      {errors?.standardPrice && <p className="mb-2 text-xs text-destructive">{errors.standardPrice}</p>}

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
            {tables.map((table, index) => {
              const isPadrao = table.id === "padrao";
              const intensity = maxMarkup > 0 ? table.markupPercent / maxMarkup : 0;
              const marginShare = marginOnPrice(table.price, baseCost);
              return (
                <tr
                  key={table.id}
                  className={cn("border-b border-border last:border-b-0", isPadrao && "bg-primary/5")}
                >
                  <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {isPadrao && <Icon icon="mdi:star" size={12} className="text-primary" />}
                      {table.label}
                    </span>
                  </th>
                  <td className="px-3 py-2">
                    {editing ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        disabled={disabled}
                        value={Math.round(table.markupPercent * 1000) / 10}
                        onChange={(e) =>
                          updateRow(index, updateTableMarkup(table, Number(e.target.value) / 100 || 0, baseCost))
                        }
                        className="h-8 w-24"
                      />
                    ) : (
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
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">
                    {editing ? (
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        disabled={disabled}
                        value={table.price || ""}
                        onChange={(e) => updateRow(index, updateTablePrice(table, Number(e.target.value) || 0, baseCost))}
                        className="h-8 w-28 text-right"
                      />
                    ) : (
                      formatBRL(table.price)
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={cn("block font-semibold tabular-nums", HEALTH_TEXT[marginHealth(marginShare)])}
                    >
                      {formatPercent(marginShare)}
                    </span>
                    <span className="block text-[11px] tabular-nums text-muted-foreground">
                      {formatBRL(tableMargin(baseCost, table.price))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!editing && (
        <div className="mt-3">
          <PartPriceHistory part={part} />
        </div>
      )}
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

**Note on the markup input:** `markupPercent` is stored as a decimal (`0.8` = 80%); the input shows/accepts a whole percent (`80`) for a usable UX, converting `/100` on change and `*100` on display — same convention `formatPercent` already uses for read mode.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartPricingTable.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/detail/PartPricingTable.tsx
git commit -m "feat(catalog): add inline editing mode to PartPricingTable"
```

---

### Task 9: `PartFiscalCard` gains editing mode

**Files:**
- Modify: `src/features/catalog/components/detail/PartFiscalCard.tsx`

**Interfaces:**
- Consumes: `FISCAL_ORIGINS` (Task 4); `IPartDraft` (Task 1).
- Produces: extended `IPartFiscalCardProps` — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`.

- [ ] **Step 1: Replace the file**

```tsx
// src/features/catalog/components/detail/PartFiscalCard.tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { FISCAL_ORIGINS } from "../../utils/fiscalOrigins";
import type { IPartDraft } from "../../utils/draft";

const COPY = CATALOG_STRINGS.detail.fiscal;

export interface IPartFiscalCardProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function PartFiscalCard({ part, editing = false, draft, onDraftChange }: IPartFiscalCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <CardHeader />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <EditField label={COPY.ncm}>
            <Input
              value={draft.fiscal.ncm}
              onChange={(e) => onDraftChange({ fiscal: { ...draft.fiscal, ncm: e.target.value } })}
              className="font-mono"
            />
          </EditField>
          <EditField label={COPY.icms}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={draft.fiscal.icmsPercent ?? ""}
              onChange={(e) =>
                onDraftChange({
                  fiscal: {
                    ...draft.fiscal,
                    icmsPercent: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
          </EditField>
          <EditField label={COPY.origin}>
            <Select
              value={draft.fiscal.origin}
              onValueChange={(v) => onDraftChange({ fiscal: { ...draft.fiscal, origin: v } })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {FISCAL_ORIGINS.map((o) => (
                  <SelectItem key={o.code} value={o.code}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </EditField>
          <EditField label={COPY.st}>
            <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
              <Switch
                checked={draft.fiscal.taxSubstitution}
                onCheckedChange={(v) => onDraftChange({ fiscal: { ...draft.fiscal, taxSubstitution: v } })}
                id="edit-tax-substitution"
              />
              <Label htmlFor="edit-tax-substitution" className="cursor-pointer text-xs">
                {draft.fiscal.taxSubstitution ? COPY.yes : COPY.no}
              </Label>
            </div>
          </EditField>
        </div>
      </div>
    );
  }

  const f = part.fiscal;
  const hasData = f && (f.ncm || f.icmsPercent != null || f.taxSubstitution != null || f.origin);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <CardHeader />
      {hasData ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Field label={COPY.ncm} value={f?.ncm} mono />
          <Field label={COPY.icms} value={f?.icmsPercent != null ? `${f.icmsPercent}%` : undefined} />
          <Field
            label={COPY.st}
            value={f?.taxSubstitution != null ? (f.taxSubstitution ? COPY.yes : COPY.no) : undefined}
          />
          <Field label={COPY.origin} value={f?.origin} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </div>
  );
}

function CardHeader() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon icon="mdi:file-percent-outline" size={18} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
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

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartFiscalCard.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/detail/PartFiscalCard.tsx
git commit -m "feat(catalog): add inline editing mode to PartFiscalCard"
```

---

### Task 10: `PartLogisticsCard` gains editing mode (+ stock fields)

**Files:**
- Modify: `src/features/catalog/components/detail/PartLogisticsCard.tsx`

**Interfaces:**
- Consumes: `IPartDraft` (Task 1); `StockBadge` (existing, takes `Pick<IPart, "stockAvailable" | "stockMinimum">`).
- Produces: extended `IPartLogisticsCardProps` — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`.

**Note:** `stockAvailable`/`stockMinimum` live in this card in edit mode — there is no dedicated "Estoque" card in the current ficha (stock is otherwise only a read-only KPI in `PartStatStrip`), and this card already shows `StockBadge` for the same numbers, so it's the natural home.

- [ ] **Step 1: Replace the file**

```tsx
// src/features/catalog/components/detail/PartLogisticsCard.tsx
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import type { IPartDraft } from "../../utils/draft";
import { StockBadge } from "../StockBadge";

const COPY = CATALOG_STRINGS.detail.logistics;
const STOCK_COPY = CATALOG_STRINGS.detail.stock;

export interface IPartLogisticsCardProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function PartLogisticsCard({ part, editing = false, draft, onDraftChange }: IPartLogisticsCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <CardHeader />
          <StockBadge part={{ stockAvailable: draft.stockAvailable, stockMinimum: draft.stockMinimum }} />
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <EditField label={COPY.weight}>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={draft.weightKg ?? ""}
              onChange={(e) =>
                onDraftChange({ weightKg: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </EditField>
          <EditField label={COPY.location}>
            <Input
              value={draft.storageLocation}
              onChange={(e) => onDraftChange({ storageLocation: e.target.value })}
              className="font-mono"
            />
          </EditField>
          <EditField label={COPY.boxQty}>
            <Input
              type="number"
              inputMode="numeric"
              value={draft.boxQuantity ?? ""}
              onChange={(e) =>
                onDraftChange({ boxQuantity: e.target.value === "" ? undefined : Number(e.target.value) })
              }
            />
          </EditField>
          <EditField label={COPY.unit}>
            <Input value={draft.unitOfMeasure} onChange={(e) => onDraftChange({ unitOfMeasure: e.target.value })} />
          </EditField>
          <EditField label={COPY.fractionable}>
            <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3">
              <Switch
                checked={draft.fractionable}
                onCheckedChange={(v) => onDraftChange({ fractionable: v })}
                id="edit-fractionable"
              />
              <Label htmlFor="edit-fractionable" className="cursor-pointer text-xs">
                {draft.fractionable ? COPY.yes : COPY.no}
              </Label>
            </div>
          </EditField>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm">
          <EditField label={STOCK_COPY.current}>
            <Input
              type="number"
              inputMode="numeric"
              value={draft.stockAvailable}
              onChange={(e) => onDraftChange({ stockAvailable: Math.max(0, Number(e.target.value) || 0) })}
            />
          </EditField>
          <EditField label={STOCK_COPY.minimum}>
            <Input
              type="number"
              inputMode="numeric"
              value={draft.stockMinimum}
              onChange={(e) => onDraftChange({ stockMinimum: Math.max(0, Number(e.target.value) || 0) })}
            />
          </EditField>
        </div>
      </div>
    );
  }

  const hasData =
    part.weightKg != null ||
    part.storageLocation ||
    part.boxQuantity != null ||
    part.fractionable != null ||
    part.unitOfMeasure;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <CardHeader />
        <StockBadge part={part} />
      </div>
      {hasData ? (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <Field
            label={COPY.weight}
            value={part.weightKg != null ? `${part.weightKg.toLocaleString("pt-BR")} kg` : undefined}
          />
          <Field label={COPY.location} value={part.storageLocation} mono />
          <Field label={COPY.boxQty} value={part.boxQuantity != null ? String(part.boxQuantity) : undefined} />
          <Field
            label={COPY.fractionable}
            value={part.fractionable != null ? (part.fractionable ? COPY.yes : COPY.no) : undefined}
          />
          <Field label={COPY.unit} value={part.unitOfMeasure} />
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </div>
  );
}

function CardHeader() {
  return (
    <div className="flex items-center gap-2">
      <Icon icon="mdi:package-variant-closed" size={18} className="text-muted-foreground" />
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{COPY.title}</h2>
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

function EditField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartLogisticsCard.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/detail/PartLogisticsCard.tsx
git commit -m "feat(catalog): add inline editing mode to PartLogisticsCard, with stock fields"
```

---

### Task 11: `PartSuppliersTable` wires in the new-entry form

**Files:**
- Modify: `src/features/catalog/components/detail/PartSuppliersTable.tsx`

**Interfaces:**
- Consumes: `PartSupplierEntryForm` (Task 6); `IPartDraft` (Task 1).
- Produces: extended `IPartSuppliersTableProps` — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`.

- [ ] **Step 1: Modify the file**

In `src/features/catalog/components/detail/PartSuppliersTable.tsx`, add the import (after the existing `CATALOG_STRINGS` import) and extend the props + body:

```tsx
import { PartSupplierEntryForm } from "../form/PartSupplierEntryForm";
import type { IPartDraft } from "../../utils/draft";
```

Replace the props interface and function signature:

```tsx
export interface IPartSuppliersTableProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function PartSuppliersTable({ part, editing = false, draft, onDraftChange }: IPartSuppliersTableProps) {
```

Immediately before the closing `</div>` of the outer card (after the `{suppliers.length === 0 ? ... : (...)}` block, still inside the outer `<div className="rounded-lg border ...">`), add:

```tsx
      {editing && draft && onDraftChange && (
        <PartSupplierEntryForm
          value={draft.newSupplierEntry}
          onChange={(next) => onDraftChange({ newSupplierEntry: next })}
        />
      )}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartSuppliersTable.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/detail/PartSuppliersTable.tsx
git commit -m "feat(catalog): wire new-supplier-entry form into PartSuppliersTable"
```

---

### Task 12: Applications card/section swap to `ApplicationsEditor` when editing

**Files:**
- Modify: `src/features/catalog/components/detail/PartApplicationsCard.tsx`
- Modify: `src/features/catalog/components/detail/ApplicationsSection.tsx`

**Interfaces:**
- Consumes: `ApplicationsEditor`, `IApplicationDraft` (existing, `../form/ApplicationsEditor`); `IPartDraft` (Task 1).
- Produces: extended props on both — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`.

- [ ] **Step 1: Modify `PartApplicationsCard.tsx`**

Add imports at the top (after the `CATALOG_STRINGS` import):

```tsx
import { ApplicationsEditor } from "../form/ApplicationsEditor";
import type { IPartDraft } from "../../utils/draft";
```

Replace the props interface and the start of the function body:

```tsx
export interface IPartApplicationsCardProps {
  part: IPart;
  onViewAll: () => void;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function PartApplicationsCard({
  part,
  onViewAll,
  editing = false,
  draft,
  onDraftChange,
}: IPartApplicationsCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Icon icon="mdi:truck-outline" size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {CATALOG_STRINGS.detail.sections.applications}
          </h2>
        </div>
        <ApplicationsEditor
          applications={draft.applications}
          onChange={(next) => onDraftChange({ applications: next })}
        />
      </div>
    );
  }

  const apps = part.applications;
  if (apps.length === 0) return null;
```

(Everything after that `if (apps.length === 0) return null;` line stays exactly as it is today — no further changes to the read-mode JSX.)

- [ ] **Step 2: Modify `ApplicationsSection.tsx`**

Add imports (after the existing `cn` import):

```tsx
import { ApplicationsEditor } from "../form/ApplicationsEditor";
import type { IPartDraft } from "../../utils/draft";
```

Replace the props interface and the start of the function body:

```tsx
export interface IApplicationsSectionProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function ApplicationsSection({ part, editing = false, draft, onDraftChange }: IApplicationsSectionProps) {
  if (editing && draft && onDraftChange) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.applications} icon="mdi:truck-outline">
        <ApplicationsEditor
          applications={draft.applications}
          onChange={(next) => onDraftChange({ applications: next })}
        />
      </Section>
    );
  }

  const [check, setCheck] = useState<{ brand: string; model: string; year: string }>({
```

(The rest of the function body — from `brand: "",` through the end — stays exactly as it is today.)

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing either file

- [ ] **Step 4: Commit**

```bash
git add src/features/catalog/components/detail/PartApplicationsCard.tsx src/features/catalog/components/detail/ApplicationsSection.tsx
git commit -m "feat(catalog): swap to ApplicationsEditor when editing the ficha inline"
```

---

### Task 13: Equivalents card/section swap to `EquivalentsEditor` when editing

**Files:**
- Modify: `src/features/catalog/components/detail/PartEquivalentsCard.tsx`
- Modify: `src/features/catalog/components/detail/EquivalentsSection.tsx`

**Interfaces:**
- Consumes: `EquivalentsEditor` (existing, `../form/EquivalentsEditor`); `IPartDraft` (Task 1).
- Produces: extended props on both — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`.

- [ ] **Step 1: Modify `PartEquivalentsCard.tsx`**

Add imports (after the `CATALOG_STRINGS` import):

```tsx
import { EquivalentsEditor } from "../form/EquivalentsEditor";
import type { IPartDraft } from "../../utils/draft";
```

Replace the props interface and the start of the function body:

```tsx
export interface IPartEquivalentsCardProps {
  part: IPart;
  onViewAll: () => void;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function PartEquivalentsCard({
  part,
  onViewAll,
  editing = false,
  draft,
  onDraftChange,
}: IPartEquivalentsCardProps) {
  if (editing && draft && onDraftChange) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Icon icon="mdi:swap-horizontal" size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            {CATALOG_STRINGS.detail.sections.equivalents}
          </h2>
        </div>
        <EquivalentsEditor
          selectedIds={draft.equivalentPartIds}
          excludeId={part.id}
          onChange={(ids) => onDraftChange({ equivalentPartIds: ids })}
        />
      </div>
    );
  }

  const refs = part.crossReferences ?? [];
```

(Everything after that stays as it is today.)

- [ ] **Step 2: Modify `EquivalentsSection.tsx`**

Add imports (after the `Skeleton` import):

```tsx
import { EquivalentsEditor } from "../form/EquivalentsEditor";
import type { IPartDraft } from "../../utils/draft";
```

Replace the props interface and the start of the function body:

```tsx
export interface IEquivalentsSectionProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

export function EquivalentsSection({ part, editing = false, draft, onDraftChange }: IEquivalentsSectionProps) {
  if (editing && draft && onDraftChange) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.equivalents} icon="mdi:swap-horizontal">
        <EquivalentsEditor
          selectedIds={draft.equivalentPartIds}
          excludeId={part.id}
          onChange={(ids) => onDraftChange({ equivalentPartIds: ids })}
        />
      </Section>
    );
  }

  const navigate = useNavigate();
```

(The rest of the function body stays as it is today.)

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing either file

- [ ] **Step 4: Commit**

```bash
git add src/features/catalog/components/detail/PartEquivalentsCard.tsx src/features/catalog/components/detail/EquivalentsSection.tsx
git commit -m "feat(catalog): swap to EquivalentsEditor when editing the ficha inline"
```

---

### Task 14: `PartCrossReferenceSection` swaps to `PartCrossReferenceEditor` when editing

**Files:**
- Modify: `src/features/catalog/components/detail/PartCrossReferenceSection.tsx`

**Interfaces:**
- Consumes: `PartCrossReferenceEditor` (Task 5); `IPartDraft` (Task 1).
- Produces: extended `IPartCrossReferenceSectionProps` — `editing?: boolean`, `draft?: IPartDraft`, `onDraftChange?: (patch: Partial<IPartDraft>) => void`.

- [ ] **Step 1: Replace the file**

```tsx
// src/features/catalog/components/detail/PartCrossReferenceSection.tsx
import type { IPart } from "@/shared/types";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import type { IPartDraft } from "../../utils/draft";
import { PartCrossReferenceEditor } from "../form/PartCrossReferenceEditor";
import { Section } from "./ApplicationsSection";

const COPY = CATALOG_STRINGS.detail.crossReferences;

export interface IPartCrossReferenceSectionProps {
  part: IPart;
  editing?: boolean;
  draft?: IPartDraft;
  onDraftChange?: (patch: Partial<IPartDraft>) => void;
}

/**
 * Competitor brand cross-references (aftermarket equivalents) — a compact grid
 * of brand → part number. Complements `EquivalentsSection`, which links other
 * GALLO catalog parts.
 */
export function PartCrossReferenceSection({
  part,
  editing = false,
  draft,
  onDraftChange,
}: IPartCrossReferenceSectionProps) {
  if (editing && draft && onDraftChange) {
    return (
      <Section title={CATALOG_STRINGS.detail.sections.crossReferences} icon="mdi:tag-multiple-outline">
        <PartCrossReferenceEditor
          value={draft.crossReferences}
          onChange={(next) => onDraftChange({ crossReferences: next })}
        />
      </Section>
    );
  }

  const refs = part.crossReferences ?? [];

  return (
    <Section title={CATALOG_STRINGS.detail.sections.crossReferences} icon="mdi:tag-multiple-outline">
      {refs.length > 0 ? (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {refs.map((ref) => (
            <div
              key={`${ref.brand}-${ref.code}`}
              className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
            >
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{ref.brand}</dt>
              <dd className="font-mono text-foreground">{ref.code}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{COPY.empty}</p>
      )}
    </Section>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartCrossReferenceSection.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/detail/PartCrossReferenceSection.tsx
git commit -m "feat(catalog): add inline editing mode to PartCrossReferenceSection"
```

---

### Task 15: `PartStatStrip` reads from the draft while editing

**Files:**
- Modify: `src/features/catalog/components/detail/PartStatStrip.tsx`

**Interfaces:**
- Consumes: `IPartDraft` (Task 1).
- Produces: extended `IPartStatStripProps` — `draft?: IPartDraft`.

- [ ] **Step 1: Modify the file**

Add the import (after the `pricing` import):

```tsx
import type { IPartDraft } from "../../utils/draft";
```

Replace the props interface and the start of the function body:

```tsx
export interface IPartStatStripProps {
  part: IPart;
  draft?: IPartDraft;
}

/** Full-width KPI strip with display-size values (design kit `CatKpiStrip`). */
export function PartStatStrip({ part, draft }: IPartStatStripProps) {
  const tables = draft ? draft.priceTables : resolvePriceTables(part);
  const padrao = tables.find((t) => t.id === "padrao");
  const standardPrice = padrao?.price ?? part.unitPrice;
  const referenceCost = draft ? draft.unitCost : (part.averageCost ?? part.unitCost);
  const margin = marginOnPrice(standardPrice, referenceCost);
  const stockAvailable = draft ? draft.stockAvailable : part.stockAvailable;
  const stockMinimum = draft ? draft.stockMinimum : part.stockMinimum;
  const storageLocation = draft ? draft.storageLocation : part.storageLocation;
  const isZero = stockAvailable <= 0;
  const isLow = !isZero && stockAvailable <= stockMinimum;
```

Then, further down in the same function, replace every remaining `part.stockAvailable` with `stockAvailable`, every `part.stockMinimum` with `stockMinimum`, and every `part.storageLocation` with `storageLocation` (three cells reference these: the "Estoque" cell's `value`/`sub`, and the "Localização" cell's `value`/`sub`) — no other lines change.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartStatStrip.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/components/detail/PartStatStrip.tsx
git commit -m "feat(catalog): read PartStatStrip from the draft while editing"
```

---

### Task 16: `PartDetailHeader` gains editing-mode actions

**Files:**
- Modify: `src/features/catalog/components/detail/PartDetailHeader.tsx`
- Modify: `src/features/catalog/i18n/pt-BR.ts`

**Interfaces:**
- Produces: extended `IPartDetailHeaderProps` — `editing: boolean`, `saving: boolean`, `onSave: () => void`, `onCancel: () => void` (replacing the always-navigable `onEdit`'s meaning: `onEdit` still exists as the "enter edit mode" trigger).

- [ ] **Step 1: Add strings**

In `src/features/catalog/i18n/pt-BR.ts`, inside `detail.actions` (after `activate`):

```ts
      cancel: "Cancelar",
      save: "Salvar alterações",
      saving: "Salvando…",
```

- [ ] **Step 2: Replace the file**

```tsx
// src/features/catalog/components/detail/PartDetailHeader.tsx
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
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
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
  editing,
  saving,
  onSave,
  onCancel,
}: IPartDetailHeaderProps) {
  return (
    <div className="border-b border-border bg-card">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={editing}
            className="-ml-2 cursor-pointer text-xs"
          >
            <Icon icon="mdi:arrow-left" size={14} />
            {CATALOG_STRINGS.detail.backToList}
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <PartLayoutSwitcher value={layout} onChange={onLayoutChange} disabled={editing} />
            {editing ? (
              <>
                <Button variant="outline" size="sm" className="cursor-pointer" onClick={onCancel} disabled={saving}>
                  {CATALOG_STRINGS.detail.actions.cancel}
                </Button>
                <Button size="sm" className="cursor-pointer" onClick={onSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Icon icon="svg-spinners:ring-resize" size={14} />
                      {CATALOG_STRINGS.detail.actions.saving}
                    </>
                  ) : (
                    CATALOG_STRINGS.detail.actions.save
                  )}
                </Button>
              </>
            ) : (
              <>
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
                  <Button variant="outline" size="sm" className="cursor-pointer" onClick={onToggleActive}>
                    <Icon
                      icon={part.active ? "mdi:archive-outline" : "mdi:archive-arrow-up-outline"}
                      size={14}
                    />
                    {part.active
                      ? CATALOG_STRINGS.detail.actions.deactivate
                      : CATALOG_STRINGS.detail.actions.activate}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

`PartLayoutSwitcher` needs a `disabled` prop — add it there too (Step 3).

- [ ] **Step 3: Add `disabled` to `PartLayoutSwitcher`**

In `src/features/catalog/components/detail/PartLayoutSwitcher.tsx`, extend the props interface and the `ToggleGroup`:

```tsx
export interface IPartLayoutSwitcherProps {
  value: PartDetailLayout;
  onChange: (layout: PartDetailLayout) => void;
  disabled?: boolean;
}

export function PartLayoutSwitcher({ value, onChange, disabled = false }: IPartLayoutSwitcherProps) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(val) => {
        if (val) onChange(val as PartDetailLayout);
      }}
      variant="outline"
      size="sm"
      disabled={disabled}
      aria-label={COPY.ariaLabel}
    >
```

(rest of the file unchanged)

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartDetailHeader.tsx`/`PartLayoutSwitcher.tsx` (will still show errors from `PartDetailPage.tsx` not yet passing the new required props — that's expected until Task 18; note it and move on).

- [ ] **Step 5: Commit**

```bash
git add src/features/catalog/components/detail/PartDetailHeader.tsx src/features/catalog/components/detail/PartLayoutSwitcher.tsx src/features/catalog/i18n/pt-BR.ts
git commit -m "feat(catalog): add editing-mode actions to PartDetailHeader"
```

---

### Task 17: Layout composers thread `editing`/`draft`/`onDraftChange` through

**Files:**
- Modify: `src/features/catalog/components/detail/layouts/types.ts`
- Modify: `src/features/catalog/components/detail/layouts/PartLayoutCounter.tsx`
- Modify: `src/features/catalog/components/detail/layouts/PartLayoutPanel.tsx`
- Modify: `src/features/catalog/components/detail/layouts/PartLayoutSheet.tsx`

**Interfaces:**
- Consumes: `IPartDraft`, `IPartDraftErrors` (Tasks 1–2).
- Produces: extended `IPartLayoutProps` — `editing: boolean`, `draft: IPartDraft`, `onDraftChange: (patch: Partial<IPartDraft>) => void`, `priceLocked: boolean`, `errors: IPartDraftErrors` — consumed by Task 18.

- [ ] **Step 1: Extend the shared type**

```ts
// src/features/catalog/components/detail/layouts/types.ts
import type { IPart } from "@/shared/types";
import type { IPartDraft, IPartDraftErrors } from "../../../utils/draft";

/** Shared contract for the three layout composers — they only arrange cards. */
export interface IPartLayoutProps {
  part: IPart;
  editing: boolean;
  draft: IPartDraft;
  onDraftChange: (patch: Partial<IPartDraft>) => void;
  priceLocked: boolean;
  errors: IPartDraftErrors;
}
```

- [ ] **Step 2: Update `PartLayoutCounter.tsx`**

Replace the function signature and every card invocation:

```tsx
export function PartLayoutCounter({ part, editing, draft, onDraftChange, priceLocked, errors }: IPartLayoutProps) {
  const [tab, setTab] = useState("commercial");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <aside className="flex flex-col gap-6 lg:col-span-4 lg:sticky lg:top-6 lg:self-start">
        <PartIdentityCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} errors={errors} />
        {!editing && (
          <PartApplicationsCard part={part} onViewAll={() => setTab("applications")} />
        )}
        {!editing && (
          <PartEquivalentsCard part={part} onViewAll={() => setTab("equivalents")} />
        )}
      </aside>

      <div className="lg:col-span-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
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
            <PartPricingTable
              part={part}
              editing={editing}
              draft={draft}
              onDraftChange={onDraftChange}
              priceLocked={priceLocked}
              errors={errors}
            />
          </TabsContent>
          <TabsContent value="fiscal" className="mt-4 space-y-6">
            <PartFiscalCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
            <PartLogisticsCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
          </TabsContent>
          <TabsContent value="suppliers" className="mt-4">
            <PartSuppliersTable part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
          </TabsContent>
          <TabsContent value="applications" className="mt-4 rounded-lg border border-border bg-card">
            <ApplicationsSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
          </TabsContent>
          <TabsContent value="equivalents" className="mt-4 rounded-lg border border-border bg-card">
            <PartCrossReferenceSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
            <EquivalentsSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
```

**Note:** the compact `PartApplicationsCard`/`PartEquivalentsCard` (fixed-position summaries, no edit mode of their own — they only jump to a tab) are hidden while `editing`, since their full editors already live in the "Aplicações"/"Equivalências" tabs; showing both would duplicate the same data in two places on screen.

- [ ] **Step 3: Update `PartLayoutPanel.tsx`**

```tsx
export function PartLayoutPanel({ part, editing, draft, onDraftChange, priceLocked, errors }: IPartLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
        <PartIdentityCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} errors={errors} />
      </div>
      <div className="md:col-span-2 lg:col-span-2 lg:row-span-2">
        <PartPricingTable
          part={part}
          editing={editing}
          draft={draft}
          onDraftChange={onDraftChange}
          priceLocked={priceLocked}
          errors={errors}
        />
      </div>

      <div className="lg:col-span-2">
        <PartLogisticsCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
      </div>
      <div className="lg:col-span-2">
        <PartFiscalCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
      </div>

      <div className="md:col-span-2 lg:col-span-4">
        <PartSuppliersTable part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card md:col-span-2 lg:col-span-4">
        <PartCrossReferenceSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card md:col-span-2 lg:col-span-2">
        <EquivalentsSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card md:col-span-2 lg:col-span-2">
        <ApplicationsSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Update `PartLayoutSheet.tsx`**

```tsx
export function PartLayoutSheet({ part, editing, draft, onDraftChange, priceLocked, errors }: IPartLayoutProps) {
  return (
    <div className="space-y-6">
      <PartIdentityCard
        part={part}
        compact
        editing={editing}
        draft={draft}
        onDraftChange={onDraftChange}
        errors={errors}
      />

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
          <PartPricingTable
            part={part}
            editing={editing}
            draft={draft}
            onDraftChange={onDraftChange}
            priceLocked={priceLocked}
            errors={errors}
          />
        </TabsContent>
        <TabsContent value="fiscal" className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PartFiscalCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
          <PartLogisticsCard part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <PartSuppliersTable part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
        </TabsContent>
        <TabsContent value="applications" className="mt-4 rounded-lg border border-border bg-card">
          <ApplicationsSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
        </TabsContent>
        <TabsContent value="equivalents" className="mt-4 rounded-lg border border-border bg-card">
          <PartCrossReferenceSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
          <EquivalentsSection part={part} editing={editing} draft={draft} onDraftChange={onDraftChange} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 5: Type-check**

Run: `bunx tsc --noEmit`
Expected: errors will remain only in `PartDetailPage.tsx` (doesn't pass the new required props yet — resolved in Task 18). No errors in the 3 layout files or the `types.ts` file themselves.

- [ ] **Step 6: Commit**

```bash
git add src/features/catalog/components/detail/layouts/
git commit -m "feat(catalog): thread editing state through the 3 detail layouts"
```

---

### Task 18: `PartDetailPage` orchestration

**Files:**
- Modify: `src/features/catalog/pages/PartDetailPage.tsx`

**Interfaces:**
- Consumes: `toPartDraft`, `buildPartPatch`, `validatePartDraft` (Tasks 1–2); `IPartLayoutProps`-shaped props (Task 17); `PartDetailHeader` with `editing`/`saving`/`onSave`/`onCancel` (Task 16).

- [ ] **Step 1: Replace the file**

```tsx
// src/features/catalog/pages/PartDetailPage.tsx
import { useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ID } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import { PartDetailHeader } from "../components/detail/PartDetailHeader";
import { PartStatStrip } from "../components/detail/PartStatStrip";
import { PartStockAlert } from "../components/detail/PartStockAlert";
import { PartLayoutCounter } from "../components/detail/layouts/PartLayoutCounter";
import { PartLayoutPanel } from "../components/detail/layouts/PartLayoutPanel";
import { PartLayoutSheet } from "../components/detail/layouts/PartLayoutSheet";
import { useEquivalentsBidirectional } from "../hooks/useEquivalentsBidirectional";
import { usePart } from "../hooks/useCatalogList";
import { usePartDetailLayout } from "../hooks/usePartDetailLayout";
import { CATALOG_STRINGS } from "../i18n/pt-BR";
import { buildPartPatch, toPartDraft, validatePartDraft, type IPartDraft, type IPartDraftErrors } from "../utils/draft";

export function PartDetailPage() {
  const { id } = useParams({ from: "/app/catalogo/$id" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = useCurrentRole();
  const canEdit = usePermission("part", "edit");
  const canToggle = role === "Owner";
  const priceLocked = role !== "Owner";
  const partsProvider = usePartsProvider();
  const bidirectional = useEquivalentsBidirectional();

  const partQuery = usePart(id);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [layout, setLayout] = usePartDetailLayout();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IPartDraft | null>(null);
  const [errors, setErrors] = useState<IPartDraftErrors>({});
  const [saving, setSaving] = useState(false);

  if (partQuery.isLoading) {
    return <DetailSkeleton />;
  }

  if (partQuery.isError || !partQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <Icon icon="mdi:alert-circle-outline" size={28} className="text-destructive" />
        <p className="text-sm font-semibold">Peça não encontrada</p>
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: "/app/catalogo" })}>
          {CATALOG_STRINGS.detail.backToList}
        </Button>
      </div>
    );
  }

  const part = partQuery.data;

  const handleBack = () => void navigate({ to: "/app/catalogo" });
  const handleDuplicate = () => void navigate({ to: "/app/catalogo/novo", search: { from: part.id } });

  const handleStartEdit = () => {
    setDraft(toPartDraft(part));
    setErrors({});
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(null);
    setErrors({});
    setEditing(false);
  };

  const handleDraftChange = (patch: Partial<IPartDraft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const handleSave = async () => {
    if (!draft) return;
    const validation = validatePartDraft(draft);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    const oemCodes = draft.oemPrimary.trim() ? [draft.oemPrimary.trim()] : [];
    const dup = oemCodes[0] ? await partsProvider.findByOem(oemCodes[0]) : [];
    if (dup.some((p) => p.id !== part.id)) {
      setErrors({ oemPrimary: CATALOG_STRINGS.form.duplicateOemError });
      return;
    }

    setSaving(true);
    try {
      const previousEquivalents = part.equivalentPartIds;
      const patch = buildPartPatch(part, draft, priceLocked);
      const priceChanged = !priceLocked && patch.unitPrice !== undefined && patch.unitPrice !== part.unitPrice;

      const updated = await partsProvider.update(part.id, patch);

      auditLog({
        action: "part_update",
        resource: "part",
        resourceId: part.id,
        before: { name: part.name, oemCodes: part.oemCodes, brand: part.brand },
        after: { name: updated.name, oemCodes: updated.oemCodes, brand: updated.brand },
      });

      if (priceChanged) {
        auditLog({
          action: "part_price_change",
          resource: "part",
          resourceId: part.id,
          before: { unitPrice: part.unitPrice },
          after: { unitPrice: updated.unitPrice },
        });
        toast.success(CATALOG_STRINGS.toasts.priceChanged);
      } else {
        toast.success(CATALOG_STRINGS.toasts.updated);
      }

      const nextIds: ID[] = draft.equivalentPartIds;
      await bidirectional.reconcile(part.id, previousEquivalents, nextIds);

      await queryClient.invalidateQueries({ queryKey: ["part", part.id] });
      await queryClient.invalidateQueries({ queryKey: ["catalog-list"] });

      setDraft(null);
      setEditing(false);
    } catch {
      toast.error(CATALOG_STRINGS.toasts.error);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmToggle = async () => {
    setConfirmToggleOpen(false);
    try {
      const next = !part.active;
      await partsProvider.update(part.id, { active: next });
      auditLog({
        action: next ? "part_activate" : "part_deactivate",
        resource: "part",
        resourceId: part.id,
        before: { active: part.active },
        after: { active: next },
      });
      await queryClient.invalidateQueries({ queryKey: ["part", part.id] });
      await queryClient.invalidateQueries({ queryKey: ["catalog-list"] });
      toast.success(next ? CATALOG_STRINGS.toasts.activated : CATALOG_STRINGS.toasts.deactivated);
    } catch {
      toast.error(CATALOG_STRINGS.toasts.error);
    }
  };

  const layoutProps = {
    part,
    editing,
    draft: draft ?? toPartDraft(part),
    onDraftChange: handleDraftChange,
    priceLocked,
    errors,
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-background">
      <PartDetailHeader
        part={part}
        canEdit={canEdit}
        canToggle={canToggle}
        layout={layout}
        onLayoutChange={setLayout}
        onBack={handleBack}
        onEdit={handleStartEdit}
        onDuplicate={handleDuplicate}
        onToggleActive={() => setConfirmToggleOpen(true)}
        editing={editing}
        saving={saving}
        onSave={() => void handleSave()}
        onCancel={handleCancelEdit}
      />

      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        <PartStatStrip part={part} draft={editing ? draft ?? undefined : undefined} />
        <PartStockAlert part={part} />
        {layout === "counter" && <PartLayoutCounter {...layoutProps} />}
        {layout === "panel" && <PartLayoutPanel {...layoutProps} />}
        {layout === "sheet" && <PartLayoutSheet {...layoutProps} />}
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
              {part.active ? CATALOG_STRINGS.detail.actions.deactivate : CATALOG_STRINGS.detail.actions.activate}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex h-[calc(100vh-4rem)] items-center justify-center text-muted-foreground">
      <Icon icon="svg-spinners:ring-resize" size={28} />
    </div>
  );
}
```

**Note on `layoutProps.draft`:** the 3 layout composers require a non-null `IPartDraft` (Task 17's `IPartLayoutProps`) even when `editing` is `false`, so each card can keep a single, always-defined `draft` prop type instead of `IPartDraft | undefined` everywhere. When not editing, `toPartDraft(part)` is recomputed on every render as a throwaway value — cards ignore it because they branch on `editing` first, so this costs a cheap object build, not a behavioral risk.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no new errors referencing `PartDetailPage.tsx` — and none left in any of the Task 7–17 files either (this task supplies the props they were missing).

- [ ] **Step 3: Commit**

```bash
git add src/features/catalog/pages/PartDetailPage.tsx
git commit -m "feat(catalog): orchestrate inline editing on PartDetailPage"
```

---

### Task 19: Remove the separate edit page and route

**Files:**
- Delete: `src/features/catalog/pages/PartEditPage.tsx`
- Delete: `src/routes/app.catalogo.$id.editar.tsx`

**Interfaces:** none — this task only removes dead code now that Task 18 handles editing inline.

- [ ] **Step 1: Delete the files**

```bash
git rm src/features/catalog/pages/PartEditPage.tsx src/routes/app.catalogo.$id.editar.tsx
```

- [ ] **Step 2: Regenerate the route tree**

Run: `bun run dev` briefly (TanStack Router's Vite plugin regenerates `src/routeTree.gen.ts` on file changes), or run the project's route-generation step if there's a dedicated script — check `package.json` for a `"routes"`/`"generate"` script first; if none exists, starting `bun run dev` for a few seconds and stopping it is sufficient (the plugin runs on file-system events).

Confirm `src/routeTree.gen.ts` no longer references `/app/catalogo/$id/editar` or `PartEditPage`:

Run: `grep -c "editar" src/routeTree.gen.ts`
Expected: `0`

- [ ] **Step 3: Type-check the whole project**

Run: `bunx tsc --noEmit`
Expected: zero errors mentioning `PartEditPage`, the deleted route file, or any file touched in Tasks 1–18 (pre-existing baseline errors elsewhere are expected — see `docs/dev`/`CLAUDE.md` note on the tsc baseline).

- [ ] **Step 4: Commit**

```bash
git add src/routeTree.gen.ts
git commit -m "refactor(catalog): remove the separate part-edit page and route"
```

---

### Task 20: Full regression pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: every test passes, including the ~2119 pre-existing tests plus the new ones from Tasks 1, 2, 3, 4 (`draft.test.ts`, `pricing.test.ts`, `fiscalOrigins.test.ts`).

- [ ] **Step 2: Run the production build**

Run: `bun run build`
Expected: exit code 0. The pre-existing "chunks larger than 500kB" warning is expected and unrelated.

- [ ] **Step 3: Run ESLint on the touched files**

Run: `bunx eslint src/features/catalog/utils/draft.ts src/features/catalog/utils/draft.test.ts src/features/catalog/utils/fiscalOrigins.ts src/features/catalog/utils/fiscalOrigins.test.ts src/features/catalog/utils/pricing.ts src/features/catalog/utils/pricing.test.ts src/features/catalog/components/form/PartCrossReferenceEditor.tsx src/features/catalog/components/form/PartSupplierEntryForm.tsx src/features/catalog/components/detail/PartIdentityCard.tsx src/features/catalog/components/detail/PartPricingTable.tsx src/features/catalog/components/detail/PartFiscalCard.tsx src/features/catalog/components/detail/PartLogisticsCard.tsx src/features/catalog/components/detail/PartSuppliersTable.tsx src/features/catalog/components/detail/PartApplicationsCard.tsx src/features/catalog/components/detail/PartEquivalentsCard.tsx src/features/catalog/components/detail/ApplicationsSection.tsx src/features/catalog/components/detail/EquivalentsSection.tsx src/features/catalog/components/detail/PartCrossReferenceSection.tsx src/features/catalog/components/detail/PartStatStrip.tsx src/features/catalog/components/detail/PartDetailHeader.tsx src/features/catalog/components/detail/PartLayoutSwitcher.tsx src/features/catalog/components/detail/layouts/ src/features/catalog/pages/PartDetailPage.tsx src/features/catalog/i18n/pt-BR.ts`
Expected: zero errors (ignore any pre-existing `Delete ␍` CRLF findings unrelated to lines you changed — known Windows checkout artifact, see `CLAUDE.md`).

- [ ] **Step 4: Full `tsc` delta check**

Run: `bunx tsc --noEmit`
Then cross-reference against `git diff --name-status main...HEAD --diff-filter=AM` — confirm zero new errors on any file in that diff (pre-existing baseline errors on files you did NOT touch are expected and out of scope, per `CLAUDE.md`'s tsc-baseline note).

- [ ] **Step 5: Manual verification (by the user, not the agent)**

Do not use browser automation to self-validate this feature. Report the branch/commits to the user and let them exercise, at minimum: open a part with `stockAvailable <= stockMinimum` (to see `PartStockAlert` + the stat strip together with editing), click Editar, change a field in each of the 9 sections, add one supplier entry, add one cross-reference row, remove one equivalent, Salvar, confirm the ficha reflects every change and `PartPriceHistory`/`part_update` audit entries look right; then repeat and hit Cancelar to confirm nothing persists.

- [ ] **Step 6: No commit for this task** — it is a verification gate, not a code change. If any step above fails, return to the relevant task, fix, and re-run this task from Step 1.

---

## Self-Review

**Spec coverage:**
- §1 ciclo de vida → Task 18 (`editing`/`draft`/save/cancel), Task 16 (header buttons + disabled Voltar/switcher).
- §2 fluxo de props sem Context → Task 17 (`IPartLayoutProps` extended, explicit prop threading).
- §3 `IPartDraft` → Task 1.
- §4 mecânicas por seção → Identity (7), Pricing (8), Fiscal (9), Logistics+stock (10), Suppliers append-only (6, 11), Applications reuse (12), Equivalents reuse (13), Cross-reference new editor (5, 14).
- §5 patch/persistência + `unitPrice`/`marginPercent` mirror → Task 2.
- §6 validação → Task 2 (`validatePartDraft`), Task 18 (calls it, shows `errors`).
- §7 auditoria/reconciliação → Task 18 (same `part_update`/`part_price_change`/`useEquivalentsBidirectional` calls as the old `PartEditPage`).
- §8 remoção da rota → Task 19.
- Testes (spec's testing section, corrected for the real repo convention: no `@testing-library/react`) → Tasks 1–4 unit tests; Tasks 7–18 type-check only; Task 20 full regression.

**Placeholder scan:** no TBD/TODO; every code step has complete, real code; every "Note" is a disclosed, intentional simplification (SEFAZ stays read-only, legacy `origin` cosmetic gap, `layoutProps.draft` always-defined convenience, hidden compact cards while editing) rather than a deferred decision.

**Type consistency:** `IPartDraft`/`INewSupplierEntryDraft`/`IPartDraftErrors` (Task 1–2) are the exact names imported in every later task. `onDraftChange: (patch: Partial<IPartDraft>) => void` is the one signature used everywhere — no card introduces a different callback shape. `buildPartPatch(part, draft, priceLocked)` argument order matches its single call site in Task 18. `IPartLayoutProps` (Task 17) matches exactly what `PartDetailPage` passes via `layoutProps` (Task 18) and what each of the 3 layout files destructures.

**Scope check:** single cohesive feature (one shared `IPartDraft`/`editing` state, one page), not actually decomposable into independent subsystems — kept as one plan rather than split into several, per the reasoning above.
