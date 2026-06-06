// src/features/media/hooks/useMediaFilters.ts
import { useCallback, useMemo, useState } from "react";
import type { IMediaAsset, IMediaClassification } from "@/shared/types";

export type MediaFilterScope = "conversation" | "customer";

export interface IMediaFilterState {
  search: string;
  kind: IMediaAsset["kind"] | "all";
  authorType: IMediaAsset["authorType"] | "all";
  period: "all" | "7d" | "30d" | "90d";
  /** Only meaningful when scope === "customer". */
  classification: IMediaClassification | "all";
}

const EMPTY: IMediaFilterState = {
  search: "",
  kind: "all",
  authorType: "all",
  period: "all",
  classification: "all",
};

export interface IUseMediaFilters {
  scope: MediaFilterScope;
  filters: IMediaFilterState;
  setFilter: <K extends keyof IMediaFilterState>(key: K, value: IMediaFilterState[K]) => void;
  reset: () => void;
  /** Count of non-default filters (excludes free-text search). */
  activeCount: number;
}

export function useMediaFilters(scope: MediaFilterScope): IUseMediaFilters {
  const [filters, setFilters] = useState<IMediaFilterState>(EMPTY);

  const setFilter = useCallback(
    <K extends keyof IMediaFilterState>(key: K, value: IMediaFilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const reset = useCallback(() => setFilters(EMPTY), []);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.kind !== "all") n++;
    if (filters.authorType !== "all") n++;
    if (filters.period !== "all") n++;
    if (scope === "customer" && filters.classification !== "all") n++;
    return n;
  }, [filters, scope]);

  return { scope, filters, setFilter, reset, activeCount };
}
