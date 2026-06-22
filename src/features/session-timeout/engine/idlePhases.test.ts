import { describe, expect, it } from "vitest";
import { computeIdlePhase } from "./idlePhases";

const IDLE = 30 * 60_000; // 1_800_000
const WARN = 60_000;
const WARN_AT = IDLE - WARN; // 1_740_000

describe("computeIdlePhase", () => {
  it("is active right after activity", () => {
    expect(computeIdlePhase(0, 0, IDLE, WARN)).toEqual({
      phase: "active",
      msUntilWarning: WARN_AT,
      msUntilLogout: IDLE,
    });
  });

  it("enters warning exactly at idle - warning", () => {
    const r = computeIdlePhase(0, WARN_AT, IDLE, WARN);
    expect(r.phase).toBe("warning");
    expect(r.msUntilWarning).toBe(0);
    expect(r.msUntilLogout).toBe(WARN);
  });

  it("is expired at the idle boundary", () => {
    const r = computeIdlePhase(0, IDLE, IDLE, WARN);
    expect(r.phase).toBe("expired");
    expect(r.msUntilLogout).toBe(0);
  });

  it("treats a future lastActivityAt (clock skew) as active", () => {
    const r = computeIdlePhase(10_000, 0, IDLE, WARN);
    expect(r.phase).toBe("active");
    expect(r.msUntilLogout).toBe(IDLE);
  });

  it("reports the remaining countdown mid-warning", () => {
    const r = computeIdlePhase(0, WARN_AT + 20_000, IDLE, WARN);
    expect(r.phase).toBe("warning");
    expect(r.msUntilLogout).toBe(40_000);
  });
});
