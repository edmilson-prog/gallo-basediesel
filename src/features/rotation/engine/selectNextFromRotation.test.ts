import { describe, expect, it } from "vitest";
import type { ID, IRotationParticipant, IRotationQueue, ISeller } from "@/shared/types";
import { selectNextFromRotation } from "./selectNextFromRotation";

const now = new Date("2026-06-16T12:00:00Z"); // Tue 09:00 SP — unrestricted (no schedule)

function seller(id: string, over: Partial<ISeller> = {}): ISeller {
  return {
    id, storeId: "store-matriz", fullName: id, email: `${id}@x.com`, type: "internal",
    availability: "online", divisions: ["parts"], active: true,
    createdAt: "2026-01-01T00:00:00.000Z", ...over,
  };
}
function part(refId: string, order: number, over: Partial<IRotationParticipant> = {}): IRotationParticipant {
  return { id: `p-${refId}`, queueId: "q1", scopeDepartmentId: null, refType: "seller", refId, order, enabled: true, ...over };
}
function queue(over: Partial<IRotationQueue> = {}): IRotationQueue {
  return { id: "q1", storeId: "store-matriz", targetMode: "direct", lastAssignedRefId: null, skipOffline: true, createdAt: "x", updatedAt: "x", ...over };
}
function byId(...s: ISeller[]): Record<ID, ISeller> {
  return Object.fromEntries(s.map((x) => [x.id, x]));
}

describe("selectNextFromRotation — direct", () => {
  it("skips offline and advances the pointer (RF-008/009)", () => {
    // order [carlos, marina(offline), rafael], last = carlos → evaluate marina(skip), pick rafael
    const carlos = seller("carlos");
    const marina = seller("marina", { availability: "offline" });
    const rafael = seller("rafael");
    const r = selectNextFromRotation({
      queue: queue({ lastAssignedRefId: "carlos" }),
      participants: [part("carlos", 0), part("marina", 1), part("rafael", 2)],
      membersByDepartment: {},
      sellersById: byId(carlos, marina, rafael),
      now,
    });
    expect(r.selectedSellerId).toBe("rafael");
    expect(r.nextTopPointer).toBe("rafael");
    const marinaCand = r.candidates.find((c) => c.refId === "marina");
    expect(marinaCand?.reason).toBe("skipped_offline");
  });

  it("wraps around to the first when last is the tail", () => {
    const a = seller("a"); const b = seller("b");
    const r = selectNextFromRotation({
      queue: queue({ lastAssignedRefId: "b" }),
      participants: [part("a", 0), part("b", 1)],
      membersByDepartment: {}, sellersById: byId(a, b), now,
    });
    expect(r.selectedSellerId).toBe("a");
  });

  it("returns empty when nobody is eligible (RF-011)", () => {
    const a = seller("a", { availability: "offline" });
    const r = selectNextFromRotation({
      queue: queue(), participants: [part("a", 0)],
      membersByDepartment: {}, sellersById: byId(a), now,
    });
    expect(r.selectedSellerId).toBeNull();
    expect(r.nextTopPointer).toBeNull();
  });

  it("starts from the head when the pointer is stale/absent", () => {
    const a = seller("a"); const b = seller("b");
    const r = selectNextFromRotation({
      queue: queue({ lastAssignedRefId: "ghost" }),
      participants: [part("a", 0), part("b", 1)],
      membersByDepartment: {}, sellersById: byId(a, b), now,
    });
    expect(r.selectedSellerId).toBe("a");
  });

  it("skips a disabled participant even when online", () => {
    const a = seller("a"); const b = seller("b");
    const r = selectNextFromRotation({
      queue: queue({ lastAssignedRefId: null }),
      participants: [part("a", 0, { enabled: false }), part("b", 1)],
      membersByDepartment: {}, sellersById: byId(a, b), now,
    });
    expect(r.selectedSellerId).toBe("b");
    const aCand = r.candidates.find((c) => c.refId === "a");
    expect(aCand?.reason).toBe("skipped_disabled");
  });
});

describe("selectNextFromRotation — department (two levels, RF-010)", () => {
  it("selects next eligible department and its next member; advances both pointers", () => {
    const c1 = seller("c1"); const c2 = seller("c2"); const l1 = seller("l1");
    const q = queue({ targetMode: "department", lastAssignedRefId: null });
    const top = [
      { id: "pd-pesados", queueId: "q1", scopeDepartmentId: null, refType: "department" as const, refId: "dep-pesados", order: 0, enabled: true, lastAssignedMemberId: "c1" },
      { id: "pd-leves", queueId: "q1", scopeDepartmentId: null, refType: "department" as const, refId: "dep-leves", order: 1, enabled: true },
    ];
    const r = selectNextFromRotation({
      queue: q,
      participants: top,
      membersByDepartment: {
        "dep-pesados": [part("c1", 0, { scopeDepartmentId: "dep-pesados" }), part("c2", 1, { scopeDepartmentId: "dep-pesados" })],
        "dep-leves": [part("l1", 0, { scopeDepartmentId: "dep-leves" })],
      },
      sellersById: byId(c1, c2, l1), now,
    });
    expect(r.selectedDepartmentId).toBe("dep-pesados"); // first in order, has eligible members
    expect(r.selectedSellerId).toBe("c2"); // internal pointer was c1 → next is c2
    expect(r.nextTopPointer).toBe("dep-pesados");
    expect(r.nextMemberPointerByDept["dep-pesados"]).toBe("c2");
  });

  it("skips a department with no eligible members", () => {
    const c1 = seller("c1", { availability: "offline" }); const l1 = seller("l1");
    const r = selectNextFromRotation({
      queue: queue({ targetMode: "department" }),
      participants: [
        { id: "pd-pesados", queueId: "q1", scopeDepartmentId: null, refType: "department", refId: "dep-pesados", order: 0, enabled: true },
        { id: "pd-leves", queueId: "q1", scopeDepartmentId: null, refType: "department", refId: "dep-leves", order: 1, enabled: true },
      ],
      membersByDepartment: {
        "dep-pesados": [part("c1", 0, { scopeDepartmentId: "dep-pesados" })],
        "dep-leves": [part("l1", 0, { scopeDepartmentId: "dep-leves" })],
      },
      sellersById: byId(c1, l1), now,
    });
    expect(r.selectedDepartmentId).toBe("dep-leves");
    expect(r.selectedSellerId).toBe("l1");
    expect(r.nextTopPointer).toBe("dep-leves");
  });
});
