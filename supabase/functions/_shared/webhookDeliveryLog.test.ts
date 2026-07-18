import { describe, expect, it } from "vitest";
import { logWebhookDelivery } from "./webhookDeliveryLog";

function fakeAdmin(insertImpl: (row: unknown) => Promise<{ error: unknown }>) {
  return {
    from: () => ({
      insert: insertImpl,
    }),
  } as unknown as Parameters<typeof logWebhookDelivery>[0];
}

describe("logWebhookDelivery", () => {
  it("inserts a row with the exact column names", async () => {
    let inserted: Record<string, unknown> | null = null;
    const admin = fakeAdmin(async (row) => {
      inserted = row as Record<string, unknown>;
      return { error: null };
    });

    await logWebhookDelivery(admin, {
      integrationName: "whatsapp_waha",
      accountId: "acc-1",
      eventType: "message",
      endpoint: "/waha-webhook",
      httpStatus: 200,
      outcome: "processed",
      requestPayload: { a: 1 },
      traceId: "trace-1",
      latencyMs: 42,
    });

    expect(inserted).toEqual({
      integration_name: "whatsapp_waha",
      account_id: "acc-1",
      event_type: "message",
      endpoint: "/waha-webhook",
      http_status: 200,
      outcome: "processed",
      error_message: null,
      latency_ms: 42,
      request_payload: { a: 1 },
      trace_id: "trace-1",
    });
  });

  it("never throws when the insert fails", async () => {
    const admin = fakeAdmin(async () => ({ error: new Error("boom") }));
    await expect(
      logWebhookDelivery(admin, {
        integrationName: "whatsapp_waha",
        endpoint: "/waha-webhook",
        httpStatus: 500,
        outcome: "error",
        requestPayload: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("never throws when the client itself throws", async () => {
    const admin = {
      from: () => {
        throw new Error("client exploded");
      },
    } as unknown as Parameters<typeof logWebhookDelivery>[0];
    await expect(
      logWebhookDelivery(admin, {
        integrationName: "whatsapp_waha",
        endpoint: "/waha-webhook",
        httpStatus: 500,
        outcome: "error",
        requestPayload: null,
      }),
    ).resolves.toBeUndefined();
  });
});
