import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ID, ILeadFunnel } from "@/shared/types";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";

export interface ILeadFunnelChip {
  funnelId: ID;
  name: string;
  accent: ILeadFunnel["accent"];
}

/**
 * Funnel chips per lead, for the list's "Funis" column.
 *
 * Indexes each funnel's memberships ONCE and inverts them into a lead→funnels
 * map. Resolving membership lead by lead is the O(leads × entries) shape the
 * phase-2 review already removed from listByFunnel; repeating it here would
 * reintroduce it on a page that renders up to a thousand rows.
 */
export function useLeadFunnelChips(funnels: ILeadFunnel[]): Map<ID, ILeadFunnelChip[]> {
  const provider = useLeadFunnelsProvider();

  const queries = useQueries({
    queries: funnels.map((f) => ({
      queryKey: ["lead-funnel-entries", f.id] as const,
      queryFn: () => provider.listEntriesByFunnel(f.id),
      staleTime: 30_000,
    })),
  });

  // Depend on the settled data only: the query objects are new every render.
  const dataKey = queries.map((q) => (q.data ? q.data.length : -1)).join(",");

  return useMemo(() => {
    const byLead = new Map<ID, ILeadFunnelChip[]>();
    funnels.forEach((f, i) => {
      const entries = queries[i]?.data;
      if (!entries) return;
      for (const e of entries) {
        const list = byLead.get(e.leadId);
        const chip: ILeadFunnelChip = { funnelId: f.id, name: f.name, accent: f.accent };
        if (list) list.push(chip);
        else byLead.set(e.leadId, [chip]);
      }
    });
    return byLead;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnels, dataKey]);
}
