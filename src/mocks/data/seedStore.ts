import type { IStore } from "@/shared/types";
import { SEED_PIPELINE_STAGES } from "./seedPipelineStages";
import { SEED_LOSS_REASONS } from "./seedLossReasons";
import { SEED_TAGS } from "./seedTags";
import { DEFAULT_DISTRIBUTION_SETTINGS } from "./seedDistribution";
import { DEFAULT_MANAGER_DASHBOARD_SETTINGS } from "./seedManagerDashboard";
import { DEFAULT_SDR_TEMPLATES } from "@/features/sdr/templates/defaults";
import { DEFAULT_SDR_QUOTE_TEMPLATES } from "@/features/sdr-quote";

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
    managerDashboard: DEFAULT_MANAGER_DASHBOARD_SETTINGS,
    sdrEnabled: true,
    sdrTemplates: DEFAULT_SDR_TEMPLATES,
    sdrQuoteValidityDays: 7,
    sdrAutoDiscountPct: 0,
    sdrQuoteTemplates: DEFAULT_SDR_QUOTE_TEMPLATES,
    sdrShippingPlaceholder: {
      sameCityValue: 50,
      sameStateValue: 80,
      otherStatesAction: "to_negotiate",
      homeCity: "Frederico Westphalen",
      homeState: "RS",
    },
    escalationQueueTimeoutMinutesUrgent: 5,
    escalationQueueTimeoutMinutesNormal: 30,
    escalationCustomerHandoffTemplate:
      "🤖 Beleza{{saudacao_nome}}! Vou conectar você com nosso vendedor especialista.\n\n📋 Resumo do que conversamos:\n{{resumo_curto}}\n\nAguarda só um instante, ele vai assumir a conversa agora.",
    escalationUrgentBroadcastDelaySeconds: 30,
  },
};
