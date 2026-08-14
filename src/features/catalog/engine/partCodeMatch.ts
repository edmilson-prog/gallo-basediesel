import type { ID, IPart } from "@/shared/types";
import { MIN_CODE_LENGTH } from "./newPart";

/** Split a free-text name into the codes hiding inside it. Dots survive — `81.08405` is one code. */
function nameTokens(name: string): string[] {
  return name.toLowerCase().split(/[^a-z0-9.]+/);
}

/**
 * Decide whether the catalog already has the typed code.
 *
 * The server-side search is a substring `ilike` over name, SKU, brand and the
 * OEM text, so it hands back near-misses as well; this is the exact-match pass
 * that turns those candidates into a verdict. Matching on a substring would
 * block `C205` because `C20500` exists, and a guard that cries wolf is a guard
 * people learn to type around.
 *
 * The name is searched too, by token: in the raw DINTEC rows the code never made
 * it to a column of its own and lives inside the name ("00313366 — UFI"). Those
 * rows are where the duplicates come from, so skipping them would miss the
 * cases the guard exists for.
 */
export function findDuplicateByCode(
  candidates: IPart[],
  code: string,
  excludeId?: ID,
): IPart | null {
  const query = code.trim().toLowerCase();
  if (query.length < MIN_CODE_LENGTH) return null;

  return (
    candidates.find((part) => {
      if (excludeId && part.id === excludeId) return false;
      if (part.sku.toLowerCase() === query) return true;
      if (part.oemCodes.some((oem) => oem.toLowerCase() === query)) return true;
      if (part.crossReferences?.some((ref) => ref.code.toLowerCase() === query)) return true;
      return nameTokens(part.name).includes(query);
    }) ?? null
  );
}
