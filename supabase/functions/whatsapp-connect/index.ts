/**
 * whatsapp-connect — Evolution instance management proxy (QR pairing flow).
 *
 * Staff-only POST (gateway verify_jwt + role gate). The browser NEVER talks
 * to the Evolution server nor sees the apikey: this function resolves the
 * key Vault-first ({credentials_ref}_API_KEY) and proxies the instance calls.
 *
 * Input (JSON body):
 *   { accountId, action: 'test'|'qr'|'state'|'logout'|'restart' }
 *   { accountId, action: 'test-message', to } — ad-hoc validation send
 *   { accountId, action: 'delete', dryRun? } — guarded hard delete (escopo A:
 *     only empty instances; dryRun returns the preflight without mutating)
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
import { buildWhatsAppEngine } from "../_shared/whatsapp/build.ts";
import { EVOLUTION_SECRET_SUFFIXES } from "../_shared/whatsapp/evolution/constants.ts";
import {
  createInstance,
  deleteInstance,
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
import { EVOLUTION_GO_SECRET_SUFFIXES, EVOLUTION_GO_DEFAULT_SUBSCRIBE } from "../_shared/whatsapp/evolution-go/constants.ts";
import {
  createGoInstance,
  connectGoInstance,
  getGoInstanceQr,
  getGoInstanceStatus,
  fetchGoOwnNumber,
  logoutGoInstance,
  restartGoInstance,
  deleteGoInstance,
  type IGoQrResult,
} from "../_shared/whatsapp/evolution-go/instance.ts";
import { resolveGoServer } from "./goServer.ts";
import {
  createOpenWaSession,
  startOpenWaSession,
  getOpenWaQr,
  getOpenWaStatus,
  stopOpenWaSession,
  restartOpenWaSession,
  deleteOpenWaSession,
  registerOpenWaWebhook,
  type IOpenWaQrResult,
} from "../_shared/whatsapp/openwa/instance.ts";
import { resolveOpenWaServer } from "./openwaServer.ts";

/** Client-side QR rotation window (Evolution rotates ~30-40s; we renew at 30). */
const QR_EXPIRES_IN_SECONDS = 30;

const ACTIONS = ["test", "qr", "state", "logout", "restart", "test-message", "delete"] as const;
type ConnectAction = (typeof ACTIONS)[number];

/**
 * Build the Evolution inbound-webhook URL, carrying the shared `?token=<T>` when
 * EVOLUTION_WEBHOOK_TOKEN is configured. The Evolution server echoes the full URL
 * (query included) back on every post, so the token authenticates the webhook
 * independently of the server's egress IP — surviving VPS IP changes that
 * silently break the legacy IP allowlist (the 2026-06-23 incident). When the
 * token is unset, the bare URL is returned and the webhook still authenticates
 * via the IP allowlist (see evolutionGate in whatsapp-webhook). Keep this in
 * sync with that gate's token name.
 */
async function buildEvolutionWebhookUrl(deps: IEngineDeps): Promise<string> {
  const base = `${requiredEnv("SUPABASE_URL")}/functions/v1/whatsapp-webhook/evolution`;
  const token = await deps.resolveSecret("EVOLUTION_WEBHOOK_TOKEN");
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

interface IAccountRow {
  id: string;
  store_id: string;
  label: string;
  provider: string;
  status: string;
  phone_number: string | null;
  credentials_ref: string;
  provider_config: Record<string, unknown> | null;
  go_server_id: string | null;
  openwa_server_id: string | null;
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
 * Self-heals a connected account whose own number wasn't resolvable at pairing
 * time. The Evolution owner/profile can lag the `open` transition by a few
 * seconds, and markConnected runs ONLY ONCE (on the not-connected→connected
 * edge) — so a number missed then would otherwise stay empty until a manual
 * logout+reconnect. This runs on steady-state polling, but ONLY while the number
 * is still missing: one extra fetchInstances per poll until it lands, then it
 * stops. Gating on the phone (not the profile name) bounds the extra call to
 * genuinely-empty accounts — some builds never return a profileName, so we must
 * not poll forever chasing it. No audit (no state change) and no status guard.
 */
async function backfillMissingProfile(
  admin: SupabaseClient,
  row: IAccountRow,
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId: string,
): Promise<{ phoneNumber?: string; profileName?: string }> {
  if ((row.phone_number ?? "").trim().length > 0) return {};
  let profile: { phoneNumber?: string; profileName?: string } = {};
  try {
    profile = await fetchInstanceProfile(apiKey, deps, target, traceId);
  } catch (_err) {
    // Best-effort — a profile lookup must never fail a status poll.
    return {};
  }
  const patch: Record<string, unknown> = {};
  if (profile.phoneNumber) patch.phone_number = profile.phoneNumber;
  if (profile.profileName && !row.provider_config?.profileName) {
    patch.provider_config = { ...(row.provider_config ?? {}), profileName: profile.profileName };
  }
  if (Object.keys(patch).length > 0) {
    await admin.from("whatsapp_accounts").update(patch).eq("id", row.id);
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

interface IFailoverDependent {
  id: string;
  label: string;
}

/**
 * Counts the rows that would FK-block a hard delete (drives the dryRun preflight
 * the UI shows). Fails CLOSED: a query error throws rather than coalescing the
 * null count to 0, which would otherwise make an instance look deletable when it
 * is not. The authoritative guard is the atomic RPC, not these counts.
 */
async function countLinkedData(
  admin: SupabaseClient,
  accountId: string,
): Promise<{ conversationCount: number; templateCount: number }> {
  const [conv, tpl] = await Promise.all([
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_account_id", accountId),
    admin
      .from("message_templates")
      .select("id", { count: "exact", head: true })
      .eq("whatsapp_account_id", accountId),
  ]);
  if (conv.error || tpl.error) {
    throw new HttpError(500, "Não foi possível verificar os vínculos da instância. Tente novamente.");
  }
  return { conversationCount: conv.count ?? 0, templateCount: tpl.count ?? 0 };
}

/**
 * Other accounts that fail over TO this one — display-only (the dryRun warning).
 * Best-effort: a query error yields [] (the atomic RPC reconciles dependents
 * regardless, so this list is cosmetic, never the source of truth).
 */
async function findFailoverDependents(
  admin: SupabaseClient,
  accountId: string,
): Promise<IFailoverDependent[]> {
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("id, label")
    .eq("failover_account_id", accountId);
  return (data ?? []).map((r) => ({ id: r.id as string, label: r.label as string }));
}

/**
 * Ad-hoc validation send through the real engine — NEVER persisted (no Inbox/metrics
 * pollution). Engine-agnostic (evolution / evolution-go).
 */
async function sendAdHocTestMessage(
  admin: SupabaseClient,
  deps: IEngineDeps,
  account: IAccountRow,
  engineName: "evolution" | "evolution-go",
  toRaw: unknown,
  actorId: string | null,
  ctx: { traceId: string },
): Promise<Response> {
  const digits = String(toRaw ?? "").replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 13) {
    return json(
      {
        error: "Informe o número com DDI e DDD (ex.: 5554999887766).",
        code: "VALIDATION_ERROR",
        traceId: ctx.traceId,
      },
      422,
    );
  }
  // For evolution-go registry accounts, base_url lives on the server (whatsapp_go_servers),
  // NOT in provider_config. Resolve it here so buildWhatsAppEngine receives a complete config.
  // NOTE: openwa is intentionally NOT handled here — its ad-hoc test-message
  // action is not wired yet (see the dedicated openwa branch below, which
  // does not list "test-message" in its switch and falls through to the
  // generic 422 "ação inválida").
  let providerConfig: Record<string, unknown> | null = account.provider_config;
  if (engineName === "evolution-go") {
    const { baseUrl } = await resolveGoServer(admin, deps.resolveSecret, account);
    providerConfig = { ...account.provider_config, baseUrl };
  }
  const engine = buildWhatsAppEngine({
    engine: engineName,
    accountId: account.id,
    providerConfig,
    credentialsRef: account.credentials_ref,
    deps,
  });
  const result = await engine.sendText({
    accountId: account.id,
    to: `+${digits}`,
    text: "✅ Mensagem de teste — GALLO Base Diesel. A conexão WhatsApp desta conta está funcionando.",
    traceId: ctx.traceId,
  });
  if (actorId) {
    await bestEffortAudit(admin, {
      store_id: account.store_id,
      actor_id: actorId,
      action: "whatsapp_test_message_sent",
      resource: "whatsapp_account",
      resource_id: account.id,
      after: {
        toMasked: `***${digits.slice(-4)}`,
        providerMessageId: result.providerMessageId,
      },
    });
  }
  return json({ ok: true, providerMessageId: result.providerMessageId, traceId: ctx.traceId }, 200);
}

servePost(async (req, ctx) => {
  const { callerId, admin, profile: caller } = await requireCaller(req, STAFF_ROLES);
  const body = (await parseJsonBody(req)) as {
    accountId?: string;
    action?: string;
    to?: string;
    dryRun?: boolean;
  };

  const action = body.action as ConnectAction;
  if (!body.accountId || !ACTIONS.includes(action)) {
    throw new HttpError(
      422,
      "accountId e action (test|qr|state|logout|restart|test-message|delete) são obrigatórios",
    );
  }

  const { data: row } = await admin
    .from("whatsapp_accounts")
    .select("id, store_id, label, provider, status, phone_number, credentials_ref, provider_config, go_server_id, openwa_server_id")
    .eq("id", body.accountId)
    .maybeSingle();
  if (!row) throw new HttpError(404, "Conta WhatsApp não encontrada");
  const account = row as IAccountRow;

  // Owner is cross-store; managers only manage their own store's accounts.
  if (caller.role !== "owner" && caller.store_id !== account.store_id) {
    throw new HttpError(403, "forbidden: account belongs to another store");
  }

  const deps = makeEngineDeps(admin, ctx.traceId);
  const actorId = await resolveActorSellerId(admin, callerId);

  // DELETE — runs before the Evolution-specific guards so a misconfigured
  // Evolution account (or a Meta account, which has no Evolution side) is still
  // deletable. Owner-only: the screen route is Owner-gated, so the edge mirrors
  // that intent (a manager must not delete via a direct POST). Guarded (escopo
  // A): only empty instances (0 conversas/templates), enforced atomically by the
  // delete_whatsapp_account RPC.
  if (action === "delete") {
    if (caller.role !== "owner") {
      throw new HttpError(403, "forbidden: apenas o dono pode excluir uma instância");
    }

    if (body.dryRun === true) {
      // Preflight for the UI. countLinkedData fails CLOSED (throws on a query
      // error); dependents are display-only. The RPC is the real guard.
      const { conversationCount, templateCount } = await countLinkedData(admin, account.id);
      const failoverDependents = await findFailoverDependents(admin, account.id);
      const deletable = conversationCount === 0 && templateCount === 0;
      return json(
        { deletable, conversationCount, templateCount, failoverDependents, traceId: ctx.traceId },
        200,
      );
    }

    // Atomic, guarded delete in ONE transaction: re-checks linked data, disables
    // dependents' failover, deletes the row — all-or-nothing. Runs BEFORE the
    // irreversible Evolution teardown so a race/FK failure leaves the live
    // instance intact (recoverable), never half-deleted.
    const { data: deleted, error: rpcError } = await admin.rpc("delete_whatsapp_account", {
      p_account_id: account.id,
    });
    if (rpcError) {
      if ((rpcError.message ?? "").includes("WHATSAPP_ACCOUNT_HAS_LINKED_DATA")) {
        const counts = await countLinkedData(admin, account.id).catch(() => ({
          conversationCount: 0,
          templateCount: 0,
        }));
        return json(
          {
            error: "Esta instância tem dados vinculados e não pode ser excluída.",
            code: "HAS_LINKED_DATA",
            ...counts,
            traceId: ctx.traceId,
          },
          422,
        );
      }
      throw new HttpError(500, `Falha ao excluir a conta: ${rpcError.message}`);
    }

    // The row is gone. Evolution teardown is now pure best-effort cleanup: a
    // failure here can only orphan a stray instance on the server (logged), never
    // half-delete the account. Catch everything; never fail the request.
    if (account.provider === "evolution") {
      const cfg = account.provider_config ?? {};
      const teardownTarget: IEvolutionInstanceTarget = {
        baseUrl: String(cfg.baseUrl ?? ""),
        instanceName: String(cfg.instanceName ?? ""),
      };
      if (teardownTarget.baseUrl && teardownTarget.instanceName) {
        try {
          const teardownKey = await deps.resolveSecret(
            `${account.credentials_ref}${EVOLUTION_SECRET_SUFFIXES.apiKey}`,
          );
          if (teardownKey) {
            await logoutInstance(teardownKey, deps, teardownTarget, ctx.traceId).catch(() => {});
            await deleteInstance(teardownKey, deps, teardownTarget, ctx.traceId);
          } else {
            ctx.log.warn("evolution teardown skipped: no apikey (instance may be orphaned)", {
              instanceName: teardownTarget.instanceName,
            });
          }
        } catch (err) {
          ctx.log.warn("evolution teardown failed (row already deleted; instance may be orphaned)", {
            instanceName: teardownTarget.instanceName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } else if (account.provider === "evolution-go") {
      try {
        const { baseUrl, globalKey } = await resolveGoServer(admin, deps.resolveSecret, account);
        const instanceId = String((account.provider_config ?? {}).instanceId ?? "");
        if (baseUrl && instanceId) {
          const goTarget = { baseUrl, instanceId };
          const token = await deps.resolveSecret(
            `${account.credentials_ref}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`,
          );
          // logout is instance-scoped (token); delete is an ADMIN endpoint (global key).
          if (token) await logoutGoInstance(token, deps, goTarget, ctx.traceId).catch(() => {});
          await deleteGoInstance(globalKey, deps, goTarget, ctx.traceId);
        }
      } catch (err) {
        ctx.log.warn("evolution-go teardown skipped/failed (instance may be orphaned)", {
          accountId: account.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else if (account.provider === "openwa") {
      try {
        const { baseUrl, globalKey } = await resolveOpenWaServer(admin, deps.resolveSecret, account);
        const sessionId = String((account.provider_config ?? {}).sessionId ?? "");
        if (baseUrl && sessionId) {
          await deleteOpenWaSession(globalKey, deps, { baseUrl, sessionId }, ctx.traceId);
        }
      } catch (err) {
        ctx.log.warn("openwa teardown skipped/failed (session may be orphaned)", {
          accountId: account.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Audit only when the RPC actually removed a row (false = concurrent delete
    // already happened) — avoids a duplicate whatsapp_account_deleted entry.
    if (deleted === true && actorId) {
      await bestEffortAudit(admin, {
        store_id: account.store_id,
        actor_id: actorId,
        action: "whatsapp_account_deleted",
        resource: "whatsapp_account",
        resource_id: account.id,
        before: {
          label: account.label,
          provider: account.provider,
          instanceName: account.provider_config?.instanceName ?? null,
          phoneNumber: account.phone_number,
        },
      });
    }
    return json({ ok: true, traceId: ctx.traceId }, 200);
  }

  if (
    account.provider !== "evolution" &&
    account.provider !== "evolution-go" &&
    account.provider !== "openwa"
  ) {
    throw new HttpError(422, "Conexão por QR é exclusiva de contas Evolution / Evolution Go / OpenWA");
  }

  // ===== Evolution Go (whatsmeow) — self-contained branch ===================
  // Auth diverges from v2: the GLOBAL key (_API_KEY) authorizes /instance/create
  // ONLY; every instance-scoped call uses the per-instance TOKEN (_INSTANCE_TOKEN),
  // captured from /instance/create on first pairing and persisted to the Vault.
  // Profile/phone capture is deferred to Phase 3 (status sync only here).
  if (account.provider === "evolution-go") {
    const goConfig = account.provider_config ?? {};
    const credsRef = account.credentials_ref ?? "";
    const instanceTokenSecretName = `${credsRef}${EVOLUTION_GO_SECRET_SUFFIXES.instanceToken}`;
    try {
      switch (action) {
        case "test-message":
          return await sendAdHocTestMessage(admin, deps, account, "evolution-go", body.to, actorId, ctx);

        case "qr": {
          const { baseUrl: goBaseUrl, globalKey } = await resolveGoServer(
            admin,
            deps.resolveSecret,
            account,
          );
          let instanceId = String(goConfig.instanceId ?? "");
          let instanceToken = await deps.resolveSecret(instanceTokenSecretName);
          if (!instanceId) {
            // First pairing: create the instance (global key), capture the token.
            const created = await createGoInstance(
              globalKey,
              deps,
              { baseUrl: goBaseUrl, name: account.id },
              ctx.traceId,
            );
            instanceId = created.instanceId;
            instanceToken = created.token;
            // Token-first: the per-instance token is issued ONCE by /instance/create
            // and cannot be re-fetched (a re-create 403s "already in use"). Persist it
            // to the Vault BEFORE the instanceId so a failure here leaves no local row
            // claiming an instance we have no token for. Both writes are checked so
            // they cannot diverge.
            const { error: secErr } = await admin.rpc("integration_secret_set", {
              p_name: instanceTokenSecretName,
              p_value: instanceToken,
              p_description: `Evolution Go instance token (conta ${account.id})`,
            });
            if (secErr) {
              throw new HttpError(
                500,
                `Falha ao gravar o token da instância no Vault: ${secErr.message}`,
              );
            }
            const { error: cfgErr } = await admin
              .from("whatsapp_accounts")
              .update({ provider_config: { ...goConfig, instanceId } })
              .eq("id", account.id);
            if (cfgErr) {
              throw new HttpError(
                500,
                `Falha ao persistir o instanceId da Evolution Go: ${cfgErr.message}`,
              );
            }
            // Full recovery from a half-create (token in Vault, instanceId not
            // persisted) via find-by-name is deferred to Phase 3 — out of scope here.
          }
          if (!instanceToken) {
            return json(
              {
                error: "Token da instância Evolution Go ausente — refaça o pareamento.",
                code: "MISSING_INSTANCE_TOKEN",
                traceId: ctx.traceId,
              },
              422,
            );
          }
          const goTarget = { baseUrl: goBaseUrl, instanceId };
          const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/whatsapp-webhook/evolution-go`;
          await connectGoInstance(instanceToken, deps, goTarget, webhookUrl, EVOLUTION_GO_DEFAULT_SUBSCRIBE, ctx.traceId);
          // An already-paired instance has no QR to issue: this Go build answers
          // GET /instance/qr with HTTP 400 + a "session"-ish message, which
          // mapEvolutionGoError classifies as PROVIDER_DISCONNECTED (503) — surfacing
          // a misleading "WhatsApp desconectado" on a perfectly connected number.
          // Trust the authoritative LoggedIn signal first (mirrors test/state) and
          // only ask for a QR when the session is NOT yet paired.
          const goStatus = await getGoInstanceStatus(instanceToken, deps, goTarget, ctx.traceId);
          const qr: IGoQrResult = goStatus.loggedIn
            ? { state: "open" }
            : await getGoInstanceQr(instanceToken, deps, goTarget, ctx.traceId);
          if (qr.state === "open") {
            if (account.status !== "connected") {
              await admin
                .from("whatsapp_accounts")
                .update({ status: "connected" })
                .eq("id", account.id);
              if (actorId) {
                await bestEffortAudit(admin, {
                  store_id: account.store_id,
                  actor_id: actorId,
                  action: "whatsapp_instance_connected",
                  resource: "whatsapp_account",
                  resource_id: account.id,
                  after: { provider: "evolution-go" },
                });
              }
            }
            return json({ state: "open", traceId: ctx.traceId }, 200);
          }
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

        case "test":
        case "state": {
          const { baseUrl: goBaseUrl, globalKey } = await resolveGoServer(admin, deps.resolveSecret, account);
          const instanceId = String(goConfig.instanceId ?? "");
          const instanceToken = await deps.resolveSecret(instanceTokenSecretName);
          if (!instanceId || !instanceToken) {
            await markDisconnected(admin, account, actorId, "close");
            return json({ state: "close", traceId: ctx.traceId }, 200);
          }
          const goTarget = { baseUrl: goBaseUrl, instanceId };
          const status = await getGoInstanceStatus(instanceToken, deps, goTarget, ctx.traceId);
          // "Connected" is just the websocket (a fresh Go instance reports it
          // ~1s after /instance/create, before any QR scan); "logged in" is the
          // real pairing signal. Gating on `connected` here false-positived the
          // pairing dialog to "Conectado" before the user could scan. While the
          // socket is up but unauthenticated we return "close" — the dialog poll
          // ignores it and keeps the QR (countdown + auto-renew) on screen.
          if (status.loggedIn) {
            // Self-heal the account's OWN number (the chip under its name in the
            // accounts list). Go's /instance/status carries no number; the owner
            // WID lives on the instance record (/instance/get → jid). Run it only
            // while the number is still missing — best-effort: the extra admin
            // call stops once the number lands and never fails the status poll.
            if ((account.phone_number ?? "").trim().length === 0) {
              try {
                const own = await fetchGoOwnNumber(globalKey, deps, goTarget, ctx.traceId);
                if (own.phoneNumber) {
                  await admin
                    .from("whatsapp_accounts")
                    .update({ phone_number: own.phoneNumber })
                    .eq("id", account.id);
                }
              } catch (_err) {
                // Best-effort — a profile lookup must never fail a status poll.
              }
            }
            if (account.status !== "connected") {
              await admin
                .from("whatsapp_accounts")
                .update({ status: "connected" })
                .eq("id", account.id);
              if (actorId) {
                await bestEffortAudit(admin, {
                  store_id: account.store_id,
                  actor_id: actorId,
                  action: "whatsapp_instance_connected",
                  resource: "whatsapp_account",
                  resource_id: account.id,
                  after: { provider: "evolution-go" },
                });
              }
            }
            return json({ state: "open", traceId: ctx.traceId }, 200);
          }
          await markDisconnected(admin, account, actorId, "close");
          return json({ state: "close", traceId: ctx.traceId }, 200);
        }

        case "logout": {
          const { baseUrl: goBaseUrl } = await resolveGoServer(admin, deps.resolveSecret, account);
          const instanceId = String(goConfig.instanceId ?? "");
          const instanceToken = await deps.resolveSecret(instanceTokenSecretName);
          if (instanceId && instanceToken) {
            await logoutGoInstance(instanceToken, deps, { baseUrl: goBaseUrl, instanceId }, ctx.traceId);
          }
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
          const { baseUrl: goBaseUrl } = await resolveGoServer(admin, deps.resolveSecret, account);
          const instanceId = String(goConfig.instanceId ?? "");
          const instanceToken = await deps.resolveSecret(instanceTokenSecretName);
          // Audit only when the restart actually reached the server — an unpaired
          // account (no instanceId/token) skips the Go call, so it must not claim
          // a restart that never ran.
          if (instanceId && instanceToken) {
            await restartGoInstance(instanceToken, deps, { baseUrl: goBaseUrl, instanceId }, ctx.traceId);
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
    throw new HttpError(422, "ação inválida");
  }

  // ===== OpenWA (self-hosted whatsapp-web.js) — self-contained branch =======
  // Auth is simpler than Go: ONE global key (registry) authorizes EVERY call —
  // admin (create/start/stop/delete/webhook) AND messaging alike (confirmed
  // live 2026-07-07). No per-instance token to mint/persist.
  if (account.provider === "openwa") {
    const owaConfig = account.provider_config ?? {};
    try {
      switch (action) {
        case "qr": {
          const { baseUrl: owaBaseUrl, globalKey } = await resolveOpenWaServer(
            admin,
            deps.resolveSecret,
            account,
          );
          let sessionId = String(owaConfig.sessionId ?? "");
          if (!sessionId) {
            // First pairing: create + start the session, persist the id, register
            // our webhook ONCE (the server has no upsert-by-url — re-registering
            // on every poll would pile up duplicate webhooks).
            const created = await createOpenWaSession(globalKey, deps, { baseUrl: owaBaseUrl }, account.label, ctx.traceId);
            sessionId = created.sessionId;
            const { error: cfgErr } = await admin
              .from("whatsapp_accounts")
              .update({ provider_config: { ...owaConfig, sessionId } })
              .eq("id", account.id);
            if (cfgErr) {
              throw new HttpError(500, `Falha ao persistir o sessionId da OpenWA: ${cfgErr.message}`);
            }
            const owaTarget = { baseUrl: owaBaseUrl, sessionId };
            const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/whatsapp-webhook/openwa`;
            await registerOpenWaWebhook(globalKey, deps, owaTarget, webhookUrl, ctx.traceId);
            await startOpenWaSession(globalKey, deps, owaTarget, ctx.traceId);
          }
          const owaTarget = { baseUrl: owaBaseUrl, sessionId };
          const status = await getOpenWaStatus(globalKey, deps, owaTarget, ctx.traceId);
          if (status.connected) {
            if (account.status !== "connected") {
              await admin
                .from("whatsapp_accounts")
                .update({
                  status: "connected",
                  ...(status.phoneNumber ? { phone_number: status.phoneNumber } : {}),
                })
                .eq("id", account.id);
              if (actorId) {
                await bestEffortAudit(admin, {
                  store_id: account.store_id,
                  actor_id: actorId,
                  action: "whatsapp_instance_connected",
                  resource: "whatsapp_account",
                  resource_id: account.id,
                  after: { provider: "openwa" },
                });
              }
            }
            return json({ state: "open", traceId: ctx.traceId }, 200);
          }
          await markDisconnected(admin, account, actorId, "close");
          const qr: IOpenWaQrResult = await getOpenWaQr(globalKey, deps, owaTarget, ctx.traceId);
          return json(
            {
              state: qr.state,
              qrBase64: qr.qrBase64,
              expiresInSeconds: QR_EXPIRES_IN_SECONDS,
              traceId: ctx.traceId,
            },
            200,
          );
        }

        case "test":
        case "state": {
          const { baseUrl: owaBaseUrl, globalKey } = await resolveOpenWaServer(admin, deps.resolveSecret, account);
          const sessionId = String(owaConfig.sessionId ?? "");
          if (!sessionId) {
            await markDisconnected(admin, account, actorId, "close");
            return json({ state: "close", traceId: ctx.traceId }, 200);
          }
          const owaTarget = { baseUrl: owaBaseUrl, sessionId };
          const status = await getOpenWaStatus(globalKey, deps, owaTarget, ctx.traceId);
          if (status.connected) {
            if ((account.phone_number ?? "").trim().length === 0 && status.phoneNumber) {
              await admin
                .from("whatsapp_accounts")
                .update({ phone_number: status.phoneNumber })
                .eq("id", account.id);
            }
            if (account.status !== "connected") {
              await admin.from("whatsapp_accounts").update({ status: "connected" }).eq("id", account.id);
              if (actorId) {
                await bestEffortAudit(admin, {
                  store_id: account.store_id,
                  actor_id: actorId,
                  action: "whatsapp_instance_connected",
                  resource: "whatsapp_account",
                  resource_id: account.id,
                  after: { provider: "openwa" },
                });
              }
            }
            return json({ state: "open", traceId: ctx.traceId }, 200);
          }
          await markDisconnected(admin, account, actorId, "close");
          return json({ state: "close", traceId: ctx.traceId }, 200);
        }

        case "logout": {
          const { baseUrl: owaBaseUrl, globalKey } = await resolveOpenWaServer(admin, deps.resolveSecret, account);
          const sessionId = String(owaConfig.sessionId ?? "");
          if (sessionId) {
            await stopOpenWaSession(globalKey, deps, { baseUrl: owaBaseUrl, sessionId }, ctx.traceId);
          }
          await admin.from("whatsapp_accounts").update({ status: "disconnected" }).eq("id", account.id);
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
          const { baseUrl: owaBaseUrl, globalKey } = await resolveOpenWaServer(admin, deps.resolveSecret, account);
          const sessionId = String(owaConfig.sessionId ?? "");
          if (sessionId) {
            await restartOpenWaSession(globalKey, deps, { baseUrl: owaBaseUrl, sessionId }, ctx.traceId);
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
    throw new HttpError(422, "ação inválida");
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

  try {
    switch (action) {
      case "test": {
        const result = await getConnectionState(apiKey, deps, target, ctx.traceId);
        // Sync the stored status with reality in both directions — the card
        // badge must not say "Conectada" for a session that is actually down.
        // Already-connected rows skip markConnected (no profile re-fetch):
        // this path runs on the 30s page polling.
        if (result.state === "open") {
          if (account.status !== "connected") {
            await markConnected(admin, account, apiKey, deps, target, actorId, ctx.traceId);
          } else {
            // Already connected: self-heal a number that wasn't ready at pairing.
            await backfillMissingProfile(admin, account, apiKey, deps, target, ctx.traceId);
          }
          // Self-heal the webhook registration on every healthy poll: re-point the
          // instance at our webhook (carrying the auth token). Mirrors evolution-go,
          // which re-arms on every connect — so a server-side webhook wipe (e.g. an
          // Evolution restart that drops the config, the 2026-06-23 incident) recovers
          // on the next poll instead of needing a manual reconnect. Best-effort: a
          // failure here must never break the status poll.
          try {
            await setInstanceWebhook(
              apiKey,
              deps,
              target,
              await buildEvolutionWebhookUrl(deps),
              ctx.traceId,
            );
          } catch (err) {
            ctx.log.warn("evolution webhook self-heal failed (non-fatal)", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else {
          await markDisconnected(admin, account, actorId, result.state);
        }
        return json({ ok: true, state: result.state, traceId: ctx.traceId }, 200);
      }

      case "qr": {
        // Multi-instance: ensure the instance exists on the server before
        // pairing. Idempotent — an existing instance ("already in use") is a
        // no-op; a real create failure propagates to the outer catch.
        await createInstance(apiKey, deps, target, ctx.traceId);
        // Point the instance at our unified webhook before pairing (idempotent;
        // best-effort — a failure here must not block the QR).
        const webhookUrl = await buildEvolutionWebhookUrl(deps);
        try {
          await setInstanceWebhook(apiKey, deps, target, webhookUrl, ctx.traceId);
          if (actorId) {
            await bestEffortAudit(admin, {
              store_id: account.store_id,
              actor_id: actorId,
              action: "whatsapp_instance_webhook_set",
              resource: "whatsapp_account",
              resource_id: account.id,
              // Strip the `?token=` so the shared webhook token never lands in
              // audit_logs (broadly readable). The token's only home is the Vault.
              after: { url: webhookUrl.split("?")[0] },
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
          // Profile fetch only on the not-connected→connected transition (the
          // pairing moment); steady-state polling answers without extra calls.
          if (account.status !== "connected") {
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
          // Already connected: self-heal a profile captured empty at pairing time.
          const profile = await backfillMissingProfile(
            admin,
            account,
            apiKey,
            deps,
            target,
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

      case "test-message": {
        return await sendAdHocTestMessage(
          admin,
          deps,
          account,
          account.provider as "evolution" | "evolution-go",
          body.to,
          actorId,
          ctx,
        );
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
