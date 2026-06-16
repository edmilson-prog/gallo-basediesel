import type {
  AiProviderId,
  AiUsagePeriod,
  IAiPlaygroundInput,
  IAiPlaygroundResult,
  IAiSettings,
  IAiTestConnectionResult,
  IAiUsageEvent,
  IAiUsageSummary,
} from "@/shared/types";
import { costOfTokens } from "@/features/ai-settings/engine/aiPricing";
import { projectMonthlySpend } from "@/features/ai-settings/engine/aiBudget";
import { summarizeUsage } from "@/features/ai-settings/engine/aiUsage";
import type { IAiProvider } from "../../contracts/ai";
import { defaultAiSettings, modelsFor, seedUsageEvents } from "./_aiSeed";

const LATENCY_MS = 140;
const delay = () => new Promise<void>((r) => setTimeout(r, LATENCY_MS));

// Fixed "now" anchor keeps the mock dataset deterministic across reloads.
const NOW_ISO = "2026-06-13T12:00:00.000Z";

const settings: IAiSettings = defaultAiSettings();
let events: IAiUsageEvent[] | null = null;

function pricingFor(providerId: AiProviderId, model: string) {
  const list = modelsFor(providerId);
  const opt = list.find((m) => m.id === model) ?? list[0]!;
  return {
    inputPricePer1kUsd: opt.inputPricePer1kUsd,
    outputPricePer1kUsd: opt.outputPricePer1kUsd,
  };
}

function ensureEvents(): IAiUsageEvent[] {
  if (events) return events;
  const seeded = seedUsageEvents(NOW_ISO);
  for (const e of seeded) {
    e.costBRL = costOfTokens(
      e.inputTokens,
      e.outputTokens,
      pricingFor(e.providerId, e.model),
      settings.budget.usdToBrl,
    );
  }
  events = seeded;
  return events;
}

export const mockAiProvider: IAiProvider = {
  async getSettings() {
    await delay();
    return structuredClone(settings);
  },

  async setMasterEnabled(enabled) {
    await delay();
    settings.masterEnabled = enabled;
  },

  async setDefaultProvider(providerId) {
    await delay();
    settings.defaultProviderId = providerId;
  },

  async updateBudget(patch) {
    await delay();
    settings.budget = { ...settings.budget, ...patch };
    return structuredClone(settings.budget);
  },

  async updateProviderConfig(providerId, patch) {
    await delay();
    const idx = settings.providers.findIndex((p) => p.provider === providerId);
    const current = settings.providers[idx];
    if (!current) throw new Error(`provider ${providerId} não encontrado`);
    const updated = { ...current, ...patch };
    settings.providers[idx] = updated;
    return structuredClone(updated);
  },

  async testConnection(providerId): Promise<IAiTestConnectionResult> {
    await delay();
    const p = settings.providers.find((x) => x.provider === providerId);
    const ok = Boolean(p && p.status === "configured");
    const result: IAiTestConnectionResult = ok
      ? { ok: true, latencyMs: 320, message: "Conexão OK (simulada)." }
      : { ok: false, latencyMs: 0, message: "Configure a chave de API antes de testar." };
    if (p) {
      p.lastTestedAt = new Date().toISOString();
      p.lastTestResult = ok ? "ok" : "error";
    }
    return result;
  },

  async updateFeatureRouting(feature, patch) {
    await delay();
    const idx = settings.routing.findIndex((r) => r.feature === feature);
    const current = settings.routing[idx];
    if (!current) throw new Error(`routing ${feature} não encontrado`);
    const updated = { ...current, ...patch };
    settings.routing[idx] = updated;
    return structuredClone(updated);
  },

  async getUsageSummary(period: AiUsagePeriod): Promise<IAiUsageSummary> {
    await delay();
    const now = new Date(NOW_ISO);
    const summary = summarizeUsage(ensureEvents(), period, settings.budget, now);
    if (period === "current_month") {
      summary.projectionBRL = projectMonthlySpend(summary.costBRL, now);
    }
    return summary;
  },

  async listUsageEvents() {
    await delay();
    return structuredClone(ensureEvents());
  },

  async runPlayground(input: IAiPlaygroundInput): Promise<IAiPlaygroundResult> {
    await delay();
    const inputTokens = Math.max(20, Math.round(input.prompt.length / 4));
    const outputTokens = 120 + (input.prompt.length % 80);
    return {
      text:
        "• Resposta simulada do playground.\n• Provedor: " +
        input.providerId +
        " · modelo: " +
        input.model +
        ".\n• Integração real de LLM será habilitada na fase seguinte.",
      inputTokens,
      outputTokens,
      costBRL: costOfTokens(
        inputTokens,
        outputTokens,
        pricingFor(input.providerId, input.model),
        settings.budget.usdToBrl,
      ),
      latencyMs: 1400,
    };
  },
};
