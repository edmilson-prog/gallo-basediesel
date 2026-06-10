import type { ID, IListMediaParams, IMediaAsset, IMessage } from "@/shared/types";
import { mediaApi } from "@/mocks";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";
import { MockValidationError } from "@/mocks";
import type { IMediaStorageProvider, IMediaUploadInput } from "../../contracts/mediaStorage";
import { logMockMutation } from "./_audit";
import { scopedListParams } from "./_storeScope";
import { canViewSensitive } from "@/features/media/engine/sensitiveAccess";

/** Resolve the active store id or fail cleanly (mirrors withCreateStoreId). */
function requireStoreId(): ID {
  const { currentStoreId } = getCurrentContext();
  if (!currentStoreId) {
    throw new MockValidationError("Não é possível arquivar mídia sem uma loja ativa.", "storeId");
  }
  return currentStoreId;
}

export const mockMediaProvider: IMediaStorageProvider = {
  list: (filter: IListMediaParams) =>
    mediaApi.list(scopedListParams(filter as Record<string, unknown>, "media")),

  get: (id) => mediaApi.get(id),

  /**
   * RBAC-gated (D-4). Sensitive asset + no permission → a redacted placeholder
   * ref (never the real bytes), and the attempt is audited (PRD-006).
   */
  getSignedUrl: async (id) => {
    const asset = await mediaApi.get(id);
    if (asset && asset.sensitivity === "sensitive" && !canViewSensitive(getCurrentContext().user)) {
      logMockMutation({
        action: "view_denied",
        resource: "media",
        resourceId: id,
        after: { reason: "sensitive_no_permission" },
        storeId: asset.storeId,
      });
      return `mock-redacted://${asset.id}`;
    }
    return mediaApi.getSignedUrl(id);
  },

  delete: async (id) => {
    const removed = await mediaApi.delete(id);
    logMockMutation({
      action: "delete",
      resource: "media",
      resourceId: id,
      before: removed,
      storeId: removed.storeId,
    });
    return removed;
  },

  update: async (id, patch) => {
    const before = await mediaApi.get(id).catch(() => null);
    const updated = await mediaApi.update(id, patch);
    logMockMutation({
      action: "update",
      resource: "media",
      resourceId: id,
      before,
      after: updated,
      storeId: updated.storeId,
    });
    return updated;
  },

  upload: async (input: IMediaUploadInput) => {
    const storeId = requireStoreId();
    // Strip the real bytes (PRD-106): the mock layer is metadata-only and the
    // in-memory store must never hold Blobs. The Supabase provider uses them.
    const { file: _file, ...metadata } = input;
    const created = await mediaApi.upload({ ...metadata, storeId });
    logMockMutation({
      action: "create",
      resource: "media",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },

  ensureFromMessage: (message: IMessage) => {
    const storeId = requireStoreId();
    // Normalize sticker → image; the catalog only models 4 kinds.
    const normalized: IMessage =
      message.mediaType === "sticker" ? { ...message, mediaType: "image" } : message;
    return mediaApi.ensureFromMessage(normalized, storeId);
  },
};
