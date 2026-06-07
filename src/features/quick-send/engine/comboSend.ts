import type { ID, IAssetLibraryItem, RoleName } from "@/shared/types";
import { isSensitiveAsset, canSendSensitiveAsset } from "./assetSensitivity";
import { pickSendableVersion } from "./assetVersioning";

/**
 * Combo fan-out planner (PRD-027 RF-022, D-10). Walks the combo in order and
 * classifies each item as sendable or skipped (with a reason). A skipped item
 * NEVER aborts the rest of the combo — partial success is the contract. Pure.
 */

export interface IComboPlanItem {
  assetId: ID;
  ok: boolean;
  reason?: string;
}
export interface IComboPlan {
  sendable: ID[];
  skipped: IComboPlanItem[];
}

export function planComboSend(
  items: IAssetLibraryItem[],
  viewer: { role: RoleName } | null | undefined,
): IComboPlan {
  const sendable: ID[] = [];
  const skipped: IComboPlanItem[] = [];

  for (const item of items) {
    if (!pickSendableVersion(item)) {
      skipped.push({ assetId: item.id, ok: false, reason: "unpublished" });
      continue;
    }
    if (isSensitiveAsset(item) && !canSendSensitiveAsset(viewer)) {
      skipped.push({ assetId: item.id, ok: false, reason: "sensitive_no_permission" });
      continue;
    }
    sendable.push(item.id);
  }

  return { sendable, skipped };
}
