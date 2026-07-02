import { describe, expect, it } from "vitest";
import { isRecentEvent } from "./isRecentEvent";

describe("isRecentEvent", () => {
  const now = "2026-07-01T12:00:00.000Z";

  it("is recent exactly at the age limit", () => {
    const eventIso = "2026-07-01T11:59:00.000Z"; // 60s before now
    expect(isRecentEvent(eventIso, now, 60_000)).toBe(true);
  });

  it("is not recent just past the age limit", () => {
    const eventIso = "2026-07-01T11:58:59.000Z"; // 61s before now
    expect(isRecentEvent(eventIso, now, 60_000)).toBe(false);
  });

  it("treats a small future timestamp (clock skew) as recent", () => {
    const eventIso = "2026-07-01T12:00:10.000Z"; // 10s after now, within skew tolerance
    expect(isRecentEvent(eventIso, now, 60_000)).toBe(true);
  });

  it("rejects an implausible far-future timestamp", () => {
    const eventIso = "2026-07-01T12:02:00.000Z"; // 2min after now, beyond skew tolerance
    expect(isRecentEvent(eventIso, now, 60_000)).toBe(false);
  });

  it("is not recent for an invalid timestamp", () => {
    expect(isRecentEvent("not-a-date", now, 60_000)).toBe(false);
  });
});
