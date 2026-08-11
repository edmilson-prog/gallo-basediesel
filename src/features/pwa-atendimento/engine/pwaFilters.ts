/**
 * Filter composition for the atendimento PWA list.
 *
 * The rules are expressed as **provider parameters**, not as a client-side
 * predicate, for two reasons: the list is paginated (a client filter would only
 * narrow the pages already loaded, so the counts would lie), and the desktop
 * Inbox already encodes the same rules server-side. One rule, one place.
 *
 * The rule that matters most, carried over from `filtersToListParams`:
 * **a search overrides every facet**. Typing a customer's name must find them
 * even when the status chip is set to something they are not in — otherwise the
 * list lies by omission and the user cannot tell why.
 */
import type { ConversationChannel, ConversationStatus, ID } from "@/shared/types";
import type { IListConversationsParams } from "@/providers/data";

export interface IPwaFilters {
  q: string;
  status: ConversationStatus | "all";
  channel: ConversationChannel | "all";
  assign: "all" | "me" | "queue";
}

export const EMPTY_PWA_FILTERS: IPwaFilters = {
  q: "",
  status: "all",
  channel: "all",
  assign: "all",
};

/** Statuses shown when no explicit status is picked — closed ones stay out,
 *  same default as the desktop Inbox. */
export const PWA_OPEN_STATUSES: ConversationStatus[] = [
  "aguardando",
  "em_andamento",
  "aguardando_cliente",
];

/** How many facets are narrowing the list — drives the badge on the filter button. */
export function activeFilterCount(filters: IPwaFilters): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.channel !== "all") count += 1;
  if (filters.assign !== "all") count += 1;
  return count;
}

export function hasActiveSearch(filters: IPwaFilters): boolean {
  return filters.q.trim().length > 0;
}

export function pwaFiltersToListParams(
  filters: IPwaFilters,
  ctx: { storeId: ID | null; currentSellerId: ID | null },
): IListConversationsParams {
  const base: IListConversationsParams = {};
  if (ctx.storeId) base.storeId = ctx.storeId;

  // Search is global: every facet is dropped, including the closed-status
  // default, so a match is never hidden by a chip the user forgot about.
  if (hasActiveSearch(filters)) {
    return { ...base, search: filters.q.trim(), orderBy: "lastMessageAt", orderDir: "desc" };
  }

  const params: IListConversationsParams = {
    ...base,
    status: filters.status === "all" ? PWA_OPEN_STATUSES : filters.status,
    orderBy: "lastMessageAt",
    orderDir: "desc",
  };

  if (filters.channel !== "all") params.channel = filters.channel;

  if (filters.assign === "me") {
    // No seller identity means nothing can be "mine": ask for an impossible
    // set rather than silently widening to every conversation.
    params.assignmentAny = { sellerIds: ctx.currentSellerId ? [ctx.currentSellerId] : [] };
  } else if (filters.assign === "queue") {
    params.assignmentAny = { queue: true };
  }

  return params;
}
