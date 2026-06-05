import { describe, it, expect, vi } from "vitest";

import { executeQuery, refusalAnswer, unresolvedAnswer } from "../executeQuery";
import { findMetricById } from "../../catalog/metricCatalog";
import type { IAnalyticsDataAccess, IMetricQuery } from "@/shared/types/analytics-copilot";

function makeStubPort(overrides: Partial<IAnalyticsDataAccess> = {}): IAnalyticsDataAccess {
  const notImpl = () => Promise.reject(new Error("not implemented"));
  return {
    getSalesMetric: vi.fn(() => Promise.resolve({ value: 84_320, previousValue: 75_200 })),
    getMargin: notImpl,
    getPositivation: notImpl,
    getABCClass: notImpl,
    getPortfolioStatus: notImpl,
    getForecast: notImpl,
    ...overrides,
  };
}

const scopedQuery: IMetricQuery = {
  metricId: "faturamento",
  dimensions: [],
  filters: { marca: "Volvo", categoria: "filtro" },
  period: { type: "monthly", start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" },
  comparison: "previous_period",
  scope: { role: "Owner", storeId: "store-1" },
};

describe("executeQuery", () => {
  it("returns the value from the port — never invents it", async () => {
    const port = makeStubPort();
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, port);
    expect(answer.resolved).toBe(true);
    expect(answer.value).toBe(84_320);
    expect(port.getSalesMetric).toHaveBeenCalledWith(scopedQuery);
  });

  it("formats currency in pt-BR", async () => {
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, makeStubPort());
    expect(answer.formattedValue).toContain("R$");
  });

  it("computes the comparison delta", async () => {
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, makeStubPort());
    expect(answer.comparison?.previousValue).toBe(75_200);
    expect(answer.comparison?.delta).toBe(84_320 - 75_200);
  });

  it("builds a citation with drill-down filters", async () => {
    const answer = await executeQuery(findMetricById("faturamento")!, scopedQuery, makeStubPort());
    expect(answer.citation?.source.label).toBe("Vendas");
    expect(answer.citation?.drillDownUrl).toContain("marca=Volvo");
  });

  it("throws when the query is not scoped (clamp must run first)", async () => {
    const unscoped: IMetricQuery = { ...scopedQuery, scope: undefined };
    await expect(
      executeQuery(findMetricById("faturamento")!, unscoped, makeStubPort()),
    ).rejects.toThrow();
  });

  it("unresolvedAnswer carries suggestions and no number", () => {
    const a = unresolvedAnswer(["faturamento do mês", "top vendedores"]);
    expect(a.resolved).toBe(false);
    expect(a.value).toBeUndefined();
    expect(a.suggestions).toHaveLength(2);
  });

  it("refusalAnswer never carries a value", () => {
    const a = refusalAnswer(scopedQuery);
    expect(a.refusedByScope).toBe(true);
    expect(a.value).toBeUndefined();
  });
});
