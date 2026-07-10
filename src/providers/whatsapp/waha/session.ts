/**
 * WAHA session lifecycle (QR pairing flow). Consumed server-side by the
 * `waha-connect` Edge Function. Runtime-agnostic: relative imports, Web APIs
 * only.
 */

import { WAHA_DEFAULT_EVENTS, wahaStateToAccountStatus } from "./constants";
import { wahaRequest } from "./client";

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

export async function createWahaSession(
  apiKey: string,
  fetchFn: typeof fetch,
  input: { baseUrl: string; sessionName: string; webhookUrl: string; hmacKey: string },
): Promise<void> {
  await wahaRequest(apiKey, fetchFn, {
    baseUrl: input.baseUrl,
    path: "/api/sessions",
    json: {
      name: input.sessionName,
      start: true,
      config: {
        webhooks: [
          {
            url: input.webhookUrl,
            events: [...WAHA_DEFAULT_EVENTS],
            hmac: { key: input.hmacKey },
          },
        ],
      },
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

/** Maps the raw status straight to the account status the UI/DB expect. */
export async function getWahaAccountStatus(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
): Promise<{ accountStatus: "connected" | "disconnected" | "pending"; phoneNumber?: string }> {
  const { state, phoneNumber } = await getWahaSessionStatus(apiKey, fetchFn, target);
  return { accountStatus: wahaStateToAccountStatus(state), phoneNumber };
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
