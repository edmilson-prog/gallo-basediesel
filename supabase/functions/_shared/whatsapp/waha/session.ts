// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/session.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * WAHA session lifecycle (QR pairing flow). Consumed server-side by the
 * `waha-connect` Edge Function. Runtime-agnostic: relative imports, Web APIs
 * only.
 */

import { WAHA_DEFAULT_EVENTS } from "./constants.ts";
import { wahaRequest } from "./client.ts";

export interface IWahaSessionTarget {
  baseUrl: string;
  sessionName: string;
}

export interface IWahaStatusResult {
  state: string;
  phoneNumber?: string;
}

/** WAHA `me.id` is `<digits>@c.us` — convert to E.164. */
function meIdToE164(meId: string | undefined): string | undefined {
  if (!meId) return undefined;
  const digits = meId.split("@")[0]?.replace(/\D/g, "");
  return digits && digits.length > 0 ? `+${digits}` : undefined;
}

/** UI-facing per-session knobs (structurally compatible with IWahaSessionConfig). */
export interface IWahaSessionSettings {
  chatFilters?: { groups?: boolean; status?: boolean; channels?: boolean; broadcast?: boolean };
  debug?: boolean;
  proxy?: { server: string; username?: string; password?: string };
}

/**
 * Builds the WAHA session `config`. `chatFilters` are "process this type";
 * WAHA's `config.ignore` is "ignore this type" → inverted. With no settings,
 * every non-1:1 type is ignored (commercial-inbox default). `debug`/`proxy`
 * are only set when meaningful.
 */
export function buildWahaConfig(
  webhookUrl: string,
  hmacKey: string,
  settings?: IWahaSessionSettings,
): Record<string, unknown> {
  const cf = settings?.chatFilters;
  const config: Record<string, unknown> = {
    ignore: {
      status: !cf?.status,
      groups: !cf?.groups,
      channels: !cf?.channels,
      broadcast: !cf?.broadcast,
    },
    webhooks: [{ url: webhookUrl, events: [...WAHA_DEFAULT_EVENTS], hmac: { key: hmacKey } }],
  };
  if (settings?.debug) config.debug = true;
  if (settings?.proxy?.server) config.proxy = settings.proxy;
  return config;
}

export async function createWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  input: {
    baseUrl: string;
    sessionName: string;
    webhookUrl: string;
    hmacKey: string;
    settings?: IWahaSessionSettings;
  },
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: input.baseUrl,
    path: "/api/sessions",
    json: {
      name: input.sessionName,
      start: true,
      config: buildWahaConfig(input.webhookUrl, input.hmacKey, input.settings),
    },
  });
}

/**
 * Updates an existing session's config. WAHA `PUT /api/sessions/{name}` requires
 * the COMPLETE config and, when the session isn't STOPPED, stops+starts it with
 * the new config (auth/pairing preserved — no QR re-scan). Rebuilds the same
 * webhook block create used.
 */
export async function updateWahaSessionConfig(
  apiKey: string,
  fetchFn: typeof fetch,
  input: {
    baseUrl: string;
    sessionName: string;
    webhookUrl: string;
    hmacKey: string;
    settings?: IWahaSessionSettings;
  },
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: input.baseUrl,
    path: `/api/sessions/${input.sessionName}`,
    method: "PUT",
    json: {
      name: input.sessionName,
      config: buildWahaConfig(input.webhookUrl, input.hmacKey, input.settings),
    },
  });
}

export async function getWahaSessionStatus(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<IWahaStatusResult> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}`,
    method: "GET",
    timeoutMs: 10_000,
  });
  const body = response.body as { status?: string; me?: { id?: string } } | null;
  return {
    state: body?.status ?? "FAILED",
    phoneNumber: meIdToE164(body?.me?.id),
  };
}

/** `GET /api/{session}/auth/qr` returns the PNG binary — base64-encode as a data URI. */
export async function getWahaSessionQrPng(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<string> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/${target.sessionName}/auth/qr`,
    method: "GET",
    expectBinary: true,
    timeoutMs: 10_000,
  });
  const bytes = response.bytes ?? new Uint8Array();
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  return `data:${response.contentType ?? "image/png"};base64,${base64}`;
}

export interface IWahaPingResult {
  sessionCount: number;
}

/**
 * Lightweight credentials/connectivity check — `GET /api/sessions` needs no
 * session name, so it validates the API key against the endpoint without
 * creating or touching any session. Non-2xx (e.g. a bad key) throws via
 * `wahaRequest`'s existing error mapping.
 */
export async function pingWahaServer(
  apiKey: string,
  fetchFn: typeof fetch,
  baseUrl: string,
): Promise<IWahaPingResult> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl,
    path: "/api/sessions",
    method: "GET",
    timeoutMs: 10_000,
  });
  const body = Array.isArray(response.body) ? response.body : [];
  return { sessionCount: body.length };
}

export async function stopWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}/stop`,
  });
}

export async function logoutWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}/logout`,
  });
}

export async function restartWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}/restart`,
  });
}

export async function deleteWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/sessions/${target.sessionName}`,
    method: "DELETE",
  });
}
