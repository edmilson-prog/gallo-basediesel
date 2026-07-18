import type { IWebhookDeliveriesProvider } from "../contracts/webhookDeliveries";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useWebhookDeliveriesProvider(): IWebhookDeliveriesProvider {
  return useDataProviderSlice("webhookDeliveries", "useWebhookDeliveriesProvider");
}
