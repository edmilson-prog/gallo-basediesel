import type { IConversationContact, ILead } from "@/shared/types";

/**
 * Identity block of the lead fiche (name/phone/avatar), resolved from the best
 * available source. The full `ILead` comes through the conversation-gated RPC
 * (`lead_via_conversation`); when it fails soft to null (rare race: lead
 * deleted mid-view), the pool-safe `IConversationContact` — which the header
 * already renders from — feeds a degraded minimal card instead of an empty
 * panel. Spec: docs/superpowers/specs/2026-07-18-lead-fiche-lateral.md.
 */
export interface ILeadFicheIdentity {
  name: string;
  phone: string;
  email?: string;
  avatarUrl?: string;
  /** True when only the contact resolved — the fiche shows the minimal card + notice. */
  degraded: boolean;
}

export function resolveLeadFicheIdentity(
  lead: ILead | null,
  contact: IConversationContact | null,
): ILeadFicheIdentity | null {
  if (lead) {
    const name = lead.name.trim() || contact?.name.trim() || lead.phone;
    return {
      name,
      phone: lead.phone,
      email: lead.email,
      avatarUrl: lead.avatarUrl ?? contact?.avatarUrl,
      degraded: false,
    };
  }
  if (contact) {
    return {
      name: contact.name.trim() || contact.phone,
      phone: contact.phone,
      email: undefined,
      avatarUrl: contact.avatarUrl,
      degraded: true,
    };
  }
  return null;
}
