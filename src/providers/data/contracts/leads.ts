import type { ID, ILead, ILeadNote, ILeadStage } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListLeadsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
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
   */
  funnelId?: ID;
  /**
   * Stage *within* `funnelId` (`lead_funnel_entries.stage_id`) — a distinct
   * id namespace from the legacy embedded pipeline stage filtered by
   * `stageId` above (`ILead.stage.id`). Ignored unless `funnelId` is also
   * given. Combines freely with `stageId`: the two filters address different
   * columns and never collide.
   */
  funnelStageId?: ID;
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
  /**
   * Marks a lead as converted (closing stage + `convertedToCustomerId`) via a
   * gated `SECURITY DEFINER` RPC in supabase, so the assigned attendant — not
   * just staff / the owner — can convert without tripping the per-owner leads
   * RLS. The customer itself is created through the normal `customers` INSERT
   * (it belongs to whoever converts). Mock mirrors it as a plain lead update.
   */
  markConverted(leadId: ID, args: { stage: ILeadStage; customerId: ID }): Promise<void>;
  delete(id: ID): Promise<void>;
}
