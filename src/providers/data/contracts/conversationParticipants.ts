import type { ID, IConversationParticipant } from "@/shared/types";

/**
 * Contract for on-demand conversation collaborators ("co-responsáveis" —
 * 2026-06-15 Switchboard table, finally surfaced to the UI). A collaborator
 * can read and reply to a conversation they don't own (`conversations.
 * assigned_seller_id`) without changing who owns it; enforcement is entirely
 * at the RLS layer (`cp_insert`/`cp_delete`/`cp_select`), mirroring the
 * pattern used by `IConversationsProvider.assignSeller`/`unassign`.
 *
 * @see ../../../../supabase/migrations/20260704120000_conversation_participants_lifecycle.sql
 */
export interface IConversationParticipantsProvider {
  /** Current collaborators of a conversation, in no particular guaranteed order. */
  list(conversationId: ID): Promise<IConversationParticipant[]>;
  /**
   * Adds a seller as a collaborator. `source` distinguishes a manual invite
   * (AddCollaboratorDialog) from an `@mention`-driven auto-add — it drives the
   * "via @menção" UI tag and whether the manual-add bell notification fires
   * (mention adds rely on the pre-existing note-mention notification instead).
   */
  add(
    conversationId: ID,
    sellerId: ID,
    source: "manual" | "mention",
  ): Promise<IConversationParticipant>;
  /** Removes a collaborator — staff, the conversation's assignee, or the
   *  collaborator removing themselves ("Sair da conversa"). */
  remove(conversationId: ID, sellerId: ID): Promise<void>;
}
