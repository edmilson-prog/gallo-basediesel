import { useQuery } from "@tanstack/react-query";
import type { IContact, ICustomer } from "@/shared/types";
import { useContactsProvider } from "@/providers/data";
import { isSamePhone } from "../engine/phoneMatch";

export interface ICustomerContacts {
  contacts: IContact[];
  isLoading: boolean;
  isError: boolean;
  /** The contact holding the customer's WhatsApp anchor, when one matches. */
  primary: IContact | null;
  /** True when the customer has an anchor no contact accounts for. */
  hasOrphanAnchor: boolean;
  refetch: () => void;
}

/**
 * The people who speak for this company.
 *
 * PRIMARY IS DERIVED, NOT STORED. `customers.phone` is the WhatsApp anchor
 * every surface already reads to address a conversation; the contact whose
 * number matches it IS the primary. Deriving keeps one truth instead of two
 * that can disagree, and costs no column.
 *
 * Ordering is declared, not incidental: primary first, then most recently
 * contacted, then opted-out last. An unordered list of people reads as random
 * even when it isn't.
 */
export function useCustomerContacts(customer: ICustomer): ICustomerContacts {
  const provider = useContactsProvider();

  const query = useQuery({
    queryKey: ["customer-contacts", customer.id] as const,
    staleTime: 60 * 1000,
    queryFn: () =>
      provider
        .list({ customerId: customer.id, storeId: customer.storeId, pageSize: 100 })
        .then((r) => r.data),
  });

  const contacts = query.data ?? [];
  const anchor = customer.phone?.trim() ?? "";
  const primary = anchor ? (contacts.find((c) => isSamePhone(c.phone, anchor)) ?? null) : null;

  const sorted = [...contacts].sort((a, b) => {
    if (a.optOut !== b.optOut) return a.optOut ? 1 : -1;
    const aPrimary = primary?.id === a.id;
    const bPrimary = primary?.id === b.id;
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;
    // Never contacted sinks below anyone who has been.
    const aAt = a.lastContactAt ? Date.parse(a.lastContactAt) : -1;
    const bAt = b.lastContactAt ? Date.parse(b.lastContactAt) : -1;
    if (aAt !== bAt) return bAt - aAt;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  return {
    contacts: sorted,
    isLoading: query.isLoading,
    isError: query.isError,
    primary,
    // The anchor points at a number nobody in the agenda owns — the company can
    // still be reached, but the person behind that line is unknown.
    hasOrphanAnchor: Boolean(anchor) && primary == null && !query.isLoading,
    refetch: () => void query.refetch(),
  };
}
