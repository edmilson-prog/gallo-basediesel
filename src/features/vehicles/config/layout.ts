export type VehicleDetailLayout = "prontuario" | "health" | "rails" | "bento";

export const VEHICLE_DETAIL_LAYOUTS: VehicleDetailLayout[] = [
  "prontuario",
  "health",
  "rails",
  "bento",
];

export const DEFAULT_VEHICLE_DETAIL_LAYOUT: VehicleDetailLayout = "prontuario";

/**
 * `-v2` retires the stored preference from before Prontuário existed: a
 * returning user whose localStorage still said "health" would never see the
 * refactored page. They can still switch back from the header.
 */
export const VEHICLE_LAYOUT_STORAGE_KEY = "gallo-vehicle-detail-layout-v2";

/**
 * Prontuário owns the facts strip and the full history itself (it fuses the
 * pieces the older layouts leave to the page shell), so the page must not
 * render them around it.
 */
export function layoutOwnsFactsAndHistory(layout: VehicleDetailLayout): boolean {
  return layout === "prontuario";
}
