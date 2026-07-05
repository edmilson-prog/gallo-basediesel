import { describe, it, expect } from "vitest";
import { resolveInviteCandidates } from "./collaboratorCandidates";
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
});
