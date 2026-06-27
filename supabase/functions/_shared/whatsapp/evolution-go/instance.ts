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

/** One /user/check result (whatsmeow IsOnWhatsApp), tolerant of Go's casing. */
interface IGoCheckResult {
  JID?: string;
  jid?: string;
  Jid?: string;
  IsIn?: boolean;
  isIn?: boolean;
  exists?: boolean;
}

/**
 * Resolve a dialed number to the contact's CANONICAL WhatsApp wire number via
 * POST /user/check (whatsmeow IsOnWhatsApp). Brazilian mobiles are routinely
 * stored without the mandatory 9th digit (e.g. 556581420027 vs. the registered
 * 5565981420027); GetProfilePictureInfo on a JID that doesn't match the
 * registered one stalls — the >15s /user/avatar hang this resolver exists to
 * avoid. usync returns the registered JID, whose user part is the number
 * /user/avatar actually needs.
 *
 * Returns: the canonical wire number when resolved; `null` when WhatsApp says
 * the number is NOT registered (skip the avatar call — there is no photo and it
 * would only stall); `undefined` when inconclusive (check failed / unparseable
 * shape) so the caller falls back to the dialed number. Best-effort: never
 * throws. Instance-scoped: authed by the per-instance TOKEN (passed as `apiKey`).
 * The response is NOT omitted from the log on purpose — it carries no secret and
 * lets us confirm the live shape against this build.
 */
async function resolveGoCanonicalNumber(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  wireNumber: string,
  traceId?: string,
): Promise<string | null | undefined> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/user/check",
    json: { number: [wireNumber], formatJid: true },
    timeoutMs: 8_000,
    traceId,
  }).catch(() => null);
  if (!response) return undefined;
  const body = response.body as
    | { data?: IGoCheckResult[]; users?: IGoCheckResult[] }
    | IGoCheckResult[]
    | null;
  const raw = Array.isArray(body) ? body : (body?.data ?? body?.users);
  const entry = Array.isArray(raw) ? raw[0] : undefined;
  if (!entry) return undefined;
  const isIn = entry.IsIn ?? entry.isIn ?? entry.exists;
  if (isIn === false) return null; // not on WhatsApp → no avatar; skip the stall-prone call
  const phone = goJidToPhone(entry.JID ?? entry.jid ?? entry.Jid);
  return phone ? phone.slice(1) : undefined;
}

/**
 * POST /user/avatar — profile-picture URL for a contact (whatsmeow GetAvatar).
 * Instance-scoped: authed by the per-instance TOKEN (passed as `apiKey`).
 *
 * Resolves the contact's canonical WhatsApp number FIRST (see
 * resolveGoCanonicalNumber): a dialed Brazilian mobile is often missing the 9th
 * digit, and querying the avatar for a JID that doesn't match the registered one
 * stalls whatsmeow's GetProfilePictureInfo (the >15s timeout seen in prod).
 * usync also reports when a number isn't on WhatsApp at all, so we skip the
 * stall-prone call entirely for those.
 *
 * The Go contract wraps ProfilePictureInfo in `data`, but field casing varies
 * across builds (URL / url / profilePictureURL) — accept any non-empty string.
 * Best-effort by design: any non-2xx (no public photo / privacy), a network
 * error, or an unrecognised shape resolves to null so a bulk avatar sync never
 * aborts on a single contact. `number` is wire format (E.164 without the +).
 */
export async function fetchGoProfilePictureUrl(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  number: string,
  traceId?: string,
): Promise<string | null> {
  const canonical = await resolveGoCanonicalNumber(apiKey, deps, target, number, traceId);
  if (canonical === null) return null; // usync says not on WhatsApp → no photo
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    // `preview: true` = the low-res thumbnail (fast + near-always available);
    // the inbox avatar needs nothing more.
    path: "/user/avatar",
    json: { number: canonical ?? number, preview: true },
    timeoutMs: 12_000,
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
