import { describe, expect, it } from "vitest";
import { DEFAULT_COPILOT_ASSISTANT_SETTINGS } from "../config/defaults";
import { estimateAssistantCost } from "./estimateAssistantCost";

const BASE = {
  activeConversationsPerDay: 194,
  costPerCallBRL: 0.025,
  opensPerConversationPerDay: 5,
};

describe("estimateAssistantCost", () => {
  it("custa zero enquanto o motor for regras", () => {
    const r = estimateAssistantCost({ settings: DEFAULT_COPILOT_ASSISTANT_SETTINGS, ...BASE });
    expect(r.callsPerDay).toBe(0);
    expect(r.monthlyBRL).toBe(0);
  });

  it("sob demanda gasta uma fração das conversas ativas", () => {
    const r = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_demand" },
      ...BASE,
    });
    expect(r.callsPerDay).toBeGreaterThan(0);
    expect(r.callsPerDay).toBeLessThan(BASE.activeConversationsPerDay);
  });

  it("ao abrir sem cache aproxima aberturas × conversas", () => {
    const r = estimateAssistantCost({
      settings: {
        ...DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        engine: "ai",
        trigger: "on_open",
        cacheMinutes: 0,
      },
      ...BASE,
    });
    expect(r.callsPerDay).toBe(194 * 5);
  });

  it("o cache reduz as chamadas do disparo ao abrir", () => {
    const semCache = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open", cacheMinutes: 0 },
      ...BASE,
    });
    const comCache = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open", cacheMinutes: 30 },
      ...BASE,
    });
    expect(comCache.callsPerDay).toBeLessThan(semCache.callsPerDay);
  });

  it("pctOfCap é zero quando não há teto próprio", () => {
    const r = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open", monthlyCapBRL: 0 },
      ...BASE,
    });
    expect(r.pctOfCap).toBe(0);
  });

  it("pctOfCap passa de 100 quando a projeção estoura o teto", () => {
    const r = estimateAssistantCost({
      settings: {
        ...DEFAULT_COPILOT_ASSISTANT_SETTINGS,
        engine: "ai",
        trigger: "on_open",
        cacheMinutes: 0,
        monthlyCapBRL: 10,
      },
      ...BASE,
    });
    expect(r.pctOfCap).toBeGreaterThan(100);
  });

  it("não gera NaN com conversas zeradas", () => {
    const r = estimateAssistantCost({
      settings: { ...DEFAULT_COPILOT_ASSISTANT_SETTINGS, engine: "ai", trigger: "on_open" },
      ...BASE,
      activeConversationsPerDay: 0,
    });
    expect(r.callsPerDay).toBe(0);
    expect(r.monthlyBRL).toBe(0);
    expect(Number.isNaN(r.pctOfCap)).toBe(false);
  });
});
