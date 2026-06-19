import type { ID, IPlatformSettings } from "@/shared/types";
import { DEFAULT_INSIGHT_THRESHOLDS, DEFAULT_STOREFRONT_CONFIG } from "@/shared/types";
import { SEED_PIPELINE_STAGES } from "@/mocks/data/seedPipelineStages";
import { SEED_LOSS_REASONS } from "@/mocks/data/seedLossReasons";
import { SEED_TAGS } from "@/mocks/data/seedTags";
import { DEFAULT_DISTRIBUTION_SETTINGS } from "@/mocks/data/seedDistribution";
import { DEFAULT_MANAGER_DASHBOARD_SETTINGS } from "@/mocks/data/seedManagerDashboard";
import { DEFAULT_SDR_TEMPLATES } from "@/features/sdr/templates/defaults";
import { DEFAULT_SDR_QUOTE_TEMPLATES } from "@/features/sdr-quote/templates/defaults";
import { DEFAULT_SHIPPING_CONFIG } from "@/features/shipping/config/defaults";
import { DEFAULT_BADGE_CATALOG } from "@/features/gamification/catalog/badgeCatalog";
import { DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS } from "@/features/ecommerce-integration/config/defaults";

/**
 * Builds a clean default {@link IPlatformSettings} for a newly created store
 * (Bloco A1 — gestão multi-loja Fase 2). Store-specific monetary values start
 * at zero; business defaults come from the shared default/seed constants.
 * Deep-clones array/object defaults so stores never share mutable references.
 *
 * Lives in `providers/data/engine/` (not `mocks/`) because both the mock and the
 * supabase store providers consume it — mirrors the `aiCatalog.ts` precedent and
 * sidesteps the mock-boundary ESLint rule (providers/data/** is exempt).
 *
 * @see docs/superpowers/specs/2026-06-19-bloco-a-gestao-lojas-design.md
 */
export function buildDefaultSettings(storeId: ID): IPlatformSettings {
  const clone = <T>(v: T): T => structuredClone(v);
  return {
    storeId,
    lifecycleThresholds: { dormantDays: 60, lostDays: 180 },
    vehicleCadastroMode: "aprovacao_obrigatoria",
    tagSuggestions: clone(SEED_TAGS),
    pipelineStages: clone(SEED_PIPELINE_STAGES),
    lossReasons: clone(SEED_LOSS_REASONS),
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
      badges: clone(DEFAULT_BADGE_CATALOG),
    },
    whatsappAccounts: [],
    defaultDivision: "parts",
    distribution: clone(DEFAULT_DISTRIBUTION_SETTINGS),
    managerDashboard: clone(DEFAULT_MANAGER_DASHBOARD_SETTINGS),
    sdrEnabled: false,
    sdrTemplates: clone(DEFAULT_SDR_TEMPLATES),
    sdrQuoteValidityDays: 7,
    sdrAutoDiscountPct: 0,
    sdrQuoteTemplates: clone(DEFAULT_SDR_QUOTE_TEMPLATES),
    shipping: clone(DEFAULT_SHIPPING_CONFIG),
    escalationQueueTimeoutMinutesUrgent: 5,
    escalationQueueTimeoutMinutesNormal: 30,
    escalationCustomerHandoffTemplate: "",
    escalationUrgentBroadcastDelaySeconds: 30,
    discountApprovalThresholdPct: 0.05,
    quoteDefaultValidityDays: 7,
    abcCurveSettings: { periodMonths: 12, classAThreshold: 0.8, classBThreshold: 0.95 },
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
      fixedExpenses: { payroll: 0, rentInfra: 0, other: 0 },
    },
    cashflowSettings: { openingBalance: 0, minBalanceAlert: 0 },
    inventoryAnalysisSettings: {
      consumptionWindowDays: 90,
      targetCoverageDays: 30,
      excessCoverageDays: 180,
    },
    insightsEnabled: true,
    insightThresholds: clone(DEFAULT_INSIGHT_THRESHOLDS),
    storefront: clone(DEFAULT_STOREFRONT_CONFIG),
    ecommerceIntegration: clone(DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS),
  };
}
