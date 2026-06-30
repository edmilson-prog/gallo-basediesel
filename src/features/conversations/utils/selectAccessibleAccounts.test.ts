import { describe, expect, it } from "vitest";
import type { ID, IWhatsAppAccount } from "@/shared/types";
import { selectAccessibleAccounts } from "./selectAccessibleAccounts";

function acc(id: string): IWhatsAppAccount {
  // Only `id` matters for this pure intersection helper; the rest is filler
  // so the fixture satisfies the type without coupling the test to the shape.
  return {
    id,
    storeId: "s1",
    label: id,
    phoneNumber: "+550000000000",
    provider: "evolution",
    credentialsRef: "ref",
    status: "connected",
    capabilities: {} as IWhatsAppAccount["capabilities"],
    currentState: "healthy",
    failoverPolicy: "disabled",
    isFailoverActive: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    purpose: "atendimento",
    alertsMuted: false,
  };
}

describe("selectAccessibleAccounts", () => {
  const all = [acc("a"), acc("b"), acc("c")];

  it("returns [] while access ids are still loading (null)", () => {
    expect(selectAccessibleAccounts(all, null)).toEqual([]);
  });

  it("returns only accounts whose id is accessible (non-staff subset)", () => {
    const result = selectAccessibleAccounts(all, new Set<ID>(["a", "c"]));
    expect(result.map((a) => a.id)).toEqual(["a", "c"]);
  });

  it("returns all accounts when every id is accessible (staff)", () => {
    const result = selectAccessibleAccounts(all, new Set<ID>(["a", "b", "c"]));
    expect(result.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("returns [] when the accessible set is empty", () => {
    expect(selectAccessibleAccounts(all, new Set<ID>())).toEqual([]);
  });

  it("ignores accessible ids that are not present in accounts", () => {
    const result = selectAccessibleAccounts(all, new Set<ID>(["a", "zzz"]));
    expect(result.map((a) => a.id)).toEqual(["a"]);
  });
});
