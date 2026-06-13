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
 *     replyToMessageId?, overrideInvalid?, retryOfMessageId? }   (PRD-118)
 *
 * Errors keep the house `{ error }` contract; the body also carries `code`
 * (TEMPLATE_REQUIRED, RATE_LIMITED, PROVIDER_DISCONNECTED, …) so the frontend
 * can branch UX without parsing messages.
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { servePost } from "../_shared/serve.ts";
import { makeSendDb, makeEngineDeps } from "../_shared/whatsappSendAdapter.ts";
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";
import {
  processSendRequest,
  type ISender,
  type ISendRequest,
} from "../_shared/whatsapp/send/core.ts";

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

  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false },
    },
  );
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
