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
  storeId: "store-matriz",
  sellerId: undefined,
  period,
  fallbackSuggestions: ["Quanto faturei?"],
};

describe("runCopilotQuery", () => {
  it("resolve e devolve o número vindo do dataAccess (RNF-001)", async () => {
    const da = makeDataAccess(487200);
    const { answer } = await runCopilotQuery("Quanto faturei esse mês?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(true);
    expect(answer.value).toBe(487200);
    expect(answer.citation?.source.label).toBe("Vendas");
    expect(da.getSalesMetric).toHaveBeenCalledOnce();
  });

  it("ambíguo → sugestões com os rótulos das métricas candidatas", async () => {
    const da = makeDataAccess(1);
    // "faturamento margem" casa as duas métricas → ambíguo
    const { answer } = await runCopilotQuery("faturamento e margem", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(false);
    expect(answer.ambiguous).toBe(true);
    expect(answer.suggestions).toEqual(expect.arrayContaining(["Faturamento", "Margem"]));
  });

  it("fora do catálogo → não resolvido com fallback", async () => {
    const da = makeDataAccess(1);
    const { answer } = await runCopilotQuery("qual a previsão do tempo?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(false);
    expect(answer.ambiguous).toBeFalsy();
    expect(answer.suggestions).toEqual(["Quanto faturei?"]);
  });

  it("Vendedor: pergunta resolve no próprio escopo (sellerId aplicado pelo scopeClamp)", async () => {
    const da = makeDataAccess(1000);
    const ctx = {
      ...baseCtx,
      role: "Vendedor" as const,
      sellerId: "seller-1",
    };
    const { answer } = await runCopilotQuery("Quanto faturei esse mês?", ctx, {
      dataAccess: da,
      catalog,
    });
    // O resolver não extrai filtro de vendedor do texto, então a pergunta resolve e o
    // scopeClamp aplica o escopo do próprio vendedor (RNF-001: valor vem do mock).
    expect(answer.resolved).toBe(true);
    expect(answer.value).toBe(1000);
    expect(answer.query?.scope?.role).toBe("Vendedor");
    expect(answer.query?.scope?.sellerId).toBe("seller-1");
  });

  it("erro do dataAccess não propaga — devolve errorText", async () => {
    const da = makeDataAccess(1);
    (da.getSalesMetric as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));
    const { answer, errorText } = await runCopilotQuery("Quanto faturei?", baseCtx, {
      dataAccess: da,
      catalog,
    });
    expect(answer.resolved).toBe(false);
    expect(errorText).toBeTruthy();
  });
});
