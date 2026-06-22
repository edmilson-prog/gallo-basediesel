import { describe, expect, it } from "vitest";
import { shouldBeepAtTick } from "./beepSchedule";

const WARN = 60_000;

describe("shouldBeepAtTick", () => {
  it("beeps on the first tick of the window", () => {
    const r = shouldBeepAtTick(WARN, WARN, null);
    expect(r.beep).toBe(true);
    expect(r.urgency).toBeCloseTo(0, 5);
  });

  it("does not beep again too soon after the last beep", () => {
    // last beep at remaining=60000, now remaining=57000 → 3s elapsed (< ~7.6s interval)
    expect(shouldBeepAtTick(57_000, WARN, 60_000).beep).toBe(false);
  });

  it("beeps again once enough time has elapsed", () => {
    // 10s elapsed since last beep, interval ~6.8s → beep
    expect(shouldBeepAtTick(50_000, WARN, 60_000).beep).toBe(true);
  });

  it("beeps densely near the end (urgency high)", () => {
    const r = shouldBeepAtTick(1_000, WARN, 3_000);
    expect(r.beep).toBe(true);
    expect(r.urgency).toBeGreaterThan(0.9);
  });

  it("does not beep once the countdown is over", () => {
    expect(shouldBeepAtTick(0, WARN, 5_000).beep).toBe(false);
  });

  it("does not beep outside the warning window", () => {
    expect(shouldBeepAtTick(WARN + 10_000, WARN, null).beep).toBe(false);
  });
});
