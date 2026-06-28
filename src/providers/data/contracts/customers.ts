import type { ABCClass, ICustomer, ICustomerNote, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

/** Recency bucket — days since last purchase. */
export type RecencyBucket = "0-30" | "31-90" | "91-180" | "180+";

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
}
