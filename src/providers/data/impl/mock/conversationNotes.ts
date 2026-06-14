import type { ID, IConversationNote } from "@/shared/types";
import type { IConversationNotesProvider } from "../../contracts/conversationNotes";
import { logMockMutation } from "./_audit";
import { withCreateStoreId } from "./_storeScope";

/**
 * In-memory mock of {@link IConversationNotesProvider}. Notes start empty and
 * live only for the session (reset on reload) — acceptable for the demo data
 * source; the supabase impl is the real persistence.
 */
const NOTES: IConversationNote[] = [];

export const mockConversationNotesProvider: IConversationNotesProvider = {
  list: async (conversationId) =>
    NOTES.filter((n) => n.conversationId === conversationId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    ),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const now = new Date().toISOString();
    const note: IConversationNote = {
      id: crypto.randomUUID(),
      conversationId: scoped.conversationId,
      storeId: scoped.storeId,
      authorId: scoped.authorId,
      content: scoped.content,
      mentions: scoped.mentions ?? [],
      pinned: scoped.pinned ?? false,
      createdAt: now,
      updatedAt: now,
    };
    NOTES.push(note);
    logMockMutation({
      action: "create",
      resource: "conversation_note",
      resourceId: note.id,
      after: note,
      storeId: note.storeId,
    });
    return note;
  },

  update: async (id, patch) => {
    const note = NOTES.find((n) => n.id === id);
    if (!note) throw new Error(`[mock] conversationNotes.update: note ${id} not found`);
    if (patch.content !== undefined) note.content = patch.content;
    if (patch.mentions !== undefined) note.mentions = patch.mentions;
    if (patch.pinned !== undefined) note.pinned = patch.pinned;
    note.updatedAt = new Date().toISOString();
    logMockMutation({
      action: "update",
      resource: "conversation_note",
      resourceId: id,
      after: note,
      storeId: note.storeId,
    });
    return note;
  },

  remove: async (id) => {
    const idx = NOTES.findIndex((n) => n.id === id);
    if (idx < 0) return;
    const [removed] = NOTES.splice(idx, 1);
    logMockMutation({
      action: "delete",
      resource: "conversation_note",
      resourceId: id,
      storeId: removed?.storeId,
    });
  },
};
