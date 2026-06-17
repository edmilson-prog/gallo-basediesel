import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * ai-generate — 11ª Edge Function (Sub-projeto 1: integração LLM real).
 *
 * Owner-only proxy de LLM. Resolve a chave no Vault (Vault-first), aplica o teto
 * de orçamento mensal (best-effort), chama Anthropic/OpenRouter com timeout,
 * calcula custo e grava ai_usage_events. Modos: generate | test.
 *
 * Shared lifecycle/auth/error: supabase/functions/_shared (PRD-102).
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requireCaller } from "../_shared/auth.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import {
  callAnthropic,
  callOpenRouter,
  computeCostBRL,
  type LlmRequest,
  type LlmResult,
  type ModelPricing,
} from "../_shared/ai/adapters.ts";

const LLM_TIMEOUT_MS = 60_000;
const MAX_PROMPT_LENGTH = 50_000;
const MAX_TOKENS_CAP = 4096;
const SUPPORTED = new Set(["anthropic", "openrouter"]);
const KEY_BY_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

interface AiSettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; alertThresholdPct: number; usdToBrl: number };
  providers: Array<{
    provider: string;
    defaultModel: string;
    models: Array<{ id: string; inputPricePer1kUsd: number; outputPricePer1kUsd: number }>;
  }>;
}

function pricingFor(settings: AiSettingsRow, providerId: string, model: string): ModelPricing | null {
  const p = settings.providers.find((x) => x.provider === providerId);
  const m = p?.models.find((x) => x.id === model);
  if (!m) return null; // never fall back to models[0] — would mask wrong cost
  return { inputPricePer1kUsd: m.inputPricePer1kUsd, outputPricePer1kUsd: m.outputPricePer1kUsd };
}

async function monthSpendBRL(admin: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("cost_brl")
    .gte("ts", start.toISOString());
  if (error) throw new HttpError(500, `budget read failed: ${error.message}`);
  return (data ?? []).reduce((a: number, r: { cost_brl: number | string }) => a + Number(r.cost_brl), 0);
}

async function dispatch(
  providerId: string,
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  if (providerId === "anthropic") return callAnthropic(apiKey, req, signal);
  return callOpenRouter(apiKey, req, signal);
}

servePost(async (req, { log }) => {
  const { admin, callerId, profile } = await requireCaller(req, ["owner"]);
  const body = await parseJsonBody(req);

  const mode = body.mode === "test" ? "test" : "generate";
  const providerId = String(body.providerId ?? "");
  if (!SUPPORTED.has(providerId)) {
    throw new HttpError(400, "provider não suportado neste momento (adaptador em breve)");
  }

  // Settings (single row).
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers")
    .eq("id", 1)
    .maybeSingle<AiSettingsRow>();
  if (sErr) throw new HttpError(500, `settings read failed: ${sErr.message}`);
  if (!settings) throw new HttpError(409, "configuração de IA ainda não inicializada");

  // Budget hard cap (best-effort; see spec §9). Blocks both generate and test.
  const spent = await monthSpendBRL(admin);
  if (settings.budget.monthlyCapBRL > 0 && spent >= settings.budget.monthlyCapBRL) {
    throw new HttpError(402, "orçamento de IA do mês esgotado");
  }

  // Resolve key (Vault-first).
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) throw new HttpError(400, "chave de API do provedor não configurada");

  const controller = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const started = Date.now();

  if (mode === "test") {
    const model = String(body.model ?? settings.providers.find((p) => p.provider === providerId)?.defaultModel ?? "");
    try {
      await dispatch(providerId, apiKey, { model, prompt: "ping", maxTokens: 1, temperature: 0 }, controller);
      return json({ ok: true, latencyMs: Date.now() - started, message: "Conexão OK." });
    } catch (err) {
      const message = err instanceof Error ? err.message : "falha de conexão";
      return json({ ok: false, latencyMs: Date.now() - started, message }, 200);
    }
  }

  // mode === "generate"
  const prompt = String(body.prompt ?? "");
  const model = String(body.model ?? "");
  if (!prompt || !model) throw new HttpError(400, "model e prompt são obrigatórios");
  if (prompt.length > MAX_PROMPT_LENGTH) throw new HttpError(400, "prompt muito longo");
  const params = (body.params ?? {}) as { temperature?: number; maxTokens?: number; topP?: number };
  const temperature = Math.min(2, Math.max(0, Number(params.temperature ?? 0.4)));
  const maxTokens = Math.min(MAX_TOKENS_CAP, Math.max(1, Number(params.maxTokens ?? 1024)));

  const llmReq: LlmRequest = {
    model,
    prompt,
    systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
    maxTokens,
    temperature,
    topP: typeof params.topP === "number" ? params.topP : undefined,
  };

  let result: LlmResult;
  try {
    result = await dispatch(providerId, apiKey, llmReq, controller);
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof DOMException && err.name === "TimeoutError";
    // Record the failed call so cost/latency analytics stay honest.
    await admin.from("ai_usage_events").insert({
      source: "playground",
      provider_id: providerId,
      model,
      input_tokens: 0,
      output_tokens: 0,
      cost_brl: 0,
      latency_ms: latencyMs,
      status: "error",
      caller_id: callerId,
      store_id: profile.store_id,
    });
    log.error("ai-generate llm call failed", { providerId, model, aborted });
    throw new HttpError(aborted ? 504 : 502, aborted ? "tempo de resposta do LLM esgotado" : "falha na chamada ao LLM");
  }

  const latencyMs = Date.now() - started;
  const pricing = pricingFor(settings, providerId, model);
  const costBRL = computeCostBRL(
    result.inputTokens,
    result.outputTokens,
    pricing ?? { inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
    settings.budget.usdToBrl,
    result.usdCost,
  );
  if (!pricing && result.usdCost === undefined) {
    log.error("ai-generate unknown model pricing", { providerId, model });
  }

  await admin.from("ai_usage_events").insert({
    source: "playground",
    provider_id: providerId,
    model,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_brl: costBRL,
    latency_ms: latencyMs,
    status: "ok",
    caller_id: callerId,
    store_id: profile.store_id,
  });

  return json({
    text: result.text,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    costBRL,
    latencyMs,
  });
});
