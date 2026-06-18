import { describe, it, expect } from "vitest";
import type { IShippingQuoteInput } from "../types";
import { MockShippingQuoteProvider } from "./MockShippingQuoteProvider";

const baseInput: IShippingQuoteInput = {
  originZip: "98400000",
  destZip: "01018020",
  box: { heightCm: 20, widthCm: 30, lengthCm: 40 },
  weightKg: 5,
  declaredValue: 800,
  environment: "sandbox",
};

describe("MockShippingQuoteProvider", () => {
  const provider = new MockShippingQuoteProvider();

  it("returns deterministic options for the same input", async () => {
    const a = await provider.quote(baseInput);
    const b = await provider.quote(baseInput);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("returns positive prices with finalPrice equal to basePrice (no markup yet)", async () => {
    const options = await provider.quote(baseInput);
    for (const option of options) {
      expect(option.basePrice).toBeGreaterThan(0);
      expect(option.finalPrice).toBe(option.basePrice);
      expect(option.deliveryDays).toBeGreaterThan(0);
    }
  });

  it("filters by the requested services", async () => {
    const options = await provider.quote({ ...baseInput, services: [1] });
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((option) => option.serviceId === 1)).toBe(true);
  });

  it("varies prices by destination CEP", async () => {
    const a = await provider.quote(baseInput);
    const b = await provider.quote({ ...baseInput, destZip: "69005070" });
    expect(a).not.toEqual(b);
  });
});
