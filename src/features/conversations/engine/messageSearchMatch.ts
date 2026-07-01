import type { IConversationMessageMatch, ISO8601 } from "@/shared/types";

/** Minimal shape this engine needs from a message — decoupled from the full `IMessage`. */
export interface IMessageSearchCandidate {
  text: string;
  sentAt: ISO8601;
  direction: "in" | "out";
}

/**
 * Pick the representative match for the "search inside messages" feature: the
 * MOST RECENT message (by `sentAt`) whose text contains `term` (case-insensitive),
 * plus how many other messages in the same list also matched.
 *
 * Mirrors the `search_conversation_messages` RPC's `row_number() ... order by
 * sent_at desc` + `count(*)` logic, so the mock and supabase providers agree on
 * which message is shown as the snippet.
 *
 * Returns `null` for an empty/whitespace-only term or when nothing matches —
 * same "no match" contract as the RPC's `length(trim(...)) > 0` guard.
 */
export function selectMessageMatch(
  messages: IMessageSearchCandidate[],
  term: string,
): IConversationMessageMatch | null {
  const needle = term.trim().toLowerCase();
  if (!needle) return null;

  const matches = messages.filter((m) => m.text.toLowerCase().includes(needle));
  if (matches.length === 0) return null;

  const mostRecent = matches.reduce((latest, m) => (m.sentAt > latest.sentAt ? m : latest));
  return {
    text: mostRecent.text,
    sentAt: mostRecent.sentAt,
    direction: mostRecent.direction,
    extraMatchCount: matches.length - 1,
  };
}
