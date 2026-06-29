import { describe, expect, it } from "vitest";
import { validateConversion, toConvertInput, type IConversionFormValues } from "./validateConversion";

const base: IConversionFormValues = {
  type: "B2C", fullName: "", cpf: "", razaoSocial: "", nomeFantasia: "", cnpj: "", contactName: "",
};

// Real valid documents (check-digit verified).
const VALID_CPF = "52998224725";            // 529.982.247-25 — verified módulo-11
const INVALID_CHECK_CPF = "52998224726";    // right length (11 digits), wrong last check-digit
const VALID_CNPJ = "11444777000161";        // 11.444.777/0001-61 — verified módulo-11
const INVALID_CHECK_CNPJ = "11444777000162"; // right length (14 digits), wrong last check-digit

describe("validateConversion", () => {
  it("B2C requires a name", () => {
    const r = validateConversion({ ...base, fullName: "   " });
    expect(r.valid).toBe(false);
    expect(r.errors.fullName).toBeTruthy();
  });
  it("B2C with a name and no document is valid", () => {
    expect(validateConversion({ ...base, fullName: "João" }).valid).toBe(true);
  });
  it("B2C rejects a malformed CPF (too short)", () => {
    const r = validateConversion({ ...base, fullName: "João", cpf: "123" });
    expect(r.valid).toBe(false);
    expect(r.errors.cpf).toBeTruthy();
  });
  it("B2C rejects a CPF with correct length but wrong check digit", () => {
    const r = validateConversion({ ...base, fullName: "João", cpf: INVALID_CHECK_CPF });
    expect(r.valid).toBe(false);
    expect(r.errors.cpf).toBeTruthy();
  });
  it("B2C accepts a CPF with valid check digits", () => {
    expect(validateConversion({ ...base, fullName: "João", cpf: VALID_CPF }).valid).toBe(true);
  });
  it("B2B requires a fantasy name", () => {
    const r = validateConversion({ ...base, type: "B2B" });
    expect(r.valid).toBe(false);
    expect(r.errors.nomeFantasia).toBeTruthy();
  });
  it("B2B with a fantasy name and no document is valid", () => {
    expect(validateConversion({ ...base, type: "B2B", nomeFantasia: "Auto Peças" }).valid).toBe(true);
  });
  it("B2B rejects a malformed CNPJ (too short)", () => {
    const r = validateConversion({ ...base, type: "B2B", nomeFantasia: "X", cnpj: "999" });
    expect(r.valid).toBe(false);
    expect(r.errors.cnpj).toBeTruthy();
  });
  it("B2B rejects a CNPJ with correct length but wrong check digit", () => {
    const r = validateConversion({ ...base, type: "B2B", nomeFantasia: "X", cnpj: INVALID_CHECK_CNPJ });
    expect(r.valid).toBe(false);
    expect(r.errors.cnpj).toBeTruthy();
  });
  it("B2B accepts a CNPJ with valid check digits", () => {
    expect(validateConversion({ ...base, type: "B2B", nomeFantasia: "X", cnpj: VALID_CNPJ }).valid).toBe(true);
  });
});

describe("toConvertInput", () => {
  it("maps only the fields of the chosen type (B2C)", () => {
    const input = toConvertInput("c1", { ...base, fullName: "João", cpf: VALID_CPF });
    expect(input).toMatchObject({ customerId: "c1", type: "B2C", fullName: "João", cpf: VALID_CPF });
    expect(input.razaoSocial).toBeUndefined();
  });
  it("passes the chosen seller id through", () => {
    const input = toConvertInput("c1", { ...base, fullName: "João" }, "s9");
    expect(input.sellerId).toBe("s9");
  });
  it("normalizes CPF to digits-only", () => {
    const input = toConvertInput("c1", { ...base, fullName: "João", cpf: "529.982.247-25" });
    expect(input.cpf).toBe("52998224725");
  });
  it("normalizes CNPJ to digits-only", () => {
    const input = toConvertInput("c2", { ...base, type: "B2B", nomeFantasia: "X", cnpj: "11.444.777/0001-61" });
    expect(input.cnpj).toBe("11444777000161");
  });
});
