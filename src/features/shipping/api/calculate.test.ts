import { describe, it, expect } from "vitest";
import type { ICustomerAddress, IShippingConfig, IShippingRate } from "@/shared/types";
import { calculateShipping } from "./calculate";

/** Builds a complete address with only city/state meaningful for the calculator. */
function addr(city: string, state: string): ICustomerAddress {
  return {
    street: "Rua Teste",
    number: "100",
    district: "Centro",
    city,
    state,
    zipCode: "98400000",
  };
}

const CITY_RULE: IShippingRate = {
  id: "r-fw",
  name: "Frederico Westphalen",
  scope: "city",
  cities: ["Frederico Westphalen"],
  baseValue: 50,
  isActive: true,
};
const STATE_RULE: IShippingRate = {
  id: "r-rs",
  name: "RS",
  scope: "state",
  states: ["RS"],
  baseValue: 80,
  isActive: true,
};
const STATES_RULE: IShippingRate = {
  id: "r-sc-pr",
  name: "SC + PR",
  scope: "states",
  states: ["SC", "PR"],
  baseValue: 120,
  isActive: true,
};
const NATIONWIDE_RULE: IShippingRate = {
  id: "r-br",
  name: "Brasil",
  scope: "nationwide",
  baseValue: 200,
  isActive: true,
};

function cfg(partial?: Partial<IShippingConfig>): IShippingConfig {
  return {
    strategy: "fixed_by_region",
    rates: [CITY_RULE, STATE_RULE, STATES_RULE],
    defaultWhenNoMatch: "to_negotiate",
    ...partial,
  };
}

describe("calculateShipping — strategy and address guards", () => {
  it("always returns 'a combinar' for the to_negotiate_default strategy", () => {
    const result = calculateShipping({ config: cfg({ strategy: "to_negotiate_default" }) });
    expect(result.isToNegotiate).toBe(true);
    expect(result.reason).toBe("strategy_to_negotiate");
  });

  it("returns missing_address when the address is undefined", () => {
    const result = calculateShipping({ config: cfg() });
    expect(result.isToNegotiate).toBe(true);
    expect(result.reason).toBe("missing_address");
  });

  it("returns missing_address when both city and state are empty", () => {
    const result = calculateShipping({ address: addr("", ""), config: cfg() });
    expect(result.reason).toBe("missing_address");
  });
});

describe("calculateShipping — no active rules", () => {
  it("falls back to 'a combinar' when there are no active rules", () => {
    const result = calculateShipping({
      address: addr("Frederico Westphalen", "RS"),
      config: cfg({ rates: [{ ...CITY_RULE, isActive: false }] }),
    });
    expect(result.isToNegotiate).toBe(true);
    expect(result.reason).toBe("no_active_rules");
  });

  it("falls back to the fixed default value when configured", () => {
    const result = calculateShipping({
      address: addr("Frederico Westphalen", "RS"),
      config: cfg({
        rates: [],
        defaultWhenNoMatch: "fixed_value",
        defaultFallbackValue: 99,
      }),
    });
    expect(result.isToNegotiate).toBe(false);
    expect(result.value).toBe(99);
    expect(result.reason).toBe("no_active_rules");
  });
});

describe("calculateShipping — matching by specificity", () => {
  it("matches a city rule and returns its base value", () => {
    const result = calculateShipping({ address: addr("Frederico Westphalen", "RS"), config: cfg() });
    expect(result.value).toBe(50);
    expect(result.appliedRate?.id).toBe("r-fw");
    expect(result.reason).toBe("matched_rate");
  });

  it("prefers the most specific (city) rule over a matching state rule", () => {
    const result = calculateShipping({
      address: addr("Frederico Westphalen", "RS"),
      config: cfg({ rates: [STATE_RULE, CITY_RULE] }),
    });
    expect(result.appliedRate?.id).toBe("r-fw");
  });

  it("matches a single-state rule when the city does not match", () => {
    const result = calculateShipping({ address: addr("Porto Alegre", "RS"), config: cfg() });
    expect(result.value).toBe(80);
    expect(result.appliedRate?.id).toBe("r-rs");
  });

  it("matches a multi-state rule", () => {
    const result = calculateShipping({ address: addr("Curitiba", "PR"), config: cfg() });
    expect(result.value).toBe(120);
    expect(result.appliedRate?.id).toBe("r-sc-pr");
  });

  it("matches the nationwide rule as the broadest fallback", () => {
    const result = calculateShipping({
      address: addr("Manaus", "AM"),
      config: cfg({ rates: [CITY_RULE, NATIONWIDE_RULE] }),
    });
    expect(result.value).toBe(200);
    expect(result.appliedRate?.id).toBe("r-br");
  });
});

describe("calculateShipping — no match fallback", () => {
  it("returns 'a combinar' when nothing matches and default is to_negotiate", () => {
    const result = calculateShipping({ address: addr("Manaus", "AM"), config: cfg() });
    expect(result.isToNegotiate).toBe(true);
    expect(result.reason).toBe("no_match_negotiate");
  });

  it("returns the fixed default when nothing matches and default is fixed_value", () => {
    const result = calculateShipping({
      address: addr("Manaus", "AM"),
      config: cfg({ defaultWhenNoMatch: "fixed_value", defaultFallbackValue: 150 }),
    });
    expect(result.value).toBe(150);
    expect(result.reason).toBe("no_match_fixed");
  });
});

describe("calculateShipping — preliminary_by_weight", () => {
  const weightedCfg = cfg({
    strategy: "preliminary_by_weight",
    rates: [{ ...STATE_RULE, weightSurcharge: 2 }],
  });

  it("adds the per-kg surcharge from the summed item weight", () => {
    const result = calculateShipping({
      address: addr("Porto Alegre", "RS"),
      items: [{ quantity: 2, weightKg: 3 }],
      config: weightedCfg,
    });
    // 80 base + 2/kg * (2 * 3 = 6kg) = 92
    expect(result.value).toBe(92);
    expect(result.reason).toBe("matched_rate");
    expect(result.notes).toContain("peso");
  });

  it("lets totalWeightKg override the item-summed weight", () => {
    const result = calculateShipping({
      address: addr("Porto Alegre", "RS"),
      items: [{ quantity: 2, weightKg: 3 }],
      totalWeightKg: 10,
      config: weightedCfg,
    });
    // 80 + 2 * 10 = 100
    expect(result.value).toBe(100);
  });

  it("returns only the base value when the matched rate has no surcharge", () => {
    const result = calculateShipping({
      address: addr("Porto Alegre", "RS"),
      items: [{ quantity: 2, weightKg: 3 }],
      config: cfg({ strategy: "preliminary_by_weight" }),
    });
    expect(result.value).toBe(80);
  });
});
