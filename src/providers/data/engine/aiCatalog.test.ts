import { describe, expect, it } from "vitest";
import { AI_FEATURE_LABELS } from "@/shared/types";
import type { AiFeatureKey } from "@/shared/types";
import {
  FEATURES,
  MODELS,
  buildDefaultAiSettings,
  modelsFor,
  priceForModel,
  isOpenAiChatModel,
  normalizeProviderModels,
  isModelPriceUndefined,
  modelsAreStaticSeed,
} from "./aiCatalog";

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

describe("aiCatalog — modelos dinâmicos", () => {
  it("priceForModel acha no mapa e devolve null para desconhecido", () => {
    expect(priceForModel("openai", "gpt-5.2")).not.toBeNull();
    expect(priceForModel("openai", "modelo-inexistente-xyz")).toBeNull();
  });

  it("isOpenAiChatModel inclui modelos de chat e exclui não-chat", () => {
    expect(isOpenAiChatModel("gpt-5.2")).toBe(true);
    expect(isOpenAiChatModel("o1-preview")).toBe(true);
    expect(isOpenAiChatModel("chatgpt-4o-latest")).toBe(true);
    expect(isOpenAiChatModel("text-embedding-3-large")).toBe(false);
    expect(isOpenAiChatModel("whisper-1")).toBe(false);
    expect(isOpenAiChatModel("dall-e-3")).toBe(false);
    expect(isOpenAiChatModel("gpt-4o-audio-preview")).toBe(false);
    expect(isOpenAiChatModel("omni-moderation-latest")).toBe(false);
  });

  it("normalizeProviderModels converte preço por-token do OpenRouter para por-1k", () => {
    const out = normalizeProviderModels("openrouter", [
      { id: "x/y", label: "X Y", pricePromptPerToken: 0.000003, priceCompletionPerToken: 0.000015 },
    ]);
    expect(out[0]!.inputPricePer1kUsd).toBeCloseTo(0.003, 9);
    expect(out[0]!.outputPricePer1kUsd).toBeCloseTo(0.015, 9);
  });

  it("normalizeProviderModels filtra não-chat do OpenAI e herda preço do mapa", () => {
    const out = normalizeProviderModels("openai", [
      { id: "gpt-5.2", label: "gpt-5.2" },
      { id: "text-embedding-3-large", label: "emb" },
      { id: "modelo-novo-sem-preco", label: "novo" },
    ]);
    const ids = out.map((m) => m.id);
    expect(ids).toContain("gpt-5.2");
    expect(ids).not.toContain("text-embedding-3-large");
    expect(out.find((m) => m.id === "gpt-5.2")!.inputPricePer1kUsd).toBeGreaterThan(0);
    const novo = out.find((m) => m.id === "modelo-novo-sem-preco")!;
    expect(isModelPriceUndefined(novo)).toBe(true);
  });

  it("normalizeProviderModels deduplica por id e usa id como label fallback", () => {
    const out = normalizeProviderModels("anthropic", [
      { id: "claude-opus-4-8", label: "" },
      { id: "claude-opus-4-8", label: "dup" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe("claude-opus-4-8");
  });

  it("normalizeProviderModels ignora preço não-numérico (sem NaN)", () => {
    const out = normalizeProviderModels("openrouter", [
      { id: "a/b", label: "A", pricePromptPerToken: Number.NaN, priceCompletionPerToken: 0.00001 },
    ]);
    expect(Number.isNaN(out[0]!.inputPricePer1kUsd)).toBe(false);
    expect(isModelPriceUndefined(out[0]!)).toBe(true);
  });

  it("modelsAreStaticSeed: true para a semente, false após mudar", () => {
    expect(modelsAreStaticSeed("openai", modelsFor("openai"))).toBe(true);
    expect(
      modelsAreStaticSeed("openai", [
        ...modelsFor("openai"),
        { id: "extra", label: "extra", inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
      ]),
    ).toBe(false);
  });
});
