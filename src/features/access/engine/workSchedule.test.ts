import { describe, expect, it } from "vitest";
import type { IWorkSchedule, IScheduleOverride } from "@/shared/types";
import {
  saoPauloParts,
  isWithinWorkSchedule,
  getNextOpenAt,
  validateWorkSchedule,
} from "./workSchedule";

// América/São Paulo é fixo em -03:00 (Brasil sem horário de verão desde 2019).
const ALL_WEEK_8_18: IWorkSchedule = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday: weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
}));

describe("saoPauloParts", () => {
  it("converts a UTC instant to São Paulo wall clock regardless of device TZ", () => {
    // 2026-06-16T12:00:00Z → 09:00 -03:00, terça-feira (weekday 2)
    const p = saoPauloParts(new Date("2026-06-16T12:00:00Z"));
    expect(p.weekday).toBe(2);
    expect(p.minutes).toBe(9 * 60);
    expect(p.ymd).toBe("2026-06-16");
  });

  it("keeps the same calendar day for an evening instant", () => {
    // 2026-06-16T23:30:00Z → 20:30 -03:00, ainda terça
    const p = saoPauloParts(new Date("2026-06-16T23:30:00Z"));
    expect(p.weekday).toBe(2);
    expect(p.minutes).toBe(20 * 60 + 30);
    expect(p.ymd).toBe("2026-06-16");
  });
});

describe("isWithinWorkSchedule", () => {
  it("returns true inside an enabled window", () => {
    expect(
      isWithinWorkSchedule({ workSchedule: ALL_WEEK_8_18 }, new Date("2026-06-16T12:00:00Z")),
    ).toBe(true);
  });

  it("returns false outside the window", () => {
    expect(
      isWithinWorkSchedule({ workSchedule: ALL_WEEK_8_18 }, new Date("2026-06-16T23:30:00Z")),
    ).toBe(false);
  });

  it("treats absent/empty schedule as no restriction (always within)", () => {
    expect(isWithinWorkSchedule({}, new Date("2026-06-16T23:30:00Z"))).toBe(true);
    expect(isWithinWorkSchedule({ workSchedule: [] }, new Date("2026-06-16T23:30:00Z"))).toBe(true);
  });

  it("a `block` override closes a day that the weekly rule would open", () => {
    const overrides: IScheduleOverride[] = [{ date: "2026-06-16", type: "block" }];
    expect(
      isWithinWorkSchedule(
        { workSchedule: ALL_WEEK_8_18, scheduleOverrides: overrides },
        new Date("2026-06-16T12:00:00Z"),
      ),
    ).toBe(false);
  });

  it("an `allow` override opens a day with no weekly window", () => {
    const overrides: IScheduleOverride[] = [{ date: "2026-06-16", type: "allow" }];
    expect(
      isWithinWorkSchedule(
        { workSchedule: [], scheduleOverrides: overrides },
        new Date("2026-06-16T12:00:00Z"),
      ),
    ).toBe(true);
  });
});

describe("getNextOpenAt", () => {
  it("returns the next window start as an ISO instant", () => {
    // Terça 20:30 SP, agenda 08–18 todos os dias → próximo = quarta 08:00 SP = 11:00Z
    const next = getNextOpenAt({ workSchedule: ALL_WEEK_8_18 }, new Date("2026-06-16T23:30:00Z"));
    expect(next).toBe("2026-06-17T11:00:00.000Z");
  });

  it("returns null when there is no schedule", () => {
    expect(getNextOpenAt({}, new Date("2026-06-16T23:30:00Z"))).toBeNull();
  });
});

describe("validateWorkSchedule", () => {
  it("flags closeAt <= openAt", () => {
    const errors = validateWorkSchedule([
      { weekday: 1, openAt: "18:00", closeAt: "08:00", enabled: true },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("flags overlapping windows on the same weekday", () => {
    const errors = validateWorkSchedule([
      { weekday: 1, openAt: "08:00", closeAt: "12:00", enabled: true },
      { weekday: 1, openAt: "11:00", closeAt: "15:00", enabled: true },
    ]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("accepts non-overlapping windows on the same weekday (manhã + tarde)", () => {
    const errors = validateWorkSchedule([
      { weekday: 1, openAt: "08:00", closeAt: "12:00", enabled: true },
      { weekday: 1, openAt: "13:00", closeAt: "18:00", enabled: true },
    ]);
    expect(errors).toEqual([]);
  });
});
