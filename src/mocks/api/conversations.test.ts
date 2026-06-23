import { describe, it, expect } from "vitest";
import { matchesAssignmentAny } from "./conversations";
import type { IConversation } from "@/shared/types";

function conv(over: Partial<IConversation>): IConversation {
  return {
    assignedSellerId: undefined,
    isSdrActive: false,
    status: "aguardando",
    ...(over as object),
  } as IConversation;
}

describe("matchesAssignmentAny", () => {
  it("matches a specific seller", () => {
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s1" }), { sellerIds: ["s1"] })).toBe(true);
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s2" }), { sellerIds: ["s1"] })).toBe(false);
  });
  it("matches the pool with unassigned", () => {
    expect(matchesAssignmentAny(conv({ assignedSellerId: undefined }), { unassigned: true })).toBe(true);
    expect(matchesAssignmentAny(conv({ assignedSellerId: "s1" }), { unassigned: true })).toBe(false);
  });
  it("matches the queue (pool + sdr off + aguardando)", () => {
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, isSdrActive: false, status: "aguardando" }), {
        queue: true,
      }),
    ).toBe(true);
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, isSdrActive: true, status: "aguardando" }), {
        queue: true,
      }),
    ).toBe(false);
    expect(
      matchesAssignmentAny(conv({ assignedSellerId: undefined, status: "em_andamento" }), { queue: true }),
    ).toBe(false);
  });
  it("ORs criteria together", () => {
    const c = conv({ assignedSellerId: "s9" });
    expect(matchesAssignmentAny(c, { sellerIds: ["s1"], unassigned: true })).toBe(false);
    expect(matchesAssignmentAny(c, { sellerIds: ["s9"], unassigned: true })).toBe(true);
  });
});
