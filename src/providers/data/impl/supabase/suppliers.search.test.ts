import { describe, expect, it } from "vitest";
import { buildSupplierSearchOr } from "./suppliers";

describe("buildSupplierSearchOr", () => {
  it("returns null for blank input", () => {
    expect(buildSupplierSearchOr("   ")).toBeNull();
  });

  it("builds an ilike OR across name and trade_name", () => {
    expect(buildSupplierSearchOr("Bosch")).toBe("name.ilike.*Bosch*,trade_name.ilike.*Bosch*");
  });

  it("neutralizes PostgREST or() delimiters in the term", () => {
    const result = buildSupplierSearchOr("a,b(c)");
    expect(result).not.toBeNull();
    expect(result!.split(",").every((col) => col.includes("*a b c *"))).toBe(true);
  });

  it("adds a digits-only document filter for terms containing digits", () => {
    const result = buildSupplierSearchOr("11.222.333/0001-81");
    expect(result).toContain("document.ilike.*11222333000181*");
  });

  it("adds no document filter when the term has no digits", () => {
    expect(buildSupplierSearchOr("Bosch")).not.toContain("document");
  });

  it("uses * as the ilike wildcard, never %, anywhere in the compound filter", () => {
    expect(buildSupplierSearchOr("Bosch")).not.toContain("%");
    expect(buildSupplierSearchOr("11.222.333/0001-81")).not.toContain("%");
    expect(buildSupplierSearchOr("a,b(c)")).not.toContain("%");
  });
});
