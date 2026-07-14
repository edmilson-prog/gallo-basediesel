/**
 * WAHA history import core — REST-pull equivalent of the Evolution importer
 * (`./core.ts`) for the WAHA engine. Pages `GET /api/{session}/chats` and
 * `GET /api/{session}/chats/{chatId}/messages`, resolves `@lid` chats to a
 * real phone via `resolveWahaLid` (same helper the live webhook and the
 * backfill action already use), and lands everything through the shared
 * `landNormalizedChat` — customer/conversation resolution, idempotency and
 * the pool rule are identical to every other import path.
 *
 * Status is DERIVED (no per-message ack lookup): out → "sent", in →
 * "delivered" — same rule the Evolution Go HistorySync import uses.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { extractContent, jidToE164, type IWahaMessagePayload } from "../waha/parser";
import { resolveWahaLid } from "../waha/contacts";
import { fetchWahaChatMessagesPage, fetchWahaChatsPage } from "../waha/history";
import type { IWahaSessionTarget } from "../waha/session";
import { WhatsAppProviderError } from "../errors";
import { MEDIA_DISCRIMINATOR_TYPES } from "../types";
import {
  emptyImportStats,
  landNormalizedChat,
  type IImportAccount,
  type IImportBatchResult,
  type IImportDb,
  type IImportStats,
  type INormalizedRecord,
} from "./core";

const CHATS_PAGE_SIZE = 100;
const MESSAGES_PAGE_SIZE = 100;
/** Runaway guards — same reasoning as core.ts's MAX_MESSAGE_PAGES_PER_CHAT. */
const MAX_CHAT_PAGES = 50; // 50 * 100 = 5 000 chats
const MAX_MESSAGE_PAGES_PER_CHAT = 50; // 50 * 100 = 5 000 messages/chat
const BATCH_CHATS_DEFAULT = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 300;

/**
 * Retries a transient WAHA REST read (timeout, 429, unmapped 5xx) with a
 * short backoff — every caller here is a paginated GET, safe to repeat.
 * Auth/not-found errors are not transient and propagate on the first try.
 *
 * Found 2026-07-14: `fetchAllWahaChatIds` re-lists the WHOLE chat set on
 * EVERY batch call (the cursor only slices the already-fetched list) — for
 * a 1 000+ conversation account that's ~12 extra HTTP round-trips per batch,
 * ~100+ batches per import. One dropped page anywhere in that volume threw
 * uncaught (outside the per-chat try/catch in processWahaImportBatch) and
 * crashed the whole request with a 500, forcing a full manual retry instead
 * of the batch simply continuing.
 */
async function withWahaRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof DOMException && error.name === "AbortError"
          ? true
          : error instanceof WhatsAppProviderError
            ? error.code === "RATE_LIMITED" || error.code === "INTEGRATION_ERROR"
            : false;
      if (!retryable || attempt === RETRY_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
    }
  }
  throw lastError;
}

type ChatKind = "individual" | "lid" | "group" | "broadcast" | "other";

export function classifyWahaChatId(chatId: string): ChatKind {
  if (chatId.endsWith("@c.us")) return "individual";
  if (chatId.endsWith("@lid")) return "lid";
  if (chatId.endsWith("@g.us")) return "group";
  if (chatId.endsWith("@broadcast") || chatId.endsWith("@newsletter")) return "broadcast";
  return "other";
}

/**
 * WAHA message → flat normalized row; null for un-importable records (same
 * guards as the Evolution/Go normalizers): no `id`, no valid second-epoch
 * timestamp (missing clock or a ms/µs epoch that would land decades in the
 * future), empty/unrecognised body. `fromMe` absent on a record defaults to
 * `false` (inbound) rather than throwing.
 */
export function normalizeWahaHistoryRecord(payload: IWahaMessagePayload): INormalizedRecord | null {
  const providerMessageId = payload.id;
  if (!providerMessageId) return null;

  const tsNum = Number(payload.timestamp);
  if (!Number.isFinite(tsNum) || tsNum <= 0) return null;
  if (tsNum * 1000 > Date.now() + ONE_DAY_MS) return null;

  const content = extractContent(payload);
  if (content.contentType === "unknown" && !content.text) return null;

  const direction: "in" | "out" = payload.fromMe === true ? "out" : "in";
  const status: INormalizedRecord["status"] = direction === "out" ? "sent" : "delivered";
  const mediaType = (MEDIA_DISCRIMINATOR_TYPES as readonly string[]).includes(content.contentType)
    ? content.contentType
    : null;

  return {
    providerMessageId,
    direction,
    text: content.text ?? "",
    mediaType,
    mediaFilename: content.mediaFilename,
    status,
    sentAt: new Date(tsNum * 1000).toISOString(),
  };
}

async function fetchAllWahaChatIds(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  warn: (msg: string, fields?: Record<string, unknown>) => void,
): Promise<string[]> {
  const ids = new Set<string>();
  for (let page = 0; page < MAX_CHAT_PAGES; page++) {
    const offset = page * CHATS_PAGE_SIZE;
    const rows = await withWahaRetry(() =>
      fetchWahaChatsPage(apiKey, fetchFn, target, offset, CHATS_PAGE_SIZE),
    );
    for (const row of rows) ids.add(row.id);
    if (rows.length < CHATS_PAGE_SIZE) break;
    if (page === MAX_CHAT_PAGES - 1) {
      warn("fetchAllWahaChatIds page cap reached — older chats skipped", {
        sessionName: target.sessionName,
      });
    }
  }
  return [...ids];
}

async function importWahaChat(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  chatId: string,
  phone: string,
  account: IImportAccount,
  db: IImportDb,
  stats: IImportStats,
  warn: (msg: string, fields?: Record<string, unknown>) => void,
): Promise<void> {
  const records: IWahaMessagePayload[] = [];
  let prevPageIds = new Set<string>();

  for (let page = 0; page < MAX_MESSAGE_PAGES_PER_CHAT; page++) {
    const offset = page * MESSAGES_PAGE_SIZE;
    const pageRecords = await withWahaRetry(() =>
      fetchWahaChatMessagesPage(apiKey, fetchFn, target, chatId, offset, MESSAGES_PAGE_SIZE),
    );
    const thisPageIds = new Set(
      pageRecords.map((r) => r.id).filter((id): id is string => Boolean(id)),
    );
    if (page > 0 && thisPageIds.size > 0 && [...thisPageIds].every((id) => prevPageIds.has(id))) {
      warn("fetchWahaChatMessagesPage returned an identical page — stopping", { chatId });
      break;
    }
    prevPageIds = thisPageIds;
    records.push(...pageRecords);
    if (pageRecords.length < MESSAGES_PAGE_SIZE) break;
    if (page === MAX_MESSAGE_PAGES_PER_CHAT - 1) {
      warn("import waha chat page cap reached — older messages skipped", { chatId });
    }
  }

  const normalized: INormalizedRecord[] = [];
  for (const record of records) {
    const row = normalizeWahaHistoryRecord(record);
    if (!row) {
      stats.messagesSkipped++;
      continue;
    }
    normalized.push(row);
  }
  if (normalized.length === 0) return;

  await landNormalizedChat({ account, db, phone, normalized, stats });
}

export interface IWahaImportArgs {
  account: IImportAccount;
  apiKey: string;
  fetchFn: typeof fetch;
  target: IWahaSessionTarget;
  db: IImportDb;
  /** Chat offset into the sorted chat-id list (stable across calls). */
  cursor?: number;
  batchSize?: number;
  warn?: (msg: string, fields?: Record<string, unknown>) => void;
}

/**
 * Process one batch of chats from a WAHA session's stored history. Mirrors
 * `processImportBatch`'s cursor/batch contract exactly — the frontend
 * (`ImportConversationsDialog`/`runHistoryImport`) does not need to know
 * which engine it's driving.
 */
export async function processWahaImportBatch(args: IWahaImportArgs): Promise<IImportBatchResult> {
  const { account, apiKey, fetchFn, target, db } = args;
  const warn = args.warn ?? (() => {});
  const stats = emptyImportStats();

  const allChats = (await fetchAllWahaChatIds(apiKey, fetchFn, target, warn)).slice().sort();
  const cursor = Number.isFinite(args.cursor) ? Math.max(0, Math.floor(args.cursor as number)) : 0;
  const batchSize = Math.max(1, Math.floor(args.batchSize ?? BATCH_CHATS_DEFAULT));
  const batch = allChats.slice(cursor, cursor + batchSize);

  for (const chatId of batch) {
    const kind = classifyWahaChatId(chatId);
    if (kind === "group") {
      stats.chatsSkippedGroup++;
      continue;
    }
    if (kind === "broadcast") {
      stats.chatsSkippedBroadcast++;
      continue;
    }
    if (kind === "other") {
      stats.chatsSkippedOther++;
      continue;
    }

    let phone: string | undefined;
    if (kind === "individual") {
      phone = jidToE164(chatId);
    } else {
      // lid — resolve to a real phone before touching messages at all.
      try {
        const resolved = await resolveWahaLid(apiKey, fetchFn, {
          baseUrl: target.baseUrl,
          sessionName: target.sessionName,
          lid: chatId,
        });
        phone = resolved.phone;
      } catch (error) {
        stats.chatsFailed++;
        warn("waha lid resolution failed during import — cursor advances past it", {
          chatId,
          detail: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (!phone) {
        stats.chatsSkippedLid++;
        continue;
      }
    }
    if (!phone) {
      stats.chatsSkippedOther++;
      continue;
    }

    try {
      await importWahaChat(apiKey, fetchFn, target, chatId, phone, account, db, stats, warn);
      stats.chatsProcessed++;
    } catch (error) {
      stats.chatsFailed++;
      warn("import waha chat failed — cursor advances past it", {
        chatId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const nextCursor = cursor + batch.length;
  return { done: nextCursor >= allChats.length, nextCursor, stats };
}
