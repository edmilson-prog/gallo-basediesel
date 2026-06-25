/**
 * Evolution Go instance management (QR pairing flow). NOT part of
 * IWhatsAppProvider (messaging-only). Consumed server-side by the
 * `whatsapp-connect` Edge Function (Fase 2) through the `_shared` mirror.
 * Runtime-agnostic: relative imports, Web APIs only.
 */

import { WhatsAppProviderError } from "../errors";
import type { IEngineDeps } from "../types";
import { goRequest } from "./client";

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

/** POST /instance/create — global apikey only (no instance yet). */
export async function createGoInstance(
  apiKey: string,
  deps: IEngineDeps,
  input: { baseUrl: string; name: string; token?: string },
  traceId?: string,
): Promise<{ instanceId: string; token: string }> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: input.baseUrl,
    path: "/instance/create",
    json: { name: input.name, ...(input.token ? { token: input.token } : {}) },
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as { data?: { id?: string; token?: string } } | null;
  const instanceId = body?.data?.id;
  const token = body?.data?.token ?? input.token;
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
    instanceId: target.instanceId,
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
    instanceId: target.instanceId,
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
    instanceId: target.instanceId,
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
    instanceId: target.instanceId,
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
    instanceId: target.instanceId,
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
    instanceId: target.instanceId,
    traceId,
  });
}
