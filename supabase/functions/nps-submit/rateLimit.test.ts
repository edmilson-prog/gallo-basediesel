import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows up to the limit inside the window", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("1.2.3.4", 0)).toBe(true);
    expect(limiter.check("1.2.3.4", 0)).toBe(true);
    expect(limiter.check("1.2.3.4", 0)).toBe(true);
    expect(limiter.check("1.2.3.4", 0)).toBe(false);
  });

  it("isolates distinct IPs", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("1.1.1.1", 0)).toBe(true);
    expect(limiter.check("1.1.1.1", 0)).toBe(false);
    expect(limiter.check("2.2.2.2", 0)).toBe(true);
  });

  it("frees the budget once the window passes", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("1.1.1.1", 0)).toBe(true);
    expect(limiter.check("1.1.1.1", 30_000)).toBe(false);
    expect(limiter.check("1.1.1.1", 60_001)).toBe(true);
  });

  it("slides rather than resetting on a fixed boundary", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000 });
    expect(limiter.check("ip", 0)).toBe(true);
    expect(limiter.check("ip", 900)).toBe(true);
    expect(limiter.check("ip", 950)).toBe(false);
    // The hit at 0 has aged out by 1_001, so one slot frees up — but the hit
    // at 900 is still inside the window and keeps the second slot taken.
    expect(limiter.check("ip", 1_001)).toBe(true);
    expect(limiter.check("ip", 1_002)).toBe(false);
  });
});
