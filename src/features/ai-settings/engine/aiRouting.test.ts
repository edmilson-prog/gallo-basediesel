import { describe, expect, it } from "vitest";
import type { IAiSettings } from "@/shared/types";
import { resolveEffectiveModel } from "./aiRouting";

function settings(over: Partial<IAiSettings> = {}): IAiSettings {
  return {
    masterEnabled: true,
    defaultProviderId: "anthropic",
    budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5 },
    providers: [
      { provider: "anthropic", enabled: true, defaultModel: "claude-opus-4-8", models: [], credentialsRef: "ANTHROPIC_API_KEY", status: "configured" },
      { provider: "openai", enabled: true, defaultModel: "gpt-5.2", models: [], credentialsRef: "OPENAI_API_KEY", status: "configured" },
      { provider: "google", enabled: false, defaultModel: "gemini-2.5-pro", models: [], credentialsRef: "GOOGLE_AI_API_KEY", status: "not_configured" },
    ],
    routing: [
      { feature: "sdr", enabled: true, providerId: "anthropic", model: "claude-opus-4-8", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.5, maxTokens: 1024 }, systemPrompt: "p" },
      { feature: "part_identification", enabled: true, providerId: "google", model: "gemini-2.5-pro", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.1, maxTokens: 512 }, systemPrompt: "p" },
      { feature: "insights", enabled: false, providerId: "openai", model: "gpt-5.2", params: { temperature: 0.6, maxTokens: 800 }, systemPrompt: "p" },
    ],
    ...over,
  };
}

describe("resolveEffectiveModel", () => {
  it("resolve o provedor primário quando disponível", () => {
    const r = resolveEffectiveModel(settings(), "sdr");
    expect(r).toEqual({ providerId: "anthropic", model: "claude-opus-4-8", params: { temperature: 0.5, maxTokens: 1024 }, systemPrompt: "p", usedFallback: false });
  });

  it("cai para o fallback quando o primário está indisponível", () => {
    // part_identification → google (not_configured) → fallback openai
    const r = resolveEffectiveModel(settings(), "part_identification");
    expect(r?.providerId).toBe("openai");
    expect(r?.usedFallback).toBe(true);
  });

  it("retorna null quando o master switch está desligado", () => {
    expect(resolveEffectiveModel(settings({ masterEnabled: false }), "sdr")).toBeNull();
  });

  it("retorna null quando a funcionalidade está desabilitada", () => {
    expect(resolveEffectiveModel(settings(), "insights")).toBeNull();
  });
});
