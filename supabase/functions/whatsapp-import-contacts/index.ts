/**
 * whatsapp-import-contacts — owner-only ENRICHMENT of existing
 * `customers`/`leads` from an Evolution Go instance's WhatsApp contact list
 * (Funnel Frente 3, approved rule b+). Go-only: classic Evolution has no
 * synchronous contacts endpoint wired here; the Go server exposes
 * GET /user/contacts (whatsmeow GetAllContacts).
 *
 * POST { accountId }
 *   → { stats: { contactsFound, customersEnriched, leadsEnriched, alreadyComplete,
 *                skippedUnknown, failed }, traceId }
 *
 * Single shot (the contact list is bounded): no pagination/cursor. This
 * producer creates NO record: a phonebook entry only ever replaces a
 * placeholder name (empty or phone-shaped) on a customer/lead that already
 * matches by phone; a number with no match in the base is skipped and
 * counted (skippedUnknown) — it never becomes a `pending_review` customer
 * ghost. Idempotent — once a name stops being a placeholder, re-runs leave it
 * untouched.
 *
 * Secrets: {credentials_ref}_INSTANCE_TOKEN (Vault-first, env fallback).
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { fetchGoContacts } from "../_shared/whatsapp/evolution-go/contacts.ts";
import { EVOLUTION_GO_SECRET_SUFFIXES } from "../_shared/whatsapp/evolution-go/constants.ts";
import type { IGoInstanceTarget } from "../_shared/whatsapp/evolution-go/instance.ts";
import {
  processContactsImport,
  type IContactsImportDb,
} from "../_shared/whatsapp/import/contacts-core.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";
import { phoneDigitsMatchBr } from "../_shared/whatsapp/phoneBr.ts";
import { resolveGoServer } from "./goServer.ts";

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  credentials_ref: string;
  go_server_id: string | null;
  provider_config: { instanceId?: string } | null;
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

function makeContactsDb(admin: SupabaseClient): IContactsImportDb {
  return {
    async findCustomerByPhone(storeId, phoneDigits) {
      // Suffix narrow in SQL, tolerant BR match in code (mirrors the webhook —
      // stored numbers vary: missing DDI 55, 9th-digit divergence).
      const { data } = await admin
        .from("customers")
        .select("id, phone, full_name")
        .eq("store_id", storeId)
        .like("phone", `%${phoneDigits.slice(-8)}`);
      const match = (data ?? []).find((candidate) =>
        phoneDigitsMatchBr(String(candidate.phone).replace(/\D/g, ""), phoneDigits),
      );
      return match
        ? { id: match.id as string, name: (match.full_name as string | null) ?? null }
        : null;
    },
    async findLeadByPhone(storeId, phoneDigits) {
      const { data } = await admin
        .from("leads")
        .select("id, phone_digits, name")
        .eq("store_id", storeId)
        .like("phone_digits", `%${phoneDigits.slice(-8)}`);
      const match = (data ?? []).find((candidate) =>
        phoneDigitsMatchBr(String(candidate.phone_digits ?? "").replace(/\D/g, ""), phoneDigits),
      );
      return match ? { id: match.id as string, name: (match.name as string | null) ?? null } : null;
    },
    async enrichCustomerName(id, name) {
      const { error } = await admin.from("customers").update({ full_name: name }).eq("id", id);
      if (error) throw new Error(`enrichCustomerName: ${error.message}`);
    },
    async enrichLeadName(id, name) {
      const { error } = await admin.from("leads").update({ name }).eq("id", id);
      if (error) throw new Error(`enrichLeadName: ${error.message}`);
    },
  };
}

servePost(async (req, { log, traceId }) => {
  const { callerId, admin, profile } = await requireCaller(req, ["owner"]);
  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  if (!accountId) throw new HttpError(400, "accountId is required");

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, credentials_ref, go_server_id, provider_config")
    .eq("id", accountId)
    .eq("store_id", profile.store_id)
    .maybeSingle<IAccountRow>();
  if (!account) return jsonError("conta não encontrada nesta loja", "NOT_FOUND", 404);
  if (account.provider !== "evolution-go") {
    return jsonError(
      "importação de contatos disponível apenas para contas Evolution Go",
      "VALIDATION_ERROR",
      422,
    );
  }
  const instanceId = account.provider_config?.instanceId ?? "";
  if (!instanceId) {
    return jsonError("conta Evolution Go ainda não pareada", "CONFIG_MISSING", 422);
  }

  const deps = makeEngineDeps(admin, traceId);
  const { baseUrl } = await resolveGoServer(admin, deps.resolveSecret, account);
  const instanceToken = await deps.resolveSecret(
    `${account.credentials_ref}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`,
  );
  if (!instanceToken) {
    return jsonError("token da instância Go não cadastrado", "MISSING_API_KEY", 422);
  }

  const goTarget: IGoInstanceTarget = { baseUrl, instanceId };
  const contacts = await fetchGoContacts(instanceToken, deps, goTarget, traceId);

  const stats = await processContactsImport({
    storeId: account.store_id,
    contacts,
    db: makeContactsDb(admin),
    warn: (msg, fields) => log.warn(msg, fields),
  });

  const actorId = await resolveActorSellerId(admin, callerId);
  if (actorId) {
    await bestEffortAudit(admin, {
      store_id: account.store_id,
      actor_id: actorId,
      action: "whatsapp_contacts_imported",
      resource: "whatsapp_account",
      resource_id: account.id,
      after: { ...stats, accountId: account.id, traceId },
    });
  }
  log.info("contacts import processed", { accountId: account.id, ...stats });

  return json({ stats, traceId }, 200);
});
