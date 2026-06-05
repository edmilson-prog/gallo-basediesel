import { describe, expect, it } from "vitest";
import { metricCatalog } from "../metricCatalog";
import { COPILOT_CATEGORIES, metricUiMeta, categoryById } from "../metricUi";

describe("metricUi", () => {
  it("toda métrica do catálogo tem ícone e categoria válida", () => {
    for (const metric of metricCatalog) {
      const meta = metricUiMeta[metric.id];
      expect(meta, `faltando uiMeta para ${metric.id}`).toBeDefined();
      expect(meta.icon).toMatch(/^mdi:/);
      expect(categoryById(meta.categoryId), `categoria inválida em ${metric.id}`).toBeDefined();
    }
  });

  it("as categorias referenciam apenas ids de métrica existentes", () => {
    const validIds = new Set(metricCatalog.map((m) => m.id));
    for (const cat of COPILOT_CATEGORIES) {
      for (const id of cat.metricIds) {
        expect(validIds.has(id), `categoria ${cat.id} cita métrica inexistente ${id}`).toBe(true);
      }
    }
  });

  it("cada métrica pertence a exatamente uma categoria", () => {
    const counts = new Map<string, number>();
    for (const cat of COPILOT_CATEGORIES) {
      for (const id of cat.metricIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    for (const metric of metricCatalog) {
      expect(counts.get(metric.id), `${metric.id} deve estar em 1 categoria`).toBe(1);
    }
  });
});
