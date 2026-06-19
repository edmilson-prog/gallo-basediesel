import { describe, it, expect } from "vitest";
import { buildDefaultSettings } from "./buildDefaultSettings";

describe("buildDefaultSettings", () => {
  it("carimba o storeId recebido", () => {
    const s = buildDefaultSettings("loja-x");
    expect(s.storeId).toBe("loja-x");
  });

  it("zera os valores monetários específicos da loja (padrões limpos)", () => {
    const s = buildDefaultSettings("loja-x");
    expect(s.financialSettings.fixedExpenses).toEqual({ payroll: 0, rentInfra: 0, other: 0 });
    expect(s.cashflowSettings.openingBalance).toBe(0);
  });

  it("mantém defaults de negócio (pipeline e divisão padrão)", () => {
    const s = buildDefaultSettings("loja-x");
    expect(s.pipelineStages.length).toBeGreaterThan(0);
    expect(s.defaultDivision).toBe("parts");
  });

  it("não compartilha referências mutáveis entre duas chamadas", () => {
    const a = buildDefaultSettings("a");
    const b = buildDefaultSettings("b");
    expect(a.pipelineStages).not.toBe(b.pipelineStages);
  });
});
