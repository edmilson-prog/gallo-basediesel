import type {
  Division,
  ICommissionPreview,
  ICustomerAddress,
  ID,
  IOrder,
  IOrderItem,
  IShippingQuoteSnapshot,
  OrderFulfillmentStatus,
  OrderOrigin,
  OrderPaymentMethod,
  OrderPaymentStatus,
  PartCategory,
} from "@/shared/types";
import type { IListOrdersParams, IOrdersProvider } from "../../contracts/orders";
import type { IPaginatedResult } from "../../contracts/_shared";
import { getSupabaseClient } from "@/shared/lib/supabase";

/**
 * Supabase implementation of {@link IOrdersProvider} (PRD-110+).
 *
 * snake_case `orders` table ↔ camelCase {@link IOrder} via `rowToOrder`. Order
 * lines live in a dedicated `order_items` table (one row per item, FK
 * `order_id` ON DELETE CASCADE) and are hydrated with a single nested PostgREST
 * select (`order_items(...)`). The per-item monetary fields are flat `Money`
 * snapshots sealed at sale time, so they map to plain `numeric` columns; the
 * genuinely nested order-level data — `deliveryAddress` and `commissionPreview`
 * — is stored as `jsonb`.
 *
 * Reads work today under the temporary permissive RLS; the mutations
 * (create/update/delete) require the write policies that land with PRD-103.
 */

interface OrderItemRow {
  id: string;
  order_id: string;
  part_id: string;
  part_sku: string;
  part_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount: number;
  total: number;
  margin_value: number;
  applied_to_vehicle_id: string | null;
  part_category: PartCategory | null;
  part_subcategory: string | null;
}

interface OrderRow {
  id: string;
  store_id: string;
  customer_id: string;
  seller_id: string;
  number: string | null;
  quote_id: string | null;
  conversation_id: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  payment_condition: string;
  payment_method: OrderPaymentMethod | null;
  payment_terms: string | null;
  payment_status: OrderPaymentStatus;
  paid_at: string | null;
  fulfillment_status: OrderFulfillmentStatus;
  delivery_address: ICustomerAddress | null;
  carrier: string | null;
  tracking_code: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  return_reason: string | null;
  origin: OrderOrigin;
  division: Division;
  nf_number: string | null;
  nf_date: string | null;
  canceled_at: string | null;
  canceled_by: string | null;
  cancel_reason: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  commission_preview: ICommissionPreview | null;
  notes: string | null;
  shipping_quote: IShippingQuoteSnapshot | null;
  created_at: string;
  updated_at: string;
  order_items?: OrderItemRow[];
}

const TABLE = "orders";
const ITEMS_TABLE = "order_items";
const ITEM_COLUMNS =
  "id, order_id, part_id, part_sku, part_name, quantity, unit_price, unit_cost, discount, " +
  "total, margin_value, applied_to_vehicle_id, part_category, part_subcategory";
const COLUMNS =
  "id, store_id, customer_id, seller_id, number, quote_id, conversation_id, subtotal, discount, " +
  "shipping, total, payment_condition, payment_method, payment_terms, payment_status, paid_at, " +
  "fulfillment_status, delivery_address, carrier, tracking_code, shipped_at, delivered_at, " +
  "returned_at, return_reason, origin, division, nf_number, nf_date, canceled_at, canceled_by, " +
  "cancel_reason, internal_notes, customer_notes, commission_preview, notes, shipping_quote, " +
  `created_at, updated_at, order_items(${ITEM_COLUMNS})`;

function rowToOrderItem(row: OrderItemRow): IOrderItem {
  return {
    id: row.id,
    partId: row.part_id,
    partSku: row.part_sku,
    partName: row.part_name,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    unitCost: row.unit_cost,
    discount: row.discount,
    total: row.total,
    marginValue: row.margin_value,
    appliedToVehicleId: row.applied_to_vehicle_id ?? undefined,
    partCategory: row.part_category ?? undefined,
    partSubcategory: row.part_subcategory ?? undefined,
  };
}

function rowToOrder(row: OrderRow): IOrder {
  const items = (row.order_items ?? []).map(rowToOrderItem);
  return {
    id: row.id,
    storeId: row.store_id,
    customerId: row.customer_id,
    sellerId: row.seller_id,
    number: row.number ?? undefined,
    quoteId: row.quote_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    items,
    subtotal: row.subtotal,
    discount: row.discount,
    shipping: row.shipping,
    total: row.total,
    paymentCondition: row.payment_condition,
    paymentMethod: row.payment_method ?? undefined,
    paymentTerms: row.payment_terms ?? undefined,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at ?? undefined,
    fulfillmentStatus: row.fulfillment_status,
    deliveryAddress: row.delivery_address ?? undefined,
    carrier: row.carrier ?? undefined,
    trackingCode: row.tracking_code ?? undefined,
    shippedAt: row.shipped_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    returnedAt: row.returned_at ?? undefined,
    returnReason: row.return_reason ?? undefined,
    origin: row.origin,
    division: row.division,
    nfNumber: row.nf_number ?? undefined,
    nfDate: row.nf_date ?? undefined,
    canceledAt: row.canceled_at ?? undefined,
    canceledBy: row.canceled_by ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    customerNotes: row.customer_notes ?? undefined,
    commissionPreview: row.commission_preview ?? undefined,
    notes: row.notes ?? undefined,
    shippingQuote: row.shipping_quote ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Maps an order line onto a full insert row for the `order_items` table. */
function itemToRow(item: IOrderItem, orderId: string): Record<string, unknown> {
  return {
    id: item.id,
    order_id: orderId,
    part_id: item.partId,
    part_sku: item.partSku,
    part_name: item.partName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    unit_cost: item.unitCost,
    discount: item.discount,
    total: item.total,
    margin_value: item.marginValue,
    applied_to_vehicle_id: item.appliedToVehicleId ?? null,
    part_category: item.partCategory ?? null,
    part_subcategory: item.partSubcategory ?? null,
  };
}

/** Maps a camelCase patch to snake_case columns. `id`/`storeId`/`createdAt` are
 *  immutable and never written; `items` and `updatedAt` are handled separately. */
function orderPatchToRow(patch: Partial<IOrder>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.customerId !== undefined) row.customer_id = patch.customerId;
  if (patch.sellerId !== undefined) row.seller_id = patch.sellerId;
  if (patch.number !== undefined) row.number = patch.number;
  if (patch.quoteId !== undefined) row.quote_id = patch.quoteId;
  if (patch.conversationId !== undefined) row.conversation_id = patch.conversationId;
  if (patch.subtotal !== undefined) row.subtotal = patch.subtotal;
  if (patch.discount !== undefined) row.discount = patch.discount;
  if (patch.shipping !== undefined) row.shipping = patch.shipping;
  if (patch.total !== undefined) row.total = patch.total;
  if (patch.paymentCondition !== undefined) row.payment_condition = patch.paymentCondition;
  if (patch.paymentMethod !== undefined) row.payment_method = patch.paymentMethod;
  if (patch.paymentTerms !== undefined) row.payment_terms = patch.paymentTerms;
  if (patch.paymentStatus !== undefined) row.payment_status = patch.paymentStatus;
  if (patch.paidAt !== undefined) row.paid_at = patch.paidAt;
  if (patch.fulfillmentStatus !== undefined) row.fulfillment_status = patch.fulfillmentStatus;
  if (patch.deliveryAddress !== undefined) row.delivery_address = patch.deliveryAddress;
  if (patch.carrier !== undefined) row.carrier = patch.carrier;
  if (patch.trackingCode !== undefined) row.tracking_code = patch.trackingCode;
  if (patch.shippedAt !== undefined) row.shipped_at = patch.shippedAt;
  if (patch.deliveredAt !== undefined) row.delivered_at = patch.deliveredAt;
  if (patch.returnedAt !== undefined) row.returned_at = patch.returnedAt;
  if (patch.returnReason !== undefined) row.return_reason = patch.returnReason;
  if (patch.origin !== undefined) row.origin = patch.origin;
  if (patch.division !== undefined) row.division = patch.division;
  if (patch.nfNumber !== undefined) row.nf_number = patch.nfNumber;
  if (patch.nfDate !== undefined) row.nf_date = patch.nfDate;
  if (patch.canceledAt !== undefined) row.canceled_at = patch.canceledAt;
  if (patch.canceledBy !== undefined) row.canceled_by = patch.canceledBy;
  if (patch.cancelReason !== undefined) row.cancel_reason = patch.cancelReason;
  if (patch.internalNotes !== undefined) row.internal_notes = patch.internalNotes;
  if (patch.customerNotes !== undefined) row.customer_notes = patch.customerNotes;
  if (patch.commissionPreview !== undefined) row.commission_preview = patch.commissionPreview;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.shippingQuote !== undefined) row.shipping_quote = patch.shippingQuote;
  return row;
}

/** Maps a create input onto a full insert row for the parent `orders` table. */
function createInputToRow(
  input: Omit<IOrder, "id" | "createdAt" | "updatedAt">,
  id: string,
): Record<string, unknown> {
  return {
    id,
    store_id: input.storeId,
    customer_id: input.customerId,
    seller_id: input.sellerId,
    number: input.number ?? null,
    quote_id: input.quoteId ?? null,
    conversation_id: input.conversationId ?? null,
    subtotal: input.subtotal,
    discount: input.discount,
    shipping: input.shipping,
    total: input.total,
    payment_condition: input.paymentCondition,
    payment_method: input.paymentMethod ?? null,
    payment_terms: input.paymentTerms ?? null,
    payment_status: input.paymentStatus,
    paid_at: input.paidAt ?? null,
    fulfillment_status: input.fulfillmentStatus,
    delivery_address: input.deliveryAddress ?? null,
    carrier: input.carrier ?? null,
    tracking_code: input.trackingCode ?? null,
    shipped_at: input.shippedAt ?? null,
    delivered_at: input.deliveredAt ?? null,
    returned_at: input.returnedAt ?? null,
    return_reason: input.returnReason ?? null,
    origin: input.origin,
    division: input.division,
    nf_number: input.nfNumber ?? null,
    nf_date: input.nfDate ?? null,
    canceled_at: input.canceledAt ?? null,
    canceled_by: input.canceledBy ?? null,
    cancel_reason: input.cancelReason ?? null,
    internal_notes: input.internalNotes ?? null,
    customer_notes: input.customerNotes ?? null,
    commission_preview: input.commissionPreview ?? null,
    notes: input.notes ?? null,
    shipping_quote: input.shippingQuote ?? null,
  };
}

export const supabaseOrdersProvider: IOrdersProvider = {
  async list(params: IListOrdersParams = {}): Promise<IPaginatedResult<IOrder>> {
    let query = getSupabaseClient().from(TABLE).select(COLUMNS, { count: "exact" });

    if (params.storeId !== undefined) query = query.eq("store_id", params.storeId);
    if (params.sellerId !== undefined) query = query.eq("seller_id", params.sellerId);
    if (params.customerId !== undefined) query = query.eq("customer_id", params.customerId);
    if (params.paymentStatus !== undefined)
      query = query.eq("payment_status", params.paymentStatus);
    if (params.fulfillmentStatus !== undefined)
      query = query.eq("fulfillment_status", params.fulfillmentStatus);
    if (params.since !== undefined) query = query.gte("created_at", params.since);
    if (params.until !== undefined) query = query.lte("created_at", params.until);

    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(1, Math.min(1000, Math.floor(params.pageSize ?? 20)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw new Error(`[supabase] orders.list failed: ${error.message}`);

    return {
      data: (data as unknown as OrderRow[]).map(rowToOrder),
      total: count ?? 0,
      page,
      pageSize,
    };
  },

  async get(id: ID): Promise<IOrder> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("id", id)
      .single();
    if (error) throw new Error(`[supabase] orders.get(${id}) failed: ${error.message}`);
    return rowToOrder(data as unknown as OrderRow);
  },

  async listByCustomer(customerId: ID): Promise<IOrder[]> {
    const { data, error } = await getSupabaseClient()
      .from(TABLE)
      .select(COLUMNS)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error)
      throw new Error(`[supabase] orders.listByCustomer(${customerId}) failed: ${error.message}`);
    return (data as unknown as OrderRow[]).map(rowToOrder);
  },

  async create(input: Omit<IOrder, "id" | "createdAt" | "updatedAt">): Promise<IOrder> {
    const supabase = getSupabaseClient();
    const id: ID = crypto.randomUUID();

    const { error: insertError } = await supabase.from(TABLE).insert(createInputToRow(input, id));
    if (insertError) throw new Error(`[supabase] orders.create failed: ${insertError.message}`);

    if (input.items.length > 0) {
      const itemRows = input.items.map((item) => itemToRow(item, id));
      const { error: itemsError } = await supabase.from(ITEMS_TABLE).insert(itemRows);
      if (itemsError)
        throw new Error(`[supabase] orders.create (items) failed: ${itemsError.message}`);
    }

    return this.get(id);
  },

  async update(id: ID, patch: Partial<IOrder>): Promise<IOrder> {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from(TABLE)
      .update({ ...orderPatchToRow(patch), updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(`[supabase] orders.update(${id}) failed: ${error.message}`);

    // When `items` is provided we replace the whole line set (delete + reinsert),
    // mirroring the mock's full-object patch semantics for the items array.
    if (patch.items !== undefined) {
      const { error: deleteError } = await supabase.from(ITEMS_TABLE).delete().eq("order_id", id);
      if (deleteError)
        throw new Error(`[supabase] orders.update (clear items) failed: ${deleteError.message}`);

      if (patch.items.length > 0) {
        const itemRows = patch.items.map((item) => itemToRow(item, id));
        const { error: insertError } = await supabase.from(ITEMS_TABLE).insert(itemRows);
        if (insertError)
          throw new Error(`[supabase] orders.update (items) failed: ${insertError.message}`);
      }
    }

    return this.get(id);
  },

  async delete(id: ID): Promise<void> {
    // `order_items` rows cascade via the ON DELETE CASCADE FK.
    const { error } = await getSupabaseClient().from(TABLE).delete().eq("id", id);
    if (error) throw new Error(`[supabase] orders.delete(${id}) failed: ${error.message}`);
  },
};
