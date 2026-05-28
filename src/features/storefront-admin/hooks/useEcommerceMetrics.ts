import { useQuery } from "@tanstack/react-query";
import type { ID, IOrder } from "@/shared/types";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";

export interface IEcommerceDailyPoint {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Number of e-commerce orders created on that day. */
  orders: number;
  /** Revenue (sum of `total`) of e-commerce orders created on that day. */
  revenue: number;
}

export interface IEcommerceMetrics {
  /** Total e-commerce orders in the window. */
  orderCount: number;
  /** Sum of `total` across e-commerce orders. */
  revenue: number;
  /** Average order value (revenue / orderCount), or 0 when no orders. */
  averageTicket: number;
  /** Orders still pending payment or fulfillment. */
  pendingCount: number;
  /** Daily series for the last 30 days (oldest → newest). */
  daily: IEcommerceDailyPoint[];
  /** Raw e-commerce orders (newest first). */
  orders: IOrder[];
}

const WINDOW_DAYS = 30;

function buildDailySeries(orders: IOrder[]): IEcommerceDailyPoint[] {
  const today = new Date();
  const points: IEcommerceDailyPoint[] = [];
  const byDate = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders) {
    const key = order.createdAt.slice(0, 10);
    const entry = byDate.get(key) ?? { orders: 0, revenue: 0 };
    entry.orders += 1;
    entry.revenue += order.total;
    byDate.set(key, entry);
  }

  for (let i = WINDOW_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDate.get(key);
    points.push({ date: key, orders: entry?.orders ?? 0, revenue: entry?.revenue ?? 0 });
  }
  return points;
}

/**
 * Real e-commerce KPIs derived from `IOrder` with `origin === 'ecommerce'`
 * (PRD-066 RF-004/005). Visits / conversion / abandoned carts remain
 * placeholders rendered by the dashboard tab — those are not derivable from
 * the order model on the MVP.
 */
export function useEcommerceMetrics(storeId: ID | undefined) {
  const provider = useOrdersProvider();
  return useQuery({
    queryKey: ["storefront-admin", "ecommerce-metrics", storeId] as const,
    enabled: Boolean(storeId),
    staleTime: 60_000,
    queryFn: async (): Promise<IEcommerceMetrics> => {
      const result = await provider.list({ storeId, pageSize: 500 });
      const ecommerce = result.data
        .filter((o) => o.origin === "ecommerce")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      const revenue = ecommerce.reduce((acc, o) => acc + o.total, 0);
      const pendingCount = ecommerce.filter(
        (o) => o.paymentStatus === "pendente" || o.fulfillmentStatus === "pendente",
      ).length;

      return {
        orderCount: ecommerce.length,
        revenue,
        averageTicket: ecommerce.length ? revenue / ecommerce.length : 0,
        pendingCount,
        daily: buildDailySeries(ecommerce),
        orders: ecommerce,
      };
    },
  });
}
