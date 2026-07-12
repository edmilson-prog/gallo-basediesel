import { describe, expect, it } from "vitest";
import type { ICustomerB2C } from "@/shared/types";
import {
  resolveAbc,
  resolveFirstPurchaseAt,
  resolveLastPurchaseAt,
  resolvePurchaseStats,
} from "./dintecStats";

function baseCustomer(overrides: Partial<ICustomerB2C> = {}): ICustomerB2C {
  return {
    id: "c1",
    storeId: "s1",
    phone: "",
    sellerId: null,
    status: "ativo",
    tags: [],
    notes: [],
    createdAt: "2026-01-01T00:00:00Z",
    type: "B2C",
    cpf: "",
    fullName: "Teste",
    ...overrides,
  };
}

describe("resolvePurchaseStats", () => {
  it("uses the platform purchaseStats when present, ignoring dintec fields", () => {
    const customer = baseCustomer({
      purchaseStats: { ticketMedio: 100, ltv: 1000, orderCount12m: 5 },
      dintecTicketMedio: 999,
      dintecLtv: 999,
      dintecFrequencia: 999,
    });
    const result = resolvePurchaseStats(customer);
    expect(result.ticketMedio).toEqual({ value: 100, fromDintec: false });
    expect(result.ltv).toEqual({ value: 1000, fromDintec: false });
    expect(result.frequencia).toEqual({ value: 5, fromDintec: false });
  });

  it("falls back to dintec fields when purchaseStats is absent", () => {
    const customer = baseCustomer({
      dintecTicketMedio: 200,
      dintecLtv: 2000,
      dintecFrequencia: 12,
    });
    const result = resolvePurchaseStats(customer);
    expect(result.ticketMedio).toEqual({ value: 200, fromDintec: true });
    expect(result.ltv).toEqual({ value: 2000, fromDintec: true });
    expect(result.frequencia).toEqual({ value: 12, fromDintec: true });
  });

  it("omits fields with neither platform nor dintec data", () => {
    const result = resolvePurchaseStats(baseCustomer());
    expect(result.ticketMedio).toBeUndefined();
    expect(result.ltv).toBeUndefined();
    expect(result.frequencia).toBeUndefined();
  });

  it("only fills the dintec fields that actually have a value", () => {
    const customer = baseCustomer({ dintecTicketMedio: 200 });
    const result = resolvePurchaseStats(customer);
    expect(result.ticketMedio).toEqual({ value: 200, fromDintec: true });
    expect(result.ltv).toBeUndefined();
    expect(result.frequencia).toBeUndefined();
  });
});

describe("resolveLastPurchaseAt / resolveFirstPurchaseAt", () => {
  it("prefers the platform date over the dintec one", () => {
    const customer = baseCustomer({
      lastPurchaseAt: "2026-07-01",
      dintecLastPurchaseAt: "2020-01-01",
    });
    expect(resolveLastPurchaseAt(customer)).toEqual({ value: "2026-07-01", fromDintec: false });
  });

  it("falls back to the dintec date when the platform one is absent", () => {
    const customer = baseCustomer({ dintecLastPurchaseAt: "2020-01-01" });
    expect(resolveLastPurchaseAt(customer)).toEqual({ value: "2020-01-01", fromDintec: true });
  });

  it("returns undefined when neither exists", () => {
    expect(resolveLastPurchaseAt(baseCustomer())).toBeUndefined();
    expect(resolveFirstPurchaseAt(baseCustomer())).toBeUndefined();
  });

  it("resolves firstPurchaseAt independently from lastPurchaseAt", () => {
    const customer = baseCustomer({ dintecFirstPurchaseAt: "2019-05-01" });
    expect(resolveFirstPurchaseAt(customer)).toEqual({ value: "2019-05-01", fromDintec: true });
  });
});

describe("resolveAbc", () => {
  it("uses the platform abcClass/abcShare pair when present", () => {
    const customer = baseCustomer({ abcClass: "A", abcShare: 0.5, dintecAbcClass: "C", dintecPctReceita: 0.01 });
    expect(resolveAbc(customer)).toEqual({ abcClass: "A", abcShare: 0.5, fromDintec: false });
  });

  it("falls back to the dintec class/share pair when the platform has neither, converting percentage points to a fraction", () => {
    const customer = baseCustomer({ dintecAbcClass: "B", dintecPctReceita: 20 });
    expect(resolveAbc(customer)).toEqual({ abcClass: "B", abcShare: 0.2, fromDintec: true });
  });

  it("returns undefined when neither source has a class", () => {
    expect(resolveAbc(baseCustomer())).toBeUndefined();
  });
});
