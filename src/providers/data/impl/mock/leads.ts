import type { ID, ILead } from "@/shared/types";
import { conversationsApi, leadsApi } from "@/mocks";
import type { IListLeadsParams, ILeadsProvider } from "../../contracts/leads";
import type { IPaginatedResult } from "../../contracts/_shared";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { assertImmutableStoreId, scopedListParams, withCreateStoreId } from "./_storeScope";
import { mockLeadFunnelsProvider } from "./leadFunnels";

/**
 * Resolves the `funnelId`/`funnelStageId` scope BEFORE pagination, mirroring
 * what the Supabase inner join does server-side. `leadsApi.list` paginates
 * in-house, so we can't post-filter its already-sliced page without
 * corrupting `total`/`page` — instead we fetch the full matching set (the
 * mock holds everything in memory, so this is cheap), narrow it by funnel
 * membership, then paginate that filtered array ourselves.
 *
 * Membership lookup is a SINGLE `listEntriesByFunnel` fetch, indexed once
 * into a `Set<leadId>` — not one `listEntriesByLead` call per lead (that
 * previous shape was O(leads × entries): every lead re-scanned every
 * membership row to find its own). `listEntriesByFunnel` is a new, narrow
 * addition to `ILeadFunnelsProvider` (mock: one `Array.filter` pass over the
 * in-memory `entries`; supabase: a plain `eq("funnel_id", …)` select) — the
 * smallest surface that lets this provider index the funnel once instead of
 * querying it once per lead.
 */
async function listByFunnel(
  scoped: IListLeadsParams,
  funnelId: NonNullable<IListLeadsParams["funnelId"]>,
): Promise<IPaginatedResult<ILead>> {
  const { funnelStageId, page, pageSize, funnelId: _funnelId, ...rest } = scoped;
  // `rest` still carries `stageId` (the legacy `ILead.stage.id` filter, if
  // given) — it's a distinct id namespace from `funnelStageId` now, so it
  // forwards to `leadsApi.list` unchanged and combines freely with the
  // funnel scope below.
  const [unfiltered, funnelEntries] = await Promise.all([
    leadsApi.list({ ...rest, page: 1, pageSize: FETCH_ALL_PAGE_SIZE }),
    mockLeadFunnelsProvider.listEntriesByFunnel(funnelId),
  ]);

  const allowed = new Set<string>();
  for (const entry of funnelEntries) {
    if (funnelStageId === undefined || entry.stageId === funnelStageId) allowed.add(entry.leadId);
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
  create: async (input) => {
    const lead = await leadsApi.create(withCreateStoreId(input));
    // Mirror the production trigger `leads_assign_default_funnel_membership`:
    // every newly inserted lead gets a membership in the store's default
    // funnel, on its entry stage. Nothing else in the mock layer does this —
    // without it, a lead created here (NewLeadModal, the WhatsApp webhook
    // simulator, ...) has zero memberships and is silently omitted from every
    // funnel-scoped board while still showing up in the unfiltered list
    // (finding 11a).
    const funnels = await mockLeadFunnelsProvider.listFunnels(lead.storeId);
    const defaultFunnel = funnels.find((f) => f.isDefault);
    if (!defaultFunnel) throw new Error("[mock] store has no default funnel");
    // `addEntry` no-ops (returns the existing membership) if seeding — which
    // reads the lead store fresh on first touch — already picked this lead up
    // before this call runs, so this is safe to call unconditionally
    // regardless of seeding order.
    await mockLeadFunnelsProvider.addEntry(lead.id, defaultFunnel.id);
    return lead;
  },
  update: async (id, patch) => {
    const before = await leadsApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    return leadsApi.update(id, patch);
  },
  markConverted: async (leadId, args) => {
    await leadsApi.update(leadId, {
      stage: args.stage,
      convertedToCustomerId: args.customerId,
    });
  },
  delete: (id) => leadsApi.delete(id),
};
