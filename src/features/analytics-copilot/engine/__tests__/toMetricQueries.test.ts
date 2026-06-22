import { describe, expect, it } from "vitest";
import type { IGoalPeriod } from "@/shared/types/bi";
import { metricCatalog } from "../../catalog/metricCatalog";
import { toMetricQueries } from "../toMetricQueries";

const period: IGoalPeriod = {
  type: "monthly",
  start: "2026-06-01T00:00:00.000Z",
  end: "2026-06-30T23:59:59.999Z",
};

describe("toMetricQueries", () => {
  it("mapeia métrica válida com período e comparação", () => {
    const out = toMetricQueries(
      [{ metricId: "faturamento", filters: { marca: "Volvo" }, comparison: "previous_period" }],
      period,
      metricCatalog,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.metricId).toBe("faturamento");
    expect(out[0]!.filters.marca).toBe("Volvo");
    expect(out[0]!.period).toBe(period);
    expect(out[0]!.comparison).toBe("previous_period");
    expect(out[0]!.dimensions).toEqual([]);
  });

  it("descarta metricId desconhecido", () => {
    expect(toMetricQueries([{ metricId: "xpto", filters: {} }], period, metricCatalog)).toEqual([]);
  });

  it("descarta filtro não suportado pela métrica", () => {
    // 'margem' não suporta 'marca'
    const out = toMetricQueries([{ metricId: "margem", filters: { marca: "Volvo" } }], period, metricCatalog);
    expect(out).toHaveLength(1);
    expect(out[0]!.filters.marca).toBeUndefined();
  });
});
