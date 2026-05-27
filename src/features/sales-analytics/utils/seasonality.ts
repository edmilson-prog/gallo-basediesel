/**
 * Year-over-year (YoY) seasonality detection.
 *
 * Compares the revenue of the calendar month containing `referenceIso`
 * against the same month one year earlier. The card is shown when the
 * absolute change exceeds the configured threshold (default 25%).
 */

import type { IOrder } from "@/shared/types";

export interface ISeasonalitySignal {
  /** YYYY-MM of the current month being highlighted. */
  monthKey: string;
  currentRevenue: number;
  previousRevenue: number;
  /** Integer percent change (sign preserved). */
  changePct: number;
  /** True when |changePct| >= threshold. */
  isSignificant: boolean;
}

const DEFAULT_THRESHOLD_PCT = 25;

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/**
 * Compute the seasonality signal for the calendar month of `referenceIso`,
 * comparing it to the same month one year earlier inside `orders`. Only orders
 * with `paidAt` are considered — unpaid orders do not represent revenue.
 */
export function computeSeasonalitySignal(
  orders: IOrder[],
  referenceIso: string = new Date().toISOString(),
  thresholdPct: number = DEFAULT_THRESHOLD_PCT,
): ISeasonalitySignal | null {
  const reference = new Date(referenceIso);
  if (Number.isNaN(reference.getTime())) return null;

  const currentKey = monthKey(reference.toISOString());
  const previousDate = new Date(reference);
  previousDate.setFullYear(reference.getFullYear() - 1);
  const previousKey = monthKey(previousDate.toISOString());

  let currentRevenue = 0;
  let previousRevenue = 0;

  for (const order of orders) {
    if (!order.paidAt) continue;
    const key = monthKey(order.paidAt);
    if (key === currentKey) currentRevenue += order.total;
    else if (key === previousKey) previousRevenue += order.total;
  }

  if (previousRevenue <= 0 && currentRevenue <= 0) return null;
  if (previousRevenue <= 0) {
    return {
      monthKey: currentKey,
      currentRevenue,
      previousRevenue,
      changePct: 0,
      isSignificant: false,
    };
  }

  const changePct = Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 100);
  return {
    monthKey: currentKey,
    currentRevenue,
    previousRevenue,
    changePct,
    isSignificant: Math.abs(changePct) >= thresholdPct,
  };
}

/** Render the YYYY-MM key as Brazilian month + year (e.g. `maio/2026`). */
export function formatMonthKey(key: string): string {
  const [year, month] = key.split("-");
  const monthIdx = Math.max(0, Math.min(11, Number(month) - 1));
  const names = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${names[monthIdx]}/${year}`;
}
