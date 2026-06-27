/**
 * Evolution Go contacts (GET /user/contacts → whatsmeow GetAllContacts).
 * Instance-scoped: authed by the per-instance TOKEN (passed as `apiKey`).
 * Runtime-agnostic: relative imports, Web APIs only.
 *
 * Go is the only engine that exposes a synchronous contact list — classic
 * Evolution has no equivalent here. Consumed server-side by the
 * `whatsapp-import-contacts` Edge Function through the `_shared` mirror.
 */

import { E164_REGEX, toE164 } from "../phone";
import type { IEngineDeps } from "../types";
import { goRequest } from "./client";
import type { IGoInstanceTarget } from "./instance";

/** One /user/contacts record (whatsmeow ContactInfo), tolerant of Go's casing. */
interface IGoContactRecord {
  Jid?: string;
  jid?: string;
  FullName?: string;
  fullName?: string;
  FirstName?: string;
  firstName?: string;
  PushName?: string;
  pushName?: string;
  BusinessName?: string;
  businessName?: string;
}

/** A WhatsApp contact normalized to what the CRM stores. */
export interface IGoContact {
  /** E.164 with the leading +. */
  phone: string;
  /** Best available display name, or undefined when the contact has none. */
  name?: string;
}

/** Only individual 1:1 chats — groups/broadcasts/newsletters/@lid have no phone. */
const INDIVIDUAL_JID = /@s\.whatsapp\.net$/;

/** Prefer the fullest human name; ignore whitespace-only values. */
function pickName(record: IGoContactRecord): string | undefined {
  const candidate =
    record.FullName ??
    record.fullName ??
    record.PushName ??
    record.pushName ??
    record.BusinessName ??
    record.businessName ??
    record.FirstName ??
    record.firstName;
  const trimmed = typeof candidate === "string" ? candidate.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalize the response container to a flat record list. The documented shape
 * is `{ data: [ { Jid, ... } ] }`, but whatsmeow's native type is a
 * `map[JID]ContactInfo` — some builds serialize the map as an object keyed by
 * jid. Tolerate both (the object case injects the key as `Jid`).
 */
function toRecordList(body: unknown): IGoContactRecord[] {
  const container =
    body && typeof body === "object" && !Array.isArray(body)
      ? ((body as { data?: unknown; contacts?: unknown }).data ??
        (body as { contacts?: unknown }).contacts)
      : body;
  if (Array.isArray(container)) return container as IGoContactRecord[];
  if (container && typeof container === "object") {
    return Object.entries(container as Record<string, unknown>).map(([jid, info]) => ({
      Jid: jid,
      ...(info as IGoContactRecord),
    }));
  }
  return [];
}

/**
 * GET /user/contacts — every contact the instance has in its whatsmeow store.
 * Returns only individual contacts with a valid E.164 phone (groups, broadcasts,
 * newsletters and @lid privacy contacts are dropped — no resolvable number),
 * de-duplicated by phone. Best-effort: a non-2xx / network error / unparseable
 * body resolves to [] so the importer never aborts the whole run.
 */
export async function fetchGoContacts(
  apiKey: string,
  deps: IEngineDeps,
  target: IGoInstanceTarget,
  traceId?: string,
): Promise<IGoContact[]> {
  const response = await goRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: "/user/contacts",
    method: "GET",
    timeoutMs: 20_000,
    traceId,
  }).catch(() => null);
  if (!response) return [];

  const byPhone = new Map<string, IGoContact>();
  for (const record of toRecordList(response.body)) {
    const jid = record.Jid ?? record.jid ?? "";
    if (!INDIVIDUAL_JID.test(jid)) continue;
    const phone = toE164(jid.split("@")[0]?.split(":")[0] ?? "");
    if (!E164_REGEX.test(phone)) continue;
    if (byPhone.has(phone)) continue;
    byPhone.set(phone, { phone, name: pickName(record) });
  }
  return [...byPhone.values()];
}
