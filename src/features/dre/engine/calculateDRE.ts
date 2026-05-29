import type {
  ICommission,
  IDREComparison,
  IDREComparativeBlock,
  IDREPeriod,
  IExpense,
  IFinancialSettings,
  ID,
  IOrder,
} from "@/shared/types";
import { aggregateExpensesForDRE } from "@/features/expenses/engine";

/**
 * Pure-input context for the DRE engine (PRD-048).
 *
 * The engine never touches I/O — providers are resolved at the hook layer and
 * the relevant collections are passed in. Filtering by store happens upstream.
 */
export interface IDREEngineContext {
  /** Every paid order in the analysis window (`paidAt` inside the period). */
  paidOrders: IOrder[];
  /** Orders flagged as returned within the period (used for `returns`). */
  returnedOrders: IOrder[];
  /** Commissions referencing the analysis period (`YYYY-MM`). */
  commissions: ICommission[];
  /**
   * Operational expenses (PRD-054). When provided, the three operating-expense
   * lines (payroll / rentInfra / otherExpenses) are aggregated from real
   * entries by competence, replacing `settings.fixedExpenses`. Commissions
   * still come from PRD-047. When omitted (legacy callers), the engine falls
   * back to the deprecated `settings.fixedExpenses`.
   */
  expenses?: IExpense[];
  /** Financial settings driving taxes + (deprecated) fixed expenses. */
  settings: IFinancialSettings;
  /** When set the DRE consolidates a single store; null = matriz consolidada. */
  storeId?: ID;
}

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const round2 = (value: number): number => Math.round(value * 100) / 100;

const monthKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTHS_PT[m - 1]} ${y}`;
};

const inPeriod = (iso: string | undefined, startMs: number, endMs: number): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= startMs && t <= endMs;
};

const ratio = (numerator: number, denominator: number): number => {
  if (denominator === 0) return 0;
  return numerator / denominator;
};

function makeComparison(current: number, base: number): IDREComparison {
  const delta = round2(current - base);
  const deltaPct = base === 0 ? null : delta / base;
  const epsilon = 0.005;
  let direction: IDREComparison["direction"] = "flat";
  if (delta > epsilon) direction = "up";
  else if (delta < -epsilon) direction = "down";
  return { delta, deltaPct, direction };
}

interface IDRECoreFigures {
  grossRevenue: number;
  taxOnSales: number;
  returns: number;
  netRevenue: number;
  cmv: number;
  cmvCoverage: number;
  cmvMissingItemsCount: number;
  cmvMissingPartsCount: number;
  grossMargin: number;
  grossMarginPct: number;
  commissions: number;
  payroll: number;
  rentInfra: number;
  otherExpenses: number;
  totalOperatingExpenses: number;
  operatingResult: number;
  operatingResultPct: number;
  taxOnProfit: number;
  netResult: number;
  netResultPct: number;
}

function computeCore(ctx: IDREEngineContext, startMs: number, endMs: number): IDRECoreFigures {
  const paidOrders = ctx.paidOrders.filter((o) =>
    inPeriod(o.paidAt ?? o.updatedAt, startMs, endMs),
  );
  const returnedOrders = ctx.returnedOrders.filter((o) =>
    inPeriod(o.returnedAt ?? o.updatedAt, startMs, endMs),
  );

  const grossRevenue = round2(paidOrders.reduce((acc, o) => acc + (o.subtotal - o.discount), 0));
  const taxOnSales = round2(grossRevenue * ctx.settings.taxOnSalesPct);
  const returns = round2(returnedOrders.reduce((acc, o) => acc + (o.subtotal - o.discount), 0));
  const netRevenue = round2(grossRevenue - taxOnSales - returns);

  let cmv = 0;
  let totalItems = 0;
  let coveredItems = 0;
  const missingPartIds = new Set<ID>();
  for (const order of paidOrders) {
    for (const item of order.items) {
      totalItems += 1;
      if (item.unitCost > 0) {
        coveredItems += 1;
        cmv += item.unitCost * item.quantity;
      } else {
        missingPartIds.add(item.partId);
      }
    }
  }
  cmv = round2(cmv);
  const cmvCoverage = totalItems === 0 ? 1 : coveredItems / totalItems;
  const cmvMissingItemsCount = totalItems - coveredItems;
  const cmvMissingPartsCount = missingPartIds.size;

  const grossMargin = round2(netRevenue - cmv);
  const grossMarginPct = ratio(grossMargin, netRevenue);

  // Commissions snapshot for the period — match by YYYY-MM. We accept the
  // pre-paid (`approved` / `paid`) and the in-flight (`calculated`) statuses
  // since the DRE is a competence view, not a cash view.
  const periodKey = monthKey(new Date(startMs).toISOString());
  const periodKeyEnd = monthKey(new Date(endMs).toISOString());
  const commissionsValue = round2(
    ctx.commissions
      .filter((c) => {
        if (c.status === "canceled" || c.status === "disputed") return false;
        return c.period >= periodKey && c.period <= periodKeyEnd;
      })
      .reduce((acc, c) => acc + c.totalCommission, 0),
  );

  // PRD-054 delta: real expenses by competence replace the fixed mocked values.
  // Fall back to the deprecated `fixedExpenses` only when no ledger is provided.
  const realExpenses = ctx.expenses ? aggregateExpensesForDRE(ctx.expenses, startMs, endMs) : null;
  const payroll = round2(realExpenses ? realExpenses.payroll : ctx.settings.fixedExpenses.payroll);
  const rentInfra = round2(
    realExpenses ? realExpenses.rentInfra : ctx.settings.fixedExpenses.rentInfra,
  );
  const otherExpenses = round2(
    realExpenses ? realExpenses.otherExpenses : ctx.settings.fixedExpenses.other,
  );

  const totalOperatingExpenses = round2(commissionsValue + payroll + rentInfra + otherExpenses);
  const operatingResult = round2(grossMargin - totalOperatingExpenses);
  const operatingResultPct = ratio(operatingResult, netRevenue);

  const taxOnProfit = round2(Math.max(0, operatingResult) * ctx.settings.taxOnProfitPct);
  const netResult = round2(operatingResult - taxOnProfit);
  const netResultPct = ratio(netResult, netRevenue);

  return {
    grossRevenue,
    taxOnSales,
    returns,
    netRevenue,
    cmv,
    cmvCoverage,
    cmvMissingItemsCount,
    cmvMissingPartsCount,
    grossMargin,
    grossMarginPct,
    commissions: commissionsValue,
    payroll,
    rentInfra,
    otherExpenses,
    totalOperatingExpenses,
    operatingResult,
    operatingResultPct,
    taxOnProfit,
    netResult,
    netResultPct,
  };
}

function comparativeBlockFrom(
  base: IDRECoreFigures,
  current: IDRECoreFigures,
  basePeriod: { start: string; end: string },
): IDREComparativeBlock {
  const values: IDREComparativeBlock["values"] = {
    grossRevenue: base.grossRevenue,
    taxOnSales: base.taxOnSales,
    returns: base.returns,
    netRevenue: base.netRevenue,
    cmv: base.cmv,
    grossMargin: base.grossMargin,
    grossMarginPct: base.grossMarginPct,
    commissions: base.commissions,
    payroll: base.payroll,
    rentInfra: base.rentInfra,
    otherExpenses: base.otherExpenses,
    totalOperatingExpenses: base.totalOperatingExpenses,
    operatingResult: base.operatingResult,
    operatingResultPct: base.operatingResultPct,
    taxOnProfit: base.taxOnProfit,
    netResult: base.netResult,
    netResultPct: base.netResultPct,
  };
  const deltas: IDREComparativeBlock["deltas"] = {
    grossRevenue: makeComparison(current.grossRevenue, base.grossRevenue),
    taxOnSales: makeComparison(current.taxOnSales, base.taxOnSales),
    returns: makeComparison(current.returns, base.returns),
    netRevenue: makeComparison(current.netRevenue, base.netRevenue),
    cmv: makeComparison(current.cmv, base.cmv),
    grossMargin: makeComparison(current.grossMargin, base.grossMargin),
    grossMarginPct: makeComparison(current.grossMarginPct, base.grossMarginPct),
    commissions: makeComparison(current.commissions, base.commissions),
    payroll: makeComparison(current.payroll, base.payroll),
    rentInfra: makeComparison(current.rentInfra, base.rentInfra),
    otherExpenses: makeComparison(current.otherExpenses, base.otherExpenses),
    totalOperatingExpenses: makeComparison(
      current.totalOperatingExpenses,
      base.totalOperatingExpenses,
    ),
    operatingResult: makeComparison(current.operatingResult, base.operatingResult),
    operatingResultPct: makeComparison(current.operatingResultPct, base.operatingResultPct),
    taxOnProfit: makeComparison(current.taxOnProfit, base.taxOnProfit),
    netResult: makeComparison(current.netResult, base.netResult),
    netResultPct: makeComparison(current.netResultPct, base.netResultPct),
  };
  return {
    basePeriod,
    basePeriodLabel: monthLabel(monthKey(basePeriod.start)),
    values,
    deltas,
  };
}

/**
 * Compute the DRE record for the requested period plus the comparative blocks
 * (previous period of the same length, and same period of the previous year).
 *
 * Pure function — deterministic output for the same input. The engine assumes
 * `paidOrders` already contains every relevant order across the year (so the
 * comparatives can re-compute without an extra fetch). The hook layer is
 * responsible for the up-front fetch window.
 */
export function calculateDRE(startIso: string, endIso: string, ctx: IDREEngineContext): IDREPeriod {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const lengthMs = endMs - startMs;

  const current = computeCore(ctx, startMs, endMs);

  // vsPreviousPeriod — same length immediately before the current window.
  const prevEndMs = startMs - 1;
  const prevStartMs = prevEndMs - lengthMs;
  const prev = computeCore(ctx, prevStartMs, prevEndMs);
  const vsPreviousPeriod = comparativeBlockFrom(prev, current, {
    start: new Date(prevStartMs).toISOString(),
    end: new Date(prevEndMs).toISOString(),
  });

  // vsYearAgo — same window shifted exactly 12 months back. We use UTC math
  // to keep the boundaries aligned with calendar months.
  const yearAgoStart = shiftYears(new Date(startMs), -1);
  const yearAgoEnd = shiftYears(new Date(endMs), -1);
  const yearAgo = computeCore(ctx, yearAgoStart.getTime(), yearAgoEnd.getTime());
  const vsYearAgo = comparativeBlockFrom(yearAgo, current, {
    start: yearAgoStart.toISOString(),
    end: yearAgoEnd.toISOString(),
  });

  return {
    period: { start: startIso, end: endIso },
    periodLabel: monthLabel(monthKey(startIso)),
    storeId: ctx.storeId,
    ...current,
    vsPreviousPeriod,
    vsYearAgo,
  };
}

function shiftYears(date: Date, years: number): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear() + years,
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * Build the 12-month trend series ending on the requested month (inclusive).
 *
 * Each point uses the same engine over a single calendar month so the values
 * stay consistent with what the table shows. Cheap enough to recompute on
 * filter changes (12 × O(orders) — well below the RNF-001 budget).
 */
export function calculateDRETrend(
  endIsoMonth: string,
  ctx: IDREEngineContext,
): { monthKey: string; monthLabel: string; revenue: number; costs: number; netResult: number }[] {
  const result: {
    monthKey: string;
    monthLabel: string;
    revenue: number;
    costs: number;
    netResult: number;
  }[] = [];
  const endDate = new Date(endIsoMonth);
  for (let i = 11; i >= 0; i -= 1) {
    const monthDate = new Date(
      Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - i, 1, 0, 0, 0),
    );
    const start = monthDate.getTime();
    const end = new Date(
      Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0, 23, 59, 59, 999),
    ).getTime();
    const core = computeCore(ctx, start, end);
    const key = monthKey(new Date(start).toISOString());
    result.push({
      monthKey: key,
      monthLabel: monthLabel(key),
      revenue: core.netRevenue,
      costs: round2(core.cmv + core.totalOperatingExpenses),
      netResult: core.netResult,
    });
  }
  return result;
}
