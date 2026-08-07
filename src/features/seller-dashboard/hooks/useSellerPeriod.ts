import { useMemo, useState } from "react";
import { useTimeTick } from "@/features/conversations/hooks/useTimeTick";
import {
  resolveSellerPeriod,
  type ISellerPeriodWindow,
  type SellerPeriodKey,
} from "../engine/period";

/**
 * How often the window's upper bound advances. The dashboard is a home screen
 * that stays open all day, so a clock frozen at mount would pin every KPI and
 * the chart to their mount-time values — and, past BRT midnight, would keep the
 * "Hoje" tab showing yesterday.
 */
const TICK_MS = 60_000;

export interface IUseSellerPeriodResult {
  period: SellerPeriodKey;
  window: ISellerPeriodWindow;
  setPeriod: (period: SellerPeriodKey) => void;
  /** Ticking clock shared with the cards, so labels and data agree. */
  now: Date;
}

/** Local (non-persisted) period selection for the seller dashboard. */
export function useSellerPeriod(initial: SellerPeriodKey = "hoje"): IUseSellerPeriodResult {
  const [period, setPeriod] = useState<SellerPeriodKey>(initial);
  const now = useTimeTick(TICK_MS);

  // Bucket the tick to whole minutes so the memo (and every query key derived
  // from it) changes at most once a minute rather than on every render.
  const nowIso = useMemo(() => {
    const bucketed = new Date(now);
    bucketed.setSeconds(0, 0);
    return bucketed.toISOString();
  }, [now]);

  const window = useMemo(() => resolveSellerPeriod(period, nowIso), [period, nowIso]);

  return { period, window, setPeriod, now };
}
