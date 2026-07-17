import { describe, expect, it } from "vitest";
import { sdrEscalationsApi } from "./sdrEscalations";
import { resetMockStorePerFile } from "@/mocks/test-setup";
import { MockConflictError, MockNotFoundError } from "./utils";
import type { ISdrEscalation } from "@/shared/types";

resetMockStorePerFile();

function makeEscalation(id: string): ISdrEscalation {
  return {
    id,
    sessionId: `session-${id}`,
    conversationId: `conv-${id}`,
    storeId: "00000000-0000-0000-0000-000000000001",
    reason: "sdr_failed",
    mode: "urgent",
    contextSummary: {
      customerPhone: "+5511999999999",
      isB2B: false,
      conversationLength: 3,
      timeInSdr: 60,
      collectedData: {},
      sdrTrace: [],
    },
    status: "pending",
    createdAt: "2026-07-17T10:00:00.000Z",
  };
}

describe("sdrEscalationsApi.claim", () => {
  it("assigns the seller and marks the escalation claimed", async () => {
    await sdrEscalationsApi.create(makeEscalation("esc-claim-1"));
    const updated = await sdrEscalationsApi.claim("esc-claim-1", "seller-A");
    expect(updated.assignedSellerId).toBe("seller-A");
    expect(updated.status).toBe("assigned");
    expect(updated.urgentBroadcastClaimedBySellerId).toBe("seller-A");
    expect(updated.urgentBroadcastClaimedAt).toBeTruthy();
    expect(updated.firstHumanResponseAt).toBeUndefined();
  });

  it("throws MockConflictError when already claimed", async () => {
    await sdrEscalationsApi.create(makeEscalation("esc-claim-2"));
    await sdrEscalationsApi.claim("esc-claim-2", "seller-A");
    await expect(sdrEscalationsApi.claim("esc-claim-2", "seller-B")).rejects.toBeInstanceOf(
      MockConflictError,
    );
  });

  it("throws MockNotFoundError for an unknown id", async () => {
    await expect(sdrEscalationsApi.claim("does-not-exist", "seller-A")).rejects.toBeInstanceOf(
      MockNotFoundError,
    );
  });
});
