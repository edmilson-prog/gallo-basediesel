import { describe, expect, it } from "vitest";
import type { IAiUsageEvent } from "@/shared/types";
import { summarizeUsage } from "./aiUsage";

function ev(partial: Partial<IAiUsageEvent>): IAiUsageEvent {
  return {
    id: "x",
    ts: "2026-06-10T10:00:00.000Z",
    source: "routed",
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

  it("eventos source='playground' (sem feature) entram nos totais mas não no byFeature", () => {
    const now2 = new Date("2026-06-15T12:00:00.000Z");
    const events: IAiUsageEvent[] = [
      {
        id: "1",
        ts: "2026-06-10T10:00:00.000Z",
        source: "routed",
        feature: "sdr",
        providerId: "anthropic",
        model: "claude-opus-4-8",
        inputTokens: 100,
        outputTokens: 50,
        costBRL: 2,
        latencyMs: 500,
        status: "ok",
      },
      {
        id: "2",
        ts: "2026-06-11T10:00:00.000Z",
        source: "playground",
        providerId: "anthropic",
        model: "claude-opus-4-8",
        inputTokens: 200,
        outputTokens: 80,
        costBRL: 3,
        latencyMs: 600,
        status: "ok",
      },
    ];
    const s = summarizeUsage(
      events,
      "current_month",
      { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 },
      now2,
    );
    expect(s.calls).toBe(2); // total inclui o playground
    expect(s.costBRL).toBe(5);
    expect(s.byFeature).toHaveLength(1); // só o routed/sdr
    expect(s.byFeature[0]?.feature).toBe("sdr");
  });

  it("conta só transcrições de áudio com sucesso (status ok)", () => {
    const events = [
      ev({ feature: "audio_transcription", status: "ok" }),
      ev({ feature: "audio_transcription", status: "error", costBRL: 0 }),
      ev({ feature: "audio_transcription", status: "ok" }),
      ev({ feature: "sdr", status: "ok" }),
    ];
    const s = summarizeUsage(
      events,
      "last_30d",
      { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 },
      now,
    );
    expect(s.audioTranscriptions).toBe(2);
  });

  it("audioTranscriptions é 0 quando não há eventos de transcrição no período", () => {
    const events = [ev({ feature: "sdr", status: "ok" }), ev({ feature: "insights", status: "error" })];
    const s = summarizeUsage(
      events,
      "last_30d",
      { monthlyCapBRL: 100, alertThresholdPct: 80, usdToBrl: 5 },
      now,
    );
    expect(s.audioTranscriptions).toBe(0);
  });
});
