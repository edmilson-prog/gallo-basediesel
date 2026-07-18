// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/history.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * WAHA chat/message history REST wrappers — thin per-endpoint functions only
 * (mirrors session.ts/contacts.ts's style). Classification, normalization and
 * batching for the history importer live in
 * `src/providers/whatsapp/import/waha-history-core.ts`.
 */

import { wahaRequest } from "./client.ts";
import type { IWahaSessionTarget } from "./session.ts";
import type { IWahaMessagePayload } from "./parser.ts";

export interface IWahaChatSummary {
  id: string;
  /**
   * Chat display name, when the WAHA build's `/chats` response includes one
   * (some builds send `name`; older ones don't) — captured for free from the
   * already-fetched listing, no extra request. `getWahaContactName`
   * (contacts.ts) remains the only reliable per-contact lookup and is NOT
   * called here: one extra REST round-trip per chat would risk the batch's
   * time budget (see BATCH_TIME_BUDGET_MS in waha-history-core.ts).
   */
  name?: string;
}

/** One page of `GET /api/{session}/chats`. */
export async function fetchWahaChatsPage(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  offset: number,
  limit: number,
): Promise<IWahaChatSummary[]> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/${target.sessionName}/chats?limit=${limit}&offset=${offset}`,
    method: "GET",
    timeoutMs: 15_000,
  });
  const body = Array.isArray(response.body) ? response.body : [];
  return body
    .map((raw) => {
      const row = raw as { id?: string; name?: string };
      const id = String(row?.id ?? "");
      const rawName = typeof row?.name === "string" ? row.name.trim() : "";
      return { id, name: rawName.length > 0 ? rawName : undefined };
    })
    .filter((row) => row.id.length > 0);
}

/**
 * One page of `GET /api/{session}/chats/{chatId}/messages`.
 *
 * `downloadMedia=false`: WAHA defaults this to `true`, which makes it fetch
 * and decrypt every media attachment's bytes server-side before responding —
 * work the history importer never uses (historical media lands as
 * `media_download_status: "failed"`, eligible for manual retry). Found
 * 2026-07-14: media-heavy chats were consistently timing out at 15s (and
 * loading the WAHA server) purely from this unused work.
 */
export async function fetchWahaChatMessagesPage(
  apiKey: string,
  fetchFn: typeof fetch,
  target: IWahaSessionTarget,
  chatId: string,
  offset: number,
  limit: number,
): Promise<IWahaMessagePayload[]> {
  const response = await wahaRequest(apiKey, fetchFn, {
    baseUrl: target.baseUrl,
    path: `/api/${target.sessionName}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&offset=${offset}&downloadMedia=false`,
    method: "GET",
    timeoutMs: 15_000,
  });
  return Array.isArray(response.body) ? (response.body as IWahaMessagePayload[]) : [];
}
