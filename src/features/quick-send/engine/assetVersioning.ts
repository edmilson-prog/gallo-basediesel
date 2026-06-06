import type { IAssetLibraryItem } from "@/shared/types";

/**
 * Asset version selection + bump (PRD-027 RF-020). Only a `published` asset is
 * sendable. `bumpVersion` snapshots the current version into `previousVersion`
 * (history of one), increments `version`, and applies the new ref/url — pure,
 * returns a fresh object (never mutates the input).
 */

export function pickSendableVersion(item: IAssetLibraryItem): IAssetLibraryItem | null {
  return item.status === "published" ? item : null;
}

export function bumpVersion(
  item: IAssetLibraryItem,
  patch: Pick<IAssetLibraryItem, "storageRef" | "url">,
): IAssetLibraryItem {
  return {
    ...item,
    version: item.version + 1,
    storageRef: patch.storageRef,
    url: patch.url,
    previousVersion: {
      version: item.version,
      storageRef: item.storageRef,
      url: item.url,
      updatedAt: item.updatedAt,
    },
  };
}
