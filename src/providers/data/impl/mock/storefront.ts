import type { ID, IPart, IStorefrontConfig } from "@/shared/types";
import { DEFAULT_STOREFRONT_CONFIG } from "@/shared/types";
import type { IStorefrontProvider } from "../../contracts/storefront";
import { mockPartsProvider } from "./parts";
import { mockOrdersProvider } from "./orders";
import { mockSettingsProvider } from "./settings";

/**
 * Mock implementation of {@link IStorefrontProvider}.
 *
 * Delegates to the existing mock providers so the storefront behaves EXACTLY
 * as it did before the dedicated public path existed — the public projection is
 * a Supabase (column-grant) concern; in mock mode the full {@link IPart} is
 * returned and the storefront simply ignores the sensitive fields it never
 * renders.
 */

const CATALOG_PAGE_SIZE = 2000;
const TOP_SELLING_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TOP_LIMIT = 2000;

export const mockStorefrontProvider: IStorefrontProvider = {
  async listCatalog(): Promise<IPart[]> {
    const result = await mockPartsProvider.list({ pageSize: CATALOG_PAGE_SIZE });
    return result.data;
  },

  getPart: (id) => mockPartsProvider.get(id),

  listEquivalents: (id) => mockPartsProvider.listEquivalents(id),

  async getConfig(storeId: ID): Promise<IStorefrontConfig> {
    const settings = await mockSettingsProvider.get(storeId);
    return settings.storefront ?? DEFAULT_STOREFRONT_CONFIG;
  },

  async listTopSellingIds(_storeId: ID, limit = DEFAULT_TOP_LIMIT): Promise<ID[]> {
    // Mirror the previous client-side ranking exactly: paid/partial orders,
    // 90-day window, summed quantity per part, descending.
    const result = await mockOrdersProvider.list({ pageSize: CATALOG_PAGE_SIZE });
    const sinceIso = new Date(Date.now() - TOP_SELLING_WINDOW_DAYS * MS_PER_DAY).toISOString();
    const qtyById = new Map<ID, number>();
    for (const order of result.data) {
      if (order.paymentStatus !== "pago" && order.paymentStatus !== "parcial") continue;
      const ts = order.paidAt ?? order.updatedAt ?? order.createdAt;
      if (ts < sinceIso) continue;
      for (const item of order.items) {
        qtyById.set(item.partId, (qtyById.get(item.partId) ?? 0) + item.quantity);
      }
    }
    return [...qtyById.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  },
};
