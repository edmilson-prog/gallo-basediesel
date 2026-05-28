import type { ID, IOrder } from "@/shared/types";

/** Weekday initials in pt-BR, indexed by Date.getDay() (0=Sun). */
const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

export interface IDailyEvolutionPoint {
  /** Day of month, 1..daysInMonth. */
  day: number;
  /** Weekday initial (pt-BR). */
  weekdayLabel: string;
  isWeekend: boolean;
  /** Cumulative realized revenue up to this day; null after today. */
  vendas: number | null;
  /** Revenue realized on this specific day (daily delta); null after today. */
  vendasDia: number | null;
  /** Cumulative linear target; null when there is no goal. */
  objetivo: number | null;
  /** Run-rate forecast; null before today (connects at today). */
  previsao: number | null;
  /** Cumulative revenue of the previous month, by day-of-month. */
  mesPassado: number;
  /** Cumulative revenue of the same month last year, by day-of-month. */
  anoPassado: number;
}

export interface ISellerEvolutionSeries {
  sellerId: ID;
  sellerName: string;
  /** Cumulative realized revenue per day (aligned to the day axis); null after today. */
  data: (number | null)[];
}

export interface IEvolutionKpis {
  /** Realized revenue as of today. */
  realized: number;
  /** Target value expected today (proportional); 0 when no goal. */
  expectedToday: number;
  /** Full monthly target; 0 when no goal. */
  target: number;
  /** Projected revenue at month end (forecast). */
  projection: number;
  /** target - projection (positive = below target). */
  gap: number;
}

export interface IBuildEvolutionInput {
  /** "Today" — drives current month, day count and the realized cutoff. */
  referenceDate: Date;
  currentMonthOrders: IOrder[];
  previousMonthOrders: IOrder[];
  lastYearMonthOrders: IOrder[];
  /** Monthly revenue target, or null when no active goal. */
  targetValue: number | null;
}

function orderTimestamp(order: IOrder): string {
  return order.paidAt ?? order.createdAt;
}

/** Bucket paid orders' revenue by day-of-month. Index 0 unused; days are 1-based. */
function revenueByDay(orders: IOrder[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const o of orders) {
    if (o.paymentStatus !== "pago") continue;
    const day = new Date(orderTimestamp(o)).getDate();
    out.set(day, (out.get(day) ?? 0) + o.total);
  }
  return out;
}

/** Cumulative array for days 1..daysInMonth from a per-day map. */
function cumulative(byDay: Map<number, number>, daysInMonth: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let d = 1; d <= daysInMonth; d += 1) {
    acc += byDay.get(d) ?? 0;
    out.push(acc);
  }
  return out;
}

export function buildDailyEvolution(input: IBuildEvolutionInput): IDailyEvolutionPoint[] {
  const { referenceDate, currentMonthOrders, previousMonthOrders, lastYearMonthOrders, targetValue } =
    input;

  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);

  const curByDay = revenueByDay(currentMonthOrders);
  const curCum = cumulative(curByDay, daysInMonth);
  const prevCum = cumulative(revenueByDay(previousMonthOrders), daysInMonth);
  const lastYearCum = cumulative(revenueByDay(lastYearMonthOrders), daysInMonth);

  const realizedToday = curCum[today - 1] ?? 0;
  const runRate = today > 0 ? realizedToday / today : 0;

  const points: IDailyEvolutionPoint[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const weekday = new Date(year, month, d).getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    points.push({
      day: d,
      weekdayLabel: WEEKDAY_LABELS[weekday]!,
      isWeekend,
      vendas: d <= today ? (curCum[d - 1] ?? 0) : null,
      vendasDia: d <= today ? (curByDay.get(d) ?? 0) : null,
      objetivo: targetValue == null ? null : Math.round((targetValue * d) / daysInMonth),
      previsao: d < today ? null : Math.round(runRate * d),
      mesPassado: prevCum[d - 1] ?? 0,
      anoPassado: lastYearCum[d - 1] ?? 0,
    });
  }
  return points;
}

export function computeEvolutionKpis(
  points: IDailyEvolutionPoint[],
  referenceDate: Date,
  targetValue: number | null,
): IEvolutionKpis {
  const daysInMonth = points.length;
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);
  const todayPoint = points[today - 1];
  const lastPoint = points[daysInMonth - 1];
  const realized = todayPoint?.vendas ?? 0;
  const target = targetValue ?? 0;
  const expectedToday = todayPoint?.objetivo ?? 0;
  const projection = lastPoint?.previsao ?? realized;
  return { realized, expectedToday, target, projection, gap: target - projection };
}

const SELLER_TOP_N = 6;

export function buildSellerEvolution(
  currentMonthOrders: IOrder[],
  sellerNameById: Map<ID, string>,
  referenceDate: Date,
  outrosLabel: string,
): ISellerEvolutionSeries[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = Math.min(Math.max(referenceDate.getDate(), 1), daysInMonth);

  // per-seller per-day revenue
  const bySeller = new Map<ID, Map<number, number>>();
  const totals = new Map<ID, number>();
  for (const o of currentMonthOrders) {
    if (o.paymentStatus !== "pago") continue;
    const day = new Date(o.paidAt ?? o.createdAt).getDate();
    const perDay = bySeller.get(o.sellerId) ?? new Map<number, number>();
    perDay.set(day, (perDay.get(day) ?? 0) + o.total);
    bySeller.set(o.sellerId, perDay);
    totals.set(o.sellerId, (totals.get(o.sellerId) ?? 0) + o.total);
  }

  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, SELLER_TOP_N).map(([id]) => id);
  const rest = ranked.slice(SELLER_TOP_N).map(([id]) => id);

  const toSeries = (sellerId: ID, name: string, perDayMaps: Map<number, number>[]): ISellerEvolutionSeries => {
    const data: (number | null)[] = [];
    let acc = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
      for (const m of perDayMaps) acc += m.get(d) ?? 0;
      data.push(d <= today ? acc : null);
    }
    return { sellerId, sellerName: name, data };
  };

  const series = top.map((id) => toSeries(id, sellerNameById.get(id) ?? "—", [bySeller.get(id) ?? new Map()]));

  if (rest.length > 0) {
    series.push(toSeries("outros", outrosLabel, rest.map((id) => bySeller.get(id) ?? new Map())));
  }
  return series;
}
