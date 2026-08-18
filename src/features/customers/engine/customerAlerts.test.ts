import { describe, expect, it } from "vitest";
import type { ICustomerB2B, ICustomerB2C } from "@/shared/types";
import { buildCustomerAlerts } from "./customerAlerts";

const NOW = new Date("2026-08-10T12:00:00Z");

/** A fully-filled B2B customer with purchase history — generates no alerts on its own. */
function b2b(overrides: Partial<ICustomerB2B> = {}): ICustomerB2B {
  return {
    id: "c1",
    storeId: "s1",
    phone: "5555991640300",
    email: "contato@acme.com.br",
    address: {
      street: "BR 386",
      number: "37",
      district: "São Cristóvão",
      city: "Frederico Westphalen",
      state: "RS",
      zipCode: "98400-000",
    },
    sellerId: "v1",
    status: "ativo",
    tags: [],
    notes: [],
    createdAt: "2023-03-04T00:00:00Z",
    lastPurchaseAt: "2026-08-04T00:00:00Z",
    purchaseStats: { ticketMedio: 4820, ltv: 86740, orderCount12m: 18 },
    type: "B2B",
    cnpj: "12.345.678/0001-90",
    razaoSocial: "ACME LTDA",
    nomeFantasia: "ACME",
    contactName: "Fulano",
    ...overrides,
  };
}

function noCounts() {
  return { openQuotes: 0, pendingVehicles: 0, unseenRecommendations: 0 };
}

describe("buildCustomerAlerts", () => {
  it("returns no alerts for a complete customer with nothing pending", () => {
    expect(buildCustomerAlerts({ customer: b2b(), ...noCounts(), now: NOW })).toEqual([]);
  });

  it("flags a vehicle awaiting approval as critical, pointing at the fleet tab", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b(),
      ...noCounts(),
      pendingVehicles: 1,
      now: NOW,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "critical", target: "frota" });
  });

  it("flags overdue repurchase as critical when recency exceeds 1.5x the average interval", () => {
    // 4 orders/year => ~91 days average interval; 200 days out is well past 1.5x.
    const alerts = buildCustomerAlerts({
      customer: b2b({
        lastPurchaseAt: "2026-01-22T00:00:00Z",
        purchaseStats: { ticketMedio: 100, ltv: 400, orderCount12m: 4 },
      }),
      ...noCounts(),
      now: NOW,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "critical", target: "comercial" });
  });

  it("does not flag overdue repurchase while recency is within the expected interval", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b({
        lastPurchaseAt: "2026-08-01T00:00:00Z",
        purchaseStats: { ticketMedio: 100, ltv: 400, orderCount12m: 4 },
      }),
      ...noCounts(),
      now: NOW,
    });
    expect(alerts).toEqual([]);
  });

  it("flags open quotes as warning, not critical", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b(),
      ...noCounts(),
      openQuotes: 2,
      now: NOW,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "warning", target: "comercial" });
  });

  it("flags unseen recommendations as warning, pointing at the notes tab", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b(),
      ...noCounts(),
      unseenRecommendations: 3,
      now: NOW,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "warning", target: "notas" });
  });

  it("flags an incomplete registration as informational, never critical", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b({ cnpj: "", email: undefined, address: undefined }),
      ...noCounts(),
      now: NOW,
    });
    const incomplete = alerts.find((a) => a.target === "cadastro");
    expect(incomplete).toMatchObject({ severity: "info" });
  });

  it("treats a missing CPF as an incomplete registration for B2C customers", () => {
    const customer: ICustomerB2C = {
      id: "c2",
      storeId: "s1",
      phone: "5547992379318",
      email: "a@b.com",
      address: {
        street: "Rua A",
        number: "1",
        district: "Centro",
        city: "Frederico Westphalen",
        state: "RS",
        zipCode: "98400-000",
      },
      sellerId: "v1",
      status: "ativo",
      tags: [],
      notes: [],
      createdAt: "2026-08-01T00:00:00Z",
      type: "B2C",
      cpf: "",
      fullName: "Fulano",
    };
    const alerts = buildCustomerAlerts({ customer, ...noCounts(), now: NOW });
    expect(alerts.some((a) => a.target === "cadastro")).toBe(true);
  });

  it("nudges for a first quote when an old contact has never bought nor been quoted", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b({
        createdAt: "2026-06-12T00:00:00Z",
        lastPurchaseAt: undefined,
        purchaseStats: undefined,
      }),
      ...noCounts(),
      now: NOW,
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: "warning", target: "comercial" });
    expect(alerts[0]?.title).toContain("59");
  });

  it("does not nudge a freshly created contact for a first quote", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b({
        createdAt: "2026-08-08T00:00:00Z",
        lastPurchaseAt: undefined,
        purchaseStats: undefined,
      }),
      ...noCounts(),
      now: NOW,
    });
    expect(alerts).toEqual([]);
  });

  it("orders alerts by severity: critical, then warning, then info", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b({ cnpj: "", email: undefined, address: undefined }),
      openQuotes: 1,
      pendingVehicles: 1,
      unseenRecommendations: 0,
      now: NOW,
    });
    expect(alerts.map((a) => a.severity)).toEqual(["critical", "warning", "info"]);
  });

  it("gives every alert a stable id so React keys never collide", () => {
    const alerts = buildCustomerAlerts({
      customer: b2b({ cnpj: "", email: undefined, address: undefined }),
      openQuotes: 1,
      pendingVehicles: 1,
      unseenRecommendations: 2,
      now: NOW,
    });
    const ids = alerts.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
