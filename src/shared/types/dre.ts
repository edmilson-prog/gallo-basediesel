import type { ID, ISO8601, Money } from "./common";

/**
 * Configurable financial settings used by the DRE engine (PRD-048).
 *
 * Edited at `/app/configuracoes/financeiro` by Owner/Financeiro. Mocks the
 * fiscal/operational expenses that, in a real-world deploy, would come from
 * the accounting integration scheduled for Fase 2.
 */
export interface IFinancialSettings {
  /** Decimal tax rate applied on gross revenue (0.16 = 16%). */
  taxOnSalesPct: number;
  /** Decimal tax rate applied on operating profit (0.20 = 20%). */
  taxOnProfitPct: number;
  /** Fixed monthly expenses mocked while the accounting integration is absent. */
  fixedExpenses: {
    /** Total payroll cost in BRL (R$) per month. */
    payroll: Money;
    /** Rent + infrastructure (electricity, water, internet) BRL/month. */
    rentInfra: Money;
    /** Everything else (utilities, contracts, taxes excluded above) BRL/month. */
    other: Money;
  };
}

/**
 * Delta of a single line item against another period — used to colour the
 * comparative columns of the DRE table.
 */
export interface IDREComparison {
  /** Raw monetary difference (positive = grew vs base). */
  delta: Money;
  /** Decimal share of the base (0.12 = +12%). Null when base is 0. */
  deltaPct: number | null;
  /** Coarse direction for icon/colour selection. */
  direction: "up" | "down" | "flat";
}

/**
 * Full DRE record for a single period — pure projection of the orders /
 * commissions / settings inputs computed by `calculateDRE`.
 */
export interface IDREPeriod {
  /** Period boundaries (ISO 8601, inclusive on both ends). */
  period: { start: ISO8601; end: ISO8601 };
  /** Human-readable label (e.g. "Janeiro 2026"). */
  periodLabel: string;
  /** When null the record consolidates every store. */
  storeId?: ID;

  // Receitas
  grossRevenue: Money;
  taxOnSales: Money;
  returns: Money;
  netRevenue: Money;

  // CMV
  cmv: Money;
  /** Share of order items with a positive `unitCost` snapshot (0..1). */
  cmvCoverage: number;
  /** Count of order items missing cost data — surfaces in the coverage warning. */
  cmvMissingItemsCount: number;
  /** Distinct parts whose `unitCost` is 0 across paid orders in the period. */
  cmvMissingPartsCount: number;
  grossMargin: Money;
  /** Decimal share over `netRevenue` (0..1). */
  grossMarginPct: number;

  // Despesas operacionais
  commissions: Money;
  payroll: Money;
  rentInfra: Money;
  otherExpenses: Money;
  totalOperatingExpenses: Money;
  operatingResult: Money;
  /** Decimal share over `netRevenue` (0..1). */
  operatingResultPct: number;

  // Resultado
  taxOnProfit: Money;
  netResult: Money;
  /** Decimal share over `netRevenue` (0..1). */
  netResultPct: number;

  // Comparativos opcionais
  vsPreviousPeriod?: IDREComparativeBlock;
  vsYearAgo?: IDREComparativeBlock;
}

/**
 * Comparative payload bound to a reference period — carries the prior values
 * plus deltas keyed by the same fields exposed on `IDREPeriod`.
 */
export interface IDREComparativeBlock {
  /** Period boundaries used as base of the comparison. */
  basePeriod: { start: ISO8601; end: ISO8601 };
  basePeriodLabel: string;
  /** Raw values from the comparative period — used to populate the columns. */
  values: Pick<
    IDREPeriod,
    | "grossRevenue"
    | "taxOnSales"
    | "returns"
    | "netRevenue"
    | "cmv"
    | "grossMargin"
    | "grossMarginPct"
    | "commissions"
    | "payroll"
    | "rentInfra"
    | "otherExpenses"
    | "totalOperatingExpenses"
    | "operatingResult"
    | "operatingResultPct"
    | "taxOnProfit"
    | "netResult"
    | "netResultPct"
  >;
  /** Per-field deltas for the comparative pill. */
  deltas: Record<keyof IDREComparativeBlock["values"], IDREComparison>;
}

/**
 * Single point of the 12-month trend chart on the DRE page (PRD-048 RF-013).
 */
export interface IDRETrendPoint {
  /** `YYYY-MM` reference for the X axis. */
  monthKey: string;
  monthLabel: string;
  revenue: Money;
  costs: Money;
  netResult: Money;
}

/**
 * Severity buckets surfaced by `useDREAlerts` (PRD-048 RF-015).
 */
export type DREAlertSeverity = "info" | "warning" | "critical";

export interface IDREAlert {
  id: string;
  severity: DREAlertSeverity;
  title: string;
  description: string;
  /** Optional icon hint (Iconify name). */
  icon?: string;
}
