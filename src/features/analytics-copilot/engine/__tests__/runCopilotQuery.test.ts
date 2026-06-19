import { describe, expect, it, vi } from "vitest";
import type { IGoalPeriod } from "@/shared/types/bi";
import type {
  IAnalyticsDataAccess,
  IMetricDefinition,
} from "@/shared/types/analytics-copilot";
import { runCopilotQuery } from "../runCopilotQuery";

const period: IGoalPeriod = {
  type: "monthly",
  start: "2026-05-01T00:00:00.000Z",
  end: "2026-05-31T23:59:59.999Z",
};

const catalog: IMetricDefinition[] = [
  {
    id: "faturamento",
    label: "Faturamento",
    description: "",
    metricKey: "revenue",
    dimensions: ["marca", "vendedor"],
    supportedFilters: ["marca", "vendedor"],
    keywords: ["faturamento", "faturei"],
    source: { prd: "PRD-041", panelRoute: "/app/gestao/vendas", label: "Vendas" },
    dataAccessKey: "getSalesMetric",
  },
  {
    id: "margem",
    label: "Margem",
    description: "",
    metricKey: "margin",
    dimensions: ["vendedor"],
    supportedFilters: ["vendedor"],
    keywords: ["margem", "lucro"],
    source: { prd: "PRD-049", panelRoute: "/app/gestao/rentabilidade", label: "Rentabilidade" },
    dataAccessKey: "getMargin",
  },
];

function makeDataAccess(value: number): IAnalyticsDataAccess {
  return {
    getSalesMetric: vi.fn(async () => ({ value })),
    getMargin: vi.fn(async () => ({ value })),
    getPositivation: vi.fn(async () => ({ value })),
    getABCClass: vi.fn(async () => ({ value })),
    getPortfolioStatus: vi.fn(async () => ({ value })),
    getForecast: vi.fn(async () => ({ value })),
  };
}

const baseCtx = {
  role: "Owner" as const,
  storeId: "00000000-0000-0000-0000-000000000001",
  sellerId: undefined,
  period,
  fallbackSuggestions: ["Quanto faturei?"],
};

describe("runCopilotQuery", () => {
  it("resolve e devolve o número vindo do dataAccess (RNF-001)", async () => {
    const da = makeDataAccess(487200);
    const { answers } = await runCopilotQuery("Quanto faturei esse mês?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers).toHaveLength(1);
    expect(answers[0]!.resolved).toBe(true);
    expect(answers[0]!.value).toBe(487200);
    expect(answers[0]!.citation?.source.label).toBe("Vendas");
    expect(da.getSalesMetric).toHaveBeenCalledOnce();
  });

  it("ambíguo (regras) → sugestões com os rótulos candidatos", async () => {
    const da = makeDataAccess(1);
    const { answers } = await runCopilotQuery("faturamento e margem", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers).toHaveLength(1);
    expect(answers[0]!.resolved).toBe(false);
    expect(answers[0]!.ambiguous).toBe(true);
    expect(answers[0]!.suggestions).toEqual(expect.arrayContaining(["Faturamento", "Margem"]));
  });

  it("fora do catálogo → não resolvido com fallback", async () => {
    const da = makeDataAccess(1);
    const { answers } = await runCopilotQuery("qual a previsão do tempo?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers[0]!.resolved).toBe(false);
    expect(answers[0]!.ambiguous).toBeFalsy();
    expect(answers[0]!.suggestions).toEqual(["Quanto faturei?"]);
  });

  it("Vendedor: resolve no próprio escopo (scopeClamp)", async () => {
    const da = makeDataAccess(1000);
    const ctx = { ...baseCtx, role: "Vendedor" as const, sellerId: "seller-1" };
    const { answers } = await runCopilotQuery("Quanto faturei esse mês?", ctx, {
      dataAccess: da,
      catalog,
    });
    expect(answers[0]!.resolved).toBe(true);
    expect(answers[0]!.value).toBe(1000);
    expect(answers[0]!.query?.scope?.role).toBe("Vendedor");
    expect(answers[0]!.query?.scope?.sellerId).toBe("seller-1");
  });

  it("erro do dataAccess não propaga — devolve errorText no answer", async () => {
    const da = makeDataAccess(1);
    (da.getSalesMetric as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const { answers } = await runCopilotQuery("Quanto faturei?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answers[0]!.resolved).toBe(false);
    expect(answers[0]!.errorText).toBeTruthy();
  });

  it("resolver injetado multi-métrica → vários answers", async () => {
    const da = makeDataAccess(500);
    const { answers } = await runCopilotQuery("faturamento e margem", baseCtx, {
      dataAccess: da,
      catalog,
      resolver: () => ({
        queries: [
          { metricId: "faturamento", dimensions: [], filters: {}, period },
          { metricId: "margem", dimensions: [], filters: {}, period },
        ],
      }),
    });
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.resolved)).toBe(true);
    expect(da.getSalesMetric).toHaveBeenCalledOnce();
    expect(da.getMargin).toHaveBeenCalledOnce();
  });

  it("erro parcial do dataAccess → answers[0] resolvido, answers[1] não, errorText no answer falho", async () => {
    const da = makeDataAccess(750);
    (da.getMargin as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("margin boom"));
    const { answers } = await runCopilotQuery("faturamento e margem", baseCtx, {
      dataAccess: da,
      catalog,
      resolver: () => ({
        queries: [
          { metricId: "faturamento", dimensions: [], filters: {}, period },
          { metricId: "margem", dimensions: [], filters: {}, period },
        ],
      }),
    });
    expect(answers).toHaveLength(2);
    expect(answers[0]!.resolved).toBe(true);
    expect(answers[0]!.value).toBe(750);
    expect(answers[1]!.resolved).toBe(false);
    expect(answers[1]!.errorText).toBeTruthy();
  });
});
