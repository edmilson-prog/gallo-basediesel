import type { ID, ISeller, ISellerLoadCountRow, SellerAvailability } from "@/shared/types";

export interface ISellerLoadEntry {
  seller: ISeller;
  activeCount: number;
  /** Health band derived from overload threshold (normal / warning / critical). */
  band: "normal" | "warning" | "critical";
}

export interface ISellerLoadOptions {
  /** Threshold above which the row is flagged "critical" (red). */
  overloadThreshold: number;
  /** Hide inactive / unavailable sellers when true. */
  hideInactive?: boolean;
}

const HIDDEN_AVAILABILITY: SellerAvailability[] = ["offline"];

/**
 * Join the per-seller open-conversation counts (from the
 * `service_volume_seller_load` RPC) with the store roster. Sellers with no
 * active conversations are still included so the manager sees the full roster.
 * Ordering: highest load first, ties broken by full name.
 */
export function buildSellerLoadEntries(
  rows: ISellerLoadCountRow[],
  sellers: ISeller[],
  options: ISellerLoadOptions,
): ISellerLoadEntry[] {
  const loadBySeller = new Map<ID, number>(rows.map((r) => [r.sellerId, r.activeCount]));
  const warningThreshold = Math.max(1, Math.floor(options.overloadThreshold * 0.67));
  const overload = options.overloadThreshold;

  const entries: ISellerLoadEntry[] = sellers
    .filter((s) => s.active)
    .filter((s) => !options.hideInactive || !HIDDEN_AVAILABILITY.includes(s.availability))
    .map((seller) => {
      const activeCount = loadBySeller.get(seller.id) ?? 0;
      let band: ISellerLoadEntry["band"] = "normal";
      if (activeCount > overload) band = "critical";
      else if (activeCount > warningThreshold) band = "warning";
      return { seller, activeCount, band };
    });

  entries.sort((a, b) => {
    if (a.activeCount !== b.activeCount) return b.activeCount - a.activeCount;
    return a.seller.fullName.localeCompare(b.seller.fullName);
  });
  return entries;
}
