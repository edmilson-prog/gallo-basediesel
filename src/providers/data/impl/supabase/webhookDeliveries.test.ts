import { describe, expect, it, vi } from "vitest";
import { supabaseWebhookDeliveriesProvider } from "./webhookDeliveries";
import * as supabaseLib from "@/shared/lib/supabase";

function mockClient(rows: unknown[], calls?: Array<{ method: string; args: unknown[] }>) {
  const builder: Record<string, unknown> = {};
  const methods = ["select", "order", "limit", "eq", "gte", "lte", "range"];
  for (const m of methods) {
    builder[m] = vi.fn((...args: unknown[]) => {
      calls?.push({ method: m, args });
      return builder;
    });
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

  it("builds the query with the real snake_case column names for every filter", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    vi.spyOn(supabaseLib, "getSupabaseClient").mockReturnValue(
      mockClient([], calls) as unknown as ReturnType<typeof supabaseLib.getSupabaseClient>,
    );

    await supabaseWebhookDeliveriesProvider.list({
      accountId: "acc-1",
      outcome: "rejected",
      fromDate: "2026-07-01T00:00:00.000Z",
      toDate: "2026-07-14T00:00:00.000Z",
      limit: 10,
      offset: 5,
    });

    expect(calls).toContainEqual({ method: "eq", args: ["account_id", "acc-1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["outcome", "rejected"] });
    expect(calls).toContainEqual({
      method: "gte",
      args: ["created_at", "2026-07-01T00:00:00.000Z"],
    });
    expect(calls).toContainEqual({
      method: "lte",
      args: ["created_at", "2026-07-14T00:00:00.000Z"],
    });
    expect(calls).toContainEqual({ method: "range", args: [5, 14] });
  });
});
