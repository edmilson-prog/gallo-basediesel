import type { ID } from "@/shared/types";
import type { IConversationPin, IConversationPinsProvider } from "../../contracts/conversationPins";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { captureObservabilityException } from "@/shared/lib/observability";

/**
 * Supabase implementation of {@link IConversationPinsProvider}.
 *
 * RLS: SELECT/INSERT only own pins in the active store; DELETE only own pins
 * (no store gate, so unpinning keeps working after a store switch).
 */
interface ConversationPinRow {
  conversation_id: string;
  seller_id: string;
  store_id: string;
  created_at: string;
}

const TABLE = "conversation_pins";
const COLUMNS = "conversation_id, seller_id, store_id, created_at";

/** Postgres: undefined relation — the migration has not been applied yet. */
const UNDEFINED_TABLE = "42P01";
/** Postgres: unique violation — the pin already exists (pinning twice). */
const UNIQUE_VIOLATION = "23505";

function rowToPin(row: ConversationPinRow): IConversationPin {
  return {
    conversationId: row.conversation_id,
    sellerId: row.seller_id,
    storeId: row.store_id,
    createdAt: row.created_at,
  };
}

export const supabaseConversationPinsProvider: IConversationPinsProvider = {
  async list(sellerId: ID): Promise<IConversationPin[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });
    if (error) {
      // An unapplied migration must not take the Inbox down: the feature stays
      // inert (zero pins) and the case is reported. Any OTHER error (RLS,
      // network) propagates normally — no swallowing real failures.
      if (error.code === UNDEFINED_TABLE) {
        captureObservabilityException(
          new Error(`[supabase] conversation_pins ausente: ${error.message}`),
          { source: "conversationPins.list" },
        );
        return [];
      }
      throw new Error(`[supabase] conversationPins.list(${sellerId}) failed: ${error.message}`);
    }
    return (data as unknown as ConversationPinRow[]).map(rowToPin);
  },

  async pin({ conversationId, sellerId, storeId }): Promise<IConversationPin> {
    const createdAt = new Date().toISOString();
    // INSERT without `.select()`: the RETURNING clause re-evaluates the SELECT
    // policy in the same command and there is nothing to gain from the round
    // trip — the row is fully known here.
    const { error } = await getSupabaseClient().from(TABLE).insert({
      conversation_id: conversationId,
      seller_id: sellerId,
      store_id: storeId,
      created_at: createdAt,
    });
    if (error && error.code !== UNIQUE_VIOLATION) {
      throw new Error(`[supabase] conversationPins.pin(${conversationId}) failed: ${error.message}`);
    }
    return { conversationId, sellerId, storeId, createdAt };
  },

  async unpin(conversationId: ID, sellerId: ID): Promise<void> {
    const { error } = await getSupabaseClient()
      .from(TABLE)
      .delete()
      .eq("conversation_id", conversationId)
      .eq("seller_id", sellerId);
    if (error) {
      throw new Error(
        `[supabase] conversationPins.unpin(${conversationId}) failed: ${error.message}`,
      );
    }
  },
};
