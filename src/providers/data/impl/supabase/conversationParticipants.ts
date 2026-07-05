import type { ID, IConversationParticipant } from "@/shared/types";
import type { IConversationParticipantsProvider } from "../../contracts/conversationParticipants";
import { getSupabaseClient } from "@/shared/lib/supabase";

interface ParticipantRow {
  conversation_id: string;
  seller_id: string;
  added_by: string | null;
  added_at: string;
  source: "manual" | "mention";
}

const TABLE = "conversation_participants";
const COLUMNS = "conversation_id, seller_id, added_by, added_at, source";

function rowToParticipant(row: ParticipantRow): IConversationParticipant {
  return {
    conversationId: row.conversation_id,
    sellerId: row.seller_id,
    addedBy: row.added_by ?? undefined,
    addedAt: row.added_at,
    source: row.source,
  };
}

/**
 * Supabase implementation of {@link IConversationParticipantsProvider}.
 * Enforcement is entirely at the RLS layer (`cp_insert`/`cp_delete`/
 * `cp_select`, `supabase/migrations/20260704120000_...lifecycle.sql`) — no RPC
 * needed, mirroring `impl/supabase/rotationParticipants.ts`.
 */
export const supabaseConversationParticipantsProvider: IConversationParticipantsProvider = {
  async list(conversationId: ID): Promise<IConversationParticipant[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("conversation_id", conversationId);
    if (error)
      throw new Error(`[supabase] conversationParticipants.list(${conversationId}) failed: ${error.message}`);
    return (data as ParticipantRow[]).map(rowToParticipant);
  },

  async add(
    conversationId: ID,
    sellerId: ID,
    source: "manual" | "mention",
  ): Promise<IConversationParticipant> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .upsert(
        { conversation_id: conversationId, seller_id: sellerId, source },
        { onConflict: "conversation_id,seller_id", ignoreDuplicates: true },
      )
      .select(COLUMNS)
      .single();
    if (error) {
      if (error.code !== "PGRST116") {
        throw new Error(`[supabase] conversationParticipants.add(${conversationId}) failed: ${error.message}`);
      }
      // ignoreDuplicates makes a conflicting insert a no-op `ON CONFLICT DO
      // NOTHING`, so RETURNING yields 0 rows; `.single()` on a 0-row result
      // surfaces as PGRST116 ("JSON object requested, multiple (or no) rows
      // returned"), not as data:null. Re-read explicitly as a fallback so a
      // duplicate invite is idempotent instead of surfacing a confusing error.
      const { data: existing, error: readError } = await getSupabaseClient()
        .from(TABLE)
        .select(COLUMNS)
        .eq("conversation_id", conversationId)
        .eq("seller_id", sellerId)
        .single();
      if (readError)
        throw new Error(`[supabase] conversationParticipants.add(${conversationId}) failed: ${readError.message}`);
      return rowToParticipant(existing as ParticipantRow);
    }
    return rowToParticipant(data as ParticipantRow);
  },

  async remove(conversationId: ID, sellerId: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("conversation_id", conversationId)
      .eq("seller_id", sellerId);
    if (error)
      throw new Error(`[supabase] conversationParticipants.remove(${conversationId}) failed: ${error.message}`);
  },
};
