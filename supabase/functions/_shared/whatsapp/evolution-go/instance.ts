// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution-go/instance.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Evolution Go instance management (QR pairing flow). NOT part of
 * IWhatsAppProvider (messaging-only). Consumed server-side by the
 * `whatsapp-connect` Edge Function (Fase 2) through the `_shared` mirror.
 * Runtime-agnostic: relative imports, Web APIs only.
 *
 * Auth model (smoke 2026-06-25): pass the GLOBAL key as `apiKey` to
 * `createGoInstance` (admin endpoint); pass the per-instance TOKEN as `apiKey`
 * to every instance-scoped function below (connect/qr/status/logout/delete/
 * restart) — the Go server authorizes those by the instance token, not by an
 * instanceId header.
 */

import { WhatsAppProviderError } from "../errors.ts";
import type { IEngineDeps } from "../types.ts";
import { goRequest } from "./client.ts";

/** Server-level target (before an instance exists) — e.g. /instance/create. */
export interface IGoServerTarget {
  baseUrl: string;
}

export interface IGoInstanceTarget {
  baseUrl: string;
  instanceId: string;
}

export interface IGoQrResult {
  state: "qr" | "open";
  qrBase64?: string;
  pairingCode?: string;
}

export interface IGoStatusResult {
  connected: boolean;
  loggedIn: boolean;
}

/** POST /instance/create — global apikey only; mints the instance id + token. */
export async function createGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  input: { baseUrl: string; name: string; instanceId?: string; token?: string },
  traceId?: string,
): Promise<{ instanceId: string; token: string }> {
  // The Go server requires the client to provide BOTH a unique token and the
  // instance id (its uuid primary key) — it does NOT generate them, and rejects
  // a payload missing `token` with 400 "token is required". Mint both here when
  // the caller does not supply them so the id is always a valid uuid.
  const requestedId = input.instanceId ?? crypto.randomUUID();
  const requestedToken = input.token ?? crypto.randomUUID();
  const response = await goRequest(apiKey, deps, {
    baseUrl: input.baseUrl,
    path: "/instance/create",
    json: { instanceId: requestedId, name: input.name, token: requestedToken },
    omitResponsePayload: true,
    traceId,
  });
  // A 2xx means the instance was created with the id/token we sent; the server
  // echoes them back ({ data: { id, token } }). Prefer the echo, fall back to
  // what we sent (goRequest already threw on any non-2xx).
  const body = response.body as { data?: { id?: string; token?: string } } | null;
  const instanceId = body?.data?.id ?? requestedId;
  const token = body?.data?.token ?? requestedToken;
  if (!instanceId || !token) {
    throw new WhatsAppProviderError(
      "INTEGRATION_ERROR",
      502,
      "Resposta de /instance/create sem id/token",
    );
  }
  return { instanceId, token };
}

/** POST /instance/connect — registers the webhook + event subscription. */
export async function connectGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  webhookUrl: string,
  subscribe: string[],
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/connect",
    json: { immediate: true, webhookUrl, subscribe },
    traceId,
  });
}

/** GET /instance/qr — QR data URI + pairing code, or state=open when paired. */
export async function getGoInstanceQr(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<IGoQrResult> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/qr",
    method: "GET",
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as { data?: { Qrcode?: string; Code?: string } } | null;
  const qrBase64 = body?.data?.Qrcode;
  if (qrBase64) {
    return { state: "qr", qrBase64, pairingCode: body?.data?.Code };
  }
  return { state: "open" };
}

/** GET /instance/status — Connected/LoggedIn booleans. */
export async function getGoInstanceStatus(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<IGoStatusResult> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/status",
    method: "GET",
    timeoutMs: 10_000,
    traceId,
  });
  const body = response.body as { data?: { Connected?: boolean; LoggedIn?: boolean } } | null;
  return { connected: body?.data?.Connected === true, loggedIn: body?.data?.LoggedIn === true };
}

/** DELETE /instance/logout — unpairs the session (QR needed again). */
export async function logoutGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/logout",
    method: "DELETE",
    traceId,
  });
}

/** DELETE /instance/delete/{instanceId} — removes the instance from the server. */
export async function deleteGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/delete/${target.instanceId}`,
    method: "DELETE",
    traceId,
  });
}

/** POST /instance/reconnect — restarts the connection (Go has no /instance/restart). */
export async function restartGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<void> {
  await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/reconnect",
    traceId,
  });
}

/**
 * POST /user/avatar — profile-picture URL for a contact (whatsmeow GetAvatar).
 * Instance-scoped: authed by the per-instance TOKEN (passed as `apiKey`). The
 * Go contract wraps whatsmeow's ProfilePictureInfo in `data`, but field casing
 * varies across builds (URL / url / profilePictureURL) — accept any non-empty
 * string. Best-effort by design: any non-2xx (no public photo / privacy), a
 * network error, or an unrecognised shape resolves to null so a bulk avatar
 * sync never aborts on a single contact. `number` is wire format (E.164 without
 * the leading +).
 */
export async function fetchGoProfilePictureUrl(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  number: string,
  traceId?: string,
): Promise<string | null> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/user/avatar",
    json: { number, preview: false },
    timeoutMs: 15_000,
    traceId,
  }).catch(() => null);
  if (!response) return null;
  const data = (response.body as { data?: Record<string, unknown> } | null)?.data ?? null;
  const candidate =
    (data?.URL as string | undefined) ??
    (data?.url as string | undefined) ??
    (data?.profilePictureURL as string | undefined) ??
    (data?.profilePictureUrl as string | undefined);
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}
