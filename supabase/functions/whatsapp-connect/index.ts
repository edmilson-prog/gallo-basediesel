/**
 * whatsapp-connect — Evolution instance management proxy (QR pairing flow).
 *
 * Staff-only POST (gateway verify_jwt + role gate). The browser NEVER talks
 * to the Evolution server nor sees the apikey: this function resolves the
 * key Vault-first ({credentials_ref}_API_KEY) and proxies the instance calls.
 *
 * Input (JSON body): { accountId, action: 'test'|'qr'|'state'|'logout'|'restart' }
 *
 * Side effects: updates whatsapp_accounts (status/phone/profile) and audits
 * connect/disconnect/restart/webhook-set. Errors keep the house `{ error }`
 * contract plus a machine `code` for frontend UX branching.
 *
 * Spec: docs/superpowers/specs/2026-06-11-whatsapp-evolution-qr-connect-design.md
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller, STAFF_ROLES } from "../_shared/auth.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { EVOLUTION_SECRET_SUFFIXES } from "../_shared/whatsapp/evolution/constants.ts";
import {
  fetchInstanceProfile,
  getConnectionState,
  getInstanceQr,
  logoutInstance,
  restartInstance,
  setInstanceWebhook,
  type IEvolutionInstanceTarget,
} from "../_shared/whatsapp/evolution/instance.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";
import type { IEngineDeps, IIntegrationLogEntry } from "../_shared/whatsapp/types.ts";

/** Client-side QR rotation window (Evolution rotates ~30-40s; we renew at 30). */
const QR_EXPIRES_IN_SECONDS = 30;

const ACTIONS = ["test", "qr", "state", "logout", "restart"] as const;
type ConnectAction = (typeof ACTIONS)[number];

interface IAccountRow {
  id: string;
  store_id: string;
  provider: string;
  status: string;
  phone_number: string | null;
  credentials_ref: string;
  provider_config: Record<string, unknown> | null;
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

/** Marks the account connected, capturing number/profile when resolvable. */
async function markConnected(
  admin: SupabaseClient,
  row: IAccountRow,
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  actorId: string | null,
  traceId: string,
): Promise<{ phoneNumber?: string; profileName?: string }> {
  let profile: { phoneNumber?: string; profileName?: string } = {};
  try {
    profile = await fetchInstanceProfile(apiKey, deps, target, traceId);
  } catch (_err) {
    // Profile resolution is best-effort — connection state is what matters.
  }
  const { data: updated } = await admin
    .from("whatsapp_accounts")
    .update({
      status: "connected",
      ...(profile.phoneNumber ? { phone_number: profile.phoneNumber } : {}),
      provider_config: {
        ...(row.provider_config ?? {}),
        ...(profile.profileName ? { profileName: profile.profileName } : {}),
      },
    })
    .eq("id", row.id)
    .neq("status", "connected")
    .select("id");
  if ((updated?.length ?? 0) > 0 && actorId) {
    await bestEffortAudit(admin, {
      store_id: row.store_id,
      actor_id: actorId,
      action: "whatsapp_instance_connected",
      resource: "whatsapp_account",
      resource_id: row.id,
      after: { state: "open", ...profile },
    });
  }
  return profile;
}

/**
 * Flips a stale `connected` row to disconnected when the live Evolution state
 * says the session is not open (seed rows, phone unlinked outside the app…).
 * Conditional update + audit guard: concurrent polls won't double-audit.
 */
async function markDisconnected(
  admin: SupabaseClient,
  row: IAccountRow,
  actorId: string | null,
  liveState: string,
): Promise<void> {
  const { data: updated } = await admin
    .from("whatsapp_accounts")
    .update({ status: "disconnected" })
    .eq("id", row.id)
    .eq("status", "connected")
    .select("id");
  if ((updated?.length ?? 0) > 0 && actorId) {
    await bestEffortAudit(admin, {
      store_id: row.store_id,
      actor_id: actorId,
      action: "whatsapp_instance_disconnected",
      resource: "whatsapp_account",
      resource_id: row.id,
      after: { state: liveState, reason: "state_sync" },
    });
  }
}

servePost(async (req, ctx) => {
  const { callerId, admin, profile: caller } = await requireCaller(req, STAFF_ROLES);
  const body = (await parseJsonBody(req)) as { accountId?: string; action?: string };

  const action = body.action as ConnectAction;
  if (!body.accountId || !ACTIONS.includes(action)) {
    throw new HttpError(422, "accountId e action (test|qr|state|logout|restart) são obrigatórios");
  }

  const { data: row } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, provider, status, phone_number, credentials_ref, provider_config")
    .eq("id", body.accountId)
    .maybeSingle();
  if (!row) throw new HttpError(404, "Conta WhatsApp não encontrada");
  const account = row as IAccountRow;

  if (account.provider !== "evolution") {
    throw new HttpError(422, "Conexão por QR é exclusiva de contas Evolution");
  }
  // Owner is cross-store; managers only manage their own store's accounts.
  if (caller.role !== "owner" && caller.store_id !== account.store_id) {
    throw new HttpError(403, "forbidden: account belongs to another store");
  }

  const config = account.provider_config ?? {};
  const target: IEvolutionInstanceTarget = {
    baseUrl: String(config.baseUrl ?? ""),
    instanceName: String(config.instanceName ?? ""),
  };
  if (!target.baseUrl || !target.instanceName) {
    return json(
      {
        error: "Configure a URL do servidor e a instância antes de conectar.",
        code: "CONFIG_MISSING",
        traceId: ctx.traceId,
      },
      422,
    );
  }

  const deps = makeEngineDeps(admin, ctx.traceId);
  const apiKey = await deps.resolveSecret(
    `${account.credentials_ref}${EVOLUTION_SECRET_SUFFIXES.apiKey}`,
  );
  if (!apiKey) {
    return json(
      {
        error: "API key da Evolution não configurada — salve a chave no cofre primeiro.",
        code: "MISSING_API_KEY",
        traceId: ctx.traceId,
      },
      422,
    );
  }

  const actorId = await resolveActorSellerId(admin, callerId);

  try {
    switch (action) {
      case "test": {
        const result = await getConnectionState(apiKey, deps, target, ctx.traceId);
        // Sync the stored status with reality in both directions — the card
        // badge must not say "Conectada" for a session that is actually down.
        if (result.state === "open") {
          await markConnected(admin, account, apiKey, deps, target, actorId, ctx.traceId);
        } else {
          await markDisconnected(admin, account, actorId, result.state);
        }
        return json({ ok: true, state: result.state, traceId: ctx.traceId }, 200);
      }

      case "qr": {
        // Point the instance at our unified webhook before pairing (idempotent;
        // best-effort — a failure here must not block the QR).
        const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/whatsapp-webhook/evolution`;
        try {
          await setInstanceWebhook(apiKey, deps, target, webhookUrl, ctx.traceId);
          if (actorId) {
            await bestEffortAudit(admin, {
              store_id: account.store_id,
              actor_id: actorId,
              action: "whatsapp_instance_webhook_set",
              resource: "whatsapp_account",
              resource_id: account.id,
              after: { url: webhookUrl },
            });
          }
        } catch (err) {
          ctx.log.warn("webhook set failed (continuing to QR)", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        const qr = await getInstanceQr(apiKey, deps, target, ctx.traceId);
        if (qr.state === "open") {
          const profile = await markConnected(
            admin,
            account,
            apiKey,
            deps,
            target,
            actorId,
            ctx.traceId,
          );
          return json({ state: "open", ...profile, traceId: ctx.traceId }, 200);
        }
        // A QR being issued means the session is NOT open — clear stale status.
        await markDisconnected(admin, account, actorId, "close");
        return json(
          {
            state: "qr",
            qrBase64: qr.qrBase64,
            pairingCode: qr.pairingCode,
            expiresInSeconds: QR_EXPIRES_IN_SECONDS,
            traceId: ctx.traceId,
          },
          200,
        );
      }

      case "state": {
        const result = await getConnectionState(apiKey, deps, target, ctx.traceId);
        if (result.state === "open") {
          const profile = await markConnected(
            admin,
            account,
            apiKey,
            deps,
            target,
            actorId,
            ctx.traceId,
          );
          return json({ state: "open", ...profile, traceId: ctx.traceId }, 200);
        }
        // `close` during pairing is normal (pre-scan), but it also means the
        // stored status must not read `connected` — keep the row truthful.
        await markDisconnected(admin, account, actorId, result.state);
        return json({ state: result.state, traceId: ctx.traceId }, 200);
      }

      case "logout": {
        await logoutInstance(apiKey, deps, target, ctx.traceId);
        await admin
          .from("whatsapp_accounts")
          .update({ status: "disconnected" })
          .eq("id", account.id);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_disconnected",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { state: "close" },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }

      case "restart": {
        await restartInstance(apiKey, deps, target, ctx.traceId);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_restarted",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: {},
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
    }
  } catch (err) {
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("connect action rejected", { action, code: err.code, message: err.message });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
  // Unreachable — the switch above covers every validated action.
  throw new HttpError(422, "ação inválida");
});
