// src/features/vehicle-models/utils/brandIcon.ts
import { DEFAULT_STOREFRONT_BRANDS } from "@/shared/types";

const FALLBACK_ICON = "mdi:truck-outline";

const ICON_BY_SLUG = new Map(DEFAULT_STOREFRONT_BRANDS.map((b) => [b.slug, b.icon]));

/** Normalize a free-form brand string to a storefront slug ("Ford Cargo" → "ford-cargo"). */
function brandSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Resolve the Iconify name for a brand, falling back to a generic truck icon. */
export function getBrandIcon(brand: string): string {
  return ICON_BY_SLUG.get(brandSlug(brand)) ?? FALLBACK_ICON;
}

/** The 5 known brand labels, in display order (for filter chips and the form select). */
export const KNOWN_BRANDS: readonly string[] = DEFAULT_STOREFRONT_BRANDS.map((b) => b.label);
