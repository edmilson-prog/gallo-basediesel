import type { IApplication, IPart, IPartSupplier, ID, PartCategory } from "@/shared/types";
import { CATALOG_CATEGORY_TO_CANONICAL } from "@/features/part-identification/data/partCategories";
import { buildPriceTables, weightedAverageCost } from "@/features/catalog/utils/pricing";
import {
  OEM_PREFIXES,
  PART_BRAND_NAMES,
  PART_CATEGORIES,
  SEED_VEHICLE_MODELS,
  SUPPLIER_NAMES,
  type IPartCategory,
} from "../data";
import { pickWeighted, randomISO, type ISeededContext } from "./utils";

const SUBCATEGORIES_BY_CATEGORY: Record<string, string[]> = {
  filtros: ["óleo", "ar", "combustível", "cabine", "separador"],
  freios: ["pastilha", "disco", "lona", "tambor", "câmara", "regulador"],
  transmissao: ["embreagem", "cardan", "sincronizador", "rolamento"],
  suspensao: ["amortecedor", "mola", "bucha", "direção"],
  eletrica: ["alternador", "bateria", "partida", "sensor", "chicote"],
  motor: ["pistão", "biela", "junta", "turbo", "bomba"],
  arrefecimento: ["radiador", "intercooler", "ventoinha", "termostato"],
  lubrificantes: ["motor", "câmbio", "hidráulico", "graxa", "arla"],
};

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
const ICMS_RATES: number[] = [7, 12, 17, 18];
const ORIGINS = ["Nacional", "Importado"] as const;
const BOX_QUANTITIES: number[] = [1, 6, 12, 24];

/** Mark some suppliers/brands as OEM originals based on naming. */
const ORIGINAL_BRAND_HINTS = ["Volvo Genuine", "Scania Original", "Iveco Parts", "Cummins OEM"];

/** Deterministically generate a single `IPart` plus its applications. */
export function generatePart(
  ctx: ISeededContext,
  options: { now?: Date; sequence: number; categoryPool?: IPartCategory[] } = { sequence: 0 },
): IPart {
  const pool = options.categoryPool ?? PART_CATEGORIES;
  const category = pickWeighted(
    ctx,
    pool.map((c) => ({ value: c, weight: 1 })),
  );
  const noun = ctx.pick(category.nouns);
  const adjective = ctx.bool(0.7) ? ` ${ctx.pick(category.adjectives)}` : "";
  const brand = ctx.pick(PART_BRAND_NAMES);
  const supplier = ctx.pick(SUPPLIER_NAMES);
  const baseCost = roundMoney(
    ctx.int(category.costRange[0] * 100, category.costRange[1] * 100) / 100,
  );
  const margin = clamp(category.marginMean + (ctx.rng() - 0.5) * 0.18, 0.1, 0.7);
  const unitPrice = roundMoney(baseCost * (1 + margin));
  // PRD-048 RF-005 — ~30% of the catalog stays without `unitCost` so the DRE
  // engine can surface the "CMV coverage" warning. We model "missing cost" as
  // `unitCost = 0`; the engine treats positive values as covered.
  const costKnown = ctx.bool(0.7);
  const unitCost = costKnown ? baseCost : 0;
  // Stock distribution: ~70% normal, 20% low, 10% zero (PRD-030 RF-005).
  const stockRoll = ctx.rng();
  const stockMinimum = ctx.int(2, 10);
  const stockAvailable =
    stockRoll < 0.1
      ? 0
      : stockRoll < 0.3
        ? ctx.int(1, Math.max(1, stockMinimum - 1))
        : ctx.int(stockMinimum + 1, 80);
  const sku = formatSku(category.id, options.sequence);
  const id: ID = `part-${sku.toLowerCase()}`;
  const now = options.now ?? new Date();
  const createdAt = randomISO(ctx, new Date(now.getFullYear() - 2, 0, 1), now);
  const canonicalCategory: PartCategory | undefined = CATALOG_CATEGORY_TO_CANONICAL[category.id];
  const subcategoryPool = SUBCATEGORIES_BY_CATEGORY[category.id];
  const subcategory =
    subcategoryPool && subcategoryPool.length > 0 ? ctx.pick(subcategoryPool) : undefined;
  const isOriginal =
    ORIGINAL_BRAND_HINTS.includes(brand) || ORIGINAL_BRAND_HINTS.includes(supplier);

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

  return {
    id,
    sku,
    name: capitalize(`${noun}${adjective} ${brand}`),
    description: `${capitalize(noun)} ${adjective.trim()} fornecida por ${supplier}. Aplicação em linha pesada.`,
    oemCodes: generateOemCodes(ctx),
    equivalentPartIds: [],
    applications: generateApplications(ctx, id, category),
    brand,
    supplier,
    category: canonicalCategory,
    subcategory,
    isOriginal,
    unitCost,
    unitPrice,
    marginPercent: Number(margin.toFixed(4)),
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
    weightKg: roundMoney(ctx.int(20, 4000) / 100),
    storageLocation: `${ctx.pick(["A", "B", "C", "D", "E", "F"])}-${ctx.int(1, 40)}`,
    boxQuantity: ctx.pick(BOX_QUANTITIES),
    fractionable: ctx.bool(0.4),
    unitOfMeasure: ctx.pick(UNITS_OF_MEASURE),
    suppliers,
    averageCost,
    stockAvailable,
    stockMinimum,
    division: "parts",
    active: ctx.bool(0.95),
    storeId: "00000000-0000-0000-0000-000000000001",
    createdAt,
    updatedAt: randomISO(ctx, new Date(createdAt), now),
  };
}

/**
 * After every part exists, link a subset of them as `equivalentPartIds` so the
 * SDR equivalence flow has data to work with.
 *
 * Pairs are drawn within the same category to keep the equivalences plausible.
 */
export function linkEquivalentParts(ctx: ISeededContext, parts: IPart[]): void {
  const byCategory = new Map<string, IPart[]>();
  for (const part of parts) {
    const cat = inferCategoryFromSku(part.sku) ?? "outros";
    const bucket = byCategory.get(cat);
    if (bucket) bucket.push(part);
    else byCategory.set(cat, [part]);
  }
  for (const bucket of byCategory.values()) {
    if (bucket.length < 2) continue;
    const equivalences = Math.max(1, Math.floor(bucket.length * 0.15));
    for (let i = 0; i < equivalences; i += 1) {
      const a = ctx.pick(bucket);
      let b = ctx.pick(bucket);
      let attempts = 0;
      while (b.id === a.id && attempts < 4) {
        b = ctx.pick(bucket);
        attempts += 1;
      }
      if (a.id === b.id) continue;
      if (!a.equivalentPartIds.includes(b.id)) a.equivalentPartIds.push(b.id);
      if (!b.equivalentPartIds.includes(a.id)) b.equivalentPartIds.push(a.id);
    }
  }
}

function generateApplications(
  ctx: ISeededContext,
  partId: ID,
  _category: IPartCategory,
): IApplication[] {
  const count = ctx.int(2, 4);
  const out: IApplication[] = [];
  for (let i = 0; i < count; i += 1) {
    const model = ctx.pick(SEED_VEHICLE_MODELS);
    const yearStart = ctx.int(model.yearStart, Math.max(model.yearStart, model.yearEnd - 2));
    const yearEnd = ctx.int(yearStart, model.yearEnd);
    out.push({
      id: `app-${partId}-${i}`,
      vehicleBrand: model.brand,
      vehicleModel: model.model,
      yearStart,
      yearEnd,
      engine: ctx.bool(0.7) ? ctx.pick(model.engines) : undefined,
    });
  }
  return out;
}

function generateOemCodes(ctx: ISeededContext): string[] {
  const count = ctx.int(1, 3);
  const codes = new Set<string>();
  while (codes.size < count) {
    const prefix = ctx.pick(OEM_PREFIXES);
    const number = ctx.int(100000, 999999);
    codes.add(`${prefix}-${number}`);
  }
  return Array.from(codes);
}

function formatSku(categoryId: string, sequence: number): string {
  const prefix = categoryId.slice(0, 3).toUpperCase();
  return `GAL-${prefix}-${String(sequence + 1).padStart(4, "0")}`;
}

function inferCategoryFromSku(sku: string): string | null {
  const match = sku.match(/^GAL-([A-Z]{3})-/);
  if (!match || !match[1]) return null;
  const code = match[1].toLowerCase();
  const category = PART_CATEGORIES.find((c) => c.id.slice(0, 3) === code);
  return category?.id ?? null;
}

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

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
