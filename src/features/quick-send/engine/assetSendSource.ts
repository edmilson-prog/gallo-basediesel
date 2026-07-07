import type { IAssetLibraryItem } from "@/shared/types";

/**
 * Where the real bytes of a file-kind library asset live for a real
 * (supabase) send. Admin uploads (useAssetLibraryAdmin) always persist a
 * Vault reference (`mediaAssetId`) alongside the bucket `storageRef`;
 * seeded/legacy items carry only an opaque `ref-…` storageRef, which has no
 * retrievable file and therefore must not be dispatched to a provider engine.
 */
export type AssetSendSource =
  | { type: "media-asset"; mediaAssetId: string }
  | { type: "url"; url: string }
  | { type: "unavailable" };

export function resolveAssetSendSource(
  item: Pick<IAssetLibraryItem, "mediaAssetId" | "url">,
): AssetSendSource {
  if (item.mediaAssetId) return { type: "media-asset", mediaAssetId: item.mediaAssetId };
  if (item.url) return { type: "url", url: item.url };
  return { type: "unavailable" };
}
