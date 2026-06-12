/**
 * Inbound media backfill (real-inbox follow-up).
 *
 * The history import (PRD-119) stores only text/captions — media is left
 * un-downloaded (`media_download_status = 'failed'`, `media_url = null`). This
 * core re-fetches those bytes from the provider by `provider_message_id` and
 * uploads them to Storage, stamping `media_url` + `ok`, mirroring the webhook's
 * own download path.
 *
 * Per-item failures (most importantly media the provider can no longer serve —
 * WhatsApp expires media after a few weeks) are counted by reason and NEVER
 * abort the run: the row keeps `failed` and stays eligible for a later retry.
 *
 * Pure and runtime-agnostic (only Web APIs + relative imports) so it mirrors
 * into the Edge Functions tree via scripts/sync-whatsapp-shared.ts.
 */

import { WhatsAppProviderError } from "../errors";

export interface IMediaBackfillItem {
  messageId: string;
  conversationId: string;
  providerMessageId: string;
  mediaType: string;
}

export interface IMediaBackfillDb {
  /** Inbound media rows with no stored bytes, newest first, bounded by limit.
   *  `sinceIso`/`untilIso` bound the `sent_at` window (inclusive) so a run can
   *  target a specific age band — used to probe how far back media survives.
   *  `mediaTypes` narrows by kind (e.g. ['audio','image']) to skip the heavy
   *  ones that can saturate the worker. */
  listMissingMedia(args: {
    accountId: string;
    limit: number;
    sinceIso?: string;
    untilIso?: string;
    mediaTypes?: string[];
  }): Promise<IMediaBackfillItem[]>;
  uploadMedia(path: string, data: Uint8Array, mimeType: string): Promise<void>;
  setMessageMedia(messageId: string, mediaUrl: string): Promise<void>;
  /** Mark a row as not recoverable now (provider can no longer serve it), so a
   *  re-run skips it instead of re-attempting the same poison row forever. A
   *  manual reset (unavailable -> failed) re-enables a retry. */
  markUnavailable(messageId: string): Promise<void>;
}

export interface IMediaDownloader {
  downloadInboundMedia(providerMessageId: string): Promise<{ data: Uint8Array; mimeType: string }>;
}

export interface IMediaBackfillResult {
  attempted: number;
  recovered: number;
  failed: number;
  /** Failure tally by reason (e.g. `expired_or_missing`, `integration_error`). */
  reasons: Record<string, number>;
}

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
};

/** Extension for a mime, tolerant of parameters ("audio/ogg; codecs=opus"). */
export function extensionForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_EXTENSIONS[base] ?? "bin";
}

/** Storage object path for a message's media (mirrors the webhook layout). */
export function mediaObjectPath(
  conversationId: string,
  messageId: string,
  mimeType: string,
): string {
  return `conversations/${conversationId}/${messageId}/media.${extensionForMime(mimeType)}`;
}

function failureReason(error: unknown): string {
  if (error instanceof WhatsAppProviderError) {
    // A provider 404 / NOT_FOUND on download == media is gone (expired upstream).
    if (error.code === "NOT_FOUND") return "expired_or_missing";
    return error.code.toLowerCase();
  }
  return "error";
}

export async function processMediaBackfill(args: {
  accountId: string;
  limit: number;
  sinceIso?: string;
  untilIso?: string;
  mediaTypes?: string[];
  db: IMediaBackfillDb;
  downloader: IMediaDownloader;
  warn?: (message: string, fields?: Record<string, unknown>) => void;
}): Promise<IMediaBackfillResult> {
  const items = await args.db.listMissingMedia({
    accountId: args.accountId,
    limit: args.limit,
    sinceIso: args.sinceIso,
    untilIso: args.untilIso,
    mediaTypes: args.mediaTypes,
  });

  let recovered = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};

  for (const item of items) {
    try {
      const media = await args.downloader.downloadInboundMedia(item.providerMessageId);
      const path = mediaObjectPath(item.conversationId, item.messageId, media.mimeType);
      await args.db.uploadMedia(path, media.data, media.mimeType);
      await args.db.setMessageMedia(item.messageId, path);
      recovered += 1;
    } catch (error) {
      failed += 1;
      const reason = failureReason(error);
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      args.warn?.("media backfill: download failed", {
        messageId: item.messageId,
        reason,
        detail: error instanceof Error ? error.message : String(error),
      });
      // Take the poison row out of the candidate set so a re-run converges.
      try {
        await args.db.markUnavailable(item.messageId);
      } catch {
        // best-effort — leaving it 'failed' just means it is retried later.
      }
    }
  }

  return { attempted: items.length, recovered, failed, reasons };
}
