/**
 * Raw-payload delivery history for the two inbound webhooks
 * (whatsapp-webhook, waha-webhook) — every call, any outcome. Generic
 * utility (like `_shared/secrets.ts`/`_shared/env.ts`), NOT part of
 * `_shared/whatsapp/**` and never synced from `src/providers/whatsapp/`.
 *
 * Fail-open by design: logging a delivery must never break the delivery
 * itself. Every failure (client throw, insert error) is swallowed here.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";

export type WebhookDeliveryOutcome = "processed" | "ignored" | "duplicate" | "error" | "rejected";

export interface IWebhookDeliveryEntry {
  integrationName: string;
  accountId?: string | null;
  eventType?: string | null;
  endpoint: string;
  httpStatus: number;
  outcome: WebhookDeliveryOutcome;
  errorMessage?: string | null;
  latencyMs?: number | null;
  requestPayload: unknown;
  traceId?: string | null;
}

export async function logWebhookDelivery(
  admin: SupabaseClient,
  entry: IWebhookDeliveryEntry,
): Promise<void> {
  try {
    const { error } = await admin.from("webhook_deliveries").insert({
      integration_name: entry.integrationName,
      account_id: entry.accountId ?? null,
      event_type: entry.eventType ?? null,
      endpoint: entry.endpoint,
      http_status: entry.httpStatus,
      outcome: entry.outcome,
      error_message: entry.errorMessage ?? null,
      latency_ms: entry.latencyMs ?? null,
      request_payload: entry.requestPayload,
      trace_id: entry.traceId ?? null,
    });
    if (error) {
      console.warn(
        JSON.stringify({ level: "warn", msg: "logWebhookDelivery: insert failed", error: error.message }),
      );
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "logWebhookDelivery: unexpected failure",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
