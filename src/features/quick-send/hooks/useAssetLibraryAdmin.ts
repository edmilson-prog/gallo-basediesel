import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AssetCategory, AssetKind, ID, IAssetLibraryItem, IMediaUploadInput } from "@/shared/types";
import {
  getActiveDataSource,
  useAssetLibraryProvider,
  useMediaStorageProvider,
} from "@/providers/data";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";

/**
 * Conservative upload cap. The real bucket limit must be confirmed with
 * the Supabase Storage bucket config — TODO: update before GA.
 */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface IAssetCreateInput {
  title: string;
  category: AssetCategory;
  brand?: string;
  productLine?: string;
  division: IAssetLibraryItem["division"];
  kind: AssetKind;
  sensitivity: IAssetLibraryItem["sensitivity"];
  allowedRoleIds?: string[];
  // exactly one of these:
  file?: File;
  url?: string;
}

/**
 * Mutations + upload for the asset library management screen (PRD-027).
 *
 * Separate from `useAssetLibrary` (read-only list hook) — do not merge them.
 * All mutations invalidate the `["quick-send","assets"]` query family so the
 * read hook stays in sync automatically.
 *
 * `storeId` is threaded into every supabase `create`/`upload` via
 * `getCurrentContext().currentStoreId`; the Supabase provider does not inject
 * it automatically and will 403 on INSERT without it.
 */
export function useAssetLibraryAdmin() {
  const provider = useAssetLibraryProvider();
  const media = useMediaStorageProvider();
  const qc = useQueryClient();
  const [isUploading, setUploading] = useState(false);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["quick-send", "assets"] });
  }, [qc]);

  // ---------------------------------------------------------------------------
  // Internal: upload a File to media storage and return the resulting refs.
  // ---------------------------------------------------------------------------
  const uploadFile = useCallback(
    async (file: File): Promise<{ mediaAssetId: ID; storageRef: string }> => {
      const storeId = getCurrentContext().currentStoreId;
      if (!storeId) throw new Error("Loja ativa não resolvida — não é possível fazer upload");
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("too-large");

      const kind: IMediaUploadInput["kind"] = file.type.startsWith("image/")
        ? "image"
        : file.type.startsWith("video/")
          ? "video"
          : "document";

      // `storeId` is not on the public `IMediaUploadInput` type but the Supabase
      // provider reads it for the Storage bucket path — mirror useAttachmentUpload.
      const uploaded = await media.upload({
        kind,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        fileName: file.name,
        authorType: "seller",
        direction: "out",
        file,
        storeId,
      } as IMediaUploadInput & { storeId?: ID });

      return { mediaAssetId: uploaded.id, storageRef: uploaded.storageRef };
    },
    [media],
  );

  // ---------------------------------------------------------------------------
  // createAsset
  // ---------------------------------------------------------------------------
  const createAsset = useCallback(
    async (input: IAssetCreateInput): Promise<IAssetLibraryItem> => {
      const storeId = getCurrentContext().currentStoreId;
      if (!storeId) throw new Error("Loja ativa não resolvida — não é possível criar ativo");
      const createdBy = getCurrentContext().user?.id ?? "system";

      setUploading(!!input.file);
      try {
        let storageRef: string | undefined;
        let mediaAssetId: ID | undefined;

        if (input.file) {
          const up = await uploadFile(input.file);
          storageRef = up.storageRef;
          mediaAssetId = up.mediaAssetId;
        }

        // `storeId` is omitted from the public create() type but the Supabase
        // provider requires it for the RLS WITH CHECK. Cast to thread it through.
        const created = await provider.create({
          division: input.division,
          title: input.title,
          category: input.category,
          brand: input.brand,
          productLine: input.productLine,
          kind: input.kind,
          storageRef,
          mediaAssetId,
          url: input.url,
          version: 1,
          status: "draft",
          sensitivity: input.sensitivity,
          allowedRoleIds: input.allowedRoleIds,
          createdBy,
          storeId,
        } as Parameters<typeof provider.create>[0]);

        invalidate();
        return created;
      } finally {
        setUploading(false);
      }
    },
    [provider, uploadFile, invalidate],
  );

  // ---------------------------------------------------------------------------
  // updateAsset
  // ---------------------------------------------------------------------------
  const updateAsset = useCallback(
    async (id: ID, patch: Partial<IAssetLibraryItem>): Promise<IAssetLibraryItem> => {
      const r = await provider.update(id, patch);
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  // ---------------------------------------------------------------------------
  // newVersion — upload new file OR set new URL; fixes the redundant undefined
  // line from the original brief (storageRef always undefined before the if).
  // ---------------------------------------------------------------------------
  const newVersion = useCallback(
    async (id: ID, source: { file?: File; url?: string }): Promise<IAssetLibraryItem> => {
      setUploading(!!source.file);
      try {
        let storageRef: string | undefined;
        let url = source.url;

        if (source.file) {
          // file path: upload → storageRef; url remains undefined
          const up = await uploadFile(source.file);
          storageRef = up.storageRef;
        }
        // link path: storageRef stays undefined; url carries the value set above

        const r = await provider.bumpVersion(id, { storageRef, url });
        invalidate();
        return r;
      } finally {
        setUploading(false);
      }
    },
    [provider, uploadFile, invalidate],
  );

  // ---------------------------------------------------------------------------
  // setPublished
  // ---------------------------------------------------------------------------
  const setPublished = useCallback(
    async (id: ID, published: boolean): Promise<IAssetLibraryItem> => {
      const r = published ? await provider.publish(id) : await provider.unpublish(id);
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  // ---------------------------------------------------------------------------
  // setSensitive
  // ---------------------------------------------------------------------------
  const setSensitive = useCallback(
    async (id: ID, sensitive: boolean): Promise<IAssetLibraryItem> => {
      const r = await provider.update(id, {
        sensitivity: sensitive ? "sensitive" : "normal",
      });
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  // ---------------------------------------------------------------------------
  // deleteAsset
  // ---------------------------------------------------------------------------
  const deleteAsset = useCallback(
    async (id: ID): Promise<IAssetLibraryItem> => {
      const r = await provider.delete(id);
      invalidate();
      return r;
    },
    [provider, invalidate],
  );

  // ---------------------------------------------------------------------------
  // resolvePreviewUrl — returns null in mock (no real bytes)
  // ---------------------------------------------------------------------------
  const resolvePreviewUrl = useCallback(
    async (item: IAssetLibraryItem): Promise<string | null> => {
      if (item.kind === "link") return item.url ?? null;
      if (!item.mediaAssetId) return null;
      if (getActiveDataSource() !== "supabase") return null; // mock: no real bytes
      try {
        return await media.getSignedUrl(item.mediaAssetId);
      } catch {
        return null;
      }
    },
    [media],
  );

  return {
    createAsset,
    updateAsset,
    newVersion,
    setPublished,
    setSensitive,
    deleteAsset,
    resolvePreviewUrl,
    isUploading,
  };
}
