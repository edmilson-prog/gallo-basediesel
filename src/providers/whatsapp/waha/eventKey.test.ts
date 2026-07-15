import { describe, expect, it } from "vitest";
import { buildWahaEventKey } from "./eventKey";

describe("buildWahaEventKey", () => {
  it("scopes the key by event type — message and message.any never collide", () => {
    // WAHA assigns the SAME envelope id to the `message` and `message.any`
    // deliveries reporting one underlying WhatsApp message. The two arrive as
    // separate concurrent HTTP requests; an unscoped key lets whichever wins
    // the isProcessed()/markProcessed() race poison the other — dropping the
    // `message` delivery (the only one that persists the row) whenever
    // `message.any` happens to land first. See 2026-07-15 incident.
    const shared = { accountId: "acc-1", envelopeId: "evt_same_envelope" };
    const messageKey = buildWahaEventKey({ ...shared, event: "message" });
    const messageAnyKey = buildWahaEventKey({ ...shared, event: "message.any" });
    expect(messageKey).not.toBe(messageAnyKey);
  });

  it("is stable for the same event+envelope id — a genuine WAHA retry still dedups", () => {
    const input = { accountId: "acc-1", event: "message", envelopeId: "evt_x" };
    expect(buildWahaEventKey(input)).toBe(buildWahaEventKey(input));
  });

  it("scopes by account id so two accounts never collide on the same envelope id", () => {
    const key1 = buildWahaEventKey({ accountId: "acc-1", event: "message", envelopeId: "evt_x" });
    const key2 = buildWahaEventKey({ accountId: "acc-2", event: "message", envelopeId: "evt_x" });
    expect(key1).not.toBe(key2);
  });
});
