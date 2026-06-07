import type { ID, IAssetLibraryItem, IAssetLibraryListParams } from "@/shared/types";
import { assetLibraryApi } from "@/mocks";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import {
  isSensitiveAsset,
  canSendSensitiveAsset,
} from "@/features/quick-send/engine/assetSensitivity";
import type { IAssetLibraryProvider } from "../../contracts/assetLibrary";
import { logMockMutation } from "./_audit";
import { scopedListParams, withCreateStoreId } from "./_storeScope";

export const mockAssetLibraryProvider: IAssetLibraryProvider = {
  list: (filter: IAssetLibraryListParams) =>
    assetLibraryApi.list(scopedListParams(filter as Record<string, unknown>, "asset_library")),

  get: (id) => assetLibraryApi.get(id),

  search: (query) => assetLibraryApi.search(query),

  getRecent: (sellerId) => assetLibraryApi.getRecent(sellerId),

  getFavorites: (sellerId) => assetLibraryApi.getFavorites(sellerId),

  toggleFavorite: (sellerId, id) => assetLibraryApi.toggleFavorite(sellerId, id),

  create: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await assetLibraryApi.create(scoped);
    logMockMutation({
      action: "create",
      resource: "asset_library",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  update: async (id, patch) => {
    const before = await assetLibraryApi.get(id).catch(() => null);
    const updated = await assetLibraryApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "asset_library",
      resourceId: id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  publish: async (id) => {
    const updated = await assetLibraryApi.publish(id);
    logMockMutation({
      action: "publish",
      resource: "asset_library",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  unpublish: async (id) => {
    const updated = await assetLibraryApi.unpublish(id);
    logMockMutation({
      action: "unpublish",
      resource: "asset_library",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  bumpVersion: async (id, patch) => {
    const updated = await assetLibraryApi.bumpVersion(id, patch);
    logMockMutation({
      action: "bump_version",
      resource: "asset_library",
      resourceId: id,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  delete: async (id) => {
    const removed = await assetLibraryApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "asset_library",
      resourceId: id,
      before: removed,
      storeId: removed.storeId,
    });
    return removed;
  },

  listCombos: (storeId) => assetLibraryApi.listCombos(storeId),

  saveCombo: async (input) => {
    const scoped = withCreateStoreId(input as typeof input & { storeId?: ID });
    const created = await assetLibraryApi.saveCombo(scoped);
    logMockMutation({
      action: "create",
      resource: "asset_library",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  deleteCombo: async (id) => {
    const removed = await assetLibraryApi.deleteCombo(id);
    logMockMutation({
      action: "delete",
      resource: "asset_library",
      resourceId: id,
      before: removed,
      storeId: removed.storeId,
    });
    return removed;
  },

  recordSend: async (sellerId, assetId) => {
    // Gate sensitive sends (D-12): a viewer without permission is audited and
    // the send is NOT recorded. The picker also blocks this in the UI, but the
    // provider is the source of truth.
    const asset = await assetLibraryApi.get(assetId).catch(() => null);
    if (asset && isSensitiveAsset(asset) && !canSendSensitiveAsset(getCurrentContext().user)) {
      logMockMutation({
        action: "view_denied",
        resource: "asset_library",
        resourceId: assetId,
        after: { reason: "sensitive_no_permission" },
        storeId: asset.storeId,
      });
      return;
    }
    await assetLibraryApi.recordSend(sellerId, assetId);
  },

  // Bridges the mock usage ledger to the feature hook. The provider is the only
  // layer authorized to import `@/mocks` (ESLint boundary), so `getUsageStats`
  // lives here and `useAssetUsageStats` calls it through `useAssetLibraryProvider`.
  getUsageStats: () => assetLibraryApi.getUsageStats(),
};
