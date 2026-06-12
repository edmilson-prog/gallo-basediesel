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

import {
  EVOLUTION_ACK_STATUS_MAP,
  extractEvolutionContent,
  jidToE164,
  timestampToIso,
} from "../evolution/parser";
import type { IEvolutionStoredMessage } from "../evolution/instance";

// ===== Stats =================================================================

export interface IImportStats {
  chatsProcessed: number;
  chatsSkippedGroup: number;
  customersCreated: number;
  conversationsCreated: number;
  messagesImported: number;
  messagesSkipped: number;
}

export function emptyImportStats(): IImportStats {
  return {
    chatsProcessed: 0,
    chatsSkippedGroup: 0,
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
  insertImportedMessage(input: {
    conversationId: string;
    direction: "in" | "out";
    /** customerId for inbound; null for outbound (author unknown on phone). */
    authorId: string | null;
    text: string;
    mediaType: string | null;
    status: "sent" | "delivered" | "read" | "failed";
    providerMessageId: string;
    sentAt: string;
  }): Promise<void>;
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

const BATCH_CHATS_DEFAULT = 10;

/** Runaway guard: 50 pages × ~100 records ≈ 5 k messages per chat. */
const MAX_MESSAGE_PAGES_PER_CHAT = 50;

const MEDIA_TYPES = ["image", "audio", "video", "document"] as const;

// ===== Helpers ===============================================================

/**
 * Stored record → flat normalized row; returns null for un-importable records:
 * - no key.id (protocol/system stubs without a stable identifier)
 * - message body is empty / unrecognised (contentType "unknown" with no text)
 */
function normalizeRecord(record: IEvolutionStoredMessage): INormalizedRecord | null {
  const providerMessageId = record.key?.id;
  if (!providerMessageId) return null;

  const content = extractEvolutionContent(record.message ?? {});

  // Unknown content type with no extractable text = protocol stub — skip.
  if (content.contentType === "unknown" && !content.text) return null;

  const text = content.text ?? content.mediaCaption ?? "";
  const mediaType = (MEDIA_TYPES as readonly string[]).includes(content.contentType)
    ? content.contentType
    : null;
  const direction: "in" | "out" = record.key?.fromMe ? "out" : "in";
  const status: "sent" | "delivered" | "read" | "failed" =
    direction === "out"
      ? (EVOLUTION_ACK_STATUS_MAP[(record.status ?? "").toUpperCase()] ?? "sent")
      : "delivered";

  return {
    providerMessageId,
    direction,
    text,
    mediaType,
    status,
    sentAt: timestampToIso(record.messageTimestamp),
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
  const cursor = Math.max(0, Math.floor(args.cursor ?? 0));
  const batchSize = args.batchSize ?? BATCH_CHATS_DEFAULT;
  const batch = allChats.slice(cursor, cursor + batchSize);

  for (const remoteJid of batch) {
    if (!INDIVIDUAL_JID.test(remoteJid)) {
      stats.chatsSkippedGroup++;
      continue;
    }
    await importChat(remoteJid, account, source, db, stats, warn);
    stats.chatsProcessed++;
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
  const normalized: INormalizedRecord[] = [];
  for (const record of records) {
    const row = normalizeRecord(record);
    if (row) {
      normalized.push(row);
    } else {
      stats.messagesSkipped++;
    }
  }

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

  // 5. Land the messages. Media is NOT downloaded during import (spec §3):
  //    the import only stores the text/caption; a separate job can fetch media.
  for (const row of fresh) {
    await db.insertImportedMessage({
      conversationId: conversation.id,
      direction: row.direction,
      authorId: row.direction === "in" ? customer.id : null,
      text: row.text,
      mediaType: row.mediaType,
      status: row.status,
      providerMessageId: row.providerMessageId,
      sentAt: row.sentAt,
    });
    stats.messagesImported++;
  }

  await db.advanceConversationActivity(conversation.id, newest);
}
