/**
 * LLM adapters for the ai-generate Edge Function (Sub-projeto 1).
 * Only Anthropic + OpenRouter in v1. Runtime: Deno, Web APIs only.
 *
 * Pricing/cost mirrors the app engine (src/features/ai-settings/engine/aiPricing.ts);
 * the runtime source of truth for per-model price is the persisted ai_settings row.
 */

export interface LlmRequest {
  model: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  temperature: number;
  topP?: number;
}

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** OpenRouter returns the real cost in USD when usage accounting is enabled. */
  usdCost?: number;
}

export interface ModelPricing {
  inputPricePer1kUsd: number;
  outputPricePer1kUsd: number;
}

const ANTHROPIC_VERSION = "2023-06-01";

/**
 * BRL cost. Prefers a provider-reported USD cost (usdCostOverride, e.g. OpenRouter
 * usage.cost) — including zero for free/promo models — over token×price. Only
 * undefined falls through to token-based pricing. NEVER silently returns 0 for an
 * unknown model: callers must pass a pricing fallback or the override.
 */
export function computeCostBRL(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing,
  usdToBrl: number,
  usdCostOverride?: number,
): number {
  if (typeof usdCostOverride === "number") {
    return usdCostOverride * usdToBrl;
  }
  const usd =
    (inputTokens / 1000) * pricing.inputPricePer1kUsd +
    (outputTokens / 1000) * pricing.outputPricePer1kUsd;
  return usd * usdToBrl;
}

export async function callAnthropic(
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      ...(req.topP !== undefined ? { top_p: req.topP } : {}),
      ...(req.systemPrompt ? { system: req.systemPrompt } : {}),
      messages: [{ role: "user", content: req.prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`anthropic ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("");
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

export async function callOpenRouter(
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  const messages: Array<{ role: string; content: string }> = [];
  if (req.systemPrompt) messages.push({ role: "system", content: req.systemPrompt });
  messages.push({ role: "user", content: req.prompt });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "HTTP-Referer": "https://crm.gallobasediesel.com.br",
      "X-Title": "GALLO BASE DIESEL",
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature,
      ...(req.topP !== undefined ? { top_p: req.topP } : {}),
      messages,
      usage: { include: true }, // ask OpenRouter to report real cost
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`openrouter ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    usdCost: data.usage?.cost,
  };
}
