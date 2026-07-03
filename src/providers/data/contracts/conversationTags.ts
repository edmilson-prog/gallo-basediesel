import type { ID, IConversationTag } from "@/shared/types";

export interface IListConversationTagsParams {
  storeId?: ID;
  /** When true, filters out archived tags (pickers). Default: return all. */
  activeOnly?: boolean;
}

export interface ICreateConversationTagInput {
  storeId?: ID;
  label: string;
  /** Curated palette color id (see TAG_PALETTE). */
  color: string;
}

export interface IUpdateConversationTagInput {
  label?: string;
  color?: string;
  archived?: boolean;
}

/**
 * Owner-managed catalog of CONVERSATION tags. Reading is store-scoped (RLS);
 * writes are Owner-strict. `conversations.tags` stores these ids — see the
 * 2026-07-02 conversation-tags design spec.
 */
export interface IConversationTagsProvider {
  list(params?: IListConversationTagsParams): Promise<IConversationTag[]>;
  create(input: ICreateConversationTagInput): Promise<IConversationTag>;
  update(id: ID, input: IUpdateConversationTagInput): Promise<IConversationTag>;
  /** Hard delete — UI only allows it when usage is zero (v1). */
  delete(id: ID): Promise<void>;
  /** tagId → number of conversations currently carrying it (management screen). */
  usageCount(storeId?: ID): Promise<Record<ID, number>>;
}
