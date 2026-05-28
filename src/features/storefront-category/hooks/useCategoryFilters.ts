import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

export type CategorySort = "relevance" | "price-asc" | "price-desc" | "top-selling" | "newest";
export type CategoryType = "all" | "original" | "equivalent";

const VALID_SORT = new Set<CategorySort>([
  "relevance",
  "price-asc",
  "price-desc",
  "top-selling",
  "newest",
]);
const VALID_TYPE = new Set<CategoryType>(["all", "original", "equivalent"]);

export interface ICategorySearchParams {
  subcategoria?: string;
  marca?: string;
  fabricante?: string;
  tipo?: string;
  preco_min?: number;
  preco_max?: number;
  estoque?: number;
  sort?: string;
  page?: number;
}

export function validateCategorySearch(raw: Record<string, unknown>): ICategorySearchParams {
  const out: ICategorySearchParams = {};
  if (typeof raw.subcategoria === "string" && raw.subcategoria.length > 0) {
    out.subcategoria = raw.subcategoria;
  }
  if (typeof raw.marca === "string" && raw.marca.length > 0) out.marca = raw.marca;
  if (typeof raw.fabricante === "string" && raw.fabricante.length > 0) {
    out.fabricante = raw.fabricante;
  }
  if (typeof raw.tipo === "string" && VALID_TYPE.has(raw.tipo as CategoryType)) {
    out.tipo = raw.tipo;
  }
  if (typeof raw.preco_min === "number" && Number.isFinite(raw.preco_min) && raw.preco_min >= 0) {
    out.preco_min = raw.preco_min;
  }
  if (typeof raw.preco_max === "number" && Number.isFinite(raw.preco_max) && raw.preco_max >= 0) {
    out.preco_max = raw.preco_max;
  }
  if (typeof raw.estoque === "number" && raw.estoque === 1) out.estoque = 1;
  if (typeof raw.sort === "string" && VALID_SORT.has(raw.sort as CategorySort)) out.sort = raw.sort;
  if (typeof raw.page === "number" && Number.isFinite(raw.page) && raw.page >= 1) {
    out.page = Math.floor(raw.page);
  }
  return out;
}

export interface ICategoryFiltersState {
  /** Subcategory token (e.g. `oleo` for `filtro`). Free-form to match `IPart.subcategory`. */
  subcategory: string | null;
  /** Compatible-vehicle brand. */
  brand: string | null;
  /** Multi-select part manufacturer brands. */
  manufacturers: string[];
  type: CategoryType;
  priceMin: number | null;
  priceMax: number | null;
  onlyInStock: boolean;
  sort: CategorySort;
  page: number;
}

const ROUTE_ID = "/loja/categoria/$slug" as const;

export interface IUseCategoryFiltersResult {
  state: ICategoryFiltersState;
  setSubcategory: (value: string | null) => void;
  setBrand: (brand: string | null) => void;
  toggleManufacturer: (manufacturer: string) => void;
  setType: (type: CategoryType) => void;
  setPriceRange: (min: number | null, max: number | null) => void;
  setOnlyInStock: (value: boolean) => void;
  setSort: (sort: CategorySort) => void;
  setPage: (page: number) => void;
  reset: () => void;
  activeCount: number;
}

function splitCsv(v?: string): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

function joinCsv(values: string[]): string | undefined {
  return values.length === 0 ? undefined : values.join(",");
}

/**
 * URL-synced filter controller for `/loja/categoria/:slug` (PRD-062 RF-014).
 *
 * Mirrors the spirit of `useSearchFilters` from PRD-061 but with a tighter
 * surface: the category itself is encoded in the path, so we only carry the
 * secondary filters in the query string.
 */
export function useCategoryFilters(): IUseCategoryFiltersResult {
  const raw = useSearch({ from: ROUTE_ID }) as ICategorySearchParams;
  const navigate = useNavigate({ from: ROUTE_ID });

  const state = useMemo<ICategoryFiltersState>(
    () => ({
      subcategory: raw.subcategoria ?? null,
      brand: raw.marca ?? null,
      manufacturers: splitCsv(raw.fabricante),
      type: (raw.tipo as CategoryType | undefined) ?? "all",
      priceMin: raw.preco_min ?? null,
      priceMax: raw.preco_max ?? null,
      onlyInStock: raw.estoque === 1,
      sort: (raw.sort as CategorySort | undefined) ?? "relevance",
      page: raw.page ?? 1,
    }),
    [raw],
  );

  const apply = useCallback(
    (patch: Partial<ICategorySearchParams>, options: { resetPage?: boolean } = {}) => {
      void navigate({
        search: (prev) => {
          const next: ICategorySearchParams = { ...(prev as ICategorySearchParams), ...patch };
          if (options.resetPage !== false) delete next.page;
          for (const key of Object.keys(next) as (keyof ICategorySearchParams)[]) {
            const value = next[key];
            if (
              value === undefined ||
              value === "" ||
              value === null ||
              (key === "estoque" && value === 0)
            ) {
              delete next[key];
            }
          }
          return next;
        },
      });
    },
    [navigate],
  );

  let activeCount = 0;
  if (state.subcategory) activeCount += 1;
  if (state.brand) activeCount += 1;
  if (state.manufacturers.length > 0) activeCount += 1;
  if (state.type !== "all") activeCount += 1;
  if (state.priceMin !== null || state.priceMax !== null) activeCount += 1;
  if (state.onlyInStock) activeCount += 1;

  return {
    state,
    setSubcategory: (value) => apply({ subcategoria: value ?? undefined }),
    setBrand: (brand) => apply({ marca: brand ?? undefined }),
    toggleManufacturer: (manufacturer) => {
      const has = state.manufacturers.includes(manufacturer);
      const next = has
        ? state.manufacturers.filter((m) => m !== manufacturer)
        : [...state.manufacturers, manufacturer];
      apply({ fabricante: joinCsv(next) });
    },
    setType: (type) => apply({ tipo: type === "all" ? undefined : type }),
    setPriceRange: (min, max) =>
      apply({
        preco_min: min ?? undefined,
        preco_max: max ?? undefined,
      }),
    setOnlyInStock: (value) => apply({ estoque: value ? 1 : undefined }),
    setSort: (sort) => apply({ sort: sort === "relevance" ? undefined : sort }),
    setPage: (page) => apply({ page: page <= 1 ? undefined : page }, { resetPage: false }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
