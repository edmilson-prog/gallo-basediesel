import type {
  ID,
  IFunnelBoardSummary,
  ILeadFunnel,
  ILeadFunnelEntry,
  ILeadFunnelStage,
} from "@/shared/types";

/**
 * Contract for the multi-funnel model (spec 2026-07-23).
 *
 * @see ../../../features/funnels/engine
 */
export interface ILeadFunnelsProvider {
  listFunnels(storeId: ID, opts?: { includeArchived?: boolean }): Promise<ILeadFunnel[]>;
  createFunnel(input: Omit<ILeadFunnel, "id" | "createdAt" | "updatedAt">): Promise<ILeadFunnel>;
  updateFunnel(id: ID, patch: Partial<ILeadFunnel>): Promise<ILeadFunnel>;
  archiveFunnel(id: ID): Promise<void>;

  listStages(funnelId: ID): Promise<ILeadFunnelStage[]>;
  /**
   * Upsert by id plus deletion of orphans only — NOT delete-all + insert.
   * `stage_id` carries a FK with no cascade, so dropping a stage that still has
   * memberships raises 23503.
   */
  replaceStages(funnelId: ID, stages: ILeadFunnelStage[]): Promise<ILeadFunnelStage[]>;

  listAccess(funnelId: ID): Promise<ID[]>;
  replaceAccess(funnelId: ID, sellerIds: ID[]): Promise<void>;
  /** Funnels the current user reaches. Staff gets all; default and open-to-store always in. */
  listAccessibleFunnelIds(storeId: ID): Promise<ID[]>;

  /** Aggregates resolved server-side — never by counting rows in the client. */
  countLeadsByFunnel(storeId: ID): Promise<Record<ID, number>>;
  getBoardSummary(funnelId: ID): Promise<IFunnelBoardSummary[]>;

  listEntriesByLead(leadId: ID): Promise<ILeadFunnelEntry[]>;
  /**
   * Every membership in this funnel, in a single fetch — for callers that
   * need to index the whole funnel (e.g. `ILeadsProvider.list`'s funnel scope)
   * instead of resolving membership one lead at a time.
   */
  listEntriesByFunnel(funnelId: ID): Promise<ILeadFunnelEntry[]>;
  /** Gated by the conversation, mirroring ILeadsProvider.getViaConversation. */
  listEntriesViaConversation(conversationId: ID): Promise<ILeadFunnelEntry[]>;
  addEntry(leadId: ID, funnelId: ID, stageId?: ID): Promise<ILeadFunnelEntry>;
  moveEntry(entryId: ID, stageId: ID): Promise<ILeadFunnelEntry>;
  updateEntry(
    entryId: ID,
    patch: Pick<ILeadFunnelEntry, "estimatedValue">,
  ): Promise<ILeadFunnelEntry>;
  removeEntry(entryId: ID): Promise<{ movedToDefault: boolean }>;
}
