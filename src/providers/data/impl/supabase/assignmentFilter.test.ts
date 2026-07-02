import { describe, it, expect } from "vitest";
import { buildAssignmentOrFilter, sanitizeSellerIds } from "./assignmentFilter";

const U1 = "11111111-1111-1111-1111-111111111111";
const U2 = "22222222-2222-2222-2222-222222222222";

describe("buildAssignmentOrFilter", () => {
  it("returns null with no criteria", () => {
    expect(buildAssignmentOrFilter(undefined)).toBeNull();
    expect(buildAssignmentOrFilter({})).toBeNull();
    expect(buildAssignmentOrFilter({ sellerIds: [] })).toBeNull();
  });
  it("builds a seller IN term", () => {
    expect(buildAssignmentOrFilter({ sellerIds: [U1, U2] })).toBe(
      `assigned_seller_id.in.(${U1},${U2})`,
    );
  });
  it("builds the queue term as a nested and()", () => {
    expect(buildAssignmentOrFilter({ queue: true })).toBe(
      "and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)",
    );
  });
  it("composes seller ids + queue", () => {
    expect(buildAssignmentOrFilter({ sellerIds: [U1], queue: true })).toBe(
      `assigned_seller_id.in.(${U1}),and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)`,
    );
  });
  it("drops crafted non-UUID tokens (filter injection guard)", () => {
    // A hand-edited URL token that tries to break out of the in.() list.
    expect(buildAssignmentOrFilter({ sellerIds: ["a),status.eq.resolvida"] })).toBeNull();
    expect(buildAssignmentOrFilter({ sellerIds: ["a),status.eq.resolvida", U1] })).toBe(
      `assigned_seller_id.in.(${U1})`,
    );
  });
});

describe("sanitizeSellerIds", () => {
  it("keeps only well-formed UUIDs", () => {
    expect(sanitizeSellerIds(undefined)).toEqual([]);
    expect(sanitizeSellerIds([U1, "not-a-uuid", "a),x", U2])).toEqual([U1, U2]);
  });
});
