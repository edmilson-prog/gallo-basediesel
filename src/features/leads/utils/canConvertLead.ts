/**
 * Whether the current user may convert a lead into a customer from the lead
 * fiche. Mirrors the DB authorization of `convert_lead_mark`: staff, the lead's
 * owner, or the assigned attendant of the conversation — the last two gated by
 * holding `lead:edit` (own scope). SDR, which lacks `lead:edit`, never passes.
 */
export function canConvertLead(perms: {
  canEditLeadStore: boolean;
  canEditLeadOwn: boolean;
  isLeadOwner: boolean;
  isAssignee: boolean;
}): boolean {
  return (
    perms.canEditLeadStore ||
    (perms.canEditLeadOwn && (perms.isLeadOwner || perms.isAssignee))
  );
}
