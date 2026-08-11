import type { ID, ISO8601 } from "@/shared/types";

/** One conversation pinned by one seller (spec 2026-08-11). */
export interface IConversationPin {
  conversationId: ID;
  sellerId: ID;
  storeId: ID;
  createdAt: ISO8601;
}

/**
 * Conversations pinned to the top of the Inbox, per seller.
 *
 * `sellerId` is explicit even on supabase (where RLS would already enforce it):
 * it keeps the mock honest and makes the `(seller_id, created_at desc)` index
 * the one that serves the read.
 *
 * @see ../../../../supabase/migrations/20260811120000_conversation_pins.sql
 */
export interface IConversationPinsProvider {
  /** The seller's pins, most recently pinned first. */
  list(sellerId: ID): Promise<IConversationPin[]>;
  /** Pin. Idempotent: pinning again returns the existing pin without error. */
  pin(input: { conversationId: ID; sellerId: ID; storeId: ID }): Promise<IConversationPin>;
  /** Unpin. Idempotent: unpinning what is not pinned is a no-op. */
  unpin(conversationId: ID, sellerId: ID): Promise<void>;
}
