/**
 * Evolution history import core (real-inbox spec 2026-06-11).
 *
 * Pure batch processor: pages through the chats an Evolution instance has
 * stored and lands them as customers/conversations/messages. Both the data
 * source ({@link IImportSource}) and the persistence ({@link IImportDb}) are
 * injected, so this module is fully unit-testable; the `whatsapp-import-history`
 * Edge Function wires the Evolution REST helpers + a service_role adapter.
 *
 * Idempotency: provider_message_id is the dedup key — re-running an import
 * never duplicates and resumes after a mid-batch failure.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { EVOLUTION_ACK_STATUS_MAP, extractEvolutionContent, jidToE164 } from "../evolution/parser";
import type { IEvolutionStoredMessage } from "../evolution/instance";

// ===== Stats =================================================================

export interface IImportStats {
  chatsProcessed: number;
  /** Real WhatsApp groups (`@g.us`) — never a 1:1 customer. */
  chatsSkippedGroup: number;
  /** Broadcast lists / status (`@broadcast`) and channels (`@newsletter`). */
  chatsSkippedBroadcast: number;
  /**
   * `@lid` privacy contacts: individual 1:1 chats whose phone number WhatsApp
   * hides. Counted apart from groups on purpose — these are REAL conversations
   * we cannot yet import (no resolvable number), not groups.
   */
  chatsSkippedLid: number;
  /** Any other non-individual JID suffix (forward-compat catch-all). */
  chatsSkippedOther: number;
  /** Chats whose import threw — the cursor advances past them (resilience). */
  chatsFailed: number;
  customersCreated: number;
  conversationsCreated: number;
  messagesImported: number;
  messagesSkipped: number;
}

export function emptyImportStats(): IImportStats {
  return {
    chatsProcessed: 0,
    chatsSkippedGroup: 0,
    chatsSkippedBroadcast: 0,
    chatsSkippedLid: 0,
    chatsSkippedOther: 0,
    chatsFailed: 0,
    customersCreated: 0,
    conversationsCreated: 0,
    messagesImported: 0,
    messagesSkipped: 0,
  };
}

// ===== Public interfaces =====================================================

export interface IImportBatchResult {
  done: boolean;
  /** Offset of the next un-processed chat in the sorted jid list. */
  nextCursor: number;
  stats: IImportStats;
}

export interface IImportAccount {
  id: string;
  storeId: string;
}

/** Evolution-side reads, wired by the Edge Function with the apikey resolved. */
export interface IImportSource {
  /** remoteJids of every chat the instance has stored. */
  listChats(): Promise<string[]>;
  listMessages(
    remoteJid: string,
    page: number,
  ): Promise<{ records: IEvolutionStoredMessage[]; pages?: number }>;
}

/** Injected persistence surface — service_role adapter in the Edge Function. */
export interface IImportDb {
  findCustomerByPhone(
    storeId: string,
    phoneDigits: string,
  ): Promise<{ id: string; sellerId: string } | null>;
  resolveDefaultSellerId(storeId: string): Promise<string>;
  createPendingCustomer(input: {
    storeId: string;
    phone: string;
    sellerId: string;
  }): Promise<{ id: string; sellerId: string }>;
  findOpenConversation(customerId: string, accountId: string): Promise<{ id: string } | null>;
  createConversation(input: {
    storeId: string;
    customerId: string;
    accountId: string;
    assignedSellerId: string | null;
    status: "em_andamento";
    createdAt: string;
    lastMessageAt: string;
  }): Promise<{ id: string }>;
  /** Returns the subset of `ids` that ALREADY exist in messages (dedup). */
  filterKnownProviderMessageIds(ids: string[]): Promise<Set<string>>;
  /** Bulk insert — the adapter chunks (~500/insert) and ignores conflicts. */
  insertImportedMessages(
    rows: Array<{
      conversationId: string;
      direction: "in" | "out";
      /** customerId for inbound; null for outbound (author unknown on phone). */
      authorId: string | null;
      text: string;
      mediaType: string | null;
      status: "sent" | "delivered" | "read" | "failed";
      providerMessageId: string;
      sentAt: string;
    }>,
  ): Promise<void>;
  /** Moves conversations.last_message_at forward only (never backwards). */
  advanceConversationActivity(conversationId: string, lastMessageAt: string): Promise<void>;
}

// ===== Internal types ========================================================

interface INormalizedRecord {
  providerMessageId: string;
  direction: "in" | "out";
  text: string;
  mediaType: string | null;
  status: "sent" | "delivered" | "read" | "failed";
  sentAt: string;
}

// ===== Constants =============================================================

/** Only 1:1 individual chats — groups, broadcasts, newsletters, lids are skipped. */
const INDIVIDUAL_JID = /@s\.whatsapp\.net$/;

/**
 * Bucket a non-individual chat JID by its WhatsApp address type. Reported
 * separately in the import summary so `@lid` (real contacts WhatsApp hides
 * behind a privacy id) are never miscounted as "groups".
 */
function classifyChatJid(remoteJid: string): "group" | "broadcast" | "lid" | "other" {
  if (remoteJid.endsWith("@g.us")) return "group";
  if (remoteJid.endsWith("@broadcast") || remoteJid.endsWith("@newsletter")) return "broadcast";
  if (remoteJid.endsWith("@lid")) return "lid";
  return "other";
}

const BATCH_CHATS_DEFAULT = 10;

/** Runaway guard: 50 pages × ~100 records ≈ 5 k messages per chat. */
const MAX_MESSAGE_PAGES_PER_CHAT = 50;

const MEDIA_TYPES = ["image", "audio", "video", "document"] as const;

// ===== Helpers ===============================================================

/**
 * Stored record → flat normalized row; returns null for un-importable records:
 * - no key.id (protocol/system stubs without a stable identifier)
 * - no valid second-epoch timestamp (missing clock or ms/µs epoch — a wrong
 *   "now-ish"/future sentAt would pin the conversation to the top of the
 *   inbox forever, since last_message_at only ever advances)
 * - message body is empty / unrecognised (contentType "unknown" with no text)
 */
function normalizeRecord(record: IEvolutionStoredMessage): INormalizedRecord | null {
  const providerMessageId = record.key?.id;
  if (!providerMessageId) return null;

  const tsNum = Number(record.messageTimestamp);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return null; // stored stubs have no clock
  // ms/µs epochs (13+ digits) would land decades in the future and pin the
  // conversation to the top of the inbox — reject anything > now + 24h.
  if (tsNum * 1000 > Date.now() + 24 * 60 * 60 * 1000) return null;

  const content = extractEvolutionContent(record.message ?? {});

  // Unknown content type with no extractable text = protocol stub — skip.
  if (content.contentType === "unknown" && !content.text) return null;

  const text = content.text ?? content.mediaCaption ?? "";
  const mediaType = (MEDIA_TYPES as readonly string[]).includes(content.contentType)
    ? content.contentType
    : null;
  const direction: "in" | "out" = record.key?.fromMe ? "out" : "in";
  // Some Baileys builds store the ack as a NUMBER — String() before uppercasing.
  const status: "sent" | "delivered" | "read" | "failed" =
    direction === "out"
      ? (EVOLUTION_ACK_STATUS_MAP[String(record.status ?? "").toUpperCase()] ?? "sent")
      : "delivered";

  return {
    providerMessageId,
    direction,
    text,
    mediaType,
    status,
    sentAt: new Date(tsNum * 1000).toISOString(),
  };
}

// ===== Core export ===========================================================

/**
 * Process one batch of chats from the Evolution instance's stored history.
 *
 * A stable cursor (offset into the sorted jid list) allows resuming across
 * invocations. Pass `cursor` from the previous result's `nextCursor` to
 * continue; omit (or pass 0) to start from the beginning.
 */
export async function processImportBatch(args: {
  account: IImportAccount;
  source: IImportSource;
  db: IImportDb;
  /** Chat offset into the sorted jid list (stable across calls). */
  cursor?: number;
  batchSize?: number;
  warn?: (msg: string, fields?: Record<string, unknown>) => void;
}): Promise<IImportBatchResult> {
  const { account, source, db } = args;
  const warn = args.warn ?? (() => {});
  const stats = emptyImportStats();

  // Sort for a stable cursor across calls (Evolution ordering is not guaranteed stable).
  const allChats = (await source.listChats()).slice().sort();
  const cursor = Number.isFinite(args.cursor) ? Math.max(0, Math.floor(args.cursor as number)) : 0;
  const batchSize = Math.max(1, Math.floor(args.batchSize ?? BATCH_CHATS_DEFAULT));
  const batch = allChats.slice(cursor, cursor + batchSize);

  for (const remoteJid of batch) {
    if (!INDIVIDUAL_JID.test(remoteJid)) {
      switch (classifyChatJid(remoteJid)) {
        case "group":
          stats.chatsSkippedGroup++;
          break;
        case "broadcast":
          stats.chatsSkippedBroadcast++;
          break;
        case "lid":
          stats.chatsSkippedLid++;
          break;
        case "other":
          stats.chatsSkippedOther++;
          break;
      }
      continue;
    }
    // A poisoned chat (malformed records, transient REST failure) must never
    // wedge the cursor — count it, warn, and move on; a re-run picks it up.
    try {
      await importChat(remoteJid, account, source, db, stats, warn);
      stats.chatsProcessed++;
    } catch (error) {
      stats.chatsFailed++;
      warn("import chat failed — cursor advances past it", {
        remoteJid,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const nextCursor = cursor + batch.length;
  return { done: nextCursor >= allChats.length, nextCursor, stats };
}

// ===== Private helpers =======================================================

async function importChat(
  remoteJid: string,
  account: IImportAccount,
  source: IImportSource,
  db: IImportDb,
  stats: IImportStats,
  warn: (msg: string, fields?: Record<string, unknown>) => void,
): Promise<void> {
  // 1. Collect every stored page (bounded by the runaway guard).
  //    Some Evolution builds ignore page/offset and always answer the same
  //    page — detect via id overlap with the previous page and stop early.
  const records: IEvolutionStoredMessage[] = [];
  let prevPageIds = new Set<string>();

  for (let page = 1; page <= MAX_MESSAGE_PAGES_PER_CHAT; page++) {
    const result = await source.listMessages(remoteJid, page);

    // Build the id set for this page to detect non-paginating servers.
    const thisPageIds = new Set(
      result.records.map((r) => r.key?.id).filter((id): id is string => Boolean(id)),
    );

    // If page > 1 and every id on this page was already in the previous page,
    // the server is repeating itself — discard and stop (do NOT push to records).
    if (page > 1 && thisPageIds.size > 0 && [...thisPageIds].every((id) => prevPageIds.has(id))) {
      warn("findMessages returned an identical page — non-paginating build, stopping", {
        remoteJid,
      });
      break;
    }

    prevPageIds = thisPageIds;
    records.push(...result.records);

    // Stop when the server reports we have reached the last page, or when it
    // returns an empty page (older builds without `pages`).
    const lastPage =
      result.pages !== undefined ? page >= result.pages : result.records.length === 0;
    if (lastPage) break;

    if (page === MAX_MESSAGE_PAGES_PER_CHAT) {
      warn("import chat page cap reached — older messages skipped", { remoteJid });
    }
  }

  // 2. Normalize + deduplicate (idempotency: provider_message_id is the key).
  //    The Map also dedups IN-MEMORY: partially overlapping pages (sliding
  //    windows) slip past the identical-page guard and repeat ids within the
  //    same batch — the DB filter below only sees what already landed.
  const byId = new Map<string, INormalizedRecord>();
  for (const record of records) {
    const row = normalizeRecord(record);
    if (!row) {
      stats.messagesSkipped++;
      continue;
    }
    if (byId.has(row.providerMessageId)) {
      stats.messagesSkipped++;
      continue;
    }
    byId.set(row.providerMessageId, row);
  }
  const normalized = [...byId.values()];
  if (normalized.length === 0) return; // nothing renderable — also avoids filterKnown([])

  const known = await db.filterKnownProviderMessageIds(normalized.map((r) => r.providerMessageId));
  const fresh = normalized.filter((r) => !known.has(r.providerMessageId));
  stats.messagesSkipped += normalized.length - fresh.length;

  // Nothing new — never create empty conversations or phantom customers.
  if (fresh.length === 0) return;

  // 3. Resolve customer (same phone-matching rules as the webhook core).
  const phone = jidToE164(remoteJid);
  const phoneDigits = phone.replace(/\D/g, "");
  let customer = await db.findCustomerByPhone(account.storeId, phoneDigits);
  if (!customer) {
    const sellerId = await db.resolveDefaultSellerId(account.storeId);
    customer = await db.createPendingCustomer({ storeId: account.storeId, phone, sellerId });
    stats.customersCreated++;
  }

  // 4. Resolve conversation; created ones span the full imported window.
  //    ISO 8601 lexicographic sort is correct for UTC timestamps.
  const timestamps = fresh.map((r) => r.sentAt).sort();
  const oldest = timestamps[0] as string;
  const newest = timestamps[timestamps.length - 1] as string;

  let conversation = await db.findOpenConversation(customer.id, account.id);
  if (!conversation) {
    conversation = await db.createConversation({
      storeId: account.storeId,
      customerId: customer.id,
      accountId: account.id,
      assignedSellerId: customer.sellerId,
      status: "em_andamento",
      createdAt: oldest,
      lastMessageAt: newest,
    });
    stats.conversationsCreated++;
  }

  // 5. Land the messages in ONE bulk call — sequential per-row inserts blow
  //    the Edge Function wall-clock on large histories; the adapter chunks.
  //    Media is NOT downloaded during import (spec §3): the import only
  //    stores the text/caption; a separate job can fetch media.
  const conversationId = conversation.id;
  const rows = fresh.map((row) => ({
    conversationId,
    direction: row.direction,
    authorId: row.direction === "in" ? customer.id : null,
    text: row.text,
    mediaType: row.mediaType,
    status: row.status,
    providerMessageId: row.providerMessageId,
    sentAt: row.sentAt,
  }));
  await db.insertImportedMessages(rows);
  stats.messagesImported += rows.length;

  await db.advanceConversationActivity(conversationId, newest);
}
