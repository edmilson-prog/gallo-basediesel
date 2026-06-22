import { describe, expect, it } from "vitest";
import { buildResolvePrompt, extractJson, validateQueries, type ResolveDigest } from "./resolve";

const digest: ResolveDigest = {
  catalog: [
    { id: "faturamento", label: "Faturamento", description: "Receita.", supportedFilters: ["marca", "categoria"] },
    { id: "margem", label: "Margem", description: "Margem.", supportedFilters: ["categoria"] },
  ],
  brands: ["Volvo", "Scania"],
  categories: ["filtro", "freio"],
};

describe("buildResolvePrompt", () => {
  it("inclui ids do catálogo e a pergunta", () => {
    const p = buildResolvePrompt("quanto faturei?", digest);
    expect(p).toContain("faturamento");
    expect(p).toContain("quanto faturei?");
    expect(p).toContain("Volvo");
  });
});

describe("extractJson", () => {
  it("extrai JSON puro", () => {
    expect(extractJson('{"queries":[]}')).toEqual({ queries: [] });
  });
  it("extrai JSON cercado por crase/prosa", () => {
    expect(extractJson('Claro:\n```json\n{"queries":[]}\n```')).toEqual({ queries: [] });
  });
  it("texto sem JSON → null", () => {
    expect(extractJson("sem json aqui")).toBeNull();
  });
  it("prosa com '}' extra após o JSON não confunde o parser (balanced-brace)", () => {
    expect(extractJson('{"queries":[]} (note: nada mais })')).toEqual({ queries: [] });
  });
});

describe("validateQueries", () => {
  it("mantém metricId válido e filtro de marca válido", () => {
    const out = validateQueries(
      { queries: [{ metricId: "faturamento", filters: { marca: "Volvo" }, comparison: "previous_period" }] },
      digest,
    );
    expect(out).toEqual([{ metricId: "faturamento", filters: { marca: "Volvo" }, comparison: "previous_period" }]);
  });
  it("descarta metricId desconhecido", () => {
    expect(validateQueries({ queries: [{ metricId: "inexistente", filters: {} }] }, digest)).toEqual([]);
  });
  it("descarta filtro não suportado pela métrica e marca inválida", () => {
    const out = validateQueries(
      { queries: [{ metricId: "margem", filters: { marca: "Volvo", categoria: "filtro" } }] },
      digest,
    );
    // margem não suporta marca → some; categoria válida fica
    expect(out).toEqual([{ metricId: "margem", filters: { categoria: "filtro" } }]);
  });
  it("dedupe e cap em 4", () => {
    const q = { metricId: "faturamento", filters: {} };
    const out = validateQueries({ queries: [q, q, q, q, q, q] }, digest);
    expect(out).toEqual([{ metricId: "faturamento", filters: {} }]);
  });
  it("entrada inválida → []", () => {
    expect(validateQueries({}, digest)).toEqual([]);
    expect(validateQueries(null, digest)).toEqual([]);
  });
  it("order-independent dedup: same metricId+filters with keys in different order collapse to one entry", () => {
    // Both queries target faturamento (supports marca + categoria) with identical filter values
    // but the object keys are in different order — the stable iteration over LLM_FILTER_KEYS
    // ensures the serialised key is identical and the second entry is dropped.
    const q1 = { metricId: "faturamento", filters: { marca: "Volvo", categoria: "filtro" } };
    const q2 = { metricId: "faturamento", filters: { categoria: "filtro", marca: "Volvo" } };
    const out = validateQueries({ queries: [q1, q2] }, digest);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ metricId: "faturamento", filters: { marca: "Volvo", categoria: "filtro" } });
  });
  it("array-shaped filters are rejected (not treated as an object)", () => {
    const out = validateQueries(
      { queries: [{ metricId: "faturamento", filters: ["Volvo", "filtro"] }] },
      digest,
    );
    // filters is an array → must be ignored, resulting in empty filters
    expect(out).toEqual([{ metricId: "faturamento", filters: {} }]);
  });
});
