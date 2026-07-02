import type { IListConversationsParams } from "../../contracts/conversations";
import { sanitizeSellerIds } from "./assignmentFilter";

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
 * The RPC mirrors ONLY the Inbox no-search list path. Params outside that
 * path (`search`, `customerId`, `leadId`, scalar `assignedSellerId`/
 * `unassigned`) would be silently ignored by the RPC and return a wrong
 * total — throw instead so a future caller fails loudly at dev time.
 */
export function buildCountRpcParams(
  params: IListConversationsParams,
): ICountConversationsRpcParams {
  if (
    params.search !== undefined ||
    params.customerId !== undefined ||
    params.leadId !== undefined ||
    params.assignedSellerId !== undefined ||
    params.unassigned !== undefined
  ) {
    throw new Error(
      "[supabase] conversations.count supports the Inbox no-search list path only " +
        "(got search/customerId/leadId/assignedSellerId/unassigned)",
    );
  }

  const sellerIds = sanitizeSellerIds(params.assignmentAny?.sellerIds);

  return {
    p_status:
      params.status === undefined
        ? null
        : Array.isArray(params.status)
          ? params.status
          : [params.status],
    p_channel: params.channel ?? null,
    p_whatsapp_account_id: params.whatsappAccountId ?? null,
    p_is_sdr_active: typeof params.isSdrActive === "boolean" ? params.isSdrActive : null,
    p_tags: params.tags && params.tags.length > 0 ? params.tags : null,
    p_from_date: params.fromDate ?? null,
    p_to_date: params.toDate ?? null,
    p_assigned_seller_ids: sellerIds.length > 0 ? sellerIds : null,
    p_unassigned: params.assignmentAny?.unassigned === true,
    p_include_queue: params.assignmentAny?.queue === true,
  };
}
