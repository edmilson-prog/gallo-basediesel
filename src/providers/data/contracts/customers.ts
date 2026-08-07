import type { ABCClass, ICustomer, ICustomerNote, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

/**
 * Minimal identification of a customer that already holds a given document —
 * the duplicate guard's payload. Deliberately narrow (no address, e-mail or
 * financials): it answers "this CNPJ/CPF is already a customer of this store,
 * owned by X" for any member of the store, which the per-carteira
 * `customers_select` policy would otherwise hide.
 */
export interface ICustomerDocumentMatch {
  id: ID;
  type: ICustomer["type"];
  /** nomeFantasia → razaoSocial → fullName, whichever is filled first. */
  displayName: string;
  sellerId: ID | null;
  /** Wallet owner's name, null when the customer sits in the queue. */
  sellerName: string | null;
}

export interface IConvertPendingContactInput {
  customerId: ID;
  type: ICustomer["type"];
  fullName?: string;
  cpf?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  contactName?: string;
  /** Wallet owner. Ignored for non-staff callers (RPC forces the caller). */
  sellerId?: ID | null;
}

/** Recency bucket — days since last purchase. */
export type RecencyBucket = "0-30" | "31-90" | "91-180" | "180+";

/**
 * Days without a paid purchase after which a wallet customer is counted as
 * parado (stalled) by {@link IWalletSellerStats.stale}. Matches the "0-30"
 * {@link RecencyBucket} boundary so both readings of recency agree.
 */
export const WALLET_STALE_DAYS = 30;

/** One seller's slice of the store's wallet. */
export interface IWalletSellerStats {
  sellerId: ID;
  /** Customers currently owned by this seller. */
  customers: number;
  /**
   * Owned customers with no paid purchase in the last {@link WALLET_STALE_DAYS}
   * days — customers who never bought are included, since they are the extreme
   * case of the same problem.
   */
  stale: number;
  /** Owned customers whose latest purchase falls in the current calendar month. */
  positivados: number;
}

/**
 * The store's wallet at a glance: how many customers each seller holds and how
 * many sit outside every wallet. Answers "how is the carteira doing" without
 * listing a single customer, so the Gestão de carteira board can render it in
 * one round-trip instead of one count per seller.
 *
 * RLS still governs: a caller who only sees their own carteira gets numbers for
 * that carteira alone. The screen is gated to Owner/Gestor, who see the store.
 */
export interface IWalletStats {
  /** Customers in scope — assigned and unassigned together. */
  total: number;
  /**
   * Customers with no wallet owner. They fall out of positivação, meta and
   * rodízio, which is why the board surfaces them as their own row.
   */
  unassigned: number;
  /** One entry per seller that owns at least one customer in scope. */
  bySeller: IWalletSellerStats[];
}

export interface IWalletStatsParams {
  storeId?: ID;
  /** Defaults to the commercially live statuses when omitted. */
  statuses?: ICustomer["status"][];
  /** Same semantics as {@link IListCustomersParams.excludeTags}. */
  excludeTags?: string[];
}

/** Range bucket used for ticket médio / LTV filters. */
export interface INumericRange {
  /** Inclusive lower bound, in BRL. */
  min?: number;
  /** Exclusive upper bound, in BRL. */
  max?: number;
}

export interface IListCustomersParams extends IPaginationParams {
  storeId?: ID;
  /** Multi-select store filter (Owner-only). Takes precedence over storeId. */
  storeIds?: ID[];
  /** Legacy single-select status (kept for back-compat). */
  status?: ICustomer["status"];
  statuses?: ICustomer["status"][];
  type?: ICustomer["type"];
  /** Legacy single-select seller. */
  sellerId?: ID;
  sellerIds?: ID[];
  /**
   * Only customers with no wallet owner (`seller_id IS NULL`) — the ones that
   * fall out of positivação, meta and rodízio. Ignored when false/omitted.
   * Applied on top of {@link sellerId}/{@link sellerIds}, not instead of them,
   * so passing both yields nothing (a customer cannot be owned and unowned).
   */
  unassignedOnly?: boolean;
  search?: string;
  /** Legacy single-tag filter. */
  tag?: string;
  tags?: string[];
  /**
   * Hide customers carrying ANY of these tags (PostgREST array overlap, negated).
   * The Clientes screen uses it to keep imported `pending_review` contacts out of
   * the list — they only anchor a conversation in the Inbox, and become a real
   * customer through a manual conversion. Independent of {@link tags}.
   */
  excludeTags?: string[];
  abcClasses?: (ABCClass | "none")[];
  recencyBuckets?: RecencyBucket[];
  recencyCustom?: { minDays?: number; maxDays?: number };
  ticketRange?: INumericRange;
  ltvRange?: INumericRange;
  /** Brand strings (e.g. "Volvo", "Scania"). Empty array means no filter. */
  vehicleBrands?: string[];
  /** Restrict to customers that have at least one vehicle of any of these brands. */
  hasAnyVehicle?: boolean;
  /**
   * Positivation filter (PRD-044). "positivado" = the most recent paid purchase
   * (`lastPurchaseAt`) falls within the current calendar month; "nao_positivado"
   * is the complement (includes customers with no purchase at all).
   */
  positivation?: "positivado" | "nao_positivado";
  /** Restrict to customers that have the B2B corporate portal provisioned (PRD-071). */
  hasB2BPortal?: boolean;
  orderBy?:
    | "name"
    | "type"
    | "document"
    | "seller"
    | "tags"
    | "city"
    | "lastPurchaseAt"
    | "createdAt"
    | "ticketMedio"
    | "ltv"
    | "recency"
    | "abcClass"
    | "status";
  orderDir?: "asc" | "desc";
}

/**
 * Contract for customer-related data access.
 *
 * Implementations: `mockCustomersProvider` (Fase 1, delegates to
 * `src/mocks/api/customers.ts`), `supabaseCustomersProvider` (Fase 2, PRD-110+).
 *
 * @see ../../../mocks/api/customers.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ICustomersProvider {
  list(params?: IListCustomersParams): Promise<IPaginatedResult<ICustomer>>;
  /**
   * Wallet composition for the whole store — see {@link IWalletStats}. Reads
   * only the two columns the aggregation needs (`seller_id`, `last_purchase_at`)
   * so the board costs one scan instead of `2N + 2` counts.
   */
  walletStats(params?: IWalletStatsParams): Promise<IWalletStats>;
  get(id: ID): Promise<ICustomer>;
  create(input: Omit<ICustomer, "id" | "createdAt" | "notes">): Promise<ICustomer>;
  update(id: ID, patch: Partial<ICustomer>): Promise<ICustomer>;
  delete(id: ID): Promise<void>;
  addNote(customerId: ID, content: string, authorId: ID): Promise<ICustomerNote>;
  listNotes(customerId: ID): Promise<ICustomerNote[]>;
  /**
   * The customer linked to a conversation, resolved server-side gated by the
   * CONVERSATION access (`can_access_conversation`) rather than the per-carteira
   * customers policy — for the fiche opened FROM a conversation. Returns the
   * customer even when {@link get} would be RLS-blocked (the 406 a POOL
   * conversation's customer throws for a non-owner seller), WITHOUT widening the
   * global customers policy (Portão B intact). `null` when the conversation has
   * no customer or the caller can't access it. Supabase: the SECURITY DEFINER
   * `conversation_customer` RPC. Notes are not embedded on this pool path.
   */
  getViaConversation(conversationId: ID): Promise<ICustomer | null>;
  /**
   * Customers of the current store already holding `document` (CNPJ or CPF),
   * compared digits-only so masked input matches. Powers the duplicate guard in
   * the lead→customer conversion: a plain {@link list} search cannot do this
   * job because `customers_select` hides other sellers' customers from a
   * non-staff caller, so the check would report "none" and the duplicate would
   * be created anyway. Supabase: the SECURITY DEFINER `find_customers_by_document`
   * RPC (store-scoped, minimal columns). Empty array when nothing matches.
   */
  findByDocument(document: string): Promise<ICustomerDocumentMatch[]>;
  /** Promote an imported pending_review contact to a real customer. */
  convertPendingContact(input: IConvertPendingContactInput): Promise<ICustomer>;
  /** Mark a pending_review contact as reviewed-and-not-a-customer (archived). */
  markContactNotCustomer(customerId: ID): Promise<ICustomer>;
  /** Undo a discard — swaps reviewed_not_customer back to pending_review. */
  restorePendingContact(customerId: ID): Promise<ICustomer>;
  /**
   * Rename the contact's DISPLAY name (`fullName` B2C / `nomeFantasia` B2B),
   * gated server-side so a non-staff seller who ATTENDS the contact (pool /
   * instance) can rename it. The direct customers UPDATE is RLS-blocked off the
   * caller's carteira (`customers_update` lacks the `seller_handles_customer`
   * branch that `customers_select` has), so a pool contact can be seen but not
   * renamed via {@link update}. Supabase: the SECURITY DEFINER
   * `rename_customer_contact` RPC, gated by `can_access_conversation`. The RPC
   * resolves the variant field from the row's `type` and never touches
   * `whatsappName` (webhook-owned).
   */
  renameContact(customerId: ID, name: string): Promise<ICustomer>;
}
