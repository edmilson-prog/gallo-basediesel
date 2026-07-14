import { useQuery } from "@tanstack/react-query";
import { useWebhookDeliveriesProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
import type { IWebhookDeliveryFilters, IWhatsAppAccount } from "@/shared/types";

/** Data plumbing for the "Webhooks" card (raw delivery history). */
export function useWebhookDeliveries(filters: IWebhookDeliveryFilters) {
  const provider = useWebhookDeliveriesProvider();
  return useQuery({
    queryKey: ["system-health", "webhook-deliveries", filters],
    queryFn: () => provider.list(filters),
    staleTime: 15_000,
  });
}

/**
 * Account roster for the card's "Conta" filter dropdown.
 *
 * WAHA sessions are excluded from the generic `list()` (it shields the Contas
 * tab / failover pickers / templates screen, which have provider-specific
 * logic that breaks on a WAHA row) — folded back in via `listWaha`, same
 * pattern as `InboxPage.tsx`. This card exists to debug webhook deliveries
 * from ANY engine, WAHA included, so excluding it here would defeat the
 * point for exactly the engine that motivated this feature.
 */
export function useWebhookDeliveryAccountOptions() {
  const accountsProvider = useWhatsAppAccountsProvider();
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  return useQuery({
    queryKey: ["system-health", "webhook-deliveries", "accounts", storeId],
    queryFn: () =>
      Promise.all([
        accountsProvider.list({ storeId }),
        accountsProvider.listWaha({ storeId }).catch(() => [] as IWhatsAppAccount[]),
      ]).then(([base, waha]) => [...base, ...waha]),
    staleTime: 60_000,
  });
}
