import { describe, it, expect } from "vitest";
import { resolveAccessRecipients } from "./accessRecipients";

const SELLERS = [
  { id: "s1", role: "seller_internal", storeId: "loja-1" },
  { id: "s2", role: "seller_internal", storeId: "loja-1" },
  { id: "s3", role: "sdr", storeId: "loja-1" },
];

describe("resolveAccessRecipients", () => {
  it("counts a role rule by matching sellers", () => {
    const set = resolveAccessRecipients([{ kind: "role", targetValue: "seller_internal" }], SELLERS);
    expect(set.size).toBe(2);
  });
  it("does not double-count a seller already covered by a role (unique OR)", () => {
    const set = resolveAccessRecipients(
      [
        { kind: "role", targetValue: "seller_internal" },
        { kind: "seller", targetValue: "s1" },
      ],
      SELLERS,
    );
    expect(set.size).toBe(2); // s1 já estava pelo papel
  });
  it("store rule covers everyone in the store", () => {
    const set = resolveAccessRecipients([{ kind: "store", targetValue: "loja-1" }], SELLERS);
    expect(set.size).toBe(3);
  });
});
