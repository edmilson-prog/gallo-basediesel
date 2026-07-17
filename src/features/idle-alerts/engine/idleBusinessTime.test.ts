import { describe, expect, it } from "vitest";
import { businessSecondsBetween } from "./idleBusinessTime";
import type { IWorkSchedule } from "@/shared/types";

// Mon-Fri 08:00-18:00 São Paulo (weekday 1..5)
const WEEKDAYS: IWorkSchedule = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday: weekday as 1 | 2 | 3 | 4 | 5,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

/** Builds a UTC Date for the given São Paulo wall-clock time (UTC-03:00). */
function sp(iso: string): Date {
  return new Date(`${iso}-03:00`);
}

describe("businessSecondsBetween", () => {
  it("returns raw elapsed seconds when there is no schedule", () => {
    const from = sp("2026-07-13T10:00:00"); // Monday
    const to = sp("2026-07-13T12:30:00");
    expect(businessSecondsBetween(undefined, from, to)).toBe(2.5 * 3600);
    expect(businessSecondsBetween([], from, to)).toBe(2.5 * 3600);
  });

  it("counts only the in-window part of a single day", () => {
    // Monday 07:00 → 09:00: only 08:00-09:00 counts.
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-13T07:00:00"), sp("2026-07-13T09:00:00")),
    ).toBe(3600);
  });

  it("skips the weekend entirely", () => {
    // Saturday 10:00 → Monday 09:00: only Monday 08:00-09:00 counts.
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-11T10:00:00"), sp("2026-07-13T09:00:00")),
    ).toBe(3600);
  });

  it("sums full days across the week", () => {
    // Monday 08:00 → Wednesday 18:00 = 3 × 10h.
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-13T08:00:00"), sp("2026-07-15T18:00:00")),
    ).toBe(30 * 3600);
  });

  it("ignores disabled windows", () => {
    const onlyMonday: IWorkSchedule = [
      { weekday: 1, openAt: "08:00", closeAt: "12:00", enabled: true },
      { weekday: 2, openAt: "08:00", closeAt: "12:00", enabled: false },
    ];
    expect(
      businessSecondsBetween(onlyMonday, sp("2026-07-13T08:00:00"), sp("2026-07-14T12:00:00")),
    ).toBe(4 * 3600);
  });

  it("returns 0 when to <= from", () => {
    expect(
      businessSecondsBetween(WEEKDAYS, sp("2026-07-13T12:00:00"), sp("2026-07-13T12:00:00")),
    ).toBe(0);
  });

  it("clamps the window to the last 90 days", () => {
    // 1 year ago with no schedule: raw diff clamped to 90 days.
    const to = sp("2026-07-13T00:00:00");
    const from = new Date(to.getTime() - 365 * 86400_000);
    expect(businessSecondsBetween(undefined, from, to)).toBe(90 * 86400);
  });
});
