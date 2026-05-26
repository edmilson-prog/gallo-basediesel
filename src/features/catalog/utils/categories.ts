import type { PartCategory } from "@/shared/types";

export interface IPartCategoryDescriptor {
  value: PartCategory;
  label: string;
  /** Iconify icon used when no `imageUrl` is set. */
  icon: string;
  /** Tailwind utility class for the icon background tint. */
  tone: string;
  subcategories: readonly string[];
}

export const PART_CATEGORY_DESCRIPTORS: readonly IPartCategoryDescriptor[] = [
  {
    value: "filtro",
    label: "Filtros",
    icon: "mdi:air-filter",
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    subcategories: ["óleo", "ar", "combustível", "cabine", "separador"],
  },
  {
    value: "freio",
    label: "Freios",
    icon: "mdi:car-brake-alert",
    tone: "bg-red-500/15 text-red-600 dark:text-red-400",
    subcategories: ["pastilha", "disco", "lona", "tambor", "câmara", "regulador"],
  },
  {
    value: "correia",
    label: "Correias",
    icon: "mdi:reorder-horizontal",
    tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    subcategories: ["dentada", "alternador", "motor"],
  },
  {
    value: "motor",
    label: "Motor",
    icon: "mdi:engine",
    tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    subcategories: ["pistão", "biela", "junta", "turbo", "bomba"],
  },
  {
    value: "embreagem",
    label: "Embreagem",
    icon: "mdi:gear",
    tone: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    subcategories: ["disco", "platô", "rolamento"],
  },
  {
    value: "eletrica",
    label: "Elétrica",
    icon: "mdi:flash",
    tone: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    subcategories: ["alternador", "bateria", "partida", "sensor", "chicote"],
  },
  {
    value: "transmissao",
    label: "Transmissão",
    icon: "mdi:cog-transfer",
    tone: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    subcategories: ["cardan", "sincronizador", "rolamento"],
  },
  {
    value: "suspensao",
    label: "Suspensão",
    icon: "mdi:car-shock-absorber",
    tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
    subcategories: ["amortecedor", "mola", "bucha", "direção"],
  },
  {
    value: "arrefecimento",
    label: "Arrefecimento",
    icon: "mdi:radiator",
    tone: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
    subcategories: ["radiador", "intercooler", "ventoinha", "termostato"],
  },
  {
    value: "lubrificante",
    label: "Lubrificantes",
    icon: "mdi:oil",
    tone: "bg-lime-500/15 text-lime-600 dark:text-lime-400",
    subcategories: ["motor", "câmbio", "hidráulico", "graxa", "arla"],
  },
] as const;

const DESCRIPTOR_BY_CATEGORY = new Map<PartCategory, IPartCategoryDescriptor>(
  PART_CATEGORY_DESCRIPTORS.map((d) => [d.value, d]),
);

export function getCategoryDescriptor(
  category: PartCategory | undefined,
): IPartCategoryDescriptor | undefined {
  if (!category) return undefined;
  return DESCRIPTOR_BY_CATEGORY.get(category);
}

export function getCategoryLabel(category: PartCategory | undefined): string {
  return getCategoryDescriptor(category)?.label ?? "Outros";
}

export function getCategoryIcon(category: PartCategory | undefined): string {
  return getCategoryDescriptor(category)?.icon ?? "mdi:cube-outline";
}

export function getSubcategoriesFor(category: PartCategory | undefined): readonly string[] {
  return getCategoryDescriptor(category)?.subcategories ?? [];
}
