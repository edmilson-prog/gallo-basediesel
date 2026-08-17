import { describe, expect, it } from "vitest";
import {
  areaCodeOf,
  companyEmailDomainOf,
  nameTokens,
  normalizeEmail,
  phoneKeyOf,
  sharedNameTokens,
} from "./triageMatch";

describe("phoneKeyOf", () => {
  it("collapses the 9th-digit variants of the same number onto one key", () => {
    // This is the pair the base actually produces: the WhatsApp JID keeps the
    // 9, the ERP import does not.
    expect(phoneKeyOf("+5555996482210")).toBe(phoneKeyOf("(55) 9648-2210"));
  });

  it("ignores formatting and the country code", () => {
    expect(phoneKeyOf("+55 (54) 99630-2288")).toBe(phoneKeyOf("5499630-2288"));
  });

  it("returns null for values that are not a BR phone", () => {
    expect(phoneKeyOf(null)).toBeNull();
    expect(phoneKeyOf("")).toBeNull();
    expect(phoneKeyOf("12345")).toBeNull();
  });
});

describe("areaCodeOf", () => {
  it("reads the DDD off a dial-formatted number", () => {
    expect(areaCodeOf("+5554996302288")).toBe("54");
  });

  it("returns null when there is no usable phone", () => {
    expect(areaCodeOf("abc")).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Compras@Empresa.COM.br ")).toBe("compras@empresa.com.br");
  });

  it("treats blank as absent", () => {
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("companyEmailDomainOf", () => {
  it("returns the domain of a company address", () => {
    expect(companyEmailDomainOf("compras@fronteiraoeste.com.br")).toBe("fronteiraoeste.com.br");
  });

  it("refuses free hosts — a shared gmail proves nothing", () => {
    expect(companyEmailDomainOf("gilmar.kroth@gmail.com")).toBeNull();
    expect(companyEmailDomainOf("alguem@hotmail.com")).toBeNull();
  });

  it("returns null for malformed addresses", () => {
    expect(companyEmailDomainOf("sem-arroba")).toBeNull();
    expect(companyEmailDomainOf("@dominio.com")).toBeNull();
    expect(companyEmailDomainOf("nome@semponto")).toBeNull();
  });
});

describe("nameTokens", () => {
  it("keeps only the distinctive part of a company name", () => {
    expect(nameTokens("Transportes Fronteira Oeste Ltda")).toEqual(["fronteira", "oeste"]);
    expect(nameTokens("Kroth Terraplanagem")).toEqual(["kroth"]);
  });

  it("strips accents, emoji and parenthetical notes from WhatsApp names", () => {
    expect(nameTokens("Jonas (bomba injetora)")).toEqual(["jonas"]);
    expect(nameTokens("Cláudio Périco")).toEqual(["claudio", "perico"]);
    expect(nameTokens("😀")).toEqual([]);
  });

  it("drops numbers, short words and role words", () => {
    expect(nameTokens("Compras — Fronteira Oeste")).toEqual(["fronteira", "oeste"]);
    expect(nameTokens("(55) 99401-8876")).toEqual([]);
  });

  it("returns an empty list when nothing distinctive is left", () => {
    // Every word is industry vocabulary — this name cannot support a match.
    expect(nameTokens("Auto Peças Diesel Ltda")).toEqual([]);
    expect(nameTokens(null)).toEqual([]);
  });

  it("dedupes repeated words", () => {
    expect(nameTokens("Somensi Frigorífico Somensi")).toEqual(["somensi"]);
  });
});

describe("sharedNameTokens", () => {
  it("finds the surname shared by a person and their company", () => {
    expect(sharedNameTokens("Diego Kroth", "Kroth Terraplanagem")).toEqual(["kroth"]);
  });

  it("does not match on industry words alone", () => {
    // Both are "Diesel" companies and share nothing else — a match here would
    // pair every customer in the base with every other.
    expect(sharedNameTokens("Fávero Diesel", "Gforce Diesel")).toEqual([]);
  });

  it("returns empty when either side has no distinctive token", () => {
    expect(sharedNameTokens("😀", "Kroth Terraplanagem")).toEqual([]);
    expect(sharedNameTokens("Diego Kroth", "")).toEqual([]);
  });
});
