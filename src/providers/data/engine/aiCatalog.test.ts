import { describe, expect, it } from "vitest";
import { AI_FEATURE_LABELS } from "@/shared/types";
import type { AiFeatureKey } from "@/shared/types";
import { FEATURES, MODELS, buildDefaultAiSettings, modelsFor } from "./aiCatalog";

describe("aiCatalog", () => {
  it("FEATURES cobre todas as AiFeatureKey", () => {
    const fromLabels = Object.keys(AI_FEATURE_LABELS) as AiFeatureKey[];
    expect([...FEATURES].sort()).toEqual([...fromLabels].sort());
  });

  it("preços estão na unidade por-1k (faixa plausível, guarda contra erro de 1000x)", () => {
    for (const list of Object.values(MODELS)) {
      for (const m of list) {
        expect(m.inputPricePer1kUsd).toBeGreaterThan(0);
        expect(m.inputPricePer1kUsd).toBeLessThan(1); // $/1k tokens; >$1/1k seria erro de unidade
        expect(m.outputPricePer1kUsd).toBeLessThan(1);
      }
    }
  });

  it("modelsFor devolve a lista do provedor", () => {
    expect(modelsFor("anthropic").some((m) => m.id === "claude-opus-4-8")).toBe(true);
  });

  it("buildDefaultAiSettings('supabase') nasce desligado e sem provedor configurado", () => {
    const s = buildDefaultAiSettings("supabase");
    expect(s.masterEnabled).toBe(false);
    expect(s.providers.every((p) => p.status === "not_configured")).toBe(true);
    expect(s.budget.monthlyCapBRL).toBe(1000);
  });

  it("buildDefaultAiSettings('mock') mantém o comportamento de demo (ligado)", () => {
    const s = buildDefaultAiSettings("mock");
    expect(s.masterEnabled).toBe(true);
    expect(s.providers.some((p) => p.status === "configured")).toBe(true);
  });
});
