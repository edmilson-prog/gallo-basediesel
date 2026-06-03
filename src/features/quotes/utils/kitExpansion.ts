import type { ID, IPart, IServiceKit } from "@/shared/types";

export interface IKitExpansion {
  /** Resolved (part, quantity) pairs ready to add to the quote. */
  resolved: Array<{ part: IPart; quantity: number }>;
  /** How many kit lines referenced a part not present in the catalog. */
  missing: number;
}

/**
 * Resolve a kit's partIds against the catalog index. Lines whose part is not
 * found (e.g. removed from the catalog) are skipped and counted in `missing`,
 * so insertion degrades gracefully instead of failing.
 */
export function expandKitToItems(kit: IServiceKit, partsById: Map<ID, IPart>): IKitExpansion {
  const resolved: Array<{ part: IPart; quantity: number }> = [];
  let missing = 0;
  for (const line of kit.items) {
    const part = partsById.get(line.partId);
    if (!part) {
      missing += 1;
      continue;
    }
    resolved.push({ part, quantity: Math.max(1, Math.floor(line.quantity) || 1) });
  }
  return { resolved, missing };
}
