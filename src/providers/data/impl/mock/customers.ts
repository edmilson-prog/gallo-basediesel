import { conversationsApi, customersApi, sellersApi } from "@/mocks";
import type { ICustomer } from "@/shared/types";
import type { ICustomersProvider } from "../../contracts/customers";
import { FETCH_ALL_PAGE_SIZE } from "../../contracts/_shared";
import { aggregateWalletStats } from "../_walletAggregate";
import { logMockMutation } from "./_audit";
import { assertImmutableStoreId, scopedListParams, withCreateStoreId } from "./_storeScope";

/** Mirrors the supabase provider's wallet universe — see its `WALLET_STATUSES`. */
const WALLET_STATUSES: ICustomer["status"][] = ["ativo", "recuperacao", "dormente"];

export const mockCustomersProvider: ICustomersProvider = {
  list: (params) => customersApi.list(scopedListParams(params, "customer")),
  walletStats: async (params = {}) => {
    const res = await customersApi.list(
      scopedListParams(
        {
          storeId: params.storeId,
          statuses: params.statuses ?? WALLET_STATUSES,
          excludeTags: params.excludeTags,
          pageSize: FETCH_ALL_PAGE_SIZE,
        },
        "customer",
      ),
    );
    return aggregateWalletStats(
      res.data.map((c) => ({ sellerId: c.sellerId, lastPurchaseAt: c.lastPurchaseAt })),
    );
  },
  get: (id) => customersApi.get(id),
  create: async (input) => {
    const created = await customersApi.create(withCreateStoreId(input));
    logMockMutation({
      action: "create",
      resource: "customer",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },
  update: async (id, patch) => {
    const before = await customersApi.get(id).catch(() => null);
    assertImmutableStoreId(before, patch);
    const updated = await customersApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "customer",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  delete: async (id) => {
    const before = await customersApi.get(id).catch(() => null);
    await customersApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "customer",
      resourceId: id,
      before,
      storeId: before?.storeId,
    });
  },
  addNote: (customerId, content, authorId) => customersApi.addNote(customerId, content, authorId),
  listNotes: (customerId) => customersApi.listNotes(customerId),
  getViaConversation: async (conversationId) => {
    // No RLS in the mock store — resolve conversation → its customer directly,
    // mirroring the supabase conversation-gated RPC. Null when the conversation
    // is missing or has no linked customer (e.g. a lead-only conversation).
    const conv = await conversationsApi.get(conversationId).catch(() => null);
    if (!conv?.customerId) return null;
    return customersApi.get(conv.customerId).catch(() => null);
  },
  findByDocument: async (document) => {
    const digits = document.replace(/\D/g, "");
    if (!digits) return [];
    // No RLS in the mock store, so a plain scoped scan mirrors what the
    // supabase SECURITY DEFINER RPC returns for the same store.
    const res = await customersApi.list(scopedListParams({ pageSize: 1000 }, "customer"));
    const matches = res.data
      .filter((c) => {
        const doc = c.type === "B2B" ? c.cnpj : c.cpf;
        return !!doc && doc.replace(/\D/g, "") === digits;
      })
      .slice(0, 5);
    return Promise.all(
      matches.map(async (c) => ({
        id: c.id,
        type: c.type,
        displayName:
          (c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName) || "—",
        sellerId: c.sellerId ?? null,
        sellerName: c.sellerId
          ? ((await sellersApi.get(c.sellerId).catch(() => null))?.fullName ?? null)
          : null,
      })),
    );
  },
  convertPendingContact: async (input) => {
    const updated = await customersApi.convertPendingContact(input);
    logMockMutation({
      action: "convert_pending_contact",
      resource: "customer",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  markContactNotCustomer: async (customerId) => {
    const updated = await customersApi.markContactNotCustomer(customerId);
    logMockMutation({
      action: "mark_contact_not_customer",
      resource: "customer",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  restorePendingContact: async (customerId) => {
    const updated = await customersApi.restorePendingContact(customerId);
    logMockMutation({
      action: "restore_pending_contact",
      resource: "customer",
      resourceId: updated.id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
  renameContact: async (customerId, name) => {
    // No RLS in the mock store — mirror the supabase RPC by resolving the variant
    // field from the current row's type and writing only the display name.
    const before = await customersApi.get(customerId);
    const patch =
      before.type === "B2B"
        ? ({ type: "B2B", nomeFantasia: name } as const)
        : ({ type: "B2C", fullName: name } as const);
    const updated = await customersApi.update(customerId, patch);
    logMockMutation({
      action: "customer.rename",
      resource: "customer",
      resourceId: updated.id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },
};
