/**
 * whatsapp-contacts-name-backfill — heal customers auto-created named after
 * their bare phone number, before the webhook learned to read the contact's
 * pushName (the forward fix shipped separately).
 *
 * Pulls the Evolution instance's stored contacts (phone + profile name) once,
 * pairs them by digits-only phone with the store's placeholder customers
 * (full_name without a letter) and renames the matches. A human-entered name
 * (any letter) is never touched.
 *
 * Two modes (default dry-run — apply must be explicit):
 *   • dry-run: returns counts + a sample of the planned renames, writes nothing.
 *   • apply:   performs the renames (full_name) in gentle parallel chunks.
 *
 * Idempotent: a healed customer gains a letter and stops being a placeholder,
 * so a re-run skips it.
 *
 * Auth: an operational admin key (`x-admin-key` == CONTACTS_BACKFILL_ADMIN_KEY).
 * Deployed with `--no-verify-jwt` so the header is the gate. Service_role wires
 * the DB; the Evolution API key resolves Vault-first via _shared/secrets.
 *
 * POST { accountId?, mode?: "dry-run" | "apply", limit? }
 *   → { dryRun, accountId, contactsFound, customersLoaded, placeholdersFound,
 *       matched, applied?, failed?, truncated, sample, traceId }
 */

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import {
  hasLetter,
  isPlaceholderName,
  planContactNameBackfill,
  type IBackfillCustomer,
} from "../_shared/whatsapp/contactsNameBackfill/core.ts";
import {
  findContacts,
  findContactsFromChats,
  type IEvolutionInstanceTarget,
} from "../_shared/whatsapp/evolution/instance.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 5000;
const SAMPLE_SIZE = 25;
/** Apply renames in gentle parallel chunks to avoid a long serial write. */
const APPLY_CHUNK = 25;

interface IAccountRow {
  id: string;
  store_id: string;
  provider: "meta" | "evolution";
  credentials_ref: string;
  provider_config: { baseUrl?: string; instanceName?: string } | null;
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

async function resolveAccount(
  admin: SupabaseClient,
  accountId: string | undefined,
): Promise<IAccountRow | null> {
  const columns = "id, store_id, provider, credentials_ref, provider_config";
  if (accountId) {
    const { data } = await admin
      .from("whatsapp_accounts")
      .select(columns)
      .eq("id", accountId)
      .maybeSingle<IAccountRow>();
    return data ?? null;
  }
  // No id: pick the single non-disconnected Evolution account (the common case).
  const { data } = await admin
    .from("whatsapp_accounts")
    .select(columns)
    .eq("provider", "evolution")
    .neq("status", "disconnected")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<IAccountRow>();
  return data ?? null;
}

servePost(async (req, { log, traceId }) => {
  const expectedKey = Deno.env.get("CONTACTS_BACKFILL_ADMIN_KEY");
  const providedKey = req.headers.get("x-admin-key");
  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    throw new HttpError(401, "unauthorized");
  }

  const body = await parseJsonBody(req);
  const accountId = typeof body.accountId === "string" ? body.accountId : undefined;
  const mode = body.mode === "apply" ? "apply" : "dry-run";
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, typeof body.limit === "number" ? Math.floor(body.limit) : DEFAULT_LIMIT),
  );

  const admin = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const account = await resolveAccount(admin, accountId);
  if (!account) throw new HttpError(404, "no WhatsApp account found");
  if (account.provider !== "evolution") {
    return json({ error: "backfill disponível apenas para contas Evolution", code: "VALIDATION_ERROR" }, 422);
  }
  const baseUrl = account.provider_config?.baseUrl;
  const instanceName = account.provider_config?.instanceName;
  if (!baseUrl || !instanceName) {
    return json({ error: "configure URL base e instância antes do backfill", code: "CONFIG_MISSING" }, 422);
  }

  const deps = makeEngineDeps(admin, traceId);
  const apiKey = await deps.resolveSecret(`${account.credentials_ref}_API_KEY`);
  if (!apiKey) {
    return json({ error: "chave de API da instância não cadastrada", code: "MISSING_API_KEY" }, 422);
  }

  const target: IEvolutionInstanceTarget = { baseUrl, instanceName };

  // 1) Pull names from BOTH the Contact table and the chat list. On builds that
  //    don't persist the Contact table, findContacts is nearly empty while the
  //    chat list (the history-import source) covers everyone — and each chat
  //    usually carries the counterpart's pushName. Contact-table entries come
  //    last so their (more curated) name wins on a duplicate phone.
  const fromChats = await findContactsFromChats(apiKey, deps, target, traceId);
  const fromTable = await findContacts(apiKey, deps, target, traceId);
  const contacts = [...fromChats, ...fromTable];
  const namedContacts = contacts.filter((c) => hasLetter(c.name)).length;

  // 2) Load the store's customers that HAVE a phone. The placeholder test lives
  //    in the core (single source of truth) — pass everything, let it filter.
  const { data: customerRows, error } = await admin
    .from("customers")
    .select("id, phone, full_name")
    .eq("store_id", account.store_id)
    .not("phone", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`select customers: ${error.message}`);

  const customers: IBackfillCustomer[] = (customerRows ?? []).map((r) => ({
    id: r.id as string,
    phone: (r.phone as string | null) ?? "",
    fullName: (r.full_name as string | null) ?? "",
  }));
  // No silent caps: a full page means there may be more customers than we loaded.
  const truncated = customers.length >= limit;
  if (truncated) {
    log.warn("contacts name backfill: customer list truncated at limit", {
      limit,
      storeId: account.store_id,
    });
  }
  const placeholdersFound = customers.filter((c) => isPlaceholderName(c.fullName)).length;

  // 3) Plan the renames (pure).
  const renames = planContactNameBackfill(contacts, customers);
  const sample = renames.slice(0, SAMPLE_SIZE).map((r) => ({
    customerId: r.customerId,
    phone: r.phone,
    from: r.currentName,
    to: r.newName,
  }));

  const summary = {
    accountId: account.id,
    contactsFromChats: fromChats.length,
    contactsFromTable: fromTable.length,
    namedContacts,
    customersLoaded: customers.length,
    placeholdersFound,
    matched: renames.length,
    truncated,
  };

  if (mode === "dry-run") {
    log.info("contacts name backfill dry-run", summary);
    return json({ dryRun: true, ...summary, sample, traceId }, 200);
  }

  // 4) APPLY — rename in gentle parallel chunks (each guarded by store_id).
  let applied = 0;
  let failed = 0;
  for (let i = 0; i < renames.length; i += APPLY_CHUNK) {
    const chunk = renames.slice(i, i + APPLY_CHUNK);
    const results = await Promise.all(
      chunk.map(async (r) => {
        const { error: upErr } = await admin
          .from("customers")
          .update({ full_name: r.newName })
          .eq("id", r.customerId)
          .eq("store_id", account.store_id);
        return upErr ? upErr.message : null;
      }),
    );
    for (const upErr of results) {
      if (upErr) {
        failed += 1;
        log.warn("contacts name backfill: update failed", { detail: upErr });
      } else {
        applied += 1;
      }
    }
  }

  log.info("contacts name backfill applied", { ...summary, applied, failed });
  return json({ dryRun: false, ...summary, applied, failed, sample, traceId }, 200);
});
