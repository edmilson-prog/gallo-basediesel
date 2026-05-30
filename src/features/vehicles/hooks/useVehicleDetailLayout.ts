import { useCallback, useState } from "react";
import {
  DEFAULT_VEHICLE_DETAIL_LAYOUT,
  VEHICLE_DETAIL_LAYOUTS,
  VEHICLE_LAYOUT_STORAGE_KEY,
  type VehicleDetailLayout,
} from "../config/layout";

function readStoredLayout(): VehicleDetailLayout {
  if (typeof window === "undefined") return DEFAULT_VEHICLE_DETAIL_LAYOUT;
  const raw = window.localStorage.getItem(VEHICLE_LAYOUT_STORAGE_KEY);
  return VEHICLE_DETAIL_LAYOUTS.includes(raw as VehicleDetailLayout)
    ? (raw as VehicleDetailLayout)
    : DEFAULT_VEHICLE_DETAIL_LAYOUT;
}

/**
 * Global (all-vehicles) layout preference, persisted to localStorage. Reads
 * synchronously on first render (lazy initializer) so the correct layout paints
 * first — no flash of the default.
 */
export function useVehicleDetailLayout(): [
  VehicleDetailLayout,
  (layout: VehicleDetailLayout) => void,
] {
  const [layout, setLayoutState] = useState<VehicleDetailLayout>(readStoredLayout);

  const setLayout = useCallback((next: VehicleDetailLayout) => {
    setLayoutState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VEHICLE_LAYOUT_STORAGE_KEY, next);
    }
  }, []);

  return [layout, setLayout];
}
