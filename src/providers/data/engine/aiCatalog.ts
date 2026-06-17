import type {
  AiFeatureKey,
  AiProviderId,
  IAiModelOption,
  IAiProviderConfig,
  IAiSettings,
} from "@/shared/types";

/**
 * Shared AI model/pricing catalog (lives in the engine layer, NOT in mock,
 * so both the mock provider and the real supabase provider can seed defaults
 * without crossing the PRD-005 data-layer boundary).
 *
 * Price unit: USD per 1k tokens. The persisted `ai_settings.providers[].models`
 * is the runtime source of truth; this module only seeds it.
 */
export const MODELS: Record<AiProviderId, IAiModelOption[]> = {
  anthropic: [
    { id: "claude-opus-4-8", label: "Claude Opus 4.8", inputPricePer1kUsd: 0.015, outputPricePer1kUsd: 0.075 },
    { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", inputPricePer1kUsd: 0.003, outputPricePer1kUsd: 0.015 },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", inputPricePer1kUsd: 0.0008, outputPricePer1kUsd: 0.004 },
  ],
  openai: [
    { id: "gpt-5.2", label: "GPT-5.2", inputPricePer1kUsd: 0.01, outputPricePer1kUsd: 0.03 },
    { id: "gpt-5-mini", label: "GPT-5 mini", inputPricePer1kUsd: 0.0006, outputPricePer1kUsd: 0.0024 },
  ],
  openrouter: [
    { id: "anthropic/claude-opus-4.8", label: "Anthropic: Claude Opus 4.8", inputPricePer1kUsd: 0.015, outputPricePer1kUsd: 0.075 },
    { id: "google/gemini-2.5-pro", label: "Google: Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
  ],
  google: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", inputPricePer1kUsd: 0.0035, outputPricePer1kUsd: 0.0105 },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", inputPricePer1kUsd: 0.0003, outputPricePer1kUsd: 0.0012 },
  ],
};

/**
 * Vault secret name per provider. MUST match the "Provedores LLM" group of
 * buildIntegrationKeyCatalog (src/features/admin-settings/engine/integrationKeys.ts).
 * Google's secret is GOOGLE_AI_API_KEY (not GOOGLE_API_KEY).
 */
export const CREDENTIALS_REF: Record<AiProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  google: "GOOGLE_AI_API_KEY",
};

export const FEATURES: AiFeatureKey[] = [
  "conversation_copilot",
  "analytics_copilot",
  "sdr",
  "part_identification",
  "insights",
];

export function modelsFor(provider: AiProviderId): IAiModelOption[] {
  return MODELS[provider]!;
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
    models: MODELS[provider]!,
    credentialsRef: CREDENTIALS_REF[provider]!,
    status,
    lastTestedAt: status === "configured" ? "2026-06-12T09:40:00.000Z" : undefined,
    lastTestResult: status === "configured" ? "ok" : undefined,
  };
}

/**
 * Default settings. In `supabase` everything starts OFF and not_configured
 * (no auto-spend); in `mock` it keeps the lively demo defaults.
 */
export function buildDefaultAiSettings(env: "mock" | "supabase"): IAiSettings {
  const status: IAiProviderConfig["status"] = env === "mock" ? "configured" : "not_configured";
  const googleStatus: IAiProviderConfig["status"] = "not_configured";
  return {
    masterEnabled: env === "mock",
    defaultProviderId: "anthropic",
    budget: { monthlyCapBRL: 1000, alertThresholdPct: 80, usdToBrl: 5.4 },
    providers: [
      providerConfig("anthropic", "claude-opus-4-8", status),
      providerConfig("openai", "gpt-5.2", status),
      providerConfig("openrouter", "anthropic/claude-opus-4.8", status),
      providerConfig("google", "gemini-2.5-pro", googleStatus),
    ],
    routing: [
      { feature: "conversation_copilot", enabled: true, providerId: "openai", model: "gpt-5.2", fallbackProviderId: "anthropic", fallbackModel: "claude-sonnet-4-6", params: { temperature: 0.4, maxTokens: 1024 }, systemPrompt: "Você é o copiloto de atendimento da GALLO. Sugira respostas claras e comerciais." },
      { feature: "analytics_copilot", enabled: true, providerId: "anthropic", model: "claude-haiku-4-5", fallbackProviderId: "openai", fallbackModel: "gpt-5-mini", params: { temperature: 0.2, maxTokens: 800 }, systemPrompt: "Responda perguntas sobre os indicadores comerciais com números e comparações verificáveis." },
      { feature: "sdr", enabled: true, providerId: "anthropic", model: "claude-opus-4-8", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.5, maxTokens: 1024 }, systemPrompt: "Você é o SDR da GALLO. Qualifique o lead e conduza para o orçamento." },
      { feature: "part_identification", enabled: true, providerId: "google", model: "gemini-2.5-flash", fallbackProviderId: "openai", fallbackModel: "gpt-5.2", params: { temperature: 0.1, maxTokens: 512 }, systemPrompt: "Extraia a peça (código, aplicação, montadora) a partir do texto/imagem do cliente." },
      { feature: "insights", enabled: false, providerId: "openrouter", model: "anthropic/claude-opus-4.8", params: { temperature: 0.6, maxTokens: 1200 }, systemPrompt: "Gere insights comerciais acionáveis a partir dos dados do período." },
    ],
  };
}
