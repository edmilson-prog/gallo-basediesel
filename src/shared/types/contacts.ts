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

/**
 * Scope chips on the filters bar, plus `ignorados` — which is NOT a chip.
 *
 * Every other scope narrows a listing that already excludes triaged-away
 * contacts; `ignorados` is the one that flips that filter and returns them.
 * It exists for the triage screen's "Ignorados" tab only, which is why the
 * filters bar's `SCOPES` array does not carry it.
 */
export type ContactScope = "todos" | "vinculados" | "soltos" | "optout" | "ignorados";

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
  /**
   * Triage verdict. `ignoredAt !== null` means the contact was triaged away:
   * it leaves every Agenda listing but stays reachable by id and by the
   * triage screen's "Ignorados" tab — the reason is kept precisely so the
   * decision can be reviewed and undone.
   */
  ignoredAt: string | null;
  ignoreReason: string | null;
  /** `sellers.id` of whoever ignored it — never the auth/profile id. */
  ignoredBy: ID | null;
  division: Division;
  createdAt: string;
  updatedAt: string;
}

/** Why triage proposed a customer. Drives the human-readable reason. */
export type TriageSignal = "phone" | "email" | "emailDomain" | "name" | "areaCode" | "lead";

/**
 * A customer triage believes this loose contact belongs to.
 *
 * `reason` is the point of the whole card — the percentage alone does not
 * make an attendant confident, the sentence does ("mesmo número de um
 * contato de Transportes Fronteira Oeste").
 */
export interface ITriageSuggestion {
  customerId: ID;
  customerName: string;
  /** 0–100. */
  confidence: number;
  reason: string;
  signals: TriageSignal[];
}

/**
 * The conversation that produced the contact, when there is one.
 *
 * Whoever triages decides by reading what the person asked for, not by
 * staring at a phone number — so the first inbound message is part of the
 * decision card, not a detail hidden behind a click.
 */
export interface ITriageContext {
  conversationId: ID | null;
  firstInboundText: string | null;
  messageCount: number;
}

/**
 * Two contacts that look like the same person.
 *
 * `primary` is the one triage proposes keeping (richer record, older
 * history); `duplicate` is the one that would be absorbed.
 */
export interface IContactDuplicatePair {
  id: string;
  reason: string;
  primary: IContact;
  duplicate: IContact;
}

/** Counts behind the scope chips. A contact can fall in more than one. */
export interface IContactScopeCounts {
  todos: number;
  vinculados: number;
  soltos: number;
  optout: number;
}
