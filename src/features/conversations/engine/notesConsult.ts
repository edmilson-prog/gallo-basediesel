/**
 * Pure filtering for the conversation-notes consult bar. The three UI modes
 * (index / only / highlight) all share the same matching — they differ only in
 * how the matches are presented, so the filter lives here once.
 */
import type { IConversationNote, ID } from "@/shared/types";

/** How matched notes are presented in the chat. */
export type NotesConsultMode = "index" | "only" | "highlight";

/** Quick scope chips. */
export type NotesConsultScope = "all" | "mentions" | "pinned";

export interface INotesConsultState {
  query: string;
  scope: NotesConsultScope;
}

export const DEFAULT_NOTES_CONSULT: INotesConsultState = { query: "", scope: "all" };

/**
 * Notes matching the current query + scope. `mentions` keeps notes that tag the
 * current seller; `pinned` keeps pinned notes; `query` is a case-insensitive
 * substring of the content. Order is preserved (caller decides chronology).
 */
export function filterNotes(
  notes: IConversationNote[],
  state: INotesConsultState,
  currentSellerId: ID | undefined,
): IConversationNote[] {
  const term = state.query.trim().toLowerCase();
  return notes.filter((note) => {
    if (state.scope === "pinned" && !note.pinned) return false;
    if (state.scope === "mentions") {
      if (!currentSellerId || !note.mentions.includes(currentSellerId)) return false;
    }
    if (term && !note.content.toLowerCase().includes(term)) return false;
    return true;
  });
}
