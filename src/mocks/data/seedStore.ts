import type { IStore } from "@/shared/types";
import { DEFAULT_INSIGHT_THRESHOLDS, DEFAULT_STOREFRONT_CONFIG } from "@/shared/types";
import { SEED_PIPELINE_STAGES } from "./seedPipelineStages";
import { SEED_LOSS_REASONS } from "./seedLossReasons";
import { SEED_TAGS } from "./seedTags";
import { DEFAULT_DISTRIBUTION_SETTINGS } from "./seedDistribution";
import { DEFAULT_MANAGER_DASHBOARD_SETTINGS } from "./seedManagerDashboard";
import { DEFAULT_SDR_TEMPLATES } from "@/features/sdr/templates/defaults";
import { DEFAULT_SDR_QUOTE_TEMPLATES } from "@/features/sdr-quote/templates/defaults";
import { DEFAULT_SHIPPING_CONFIG } from "@/features/shipping/config/defaults";
import { DEFAULT_BADGE_CATALOG } from "@/features/gamification/catalog/badgeCatalog";
import { DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS } from "@/features/ecommerce-integration/config/defaults";

export const SEED_STORE_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Headquarters store (Matriz) — the only store created on the MVP.
 * Multi-store activation lives in PRD-007.
 */
export const SEED_STORE: IStore = {
  id: SEED_STORE_ID,
  name: "GALLO BASE DIESEL — Matriz",
  type: "matriz",
  address: "Rod. BR 158/386, KM 37, Pavilhão 03 — São Cristóvão, Frederico Westphalen / RS — CEP 98400-000",
  cnpj: "32.990.725/0001-60",
  // The Owner (Fernando) — SEED_OWNER_ID in seedSellers.ts. Inlined as a literal
  // to avoid a circular import (seedSellers imports SEED_STORE_ID from here).
  managerId: "seller-joao-gallo",
  activeDivisions: ["parts"],
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  settings: {
    storeId: "00000000-0000-0000-0000-000000000001",
    lifecycleThresholds: {
      dormantDays: 60,
      lostDays: 180,
    },
    vehicleCadastroMode: "aprovacao_obrigatoria",
    tagSuggestions: SEED_TAGS,
    pipelineStages: SEED_PIPELINE_STAGES,
    lossReasons: SEED_LOSS_REASONS,
    gamificationRules: {
      active: true,
      pointsPerOrder: 10,
      pointsPerRecovery: 25,
      pointsPerPositivation: 5,
      pointsPerGoalCompleted: 100,
      pointsPerGoalExceeded: 50,
      pointsPerNewCustomer: 10,
      pointsPerHighTicketOrder: 15,
      thresholdHighTicket: 1500,
      thresholdBigTicket: 5000,
      notifyOnBadgeEarned: false,
      badges: DEFAULT_BADGE_CATALOG,
    },
    whatsappAccounts: [
      { id: "wa-meta-matriz", label: "GALLO Matriz (Oficial)" },
      { id: "wa-evo-campanhas", label: "GALLO Campanhas" },
      { id: "wa-openwa-filial", label: "GALLO Filial (OpenWA)" },
    ],
    defaultDivision: "parts",
    distribution: DEFAULT_DISTRIBUTION_SETTINGS,
    // Default OFF: a co-responsible respects the origin number (Portão A).
    participantCrossInstance: false,
    managerDashboard: DEFAULT_MANAGER_DASHBOARD_SETTINGS,
    sdrEnabled: true,
    sdrTemplates: DEFAULT_SDR_TEMPLATES,
    sdrQuoteValidityDays: 7,
    sdrAutoDiscountPct: 0,
    sdrQuoteTemplates: DEFAULT_SDR_QUOTE_TEMPLATES,
    shipping: DEFAULT_SHIPPING_CONFIG,
    escalationQueueTimeoutMinutesUrgent: 5,
    escalationQueueTimeoutMinutesNormal: 30,
    escalationCustomerHandoffTemplate:
      "🤖 Beleza{{saudacao_nome}}! Vou conectar você com nosso vendedor especialista.\n\n📋 Resumo do que conversamos:\n{{resumo_curto}}\n\nAguarda só um instante, ele vai assumir a conversa agora.",
    escalationUrgentBroadcastDelaySeconds: 30,
    discountApprovalThresholdPct: 0.05,
    quoteDefaultValidityDays: 7,
    abcCurveSettings: {
      periodMonths: 12,
      classAThreshold: 0.8,
      classBThreshold: 0.95,
    },
    commissionSettings: {
      active: true,
      defaultRate: 0.03,
      splitPolicy: "coverage_full",
      goalBonusEnabled: true,
      rules: [],
      closedPeriods: [],
    },
    financialSettings: {
      taxOnSalesPct: 0.16,
      taxOnProfitPct: 0.2,
      fixedExpenses: {
        payroll: 35_000,
        rentInfra: 12_000,
        other: 8_000,
      },
    },
    cashflowSettings: {
      openingBalance: 50_000,
      minBalanceAlert: 10_000,
    },
    inventoryAnalysisSettings: {
      consumptionWindowDays: 90,
      targetCoverageDays: 30,
      excessCoverageDays: 180,
    },
    insightsEnabled: true,
    insightThresholds: DEFAULT_INSIGHT_THRESHOLDS,
    storefront: DEFAULT_STOREFRONT_CONFIG,
    ecommerceIntegration: DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS,
  },
};
