/**
 * waha-connect — WAHA session management (QR pairing flow). Owner-only POST.
 *
 * FULLY ISOLATED from the shared Meta/Evolution/Evolution Go pipeline: does
 * NOT import `_shared/whatsapp/build.ts`, `_shared/whatsapp/webhook/core.ts`
 * or `_shared/whatsapp/send/core.ts`. Only generic platform primitives
 * (_shared/auth.ts, _shared/http.ts, _shared/serve.ts, _shared/secrets.ts,
 * _shared/audit.ts) and the self-contained `_shared/whatsapp/waha/*` engine
 * (mirrored from src/providers/whatsapp/waha/) are used.
 *
 * Input (JSON body):
 *   { storeId, label, purpose?, wahaServerId?, action: 'create' }
 *   { accountId, action: 'qr'|'state'|'logout'|'restart'|'delete' }
 *
 * Spec: docs/superpowers/specs/2026-07-10-waha-whatsapp-integration-design.md
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.107.0";
import { bestEffortAudit } from "../_shared/audit.ts";
import { requireCaller } from "../_shared/auth.ts";
import { requiredEnv } from "../_shared/env.ts";
import { HttpError, json, parseJsonBody } from "../_shared/http.ts";
import { createSecretResolver } from "../_shared/secrets.ts";
import { servePost } from "../_shared/serve.ts";
import { generateWahaSessionName } from "../_shared/whatsapp/waha/sessionName.ts";
import {
  createWahaSession,
  deleteWahaSession,
  getWahaAccountStatus,
  getWahaSessionQrPng,
  logoutWahaSession,
  restartWahaSession,
} from "../_shared/whatsapp/waha/session.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";
import { findSoleWahaServer, resolveWahaServer } from "./wahaServer.ts";

const ACTIONS = ["create", "qr", "state", "logout", "restart", "delete"] as const;
type ConnectAction = (typeof ACTIONS)[number];

const DEFAULT_CAPABILITIES = {
  supportsTemplatesHsm: false,
  supportsInteractiveButtons: false,
  supportsLists: false,
  supportsReactions: false,
  supportsProactiveMessaging: true,
  supportsReadStatusInGroups: false,
};

interface IAccountRow {
  id: string;
  store_id: string;
  label: string;
  status: string;
  phone_number: string | null;
  provider_config: Record<string, unknown> | null;
  waha_server_id: string | null;
}

/** Audit actor must reference sellers.id (audit FK) — resolve from the caller. Mirrors whatsapp-connect/index.ts. */
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

servePost(async (req, ctx) => {
  const { callerId, admin } = await requireCaller(req, ["owner"]);
  const body = (await parseJsonBody(req)) as {
    accountId?: string;
    storeId?: string;
    label?: string;
    purpose?: string;
    wahaServerId?: string;
    action?: string;
  };

  const action = body.action as ConnectAction;
  if (!action || !ACTIONS.includes(action)) {
    throw new HttpError(422, "action (create|qr|state|logout|restart|delete) é obrigatório");
  }

  const fetchFn = globalThis.fetch;
  const resolveSecret = createSecretResolver(admin);
  const actorId = await resolveActorSellerId(admin, callerId);

  if (action === "create") {
    if (!body.storeId || !body.label) {
      throw new HttpError(422, "storeId e label são obrigatórios");
    }
    let serverId = body.wahaServerId;
    if (!serverId) {
      const sole = await findSoleWahaServer(admin);
      if (!sole) {
        throw new HttpError(422, "Cadastre (ou escolha) um servidor WAHA em Configurações → Chaves antes de criar uma sessão.");
      }
      serverId = sole.id;
    }
    const { data: existingRows } = await admin
      .from("whatsapp_accounts")
      .select("provider_config")
      .eq("provider", "waha");
    const existingNames = (existingRows ?? [])
      .map((r) => (r.provider_config as Record<string, unknown> | null)?.sessionName as string | undefined)
      .filter((n): n is string => Boolean(n));
    const sessionName = generateWahaSessionName(body.label, existingNames);

    const { data: server, error: serverErr } = await admin
      .from("waha_servers")
      .select("base_url, api_key_ref, webhook_hmac_ref")
      .eq("id", serverId)
      .maybeSingle();
    if (serverErr || !server) throw new HttpError(422, "Servidor WAHA não encontrado.");
    const baseUrl = String(server.base_url ?? "").replace(/\/+$/, "");
    const apiKey = await resolveSecret(String(server.api_key_ref ?? ""));
    if (!apiKey) throw new HttpError(422, "Chave da API do servidor WAHA não definida.");
    if (!server.webhook_hmac_ref) {
      throw new HttpError(422, "Configure o segredo HMAC do webhook deste servidor antes de criar uma sessão.");
    }
    const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
    if (!hmacKey) throw new HttpError(422, "Segredo HMAC do webhook WAHA não definido no Vault.");

    const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/waha-webhook`;
    try {
      await createWahaSession(apiKey, fetchFn, { baseUrl, sessionName, webhookUrl, hmacKey });
    } catch (err) {
      if (err instanceof WhatsAppProviderError) {
        return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
      }
      throw err;
    }

    const { data: inserted, error: insertErr } = await admin
      .from("whatsapp_accounts")
      .insert({
        id: crypto.randomUUID(),
        store_id: body.storeId,
        label: body.label,
        phone_number: "",
        provider: "waha",
        credentials_ref: String(server.api_key_ref ?? ""),
        status: "pending",
        capabilities: DEFAULT_CAPABILITIES,
        provider_config: { sessionName },
        purpose: body.purpose ?? "atendimento",
        current_state: "healthy",
        failover_policy: "disabled",
        is_failover_active: false,
        alerts_muted: false,
        waha_server_id: serverId,
      })
      .select("id")
      .single();
    if (insertErr) throw new HttpError(500, `Falha ao salvar a sessão WAHA: ${insertErr.message}`);

    if (actorId) {
      await bestEffortAudit(admin, {
        store_id: body.storeId,
        actor_id: actorId,
        action: "whatsapp_instance_created",
        resource: "whatsapp_account",
        resource_id: inserted.id as string,
        after: { provider: "waha", sessionName },
      });
    }
    return json({ id: inserted.id, sessionName, traceId: ctx.traceId }, 200);
  }

  if (!body.accountId) throw new HttpError(422, "accountId é obrigatório");
  const { data: row } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, label, status, phone_number, provider_config, waha_server_id")
    .eq("id", body.accountId)
    .eq("provider", "waha")
    .maybeSingle();
  if (!row) throw new HttpError(404, "Sessão WAHA não encontrada");
  const account = row as IAccountRow;
  const sessionName = String(account.provider_config?.sessionName ?? "");
  if (!sessionName) throw new HttpError(422, "Sessão WAHA sem sessionName configurado");

  try {
    const { baseUrl, apiKey } = await resolveWahaServer(admin, resolveSecret, account);
    const target = { baseUrl, sessionName };

    switch (action) {
      case "qr": {
        const qrBase64 = await getWahaSessionQrPng(apiKey, fetchFn, target);
        return json({ state: "qr", qrBase64, traceId: ctx.traceId }, 200);
      }
      case "state": {
        const { accountStatus, phoneNumber } = await getWahaAccountStatus(apiKey, fetchFn, target);
        const patch: Record<string, unknown> = { status: accountStatus };
        if (phoneNumber && !account.phone_number) patch.phone_number = phoneNumber;
        const wasConnected = account.status === "connected";
        await admin.from("whatsapp_accounts").update(patch).eq("id", account.id);
        if (accountStatus === "connected" && !wasConnected && actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_connected",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { provider: "waha" },
          });
        }
        return json({ state: accountStatus, phoneNumber, traceId: ctx.traceId }, 200);
      }
      case "logout": {
        await logoutWahaSession(apiKey, fetchFn, target);
        await admin.from("whatsapp_accounts").update({ status: "disconnected" }).eq("id", account.id);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_disconnected",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { provider: "waha" },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
      case "restart": {
        await restartWahaSession(apiKey, fetchFn, target);
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
      case "delete": {
        const { data: deleted, error: rpcError } = await admin.rpc("delete_whatsapp_account", {
          p_account_id: account.id,
        });
        if (rpcError) {
          if ((rpcError.message ?? "").includes("WHATSAPP_ACCOUNT_HAS_LINKED_DATA")) {
            return json(
              { error: "Esta sessão tem conversas vinculadas e não pode ser excluída.", code: "HAS_LINKED_DATA", traceId: ctx.traceId },
              422,
            );
          }
          throw new HttpError(500, `Falha ao excluir a sessão: ${rpcError.message}`);
        }
        try {
          await deleteWahaSession(apiKey, fetchFn, target);
        } catch (err) {
          ctx.log.warn("waha session teardown failed (row already deleted; session may be orphaned)", {
            sessionName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        if (deleted === true && actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_account_deleted",
            resource: "whatsapp_account",
            resource_id: account.id,
            before: { label: account.label, provider: "waha", sessionName },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
      default:
        throw new HttpError(422, "ação inválida");
    }
  } catch (err) {
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("waha-connect action rejected", { action, code: err.code, message: err.message });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
});
