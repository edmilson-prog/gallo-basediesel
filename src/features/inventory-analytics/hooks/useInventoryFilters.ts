import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { InventoryCurve, InventoryStatus } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";

export type InventoryTab = "overview" | "critical" | "xyz" | "excess";

const VALID_TABS = new Set<InventoryTab>(["overview", "critical", "xyz", "excess"]);
const VALID_CURVE = new Set<InventoryCurve>(["X", "Y", "Z"]);
const VALID_STATUS = new Set<InventoryStatus>(["ok", "baixo", "critico", "excesso"]);
const VALID_CATEGORY = new Set<PartCategory>([
  "filtro",
  "freio",
  "correia",
  "motor",
  "embreagem",
  "eletrica",
  "transmissao",
  "suspensao",
  "arrefecimento",
  "lubrificante",
]);

export interface IInventoryFiltersSearch {
  aba?: string;
  categoria?: string;
  marca?: string;
  status?: string;
  curva?: string;
}

export function validateInventorySearch(raw: Record<string, unknown>): IInventoryFiltersSearch {
  const out: IInventoryFiltersSearch = {};
  if (typeof raw.aba === "string" && VALID_TABS.has(raw.aba as InventoryTab)) out.aba = raw.aba;
  if (typeof raw.categoria === "string" && VALID_CATEGORY.has(raw.categoria as PartCategory)) {
    out.categoria = raw.categoria;
  }
  if (typeof raw.marca === "string" && raw.marca.length > 0) out.marca = raw.marca;
  if (typeof raw.status === "string" && VALID_STATUS.has(raw.status as InventoryStatus)) {
    out.status = raw.status;
  }
  if (typeof raw.curva === "string" && VALID_CURVE.has(raw.curva as InventoryCurve)) {
    out.curva = raw.curva;
  }
  return out;
}

export interface IInventoryFiltersState {
  tab: InventoryTab;
  category: PartCategory | "all";
  brand: string | "all";
  status: InventoryStatus | "all";
  curve: InventoryCurve | "all";
}

const ROUTE_ID = "/app/gestao/estoque" as const;

export interface IUseInventoryFiltersResult {
  state: IInventoryFiltersState;
  setTab: (tab: InventoryTab) => void;
  setCategory: (cat: PartCategory | "all") => void;
  setBrand: (brand: string | "all") => void;
  setStatus: (status: InventoryStatus | "all") => void;
  setCurve: (curve: InventoryCurve | "all") => void;
  reset: () => void;
  activeCount: number;
}

export function useInventoryFilters(): IUseInventoryFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IInventoryFiltersSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const state = useMemo<IInventoryFiltersState>(
    () => ({
      tab: (search.aba as InventoryTab | undefined) ?? "overview",
      category: (search.categoria as PartCategory | undefined) ?? "all",
      brand: search.marca ?? "all",
      status: (search.status as InventoryStatus | undefined) ?? "all",
      curve: (search.curva as InventoryCurve | undefined) ?? "all",
    }),
    [search],
  );

  const apply = useCallback(
    (patch: Partial<IInventoryFiltersSearch>) => {
      void navigate({
        search: (prev) => {
          const next: IInventoryFiltersSearch = {
            ...(prev as IInventoryFiltersSearch),
            ...patch,
          };
          for (const key of Object.keys(next) as (keyof IInventoryFiltersSearch)[]) {
            const v = next[key];
            if (v === undefined || v === "") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  let activeCount = 0;
  if (state.category !== "all") activeCount += 1;
  if (state.brand !== "all") activeCount += 1;
  if (state.status !== "all") activeCount += 1;
  if (state.curve !== "all") activeCount += 1;

  return {
    state,
    setTab: (tab) => apply({ aba: tab === "overview" ? undefined : tab }),
    setCategory: (cat) => apply({ categoria: cat === "all" ? undefined : cat }),
    setBrand: (brand) => apply({ marca: brand === "all" ? undefined : brand }),
    setStatus: (status) => apply({ status: status === "all" ? undefined : status }),
    setCurve: (curve) => apply({ curva: curve === "all" ? undefined : curve }),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
