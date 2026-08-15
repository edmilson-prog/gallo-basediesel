import type { Division, ID } from "./common";

/** Where the contact came from. Mirrors the `source` column. */
export type ContactSource =
  | "whatsapp"
  | "dintec"
  | "manual"
  | "csv"
  | "balcao"
  | "portal_b2b"
  | "storefront";

/** Scope chips on the filters bar. */
export type ContactScope = "todos" | "vinculados" | "soltos" | "optout";

/**
 * A person or a number in the operation's phonebook.
 *
 * `customerId === null` means a LOOSE contact: a number that talked to us and
 * does not belong to a customer yet. `leadId` keeps the origin traceable when
 * the contact was materialised from a lead — `customers` and `leads` are never
 * modified by this feature.
 */
export interface IContact {
  id: ID;
  storeId: ID;
  name: string;
  /** Job title or function ("Compras", "Gerente de frota"). */
  role: string | null;
  /** Display-formatted phone. */
  phone: string | null;
  /** Digits only — powers search and duplicate detection. */
  phoneDigits: string | null;
  email: string | null;
  city: string | null;
  uf: string | null;
  /** null = loose contact. */
  customerId: ID | null;
  /** Denormalised on read for the card/table; never written. */
  customerName: string | null;
  leadId: ID | null;
  ownerSellerId: ID | null;
  /** Denormalised on read. */
  ownerName: string | null;
  tags: string[];
  source: ContactSource;
  optOut: boolean;
  optOutAt: string | null;
  optOutBy: ID | null;
  nextContactAt: string | null;
  nextContactNote: string | null;
  lastContactAt: string | null;
  hasWhatsapp: boolean;
  division: Division;
  createdAt: string;
  updatedAt: string;
}

/** Counts behind the scope chips. A contact can fall in more than one. */
export interface IContactScopeCounts {
  todos: number;
  vinculados: number;
  soltos: number;
  optout: number;
}
