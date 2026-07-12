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
import { bestEffortAudit } from "../_shared/audit.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { sendWahaMedia, sendWahaText } from "../_shared/whatsapp/waha/send.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";

interface ISendBody {
  conversationId?: string;
  kind?: "text" | "media";
  text?: string;
  mediaUrl?: string;
  mediaType?: "image" | "audio" | "video" | "document";
  filename?: string;
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

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, provider, provider_config, waha_server_id, credentials_ref")
    .eq("id", conversation.whatsapp_account_id as string)
    .maybeSingle();
  if (!account || account.provider !== "waha") {
    throw new HttpError(422, "Conta associada não é uma sessão WAHA");
  }
  const sessionName = String(
    (account.provider_config as Record<string, unknown> | null)?.sessionName ?? "",
  );
  if (!sessionName) throw new HttpError(422, "Sessão WAHA sem sessionName configurado");

  const { data: server } = await admin
    .from("waha_servers")
    .select("base_url, api_key_ref")
    .eq("id", account.waha_server_id as string)
    .maybeSingle();
  if (!server) throw new HttpError(422, "Servidor WAHA não encontrado");
  const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
  const resolveSecret = createSecretResolver(admin);
  const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
  if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida");

  const { data: customer } = await admin
    .from("conversations")
    .select("customers(phone)")
    .eq("id", body.conversationId)
    .maybeSingle();
  const toPhone = (customer as unknown as { customers?: { phone?: string } } | null)?.customers
    ?.phone;
  if (!toPhone) throw new HttpError(422, "Cliente sem telefone cadastrado");

  const messageId = body.messageId ?? crypto.randomUUID();
  const { error: insertErr } = await admin.from("messages").insert({
    id: messageId,
    conversation_id: body.conversationId,
    direction: "out",
    author_type: "seller",
    author_id: sellerId,
    provider: "waha",
    text: body.text ?? "",
    media_type: body.mediaType ?? null,
    media_url: body.mediaUrl ?? null,
    media_filename: body.filename ?? null,
    status: "queued",
    sent_at: new Date().toISOString(),
  });
  if (insertErr) throw new HttpError(500, `Falha ao registrar a mensagem: ${insertErr.message}`);

  const target = { baseUrl, sessionName };
  try {
    const result =
      body.kind === "text"
        ? await sendWahaText(apiKey, globalThis.fetch, target, { toPhone, text: body.text ?? "" })
        : await sendWahaMedia(apiKey, globalThis.fetch, target, {
            toPhone,
            mediaType: body.mediaType ?? "document",
            mediaUrl: body.mediaUrl ?? "",
            filename: body.filename,
            caption: body.text,
          });

    await admin
      .from("messages")
      .update({ status: "sent", provider_message_id: result.providerMessageId })
      .eq("id", messageId);
    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", body.conversationId);

    if (sellerId) {
      await bestEffortAudit(admin, {
        store_id: storeId,
        actor_id: sellerId,
        action: "whatsapp_message_sent",
        resource: "conversation",
        resource_id: body.conversationId,
        after: { provider: "waha", messageId, providerMessageId: result.providerMessageId },
      });
    }
    return json(
      {
        messageId,
        providerMessageId: result.providerMessageId,
        dispatchStatus: "sent",
        traceId: ctx.traceId,
      },
      200,
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await admin
      .from("messages")
      .update({ status: "failed", failure_reason: reason })
      .eq("id", messageId);
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("waha-send rejected", { code: err.code, message: err.message });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
});
