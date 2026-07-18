import { describe, expect, it } from "vitest";
import { buildCustomerSearchOr } from "./customers";

describe("buildCustomerSearchOr", () => {
  it("returns null for blank input", () => {
    expect(buildCustomerSearchOr("   ")).toBeNull();
  });
  it("builds an ilike OR across name, contact, email, phone and documents", () => {
    expect(buildCustomerSearchOr("Joao")).toBe(
      "full_name.ilike.*Joao*,razao_social.ilike.*Joao*,nome_fantasia.ilike.*Joao*," +
        "contact_name.ilike.*Joao*,email.ilike.*Joao*,phone.ilike.*Joao*," +
        "cnpj.ilike.*Joao*,cpf.ilike.*Joao*",
    );
  });
  it("neutralizes PostgREST or() delimiters in the term", () => {
    const result = buildCustomerSearchOr("a,b(c)");
    expect(result).not.toBeNull();
    expect(result!.split(",").every((col) => col.includes("*a b c *"))).toBe(true);
  });
  it("adds digit-normalized filters (with the 9th-digit variant) for phone-shaped terms", () => {
    const result = buildCustomerSearchOr("98888-4188");
    expect(result).toContain("phone_digits.ilike.*988884188*");
    expect(result).toContain("phone_digits.ilike.*88884188*");
    expect(result).toContain("cnpj_digits.ilike.*988884188*");
    expect(result).toContain("cpf_digits.ilike.*88884188*");
  });
  it("adds no digit filters when the term has no digits", () => {
    expect(buildCustomerSearchOr("Joao")).not.toContain("phone_digits");
  });
});
