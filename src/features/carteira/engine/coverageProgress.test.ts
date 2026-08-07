import { describe, expect, it } from "vitest";
import { coverageProgress } from "./coverageProgress";

const NOW = new Date("2026-08-06T12:00:00.000Z");

describe("coverageProgress", () => {
  it("reports the midpoint of a window as half elapsed", () => {
    const p = coverageProgress("2026-08-01T12:00:00.000Z", "2026-08-11T12:00:00.000Z", NOW);

    expect(p.elapsed).toBeCloseTo(0.5, 5);
    expect(p.daysLeft).toBe(5);
    expect(p.isOver).toBe(false);
  });

  it("rounds a partial last day UP so the loan is not announced as returned early", () => {
    const p = coverageProgress("2026-08-01T12:00:00.000Z", "2026-08-06T23:59:00.000Z", NOW);

    expect(p.daysLeft).toBe(1);
    expect(p.isOver).toBe(false);
  });

  it("marks a window whose end has passed as over", () => {
    const p = coverageProgress("2026-07-01T12:00:00.000Z", "2026-08-05T12:00:00.000Z", NOW);

    expect(p).toEqual({ daysLeft: 0, elapsed: 1, isOver: true });
  });

  it("treats a missing end date as over instead of counting down to nothing", () => {
    expect(coverageProgress("2026-08-01T12:00:00.000Z", undefined, NOW).isOver).toBe(true);
    expect(coverageProgress(undefined, "not-a-date", NOW).isOver).toBe(true);
  });

  it("still counts days left when the start is missing, but leaves the bar empty", () => {
    const p = coverageProgress(undefined, "2026-08-16T12:00:00.000Z", NOW);

    expect(p.daysLeft).toBe(10);
    expect(p.elapsed).toBe(0);
    expect(p.isOver).toBe(false);
  });

  it("clamps a window that started in the future to an empty bar", () => {
    const p = coverageProgress("2026-08-10T12:00:00.000Z", "2026-08-20T12:00:00.000Z", NOW);

    expect(p.elapsed).toBe(0);
    expect(p.daysLeft).toBe(14);
  });
});
