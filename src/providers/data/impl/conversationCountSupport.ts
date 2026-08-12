import type { IListConversationsParams } from "../contracts/conversations";

/**
 * The conversations `count()` mirrors ONLY the Inbox no-search list path. Params
 * outside that path would silently produce a wrong total, so BOTH providers
 * reject them up front — the mock included, so a future caller trips the guard
 * at dev time (mock) instead of only in production (supabase).
 *
 * Whitespace-only `search` is treated as no-search (parity with `list()`'s
 * `search.trim()` routing — the plain table path ignores it), so it is allowed:
 * the count matches what the list returns for the same params.
 */
export function assertInboxCountParams(params: IListConversationsParams): void {
  const hasRealSearch = typeof params.search === "string" && params.search.trim().length > 0;
  if (
    params.storeId !== undefined ||
    hasRealSearch ||
    params.customerId !== undefined ||
    params.leadId !== undefined ||
    params.assignedSellerId !== undefined ||
    params.unassigned !== undefined
  ) {
    throw new Error(
      "[conversations.count] supports the Inbox no-search list path only " +
        "(got storeId/search/customerId/leadId/assignedSellerId/unassigned)",
    );
  }
}
