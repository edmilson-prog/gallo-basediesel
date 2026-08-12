import type {
  AiFeatureKey,
  AiProviderId,
  IAiGenerationParams,
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
    { id: "gpt-4o", label: "GPT-4o", inputPricePer1kUsd: 0.0025, outputPricePer1kUsd: 0.01 },
    {
      id: "gpt-4o-mini",
      label: "GPT-4o mini",
      inputPricePer1kUsd: 0.00015,
      outputPricePer1kUsd: 0.0006,
    },
  ],
  openrouter: [
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
    {
      id: "openai/whisper-1",
      label: "OpenAI: Whisper (transcrição)",
      inputPricePer1kUsd: 0,
      outputPricePer1kUsd: 0,
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
  "audio_transcription",
];

/** Default per-provider generation params, seeded into every provider config. */
export const DEFAULT_PROVIDER_PARAMS: IAiGenerationParams = { temperature: 0.4, maxTokens: 1024 };

export function modelsFor(provider: AiProviderId): IAiModelOption[] {
  return MODELS[provider]!;
}

export function priceForModel(
  provider: AiProviderId,
  id: string,
): { inputPricePer1kUsd: number; outputPricePer1kUsd: number } | null {
  const m = MODELS[provider]?.find((x) => x.id === id);
  return m
    ? { inputPricePer1kUsd: m.inputPricePer1kUsd, outputPricePer1kUsd: m.outputPricePer1kUsd }
    : null;
}

const OPENAI_CHAT_PREFIXES = ["gpt", "o1", "o3", "o4", "chatgpt"];
const OPENAI_NON_CHAT =
  /embedding|whisper|tts|audio|realtime|image|dall-e|moderation|transcribe|search|computer-use|codex/;

/** Heuristic: keep OpenAI text-chat models, drop embeddings/audio/image/etc. */
export function isOpenAiChatModel(id: string): boolean {
  const low = id.toLowerCase();
  if (OPENAI_NON_CHAT.test(low)) return false;
  return OPENAI_CHAT_PREFIXES.some((p) => low.startsWith(p));
}

/** Raw model entry as returned by the Edge "list-models" action (front-side mirror). */
export interface RawProviderModel {
  id: string;
  label: string;
  /** OpenRouter only — USD per single token; multiplied by 1000 for per-1k. */
  pricePromptPerToken?: number;
  priceCompletionPerToken?: number;
}

/**
 * Turn the raw provider list into priced IAiModelOption[]:
 * - OpenAI: drop non-chat ids.
 * - OpenRouter (per-token price present & numeric): convert to per-1k.
 * - Otherwise: inherit price from the catalog map; unknown → 0/0 ("preço a definir").
 * Dedupes by id and sorts by label.
 */
export function normalizeProviderModels(
  provider: AiProviderId,
  raw: RawProviderModel[],
): IAiModelOption[] {
  const seen = new Set<string>();
  const out: IAiModelOption[] = [];
  for (const r of raw) {
    if (!r.id || seen.has(r.id)) continue;
    // For OpenAI: exclude known non-chat model types (embeddings, audio, etc.);
    // allow unknown ids through so future chat models aren't silently dropped.
    if (provider === "openai" && OPENAI_NON_CHAT.test(r.id.toLowerCase())) continue;
    seen.add(r.id);

    let inputPricePer1kUsd = 0;
    let outputPricePer1kUsd = 0;
    if (
      typeof r.pricePromptPerToken === "number" &&
      Number.isFinite(r.pricePromptPerToken) &&
      typeof r.priceCompletionPerToken === "number" &&
      Number.isFinite(r.priceCompletionPerToken)
    ) {
      inputPricePer1kUsd = r.pricePromptPerToken * 1000;
      outputPricePer1kUsd = r.priceCompletionPerToken * 1000;
    } else {
      const mapped = priceForModel(provider, r.id);
      if (mapped) {
        inputPricePer1kUsd = mapped.inputPricePer1kUsd;
        outputPricePer1kUsd = mapped.outputPricePer1kUsd;
      }
    }
    out.push({ id: r.id, label: r.label || r.id, inputPricePer1kUsd, outputPricePer1kUsd });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

/** A model with both prices at 0 is "preço a definir" (no known pricing). */
export function isModelPriceUndefined(m: IAiModelOption): boolean {
  return m.inputPricePer1kUsd === 0 && m.outputPricePer1kUsd === 0;
}

/** True when `models` is still exactly the static catalog seed for `provider`. */
export function modelsAreStaticSeed(provider: AiProviderId, models: IAiModelOption[]): boolean {
  const seedIds = modelsFor(provider)
    .map((m) => m.id)
    .sort();
  const curIds = models.map((m) => m.id).sort();
  return seedIds.length === curIds.length && seedIds.every((id, i) => id === curIds[i]);
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
    params: { ...DEFAULT_PROVIDER_PARAMS },
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
        model: "anthropic/claude-opus-4.8",
        params: { temperature: 0.6, maxTokens: 1200 },
        systemPrompt: "Gere insights comerciais acionáveis a partir dos dados do período.",
      },
      {
        feature: "audio_transcription",
        enabled: false,
        providerId: "openrouter",
        model: "openai/whisper-1",
        params: { temperature: 0, maxTokens: 0 },
        systemPrompt: "",
      },
    ],
  };
}
