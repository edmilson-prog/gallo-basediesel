import { describe, expect, it } from "vitest";
import type { IAiUsageEvent } from "@/shared/types";
import { summarizeUsage } from "./aiUsage";

function ev(partial: Partial<IAiUsageEvent>): IAiUsageEvent {
  return {
    id: "x",
    ts: "2026-06-10T10:00:00.000Z",
    feature: "sdr",
    providerId: "anthropic",
    model: "claude-opus-4-8",
    inputTokens: 1000,
    outputTokens: 500,
    costBRL: 1,
    latencyMs: 1000,
    status: "ok",
    ...partial,
  };
}

describe("summarizeUsage", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");

  it("agrega chamadas, tokens e custo do período", () => {
    const events = [
      ev({ costBRL: 2, inputTokens: 1000, outputTokens: 0 }),
      ev({ costBRL: 3, inputTokens: 500, outputTokens: 500 }),
    ];
    const s = summarizeUsage(
      events,
      "last_30d",
      { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 },
      now,
    );
    expect(s.calls).toBe(2);
    expect(s.tokens).toBe(2000);
    expect(s.costBRL).toBeCloseTo(5, 5);
    expect(s.budgetPct).toBeCloseTo(5, 1);
    expect(s.avgTokensPerCall).toBe(1000);
  });

  it("calcula taxa de erro e de fallback", () => {
    const events = [
      ev({ status: "ok" }),
      ev({ status: "error" }),
      ev({ status: "fallback" }),
      ev({ status: "ok" }),
    ];
    const s = summarizeUsage(
      events,
      "last_30d",
      { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 },
      now,
    );
    expect(s.errorRate).toBeCloseTo(0.25, 5);
    expect(s.fallbackRate).toBeCloseTo(0.25, 5);
  });

  it("ignora eventos fora do período (last_7d)", () => {
    const events = [ev({ ts: "2026-06-12T10:00:00.000Z" }), ev({ ts: "2026-05-01T10:00:00.000Z" })];
    const s = summarizeUsage(
      events,
      "last_7d",
      { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 },
      now,
    );
    expect(s.calls).toBe(1);
  });
});
