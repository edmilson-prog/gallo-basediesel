/**
 * whatsapp-avatar-sync — owner-only, batched sync of contacts' WhatsApp profile
 * photos into the public `avatars` Storage bucket (conversations inbox avatars).
 *
 * For each pending contact (customers.avatar_synced_at IS NULL) it asks the
 * Evolution instance for the profile-picture URL, downloads the bytes, mirrors
 * them to `avatars/<storeId>/<customerId>.jpg`, and stamps customers.avatar_url
 * (+ avatar_synced_at). Contacts with no public photo / a private one just get
 * avatar_synced_at stamped, so a re-run never re-attempts them and the client
 * loop drains forward to completion. Best-effort per contact: a single failure
 * is counted and skipped, never aborting the batch.
 *
 * POST { accountId, limit? } → { processed, withPhoto, withoutPhoto, failed, done }
 * The client loops until `done` (processed < limit). Idempotent and resumable.
 *
 * Secrets: {credentials_ref}_API_KEY (Vault-first, env fallback).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import {
  fetchProfilePictureUrl,
  type IEvolutionInstanceTarget,
} from "../_shared/whatsapp/evolution/instance.ts";
import { E164_REGEX, toE164 } from "../_shared/whatsapp/phone.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

const AVATARS_BUCKET = "avatars";
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;
/** Gap between contacts — keeps the bulk run gentle on the Evolution server. */
const THROTTLE_MS = 120;

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  credentials_ref: string;
  provider_config: { baseUrl?: string; instanceName?: string } | null;
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
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT),
  );
  if (!accountId) throw new HttpError(400, "accountId is required");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, credentials_ref, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution") {
    return jsonError("sincronização disponível apenas para contas Evolution", "VALIDATION_ERROR", 422);
  }
  const baseUrl = account.provider_config?.baseUrl;
  const instanceName = account.provider_config?.instanceName;
  if (!baseUrl || !instanceName) {
    return jsonError("configure URL base e instância antes de sincronizar", "CONFIG_MISSING", 422);
  }

  const deps = makeEngineDeps(admin, traceId);
  const apiKey = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
  if (!apiKey) {
    return jsonError("chave de API da instância não cadastrada", "MISSING_API_KEY", 422);
  }

  const target: IEvolutionInstanceTarget = { baseUrl, instanceName };

  // Pending contacts only (idempotent drain): avatar_synced_at IS NULL.
  const { data: customers, error } = await admin
    .from("customers")
    .select("id, phone")
    .eq("store_id", account.store_id)
    .is("avatar_synced_at", null)
    .not("phone", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`select customers: ${error.message}`);

  const rows = (customers ?? []) as ICustomerRow[];
  const nowIso = () => new Date().toISOString();
  const markAttempted = (id: string) =>
    admin.from("customers").update({ avatar_synced_at: nowIso() }).eq("id", id);

  let withPhoto = 0;
  let withoutPhoto = 0;
  let failed = 0;

  for (const contact of rows) {
    try {
      const e164 = toE164(contact.phone);
      if (!E164_REGEX.test(e164)) {
        await markAttempted(contact.id);
        withoutPhoto += 1;
        continue;
      }
      const wire = e164.slice(1);
      const picUrl = await fetchProfilePictureUrl(apiKey, deps, target, wire, traceId);
      if (!picUrl) {
        await markAttempted(contact.id);
        withoutPhoto += 1;
        continue;
      }
      const downloaded = await fetch(picUrl).catch(() => null);
      if (!downloaded || !downloaded.ok) {
        await markAttempted(contact.id);
        withoutPhoto += 1;
        continue;
      }
      const bytes = new Uint8Array(await downloaded.arrayBuffer());
      const contentType = downloaded.headers.get("content-type") ?? "image/jpeg";
      const path = `${account.store_id}/${contact.id}.jpg`;
      const { error: uploadError } = await admin.storage
        .from(AVATARS_BUCKET)
        .upload(path, bytes, { contentType, upsert: true });
      if (uploadError) throw new Error(`upload: ${uploadError.message}`);
      const publicUrl = admin.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl;
      await admin
        .from("customers")
        .update({ avatar_url: publicUrl, avatar_synced_at: nowIso() })
        .eq("id", contact.id);
      withPhoto += 1;
    } catch (caught) {
      failed += 1;
      log.warn("avatar sync failed for contact", {
        customerId: contact.id,
        error: caught instanceof Error ? caught.message : String(caught),
      });
      // Stamp so a re-run drains forward instead of hot-looping a bad row.
      await markAttempted(contact.id).then(
        () => {},
        () => {},
      );
    }
    await sleep(THROTTLE_MS);
  }

  const processed = rows.length;
  const done = processed < limit;

  const actorId = await resolveActorSellerId(admin, callerId);
  if (actorId) {
    await bestEffortAudit(admin, {
      store_id: account.store_id,
      actor_id: actorId,
      action: "whatsapp_avatars_synced",
      resource: "whatsapp_account",
      resource_id: account.id,
      after: { processed, withPhoto, withoutPhoto, failed, done, traceId },
    });
  }
  log.info("avatar sync batch processed", {
    accountId: account.id,
    processed,
    withPhoto,
    withoutPhoto,
    failed,
    done,
  });

  return json({ processed, withPhoto, withoutPhoto, failed, done, traceId }, 200);
});
