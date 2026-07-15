// supabase/functions/_shared/ai/transcribeAudio.ts
/**
 * Orquestração central da transcrição de áudio inbound (feature `audio_transcription`).
 * Chamada por dois caminhos: automático (whatsapp-webhook, fire-and-forget via
 * runInBackground) e manual (Edge Function audio-transcribe, retry a partir da UI).
 * Sempre com o client `admin` (service_role) — nunca exposta diretamente ao browser.
 */

import { type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { createSecretResolver } from "../secrets.ts";
import { callOpenRouterTranscription, computeCostBRL } from "./adapters.ts";

const FEATURE = "audio_transcription";
const MEDIA_BUCKET = "whatsapp-media";
const TRANSCRIBE_TIMEOUT_MS = 60_000;

interface RoutingEntry {
  feature: string;
  enabled: boolean;
  providerId: string;
  model: string;
}
interface SettingsRow {
  master_enabled: boolean;
  budget: { monthlyCapBRL: number; usdToBrl: number };
  routing: RoutingEntry[];
}

async function monthSpendBRL(admin: SupabaseClient): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("cost_brl")
    .gte("ts", start.toISOString());
  if (error) throw new Error(`budget read failed: ${error.message}`);
  return (data ?? []).reduce((a: number, r: { cost_brl: number | string }) => a + Number(r.cost_brl), 0);
}

async function markStatus(
  admin: SupabaseClient,
  messageId: string,
  status: "done" | "failed" | "skipped",
  transcription?: string,
): Promise<{ status: "done" | "failed" | "skipped" }> {
  await admin
    .from("messages")
    .update({
      transcription_status: status === "skipped" ? null : status,
      ...(transcription !== undefined ? { transcription } : {}),
    })
    .eq("id", messageId);
  return { status };
}

async function insertUsageEvent(
  admin: SupabaseClient,
  input: {
    providerId: string;
    model: string;
    costBRL: number;
    latencyMs: number;
    status: "ok" | "error";
    storeId: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("ai_usage_events").insert({
    source: "routed",
    feature: FEATURE,
    provider_id: input.providerId,
    model: input.model,
    input_tokens: 0,
    output_tokens: 0,
    cost_brl: input.costBRL,
    latency_ms: input.latencyMs,
    status: input.status,
    caller_id: null, // system-triggered (webhook) or retry — no end-user caller to attribute
    store_id: input.storeId,
  });
  if (error) {
    console.error(`insertUsageEvent failed: ${error.message}`);
  }
}

export async function transcribeMessageAudio(
  admin: SupabaseClient,
  messageId: string,
): Promise<{ status: "done" | "failed" | "skipped" }> {
  const { data: settings, error: sErr } = await admin
    .from("ai_settings")
    .select("master_enabled, budget, routing")
    .eq("id", 1)
    .maybeSingle<SettingsRow>();
  if (sErr || !settings) return markStatus(admin, messageId, "skipped");

  const route = settings.routing.find((r) => r.feature === FEATURE);
  if (!settings.master_enabled || !route || !route.enabled) {
    return markStatus(admin, messageId, "skipped");
  }
  if (route.providerId !== "openrouter") {
    // Only OpenRouter has a transcription adapter today (mirrors the
    // part_identification precedent: an unsupported provider fails cleanly
    // rather than silently no-op-ing).
    console.error(`transcribeMessageAudio[${messageId}] unsupported provider: ${route.providerId}`);
    return markStatus(admin, messageId, "failed");
  }

  let spent: number;
  try {
    spent = await monthSpendBRL(admin);
  } catch (err) {
    console.error(`transcribeMessageAudio[${messageId}] monthSpendBRL failed: ${err instanceof Error ? err.message : String(err)}`);
    return markStatus(admin, messageId, "failed");
  }
  if (settings.budget.monthlyCapBRL > 0 && spent >= settings.budget.monthlyCapBRL) {
    console.error(`transcribeMessageAudio[${messageId}] budget exceeded: spent=${spent} cap=${settings.budget.monthlyCapBRL}`);
    return markStatus(admin, messageId, "failed");
  }

  const { data: message, error: mErr } = await admin
    .from("messages")
    .select("media_url, conversation_id")
    .eq("id", messageId)
    .maybeSingle<{ media_url: string | null; conversation_id: string }>();
  if (mErr || !message?.media_url) {
    if (mErr) {
      console.error(`transcribeMessageAudio[${messageId}] message fetch failed: ${mErr.message}`);
    } else {
      console.error(`transcribeMessageAudio[${messageId}] message not found or media_url missing`);
    }
    return markStatus(admin, messageId, "failed");
  }

  let storeId: string | null = null;
  const { data: conv } = await admin
    .from("conversations")
    .select("store_id")
    .eq("id", message.conversation_id)
    .maybeSingle<{ store_id: string | null }>();
  storeId = conv?.store_id ?? null;

  let file: Blob | null;
  let dlErr: unknown;
  try {
    const res = await admin.storage.from(MEDIA_BUCKET).download(message.media_url);
    file = res.data;
    dlErr = res.error;
  } catch (err) {
    console.error(`transcribeMessageAudio[${messageId}] storage download exception: ${err instanceof Error ? err.message : String(err)}`);
    return markStatus(admin, messageId, "failed");
  }
  if (dlErr || !file) {
    if (dlErr) {
      console.error(`transcribeMessageAudio[${messageId}] storage download error: ${dlErr instanceof Error ? dlErr.message : String(dlErr)}`);
    } else {
      console.error(`transcribeMessageAudio[${messageId}] storage download returned null file`);
    }
    return markStatus(admin, messageId, "failed");
  }

  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret("OPENROUTER_API_KEY");
  if (!apiKey) {
    console.error(`transcribeMessageAudio[${messageId}] OPENROUTER_API_KEY not found in Vault`);
    return markStatus(admin, messageId, "failed");
  }

  const started = Date.now();
  const controller = AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS);
  try {
    const audioBytes = new Uint8Array(await file.arrayBuffer());
    const result = await callOpenRouterTranscription(
      apiKey,
      audioBytes,
      file.type || "audio/ogg",
      route.model,
      controller,
    );
    const latencyMs = Date.now() - started;
    const costBRL = computeCostBRL(
      0,
      0,
      { inputPricePer1kUsd: 0, outputPricePer1kUsd: 0 },
      settings.budget.usdToBrl,
      result.usdCost ?? 0,
    );
    await insertUsageEvent(admin, {
      providerId: route.providerId,
      model: route.model,
      costBRL,
      latencyMs,
      status: "ok",
      storeId,
    });
    if (!result.text) {
      console.error(`transcribeMessageAudio[${messageId}] OpenRouter returned empty transcription text`);
      return markStatus(admin, messageId, "failed");
    }
    return markStatus(admin, messageId, "done", result.text);
  } catch (err) {
    const latencyMs = Date.now() - started;
    console.error(`transcribeMessageAudio[${messageId}] OpenRouter call failed: ${err instanceof Error ? err.message : String(err)}`);
    await insertUsageEvent(admin, {
      providerId: route.providerId,
      model: route.model,
      costBRL: 0,
      latencyMs,
      status: "error",
      storeId,
    });
    return markStatus(admin, messageId, "failed");
  }
}
