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

/**
 * Pre-resolves the Evolution Go server `base_url` for accounts involved in
 * this send (primary + optional failover). Returns a Map<accountId, baseUrl>.
 *
 * Registry-based Go accounts (new model) store `base_url` on
 * `whatsapp_go_servers`, NOT in `provider_config` — so `buildWhatsAppEngine`
 * would receive an empty `baseUrl` and throw VALIDATION_ERROR. This helper
 * runs before `processSendRequest` so the synchronous `buildProvider` callback
 * can enrich `providerConfig.baseUrl` from the pre-resolved map without
 * needing an async lookup inside `buildProvider`.
 *
 * Fast-exits for non-Go conversations (most sends): 2 queries, no Go server
 * lookup. For Go conversations: 2–3 account queries + 1 Go server query.
 */
async function resolveGoBaseUrls(
  admin: SupabaseClient,
  conversationId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();

  // Step 1: conversation → primary account ID
  const { data: conv } = await admin
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.whatsapp_account_id) return map;

  // Step 2: load the primary account
  const { data: primary } = await admin
    .from("whatsapp_accounts")
    .select("id, provider, go_server_id, failover_account_id, provider_config")
    .eq("id", conv.whatsapp_account_id as string)
    .maybeSingle();
  if (!primary || primary.provider !== "evolution-go") return map; // Fast exit for non-Go

  // Step 3: collect primary + failover (both may be evolution-go and need base_url)
  const accountsToCheck: Array<{
    id: string;
    provider: string;
    go_server_id: string | null;
    provider_config: Record<string, unknown> | null;
  }> = [primary as typeof primary & { id: string; provider: string }];
  if (primary.failover_account_id) {
    const { data: failover } = await admin
      .from("whatsapp_accounts")
      .select("id, provider, go_server_id, provider_config")
      .eq("id", primary.failover_account_id as string)
      .maybeSingle();
    if (failover) {
      accountsToCheck.push(
        failover as typeof failover & { id: string; provider: string },
      );
    }
  }

  // Step 4: for each Go account that lacks base_url in provider_config, fetch
  // it from whatsapp_go_servers (the server registry).
  for (const acc of accountsToCheck) {
    if (acc.provider !== "evolution-go") continue;
    if ((acc.provider_config as Record<string, unknown> | null)?.baseUrl) continue; // Already populated
    if (!acc.go_server_id) continue;
    const { data: server } = await admin
      .from("whatsapp_go_servers")
      .select("base_url")
      .eq("id", acc.go_server_id as string)
      .maybeSingle();
    if (server?.base_url) {
      map.set(acc.id as string, String(server.base_url).replace(/\/+$/, ""));
    }
  }

  return map;
}

/**
 * Pre-resolves the OpenWA server `{baseUrl, apiKeySecretName}` for accounts
 * involved in this send (primary + optional failover). Mirrors
 * `resolveGoBaseUrls` above — OpenWA never stores these in provider_config
 * (ONE global key per server, resolved via `openwa_server_id` →
 * `whatsapp_openwa_servers`), so `buildProvider` needs them pre-fetched.
 */
async function resolveOpenWaServerConfigs(
  admin: SupabaseClient,
  conversationId: string,
): Promise<Map<string, { baseUrl: string; apiKeySecretName: string }>> {
  const map = new Map<string, { baseUrl: string; apiKeySecretName: string }>();

  const { data: conv } = await admin
    .from("conversations")
    .select("whatsapp_account_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv?.whatsapp_account_id) return map;

  const { data: primary } = await admin
    .from("whatsapp_accounts")
    .select("id, provider, openwa_server_id, failover_account_id, provider_config")
    .eq("id", conv.whatsapp_account_id as string)
    .maybeSingle();
  if (!primary || primary.provider !== "openwa") return map; // Fast exit for non-OpenWA

  const accountsToCheck: Array<{
    id: string;
    provider: string;
    openwa_server_id: string | null;
    provider_config: Record<string, unknown> | null;
  }> = [primary as typeof primary & { id: string; provider: string }];
  if (primary.failover_account_id) {
    const { data: failover } = await admin
      .from("whatsapp_accounts")
      .select("id, provider, openwa_server_id, provider_config")
      .eq("id", primary.failover_account_id as string)
      .maybeSingle();
    if (failover) {
      accountsToCheck.push(failover as typeof failover & { id: string; provider: string });
    }
  }

  for (const acc of accountsToCheck) {
    if (acc.provider !== "openwa") continue;
    if (!acc.openwa_server_id) continue;
    const { data: server } = await admin
      .from("whatsapp_openwa_servers")
      .select("base_url, api_key_ref")
      .eq("id", acc.openwa_server_id as string)
      .maybeSingle();
    if (server?.base_url && server?.api_key_ref) {
      map.set(acc.id as string, {
        baseUrl: String(server.base_url).replace(/\/+$/, ""),
        apiKeySecretName: String(server.api_key_ref),
      });
    }
  }

  return map;
}

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

  // Pre-resolve Go server base_url for evolution-go accounts involved in this send.
  // Registry-based Go accounts don't store base_url in provider_config; it lives on
  // whatsapp_go_servers. We resolve it here so the synchronous buildProvider callback
  // can enrich providerConfig.baseUrl without performing an async lookup mid-call.
  const goBaseUrls = await resolveGoBaseUrls(admin, input.conversationId ?? "");
  const openwaServers = await resolveOpenWaServerConfigs(admin, input.conversationId ?? "");

  try {
    const result = await processSendRequest({
      input,
      sender,
      db: makeSendDb(admin, ctx.traceId),
      buildProvider: (account) => {
        // Inject base_url from the server registry when the account is evolution-go
        // and providerConfig does not already have it (old accounts may still carry it).
        let providerConfig = account.providerConfig;
        if (account.provider === "evolution-go" && !providerConfig?.baseUrl) {
          const serverBaseUrl = goBaseUrls.get(account.id);
          if (serverBaseUrl) providerConfig = { ...providerConfig, baseUrl: serverBaseUrl };
        }
        if (account.provider === "openwa") {
          const serverCfg = openwaServers.get(account.id);
          if (serverCfg) providerConfig = { ...providerConfig, ...serverCfg };
        }
        return buildWhatsAppEngine({
          engine: account.provider,
          accountId: account.id,
          providerConfig,
          credentialsRef: account.credentialsRef,
          deps: makeEngineDeps(admin, ctx.traceId),
        });
      },
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
