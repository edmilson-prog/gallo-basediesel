// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/evolution/instance.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

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

import { WhatsAppProviderError } from "../errors.ts";
import { toE164 } from "../phone.ts";
import type { IEngineDeps } from "../types.ts";
import { evolutionRequest } from "./client.ts";
import type { IEvolutionRawMessage } from "./parser.ts";

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
    omitResponsePayload: true,
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
    const v1 = (
      raw as { instance?: { instanceName?: string; owner?: string; profileName?: string } } | null
    )?.instance;
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

/** DELETE /instance/delete — removes the instance from the Evolution server. */
export async function deleteInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<void> {
  await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/instance/delete/${target.instanceName}`,
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

/**
 * POST /instance/create — provisions a new Evolution instance on the server
 * (multi-instance: same server, one apikey — see the multi-instance design).
 * `syncFullHistory: true` is set by default so the instance pulls its complete
 * chat history at QR-scan time (the flag must be on BEFORE pairing — create runs
 * before the QR is issued, so this is the right moment to set it).
 * Idempotent for the pairing flow: a "name already in use" response means the
 * instance already exists, which we treat as success so re-running the QR flow
 * never fails. Any other error (bad apikey, server down) propagates.
 */
export async function createInstance(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<void> {
  try {
    await evolutionRequest(apiKey, deps, {
      baseUrl: target.baseUrl,
      path: "/instance/create",
      json: {
        instanceName: target.instanceName,
        qrcode: false,
        integration: "WHATSAPP-BAILEYS",
        syncFullHistory: true,
      },
      traceId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    if (message.includes("already in use") || message.includes("already exists")) return;
    throw err;
  }
}

// ===== Chat history (real-inbox import — spec 2026-06-11) ===================

export interface IEvolutionChatSummary {
  remoteJid: string;
  /** Chat counterpart's WhatsApp profile name (pushName), when the build sends it. */
  name?: string;
}

/** One message as stored by the Evolution instance DB. */
export interface IEvolutionStoredMessage {
  key?: { id?: string; remoteJid?: string; fromMe?: boolean };
  message?: IEvolutionRawMessage;
  messageTimestamp?: number | string;
  /** Baileys ack label (SERVER_ACK/DELIVERY_ACK/READ/...) when stored. */
  status?: string;
}

export interface IFindMessagesPage {
  records: IEvolutionStoredMessage[];
  /** Total pages when the build reports it; undefined → stop on empty page. */
  pages?: number;
}

/** Evolution page-size param (`offset` doubles as records per page on v2). */
export const EVOLUTION_HISTORY_PAGE_SIZE = 100;

/**
 * POST /chat/findChats — every chat the instance has stored. Response shapes
 * vary across builds (flat array | {chats} | {records}); jid-less entries are
 * dropped. Payload logging is omitted (PII: full chat list).
 */
export async function findChats(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IEvolutionChatSummary[]> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/findChats/${target.instanceName}`,
    json: { where: {} },
    timeoutMs: 30_000,
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as unknown[] | { chats?: unknown[]; records?: unknown[] } | null;
  const list = Array.isArray(body)
    ? body
    : Array.isArray(body?.chats)
      ? body.chats
      : Array.isArray(body?.records)
        ? body.records
        : [];
  if (list.length === 0 && body !== null && !Array.isArray(body)) {
    // Surface unknown response shapes in integration_logs — the payload itself
    // is omitted (PII), so the key list is the only diagnosable trace.
    await deps.logIntegration?.({
      integrationName: "whatsapp_evolution",
      direction: "outbound",
      endpoint: `/chat/findChats/${target.instanceName}`,
      latencyMs: 0,
      traceId,
      errorMessage: `findChats: unrecognised response shape — keys: ${Object.keys(body as object).join(", ")}`,
    });
  }
  const out: IEvolutionChatSummary[] = [];
  for (const raw of list) {
    const candidate = raw as {
      remoteJid?: string;
      id?: string;
      pushName?: string;
      name?: string;
    } | null;
    const jid = candidate?.remoteJid ?? candidate?.id;
    if (typeof jid !== "string" || !jid.includes("@")) continue;
    const rawName = candidate?.pushName ?? candidate?.name;
    const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : undefined;
    out.push({ remoteJid: jid, name });
  }
  return out;
}

/**
 * POST /chat/findMessages — one page of a chat's stored messages. `offset`
 * doubles as page size on v2 builds; older builds return a bare array.
 * Payload logging is omitted (PII: message bodies).
 */
export async function findMessages(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  remoteJid: string,
  page: number,
  traceId?: string,
): Promise<IFindMessagesPage> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/findMessages/${target.instanceName}`,
    json: { where: { key: { remoteJid } }, page, offset: EVOLUTION_HISTORY_PAGE_SIZE },
    timeoutMs: 30_000,
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as
    | unknown[]
    | { messages?: { records?: unknown[]; pages?: number } }
    | null;
  if (Array.isArray(body)) return { records: body as IEvolutionStoredMessage[] };
  const nested = body?.messages;
  return {
    records: (nested?.records as IEvolutionStoredMessage[] | undefined) ?? [],
    pages: typeof nested?.pages === "number" ? nested.pages : undefined,
  };
}

// ===== Contact profile photo (avatar sync) =================================

/**
 * POST /chat/fetchProfilePictureUrl — the contact's WhatsApp profile photo URL,
 * or null when the contact has no public photo (privacy), isn't on WhatsApp, or
 * the build can't resolve it. Best-effort by design: any non-2xx, network error
 * or unrecognised shape resolves to null so a bulk avatar sync never aborts on a
 * single contact. `number` is wire format (E.164 without the leading +).
 */
export async function fetchProfilePictureUrl(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  number: string,
  traceId?: string,
): Promise<string | null> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/fetchProfilePictureUrl/${target.instanceName}`,
    json: { number },
    timeoutMs: 15_000,
    traceId,
  }).catch(() => null);
  if (!response) return null;
  // Evolution v2 returns `profilePictureUrl`; some builds use `profilePicUrl`.
  const body = response.body as {
    profilePictureUrl?: string | null;
    profilePicUrl?: string | null;
  } | null;
  const url = body?.profilePictureUrl ?? body?.profilePicUrl;
  return typeof url === "string" && url.length > 0 ? url : null;
}

// ===== Contacts (name backfill — heal phone-named customers) ================

export interface IEvolutionContact {
  /** E.164 of the contact (device suffix stripped), derived from the jid. */
  phone: string;
  /** WhatsApp profile name (pushName / name / verifiedName), when present. */
  name?: string;
}

/** Individual-chat jids only — group, broadcast, newsletter and @lid excluded. */
const INDIVIDUAL_CONTACT_JID = /@(s\.whatsapp\.net|c\.us)$/;

/**
 * POST /chat/findContacts — every contact the instance has stored, paired with
 * its WhatsApp profile name (pushName). Used to backfill customers that were
 * auto-created named after their bare phone number. Response shapes vary across
 * builds (flat array | {contacts} | {records}); non-individual jids (group /
 * broadcast / newsletter / @lid) are dropped. Payload logging is omitted
 * (PII: the full contact list).
 */
export async function findContacts(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IEvolutionContact[]> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/findContacts/${target.instanceName}`,
    json: { where: {} },
    timeoutMs: 30_000,
    omitResponsePayload: true,
    traceId,
  });
  const body = response.body as unknown[] | { contacts?: unknown[]; records?: unknown[] } | null;
  const list = Array.isArray(body)
    ? body
    : Array.isArray(body?.contacts)
      ? body.contacts
      : Array.isArray(body?.records)
        ? body.records
        : [];
  if (list.length === 0 && body !== null && !Array.isArray(body)) {
    await deps.logIntegration?.({
      integrationName: "whatsapp_evolution",
      direction: "outbound",
      endpoint: `/chat/findContacts/${target.instanceName}`,
      latencyMs: 0,
      traceId,
      errorMessage: `findContacts: unrecognised response shape — keys: ${Object.keys(body as object).join(", ")}`,
    });
  }
  const out: IEvolutionContact[] = [];
  for (const raw of list) {
    const candidate = raw as {
      id?: string;
      remoteJid?: string;
      pushName?: string;
      name?: string;
      verifiedName?: string;
    } | null;
    const jid = candidate?.remoteJid ?? candidate?.id;
    if (typeof jid !== "string" || !INDIVIDUAL_CONTACT_JID.test(jid)) continue;
    const phone = jidToPhone(jid);
    if (!phone) continue;
    const rawName = candidate?.pushName ?? candidate?.name ?? candidate?.verifiedName;
    const name =
      typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : undefined;
    out.push({ phone, name });
  }
  return out;
}

/**
 * Contacts derived from the instance's CHAT list (not the Contact table). The
 * chat list covers everyone the instance has a conversation with — far broader
 * than findContacts on builds that don't persist the Contact table — and each
 * chat usually carries the counterpart's pushName. Non-individual jids (group /
 * broadcast / newsletter / @lid) are dropped.
 */
export async function findContactsFromChats(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  traceId?: string,
): Promise<IEvolutionContact[]> {
  const chats = await findChats(apiKey, deps, target, traceId);
  const out: IEvolutionContact[] = [];
  for (const chat of chats) {
    if (!INDIVIDUAL_CONTACT_JID.test(chat.remoteJid)) continue;
    const phone = jidToPhone(chat.remoteJid);
    if (!phone) continue;
    out.push({ phone, name: chat.name });
  }
  return out;
}

// ===== Number check (does this number have a WhatsApp account?) =============

export interface IWhatsAppNumberCheck {
  /** Wire-format number queried (E.164 without the leading +). */
  input: string;
  /** Whether the number has a WhatsApp account. */
  exists: boolean;
  /** Canonical E.164 the WhatsApp network reports (from the jid), when exists. */
  e164?: string;
}

/**
 * Parses POST /chat/whatsappNumbers defensively. Builds return either a flat
 * array of OnWhatsAppDto ({ jid, exists, number }) or a nested { onWhatsapp:[…] }.
 * When `exists`, the canonical number is read from the `jid` (it carries the
 * WhatsApp-corrected 9th digit — the input may differ).
 */
export function parseWhatsAppNumbers(body: unknown): IWhatsAppNumberCheck[] {
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { onWhatsapp?: unknown[] })?.onWhatsapp)
      ? (body as { onWhatsapp: unknown[] }).onWhatsapp
      : [];
  const out: IWhatsAppNumberCheck[] = [];
  for (const raw of list) {
    const c = raw as { jid?: string; exists?: boolean; number?: string } | null;
    const exists = c?.exists === true;
    out.push({
      input: typeof c?.number === "string" ? c.number : "",
      exists,
      e164: exists ? jidToPhone(c?.jid) : undefined,
    });
  }
  return out;
}

/**
 * POST /chat/whatsappNumbers — asks the instance which of `numbers` (wire format)
 * have a WhatsApp account. ON-DEMAND ONLY: bulk scanning risks an account ban
 * (Evolution issue #2228). Errors propagate (caller decides whether to skip).
 */
export async function checkWhatsAppNumbers(
  apiKey: string,
  deps: IEngineDeps,
  target: IEvolutionInstanceTarget,
  numbers: string[],
  traceId?: string,
): Promise<IWhatsAppNumberCheck[]> {
  const response = await evolutionRequest(apiKey, deps, {
    baseUrl: target.baseUrl,
    path: `/chat/whatsappNumbers/${target.instanceName}`,
    json: { numbers },
    timeoutMs: 15_000,
    traceId,
  });
  return parseWhatsAppNumbers(response.body);
}
