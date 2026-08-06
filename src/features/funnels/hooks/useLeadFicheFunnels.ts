import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ID, ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";
import { resolveFicheParticipations, type IFicheView } from "../engine/ficheParticipations";

/** Three fit above the fold; the rest wait behind "ver todas" (spec §8). */
export const FICHE_MAX_VISIBLE = 3;

const EMPTY_FUNNELS: ILeadFunnel[] = [];
const EMPTY_ENTRIES: ILeadFunnelEntry[] = [];

export interface IUseLeadFicheFunnelsInput {
  conversationId: ID;
  storeId: ID | null | undefined;
  /** "Ver todas" lifts the cap instead of paginating a list of three. */
  expanded: boolean;
}

export interface IUseLeadFicheFunnelsResult {
  view: IFicheView;
  /** Funnels the lead is NOT in yet — the list behind the `[+]`. */
  addableFunnels: ILeadFunnel[];
  stagesByFunnel: Map<ID, ILeadFunnelStage[]>;
  isLoading: boolean;
}

/**
 * The lead's participations, read through the conversation.
 *
 * `listEntriesViaConversation`, not `listEntriesByLead`: the attendant working
 * the pool has to see this fiche without owning the lead, and it is the
 * conversation that grants them that. Mirrors `ILeadsProvider.getViaConversation`.
 *
 * The funnels and stages queries reuse the SAME keys as the Leads page
 * (`["lead-funnels", storeId]`, `["lead-funnel-stages", id]`). Distinct keys
 * would double the fetch of the heaviest tables in the feature on a screen a
 * user often has open beside that page.
 */
export function useLeadFicheFunnels({
  conversationId,
  storeId,
  expanded,
}: IUseLeadFicheFunnelsInput): IUseLeadFicheFunnelsResult {
  const provider = useLeadFunnelsProvider();

  const entriesQuery = useQuery({
    queryKey: ["lead-funnel-entries-via-conversation", conversationId] as const,
    queryFn: () => provider.listEntriesViaConversation(conversationId),
    enabled: Boolean(conversationId),
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
      if (data) map.set(f.id, data);
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
        maxVisible: expanded ? Number.POSITIVE_INFINITY : FICHE_MAX_VISIBLE,
      }),
    [entries, funnels, stagesByFunnel, expanded],
  );

  const addableFunnels = useMemo(
    () => funnels.filter((f) => !entries.some((e) => e.funnelId === f.id)),
    [funnels, entries],
  );

  return {
    view,
    addableFunnels,
    stagesByFunnel,
    isLoading: entriesQuery.isLoading || funnelsQuery.isLoading,
  };
}
