import { describe, it, expect } from "vitest";
import { toCanonicalPixKey, toDisplayPixKey, isValidPixKey } from "./pixKeyFormat";

describe("toCanonicalPixKey", () => {
  it("strips punctuation from CNPJ and CPF", () => {
    expect(toCanonicalPixKey("cnpj", "12.345.678/0001-95")).toBe("12345678000195");
    expect(toCanonicalPixKey("cpf", "123.456.789-09")).toBe("12345678909");
  });

  it("keeps only digits and a leading + on phone", () => {
    expect(toCanonicalPixKey("phone", "+55 (55) 99999-9999")).toBe("+5555999999999");
  });

  it("lowercases and trims e-mail", () => {
    expect(toCanonicalPixKey("email", "  Financeiro@Gallo.COM.br ")).toBe(
      "financeiro@gallo.com.br",
    );
  });

  it("lowercases a random key and keeps its hyphens", () => {
    expect(toCanonicalPixKey("random", "  E7B4F2A1-3C5D-4E6F-8A9B-0C1D2E3F4A5B ")).toBe(
      "e7b4f2a1-3c5d-4e6f-8a9b-0c1d2e3f4a5b",
    );
  });
});

describe("isValidPixKey", () => {
  // 12345678000195 — base 123456780001 with its real check digits (9 then 5).
  it("accepts a CNPJ with a correct check digit", () => {
    expect(isValidPixKey("cnpj", "12345678000195")).toBe(true);
  });

  it("rejects a CNPJ with a wrong check digit", () => {
    expect(isValidPixKey("cnpj", "12345678000190")).toBe(false);
    expect(isValidPixKey("cnpj", "12345678000191")).toBe(false);
  });

  it("rejects a CNPJ made of repeated digits", () => {
    expect(isValidPixKey("cnpj", "11111111111111")).toBe(false);
  });

  it("accepts a CPF with a correct check digit and rejects a wrong one", () => {
    expect(isValidPixKey("cpf", "12345678909")).toBe(true);
    expect(isValidPixKey("cpf", "12345678900")).toBe(false);
    expect(isValidPixKey("cpf", "11111111111")).toBe(false);
  });

  it("requires the country code on a phone key", () => {
    expect(isValidPixKey("phone", "+5555999999999")).toBe(true);
    expect(isValidPixKey("phone", "5599999999")).toBe(false);
  });

  it("validates e-mail shape", () => {
    expect(isValidPixKey("email", "financeiro@gallo.com.br")).toBe(true);
    expect(isValidPixKey("email", "financeiro@")).toBe(false);
  });

  it("validates the random key as a UUID", () => {
    expect(isValidPixKey("random", "e7b4f2a1-3c5d-4e6f-8a9b-0c1d2e3f4a5b")).toBe(true);
    expect(isValidPixKey("random", "e7b4f2a1-3c5d-4e6f")).toBe(false);
  });

  it("rejects a non-ASCII e-mail key — Latin-1 encoding would corrupt the QR", () => {
    // Rejecting is the only safe move: normalizing "joão" to "joao" would
    // silently produce a DIFFERENT key, and the money would go elsewhere.
    expect(isValidPixKey("email", "joão@empresa.com")).toBe(false);
    expect(isValidPixKey("email", "josé.silva@açucar.com")).toBe(false);
  });

  it("still accepts a plain ASCII e-mail key", () => {
    expect(isValidPixKey("email", "financeiro@gallo.com.br")).toBe(true);
  });
});

describe("toDisplayPixKey", () => {
  it("formats each type for reading", () => {
    expect(toDisplayPixKey("cnpj", "12345678000195")).toBe("12.345.678/0001-95");
    expect(toDisplayPixKey("cpf", "12345678909")).toBe("123.456.789-09");
    expect(toDisplayPixKey("phone", "+5555999999999")).toBe("+55 55 99999-9999");
    expect(toDisplayPixKey("email", "financeiro@gallo.com.br")).toBe("financeiro@gallo.com.br");
  });

  it("returns the canonical value untouched when it is incomplete", () => {
    // A half-typed key in the editor must never be mangled by the formatter.
    expect(toDisplayPixKey("cnpj", "123456")).toBe("123456");
  });
});
