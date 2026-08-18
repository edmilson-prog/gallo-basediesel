import { describe, expect, it } from "vitest";
import { aggregateMonthly } from "./aggregateMonthly";

const at = (month: string, day: string, score: number) => ({
  score,
  respondedAt: `${month}-${day}T12:00:00.000Z`,
});

describe("aggregateMonthly", () => {
  it("groups by calendar month in ascending order", () => {
    const result = aggregateMonthly(
      [at("2026-07", "10", 10), at("2026-06", "05", 9), at("2026-08", "01", 8)],
      { minResponses: 1 },
    );
    expect(result.map((point) => point.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("computes the score per month", () => {
    const result = aggregateMonthly(
      [at("2026-07", "01", 10), at("2026-07", "02", 10), at("2026-07", "03", 3)],
      { minResponses: 1 },
    );
    // 2 promotores, 1 detrator em 3 → 66,67 − 33,33 = 33,33 → 33
    expect(result[0]?.score).toBe(33);
    expect(result[0]?.n).toBe(3);
    expect(result[0]?.promoters).toBe(2);
    expect(result[0]?.detractors).toBe(1);
  });

  it("breaks the line instead of spiking on a thin month", () => {
    const result = aggregateMonthly([at("2026-07", "01", 10), at("2026-07", "02", 10)], {
      minResponses: 5,
    });
    expect(result[0]?.score).toBeNull();
    expect(result[0]?.n).toBe(2);
  });

  it("applies the minimum per month, not to the whole set", () => {
    const july = [1, 2, 3, 4, 5].map((day) => at("2026-07", `0${day}`, 10));
    const august = [at("2026-08", "01", 10)];
    const result = aggregateMonthly([...july, ...august], { minResponses: 5 });
    expect(result[0]?.score).toBe(100);
    expect(result[1]?.score).toBeNull();
  });

  it("returns an empty list for no responses", () => {
    expect(aggregateMonthly([], { minResponses: 5 })).toEqual([]);
  });
});
