import { describe, expect, it } from "vitest";
import { buildDigest } from "../buildDigest";
import { metricCatalog } from "../metricCatalog";

describe("buildDigest", () => {
  it("inclui id/label/description/supportedFilters de cada métrica", () => {
    const d = buildDigest(metricCatalog);
    expect(d.catalog.length).toBe(metricCatalog.length);
    const fat = d.catalog.find((m) => m.id === "faturamento");
    expect(fat?.label).toBe("Faturamento");
    expect(fat?.supportedFilters).toContain("marca");
  });

  it("lista as marcas canônicas e categorias", () => {
    const d = buildDigest(metricCatalog);
    expect(d.brands).toContain("Volvo");
    expect(d.brands).toContain("Mercedes-Benz");
    expect(d.categories).toContain("filtro");
    expect(d.categories).toContain("freio");
  });
});
