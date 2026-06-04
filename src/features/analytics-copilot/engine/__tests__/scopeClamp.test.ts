import { describe, it, expect } from "vitest";

import { scopeClamp } from "../scopeClamp";
import type { IMetricQuery } from "@/shared/types/analytics-copilot";

const baseQuery: IMetricQuery = {
  metricId: "faturamento",
  dimensions: [],
  filters: {},
  period: { type: "monthly", start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" },
};

describe("scopeClamp", () => {
  it("locks Vendedor to their own sellerId", () => {
    const r = scopeClamp(baseQuery, { role: "Vendedor", storeId: "store-1", sellerId: "seller-1" });
    expect(r.query.scope?.sellerId).toBe("seller-1");
    expect(r.refusedByScope).toBe(false);
  });

  it("refuses Vendedor querying another seller via filter", () => {
    const q: IMetricQuery = { ...baseQuery, filters: { vendedor: "seller-2" } };
    const r = scopeClamp(q, { role: "Vendedor", storeId: "store-1", sellerId: "seller-1" });
    expect(r.refusedByScope).toBe(true);
  });

  it("refuses Vendedor cross-seller dimension", () => {
    const q: IMetricQuery = { ...baseQuery, dimensions: ["vendedor"] };
    const r = scopeClamp(q, { role: "Vendedor", storeId: "store-1", sellerId: "seller-1" });
    expect(r.refusedByScope).toBe(true);
  });

  it("restricts Gestor to the store", () => {
    const r = scopeClamp(baseQuery, { role: "Gestor", storeId: "store-1" });
    expect(r.query.scope?.storeId).toBe("store-1");
    expect(r.refusedByScope).toBe(false);
  });

  it("leaves Owner cross-store", () => {
    const r = scopeClamp(baseQuery, { role: "Owner" });
    expect(r.refusedByScope).toBe(false);
    expect(r.query.scope?.role).toBe("Owner");
  });
});
