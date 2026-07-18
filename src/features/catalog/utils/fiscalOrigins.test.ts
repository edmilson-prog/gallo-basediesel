import { describe, expect, it } from "vitest";
import { FISCAL_ORIGINS, getFiscalOriginLabel } from "./fiscalOrigins";

describe("FISCAL_ORIGINS", () => {
  it("has the 9 NF-e origin codes (0-8)", () => {
    expect(FISCAL_ORIGINS).toHaveLength(9);
    expect(FISCAL_ORIGINS.map((o) => o.code)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
  });
});

describe("getFiscalOriginLabel", () => {
  it("resolves a known code to its label", () => {
    expect(getFiscalOriginLabel("0")).toBe("0 — Nacional");
  });

  it("falls back to the raw value for unknown/legacy codes", () => {
    expect(getFiscalOriginLabel("Nacional")).toBe("Nacional");
  });

  it("returns a dash for undefined", () => {
    expect(getFiscalOriginLabel(undefined)).toBe("—");
  });
});
