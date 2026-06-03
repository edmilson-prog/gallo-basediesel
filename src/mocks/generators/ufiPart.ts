import type { IApplication, IPart, IPartCrossReference, IPartSupplier, ID } from "@/shared/types";
import { buildPriceTables, weightedAverageCost } from "@/features/catalog/utils/pricing";
import { UFI_PARTS_RAW } from "../data/ufiPartsRaw";
import { randomISO, type ISeededContext } from "./utils";

/** A normalized real row exported by the offline converter (real data only). */
export interface IUfiPartRow {
  /** Commercial code, used as SKU (e.g. "23.290.00"). */
  commercialCode: string;
  /** Product description (title-cased). */
  description: string;
  /** Application segment (e.g. "Off Road"). */
  segment: string;
  /** Normalized filter subcategory ("óleo" | "ar" | "combustível" | "cabine" | "hidráulico" | "separador"), or undefined. */
  subcategory?: string;
  /** Goods origin ("Importado" | "Nacional"). */
  origin: string;
  /** Sale multiple → boxQuantity. */
  multiple: number;
  /** NCM with dotted formatting ("8421.23.00"). */
  ncm?: string;
  /** Whether tax substitution applies (derived from CST). */
  taxSubstitution?: boolean;
  /** EAN-13 barcode when present. */
  gtin?: string;
  /** Net weight in kg, undefined when zero/blank. */
  weightKg?: number;
  /** Manufacturer reference (Original UFI, falling back to OE). */
  reference?: string;
  /** Vehicle-manufacturer OEM codes. */
  oemCodes: string[];
  /** Competitor brand cross-references. */
  crossReferences: IPartCrossReference[];
  /** Structured vehicle applications (parsed offline). */
  applications: Array<Omit<IApplication, "id">>;
  /** Raw application text (lossless). */
  applicationNotes: string;
  /** Supplier cost (Preço c/ ICMS, Pis e Cofins). */
  unitCost: number;
}

const ICMS_RATES = [4, 7, 12, 17] as const;

/** Slugify a commercial code into a stable id fragment. */
function slug(commercialCode: string): string {
  return commercialCode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Map one real row into a seeded `IPart`. Pure given `ctx`/`now`. */
export function mapUfiRowToPart(ctx: ISeededContext, row: IUfiPartRow, now: Date): IPart {
  const id: ID = `part-ufi-${slug(row.commercialCode)}`;
  // ~45% base margin for imported filters, ±9% seeded jitter.
  const margin = clamp(0.45 + (ctx.rng() - 0.5) * 0.18, 0.1, 0.7);
  const unitCost = row.unitCost;
  const unitPrice = roundMoney(unitCost * (1 + margin));

  // SEFAZ — only when a GTIN exists (70% validated / 25% not_checked / 5% invalid).
  let sefazStatus: IPart["sefazStatus"];
  let sefazCheckedAt: string | undefined;
  if (row.gtin) {
    const roll = ctx.rng();
    sefazStatus = roll < 0.7 ? "validated" : roll < 0.95 ? "not_checked" : "invalid";
    if (sefazStatus === "validated") sefazCheckedAt = randomISO(ctx, new Date(2026, 0, 1), now);
  }

  // Stock distribution (PRD-030): ~10% zero, ~20% low, ~70% normal.
  const stockMinimum = ctx.int(2, 10);
  const stockRoll = ctx.rng();
  const stockAvailable =
    stockRoll < 0.1
      ? 0
      : stockRoll < 0.3
        ? ctx.int(1, Math.max(1, stockMinimum - 1))
        : ctx.int(stockMinimum + 1, 80);

  const createdAt = randomISO(ctx, new Date(now.getFullYear() - 2, 0, 1), now);

  const suppliers: IPartSupplier[] = [
    {
      id: `sup-${id}-0`,
      name: "UFI Filters",
      supplierCode: row.commercialCode,
      invoiceNumber: String(ctx.int(10000, 99999)),
      invoiceDate: "2024-11-14T00:00:00.000Z",
      cost: unitCost,
      quantity: ctx.int(1, 60),
    },
  ];

  const applications: IApplication[] = row.applications.map((app, i) => ({
    id: `app-${id}-${i}`,
    ...app,
  }));

  return {
    id,
    sku: row.commercialCode,
    name: row.description,
    oemCodes: row.oemCodes,
    equivalentPartIds: [],
    crossReferences: row.crossReferences,
    segment: row.segment || undefined,
    applications,
    applicationNotes: row.applicationNotes || undefined,
    brand: "UFI",
    supplier: "UFI Filters",
    category: "filtro",
    subcategory: row.subcategory,
    isOriginal: false,
    unitCost,
    unitPrice,
    marginPercent: Number(margin.toFixed(4)),
    gtin: row.gtin,
    sefazStatus,
    sefazCheckedAt,
    supplierCode: row.commercialCode,
    reference: row.reference,
    group: "1-FILTRO",
    partType: "Filtro",
    priceTables: unitCost > 0 ? buildPriceTables(unitCost, margin) : undefined,
    fiscal: {
      ncm: row.ncm,
      icmsPercent: ctx.pick(ICMS_RATES),
      taxSubstitution: row.taxSubstitution,
      origin: row.origin || undefined,
    },
    weightKg: row.weightKg,
    storageLocation: `${ctx.pick(["A", "B", "C", "D", "E", "F"])}-${ctx.int(1, 40)}`,
    boxQuantity: row.multiple,
    fractionable: ctx.bool(0.4),
    unitOfMeasure: "PC",
    suppliers,
    averageCost: weightedAverageCost(suppliers) ?? unitCost,
    stockAvailable,
    stockMinimum,
    division: "parts",
    active: true,
    storeId: "store-matriz",
    createdAt,
    updatedAt: randomISO(ctx, new Date(createdAt), now),
  };
}

/** Build all real UFI filter parts from the generated raw rows. */
export function buildUfiParts(ctx: ISeededContext, now: Date): IPart[] {
  return UFI_PARTS_RAW.map((row) => mapUfiRowToPart(ctx, row, now));
}
