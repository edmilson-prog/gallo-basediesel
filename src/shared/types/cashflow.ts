import type { ID, ISO8601, Money } from "./common";

/**
 * Cash Flow domain (PRD-055) — a **cash-regime** view (money in/out) distinct
 * from the DRE's competence regime. Entries are realized (already happened) or
 * projected (forecast from pending orders / expenses / commissions).
 *
 * @see ../../../docs/prds/PRD-055-fluxo-caixa.md
 */

export type CashFlowDirection = "entrada" | "saida";

export type CashFlowSource = "pedido" | "despesa" | "comissao" | "aporte" | "retirada" | "outro";

export type CashFlowStatus = "realizado" | "previsto";

/** Single cash movement (derived from a source, or a manual aporte/retirada). */
export interface ICashFlowEntry {
  id: ID;
  type: CashFlowDirection;
  source: CashFlowSource;
  /** orderId / expenseId / commissionId when derived. */
  sourceId?: ID;
  description: string;
  /** Always positive; `type` defines the sign. */
  amount: Money;
  /** Effective cash date. */
  date: ISO8601;
  /** `previsto` = projection (still pending). */
  status: CashFlowStatus;
  storeId: ID;
  /** Filled on manual entries (aporte/retirada). */
  createdBy?: ID;
  createdAt: ISO8601;
}

/** One day of the accumulated-balance series. */
export interface ICashFlowDailyPoint {
  date: ISO8601;
  inflow: Money;
  outflow: Money;
  /** Accumulated balance up to and including this day. */
  balance: Money;
  isProjection: boolean;
}

/** Aggregated cash flow over a period (realized + projected). */
export interface ICashFlowSummary {
  period: { start: ISO8601; end: ISO8601 };
  openingBalance: Money;
  totalInflows: Money;
  totalOutflows: Money;
  netFlow: Money;
  closingBalance: Money;
  // Projection (status = 'previsto')
  projectedInflows: Money;
  projectedOutflows: Money;
  projectedClosingBalance: Money;
  // Time series (realized then projected)
  dailyBalances: ICashFlowDailyPoint[];
}

/** Owner/Financeiro-editable cash flow settings (PRD-055). */
export interface ICashFlowSettings {
  /** Base opening balance for the very first period (R$). */
  openingBalance: Money;
  /** Minimum balance that triggers the low-balance alert (R$). */
  minBalanceAlert: Money;
}

export const DEFAULT_CASHFLOW_SETTINGS: ICashFlowSettings = {
  openingBalance: 50_000,
  minBalanceAlert: 10_000,
};
