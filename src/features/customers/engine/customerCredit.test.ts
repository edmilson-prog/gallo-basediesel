import { describe, expect, it } from "vitest";
import type { ICustomerB2B, IOrder } from "@/shared/types";
import { resolveCustomerCredit } from "./customerCredit";

function customer(overrides: Partial<ICustomerB2B> = {}): ICustomerB2B {
  return {
    id: "c1",
    storeId: "s1",
    phone: "",
    sellerId: null,
    status: "ativo",
    tags: [],
    notes: [],
    createdAt: "2026-01-01T00:00:00Z",
    type: "B2B",
    cnpj: "",
    razaoSocial: "ACME LTDA",
    nomeFantasia: "ACME",
    contactName: "Fulano",
    ...overrides,
  };
}

function order(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: "o1",
    storeId: "s1",
    customerId: "c1",
    sellerId: "v1",
    items: [],
    subtotal: 0,
    discount: 0,
    shipping: 0,
    total: 1000,
    paymentCondition: "à vista",
    paymentStatus: "pendente",
    fulfillmentStatus: "pendente",
    origin: "manual",
    division: "parts",
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveCustomerCredit", () => {
  it("returns null when the customer has no credit limit at all", () => {
    expect(resolveCustomerCredit(customer(), [])).toBeNull();
  });

  it("uses the platform credit limit when present, ignoring the ERP snapshot", () => {
    const result = resolveCustomerCredit(
      customer({ creditLimit: 60_000, dintecCreditLimit: 10_000 }),
      [],
    );
    expect(result).toMatchObject({ limit: 60_000, source: "platform" });
  });

  it("falls back to the DINTEC limit when the platform has none", () => {
    const result = resolveCustomerCredit(customer({ dintecCreditLimit: 10_000 }), []);
    expect(result).toMatchObject({ limit: 10_000, source: "erp" });
  });

  it("counts pendente, parcial and vencido orders as used credit", () => {
    const result = resolveCustomerCredit(customer({ creditLimit: 10_000 }), [
      order({ id: "a", total: 1_000, paymentStatus: "pendente" }),
      order({ id: "b", total: 2_000, paymentStatus: "parcial" }),
      order({ id: "c", total: 3_000, paymentStatus: "vencido" }),
    ]);
    expect(result?.used).toBe(6_000);
    expect(result?.free).toBe(4_000);
  });

  it("ignores paid and refunded orders", () => {
    const result = resolveCustomerCredit(customer({ creditLimit: 10_000 }), [
      order({ id: "a", total: 5_000, paymentStatus: "pago" }),
      order({ id: "b", total: 4_000, paymentStatus: "estornado" }),
    ]);
    expect(result?.used).toBe(0);
  });

  it("ignores cancelled orders even when payment is still open", () => {
    const result = resolveCustomerCredit(customer({ creditLimit: 10_000 }), [
      order({
        id: "a",
        total: 7_000,
        paymentStatus: "pendente",
        canceledAt: "2026-08-02T00:00:00Z",
      }),
    ]);
    expect(result?.used).toBe(0);
    expect(result?.free).toBe(10_000);
  });

  it("never reports negative free credit when usage exceeds the limit", () => {
    const result = resolveCustomerCredit(customer({ creditLimit: 1_000 }), [
      order({ total: 3_000, paymentStatus: "vencido" }),
    ]);
    expect(result?.free).toBe(0);
    expect(result?.usedPct).toBe(100);
  });

  it("reports the used percentage rounded to a whole number", () => {
    const result = resolveCustomerCredit(customer({ creditLimit: 3_000 }), [
      order({ total: 1_000, paymentStatus: "pendente" }),
    ]);
    expect(result?.usedPct).toBe(33);
  });

  it("reports zero usage percentage for a zero limit instead of dividing by zero", () => {
    const result = resolveCustomerCredit(customer({ creditLimit: 0 }), [
      order({ total: 500, paymentStatus: "pendente" }),
    ]);
    expect(result?.usedPct).toBe(0);
    expect(result?.free).toBe(0);
  });
});
