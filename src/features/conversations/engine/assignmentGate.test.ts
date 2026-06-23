import { describe, it, expect } from "vitest";
import { mustAssignToReply } from "./assignmentGate";

describe("mustAssignToReply", () => {
  it("gates a pool conversation for a non-staff user", () => {
    expect(mustAssignToReply({ assignedSellerId: undefined }, { isStaff: false })).toBe(true);
  });

  it("gates a pool conversation (null assignee) for a non-staff user", () => {
    expect(mustAssignToReply({ assignedSellerId: null as unknown as undefined }, { isStaff: false })).toBe(true);
  });

  it("never gates staff, even in the pool", () => {
    expect(mustAssignToReply({ assignedSellerId: undefined }, { isStaff: true })).toBe(false);
  });

  it("does not gate an assigned conversation for a non-staff user", () => {
    expect(mustAssignToReply({ assignedSellerId: "seller-1" }, { isStaff: false })).toBe(false);
  });

  it("does not gate an assigned conversation for staff", () => {
    expect(mustAssignToReply({ assignedSellerId: "seller-1" }, { isStaff: true })).toBe(false);
  });
});
