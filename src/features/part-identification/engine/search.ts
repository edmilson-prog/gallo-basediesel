import type {
  AttributeConfidence,
  IExtractedAttributes,
  IPart,
  IPartCandidate,
  PartCategory,
} from "@/shared/types";
import { CATALOG_CATEGORY_TO_CANONICAL } from "../data/partCategories";

/**
 * Score weights mandated by the PRD (RF-012). Exported so the inspector can
 * display them next to the score breakdown.
 */
export const SCORE_WEIGHTS = Object.freeze({
  brand: 0.35,
  model: 0.3,
  yearInRange: 0.15,
  engine: 0.1,
  partCategory: 0.1,
  equivalentPenalty: -0.05,
});

const NAME_TO_CATEGORY_HINTS: Array<{ pattern: RegExp; category: PartCategory }> = [
  { pattern: /filtro/i, category: "filtro" },
  { pattern: /freio|pastilha|lona|tambor|câmara/i, category: "freio" },
  { pattern: /correia/i, category: "correia" },
  { pattern: /embreagem|platô|plato|rolamento de embreagem/i, category: "embreagem" },
  { pattern: /cardan|sincronizador|câmbio|cambio|diferencial/i, category: "transmissao" },
  { pattern: /amortecedor|feixe|bucha|estabilizadora|terminal de direção/i, category: "suspensao" },
  { pattern: /alternador|partida|bateria|sensor|chicote|ecu/i, category: "eletrica" },
  { pattern: /radiador|intercooler|ventoinha|termostato/i, category: "arrefecimento" },
  { pattern: /óleo|oleo|graxa|aditivo|arla/i, category: "lubrificante" },
  { pattern: /pistão|pistao|biela|turbo|junta de cabeçote|bomba d'água/i, category: "motor" },
];

/** Best-effort mapping from part name → canonical PRD-021 category. */
export function inferPartCategoryFromName(part: IPart): PartCategory | undefined {
  for (const { pattern, category } of NAME_TO_CATEGORY_HINTS) {
    if (pattern.test(part.name) || pattern.test(part.description ?? "")) return category;
  }
  const skuMatch = part.sku.match(/^GAL-([A-Z]{3})-/i);
  if (skuMatch) {
    const code = skuMatch[1].toLowerCase();
    const candidate = Object.entries(CATALOG_CATEGORY_TO_CANONICAL).find(
      ([id]) => id.slice(0, 3) === code,
    );
    if (candidate) return candidate[1];
  }
  return undefined;
}

/**
 * Compute the aggregated score of a single candidate against the extracted
 * attributes, using the weight table mandated by RF-012. The result is
 * clamped to `[0, 1]`.
 */
export function scoreCandidate(
  part: IPart,
  attributes: IExtractedAttributes,
): {
  score: number;
  matched: Array<keyof IExtractedAttributes>;
} {
  let score = 0;
  const matched: Array<keyof IExtractedAttributes> = [];

  const applications = part.applications;
  const hasBrandMatch = attributes.brand
    ? applications.some((a) => a.vehicleBrand.toLowerCase() === attributes.brand!.toLowerCase())
    : false;
  if (hasBrandMatch) {
    score += SCORE_WEIGHTS.brand;
    matched.push("brand");
  }

  const hasModelMatch = attributes.model
    ? applications.some(
        (a) =>
          a.vehicleBrand.toLowerCase() === (attributes.brand ?? a.vehicleBrand).toLowerCase() &&
          a.vehicleModel.toLowerCase() === attributes.model!.toLowerCase(),
      )
    : false;
  if (hasModelMatch) {
    score += SCORE_WEIGHTS.model;
    matched.push("model");
  }

  const hasYearMatch = attributes.year
    ? applications.some((a) => attributes.year! >= a.yearStart && attributes.year! <= a.yearEnd)
    : false;
  if (hasYearMatch) {
    score += SCORE_WEIGHTS.yearInRange;
    matched.push("year");
  }

  const hasEngineMatch = attributes.engine
    ? applications.some(
        (a) => a.engine && a.engine.toLowerCase() === attributes.engine!.toLowerCase(),
      )
    : false;
  if (hasEngineMatch) {
    score += SCORE_WEIGHTS.engine;
    matched.push("engine");
  }

  if (attributes.partCategory) {
    const category = inferPartCategoryFromName(part);
    if (category && category === attributes.partCategory) {
      score += SCORE_WEIGHTS.partCategory;
      matched.push("partCategory");
    }
  }

  return { score: Math.max(0, Math.min(1, score)), matched };
}

/**
 * Search the in-memory catalog for parts matching the extracted attributes.
 *
 * **Stub contract:** until PRD-030 (Catálogo) ships, this function is the
 * single point of integration — pass a different `IPart[]` source to swap
 * in real data without changing consumers. When `parts` is empty an
 * intentional empty list is returned and `searchCatalogWithFallback()`
 * supplies stylised mocks for the inspector (RF-011).
 */
export function searchCatalog(attributes: IExtractedAttributes, parts: IPart[]): IPartCandidate[] {
  if (parts.length === 0) return [];

  // OEM short-circuit — single exact match dominates everything else.
  if (attributes.oemCode) {
    const oem = attributes.oemCode.toUpperCase();
    const direct = parts.find(
      (p) => p.oemCodes.some((c) => c.toUpperCase() === oem) || p.sku.toUpperCase() === oem,
    );
    if (direct) {
      return [toCandidate(direct, 1, ["oemCode"], false)];
    }
  }

  const scored = parts
    .filter((p) => p.active !== false)
    .map((part) => {
      const { score, matched } = scoreCandidate(part, attributes);
      return { part, score, matched };
    })
    .filter((entry) => entry.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const candidates: IPartCandidate[] = [];
  const seen = new Set<string>();
  for (const entry of scored) {
    candidates.push(
      toCandidate(
        entry.part,
        entry.score,
        entry.matched as Array<keyof IExtractedAttributes>,
        false,
      ),
    );
    seen.add(entry.part.id);
  }

  // Pull equivalents of the top candidate to satisfy RF-022/RF-023.
  if (scored.length > 0) {
    const top = scored[0].part;
    for (const equivId of top.equivalentPartIds) {
      if (seen.has(equivId)) continue;
      const equiv = parts.find((p) => p.id === equivId);
      if (!equiv) continue;
      const { score, matched } = scoreCandidate(equiv, attributes);
      const adjusted = Math.max(0, score + SCORE_WEIGHTS.equivalentPenalty);
      candidates.push(
        toCandidate(equiv, adjusted, matched as Array<keyof IExtractedAttributes>, true),
      );
      seen.add(equivId);
    }
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

/**
 * When the catalog is not yet seeded (PRD-030 placeholder), emit 3 stylised
 * candidates so the simulator still produces a meaningful demo. Never used
 * once real parts exist.
 */
export function buildFallbackCandidates(attributes: IExtractedAttributes): IPartCandidate[] {
  const tag = [attributes.brand, attributes.model, attributes.year, attributes.partCategory]
    .filter(Boolean)
    .join(" ");
  const label = tag.length > 0 ? tag : "peça";
  return [
    {
      partId: "fallback-original",
      partName: `${label} — original`,
      partBrand: "OEM",
      score: 0.85,
      matchedAttributes: ["brand"],
      isEquivalent: false,
      estimatedPrice: 95,
      oemCode: "DEMO-100100",
    },
    {
      partId: "fallback-equiv-1",
      partName: `${label} — equivalente Mann`,
      partBrand: "Mann",
      score: 0.78,
      matchedAttributes: ["brand"],
      isEquivalent: true,
      estimatedPrice: 65,
      oemCode: "MANN-200200",
    },
    {
      partId: "fallback-equiv-2",
      partName: `${label} — equivalente Tecfil`,
      partBrand: "Tecfil",
      score: 0.74,
      matchedAttributes: ["brand"],
      isEquivalent: true,
      estimatedPrice: 70,
      oemCode: "TECFIL-300300",
    },
  ];
}

export function searchCatalogWithFallback(
  attributes: IExtractedAttributes,
  parts: IPart[],
): { candidates: IPartCandidate[]; usedFallback: boolean } {
  const real = searchCatalog(attributes, parts);
  if (real.length > 0) return { candidates: real, usedFallback: false };
  return { candidates: buildFallbackCandidates(attributes), usedFallback: true };
}

function toCandidate(
  part: IPart,
  score: number,
  matched: Array<keyof IExtractedAttributes>,
  isEquivalent: boolean,
): IPartCandidate {
  return {
    partId: part.id,
    partName: part.name,
    partBrand: part.brand,
    score,
    matchedAttributes: matched,
    isEquivalent,
    estimatedPrice: part.unitPrice,
    oemCode: part.oemCodes[0],
  };
}

/** Convenience export of the unused-attribute confidence — kept for tests. */
export const _internals = {
  inferPartCategoryFromName,
};

export type { AttributeConfidence };
