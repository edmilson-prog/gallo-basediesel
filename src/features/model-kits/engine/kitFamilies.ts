import type { ModelKitCategory } from "@/shared/types";

/**
 * Filter families a kit line can belong to. The catalog stores this loosely in
 * `IPart.subcategory` — curated filters carry the accented pt-BR term
 * (`óleo`, `combustível`), while the DINTEC import left ERP groups
 * (`PECAS`, `FILTROS`), supplier names (`UFI`, `MANN`) and English labels
 * (`Oil filter`). The resolver below normalizes all of that into one taxonomy.
 */
export type KitFamily =
  | "oleo"
  | "combustivel"
  | "separador"
  | "ar"
  | "cabine"
  | "transmissao"
  | "hidraulico";

export interface IKitFamilyMeta {
  label: string;
  icon: string;
}

export const KIT_FAMILIES: Record<KitFamily, IKitFamilyMeta> = {
  oleo: { label: "Óleo", icon: "mdi:oil" },
  combustivel: { label: "Combustível", icon: "mdi:fuel" },
  separador: { label: "Separador de água", icon: "mdi:water-outline" },
  ar: { label: "Ar", icon: "mdi:weather-windy" },
  cabine: { label: "Ar da cabine", icon: "mdi:fan" },
  transmissao: { label: "Transmissão", icon: "mdi:cog-outline" },
  hidraulico: { label: "Hidráulico", icon: "mdi:hydraulic-oil-level" },
};

/**
 * Families each kit category expects (`slots`) and the ones curation treats as
 * mandatory (`required`). No schema counterpart today — the app links a part to
 * a subcategory, but nothing links a kit category to the families it should
 * cover. Keeping it here lets the ficha say "sem filtro de óleo" instead of
 * showing a kit that only looks complete.
 */
export const CATEGORY_FAMILIES: Record<
  ModelKitCategory,
  { slots: KitFamily[]; required: KitFamily[] }
> = {
  filtros: {
    slots: ["oleo", "combustivel", "separador", "ar", "cabine"],
    required: ["oleo", "combustivel"],
  },
  revisao: {
    slots: ["oleo", "combustivel", "ar", "cabine", "transmissao"],
    required: ["oleo", "combustivel"],
  },
  freios: { slots: [], required: [] },
  correia: { slots: [], required: [] },
  custom: { slots: [], required: [] },
};

/**
 * Terms per family, most specific family first: "cabin air filter" is `cabine`,
 * not `ar`, and "separador de água/combustível" is `separador`, not
 * `combustivel`. The qualified oils come before plain `oleo` for the same
 * reason — "filtro de óleo da transmissão" is a `transmissao` line, and reading
 * it as `oleo` would let a gearbox filter satisfy the engine-oil slot.
 */
const FAMILY_TERMS: ReadonlyArray<{ family: KitFamily; terms: readonly string[] }> = [
  { family: "separador", terms: ["separador", "separator", "racor"] },
  { family: "cabine", terms: ["cabine", "cabin"] },
  { family: "transmissao", terms: ["transmissao", "transmission", "cambio", "gearbox"] },
  { family: "hidraulico", terms: ["hidraulico", "hydraulic"] },
  { family: "oleo", terms: ["oleo", "oil"] },
  { family: "combustivel", terms: ["combustivel", "fuel", "diesel"] },
  { family: "ar", terms: ["ar", "air"] },
];

/** Lowercase and strip diacritics so "Óleo", "óleo" and "OLEO" are one token. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Whole-word match (plural tolerated) so `ar` does not fire inside "arla" or
 *  "barra", while `oleo` still matches the "OLEOS" ERP group. */
function hasTerm(haystack: string, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${term}s?([^a-z0-9]|$)`).test(haystack);
}

function matchFamily(text: string | undefined): KitFamily | null {
  if (!text) return null;
  const normalized = normalize(text);
  for (const { family, terms } of FAMILY_TERMS) {
    if (terms.some((term) => hasTerm(normalized, term))) return family;
  }
  return null;
}

/** What the family resolver needs from a part — a shape both `IPart` and a
 *  catalog search hit satisfy. */
export interface IFamilyResolvable {
  subcategory?: string;
  name?: string;
}

/**
 * Best-effort family for a part. Reads `subcategory` first (the canonical field)
 * and falls back to the part name, which is where the family actually lives for
 * most of the imported catalog. Returns null when nothing identifies a family —
 * the caller shows a neutral icon rather than guessing.
 */
export function resolvePartFamily(part: IFamilyResolvable): KitFamily | null {
  return matchFamily(part.subcategory) ?? matchFamily(part.name);
}

export interface IFamilyCoverageEntry extends IFamilyResolvable {
  /** Optional lines are suggestions — they never cover a required family. */
  isOptional?: boolean;
}

export interface IFamilyCoverage {
  /** How many base parts fill each family. */
  filled: Partial<Record<KitFamily, number>>;
  /** Required families with no base part — what blocks a confident "oficial". */
  missingRequired: KitFamily[];
}

/**
 * Coverage of a kit's composition against the families its category expects.
 * Only base parts count: a kit whose only oil filter is optional still has an
 * empty oil slot.
 */
export function getFamilyCoverage(
  category: ModelKitCategory,
  entries: readonly IFamilyCoverageEntry[],
): IFamilyCoverage {
  const config = CATEGORY_FAMILIES[category] ?? CATEGORY_FAMILIES.custom;
  const filled: Partial<Record<KitFamily, number>> = {};

  for (const entry of entries) {
    if (entry.isOptional) continue;
    const family = resolvePartFamily(entry);
    if (!family) continue;
    filled[family] = (filled[family] ?? 0) + 1;
  }

  return {
    filled,
    missingRequired: config.required.filter((family) => !filled[family]),
  };
}
