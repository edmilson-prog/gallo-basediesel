import { describe, expect, it } from "vitest";
import type { ILead } from "@/shared/types";
import { computeGlobalMetrics } from "./leadMetrics";

const NOW = new Date("2026-03-01T12:00:00.000Z");
/** Inside computeGlobalMetrics' 30-day conversion window. */
const RECENT = "2026-02-20T12:00:00.000Z";
/** Outside it. */
const OLD = "2025-11-01T12:00:00.000Z";

function lead(over: Partial<ILead> & { id: string }): ILead {
  return {
    storeId: "s1",
    sellerId: "v1",
    name: "Teste",
    phone: "+5511999999999",
    temperature: "morno",
    origin: "whatsapp",
    stage: { id: "stage-novo", name: "Novo", order: 1, color: "#5b6b7a" },
    createdAt: RECENT,
    updatedAt: RECENT,
    ...over,
  } as ILead;
}

describe("computeGlobalMetrics", () => {
  it("reports a real conversion rate when converted leads are present", () => {
    const leads = [
      lead({ id: "a", convertedToCustomerId: "c1" }),
      lead({ id: "b" }),
      lead({ id: "c" }),
      lead({ id: "d" }),
    ];
    expect(computeGlobalMetrics(leads, NOW).conversionRate).toBeCloseTo(0.25, 5);
  });

  it("reports zero — not NaN — for an empty set", () => {
    const m = computeGlobalMetrics([], NOW);
    expect(m.conversionRate).toBe(0);
    expect(m.averageCycleDays).toBe(0);
    expect(m.averageValue).toBe(0);
    expect(Number.isNaN(m.conversionRate)).toBe(false);
  });

  /**
   * The defect this suite exists to guard: the caller used to hand over a set
   * from which converted leads had already been filtered, so the numerator was
   * always empty and the bar reported 0,0% by construction. Feeding a set with
   * no converted leads must therefore be indistinguishable from the old bug —
   * which is exactly why the caller, not this function, had to change.
   */
  it("reports zero conversion when the caller strips converted leads first", () => {
    const stripped = [lead({ id: "b" }), lead({ id: "c" })];
    expect(computeGlobalMetrics(stripped, NOW).conversionRate).toBe(0);
  });

  it("scopes the conversion rate to the last 30 days", () => {
    const leads = [
      lead({ id: "old", createdAt: OLD, convertedToCustomerId: "c1" }),
      lead({ id: "recent" }),
    ];
    // The converted lead is outside the window, so it counts for neither side.
    expect(computeGlobalMetrics(leads, NOW).conversionRate).toBe(0);
    // …but it still shows up in the lifetime tally.
    expect(computeGlobalMetrics(leads, NOW).convertedCount).toBe(1);
  });

  it("averages the value of converted leads only, ignoring zeros", () => {
    const leads = [
      lead({ id: "a", convertedToCustomerId: "c1", estimatedValue: 1000 }),
      lead({ id: "b", convertedToCustomerId: "c2", estimatedValue: 3000 }),
      lead({ id: "c", estimatedValue: 999_999 }),
    ];
    expect(computeGlobalMetrics(leads, NOW).averageValue).toBe(2000);
  });
});
