/**
 * whatsapp-avatar-sync — sync contacts' WhatsApp profile photos into the public
 * `avatars` Storage bucket (conversations inbox avatars). Two modes:
 *
 *  • BATCH (owner-only): no customerId → drains pending contacts
 *    (customers.avatar_synced_at IS NULL) in limit-sized pages. The client
 *    loops until `done`. Idempotent: a re-run never re-attempts a stamped row.
 *
 *  • SINGLE (staff + sellers): customerId present → forced re-sync of THAT one
 *    contact, re-attempting even if already stamped (explicit user retry from
 *    the conversation kebab — e.g. the automatic fetch ran too early). `done`
 *    is always true.
 *
 * For each contact it asks the Evolution instance for the profile-picture URL,
 * downloads the bytes, mirrors them to `avatars/<storeId>/<customerId>.jpg`, and
 * stamps customers.avatar_url (+ avatar_synced_at). No public photo / private →
 * just stamps. Best-effort per contact: a single failure is counted, never
 * aborting the run.
 *
 * POST { accountId, customerId?, limit? }
 *   → { processed, withPhoto, withoutPhoto, failed, done, traceId }
 *
 * Secrets: {credentials_ref}_API_KEY (Vault-first, env fallback).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { syncContactAvatar } from "../_shared/avatar.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { type IEvolutionInstanceTarget } from "../_shared/whatsapp/evolution/instance.ts";
import {
  fetchGoProfilePictureUrl,
  type IGoInstanceTarget,
} from "../_shared/whatsapp/evolution-go/instance.ts";
import { EVOLUTION_GO_SECRET_SUFFIXES } from "../_shared/whatsapp/evolution-go/constants.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";
import { resolveGoServer } from "./goServer.ts";

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;
/** Gap between contacts — keeps the bulk run gentle on the Evolution server. */
const THROTTLE_MS = 120;

/** The bulk drain stays owner-only; the single forced re-sync is broader. */
const BATCH_ROLES = ["owner"] as const;
const SINGLE_CONTACT_ROLES = [
  "owner",
  "manager",
  "seller_internal",
  "seller_external",
] as const;

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  credentials_ref: string;
  go_server_id: string | null;
  provider_config: { baseUrl?: string; instanceName?: string; instanceId?: string } | null;
}

interface ICustomerRow {
  id: string;
  phone: string;
}

function jsonError(message: string, code: string, status: number): Response {
  return json({ error: message, code }, status);
}

function makeEngineDeps(admin: SupabaseClient, traceId: string): IEngineDeps {
  return {
    resolveSecret: createSecretResolver(admin),
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

/** Audit actor must reference sellers.id (audit FK) — resolve from the caller. */
async function resolveActorSellerId(
  admin: SupabaseClient,
  callerId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("seller_id")
    .eq("auth_user_id", callerId)
    .maybeSingle();
  return (data?.seller_id as string | null) ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

servePost(async (req, { log, traceId }) => {
  // Body first so we know the mode BEFORE choosing the role gate (requireCaller
  // reads headers only, not the body — order is safe).
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const customerId = typeof body.customerId === "string" ? body.customerId : "";
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT),
  );
  if (!accountId) throw new HttpError(400, "accountId is required");

  const { callerId, admin, profile } = await requireCaller(
    req,
    customerId ? SINGLE_CONTACT_ROLES : BATCH_ROLES,
  );

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, credentials_ref, go_server_id, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution" && account.provider !== "evolution-go") {
    return jsonError("sincronização disponível apenas para contas Evolution", "VALIDATION_ERROR", 422);
  }

  const deps = makeEngineDeps(admin, traceId);

  // Resolve the engine-specific picture-URL fetcher (+ the classic target/apiKey
  // syncContactAvatar still expects). Evolution Go keeps its base URL in the
  // server registry (whatsapp_go_servers) and authorizes by the per-instance
  // TOKEN; classic Evolution uses provider_config.baseUrl + the instance API key.
  let target: IEvolutionInstanceTarget;
  let apiKey: string;
  let fetchPicUrl: ((wire: string, traceId?: string) => Promise<string | null>) | undefined;

  if (account.provider === "evolution-go") {
    const instanceId = account.provider_config?.instanceId ?? "";
    if (!instanceId) {
      return jsonError("conta Evolution Go ainda não pareada", "CONFIG_MISSING", 422);
    }
    const { baseUrl } = await resolveGoServer(admin, deps.resolveSecret, account);
    const instanceToken = await deps.resolveSecret(
      `${account.credentials_ref}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`,
    );
    if (!instanceToken) {
      return jsonError("token da instância Go não cadastrado", "MISSING_API_KEY", 422);
    }
    const goTarget: IGoInstanceTarget = { baseUrl, instanceId };
    apiKey = instanceToken;
    target = { baseUrl, instanceName: instanceId }; // unused by the Go path; fetchPicUrl drives it
    fetchPicUrl = (wire, t) => fetchGoProfilePictureUrl(instanceToken, deps, goTarget, wire, t);
  } else {
    const baseUrl = account.provider_config?.baseUrl;
    const instanceName = account.provider_config?.instanceName;
    if (!baseUrl || !instanceName) {
      return jsonError("configure URL base e instância antes de sincronizar", "CONFIG_MISSING", 422);
    }
    const key = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
    if (!key) {
      return jsonError("chave de API da instância não cadastrada", "MISSING_API_KEY", 422);
    }
    apiKey = key;
    target = { baseUrl, instanceName };
    fetchPicUrl = undefined; // default: classic Evolution fetch inside syncContactAvatar
  }

  let rows: ICustomerRow[];
  if (customerId) {
    // SINGLE mode: that contact only, forced (ignore avatar_synced_at).
    const { data: one } = await admin
      .from("customers")
      .select("id, phone")
      .eq("id", customerId)
      .eq("store_id", account.store_id)
      .maybeSingle<ICustomerRow>();
    if (!one) return jsonError("contato não encontrado nesta loja", "NOT_FOUND", 404);
    rows = [one];
  } else {
    // BATCH mode: pending contacts only (idempotent drain): avatar_synced_at IS NULL.
    const { data: customers, error } = await admin
      .from("customers")
      .select("id, phone")
      .eq("store_id", account.store_id)
      .is("avatar_synced_at", null)
      .not("phone", "is", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(`select customers: ${error.message}`);
    rows = (customers ?? []) as ICustomerRow[];
  }

  let withPhoto = 0;
  let withoutPhoto = 0;
  let failed = 0;

  for (const contact of rows) {
    const result = await syncContactAvatar(
      admin,
      deps,
      target,
      apiKey,
      { id: contact.id, phone: contact.phone, storeId: account.store_id },
      { traceId, warn: (msg, fields) => log.warn(msg, fields) },
      fetchPicUrl,
    );
    if (result === "with-photo") withPhoto += 1;
    else if (result === "without-photo") withoutPhoto += 1;
    else failed += 1;
    await sleep(THROTTLE_MS);
  }

  const processed = rows.length;
  // Single mode has no pagination; the batch drain is done when the page wasn't full.
  const done = customerId ? true : processed < limit;

  const actorId = await resolveActorSellerId(admin, callerId);
  if (actorId) {
    await bestEffortAudit(admin, {
      store_id: account.store_id,
      actor_id: actorId,
      action: customerId ? "whatsapp_avatar_synced_contact" : "whatsapp_avatars_synced",
      resource: customerId ? "customer" : "whatsapp_account",
      resource_id: customerId ? customerId : account.id,
      after: { processed, withPhoto, withoutPhoto, failed, done, accountId: account.id, traceId },
    });
  }
  log.info("avatar sync processed", {
    accountId: account.id,
    customerId: customerId || undefined,
    processed,
    withPhoto,
    withoutPhoto,
    failed,
    done,
  });

  return json({ processed, withPhoto, withoutPhoto, failed, done, traceId }, 200);
});
