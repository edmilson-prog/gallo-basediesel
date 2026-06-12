import { describe, expect, it } from "vitest";
import type { IMessage } from "@/shared/types";
import { isReprocessable, STUCK_QUEUED_THRESHOLD_MS } from "./messageDisplay";

const NOW = new Date("2026-06-12T19:00:00.000Z").getTime();

function makeMessage(overrides: Partial<IMessage>): IMessage {
  return {
    id: "m1",
    conversationId: "c1",
    direction: "out",
    authorType: "seller",
    provider: "evolution",
    text: "Olá",
    status: "queued",
    sentAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe("isReprocessable", () => {
  it("returns true for a failed outbound message (existing retry behaviour)", () => {
    expect(isReprocessable(makeMessage({ status: "failed" }), NOW)).toBe(true);
  });

  it("returns true for an outbound queued message stuck past the threshold", () => {
    const sentAt = new Date(NOW - STUCK_QUEUED_THRESHOLD_MS - 1).toISOString();
    expect(isReprocessable(makeMessage({ status: "queued", sentAt }), NOW)).toBe(true);
  });

  it("returns false for a freshly queued (in-flight) outbound message", () => {
    const sentAt = new Date(NOW - 1_000).toISOString();
    expect(isReprocessable(makeMessage({ status: "queued", sentAt }), NOW)).toBe(false);
  });

  it("returns false for sent / delivered / read outbound messages", () => {
    expect(isReprocessable(makeMessage({ status: "sent" }), NOW)).toBe(false);
    expect(isReprocessable(makeMessage({ status: "delivered" }), NOW)).toBe(false);
    expect(isReprocessable(makeMessage({ status: "read" }), NOW)).toBe(false);
  });

  it("returns false for inbound messages regardless of status or age", () => {
    const sentAt = new Date(NOW - STUCK_QUEUED_THRESHOLD_MS - 1).toISOString();
    expect(isReprocessable(makeMessage({ direction: "in", status: "failed" }), NOW)).toBe(false);
    expect(
      isReprocessable(makeMessage({ direction: "in", status: "queued", sentAt }), NOW),
    ).toBe(false);
  });
});
