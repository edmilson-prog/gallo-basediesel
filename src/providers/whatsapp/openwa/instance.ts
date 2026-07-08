/**
 * OpenWA session management (QR pairing flow). NOT part of IWhatsAppProvider
 * (messaging-only). Consumed server-side by the `whatsapp-connect` Edge
 * Function through the `_shared` mirror. Runtime-agnostic: relative imports,
 * Web APIs only.
 *
 * Auth model (confirmed live 2026-07-07): ONE global key authenticates every
 * session on the server — unlike Evolution Go, there is no separate
 * per-instance token. The SAME `apiKey` param is used for admin operations
 * (create/start/stop/delete/webhook registration, called by whatsapp-connect)
 * AND for messaging (OpenWaProvider) — both resolve it from the
 * `whatsapp_openwa_servers` registry (`api_key_ref`), never from a
 * per-account secret.
 *
 * Endpoints CONFIRMED live (server v0.8.9):
 *   POST   /sessions              { name }        → { id, name, status: "created", ... }
 *   POST   /sessions/{id}/start                    → { id, status: "qr_ready"|..., ... }
 *   GET    /sessions/{id}/qr                       → { qrCode: "data:image/png;base64,..." }
 *   GET    /sessions/{id}                          → { id, status, phone, pushName, ... }
 *   POST   /sessions/{id}/stop
 *   DELETE /sessions/{id}
 *   POST   /sessions/{id}/webhooks { url, events } → events ⊆ OPENWA_WEBHOOK_EVENTS
 * No dedicated "restart" endpoint was found (docs list `kill` for force-killing
 * stuck sessions) — restart is implemented as stop-then-start, best-effort.
 */

import { WhatsAppProviderError } from "../errors";
import { E164_REGEX, toE164 } from "../phone";
import type { IEngineDeps } from "../types";
import { openwaRequest } from "./client";
import { OPENWA_WEBHOOK_EVENTS } from "./constants";

export interface IOpenWaServerTarget {
  baseUrl: string;
}

export interface IOpenWaSessionTarget {
  baseUrl: string;
  sessionId: string;
}

export interface IOpenWaQrResult {
  state: "qr" | "open";
  qrBase64?: string;
}

export interface IOpenWaStatusResult {
  status: string;
  connected: boolean;
  phoneNumber?: string;
}

/** POST /sessions — global apiKey; server mints the session id. */
export async function createOpenWaSession(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaServerTarget,
  name: string,
  traceId?: string,
): Promise<{ sessionId: string }> {
  const response = await openwaRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/sessions",
    json: { name },
    traceId,
  });
  const body = response.body as { id?: string } | null;
  if (!body?.id) {
    throw new WhatsAppProviderError("INTEGRATION_ERROR", 502, "Resposta de POST /sessions sem id");
  }
  return { sessionId: body.id };
}

/** POST /sessions/{id}/start — initializes the WhatsApp connection (QR becomes available). */
export async function startOpenWaSession(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaSessionTarget,
  traceId?: string,
): Promise<{ status: string }> {
  const response = await openwaRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/sessions/${target.sessionId}/start`,
    traceId,
  });
  const body = response.body as { status?: string } | null;
  return { status: body?.status ?? "unknown" };
}

/** GET /sessions/{id}/qr — QR data URI, or state=open when already paired. */
export async function getOpenWaQr(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaSessionTarget,
  traceId?: string,
): Promise<IOpenWaQrResult> {
  const response = await openwaRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/sessions/${target.sessionId}/qr`,
    method: "GET",
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as { qrCode?: string } | null;
  if (body?.qrCode) return { state: "qr", qrBase64: body.qrCode };
  return { state: "open" };
}

/** GET /sessions/{id} — status/phone/pushName. */
export async function getOpenWaStatus(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaSessionTarget,
  traceId?: string,
): Promise<IOpenWaStatusResult> {
  const response = await openwaRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/sessions/${target.sessionId}`,
    method: "GET",
    timeoutMs: 10_000,
    traceId,
  });
  const body = response.body as { status?: string; phone?: string } | null;
  const status = body?.status ?? "unknown";
  return {
    status,
    // CONFIRMED live 2026-07-08 (real pairing): a fully authenticated session
    // reports status "ready" — NOT "connected" as first assumed (this wrapper
    // mirrors whatsapp-web.js's own `client.on('ready', ...)` event name).
    // "connected" kept as a defensive fallback in case another build variant
    // uses that word instead.
    connected: status === "ready" || status === "connected",
    phoneNumber: sessionPhoneToE164(body?.phone),
  };
}

/** POST /sessions/{id}/stop — disconnects without deleting the session row. */
export async function stopOpenWaSession(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaSessionTarget,
  traceId?: string,
): Promise<void> {
  await openwaRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/sessions/${target.sessionId}/stop`,
    traceId,
  });
}

/** DELETE /sessions/{id} — removes the session from the server entirely. */
export async function deleteOpenWaSession(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaSessionTarget,
  traceId?: string,
): Promise<void> {
  await openwaRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/sessions/${target.sessionId}`,
    method: "DELETE",
    traceId,
  });
}

/**
 * stop-then-start — no dedicated restart endpoint confirmed live. Best-effort:
 * a failed stop (e.g. already stopped) does not block the start attempt.
 */
export async function restartOpenWaSession(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaSessionTarget,
  traceId?: string,
): Promise<void> {
  await stopOpenWaSession(apiKey, deps, target, traceId).catch(() => {});
  await startOpenWaSession(apiKey, deps, target, traceId);
}

/**
 * POST /sessions/{id}/webhooks — registers our whatsapp-webhook URL for the
 * confirmed event set. Idempotent-ish: the server does not dedupe by URL (no
 * upsert endpoint was found), so callers should register once per session
 * creation, not on every QR poll.
 */
export async function registerOpenWaWebhook(
  apiKey: string,
  deps: IEngineDeps,
  target: IOpenWaSessionTarget,
  webhookUrl: string,
  traceId?: string,
): Promise<void> {
  await openwaRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/sessions/${target.sessionId}/webhooks`,
    json: { url: webhookUrl, events: [...OPENWA_WEBHOOK_EVENTS] },
    traceId,
  });
}

function sessionPhoneToE164(phone: string | undefined | null): string | undefined {
  if (!phone) return undefined;
  const e164 = toE164(phone);
  return E164_REGEX.test(e164) ? e164 : undefined;
}
