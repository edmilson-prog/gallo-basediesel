import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ILead, ID } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { useLeadsProvider } from "@/providers/data/hooks/useLeadsProvider";
import { CLOSING_STAGE_ID, daysInStage, isConverted, isLost } from "../utils/leadDisplay";
import { getNextActionInfo } from "../utils/leadDisplay";
import type { ILeadsListFilters, ILeadsListSort } from "../utils/listFilters";

export interface IUseLeadsListParams {
  filters: ILeadsListFilters;
  sort: ILeadsListSort;
  storeId?: ID;
  sellerScopeIds?: ID[];
  /** When provided overrides server-side store filter (Owner cross-store). */
  ownerCrossStore?: boolean;
}

export interface IUseLeadsListResult {
  leads: ILead[];
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useLeadsList({
  filters,
  sort,
  storeId,
  sellerScopeIds,
  ownerCrossStore = false,
}: IUseLeadsListParams): IUseLeadsListResult {
  const provider = useLeadsProvider();

  const excludeLost = !filters.includeLost;

  const query = useQuery({
    // excludeLost is part of the key (not just the queryFn closure) so
    // toggling "Mostrar perdidos" triggers a real refetch instead of
    // reapplying the client-side filter over an already-narrowed cache.
    queryKey: ["leads-list", ownerCrossStore ? "all" : storeId, excludeLost] as const,
    queryFn: () =>
      provider.list({
        storeId: ownerCrossStore ? undefined : storeId,
        pageSize: FETCH_ALL_PAGE_SIZE,
        // Mirrors filters.includeLost: default false, so lost leads are
        // excluded server-side and don't inflate the fetched set with
        // inactive rows. When the toggle is on, the exclusion is lifted.
        excludeLost,
      }),
    staleTime: 30_000,
  });

  const filtered = useMemo<ILead[]>(() => {
    const all = query.data?.data ?? [];
    if (all.length === 0) return [];

    const now = new Date();
    const searchTerm = filters.search.trim().toLowerCase();

    let result = all;

    if (sellerScopeIds && sellerScopeIds.length > 0) {
      const set = new Set(sellerScopeIds);
      result = result.filter((l) => l.sellerId !== null && set.has(l.sellerId));
    }

    if (!filters.includeLost) {
      result = result.filter((l) => !isLost(l));
    }
    if (!filters.includeConverted) {
      result = result.filter((l) => !isConverted(l));
    }

    if (filters.stageIds.length > 0) {
      const set = new Set(filters.stageIds);
      result = result.filter((l) => set.has(l.stage.id));
    }
    if (filters.temperatures.length > 0) {
      const set = new Set(filters.temperatures);
      result = result.filter((l) => set.has(l.temperature));
    }
    if (filters.origins.length > 0) {
      const set = new Set(filters.origins);
      result = result.filter((l) => set.has(l.origin));
    }
    if (filters.sellerIds.length > 0) {
      const set = new Set(filters.sellerIds);
      result = result.filter((l) => l.sellerId !== null && set.has(l.sellerId));
    }
    if (filters.storeIds.length > 0) {
      const set = new Set(filters.storeIds);
      result = result.filter((l) => set.has(l.storeId));
    }

    if (filters.nextAction !== "any") {
      result = result.filter((l) => {
        const info = getNextActionInfo(l.nextActionAt, now);
        switch (filters.nextAction) {
          case "overdue":
            return info.urgency === "overdue";
          case "today":
            return info.urgency === "today";
          case "thisWeek":
            return (
              info.urgency === "today" ||
              info.urgency === "tomorrow" ||
              (info.diffDays <= 0 && info.diffDays >= -7)
            );
          case "future":
            return info.urgency === "future" || info.urgency === "tomorrow";
          default:
            return true;
        }
      });
    }

    if (filters.period !== "any") {
      const cutoff =
        filters.period === "24h"
          ? now.getTime() - 86_400_000
          : filters.period === "7d"
            ? now.getTime() - 7 * 86_400_000
            : now.getTime() - 30 * 86_400_000;
      result = result.filter((l) => new Date(l.createdAt).getTime() >= cutoff);
    }

    if (filters.valueMin !== undefined) {
      const min = filters.valueMin;
      result = result.filter((l) => (l.estimatedValue ?? 0) >= min);
    }
    if (filters.valueMax !== undefined) {
      const max = filters.valueMax;
      result = result.filter((l) => (l.estimatedValue ?? Number.POSITIVE_INFINITY) <= max);
    }

    if (searchTerm.length > 0) {
      result = result.filter((l) =>
        `${l.name} ${l.phone} ${l.email ?? ""}`.toLowerCase().includes(searchTerm),
      );
    }

    const dir = sort.orderDir === "asc" ? 1 : -1;
    const sorted = [...result].sort((a, b) => {
      switch (sort.orderBy) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "temperature": {
          const order = { frio: 0, morno: 1, quente: 2 } as const;
          return (order[a.temperature] - order[b.temperature]) * dir;
        }
        case "estimatedValue":
          return ((a.estimatedValue ?? 0) - (b.estimatedValue ?? 0)) * dir;
        case "nextActionAt": {
          const av = a.nextActionAt ? new Date(a.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER;
          const bv = b.nextActionAt ? new Date(b.nextActionAt).getTime() : Number.MAX_SAFE_INTEGER;
          return (av - bv) * dir;
        }
        case "daysInStage":
          return (daysInStage(a, now) - daysInStage(b, now)) * dir;
        case "createdAt":
        default:
          return a.createdAt.localeCompare(b.createdAt) * dir;
      }
    });

    return sorted;
  }, [query.data, filters, sort, sellerScopeIds]);

  void CLOSING_STAGE_ID;

  return {
    leads: filtered,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}
