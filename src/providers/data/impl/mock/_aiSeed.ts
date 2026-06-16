import seedrandom from "seedrandom";
import type {
  AiFeatureKey,
  AiProviderId,
  IAiModelOption,
  IAiProviderConfig,
  IAiSettings,
  IAiUsageEvent,
} from "@/shared/types";

const MODELS: Record<AiProviderId, IAiModelOption[]> = {
  anthropic: [
    {
      id: "claude-opus-4-8",
      label: "Claude Opus 4.8",
      inputPricePer1kUsd: 0.015,
      outputPricePer1kUsd: 0.075,
    },
    {
      id: "claude-sonnet-4-6",
      label: "Claude Sonnet 4.6",
      inputPricePer1kUsd: 0.003,
      outputPricePer1kUsd: 0.015,
    },
    {
      id: "claude-haiku-4-5",
      label: "Claude Haiku 4.5",
      inputPricePer1kUsd: 0.0008,
      outputPricePer1kUsd: 0.004,
    },
  ],
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2", inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 },
    {
      id: "gpt-5-mini",
      label: "GPT-5 mini",
      inputPricePer1kUsd: 0.0006,
      outputPricePer1kUsd: 0.0024,
    },
  ],
  openrouter: [
    {
      id: "auto",
      label: "Auto (melhor custo)",
      inputPricePer1kUsd: 0.005,
      outputPricePer1kUsd: 0.02,
    },
    {
      id: "anthropic/claude-opus-4.8",
      label: "Anthropic: Claude Opus 4.8",
      inputPricePer1kUsd: 0.015,
      outputPricePer1kUsd: 0.075,
    },
    {
      id: "google/gemini-2.5-pro",
      label: "Google: Gemini 2.5 Pro",
      inputPricePer1kUsd: 0.0035,
      outputPricePer1kUsd: 0.0105,
    },
  ],
  google: [
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      inputPricePer1kUsd: 0.0035,
      outputPricePer1kUsd: 0.0105,
    },
    {
      id: "gemini-2.5-flash",
      label: "Gemini 2.5 Flash",
      inputPricePer1kUsd: 0.0003,
      outputPricePer1kUsd: 0.0012,
    },
  ],
};

/**
 * Vault secret name per provider. MUST match the keys declared in the
 * "Provedores LLM" group of buildIntegrationKeyCatalog. Google's secret is
 * GOOGLE_AI_API_KEY (not GOOGLE_API_KEY), so a plain toUpperCase() is wrong.
 */
const CREDENTIALS_REF: Record<AiProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

export function modelsFor(provider: AiProviderId): IAiModelOption[] {
  return MODELS[provider];
}

function providerConfig(
  provider: AiProviderId,
  defaultModel: string,
  status: IAiProviderConfig["status"],
): IAiProviderConfig {
  return {
    provider,
    enabled: status === "configured",
    defaultModel,
    models: MODELS[provider],
    credentialsRef: CREDENTIALS_REF[provider],
    status,
    lastTestedAt: status === "configured" ? "2026-06-12T09:40:00.000Z" : undefined,
    lastTestResult: status === "configured" ? "ok" : undefined,
  };
}

export function defaultAiSettings(): IAiSettings {
  return {
    masterEnabled: true,
    defaultProviderId: "anthropic",
    budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 },
    providers: [
      providerConfig("anthropic", "claude-opus-4-8", "configured"),
      providerConfig("openai", "gpt-5.2", "configured"),
      providerConfig("openrouter", "auto", "configured"),
      providerConfig("google", "gemini-2.5-pro", "not_configured"),
    ],
    routing: [
      {
        feature: "conversation_copilot",
        enabled: true,
        providerId: "openai",
        model: "gpt-5.2",
        fallbackProviderId: "anthropic",
        fallbackModel: "claude-sonnet-4-6",
        params: { temperature: 0.4, maxTokens: 1024 },
        systemPrompt:
          "Você é o copiloto de atendimento da GALLO. Sugira respostas claras e comerciais.",
      },
      {
        feature: "analytics_copilot",
        enabled: true,
        providerId: "anthropic",
        model: "claude-haiku-4-5",
        fallbackProviderId: "openai",
        fallbackModel: "gpt-5-mini",
        params: { temperature: 0.2, maxTokens: 800 },
        systemPrompt:
          "Responda perguntas sobre os indicadores comerciais com números e comparações verificáveis.",
      },
      {
        feature: "sdr",
        enabled: true,
        providerId: "anthropic",
        model: "claude-opus-4-8",
        fallbackProviderId: "openai",
        fallbackModel: "gpt-5.2",
        params: { temperature: 0.5, maxTokens: 1024 },
        systemPrompt: "Você é o SDR da GALLO. Qualifique o lead e conduza para o orçamento.",
      },
      {
        feature: "part_identification",
        enabled: true,
        providerId: "google",
        model: "gemini-2.5-flash",
        fallbackProviderId: "openai",
        fallbackModel: "gpt-5.2",
        params: { temperature: 0.1, maxTokens: 512 },
        systemPrompt:
          "Extraia a peça (código, aplicação, montadora) a partir do texto/imagem do cliente.",
      },
      {
        feature: "insights",
        enabled: false,
        providerId: "openrouter",
        model: "auto",
        params: { temperature: 0.6, maxTokens: 1200 },
        systemPrompt: "Gere insights comerciais acionáveis a partir dos dados do período.",
      },
    ],
  };
}

const FEATURES: AiFeatureKey[] = [
  "conversation_copilot",
  "analytics_copilot",
  "sdr",
  "part_identification",
  "insights",
];

/**
 * Deterministic 60-day usage history (covers "current month" + comparison).
 * `referenceIso` is the "now" anchor so reloads produce the same dataset.
 */
export function seedUsageEvents(referenceIso: string): IAiUsageEvent[] {
  const rng = seedrandom("gallo-ai-usage-v1");
  const settings = defaultAiSettings();
  const routingByFeature = new Map(settings.routing.map((r) => [r.feature, r]));
  const now = new Date(referenceIso);
  const events: IAiUsageEvent[] = [];
  for (let dayOffset = 59; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - dayOffset);
    const callsToday = 20 + Math.floor(rng() * 60);
    for (let i = 0; i < callsToday; i++) {
      const feature = FEATURES[Math.floor(rng() * FEATURES.length)]!;
      const route = routingByFeature.get(feature)!;
      if (!route.enabled) continue;
      const usedFallback = rng() < 0.05;
      const providerId =
        usedFallback && route.fallbackProviderId ? route.fallbackProviderId : route.providerId;
      const model = usedFallback && route.fallbackModel ? route.fallbackModel : route.model;
      const inputTokens = 200 + Math.floor(rng() * 800);
      const outputTokens = 80 + Math.floor(rng() * 400);
      const isError = rng() < 0.02;
      const ts = new Date(day);
      ts.setUTCHours(8 + Math.floor(rng() * 11), Math.floor(rng() * 60), 0, 0);
      events.push({
        id: `aiu-${dayOffset}-${i}`,
        ts: ts.toISOString(),
        feature,
        providerId,
        model,
        inputTokens,
        outputTokens,
        costBRL: 0, // filled by the pricing engine in the mock provider
        latencyMs: 600 + Math.floor(rng() * 1800),
        status: isError ? "error" : usedFallback ? "fallback" : "ok",
      });
    }
  }
  return events;
}
