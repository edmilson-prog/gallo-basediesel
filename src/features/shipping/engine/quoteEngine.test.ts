import { describe, it, expect } from "vitest";
import type { IMelhorEnvioConfig, IShippingQuoteOption } from "@/shared/types";
import { applyMarkup, applyFreeShipping, selectCheapest, buildQuoteResult } from "./quoteEngine";

/** Builds a quote option with sensible defaults for tests. */
function opt(
  partial: Partial<IShippingQuoteOption> & { serviceId: number; basePrice: number },
): IShippingQuoteOption {
  return {
    serviceName: `svc-${partial.serviceId}`,
    companyId: 1,
    companyName: "Correios",
    finalPrice: partial.basePrice,
    deliveryDays: 5,
    ...partial,
  };
}

/** Builds a Melhor Envio config with sensible defaults for tests. */
function cfg(partial?: Partial<IMelhorEnvioConfig>): IMelhorEnvioConfig {
  return {
    enabled: true,
    environment: "sandbox",
    originZip: "96020360",
    defaultBox: { heightCm: 20, widthCm: 30, lengthCm: 40 },
    enabledServices: [],
    selectionCriterion: "cheapest",
    markup: { type: "percent", value: 0 },
    ...partial,
  };
}

describe("applyMarkup", () => {
  it("adds a percentage markup", () => {
    expect(applyMarkup(100, { type: "percent", value: 10 })).toBe(110);
  });

  it("adds a fixed markup", () => {
    expect(applyMarkup(100, { type: "fixed", value: 15 })).toBe(115);
  });

  it("returns the price unchanged when the markup value is zero", () => {
    expect(applyMarkup(37.79, { type: "percent", value: 0 })).toBe(37.79);
  });

  it("rounds the result to two decimals", () => {
    expect(applyMarkup(37.79, { type: "percent", value: 10 })).toBe(41.57);
  });

  it("never returns a negative price", () => {
    expect(applyMarkup(10, { type: "fixed", value: -50 })).toBe(0);
  });
});

describe("selectCheapest", () => {
  it("returns the option with the lowest final price", () => {
    const a = opt({ serviceId: 1, basePrice: 50, finalPrice: 50 });
    const b = opt({ serviceId: 2, basePrice: 30, finalPrice: 30 });
    const c = opt({ serviceId: 3, basePrice: 40, finalPrice: 40 });
    expect(selectCheapest([a, b, c])).toBe(b);
  });

  it("returns undefined for an empty list", () => {
    expect(selectCheapest([])).toBeUndefined();
  });
});

describe("applyFreeShipping", () => {
  it("zeroes the price when the subtotal reaches the threshold", () => {
    expect(applyFreeShipping(40, 1000, 500)).toEqual({ value: 0, applied: true });
  });

  it("keeps the price when the subtotal is below the threshold", () => {
    expect(applyFreeShipping(40, 200, 500)).toEqual({ value: 40, applied: false });
  });

  it("applies at the exact threshold (inclusive)", () => {
    expect(applyFreeShipping(40, 500, 500)).toEqual({ value: 0, applied: true });
  });

  it("keeps the price when no threshold is configured", () => {
    expect(applyFreeShipping(40, 999999, undefined)).toEqual({ value: 40, applied: false });
  });
});

describe("buildQuoteResult", () => {
  it("returns null when there are no options (orchestrator falls back)", () => {
    expect(buildQuoteResult([], cfg(), 100)).toBeNull();
  });

  it("selects the cheapest option and fills final prices with the markup", () => {
    const rows = [
      opt({ serviceId: 2, serviceName: "SEDEX", basePrice: 60 }),
      opt({ serviceId: 1, serviceName: "PAC", basePrice: 40 }),
    ];
    const result = buildQuoteResult(rows, cfg({ markup: { type: "percent", value: 10 } }), 100);
    expect(result).not.toBeNull();
    expect(result!.source).toBe("melhor_envio");
    expect(result!.selected?.serviceId).toBe(1);
    expect(result!.selected?.finalPrice).toBe(44); // 40 + 10%
    expect(result!.value).toBe(44);
    expect(result!.isToNegotiate).toBe(false);
    const sedex = result!.options.find((o) => o.serviceId === 2);
    expect(sedex?.finalPrice).toBe(66); // 60 + 10%
  });

  it("applies free shipping above the configured subtotal", () => {
    const rows = [opt({ serviceId: 1, basePrice: 40 })];
    const result = buildQuoteResult(
      rows,
      cfg({ markup: { type: "percent", value: 0 }, freeAboveSubtotal: 500 }),
      800,
    );
    expect(result!.value).toBe(0);
    expect(result!.freeShippingApplied).toBe(true);
    expect(result!.selected?.serviceId).toBe(1);
  });

  it("honours enabledServices, ignoring options outside the allow-list", () => {
    const rows = [
      opt({ serviceId: 1, basePrice: 40 }),
      opt({ serviceId: 17, basePrice: 10 }), // cheaper, but not allowed
    ];
    const result = buildQuoteResult(rows, cfg({ enabledServices: [1, 2] }), 100);
    expect(result!.options).toHaveLength(1);
    expect(result!.selected?.serviceId).toBe(1);
  });

  it("drops options with a non-positive or invalid base price", () => {
    const rows = [
      opt({ serviceId: 1, basePrice: 40 }),
      opt({ serviceId: 2, basePrice: 0 }),
      opt({ serviceId: 3, basePrice: Number.NaN }),
    ];
    const result = buildQuoteResult(rows, cfg(), 100);
    expect(result!.options).toHaveLength(1);
    expect(result!.selected?.serviceId).toBe(1);
  });

  it("returns null when every option is filtered out", () => {
    const rows = [opt({ serviceId: 17, basePrice: 10 })];
    const result = buildQuoteResult(rows, cfg({ enabledServices: [1, 2] }), 100);
    expect(result).toBeNull();
  });
});
