import { describe, expect, it } from "vitest";
import { isQueuedConversation } from "./isQueuedConversation";

describe("isQueuedConversation", () => {
  it("is queued when unassigned, not SDR-driven and awaiting", () => {
    expect(
      isQueuedConversation({ assignedSellerId: null, status: "aguardando", isSdrActive: false }),
    ).toBe(true);
  });

  it("is not queued when assigned to a seller", () => {
    expect(
      isQueuedConversation({
        assignedSellerId: "seller-1",
        status: "aguardando",
        isSdrActive: false,
      }),
    ).toBe(false);
  });

  it("is not queued while the SDR is driving it", () => {
    expect(
      isQueuedConversation({ assignedSellerId: null, status: "aguardando", isSdrActive: true }),
    ).toBe(false);
  });

  it("is not queued outside the aguardando status", () => {
    expect(
      isQueuedConversation({ assignedSellerId: null, status: "em_andamento", isSdrActive: false }),
    ).toBe(false);
  });

  it("treats an empty-string assignedSellerId as unassigned", () => {
    expect(
      isQueuedConversation({ assignedSellerId: "", status: "aguardando", isSdrActive: false }),
    ).toBe(true);
  });
});
