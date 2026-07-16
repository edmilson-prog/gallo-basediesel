import type { IWebhookDelivery, IWebhookDeliveryFilters } from "@/shared/types";

/**
 * Read-only provider behind the Owner-only "Webhooks" card on the system
 * health dashboard (`/app/gestao/saude`).
 *
 * - `mock` source: a fixed, deterministic set of deliveries spanning every
 *   `outcome` value, so the card renders meaningfully without a backend.
 * - `supabase` source: reads `webhook_deliveries` directly (RLS is the
 *   gate — non-owners get an empty list, not an error).
 */
export interface IWebhookDeliveriesProvider {
  list(filters?: IWebhookDeliveryFilters): Promise<IWebhookDelivery[]>;
}
