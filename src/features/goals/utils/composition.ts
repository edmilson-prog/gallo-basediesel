import type { ICustomer, IGoal, IOrder } from "@/shared/types";

export interface IEvolutionPoint {
  /** YYYY-MM-DD bucket label. */
  date: string;
  /** Realized cumulative value as of this bucket end. */
  realized: number;
  /** Expected proportional value (linear pacing). */
  expected: number;
}

const DAY_MS = 24 * 3600_000;

function isWithin(iso: string | undefined, fromIso: string, toIso: string): boolean {
  if (!iso) return false;
  return iso >= fromIso && iso <= toIso;
}

function matchesGoal(order: IOrder, goal: IGoal): boolean {
  if (order.storeId !== goal.storeId) return false;
  if (goal.level === "individual" && order.sellerId !== goal.targetId) return false;
  if (goal.division && order.division !== goal.division) return false;
  return true;
}

function bucketKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Build the daily evolution series for the goal — accumulated `realized` vs
 * proportional `expected`. Handles all 5 active metric types; for `ticket_medio`
 * the realized line is the rolling average up to the bucket date.
 */
export function buildEvolutionSeries(
  goal: IGoal,
  ctx: {
    orders: IOrder[];
    customers: ICustomer[];
  },
): IEvolutionPoint[] {
  const start = new Date(goal.period.start).getTime();
  const end = new Date(goal.period.end).getTime();
  const totalDays = Math.max(1, Math.round((end - start) / DAY_MS));

  // contributions per day
  const dailyRevenue = new Map<string, number>();
  const dailyTickets = new Map<string, number>();
  const dailyTicketValues = new Map<string, number[]>();
  const dailyMargin = new Map<string, number>();
  const seenCustomers = new Set<string>();
  const dailyPositivacao = new Map<string, number>();
  const dailyNewCustomers = new Map<string, number>();

  for (const o of ctx.orders) {
    if (!matchesGoal(o, goal)) continue;
    if (o.paymentStatus !== "pago") continue;
    const ts = o.paidAt ?? o.createdAt;
    if (!isWithin(ts, goal.period.start, goal.period.end)) continue;
    const key = bucketKey(ts);
    dailyRevenue.set(key, (dailyRevenue.get(key) ?? 0) + o.total);
    dailyTickets.set(key, (dailyTickets.get(key) ?? 0) + 1);
    const values = dailyTicketValues.get(key) ?? [];
    values.push(o.total);
    dailyTicketValues.set(key, values);
    for (const item of o.items) {
      dailyMargin.set(key, (dailyMargin.get(key) ?? 0) + item.marginValue);
    }
    if (!seenCustomers.has(o.customerId)) {
      seenCustomers.add(o.customerId);
      dailyPositivacao.set(key, (dailyPositivacao.get(key) ?? 0) + 1);
    }
  }

  for (const c of ctx.customers) {
    if (c.storeId !== goal.storeId) continue;
    if (goal.level === "individual" && c.sellerId !== goal.targetId) continue;
    if (!isWithin(c.createdAt, goal.period.start, goal.period.end)) continue;
    const key = bucketKey(c.createdAt);
    dailyNewCustomers.set(key, (dailyNewCustomers.get(key) ?? 0) + 1);
  }

  const out: IEvolutionPoint[] = [];
  let cumRevenue = 0;
  let cumTickets = 0;
  let cumMargin = 0;
  const cumTicketValues: number[] = [];
  let cumPositivacao = 0;
  let cumNewCustomers = 0;

  for (let i = 0; i <= totalDays; i += 1) {
    const date = new Date(start + i * DAY_MS);
    const key = date.toISOString().slice(0, 10);

    cumRevenue += dailyRevenue.get(key) ?? 0;
    cumTickets += dailyTickets.get(key) ?? 0;
    cumMargin += dailyMargin.get(key) ?? 0;
    for (const v of dailyTicketValues.get(key) ?? []) cumTicketValues.push(v);
    cumPositivacao += dailyPositivacao.get(key) ?? 0;
    cumNewCustomers += dailyNewCustomers.get(key) ?? 0;

    let realized = 0;
    switch (goal.metric) {
      case "revenue":
        realized = cumRevenue;
        break;
      case "margin":
        realized = cumMargin;
        break;
      case "tickets":
        realized = cumTickets;
        break;
      case "ticket_medio":
        realized =
          cumTicketValues.length > 0
            ? cumTicketValues.reduce((a, b) => a + b, 0) / cumTicketValues.length
            : 0;
        break;
      case "positivacao":
        realized = cumPositivacao;
        break;
      case "novos_clientes":
        realized = cumNewCustomers;
        break;
      default:
        realized = 0;
    }

    const expected = (goal.targetValue * i) / totalDays;
    out.push({ date: key, realized, expected });
  }

  return out;
}

/** Get the orders that contributed to a goal's progress (in window + matching). */
export function getContributingOrders(goal: IGoal, orders: IOrder[]): IOrder[] {
  return orders.filter((o) => {
    if (!matchesGoal(o, goal)) return false;
    if (o.paymentStatus !== "pago") return false;
    return isWithin(o.paidAt ?? o.createdAt, goal.period.start, goal.period.end);
  });
}

/** Distinct customers with at least one paid order matching the goal in window. */
export function getPositivatedCustomers(goal: IGoal, orders: IOrder[]): string[] {
  const seen = new Set<string>();
  for (const o of orders) {
    if (!matchesGoal(o, goal)) continue;
    if (o.paymentStatus !== "pago") continue;
    if (!isWithin(o.paidAt ?? o.createdAt, goal.period.start, goal.period.end)) continue;
    seen.add(o.customerId);
  }
  return [...seen];
}

/** Customers created inside the period attributed to the goal target. */
export function getAcquiredCustomers(goal: IGoal, customers: ICustomer[]): ICustomer[] {
  return customers.filter((c) => {
    if (c.storeId !== goal.storeId) return false;
    if (goal.level === "individual" && c.sellerId !== goal.targetId) return false;
    return isWithin(c.createdAt, goal.period.start, goal.period.end);
  });
}

export interface ITicketStats {
  count: number;
  min: number;
  max: number;
  median: number;
  std: number;
}

export function getTicketStats(orders: IOrder[]): ITicketStats {
  if (orders.length === 0) return { count: 0, min: 0, max: 0, median: 0, std: 0 };
  const totals = orders.map((o) => o.total).sort((a, b) => a - b);
  const min = totals[0];
  const max = totals[totals.length - 1];
  const median =
    totals.length % 2 === 0
      ? (totals[totals.length / 2 - 1] + totals[totals.length / 2]) / 2
      : totals[Math.floor(totals.length / 2)];
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const variance = totals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / totals.length;
  const std = Math.sqrt(variance);
  return { count: totals.length, min, max, median, std };
}
