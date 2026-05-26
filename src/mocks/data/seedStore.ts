import type { IStore } from "@/shared/types";
import { SEED_PIPELINE_STAGES } from "./seedPipelineStages";
import { SEED_LOSS_REASONS } from "./seedLossReasons";
import { SEED_TAGS } from "./seedTags";
import { DEFAULT_DISTRIBUTION_SETTINGS } from "./seedDistribution";

export const SEED_STORE_ID = "store-matriz";

/**
 * Headquarters store (Matriz) — the only store created on the MVP.
 * Multi-store activation lives in PRD-007.
 */
export const SEED_STORE: IStore = {
  id: SEED_STORE_ID,
  name: "GALLO BASE DIESEL — Matriz",
  type: "matriz",
  address: "Av. Brasil, 1500 — Centro, Frederico Westphalen / RS — CEP 98400-000",
  cnpj: "12.345.678/0001-90",
  activeDivisions: ["parts"],
  createdAt: "2026-01-01T00:00:00.000Z",
  settings: {
    storeId: "store-matriz",
    lifecycleThresholds: {
      dormantDays: 60,
      lostDays: 180,
    },
    vehicleCadastroMode: "aprovacao_obrigatoria",
    tagSuggestions: SEED_TAGS,
    pipelineStages: SEED_PIPELINE_STAGES,
    lossReasons: SEED_LOSS_REASONS,
    gamificationRules: {
      pointsPerOrder: 10,
      pointsPerRecovery: 25,
      pointsPerPositivation: 15,
    },
    whatsappAccounts: [
      { id: "wa-meta-matriz", label: "GALLO Matriz (Oficial)" },
      { id: "wa-evo-campanhas", label: "GALLO Campanhas" },
    ],
    defaultDivision: "parts",
    distribution: DEFAULT_DISTRIBUTION_SETTINGS,
  },
};
