/**
 * Filter composition for the atendimento PWA list.
 *
 * One rule carries over from the desktop Inbox and is the reason this lives in
 * `engine/`: **a search overrides the facets**. Typing a customer's name must
 * find them even when the status chip is set to something they are not in —
 * otherwise the list lies by omission and the user cannot tell why.
 */
import type { ConversationChannel, ConversationStatus, IConversation } from "@/shared/types";
import { digitsOf } from "@/features/conversations/engine/phoneBR";

export interface IPwaFilters {
  q: string;
  status: ConversationStatus | "all";
  channel: ConversationChannel | "all";
  assign: "all" | "me" | "queue";
}

/** Identity resolved outside the conversation row (name and phone live in the
 *  contact, not in `IConversation`), plus who is asking. */
export interface IPwaFilterContext {
  name: string;
  phone: string;
  sellerId: string | null;
}

export const EMPTY_PWA_FILTERS: IPwaFilters = {
  q: "",
  status: "all",
  channel: "all",
  assign: "all",
};

/** How many facets are narrowing the list — drives the badge on the filter button. */
export function activeFilterCount(filters: IPwaFilters): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.channel !== "all") count += 1;
  if (filters.assign !== "all") count += 1;
  return count;
}

function matchesSearch(query: string, context: IPwaFilterContext): boolean {
  const term = query.trim().toLowerCase();
  if (context.name.toLowerCase().includes(term)) return true;

  // Phone search is digit-only on both sides: the user types what they read off
  // a screen, never the mask we happen to render.
  const termDigits = digitsOf(term);
  if (!termDigits) return false;
  return digitsOf(context.phone).includes(termDigits);
}

export function matchesPwaFilters(
  conversation: IConversation,
  filters: IPwaFilters,
  context: IPwaFilterContext,
): boolean {
  if (filters.q.trim()) return matchesSearch(filters.q, context);

  if (filters.status !== "all" && conversation.status !== filters.status) return false;
  if (filters.channel !== "all" && conversation.channel !== filters.channel) return false;
  if (filters.assign === "me") {
    if (!context.sellerId) return false;
    if (conversation.assignedSellerId !== context.sellerId) return false;
  }
  if (filters.assign === "queue" && conversation.assignedSellerId) return false;
  return true;
}
