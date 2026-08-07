import { describe, expect, it } from "vitest";
import { buildContactSearchOr } from "./contacts";

describe("buildContactSearchOr", () => {
  it("returns null for blank input", () => {
    expect(buildContactSearchOr("   ")).toBeNull();
  });

  it("builds an ilike OR across name, email, role, city and phone", () => {
    expect(buildContactSearchOr("Joao")).toBe(
      "name.ilike.*Joao*,email.ilike.*Joao*,role.ilike.*Joao*,city.ilike.*Joao*,phone.ilike.*Joao*",
    );
  });

  it("neutralizes PostgREST or() delimiters in the term", () => {
    const result = buildContactSearchOr("a,b(c)");
    expect(result).not.toBeNull();
    expect(result!.split(",").every((col) => col.includes("*a b c *"))).toBe(true);
  });

  it("adds a digits-only phone_digits filter for phone-shaped terms", () => {
    const result = buildContactSearchOr("98888-4188");
    expect(result).toContain("phone_digits.ilike.*988884188*");
  });

  it("adds no digit filter when the term has no digits", () => {
    expect(buildContactSearchOr("Joao")).not.toContain("phone_digits");
  });

  it("uses * as the ilike wildcard, never %, inside the compound filter", () => {
    expect(buildContactSearchOr("Joao")).not.toContain("%");
  });
});
