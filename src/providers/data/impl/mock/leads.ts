import type { ID, ILead } from "@/shared/types";
import { conversationsApi, leadsApi } from "@/mocks";
import type { IListLeadsParams, ILeadsProvider } from "../../contracts/leads";
import type { IPaginatedResult } from "../../contracts/_shared";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { assertImmutableStoreId, scopedListParams, withCreateStoreId } from "./_storeScope";
import { mockLeadFunnelsProvider } from "./leadFunnels";

/**
 * Resolves the `funnelId`/`stageId` scope BEFORE pagination, mirroring what
 * the Supabase inner join does server-side. `leadsApi.list` paginates
 * in-house, so we can't post-filter its already-sliced page without
 * corrupting `total`/`page` — instead we fetch the full matching set (the
 * mock holds everything in memory, so this is cheap), narrow it by funnel
 * membership, then paginate that filtered array ourselves.
 */
async function listByFunnel(
  scoped: IListLeadsParams,
  funnelId: NonNullable<IListLeadsParams["funnelId"]>,
): Promise<IPaginatedResult<ILead>> {
  const { stageId, page, pageSize, funnelId: _funnelId, ...rest } = scoped;
  // `stageId` here means "stage within `funnelId`" (see IListLeadsParams),
  // not the legacy embedded `ILead.stage.id` that `leadsApi.list` filters by
  // — so it must NOT be forwarded to the unfiltered fetch below.
  const unfiltered = await leadsApi.list({ ...rest, page: 1, pageSize: FETCH_ALL_PAGE_SIZE });

  const allowed = new Set<string>();
  for (const lead of unfiltered.data) {
    const memberships = await mockLeadFunnelsProvider.listEntriesByLead(lead.id);
    const matches = memberships.some(
      (e) => e.funnelId === funnelId && (!stageId || e.stageId === stageId),
    );
    if (matches) allowed.add(lead.id);
  }
  const filtered = unfiltered.data.filter((l) => allowed.has(l.id));

  const resolvedPage = Math.max(1, Math.floor(page ?? 1));
  const resolvedPageSize = Math.max(1, Math.min(FETCH_ALL_PAGE_SIZE, Math.floor(pageSize ?? 20)));
  const start = (resolvedPage - 1) * resolvedPageSize;
  return {
    data: filtered.slice(start, start + resolvedPageSize),
    total: filtered.length,
    page: resolvedPage,
    pageSize: resolvedPageSize,
  };
}

export const mockLeadsProvider: ILeadsProvider = {
  list: async (params) => {
    // Explicit annotation: `scopedListParams`'s generic constraint
    // (`Record<string, unknown>`) isn't satisfied by the concrete
    // `IListLeadsParams` shape (a pre-existing baseline gap — the same
    // TS2345 fires unmodified on every mock list provider that calls it),
    // which otherwise makes TS infer the return type down to `{}` and lose
    // every field, including the new `funnelId`. Every field here is
    // optional, so this is a safe widening, not an unsound cast.
    const scoped: IListLeadsParams & { storeId?: ID } = scopedListParams(params, "lead");
    if (scoped.funnelId !== undefined) return listByFunnel(scoped, scoped.funnelId);
    return leadsApi.list(scoped);
  },
  get: (id) => leadsApi.get(id),
  // Mock mirror of the conversation-gated RPC: resolve the conversation, then
  // its lead. Fail-soft to null on either miss — same contract as supabase.
  getViaConversation: async (conversationId) => {
    const conversation = await conversationsApi.get(conversationId).catch(() => null);
    if (!conversation?.leadId) return null;
    return leadsApi.get(conversation.leadId).catch(() => null);
  },
  listNotes: (leadId) => leadsApi.listNotes(leadId),
  addNote: (leadId, content, authorId) => leadsApi.addNote(leadId, content, authorId),
  create: (input) => leadsApi.create(withCreateStoreId(input)),
  update: async (id, patch) => {
    const before = await leadsApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    return leadsApi.update(id, patch);
  },
  delete: (id) => leadsApi.delete(id),
};
