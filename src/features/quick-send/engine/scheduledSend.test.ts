import { describe, expect, it } from "vitest";
import { isDue, validateFuture } from "./scheduledSend";

const NOW = "2026-06-06T12:00:00.000Z";

describe("isDue", () => {
  it("is true when scheduledFor equals now", () => {
    expect(isDue(NOW, NOW)).toBe(true);
  });
  it("is true when scheduledFor is in the past", () => {
    expect(isDue("2026-06-06T11:00:00.000Z", NOW)).toBe(true);
  });
  it("is false when scheduledFor is in the future", () => {
    expect(isDue("2026-06-06T13:00:00.000Z", NOW)).toBe(false);
  });
});

describe("validateFuture", () => {
  it("rejects a past datetime", () => {
    const r = validateFuture("2026-06-06T11:00:00.000Z", NOW);
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });
  it("rejects now exactly (must be strictly future)", () => {
    expect(validateFuture(NOW, NOW).ok).toBe(false);
  });
  it("accepts a future datetime", () => {
    expect(validateFuture("2026-06-06T18:00:00.000Z", NOW)).toEqual({ ok: true });
  });
});
