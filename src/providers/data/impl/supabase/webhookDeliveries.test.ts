import { describe, expect, it, vi } from "vitest";
import { supabaseWebhookDeliveriesProvider } from "./webhookDeliveries";
import * as supabaseLib from "@/shared/lib/supabase";

function mockClient(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "order", "limit", "eq", "gte", "lte", "range"];
  for (const m of methods) {
    builder[m] = vi.fn(() => builder);
  }
  // Supabase query builders are thenable — resolve with the fixture rows.
  builder.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
    resolve({ data: rows, error: null });
  return { from: vi.fn(() => builder) };
}

describe("supabaseWebhookDeliveriesProvider.list", () => {
  it("maps snake_case rows to IWebhookDelivery", async () => {
    const rows = [
      {
        id: "id-1",
        integration_name: "whatsapp_waha",
        account_id: "acc-1",
        event_type: "message",
        endpoint: "/waha-webhook",
        http_status: 200,
        outcome: "processed",
        error_message: null,
        latency_ms: 30,
        request_payload: { hello: "world" },
        trace_id: "trace-1",
        created_at: "2026-07-14T12:00:00.000Z",
      },
    ];
    vi.spyOn(supabaseLib, "getSupabaseClient").mockReturnValue(
      mockClient(rows) as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>,
    );

    const result = await supabaseWebhookDeliveriesProvider.list();

    expect(result).toEqual([
      {
        id: "id-1",
        integrationName: "whatsapp_waha",
        accountId: "acc-1",
        eventType: "message",
        endpoint: "/waha-webhook",
        httpStatus: 200,
        outcome: "processed",
        errorMessage: null,
        latencyMs: 30,
        requestPayload: { hello: "world" },
        traceId: "trace-1",
        createdAt: "2026-07-14T12:00:00.000Z",
      },
    ]);
  });
});
