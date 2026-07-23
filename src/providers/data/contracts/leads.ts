import type { ID, ILead, ILeadNote } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListLeadsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  /**
   * Filters by the legacy embedded pipeline stage (`ILead.stage.id`) — the
   * pre-existing behaviour, unchanged when `funnelId` is absent.
   *
   * When `funnelId` IS given, `stageId` instead scopes to a stage *within*
   * that funnel (`lead_funnel_entries.stage_id`) — a different id namespace
   * from the legacy embedded stage, so `funnelId` takes over the meaning of
   * `stageId` rather than combining with it: only one meaning is ever active
   * at a time.
   */
  stageId?: ID;
  temperature?: ILead["temperature"];
  search?: string;
  /** When true, excludes leads with a `lossReason` set (server-side). Used by
   *  the kanban/list view to keep lost leads out of the 1000-row window. */
  excludeLost?: boolean;
  /**
   * Restricts to leads participating in this funnel. Resolved SERVER-SIDE by
   * joining `lead_funnel_entries` — filtering in the browser would require
   * fetching the whole base, which the 1000-row ceiling already strains.
   *
   * See `stageId` above: when `funnelId` is set, `stageId` (if also given)
   * scopes to a stage within THIS funnel instead of the legacy embedded one.
   */
  funnelId?: ID;
}

/**
 * Contract for lead pipeline access.
 *
 * @see ../../../mocks/api/leads.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ILeadsProvider {
  list(params?: IListLeadsParams): Promise<IPaginatedResult<ILead>>;
  get(id: ID): Promise<ILead>;
  /**
   * The lead anchored to a conversation, gated ONCE by the conversation
   * (`can_access_conversation`) instead of the per-owner leads RLS — so the
   * fiche of a POOL/ownerless-lead conversation resolves for non-staff too.
   * Returns null when the conversation has no lead or is inaccessible.
   * Mirror of `ICustomersProvider.getViaConversation`.
   */
  getViaConversation(conversationId: ID): Promise<ILead | null>;
  /** Notes recorded against the lead, newest first. */
  listNotes(leadId: ID): Promise<ILeadNote[]>;
  /** Appends a note authored by `authorId` (a seller id). */
  addNote(leadId: ID, content: string, authorId: ID): Promise<ILeadNote>;
  create(input: Omit<ILead, "id" | "createdAt" | "updatedAt" | "conversations">): Promise<ILead>;
  update(id: ID, patch: Partial<ILead>): Promise<ILead>;
  delete(id: ID): Promise<void>;
}
