import { describe, it, expect } from "vitest";
import type { ISeller } from "@/shared/types";
import { resolveTeamMemberIds } from "./teamScope";

/**
 * Minimal `ISeller` factory — only the fields `resolveTeamMemberIds` reads
 * (`id`, `departmentId`) plus the strictly required ones for the type.
 */
function makeSeller(id: string, departmentId: string | null = null): ISeller {
  return {
    id,
    storeId: "store-1",
    fullName: `Seller ${id}`,
    email: `${id}@example.com`,
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    departmentId,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
  } satisfies ISeller;
}

describe("resolveTeamMemberIds (PRD-211 Task 13 — team scope)", () => {
  it("returns self plus every other member of the same department", () => {
    const self = makeSeller("s-self", "dep-1");
    const a = makeSeller("s-a", "dep-1");
    const b = makeSeller("s-b", "dep-1");

    const result = resolveTeamMemberIds(self.id, [self, a, b]);

    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(["s-self", "s-a", "s-b"]));
  });

  it("degrades to own when the user has no department peers (empty list)", () => {
    const result = resolveTeamMemberIds("s-self", []);
    expect(result).toEqual(["s-self"]);
  });

  it("degrades to own when the department contains only the user", () => {
    const self = makeSeller("s-self", "dep-1");
    const result = resolveTeamMemberIds(self.id, [self]);
    expect(result).toEqual(["s-self"]);
  });

  it("includes self defensively even when not present in departmentMembers", () => {
    const a = makeSeller("s-a", "dep-1");
    const b = makeSeller("s-b", "dep-1");

    const result = resolveTeamMemberIds("s-self", [a, b]);

    expect(result).toContain("s-self");
    expect(new Set(result)).toEqual(new Set(["s-self", "s-a", "s-b"]));
  });

  it("de-duplicates repeated member ids (including duplicated self)", () => {
    const self = makeSeller("s-self", "dep-1");
    const a = makeSeller("s-a", "dep-1");
    const aDup = makeSeller("s-a", "dep-1");

    const result = resolveTeamMemberIds(self.id, [self, self, a, aDup]);

    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(["s-self", "s-a"]));
  });

  it("produces a deterministic, stable order: self first then others sorted", () => {
    const self = makeSeller("s-self", "dep-1");
    const zed = makeSeller("s-zed", "dep-1");
    const abe = makeSeller("s-abe", "dep-1");
    const mid = makeSeller("s-mid", "dep-1");

    // Input order is intentionally shuffled.
    const result = resolveTeamMemberIds(self.id, [zed, self, mid, abe]);

    expect(result).toEqual(["s-self", "s-abe", "s-mid", "s-zed"]);
  });
});
