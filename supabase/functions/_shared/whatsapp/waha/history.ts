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
    .map((row) => ({ id: String((row as { id?: string })?.id ?? "") }))
    .filter((row) => row.id.length > 0);
}

/** One page of `GET /api/{session}/chats/{chatId}/messages`. */
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
    path: `/api/${target.sessionName}/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&offset=${offset}`,
    method: "GET",
    timeoutMs: 15_000,
  });
  return Array.isArray(response.body) ? (response.body as IWahaMessagePayload[]) : [];
}
