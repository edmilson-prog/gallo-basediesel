import { describe, it, expect } from "vitest";
import { storeFormSchema } from "./storeForm";

describe("storeFormSchema", () => {
  const valid = {
    name: "GALLO Erechim",
    type: "filial" as const,
    cnpj: "32.990.725/0001-60", // real, check-digit-valid CNPJ
    address: "Rua X, 100 — Erechim/RS",
    activeDivisions: ["parts" as const],
  };

  it("aceita uma loja válida", () => {
    expect(storeFormSchema.safeParse(valid).success).toBe(true);
  });

  it("aceita CNPJ sem máscara", () => {
    expect(storeFormSchema.safeParse({ ...valid, cnpj: "32990725000160" }).success).toBe(true);
  });

  it("rejeita nome curto", () => {
    expect(storeFormSchema.safeParse({ ...valid, name: "G" }).success).toBe(false);
  });

  it("rejeita CNPJ com shape certo mas dígito verificador inválido", () => {
    expect(storeFormSchema.safeParse({ ...valid, cnpj: "12.345.678/0001-90" }).success).toBe(false);
  });

  it("rejeita CNPJ curto", () => {
    expect(storeFormSchema.safeParse({ ...valid, cnpj: "123" }).success).toBe(false);
  });

  it("rejeita sem divisão", () => {
    expect(storeFormSchema.safeParse({ ...valid, activeDivisions: [] }).success).toBe(false);
  });
});
