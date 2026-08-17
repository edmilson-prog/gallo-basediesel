import type { ModelKitCategory } from "@/shared/types";

/** Icon + label per kit category. Shared by the badge, the card warnings and the
 *  editor's category select, so the five categories read the same everywhere. */
export const KIT_CATEGORY_CONFIG: Record<ModelKitCategory, { icon: string; label: string }> = {
  filtros: { icon: "mdi:air-filter", label: "filtros" },
  freios: { icon: "mdi:car-brake-alarm", label: "freios" },
  correia: { icon: "mdi:fan", label: "correia" },
  revisao: { icon: "mdi:wrench-clock", label: "revisão" },
  custom: { icon: "mdi:package-variant", label: "custom" },
};
