import { describe, expect, it } from "vitest";
import { computeFailureRate } from "./whatsappAccounts";

describe("computeFailureRate", () => {
  it("divides failures by total attempts", () => {
    expect(computeFailureRate(95, 5)).toBeCloseTo(0.05);
    expect(computeFailureRate(0, 4)).toBe(1);
  });

  it("returns 0 when there is no traffic (no division by zero)", () => {
    expect(computeFailureRate(0, 0)).toBe(0);
  });
});
