import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { PartCategory } from "@/shared/types";
import { PART_CATEGORY_DESCRIPTORS } from "@/features/catalog";

export type SearchSort = "relevance" | "price-asc" | "price-desc" | "top-selling" | "newest";
export type SearchType = "all" | "original" | "equivalent";

const VALID_CATEGORIES = new Set<PartCategory>(
  PART_CATEGORY_DESCRIPTORS.map((d) => d.value) as PartCategory[],
);
const VALID_SORT = new Set<SearchSort>([
  "relevance",
  "price-asc",
  "price-desc",
  "top-selling",
  "newest",
]);
const VALID_TYPE = new Set<SearchType>(["all", "original", "equivalent"]);

export interface ISearchSearchParams {
  q?: string;
  marca?: string;
  categoria?: string;
  fabricante?: string;
  tipo?: string;
  preco_min?: number;
  preco_max?: number;
  estoque?: number;
  veiculo_marca?: string;
  veiculo_modelo?: string;
  veiculo_ano?: number;
  sort?: string;
  page?: number;
}

export function validateSearchSearch(raw: Record<string, unknown>): ISearchSearchParams {
  const out: ISearchSearchParams = {};
  if (typeof raw.q === "string" && raw.q.trim().length > 0) out.q = raw.q.trim();
  if (typeof raw.marca === "string" && raw.marca.length > 0) out.marca = raw.marca;
  if (typeof raw.categoria === "string" && raw.categoria.length > 0) out.categoria = raw.categoria;
  if (typeof raw.fabricante === "string" && raw.fabricante.length > 0) {
    out.fabricante = raw.fabricante;
  }
  if (typeof raw.tipo === "string" && VALID_TYPE.has(raw.tipo as SearchType)) {
    out.tipo = raw.tipo;
  }
  if (typeof raw.preco_min === "number" && Number.isFinite(raw.preco_min) && raw.preco_min >= 0) {
    out.preco_min = raw.preco_min;
  }
  if (typeof raw.preco_max === "number" && Number.isFinite(raw.preco_max) && raw.preco_max >= 0) {
    out.preco_max = raw.preco_max;
  }
  if (typeof raw.estoque === "number" && raw.estoque === 1) out.estoque = 1;
  if (typeof raw.veiculo_marca === "string" && raw.veiculo_marca.length > 0) {
    out.veiculo_marca = raw.veiculo_marca;
  }
  if (typeof raw.veiculo_modelo === "string" && raw.veiculo_modelo.length > 0) {
    out.veiculo_modelo = raw.veiculo_modelo;
  }
  if (
    typeof raw.veiculo_ano === "number" &&
    Number.isFinite(raw.veiculo_ano) &&
    raw.veiculo_ano >= 1990 &&
    raw.veiculo_ano <= 2030
  ) {
    out.veiculo_ano = Math.floor(raw.veiculo_ano);
  }
  if (typeof raw.sort === "string" && VALID_SORT.has(raw.sort as SearchSort)) out.sort = raw.sort;
  if (typeof raw.page === "number" && Number.isFinite(raw.page) && raw.page >= 1) {
    out.page = Math.floor(raw.page);
  }
  return out;
}

export interface ISearchFiltersState {
  q: string;
  /** Compatible-vehicle brand selected via the brand radio (top-level). */
  brand: string | null;
  /** Multi-select catalog categories. */
  categories: PartCategory[];
  /** Multi-select part manufacturer brands. */
  manufacturers: string[];
  type: SearchType;
  priceMin: number | null;
  priceMax: number | null;
  onlyInStock: boolean;
  vehicle: {
    brand: string | null;
    model: string | null;
    year: number | null;
  };
  sort: SearchSort;
  page: number;
}

const ROUTE_ID = "/loja/busca" as const;

export interface IUseSearchFiltersResult {
  state: ISearchFiltersState;
  setQuery: (q: string) => void;
  setBrand: (brand: string | null) => void;
  toggleCategory: (cat: PartCategory) => void;
  toggleManufacturer: (manufacturer: string) => void;
  setType: (type: SearchType) => void;
  setPriceRange: (min: number | null, max: number | null) => void;
  setOnlyInStock: (value: boolean) => void;
  setVehicle: (brand: string | null, model: string | null, year: number | null) => void;
  setSort: (sort: SearchSort) => void;
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
 * URL-synced filter controller for `/loja/busca`. Search params are the
 * single source of truth so any link can reproduce the same view (PRD-061
 * RF-021/022).
 */
export function useSearchFilters(): IUseSearchFiltersResult {
  const raw = useSearch({ from: ROUTE_ID }) as ISearchSearchParams;
  const navigate = useNavigate({ from: ROUTE_ID });

  const state = useMemo<ISearchFiltersState>(() => {
    const categories = splitCsv(raw.categoria).filter((c): c is PartCategory =>
      VALID_CATEGORIES.has(c as PartCategory),
    );
    return {
      q: raw.q ?? "",
      brand: raw.marca ?? null,
      categories,
      manufacturers: splitCsv(raw.fabricante),
      type: (raw.tipo as SearchType | undefined) ?? "all",
      priceMin: raw.preco_min ?? null,
      priceMax: raw.preco_max ?? null,
      onlyInStock: raw.estoque === 1,
      vehicle: {
        brand: raw.veiculo_marca ?? null,
        model: raw.veiculo_modelo ?? null,
        year: raw.veiculo_ano ?? null,
      },
      sort: (raw.sort as SearchSort | undefined) ?? "relevance",
      page: raw.page ?? 1,
    };
  }, [raw]);

  const apply = useCallback(
    (patch: Partial<ISearchSearchParams>, options: { resetPage?: boolean } = {}) => {
      void navigate({
        search: (prev) => {
          const next: ISearchSearchParams = { ...(prev as ISearchSearchParams), ...patch };
          if (options.resetPage !== false) delete next.page;
          for (const key of Object.keys(next) as (keyof ISearchSearchParams)[]) {
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
  if (state.brand) activeCount += 1;
  if (state.categories.length > 0) activeCount += 1;
  if (state.manufacturers.length > 0) activeCount += 1;
  if (state.type !== "all") activeCount += 1;
  if (state.priceMin !== null || state.priceMax !== null) activeCount += 1;
  if (state.onlyInStock) activeCount += 1;
  if (state.vehicle.brand || state.vehicle.model || state.vehicle.year) activeCount += 1;

  return {
    state,
    setQuery: (q) => apply({ q: q.trim().length === 0 ? undefined : q }),
    setBrand: (brand) => apply({ marca: brand ?? undefined }),
    toggleCategory: (cat) => {
      const has = state.categories.includes(cat);
      const next = has ? state.categories.filter((c) => c !== cat) : [...state.categories, cat];
      apply({ categoria: joinCsv(next) });
    },
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
    setVehicle: (brand, model, year) =>
      apply({
        veiculo_marca: brand ?? undefined,
        veiculo_modelo: model ?? undefined,
        veiculo_ano: year ?? undefined,
      }),
    setSort: (sort) => apply({ sort: sort === "relevance" ? undefined : sort }),
    setPage: (page) => apply({ page: page <= 1 ? undefined : page }, { resetPage: false }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
