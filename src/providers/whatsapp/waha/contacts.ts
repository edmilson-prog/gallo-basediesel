/**
 * WAHA contact/identity helpers — @lid resolution and contact-name lookup.
 * Consumed server-side by `waha-webhook` (inbound) and `waha-connect`
 * (backfill). Runtime-agnostic: relative imports, Web APIs only.
 */

import { WhatsAppProviderError } from "../errors";
import { wahaRequest } from "./client";

export interface IWahaLidTarget {
  baseUrl: string;
  sessionName: string;
  /** Raw lid — accepts "123@lid" or bare digits. */
  lid: string;
  /** Default 10s; the webhook passes 5s to keep the pre-idempotency window short. */
  timeoutMs?: number;
}

/** `pn` is `<digits>@c.us` — convert to E.164 (mirrors session.ts's meIdToE164). */
function pnToE164(pn: string | undefined): string | undefined {
  const digits = (pn ?? "").split("@")[0]?.replace(/\D/g, "") ?? "";
  return digits.length > 0 ? `+${digits}` : undefined;
}

/**
 * Resolves a WhatsApp @lid (privacy identifier) to the contact's real phone
 * via `GET /api/{session}/lids/{lid}` — the GOWS engine keeps the lid↔phone
 * map. The path segment takes the BARE DIGITS (no "@lid" suffix, no
 * escaping). Returns `{ phone: undefined }` when the server doesn't know the
 * lid (404 or empty `pn`) — callers treat that as "unresolved" and fall
 * back. Other errors (auth, network, 5xx) propagate.
 */
export async function resolveWahaLid(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaLidTarget,
): Promise<{ phone?: string }> {
  const digits = target.lid.split("@")[0]?.replace(/\D/g, "") ?? "";
  if (digits.length === 0) return { phone: undefined };
  try {
    const response = await wahaRequest(apiKey, fetchFn, {
      baseUrl: target.baseUrl,
      path: `/api/${target.sessionName}/lids/${digits}`,
      method: "GET",
      timeoutMs: target.timeoutMs ?? 10_000,
    });
    const body = response.body as { pn?: string } | null;
    return { phone: pnToE164(body?.pn) };
  } catch (err) {
    if (err instanceof WhatsAppProviderError && err.code === "NOT_FOUND") {
      return { phone: undefined };
    }
    throw err;
  }
}

/**
 * Best-effort contact display name via
 * `GET /api/contacts?contactId={id}&session={name}` (accepts `@c.us` AND
 * `@lid` ids). Tries `pushname`, then `name`, then `shortName` — each
 * trimmed; whitespace-only values are skipped. Returns `undefined` when no
 * usable name exists and NEVER throws: a missing name must not break
 * reception.
 */
export async function getWahaContactName(
  apiKey: string,
  fetchFn: typeof fetch,
  target: { baseUrl: string; sessionName: string; contactId: string; timeoutMs?: number },
): Promise<string | undefined> {
  try {
    const query = `contactId=${encodeURIComponent(target.contactId)}&session=${encodeURIComponent(target.sessionName)}`;
    const response = await wahaRequest(apiKey, fetchFn, {
      baseUrl: target.baseUrl,
      path: `/api/contacts?${query}`,
      method: "GET",
      timeoutMs: target.timeoutMs ?? 10_000,
    });
    const body = response.body as {
      pushname?: string | null;
      name?: string | null;
      shortName?: string | null;
    } | null;
    for (const candidate of [body?.pushname, body?.name, body?.shortName]) {
      const trimmed = (candidate ?? "").trim();
      if (trimmed.length > 0) return trimmed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Contact profile-picture URL via `GET /api/contacts/profile-picture`
 * (WAHA REST docs, "Profile"). Returns `undefined` on a 404/empty response
 * (no public photo / private) and NEVER throws for that case — other errors
 * (auth, network, 5xx) propagate, same contract as {@link resolveWahaLid}.
 */
export async function fetchWahaProfilePictureUrl(
  apiKey: string,
  fetchFn: typeof fetch,
  target: { baseUrl: string; sessionName: string; contactId: string; timeoutMs?: number },
): Promise<string | undefined> {
  try {
    const query = `contactId=${encodeURIComponent(target.contactId)}&session=${encodeURIComponent(target.sessionName)}`;
    const response = await wahaRequest(apiKey, fetchFn, {
      baseUrl: target.baseUrl,
      path: `/api/contacts/profile-picture?${query}`,
      method: "GET",
      timeoutMs: target.timeoutMs ?? 10_000,
    });
    const body = response.body as { profilePictureURL?: string | null } | null;
    const url = (body?.profilePictureURL ?? "").trim();
    return url.length > 0 ? url : undefined;
  } catch (err) {
    if (err instanceof WhatsAppProviderError && err.code === "NOT_FOUND") {
      return undefined;
    }
    throw err;
  }
}
