import { describe, it, expect } from "vitest";
import type { ICustomerB2B, ICustomerB2C } from "@/shared/types";
import { getCustomerDisplay, getCustomerName } from "./customerDisplay";

/**
 * getCustomerDisplay / getCustomerName only read a handful of fields (id, the
 * discriminated name fields, avatarUrl). These builders provide the minimum
 * valid shape per variant so the tests stay focused on display logic.
 */
const baseFields = {
  id: "cust-1",
  storeId: "store-1",
  phone: "+5511999999999",
  sellerId: "seller-1",
  status: "ativo" as const,
  tags: [] as string[],
  notes: [],
  createdAt: "2026-01-01T00:00:00.000Z",
};

function b2c(overrides: Partial<ICustomerB2C> = {}): ICustomerB2C {
  return {
    ...baseFields,
    type: "B2C",
    cpf: "00000000000",
    fullName: "João da Silva",
    ...overrides,
  };
}

function b2b(overrides: Partial<ICustomerB2B> = {}): ICustomerB2B {
  return {
    ...baseFields,
    type: "B2B",
    cnpj: "00000000000000",
    razaoSocial: "Distribuidora Gallo LTDA",
    nomeFantasia: "Gallo Diesel",
    contactName: "Fernando",
    ...overrides,
  };
}

describe("getCustomerName", () => {
  it("uses nomeFantasia for B2B, falling back to razaoSocial when empty", () => {
    expect(getCustomerName(b2b())).toBe("Gallo Diesel");
    expect(getCustomerName(b2b({ nomeFantasia: "" }))).toBe("Distribuidora Gallo LTDA");
  });

  it("uses fullName for B2C", () => {
    expect(getCustomerName(b2c())).toBe("João da Silva");
  });
});

describe("getCustomerDisplay", () => {
  it("derives initials from a real name and flags it as not a phone", () => {
    const display = getCustomerDisplay(b2c({ fullName: "João da Silva" }));
    expect(display.initials).toBe("JS");
    expect(display.isPhoneName).toBe(false);
  });

  it("flags a phone-number name so the surface can render a person icon", () => {
    const display = getCustomerDisplay(b2c({ fullName: "+558299372427" }));
    expect(display.isPhoneName).toBe(true);
  });

  it("passes through the synced avatarUrl when present", () => {
    const display = getCustomerDisplay(b2c({ avatarUrl: "https://cdn.example/a.jpg" }));
    expect(display.avatarUrl).toBe("https://cdn.example/a.jpg");
  });

  it("leaves avatarUrl undefined when the contact has no photo", () => {
    const display = getCustomerDisplay(b2c());
    expect(display.avatarUrl).toBeUndefined();
  });
});
