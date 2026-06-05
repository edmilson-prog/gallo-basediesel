import { describe, it, expect } from "vitest";

import { metricCatalog, findMetricById } from "../metricCatalog";

describe("metricCatalog", () => {
  it("has at least the 8 MVP metrics", () => {
    expect(metricCatalog.length).toBeGreaterThanOrEqual(8);
  });

  it("every metric has a complete source (prd + /app route + label)", () => {
    for (const m of metricCatalog) {
      expect(m.source.prd).toMatch(/^PRD-\d+$/);
      expect(m.source.panelRoute.startsWith("/app/")).toBe(true);
      expect(m.source.label.length).toBeGreaterThan(0);
    }
  });

  it("every metric has at least one keyword", () => {
    for (const m of metricCatalog) {
      expect(m.keywords.length).toBeGreaterThan(0);
    }
  });

  it("metric ids are unique", () => {
    const ids = metricCatalog.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("findMetricById resolves a known metric to its metricKey", () => {
    expect(findMetricById("faturamento")?.metricKey).toBe("revenue");
  });
});
