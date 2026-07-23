import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * copilot-generate — 12ª Edge Function. Proxy do Copiloto de Vendas (PRD-025).
 *
 * Gated, consumível por QUALQUER atendente autenticado (não Owner-only). O caller
 * envia apenas { conversationId }; provider/model/params/systemPrompt vêm do
 * routing (ai_settings) — nunca do body. Valida acesso à conversa por RLS,
 * aplica teto de orçamento best-effort, chama o LLM com a chave do Vault e grava
 * ai_usage_events (source='routed', feature='conversation_copilot').
 */

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
import { buildReplyPrompt, type PromptMessage } from "./prompt.ts";

const FEATURE = "conversation_copilot";
const LLM_TIMEOUT_MS = 60_000;
const MAX_REPLY_TOKENS = 600; // copilot reply is short
const DEFAULT_MESSAGE_WINDOW = 40;
const MAX_MESSAGE_WINDOW = 200;
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
  params?: { temperature?: number; maxTokens?: number; topP?: number };
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

servePost(async (req, { log }) => {
  const { callerId, admin, callerClient, profile } = await requireAnyCaller(req);
  const body = await parseJsonBody(req);
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) throw new HttpError(400, "conversationId é obrigatório");

  // 1. Access check + load conversation (RLS via caller — can_access_conversation).
  const { data: conv, error: convErr } = await callerClient
    .from("conversations")
    .select("id, customer_id, store_id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; customer_id: string | null; store_id: string }>();
  if (convErr) throw new HttpError(500, `conversation read failed: ${convErr.message}`);
  if (!conv) throw new HttpError(403, "sem acesso a esta conversa");

  // 2. Settings + routing (admin; ai_settings is owner-only RLS).
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers, routing")
    .eq("id", 1)
    .maybeSingle<SettingsRow>();
  if (sErr) throw new HttpError(500, `settings read failed: ${sErr.message}`);
  if (!settings) throw new HttpError(409, "configuração de IA ainda não inicializada");
  if (!settings.master_enabled) throw new HttpError(409, "IA desligada");
  const route = settings.routing.find((r) => r.feature === FEATURE);
  if (!route || !route.enabled) throw new HttpError(409, "copiloto de IA desligado");
  const providerId = route.providerId;
  if (!SUPPORTED.has(providerId)) {
    throw new HttpError(400, "provedor não suportado neste momento (adaptador em breve)");
  }
  const model = route.model;
  if (!model) throw new HttpError(400, "nenhum modelo configurado para o copiloto");

  // Assistant message window lives with the store settings, not with ai_settings.
  const { data: storeRow } = await admin
    .from("stores")
    .select("settings")
    .eq("id", conv.store_id)
    .maybeSingle<{ settings: { copilotAssistant?: { messageWindow?: number } } | null }>();
  const copilotMessageWindow = storeRow?.settings?.copilotAssistant?.messageWindow;

  // 3. Messages (RLS via caller). Read the MOST RECENT window, then flip to
  // ascending for the prompt. Reading ascending with a plain limit — as this
  // did — returns the OLDEST messages, so on a long conversation the model
  // was answering a discussion from months ago.
  const rawWindow = Number(copilotMessageWindow ?? DEFAULT_MESSAGE_WINDOW);
  const windowSize = Math.min(
    MAX_MESSAGE_WINDOW,
    Math.max(5, Number.isFinite(rawWindow) ? rawWindow : DEFAULT_MESSAGE_WINDOW),
  );
  const { data: msgsDesc, error: mErr } = await callerClient
    .from("messages")
    .select("direction, author_type, text, sent_at, id")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    // Stable tiebreak: `sent_at` has second granularity on imported messages and
    // ties are common in bursts — without it the window cut is non-deterministic.
    .order("id", { ascending: false })
    .limit(windowSize);
  if (mErr) throw new HttpError(500, `messages read failed: ${mErr.message}`);
  const msgs = (msgsDesc ?? []).slice().reverse();

  // 4. Customer (optional; RLS via caller).
  let customer: { name?: string; type?: string; status?: string } | undefined;
  if (conv.customer_id) {
    const { data: c } = await callerClient
      .from("customers")
      .select("type, status, full_name, razao_social, nome_fantasia, contact_name")
      .eq("id", conv.customer_id)
      .maybeSingle<{
        type: string;
        status: string;
        full_name: string | null;
        razao_social: string | null;
        nome_fantasia: string | null;
        contact_name: string | null;
      }>();
    if (c) {
      const name =
        c.type === "B2B"
          ? c.nome_fantasia || c.razao_social || c.contact_name || undefined
          : c.full_name || undefined;
      customer = { name: name ?? undefined, type: c.type, status: c.status };
    }
  }

  // 5. Build the user prompt.
  const promptMessages: PromptMessage[] = (msgs ?? []).map((m: {
    direction: string;
    author_type: string;
    text: string | null;
    sent_at: string;
  }) => ({
    direction: m.direction === "out" ? "out" : "in",
    authorType: m.author_type,
    text: m.text ?? "",
    sentAt: m.sent_at,
  }));
  // Wire the store's configured window through to the prompt builder — without
  // this, buildReplyPrompt falls back to its own DEFAULT_MAX_MESSAGES (30),
  // silently capping any windowSize configured above 30.
  const userPrompt = buildReplyPrompt({ messages: promptMessages, customer, maxMessages: windowSize });
  if (!userPrompt) throw new HttpError(422, "conversa sem conteúdo do cliente para gerar resposta");

  // 6. Budget gate — concurrency-safe (advisory lock inside the RPC).
  const { data: hasRoom, error: budgetErr } = await admin.rpc("ai_budget_try_consume", {
    p_feature: FEATURE,
    p_estimated_brl: 0,
  });
  if (budgetErr) throw new HttpError(500, `budget check failed: ${budgetErr.message}`);
  if (hasRoom !== true) throw new HttpError(402, "orçamento de IA do mês esgotado");

  // 7. Resolve key (Vault-first).
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) throw new HttpError(400, "chave de API do provedor não configurada");

  // 8. Call the LLM.
  const params = route.params ?? {};
  let temperature = Math.min(2, Math.max(0, Number(params.temperature ?? 0.4)));
  if (!Number.isFinite(temperature)) temperature = 0.4;
  let maxTokens = Math.min(MAX_REPLY_TOKENS, Math.max(1, Number(params.maxTokens ?? MAX_REPLY_TOKENS)));
  if (!Number.isFinite(maxTokens)) maxTokens = MAX_REPLY_TOKENS;
  const llmReq: LlmRequest = {
    model,
    prompt: userPrompt,
    systemPrompt: typeof route.systemPrompt === "string" ? route.systemPrompt : undefined,
    maxTokens,
    temperature,
    topP: typeof params.topP === "number" ? params.topP : undefined,
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
    if (insErr) log.error("copilot-generate error-usage insert failed", { error: insErr.message });
    log.error("copilot-generate llm call failed", { providerId, model, aborted });
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
  if (!pricing && result.usdCost === undefined) {
    log.error("copilot-generate unknown model pricing", { providerId, model });
  }

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
  if (insErr) log.error("copilot-generate usage insert failed", { error: insErr.message, costBRL });

  return json({ text: result.text });
});
