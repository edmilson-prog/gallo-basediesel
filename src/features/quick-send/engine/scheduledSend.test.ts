import { describe, expect, it } from "vitest";
import { formatScheduleConfirm, formatScheduleLabel, validateFuture } from "./scheduledSend";

describe("formatScheduleConfirm", () => {
  it("builds a natural-language confirmation with weekday, date, time and timezone", () => {
    // 2026-06-13 is a Saturday. Construct via local parts (machine is BRT).
    const iso = new Date(2026, 5, 13, 14, 29).toISOString();
    expect(formatScheduleConfirm(iso)).toBe(
      "Será enviado sábado, 13/06 às 14:29 (horário de Brasília).",
    );
  });

  it("zero-pads day, month, hour and minute", () => {
    const iso = new Date(2026, 0, 5, 9, 7).toISOString(); // 2026-01-05 09:07, a Monday
    expect(formatScheduleConfirm(iso)).toBe(
      "Será enviado segunda-feira, 05/01 às 09:07 (horário de Brasília).",
    );
  });

  it("returns empty string for null/invalid input (drafts have no time)", () => {
    expect(formatScheduleConfirm(null)).toBe("");
    expect(formatScheduleConfirm("not-a-date")).toBe("");
  });

  it("keeps the short label helper working (regression)", () => {
    const iso = new Date(2026, 5, 13, 14, 29).toISOString();
    expect(formatScheduleLabel(iso)).toBe("13/06 às 14:29");
    expect(validateFuture(iso, new Date(2026, 5, 13, 14, 0).toISOString()).ok).toBe(true);
  });
});
