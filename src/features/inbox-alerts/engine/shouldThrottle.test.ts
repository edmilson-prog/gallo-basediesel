import { describe, expect, it } from "vitest";
import { shouldThrottle } from "./shouldThrottle";

describe("shouldThrottle", () => {
  it("never throttles the first beep", () => {
    expect(shouldThrottle(null, 1_000, 1_500)).toBe(false);
  });

  it("throttles within the minimum interval", () => {
    expect(shouldThrottle(1_000, 1_800, 1_500)).toBe(true);
  });

  it("releases once the interval has elapsed", () => {
    expect(shouldThrottle(1_000, 2_600, 1_500)).toBe(false);
  });

  it("releases exactly at the boundary", () => {
    expect(shouldThrottle(1_000, 2_500, 1_500)).toBe(false);
  });
});
