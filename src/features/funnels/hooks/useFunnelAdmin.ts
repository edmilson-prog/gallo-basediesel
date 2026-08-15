import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ID, ILeadFunnel, ILeadFunnelStage, ISeller } from "@/shared/types";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { useSellersProvider } from "@/providers/data/hooks/useSellersProvider";

const EMPTY_FUNNELS: ILeadFunnel[] = [];
const EMPTY_SELLERS: ISeller[] = [];

export interface IUseFunnelAdminResult {
  /** Every funnel of the store, archived included — this screen manages both. */
  funnels: ILeadFunnel[];
  sellers: ISeller[];
  stagesByFunnel: Map<ID, ILeadFunnelStage[]>;
  /** Participations per stage, for the delete guard. */
  leadCountByStage: Map<ID, number>;
  accessByFunnel: Map<ID, ID[]>;
  isLoading: boolean;
}

/**
 * Everything the funnel administration screen reads.
 *
 * Unlike the navigation hook, this one asks for archived funnels too: the rail
 * has to show them, and un-archiving is only reachable from here.
 *
 * The lead counts come from `getBoardSummary`, the same server-side aggregate
 * the board header uses. Counting rows in the client would count the page that
 * happens to be loaded, and the delete guard has to know about all of them.
 */
export function useFunnelAdmin(storeId: ID | null | undefined): IUseFunnelAdminResult {
  const provider = useLeadFunnelsProvider();
  const sellersProvider = useSellersProvider();

  const funnelsQuery = useQuery({
    queryKey: ["lead-funnels-admin", storeId] as const,
    queryFn: () => (storeId ? provider.listFunnels(storeId, { includeArchived: true }) : EMPTY_FUNNELS),
    enabled: Boolean(storeId),
    staleTime: 30_000,
  });

  const sellersQuery = useQuery({
    queryKey: ["sellers-list", storeId, "all"] as const,
    queryFn: () => sellersProvider.list({ storeId: storeId ?? undefined }),
    enabled: Boolean(storeId),
    staleTime: 60_000,
  });

  const funnels = useMemo(
    () => [...(funnelsQuery.data ?? EMPTY_FUNNELS)].sort((a, b) => a.position - b.position),
    [funnelsQuery.data],
  );

  const stageQueries = useQueries({
    queries: funnels.map((f) => ({
      queryKey: ["lead-funnel-stages", f.id] as const,
      queryFn: () => provider.listStages(f.id),
      staleTime: 60_000,
    })),
  });

  const summaryQueries = useQueries({
    queries: funnels.map((f) => ({
      queryKey: ["lead-funnel-board-summary", f.id] as const,
      queryFn: () => provider.getBoardSummary(f.id),
      staleTime: 30_000,
    })),
  });

  const accessQueries = useQueries({
    queries: funnels.map((f) => ({
      queryKey: ["lead-funnel-access", f.id] as const,
      queryFn: () => provider.listAccess(f.id),
      staleTime: 60_000,
    })),
  });

  // Depend on settled data only — the query objects are new on every render.
  const stagesKey = stageQueries.map((q) => (q.data ? q.data.length : -1)).join(",");
  const summaryKey = summaryQueries.map((q) => (q.data ? q.data.length : -1)).join(",");
  const accessKey = accessQueries.map((q) => (q.data ? q.data.length : -1)).join(",");

  const stagesByFunnel = useMemo(() => {
    const map = new Map<ID, ILeadFunnelStage[]>();
    funnels.forEach((f, i) => {
      const data = stageQueries[i]?.data;
      if (data) map.set(f.id, [...data].sort((a, b) => a.position - b.position));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnels, stagesKey]);

  const leadCountByStage = useMemo(() => {
    const map = new Map<ID, number>();
    funnels.forEach((_, i) => {
      for (const row of summaryQueries[i]?.data ?? []) map.set(row.stageId, row.count);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnels, summaryKey]);

  const accessByFunnel = useMemo(() => {
    const map = new Map<ID, ID[]>();
    funnels.forEach((f, i) => {
      const data = accessQueries[i]?.data;
      if (data) map.set(f.id, data);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnels, accessKey]);

  return {
    funnels,
    sellers: sellersQuery.data ?? EMPTY_SELLERS,
    stagesByFunnel,
    leadCountByStage,
    accessByFunnel,
    isLoading: funnelsQuery.isLoading,
  };
}
