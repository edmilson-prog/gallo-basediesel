import type { ID, IListMediaParams, IMediaAsset, IMediaUploadInput, IMessage } from "@/shared/types";
import {
  selectAllMediaAssets,
  selectMediaAssetByContentHash,
  selectMediaAssetById,
  selectMediaAssetByMessage,
} from "../store/selectors";
import { patchById, removeById, upsert } from "../store/mutations";
import { contentHash, mediaHashSeed } from "@/features/media/engine/contentHash";
import { classifyMedia } from "@/features/media/engine/classifyMedia";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export type IListMediaApiParams = IListMediaParams & IPaginationParams & { storeId?: ID };

function matches(asset: IMediaAsset, params: IListMediaApiParams): boolean {
  if (params.storeId && asset.storeId !== params.storeId) return false;
  if (params.conversationId && asset.conversationId !== params.conversationId) return false;
  if (params.customerId && asset.customerId !== params.customerId) return false;
  if (params.kind && asset.kind !== params.kind) return false;
  if (params.classification && asset.classification !== params.classification) return false;
  if (params.authorType && asset.authorType !== params.authorType) return false;
  if (params.from && asset.createdAt < params.from) return false;
  if (params.to && asset.createdAt > params.to) return false;
  if (params.search) {
    const q = params.search.toLowerCase().trim();
    if (q.length > 0) {
      const haystack = [asset.fileName ?? "", asset.ocrText ?? "", asset.transcription ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
  }
  return true;
}

/** Map a media kind to a representative mime when the caller omits one. */
function defaultMime(kind: IMediaAsset["kind"]): string {
  switch (kind) {
    case "image":
      return "image/jpeg";
    case "audio":
      return "audio/ogg";
    case "video":
      return "video/mp4";
    case "document":
      return "application/pdf";
  }
}

export const mediaApi = {
  list(params: IListMediaApiParams = {}): Promise<IPaginatedResult<IMediaAsset>> {
    return runApi(
      "mediaApi",
      "list",
      () => {
        const all = selectAllMediaAssets().filter((a) => matches(a, params));
        const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  get(id: ID): Promise<IMediaAsset | null> {
    return runApi("mediaApi", "get", () => selectMediaAssetById(id), { payload: { id } });
  },

  /**
   * Returns an opaque, signed-looking ref. NEVER a real URL/credential. The
   * RBAC gate (sensitive without permission → redacted placeholder) is applied
   * by the provider before this is called (D-4).
   */
  getSignedUrl(id: ID): Promise<string> {
    return runApi(
      "mediaApi",
      "getSignedUrl",
      () => {
        const asset = selectMediaAssetById(id);
        if (!asset) throw new MockNotFoundError("mediaAsset", id);
        return `mock-signed://${asset.storageRef}?exp=${Date.now() + 5 * 60_000}`;
      },
      { payload: { id } },
    );
  },

  delete(id: ID): Promise<IMediaAsset> {
    return runApi(
      "mediaApi",
      "delete",
      () => {
        const before = selectMediaAssetById(id);
        if (!before) throw new MockNotFoundError("mediaAsset", id);
        removeById("mediaAssets", id);
        return before;
      },
      { payload: { id } },
    );
  },

  update(id: ID, patch: Partial<IMediaAsset>): Promise<IMediaAsset> {
    return runApi(
      "mediaApi",
      "update",
      () => {
        const updated = patchById("mediaAssets", id, patch);
        if (!updated) throw new MockNotFoundError("mediaAsset", id);
        return updated;
      },
      { payload: { id, patch } },
    );
  },

  upload(input: IMediaUploadInput & { storeId: ID }): Promise<IMediaAsset> {
    return runApi(
      "mediaApi",
      "upload",
      () => {
        const hash =
          input.contentHash ??
          contentHash(
            mediaHashSeed({
              messageId: input.messageId,
              mimeType: input.mimeType,
              sizeBytes: input.sizeBytes,
              fileName: input.fileName,
            }),
          );
        const asset: IMediaAsset = {
          id: `media-${crypto.randomUUID()}`,
          storeId: input.storeId,
          conversationId: input.conversationId,
          customerId: input.customerId,
          messageId: input.messageId,
          kind: input.kind,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          fileName: input.fileName,
          authorType: input.authorType,
          direction: input.direction,
          createdAt: new Date().toISOString(),
          storageRef: `ref-${hash}`,
          persisted: true,
          sourceExpiresAt: input.sourceExpiresAt,
          contentHash: hash,
          ocrText: input.ocrText,
          transcription: input.transcription,
          sensitivity: "normal",
          version: 1,
        };
        upsert("mediaAssets", asset);
        return asset;
      },
      { payload: input },
    );
  },

  /**
   * Idempotent inbound archival. Dedups by messageId first, then contentHash.
   * Returns the existing asset when found (D-3). `storeId` is supplied by the
   * provider (it owns the multi-store context).
   */
  ensureFromMessage(message: IMessage, storeId: ID): Promise<IMediaAsset> {
    return runApi(
      "mediaApi",
      "ensureFromMessage",
      () => {
        const existingByMsg = selectMediaAssetByMessage(message.id);
        if (existingByMsg) return existingByMsg;
        // Normalize sticker -> image INSIDE the API so the 4-kind invariant
        // (image|audio|document|video) holds for EVERY direct caller, not just
        // the mock provider (canonical CREATION WIRING).
        const rawType = message.mediaType ?? "image";
        const kind = (rawType === "sticker" ? "image" : rawType) as IMediaAsset["kind"];
        const mimeType = defaultMime(kind);
        const sizeBytes = 64_000;
        const hash = contentHash(
          mediaHashSeed({ messageId: message.id, mimeType, sizeBytes }),
        );
        const existingByHash = selectMediaAssetByContentHash(hash);
        if (existingByHash) return existingByHash;
        // classifyMedia applied at creation: derive the suggested
        // classification from the message's heuristic markers when none is
        // supplied (canonical CREATION WIRING). IMessage exposes only
        // `mediaUrl` (a filename-ish path) and `text` (the caption/body), so
        // we feed those as the fileName/ocr signals; when both are empty it
        // falls back to the kind-based default (image -> "peca", else "outro").
        const classification = classifyMedia({
          kind,
          mimeType,
          fileName: message.mediaUrl,
          ocrText: message.text,
        });
        const asset: IMediaAsset = {
          id: `media-${crypto.randomUUID()}`,
          storeId,
          conversationId: message.conversationId,
          messageId: message.id,
          kind,
          mimeType,
          sizeBytes,
          authorType: message.authorType,
          direction: message.direction,
          createdAt: message.sentAt,
          storageRef: `ref-${hash}`,
          persisted: true,
          contentHash: hash,
          classification,
          sensitivity: "normal",
          version: 1,
        };
        upsert("mediaAssets", asset);
        return asset;
      },
      { payload: { messageId: message.id } },
    );
  },
};
