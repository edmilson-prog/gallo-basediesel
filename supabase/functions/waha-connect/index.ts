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
 *   { storeId, label, purpose?, wahaServerId?, sessionConfig?, action: 'create' }
 *   { wahaServerId, action: 'ping' }
 *   { storeId, dryRun?, cursor?, action: 'backfillLids' }
 *   { accountId, action: 'qr'|'state'|'logout'|'restart'|'delete' }
 *   { accountId, action: 'updateConfig', sessionConfig }
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
import { wahaStateToAccountStatus } from "../_shared/whatsapp/waha/constants.ts";
import { getWahaContactName, resolveWahaLid } from "../_shared/whatsapp/waha/contacts.ts";
import { generateWahaSessionName } from "../_shared/whatsapp/waha/sessionName.ts";
import {
  createWahaSession,
  deleteWahaSession,
  getWahaSessionQrPng,
  getWahaSessionStatus,
  logoutWahaSession,
  pingWahaServer,
  restartWahaSession,
  updateWahaSessionConfig,
  type IWahaSessionSettings,
} from "../_shared/whatsapp/waha/session.ts";
import { WhatsAppProviderError } from "../_shared/whatsapp/errors.ts";
import { findSoleWahaServer, resolveWahaServer, resolveWahaServerForPing } from "./wahaServer.ts";

const ACTIONS = [
  "create",
  "ping",
  "backfillLids",
  "qr",
  "state",
  "logout",
  "restart",
  "delete",
  "updateConfig",
] as const;
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
    sessionConfig?: IWahaSessionSettings;
    dryRun?: boolean;
    cursor?: string;
    action?: string;
  };

  const action = body.action as ConnectAction;
  if (!action || !ACTIONS.includes(action)) {
    throw new HttpError(
      422,
      "action (create|ping|backfillLids|qr|state|logout|restart|delete|updateConfig) é obrigatório",
    );
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
        throw new HttpError(
          422,
          "Cadastre (ou escolha) um servidor WAHA em Configurações → Chaves antes de criar uma sessão.",
        );
      }
      serverId = sole.id;
    }
    const { data: existingRows } = await admin
      .from("whatsapp_accounts")
      .select("provider_config")
      .eq("provider", "waha");
    const existingNames = (existingRows ?? [])
      .map(
        (r) =>
          (r.provider_config as Record<string, unknown> | null)?.sessionName as string | undefined,
      )
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
      throw new HttpError(
        422,
        "Configure o segredo HMAC do webhook deste servidor antes de criar uma sessão.",
      );
    }
    const hmacKey = await resolveSecret(String(server.webhook_hmac_ref));
    if (!hmacKey) throw new HttpError(422, "Segredo HMAC do webhook WAHA não definido no Vault.");

    const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/waha-webhook`;
    try {
      await createWahaSession(apiKey, fetchFn, {
        baseUrl,
        sessionName,
        webhookUrl,
        hmacKey,
        settings: body.sessionConfig,
      });
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
        provider_config: body.sessionConfig
          ? { sessionName, waha: body.sessionConfig }
          : { sessionName },
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

  if (action === "ping") {
    if (!body.wahaServerId) throw new HttpError(422, "wahaServerId é obrigatório");
    try {
      const { baseUrl, apiKey } = await resolveWahaServerForPing(
        admin,
        resolveSecret,
        body.wahaServerId,
      );
      const { sessionCount } = await pingWahaServer(apiKey, fetchFn, baseUrl);
      return json({ ok: true, sessionCount, traceId: ctx.traceId }, 200);
    } catch (err) {
      if (err instanceof WhatsAppProviderError) {
        return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
      }
      throw err;
    }
  }

  if (action === "backfillLids") {
    if (!body.storeId) throw new HttpError(422, "storeId é obrigatório");
    const dryRun = body.dryRun !== false; // writes require an explicit dryRun:false
    const cursor = typeof body.cursor === "string" ? body.cursor : "";

    // 1) WAHA accounts of the store + per-server credentials (resolved once).
    const { data: wahaAccounts, error: accErr } = await admin
      .from("whatsapp_accounts")
      .select("id, provider_config, waha_server_id")
      .eq("provider", "waha")
      .eq("store_id", body.storeId);
    if (accErr)
      throw new HttpError(500, `backfillLids: falha ao listar contas — ${accErr.message}`);
    const accounts = (wahaAccounts ?? []) as Array<{
      id: string;
      provider_config: Record<string, unknown> | null;
      waha_server_id: string | null;
    }>;
    const emptyReport = {
      ok: true,
      dryRun,
      probed: 0,
      resolved: 0,
      updatedInPlace: 0,
      merged: 0,
      failures: 0,
      skipped: 0,
      remaining: 0,
      nextCursor: null as string | null,
      entries: [] as Array<Record<string, unknown>>,
      traceId: ctx.traceId,
    };
    if (accounts.length === 0) return json(emptyReport, 200);

    const serverIds = [
      ...new Set(accounts.map((a) => a.waha_server_id).filter(Boolean)),
    ] as string[];
    const { data: serverRows, error: srvErr } = await admin
      .from("waha_servers")
      .select("id, base_url, api_key_ref")
      .in("id", serverIds);
    if (srvErr)
      throw new HttpError(500, `backfillLids: falha ao listar servidores — ${srvErr.message}`);
    const credsByServer = new Map<string, { baseUrl: string; apiKey: string }>();
    for (const s of serverRows ?? []) {
      const key = await resolveSecret(String(s.api_key_ref ?? ""));
      if (key) {
        credsByServer.set(String(s.id), {
          baseUrl: String(s.base_url ?? "").replace(/\/+$/, ""),
          apiKey: key,
        });
      }
    }
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    // Session pre-check: a deleted/renamed session 404s on EVERY probe, which
    // would masquerade as "all phones are real". Accounts whose session is not
    // WORKING are excluded; their customers are counted as skipped.
    const liveAccounts = new Set<string>();
    const deadReason = new Map<string, string>();
    for (const acct of accounts) {
      const creds = acct.waha_server_id ? credsByServer.get(acct.waha_server_id) : undefined;
      const session = String(acct.provider_config?.sessionName ?? "");
      if (!creds || !session) {
        deadReason.set(acct.id, "credenciais/sessão ausentes");
        continue;
      }
      try {
        const { state } = await getWahaSessionStatus(creds.apiKey, fetchFn, {
          baseUrl: creds.baseUrl,
          sessionName: session,
        });
        if (state === "WORKING") liveAccounts.add(acct.id);
        else deadReason.set(acct.id, `sessão ${state}`);
      } catch (err) {
        deadReason.set(acct.id, err instanceof Error ? err.message : String(err));
      }
    }

    // 2) Candidate customers: distinct customer_id of ALL conversations on the
    // WAHA accounts — DRAINED with a pagination loop (a single capped read
    // would silently truncate coverage; cf. the drainPaged lesson, PR #158).
    // The .in() here holds only a handful of account ids — no URL risk.
    const accountByCustomer = new Map<string, string>();
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data: convRows, error: convListErr } = await admin
        .from("conversations")
        .select("customer_id, whatsapp_account_id")
        .in(
          "whatsapp_account_id",
          accounts.map((a) => a.id),
        )
        .not("customer_id", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (convListErr) {
        throw new HttpError(
          500,
          `backfillLids: falha ao listar conversas — ${convListErr.message}`,
        );
      }
      for (const row of convRows ?? []) {
        const cid = String(row.customer_id);
        const acctId = String(row.whatsapp_account_id);
        const current = accountByCustomer.get(cid);
        // Prefer probing through a LIVE account when the customer spans several.
        if (!current || (liveAccounts.has(acctId) && !liveAccounts.has(current))) {
          accountByCustomer.set(cid, acctId);
        }
      }
      if ((convRows ?? []).length < PAGE) break;
    }

    // 3) Deterministic cursor iteration: sorted ids, resume strictly after
    // `cursor`. Re-running with the returned nextCursor advances the window —
    // a full sweep terminates in ceil(N/CAP) runs regardless of outcomes.
    const allIds = [...accountByCustomer.keys()].sort();
    const pending = cursor ? allIds.filter((id) => id > cursor) : allIds;
    const CAP = 200;
    const batchIds = pending.slice(0, CAP);
    const remaining = Math.max(0, pending.length - batchIds.length);
    const nextCursor = remaining > 0 ? (batchIds[batchIds.length - 1] ?? null) : null;
    if (batchIds.length === 0) return json({ ...emptyReport, remaining, nextCursor }, 200);

    // ≤200 UUIDs ≈ 7.5 KB of query string — safely under the gateway URL limit
    // (the 1000-id .in() variant reproduces the PR #154 overflow incident).
    const { data: customerRows, error: custErr } = await admin
      .from("customers")
      .select("id, phone, full_name, tags")
      .in("id", batchIds);
    if (custErr)
      throw new HttpError(500, `backfillLids: falha ao carregar clientes — ${custErr.message}`);
    const customers = (
      (customerRows ?? []) as Array<{
        id: string;
        phone: string | null;
        full_name: string | null;
        tags: string[] | null;
      }>
    ).sort((a, b) => (a.id < b.id ? -1 : 1));

    let probed = 0;
    let resolved = 0;
    let updatedInPlace = 0;
    let merged = 0;
    let failures = 0;
    let skipped = 0;
    const entries: Array<Record<string, unknown>> = [];
    // Dry-run/apply consistency: phones this run would write. A second ghost
    // resolving to the same real phone must be reported as the MERGE the apply
    // run would perform (the first ghost's phone is already taken by then).
    const plannedPhoneOwner = new Map<string, string>(); // realDigits -> customerId

    for (const cust of customers) {
      const digits = String(cust.phone ?? "").replace(/\D/g, "");
      const acct = accountById.get(accountByCustomer.get(cust.id) ?? "");
      const creds = acct?.waha_server_id ? credsByServer.get(acct.waha_server_id) : undefined;
      const probeSession = String(acct?.provider_config?.sessionName ?? "");
      if (digits.length === 0 || !acct || !creds || !probeSession || !liveAccounts.has(acct.id)) {
        skipped += 1;
        entries.push({
          customerId: cust.id,
          action: "skipped",
          reason:
            digits.length === 0
              ? "telefone vazio"
              : ((acct && deadReason.get(acct.id)) ?? "credenciais/sessão ausentes"),
        });
        continue;
      }

      let realPhone: string | undefined;
      try {
        probed += 1;
        realPhone = (
          await resolveWahaLid(creds.apiKey, fetchFn, {
            baseUrl: creds.baseUrl,
            sessionName: probeSession,
            lid: digits,
          })
        ).phone;
      } catch (err) {
        failures += 1;
        entries.push({
          customerId: cust.id,
          action: "probe-failed",
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      if (!realPhone) continue; // 404/empty ⇒ it was a real phone — leave alone
      const realDigits = realPhone.replace(/\D/g, "");
      if (realDigits === digits) continue; // identity — not a lid
      resolved += 1;

      // Existing customer already on the REAL phone? Consult the planned map
      // first (dry-run parity), then the DB (same match as the webhook).
      let realId = plannedPhoneOwner.get(realDigits);
      if (!realId) {
        const { data: cands, error: candErr } = await admin
          .from("customers")
          .select("id, phone")
          .eq("store_id", body.storeId)
          .neq("id", cust.id)
          .like("phone", `%${realDigits.slice(-8)}`);
        if (candErr) {
          failures += 1;
          entries.push({ customerId: cust.id, action: "match-failed", error: candErr.message });
          continue;
        }
        realId = (cands ?? []).find((c) => String(c.phone).replace(/\D/g, "") === realDigits)
          ?.id as string | undefined;
      }

      if (!realId) {
        const contactName = await getWahaContactName(creds.apiKey, fetchFn, {
          baseUrl: creds.baseUrl,
          sessionName: probeSession,
          contactId: `${digits}@lid`,
        });
        const patch: Record<string, unknown> = { phone: realPhone };
        // Only replace placeholder names (name === old phone); never clobber a
        // human-edited name.
        if (String(cust.full_name ?? "") === String(cust.phone ?? "")) {
          patch.full_name = contactName ?? realPhone;
        }
        if ((cust.tags ?? []).includes("lid_unresolved")) {
          patch.tags = (cust.tags ?? []).filter((t) => t !== "lid_unresolved");
        }
        if (!dryRun) {
          const { error } = await admin.from("customers").update(patch).eq("id", cust.id);
          if (error) {
            failures += 1;
            entries.push({ customerId: cust.id, action: "update-failed", error: error.message });
            continue;
          }
        }
        plannedPhoneOwner.set(realDigits, cust.id);
        updatedInPlace += 1;
        entries.push({ customerId: cust.id, action: "update", from: cust.phone, to: realPhone });
      } else {
        if (!dryRun) {
          // Crash-safe order: messages first, conversations LAST before the
          // delete — while conversations still point at the ghost, ANY partial
          // failure leaves it discoverable by a re-run (candidacy derives from
          // conversations). Each step checks its own error and aborts.
          const { error: msgErr } = await admin
            .from("messages")
            .update({ author_id: realId })
            .eq("author_id", cust.id)
            .eq("author_type", "customer");
          if (msgErr) {
            failures += 1;
            entries.push({
              customerId: cust.id,
              action: "merge-failed",
              step: "messages",
              error: msgErr.message,
            });
            continue;
          }
          const { error: convErr } = await admin
            .from("conversations")
            .update({ customer_id: realId })
            .eq("customer_id", cust.id);
          if (convErr) {
            failures += 1;
            entries.push({
              customerId: cust.id,
              action: "merge-failed",
              step: "conversations",
              error: convErr.message,
            });
            continue;
          }
          const { error: delErr } = await admin.from("customers").delete().eq("id", cust.id);
          if (delErr) {
            // FK-linked data elsewhere (lead/order/note) — keep the ghost row, report.
            merged += 1;
            entries.push({
              customerId: cust.id,
              action: "merged-ghost-kept",
              into: realId,
              reason: delErr.message,
            });
            continue;
          }
        }
        merged += 1;
        entries.push({
          customerId: cust.id,
          action: "merge",
          into: realId,
          from: cust.phone,
          to: realPhone,
        });
      }
    }

    if (!dryRun && actorId) {
      await bestEffortAudit(admin, {
        store_id: body.storeId,
        actor_id: actorId,
        action: "whatsapp_lid_backfill",
        resource: "whatsapp_account",
        resource_id: accounts[0]?.id ?? "",
        after: {
          probed,
          resolved,
          updatedInPlace,
          merged,
          failures,
          skipped,
          remaining,
          nextCursor,
        },
      });
    }
    // Full entries — the dry-run review gate needs EVERY planned change
    // (≤ CAP+skips small objects; payload is negligible).
    return json(
      {
        ok: true,
        dryRun,
        probed,
        resolved,
        updatedInPlace,
        merged,
        failures,
        skipped,
        remaining,
        nextCursor,
        entries,
        traceId: ctx.traceId,
      },
      200,
    );
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
    const { baseUrl, apiKey, hmacKey } = await resolveWahaServer(admin, resolveSecret, account);
    const target = { baseUrl, sessionName };

    switch (action) {
      case "qr": {
        const qrBase64 = await getWahaSessionQrPng(apiKey, fetchFn, target);
        return json({ state: "qr", qrBase64, traceId: ctx.traceId }, 200);
      }
      case "state": {
        const { state: rawState, phoneNumber } = await getWahaSessionStatus(
          apiKey,
          fetchFn,
          target,
        );
        const accountStatus = wahaStateToAccountStatus(rawState);
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
        return json({ state: accountStatus, rawState, phoneNumber, traceId: ctx.traceId }, 200);
      }
      case "logout": {
        await logoutWahaSession(apiKey, fetchFn, target);
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
              {
                error: "Esta sessão tem conversas vinculadas e não pode ser excluída.",
                code: "HAS_LINKED_DATA",
                traceId: ctx.traceId,
              },
              422,
            );
          }
          throw new HttpError(500, `Falha ao excluir a sessão: ${rpcError.message}`);
        }
        try {
          await deleteWahaSession(apiKey, fetchFn, target);
        } catch (err) {
          ctx.log.warn(
            "waha session teardown failed (row already deleted; session may be orphaned)",
            {
              sessionName,
              error: err instanceof Error ? err.message : String(err),
            },
          );
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
      case "updateConfig": {
        const sessionConfig = body.sessionConfig;
        if (!sessionConfig) throw new HttpError(422, "sessionConfig é obrigatório");
        const webhookUrl = `${requiredEnv("SUPABASE_URL")}/functions/v1/waha-webhook`;
        await updateWahaSessionConfig(apiKey, fetchFn, {
          baseUrl,
          sessionName,
          webhookUrl,
          hmacKey,
          settings: sessionConfig,
        });
        const nextConfig = { ...(account.provider_config ?? {}), waha: sessionConfig };
        await admin
          .from("whatsapp_accounts")
          .update({ provider_config: nextConfig, status: "pending" })
          .eq("id", account.id);
        if (actorId) {
          await bestEffortAudit(admin, {
            store_id: account.store_id,
            actor_id: actorId,
            action: "whatsapp_instance_config_updated",
            resource: "whatsapp_account",
            resource_id: account.id,
            after: { waha: sessionConfig },
          });
        }
        return json({ ok: true, traceId: ctx.traceId }, 200);
      }
      default:
        throw new HttpError(422, "ação inválida");
    }
  } catch (err) {
    if (err instanceof WhatsAppProviderError) {
      ctx.log.warn("waha-connect action rejected", {
        action,
        code: err.code,
        message: err.message,
      });
      return json({ error: err.message, code: err.code, traceId: ctx.traceId }, err.httpStatus);
    }
    throw err;
  }
});
