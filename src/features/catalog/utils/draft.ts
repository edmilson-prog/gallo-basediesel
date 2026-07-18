import type { ID, IPart, IPartCrossReference, IPartSupplier, PartCategory } from "@/shared/types";
import { applicationsToDrafts, draftsToApplications, type IApplicationDraft } from "./applicationDrafts";
import { resolvePriceTables } from "./pricing";
import { CATALOG_STRINGS } from "../i18n/pt-BR";

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
