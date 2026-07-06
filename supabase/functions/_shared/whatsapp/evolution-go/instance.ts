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
import { E164_REGEX, toE164 } from "../phone.ts";
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
  /**
   * `qr` = a scannable code was issued; `pending` = the server answered 2xx
   * but the QR event has not arrived yet (/instance/connect is async — the
   * socket may still be dialing). There is NO "open" here on purpose: the
   * paired signal is exclusively /instance/status LoggedIn. Reading a
   * Qrcode-less 2xx as "paired" flipped the dialog to "Conectado" with no
   * scan (incident 2026-07-06).
   */
  state: "qr" | "pending";
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

/** GET /instance/qr — QR data URI + pairing code, or state=pending while the QR event has not arrived. */
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
  return { state: "pending" };
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
  // This Go build (≤0.7.1) prepends a literal `+` when it receives bare digits
  // (`+<digits>@s.whatsapp.net`) — an INVALID jid that WhatsApp silently drops,
  // so the IQ hangs to whatsmeow's 1m15s internal timeout (proven server-side).
  // Sending a full jid makes the handler use it verbatim. Keep the digits exactly
  // as stored — do NOT inject the BR 9th digit; the 12-digit msisdn IS the real jid.
  const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    // `preview: true` = the low-res thumbnail (fast + near-always available);
    // full-res (preview:false) makes the server fetch the whole image, which is
    // slower and was observed to hang past the 15s timeout. A thumbnail is
    // exactly what the inbox avatar needs.
    path: "/user/avatar",
    json: { number: jid, preview: true },
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

/** Owner jid → E.164, stripping the optional device suffix (":12") and server. */
function goJidToPhone(jid: string | undefined): string | undefined {
  if (!jid) return undefined;
  const phone = toE164(jid.split("@")[0]?.split(":")[0] ?? "");
  return E164_REGEX.test(phone) ? phone : undefined;
}

/** Minimal shape of a Go instance record returned by GET /instance/all. */
interface IGoInstanceRecord {
  id?: string;
  Id?: string;
  instanceId?: string;
  jid?: string;
  Jid?: string;
}

/** id of a Go instance record, tolerating Go's occasional PascalCase serialization. */
function goRecordId(record: IGoInstanceRecord): string | undefined {
  return record.id ?? record.Id ?? record.instanceId;
}

/**
 * Read the paired account's OWN number (E.164) from the Go server.
 *
 * This build does NOT serve GET /instance/get/{instanceId} — it returns 404
 * (confirmed in production: /instance/status answers 200 while /instance/get
 * 404s in the same trace). So we read the instance record from GET /instance/all
 * and pick ours by id. That is an admin route, authed by the GLOBAL key (passed
 * as `apiKey`) — the same key class that authorizes /instance/delete/{instanceId}.
 * whatsmeow's `jid` field carries the owner's WID once logged in (empty before
 * pairing). The list embeds every instance's `token` (a secret), so
 * `omitResponsePayload` keeps it out of the integration log (the parsed body is
 * still returned to us).
 *
 * Best-effort by design: any non-2xx, a network error, our instance missing from
 * the list, or an unparseable jid resolves to an empty profile so a status poll
 * never aborts on this lookup.
 */
export async function fetchGoOwnNumber(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<{ phoneNumber?: string }> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/instance/all",
    method: "GET",
    omitResponsePayload: true, // the list embeds every instance token — never log it
    timeoutMs: 10_000,
    traceId,
  }).catch(() => null);
  if (!response) return {};
  const body = response.body as
    | { data?: IGoInstanceRecord[]; instances?: IGoInstanceRecord[] }
    | IGoInstanceRecord[]
    | null;
  const list: IGoInstanceRecord[] = Array.isArray(body)
    ? body
    : (body?.data ?? body?.instances ?? []);
  const own = list.find((record) => goRecordId(record) === target.instanceId);
  return { phoneNumber: goJidToPhone(own?.jid ?? own?.Jid) };
}
