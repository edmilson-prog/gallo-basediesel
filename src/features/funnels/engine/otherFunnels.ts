import type { ID } from "@/shared/types";
import type { ILeadFunnelChip } from "../hooks/useLeadFunnelChips";

/**
 * The OTHER funnels this lead sits in.
 *
 * The input arrives already narrowed to the funnels the user reaches
 * (`useLeadFunnelChips` is fed from `useFunnelNavigation`), so the number on a
 * card never reveals a line of business outside their remit. That is noise
 * reduction, not a security boundary — the spec (§3.2) leaves the names
 * readable through the API to anyone with permission.
 */
export function otherFunnelsFor(
  chips: ILeadFunnelChip[] | undefined,
  currentFunnelId: ID,
): ILeadFunnelChip[] {
  if (!chips || chips.length === 0) return [];

  const seen = new Set<ID>([currentFunnelId]);
  const out: ILeadFunnelChip[] = [];
  for (const c of chips) {
    if (seen.has(c.funnelId)) continue;
    seen.add(c.funnelId);
    out.push(c);
  }
  return out;
}
