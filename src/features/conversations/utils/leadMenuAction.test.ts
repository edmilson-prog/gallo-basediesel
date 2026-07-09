import { describe, expect, it } from "vitest";
import { getLeadMenuAction } from "./leadMenuAction";

describe("getLeadMenuAction", () => {
  it("returns null when the conversation already has a customer (already a client, not a lead prospect)", () => {
    const result = getLeadMenuAction(
      { customerId: "cust-1", leadId: undefined },
      { canCreate: true, canView: true },
    );
    expect(result).toBeNull();
  });

  it("returns null when the conversation has a customer even if leadId is also present", () => {
    const result = getLeadMenuAction(
      { customerId: "cust-1", leadId: "lead-1" },
      { canCreate: true, canView: true },
    );
    expect(result).toBeNull();
  });

  it("returns 'view' when a lead is already linked and the user can view leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: "lead-1" },
      { canCreate: true, canView: true },
    );
    expect(result).toBe("view");
  });

  it("returns null when a lead is already linked but the user cannot view leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: "lead-1" },
      { canCreate: true, canView: false },
    );
    expect(result).toBeNull();
  });

  it("returns 'qualify' when there is no customer/lead yet and the user can create leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: undefined },
      { canCreate: true, canView: true },
    );
    expect(result).toBe("qualify");
  });

  it("returns null when there is no customer/lead yet and the user cannot create leads", () => {
    const result = getLeadMenuAction(
      { customerId: undefined, leadId: undefined },
      { canCreate: false, canView: true },
    );
    expect(result).toBeNull();
  });
});
