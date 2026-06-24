import { describe, expect, it } from "vitest";
import { formatHandleTime } from "./formatHandleTime";

describe("formatHandleTime", () => {
  it("zero/negativo → travessão", () => {
    expect(formatHandleTime(0)).toBe("—");
    expect(formatHandleTime(-5)).toBe("—");
  });
  it("menos de 1 min → segundos", () => {
    expect(formatHandleTime(45_000)).toBe("45s");
  });
  it("limite superior do sub-minuto → 59s", () => {
    expect(formatHandleTime(59_999)).toBe("59s");
  });
  it("minutos", () => {
    expect(formatHandleTime(12 * 60_000)).toBe("12m");
  });
  it("horas e minutos", () => {
    expect(formatHandleTime((3 * 60 + 12) * 60_000)).toBe("3h 12m");
  });
  it("horas exatas omitem minutos", () => {
    expect(formatHandleTime(2 * 3_600_000)).toBe("2h");
  });
  it("exatamente 1 minuto → 1m", () => {
    expect(formatHandleTime(60_000)).toBe("1m");
  });
});
