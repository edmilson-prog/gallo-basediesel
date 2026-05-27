import { useCallback, useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import type { MovementType } from "@/shared/types";

export type MovementPeriod = "24h" | "7d" | "30d" | "90d" | "all";

const VALID_TYPE = new Set<MovementType>([
  "saida_venda",
  "entrada_compra",
  "ajuste_inventario",
  "transferencia_loja",
  "devolucao",
]);

const VALID_PERIOD = new Set<MovementPeriod>(["24h", "7d", "30d", "90d", "all"]);

export interface IInventoryMovementSearch {
  tipo?: string;
  produto?: string;
  periodo?: string;
  responsavel?: string;
  loja?: string;
  pagina?: number;
}

export function validateInventoryMovementSearch(
  raw: Record<string, unknown>,
): IInventoryMovementSearch {
  const out: IInventoryMovementSearch = {};
  if (typeof raw.tipo === "string" && VALID_TYPE.has(raw.tipo as MovementType)) {
    out.tipo = raw.tipo;
  }
  if (typeof raw.produto === "string" && raw.produto.trim().length > 0) {
    out.produto = raw.produto.trim();
  }
  if (typeof raw.periodo === "string" && VALID_PERIOD.has(raw.periodo as MovementPeriod)) {
    out.periodo = raw.periodo;
  }
  if (typeof raw.responsavel === "string" && raw.responsavel.length > 0) {
    out.responsavel = raw.responsavel;
  }
  if (typeof raw.loja === "string" && raw.loja.length > 0) {
    out.loja = raw.loja;
  }
  if (typeof raw.pagina === "number" && Number.isFinite(raw.pagina) && raw.pagina >= 1) {
    out.pagina = Math.floor(raw.pagina);
  }
  return out;
}

export interface IInventoryMovementFiltersState {
  type: MovementType | "all";
  productQuery: string;
  period: MovementPeriod;
  sellerId: ID | "all";
  storeId: ID | "all";
  page: number;
}

const ROUTE_ID = "/app/gestao/estoque-movimentacao" as const;

export interface IUseInventoryMovementFiltersResult {
  state: IInventoryMovementFiltersState;
  setType: (t: MovementType | "all") => void;
  setProductQuery: (q: string) => void;
  setPeriod: (p: MovementPeriod) => void;
  setSellerId: (id: ID | "all") => void;
  setStoreId: (id: ID | "all") => void;
  setPage: (page: number) => void;
  reset: () => void;
  activeCount: number;
}

export function useInventoryMovementFilters(): IUseInventoryMovementFiltersResult {
  const search = useSearch({ from: ROUTE_ID }) as IInventoryMovementSearch;
  const navigate = useNavigate({ from: ROUTE_ID });

  const state = useMemo<IInventoryMovementFiltersState>(
    () => ({
      type: (search.tipo as MovementType | undefined) ?? "all",
      productQuery: search.produto ?? "",
      period: (search.periodo as MovementPeriod | undefined) ?? "all",
      sellerId: search.responsavel ?? "all",
      storeId: search.loja ?? "all",
      page: search.pagina ?? 1,
    }),
    [search],
  );

  const apply = useCallback(
    (patch: Partial<IInventoryMovementSearch>, resetPage = true) => {
      void navigate({
        search: (prev) => {
          const next: IInventoryMovementSearch = {
            ...(prev as IInventoryMovementSearch),
            ...patch,
          };
          if (resetPage) delete next.pagina;
          for (const key of Object.keys(next) as (keyof IInventoryMovementSearch)[]) {
            const v = next[key];
            if (v === undefined || v === "" || v === "all") delete next[key];
          }
          return next;
        },
      });
    },
    [navigate],
  );

  let activeCount = 0;
  if (state.type !== "all") activeCount += 1;
  if (state.productQuery.length > 0) activeCount += 1;
  if (state.period !== "all") activeCount += 1;
  if (state.sellerId !== "all") activeCount += 1;
  if (state.storeId !== "all") activeCount += 1;

  return {
    state,
    setType: (t) => apply({ tipo: t === "all" ? undefined : t }),
    setProductQuery: (q) => apply({ produto: q.length === 0 ? undefined : q }),
    setPeriod: (p) => apply({ periodo: p === "all" ? undefined : p }),
    setSellerId: (id) => apply({ responsavel: id === "all" ? undefined : id }),
    setStoreId: (id) => apply({ loja: id === "all" ? undefined : id }),
    setPage: (page) => apply({ pagina: page <= 1 ? undefined : page }, false),
    reset: () => void navigate({ search: () => ({}) }),
    activeCount,
  };
}
