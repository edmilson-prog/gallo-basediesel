import type { ID, IContact, IContactScopeCounts } from "@/shared/types";
import { paginate } from "@/mocks/api/utils";
import { contactsApi } from "@/mocks";
import {
  applyContactFilters,
  UNASSIGNED_OWNER,
  type IContactFilterState,
} from "@/features/contacts/engine/contactFilters";
import { countScopes } from "@/features/contacts/engine/contactScopes";
import { readCurrentUserSync } from "@/features/auth/guards";
import type { IContactsProvider, IListContactsParams } from "../../contracts/contacts";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { logMockMutation } from "./_audit";

// Same bridge every sibling mock provider uses (`customersApi`, `leadsApi`, …).
const {
  list: listContacts,
  get: getContact,
  create: createContact,
  update: updateContact,
  delete: deleteContact,
} = contactsApi;

/**
 * Translate the provider-level params into the engine's filter state.
 *
 * `city`/`uf` are handled OUTSIDE the engine (see {@link filteredContacts}):
 * `IListContactsParams` treats them as independent columns — matching
 * Task 8's Supabase sketch, which filters each with its own `.eq(...)` — but
 * the engine's `IContactFilterState.city` only compares a single combined
 * "Cidade / UF" label. Feeding a bare `city` (no `uf`) into that label never
 * matches an actual contact (whose label is always "City / UF"), so `city`
 * is left out of the filter state entirely and applied as plain equality
 * afterwards, symmetrically with `uf`.
 */
function buildFilterState(params: IListContactsParams): IContactFilterState {
  const owners: (ID | typeof UNASSIGNED_OWNER)[] = [
    ...(params.ownerSellerIds ?? []),
    ...(params.unassignedOwner ? [UNASSIGNED_OWNER] : []),
  ];
  return {
    scope: params.scope ?? "todos",
    search: params.search ?? "",
    owners,
    tags: params.tags ?? [],
    city: null,
    sources: params.sources ?? [],
  };
}

/**
 * Fetch the full storeId/lastContactBucket-filtered, sorted candidate set from
 * the mock API (that layer cannot see the engine — see `mocks/api/contacts.ts`
 * header comment), then apply the tested engine filters here.
 */
async function filteredContacts(params: IListContactsParams): Promise<IContact[]> {
  const superset = await listContacts({
    storeId: params.storeId,
    lastContactBucket: params.lastContactBucket,
    orderBy: params.orderBy,
    orderDir: params.orderDir,
    page: 1,
    pageSize: FETCH_ALL_PAGE_SIZE,
  });
  const filterState = buildFilterState(params);
  let filtered = applyContactFilters(superset.data, filterState);
  // city/uf are independent columns — each applied on its own, so either may
  // be set alone (city-only matches any UF, uf-only matches any city).
  if (params.city) filtered = filtered.filter((c) => c.city === params.city);
  if (params.uf) filtered = filtered.filter((c) => c.uf === params.uf);
  return filtered;
}

function stampOptOut(optOut: boolean): Partial<IContact> {
  if (!optOut) return { optOut: false, optOutAt: null, optOutBy: null };
  const actorId = readCurrentUserSync()?.id ?? "system";
  return { optOut: true, optOutAt: new Date().toISOString(), optOutBy: actorId };
}

export const mockContactsProvider: IContactsProvider = {
  list: async (params = {}) => {
    const filtered = await filteredContacts(params);
    return paginate(filtered, params);
  },

  get: (id) => getContact(id),

  create: async (input) => {
    const created = await createContact(input);
    logMockMutation({
      action: "create",
      resource: "contact",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  update: async (id, patch) => {
    const before = await getContact(id).catch(() => null);
    const updated = await updateContact(id, patch);
    logMockMutation({
      action: "update",
      resource: "contact",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  delete: async (id) => {
    const before = await getContact(id).catch(() => null);
    await deleteContact(id);
    logMockMutation({
      action: "delete",
      resource: "contact",
      resourceId: id,
      before,
      storeId: before?.storeId,
    });
  },

  linkToCustomer: async (id, customerId) => {
    const before = await getContact(id).catch(() => null);
    const updated = await updateContact(id, { customerId });
    logMockMutation({
      action: "link_to_customer",
      resource: "contact",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  setOptOut: async (id, optOut) => {
    const before = await getContact(id).catch(() => null);
    const updated = await updateContact(id, stampOptOut(optOut));
    logMockMutation({
      action: "set_opt_out",
      resource: "contact",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  scheduleFollowUp: async (id, at, note) => {
    const before = await getContact(id).catch(() => null);
    const updated = await updateContact(id, { nextContactAt: at, nextContactNote: note ?? null });
    logMockMutation({
      action: "schedule_follow_up",
      resource: "contact",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  bulkAddTag: async (ids, tag) => {
    let affected = 0;
    for (const id of ids) {
      const current = await getContact(id).catch(() => null);
      if (!current || current.tags.includes(tag)) continue;
      const updated = await updateContact(id, { tags: [...current.tags, tag] });
      logMockMutation({
        action: "bulk_add_tag",
        resource: "contact",
        resourceId: updated.id,
        before: current,
        after: updated,
        storeId: updated.storeId,
      });
      affected += 1;
    }
    return affected;
  },

  bulkRemoveTag: async (ids, tag) => {
    let affected = 0;
    for (const id of ids) {
      const current = await getContact(id).catch(() => null);
      if (!current || !current.tags.includes(tag)) continue;
      const updated = await updateContact(id, { tags: current.tags.filter((t) => t !== tag) });
      logMockMutation({
        action: "bulk_remove_tag",
        resource: "contact",
        resourceId: updated.id,
        before: current,
        after: updated,
        storeId: updated.storeId,
      });
      affected += 1;
    }
    return affected;
  },

  bulkTransferOwner: async (ids, ownerSellerId) => {
    let affected = 0;
    for (const id of ids) {
      const current = await getContact(id).catch(() => null);
      if (!current || current.ownerSellerId === ownerSellerId) continue;
      const updated = await updateContact(id, { ownerSellerId });
      logMockMutation({
        action: "bulk_transfer_owner",
        resource: "contact",
        resourceId: updated.id,
        before: current,
        after: updated,
        storeId: updated.storeId,
      });
      affected += 1;
    }
    return affected;
  },

  bulkSetOptOut: async (ids, optOut) => {
    let affected = 0;
    for (const id of ids) {
      const current = await getContact(id).catch(() => null);
      if (!current || current.optOut === optOut) continue;
      const updated = await updateContact(id, stampOptOut(optOut));
      logMockMutation({
        action: "bulk_set_opt_out",
        resource: "contact",
        resourceId: updated.id,
        before: current,
        after: updated,
        storeId: updated.storeId,
      });
      affected += 1;
    }
    return affected;
  },

  counts: async (params = {}) => {
    // Chip counts must reflect every OTHER active filter but ignore the scope
    // itself — same "pre-status filtered set" convention as
    // `orderStatusCounts` (src/features/orders/utils/orderListStats.ts).
    const filtered = await filteredContacts({ ...params, scope: "todos" });
    return countScopes(filtered) satisfies IContactScopeCounts;
  },
};
