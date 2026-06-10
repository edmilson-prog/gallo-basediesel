/**
 * whatsapp-send — outbound send pipeline (PRD-115).
 *
 * Authenticated POST (gateway verify_jwt + caller resolution): any profiled
 * user may CALL the function; per-conversation permission is enforced by the
 * shared core (staff of the store / assigned seller / pool). The core also
 * does the Meta 24h pre-check, persist-before-send and audit — this file is
 * only HTTP wiring + the service_role adapter.
 *
 * Input (JSON body):
 *   { conversationId, kind: 'text'|'media'|'template', text?, mediaPath?,
 *     mediaType?, templateName?, templateLanguage?, templateParameters?,
 *     replyToMessageId? }
 *
 * Errors keep the house `{ error }` contract; the body also carries `code`
 * (TEMPLATE_REQUIRED, RATE_LIMITED, PROVIDER_DISCONNECTED, …) so the frontend
 * can branch UX without parsing messages.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";
import {
  processSendRequest,
  type ISendDb,
  type ISender,
  type ISendRequest,
} from "../_shared/whatsapp/send/core.ts";
import type { IAccountRecord } from "../_shared/whatsapp/webhook/core.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

const SIGNED_URL_TTL_SECONDS = 300; // 5min — provider fetches immediately

/** Resolves the caller's profile INCLUDING seller_id (requireCaller omits it). */
async function resolveSender(req: Request): Promise<{ sender: ISender; admin: SupabaseClient }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "missing authorization");

  const callerClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, "invalid session");

  const admin = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, store_id, seller_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!profile) throw new HttpError(403, "forbidden: no profile");

  return {
    sender: {
      sellerId: (profile.seller_id as string | null) ?? null,
      role: profile.role as string,
      storeId: profile.store_id as string,
    },
    admin,
  };
}

function makeSendDb(admin: SupabaseClient, traceId: string): ISendDb {
  return {
    async getSendContext(conversationId) {
      const { data: conv } = await admin
        .from("conversations")
        .select("id, store_id, status, assigned_seller_id, whatsapp_account_id, customer_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!conv) return null;

      let account: IAccountRecord | null = null;
      if (conv.whatsapp_account_id) {
        const { data: row } = await admin
          .from("whatsapp_accounts")
          .select("id, store_id, provider, phone_number, credentials_ref, provider_config")
          .eq("id", conv.whatsapp_account_id)
          .neq("status", "disconnected")
          .maybeSingle();
        if (row) {
          account = {
            id: row.id as string,
            storeId: row.store_id as string,
            provider: row.provider as "meta" | "evolution",
            phoneNumber: row.phone_number as string,
            credentialsRef: row.credentials_ref as string,
            providerConfig: (row.provider_config as Record<string, unknown> | null) ?? null,
          };
        }
      }

      let customerPhone: string | null = null;
      if (conv.customer_id) {
        const { data: customer } = await admin
          .from("customers")
          .select("phone")
          .eq("id", conv.customer_id)
          .maybeSingle();
        customerPhone = (customer?.phone as string | undefined) ?? null;
      }

      return {
        conversation: {
          id: conv.id as string,
          storeId: conv.store_id as string,
          status: conv.status as string,
          assignedSellerId: (conv.assigned_seller_id as string | null) ?? null,
        },
        account,
        customerPhone,
      };
    },
    async isWithin24hWindow(conversationId) {
      const { data, error } = await admin.rpc("is_within_24h_window", {
        p_conversation_id: conversationId,
      });
      if (error) throw new Error(`is_within_24h_window: ${error.message}`);
      return Boolean(data);
    },
    async insertQueuedMessage(input) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          direction: "out",
          author_type: "seller",
          author_id: input.sellerId,
          provider: input.provider,
          text: input.text,
          media_type: input.mediaType,
          media_url: input.mediaUrl,
          status: "queued",
          sent_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error) throw new Error(`insertQueuedMessage: ${error.message}`);
      return { id: data.id as string };
    },
    async markMessageSent(messageId, providerMessageId) {
      await admin
        .from("messages")
        .update({ status: "sent", provider_message_id: providerMessageId })
        .eq("id", messageId);
    },
    async markMessageFailed(messageId, failureReason) {
      await admin
        .from("messages")
        .update({ status: "failed", failure_reason: failureReason })
        .eq("id", messageId);
    },
    async touchConversation(conversationId, lastMessageAt) {
      await admin
        .from("conversations")
        .update({ last_message_at: lastMessageAt, updated_at: lastMessageAt })
        .eq("id", conversationId);
    },
    async createSignedMediaUrl(path) {
      const { data, error } = await admin.storage
        .from("whatsapp-media")
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error || !data?.signedUrl) {
        throw new WhatsAppProviderError(
          "VALIDATION_ERROR",
          422,
          `Mídia não encontrada no Storage: ${path}`,
        );
      }
      return data.signedUrl;
    },
    async audit(input) {
      await bestEffortAudit(admin, {
        store_id: input.storeId,
        actor_id: input.actorId,
        action: input.action,
        resource: input.resource,
        resource_id: input.resourceId,
        after: input.after,
      });
    },
  };
}

function makeEngineDeps(admin: SupabaseClient, traceId: string): IEngineDeps {
  return {
    resolveSecret: (name) => Promise.resolve(Deno.env.get(name)),
    logIntegration: async (entry: IIntegrationLogEntry) => {
      await admin.from("integration_logs").insert({
        integration_name: entry.integrationName,
        direction: entry.direction,
        endpoint: entry.endpoint,
        http_status: entry.httpStatus,
        latency_ms: entry.latencyMs,
        trace_id: entry.traceId ?? traceId,
        request_payload: entry.requestPayload,
        response_payload: entry.responsePayload,
        error_message: entry.errorMessage,
      });
    },
  };
}

servePost(async (req, ctx) => {
  const { sender, admin } = await resolveSender(req);
  const body = await parseJsonBody(req);
  const input = body as unknown as ISendRequest;

  try {
    const result = await processSendRequest({
      input,
      sender,
      db: makeSendDb(admin, ctx.traceId),
      buildProvider: (account) =>
        buildWhatsAppEngine({
          engine: account.provider,
          accountId: account.id,
          providerConfig: account.providerConfig,
          credentialsRef: account.credentialsRef,
          deps: makeEngineDeps(admin, ctx.traceId),
        }),
      traceId: ctx.traceId,
    });
    ctx.log.info("message dispatched", {
      conversationId: input.conversationId,
      kind: input.kind,
      messageId: result.messageId,
    });
    return json({ ...result, traceId: ctx.traceId }, 200);
  } catch (err) {
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("send rejected", { code: err.code, message: err.message });
      // House `{ error }` contract + machine `code` for frontend UX branching.
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
});
