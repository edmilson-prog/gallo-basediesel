import type { ID, ISO8601 } from "./common";

/**
 * Insight category — used for UI badge color and the financial-only role gate.
 *
 * - `financeiro` — margin, profitability, commissions, DRE.
 * - `comercial` — sales funnel, conversion, opportunities.
 * - `operacional` — backlog, SDR throughput, sellers' workload, stock.
 * - `cliente` — churn, customer at risk, recovery.
 */
export type InsightCategory = "financeiro" | "comercial" | "operacional" | "cliente";

/**
 * Insight priority. Drives sort order and color treatment in the hub.
 * `critico` > `medio` > `oportunidade` > `info`.
 */
export type InsightPriority = "critico" | "medio" | "oportunidade" | "info";

/**
 * Catalog of insight kinds detected by the engine (PRD-053).
 *
 * Stable identifiers — used for de-dup logic when a previously dismissed
 * insight surfaces again during its `validUntil` window.
 */
export type InsightType =
  | "margin_drop"
  | "churn_spike"
  | "seller_at_risk"
  | "customer_at_risk"
  | "product_decline"
  | "product_excess"
  | "sdr_conversion_drop"
  | "meta_at_risk"
  | "top_seller_overload"
  | "opportunity_segment"
  | "new_customer_winning"
  | "recovery_success";

/**
 * Pattern detected by the engine that merits Owner/Gestor attention.
 *
 * On the MVP insights are recomputed daily (see `useInsightsDailyDetection`)
 * and persisted only when an Owner/Gestor dismisses them. The full record
 * still exists in memory while it is active.
 */
export interface IInsight {
  id: ID;
  type: InsightType;
  priority: InsightPriority;
  category: InsightCategory;
  /** Short title (≈60 chars max). */
  title: string;
  /** Detailed explanation, plain text. */
  description: string;
  /** Raw data that sustains the insight — displayed in the expansible context block. */
  context: Record<string, unknown>;
  /** Suggested drill-down action. */
  suggestedAction?: {
    label: string;
    drillDownUrl: string;
  };
  detectedAt: ISO8601;
  /** Optional expiry — when reached, the insight stops blocking re-creation. */
  validUntil?: ISO8601;
  /** Dismissal metadata — when present, the insight is hidden from the active list. */
  dismissedBy?: ID;
  dismissedAt?: ISO8601;
  dismissReason?: string;
  storeId: ID;
}

/**
 * Per-heuristic configuration thresholds (PRD-053 RF-002).
 *
 * Decimal fractions for percentages: `0.15` = 15%. Owner edits these from
 * `/app/configuracoes/insights`. Defaults come from `DEFAULT_INSIGHT_THRESHOLDS`.
 */
export interface IInsightThresholds {
  /** Heurística 1 — categoria com queda de margem maior que este fator (default 0.15). */
  marginDropPct: number;
  /** Heurística 2 — churn maior que este fator vs período anterior (default 0.25). */
  churnSpikePct: number;
  /** Heurística 3 — vendedor com queda em N+ métricas simultâneas (default 3). */
  sellerAtRiskMetrics: number;
  /** Heurística 4 — cliente A/B sem compra acima desta fração de `dormantDays` (default 0.75). */
  customerAtRiskRatio: number;
  /** Heurística 5 — produto com queda de vendas maior que este fator (default 0.30). */
  productDeclinePct: number;
  /** Heurística 6 — cobertura máxima (em dias) que classifica produto como excesso (default 180). */
  productExcessCoverageDays: number;
  /** Heurística 6 — capital parado mínimo em R$ para excesso de estoque (default 5000). */
  productExcessCapital: number;
  /** Heurística 7 — queda na taxa de aceite SDR maior que este fator (default 0.20). */
  sdrConversionDropPct: number;
  /** Heurística 8 — meta em risco quando progresso < (1 - este fator) E faltam menos de N dias (default 0.50). */
  metaAtRiskProgress: number;
  /** Heurística 8 — dias restantes máximos para considerar a meta em risco (default 7). */
  metaAtRiskDaysRemaining: number;
  /** Heurística 9 — variação no TMR de top vendedores acima desta fração (default 0.20). */
  topSellerOverloadTmrPct: number;
  /** Heurística 10 — segmento crescendo mais que este fator vs período anterior (default 0.30). */
  opportunitySegmentGrowthPct: number;
}

export const DEFAULT_INSIGHT_THRESHOLDS: IInsightThresholds = {
  marginDropPct: 0.15,
  churnSpikePct: 0.25,
  sellerAtRiskMetrics: 3,
  customerAtRiskRatio: 0.75,
  productDeclinePct: 0.3,
  productExcessCoverageDays: 180,
  productExcessCapital: 5000,
  sdrConversionDropPct: 0.2,
  metaAtRiskProgress: 0.5,
  metaAtRiskDaysRemaining: 7,
  topSellerOverloadTmrPct: 0.2,
  opportunitySegmentGrowthPct: 0.3,
};
