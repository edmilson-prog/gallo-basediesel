import type { IAuditLog, ID, ILeadNote, ISO8601 } from "@/shared/types";
import { describeLeadAudit } from "./leadHistory";

/**
 * A conversation as the timeline needs it.
 *
 * `IConversation` carries neither a message count nor a preview — the screen
 * resolves both from the messages it already loaded for the conversation card,
 * and hands them over rather than making the engine fetch.
 */
export interface ITimelineConversation {
  id: ID;
  at: ISO8601;
  messageCount: number;
  preview: string;
}

export type TimelineKind = "conversa" | "nota" | "historico";

export interface ITimelineItem {
  id: string;
  kind: TimelineKind;
  icon: string;
  /** Tailwind text-colour token for the marker. */
  tone: string;
  title: string;
  /** Extra lines: the note's body, the audit's field deltas. */
  lines: string[];
  at: ISO8601;
  /** Author or actor, already resolved to a name. Empty when unknown. */
  who: string;
}

export interface ILeadTimelineInput {
  conversations: ITimelineConversation[];
  notes: ILeadNote[];
  audits: IAuditLog[];
  /** Seller id → display name. Returns "" for an id it cannot resolve. */
  nameOf: (id: ID) => string;
  /** Copy for the conversation row, injected so the engine stays pure. */
  conversationTitle: (messageCount: number) => string;
  noteTitle: string;
}

/**
 * One thread, out of three shallow tabs.
 *
 * Conversas, Notas and Histórico were telling the same story in pieces, each
 * behind a tab, each sorted independently — so "o cliente pediu preço, ninguém
 * respondeu, e três dias depois alguém mudou a temperatura" could not be read
 * anywhere, because the three facts lived in three places.
 *
 * Merged and sorted by time, the sequence IS the story. The filters stay, but
 * now they narrow one thread rather than switching between three.
 */
export function buildLeadTimeline({
  conversations,
  notes,
  audits,
  nameOf,
  conversationTitle,
  noteTitle,
}: ILeadTimelineInput): ITimelineItem[] {
  const items: ITimelineItem[] = [];

  for (const conversation of conversations) {
    items.push({
      id: `conversation-${conversation.id}`,
      kind: "conversa",
      icon: "mdi:whatsapp",
      tone: "text-severity-success",
      title: conversationTitle(conversation.messageCount),
      lines: conversation.preview ? [conversation.preview] : [],
      at: conversation.at,
      who: "",
    });
  }

  for (const note of notes) {
    items.push({
      id: `note-${note.id}`,
      kind: "nota",
      icon: "mdi:note-text-outline",
      tone: "text-primary",
      title: noteTitle,
      lines: [note.content],
      at: note.createdAt,
      who: nameOf(note.authorId),
    });
  }

  for (const entry of audits) {
    const described = describeLeadAudit(entry);
    items.push({
      id: `audit-${entry.id}`,
      kind: "historico",
      icon: described.icon,
      tone: "text-muted-foreground",
      title: described.title,
      lines: described.lines,
      at: entry.timestamp,
      who: nameOf(entry.actorId),
    });
  }

  // Newest first, with a stable tiebreak on id: two writes inside the same
  // second are common (a patch and the audit it produced) and an unstable sort
  // would let them swap places between renders.
  return items.sort((a, b) => {
    const delta = new Date(b.at).getTime() - new Date(a.at).getTime();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}
