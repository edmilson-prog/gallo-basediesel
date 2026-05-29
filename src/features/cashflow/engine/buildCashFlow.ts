import type {
  ICashFlowDailyPoint,
  ICashFlowEntry,
  ICashFlowSummary,
  ICommission,
  ID,
  IExpense,
  IOrder,
} from "@/shared/types";

const round2 = (v: number): number => Math.round(v * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default days until a pending order is expected to be received. */
const DEFAULT_RECEIPT_DAYS = 30;

export interface ICashFlowEngineContext {
  storeId?: ID;
  /** Effective "now" splitting realized from projected. */
  now: ISO8601OrDate;
  /** Base opening balance from settings (balance before any movement). */
  baseOpeningBalance: number;
  /** Orders already paid (`paidAt`). */
  paidOrders: IOrder[];
  /** Expenses already paid (`paymentDate`), excluding cancelled. */
  paidExpenses: IExpense[];
  /** Commissions already paid (`paidAt`, status `paid`). */
  paidCommissions: ICommission[];
  /** Manual realized entries (aporte/retirada) persisted in the module. */
  manualEntries: ICashFlowEntry[];
  /** Orders pending payment — projected inflows. */
  pendingOrders: IOrder[];
  /** Expenses pending/overdue — projected outflows (by `dueDate`). */
  pendingExpenses: IExpense[];
  /** Commissions not yet paid — projected outflows. */
  pendingCommissions: ICommission[];
}

type ISO8601OrDate = string | Date;

function toMs(d: ISO8601OrDate): number {
  return typeof d === "string" ? new Date(d).getTime() : d.getTime();
}

/** Estimated receipt date for a pending order (createdAt + term, min today+7). */
function estimatedReceiptDate(order: IOrder, nowMs: number): string {
  const created = new Date(order.createdAt).getTime();
  let estimate = created + DEFAULT_RECEIPT_DAYS * DAY_MS;
  if (estimate < nowMs) estimate = nowMs + 7 * DAY_MS;
  return new Date(estimate).toISOString();
}

/** End of a commission's `YYYY-MM` period — used as its projected payout date. */
function commissionProjectedDate(commission: ICommission): string {
  const [y, m] = commission.period.split("-").map(Number);
  if (!y || !m) return commission.createdAt;
  return new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString();
}

/**
 * Build the full set of cash flow entries (realized + projected) from the
 * source collections. Pure — every source maps to one entry.
 */
export function deriveCashFlowEntries(ctx: ICashFlowEngineContext): ICashFlowEntry[] {
  const nowMs = toMs(ctx.now);
  const entries: ICashFlowEntry[] = [];
  const storeId = ctx.storeId ?? "store-matriz";

  // Realized inflows — paid orders.
  for (const o of ctx.paidOrders) {
    if (!o.paidAt) continue;
    entries.push({
      id: `cf-ord-${o.id}`,
      type: "entrada",
      source: "pedido",
      sourceId: o.id,
      description: o.number ? `Pedido ${o.number}` : `Pedido ${o.id}`,
      amount: round2(o.total),
      date: o.paidAt,
      status: "realizado",
      storeId: o.storeId,
      createdAt: o.paidAt,
    });
  }

  // Realized outflows — paid expenses.
  for (const e of ctx.paidExpenses) {
    if (!e.paymentDate || e.status === "cancelado") continue;
    entries.push({
      id: `cf-exp-${e.id}`,
      type: "saida",
      source: "despesa",
      sourceId: e.id,
      description: e.description,
      amount: round2(e.amount),
      date: e.paymentDate,
      status: "realizado",
      storeId: e.storeId,
      createdAt: e.paymentDate,
    });
  }

  // Realized outflows — paid commissions.
  for (const c of ctx.paidCommissions) {
    if (!c.paidAt) continue;
    entries.push({
      id: `cf-com-${c.id}`,
      type: "saida",
      source: "comissao",
      sourceId: c.id,
      description: `Comissão ${c.period}`,
      amount: round2(c.totalCommission),
      date: c.paidAt,
      status: "realizado",
      storeId: c.storeId,
      createdAt: c.paidAt,
    });
  }

  // Manual entries (aporte / retirada) — already realized.
  entries.push(...ctx.manualEntries);

  // Projected inflows — pending orders.
  for (const o of ctx.pendingOrders) {
    entries.push({
      id: `cf-ord-proj-${o.id}`,
      type: "entrada",
      source: "pedido",
      sourceId: o.id,
      description: o.number ? `Pedido ${o.number} (a receber)` : `Pedido ${o.id} (a receber)`,
      amount: round2(o.total),
      date: estimatedReceiptDate(o, nowMs),
      status: "previsto",
      storeId: o.storeId,
      createdAt: o.createdAt,
    });
  }

  // Projected outflows — pending/overdue expenses.
  for (const e of ctx.pendingExpenses) {
    if (e.status === "cancelado" || e.status === "pago") continue;
    entries.push({
      id: `cf-exp-proj-${e.id}`,
      type: "saida",
      source: "despesa",
      sourceId: e.id,
      description: `${e.description} (a pagar)`,
      amount: round2(e.amount),
      date: e.dueDate ?? e.competenceDate,
      status: "previsto",
      storeId: e.storeId,
      createdAt: e.createdAt,
    });
  }

  // Projected outflows — unpaid commissions.
  for (const c of ctx.pendingCommissions) {
    if (c.status === "canceled" || c.status === "paid") continue;
    entries.push({
      id: `cf-com-proj-${c.id}`,
      type: "saida",
      source: "comissao",
      sourceId: c.id,
      description: `Comissão ${c.period} (a pagar)`,
      amount: round2(c.totalCommission),
      date: commissionProjectedDate(c),
      status: "previsto",
      storeId,
      createdAt: c.createdAt,
    });
  }

  return entries;
}

const signed = (entry: ICashFlowEntry): number =>
  entry.type === "entrada" ? entry.amount : -entry.amount;

const dayKey = (iso: string): string => iso.slice(0, 10);

/**
 * Aggregate cash flow for a period (PRD-055 RF-005/RF-006). Computes the
 * opening balance from all realized movements before the window, the realized
 * totals inside the window, the projection from pending entries, and a daily
 * accumulated-balance series (realized then projected).
 */
export function buildCashFlow(
  startIso: string,
  endIso: string,
  ctx: ICashFlowEngineContext,
): ICashFlowSummary {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const entries = deriveCashFlowEntries(ctx);

  // Opening balance = base + net of every realized movement before the window.
  let openingBalance = ctx.baseOpeningBalance;
  for (const e of entries) {
    if (e.status === "realizado" && new Date(e.date).getTime() < startMs) {
      openingBalance += signed(e);
    }
  }
  openingBalance = round2(openingBalance);

  const inWindow = entries.filter((e) => {
    const t = new Date(e.date).getTime();
    return t >= startMs && t <= endMs;
  });

  let totalInflows = 0;
  let totalOutflows = 0;
  let projectedInflows = 0;
  let projectedOutflows = 0;
  for (const e of inWindow) {
    if (e.status === "realizado") {
      if (e.type === "entrada") totalInflows += e.amount;
      else totalOutflows += e.amount;
    } else {
      if (e.type === "entrada") projectedInflows += e.amount;
      else projectedOutflows += e.amount;
    }
  }
  totalInflows = round2(totalInflows);
  totalOutflows = round2(totalOutflows);
  projectedInflows = round2(projectedInflows);
  projectedOutflows = round2(projectedOutflows);

  const netFlow = round2(totalInflows - totalOutflows);
  const closingBalance = round2(openingBalance + netFlow);
  const projectedClosingBalance = round2(closingBalance + projectedInflows - projectedOutflows);

  // Daily series across the window.
  const byDay = new Map<string, { inflow: number; outflow: number; projection: boolean }>();
  for (const e of inWindow) {
    const key = dayKey(e.date);
    const bucket = byDay.get(key) ?? { inflow: 0, outflow: 0, projection: false };
    if (e.type === "entrada") bucket.inflow += e.amount;
    else bucket.outflow += e.amount;
    if (e.status === "previsto") bucket.projection = true;
    byDay.set(key, bucket);
  }

  const dailyBalances: ICashFlowDailyPoint[] = [];
  let running = openingBalance;
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const key = dayKey(new Date(ms).toISOString());
    const bucket = byDay.get(key);
    const inflow = round2(bucket?.inflow ?? 0);
    const outflow = round2(bucket?.outflow ?? 0);
    running = round2(running + inflow - outflow);
    dailyBalances.push({
      date: new Date(ms).toISOString(),
      inflow,
      outflow,
      balance: running,
      isProjection: bucket?.projection ?? false,
    });
  }

  return {
    period: { start: startIso, end: endIso },
    openingBalance,
    totalInflows,
    totalOutflows,
    netFlow,
    closingBalance,
    projectedInflows,
    projectedOutflows,
    projectedClosingBalance,
    dailyBalances,
  };
}

/** Alias kept for the PRD-055 contract — projection is folded into `buildCashFlow`. */
export const projectCashFlow = buildCashFlow;
