import type { ID, IPart, IVehicleModelKit } from "@/shared/types";

/** One resolved preview line: a catalog part + the kit metadata that drives the
 *  apply modal (default selection, quantity, note). */
export interface IKitPreviewLine {
  part: IPart;
  defaultQuantity: number;
  isOptional: boolean;
  note?: string;
}

export interface IKitPreview {
  lines: IKitPreviewLine[];
  /** Kit lines whose part is no longer in the catalog (skipped). */
  missing: number;
}

/**
 * Resolve a kit's items against the catalog index for the apply preview. Unlike
 * the old expandKitToItems, this preserves isOptional/note so the modal can
 * pre-check base items and leave optionals unchecked. Snapshot happens later, at
 * injection into the quote.
 */
export function buildKitPreview(kit: IVehicleModelKit, partsById: Map<ID, IPart>): IKitPreview {
  const lines: IKitPreviewLine[] = [];
  let missing = 0;
  for (const item of kit.items) {
    const part = partsById.get(item.partId);
    if (!part) {
      missing += 1;
      continue;
    }
    lines.push({
      part,
      defaultQuantity: Math.max(1, Math.floor(item.defaultQuantity) || 1),
      isOptional: item.isOptional,
      note: item.note,
    });
  }
  // Base parts first, optionals last (matches the modal's visual grouping).
  lines.sort((a, b) => Number(a.isOptional) - Number(b.isOptional));
  return { lines, missing };
}
