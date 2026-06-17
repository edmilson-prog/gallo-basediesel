/**
 * Provider model-list adapters for ai-generate's "list-models" action.
 * Runtime: Deno, Web APIs only. Returns a RAW list (un-priced except OpenRouter);
 * the front (aiCatalog.normalizeProviderModels) applies the chat filter, the
 * OpenRouter per-token→per-1k conversion, and the price-map merge — all Vitest-tested.
 */

export interface RawModel {
  id: string;
  label: string;
  pricePromptPerToken?: number;
  priceCompletionPerToken?: number;
}

const ANTHROPIC_VERSION = "2023-06-01";

export async function listAnthropicModels(apiKey: string, signal: AbortSignal): Promise<RawModel[]> {
  const out: RawModel[] = [];
  let afterId: string | undefined;
  // The endpoint is paginated; follow up to 5 pages defensively.
  for (let page = 0; page < 5; page++) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const res = await fetch(url, {
      signal,
      headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      data?: Array<{ id?: string; display_name?: string }>;
      has_more?: boolean;
      last_id?: string;
    };
    for (const m of data.data ?? []) {
      if (m.id) out.push({ id: m.id, label: m.display_name ?? m.id });
    }
    if (!data.has_more || !data.last_id) break;
    afterId = data.last_id;
  }
  return out;
}

export async function listOpenAIModels(apiKey: string, signal: AbortSignal): Promise<RawModel[]> {
  const res = await fetch("https://api.openai.com/v1/models", {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  // No filtering here — the front decides what counts as a chat model (testable).
  return (data.data ?? []).flatMap((m) => (m.id ? [{ id: m.id, label: m.id }] : []));
}

export async function listOpenRouterModels(apiKey: string, signal: AbortSignal): Promise<RawModel[]> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    signal,
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string } }>;
  };
  return (data.data ?? []).flatMap((m) => {
    if (!m.id) return [];
    const prompt = Number(m.pricing?.prompt);
    const completion = Number(m.pricing?.completion);
    const priced = Number.isFinite(prompt) && Number.isFinite(completion);
    const base: RawModel = { id: m.id, label: m.name ?? m.id };
    return [priced ? { ...base, pricePromptPerToken: prompt, priceCompletionPerToken: completion } : base];
  });
}

export async function listModels(
  providerId: string,
  apiKey: string,
  signal: AbortSignal,
): Promise<RawModel[]> {
  if (providerId === "anthropic") return listAnthropicModels(apiKey, signal);
  if (providerId === "openai") return listOpenAIModels(apiKey, signal);
  return listOpenRouterModels(apiKey, signal);
}
