import type { IListConversationsParams } from "../../contracts/conversations";
import { assertInboxCountParams } from "../conversationCountSupport";
import { buildSharedConversationRpcFilters } from "./conversationRpcFilters";

/** Exact argument shape of the `count_conversations` RPC (migration 20260702180000). */
export interface ICountConversationsRpcParams {
  p_status: string[] | null;
  p_channel: string | null;
  p_whatsapp_account_id: string | null;
  p_is_sdr_active: boolean | null;
  p_tags: string[] | null;
  p_from_date: string | null;
  p_to_date: string | null;
  p_assigned_seller_ids: string[] | null;
  p_unassigned: boolean;
  p_include_queue: boolean;
}

/**
 * Translate Inbox list params into `count_conversations` RPC args.
 *
 * The RPC mirrors ONLY the Inbox no-search list path — `assertInboxCountParams`
 * rejects params outside it (storeId/real-search/customerId/leadId/scalar
 * assignment) so a future caller fails loudly instead of getting a wrong total.
 * The shared filter fields come from `buildSharedConversationRpcFilters` (the
 * same mapping the search RPCs use); only `p_unassigned` is count-specific.
 */
export function buildCountRpcParams(
  params: IListConversationsParams,
): ICountConversationsRpcParams {
  assertInboxCountParams(params);

  return {
    ...buildSharedConversationRpcFilters(params),
    // Unified 2026-07-02: the Inbox "Sem atribuição" filter merged into "Em
    // fila" (queue), so no Inbox filter produces an unassigned-only count —
    // the queue count rides `p_include_queue`. Kept in the RPC signature
    // (PostgREST overload resolution needs the key); always false now.
    p_unassigned: false,
  };
}
