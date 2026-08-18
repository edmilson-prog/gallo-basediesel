import type { ID, IContact, IContactScopeCounts, ITriageContext } from "@/shared/types";
import { paginate } from "@/mocks/api/utils";
// Referenced as `contactsApi.list(...)` etc. at call time, never destructured
// at module top level — `@/mocks/api/conversations.ts` (and messages/stores)
// import back into `@/providers/data/engine`, so this module can be mid-cycle
// when it first runs. A top-level `const { list } = contactsApi` captures
// `undefined` in that window and throws on first import; every sibling mock
// provider (customersApi, leadsApi, …) already avoids this by calling the api
// object's methods lazily, which is safe once the cycle finishes resolving.
import { contactsApi, conversationsApi, customersApi, messagesApi } from "@/mocks";
import {
  applyContactFilters,
  UNASSIGNED_OWNER,
  type IContactFilterState,
} from "@/features/contacts/engine/contactFilters";
import { countScopes } from "@/features/contacts/engine/contactScopes";
import {
  buildTriageSuggestions,
  type ITriageCandidate,
} from "@/features/contacts/engine/triageSuggestions";
import { buildDuplicatePairs } from "@/features/contacts/engine/duplicatePairs";
import { buildMergePatch, mergeIgnoreReason } from "@/features/contacts/engine/contactMerge";
import { readCurrentUserSync } from "@/features/auth/guards";
import type { IContactsProvider, IListContactsParams } from "../../contracts/contacts";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { logMockMutation } from "./_audit";

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
  const superset = await contactsApi.list({
    storeId: params.storeId,
    lastContactBucket: params.lastContactBucket,
    orderBy: params.orderBy,
    orderDir: params.orderDir,
    page: 1,
    pageSize: FETCH_ALL_PAGE_SIZE,
  });
  const filterState = buildFilterState(params);
  let filtered = applyContactFilters(superset.data, filterState);
  // One company's people. Applied here rather than inside the engine because it
  // is an identity filter, not one of the Agenda's user-facing filter chips —
  // the customer-side surfaces pin it and never offer it as a choice.
  if (params.customerId) filtered = filtered.filter((c) => c.customerId === params.customerId);
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

  get: (id) => contactsApi.get(id),

  create: async (input) => {
    const created = await contactsApi.create(input);
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
    const before = await contactsApi.get(id).catch(() => null);
    const updated = await contactsApi.update(id, patch);
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
    const before = await contactsApi.get(id).catch(() => null);
    await contactsApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "contact",
      resourceId: id,
      before,
      storeId: before?.storeId,
    });
  },

  linkToCustomer: async (id, customerId) => {
    const before = await contactsApi.get(id).catch(() => null);
    const updated = await contactsApi.update(id, { customerId });
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
    const before = await contactsApi.get(id).catch(() => null);
    const updated = await contactsApi.update(id, stampOptOut(optOut));
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
    const before = await contactsApi.get(id).catch(() => null);
    const updated = await contactsApi.update(id, {
      nextContactAt: at,
      nextContactNote: note ?? null,
    });
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
      const current = await contactsApi.get(id).catch(() => null);
      if (!current || current.tags.includes(tag)) continue;
      const updated = await contactsApi.update(id, { tags: [...current.tags, tag] });
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
      const current = await contactsApi.get(id).catch(() => null);
      if (!current || !current.tags.includes(tag)) continue;
      const updated = await contactsApi.update(id, { tags: current.tags.filter((t) => t !== tag) });
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
      const current = await contactsApi.get(id).catch(() => null);
      if (!current || current.ownerSellerId === ownerSellerId) continue;
      const updated = await contactsApi.update(id, { ownerSellerId });
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
      const current = await contactsApi.get(id).catch(() => null);
      if (!current || current.optOut === optOut) continue;
      const updated = await contactsApi.update(id, stampOptOut(optOut));
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

  ignore: async (id, reason) => {
    const before = await contactsApi.get(id).catch(() => null);
    const updated = await contactsApi.update(id, {
      ignoredAt: new Date().toISOString(),
      ignoreReason: reason,
      ignoredBy: readCurrentUserSync()?.id ?? "system",
    });
    logMockMutation({
      action: "ignore",
      resource: "contact",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  unignore: async (id) => {
    const before = await contactsApi.get(id).catch(() => null);
    const updated = await contactsApi.update(id, {
      ignoredAt: null,
      ignoreReason: null,
      ignoredBy: null,
    });
    logMockMutation({
      action: "unignore",
      resource: "contact",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  triageContext: async (contact) => {
    const empty: ITriageContext = { conversationId: null, firstInboundText: null, messageCount: 0 };
    if (!contact.leadId) return empty;

    const conversations = await conversationsApi.list({
      leadId: contact.leadId,
      page: 1,
      pageSize: 1,
    });
    const conversation = conversations.data[0];
    if (!conversation) return empty;

    const messages = await messagesApi.list({
      conversationId: conversation.id,
      page: 1,
      pageSize: FETCH_ALL_PAGE_SIZE,
      orderDir: "asc",
    });
    const firstInbound = messages.data.find(
      (message) => message.direction === "in" && (message.text?.trim() ?? "") !== "",
    );

    return {
      conversationId: conversation.id,
      firstInboundText: firstInbound?.text?.trim() ?? null,
      messageCount: messages.total,
    };
  },

  triageSuggestions: async (contact) => {
    // The mock base is small enough to scan whole; the Supabase provider
    // instead runs targeted lookups. Both then rank through the SAME engine,
    // which is what keeps the two from drifting apart.
    const customers = await customersApi.list({ page: 1, pageSize: FETCH_ALL_PAGE_SIZE });
    const linked = await contactsApi.list({
      scope: "vinculados",
      page: 1,
      pageSize: FETCH_ALL_PAGE_SIZE,
    });

    const index = new Map<ID, ITriageCandidate>();
    for (const customer of customers.data) {
      const name =
        customer.type === "B2B" ? customer.nomeFantasia || customer.razaoSocial : customer.fullName;
      index.set(customer.id, {
        customerId: customer.id,
        customerName: name || "Cliente sem nome",
        phones: [customer.phone],
        emails: [customer.email ?? null],
        city: customer.address?.city ?? null,
        uf: customer.address?.state ?? null,
      });
    }
    for (const other of linked.data) {
      if (other.id === contact.id || !other.customerId) continue;
      const candidate = index.get(other.customerId);
      if (!candidate) continue;
      if (other.phone && !candidate.phones.includes(other.phone))
        candidate.phones.push(other.phone);
      if (other.email && !candidate.emails.includes(other.email))
        candidate.emails.push(other.email);
    }

    return buildTriageSuggestions(contact, [...index.values()]);
  },

  duplicatePairs: async (params = {}) => {
    const all = await contactsApi.list({
      storeId: params.storeId,
      page: 1,
      pageSize: FETCH_ALL_PAGE_SIZE,
    });
    // `contactsApi.list` has no ignored filter of its own, so triaged-away
    // contacts are dropped here — a merged-away record must not come back as
    // one half of a fresh duplicate pair.
    const visible = all.data.filter((contact) => !contact.ignoredAt);
    const pairs = buildDuplicatePairs(visible);
    const byId = new Map(visible.map((contact) => [contact.id, contact]));

    return pairs.flatMap((pair) => {
      const primary = byId.get(pair.primaryId);
      const duplicate = byId.get(pair.duplicateId);
      if (!primary || !duplicate) return [];
      return [{ id: pair.id, reason: pair.reason, primary, duplicate }];
    });
  },

  merge: async (primaryId, duplicateId) => {
    if (primaryId === duplicateId) {
      throw new Error("contacts.merge: um contato não pode ser mesclado nele mesmo");
    }
    const [primary, duplicate] = await Promise.all([
      contactsApi.get(primaryId),
      contactsApi.get(duplicateId),
    ]);

    const patch = buildMergePatch(primary, duplicate);
    const merged =
      Object.keys(patch).length > 0 ? await contactsApi.update(primaryId, patch) : primary;

    await contactsApi.update(duplicateId, {
      ignoredAt: new Date().toISOString(),
      ignoreReason: mergeIgnoreReason(primary.name),
      ignoredBy: readCurrentUserSync()?.id ?? "system",
    });

    logMockMutation({
      action: "merge",
      resource: "contact",
      resourceId: primaryId,
      before: primary,
      after: merged,
      storeId: merged.storeId,
    });
    return merged;
  },
};
