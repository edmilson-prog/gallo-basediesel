import { describe, expect, it } from "vitest";
import { buildLeadSearchOr } from "./leads";

describe("buildLeadSearchOr", () => {
  it("returns null for blank input", () => {
    expect(buildLeadSearchOr("   ")).toBeNull();
  });
  it("builds an ilike OR across name, phone and email", () => {
    expect(buildLeadSearchOr("Joao")).toBe(
      "name.ilike.*Joao*,phone.ilike.*Joao*,email.ilike.*Joao*",
    );
  });
  it("adds digit-normalized phone filters for phone-shaped terms", () => {
    const result = buildLeadSearchOr("98888-4188");
    expect(result).toContain("phone_digits.ilike.*988884188*");
    expect(result).toContain("phone_digits.ilike.*88884188*");
  });
  it("neutralizes PostgREST or() delimiters in the term", () => {
    expect(buildLeadSearchOr("a,b(c)")).toContain("name.ilike.*a b c *");
  });
});
