import type {
  IContact,
  IContactDuplicatePair,
  IContactScopeCounts,
  ContactScope,
  ContactSource,
  ID,
  ITriageContext,
  ITriageSuggestion,
} from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

/**
 * Bucket for the "Último contato" filter. Windows are CUMULATIVE look-backs
 * from now, NOT a partition of the timeline — "30d" already includes "7d"
 * and "hoje". Picking one answers "who did I reach in the last N days",
 * not "days N to M ago" (compare `RecencyBucket` on `customers.ts`, which
 * IS a partition — do not copy that shape here).
 *
 * Boundaries, with `days = floor((nowMs - Date.parse(lastContactAt)) / 86_400_000)`:
 *   - `"hoje"`: `days <= 0` (contacted today)
 *   - `"7d"`: `0 <= days <= 7`
 *   - `"30d"`: `0 <= days <= 30`
 *   - `"90d+"`: `days > 90` (strictly more than 90 days ago)
 *   - `"nunca"`: `lastContactAt === null` (never contacted)
 *
 * There is a deliberate gap between "30d" and "90d+" — a contact last
 * reached 45 days ago matches neither. That's intentional: each bucket is a
 * specific question, not a slice of a full partition.
 *
 * Both providers (mock and Supabase) MUST implement these exact boundaries.
 */
export type ContactRecencyBucket = "hoje" | "7d" | "30d" | "90d+" | "nunca";

export type ContactsOrderBy =
  | "name"
  | "phone"
  | "customer"
  | "role"
  | "email"
  | "city"
  | "owner"
  | "lastContactAt"
  | "status"
  | "source";

export interface IListContactsParams extends IPaginationParams {
  storeId?: ID;
  scope?: ContactScope;
  /** Matches name, phone (formatted AND digits-only), e-mail, company, role, city. */
  search?: string;
  ownerSellerIds?: ID[];
  /** True to restrict to contacts with no owner. Combines with ownerSellerIds. */
  unassignedOwner?: boolean;
  tags?: string[];
  /** Independent columns — either may be set alone. `city` alone matches any UF; `uf` alone matches any city. */
  city?: string;
  uf?: string;
  sources?: ContactSource[];
  lastContactBucket?: ContactRecencyBucket;
  orderBy?: ContactsOrderBy;
  orderDir?: "asc" | "desc";
}

/**
 * Contract for the Agenda (contacts catalog).
 *
 * Implementations: `mockContactsProvider`, `supabaseContactsProvider`.
 *
 * Pagination is SERVER-SIDE: the base holds ~5.363 contacts and the
 * `authenticated` role carries an 8s statement_timeout, so callers must never
 * ask for the whole table to filter it in the browser. `list()` honours
 * `pageSize` and reports the real `total`; consumers must page off `total`,
 * never off `data.length`.
 */
export interface IContactsProvider {
  list(params?: IListContactsParams): Promise<IPaginatedResult<IContact>>;
  get(id: ID): Promise<IContact>;
  create(
    input: Omit<IContact, "id" | "createdAt" | "updatedAt" | "customerName" | "ownerName">,
  ): Promise<IContact>;
  update(id: ID, patch: Partial<IContact>): Promise<IContact>;
  delete(id: ID): Promise<void>;

  /** Link/unlink to a customer. `customerId === null` unlinks. */
  linkToCustomer(id: ID, customerId: ID | null): Promise<IContact>;
  /** Toggle LGPD opt-out, stamping author and date. */
  setOptOut(id: ID, optOut: boolean): Promise<IContact>;
  /** Schedule a follow-up. `at` is an ISO timestamp. */
  scheduleFollowUp(id: ID, at: string, note?: string): Promise<IContact>;

  /** Bulk operations — resolve to the number of rows actually affected. */
  bulkAddTag(ids: ID[], tag: string): Promise<number>;
  bulkRemoveTag(ids: ID[], tag: string): Promise<number>;
  bulkTransferOwner(ids: ID[], ownerSellerId: ID | null): Promise<number>;
  bulkSetOptOut(ids: ID[], optOut: boolean): Promise<number>;

  /** Scope chip counts for the current filter set (server-computed). */
  counts(params?: IListContactsParams): Promise<IContactScopeCounts>;

  // ── Triage ──────────────────────────────────────────────────────────────
  // The queue itself is just `list({ scope: "soltos" })` — no separate reader.
  // What triage adds are the verdicts and the two reads that make a verdict
  // possible.

  /**
   * Takes the contact out of the Agenda with a reason on the record.
   *
   * Never a delete: the row stays, reachable by id and by the "Ignorados"
   * tab, so a wrong call can be reviewed and undone. `reason` is required
   * precisely because an unexplained disappearance is not reviewable.
   */
  ignore(id: ID, reason: string): Promise<IContact>;

  /** Puts an ignored contact back in the Agenda, clearing the verdict. */
  unignore(id: ID): Promise<IContact>;

  /**
   * The conversation that produced this contact, if any.
   *
   * Read one contact at a time, on demand — triage shows one card at a time,
   * and prefetching the whole queue's messages would cost far more than it
   * saves.
   */
  triageContext(contact: IContact): Promise<ITriageContext>;

  /**
   * Customers this loose contact plausibly belongs to, best first.
   *
   * Implementations gather candidates however their backend allows, then
   * score them through the shared `buildTriageSuggestions` engine — the
   * ranking must not diverge between mock and Supabase.
   */
  triageSuggestions(contact: IContact): Promise<ITriageSuggestion[]>;

  /**
   * Contacts that look like the same person, across the whole visible base.
   *
   * Bounded in practice (~95 pairs on the production base) because the rules
   * are narrow: same phone line, or same e-mail address.
   */
  duplicatePairs(params?: { storeId?: ID }): Promise<IContactDuplicatePair[]>;

  /**
   * Folds `duplicateId` into `primaryId` and ignores the duplicate.
   *
   * Only fields the primary is MISSING are copied over — a merge must never
   * overwrite data on the record being kept. Tags are unioned. The duplicate
   * is ignored rather than deleted, with a reason naming the survivor, so the
   * merge stays auditable and reversible.
   *
   * Resolves to the updated primary.
   */
  merge(primaryId: ID, duplicateId: ID): Promise<IContact>;
}
