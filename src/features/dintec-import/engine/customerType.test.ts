import { describe, it, expect } from "vitest";
import { resolveCustomerType } from "./customerType";

describe("resolveCustomerType", () => {
  it("returns B2B when only CNPJ is present", () => {
    expect(resolveCustomerType(null, "89626386000155")).toBe("B2B");
  });

  it("returns B2C when only CPF is present", () => {
    expect(resolveCustomerType("19110790004", null)).toBe("B2C");
  });

  it("prioritizes CNPJ when both are present (rare conflict case)", () => {
    expect(resolveCustomerType("19110790004", "89626386000155")).toBe("B2B");
  });

  it("defaults to B2C when neither document is present", () => {
    expect(resolveCustomerType(null, null)).toBe("B2C");
  });
});
