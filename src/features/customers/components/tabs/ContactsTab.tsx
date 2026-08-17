import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IContact, ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { useContactsProvider, useCustomersProvider } from "@/providers/data";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { useCustomerContacts } from "../../hooks/useCustomerContacts";
import { getCustomerName } from "../../utils/customerDisplay";
import { TabSkeleton } from "../TabSkeleton";
import { CustomerEmptyState } from "../detail/CustomerEmptyState";
import { CustomerContactRow } from "../contacts/CustomerContactRow";
import { LinkNumberDialog } from "../contacts/LinkNumberDialog";

const COPY = CUSTOMER_STRINGS.detail.contacts;
const EMPTY = CUSTOMER_STRINGS.detail.empty;

export interface IContactsTabProps {
  customer: ICustomer;
  /** Truthy pulse from the panel header's "Vincular número" button. */
  linkSignal?: number;
}

/**
 * The people who speak for this company, and the numbers they speak from.
 *
 * Reads the Agenda (`contacts`) filtered by customer — there is no second table
 * of phone numbers, and there must not be: `contacts` already carries role,
 * WhatsApp status, opt-out and its own RLS, and a parallel table would drift
 * from it on day one.
 *
 * The primary number is DERIVED from `customers.phone`, so "definir como
 * principal" writes the anchor every other surface already reads. That has a
 * deliberate side effect: on a customer that arrived from the ERP without a
 * phone, promoting the first number repairs the record through ordinary use.
 */
export function ContactsTab({ customer, linkSignal }: IContactsTabProps) {
  const { contacts, isLoading, primary, hasOrphanAnchor, refetch } = useCustomerContacts(customer);
  const contactsProvider = useContactsProvider();
  const customersProvider = useCustomersProvider();
  const queryClient = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);

  useEffect(() => {
    if (linkSignal) setLinkOpen(true);
  }, [linkSignal]);

  const refresh = () => {
    refetch();
    void queryClient.invalidateQueries({ queryKey: ["customer-profile", customer.id] });
    void queryClient.invalidateQueries({ queryKey: ["contacts-list"] });
  };

  const handleSetPrimary = async (contact: IContact) => {
    const previous = primary;
    try {
      await customersProvider.update(customer.id, { phone: contact.phone ?? "" });
      refresh();
      toast.success(
        previous
          ? `${contact.name} é o número principal — ${previous.name} continua na lista.`
          : `${contact.name} é o número principal de ${getCustomerName(customer)}.`,
      );
    } catch {
      toast.error("Não foi possível definir o número principal.");
    }
  };

  /**
   * Unlinking moves a pointer; the contact stays in the Agenda, loose. So it
   * runs straight away with an undo rather than behind a confirmation — a modal
   * on a reversible action only teaches the reflex of clicking "Sim" without
   * reading, and then fails to protect the one case that matters.
   */
  const handleUnlink = async (contact: IContact) => {
    try {
      await contactsProvider.linkToCustomer(contact.id, null);
      refresh();
      toast.success(`${contact.name} desvinculado da empresa`, {
        action: {
          label: "Desfazer",
          // The undo can fail too (RLS, a concurrent edit). Saying so beats a
          // silent no-op that leaves the user believing it was restored.
          onClick: () =>
            void contactsProvider
              .linkToCustomer(contact.id, customer.id)
              .then(() => {
                refresh();
                toast.success("Vínculo restaurado");
              })
              .catch(() => toast.error("Não foi possível desfazer o vínculo.")),
        },
      });
    } catch {
      toast.error("Não foi possível desvincular o contato. Você pode não ter permissão sobre ele.");
    }
  };

  const handleLinked = async (contact: IContact, role: string) => {
    try {
      await contactsProvider.linkToCustomer(contact.id, customer.id);
      // The role is captured in the same breath as the link, while the operator
      // still remembers who this person is — asking later never happens.
      if (role && role !== contact.role) {
        await contactsProvider.update(contact.id, { role });
      }
      // Promoting the first number repairs a customer that has no anchor.
      if (!customer.phone?.trim() && contact.phone?.trim()) {
        await customersProvider.update(customer.id, { phone: contact.phone });
      }
      setLinkOpen(false);
      refresh();
      toast.success(`${contact.name} vinculado a ${getCustomerName(customer)}`, {
        action: {
          label: "Desfazer",
          onClick: () =>
            void contactsProvider
              .linkToCustomer(contact.id, null)
              .then(() => {
                refresh();
                toast.success("Vínculo desfeito");
              })
              .catch(() => toast.error("Não foi possível desfazer o vínculo.")),
        },
      });
    } catch {
      toast.error("Não foi possível vincular o número. Você pode não ter permissão sobre ele.");
    }
  };

  const dialog = (
    <LinkNumberDialog
      customer={customer}
      currentCount={contacts.length}
      open={linkOpen}
      onOpenChange={setLinkOpen}
      onLinked={(contact, role) => void handleLinked(contact, role)}
    />
  );

  if (isLoading) return <TabSkeleton rows={3} />;

  if (contacts.length === 0) {
    return (
      <>
        <CustomerEmptyState
          icon="mdi:phone-plus-outline"
          title={EMPTY.noContactsTitle}
          text={EMPTY.noContactsText}
          cta={EMPTY.noContactsCta}
          onCta={() => setLinkOpen(true)}
        />
        {dialog}
      </>
    );
  }

  return (
    <>
      {hasOrphanAnchor && (
        <div className="mx-4 mb-1 mt-3 flex items-start gap-2 rounded-md border border-severity-info/30 bg-severity-info/5 p-3">
          <Icon
            icon="mdi:information-outline"
            size={15}
            aria-hidden
            className="mt-0.5 shrink-0 text-severity-info"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-severity-info">{COPY.orphanAnchorTitle}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {COPY.orphanAnchorText}
            </p>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border">
        {contacts.map((contact) => (
          <CustomerContactRow
            key={contact.id}
            contact={contact}
            isPrimary={primary?.id === contact.id}
            onSetPrimary={(c) => void handleSetPrimary(c)}
            onUnlink={(c) => void handleUnlink(c)}
          />
        ))}
      </ul>

      {dialog}
    </>
  );
}
