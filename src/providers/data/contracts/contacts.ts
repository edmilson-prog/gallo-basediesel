import type {
  IContact,
  IContactScopeCounts,
  ContactScope,
  ContactSource,
  ID,
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
  /**
   * Every contact of ONE customer — the people who speak for that company.
   * A company is reached through several numbers (owner, purchasing, counter),
   * and this is how a customer-side surface asks for them. Distinct from
   * `scope: "vinculados"`, which means "linked to ANY customer".
   */
  customerId?: ID;
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
}
