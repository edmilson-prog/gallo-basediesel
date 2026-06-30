// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/import/history-core.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Evolution Go (whatsmeow) HistorySync ingestion core (Phase 2 Etapa B).
 *
 * Turns the raw HistorySync chunks captured at device pairing into the same
 * normalized records the Evolution import already lands. Two jobs:
 *
 *  1. `normalizeWhatsmeowRecord` — one WebMessageInfo → INormalizedRecord
 *     (reusing the whatsmeow content extractor), with the SAME guards as the
 *     Evolution `normalizeRecord` (no key.id / insane timestamp / empty stub).
 *  2. `createHistoryAggregator` — folds many chunks into one importable set:
 *     dedup messages by id across chunks, RESOLVE `@lid` privacy chats to a
 *     real phone via the chunks' own `phoneNumberToLidMappings`, merge by
 *     resolved phone, and skip groups/broadcasts/unresolvable-lid.
 *
 * The landing itself is shared with the Evolution import (`landNormalizedChat`
 * in ./core), so customer/conversation resolution, idempotency and the pool
 * rule are identical across both paths.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { extractContent, jidToE164, type IGoMessageBody } from "../evolution-go/parser.ts";
import type { INormalizedRecord } from "./core.ts";
import { MEDIA_DISCRIMINATOR_TYPES } from "../types.ts";

// ===== Captured payload shapes (subset we consume) ===========================

interface IGoWebMessageInfo {
  // whatsmeow serializes the message key with a capital `ID` (and `remoteJID`),
  // while `fromMe` stays camelCase. Accept both casings defensively.
  key?: { ID?: string; id?: string; fromMe?: boolean; remoteJID?: string; remoteJid?: string };
  messageTimestamp?: string | number;
  message?: IGoMessageBody;
}

interface IGoConversation {
  ID?: string;
  name?: string;
  messages?: Array<{ message?: IGoWebMessageInfo }>;
}

/** One HistorySync chunk = `request_payload.data.Data`. */
export interface IGoHistoryChunk {
  syncType?: number;
  conversations?: IGoConversation[];
  phoneNumberToLidMappings?: Array<{ lidJID?: string; pnJID?: string }>;
}

// ===== Public output =========================================================

export interface IGoHistoryItem {
  /** E.164 phone of the resolved 1:1 contact. */
  phone: string;
  /** Display name from the conversation, when present. */
  name: string | null;
  messages: INormalizedRecord[];
}

export interface IGoAggregateStats {
  /** Distinct `@s.whatsapp.net` conversations seen. */
  individualChats: number;
  /** Distinct `@lid` conversations resolved to a phone via the mapping. */
  lidResolved: number;
  /** Distinct `@lid` conversations with no mapping (unimportable). */
  lidUnresolved: number;
  groups: number;
  broadcasts: number;
  /** Total messages across the produced items (after dedup). */
  totalMessages: number;
}

// ===== Constants =============================================================

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ===== Record normalization ==================================================

/**
 * WebMessageInfo → flat normalized row; null for un-importable records (mirrors
 * the Evolution `normalizeRecord` guards):
 * - no `key.id` (protocol/system stubs without a stable identifier);
 * - no valid second-epoch timestamp (missing clock, or a ms/µs epoch that would
 *   land decades in the future and pin the chat to the top of the inbox);
 * - empty / unrecognised body (contentType "unknown" with no text).
 * Imported status is derived (no live ack in history): out → "sent", in →
 * "delivered".
 */
export function normalizeWhatsmeowRecord(webMessageInfo: unknown): INormalizedRecord | null {
  const wmi = webMessageInfo as IGoWebMessageInfo | null;
  const providerMessageId = wmi?.key?.ID ?? wmi?.key?.id;
  if (!providerMessageId) return null;

  const tsNum = Number(wmi?.messageTimestamp);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return null;
  if (tsNum * 1000 > Date.now() + ONE_DAY_MS) return null;

  const content = extractContent(wmi?.message ?? {});
  if (content.contentType === "unknown" && !content.text) return null;

  const text = content.text ?? content.mediaCaption ?? "";
  const mediaType = (MEDIA_DISCRIMINATOR_TYPES as readonly string[]).includes(content.contentType)
    ? content.contentType
    : null;
  const direction: "in" | "out" = wmi?.key?.fromMe ? "out" : "in";
  const status: INormalizedRecord["status"] = direction === "out" ? "sent" : "delivered";

  return {
    providerMessageId,
    direction,
    text,
    mediaType,
    status,
    sentAt: new Date(tsNum * 1000).toISOString(),
  };
}

// ===== Aggregator ============================================================

type ChatKind = "individual" | "lid" | "group" | "broadcast" | "other";

function classifyJid(jid: string): ChatKind {
  if (jid.endsWith("@s.whatsapp.net")) return "individual";
  if (jid.endsWith("@lid")) return "lid";
  if (jid.endsWith("@g.us")) return "group";
  if (jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return "broadcast";
  return "other";
}

interface IChatAccumulator {
  name: string | null;
  byId: Map<string, INormalizedRecord>;
}

export interface IHistoryAggregator {
  /** Fold one chunk (`data.Data`) into the running state. */
  addChunk(chunk: IGoHistoryChunk): void;
  /** Resolve @lid, merge by phone, and emit the importable items + stats. */
  finalize(): { items: IGoHistoryItem[]; stats: IGoAggregateStats };
}

/**
 * Incremental so the Edge Function can stream chunks (each up to several MB)
 * one at a time without ever holding the whole 20-chunk / ~24 MB payload in
 * memory. `@lid` resolution is deferred to `finalize` because a conversation's
 * mapping may arrive in a different chunk than the conversation itself.
 */
export function createHistoryAggregator(): IHistoryAggregator {
  const lidMap = new Map<string, string>(); // lidJID → pnJID (@s.whatsapp.net)
  const convs = new Map<string, IChatAccumulator>(); // keyed by RAW jid (individual + lid)
  const skipped = {
    group: new Set<string>(),
    broadcast: new Set<string>(),
    other: new Set<string>(),
  };

  function accFor(rawJid: string, name: string | undefined): IChatAccumulator {
    let entry = convs.get(rawJid);
    if (!entry) {
      entry = { name: name?.trim() || null, byId: new Map() };
      convs.set(rawJid, entry);
    } else if (!entry.name && name?.trim()) {
      entry.name = name.trim();
    }
    return entry;
  }

  return {
    addChunk(chunk) {
      for (const m of chunk.phoneNumberToLidMappings ?? []) {
        const lid = m?.lidJID;
        const pn = m?.pnJID;
        if (lid && pn && pn.endsWith("@s.whatsapp.net")) lidMap.set(lid, pn);
      }
      for (const conv of chunk.conversations ?? []) {
        const rawJid = conv?.ID;
        if (!rawJid) continue;
        const kind = classifyJid(rawJid);
        if (kind === "group" || kind === "broadcast" || kind === "other") {
          skipped[kind].add(rawJid);
          continue;
        }
        const entry = accFor(rawJid, conv?.name);
        for (const wrapper of conv?.messages ?? []) {
          const rec = normalizeWhatsmeowRecord(wrapper?.message);
          if (rec && !entry.byId.has(rec.providerMessageId)) {
            entry.byId.set(rec.providerMessageId, rec);
          }
        }
      }
    },

    finalize() {
      const byPhone = new Map<string, IChatAccumulator>();
      let individualChats = 0;
      let lidResolved = 0;
      let lidUnresolved = 0;

      for (const [rawJid, entry] of convs) {
        let resolvedJid: string;
        if (classifyJid(rawJid) === "individual") {
          individualChats++;
          resolvedJid = rawJid;
        } else {
          const pn = lidMap.get(rawJid);
          if (!pn) {
            lidUnresolved++;
            continue;
          }
          lidResolved++;
          resolvedJid = pn;
        }

        const phone = jidToE164(resolvedJid);
        if (!phone) continue;

        let dest = byPhone.get(phone);
        if (!dest) {
          dest = { name: entry.name, byId: new Map() };
          byPhone.set(phone, dest);
        } else if (!dest.name && entry.name) {
          dest.name = entry.name;
        }
        for (const [id, rec] of entry.byId) {
          if (!dest.byId.has(id)) dest.byId.set(id, rec);
        }
      }

      const items: IGoHistoryItem[] = [];
      let totalMessages = 0;
      for (const [phone, dest] of byPhone) {
        const messages = [...dest.byId.values()];
        if (messages.length === 0) continue;
        items.push({ phone, name: dest.name, messages });
        totalMessages += messages.length;
      }

      return {
        items,
        stats: {
          individualChats,
          lidResolved,
          lidUnresolved,
          groups: skipped.group.size,
          broadcasts: skipped.broadcast.size,
          totalMessages,
        },
      };
    },
  };
}
