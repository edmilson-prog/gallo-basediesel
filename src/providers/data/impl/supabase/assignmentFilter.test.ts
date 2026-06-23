import { describe, it, expect } from "vitest";
import { buildAssignmentOrFilter } from "./assignmentFilter";

describe("buildAssignmentOrFilter", () => {
  it("returns null with no criteria", () => {
    expect(buildAssignmentOrFilter(undefined)).toBeNull();
    expect(buildAssignmentOrFilter({})).toBeNull();
    expect(buildAssignmentOrFilter({ sellerIds: [] })).toBeNull();
  });
  it("builds a seller IN term", () => {
    expect(buildAssignmentOrFilter({ sellerIds: ["a", "b"] })).toBe("assigned_seller_id.in.(a,b)");
  });
  it("builds the pool term", () => {
    expect(buildAssignmentOrFilter({ unassigned: true })).toBe("assigned_seller_id.is.null");
  });
  it("builds the queue term as a nested and()", () => {
    expect(buildAssignmentOrFilter({ queue: true })).toBe(
      "and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)",
    );
  });
  it("joins multiple criteria with commas (OR)", () => {
    expect(buildAssignmentOrFilter({ sellerIds: ["a"], unassigned: true, queue: true })).toBe(
      "assigned_seller_id.in.(a),assigned_seller_id.is.null,and(assigned_seller_id.is.null,is_sdr_active.eq.false,status.eq.aguardando)",
    );
  });
});
