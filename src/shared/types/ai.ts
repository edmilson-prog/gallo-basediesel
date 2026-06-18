import type { ID, ISO8601 } from "./common";

export type AiProviderId = "anthropic" | "openai" | "openrouter" | "google";

export type AiFeatureKey =
  | "conversation_copilot"
  | "analytics_copilot"
  | "sdr"
  | "part_identification"
  | "insights";

export interface IAiModelOption {
  id: string;
  label: string;
  inputPricePer1kUsd: number;
  outputPricePer1kUsd: number;
}

export type AiProviderStatus = "configured" | "not_configured" | "error";

export interface IAiProviderConfig {
  provider: AiProviderId;
  enabled: boolean;
  defaultModel: string;
  models: IAiModelOption[];
  credentialsRef: string;
  status: AiProviderStatus;
  lastTestedAt?: ISO8601;
  lastTestResult?: "ok" | "error";
  /** When the model list was last fetched live from the provider. */
  modelsRefreshedAt?: ISO8601;
  /** Default generation params for this provider. Optional: rows persisted before this field lack it. */
  params?: IAiGenerationParams;
}

export interface IAiGenerationParams {
  temperature: number;
  maxTokens: number;
  topP?: number;
}

export interface IAiFeatureRouting {
  feature: AiFeatureKey;
  enabled: boolean;
  providerId: AiProviderId;
  model: string;
  fallbackProviderId?: AiProviderId;
  fallbackModel?: string;
  params: IAiGenerationParams;
  systemPrompt: string;
  monthlyBudgetCapBRL?: number;
}

export interface IAiBudget {
  monthlyCapBRL: number;
  alertThresholdPct: number;
  usdToBrl: number;
}

export interface IAiSettings {
  masterEnabled: boolean;
  defaultProviderId: AiProviderId;
  budget: IAiBudget;
  providers: IAiProviderConfig[];
  routing: IAiFeatureRouting[];
}

export type AiUsageStatus = "ok" | "error" | "fallback";

export interface IAiUsageEvent {
  id: ID;
  ts: ISO8601;
  source: "playground" | "routed";
  feature?: AiFeatureKey;
  providerId: AiProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
  status: AiUsageStatus;
}

export type AiUsagePeriod = "current_month" | "last_7d" | "last_30d";

export interface IAiUsageSummary {
  period: AiUsagePeriod;
  calls: number;
  tokens: number;
  costBRL: number;
  budgetPct: number;
  projectionBRL: number;
  avgTokensPerCall: number;
  avgLatencyMs: number;
  errorRate: number;
  fallbackRate: number;
  byProvider: Array<{ providerId: AiProviderId; calls: number; tokens: number; costBRL: number }>;
  byFeature: Array<{ feature: AiFeatureKey; calls: number; costBRL: number; growthPct: number }>;
  series: Array<{ date: ISO8601; calls: number; tokens: number; costBRL: number }>;
}

export interface IAiPlaygroundInput {
  providerId: AiProviderId;
  model: string;
  params: IAiGenerationParams;
  prompt: string;
}

export interface IAiPlaygroundResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costBRL: number;
  latencyMs: number;
}

export interface IAiTestConnectionResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export const AI_FEATURE_LABELS: Record<AiFeatureKey, string> = {
  conversation_copilot: "Copiloto de conversa",
  analytics_copilot: "Copiloto analítico",
  sdr: "SDR (qualificação automática)",
  part_identification: "Identificação de peça",
  insights: "Insights",
};

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  google: "Google",
};

/**
 * Providers that have a real Edge adapter — mirror of the SUPPORTED set in
 * supabase/functions/ai-generate/index.ts. Google is shown as "adaptador em
 * breve" (cannot be configured/run) until its adapter lands.
 */
export const AI_SUPPORTED_PROVIDERS: AiProviderId[] = ["anthropic", "openai", "openrouter"];
