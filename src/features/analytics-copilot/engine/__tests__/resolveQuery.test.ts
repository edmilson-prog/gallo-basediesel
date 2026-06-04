import { describe, it, expect } from "vitest";

import { resolveQuery } from "../resolveQuery";
import { metricCatalog } from "../../catalog/metricCatalog";
import type { IGoalPeriod } from "@/shared/types/bi";

const period: IGoalPeriod = {
  type: "monthly",
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-06-30T23:59:59.999Z",
};
const ctx = { period };

describe("resolveQuery", () => {
  it("resolves 'quanto faturei de filtro Volvo esse mês?'", () => {
    const r = resolveQuery("quanto faturei de filtro Volvo esse mês?", ctx, metricCatalog);
    expect(r.query?.metricId).toBe("faturamento");
    expect(r.query?.filters.marca).toBe("Volvo");
    expect(r.query?.filters.categoria).toBe("filtro");
  });

  it("returns null for a question outside the catalog", () => {
    const r = resolveQuery("qual a previsão do tempo amanhã?", ctx, metricCatalog);
    expect(r.query).toBeNull();
    expect(r.ambiguous).toBe(false);
  });

  it("flags ambiguity when more than one metric matches", () => {
    const r = resolveQuery("me mostra vendas e margem", ctx, metricCatalog);
    expect(r.query).toBeNull();
    expect(r.ambiguous).toBe(true);
    expect(r.candidates).toContain("faturamento");
    expect(r.candidates).toContain("margem");
  });

  it("detects a previous-period comparison", () => {
    const r = resolveQuery("faturamento desse mês vs o mês passado", ctx, metricCatalog);
    expect(r.query?.metricId).toBe("faturamento");
    expect(r.query?.comparison).toBe("previous_period");
  });
});
