import { useQuery } from "@tanstack/react-query";
import { useWebhookDeliveriesProvider, useWhatsAppAccountsProvider } from "@/providers/data";
import type { IWebhookDeliveryFilters } from "@/shared/types";

/** Data plumbing for the "Webhooks" card (raw delivery history). */
export function useWebhookDeliveries(filters: IWebhookDeliveryFilters) {
  const provider = useWebhookDeliveriesProvider();
  return useQuery({
    queryKey: ["system-health", "webhook-deliveries", filters],
    queryFn: () => provider.list(filters),
    staleTime: 15_000,
  });
}

/** Account roster for the card's "Conta" filter dropdown. */
export function useWebhookDeliveryAccountOptions() {
  const accountsProvider = useWhatsAppAccountsProvider();
  return useQuery({
    queryKey: ["system-health", "webhook-deliveries", "accounts"],
    queryFn: () => accountsProvider.list(),
    staleTime: 60_000,
  });
}
