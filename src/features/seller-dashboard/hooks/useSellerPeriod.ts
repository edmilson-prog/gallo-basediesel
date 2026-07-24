import { useMemo, useState } from "react";
import { resolveSellerPeriod, type ISellerPeriodWindow, type SellerPeriodKey } from "../engine/period";

export interface IUseSellerPeriodResult {
  period: SellerPeriodKey;
  window: ISellerPeriodWindow;
  setPeriod: (period: SellerPeriodKey) => void;
}

/** Local (non-persisted) period selection for the seller dashboard. */
export function useSellerPeriod(initial: SellerPeriodKey = "hoje"): IUseSellerPeriodResult {
  const [period, setPeriod] = useState<SellerPeriodKey>(initial);
  const window = useMemo(() => resolveSellerPeriod(period, new Date().toISOString()), [period]);
  return { period, window, setPeriod };
}
