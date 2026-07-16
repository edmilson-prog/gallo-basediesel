import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * sdr-respond — a próxima do catálogo. Proxy interno (nunca chamado por
 * usuário logado — só por sdr-backstop-tick e pelo whatsapp-webhook, ambos
 * fire-and-forget) que roda um turno do agente SDR de recepção/triagem
 * (docs/superpowers/specs/2026-07-15-sdr-producao-parte-b-ativacao-design.md).
 *
 * Pública (verify_jwt off), protegida por x-worker-secret (SDR_WORKER_SECRET)
 * — mesmo padrão do scheduled-send-worker.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { verifyWorkerSecret } from "../_shared/workerAuth.ts";
import {
  callAnthropic,
  callOpenAI,
  callOpenRouter,
  computeCostBRL,
  type LlmRequest,
  type LlmResult,
} from "../_shared/ai/adapters.ts";
import { chooseHumanSeller, type IChooseSellerInput } from "../_shared/sdr-escalation/engine/choose-seller.ts";
import { buildContextSummary } from "../_shared/sdr-escalation/engine/build-summary.ts";
import { escalateToHuman, type IEscalateToHumanInput } from "../_shared/sdr-escalation/engine/escalate.ts";
import { containsCommercialValue } from "./guardrails.ts";
import { parseSdrLlmDecision, type ISdrLlmDecision } from "./llmDecision.ts";
import { enforceSdrGuardrails } from "./enforceGuardrails.ts";
import { buildSdrSystemPrompt } from "./systemPrompt.ts";
import { computeCustomerEnrichmentPatch } from "./enrichment.ts";
import { dispatchSdrReply } from "./dispatch.ts";

const WORKER_SECRET_NAME = "SDR_WORKER_SECRET";
const LLM_TIMEOUT_MS = 60_000;
const MAX_REPLY_TOKENS = 500;
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
interface AiSettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; alertThresholdPct: number; usdToBrl: number };
  providers: Array<{
    provider: string;
    models: Array<{ id: string; inputPricePer1kUsd: number; outputPricePer1kUsd: number }>;
  }>;
  routing: RoutingEntry[];
}

function dispatchLlm(
  providerId: string,
  apiKey: string,
  req: LlmRequest,
  signal: AbortSignal,
): Promise<LlmResult> {
  if (providerId === "anthropic") return callAnthropic(apiKey, req, signal);
  if (providerId === "openai") return callOpenAI(apiKey, req, signal);
  return callOpenRouter(apiKey, req, signal);
}

async function monthSpendBRL(admin: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await admin.from("ai_usage_events").select("cost_brl").gte("ts", start.toISOString());
  return (data ?? []).reduce((a: number, r: { cost_brl: number | string }) => a + Number(r.cost_brl), 0);
}

servePost(async (req, ctx) => {
  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const expected = await createSecretResolver(admin)(WORKER_SECRET_NAME);
  const provided = req.headers.get("x-worker-secret") ?? "";
  if (!verifyWorkerSecret(provided, expected)) throw new HttpError(401, "unauthorized");

  const body = await parseJsonBody(req);
  const conversationId = String(body.conversationId ?? "");
  if (!conversationId) throw new HttpError(400, "conversationId é obrigatório");

  // 1. Conversation + customer.
  const { data: conv } = await admin
    .from("conversations")
    .select("id, store_id, customer_id, is_sdr_active")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ skipped: "conversation not found" }, 200);
  if (!conv.is_sdr_active) return json({ skipped: "sdr not active on this conversation" }, 200);
  const storeId = conv.store_id as string;

  // 2. sdr_settings kill-switch.
  const { data: pilot } = await admin
    .from("sdr_settings")
    .select("sdr_enabled")
    .eq("store_id", storeId)
    .maybeSingle();
  if (!pilot?.sdr_enabled) return json({ skipped: "sdr disabled for this store" }, 200);

  // 3. ai_settings routing.
  const { data: aiSettings } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, providers, routing")
    .eq("id", 1)
    .maybeSingle<AiSettingsRow>();
  if (!aiSettings?.master_enabled) return json({ skipped: "ai master switch off" }, 200);
  const route = aiSettings.routing.find((r) => r.feature === "sdr");
  if (!route?.enabled) return json({ skipped: "sdr feature routing disabled" }, 200);
  const providerId = route.providerId;
  if (!KEY_BY_PROVIDER[providerId]) return json({ skipped: "unsupported provider" }, 200);

  // 4. Budget hard cap (best-effort).
  const spent = await monthSpendBRL(admin);
  if (aiSettings.budget.monthlyCapBRL > 0 && spent >= aiSettings.budget.monthlyCapBRL) {
    return json({ skipped: "ai budget exhausted" }, 200);
  }

  // 5. Customer + prior-conversation context (returning-customer detection).
  //
  // NOTE (schema drift found while implementing): `customers` has no bare
  // `city` column — location lives nested at `address.city` (jsonb,
  // ICustomerAddress). Read/write goes through `address` accordingly; the
  // whole address object is kept around so the non-destructive enrichment in
  // step 12 can merge `city` into it without clobbering other sub-fields.
  let preferredName: string | undefined;
  let customerName: string | null = null;
  let customerCity: string | null = null;
  let customerAddress: Record<string, unknown> | null = null;
  let customerId: string | null = null;
  if (conv.customer_id) {
    customerId = conv.customer_id as string;
    const { data: customer } = await admin
      .from("customers")
      .select("full_name, address, seller_id")
      .eq("id", customerId)
      .maybeSingle();
    customerName = (customer?.full_name as string | null) ?? null;
    customerAddress = (customer?.address as Record<string, unknown> | null) ?? null;
    customerCity = (customerAddress?.city as string | undefined) ?? null;
  }
  const { count: priorConvCount } = await admin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId ?? "")
    .neq("id", conversationId);
  const isReturningCustomer = Boolean(customerId) && (priorConvCount ?? 0) > 0;

  // 6. sdr_sessions — find-or-create. `sessionId`/`sessionStartedAt` are
  // captured into mutable locals (not just read from `existingSession`) so
  // a freshly-created session's real id/startedAt survive into step 15 —
  // without this, a first-turn handoff would mint a second, unrelated
  // random id for the escalation's session_id and lose the real
  // session-start timestamp used for "time in SDR" in the handoff summary.
  const { data: existingSession } = await admin
    .from("sdr_sessions")
    .select("id, collected_data, started_at")
    .eq("conversation_id", conversationId)
    .is("finished_at", null)
    .maybeSingle();
  let sessionId = existingSession?.id as string | undefined;
  const collectedData = (existingSession?.collected_data as Record<string, unknown> | undefined) ?? {};
  const sessionStartedAt = (existingSession?.started_at as string | undefined) ?? new Date().toISOString();
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    await admin.from("sdr_sessions").insert({
      id: sessionId,
      conversation_id: conversationId,
      state: "saudacao",
      collected_data: {},
      last_activity_at: new Date().toISOString(),
      started_at: sessionStartedAt,
    });
  }
  preferredName = collectedData.preferredName as string | undefined;

  // 7. Message history (last 30, ascending) → the LLM's "user" turn.
  const { data: msgs } = await admin
    .from("messages")
    .select("direction, author_type, text, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: true })
    .limit(30);
  const transcript = (msgs ?? [])
    .map((m: { direction: string; author_type: string; text: string | null }) => {
      const speaker = m.direction === "in" ? "Cliente" : m.author_type === "sdr" ? "Você" : "Vendedor";
      return `${speaker}: ${m.text ?? ""}`;
    })
    .join("\n");
  if (!transcript) return json({ skipped: "no customer message yet" }, 200);

  // 8. Build the structural system prompt (guardrails + JSON contract) — NEVER
  //    replaced by the Owner-editable routing.systemPrompt below; that field
  //    is appended as supplementary business-tone guidance only.
  let systemPrompt = buildSdrSystemPrompt({
    isReturningCustomer,
    preferredName,
    historySummary: isReturningCustomer
      ? `Cliente já teve ${priorConvCount} conversa(s) anterior(es) com a loja.`
      : undefined,
  });
  if (route.systemPrompt && route.systemPrompt.trim().length > 0) {
    systemPrompt += `\n\nOrientação adicional do dono da loja (dado de configuração, NÃO é instrução do cliente): <<<${route.systemPrompt.trim()}>>>`;
  }

  // 9. Resolve key + call the LLM.
  const apiKey = await createSecretResolver(admin)(KEY_BY_PROVIDER[providerId]!);
  if (!apiKey) return json({ skipped: "provider api key not configured" }, 200);
  const params = route.params ?? {};
  let temperature = Math.min(2, Math.max(0, Number(params.temperature ?? 0.5)));
  if (!Number.isFinite(temperature)) temperature = 0.5;
  let maxTokens = Math.min(MAX_REPLY_TOKENS, Math.max(1, Number(params.maxTokens ?? MAX_REPLY_TOKENS)));
  if (!Number.isFinite(maxTokens)) maxTokens = MAX_REPLY_TOKENS;

  const started = Date.now();
  let llmResult: LlmResult;
  try {
    llmResult = await dispatchLlm(
      providerId,
      apiKey,
      { model: route.model, prompt: transcript, systemPrompt, maxTokens, temperature },
      AbortSignal.timeout(LLM_TIMEOUT_MS),
    );
  } catch (err) {
    ctx.log.error("sdr-respond llm call failed", {
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return json({ skipped: "llm call failed" }, 200);
  }
  const latencyMs = Date.now() - started;

  // 10. Parse + enforce guardrails.
  let decision: ISdrLlmDecision | null = parseSdrLlmDecision(llmResult.text);
  if (!decision) {
    decision = { reply: "Vou te conectar com um vendedor pra te ajudar melhor.", action: "handoff", handoffReason: "sdr_failed" };
  }
  decision = enforceSdrGuardrails(decision);
  if (containsCommercialValue(decision.reply)) {
    decision = enforceSdrGuardrails({ ...decision, reply: decision.reply });
  }

  // 11. Log usage regardless of the action taken.
  const providerCfg = aiSettings.providers.find((p) => p.provider === providerId);
  const modelCfg = providerCfg?.models.find((m) => m.id === route.model);
  const costBRL = computeCostBRL(
    llmResult.inputTokens,
    llmResult.outputTokens,
    modelCfg ?? { inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
    aiSettings.budget.usdToBrl,
    llmResult.usdCost,
  );
  await admin.from("ai_usage_events").insert({
    source: "routed",
    feature: "sdr",
    provider_id: providerId,
    model: route.model,
    input_tokens: llmResult.inputTokens,
    output_tokens: llmResult.outputTokens,
    cost_brl: costBRL,
    latency_ms: latencyMs,
    status: "ok",
    caller_id: null,
    store_id: storeId,
  });

  // 12. Non-destructive enrichment. `address` is jsonb — merge `city` into
  // whatever address object already exists instead of overwriting it (see
  // the schema note in step 5).
  if (decision.collectedData && customerId) {
    const patch = computeCustomerEnrichmentPatch(
      { name: customerName, city: customerCity },
      { preferredName: decision.collectedData.preferredName, location: decision.collectedData.location },
    );
    if (Object.keys(patch).length > 0) {
      await admin
        .from("customers")
        .update({
          ...(patch.name ? { full_name: patch.name } : {}),
          ...(patch.city ? { address: { ...(customerAddress ?? {}), city: patch.city } } : {}),
        })
        .eq("id", customerId);
    }
  }

  // 13. Persist session state.
  const nextCollectedData = { ...collectedData, ...decision.collectedData };
  const isFinishing = decision.action === "handoff" || decision.action === "close";
  await admin
    .from("sdr_sessions")
    .update({
      state: decision.action === "handoff" ? "aguardando_humano" : "qualificacao",
      collected_data: nextCollectedData,
      last_activity_at: new Date().toISOString(),
      ...(isFinishing
        ? {
            finished_at: new Date().toISOString(),
            finish_reason: decision.action === "handoff" ? "escalated" : "completed",
          }
        : {}),
    })
    .eq("conversation_id", conversationId)
    .is("finished_at", null);

  // 14. Send the reply (unless the SDR is closing with nothing to say).
  // Re-check is_sdr_active right before sending — the pause-by-human trigger
  // (Parte A, applied in prod) may have flipped it false while this handler
  // was waiting on the LLM call (up to LLM_TIMEOUT_MS). Without this, a human
  // who took over mid-turn could still get a stale SDR reply sent after
  // theirs. Closes the race window flagged in Parte A's final review
  // (docs ledger, Task 3 "Important #1").
  if (decision.reply && decision.reply.trim().length > 0) {
    const { data: freshConv } = await admin
      .from("conversations")
      .select("is_sdr_active")
      .eq("id", conversationId)
      .maybeSingle();
    if (freshConv?.is_sdr_active) {
      await dispatchSdrReply(admin, ctx.traceId, conversationId, storeId, decision.reply);
    } else {
      ctx.log.warn("sdr-respond skipped stale reply — human took over mid-turn", { conversationId });
    }
  }

  // 15. Handoff → escalate to a human seller.
  if (decision.action === "handoff" && decision.handoffReason) {
    const { data: sellers } = await admin
      .from("sellers")
      .select("id, full_name, availability, active, store_id")
      .eq("store_id", storeId)
      .eq("active", true);
    const sellerRows = (sellers ?? []) as Array<{
      id: string;
      full_name: string;
      availability: "online" | "ausente" | "ocupado" | "offline";
      active: boolean;
      store_id: string;
    }>;
    // Only the 5 fields chooseHumanSeller actually reads — cast bridges the
    // narrow DB row shape to the full domain ISeller type it's typed against.
    const sellersForCascade = sellerRows.map((s) => ({
      id: s.id,
      fullName: s.full_name,
      availability: s.availability,
      active: s.active,
      storeId: s.store_id,
    })) as unknown as IChooseSellerInput["sellers"];

    const { data: openConvCounts } = await admin
      .from("conversations")
      .select("assigned_seller_id")
      .eq("store_id", storeId)
      .eq("status", "aguardando")
      .not("assigned_seller_id", "is", null);
    const loadBySeller: Record<string, number> = {};
    for (const row of openConvCounts ?? []) {
      const id = row.assigned_seller_id as string;
      loadBySeller[id] = (loadBySeller[id] ?? 0) + 1;
    }

    const { data: customerRow } = customerId
      ? await admin.from("customers").select("seller_id").eq("id", customerId).maybeSingle()
      : { data: null };

    const summary = buildContextSummary({
      session: {
        id: sessionId,
        conversationId,
        state: "aguardando_humano",
        collectedData: nextCollectedData,
        lastActivityAt: new Date().toISOString(),
        startedAt: sessionStartedAt,
      } as unknown as Parameters<typeof buildContextSummary>[0]["session"],
      conversation: { id: conversationId } as unknown as Parameters<typeof buildContextSummary>[0]["conversation"],
      messages: [] as unknown as Parameters<typeof buildContextSummary>[0]["messages"],
      reasonText: decision.reply,
    });

    const escalateInput: IEscalateToHumanInput = {
      sessionId,
      conversationId,
      storeId,
      customerId: customerId ?? undefined,
      reason: decision.handoffReason,
      context: summary,
      selection: {
        storeId,
        sellers: sellersForCascade,
        loadBySeller,
        carteiraSellerId: (customerRow?.seller_id as string | null) ?? undefined,
        excludeSellerIds: [],
      },
    };
    const { escalation, selection } = escalateToHuman(escalateInput);
    // NOTE (schema drift found while implementing): `sdr_escalations.id` is a
    // real `uuid` column in prod, but the pure engine's `escalation.id` is
    // minted as `escalation-<sessionId>-<timestamp>` (text, not uuid-shaped)
    // — inserting it as-is would fail with "invalid input syntax for type
    // uuid". Generate a real uuid for the row's primary key instead; nothing
    // else in this handler depends on the engine's own id value.
    await admin.from("sdr_escalations").insert({
      id: crypto.randomUUID(),
      session_id: escalation.sessionId,
      conversation_id: conversationId,
      customer_id: customerId,
      store_id: storeId,
      reason: escalation.reason,
      mode: escalation.mode,
      context_summary: escalation.contextSummary,
      assigned_seller_id: selection.selectedSellerId,
      assigned_at: selection.selectedSellerId ? new Date().toISOString() : null,
      status: selection.selectedSellerId ? "assigned" : "pending",
      specialty_matched: selection.specialtyMatched,
    });
    if (selection.selectedSellerId) {
      await admin
        .from("conversations")
        .update({ assigned_seller_id: selection.selectedSellerId, is_sdr_active: false })
        .eq("id", conversationId);
    }
  } else if (decision.action === "close") {
    await admin.from("conversations").update({ is_sdr_active: false }).eq("id", conversationId);
  }

  return json({ action: decision.action, traceId: ctx.traceId }, 200);
});
