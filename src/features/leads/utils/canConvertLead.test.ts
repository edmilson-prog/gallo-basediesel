import { describe, expect, it } from "vitest";
import { canConvertLead } from "./canConvertLead";

describe("canConvertLead", () => {
  const base = {
    canEditLeadStore: false,
    canEditLeadOwn: false,
    isLeadOwner: false,
    isAssignee: false,
  };

  it("allows staff regardless of ownership or assignment", () => {
    expect(canConvertLead({ ...base, canEditLeadStore: true })).toBe(true);
  });

  it("allows the lead owner with own edit", () => {
    expect(canConvertLead({ ...base, canEditLeadOwn: true, isLeadOwner: true })).toBe(true);
  });

  it("allows the assigned attendant with own edit even when not the owner", () => {
    expect(canConvertLead({ ...base, canEditLeadOwn: true, isAssignee: true })).toBe(true);
  });

  it("denies a non-owner, non-assignee even with own edit", () => {
    expect(canConvertLead({ ...base, canEditLeadOwn: true })).toBe(false);
  });

  it("denies an assignee without lead edit permission (e.g. SDR)", () => {
    expect(canConvertLead({ ...base, isAssignee: true })).toBe(false);
  });

  it("denies when nothing applies", () => {
    expect(canConvertLead(base)).toBe(false);
  });
});
