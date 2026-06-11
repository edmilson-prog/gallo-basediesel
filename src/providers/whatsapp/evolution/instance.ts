/**
 * Evolution instance-management calls (QR pairing flow — spec
 * docs/superpowers/specs/2026-06-11-whatsapp-evolution-qr-connect-design.md).
 *
 * Standalone functions (NOT part of IWhatsAppProvider — that contract is
 * messaging-only and provider-agnostic; instance pairing is Evolution-specific).
 * Consumed server-side by the `whatsapp-connect` Edge Function through the
 * `_shared/whatsapp/` mirror. Runtime-agnostic: relative imports, Web APIs only.
 *
 * Evolution v2 response shapes vary across builds — parsers below accept both
 * the flat v2 and the nested v1-style payloads, falling back defensively.
 */

import { WhatsAppProviderError } from "../errors";
import { toE164 } from "../phone";
import type { IEngineDeps } from "../types";
import { evolutionRequest } from "./client";

export interface IEvolutionInstanceTarget {
  baseUrl: string;
  instanceName: string;
}

export type EvolutionInstanceState = "close" | "connecting" | "open" | "unknown";

export interface IInstanceQrResult {
  state: "qr" | "open";
  /** Data URI (data:image/png;base64,...) of the QR image, when state=qr. */
  qrBase64?: string;
  /** Optional numeric pairing code some builds return alongside the QR. */
  pairingCode?: string;
}

export interface IInstanceProfile {
  /** E.164 of the paired number, when resolvable. */
  phoneNumber?: string;
  profileName?: string;
}

export interface IInstanceStateResult {
  state: EvolutionInstanceState;
}

/** Owner jid → E.164, stripping the optional device suffix (":12"). */
function jidToPhone(jid: string | undefined): string | undefined {
  if (!jid) return undefined;
  const digits = toE164(jid.split("@")[0]?.split(":")[0] ?? "");
  return digits.length > 0 ? digits : undefined;
}

function parseState(body: unknown): EvolutionInstanceState {
  const candidate = body as { instance?: { state?: string }; state?: string } | null;
  const raw = candidate?.instance?.state ?? candidate?.state;
  return raw === "open" || raw === "connecting" || raw === "close" ? raw : "unknown";
}

/** GET /instance/connect — returns the QR to scan, or `open` if already paired. */
export async function getInstanceQr(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IInstanceQrResult> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/connect/${target.instanceName}`,
    method: "GET",
    traceId,
  });
  const body = response.body as {
    base64?: string;
    pairingCode?: string;
    qrcode?: { base64?: string; pairingCode?: string };
    instance?: { state?: string };
  } | null;
  const qrBase64 = body?.base64 ?? body?.qrcode?.base64;
  if (qrBase64) {
    return {
      state: "qr",
      qrBase64,
      pairingCode: body?.pairingCode ?? body?.qrcode?.pairingCode,
    };
  }
  if (parseState(body) === "open") return { state: "open" };
  throw new WhatsAppProviderError(
    "INTEGRATION_ERROR",
    502,
    "Resposta da Evolution sem QR (base64) e sem estado 'open'",
  );
}

/** GET /instance/connectionState — tri-state of the WhatsApp session. */
export async function getConnectionState(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IInstanceStateResult> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/connectionState/${target.instanceName}`,
    method: "GET",
    timeoutMs: 10_000,
    traceId,
  });
  return { state: parseState(response.body) };
}

/**
 * GET /instance/fetchInstances — resolves the paired number + profile name.
 * Best-effort: unknown shapes return an empty profile (callers keep going).
 */
export async function fetchInstanceProfile(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IInstanceProfile> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/fetchInstances?instanceName=${encodeURIComponent(target.instanceName)}`,
    method: "GET",
    traceId,
  });
  const list = Array.isArray(response.body) ? response.body : [response.body];
  for (const raw of list) {
    const v2 = raw as { name?: string; ownerJid?: string; profileName?: string } | null;
    const v1 = (raw as { instance?: { instanceName?: string; owner?: string; profileName?: string } } | null)
      ?.instance;
    const name = v1?.instanceName ?? v2?.name;
    if (name !== target.instanceName) continue;
    const jid = v1?.owner ?? v2?.ownerJid;
    return {
      phoneNumber: jidToPhone(jid),
      profileName: v1?.profileName ?? v2?.profileName ?? undefined,
    };
  }
  return {};
}

/** DELETE /instance/logout — unpairs the WhatsApp session (QR needed again). */
export async function logoutInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/logout/${target.instanceName}`,
    method: "DELETE",
    traceId,
  });
}

/** POST /instance/restart — restarts the instance process on the server. */
export async function restartInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/restart/${target.instanceName}`,
    method: "POST",
    traceId,
  });
}

/**
 * POST /webhook/set — points the instance at our unified webhook. Idempotent:
 * re-applying the same config is always safe (called on every pairing start).
 */
export async function setInstanceWebhook(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  webhookUrl: string,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/webhook/set/${target.instanceName}`,
    json: {
      webhook: {
        enabled: true,
        url: webhookUrl,
        base64: false,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
      },
    },
    traceId,
  });
}
