import type { IContact, ID } from "@/shared/types";
import { ContactCard, type ContactAction } from "./ContactCard";

export interface IContactsGridProps {
  contacts: IContact[];
  selectedIds: Set<ID>;
  onSelect: (contact: IContact, selected: boolean) => void;
  onOpen: (contact: IContact) => void;
  onAction: (contact: IContact, action: ContactAction) => void;
  onLink: (contact: IContact) => void;
}

/**
 * Card view for the Agenda — the kit's `auto-fill` grid, cards never narrower
 * than 330px. Purely presentational: selection, opt-out styling and the quick
 * actions all live in `ContactCard`.
 */
export function ContactsGrid({
  contacts,
  selectedIds,
  onSelect,
  onOpen,
  onAction,
  onLink,
}: IContactsGridProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(330px,1fr))] gap-[14px] p-4">
      {contacts.map((contact) => (
        <ContactCard
          key={contact.id}
          contact={contact}
          selected={selectedIds.has(contact.id)}
          onSelect={onSelect}
          onOpen={onOpen}
          onAction={onAction}
          onLink={onLink}
        />
      ))}
    </div>
  );
}
