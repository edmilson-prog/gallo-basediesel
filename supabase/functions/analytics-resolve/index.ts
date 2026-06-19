import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * analytics-resolve — 13ª Edge Function. NLU do Copiloto analítico (PRD-057).
 *
 * Gated, consumível por qualquer atendente. Recebe { question, digest } (catálogo
 * público, sem números/PII), resolve provider/model/systemPrompt do routing
 * 'analytics_copilot', chama o LLM (JSON estrito), valida contra o digest e
 * devolve { queries }. O número é calculado no front (executeQuery). Grava uso.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requireAnyCaller } from "../_shared/auth.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import {
  callAnthropic,
  callOpenAI,
  callOpenRouter,
  computeCostBRL,
  type LlmRequest,
  type LlmResult,
  type ModelPricing,
} from "../_shared/ai/adapters.ts";
import { buildResolvePrompt, extractJson, validateQueries, type ResolveDigest } from "./resolve.ts";

const FEATURE = "analytics_copilot";
const LLM_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 500;
const SUPPORTED = new Set(["anthropic", "openai", "openrouter"]);
const KEY_BY_PROVIDER: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

interface RoutingEntry {
  feature: string;
  enabled: boolean;
  providerId: string;
  model: string;
  params?: { temperature?: number; maxTokens?: number };
  systemPrompt?: string;
}
interface SettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; alertThresholdPct: number; usdToBrl: number };
  providers: Array<{
    provider: string;
    models: Array<{ id: string; inputPricePer1kUsd: number; outputPricePer1kUsd: number }>;
  }>;
  routing: RoutingEntry[];
}

function pricingFor(settings: SettingsRow, providerId: string, model: string): ModelPricing | null {
  const p = settings.providers.find((x) => x.provider === providerId);
  const m = p?.models.find((x) => x.id === model);
  if (!m) return null;
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

function dispatch(
  providerId: string,
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  if (providerId === "anthropic") return callAnthropic(apiKey, req, signal);
  if (providerId === "openai") return callOpenAI(apiKey, req, signal);
  return callOpenRouter(apiKey, req, signal);
}

function asDigest(raw: unknown): ResolveDigest | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.catalog) || !Array.isArray(d.brands) || !Array.isArray(d.categories)) {
    return null;
  }
  if (d.catalog.length > 50 || d.brands.length > 200 || d.categories.length > 200) return null;
  return d as unknown as ResolveDigest;
}

servePost(async (req, { log }) => {
  const { callerId, admin, profile } = await requireAnyCaller(req);
  const body = await parseJsonBody(req);
  const question = String(body.question ?? "").trim();
  const digest = asDigest(body.digest);
  if (!question) throw new HttpError(400, "question é obrigatória");
  if (!digest) throw new HttpError(400, "digest inválido");

  // Settings + gate (inline, como na copilot-generate).
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers, routing")
    .eq("id", 1)
    .maybeSingle<SettingsRow>();
  if (sErr) throw new HttpError(500, `settings read failed: ${sErr.message}`);
  if (!settings) throw new HttpError(409, "configuração de IA ainda não inicializada");
  if (!settings.master_enabled) throw new HttpError(409, "IA desligada");
  const route = settings.routing.find((r) => r.feature === FEATURE);
  if (!route || !route.enabled) throw new HttpError(409, "copiloto analítico (IA) desligado");
  const providerId = route.providerId;
  if (!SUPPORTED.has(providerId)) throw new HttpError(400, "provedor não suportado");
  const model = route.model;
  if (!model) throw new HttpError(400, "nenhum modelo configurado");

  // Budget cap (best-effort).
  const spent = await monthSpendBRL(admin);
  if (settings.budget.monthlyCapBRL > 0 && spent >= settings.budget.monthlyCapBRL) {
    throw new HttpError(402, "orçamento de IA do mês esgotado");
  }

  // Key (Vault-first).
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) throw new HttpError(400, "chave de API do provedor não configurada");

  const llmReq: LlmRequest = {
    model,
    prompt: buildResolvePrompt(question, digest),
    systemPrompt: typeof route.systemPrompt === "string" ? route.systemPrompt : undefined,
    maxTokens: MAX_TOKENS,
    temperature: 0,
  };
  const controller = AbortSignal.timeout(LLM_TIMEOUT_MS);
  const started = Date.now();

  let result: LlmResult;
  try {
    result = await dispatch(providerId, apiKey, llmReq, controller);
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof DOMException && err.name === "TimeoutError";
    const { error: insErr } = await admin.from("ai_usage_events").insert({
      source: "routed",
      feature: FEATURE,
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
    if (insErr) log.error("analytics-resolve error-usage insert failed", { error: insErr.message });
    log.error("analytics-resolve llm call failed", { providerId, model, aborted });
    throw new HttpError(
      aborted ? 504 : 502,
      aborted ? "tempo de resposta do LLM esgotado" : "falha na chamada ao LLM",
    );
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

  const { error: insErr } = await admin.from("ai_usage_events").insert({
    source: "routed",
    feature: FEATURE,
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
  if (insErr) log.error("analytics-resolve usage insert failed", { error: insErr.message, costBRL });

  const queries = validateQueries(extractJson(result.text), digest);
  return json({ queries });
});
