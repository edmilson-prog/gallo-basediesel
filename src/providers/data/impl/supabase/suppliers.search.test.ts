import { describe, expect, it } from "vitest";
import { buildSupplierSearchOr } from "./suppliers";

describe("buildSupplierSearchOr", () => {
  it("returns null for blank input", () => {
    expect(buildSupplierSearchOr("   ")).toBeNull();
  });

  it("builds an ilike filter on corporate_name for an ordinary term", () => {
    expect(buildSupplierSearchOr("Bosch")).toBe("corporate_name.ilike.*Bosch*");
  });

  it("neutralizes PostgREST or() delimiters in the term", () => {
    const result = buildSupplierSearchOr("a,b(c)");
    expect(result).not.toBeNull();
    expect(result).toBe("corporate_name.ilike.*a b c *");
  });

  it("adds a digits-only cnpj filter for terms containing digits", () => {
    const result = buildSupplierSearchOr("11.222.333/0001-81");
    expect(result).toContain("cnpj.ilike.*11222333000181*");
  });

  it("adds no cnpj filter when the term has no digits", () => {
    expect(buildSupplierSearchOr("Bosch")).not.toContain("cnpj");
  });

  it("uses * as the ilike wildcard, never %, anywhere in the compound filter", () => {
    expect(buildSupplierSearchOr("Bosch")).not.toContain("%");
    expect(buildSupplierSearchOr("11.222.333/0001-81")).not.toContain("%");
    expect(buildSupplierSearchOr("a,b(c)")).not.toContain("%");
  });
});
