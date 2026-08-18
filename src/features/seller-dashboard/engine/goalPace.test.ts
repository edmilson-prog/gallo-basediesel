import { describe, expect, it } from "vitest";
import { deriveGoalPace, isGoalPeriodCurrent } from "./goalPace";
import type { IGoal } from "@/shared/types";

function goal(overrides: Partial<IGoal> = {}): IGoal {
  return {
    id: "goal-1",
    storeId: "store-1",
    level: "individual",
    targetId: "seller-1",
    sellerId: "seller-1",
    period: { type: "monthly", start: "2026-07-01T00:00:00.000Z", end: "2026-07-31T23:59:59.999Z" },
    metric: "revenue",
    targetValue: 180000,
    // Deliberately absurd: the engine must never read this snapshot — the live
    // figure is passed in as `currentValue`. If a regression starts reading the
    // goal field again, every assertion below breaks loudly.
    currentValue: 999_999_999,
    progressPercent: 0.5,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveGoalPace", () => {
  it("projects on-track pace within the period", () => {
    const result = deriveGoalPace(goal(), 90000, new Date("2026-07-16T00:00:00.000Z"));
    expect(result.percent).toBe(50);
    expect(result.remaining).toBe(90000);
    expect(result.paceLabel).toBe("no ritmo para bater em 31/07");
    expect(result.projectedDate).toBe("2026-07-31T00:00:00.000Z");
  });

  it("flags behind-pace when the projection lands after the period end", () => {
    const result = deriveGoalPace(goal(), 30000, new Date("2026-07-21T00:00:00.000Z"));
    expect(result.paceLabel).toMatch(/^abaixo do ritmo/);
  });

  it("returns 'meta batida' once the live value reaches targetValue", () => {
    const result = deriveGoalPace(goal(), 200000, new Date("2026-07-16T00:00:00.000Z"));
    expect(result.remaining).toBe(0);
    expect(result.paceLabel).toBe("meta batida");
    expect(result.projectedDate).toBeNull();
  });

  it("returns a waiting label before any progress has accumulated", () => {
    const result = deriveGoalPace(goal(), 0, new Date("2026-07-01T00:00:00.000Z"));
    expect(result.paceLabel).toBe("aguardando dados do mês");
    expect(result.projectedDate).toBeNull();
  });

  it("returns a not-enough-pace label when progress is still zero partway through the period", () => {
    const result = deriveGoalPace(goal(), 0, new Date("2026-07-16T00:00:00.000Z"));
    expect(result.paceLabel).toBe("sem ritmo suficiente para projetar");
    expect(result.projectedDate).toBeNull();
  });

  it("ignores the persisted goal.currentValue snapshot entirely", () => {
    // The fixture carries a bogus 999_999_999 snapshot; passing 0 as the live
    // value must yield 0% — proving the snapshot is never consulted.
    const result = deriveGoalPace(goal(), 0, new Date("2026-07-16T00:00:00.000Z"));
    expect(result.percent).toBe(0);
    expect(result.remaining).toBe(180000);
  });
});

describe("isGoalPeriodCurrent", () => {
  it("keeps a goal active through its final day when the end is stored as UTC midnight", () => {
    // The goal form persists new Date("2026-07-31").toISOString() — 21:00 BRT
    // of the 30th as an instant. A naive instant compare would drop the goal
    // two days early; day-granular comparison keeps it through the 31st.
    const g = goal({
      period: {
        type: "monthly",
        start: "2026-07-01T00:00:00.000Z",
        end: "2026-07-31T00:00:00.000Z",
      },
    });
    expect(isGoalPeriodCurrent(g, new Date("2026-07-31T02:00:00.000Z"))).toBe(true); // 30/07 23h BRT
    expect(isGoalPeriodCurrent(g, new Date("2026-08-01T02:00:00.000Z"))).toBe(true); // 31/07 23h BRT
  });

  it("excludes goals whose period has not started or has ended", () => {
    const g = goal();
    expect(isGoalPeriodCurrent(g, new Date("2026-06-30T12:00:00.000Z"))).toBe(false);
    expect(isGoalPeriodCurrent(g, new Date("2026-08-02T12:00:00.000Z"))).toBe(false);
  });

  it("includes the first day of the period", () => {
    const g = goal();
    expect(isGoalPeriodCurrent(g, new Date("2026-07-01T12:00:00.000Z"))).toBe(true);
  });
});
