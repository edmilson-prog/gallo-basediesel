import { describe, expect, it } from "vitest";
import { computeNfeKeyCheckDigit, isValidNfeKey, parseNfeKey } from "./nfeKey";

// Chaves com DV recalculado. As chaves do ui_kit (nf-data.jsx) têm dígito
// verificador INVÁLIDO — são ficção de design. Não copiar de lá.
const DIESELTEC = "35260804887213000190550010000301291000301298";
const BOSCH = "35260845990181000189550030000412551000412558";

describe("computeNfeKeyCheckDigit", () => {
  it("computes the module-11 check digit over the first 43 digits", () => {
    expect(computeNfeKeyCheckDigit(DIESELTEC.slice(0, 43))).toBe(8);
    expect(computeNfeKeyCheckDigit(BOSCH.slice(0, 43))).toBe(8);
  });

  it("returns 0 when the remainder is 0 or 1", () => {
    // 43 zeros: sum = 0, rest = 0 → DV 0
    expect(computeNfeKeyCheckDigit("0".repeat(43))).toBe(0);
  });
});

describe("isValidNfeKey", () => {
  it("accepts a well-formed key", () => {
    expect(isValidNfeKey(DIESELTEC)).toBe(true);
  });

  it("accepts a key with separators and normalizes them away", () => {
    expect(isValidNfeKey("3526 0804 8872 1300 0190 5500 1000 0301 2910 0030 1298")).toBe(true);
  });

  it("rejects a key whose check digit does not match", () => {
    const tampered = DIESELTEC.slice(0, 43) + "9";
    expect(isValidNfeKey(tampered)).toBe(false);
  });

  it("rejects a key with any mutated digit", () => {
    const mutated = "9" + DIESELTEC.slice(1);
    expect(isValidNfeKey(mutated)).toBe(false);
  });

  it("rejects wrong length and non-digits", () => {
    expect(isValidNfeKey(DIESELTEC.slice(0, 43))).toBe(false);
    expect(isValidNfeKey("x".repeat(44))).toBe(false);
    expect(isValidNfeKey("")).toBe(false);
  });
});

describe("parseNfeKey", () => {
  it("decomposes a valid key into its fields", () => {
    expect(parseNfeKey(DIESELTEC)).toEqual({
      uf: "35",
      yearMonth: "2608",
      cnpj: "04887213000190",
      model: "55",
      series: "001",
      number: "000030129",
      emissionType: "1",
      code: "00030129",
      checkDigit: "8",
    });
  });

  it("returns null for an invalid key", () => {
    expect(parseNfeKey(DIESELTEC.slice(0, 43) + "9")).toBeNull();
  });
});
