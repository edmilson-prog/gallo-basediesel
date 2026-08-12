import { describe, expect, it } from "vitest";
import { monthKeyOf, monthLabelOf, monthStrip, parseMonthKey, shiftMonth } from "./csaMonths";

const AGO_2026 = new Date(Date.UTC(2026, 7, 12));

describe("monthKeyOf", () => {
  it("pads the month, because the key is compared as a string", () => {
    expect(monthKeyOf(new Date(Date.UTC(2026, 0, 9)))).toBe("2026-01");
    expect(monthKeyOf(AGO_2026)).toBe("2026-08");
  });
});

describe("parseMonthKey", () => {
  it("accepts the canonical shape", () => {
    expect(parseMonthKey("2026-08")).toEqual({ year: 2026, month: 8 });
  });

  it.each(["2026-8", "26-08", "2026-13", "2026-00", "agosto", ""])(
    "refuses %s instead of guessing",
    (key) => {
      expect(parseMonthKey(key)).toBeNull();
    },
  );
});

describe("shiftMonth", () => {
  it("walks back across the turn of the year", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-01", -2)).toBe("2025-11");
  });

  it("walks forward too", () => {
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });

  it("leaves an unparseable key alone", () => {
    expect(shiftMonth("agosto", -1)).toBe("agosto");
  });
});

describe("monthLabelOf", () => {
  it("abbreviates in Portuguese with a two-digit year", () => {
    expect(monthLabelOf("2026-08")).toBe("ago/26");
    expect(monthLabelOf("2025-12")).toBe("dez/25");
    expect(monthLabelOf("2026-01")).toBe("jan/26");
  });
});

describe("monthStrip", () => {
  it("shows three months, oldest first, with the selection on the right", () => {
    const strip = monthStrip("2026-08", AGO_2026);

    expect(strip.map((chip) => chip.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(strip.map((chip) => chip.isSelected)).toEqual([false, false, true]);
  });

  it("shifts the window when an older month is selected", () => {
    // Tapping the leftmost chip is how the whole history stays reachable.
    expect(monthStrip("2026-06", AGO_2026).map((chip) => chip.key)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
  });

  it("crosses the year boundary", () => {
    expect(monthStrip("2026-01", AGO_2026).map((chip) => chip.label)).toEqual([
      "nov/25",
      "dez/25",
      "jan/26",
    ]);
  });

  it("never offers a month in the future", () => {
    // A chip that always answers "sem dados" teaches people to distrust the screen.
    const strip = monthStrip("2026-12", AGO_2026);

    expect(strip.map((chip) => chip.key)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(strip.at(-1)?.isSelected).toBe(true);
  });

  it("falls back to the current month when the key is garbage", () => {
    expect(monthStrip("agosto", AGO_2026).at(-1)?.key).toBe("2026-08");
  });
});
