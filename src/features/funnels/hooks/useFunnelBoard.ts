import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ID, IFunnelBoardSummary, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { useLeadFunnelsProvider } from "@/providers/data/hooks/useLeadFunnelsProvider";

const EMPTY_STAGES: ILeadFunnelStage[] = [];

export interface IFunnelBoardResult {
  stages: ILeadFunnelStage[];
  entriesByLead: Map<ID, ILeadFunnelEntry>;
  summaryByStage: Map<ID, IFunnelBoardSummary>;
  isLoading: boolean;
}

/**
 * Etapas, participações e agregados do funil ativo.
 *
 * A chave das participações é a MESMA de `useLeadFunnelChips`
 * (`["lead-funnel-entries", funnelId]`) de propósito: a página monta os dois, e
 * chaves distintas dobrariam o fetch da tabela mais pesada da feature.
 *
 * Os agregados vêm do servidor (`getBoardSummary`) porque contar linhas no
 * cliente contaria só a página carregada — o cabeçalho precisa do total real.
 */
export function useFunnelBoard(funnelId: ID | null): IFunnelBoardResult {
  const provider = useLeadFunnelsProvider();
  const enabled = Boolean(funnelId);

  const [stagesQuery, entriesQuery, summaryQuery] = useQueries({
    queries: [
      {
        queryKey: ["lead-funnel-stages", funnelId] as const,
        queryFn: () => provider.listStages(funnelId as ID),
        enabled,
        staleTime: 60_000,
      },
      {
        queryKey: ["lead-funnel-entries", funnelId] as const,
        queryFn: () => provider.listEntriesByFunnel(funnelId as ID),
        enabled,
        staleTime: 30_000,
      },
      {
        queryKey: ["lead-funnel-board-summary", funnelId] as const,
        queryFn: () => provider.getBoardSummary(funnelId as ID),
        enabled,
        staleTime: 30_000,
      },
    ],
  });

  const stages = useMemo(
    () => [...(stagesQuery?.data ?? EMPTY_STAGES)].sort((a, b) => a.position - b.position),
    [stagesQuery?.data],
  );

  const entriesByLead = useMemo(() => {
    const map = new Map<ID, ILeadFunnelEntry>();
    for (const e of entriesQuery?.data ?? []) map.set(e.leadId, e);
    return map;
  }, [entriesQuery?.data]);

  const summaryByStage = useMemo(() => {
    const map = new Map<ID, IFunnelBoardSummary>();
    for (const s of summaryQuery?.data ?? []) map.set(s.stageId, s);
    return map;
  }, [summaryQuery?.data]);

  return {
    stages,
    entriesByLead,
    summaryByStage,
    isLoading: Boolean(stagesQuery?.isLoading) || Boolean(entriesQuery?.isLoading),
  };
}
