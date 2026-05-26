import { useQuery } from "@tanstack/react-query";
import type { ID, ILossReason, IPipelineStage } from "@/shared/types";
import { useSettingsProvider } from "@/providers/data/hooks/useSettingsProvider";
import { sortStages } from "../utils/leadDisplay";

export interface IPipelineSettings {
  stages: IPipelineStage[];
  lossReasons: ILossReason[];
}

/**
 * Defaults used when the settings provider hasn't returned anything yet.
 * Mirrors `SEED_PIPELINE_STAGES` / `SEED_LOSS_REASONS` without importing the
 * mock data layer (forbidden outside the mock provider implementation).
 */
const FALLBACK_STAGES: IPipelineStage[] = sortStages([
  { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" },
  { id: "stage-qualificacao", name: "Em qualificação", order: 2, color: "#D2A809" },
  { id: "stage-orcamento", name: "Orçamento enviado", order: 3, color: "#337648" },
  { id: "stage-negociacao", name: "Em negociação", order: 4, color: "#C79C2C" },
  { id: "stage-fechado", name: "Convertido / Perdido", order: 5, color: "#C4151C" },
]);

const FALLBACK_LOSS_REASONS: ILossReason[] = [
  { id: "loss-preco", name: "Preço acima da concorrência", active: true },
  { id: "loss-prazo", name: "Prazo de entrega longo demais", active: true },
  { id: "loss-pagamento", name: "Condição de pagamento incompatível", active: true },
  { id: "loss-sem-estoque", name: "Sem estoque da peça pedida", active: true },
  { id: "loss-comprou-fora", name: "Cliente comprou em outro fornecedor", active: true },
  { id: "loss-desistencia", name: "Cliente desistiu da compra", active: true },
  { id: "loss-sem-contato", name: "Cliente sumiu / sem retorno", active: true },
  { id: "loss-outro", name: "Outro motivo", active: true },
];

const FALLBACK_SETTINGS: IPipelineSettings = {
  stages: FALLBACK_STAGES,
  lossReasons: FALLBACK_LOSS_REASONS,
};

export function usePipelineSettings(storeId: ID | null | undefined): IPipelineSettings {
  const settingsProvider = useSettingsProvider();

  const query = useQuery({
    queryKey: ["pipeline-settings", storeId] as const,
    enabled: Boolean(storeId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const settings = await settingsProvider.get(storeId as ID);
      return {
        stages: sortStages(settings.pipelineStages ?? FALLBACK_STAGES),
        lossReasons: settings.lossReasons ?? FALLBACK_LOSS_REASONS,
      } satisfies IPipelineSettings;
    },
  });

  return query.data ?? FALLBACK_SETTINGS;
}
