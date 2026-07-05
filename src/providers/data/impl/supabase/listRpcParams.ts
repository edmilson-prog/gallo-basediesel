import type { IListConversationsParams } from "../../contracts/conversations";
import { assertInboxCountParams } from "../conversationCountSupport";
import { buildSharedConversationRpcFilters } from "./conversationRpcFilters";

/** Exact argument shape of the `list_conversations` RPC (migration 20260705090000). */
export interface IListConversationsRpcParams {
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
  p_order_dir: "asc" | "desc";
  p_limit: number;
  p_offset: number;
}

/**
 * Translate Inbox list params into `list_conversations` RPC args. Same scope
 * restriction as `count_conversations` (`assertInboxCountParams`) — this RPC
 * exists specifically for the "Minhas conversas" (assignmentAny.sellerIds)
 * no-search case, where a plain PostgREST query cannot express the
 * collaborator EXISTS that `count_conversations` already counts (Task 3).
 */
export function buildListRpcParams(
  params: IListConversationsParams,
  page: number,
  pageSize: number,
): IListConversationsRpcParams {
  assertInboxCountParams(params);
  return {
    ...buildSharedConversationRpcFilters(params),
    p_unassigned: false,
    p_order_dir: params.orderDir === "asc" ? "asc" : "desc",
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  };
}
