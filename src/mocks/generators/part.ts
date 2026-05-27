import type { IApplication, IPart, ID, PartCategory } from "@/shared/types";
import { CATALOG_CATEGORY_TO_CANONICAL } from "@/features/part-identification/data/partCategories";
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

/** Mark some suppliers/brands as OEM originals based on naming. */
const ORIGINAL_BRAND_HINTS = ["Volvo Genuine", "Scania Original", "Iveco Parts", "Cummins OEM"];

/** Deterministically generate a single `IPart` plus its applications. */
export function generatePart(
  ctx: ISeededContext,
  options: { now?: Date; sequence: number } = { sequence: 0 },
): IPart {
  const category = pickWeighted(
    ctx,
    PART_CATEGORIES.map((c) => ({ value: c, weight: 1 })),
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
    stockAvailable,
    stockMinimum,
    division: "parts",
    active: ctx.bool(0.95),
    storeId: "store-matriz",
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

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
