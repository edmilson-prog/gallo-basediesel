import { describe, expect, it } from "vitest";
import { bucketKey, bucketize, averagePerDay } from "./bucketing";

describe("bucketKey", () => {
  it("dia → YYYY-MM-DD", () => {
    expect(bucketKey("2026-06-16T13:45:00Z", "day")).toBe("2026-06-16");
  });
  it("mês → YYYY-MM", () => {
    expect(bucketKey("2026-06-16T13:45:00Z", "month")).toBe("2026-06");
  });
  it("semana → segunda-feira ISO da semana (YYYY-MM-DD)", () => {
    // 2026-06-16 é uma terça; a segunda da semana é 2026-06-15
    expect(bucketKey("2026-06-16T13:45:00Z", "week")).toBe("2026-06-15");
  });
});

describe("bucketize", () => {
  it("conta ocorrências por bucket e ordena crescente", () => {
    const out = bucketize(
      ["2026-06-15T10:00:00Z", "2026-06-15T20:00:00Z", "2026-06-16T09:00:00Z"],
      "day",
    );
    expect(out).toEqual([
      { bucket: "2026-06-15", value: 2 },
      { bucket: "2026-06-16", value: 1 },
    ]);
  });
  it("array vazio → []", () => {
    expect(bucketize([], "day")).toEqual([]);
  });
});

describe("averagePerDay", () => {
  it("total / número de dias do intervalo (inclusivo)", () => {
    // 4 eventos em 2 dias → 2/dia
    const avg = averagePerDay(
      ["2026-06-15T10:00:00Z", "2026-06-15T11:00:00Z", "2026-06-16T10:00:00Z", "2026-06-16T11:00:00Z"],
      "2026-06-15T00:00:00Z",
      "2026-06-16T23:59:59Z",
    );
    expect(avg).toBe(2);
  });
});
