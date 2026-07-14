import type {
  IWebhookDelivery,
  IWebhookDeliveryFilters,
  WebhookDeliveryOutcome,
} from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";
import type { IWebhookDeliveriesProvider } from "../../contracts/webhookDeliveries";

/**
 * Supabase implementation of {@link IWebhookDeliveriesProvider}.
 *
 * Reads `webhook_deliveries` directly — no RPC needed, RLS
 * (`webhook_deliveries_owner_read`) already restricts rows to the Owner;
 * non-owners simply get an empty array back, never an error.
 */

const DEFAULT_LIMIT = 100;

interface IWebhookDeliveryRow {
  id: string;
  integration_name: string;
  account_id: string | null;
  event_type: string | null;
  endpoint: string;
  http_status: number;
  outcome: string;
  error_message: string | null;
  latency_ms: number | null;
  request_payload: unknown;
  trace_id: string | null;
  created_at: string;
}

function rowToWebhookDelivery(row: IWebhookDeliveryRow): IWebhookDelivery {
  return {
    id: row.id,
    integrationName: row.integration_name,
    accountId: row.account_id,
    eventType: row.event_type,
    endpoint: row.endpoint,
    httpStatus: row.http_status,
    outcome: row.outcome as WebhookDeliveryOutcome,
    errorMessage: row.error_message,
    latencyMs: row.latency_ms,
    requestPayload: row.request_payload,
    traceId: row.trace_id,
    createdAt: row.created_at,
  };
}

export const supabaseWebhookDeliveriesProvider: IWebhookDeliveriesProvider = {
  async list(filters: IWebhookDeliveryFilters = {}): Promise<IWebhookDelivery[]> {
    const limit = filters.limit ?? DEFAULT_LIMIT;
    let query = getSupabaseClient()
      .from("webhook_deliveries")
      .select(
        "id, integration_name, account_id, event_type, endpoint, http_status, outcome, error_message, latency_ms, request_payload, trace_id, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (filters.accountId) query = query.eq("account_id", filters.accountId);
    if (filters.outcome) query = query.eq("outcome", filters.outcome);
    if (filters.fromDate) query = query.gte("created_at", filters.fromDate);
    if (filters.toDate) query = query.lte("created_at", filters.toDate);
    if (filters.offset) query = query.range(filters.offset, filters.offset + limit - 1);

    const { data, error } = await query;
    if (error) throw new Error(`webhook_deliveries: ${error.message}`);
    return ((data ?? []) as IWebhookDeliveryRow[]).map(rowToWebhookDelivery);
  },
};
