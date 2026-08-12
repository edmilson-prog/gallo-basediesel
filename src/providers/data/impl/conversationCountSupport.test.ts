import { describe, expect, it } from "vitest";
import { assertInboxCountParams } from "./conversationCountSupport";

describe("assertInboxCountParams", () => {
  it("accepts the Inbox no-search list params", () => {
    expect(() =>
      assertInboxCountParams({
        status: ["aguardando", "em_andamento"],
        channel: "whatsapp",
        whatsappAccountId: "0f0e0d0c-0b0a-0908-0706-050403020100",
        isSdrActive: false,
        tags: ["vip"],
        fromDate: "2026-07-01T00:00:00.000Z",
        toDate: "2026-07-02T00:00:00.000Z",
        assignmentAny: { sellerIds: ["97834e8d-e1b5-4bb7-9f25-2e58e641fdab"], unassigned: true, queue: true },
      }),
    ).not.toThrow();
  });

  it("rejects params outside the no-search path", () => {
    expect(() => assertInboxCountParams({ storeId: "00000000-0000-0000-0000-000000000001" })).toThrow();
    expect(() => assertInboxCountParams({ search: "volvo" })).toThrow();
    expect(() => assertInboxCountParams({ customerId: "c1" })).toThrow();
    expect(() => assertInboxCountParams({ leadId: "l1" })).toThrow();
    expect(() => assertInboxCountParams({ assignedSellerId: "s1" })).toThrow();
    expect(() => assertInboxCountParams({ unassigned: true })).toThrow();
  });

  it("allows a whitespace-only search (list() treats it as no-search)", () => {
    expect(() => assertInboxCountParams({ search: "   " })).not.toThrow();
    expect(() => assertInboxCountParams({ search: "" })).not.toThrow();
  });
});
