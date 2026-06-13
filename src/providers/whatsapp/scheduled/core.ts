/**
 * Scheduled-send dispatch core (PRD-027 RNF-007 → production).
 *
 * Pure mapping from a stored `scheduled_sends` payload to the outbound
 * `ISendRequest` consumed by `processSendRequest`. The server worker
 * (`scheduled-send-worker`) claims due rows and feeds each payload here, then
 * reuses the full send pipeline (24h window, failover, persist-before-send,
 * status tracking, audit) — no send logic is duplicated.
 *
 * Only the `snippet` payload (plain text — the only kind the composer schedules
 * today) is dispatchable server-side. asset/combo/product re-hydration depends
 * on the asset library + per-role sensitivity checks that live in the frontend
 * (useSendAsset); the worker rejects them with NOT_SUPPORTED so the row fails
 * loudly with a reason instead of being silently dropped.
 *
 * Runtime-agnostic file: relative imports only, Web APIs only.
 */

import { WhatsAppProviderError } from "../errors";
import type { ISendRequest, ISender } from "../send/core";

/** Persisted payload shape — mirror of `IScheduledSend["payload"]`. */
export interface IScheduledPayload {
  type: "asset" | "snippet" | "combo" | "product";
  assetIds?: string[];
  quickReplyId?: string;
  productId?: string;
  contextMessage?: string;
}

/**
 * Builds the outbound TEXT request for a due scheduled send. Throws
 * {@link WhatsAppProviderError} (NOT_SUPPORTED / VALIDATION_ERROR) for payloads
 * the server cannot dispatch — the worker turns the throw into a `failed`
 * scheduled-send row with the thrown message as `failure_reason`.
 */
export function buildScheduledSendRequest(
  conversationId: string,
  payload: IScheduledPayload,
): ISendRequest {
  if (!conversationId) {
    throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "conversationId é obrigatório");
  }
  if (payload.type !== "snippet") {
    throw new WhatsAppProviderError(
      "NOT_SUPPORTED",
      422,
      `Agendamento do tipo "${payload.type}" não é enviado automaticamente pelo servidor (apenas texto).`,
    );
  }
  const text = (payload.contextMessage ?? "").trim();
  if (!text) {
    throw new WhatsAppProviderError("VALIDATION_ERROR", 422, "Mensagem agendada vazia.");
  }
  return { conversationId, kind: "text", text };
}

/**
 * System sender for worker-initiated dispatch. `role: "owner"` passes the send
 * core's staff permission branch (the worker is trusted regardless of who the
 * conversation is assigned to); `sellerId: null` records `author_id` null,
 * exactly like an Owner-sent message (no FK risk). `storeId` scopes the
 * permission check to the scheduled row's store.
 */
export function buildSystemSender(storeId: string): ISender {
  return { sellerId: null, role: "owner", storeId };
}
