/**
 * Part taxonomy — built-in families plus the user-managed layer on top.
 *
 * The ten families below ship with the product and are the guaranteed fallback:
 * everything here works with an empty (or unreachable) `part_categories` table,
 * which is how the feature ships. Rows from that table then *override* a family
 * by slug, or *add* new ones — see `mergeCategoryDescriptors`.
 *
 * Colours are curated palette ids, never Tailwind class strings: Tailwind
 * generates classes by scanning source at build time, so a class name arriving
 * from the database at runtime would not exist in the stylesheet. `tone` is
 * resolved from `color` through the static map below.
 */

import type { ID, IPartCategory, PartCategory } from "@/shared/types";

export interface IPartCategoryDescriptor {
  value: PartCategory;
  label: string;
  /** Iconify icon used when no `imageUrl` is set. */
  icon: string;
  /** Curated palette id (e.g. "emerald"). */
  color: string;
  /** Static Tailwind utility classes resolved from {@link color}. */
  tone: string;
  subcategories: readonly string[];
  /** False for families created by the user. */
  builtin: boolean;
  /** Row id in `part_categories`, when this family is customised or custom. */
  id?: ID;
  position: number;
  archived: boolean;
}

/**
 * Curated colour palette. Every entry is a literal class string so Tailwind
 * emits it — adding a colour here is the only way to add one to the picker.
 */
export const PART_CATEGORY_PALETTE: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  yellow: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  indigo: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  cyan: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  lime: "bg-lime-500/15 text-lime-600 dark:text-lime-400",
  teal: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  pink: "bg-pink-500/15 text-pink-600 dark:text-pink-400",
  rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  slate: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

export const DEFAULT_CATEGORY_COLOR = "slate";
export const DEFAULT_CATEGORY_ICON = "mdi:cube-outline";

/** Palette ids in picker order. */
export const PART_CATEGORY_COLORS: readonly string[] = Object.keys(PART_CATEGORY_PALETTE);

/** Icons offered by the category editor — Iconify accepts any name, these are the shortcuts. */
export const PART_CATEGORY_ICONS: readonly string[] = [
  "mdi:cube-outline",
  "mdi:air-filter",
  "mdi:car-brake-alert",
  "mdi:reorder-horizontal",
  "mdi:engine",
  "mdi:gear",
  "mdi:flash",
  "mdi:cog-transfer",
  "mdi:car-shock-absorber",
  "mdi:radiator",
  "mdi:oil",
  "mdi:wrench",
  "mdi:fuel",
  "mdi:gauge",
  "mdi:fan",
  "mdi:tire",
  "mdi:battery",
  "mdi:lightbulb-on-outline",
];

/** Resolve a palette id to its static classes; unknown ids fall back to slate. */
export function categoryTone(color: string | undefined): string {
  return PART_CATEGORY_PALETTE[color ?? ""] ?? PART_CATEGORY_PALETTE[DEFAULT_CATEGORY_COLOR]!;
}

interface IBuiltinSeed {
  value: PartCategory;
  label: string;
  icon: string;
  color: string;
  subcategories: readonly string[];
}

const BUILTIN_SEEDS: readonly IBuiltinSeed[] = [
  {
    value: "filtro",
    label: "Filtros",
    icon: "mdi:air-filter",
    color: "emerald",
    subcategories: ["óleo", "ar", "combustível", "cabine", "separador"],
  },
  {
    value: "freio",
    label: "Freios",
    icon: "mdi:car-brake-alert",
    color: "red",
    subcategories: ["pastilha", "disco", "lona", "tambor", "câmara", "regulador"],
  },
  {
    value: "correia",
    label: "Correias",
    icon: "mdi:reorder-horizontal",
    color: "orange",
    subcategories: ["dentada", "alternador", "motor"],
  },
  {
    value: "motor",
    label: "Motor",
    icon: "mdi:engine",
    color: "amber",
    subcategories: ["pistão", "biela", "junta", "turbo", "bomba"],
  },
  {
    value: "embreagem",
    label: "Embreagem",
    icon: "mdi:gear",
    color: "purple",
    subcategories: ["disco", "platô", "rolamento"],
  },
  {
    value: "eletrica",
    label: "Elétrica",
    icon: "mdi:flash",
    color: "yellow",
    subcategories: ["alternador", "bateria", "partida", "sensor", "chicote"],
  },
  {
    value: "transmissao",
    label: "Transmissão",
    icon: "mdi:cog-transfer",
    color: "blue",
    subcategories: ["cardan", "sincronizador", "rolamento"],
  },
  {
    value: "suspensao",
    label: "Suspensão",
    icon: "mdi:car-shock-absorber",
    color: "indigo",
    subcategories: ["amortecedor", "mola", "bucha", "direção"],
  },
  {
    value: "arrefecimento",
    label: "Arrefecimento",
    icon: "mdi:radiator",
    color: "cyan",
    subcategories: ["radiador", "intercooler", "ventoinha", "termostato"],
  },
  {
    value: "lubrificante",
    label: "Lubrificantes",
    icon: "mdi:oil",
    color: "lime",
    subcategories: ["motor", "câmbio", "hidráulico", "graxa", "arla"],
  },
] as const;

/** The families that ship with the product — the fallback when the table is empty. */
export const BUILTIN_PART_CATEGORY_DESCRIPTORS: readonly IPartCategoryDescriptor[] =
  BUILTIN_SEEDS.map((seed, index) => ({
    value: seed.value,
    label: seed.label,
    icon: seed.icon,
    color: seed.color,
    tone: categoryTone(seed.color),
    subcategories: seed.subcategories,
    builtin: true,
    position: index,
    archived: false,
  }));

/**
 * @deprecated Prefer `useCategoryDescriptors()` so user-managed families are
 * included. Kept as the static built-in list for non-React callers (engines,
 * pure helpers) and as the fallback everywhere else.
 */
export const PART_CATEGORY_DESCRIPTORS = BUILTIN_PART_CATEGORY_DESCRIPTORS;

/**
 * Merge stored rows onto the built-ins.
 *
 * A row matching a built-in slug overrides its label/icon/colour/position while
 * keeping the built-in's suggested subcategories; any other row is a new family.
 * Archived families stay in the list so existing parts keep a label — callers
 * filter them out of pickers.
 */
export function mergeCategoryDescriptors(
  rows: readonly IPartCategory[] | undefined,
): IPartCategoryDescriptor[] {
  const byValue = new Map<string, IPartCategoryDescriptor>(
    BUILTIN_PART_CATEGORY_DESCRIPTORS.map((descriptor) => [descriptor.value, { ...descriptor }]),
  );

  for (const row of rows ?? []) {
    const builtin = byValue.get(row.value);
    byValue.set(row.value, {
      value: row.value,
      label: row.label,
      icon: row.icon,
      color: row.color,
      tone: categoryTone(row.color),
      subcategories: builtin?.subcategories ?? [],
      builtin: builtin?.builtin ?? false,
      id: row.id,
      position: row.position,
      archived: row.archived,
    });
  }

  return Array.from(byValue.values()).sort(
    (a, b) => a.position - b.position || a.label.localeCompare(b.label, "pt-BR"),
  );
}

/** Slug for a new family, derived from its label. */
export function toCategorySlug(label: string): string {
  return (
    label
      .normalize("NFD")
      // NFD split every accent into its own combining mark (U+0300–U+036F).
      // Those marks have to go before separators are collapsed, otherwise each
      // one becomes a hyphen and "suspensão" slugs to "suspensa-o".
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/**
 * A category slug is anything the database would accept — the taxonomy is data
 * now, so URL validators must not test against the built-in ten. The pattern is
 * the `part_categories_value_format` CHECK constraint
 * (`20260814180000_part_categories_catalog.sql`); keep the two in sync.
 */
export function isCategorySlug(value: unknown): value is PartCategory {
  return typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
}

function descriptorMap(
  descriptors: readonly IPartCategoryDescriptor[],
): Map<string, IPartCategoryDescriptor> {
  return new Map(descriptors.map((descriptor) => [descriptor.value, descriptor]));
}

const BUILTIN_BY_CATEGORY = descriptorMap(BUILTIN_PART_CATEGORY_DESCRIPTORS);

/**
 * Look up a family. Pass `descriptors` (from `useCategoryDescriptors()`) to
 * honour user-managed families; without it the built-ins answer.
 */
export function getCategoryDescriptor(
  category: PartCategory | undefined,
  descriptors?: readonly IPartCategoryDescriptor[],
): IPartCategoryDescriptor | undefined {
  if (!category) return undefined;
  if (descriptors) return descriptorMap(descriptors).get(category);
  return BUILTIN_BY_CATEGORY.get(category);
}

export function getCategoryLabel(
  category: PartCategory | undefined,
  descriptors?: readonly IPartCategoryDescriptor[],
): string {
  return getCategoryDescriptor(category, descriptors)?.label ?? "Outros";
}

export function getCategoryIcon(
  category: PartCategory | undefined,
  descriptors?: readonly IPartCategoryDescriptor[],
): string {
  return getCategoryDescriptor(category, descriptors)?.icon ?? DEFAULT_CATEGORY_ICON;
}

export function getSubcategoriesFor(
  category: PartCategory | undefined,
  descriptors?: readonly IPartCategoryDescriptor[],
): readonly string[] {
  return getCategoryDescriptor(category, descriptors)?.subcategories ?? [];
}
