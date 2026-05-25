import type { IPipelineStage } from "@/shared/types";

/**
 * Default lead pipeline used by PRD-017 (Kanban + Lista).
 * Colors map to the GALLO semantic tokens for status indicators.
 */
export const SEED_PIPELINE_STAGES: IPipelineStage[] = [
  { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" },
  { id: "stage-qualificacao", name: "Em qualificação", order: 2, color: "#D2A809" },
  { id: "stage-orcamento", name: "Orçamento enviado", order: 3, color: "#337648" },
  { id: "stage-negociacao", name: "Em negociação", order: 4, color: "#C79C2C" },
  { id: "stage-fechado", name: "Convertido / Perdido", order: 5, color: "#C4151C" },
];
