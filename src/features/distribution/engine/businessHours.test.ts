import { describe, expect, it } from "vitest";
import { isWithinBusinessHours } from "./businessHours";
import type { IBusinessHoursWindow } from "@/shared/types";

const MONDAY_9AM = new Date(2026, 5, 1, 9, 0); // 2026-06-01 is a Monday
const MONDAY_7AM = new Date(2026, 5, 1, 7, 0);
const SUNDAY_9AM = new Date(2026, 5, 7, 9, 0);

const WEEKDAY_WINDOW: IBusinessHoursWindow = {
  weekday: 1,
  openAt: "08:00",
  closeAt: "18:00",
  enabled: true,
};

describe("isWithinBusinessHours", () => {
  it("returns true when the date falls inside an enabled window for its weekday", () => {
    expect(isWithinBusinessHours(MONDAY_9AM, [WEEKDAY_WINDOW])).toBe(true);
  });

  it("returns false when the date is before the window opens", () => {
    expect(isWithinBusinessHours(MONDAY_7AM, [WEEKDAY_WINDOW])).toBe(false);
  });

  it("returns false when no window matches the weekday", () => {
    expect(isWithinBusinessHours(SUNDAY_9AM, [WEEKDAY_WINDOW])).toBe(false);
  });

  it("ignores disabled windows", () => {
    expect(isWithinBusinessHours(MONDAY_9AM, [{ ...WEEKDAY_WINDOW, enabled: false }])).toBe(false);
  });

  it("returns false for an empty window list", () => {
    expect(isWithinBusinessHours(MONDAY_9AM, [])).toBe(false);
  });
});
