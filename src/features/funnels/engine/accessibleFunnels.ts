import type { ID, ILeadFunnel } from "@/shared/types";

export interface IAccessibleFunnelsInput {
  funnels: ILeadFunnel[];
  /** Funnel ids explicitly granted to this seller (lead_funnel_access). */
  grantedFunnelIds: ID[];
  /** Owner and Gestor reach every funnel by role, never by grant. */
  isStaff: boolean;
}

/**
 * The funnels a user can open, ordered by position.
 *
 * The default funnel is ALWAYS reachable. It receives every new lead, it is
 * where triage happens and it is the fallback destination when a lead leaves
 * its last funnel — restricting it would lock the operation. It is also why the
 * backfill grants nobody explicitly: without this rule every non-staff user
 * would land on "no funnel access" on deploy day.
 *
 * Archived funnels are never returned, staff included: they are out of the
 * navigation by definition, and still present in reports.
 */
export function resolveAccessibleFunnels(input: IAccessibleFunnelsInput): ILeadFunnel[] {
  const granted = new Set(input.grantedFunnelIds);

  return input.funnels
    .filter((f) => !f.archivedAt)
    .filter((f) => input.isStaff || f.isDefault || f.openToStore || granted.has(f.id))
    .sort((a, b) => a.position - b.position);
}
