import { describe, expect, it } from "vitest";
import type { IDistributionResult, IRotationQueueState, ISeller } from "@/shared/types";
import { applyRotationOverride } from "./applyRotationOverride";

const now = new Date("2026-06-16T12:00:00Z");
function seller(id: string, over: Partial<ISeller> = {}): ISeller {
  return { id, storeId: "s", fullName: id, email: `${id}@x`, type: "internal", availability: "online", divisions: ["parts"], active: true, createdAt: "x", ...over };
}
function baseDecision(over: Partial<IDistributionResult> = {}): IDistributionResult {
  return { selectedSellerId: "sdr", isSdrActive: false, status: "aguardando", criterionMatched: "round_robin", candidatesEvaluated: [], mode: "automatic", ...over };
}
const directState = (over: Partial<IRotationQueueState["queue"]> = {}): IRotationQueueState => ({
  queue: { id: "q", storeId: "s", targetMode: "direct", lastAssignedRefId: null, skipOffline: true, createdAt: "x", updatedAt: "x", ...over },
  topParticipants: [
    { id: "p-a", queueId: "q", scopeDepartmentId: null, refType: "seller", refId: "a", order: 0, enabled: true },
    { id: "p-b", queueId: "q", scopeDepartmentId: null, refType: "seller", refId: "b", order: 1, enabled: true },
  ],
  membersByDepartment: {},
});

describe("applyRotationOverride", () => {
  it("overrides the 013 round-robin with the queue selection", () => {
    const r = applyRotationOverride(baseDecision({ criterionMatched: "round_robin" }), directState(), { a: seller("a"), b: seller("b") }, now);
    expect(r.decision.selectedSellerId).toBe("a");
    expect(r.decision.status).toBe("em_andamento");
    expect(r.decision.isSdrActive).toBe(false);
    expect(r.decision.criterionMatched).toBe("round_robin");
    expect(r.pointers.topRefId).toBe("a");
  });

  it("does NOT touch a carteira decision (upstream precedence)", () => {
    const decision = baseDecision({ criterionMatched: "carteira", selectedSellerId: "carlos", status: "em_andamento" });
    const r = applyRotationOverride(decision, directState(), { a: seller("a") }, now);
    expect(r.decision).toEqual(decision);
    expect(r.pointers).toBeNull();
  });

  it("keeps the 013 fallback when the queue has nobody eligible", () => {
    const decision = baseDecision({ criterionMatched: "fallback_fila", selectedSellerId: null });
    const offlineState = directState();
    const r = applyRotationOverride(decision, offlineState, { a: seller("a", { availability: "offline" }), b: seller("b", { availability: "offline" }) }, now);
    expect(r.decision).toEqual(decision);
    expect(r.pointers).toBeNull();
  });
});
