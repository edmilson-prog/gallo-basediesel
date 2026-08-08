import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ID, ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { resolveFicheParticipations, type IFicheView } from "../engine/ficheParticipations";

const EMPTY_FUNNELS: ILeadFunnel[] = [];
const EMPTY_ENTRIES: ILeadFunnelEntry[] = [];

/** Query key of the entries read, exported so mutations can invalidate it. */
export function leadEntriesQueryKey(leadId: ID) {
  return ["lead-funnel-entries-by-lead", leadId] as const;
}

export interface IUseLeadDetailFunnelsResult {
  view: IFicheView;
  /** Funnels the lead is NOT in yet — the list behind "+ Funil". */
  addableFunnels: ILeadFunnel[];
  stagesByFunnel: Map<ID, ILeadFunnelStage[]>;
  /** Sum of the per-participation values — the lead's real weight. */
  totalValue: number;
  isLoading: boolean;
}

/**
 * The lead's participations, read by lead id.
 *
 * The conversation fiche reads the same thing through `listEntriesViaConversation`
 * because the attendant working the pool has to see it without owning the lead.
 * The detail page is the lead's own page — reached through the leads RLS — so it
 * reads by id and shows every participation at once instead of capping at three.
 *
 * The funnels and stages queries reuse the SAME keys as the Leads page
 * (`["lead-funnels", storeId]`, `["lead-funnel-stages", id]`); distinct keys
 * would double the fetch of the heaviest tables in the feature.
 */
export function useLeadDetailFunnels(
  leadId: ID,
  storeId: ID | null | undefined,
): IUseLeadDetailFunnelsResult {
  const provider = useLeadFunnelsProvider();

  const entriesQuery = useQuery({
    queryKey: leadEntriesQueryKey(leadId),
    queryFn: () => provider.listEntriesByLead(leadId),
    enabled: Boolean(leadId),
    staleTime: 30_000,
  });

  const funnelsQuery = useQuery({
    queryKey: ["lead-funnels", storeId] as const,
    queryFn: async () => {
      if (!storeId) return EMPTY_FUNNELS;
      const [all, accessibleIds] = await Promise.all([
        provider.listFunnels(storeId),
        provider.listAccessibleFunnelIds(storeId),
      ]);
      const reach = new Set(accessibleIds);
      return all
        .filter((f) => !f.archivedAt && reach.has(f.id))
        .sort((a, b) => a.position - b.position);
    },
    enabled: Boolean(storeId),
    staleTime: 60_000,
  });

  const funnels = funnelsQuery.data ?? EMPTY_FUNNELS;
  const entries = entriesQuery.data ?? EMPTY_ENTRIES;

  const stageQueries = useQueries({
    queries: funnels.map((f) => ({
      queryKey: ["lead-funnel-stages", f.id] as const,
      queryFn: () => provider.listStages(f.id),
      staleTime: 60_000,
    })),
  });

  // Depend on settled data only — the query objects are new on every render.
  const stagesKey = stageQueries.map((q) => (q.data ? q.data.length : -1)).join(",");

  const stagesByFunnel = useMemo(() => {
    const map = new Map<ID, ILeadFunnelStage[]>();
    funnels.forEach((f, i) => {
      const data = stageQueries[i]?.data;
      if (data) map.set(f.id, [...data].sort((a, b) => a.position - b.position));
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnels, stagesKey]);

  const view = useMemo(
    () =>
      resolveFicheParticipations({
        entries,
        funnels,
        stagesByFunnel,
        // No cap: this is the lead's own page, and "ver todas" behind three
        // rows is a fold that only makes sense in a 360px conversation panel.
        maxVisible: Number.POSITIVE_INFINITY,
      }),
    [entries, funnels, stagesByFunnel],
  );

  const addableFunnels = useMemo(
    () => funnels.filter((f) => !entries.some((e) => e.funnelId === f.id)),
    [funnels, entries],
  );

  const totalValue = useMemo(
    () => view.visible.reduce((sum, p) => sum + (p.entry.estimatedValue ?? 0), 0),
    [view.visible],
  );

  return {
    view,
    addableFunnels,
    stagesByFunnel,
    totalValue,
    isLoading: entriesQuery.isLoading || funnelsQuery.isLoading,
  };
}
