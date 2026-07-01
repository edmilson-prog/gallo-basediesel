import { describe, it, expect } from "vitest";
import { mustAssignToReply, canReturnToQueue, isOwnConversation } from "./assignmentGate";

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

describe("canReturnToQueue", () => {
  it("allows staff to return an assigned conversation to the queue", () => {
    expect(canReturnToQueue({ assignedSellerId: "seller-1" }, { isStaff: true })).toBe(true);
  });

  it("does not offer it for staff when the conversation is already in the pool", () => {
    expect(canReturnToQueue({ assignedSellerId: undefined }, { isStaff: true })).toBe(false);
  });

  it("treats a null assignee as already in the pool", () => {
    expect(
      canReturnToQueue({ assignedSellerId: null as unknown as undefined }, { isStaff: true }),
    ).toBe(false);
  });

  it("never offers it to a non-staff user, even on an assigned conversation", () => {
    expect(canReturnToQueue({ assignedSellerId: "seller-1" }, { isStaff: false })).toBe(false);
  });

  it("never offers it to a non-staff user in the pool", () => {
    expect(canReturnToQueue({ assignedSellerId: undefined }, { isStaff: false })).toBe(false);
  });
});

describe("isOwnConversation", () => {
  it("is true when the seller is the conversation's assignee", () => {
    expect(isOwnConversation({ assignedSellerId: "seller-1" }, "seller-1")).toBe(true);
  });

  it("is false when the seller is someone else's assignee", () => {
    expect(isOwnConversation({ assignedSellerId: "seller-1" }, "seller-2")).toBe(false);
  });

  it("is false for a pool conversation (no assignee)", () => {
    expect(isOwnConversation({ assignedSellerId: undefined }, "seller-1")).toBe(false);
  });

  it("is false when the seller id is null or undefined", () => {
    expect(isOwnConversation({ assignedSellerId: "seller-1" }, null)).toBe(false);
    expect(isOwnConversation({ assignedSellerId: "seller-1" }, undefined)).toBe(false);
  });
});
