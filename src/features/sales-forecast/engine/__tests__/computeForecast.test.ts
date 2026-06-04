import { describe, it, expect } from "vitest";

import { computeForecast } from "../computeForecast";
import { DEFAULT_FORECAST_CONFIG } from "../defaults";
import type { IForecastInput } from "@/shared/types/forecast";
import type { ILead } from "@/shared/types/lead";

function makeLead(over: Partial<ILead>): ILead {
  return {
    id: over.id ?? "lead-1",
    storeId: "store-1",
    sellerId: "seller-1",
    name: "Lead",
    phone: "x",
    stage: { id: "stage-1", name: "Novo", order: 1, color: "#000000" },
    temperature: over.temperature ?? "quente",
    origin: "whatsapp",
    estimatedValue: over.estimatedValue,
    conversations: [],
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

function baseInput(over: Partial<IForecastInput> = {}): IForecastInput {
  return {
    scope: { level: "store", targetId: "store-1", storeId: "store-1" },
    metric: "revenue",
    period: { type: "monthly", start: "2026-06-01T00:00:00.000Z", end: "2026-06-30T23:59:59.999Z" },
    realizedValue: 100_000,
    avgTicket: 4_000,
    openLeads: [],
    target: { value: 180_000 },
    calendar: { daysElapsed: 15, daysRemaining: 15, totalDays: 30 },
    now: "2026-06-15T12:00:00.000Z",
    ...over,
  };
}

const provavel = (input: IForecastInput, config = DEFAULT_FORECAST_CONFIG) =>
  computeForecast(input, config).scenarios.find((s) => s.type === "provavel")!;

describe("computeForecast", () => {
  it("temperature mode weights pipeline by lead temperature (default)", () => {
    const f = provavel(
      baseInput({
        realizedValue: 0,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 40_000, temperature: "quente" })],
        target: undefined,
      }),
    );
    expect(f.breakdown.weightedPipeline).toBe(30_000); // 40000 * 0.75
  });

  it("stage mode weights pipeline by stage id", () => {
    const config = { ...DEFAULT_FORECAST_CONFIG, pipelineWeightingMode: "stage" as const, stageWeights: { "stage-1": 0.5 } };
    const f = provavel(
      baseInput({
        realizedValue: 0,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 10_000, temperature: "frio" })],
        target: undefined,
      }),
      config,
    );
    expect(f.breakdown.weightedPipeline).toBe(5_000); // 10000 * 0.5
  });

  it("hybrid mode averages temperature and stage weights", () => {
    const config = { ...DEFAULT_FORECAST_CONFIG, pipelineWeightingMode: "hybrid" as const, stageWeights: { "stage-1": 0.5 } };
    const f = provavel(
      baseInput({
        realizedValue: 0,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 10_000, temperature: "quente" })],
        target: undefined,
      }),
      config,
    );
    expect(f.breakdown.weightedPipeline).toBe(6_250); // 10000 * (0.75 + 0.5)/2
  });

  it("residual rule: run-rate contributes 0 when weighted pipeline covers it", () => {
    const f = provavel(
      baseInput({
        realizedValue: 20_000,
        calendar: { daysElapsed: 25, daysRemaining: 5, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 40_000, temperature: "quente" })], // 30000
        target: { value: 60_000 },
      }),
    );
    // runRateRaw = (20000/25)*5 = 4000; contribution = max(0, 4000-30000) = 0
    expect(f.breakdown.realized).toBe(20_000);
    expect(f.breakdown.weightedPipeline).toBe(30_000);
    expect(f.breakdown.runRateRemainder).toBe(0);
    expect(f.projectedValue).toBe(50_000);
  });

  it("residual rule: run-rate fills the gap above weighted pipeline", () => {
    const f = provavel(
      baseInput({
        realizedValue: 100_000,
        calendar: { daysElapsed: 15, daysRemaining: 15, totalDays: 30 },
        openLeads: [makeLead({ estimatedValue: 40_000, temperature: "quente" })], // 30000
        target: { value: 180_000 },
      }),
    );
    // runRateRaw = (100000/15)*15 = 100000; contribution = max(0, 100000-30000) = 70000
    expect(f.breakdown.weightedPipeline).toBe(30_000);
    expect(f.breakdown.runRateRemainder).toBe(70_000);
    expect(f.projectedValue).toBe(200_000);
  });

  it("applies scenario factors to pessimista and otimista", () => {
    const all = computeForecast(
      baseInput({
        realizedValue: 150_000,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
        target: undefined,
      }),
      DEFAULT_FORECAST_CONFIG,
    );
    const get = (t: string) => all.scenarios.find((s) => s.type === t)!.projectedValue;
    expect(get("provavel")).toBe(150_000);
    expect(get("pessimista")).toBeCloseTo(127_500); // * 0.85
    expect(get("otimista")).toBeCloseTo(172_500); // * 1.15
  });

  it("computes gap-to-target and ordersNeeded for a scenario", () => {
    const f = provavel(
      baseInput({
        realizedValue: 150_000,
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
        target: { value: 180_000 },
        avgTicket: 3_000,
      }),
    );
    expect(f.gapToTarget).toBe(30_000);
    expect(f.gapPercent).toBeCloseTo(0.1667, 3);
    expect(f.ordersNeeded).toBe(10); // ceil(30000 / 3000)
  });

  it("omits gap fields when there is no target", () => {
    const all = computeForecast(
      baseInput({ target: undefined, calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 } }),
      DEFAULT_FORECAST_CONFIG,
    );
    const f = all.scenarios.find((s) => s.type === "provavel")!;
    expect(f.gapToTarget).toBeUndefined();
    expect(f.gapPercent).toBeUndefined();
    expect(all.targetValue).toBeUndefined();
  });

  it("flags lowConfidence below the threshold and not at/above it", () => {
    expect(
      computeForecast(baseInput({ calendar: { daysElapsed: 2, daysRemaining: 28, totalDays: 30 } }), DEFAULT_FORECAST_CONFIG)
        .lowConfidence,
    ).toBe(true);
    expect(
      computeForecast(baseInput({ calendar: { daysElapsed: 3, daysRemaining: 27, totalDays: 30 } }), DEFAULT_FORECAST_CONFIG)
        .lowConfidence,
    ).toBe(false);
  });

  it("marks scenario concluida when realized already hit target", () => {
    const f = provavel(
      baseInput({
        realizedValue: 200_000,
        target: { value: 180_000 },
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
      }),
    );
    expect(f.status).toBe("concluida");
  });

  it("marks scenario atrasada when projection is well below target", () => {
    const f = provavel(
      baseInput({
        realizedValue: 50_000,
        target: { value: 180_000 },
        calendar: { daysElapsed: 30, daysRemaining: 0, totalDays: 30 },
        openLeads: [],
      }),
    );
    expect(f.status).toBe("atrasada");
  });

  it("uses the injected now for computedAt (deterministic)", () => {
    const out = computeForecast(baseInput({ now: "2026-06-15T12:00:00.000Z" }), DEFAULT_FORECAST_CONFIG);
    expect(out.computedAt).toBe("2026-06-15T12:00:00.000Z");
  });
});
