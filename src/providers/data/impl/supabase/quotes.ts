import type {
  ICustomerAddress,
  ID,
  IQuote,
  IQuoteItem,
  IShippingQuoteSnapshot,
  Money,
  QuoteOrigin,
  QuotePaymentMethod,
  QuoteStatus,
} from "@/shared/types";
import type { IListQuotesParams, IQuotesProvider } from "../../contracts/quotes";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";
import { fetchLargePage } from "./_pagination";

/**
 * Supabase implementation of {@link IQuotesProvider} (PRD-110+).
 *
 * snake_case `quotes` table ↔ camelCase {@link IQuote} via `rowToQuote`. Line
 * items live in a dedicated `quote_items` table (one row per item, FK
 * `quote_id` ON DELETE CASCADE) and are hydrated by a second query
 * (`listItems`, mirroring `customers.listNotes`). The `delivery_address` snapshot
 * is stored as jsonb and `applied_kit_ids` as `text[]`. `id`/`storeId`/`createdAt`
 * are immutable and never written by `quotePatchToRow`.
 *
 * Items are intentionally not mutated by `update`: the patch surface only
 * touches scalar/jsonb columns on the parent row. Replacing the item set is a
 * larger operation (delete + reinsert children) handled by higher-level
 * orchestration when PRD-031 lands its Supabase write path.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete) require the write policies that land with PRD-103.
 */

interface QuoteRow {
  id: string;
  store_id: string;
  number: string;
  customer_id: string | null;
  lead_id: string | null;
  conversation_id: string | null;
  seller_id: string;
  subtotal: number;
  discount: number;
  discount_reason: string | null;
  shipping: number;
  total: number;
  payment_condition: string;
  payment_method: QuotePaymentMethod | null;
  payment_terms: string | null;
  delivery_address: ICustomerAddress | null;
  valid_until: string;
  status: QuoteStatus;
  origin: QuoteOrigin;
  division: IQuote["division"];
  requires_approval: boolean | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  converted_to_order_id: string | null;
  converted_at: string | null;
  notes: string | null;
  applied_kit_ids: string[] | null;
  shipping_quote: IShippingQuoteSnapshot | null;
  created_at: string;
  updated_at: string;
}

interface QuoteItemRow {
  id: string;
  quote_id: string;
  part_id: string;
  part_sku: string;
  part_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  total: number;
}

const TABLE = "quotes";
const ITEMS_TABLE = "quote_items";
const COLUMNS =
  "id, store_id, number, customer_id, lead_id, conversation_id, seller_id, subtotal, discount, " +
  "discount_reason, shipping, total, payment_condition, payment_method, payment_terms, " +
  "delivery_address, valid_until, status, origin, division, requires_approval, approved_by, " +
  "approved_at, rejected_reason, converted_to_order_id, converted_at, notes, applied_kit_ids, " +
  "shipping_quote, created_at, updated_at";
const ITEM_COLUMNS =
  "id, quote_id, part_id, part_sku, part_name, quantity, unit_price, discount, total";

function rowToQuoteItem(row: QuoteItemRow): IQuoteItem {
  return {
    id: row.id,
    partId: row.part_id,
    partSku: row.part_sku,
    partName: row.part_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    discount: row.discount,
    total: row.total,
  };
}

function rowToQuote(row: QuoteRow, items: IQuoteItem[] = []): IQuote {
  return {
    id: row.id,
    storeId: row.store_id,
    number: row.number,
    customerId: row.customer_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    sellerId: row.seller_id,
    items,
    subtotal: row.subtotal,
    discount: row.discount,
    discountReason: row.discount_reason ?? undefined,
    shipping: row.shipping,
    total: row.total,
    paymentCondition: row.payment_condition,
    paymentMethod: row.payment_method ?? undefined,
    paymentTerms: row.payment_terms ?? undefined,
    deliveryAddress: row.delivery_address ?? undefined,
    validUntil: row.valid_until,
    status: row.status,
    origin: row.origin,
    division: row.division,
    requiresApproval: row.requires_approval ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    rejectedReason: row.rejected_reason ?? undefined,
    convertedToOrderId: row.converted_to_order_id ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    notes: row.notes ?? undefined,
    appliedKitIds: row.applied_kit_ids ?? undefined,
    shippingQuote: row.shipping_quote ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Builds an item insert row from an {@link IQuoteItem}, parented to `quoteId`. */
function itemToRow(item: IQuoteItem, quoteId: string): Record<string, unknown> {
  return {
    id: item.id,
    quote_id: quoteId,
    part_id: item.partId,
    part_sku: item.partSku,
    part_name: item.partName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    discount: item.discount,
    total: item.total,
  };
}

/** Maps a camelCase patch to snake_case parent columns. `id`/`storeId`/`createdAt`
 *  and the embedded `items` array are never written here; `updatedAt` is set by
 *  the caller. */
function quotePatchToRow(patch: Partial<IQuote>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.number !== undefined) row.number = patch.number;
  if (patch.customerId !== undefined) row.customer_id = patch.customerId;
  if (patch.leadId !== undefined) row.lead_id = patch.leadId;
  if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.subtotal !== undefined) row.subtotal = patch.subtotal;
  if (patch.discount !== undefined) row.discount = patch.discount;
  if (patch.discountReason !== undefined) row.discount_reason = patch.discountReason;
  if (patch.shipping !== undefined) row.shipping = patch.shipping;
  if (patch.total !== undefined) row.total = patch.total;
  if (patch.paymentCondition !== undefined) row.payment_condition = patch.paymentCondition;
  if (patch.paymentMethod !== undefined) row.payment_method = patch.paymentMethod;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms;
  if (patch.deliveryAddress !== undefined) row.delivery_address = patch.deliveryAddress;
  if (patch.validUntil !== undefined) row.valid_until = patch.validUntil;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.origin !== undefined) row.origin = patch.origin;
  if (patch.division !== undefined) row.division = patch.division;
  if (patch.requiresApproval !== undefined) row.requires_approval = patch.requiresApproval;
  if (patch.approvedBy !== undefined) row.approved_by = patch.approvedBy;
  if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt;
  if (patch.rejectedReason !== undefined) row.rejected_reason = patch.rejectedReason;
  if (patch.convertedToOrderId !== undefined) row.converted_to_order_id = patch.convertedToOrderId;
  if (patch.convertedAt !== undefined) row.converted_at = patch.convertedAt;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.appliedKitIds !== undefined) row.applied_kit_ids = patch.appliedKitIds;
  if (patch.shippingQuote !== undefined) row.shipping_quote = patch.shippingQuote;
  return row;
}

/** Maps a create input onto a full parent insert row, including the immutable `id`. */
function createInputToRow(
  input: Omit<IQuote, "id" | "createdAt" | "updatedAt">,
  id: string,
): Record<string, unknown> {
  const subtotal: Money = input.subtotal;
  return {
    id,
    store_id: input.storeId,
    number: input.number,
    customer_id: input.customerId ?? null,
    lead_id: input.leadId ?? null,
    conversation_id: input.conversationId ?? null,
    seller_id: input.sellerId,
    subtotal,
    discount: input.discount,
    discount_reason: input.discountReason ?? null,
    shipping: input.shipping,
    total: input.total,
    payment_condition: input.paymentCondition,
    payment_method: input.paymentMethod ?? null,
    payment_terms: input.paymentTerms ?? null,
    delivery_address: input.deliveryAddress ?? null,
    valid_until: input.validUntil,
    status: input.status,
    origin: input.origin,
    division: input.division,
    requires_approval: input.requiresApproval ?? null,
    approved_by: input.approvedBy ?? null,
    approved_at: input.approvedAt ?? null,
    rejected_reason: input.rejectedReason ?? null,
    converted_to_order_id: input.convertedToOrderId ?? null,
    converted_at: input.convertedAt ?? null,
    notes: input.notes ?? null,
    applied_kit_ids: input.appliedKitIds ?? null,
    shipping_quote: input.shippingQuote ?? null,
  };
}

/** Hydrates the line items for a single quote (mirrors `customers.listNotes`). */
async function listItems(quoteId: ID): Promise<IQuoteItem[]> {
  const { data, error } = await getSupabaseClient()
    .from(ITEMS_TABLE)
    .select(ITEM_COLUMNS)
    .eq("quote_id", quoteId)
    .order("id", { ascending: true });
  if (error) throw new Error(`[supabase] quotes.listItems(${quoteId}) failed: ${error.message}`);
  return (data as QuoteItemRow[]).map(rowToQuoteItem);
}

export const supabaseQuotesProvider: IQuotesProvider = {
  async list(params: IListQuotesParams = {}): Promise<IPaginatedResult<IQuote>> {
    const buildQuery = () => {
      let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

      if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
      if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
      if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
      if (params.leadId !== undefined) query = query.eq("lead_id", params.leadId);
      if (params.conversationId !== undefined)
        query = query.eq("conversation_id", params.conversationId);

      if (Array.isArray(params.status)) {
        if (params.status.length > 0) query = query.in("status", params.status);
      } else if (params.status !== undefined) {
        query = query.eq("status", params.status);
      }

      if (Array.isArray(params.origin)) {
        if (params.origin.length > 0) query = query.in("origin", params.origin);
      } else if (params.origin !== undefined) {
        query = query.eq("origin", params.origin);
      }

      if (params.createdAfter !== undefined) query = query.gte("created_at", params.createdAfter);
      if (params.createdBefore !== undefined)
        query = query.lte("created_at", params.createdBefore);
      if (typeof params.totalMin === "number") query = query.gte("total", params.totalMin);
      if (typeof params.totalMax === "number") query = query.lte("total", params.totalMax);
      if (params.search) {
        const term = `%${params.search}%`;
        query = query.or(`number.ilike.${term},customer_id.ilike.${term}`);
      }

      return query;
    };

    const orderColumnMap: Record<NonNullable<IListQuotesParams["orderBy"]>, string> = {
      createdAt: "created_at",
      updatedAt: "updated_at",
      total: "total",
      validUntil: "valid_until",
    };
    const orderColumn = orderColumnMap[params.orderBy ?? "updatedAt"];
    const ascending = params.orderDir === "asc";

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(50_000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;

    const { data, total } = await fetchLargePage<QuoteRow>(
      async (rangeFrom, rangeTo) => {
        const { data, error, count } = await buildQuery()
          .order(orderColumn, { ascending })
          .range(rangeFrom, rangeTo);
        if (error) throw new Error(`[supabase] quotes.list failed: ${error.message}`);
        return { data: (data ?? []) as unknown as QuoteRow[], count: count ?? 0 };
      },
      from,
      pageSize,
    );

    // Item enrichment runs once against the FULL concatenated set, not per
    // internal 1000-row chunk — moving it here (vs. inside fetchChunk) keeps
    // one listItems() call per quote regardless of how many chunks it took.
    const quotes = await Promise.all(
      data.map(async (row) => rowToQuote(row, await listItems(row.id))),
    );

    return {
      data: quotes,
      total,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IQuote> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] quotes.get(${id}) failed: ${error.message}`);

    const items = await listItems(id);
    return rowToQuote(data as unknown as QuoteRow, items);
  },

  async create(input: Omit<IQuote, "id" | "createdAt" | "updatedAt">): Promise<IQuote> {
    const id: ID = crypto.randomUUID();
    const client = getSupabaseClient();

    const { data, error } = await client
      .from(TABLE)
      .insert(createInputToRow(input, id))
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] quotes.create failed: ${error.message}`);

    if (input.items.length > 0) {
      const { error: itemsError } = await client
        .from(ITEMS_TABLE)
        .insert(input.items.map((item) => itemToRow(item, id)));
      if (itemsError)
        throw new Error(`[supabase] quotes.create (items) failed: ${itemsError.message}`);
    }

    const items = await listItems(id);
    return rowToQuote(data as unknown as QuoteRow, items);
  },

  async update(id: ID, patch: Partial<IQuote>): Promise<IQuote> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .update({ ...quotePatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) throw new Error(`[supabase] quotes.update(${id}) failed: ${error.message}`);

    const items = await listItems(id);
    return rowToQuote(data as unknown as QuoteRow, items);
  },

  async delete(id: ID): Promise<void> {
    // `quote_items` rows cascade via the FK ON DELETE CASCADE.
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] quotes.delete(${id}) failed: ${error.message}`);
  },
};
