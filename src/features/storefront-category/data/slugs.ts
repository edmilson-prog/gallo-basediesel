import type { PartCategory } from "@/shared/types";
import {
  getCategoryDescriptor,
  getCategoryIcon,
  getCategoryLabel,
  type IPartCategoryDescriptor,
} from "@/features/catalog";

/**
 * Special listings backed by curated rules (PRD-062 RF-022/023/024).
 *
 * - `top-selling`: ranking by paid orders (last 90 days), no category filter.
 * - `newest`: parts with `createdAt > now - 90 days`.
 * - `promotions`: manually picked part ids stored in the storefront settings.
 */
export type SpecialKind = "top-selling" | "newest" | "promotions";

export interface ICategorySlugMappingRegular {
  kind: "category";
  /** Catalog category that backs this slug. */
  category: PartCategory;
  /** Human-readable name (mirrors the descriptor, exposed for SEO). */
  name: string;
  /** Iconify name displayed on the header banner. */
  icon: string;
}

export interface ICategorySlugMappingSpecial {
  kind: "special";
  /** Special listing identifier. */
  special: SpecialKind;
  /** Human-readable name. */
  name: string;
  /** Iconify name displayed on the header banner. */
  icon: string;
  /** Hard-coded description (overridable by settings on Fase 2). */
  defaultDescription: string;
}

export type ICategorySlugMapping = ICategorySlugMappingRegular | ICategorySlugMappingSpecial;

/**
 * Friendly slug → category mapping. We expose lowercase ASCII slugs separate
 * from the catalog enum so the URLs stay SEO-friendly and stable even if the
 * internal `PartCategory` taxonomy evolves later.
 */
const REGULAR_SLUGS: Record<string, PartCategory> = {
  filtros: "filtro",
  freios: "freio",
  correias: "correia",
  motor: "motor",
  embreagem: "embreagem",
  eletrica: "eletrica",
  transmissao: "transmissao",
  suspensao: "suspensao",
  arrefecimento: "arrefecimento",
  lubrificantes: "lubrificante",
};

const SPECIAL_SLUGS: Record<string, ICategorySlugMappingSpecial> = {
  "mais-vendidas": {
    kind: "special",
    special: "top-selling",
    name: "Mais vendidas",
    icon: "mdi:trophy-outline",
    defaultDescription:
      "As peças que mais saem do nosso estoque nos últimos 90 dias, ordenadas por volume real de venda.",
  },
  novidades: {
    kind: "special",
    special: "newest",
    name: "Novidades no catálogo",
    icon: "mdi:new-box",
    defaultDescription:
      "Itens recém-cadastrados na GALLO PARTS — frescor de catálogo nos últimos 90 dias.",
  },
  promocoes: {
    kind: "special",
    special: "promotions",
    name: "Promoções",
    icon: "mdi:tag-multiple-outline",
    defaultDescription:
      "Seleção limitada de peças com preço promocional — curadoria manual. O sistema completo de promoções chega na Fase 2.",
  },
};

/** Inverse map for regular categories — used by the home/featured grids. */
export const CATEGORY_TO_SLUG: ReadonlyMap<PartCategory, string> = new Map(
  Object.entries(REGULAR_SLUGS).map(([slug, category]) => [category, slug] as const),
);

export function resolveCategorySlug(slug: string): ICategorySlugMapping | null {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length === 0) return null;

  // Special listings first — names cannot collide with regular slugs.
  const special = SPECIAL_SLUGS[normalized];
  if (special) return special;

  // Try the curated slug map (English-friendly URLs).
  const friendly = REGULAR_SLUGS[normalized];
  if (friendly) {
    const descriptor = getCategoryDescriptor(friendly);
    if (descriptor) return regularMapping(descriptor);
  }

  // Fallback: accept the raw catalog enum (e.g. /loja/categoria/filtro).
  const direct = getCategoryDescriptor(normalized as PartCategory);
  if (direct) return regularMapping(direct);

  return null;
}

function regularMapping(descriptor: IPartCategoryDescriptor): ICategorySlugMappingRegular {
  return {
    kind: "category",
    category: descriptor.value,
    name: descriptor.label,
    icon: descriptor.icon,
  };
}

/** Convenience accessor for SEO copy that needs the human-readable label. */
export function nameForSlug(slug: string): string {
  const mapping = resolveCategorySlug(slug);
  if (!mapping) return "Categoria";
  if (mapping.kind === "special") return mapping.name;
  return getCategoryLabel(mapping.category);
}

/** Pretty icon for the slug — falls back to a generic cube. */
export function iconForSlug(slug: string): string {
  const mapping = resolveCategorySlug(slug);
  if (!mapping) return "mdi:cube-outline";
  if (mapping.kind === "special") return mapping.icon;
  return getCategoryIcon(mapping.category);
}

/** Curated list of friendly slugs, used by the 404 fallback suggestions. */
export const KNOWN_CATEGORY_SLUGS = Object.freeze(Object.keys(REGULAR_SLUGS));
export const KNOWN_SPECIAL_SLUGS = Object.freeze(Object.keys(SPECIAL_SLUGS));
