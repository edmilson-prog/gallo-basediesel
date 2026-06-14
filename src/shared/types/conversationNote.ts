import type { ID, ISO8601 } from "./common";

/**
 * Internal note pinned to a conversation — a private message board shared
 * between attendants (never sent to the customer / WhatsApp). Visibility is
 * governed by RLS (store-scoped, internal users only), mirroring the design
 * decision on {@link ICustomerNote}: the note itself carries no privacy flag.
 */
export interface IConversationNote {
  id: ID;
  conversationId: ID;
  /** Store scope — required by the supabase RLS WITH CHECK. */
  storeId: ID;
  /** Author seller id (→ ISeller.id). */
  authorId: ID;
  content: string;
  /** Seller ids mentioned in the body — the source for the @mention notifications. */
  mentions: ID[];
  /** Pinned notes surface at the top of the panel. */
  pinned: boolean;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

export interface IConversationNotesProvider {
  /** Notes of a conversation, newest first. */
  list(conversationId: ID): Promise<IConversationNote[]>;
  create(
    input: Omit<IConversationNote, "id" | "storeId" | "pinned" | "createdAt" | "updatedAt"> & {
      pinned?: boolean;
      /**
       * Active store. Required by the supabase RLS WITH CHECK
       * (store_id = current_store_id()); the mock's withCreateStoreId injects it
       * when omitted, but the supabase impl does not — callers thread it.
       */
      storeId?: ID;
    },
  ): Promise<IConversationNote>;
  update(
    id: ID,
    patch: Partial<Pick<IConversationNote, "content" | "mentions" | "pinned">>,
  ): Promise<IConversationNote>;
  remove(id: ID): Promise<void>;
}
