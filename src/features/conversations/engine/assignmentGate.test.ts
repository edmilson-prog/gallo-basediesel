import { describe, it, expect } from "vitest";
import { mustAssignToReply, canReturnToQueue, isOwnConversation, canManageCollaborators, canRemoveCollaborator } from "./assignmentGate";

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

describe("canManageCollaborators", () => {
  it("allows staff regardless of assignment", () => {
    expect(canManageCollaborators({ assignedSellerId: "seller-1" }, { isStaff: true, sellerId: "seller-2" })).toBe(true);
  });

  it("allows the conversation's own assignee", () => {
    expect(canManageCollaborators({ assignedSellerId: "seller-1" }, { isStaff: false, sellerId: "seller-1" })).toBe(true);
  });

  it("denies a non-staff, non-assignee seller", () => {
    expect(canManageCollaborators({ assignedSellerId: "seller-1" }, { isStaff: false, sellerId: "seller-2" })).toBe(false);
  });

  it("denies everyone on a pool conversation (no assignee to manage from)", () => {
    expect(canManageCollaborators({ assignedSellerId: undefined }, { isStaff: false, sellerId: "seller-1" })).toBe(false);
  });
});

describe("canRemoveCollaborator", () => {
  it("allows staff to remove anyone", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: true, sellerId: "seller-9" }),
    ).toBe(true);
  });

  it("allows the assignee to remove any collaborator", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: false, sellerId: "seller-1" }),
    ).toBe(true);
  });

  it("allows a collaborator to remove themselves", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: false, sellerId: "seller-3" }),
    ).toBe(true);
  });

  it("denies an unrelated seller removing someone else's collaboration", () => {
    expect(
      canRemoveCollaborator({ assignedSellerId: "seller-1" }, "seller-3", { isStaff: false, sellerId: "seller-4" }),
    ).toBe(false);
  });
});
