/**
 * waha-send — outbound dispatch for WAHA sessions.
 *
 * FULLY ISOLATED: does not import `_shared/whatsapp/send/core.ts`. Permission
 * is enforced by CALLING (never editing) the canonical `can_access_conversation`
 * RPC with the CALLER's own JWT (so `auth.uid()` resolves correctly inside the
 * SECURITY DEFINER function) — this reuses the frozen "2 portões" gate instead
 * of re-deriving a parallel copy of its logic.
 *
 * Input (JSON body):
 *   { conversationId, kind: 'text'|'media', text?, mediaUrl?, mediaType?, filename? }
 *
 * v1 simplification vs the shared pipeline: no 24h-window check (Meta-only
 * rule), no auto conversation-status transition on send — just persists the
 * message and touches last_message_at. Both are documented deferrals in the
 * design spec.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { dispatchWahaMedia, dispatchWahaText } from "../_shared/wahaSendAdapter.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";

interface ISendBody {
  conversationId?: string;
  kind?: "text" | "media";
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  filename?: string;
  /** Byte size of the file — lets the WAHA path route a video inline vs. as a document. */
  sizeBytes?: number;
  /** Client-generated id — lets the optimistic bubble and the persisted row share one id. */
  messageId?: string;
}

async function resolveSender(req: Request): Promise<{
  sellerId: string | null;
  storeId: string;
  authHeader: string;
  admin: SupabaseClient;
}> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "missing authorization");

  const callerClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await callerClient.auth.getUser();
  if (error || !data?.user) throw new HttpError(401, "invalid session");

  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );
  const { data: profile } = await admin
    .from("profiles")
    .select("store_id, seller_id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!profile) throw new HttpError(403, "forbidden: no profile");

  return {
    sellerId: (profile.seller_id as string | null) ?? null,
    storeId: profile.store_id as string,
    authHeader,
    admin,
  };
}

/** Calls the frozen RPC with the CALLER's own JWT so auth.uid() resolves correctly. */
async function callerCanAccessConversation(
  authHeader: string,
  conversationId: string,
): Promise<boolean> {
  const callerClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await callerClient.rpc("can_access_conversation", {
    conv: conversationId,
  });
  if (error) return false;
  return data === true;
}

servePost(async (req, ctx) => {
  const { sellerId, storeId, authHeader, admin } = await resolveSender(req);
  const body = (await parseJsonBody(req)) as ISendBody;
  if (!body.conversationId || !body.kind) {
    throw new HttpError(422, "conversationId e kind (text|media) são obrigatórios");
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, store_id, whatsapp_account_id, status")
    .eq("id", body.conversationId)
    .maybeSingle();
  if (!conversation || conversation.store_id !== storeId) {
    throw new HttpError(404, "Conversa não encontrada");
  }
  if (!conversation.whatsapp_account_id) {
    throw new HttpError(422, "Conversa sem conta WhatsApp associada");
  }

  const allowed = await callerCanAccessConversation(authHeader, body.conversationId);
  if (!allowed) throw new HttpError(403, "Sem permissão para enviar nesta conversa");

  try {
    const result =
      body.kind === "text"
        ? await dispatchWahaText(admin, {
            conversationId: body.conversationId,
            storeId,
            text: body.text ?? "",
            sellerId,
            messageId: body.messageId,
          })
        : await dispatchWahaMedia(admin, {
            conversationId: body.conversationId,
            storeId,
            mediaUrl: body.mediaUrl ?? "",
            mediaType: body.mediaType ?? "document",
            fileName: body.filename,
            caption: body.text,
            sizeBytes: body.sizeBytes,
            sellerId,
            messageId: body.messageId,
          });

    return json(
      {
        messageId: result.messageId,
        providerMessageId: result.providerMessageId,
        dispatchStatus: "sent",
        traceId: ctx.traceId,
      },
      200,
    );
  } catch (err) {
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("waha-send rejected", { code: err.code, message: err.message });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
});
