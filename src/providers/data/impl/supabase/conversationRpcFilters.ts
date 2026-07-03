import type { IListConversationsParams } from "../../contracts/conversations";
import { sanitizeSellerIds } from "./assignmentFilter";

/**
 * The `p_*` filter fields shared by `count_conversations`, `search_conversations`
 * and `search_conversation_messages` — the three RPCs honor the same Inbox
 * filter set (status/channel/instance/SDR/tags/period/seller-ids/queue). Building
 * the mapping once keeps the count and search param builders from silently
 * diverging when a filter is added later (they had drifted into hand-maintained
 * copies of the same code; the next Inbox filter would only reach one of them).
 *
 * The `p_unassigned` field is intentionally NOT here — each builder adds its
 * own: the search path folds the scalar `unassigned` param, while the count
 * path always sends false (the Inbox "Sem atribuição" filter was unified into
 * "Em fila"/queue on 2026-07-02, so no Inbox filter yields an unassigned-only
 * count).
 */
export function buildSharedConversationRpcFilters(params: IListConversationsParams) {
  const status =
    params.status === undefined
      ? null
      : Array.isArray(params.status)
        ? params.status
        : [params.status];
  // Drop crafted non-UUID tokens before the `uuid[]` RPC arg (parity with the
  // table path's buildAssignmentOrFilter guard).
  const sellerIds = sanitizeSellerIds(params.assignmentAny?.sellerIds);

  return {
    p_status: status,
    p_channel: params.channel ?? null,
    p_whatsapp_account_id: params.whatsappAccountId ?? null,
    p_is_sdr_active: typeof params.isSdrActive === "boolean" ? params.isSdrActive : null,
    p_tags: params.tags && params.tags.length > 0 ? params.tags : null,
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? null,
    p_assigned_seller_ids: sellerIds.length > 0 ? sellerIds : null,
    p_include_queue: params.assignmentAny?.queue === true,
  };
}
