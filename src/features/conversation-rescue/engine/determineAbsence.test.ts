import { describe, it, expect } from "vitest";
import { determineAbsence } from "./determineAbsence";

const NOW = new Date("2026-07-17T15:00:00-03:00");

describe("determineAbsence", () => {
  it("returns null when the seller is online and within schedule", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "online",
      awaitingReplySince: "2026-07-17T14:50:00-03:00",
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBeNull();
  });

  it("returns 'schedule' immediately when outside the work schedule, regardless of availability", () => {
    const result = determineAbsence({
      isWithinSchedule: false,
      availability: "online",
      awaitingReplySince: "2026-07-17T14:59:30-03:00",
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBe("schedule");
  });

  it("returns null when within schedule, away, but the grace period has not elapsed", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "ausente",
      awaitingReplySince: "2026-07-17T14:50:00-03:00", // 10 min ago
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBeNull();
  });

  it("returns 'temporary' when within schedule, away, and the grace period elapsed", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "ausente",
      awaitingReplySince: "2026-07-17T14:44:00-03:00", // 16 min ago
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBe("temporary");
  });

  it("treats 'ocupado' and 'offline' the same as 'ausente' for the temporary case", () => {
    const base = {
      isWithinSchedule: true,
      awaitingReplySince: "2026-07-17T14:44:00-03:00",
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    };
    expect(determineAbsence({ ...base, availability: "ocupado" })).toBe("temporary");
    expect(determineAbsence({ ...base, availability: "offline" })).toBe("temporary");
  });

  it("is exact at the boundary — elapsed === grace minutes counts as elapsed", () => {
    const result = determineAbsence({
      isWithinSchedule: true,
      availability: "ausente",
      awaitingReplySince: "2026-07-17T14:45:00-03:00", // exactly 15 min ago
      now: NOW,
      temporaryAbsenceGraceMinutes: 15,
    });
    expect(result).toBe("temporary");
  });
});
