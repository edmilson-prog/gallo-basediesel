import { describe, expect, it } from "vitest";
import { validateConversion, toConvertInput, type IConversionFormValues } from "./validateConversion";

const base: IConversionFormValues = {
  type: "B2C", fullName: "", cpf: "", razaoSocial: "", nomeFantasia: "", cnpj: "", contactName: "",
};

describe("validateConversion", () => {
  it("B2C requires a name", () => {
    const r = validateConversion({ ...base, fullName: "   " });
    expect(r.valid).toBe(false);
    expect(r.errors.fullName).toBeTruthy();
  });
  it("B2C with a name and no document is valid", () => {
    expect(validateConversion({ ...base, fullName: "João" }).valid).toBe(true);
  });
  it("B2C rejects a malformed CPF", () => {
    const r = validateConversion({ ...base, fullName: "João", cpf: "123" });
    expect(r.valid).toBe(false);
    expect(r.errors.cpf).toBeTruthy();
  });
  it("B2B requires a fantasy name", () => {
    const r = validateConversion({ ...base, type: "B2B" });
    expect(r.valid).toBe(false);
    expect(r.errors.nomeFantasia).toBeTruthy();
  });
  it("B2B with a fantasy name and no document is valid", () => {
    expect(validateConversion({ ...base, type: "B2B", nomeFantasia: "Auto Peças" }).valid).toBe(true);
  });
  it("B2B rejects a malformed CNPJ", () => {
    const r = validateConversion({ ...base, type: "B2B", nomeFantasia: "X", cnpj: "999" });
    expect(r.valid).toBe(false);
    expect(r.errors.cnpj).toBeTruthy();
  });
});

describe("toConvertInput", () => {
  it("maps only the fields of the chosen type (B2C)", () => {
    const input = toConvertInput("c1", { ...base, fullName: "João", cpf: "11122233344" });
    expect(input).toMatchObject({ customerId: "c1", type: "B2C", fullName: "João", cpf: "11122233344" });
    expect(input.razaoSocial).toBeUndefined();
  });
  it("passes the chosen seller id through", () => {
    const input = toConvertInput("c1", { ...base, fullName: "João" }, "s9");
    expect(input.sellerId).toBe("s9");
  });
});
