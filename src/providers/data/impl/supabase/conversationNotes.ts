import type { ID, IConversationNote } from "@/shared/types";
import type { IConversationNotesProvider } from "../../contracts/conversationNotes";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IConversationNotesProvider}.
 *
 * snake_case `conversation_notes` ↔ camelCase {@link IConversationNote} via
 * `rowToNote`. `mentions` is a uuid[] of seller ids; an AFTER INSERT trigger
 * (SECURITY DEFINER) turns it into one in-app notification per mentioned
 * seller, so the client never inserts cross-recipient notifications itself
 * (the notifications RLS would block that for non-staff).
 *
 * RLS: store-scoped SELECT/INSERT; author-only edit; author-or-staff
 * delete/pin. `create` reads `storeId` off the input (threaded by the caller)
 * because the WITH CHECK requires store_id = current_store_id().
 */
interface ConversationNoteRow {
  id: string;
  conversation_id: string;
  store_id: string;
  author_id: string;
  content: string;
  mentions: string[] | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "conversation_notes";
const COLUMNS =
  "id, conversation_id, store_id, author_id, content, mentions, pinned, created_at, updated_at";

function rowToNote(row: ConversationNoteRow): IConversationNote {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    storeId: row.store_id,
    authorId: row.author_id,
    content: row.content,
    mentions: row.mentions ?? [],
    pinned: row.pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const supabaseConversationNotesProvider: IConversationNotesProvider = {
  async list(conversationId: ID): Promise<IConversationNote[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false });
    if (error)
      throw new Error(
        `[supabase] conversationNotes.list(${conversationId}) failed: ${error.message}`,
      );
    return (data as unknown as ConversationNoteRow[]).map(rowToNote);
  },

  async create(input): Promise<IConversationNote> {
    const id: ID = crypto.randomUUID();
    const storeId = (input as typeof input & { storeId?: ID }).storeId ?? null;
    const row = {
      id,
      conversation_id: input.conversationId,
      store_id: storeId,
      author_id: input.authorId,
      content: input.content,
      mentions: input.mentions ?? [],
      pinned: input.pinned ?? false,
    };
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .insert(row)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] conversationNotes.create failed: ${error.message}`);
    return rowToNote(data as unknown as ConversationNoteRow);
  },

  async update(id, patch): Promise<IConversationNote> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.content !== undefined) row.content = patch.content;
    if (patch.mentions !== undefined) row.mentions = patch.mentions;
    if (patch.pinned !== undefined) row.pinned = patch.pinned;
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update(row)
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error)
      throw new Error(`[supabase] conversationNotes.update(${id}) failed: ${error.message}`);
    return rowToNote(data as unknown as ConversationNoteRow);
  },

  async remove(id): Promise<void> {
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error)
      throw new Error(`[supabase] conversationNotes.remove(${id}) failed: ${error.message}`);
  },
};
