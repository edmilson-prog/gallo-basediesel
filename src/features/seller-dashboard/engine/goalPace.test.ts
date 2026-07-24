import { describe, expect, it } from "vitest";
import { deriveGoalPace } from "./goalPace";
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
    currentValue: 90000,
    progressPercent: 0.5,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveGoalPace", () => {
  it("projects on-track pace within the period", () => {
    const result = deriveGoalPace(goal(), new Date("2026-07-16T00:00:00.000Z"));
    expect(result.percent).toBe(50);
    expect(result.remaining).toBe(90000);
    expect(result.paceLabel).toBe("no ritmo para bater em 31/07");
    expect(result.projectedDate).toBe("2026-07-31T00:00:00.000Z");
  });

  it("flags behind-pace when the projection lands after the period end", () => {
    const result = deriveGoalPace(goal({ currentValue: 30000 }), new Date("2026-07-21T00:00:00.000Z"));
    expect(result.paceLabel).toMatch(/^abaixo do ritmo/);
  });

  it("returns 'meta batida' once currentValue reaches targetValue", () => {
    const result = deriveGoalPace(goal({ currentValue: 200000 }), new Date("2026-07-16T00:00:00.000Z"));
    expect(result.remaining).toBe(0);
    expect(result.paceLabel).toBe("meta batida");
    expect(result.projectedDate).toBeNull();
  });

  it("returns a waiting label before any progress has accumulated", () => {
    const result = deriveGoalPace(goal({ currentValue: 0 }), new Date("2026-07-01T00:00:00.000Z"));
    expect(result.paceLabel).toBe("aguardando dados do mês");
    expect(result.projectedDate).toBeNull();
  });

  it("returns a not-enough-pace label when progress is still zero partway through the period", () => {
    const result = deriveGoalPace(goal({ currentValue: 0 }), new Date("2026-07-16T00:00:00.000Z"));
    expect(result.paceLabel).toBe("sem ritmo suficiente para projetar");
    expect(result.projectedDate).toBeNull();
  });
});
