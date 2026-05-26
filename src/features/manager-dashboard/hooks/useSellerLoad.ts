import { useMemo } from "react";
import type { IManagerDashboardSnapshot } from "@/providers/data";
import type { ID, ISeller, SellerAvailability } from "@/shared/types";

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
 * Aggregate the seller carteira load from `openConversations`. Each entry sums
 * conversations whose `assignedSellerId` matches the seller; orphan (unassigned)
 * conversations are intentionally ignored — the orphan queue lives in the inbox.
 *
 * Ordering: highest load first, ties broken by full name. Sellers with no
 * active conversations are still included so the manager sees the full roster.
 */
export function useSellerLoad(
  snapshot: IManagerDashboardSnapshot,
  options: ISellerLoadOptions,
): ISellerLoadEntry[] {
  return useMemo(() => {
    const loadBySeller = new Map<ID, number>();
    for (const conv of snapshot.openConversations) {
      const sellerId = conv.assignedSellerId;
      if (!sellerId) continue;
      loadBySeller.set(sellerId, (loadBySeller.get(sellerId) ?? 0) + 1);
    }

    const warningThreshold = Math.max(1, Math.floor(options.overloadThreshold * 0.67));
    const overload = options.overloadThreshold;

    const entries: ISellerLoadEntry[] = snapshot.sellers
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
  }, [snapshot, options.overloadThreshold, options.hideInactive]);
}
