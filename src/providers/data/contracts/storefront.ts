import type { ID, IPart, IStorefrontConfig } from "@/shared/types";

/**
 * Read-only contract for the PUBLIC storefront (loja B2C — `/loja`).
 *
 * The storefront is consumed by anonymous shoppers (Postgres `anon` role under
 * Supabase). Unlike the internal catalog (`IPartsProvider`), this provider
 * exposes only the public projection of a part — cost, margin, suppliers, price
 * tables, fiscal data, SEFAZ status and storage location are NEVER returned.
 *
 * Keeping the storefront on its own contract (instead of reusing
 * `IPartsProvider`) means the public column projection lives in one place and
 * the internal catalog path stays untouched — staff keep full visibility.
 *
 * @see ../impl/supabase/storefront.ts  (PUBLIC_COLUMNS + RPC-backed config/ranking)
 * @see ../impl/mock/storefront.ts       (delegates to the mock layer)
 */
export interface IStorefrontProvider {
  /**
   * Full public catalog snapshot. The storefront does its filtering, sorting
   * and pagination client-side, so this returns the bulk set in name order.
   * Under Supabase, RLS already narrows this to active parts for `anon`.
   */
  listCatalog(): Promise<IPart[]>;
  /** Single part by id (the `/loja/produto/:slug` param carries the id). */
  getPart(id: ID): Promise<IPart>;
  /** Functional equivalents of a part (public projection). */
  listEquivalents(id: ID): Promise<IPart[]>;
  /** The store's storefront configuration (hero, footer, SEO, featured, …). */
  getConfig(storeId: ID): Promise<IStorefrontConfig>;
  /**
   * Part ids ranked by units sold (paid/partial orders, last 90 days),
   * descending. Computed server-side so the private `orders` table is never
   * exposed to the public role.
   */
  listTopSellingIds(storeId: ID, limit?: number): Promise<ID[]>;
}
