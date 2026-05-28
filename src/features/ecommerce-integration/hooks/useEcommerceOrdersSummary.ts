import { useQuery } from "@tanstack/react-query";
import type { ID, IOrder, OrderOrigin } from "@/shared/types";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";

export interface IEcommerceOrdersSummary {
  /** E-commerce orders created in the trailing window. */
  periodCount: number;
  /** E-commerce orders still pending payment/fulfillment. */
  pendingCount: number;
  /** Revenue of e-commerce orders in the window. */
  periodRevenue: number;
  /** Breakdown of all orders by origin (for the cockpit tooltip). */
  byOrigin: Record<OrderOrigin, number>;
  totalOrders: number;
}

const WINDOW_DAYS = 30;

function isWithinWindow(order: IOrder): boolean {
  const created = Date.parse(order.createdAt);
  if (!Number.isFinite(created)) return false;
  return created >= Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Aggregates order counts by origin for the management surfaces
 * (PRD-067 RF-018/019). Powers the Painel Gestor widget and the Cockpit
 * "Total Pedidos" origin breakdown.
 */
export function useEcommerceOrdersSummary(storeId: ID | undefined) {
  const provider = useOrdersProvider();
  return useQuery({
    // Runs even without a store id: the Cockpit's "all stores" view (PRD-067
    // RF-019) needs a cross-store breakdown, while the Painel Gestor widget
    // always passes a scoped store id.
    queryKey: ["ecommerce-integration", "orders-summary", storeId ?? "all"] as const,
    staleTime: 60_000,
    queryFn: async (): Promise<IEcommerceOrdersSummary> => {
      const result = await provider.list({ storeId, pageSize: 500 });
      const byOrigin: Record<OrderOrigin, number> = {
        whatsapp: 0,
        ecommerce: 0,
        portal: 0,
        pwa_externo: 0,
        manual: 0,
      };
      let periodCount = 0;
      let pendingCount = 0;
      let periodRevenue = 0;

      for (const order of result.data) {
        byOrigin[order.origin] = (byOrigin[order.origin] ?? 0) + 1;
        if (order.origin !== "ecommerce") continue;
        if (isWithinWindow(order)) {
          periodCount += 1;
          periodRevenue += order.total;
        }
        const open =
          order.fulfillmentStatus !== "entregue" && order.fulfillmentStatus !== "cancelado";
        if (open) pendingCount += 1;
      }

      return {
        periodCount,
        pendingCount,
        periodRevenue,
        byOrigin,
        totalOrders: result.data.length,
      };
    },
  });
}
