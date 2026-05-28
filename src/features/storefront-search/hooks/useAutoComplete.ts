import { useEffect, useMemo, useState } from "react";
import type { IPart } from "@/shared/types";
import { PART_CATEGORY_DESCRIPTORS } from "@/features/catalog";

const DEBOUNCE_MS = 300;
const MAX_PRODUCTS = 5;
const MAX_CATEGORIES = 2;
const MAX_BRANDS = 1;

export type AutoCompleteSuggestion =
  | { kind: "product"; part: IPart }
  | { kind: "category"; slug: string; label: string; icon: string }
  | { kind: "brand"; brand: string };

export function useAutoComplete(
  query: string,
  parts: IPart[],
  vehicleBrands: string[],
): { suggestions: AutoCompleteSuggestion[]; debouncedQuery: string } {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query]);

  const suggestions = useMemo<AutoCompleteSuggestion[]>(() => {
    const trimmed = debouncedQuery.trim().toLowerCase();
    if (trimmed.length < 2) return [];

    const out: AutoCompleteSuggestion[] = [];

    // Products
    const matched: IPart[] = [];
    for (const part of parts) {
      if (!part.active) continue;
      const name = part.name.toLowerCase();
      const sku = part.sku.toLowerCase();
      const oemHit = part.oemCodes.some((c) => c.toLowerCase().includes(trimmed));
      if (name.includes(trimmed) || sku.includes(trimmed) || oemHit) {
        matched.push(part);
        if (matched.length === MAX_PRODUCTS) break;
      }
    }
    for (const part of matched) out.push({ kind: "product", part });

    // Categories
    let catCount = 0;
    for (const cat of PART_CATEGORY_DESCRIPTORS) {
      if (catCount === MAX_CATEGORIES) break;
      if (cat.label.toLowerCase().includes(trimmed) || cat.value.includes(trimmed)) {
        out.push({ kind: "category", slug: cat.value, label: cat.label, icon: cat.icon });
        catCount += 1;
      }
    }

    // Vehicle brands
    let brandCount = 0;
    for (const brand of vehicleBrands) {
      if (brandCount === MAX_BRANDS) break;
      if (brand.toLowerCase().includes(trimmed)) {
        out.push({ kind: "brand", brand });
        brandCount += 1;
      }
    }

    return out;
  }, [debouncedQuery, parts, vehicleBrands]);

  return { suggestions, debouncedQuery };
}
