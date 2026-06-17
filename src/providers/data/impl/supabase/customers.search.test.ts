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
});
