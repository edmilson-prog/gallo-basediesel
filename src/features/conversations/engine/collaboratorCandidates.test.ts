import { describe, it, expect } from "vitest";
import { passesInstanceGate, resolveInviteCandidates } from "./collaboratorCandidates";
import type { ISeller } from "@/shared/types";

function seller(id: string, overrides: Partial<ISeller> = {}): ISeller {
  return {
    id,
    storeId: "store-1",
    fullName: `Seller ${id}`,
    email: `${id}@example.com`,
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    ...overrides,
  } as ISeller;
}

describe("resolveInviteCandidates", () => {
  const sellers = [seller("assignee"), seller("collaborator-1"), seller("candidate-a"), seller("candidate-b")];

  it("excludes the current assignee and existing collaborators", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: ["collaborator-1"],
      whatsappAccountId: null,
      crossInstanceAllowed: true,
      accessRules: [],
    });
    expect(result.map((s) => s.id)).toEqual(["candidate-a", "candidate-b"]);
  });

  it("returns everyone eligible when there is no whatsapp instance (pool/lead anônimo)", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: null,
      crossInstanceAllowed: false,
      accessRules: [{ kind: "seller", targetValue: "candidate-a" }],
    });
    expect(result.map((s) => s.id).sort()).toEqual(["candidate-a", "candidate-b", "collaborator-1"]);
  });

  it("returns everyone eligible when cross-instance is allowed, regardless of access rules", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: "account-1",
      crossInstanceAllowed: true,
      accessRules: [{ kind: "seller", targetValue: "candidate-a" }],
    });
    expect(result.map((s) => s.id).sort()).toEqual(["candidate-a", "candidate-b", "collaborator-1"]);
  });

  it("when cross-instance is off, only sellers matching a seller/store access rule for the instance appear", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: "account-1",
      crossInstanceAllowed: false,
      accessRules: [{ kind: "seller", targetValue: "candidate-a" }],
    });
    expect(result.map((s) => s.id)).toEqual(["candidate-a"]);
  });

  it("a 'store' kind rule opens the instance to every seller of the store", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      whatsappAccountId: "account-1",
      crossInstanceAllowed: false,
      accessRules: [{ kind: "store", targetValue: "store-1" }],
    });
    expect(result.map((s) => s.id).sort()).toEqual(["candidate-a", "candidate-b", "collaborator-1"]);
  });

  it("excludes the current user — nobody invites themselves", () => {
    const result = resolveInviteCandidates(sellers, {
      assignedSellerId: "assignee",
      existingCollaboratorIds: [],
      currentSellerId: "candidate-a",
      whatsappAccountId: null,
      crossInstanceAllowed: false,
      accessRules: [],
    });
    expect(result.map((s) => s.id).sort()).toEqual(["candidate-b", "collaborator-1"]);
  });
});

describe("passesInstanceGate", () => {
  const subjects = [
    { id: "s-1", storeId: "store-1" },
    { id: "s-2", storeId: "store-1" },
    { id: "s-3", storeId: "store-2" },
  ];

  it("lets everyone through when the conversation has no instance", () => {
    const result = passesInstanceGate(subjects, {
      whatsappAccountId: null,
      crossInstanceAllowed: false,
      accessRules: [{ kind: "seller", targetValue: "s-1" }],
    });
    expect(result).toEqual(subjects);
  });

  it("lets everyone through when cross-instance invites are allowed", () => {
    const result = passesInstanceGate(subjects, {
      whatsappAccountId: "account-1",
      crossInstanceAllowed: true,
      accessRules: [],
    });
    expect(result).toEqual(subjects);
  });

  it("narrows to seller-rule matches when the gate is active", () => {
    const result = passesInstanceGate(subjects, {
      whatsappAccountId: "account-1",
      crossInstanceAllowed: false,
      accessRules: [{ kind: "seller", targetValue: "s-2" }],
    });
    expect(result.map((s) => s.id)).toEqual(["s-2"]);
  });

  it("a store rule passes only sellers of that store", () => {
    const result = passesInstanceGate(subjects, {
      whatsappAccountId: "account-1",
      crossInstanceAllowed: false,
      accessRules: [{ kind: "store", targetValue: "store-1" }],
    });
    expect(result.map((s) => s.id)).toEqual(["s-1", "s-2"]);
  });

  it("no rules at all means nobody passes", () => {
    const result = passesInstanceGate(subjects, {
      whatsappAccountId: "account-1",
      crossInstanceAllowed: false,
      accessRules: [],
    });
    expect(result).toEqual([]);
  });
});
